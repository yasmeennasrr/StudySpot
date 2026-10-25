import { Injectable, Module } from '@nestjs/common';
import { AdapterUnavailableError } from '../../common/errors/app-error';
import { AUDIO_AI, type IAudioAI, type Level } from '../../contracts';

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

/**
 * Audio AI adapter. Provides IAudioAI.
 * TODO(Sprint 3, PB-19/PB-46): GeminiAudioAdapter in its own circuit breaker (8 s timeout).
 */
@Module({
  providers: [{ provide: AUDIO_AI, useClass: FakeAudioAiAdapter }],
  exports: [AUDIO_AI],
})
export class AudioAiAdapterModule {}
