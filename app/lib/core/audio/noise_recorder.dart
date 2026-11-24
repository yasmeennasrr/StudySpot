import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:record/record.dart';

import 'wav.dart';

/// Records a short noise snippet for PB-19, in memory only (PRIV-001, SEN-005).
///
/// Behind an interface so the screen can be tested without a microphone.
abstract class NoiseRecorder {
  /// Asks the operating system (or browser) for the microphone. True when granted.
  /// Called only after the student taps "Record" (SEN-004, SEN-006).
  Future<bool> requestPermission();

  /// Records for [length] and returns a WAV file as bytes, or null if cancelled.
  /// [onTick] gets the whole seconds left, starting with [length].
  Future<Uint8List?> record(
    Duration length, {
    void Function(int secondsLeft)? onTick,
    Future<void>? cancelled,
  });
}

/// The real recorder, using the `record` package's PCM stream: the audio stays in
/// a list in memory and never becomes a file on the phone.
class RecordNoiseRecorder implements NoiseRecorder {
  static const _sampleRate = 16000;

  AudioRecorder? _recorder;
  AudioRecorder get _audio => _recorder ??= AudioRecorder();

  @override
  Future<bool> requestPermission() => _audio.hasPermission();

  @override
  Future<Uint8List?> record(
    Duration length, {
    void Function(int secondsLeft)? onTick,
    Future<void>? cancelled,
  }) async {
    final pcm = BytesBuilder(copy: false);
    final stream = await _audio.startStream(const RecordConfig(
      encoder: AudioEncoder.pcm16bits,
      sampleRate: _sampleRate,
      numChannels: 1,
    ));
    final watch = Stopwatch()..start();
    final sub = stream.listen(pcm.add);
    var stopped = false;
    final done = Completer<bool>(); // true: finished; false: cancelled
    final seconds = length.inSeconds;
    onTick?.call(seconds);
    final ticker = Timer.periodic(const Duration(seconds: 1), (t) {
      final left = seconds - t.tick;
      if (left > 0) onTick?.call(left);
    });
    final timer = Timer(length, () {
      if (!done.isCompleted) done.complete(true);
    });
    unawaited(cancelled?.then((_) {
      if (!done.isCompleted) done.complete(false);
    }));

    final finished = await done.future;
    timer.cancel();
    ticker.cancel();
    if (!stopped) {
      stopped = true;
      await _audio.stop();
    }
    watch.stop();
    await sub.cancel();
    final raw = pcm.takeBytes();
    if (!finished) {
      raw.fillRange(0, raw.length, 0);
      return null;
    }
    final rate = kIsWeb
        ? estimateSampleRate(raw.length, watch.elapsed)
        : _sampleRate;
    final wav = buildWav(raw, sampleRate: rate);
    raw.fillRange(0, raw.length, 0);
    return wav;
  }
}

/// For tests: no microphone. Set [permission] and [result].
class FakeNoiseRecorder implements NoiseRecorder {
  FakeNoiseRecorder({this.permission = true, Uint8List? result})
      : result = result ?? Uint8List.fromList(List.filled(64, 1));

  bool permission;
  Uint8List result;
  int permissionRequests = 0;
  int recordings = 0;

  /// While not null, [record] waits for it, so a test can look at the
  /// "recording" state and cancel.
  Completer<void>? hold;

  @override
  Future<bool> requestPermission() async {
    permissionRequests++;
    return permission;
  }

  @override
  Future<Uint8List?> record(
    Duration length, {
    void Function(int secondsLeft)? onTick,
    Future<void>? cancelled,
  }) async {
    recordings++;
    onTick?.call(length.inSeconds);
    var wasCancelled = false;
    final h = hold;
    if (h != null) {
      await Future.any([h.future, if (cancelled != null) cancelled.then((_) => wasCancelled = true)]);
    } else if (cancelled != null) {
      // Let a cancel that is already done win.
      await Future<void>.delayed(Duration.zero);
    }
    return wasCancelled ? null : Uint8List.fromList(result);
  }
}
