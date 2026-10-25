/**
 * Adapter contracts (SDS 6.4, Adapter pattern). Only adapters talk to outside
 * services, and every failure surfaces as AdapterUnavailableError. Each adapter
 * has a Fake used in tests and when its API key is empty.
 */
import type { GeoPoint, Level } from './domain.types';

export const MAPS = Symbol('IMaps');
export interface GeocodeResult {
  point: GeoPoint;
  formattedAddress: string;
}
/** Owner: M3 (GoogleGeocodingAdapter). EIR-003, FR-011. */
export interface IMaps {
  /** Null when the area is not found; throws AdapterUnavailableError when the service fails. */
  geocode(area: string): Promise<GeocodeResult | null>;
}

export const EMAIL = Symbol('IEmail');
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
/** SendGrid in Sprint 3. No retry of its own; the Scheduler retries (SDS 6.6.9). */
export interface IEmail {
  send(message: EmailMessage): Promise<void>;
}

export const PUSH = Symbol('IPush');
/** Firebase Cloud Messaging in Sprint 3 (EIR-007). */
export interface IPush {
  send(
    deviceToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void>;
}

export const LLM = Symbol('ILLM');
export interface LlmToolCall {
  name: string;
  arguments: Record<string, unknown>;
}
export interface LlmTurn {
  role: 'user' | 'model' | 'tool';
  text?: string;
  toolCalls?: LlmToolCall[];
  toolResult?: { name: string; result: unknown };
}
/** Gemini behind a circuit-breaker decorator in Sprint 3 (SDS 5.1). */
export interface ILLM {
  generate(input: {
    system: string;
    turns: LlmTurn[];
    tools: { name: string; description: string; parameters: object }[];
    timeoutMs: number;
  }): Promise<LlmTurn>;
}

export const AUDIO_AI = Symbol('IAudioAI');
/** Gemini audio input behind its own circuit breaker in Sprint 3. Never stores audio (PRIV-001). */
export interface IAudioAI {
  classifyNoise(
    audio: Buffer,
    mimeType: string,
    timeoutMs: number,
  ): Promise<Level | 'inconclusive'>;
}
