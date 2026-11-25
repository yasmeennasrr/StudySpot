/**
 * Rewards & Coupons, StudyMatch, Notifications, Administration (SDS 6.3).
 * Built in Sprints 2 and 3; stubs exist now so the wiring is real from Day 1.
 */
import type { GeoPoint, UserRole, VenueSummary } from './domain.types';
import type { StoredSurvey } from './contribution.contracts';

// ---------------------------------------------------------------- IRewards
export const REWARDS = Symbol('IRewards');

/** A coupon a venue offers for points (RWD-005). */
export interface CouponOfferView {
  id: string;
  venueId: string;
  venueName: string;
  reward: string;
  pointCost: number;
}

/** issued -> active (on activation) -> expired (5 minutes later). Never back (RWD-020). */
export type CouponStatus = 'issued' | 'active' | 'expired';

/** pending: not sent yet or waiting for a retry; failed: all retries used (SDS 6.6.9). */
export type CouponEmailStatus = 'pending' | 'sent' | 'failed';

/** A coupon the user holds (RWD-021). Times are ISO 8601 strings. */
export interface CouponView {
  id: string;
  /** XXXX-XXXX, from a 32-character alphabet without 0, O, 1 and I (SDS 6.6.7). */
  code: string;
  reward: string;
  venueId: string;
  venueName: string;
  pointCost: number;
  status: CouponStatus;
  redeemedAt: string;
  activatedAt: string | null;
  /** activatedAt + 5 minutes (RWD-018); null until activated. */
  expiresAt: string | null;
  emailStatus: CouponEmailStatus;
}

/** What the user sees on the Rewards screen (RWD-004, RWD-016). */
export interface PointsSummary {
  balance: number;
  /** Points earned from surveys today (Africa/Cairo calendar day). */
  earnedToday: number;
  dailyCap: number;
  /** Points one answer earns, per category (RWD-002, configurable). */
  perCategory: { crowd: number; noise: number; wifi: number };
}

/** Result of a points award. `reason` says why fewer (or no) points were given. */
export interface AwardResult {
  points: number;
  reason: string | null;
}

export interface IRewards {
  /**
   * Call after the survey is stored (RWD-010). Applies RWD-002, RWD-011, RWD-016 and
   * the anti-abuse rules of SDS 6.6.5; writes the points ledger and the balance in one
   * transaction. Safe to call twice for the same survey: the second call returns the
   * first result and awards nothing (RWD-011). The caller stores `points` and `reason`
   * on the survey (surveys.points_awarded, surveys.no_points_reason).
   */
  awardForSurvey(survey: StoredSurvey): Promise<AwardResult>;
  getBalance(userId: string): Promise<number>;
  getPointsSummary(userId: string): Promise<PointsSummary>;
  listOffers(): Promise<CouponOfferView[]>;
  /** Unit of Work: balance check, deduction, ledger row and coupon in one transaction; then the e-mail. */
  redeem(userId: string, offerId: string): Promise<CouponView>;
  /** From the app (RWD-017). Only the owner; once; starts the 5-minute timer. */
  activate(userId: string, couponId: string): Promise<CouponView>;
  /** From the e-mail "Activate" link: the token is the user's proof (SDS 6.6.7). */
  getCouponByToken(token: string): Promise<CouponView>;
  activateByToken(token: string): Promise<CouponView>;
  listCoupons(userId: string): Promise<CouponView[]>;
  /** Scheduler, every minute: active coupons older than 5 minutes become expired. */
  expireCoupons(): Promise<number>;
  /** Scheduler, every minute: re-sends coupon e-mails that are due (SDS 6.6.9). */
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

/** One earlier chat message, text only: 'user' is the student, 'model' is StudyMatch. */
export interface StudyMatchMessage {
  role: 'user' | 'model';
  text: string;
}

export interface IStudyMatch {
  /** `history`: earlier question/answer pairs, oldest first, for follow-ups. Never stored. */
  ask(input: {
    userId: string;
    text: string;
    location?: GeoPoint;
    history?: StudyMatchMessage[];
  }): Promise<StudyMatchAnswer>;
}

// ---------------------------------------------------------------- INotify
export const NOTIFY = Symbol('INotify');

/** Presence prompts (SEN-013..SEN-016). Listens to DomainEvent.PresenceDwell. */
export interface INotify {
  registerDevice(userId: string, installationId: string): Promise<void>;
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
  /** Staff and user accounts (PB-33, FR-036, FR-037). */
  listAccounts(filter: AccountFilter): Promise<AccountView[]>;
  createAccount(staffUserId: string, input: CreateAccountInput): Promise<AccountView>;
  /** Refuses sign-in from now on and ends the account's sessions (FR-038). Safe to repeat. */
  suspendUser(staffUserId: string, userId: string): Promise<AccountView>;
  reactivateUser(staffUserId: string, userId: string): Promise<AccountView>;
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

export interface AccountView {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  suspended: boolean;
  createdAt: string;
}

export interface AccountFilter {
  /** Part of the e-mail address or display name, not case-sensitive. */
  q?: string;
  role?: UserRole;
  suspended?: boolean;
  limit?: number;
}

export interface CreateAccountInput {
  email: string;
  displayName: string;
  role: UserRole;
  /** Students: 8+ characters; staff: 10+; both with a letter and a digit. */
  password: string;
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
