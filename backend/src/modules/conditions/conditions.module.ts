import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONDITIONS } from '../../contracts';
import { DynamicRecordEntity, VenueEntity } from '../../db/entities';
import { ClockModule } from '../clock/clock.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PresenceModule } from '../presence/presence.module';
import { ConditionsService } from './conditions.service';

/**
 * Conditions (estimation engine). Owner: M4. Provides IConditions.
 * Uses IPresence, IConfig, IClock; listens to SurveyStored, NoiseRecorded and
 * ConfigChanged. Resolution is a Chain of Responsibility (condition-resolver.ts).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DynamicRecordEntity, VenueEntity]),
    PresenceModule,
    ConfigurationModule,
    ClockModule,
  ],
  providers: [{ provide: CONDITIONS, useClass: ConditionsService }],
  exports: [CONDITIONS],
})
export class ConditionsModule {}
