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
}
