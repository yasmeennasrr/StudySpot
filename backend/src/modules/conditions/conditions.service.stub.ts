import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DomainEvent,
  type NoiseRecordedEvent,
  type SurveyStoredEvent,
} from '../../common/events/domain-events';
import {
  CLOCK,
  CONFIG,
  PRESENCE,
  type ConditionValue,
  type IClock,
  type IConditions,
  type IConfig,
  type IPresence,
  type VenueConditions,
} from '../../contracts';

export const UNAVAILABLE = (isEstimate: boolean): ConditionValue => ({
  level: null,
  label: null,
  status: 'unavailable',
  newestInputAt: null,
  basedOn: [],
  isEstimate,
});

/**
 * STUB for Conditions. Owner: M4 (Sprint 1 read path, PB-11 / preview of PB-12).
 * Returns "unavailable" for every attribute until the resolver is built.
 *
 * TODO(M4): replace with ConditionResolver, a Chain of Responsibility:
 *   CurrentHandler (freshness.* from IConfig) -> HoursAgoHandler (24 h)
 *   -> HistoricalHandler (SDS 6.6.3: same weekday+hour, same day type +-1 h,
 *      all records; >= 3 records; median, ties go up) -> UnavailableHandler.
 * Crowd adds IPresence.countPresent() mapped by size class (RT-020, SDS 6.6.1).
 * Cache results for conditions.cacheSeconds (RT-006).
 */
@Injectable()
export class StubConditionsService implements IConditions {
  private readonly logger = new Logger('Conditions');

  constructor(
    @Inject(PRESENCE) private readonly presence: IPresence,
    @Inject(CONFIG) private readonly config: IConfig,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async getConditions(venueId: string): Promise<VenueConditions> {
    this.logger.debug({ venueId }, 'Conditions.getConditions (stub)');
    return {
      venueId,
      crowd: UNAVAILABLE(true),
      noise: UNAVAILABLE(true),
      wifi: UNAVAILABLE(false),
    };
  }

  async getConditionsForMany(venueIds: string[]): Promise<Map<string, VenueConditions>> {
    const entries = await Promise.all(
      venueIds.map(async (id) => [id, await this.getConditions(id)] as const),
    );
    return new Map(entries);
  }

  invalidate(venueId: string): void {
    this.logger.debug({ venueId }, 'Conditions.invalidate');
  }

  async purgeExpiredRecords(): Promise<number> {
    return 0;
  }

  /** Surveys -> Conditions (PERF-005: a new survey shows within 10 s). */
  @OnEvent(DomainEvent.SurveyStored)
  onSurveyStored(event: SurveyStoredEvent): void {
    this.invalidate(event.venueId);
  }

  /** Audio Analysis -> Conditions (RT-021). */
  @OnEvent(DomainEvent.NoiseRecorded)
  onNoiseRecorded(event: NoiseRecordedEvent): void {
    this.invalidate(event.venueId);
  }
}
