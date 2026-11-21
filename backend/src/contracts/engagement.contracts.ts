/**
 * Rewards & Coupons, StudyMatch, Notifications, Administration (SDS 6.3).
 * Built in Sprints 2 and 3; stubs exist now so the wiring is real from Day 1.
 */
import type { GeoPoint, VenueSummary } from './domain.types';
import type { StoredSurvey } from './contribution.contracts';

// ---------------------------------------------------------------- IRewards
export const REWARDS = Symbol('IRewards');

export interface CouponOfferView {
  id: string;
  venueId: string;
  venueName: string;
  reward: string;
  pointCost: number;
}

export type CouponStatus = 'issued' | 'active' | 'expired';

export interface CouponView {
  id: string;
  code: string;
  reward: string;
  venueName: string;
  status: CouponStatus;
  activatedAt: string | null;
  expiresAt: string | null;
  emailStatus: 'pending' | 'sent' | 'failed';
}

export interface IRewards {
  /** Applies RWD-002, RWD-010, RWD-011, RWD-016 and the anti-abuse rules of SDS 6.6.5. */
  awardForSurvey(survey: StoredSurvey): Promise<{ points: number; reason: string | null }>;
  getBalance(userId: string): Promise<number>;
  listOffers(): Promise<CouponOfferView[]>;
  /** Unit of Work: balance check, deduction and coupon creation in one transaction. */
  redeem(userId: string, offerId: string): Promise<CouponView>;
  activate(userId: string, couponId: string): Promise<CouponView>;
  listCoupons(userId: string): Promise<CouponView[]>;
  expireCoupons(): Promise<number>;
  retryFailedEmails(): Promise<number>;
}

// ---------------------------------------------------------------- IStudyMatch
export const STUDY_MATCH = Symbol('IStudyMatch');

export interface StudyMatchAnswer {
  reply: string;
  recommendations: { venue: VenueSummary; reasons: string[] }[];
  /** True when the LLM was unavailable and standard results were returned (AI-029). */
  degraded: boolean;
  reasonCode: 'OK' | 'AI_UNAVAILABLE' | 'NEEDS_INFO' | 'OFF_TOPIC';
}

export interface IStudyMatch {
  ask(input: { userId: string; text: string; location?: GeoPoint }): Promise<StudyMatchAnswer>;
}

// ---------------------------------------------------------------- INotify
export const NOTIFY = Symbol('INotify');

/** Presence prompts (SEN-013..SEN-016). Listens to DomainEvent.PresenceDwell. */
export interface INotify {
  registerDevice(userId: string, deviceToken: string): Promise<void>;
  setPresencePromptsEnabled(userId: string, enabled: boolean): Promise<void>;
  sendPresencePrompt(userId: string, venueId: string): Promise<void>;
}

// ---------------------------------------------------------------- IAdmin
export const ADMIN = Symbol('IAdmin');

/**
 * Staff functions (FR-029, FR-035..FR-044). Every call emits DomainEvent.StaffAction.
 * Statistics and the security log (FR-041, FR-042) are read-only and served by
 * StaffSecurityController (PB-36); settings by StaffSettingsController (PB-34).
 */
export interface IAdmin {
  suspendUser(staffUserId: string, userId: string): Promise<void>;
  reactivateUser(staffUserId: string, userId: string): Promise<void>;
  registerVenueKey(staffUserId: string, venueId: string): Promise<{ apiKey: string }>;
  revokeVenueKey(staffUserId: string, venueId: string): Promise<void>;
  /** Hides a review or survey from every view and count (FR-029). */
  removeReportedContent(staffUserId: string, kind: 'review' | 'survey', id: string): Promise<void>;
  /** The moderation queue: visible reviews with at least one report, most reported first (PB-37). */
  listReportedReviews(limit?: number): Promise<ReportedReviewView[]>;
  /** The moderator keeps the review: its reports are cleared and it leaves the queue. */
  dismissReports(staffUserId: string, reviewId: string): Promise<void>;
  /** Surveys are not reported by users; moderators look through the newest ones (UC-21). */
  listRecentSurveys(filter: { venueId?: string; limit?: number }): Promise<RecentSurveyView[]>;
}

/** Who wrote a piece of content, as staff see it (never shown in the app, PRIV-014). */
export interface ContentAuthorView {
  id: string;
  displayName: string;
  email: string;
  suspended: boolean;
}

export interface ReportedReviewView {
  reviewId: string;
  venue: { id: string; name: string };
  rating: number;
  text: string | null;
  author: ContentAuthorView;
  writtenAt: string;
  reportCount: number;
  firstReportedAt: string;
  lastReportedAt: string;
}

export interface RecentSurveyView {
  surveyId: string;
  venue: { id: string; name: string };
  source: 'qr' | 'in_app';
  answers: { crowd: string | null; noise: string | null; wifi: string | null };
  /** Null when the account was deleted (anonymised record, PRIV-012). */
  author: ContentAuthorView | null;
  submittedAt: string;
  pointsAwarded: number;
}
