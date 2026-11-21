/** Test helper shared by unit and integration tests (PB-19). */
/** 16-bit mono PCM WAV of a sine wave with the given peak (0..1). */
export function makeWav(peak: number, seconds = 1, rate = 16000): Buffer {
  const samples = Math.round(seconds * rate);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write('WAVEfmt ', 8, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    wav.writeInt16LE(
      Math.round(peak * 32767 * Math.sin((2 * Math.PI * 440 * i) / rate)),
      44 + i * 2,
    );
  }
  return wav;
}
