import { Logger } from '@nestjs/common';
import { AdapterUnavailableError } from '../../common/errors/app-error';
import type { ILLM, LlmToolCall, LlmTurn } from '../../contracts';

export interface GeminiLlmOptions {
  /** Model name; models change, so it is a setting (GEMINI_LLM_MODEL). */
  model?: string;
  /** Injected in tests; defaults to Node's global fetch. */
  fetchFn?: typeof fetch;
}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_LLM_MODEL = 'gemini-3.8-flash';

/**
 * Gemini rejected our request as malformed (HTTP 400). Our bug, not an outage:
 * the circuit breaker does not count it (SDS Table 3), but StudyMatch still falls
 * back to standard results.
 */
export class LlmBadRequestError extends Error {
  constructor(detail: string) {
    super(`LLM refused the request: ${detail}`);
    this.name = 'LlmBadRequestError';
  }
}

/** Gemini's wire format (generateContent, v1beta), only the parts we use. */
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}

/** Our turns -> Gemini contents. Tool results go back as functionResponse parts. */
export function toGeminiContents(turns: LlmTurn[]): GeminiContent[] {
  return turns.map((turn): GeminiContent => {
    if (turn.role === 'tool') {
      if (!turn.toolResult) throw new LlmBadRequestError('tool turn without a result');
      const { name, result } = turn.toolResult;
      // Gemini wants an object here; wrap arrays and plain values.
      const response =
        result && typeof result === 'object' && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : { result };
      return { role: 'user', parts: [{ functionResponse: { name, response } }] };
    }
    const parts: GeminiPart[] = [];
    if (turn.text) parts.push({ text: turn.text });
    for (const call of turn.toolCalls ?? []) {
      parts.push({ functionCall: { name: call.name, args: call.arguments } });
    }
    return { role: turn.role, parts };
  });
}

/** Gemini's answer -> one model turn with text and/or tool calls. */
export function fromGeminiResponse(body: GeminiResponse): LlmTurn {
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  const toolCalls: LlmToolCall[] = parts
    .filter((p) => p.functionCall?.name)
    .map((p) => ({ name: p.functionCall!.name, arguments: p.functionCall!.args ?? {} }));
  if (!text && toolCalls.length === 0) {
    const reason =
      body.promptFeedback?.blockReason ?? body.candidates?.[0]?.finishReason ?? 'empty answer';
    throw new AdapterUnavailableError('llm', `no usable answer (${reason})`);
  }
  return {
    role: 'model',
    ...(text ? { text } : {}),
    ...(toolCalls.length ? { toolCalls } : {}),
  };
}

/**
 * Gemini with function calling (PB-29, SDS 5.1, 6.6.8). Owner: M2. Provides ILLM.
 *
 * - The model never reads our database: it asks for one of the read-only tools
 *   (a functionCall), StudyMatch runs it, and the result goes back as a
 *   functionResponse. This adapter only translates both ways.
 * - Timeout, network error, HTTP 429/5xx, or an answer with nothing usable ->
 *   AdapterUnavailableError, which the circuit breaker counts (PB-46) and which
 *   makes StudyMatch fall back to standard results (AI-029).
 * - HTTP 400 (our request was bad) -> LlmBadRequestError, not counted.
 * - The API key goes in a header, never in the URL, so it is never logged.
 */
export class GeminiLlmAdapter implements ILLM {
  private readonly logger = new Logger('LlmAdapter');
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly apiKey: string,
    options: GeminiLlmOptions = {},
  ) {
    this.model = options.model || DEFAULT_LLM_MODEL;
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
  }

  async generate(input: {
    system: string;
    turns: LlmTurn[];
    tools: { name: string; description: string; parameters: object }[];
    timeoutMs: number;
  }): Promise<LlmTurn> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: toGeminiContents(input.turns),
          ...(input.tools.length ? { tools: [{ functionDeclarations: input.tools }] } : {}),
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
        }),
      });
    } catch {
      const reason = controller.signal.aborted
        ? `timeout after ${input.timeoutMs} ms`
        : 'network error';
      this.logger.warn({ reason }, 'Gemini LLM call failed');
      throw new AdapterUnavailableError('llm', reason);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 400) {
      this.logger.warn({ httpStatus: 400 }, 'Gemini refused the LLM request as bad input');
      throw new LlmBadRequestError('HTTP 400');
    }
    if (!res.ok) {
      this.logger.warn({ httpStatus: res.status }, 'Gemini LLM HTTP error');
      throw new AdapterUnavailableError('llm', `HTTP ${res.status}`);
    }
    let body: GeminiResponse;
    try {
      body = (await res.json()) as GeminiResponse;
    } catch {
      throw new AdapterUnavailableError('llm', 'invalid JSON');
    }
    return fromGeminiResponse(body);
  }
}
