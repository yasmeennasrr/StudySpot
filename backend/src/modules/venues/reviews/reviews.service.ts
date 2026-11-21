import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { CLOCK, type IClock, type ReviewView } from '../../../contracts';
import { ReviewEntity, VenueEntity } from '../../../db/entities';

const VENUE_MISSING = 'This study location was not found. It may have been removed.';
const REVIEW_MISSING = 'This review was not found. It may have been removed already.';

export interface ReviewInput {
  /** Whole stars, 1 to 5 (SDS 6.6.6). */
  rating: number;
  /** Up to 1000 characters; blank text is stored as no text. */
  text?: string | null;
}

/** The author's own review. `hidden` is true when a moderator removed it (FR-029). */
export interface MyReviewView extends ReviewView {
  venueId: string;
  hidden: boolean;
}

/**
 * Write a review (PB-15, UC-08, FR-025, DATA-007) and report one (PB-16, FR-034). Owner: M4.
 *
 * - A user has one review per venue: submitting again replaces the rating and text,
 *   and the submission time becomes the new one (SDS 6.6.6).
 * - Replacing a review clears its reports and a moderator's removal: they were about
 *   the old text. The new text can be reported again.
 * - The system adds the author, the venue and the time; the author is shown by
 *   display name only (PRIV-014).
 * - Reporting is safe to repeat; a user cannot report their own review.
 */
@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(VenueEntity) private readonly venues: Repository<VenueEntity>,
    @InjectRepository(ReviewEntity) private readonly reviews: Repository<ReviewEntity>,
    @InjectDataSource() private readonly db: DataSource,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async write(userId: string, venueId: string, input: ReviewInput): Promise<MyReviewView> {
    if (!(await this.venues.exists({ where: { id: venueId, active: true } }))) {
      throw AppError.notFound(VENUE_MISSING);
    }
    const text = input.text?.trim() ? input.text.trim() : null;
    const now = this.clock.now();
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx.query(
        `INSERT INTO reviews (venue_id, user_id, rating, text, removed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $5)
         ON CONFLICT (venue_id, user_id) DO UPDATE
           SET rating = EXCLUDED.rating, text = EXCLUDED.text, removed_at = NULL,
               created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
         RETURNING id`,
        [venueId, userId, input.rating, text, now],
      );
      await tx.query(`DELETE FROM review_reports WHERE review_id = $1`, [row.id]);
      return row.id as string;
    });
    const mine = await this.reviews.findOneOrFail({ where: { id }, relations: { user: true } });
    return toMyReview(mine);
  }

  /** The user's review of a venue, or null if they have not written one. */
  async mine(userId: string, venueId: string): Promise<MyReviewView | null> {
    const row = await this.reviews.findOne({
      where: { userId, venueId },
      relations: { user: true },
    });
    return row ? toMyReview(row) : null;
  }

  async report(reporterId: string, reviewId: string): Promise<void> {
    const review = await this.reviews.findOne({
      where: { id: reviewId },
      relations: { venue: true },
    });
    if (!review || review.removedAt || !review.venue?.active) {
      throw AppError.notFound(REVIEW_MISSING);
    }
    if (review.userId === reporterId) {
      throw AppError.notAllowed('You cannot report your own review. Edit it instead.');
    }
    await this.db.query(
      `INSERT INTO review_reports (review_id, reporter_id, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (review_id, reporter_id) DO NOTHING`,
      [reviewId, reporterId, this.clock.now()],
    );
  }
}

function toMyReview(r: ReviewEntity): MyReviewView {
  return {
    id: r.id,
    venueId: r.venueId,
    rating: r.rating,
    text: r.text,
    authorDisplayName: r.user?.displayName ?? 'StudySpot user',
    createdAt: r.createdAt.toISOString(),
    hidden: r.removedAt !== null,
  };
}
