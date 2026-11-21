import { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { AdapterUnavailableError } from '../../common/errors/app-error';
import { DomainEvent } from '../../common/events/domain-events';
import type { IClock } from '../../contracts';

export type BreakerState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Adapter name in errors and logs, e.g. 'audio-ai' or 'llm'. */
  name: string;
  /** Consecutive failures that open the breaker (EIR-015: 5). */
  failureThreshold?: number;
  /** How long it stays open before one trial call (EIR-015: 30 s). */
  openMs?: number;
}

export interface AiBreakerChangedEvent {
  adapter: string;
  from: BreakerState;
  to: BreakerState;
  at: Date;
}

/**
 * Circuit breaker for the AI adapters (EIR-015, SDS 5.1 and Figure 3). Owner: M1,
 * built with PB-19; the LLM adapter (PB-29/PB-46) reuses it.
 *
 * - closed: calls go through. `failureThreshold` failures in a row open it.
 * - open: calls fail at once with AdapterUnavailableError, for `openMs`.
 * - half_open: one trial call goes through (others fail at once). Success closes
 *   the breaker; failure opens it again for another `openMs`.
 *
 * A call counts as a failure when it throws AdapterUnavailableError. Anything else
 * it throws (our own bad input) passes through and is not counted. Time comes from
 * IClock, so tests move it instead of waiting.
 */
export class CircuitBreaker {
  private readonly logger = new Logger('CircuitBreaker');
  private readonly threshold: number;
  private readonly openMs: number;
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private trialRunning = false;

  constructor(
    private readonly options: CircuitBreakerOptions,
    private readonly clock: IClock,
    private readonly events?: Pick<EventEmitter2, 'emit'>,
  ) {
    this.threshold = options.failureThreshold ?? 5;
    this.openMs = options.openMs ?? 30_000;
  }

  get currentState(): BreakerState {
    if (this.state === 'open' && this.clock.now().getTime() - this.openedAt >= this.openMs) {
      return 'half_open';
    }
    return this.state;
  }

  async execute<T>(call: () => Promise<T>): Promise<T> {
    const state = this.currentState;
    if (state === 'open' || (state === 'half_open' && this.trialRunning)) {
      throw new AdapterUnavailableError(this.options.name, 'circuit open');
    }
    if (state === 'half_open') {
      this.move('half_open');
      this.trialRunning = true;
    }
    try {
      const result = await call();
      this.onSuccess();
      return result;
    } catch (err) {
      if (err instanceof AdapterUnavailableError) this.onFailure();
      throw err;
    } finally {
      this.trialRunning = false;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state !== 'closed') this.move('closed');
  }

  private onFailure(): void {
    if (this.state === 'half_open') {
      this.open();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.threshold) this.open();
  }

  private open(): void {
    this.failures = 0;
    this.openedAt = this.clock.now().getTime();
    this.move('open');
  }

  private move(to: BreakerState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    const event: AiBreakerChangedEvent = {
      adapter: this.options.name,
      from,
      to,
      at: this.clock.now(),
    };
    this.logger.warn(event, `${this.options.name} breaker ${from} -> ${to}`);
    this.events?.emit(DomainEvent.AiBreakerChanged, event);
  }
}
