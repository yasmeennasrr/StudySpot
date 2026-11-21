import 'dart:async';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/audio/noise_recorder.dart';
import '../../core/location/location_service.dart';
import '../../core/state/view_model.dart';

enum NoiseStage {
  /// Checking sign-in, location and whether the student is at the venue.
  checking,

  /// Not offered: not signed in, no location, or not at the venue (SEN-009).
  hidden,

  /// Offered: "Record 7 seconds".
  ready,

  /// The microphone is on; the screen shows it (SEN-008).
  recording,

  /// Sent; waiting for the level.
  analysing,

  /// Saved; [NoiseSampleViewModel.level] holds the level.
  done,

  /// Analysis unavailable or inconclusive: nothing saved (AI-026).
  unavailable,

  /// Microphone permission refused: nothing recorded (SEN-006).
  permissionDenied,

  /// Another error (network, no longer at the venue).
  error,
}

/// PB-19 / UC-11: share a 7-second noise sample from the venue details screen.
///
/// - Offered only to a signed-in student the backend places at this venue.
/// - Records only after the student taps, and only with microphone permission.
/// - The snippet lives in memory, is sent once, then wiped (PRIV-001).
class NoiseSampleViewModel extends ViewModel {
  NoiseSampleViewModel({
    required this.api,
    required this.location,
    required this.recorder,
    required this.venueId,
    required this.signedIn,
    this.length = const Duration(seconds: 7),
  });

  final ApiClient api;
  final LocationService location;
  final NoiseRecorder recorder;
  final String venueId;
  final bool signedIn;
  final Duration length;

  NoiseStage stage = NoiseStage.checking;
  int secondsLeft = 0;
  String? level;
  String? message;
  DevicePosition? _position;
  Completer<void>? _cancel;

  bool get visible => stage != NoiseStage.checking && stage != NoiseStage.hidden;

  Future<void> check() async {
    stage = NoiseStage.checking;
    notify();
    if (!signedIn) return _set(NoiseStage.hidden);
    _position = await location.currentPosition();
    final p = _position;
    if (p == null) return _set(NoiseStage.hidden);
    try {
      final eligible = await api.noiseSampleEligible(venueId, lat: p.lat, lng: p.lng);
      _set(eligible ? NoiseStage.ready : NoiseStage.hidden);
    } on ApiError {
      _set(NoiseStage.hidden); // never block the details screen for this
    }
  }

  Future<void> record() async {
    final p = _position;
    if (p == null || stage == NoiseStage.recording || stage == NoiseStage.analysing) return;
    message = null;
    level = null;
    if (!await recorder.requestPermission()) {
      message = 'Microphone access is off, so nothing was recorded. '
          'You can allow it in your settings.';
      return _set(NoiseStage.permissionDenied);
    }
    _cancel = Completer<void>();
    secondsLeft = length.inSeconds;
    _set(NoiseStage.recording);
    final wav = await recorder.record(length, cancelled: _cancel!.future, onTick: (left) {
      secondsLeft = left;
      notify();
    });
    _cancel = null;
    if (wav == null) {
      message = 'Recording cancelled. Nothing was sent.';
      return _set(NoiseStage.ready);
    }
    _set(NoiseStage.analysing);
    try {
      final result = await api.sendNoiseSample(venueId, wav, lat: p.lat, lng: p.lng);
      message = result.message;
      if (result.recorded) {
        level = result.level;
        _set(NoiseStage.done);
      } else {
        _set(NoiseStage.unavailable);
      }
    } on ApiError catch (e) {
      message = e.message;
      _set(NoiseStage.error);
    } finally {
      wav.fillRange(0, wav.length, 0); // PRIV-001: discard the snippet
    }
  }

  void cancel() {
    final c = _cancel;
    if (c != null && !c.isCompleted) c.complete();
  }

  void _set(NoiseStage next) {
    stage = next;
    notify();
  }

  @override
  void dispose() {
    cancel();
    super.dispose();
  }
}
