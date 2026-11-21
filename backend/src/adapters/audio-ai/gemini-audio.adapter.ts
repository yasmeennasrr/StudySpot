import { Logger } from '@nestjs/common';
import { AdapterUnavailableError } from '../../common/errors/app-error';
import type { IAudioAI, Level } from '../../contracts';

export interface GeminiAudioOptions {
  /** Model name; models change, so it is a setting (GEMINI_AUDIO_MODEL). */
  model?: string;
  /** Injected in tests; defaults to Node's global fetch. */
  fetchFn?: typeof fetch;
}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const WORDS: Record<string, Level | 'inconclusive'> = {
  quiet: 1,
  moderate: 2,
  noisy: 3,
  inconclusive: 'inconclusive',
};

/** AI-025: noise level only, never crowd, speech content or people. */
export const NOISE_PROMPT = [
  'You classify the background noise level of a place where students want to study.',
  'Listen to this short recording and answer with exactly one word:',
  '"quiet" (silent or soft background, easy to concentrate),',
  '"moderate" (steady chatter or music, possible to concentrate),',
  '"noisy" (loud talking, loud music or machines, hard to concentrate),',
  'or "inconclusive" if the recording is silent because the microphone failed, too short or unusable.',
  'Judge loudness only. Do not describe, transcribe or count people.',
].join(' ');

/**
 * Gemini audio classifier (PB-19, AI-023, AI-025, SDS 5.1). Owner: M1.
 *
 * - The snippet is sent inline over HTTPS and never written anywhere (PRIV-001).
 * - Answers quiet / moderate / noisy, or 'inconclusive' (not counted as a failure).
 * - Timeout, network error, HTTP 429/5xx, or an answer that is not one of the four
 *   words -> AdapterUnavailableError, which the circuit breaker counts.
 * - HTTP 400 (our request was bad) -> 'inconclusive', not counted (SDS Table 3).
 * - The API key goes in a header, never in the URL, so it is never logged.
 */
export class GeminiAudioAdapter implements IAudioAI {
  private readonly logger = new Logger('AudioAiAdapter');
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly apiKey: string,
    options: GeminiAudioOptions = {},
  ) {
    this.model = options.model || 'gemini-3.8-flash';
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
  }

  async classifyNoise(
    audio: Buffer,
    mimeType: string,
    timeoutMs: number,
  ): Promise<Level | 'inconclusive'> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: NOISE_PROMPT },
                { inlineData: { mimeType, data: audio.toString('base64') } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 10,
            responseMimeType: 'text/x.enum',
            responseSchema: { type: 'STRING', enum: Object.keys(WORDS) },
          },
        }),
      });
    } catch {
      const reason = controller.signal.aborted ? `timeout after ${timeoutMs} ms` : 'network error';
      this.logger.warn({ reason }, 'Gemini audio call failed');
      throw new AdapterUnavailableError('audio-ai', reason);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 400) {
      this.logger.warn({ httpStatus: 400 }, 'Gemini refused the snippet as bad input');
      return 'inconclusive';
    }
    if (!res.ok) {
      this.logger.warn({ httpStatus: res.status }, 'Gemini audio HTTP error');
      throw new AdapterUnavailableError('audio-ai', `HTTP ${res.status}`);
    }
    let body: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new AdapterUnavailableError('audio-ai', 'invalid JSON');
    }
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(' ');
    return parseNoiseWord(text);
  }
}

/** Reads the single word Gemini answered. Anything else is an invalid output. */
export function parseNoiseWord(text: string): Level | 'inconclusive' {
  const word = text
    .trim()
    .toLowerCase()
    .replace(/^["'`\s]+|["'`.\s]+$/g, '');
  const result = WORDS[word];
  if (result === undefined) {
    throw new AdapterUnavailableError('audio-ai', 'invalid output');
  }
  return result;
}
