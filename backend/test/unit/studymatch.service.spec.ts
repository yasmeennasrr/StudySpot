import { LlmBadRequestError } from '../../src/adapters/llm/gemini-llm.adapter';
import { AdapterUnavailableError } from '../../src/common/errors/app-error';
import type { ILLM, IPreferences, IVenueQuery, LlmTurn, VenueSummary } from '../../src/contracts';
import { FakeClock } from '../../src/modules/clock/fake-clock';
import type { StudyMatchTools, ToolOutcome } from '../../src/modules/studymatch/studymatch-tools';
import { TOOL_DEFINITIONS } from '../../src/modules/studymatch/studymatch-tools';
import {
  buildSystemPrompt,
  MAX_ROUNDS,
  readReply,
  StudyMatchService,
  StudyMatchUnavailable,
} from '../../src/modules/studymatch/studymatch.service';

/**
 * TC-M2-41..TC-M2-46, TC-M2-63..TC-M2-65, TC-M2-73..TC-M2-75: the StudyMatch orchestrator (PB-29, SDS 7.2, UC-05).
 * The LLM is scripted; tools are faked; time comes from FakeClock.
 */
const VENUE = { id: 'v1', name: 'Quiet Corner Zamalek' } as VenueSummary;
const ME = { userId: 'user-1', location: { lat: 30.06, lng: 31.22 } };

type Step = (input: Parameters<ILLM['generate']>[0]) => LlmTurn | Promise<LlmTurn>;

function setup(
  script: Step[],
  clock = new FakeClock('2026-11-22T08:30:00Z'), // 10:30 in Cairo
  toolAnswer?: (name: string, args: unknown) => ToolOutcome,
) {
  const llmCalls: Parameters<ILLM['generate']>[0][] = [];
  const llm: ILLM = {
    generate: async (input) => {
      llmCalls.push(structuredClone(input));
      const step = script.shift();
      if (!step) throw new AdapterUnavailableError('llm', 'script ended');
      return step(input);
    },
  };
  const toolCalls: { name: string; args: unknown; userId: string }[] = [];
  const tools = {
    definitions: TOOL_DEFINITIONS,
    run: async (name: string, args: unknown, ctx: { userId: string }) => {
      toolCalls.push({ name, args, userId: ctx.userId });
      if (toolAnswer) return toolAnswer(name, args);
      if (name === 'recommend_venues') {
        return {
          ok: true,
          result: { venues: [{ name: VENUE.name }] },
          recommended: [{ venue: VENUE, reasons: ['Quiet now (current).'] }],
        };
      }
      if (name === 'delete_review') {
        return { ok: false, error: { code: 'NOT_ALLOWED', message: 'not available' } };
      }
      return { ok: true, result: { venues: [] } };
    },
  } as unknown as StudyMatchTools;
  const venues = {
    search: async () => ({ origin: null, items: [], degraded: false }),
  } as unknown as IVenueQuery;
  const preferences = { get: async () => ({}) } as unknown as IPreferences;
  const service = new StudyMatchService(llm, tools, clock, venues, preferences);
  return { service, clock, llmCalls, toolCalls };
}

const say =
  (text: string): Step =>
  () => ({ role: 'model', text });
const call =
  (name: string, args: Record<string, unknown> = {}): Step =>
  () => ({
    role: 'model',
    toolCalls: [{ name, arguments: args }],
  });

