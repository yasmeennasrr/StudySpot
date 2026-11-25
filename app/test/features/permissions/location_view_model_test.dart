import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/location/location_service.dart';
import 'package:studyspot/features/permissions/location_view_model.dart';

import '../../helpers.dart';

void main() {
  test('TC-M5-11 the purpose is shown first; the OS prompt only appears after "Allow"', () async {
    final w = TestWorld(locationAsked: false)
      ..location.answerToRequest = LocationAccess.granted;
    final vm = LocationViewModel(location: w.location, flags: w.flags);
    await vm.init();
    expect(vm.step, LocationStep.explain);
    expect(w.location.requests, 0);

    await vm.allow();
    expect(w.location.requests, 1);
    expect(vm.step, LocationStep.granted);
    expect(w.flags.locationAsked, isTrue);
  });

  test('TC-M5-12 refused location offers a typed area; 1 character rejected, 2 saved (BVA)', () async {
    final w = TestWorld(locationAsked: false)
      ..location.answerToRequest = LocationAccess.denied;
    final vm = LocationViewModel(location: w.location, flags: w.flags);
    await vm.allow();
    expect(vm.step, LocationStep.manualArea);
    expect(vm.refusalHelp, contains('Type an area'));

    vm.setArea('Z');
    expect(await vm.saveArea(), isFalse);
    expect(vm.areaError, isNotNull);
    expect(w.flags.manualArea, isNull);

    vm.setArea('Zamalek');
    expect(await vm.saveArea(), isTrue);
    expect(w.flags.manualArea, 'Zamalek');
  });

  test('TC-M2-71 the app remembers the last choice: Allow, refused by the OS, "Not now"', () async {
    final w = TestWorld(locationAsked: false);
    final vm = LocationViewModel(location: w.location, flags: w.flags);
    expect(w.flags.locationAllowed, isFalse);

    for (final access in [
      LocationAccess.granted,
      LocationAccess.backgroundGranted,
    ]) {
      w.location.answerToRequest = access;
      await vm.allow();
      expect(w.flags.locationAllowed, isTrue, reason: '$access');
      await vm.notNow();
      expect(w.flags.locationAllowed, isFalse, reason: 'Not now');
    }

    for (final refusal in [
      LocationAccess.denied,
      LocationAccess.deniedForever,
      LocationAccess.serviceOff,
    ]) {
      w.flags.locationAllowed = true;
      w.location.answerToRequest = refusal;
      await vm.allow();
      expect(w.flags.locationAllowed, isFalse, reason: '$refusal');
    }
  });
}
