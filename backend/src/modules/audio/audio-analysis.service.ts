import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdapterUnavailableError } from '../../common/errors/app-error';
import { DomainEvent, type NoiseRecordedEvent } from '../../common/events/domain-events';
import {
  AUDIO_AI,
  CLOCK,
  type IAudioAI,
  type IClock,
  type INoise,
  type NoiseResult,
} from '../../contracts';
import { DynamicRecordEntity } from '../../db/entities';

/** SDS Table 3: the Audio AI call gets 8 s. */
export const AUDIO_AI_TIMEOUT_MS = 8_000;

/**
 * Audio Analysis (PB-19, AI-023, AI-025, AI-026, PRIV-001, SEN-007). Owner: M1.
 *
 * - The snippet arrives as an in-memory buffer and goes straight to IAudioAI.
 *   It is never written to disk, the database or a log.
 * - A level becomes one dynamic_records row with only venue, noise level, time and
 *   source (SEN-007, DATA-005): no user id, no audio. Conditions hears NoiseRecorded.
 * - Inconclusive, a failure, a timeout or an open breaker: no record, no retry,
 *   no queue; the app gets "unavailable" and shows a short notice (AI-026).
 * - In every case the buffer is overwritten with zeros before returning.
 */
@Injectable()
export class AudioAnalysisService implements INoise {
  private readonly logger = new Logger('AudioAnalysis');

  constructor(
    @Inject(AUDIO_AI) private readonly audioAi: IAudioAI,
    @InjectRepository(DynamicRecordEntity)
    private readonly records: Repository<DynamicRecordEntity>,
    private readonly events: EventEmitter2,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async analyzeSnippet(input: {
    userId: string;
    venueId: string;
    audio: Buffer;
    mimeType: string;
  }): Promise<NoiseResult> {
    try {
      let level: Awaited<ReturnType<IAudioAI['classifyNoise']>>;
      try {
        level = await this.audioAi.classifyNoise(input.audio, input.mimeType, AUDIO_AI_TIMEOUT_MS);
      } catch (err) {
        if (!(err instanceof AdapterUnavailableError)) throw err;
        this.logger.warn(
          { venueId: input.venueId, reason: err.reason },
          'Noise analysis unavailable',
        );
        return { status: 'unavailable', level: null };
      }
      if (level === 'inconclusive') {
        this.logger.log({ venueId: input.venueId }, 'Noise analysis inconclusive');
        return { status: 'unavailable', level: null };
      }
      const recordedAt = this.clock.now();
      await this.records.insert({
        venueId: input.venueId,
        conditionType: 'noise',
        value: level,
        sourceType: 'audio_analysis',
        recordedAt,
        surveyId: null,
      });
      const event: NoiseRecordedEvent = { venueId: input.venueId, level, recordedAt };
      this.events.emit(DomainEvent.NoiseRecorded, event);
      return { status: 'recorded', level };
    } finally {
      // PRIV-001: discard the snippet as soon as the level is known (or not).
      input.audio.fill(0);
    }
  }
}
