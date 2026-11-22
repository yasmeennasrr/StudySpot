import { FakeLlmAdapter, ResilientLlm } from '../../src/adapters/llm/llm-adapter.module';
import { CircuitBreaker } from '../../src/adapters/resilience/circuit-breaker';
import { AppError } from '../../src/common/errors/app-error';
import type {
  FilterCriteria,
  IPreferences,
  IVenueQuery,
  SearchParams,
  VenueSummary,
} from '../../src/contracts';
import { FakeClock } from '../../src/modules/clock/fake-clock';
import type { StudyMatchTools } from '../../src/modules/studymatch/studymatch-tools';
import { TOOL_DEFINITIONS } from '../../src/modules/studymatch/studymatch-tools';
import {
  FALLBACK_NEAREST,
  FALLBACK_NOTICE,
  FALLBACK_USE_SEARCH,
  FALLBACK_WITH_PREFERENCES,
  StudyMatchService,
} from '../../src/modules/studymatch/studymatch.service';

/**
 * TC-M2-47..TC-M2-51: StudyMatch when the AI is unavailable (PB-46, AI-019, AI-029, EIR-015).
 * The real ResilientLlm and CircuitBreaker sit in front of the fake LLM.
 */
const ME = { userId: 'user-1', location: { lat: 30.06, lng: 31.22 } };
const venue = (id: string, distanceMeters: number) =>
  ({ id, name: `Place ${id}`, distanceMeters }) as VenueSummary;

function setup(
  opts: {
    prefs?: FilterCriteria;
    matching?: VenueSummary[];
    nearest?: VenueSummary[];
    searchFails?: boolean;
  } = {},
) {
  const clock = new FakeClock('2026-11-22T14:00:00Z');
  const fake = new FakeLlmAdapter();
  const breaker = new CircuitBreaker({ name: 'llm' }, clock);
  const llm = new ResilientLlm(fake, breaker, 5000);
  const searches: SearchParams[] = [];
  const venues = {
    search: async (p: SearchParams) => {
      searches.push(p);
      if (opts.searchFails) throw AppError.unavailable('database down');
      const items = p.filters ? (opts.matching ?? []) : (opts.nearest ?? []);
      return { origin: p.near ?? null, items, degraded: false };
    },
  } as unknown as IVenueQuery;
  const preferences = { get: async () => opts.prefs ?? {} } as unknown as IPreferences;
  const tools = {
    definitions: TOOL_DEFINITIONS,
    run: async () => ({ ok: true, result: {} }),
  } as unknown as StudyMatchTools;
  const service = new StudyMatchService(llm, tools, clock, venues, preferences);
  return { service, fake, breaker, clock, searches };
}

describe('StudyMatch fallback (PB-46, AI-029)', () => {
  it('TC-M2-47 AI down: nearby places matching saved preferences, flagged degraded / AI_UNAVAILABLE', async () => {
    const prefs: FilterCriteria = { noise: 1, maxPriceLevel: 2 };
    const s = setup({ prefs, matching: [venue('a', 412.4), venue('b', 1830)] });
    s.fake.failNext(1);

    const answer = await s.service.ask({ ...ME, text: 'quiet cheap place' });

    expect(answer).toEqual({
      reply: `${FALLBACK_NOTICE} ${FALLBACK_WITH_PREFERENCES}`,
      recommendations: [
        { venue: venue('a', 412.4), reasons: ['412 m away.'] },
        { venue: venue('b', 1830), reasons: ['1.8 km away.'] },
      ],
      degraded: true,
      reasonCode: 'AI_UNAVAILABLE',
    });
    expect(s.searches).toEqual([{ near: ME.location, filters: prefs, limit: 5 }]);
  });

  it('TC-M2-48 circuit already open: answers at once without calling the AI', async () => {
    const s = setup({ nearest: [venue('a', 300)] });
    s.fake.failNext(5);
    for (let i = 0; i < 5; i++) await s.service.ask({ ...ME, text: 'quiet' });
    expect(s.breaker.currentState).toBe('open');

    s.fake.queue({ role: 'model', text: 'should not be used' });
    const answer = await s.service.ask({ ...ME, text: 'quiet' });
    expect(answer.reasonCode).toBe('AI_UNAVAILABLE');
    expect(answer.degraded).toBe(true);
    // The queued answer is still there: the open breaker never let the call through.
    s.clock.advance({ seconds: 30 });
    expect(await s.service.ask({ ...ME, text: 'quiet' })).toMatchObject({
      reply: 'should not be used',
      reasonCode: 'OK',
    });
  });

  it('TC-M2-49 no location shared: the notice and a prompt to use Search, no places', async () => {
    const s = setup({ nearest: [venue('a', 300)] });
    s.fake.failNext(1);
    const answer = await s.service.ask({ userId: 'user-1', text: 'quiet in Zamalek' });
    expect(answer).toEqual({
      reply: `${FALLBACK_NOTICE} ${FALLBACK_USE_SEARCH}`,
      recommendations: [],
      degraded: true,
      reasonCode: 'AI_UNAVAILABLE',
    });
    expect(s.searches).toHaveLength(0);
  });

  it('TC-M2-50 nothing matches the preferences: the nearest places, and the reply says so', async () => {
    const s = setup({ prefs: { noise: 1 }, matching: [], nearest: [venue('c', 90)] });
    s.fake.failNext(1);
    const answer = await s.service.ask({ ...ME, text: 'quiet' });
    expect(answer.reply).toBe(`${FALLBACK_NOTICE} ${FALLBACK_NEAREST}`);
    expect(answer.recommendations).toEqual([{ venue: venue('c', 90), reasons: ['90 m away.'] }]);
    expect(s.searches.map((p) => !!p.filters)).toEqual([true, false]);
  });

  it('TC-M2-51 the search fails too: still an answer (notice + use Search), never an error', async () => {
    const s = setup({ prefs: { noise: 1 }, searchFails: true });
    s.fake.failNext(1);
    const answer = await s.service.ask({ ...ME, text: 'quiet' });
    expect(answer).toEqual({
      reply: `${FALLBACK_NOTICE} ${FALLBACK_USE_SEARCH}`,
      recommendations: [],
      degraded: true,
      reasonCode: 'AI_UNAVAILABLE',
    });
  });
});
