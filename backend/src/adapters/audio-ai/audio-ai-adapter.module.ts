import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdapterUnavailableError } from '../../common/errors/app-error';
import { AUDIO_AI, type IAudioAI, type IClock, type Level } from '../../contracts';
import { CircuitBreaker } from '../resilience/circuit-breaker';
import { GeminiAudioAdapter } from './gemini-audio.adapter';
import { LoudnessAudioAdapter } from './loudness-audio.adapter';

/**
 * Fake audio classifier. Returns the scripted level, or fails the next N calls
 * (fault injection for PB-46). Audio is never kept, not even here (PRIV-001).
 */
@Injectable()
export class FakeAudioAiAdapter implements IAudioAI {
  private nextLevel: Level | 'inconclusive' | null = null;
  private failures = 0;

  willReturn(level: Level | 'inconclusive'): void {
    this.nextLevel = level;
  }

  failNext(n: number): void {
    this.failures = n;
  }

  async classifyNoise(): Promise<Level | 'inconclusive'> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new AdapterUnavailableError('audio-ai', 'injected failure');
    }
    if (this.nextLevel === null)
      throw new AdapterUnavailableError('audio-ai', 'no audio AI configured');
    return this.nextLevel;
  }
}

/** Any IAudioAI behind the circuit breaker (EIR-015: 5 failures, open 30 s, one trial). */
export class ResilientAudioAi implements IAudioAI {
  constructor(
    private readonly inner: IAudioAI,
    readonly breaker: CircuitBreaker,
  ) {}

  classifyNoise(
    audio: Buffer,
    mimeType: string,
    timeoutMs: number,
  ): Promise<Level | 'inconclusive'> {
    return this.breaker.execute(() => this.inner.classifyNoise(audio, mimeType, timeoutMs));
  }
}

export type AudioAiProvider = 'gemini' | 'loudness' | 'fake';

/** AUDIO_AI_PROVIDER if set; else Gemini with a key, the fake in tests, loudness otherwise. */
export function chooseAudioAiProvider(config: ConfigService): AudioAiProvider {
  const chosen = String(config.get('AUDIO_AI_PROVIDER', '') ?? '');
  if (chosen === 'gemini' || chosen === 'loudness' || chosen === 'fake') return chosen;
  if (String(config.get('GEMINI_API_KEY', '') ?? '')) return 'gemini';
  return config.get('NODE_ENV') === 'test' ? 'fake' : 'loudness';
}

/**
 * Audio AI adapter (PB-19, SDS 5.1). Provides IAudioAI, always behind its own
 * circuit breaker. Gemini when GEMINI_API_KEY is set; without a key, the offline
 * loudness classifier so the feature still works in development and demos.
 */
/** Adapters may not import modules (architecture rule), so the breaker reads the system time. */
const SYSTEM_CLOCK: IClock = { now: () => new Date() };

@Module({
  providers: [
    FakeAudioAiAdapter,
    {
      provide: AUDIO_AI,
      inject: [ConfigService, EventEmitter2, FakeAudioAiAdapter],
      useFactory: (
        config: ConfigService,
        events: EventEmitter2,
        fake: FakeAudioAiAdapter,
      ): IAudioAI => {
        const provider = chooseAudioAiProvider(config);
        const inner: IAudioAI =
          provider === 'gemini'
            ? new GeminiAudioAdapter(String(config.get('GEMINI_API_KEY')), {
                model: String(config.get('GEMINI_AUDIO_MODEL', '') ?? ''),
              })
            : provider === 'loudness'
              ? new LoudnessAudioAdapter()
              : fake;
        new Logger('AudioAiAdapter').log(`Noise classification: ${provider}`);
        return new ResilientAudioAi(
          inner,
          new CircuitBreaker({ name: 'audio-ai' }, SYSTEM_CLOCK, events),
        );
      },
    },
  ],
  exports: [AUDIO_AI, FakeAudioAiAdapter],
})
export class AudioAiAdapterModule {}
