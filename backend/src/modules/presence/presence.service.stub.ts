import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, CONFIG, type IClock, type IConfig, type IPresence } from '../../contracts';

/**
 * STUB for Presence (new in SDS v0.3). Real version in Sprint 2 (PB-18).
 * Nobody counts as present yet, which the crowd rule treats as "no present-user
 * input" (SDS 6.6.1), so Conditions behaves correctly with this stub.
 *
 * TODO(Sprint 2): store presence_records; ST_DWithin(venue.location, point,
 * presence.venueRadiusMeters) for reportLocation; count distinct users with a
 * location report < 15 min old or a receipt scan < 10 min old (RT-008); emit
 * DomainEvent.PresenceDwell after presence.dwellMinutesForPrompt; purge rows
 * older than presence.rawRetentionHours (PRIV-016).
 */
@Injectable()
export class StubPresenceService implements IPresence {
  private readonly logger = new Logger('Presence');

  constructor(
    @Inject(CONFIG) private readonly config: IConfig,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async reportLocation(): Promise<{ venueId: string | null }> {
    return { venueId: null };
  }

  async recordReceiptScan(userId: string, venueId: string): Promise<void> {
    this.logger.debug({ userId, venueId }, 'Presence.recordReceiptScan (stub)');
  }

  async isPresent(): Promise<boolean> {
    return false;
  }

  async countPresent(): Promise<number> {
    return 0;
  }

  async purgeExpired(): Promise<number> {
    const hours = await this.config.get('presence.rawRetentionHours');
    this.logger.debug(
      { before: new Date(this.clock.now().getTime() - hours * 3_600_000) },
      'Presence.purgeExpired (stub)',
    );
    return 0;
  }
}
