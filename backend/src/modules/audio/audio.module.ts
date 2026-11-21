import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AudioAiAdapterModule } from '../../adapters/audio-ai/audio-ai-adapter.module';
import { NOISE } from '../../contracts';
import { DynamicRecordEntity } from '../../db/entities';
import { AccountsModule } from '../accounts/accounts.module';
import { ClockModule } from '../clock/clock.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PresenceModule } from '../presence/presence.module';
import { VenuesModule } from '../venues/venues.module';
import { AudioAnalysisService } from './audio-analysis.service';
import { NoiseSamplesController } from './noise-samples.controller';

/**
 * Audio Analysis (PB-19). Owner: M1. Provides INoise.
 * Uses IAudioAI (behind its circuit breaker), IPresence, IVenueQuery, IConfig, IClock;
 * publishes NoiseRecorded -> Conditions.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DynamicRecordEntity]),
    AudioAiAdapterModule,
    AccountsModule,
    ClockModule,
    ConfigurationModule,
    PresenceModule,
    VenuesModule,
  ],
  controllers: [NoiseSamplesController],
  providers: [{ provide: NOISE, useClass: AudioAnalysisService }],
  exports: [NOISE],
})
export class AudioModule {}
