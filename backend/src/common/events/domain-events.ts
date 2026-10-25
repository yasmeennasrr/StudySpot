/**
 * Domain events (Observer pattern, SDS 8). A module publishes an event with
 * EventEmitter2.emit(DomainEvent.X, payload); any module can listen with
 * @OnEvent(DomainEvent.X) without importing the publisher. These are the dashed
 * arrows in SDS Figure 2.
 *
 *   SurveyStored        Surveys        -> Conditions (cache refresh, PERF-005)
 *   NoiseRecorded       Audio Analysis -> Conditions (RT-021)
 *   SignInFailed        Accounts       -> Audit Log (SEC-010)
 *   StaffAction         Administration -> Audit Log (FR-044)
 *   PresenceDwell       Presence       -> Notifications (SEN-014)
 *   ConfigChanged       Configuration  -> Conditions, Rewards (re-read limits)
 *   AiBreakerChanged    AI adapters    -> log (SDS 5.1, from Sprint 3)
 */
export enum DomainEvent {
  SurveyStored = 'survey.stored',
  NoiseRecorded = 'noise.recorded',
  SignInFailed = 'auth.sign_in_failed',
  StaffAction = 'staff.action',
  PresenceDwell = 'presence.dwell',
  ConfigChanged = 'config.changed',
  AiBreakerChanged = 'ai.breaker_changed',
}

export interface SurveyStoredEvent {
  surveyId: string;
  venueId: string;
  userId: string;
  source: 'qr' | 'in_app';
  submittedAt: Date;
}

export interface NoiseRecordedEvent {
  venueId: string;
  level: 1 | 2 | 3;
  recordedAt: Date;
}

export interface SignInFailedEvent {
  email: string;
  reason: 'unknown_email' | 'wrong_password' | 'suspended';
  ip?: string;
  at: Date;
}

export interface StaffActionEvent {
  staffUserId: string;
  action: string;
  target: string;
  at: Date;
  details?: Record<string, unknown>;
}

export interface PresenceDwellEvent {
  userId: string;
  venueId: string;
  since: Date;
}

export interface ConfigChangedEvent {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  at: Date;
}
