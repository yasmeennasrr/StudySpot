import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Repository } from 'typeorm';
import {
  GeminiAudioAdapter,
  parseNoiseWord,
} from '../../src/adapters/audio-ai/gemini-audio.adapter';
import {
  LoudnessAudioAdapter,
  wavLoudnessDbfs,
} from '../../src/adapters/audio-ai/loudness-audio.adapter';
import { CircuitBreaker } from '../../src/adapters/resilience/circuit-breaker';
import { AdapterUnavailableError, AppError } from '../../src/common/errors/app-error';
import { DomainEvent } from '../../src/common/events/domain-events';
import type { IAudioAI } from '../../src/contracts';
import type { DynamicRecordEntity } from '../../src/db/entities';
import { AudioAnalysisService } from '../../src/modules/audio/audio-analysis.service';
import { distanceMeters } from '../../src/modules/audio/noise-samples.controller';
import { FakeClock } from '../../src/modules/clock/fake-clock';
import { makeWav } from '../helpers/wav';

/**
 * TC-M1-76..TC-M1-80: AI noise sampling without a network or database (PB-19,
 * AI-023, AI-026, EIR-015, PRIV-001). The HTTP side is in test/int/noise-samples.int-spec.ts.
 */

const down = () => Promise.reject(new AdapterUnavailableError('audio-ai', 'down'));

describe('Circuit breaker (EIR-015, SDS Figure 3)', () => {
  it('TC-M1-76 opens after 5 failures in a row, fails fast for 30 s, then one trial decides', async () => {
    const clock = new FakeClock('2026-11-21T10:00:00Z');
    const changes: string[] = [];
    const breaker = new CircuitBreaker({ name: 'audio-ai' }, clock, {
      emit: (name: string, e: { from: string; to: string }) => {
        if (name === DomainEvent.AiBreakerChanged) changes.push(`${e.from}->${e.to}`);
        return true;
      },
    });
    const call = jest.fn(down);

    for (let i = 0; i < 4; i++) await expect(breaker.execute(call)).rejects.toThrow('down');
    expect(breaker.currentState).toBe('closed'); // 4 failures: still closed
    await expect(breaker.execute(call)).rejects.toThrow('down');
    expect(breaker.currentState).toBe('open'); // 5th failure opens it
    expect(call).toHaveBeenCalledTimes(5);

    await expect(breaker.execute(call)).rejects.toThrow('circuit open');
    clock.advance({ seconds: 29 });
    await expect(breaker.execute(call)).rejects.toThrow('circuit open');
    expect(call).toHaveBeenCalledTimes(5); // no calls while open

    clock.advance({ seconds: 1 }); // 30 s: one trial call, it fails -> open again
    await expect(breaker.execute(call)).rejects.toThrow('down');
    expect(breaker.currentState).toBe('open');

    clock.advance({ seconds: 30 }); // next trial succeeds -> closed
    await expect(breaker.execute(() => Promise.resolve(2))).resolves.toBe(2);
    expect(breaker.currentState).toBe('closed');
    expect(changes).toEqual([
      'closed->open',
      'open->half_open',
      'half_open->open',
      'open->half_open',
      'half_open->closed',
    ]);
  });

  it('TC-M1-76 a success resets the count, and errors that are not adapter failures are not counted', async () => {
    const breaker = new CircuitBreaker({ name: 'audio-ai' }, new FakeClock());
    for (let i = 0; i < 4; i++) await expect(breaker.execute(down)).rejects.toThrow();
    await breaker.execute(() => Promise.resolve(1));
    for (let i = 0; i < 4; i++) await expect(breaker.execute(down)).rejects.toThrow();
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new TypeError('our bug')))).rejects.toThrow(
        TypeError,
      );
    }
    expect(breaker.currentState).toBe('closed');
  });
});

describe('Gemini audio adapter (AI-023, SDS Table 3)', () => {
  function answering(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return {
      calls,
      adapter: new GeminiAudioAdapter('secret-key', { model: 'test-model', fetchFn }),
    };
  }
  const reply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

  it('TC-M1-77 sends the snippet inline with the key in a header, and maps the answer to a level', async () => {
    const { calls, adapter } = answering(200, reply('quiet'));
    const audio = Buffer.from('RIFF....WAVE');
    expect(await adapter.classifyNoise(audio, 'audio/wav', 8000)).toBe(1);
    expect(calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent',
    );
    expect(calls[0].url).not.toContain('secret-key');
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.contents[0].parts[1]).toEqual({
      inlineData: { mimeType: 'audio/wav', data: audio.toString('base64') },
    });
    expect(parseNoiseWord('"Noisy"\n')).toBe(3);
    expect(parseNoiseWord(' moderate.')).toBe(2);
    expect(parseNoiseWord('inconclusive')).toBe('inconclusive');
  });

  it.each([
    ['HTTP 400 (our bad input): inconclusive, not a failure', 400, reply('x'), 'inconclusive'],
    ['HTTP 429: failure', 429, {}, 'fail'],
    ['HTTP 503: failure', 503, {}, 'fail'],
    ['an answer that is not one of the four words: failure', 200, reply('very loud'), 'fail'],
    ['invalid JSON: failure', 200, 'not json', 'fail'],
  ])('TC-M1-77 %s', async (_name, status, body, expected) => {
    const { adapter } = answering(status, body);
    const result = adapter.classifyNoise(Buffer.from('x'), 'audio/wav', 8000);
    if (expected === 'fail') await expect(result).rejects.toBeInstanceOf(AdapterUnavailableError);
    else await expect(result).resolves.toBe(expected);
  });

  it('TC-M1-77 gives up after the time limit (8 s in production)', async () => {
    const fetchFn = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    const adapter = new GeminiAudioAdapter('k', { fetchFn });
    await expect(adapter.classifyNoise(Buffer.from('x'), 'audio/wav', 30)).rejects.toMatchObject({
      reason: 'timeout after 30 ms',
    });
  });
});

