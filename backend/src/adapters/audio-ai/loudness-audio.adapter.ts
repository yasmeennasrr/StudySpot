import type { IAudioAI, Level } from '../../contracts';

/**
 * Offline noise classifier for development and demos without a Gemini key
 * (PB-19). Measures the loudness (RMS in dBFS) of 16-bit PCM WAV audio, the format
 * the app sends. Phone microphones are not calibrated, so the thresholds are rough;
 * production uses Gemini (AI-023). Like every adapter, it keeps nothing.
 */
export class LoudnessAudioAdapter implements IAudioAI {
  constructor(
    /** Below this many dBFS: quiet. */
    private readonly quietBelow = -42,
    /** Below this (and not quiet): moderate. Louder: noisy. */
    private readonly moderateBelow = -28,
  ) {}

  async classifyNoise(audio: Buffer, mimeType: string): Promise<Level | 'inconclusive'> {
    if (!/wav/i.test(mimeType)) return 'inconclusive';
    const db = wavLoudnessDbfs(audio);
    if (db === null) return 'inconclusive';
    if (db < this.quietBelow) return 1;
    if (db < this.moderateBelow) return 2;
    return 3;
  }
}

/** RMS loudness of a 16-bit PCM WAV file in dBFS, or null if it is not one or is too short. */
export function wavLoudnessDbfs(wav: Buffer): number | null {
  if (
    wav.length < 44 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return null;
  }
  // Walk the chunks to find "fmt " and "data".
  let offset = 12;
  let bitsPerSample = 0;
  let format = 0;
  let dataStart = -1;
  let dataLength = 0;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      format = wav.readUInt16LE(offset + 8);
      bitsPerSample = wav.readUInt16LE(offset + 22);
    } else if (id === 'data') {
      dataStart = offset + 8;
      dataLength = Math.min(size, wav.length - dataStart);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (format !== 1 || bitsPerSample !== 16 || dataStart < 0) return null;
  const samples = Math.floor(dataLength / 2);
  if (samples < 1600) return null; // under 0.1 s at 16 kHz: unusable
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const s = wav.readInt16LE(dataStart + i * 2) / 32768;
    sum += s * s;
  }
  const rms = Math.sqrt(sum / samples);
  return rms === 0 ? -120 : 20 * Math.log10(rms);
}
