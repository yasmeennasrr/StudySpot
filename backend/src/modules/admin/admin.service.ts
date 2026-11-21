import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { DomainEvent, type StaffActionEvent } from '../../common/events/domain-events';
import {
  CLOCK,
  CONDITIONS,
  type ContentAuthorView,
  type IAdmin,
  type IClock,
  type IConditions,
  type RecentSurveyView,
  type ReportedReviewView,
} from '../../contracts';

const REVIEW_GONE = 'This review was not found, or a moderator removed it already.';
const SURVEY_GONE = 'This survey was not found, or a moderator removed it already.';

/** How many entries a moderation list returns unless asked for fewer. */
export const MODERATION_LIST_LIMIT = 100;

interface AuthorRow {
  author_id: string | null;
  author_name: string | null;
  author_email: string | null;
  author_suspended: boolean | null;
}

/**
 * Administration & Moderation (SDS 6.3). Owner: M4 for moderation (PB-37, FR-029,
 * UC-21). Every change emits DomainEvent.StaffAction, so it is in the security log (FR-044).
 *
 * - Removing content sets removed_at; nothing is deleted. A removed review leaves
 *   the venue's rating and list at once; a removed survey stops feeding conditions,
 *   and the venue's cached conditions are dropped so the change shows now.
 * - Dismissing keeps the review and clears its reports.
 * Venue keys come with PB-35; account management with PB-33.
 */
@Injectable()
export class AdminService implements IAdmin {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(CONDITIONS) private readonly conditions: IConditions,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly events: EventEmitter2,
  ) {}

  async suspendUser(): Promise<void> {
    throw AppError.notImplemented('Account management', 'Sprint 3');
  }
  async reactivateUser(): Promise<void> {
    throw AppError.notImplemented('Account management', 'Sprint 3');
  }
  async registerVenueKey(): Promise<{ apiKey: string }> {
    throw AppError.notImplemented('Venue keys', 'Sprint 2');
  }
  async revokeVenueKey(): Promise<void> {
    throw AppError.notImplemented('Venue keys', 'Sprint 2');
  }

  async listReportedReviews(limit = MODERATION_LIST_LIMIT): Promise<ReportedReviewView[]> {
    const rows: (AuthorRow & {
      review_id: string;
      venue_id: string;
      venue_name: string;
      rating: number;
      text: string | null;
      written_at: Date;
      report_count: number;
      first_reported_at: Date;
      last_reported_at: Date;
    })[] = await this.db.query(
      `SELECT r.id AS review_id, v.id AS venue_id, v.name AS venue_name, r.rating, r.text,
              r.created_at AS written_at,
              u.id AS author_id, u.display_name AS author_name, u.email AS author_email,
              u.suspended AS author_suspended,
              count(rr.id)::int AS report_count,
              min(rr.created_at) AS first_reported_at, max(rr.created_at) AS last_reported_at
         FROM reviews r
         JOIN review_reports rr ON rr.review_id = r.id
         JOIN venues v ON v.id = r.venue_id
         JOIN users u ON u.id = r.user_id
        WHERE r.removed_at IS NULL
        GROUP BY r.id, v.id, u.id
        ORDER BY report_count DESC, last_reported_at DESC, r.id
        LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      reviewId: r.review_id,
      venue: { id: r.venue_id, name: r.venue_name },
      rating: r.rating,
      text: r.text,
      author: toAuthor(r)!,
      writtenAt: r.written_at.toISOString(),
      reportCount: r.report_count,
      firstReportedAt: r.first_reported_at.toISOString(),
      lastReportedAt: r.last_reported_at.toISOString(),
    }));
  }

  async listRecentSurveys(filter: {
    venueId?: string;
    limit?: number;
  }): Promise<RecentSurveyView[]> {
    const rows: (AuthorRow & {
      survey_id: string;
      venue_id: string;
      venue_name: string;
      source: 'qr' | 'in_app';
      crowd_answer: string | null;
      noise_answer: string | null;
      wifi_answer: string | null;
      submitted_at: Date;
      points_awarded: number;
    })[] = await this.db.query(
      `SELECT s.id AS survey_id, v.id AS venue_id, v.name AS venue_name, s.source,
              s.crowd_answer, s.noise_answer, s.wifi_answer, s.submitted_at, s.points_awarded,
              u.id AS author_id, u.display_name AS author_name, u.email AS author_email,
              u.suspended AS author_suspended
         FROM surveys s
         JOIN venues v ON v.id = s.venue_id
         LEFT JOIN users u ON u.id = s.user_id
        WHERE s.removed_at IS NULL AND ($1::uuid IS NULL OR s.venue_id = $1)
        ORDER BY s.submitted_at DESC, s.id
        LIMIT $2`,
      [filter.venueId ?? null, filter.limit ?? MODERATION_LIST_LIMIT],
    );
    return rows.map((s) => ({
      surveyId: s.survey_id,
      venue: { id: s.venue_id, name: s.venue_name },
      source: s.source,
      answers: { crowd: s.crowd_answer, noise: s.noise_answer, wifi: s.wifi_answer },
      author: toAuthor(s),
      submittedAt: s.submitted_at.toISOString(),
      pointsAwarded: s.points_awarded,
    }));
  }

  async removeReportedContent(
    staffUserId: string,
    kind: 'review' | 'survey',
    id: string,
  ): Promise<void> {
    const now = this.clock.now();
    if (kind === 'review') {
      const [rows] = await this.db.query(
        `UPDATE reviews SET removed_at = $2 WHERE id = $1 AND removed_at IS NULL
         RETURNING venue_id, (SELECT count(*)::int FROM review_reports WHERE review_id = $1) AS reports`,
        [id, now],
      );
      const row = rows[0] as { venue_id: string; reports: number } | undefined;
      if (!row) throw AppError.notFound(REVIEW_GONE);
      this.staffAction(staffUserId, 'moderation.review_removed', id, {
        venueId: row.venue_id,
        reports: row.reports,
      });
      return;
    }
    const [rows] = await this.db.query(
      `UPDATE surveys SET removed_at = $2 WHERE id = $1 AND removed_at IS NULL RETURNING venue_id`,
      [id, now],
    );
    const row = rows[0] as { venue_id: string } | undefined;
    if (!row) throw AppError.notFound(SURVEY_GONE);
    this.conditions.invalidate(row.venue_id);
    this.staffAction(staffUserId, 'moderation.survey_removed', id, { venueId: row.venue_id });
  }

  async dismissReports(staffUserId: string, reviewId: string): Promise<void> {
    const [review] = await this.db.query(
      `SELECT venue_id FROM reviews WHERE id = $1 AND removed_at IS NULL`,
      [reviewId],
    );
    if (!review) throw AppError.notFound(REVIEW_GONE);
    const [, cleared] = await this.db.query(`DELETE FROM review_reports WHERE review_id = $1`, [
      reviewId,
    ]);
    this.staffAction(staffUserId, 'moderation.reports_dismissed', reviewId, {
      venueId: review.venue_id,
      reports: cleared,
    });
  }

  private staffAction(
    staffUserId: string,
    action: string,
    target: string,
    details: Record<string, unknown>,
  ): void {
    const event: StaffActionEvent = {
      staffUserId,
      action,
      target,
      at: this.clock.now(),
      details,
    };
    this.events.emit(DomainEvent.StaffAction, event);
  }
}

function toAuthor(row: AuthorRow): ContentAuthorView | null {
  if (!row.author_id) return null;
  return {
    id: row.author_id,
    displayName: row.author_name ?? '',
    email: row.author_email ?? '',
    suspended: row.author_suspended ?? false,
  };
}
