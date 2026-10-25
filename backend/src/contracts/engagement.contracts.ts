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

/** Staff functions (FR-029, FR-035..FR-044). Every call emits DomainEvent.StaffAction. */
export interface IAdmin {
  suspendUser(staffUserId: string, userId: string): Promise<void>;
  reactivateUser(staffUserId: string, userId: string): Promise<void>;
  registerVenueKey(staffUserId: string, venueId: string): Promise<{ apiKey: string }>;
  revokeVenueKey(staffUserId: string, venueId: string): Promise<void>;
  removeReportedContent(staffUserId: string, kind: 'review' | 'survey', id: string): Promise<void>;
  statistics(
    from: Date,
    to: Date,
  ): Promise<{ users: number; surveys: number; pointsIssued: number; couponsRedeemed: number }>;
}
