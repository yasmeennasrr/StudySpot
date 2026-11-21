import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/audio/wav.dart';

void main() {
  test('TC-M1-85 a WAV header around 16-bit PCM, built in memory (PB-19)', () {
    final pcm = Uint8List.fromList(List.generate(3200, (i) => i % 256)); // 0.1 s at 16 kHz
    final wav = buildWav(pcm, sampleRate: 16000);
    final b = ByteData.sublistView(wav);
    expect(String.fromCharCodes(wav.sublist(0, 4)), 'RIFF');
    expect(b.getUint32(4, Endian.little), 36 + 3200);
    expect(String.fromCharCodes(wav.sublist(8, 16)), 'WAVEfmt ');
    expect(b.getUint16(20, Endian.little), 1); // PCM
    expect(b.getUint16(22, Endian.little), 1); // mono
    expect(b.getUint32(24, Endian.little), 16000);
    expect(b.getUint32(28, Endian.little), 32000); // bytes per second
    expect(b.getUint16(34, Endian.little), 16);
    expect(String.fromCharCodes(wav.sublist(36, 40)), 'data');
    expect(b.getUint32(40, Endian.little), 3200);
    expect(wav.sublist(44), pcm);
  });

  test('TC-M1-85 the web sample rate is worked out from bytes per second and snapped to a standard rate', () {
    const seven = Duration(seconds: 7);
    expect(estimateSampleRate(7 * 48000 * 2, seven), 48000);
    expect(estimateSampleRate(7 * 44100 * 2, seven), 44100);
    expect(estimateSampleRate(7 * 16000 * 2, const Duration(milliseconds: 7150)), 16000);
    expect(estimateSampleRate(0, seven), 16000);
  });
}
