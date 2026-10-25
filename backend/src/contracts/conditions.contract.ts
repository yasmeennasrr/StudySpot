/**
 * Conditions, the estimation engine (SDS 6.3). Owner: M4. Provider: ConditionsModule.
 * Resolves every dynamic value as current -> hours ago -> historical -> unavailable
 * (Chain of Responsibility, SDS 8). Requirements: RT-001..RT-022, FR-020, FR-021.
 */
import type { VenueConditions } from './domain.types';

export const CONDITIONS = Symbol('IConditions');

export interface IConditions {
  /** Status is decided at the time of the call (RT-002); `at` exists for tests. */
  getConditions(venueId: string, at?: Date): Promise<VenueConditions>;
  getConditionsForMany(venueIds: string[], at?: Date): Promise<Map<string, VenueConditions>>;
  /** Drops the 60-second cache for one venue (RT-006, PERF-005). */
  invalidate(venueId: string): void;
  /** Deletes dynamic records older than conditions.historicalDays (PRIV-013). Called by the Scheduler. */
  purgeExpiredRecords(): Promise<number>;
}
