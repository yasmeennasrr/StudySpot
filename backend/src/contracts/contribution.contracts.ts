/**
 * Contribution side: Presence, Surveys, QR Codes, Audio Analysis (SDS 6.3).
 * Built in Sprints 2 and 3; stubs exist now so the wiring is real from Day 1.
 */
import type { Level } from './domain.types';

// ---------------------------------------------------------------- IPresence (new in SDS v0.3)
export const PRESENCE = Symbol('IPresence');

/**
 * Receives location reports and receipt-scan check-ins, keeps raw presence
 * records for 2 hours (PRIV-016) and counts present users (RT-007, RT-008).
 * Emits DomainEvent.PresenceDwell after 15 minutes at a venue (SEN-014).
 */
export interface IPresence {
  /** Returns the venue the user is inside (within the venue radius), if any. */
  reportLocation(
    userId: string,
    lat: number,
    lng: number,
    confirmed: boolean,
  ): Promise<{ venueId: string | null }>;
  recordReceiptScan(userId: string, venueId: string): Promise<void>;
  isPresent(userId: string, venueId: string): Promise<boolean>;
  countPresent(venueId: string): Promise<number>;
  purgeExpired(): Promise<number>;
}

// ---------------------------------------------------------------- ISurvey
export const SURVEYS = Symbol('ISurvey');

export type CrowdAnswer =
  'not_crowded' | 'slightly_crowded' | 'moderately_crowded' | 'very_crowded';
export type NoiseAnswer = 'quiet' | 'moderate' | 'noisy';
export type WifiAnswer = 'poor' | 'average' | 'good' | 'not_used';

export interface SurveyAnswers {
  crowd?: CrowdAnswer;
  noise?: NoiseAnswer;
  wifi?: WifiAnswer;
}

export interface StoredSurvey {
  id: string;
  venueId: string;
  userId: string;
  source: 'qr' | 'in_app';
  answers: SurveyAnswers;
  submittedAt: string;
  pointsAwarded: number;
  noPointsReason: string | null;
}

/** Stores answers, writes dynamic records, emits SurveyStored (CON-001..CON-008). */
export interface ISurvey {
  submit(input: {
    userId: string;
    venueId: string;
    source: 'qr' | 'in_app';
    answers: SurveyAnswers;
  }): Promise<StoredSurvey>;
  /** Deletes surveys older than 90 days (PRIV-013). Called by the Scheduler. */
  purgeExpired(): Promise<number>;
}

// ---------------------------------------------------------------- IReceiptCodes
export const RECEIPT_CODES = Symbol('IReceiptCodes');

export type ReceiptCodeStatus = 'unused' | 'scanned' | 'used' | 'expired';

export interface ReceiptCodeView {
  token: string;
  venueId: string;
  venueName: string;
  status: ReceiptCodeStatus;
  /** Set once scanned: when the 10-minute window closes (QR-007, USE-011). */
  expiresAt: string | null;
}

/** QR receipt check-in (SRS 3.12). State pattern on the code's life cycle. */
export interface IReceiptCodes {
  create(venueId: string): Promise<{ token: string; link: string }>;
  scan(token: string, userId: string): Promise<ReceiptCodeView>;
  submitSurvey(token: string, userId: string, answers: SurveyAnswers): Promise<StoredSurvey>;
  expireStale(): Promise<number>;
}

// ---------------------------------------------------------------- INoise
export const NOISE = Symbol('INoise');

export interface NoiseResult {
  status: 'recorded' | 'unavailable';
  level: Level | null;
}

/** Audio Analysis (AI-023..AI-027). Audio stays in memory and is never stored (PRIV-001). */
export interface INoise {
  analyzeSnippet(input: {
    userId: string;
    venueId: string;
    audio: Buffer;
    mimeType: string;
  }): Promise<NoiseResult>;
}