describe('Offline loudness classifier (development without a key)', () => {
  it('TC-M1-78 silence is quiet, a medium tone moderate, a loud tone noisy; other input is inconclusive', async () => {
    const loud = new LoudnessAudioAdapter();
    expect(wavLoudnessDbfs(makeWav(0))).toBe(-120);
    expect(Math.round(wavLoudnessDbfs(makeWav(1)) ?? 0)).toBe(-3); // full-scale sine: -3 dBFS
    expect(await loud.classifyNoise(makeWav(0.005), 'audio/wav')).toBe(1); // about -49 dBFS
    expect(await loud.classifyNoise(makeWav(0.05), 'audio/wav')).toBe(2); // about -29 dBFS
    expect(await loud.classifyNoise(makeWav(0.5), 'audio/wav')).toBe(3); // about -9 dBFS
    expect(await loud.classifyNoise(makeWav(0.5), 'audio/webm')).toBe('inconclusive');
    expect(await loud.classifyNoise(makeWav(0.5, 0.05), 'audio/wav')).toBe('inconclusive'); // too short
    expect(
      await loud.classifyNoise(Buffer.from('not a wav file at all, just text'), 'audio/wav'),
    ).toBe('inconclusive');
  });
});

describe('Audio Analysis (AI-023, AI-026, PRIV-001, SEN-007)', () => {
  function setup(answer: () => Promise<1 | 2 | 3 | 'inconclusive'>) {
    const inserted: Record<string, unknown>[] = [];
    const records = {
      insert: async (row: Record<string, unknown>) => inserted.push(row),
    } as unknown as Repository<DynamicRecordEntity>;
    const emitted: unknown[] = [];
    const events = {
      emit: (_n: string, e: unknown) => emitted.push(e),
    } as unknown as EventEmitter2;
    const audioAi: IAudioAI = { classifyNoise: jest.fn(answer) };
    const clock = new FakeClock('2026-11-21T10:00:00Z');
    return {
      service: new AudioAnalysisService(audioAi, records, events, clock),
      inserted,
      emitted,
      audioAi,
    };
  }
  const input = () => ({
    userId: 'u1',
    venueId: 'v1',
    audio: makeWav(0.3, 0.2),
    mimeType: 'audio/wav',
  });

  it('TC-M1-79 a level is stored with venue, level, time and source only, then the snippet is wiped', async () => {
    const { service, inserted, emitted, audioAi } = setup(async () => 3);
    const snippet = input();
    expect(await service.analyzeSnippet(snippet)).toEqual({ status: 'recorded', level: 3 });
    expect(audioAi.classifyNoise).toHaveBeenCalledWith(expect.any(Buffer), 'audio/wav', 8000);
    expect(inserted).toEqual([
      {
        venueId: 'v1',
        conditionType: 'noise',
        value: 3,
        sourceType: 'audio_analysis',
        recordedAt: new Date('2026-11-21T10:00:00Z'),
        surveyId: null,
      },
    ]);
    expect(JSON.stringify(inserted)).not.toContain('u1');
    expect(emitted).toEqual([
      { venueId: 'v1', level: 3, recordedAt: new Date('2026-11-21T10:00:00Z') },
    ]);
    expect(snippet.audio.every((b) => b === 0)).toBe(true);
  });

  it.each([
    ['inconclusive', () => Promise.resolve('inconclusive' as const)],
    ['AI unavailable', () => Promise.reject(new AdapterUnavailableError('audio-ai', 'timeout'))],
  ])(
    'TC-M1-79 %s: no record, "unavailable", snippet wiped, no retry (AI-026)',
    async (_n, answer) => {
      const { service, inserted, emitted, audioAi } = setup(answer);
      const snippet = input();
      expect(await service.analyzeSnippet(snippet)).toEqual({ status: 'unavailable', level: null });
      expect(inserted).toEqual([]);
      expect(emitted).toEqual([]);
      expect(audioAi.classifyNoise).toHaveBeenCalledTimes(1);
      expect(snippet.audio.every((b) => b === 0)).toBe(true);
    },
  );

  it('TC-M1-79 an unexpected error still wipes the snippet', async () => {
    const { service } = setup(() => Promise.reject(AppError.invalidInput('x')));
    const snippet = input();
    await expect(service.analyzeSnippet(snippet)).rejects.toBeInstanceOf(AppError);
    expect(snippet.audio.every((b) => b === 0)).toBe(true);
  });
});

describe('At the venue (SEN-009, FR-040)', () => {
  it('TC-M1-80 distance boundary around the 50 m radius', () => {
    const venue = { lat: 30.0626, lng: 31.2197 };
    // 1 degree of latitude is about 111,195 m.
    const north = (m: number) => ({ lat: venue.lat + m / 111_195, lng: venue.lng });
    expect(distanceMeters(venue, north(49.9))).toBeLessThanOrEqual(50);
    expect(distanceMeters(venue, north(50.1))).toBeGreaterThan(50);
    expect(Math.round(distanceMeters(venue, north(200)))).toBe(200);
  });
});
