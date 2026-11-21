import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdapterUnavailableError } from '../../common/errors/app-error';
import { LLM, type IClock, type ILLM, type LlmTurn } from '../../contracts';
import { CircuitBreaker } from '../resilience/circuit-breaker';
import { GeminiLlmAdapter } from './gemini-llm.adapter';

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

type GenerateInput = Parameters<ILLM['generate']>[0];

/**
 * ResiliencePolicy for the LLM (PB-46, EIR-015, SDS 5.1). Owner: M2.
 *
 * - Every call gets at most `maxCallMs` (LLM_TIMEOUT_MS, 5 s): a longer
 *   `timeoutMs` from the caller is cut down, and a call that still runs past it
 *   is abandoned with AdapterUnavailableError('llm', 'timeout').
 * - Every call goes through the shared CircuitBreaker (M1, PB-19): 5 failures in
 *   a row open it for 30 s, then one trial call decides. While it is open,
 *   calls fail at once, so StudyMatch falls back without waiting (AI-029).
 */
export class ResilientLlm implements ILLM {
  constructor(
    private readonly inner: ILLM,
    readonly breaker: CircuitBreaker,
    private readonly maxCallMs = 5_000,
  ) {}

  generate(input: GenerateInput): Promise<LlmTurn> {
    const timeoutMs = Math.min(input.timeoutMs, this.maxCallMs);
    return this.breaker.execute(() => this.withDeadline({ ...input, timeoutMs }));
  }

  /** The inner adapter should stop by itself; this is the guarantee if it does not. */
  private withDeadline(input: GenerateInput): Promise<LlmTurn> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new AdapterUnavailableError('llm', `timeout after ${input.timeoutMs} ms`)),
        input.timeoutMs,
      );
    });
    return Promise.race([this.inner.generate(input), deadline]).finally(() => clearTimeout(timer));
  }
}

export type LlmProvider = 'gemini' | 'fake';

/** LLM_PROVIDER if set; else Gemini when GEMINI_API_KEY is set (never in tests), else the fake. */
export function chooseLlmProvider(config: ConfigService): LlmProvider {
  const chosen = String(config.get('LLM_PROVIDER', '') ?? '');
  if (chosen === 'gemini' || chosen === 'fake') return chosen;
  if (config.get('NODE_ENV') === 'test') return 'fake';
  return String(config.get('GEMINI_API_KEY', '') ?? '') ? 'gemini' : 'fake';
}

/** Adapters may not import modules (architecture rule), so the breaker reads the system time. */
const SYSTEM_CLOCK: IClock = { now: () => new Date() };

/**
 * LLM adapter (PB-29, PB-46). Provides ILLM, always behind ResilientLlm.
 * Gemini when GEMINI_API_KEY is set; without a key, the fake (which answers
 * "unavailable"), so StudyMatch shows standard results in development.
 */
@Module({
  providers: [
    FakeLlmAdapter,
    {
      provide: LLM,
      inject: [ConfigService, EventEmitter2, FakeLlmAdapter],
      useFactory: (config: ConfigService, events: EventEmitter2, fake: FakeLlmAdapter): ILLM => {
        const provider = chooseLlmProvider(config);
        const inner: ILLM =
          provider === 'gemini'
            ? new GeminiLlmAdapter(String(config.get('GEMINI_API_KEY')), {
                model: String(config.get('GEMINI_LLM_MODEL', '') ?? ''),
              })
            : fake;
        new Logger('LlmAdapter').log(`StudyMatch LLM: ${provider}`);
        const breaker = new CircuitBreaker(
          {
            name: 'llm',
            failureThreshold: Number(config.get('LLM_BREAKER_FAILURES', 5)),
            openMs: Number(config.get('LLM_BREAKER_OPEN_MS', 30_000)),
          },
          SYSTEM_CLOCK,
          events,
        );
        return new ResilientLlm(inner, breaker, Number(config.get('LLM_TIMEOUT_MS', 5_000)));
      },
    },
  ],
  exports: [LLM, FakeLlmAdapter],
})
export class LlmAdapterModule {}
