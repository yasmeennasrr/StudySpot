import { AdapterUnavailableError } from '../../src/common/errors/app-error';
import {
  fromGeminiResponse,
  GeminiLlmAdapter,
  LlmBadRequestError,
  toGeminiContents,
} from '../../src/adapters/llm/gemini-llm.adapter';
import type { LlmTurn } from '../../src/contracts';

/**
 * TC-M2-26..TC-M2-28 and TC-M2-54: the Gemini LLM adapter (PB-29, PB-46, SDS 5.1, 6.6.8).
 * fetch is faked, so no test ever calls Google.
 */
const KEY = 'test-key-not-real';
const TOOLS = [
  {
    name: 'find_venues',
    description: 'Search venues',
    parameters: { type: 'object', properties: { area: { type: 'string' } } },
  },
];

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function adapterWith(answer: () => Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer();
  }) as unknown as typeof fetch;
  return { adapter: new GeminiLlmAdapter(KEY, { model: 'test-model', fetchFn }), calls };
}

const input = (turns: LlmTurn[], timeoutMs = 5000) => ({
  system: 'You are StudyMatch.',
  turns,
  tools: TOOLS,
  timeoutMs,
});

describe('GeminiLlmAdapter (PB-29)', () => {
  it('TC-M2-26 sends system prompt, turns, tool results and tools in Gemini format; key only in a header', async () => {
    const { adapter, calls } = adapterWith(async () =>
      reply(200, { candidates: [{ content: { parts: [{ text: 'Try Quiet Corner.' }] } }] }),
    );
    const turns: LlmTurn[] = [
      { role: 'user', text: 'quiet place in Zamalek' },
      { role: 'model', toolCalls: [{ name: 'find_venues', arguments: { area: 'Zamalek' } }] },
      { role: 'tool', toolResult: { name: 'find_venues', result: [{ name: 'Quiet Corner' }] } },
    ];

    const answer = await adapter.generate(input(turns));

    expect(answer).toEqual({ role: 'model', text: 'Try Quiet Corner.' });
    const { url, init } = calls[0];
    expect(url).toContain('/models/test-model:generateContent');
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are StudyMatch.' }] });
    expect(body.tools).toEqual([{ functionDeclarations: TOOLS }]);
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'quiet place in Zamalek' }] },
      {
        role: 'model',
        parts: [{ functionCall: { name: 'find_venues', args: { area: 'Zamalek' } } }],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'find_venues',
              response: { result: [{ name: 'Quiet Corner' }] },
            },
          },
        ],
      },
    ]);
  });

  it('TC-M2-27 a functionCall answer becomes tool calls; text and calls can come together', async () => {
    const { adapter } = adapterWith(async () =>
      reply(200, {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Let me look.' },
                { functionCall: { name: 'find_venues', args: { area: 'Maadi' } } },
                { functionCall: { name: 'get_my_preferences' } },
              ],
            },
          },
        ],
      }),
    );
    const answer = await adapter.generate(input([{ role: 'user', text: 'hi' }]));
    expect(answer).toEqual({
      role: 'model',
      text: 'Let me look.',
      toolCalls: [
        { name: 'find_venues', arguments: { area: 'Maadi' } },
        { name: 'get_my_preferences', arguments: {} },
      ],
    });
  });

  it('TC-M2-28 outages become AdapterUnavailableError (timeout, network, 429, 503, empty, bad JSON); 400 does not', async () => {
    const failureOf = async (answer: () => Promise<Response>, timeoutMs = 5000) => {
      const { adapter } = adapterWith(answer);
      return adapter.generate(input([{ role: 'user', text: 'hi' }], timeoutMs)).then(
        () => 'OK',
        (e: unknown) =>
          e instanceof AdapterUnavailableError
            ? `unavailable: ${e.reason}`
            : e instanceof LlmBadRequestError
              ? 'bad request'
              : String(e),
      );
    };
    // Never answers: aborted by the timeout.
    const hang = () =>
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('aborted')), 200));
    expect(await failureOf(hang, 50)).toBe('unavailable: timeout after 50 ms');
    expect(
      await failureOf(async () => {
        throw new TypeError('fetch failed');
      }),
    ).toBe('unavailable: network error');
    expect(await failureOf(async () => reply(429, {}))).toBe('unavailable: HTTP 429');
    expect(await failureOf(async () => reply(503, {}))).toBe('unavailable: HTTP 503');
    expect(
      await failureOf(async () =>
        reply(200, { candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] }),
      ),
    ).toBe('unavailable: no usable answer (SAFETY)');
    expect(await failureOf(async () => new Response('not json', { status: 200 }))).toBe(
      'unavailable: invalid JSON',
    );
    expect(await failureOf(async () => reply(400, {}))).toBe('bad request');
  });

  it('TC-M2-54 Gemini 3 thought signatures come back unchanged with the tool call (else Gemini answers 400)', () => {
    const turn = fromGeminiResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: { name: 'get_my_preferences', args: {} },
                thoughtSignature: 'sig-abc',
              },
            ],
          },
        },
      ],
    });
    expect(turn.toolCalls).toEqual([
      { name: 'get_my_preferences', arguments: {}, signature: 'sig-abc' },
    ]);
    expect(toGeminiContents([turn])).toEqual([
      {
        role: 'model',
        parts: [
          { functionCall: { name: 'get_my_preferences', args: {} }, thoughtSignature: 'sig-abc' },
        ],
      },
    ]);
    // A call without a signature (older models) is sent without one.
    expect(
      toGeminiContents([{ role: 'model', toolCalls: [{ name: 'x', arguments: {} }] }])[0].parts,
    ).toEqual([{ functionCall: { name: 'x', args: {} } }]);
  });
});
