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
 * TC-M2-41..TC-M2-46: the StudyMatch orchestrator (PB-29, SDS 7.2, UC-05).
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

  it('TC-M2-46 limits: at most 4 tool rounds; 9 s deadline; each call gets what is left (at most 5 s)', async () => {
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
    expect(timed.llmCalls.map((c) => c.timeoutMs)).toEqual([5000, 5000, 1000]);
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
});
