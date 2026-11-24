import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/api/api_error.dart';
import 'package:studyspot/core/location/location_service.dart';
import 'package:studyspot/core/models/preferences.dart';
import 'package:studyspot/features/search/search_view_model.dart';

import '../../helpers.dart';

SearchViewModel vmFor(TestWorld w) =>
    SearchViewModel(api: w.api, location: w.location, flags: w.flags);

void main() {
  test('TC-M6-06 the list source follows the decision table: name > location > area > all', () async {
    // No location, no area, no name: every venue A to Z.
    var w = TestWorld();
    var vm = vmFor(w);
    await vm.load();
    expect(w.api.venueCalls.last, 'browse');
    expect(vm.source, SearchSource.all);
    expect(vm.items.first.name.compareTo(vm.items.last.name), lessThan(0), reason: 'A to Z');

    // Location refused but an area typed (FR-011).
    w = TestWorld()..flags.manualArea = 'Zamalek';
    vm = vmFor(w);
    await vm.load();
    expect(w.api.venueCalls.last, 'search area=Zamalek');
    expect(vm.sourceLabel, 'Around Zamalek');

    // Location granted: nearby with distance (FR-010, FR-012).
    w = TestWorld(locationAccess: LocationAccess.granted)..flags.manualArea = 'Zamalek';
    vm = vmFor(w);
    await vm.load();
    expect(w.api.venueCalls.last, 'nearby');
    expect(vm.source, SearchSource.nearby);

    // A typed name wins (FR-009).
    await vm.search('quiet');
    expect(w.api.venueCalls.last, 'search q=quiet point');
    expect(vm.source, SearchSource.name);
  });

  test('TC-M6-07 filters are sent as query values; distance is dropped when browsing all', () async {
    final w = TestWorld();
    final vm = vmFor(w);
    await vm.applyFilters(const Preferences(noise: 'quiet', outlets: true, maxPrice: 2, maxDistance: 1000));
    expect(vm.activeFilterCount, 4);
    expect(w.api.lastFilters, {'noise': 'quiet', 'outlets': true, 'maxPrice': 2},
        reason: 'GET /venues has no location, so maxDistance is not sent');
    await vm.applyFilters(Preferences.empty);
    expect(vm.activeFilterCount, 0);
    expect(w.api.lastFilters, isEmpty);
  });

  test('TC-M6-08 empty and degraded results: suggest removing a filter; flag the maps outage', () async {
    final w = TestWorld()..flags.manualArea = 'Zamalek';
    w.api
      ..returnNoVenues = true
      ..degradedSearch = true;
    final vm = vmFor(w);
    await vm.applyFilters(const Preferences(wifi: 'good'));
    expect(vm.items, isEmpty);
    expect(vm.emptyMessage, 'No places match. Try removing a filter.');
    expect(vm.degraded, isTrue);
  });

  test('TC-M6-09 a failed search shows the error message and retry recovers', () async {
    final w = TestWorld();
    final vm = vmFor(w);
    w.api.failNext = ApiError.network;
    await vm.load();
    expect(vm.error, ApiError.network.message);
    expect(vm.loading, isFalse);
    await vm.load();
    expect(vm.error, isNull);
    expect(vm.items, isNotEmpty);
  });

  test('TC-M1-93 "All places" lists every venue however far, nearest first, with distances', () async {
    final w = TestWorld(locationAccess: LocationAccess.granted); // device at (30.0444, 31.2357)
    final vm = vmFor(w);
    await vm.load();
    expect(vm.source, SearchSource.nearby);
    expect(vm.hasLocation, isTrue);

    await vm.applyFilters(const Preferences(noise: 'quiet', maxDistance: 1000));
    await vm.setShowAll(true);
    expect(w.api.venueCalls.last, 'browse');
    expect(vm.source, SearchSource.all);
    expect(vm.sourceLabel, 'All study places, nearest first');
    expect(w.api.lastFilters, {'noise': 'quiet'}, reason: 'maxDistance does not apply to all places');
    // Zamalek is about 2.5 km away, New Cairo about 25 km: both listed, nearest first.
    expect(vm.items.map((v) => v.area), ['Zamalek', 'New Cairo']);
    expect(vm.items.first.distanceMeters, inInclusiveRange(2000, 3000));
    expect(vm.items.last.distanceMeters, inInclusiveRange(24000, 27000));

    await vm.setShowAll(false);
    expect(w.api.venueCalls.last, 'nearby');
    expect(vm.source, SearchSource.nearby);
  });

  test('TC-M1-93 distance: one degree of latitude is about 111.2 km', () {
    expect(distanceMeters(30, 31, 31, 31), closeTo(111195, 50));
    expect(distanceMeters(30.0626, 31.2197, 30.0626, 31.2197), 0);
  });
}
