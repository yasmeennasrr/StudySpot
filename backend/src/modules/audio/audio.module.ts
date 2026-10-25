import { Inject, Injectable, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AudioAiAdapterModule } from '../../adapters/audio-ai/audio-ai-adapter.module';
import {
  AUDIO_AI,
  CLOCK,
  NOISE,
  type IAudioAI,
  type IClock,
  type INoise,
  type NoiseResult,
} from '../../contracts';
import { DynamicRecordEntity } from '../../db/entities';
import { ClockModule } from '../clock/clock.module';

/**
 * STUB. Real version in Sprint 3 (PB-19, PB-46).
 * TODO: pass the in-memory buffer to IAudioAI.classifyNoise; on a level, store
 * one dynamic_records row (noise, level, time, venue only: DATA-005) and emit
 * DomainEvent.NoiseRecorded -> Conditions. On AdapterUnavailableError or
 * "inconclusive": no record, drop the buffer, return { status: 'unavailable' } (AI-026).
 */
@Injectable()
export class StubAudioAnalysisService implements INoise {
  constructor(
    @Inject(AUDIO_AI) private readonly audioAi: IAudioAI,
    private readonly events: EventEmitter2,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async analyzeSnippet(): Promise<NoiseResult> {
    return { status: 'unavailable', level: null };
  }
}

/** Audio Analysis. Provides INoise. Uses IAudioAI, IClock; publishes NoiseRecorded -> Conditions. */
@Module({
  imports: [TypeOrmModule.forFeature([DynamicRecordEntity]), AudioAiAdapterModule, ClockModule],
  providers: [{ provide: NOISE, useClass: StubAudioAnalysisService }],
  exports: [NOISE],
})
export class AudioModule {}
