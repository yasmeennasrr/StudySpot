import 'dart:typed_data';

/// Wraps raw 16-bit little-endian PCM in a WAV header, in memory (PB-19).
/// Nothing is written to a file (PRIV-001).
Uint8List buildWav(Uint8List pcm, {required int sampleRate, int channels = 1}) {
  const bitsPerSample = 16;
  final byteRate = sampleRate * channels * bitsPerSample ~/ 8;
  final blockAlign = channels * bitsPerSample ~/ 8;
  final header = ByteData(44);
  void ascii(int offset, String s) {
    for (var i = 0; i < s.length; i++) {
      header.setUint8(offset + i, s.codeUnitAt(i));
    }
  }

  ascii(0, 'RIFF');
  header.setUint32(4, 36 + pcm.length, Endian.little);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  header.setUint32(16, 16, Endian.little); // fmt chunk size
  header.setUint16(20, 1, Endian.little); // PCM
  header.setUint16(22, channels, Endian.little);
  header.setUint32(24, sampleRate, Endian.little);
  header.setUint32(28, byteRate, Endian.little);
  header.setUint16(32, blockAlign, Endian.little);
  header.setUint16(34, bitsPerSample, Endian.little);
  ascii(36, 'data');
  header.setUint32(40, pcm.length, Endian.little);

  final out = Uint8List(44 + pcm.length);
  out.setRange(0, 44, header.buffer.asUint8List());
  out.setRange(44, out.length, pcm);
  return out;
}

const _standardRates = [8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000];

/// The sample rate that fits [bytes] of 16-bit PCM recorded over [elapsed].
///
/// On the web the browser, not the app, picks the microphone's sample rate, so
/// the app works it out from how much audio arrived in the recording time and
/// snaps it to the nearest standard rate.
int estimateSampleRate(int bytes, Duration elapsed, {int channels = 1}) {
  final seconds = elapsed.inMicroseconds / Duration.microsecondsPerSecond;
  if (seconds <= 0 || bytes <= 0) return 16000;
  final measured = bytes / (2 * channels * seconds);
  var best = _standardRates.first;
  for (final rate in _standardRates) {
    if ((rate - measured).abs() < (best - measured).abs()) best = rate;
  }
  return best;
}
