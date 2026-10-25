import { Injectable, Module } from '@nestjs/common';
import { AdapterUnavailableError } from '../../common/errors/app-error';
import { LLM, type ILLM, type LlmTurn } from '../../contracts';

/**
 * Fault-injecting fake LLM (SDS 9, testability). Script the next answers with
 * `queue`, or make the next N calls fail with `failNext(n)` to test the circuit
 * breaker and the StudyMatch fallback (PB-46). With nothing queued it is "down".
 */
@Injectable()
export class FakeLlmAdapter implements ILLM {
  private readonly answers: LlmTurn[] = [];
  private failures = 0;

  queue(...turns: LlmTurn[]): void {
    this.answers.push(...turns);
  }

  failNext(n: number): void {
    this.failures = n;
  }

  async generate(): Promise<LlmTurn> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new AdapterUnavailableError('llm', 'injected failure');
    }
    const next = this.answers.shift();
    if (!next) throw new AdapterUnavailableError('llm', 'no LLM configured');
    return next;
  }
}

/**
 * LLM adapter. Provides ILLM.
 * TODO(Sprint 3, PB-29/PB-46): GeminiLlmAdapter wrapped in the ResiliencePolicy
 * decorator (5 s timeout, breaker opens after 5 failures for 30 s; SDS 5.1).
 */
@Module({
  providers: [{ provide: LLM, useClass: FakeLlmAdapter }],
  exports: [LLM],
})
export class LlmAdapterModule {}
