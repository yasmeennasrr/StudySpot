import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/format.dart';
import 'package:studyspot/features/venue_details/details_view_model.dart';

import '../../helpers.dart';

void main() {
  test('TC-M6-10 details keep static and dynamic groups apart, with a status for each value', () async {
    final w = TestWorld();
    final id = w.api.venues.first.id;
    final vm = VenueDetailsViewModel(api: w.api, venueId: id);
    await vm.load();
    final d = vm.details!;
    // Static group (FR-016, FR-017).
    expect(d.venue.name, w.api.venues.first.name);
    expect(d.venue.wifiAvailable, isTrue);
    expect(d.openingHours![0]!.first.open, '08:00');
    // Dynamic group, each with its label (FR-020, FR-021).
    expect(conditionText(d.conditions.crowd), 'Current: Low');
    expect(conditionText(d.conditions.noise), 'Estimate based on historical data: Quiet');
    expect(conditionText(d.conditions.wifi), 'Unavailable');
    // Reviews and rating (FR-018).
    expect(d.reviews.length, 2);
    expect(d.averageRating, 4.5);
  });

  test('TC-M6-11 unknown venue shows "not found"; favorite state comes from the backend', () async {
    final w = TestWorld();
    final missing = VenueDetailsViewModel(api: w.api, venueId: 'no-such-venue');
    await missing.load();
    expect(missing.details, isNull);
    expect(missing.error, 'This place was not found.');

    final id = w.api.venues.first.id;
    w.api.favoriteIds.add(id);
    final vm = VenueDetailsViewModel(api: w.api, venueId: id);
    await vm.load();
    expect(vm.details!.isFavorite, isTrue);
  });
}
