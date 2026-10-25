import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PRESENCE } from '../../contracts';
import { PresenceRecordEntity, VenueEntity } from '../../db/entities';
import { ClockModule } from '../clock/clock.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { StubPresenceService } from './presence.service.stub';

/**
 * Presence (new in SDS v0.3). Built in Sprint 2. Provides IPresence.
 * Uses IConfig, IClock; publishes PresenceDwell -> Notifications.
 * Called by Conditions (crowd), Rewards (anti-abuse rule 3), QR Codes (scan check-in) and the Scheduler (2-hour purge).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PresenceRecordEntity, VenueEntity]),
    ConfigurationModule,
    ClockModule,
  ],
  providers: [{ provide: PRESENCE, useClass: StubPresenceService }],
  exports: [PRESENCE],
})
export class PresenceModule {}
