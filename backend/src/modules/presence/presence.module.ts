import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PRESENCE } from '../../contracts';
import {
  PresenceRecordEntity,
  PresenceVisitEntity,
  UserEntity,
  VenueEntity,
} from '../../db/entities';
import { AccountsModule } from '../accounts/accounts.module';
import { ClockModule } from '../clock/clock.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

/**
 * Presence (new in SDS v0.3). Built in Sprint 2. Provides IPresence.
 * Uses IConfig, IClock; publishes PresenceDwell -> Notifications.
 * Called by Conditions (crowd), Rewards (anti-abuse rule 3), QR Codes (scan check-in) and the Scheduler (2-hour purge).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PresenceRecordEntity, PresenceVisitEntity, UserEntity, VenueEntity]),
    AccountsModule,
    ConfigurationModule,
    ClockModule,
  ],
  controllers: [PresenceController],
  providers: [{ provide: PRESENCE, useClass: PresenceService }],
  exports: [PRESENCE],
})
export class PresenceModule {}
