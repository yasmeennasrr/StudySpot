import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/api/api_error.dart';
import 'package:studyspot/core/location/location_service.dart';
import 'package:studyspot/core/models/noise.dart';
import 'package:studyspot/features/noise/noise_sample_view_model.dart';

import '../../helpers.dart';

/// TC-M1-86..TC-M1-89: sharing a noise sample from the venue details (PB-19, UC-11).
void main() {
  const venue = '6f1c2a10-0000-4000-8000-000000000002';

  NoiseSampleViewModel vmFor(TestWorld w, {bool signedIn = true}) => NoiseSampleViewModel(
        api: w.api,
        location: w.location,
        recorder: w.noise,
        venueId: venue,
        signedIn: signedIn,
      );

  test('TC-M1-86 offered only to a signed-in student with a location who is at the venue (SEN-009)', () async {
    final w = TestWorld(locationAccess: LocationAccess.granted);
    final vm = vmFor(w);
    await vm.check();
    expect(vm.stage, NoiseStage.ready);

    final notThere = TestWorld(locationAccess: LocationAccess.granted)..api.noiseEligible = false;
    final away = vmFor(notThere);
    await away.check();
    expect(away.stage, NoiseStage.hidden);

    final noLocation = vmFor(TestWorld());
    await noLocation.check();
    expect(noLocation.stage, NoiseStage.hidden);

    final guest = vmFor(TestWorld(locationAccess: LocationAccess.granted), signedIn: false);
    await guest.check();
    expect(guest.stage, NoiseStage.hidden);

    final offline = TestWorld(locationAccess: LocationAccess.granted)
      ..api.failNext = const ApiError(code: 'NETWORK', message: 'No connection.');
    final quiet = vmFor(offline);
    await quiet.check();
    expect(quiet.stage, NoiseStage.hidden); // never blocks the details screen
  });

  test('TC-M1-87 permission is asked only on tap; refused means nothing is recorded or sent (SEN-004, SEN-006)', () async {
    final w = TestWorld(locationAccess: LocationAccess.granted);
    w.noise.permission = false;
    final vm = vmFor(w);
    await vm.check();
    expect(w.noise.permissionRequests, 0);
    await vm.record();
    expect(w.noise.permissionRequests, 1);
    expect(vm.stage, NoiseStage.permissionDenied);
    expect(w.noise.recordings, 0);
    expect(w.api.noiseSamples, isEmpty);
  });

  test('TC-M1-88 records 7 s with a visible countdown, sends it once and wipes it (SEN-005, SEN-008, PRIV-001)', () async {
    final w = TestWorld(locationAccess: LocationAccess.granted);
    final vm = vmFor(w);
    await vm.check();
    w.noise.hold = Completer<void>();
    final stages = <NoiseStage>[];
    vm.addListener(() => stages.add(vm.stage));

    final run = vm.record();
    await Future<void>.delayed(Duration.zero);
    expect(vm.stage, NoiseStage.recording);
    expect(vm.secondsLeft, 7);
    w.noise.hold!.complete();
    await run;

    expect(vm.stage, NoiseStage.done);
    expect(vm.level, 'quiet');
    expect(w.api.noiseSamples, [64]);
    expect(stages, containsAllInOrder([NoiseStage.recording, NoiseStage.analysing, NoiseStage.done]));

    // Cancel while recording: nothing is sent.
    w.noise.hold = Completer<void>();
    final again = vm.record();
    await Future<void>.delayed(Duration.zero);
    vm.cancel();
    await again;
    expect(vm.stage, NoiseStage.ready);
    expect(vm.message, 'Recording cancelled. Nothing was sent.');
    expect(w.api.noiseSamples, [64]);
  });

  test('TC-M1-89 analysis unavailable or not at the venue any more: a short notice, nothing saved (AI-026)', () async {
    final w = TestWorld(locationAccess: LocationAccess.granted);
    w.api.noiseResult = const NoiseSampleResult(
        recorded: false, message: 'Noise analysis is not available right now. Nothing was saved.');
    final vm = vmFor(w);
    await vm.check();
    await vm.record();
    expect(vm.stage, NoiseStage.unavailable);
    expect(vm.message, 'Noise analysis is not available right now. Nothing was saved.');
    expect(vm.level, isNull);

    w.api.noiseEligible = false; // walked out after the check
    await vm.record();
    expect(vm.stage, NoiseStage.error);
    expect(vm.message, 'You can share a noise sample only while you are at this place.');
  });
}