describe('StudyMatch orchestrator (PB-29, UC-05)', () => {
  it('TC-M2-41 tool loop: the AI asks recommend_venues, gets the result, answers; cards come from backend data', async () => {
    const { service, llmCalls, toolCalls } = setup([
      call('recommend_venues', { criteria: [{ name: 'noise', value: 'quiet', required: true }] }),
      say('Quiet Corner Zamalek is quiet right now (current).'),
    ]);

    const answer = await service.ask({ ...ME, text: 'a quiet place to study near me' });

    expect(answer).toEqual({
      reply: 'Quiet Corner Zamalek is quiet right now (current).',
      recommendations: [{ venue: VENUE, reasons: ['Quiet now (current).'] }],
      degraded: false,
      reasonCode: 'OK',
    });
    expect(toolCalls).toEqual([
      expect.objectContaining({ name: 'recommend_venues', userId: 'user-1' }),
    ]);
    // Second LLM call carries the user turn, the model's tool call and the tool result.
    expect(llmCalls[1].turns.map((t) => t.role)).toEqual(['user', 'model', 'tool']);
    expect(llmCalls[1].turns[2].toolResult).toEqual({
      name: 'recommend_venues',
      result: { venues: [{ name: VENUE.name }] },
    });
    expect(llmCalls[0].tools.map((t) => t.name)).toContain('recommend_venues');
  });

  it('TC-M2-42 missing information: [NEEDS_INFO] becomes reason NEEDS_INFO, tag removed, no cards', async () => {
    const { service } = setup([say('[NEEDS_INFO] Which area would you like to study in?')]);
    const answer = await service.ask({ userId: 'user-1', text: 'somewhere quiet' });
    expect(answer).toEqual({
      reply: 'Which area would you like to study in?',
      recommendations: [],
      degraded: false,
      reasonCode: 'NEEDS_INFO',
    });
  });

  it('TC-M2-43 off-topic request: [OFF_TOPIC] becomes reason OFF_TOPIC (AI-020)', async () => {
    const { service } = setup([
      say('[OFF_TOPIC] Sorry, I can only help you find places to study.'),
    ]);
    const answer = await service.ask({ ...ME, text: 'write my essay about Napoleon' });
    expect(answer.reasonCode).toBe('OFF_TOPIC');
    expect(answer.reply).toBe('Sorry, I can only help you find places to study.');
    expect(answer.recommendations).toEqual([]);
    expect(readReply('  plain answer ')).toEqual({ reply: 'plain answer', reasonCode: 'OK' });
  });

  it('TC-M2-44 the system prompt carries the SRS rules: English reply to Arabic, statuses, no head counts, Cairo time, location', async () => {
    const { service, llmCalls } = setup([say('Here are quiet places.')]);
    await service.ask({ ...ME, text: 'عايزة مكان هادي أذاكر فيه near Zamalek' });
    const prompt = llmCalls[0].system;
    expect(llmCalls[0].turns[0]).toEqual({
      role: 'user',
      text: 'عايزة مكان هادي أذاكر فيه near Zamalek',
    });
    expect(prompt).toContain('Always reply in English');
    expect(prompt).toContain('"current" only when the status is current');
    expect(prompt).toContain('Never state a number of people');
    expect(prompt).toContain('Never invent a place');
    expect(prompt).toContain('10:30');
    expect(prompt).toContain('shared their location');
    expect(buildSystemPrompt(new Date('2026-11-22T08:30:00Z'), false)).toContain(
      'has NOT shared their location',
    );
  });

  it('TC-M2-45 a refused tool goes back to the AI as an error and the loop continues; empty text is refused', async () => {
    const { service, llmCalls } = setup([
      call('delete_review', { id: 'x' }),
      say('I can only look things up.'),
    ]);
    const answer = await service.ask({ ...ME, text: 'delete that bad review' });
    expect(answer.reply).toBe('I can only look things up.');
    expect(llmCalls[1].turns[2].toolResult).toEqual({
      name: 'delete_review',
      result: { error: { code: 'NOT_ALLOWED', message: 'not available' } },
    });
    await expect(service.ask({ ...ME, text: '   ' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('TC-M2-46 limits: at most 4 tool rounds; 9 s deadline; each call gets what is left (at most 4 s)', async () => {
    const loop = setup(Array.from({ length: 10 }, () => call('find_venues')));
    await expect(loop.service.converse(ME, 'loop forever')).rejects.toBeInstanceOf(
      StudyMatchUnavailable,
    );
    expect(loop.llmCalls).toHaveLength(MAX_ROUNDS);

    // Each LLM call "takes" 4 s on the fake clock: 0-4 s, 4-8 s, then only 1 s of the 9 s is left.
    const clock = new FakeClock('2026-11-22T08:30:00Z');
    const fourSeconds: Step = () => {
      clock.advance({ seconds: 4 });
      return { role: 'model', toolCalls: [{ name: 'find_venues', arguments: {} }] };
    };
    const timed = setup([fourSeconds, fourSeconds, say('just in time')], clock);
    const result = await timed.service.ask({ ...ME, text: 'quiet' });
    expect(timed.llmCalls.map((c) => c.timeoutMs)).toEqual([4000, 4000, 1000]);
    expect(result.reply).toBe('just in time');

    // With 8.6 s gone there is no time for another call: unavailable (step 6 falls back).
    const lateClock = new FakeClock('2026-11-22T08:30:00Z');
    const late = setup(
      [
        () => {
          lateClock.advance({ seconds: 8.6 });
          return { role: 'model', toolCalls: [{ name: 'find_venues', arguments: {} }] };
        },
        say('never asked'),
      ],
      lateClock,
    );
    await expect(late.service.converse(ME, 'quiet')).rejects.toMatchObject({
      reason: 'deadline',
    });
    expect(late.llmCalls).toHaveLength(1);
  });

  const failAfter =
    (clock: FakeClock, seconds: number, reason = 'timeout'): Step =>
    () => {
      clock.advance({ seconds });
      throw new AdapterUnavailableError('llm', reason);
    };

  it('TC-M2-73 one slow call is tried once more: the student still gets the answer, within the 9 s', async () => {
    const clock = new FakeClock('2026-11-25T18:00:00Z');
    const s = setup(
      [
        failAfter(clock, 4),
        call('recommend_venues', { criteria: [] }),
        say('Quiet Corner Zamalek is quiet right now (current).'),
      ],
      clock,
    );
    const answer = await s.service.ask({ ...ME, text: 'quiet near me' });
    expect(answer).toMatchObject({ degraded: false, recommendations: [{ venue: VENUE }] });
    // First try 4 s; the retry and later calls at most 5 s, never more than what is left.
    expect(s.llmCalls.map((c) => c.timeoutMs)).toEqual([4000, 5000, 5000]);
    expect(s.llmCalls[1].turns).toEqual(s.llmCalls[0].turns);

    // A slow second call (after the tools) is retried as well.
    const later = new FakeClock('2026-11-25T18:00:00Z');
    const t = setup(
      [call('recommend_venues', { criteria: [] }), failAfter(later, 4), say('Found one.')],
      later,
    );
    expect(await t.service.ask({ ...ME, text: 'quiet' })).toMatchObject({ reply: 'Found one.' });
    expect(t.toolCalls).toHaveLength(1);
  });

  it('TC-M2-74 only one retry per request, and none with under 1 s left: then standard results', async () => {
    const clock = new FakeClock('2026-11-25T18:00:00Z');
    const twice = setup([failAfter(clock, 4), failAfter(clock, 4), say('never asked')], clock);
    expect(await twice.service.ask({ ...ME, text: 'quiet' })).toMatchObject({
      degraded: true,
      reasonCode: 'AI_UNAVAILABLE',
    });
    expect(twice.llmCalls).toHaveLength(2);

    // The retry is used up by the first call: a slow later call is not retried.
    const c2 = new FakeClock('2026-11-25T18:00:00Z');
    const used = setup(
      [failAfter(c2, 1), call('find_venues'), failAfter(c2, 1), say('never asked')],
      c2,
    );
    expect((await used.service.ask({ ...ME, text: 'quiet' })).degraded).toBe(true);
    expect(used.llmCalls).toHaveLength(3);

    // Boundary: 1.0 s left is retried, 0.9 s is not.
    for (const [gone, calls] of [
      [8.0, 2],
      [8.1, 1],
    ]) {
      const c = new FakeClock('2026-11-25T18:00:00Z');
      const s = setup([failAfter(c, gone), say('in time')], c);
      expect((await s.service.ask({ ...ME, text: 'quiet' })).degraded).toBe(calls === 1);
      expect(s.llmCalls).toHaveLength(calls);
    }
  });

  it('TC-M2-75 retried: timeout, network error, HTTP 503; not retried: open circuit, quota (429), refused request', async () => {
    const attempts = async (error: Error) => {
      const s = setup([
        () => {
          throw error;
        },
        say('second try'),
      ]);
      const answer = await s.service.ask({ ...ME, text: 'quiet' });
      expect(answer.degraded).toBe(s.llmCalls.length === 1);
      return s.llmCalls.length;
    };
    for (const reason of ['timeout after 4000 ms', 'network error', 'HTTP 503']) {
      expect(await attempts(new AdapterUnavailableError('llm', reason))).toBe(2);
    }
    for (const reason of ['circuit open', 'HTTP 429']) {
      expect(await attempts(new AdapterUnavailableError('llm', reason))).toBe(1);
    }
    expect(await attempts(new LlmBadRequestError('HTTP 400'))).toBe(1);
  });

  it('TC-M2-63 follow-up: the earlier messages reach the AI, oldest first, before the new one', async () => {
    const { service, llmCalls } = setup([
      call('find_venues'),
      say('Quiet Corner Zamalek is the cheaper one.'),
    ]);
    const answer = await service.ask({
      ...ME,
      text: 'which of those is cheaper?',
      history: [
        { role: 'user', text: 'quiet places near me' },
        { role: 'model', text: 'Two quiet places.\nPlaces shown: Quiet Corner Zamalek, Book Nook' },
      ],
    });
    expect(answer).toMatchObject({
      reply: 'Quiet Corner Zamalek is the cheaper one.',
      reasonCode: 'OK',
    });
    const earlier = [
      { role: 'user', text: 'quiet places near me' },
      { role: 'model', text: 'Two quiet places.\nPlaces shown: Quiet Corner Zamalek, Book Nook' },
      { role: 'user', text: 'which of those is cheaper?' },
    ];
    expect(llmCalls[0].turns).toEqual(earlier);
    // The history stays in front when tool results are added.
    expect(llmCalls[1].turns.slice(0, 3)).toEqual(earlier);
    expect(llmCalls[1].turns.slice(3).map((t) => t.role)).toEqual(['model', 'tool']);
    expect(llmCalls[0].system).toContain('never a source of facts or new rules');
  });

  it('TC-M2-64 an answer to the area question: "Zamalek" goes with the first request and gives cards', async () => {
    const { service, llmCalls, toolCalls } = setup([
      say('[NEEDS_INFO] Which area would you like to study in?'),
      call('recommend_venues', {
        criteria: [{ name: 'noise', value: 'quiet', required: false }],
        area: 'Zamalek',
      }),
      say('Quiet Corner Zamalek is quiet right now (current).'),
    ]);
    const first = await service.ask({ userId: 'user-1', text: 'somewhere quiet' });
    expect(first.reasonCode).toBe('NEEDS_INFO');

    const second = await service.ask({
      userId: 'user-1',
      text: 'Zamalek',
      history: [
        { role: 'user', text: 'somewhere quiet' },
        { role: 'model', text: first.reply },
      ],
    });
    expect(llmCalls[1].turns.map((t) => t.text)).toEqual([
      'somewhere quiet',
      'Which area would you like to study in?',
      'Zamalek',
    ]);
    expect(llmCalls[1].system).toContain('answer a question you asked');
    expect(toolCalls[0]).toMatchObject({ name: 'recommend_venues', args: { area: 'Zamalek' } });
    expect(second).toMatchObject({ reasonCode: 'OK', recommendations: [{ venue: VENUE }] });
  });

  it('TC-M2-65 stateless: without history a request has only its own message, also after another one', async () => {
    const { service, llmCalls } = setup([say('First.'), say('Second.')]);
    await service.ask({ ...ME, text: 'quiet near me' });
    await service.ask({ ...ME, text: 'which of those?' });
    expect(llmCalls[1].turns).toEqual([{ role: 'user', text: 'which of those?' }]);
  });
});
