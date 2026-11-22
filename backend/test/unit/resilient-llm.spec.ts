import type { ConfigService } from '@nestjs/config';
import { LlmBadRequestError } from '../../src/adapters/llm/gemini-llm.adapter';
import {
  chooseLlmProvider,
  FakeLlmAdapter,
  ResilientLlm,
} from '../../src/adapters/llm/llm-adapter.module';
import { CircuitBreaker } from '../../src/adapters/resilience/circuit-breaker';
import { AdapterUnavailableError } from '../../src/common/errors/app-error';
import { DomainEvent } from '../../src/common/events/domain-events';
import type { ILLM, LlmTurn } from '../../src/contracts';
import { FakeClock } from '../../src/modules/clock/fake-clock';

/**
 * TC-M2-29..TC-M2-34: the LLM safety net (PB-46, EIR-015, AI-029, SDS 5.1).
 * Time comes from FakeClock, so "30 seconds" passes instantly.
 */
const ANSWER: LlmTurn = { role: 'model', text: 'ok' };
const input = (timeoutMs = 5000) => ({ system: 's', turns: [], tools: [], timeoutMs });

function setup() {
  const clock = new FakeClock('2026-11-21T10:00:00Z');
  const fake = new FakeLlmAdapter();
  const events: { name: string; to: string }[] = [];
  const breaker = new CircuitBreaker({ name: 'llm' }, clock, {
    emit: (name: string, e: { to: string }) => events.push({ name, to: e.to }) > 0,
  });
  const llm = new ResilientLlm(fake, breaker, 5000);
  return { clock, fake, breaker, llm, events };
}

const outcome = (p: Promise<unknown>) =>
  p.then(
    () => 'OK',
    (e: unknown) =>
      e instanceof AdapterUnavailableError
        ? `unavailable: ${e.reason}`
        : e instanceof LlmBadRequestError
          ? 'bad request'
          : String(e),
  );

describe('ResilientLlm (PB-46)', () => {
  it('TC-M2-29 failure boundary: 4 failures in a row keep the breaker closed, the 5th opens it', async () => {
    const { fake, llm, breaker } = setup();
    fake.failNext(4);
    for (let i = 0; i < 4; i++) await outcome(llm.generate(input()));
    expect(breaker.currentState).toBe('closed');
    fake.queue(ANSWER);
    expect(await outcome(llm.generate(input()))).toBe('OK'); // a success resets the count

    fake.failNext(5);
    for (let i = 0; i < 5; i++) await outcome(llm.generate(input()));
    expect(breaker.currentState).toBe('open');
  });

  it('TC-M2-30 while open, calls fail at once without reaching Gemini, until 30 s have passed', async () => {
    const { fake, llm, clock, breaker } = setup();
    fake.failNext(5);
    for (let i = 0; i < 5; i++) await outcome(llm.generate(input()));
    fake.queue(ANSWER);

    clock.advance({ seconds: 29 });
    expect(await outcome(llm.generate(input()))).toBe('unavailable: circuit open');
    clock.advance({ seconds: 1 });
    expect(breaker.currentState).toBe('half_open');
  });

  it('TC-M2-31 after 30 s one trial call decides: success closes it, failure opens it for 30 s more', async () => {
    const opened = async () => {
      const s = setup();
      s.fake.failNext(5);
      for (let i = 0; i < 5; i++) await outcome(s.llm.generate(input()));
      s.clock.advance({ seconds: 30 });
      return s;
    };

    const good = await opened();
    good.fake.queue(ANSWER);
    expect(await outcome(good.llm.generate(input()))).toBe('OK');
    expect(good.breaker.currentState).toBe('closed');
    expect(good.events.map((e) => e.to)).toEqual(['open', 'half_open', 'closed']);
    expect(good.events.every((e) => e.name === DomainEvent.AiBreakerChanged)).toBe(true);

    const bad = await opened();
    bad.fake.failNext(1);
    expect(await outcome(bad.llm.generate(input()))).toBe('unavailable: injected failure');
    expect(bad.breaker.currentState).toBe('open');
    bad.clock.advance({ seconds: 29 });
    expect(bad.breaker.currentState).toBe('open');
  });

  it('TC-M2-32 a bad request (HTTP 400) is passed on but not counted as an outage', async () => {
    const badRequest: ILLM = {
      generate: async () => {
        throw new LlmBadRequestError('HTTP 400');
      },
    };
    const breaker = new CircuitBreaker({ name: 'llm' }, new FakeClock());
    const llm = new ResilientLlm(badRequest, breaker, 5000);
    for (let i = 0; i < 6; i++) {
      expect(await outcome(llm.generate(input()))).toBe('bad request');
    }
    expect(breaker.currentState).toBe('closed');
  });

  it('TC-M2-33 each call gets at most 5 s: 9 s asked is cut to 5 s, and a call that hangs is abandoned', async () => {
    const seen: number[] = [];
    const recorder: ILLM = {
      generate: async (i) => {
        seen.push(i.timeoutMs);
        return ANSWER;
      },
    };
    const breaker = new CircuitBreaker({ name: 'llm' }, new FakeClock());
    await new ResilientLlm(recorder, breaker, 5000).generate(input(9000));
    await new ResilientLlm(recorder, breaker, 5000).generate(input(3000));
    expect(seen).toEqual([5000, 3000]);

    // An adapter that never answers: the wrapper gives up after the limit (50 ms here).
    const hangs: ILLM = { generate: () => new Promise<LlmTurn>(() => undefined) };
    const hb = new CircuitBreaker({ name: 'llm' }, new FakeClock());
    expect(await outcome(new ResilientLlm(hangs, hb, 50).generate(input()))).toBe(
      'unavailable: timeout after 50 ms',
    );
  });

  it('TC-M2-34 provider choice: Gemini only with a key and never in tests; LLM_PROVIDER wins', () => {
    const config = (env: Record<string, string>) =>
      ({ get: (k: string, d?: unknown) => env[k] ?? d }) as unknown as ConfigService;
    expect(chooseLlmProvider(config({ GEMINI_API_KEY: 'k' }))).toBe('gemini');
    expect(chooseLlmProvider(config({}))).toBe('fake');
    expect(chooseLlmProvider(config({ GEMINI_API_KEY: 'k', NODE_ENV: 'test' }))).toBe('fake');
    expect(chooseLlmProvider(config({ LLM_PROVIDER: 'fake', GEMINI_API_KEY: 'k' }))).toBe('fake');
  });
});
