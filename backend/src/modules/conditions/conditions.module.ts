import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONDITIONS } from '../../contracts';
import { DynamicRecordEntity, VenueEntity } from '../../db/entities';
import { ClockModule } from '../clock/clock.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PresenceModule } from '../presence/presence.module';
import { StubConditionsService } from './conditions.service.stub';

/**
 * Conditions (estimation engine). Owner: M4. Provides IConditions.
 * Uses IPresence, IConfig, IClock; listens to SurveyStored and NoiseRecorded.
 * TODO(M4): swap StubConditionsService for the real resolver.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DynamicRecordEntity, VenueEntity]),
    PresenceModule,
    ConfigurationModule,
    ClockModule,
  ],
  providers: [{ provide: CONDITIONS, useClass: StubConditionsService }],
  exports: [CONDITIONS],
})
export class ConditionsModule {}
