import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/models/preferences.dart';
import 'package:studyspot/features/preferences/repository.dart';
import 'package:studyspot/features/preferences/view_model.dart';

import '../../helpers.dart';

void main() {
  test('TC-M5-13 preferences are saved, still there when the screen reopens, and can be removed',
      () async {
    final w = TestWorld();
    final repo = PreferencesRepository(w.api);

    final first = PreferencesViewModel(repo);
    await first.load();
    expect(first.current.isEmpty, isTrue);
    first
      ..update((m) => m.noise = 'quiet')
      ..update((m) => m.outlets = true)
      ..update((m) => m.maxPrice = 2);
    await first.save();
    expect(first.message, 'Preferences saved.');

    // A new screen (or a new app session) loads the same values (FR-024).
    final second = PreferencesViewModel(repo);
    await second.load();
    expect(second.current,
        const Preferences(noise: 'quiet', outlets: true, maxPrice: 2));
    expect(second.current.toJson(),
        {'noise': 'quiet', 'outlets': true, 'maxPrice': 2},
        reason: 'unset fields are not sent');

    await second.clearAll();
    expect(second.current.isEmpty, isTrue);
    expect(w.api.preferences.isEmpty, isTrue);
  });
}
