import 'dart:math' as math;

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/location/location_service.dart';
import '../../core/models/preferences.dart';
import '../../core/models/venue.dart';
import '../../core/state/view_model.dart';
import '../../core/storage/local_flags.dart';

/// Where the current list comes from.
enum SearchSource {
  /// FR-010, FR-012: near the device location, nearest first, with distance.
  nearby,

  /// FR-011: around the area typed on the location screen.
  area,

  /// FR-009: by café name.
  name,

  /// Every venue: chosen with "All places", or when there is no location, area
  /// or name. With a location it is sorted nearest first, with distances.
  all,
}

/// PB-07, PB-08, PB-10 / UC-03: search, nearby and filters. The list and the
/// map show the same results.
class SearchViewModel extends ViewModel {
  SearchViewModel({
    required this.api,
    required this.location,
    required this.flags,
  });

  final ApiClient api;
  final LocationService location;
  final LocalFlags flags;

  bool loading = false;
  String? error;
  bool degraded = false;
  List<VenueSummary> items = const [];
  SearchSource source = SearchSource.all;

  /// Typed café name; empty means "no name search".
  String query = '';

  /// "All places" instead of "Near me": every venue, however far, for students
  /// planning where to study later (nearby search only covers a few km).
  bool showAll = false;

  /// True when the device location is known, so the Near me / All places switch
  /// is offered.
  bool get hasLocation => _position != null;

  /// FR-013 filters, same fields as saved preferences.
  Preferences filters = Preferences.empty;

  DevicePosition? _position;

  int get activeFilterCount => filters.toJson().length;

  String get sourceLabel => switch (source) {
        SearchSource.nearby => 'Near you, nearest first',
        SearchSource.area => 'Around ${flags.manualArea}',
        SearchSource.name => 'Results for "$query"',
        SearchSource.all =>
          _position != null ? 'All study places, nearest first' : 'All study places, A to Z',
      };

  String get emptyMessage => activeFilterCount > 0
      ? 'No places match. Try removing a filter.'
      : 'No places found here yet.';

  /// Runs when the screen opens and on pull-to-refresh.
  Future<void> load() async {
    loading = true;
    error = null;
    notify();
    try {
      _position = await location.currentPosition();
      final area = flags.manualArea;
      final f = filters.toJson().cast<String, Object>();
      final SearchResult result;
      if (query.trim().isNotEmpty) {
        source = SearchSource.name;
        result = await api.searchVenues(
            q: query.trim(), lat: _position?.lat, lng: _position?.lng, filters: f);
      } else if (showAll) {
        source = SearchSource.all;
        result = _withDistances(await api.browseVenues(filters: f));
      } else if (_position != null) {
        source = SearchSource.nearby;
        result = await api.nearbyVenues(
            lat: _position!.lat, lng: _position!.lng, filters: f);
      } else if (area != null && area.isNotEmpty) {
        source = SearchSource.area;
        result = await api.searchVenues(area: area, filters: f);
      } else {
        source = SearchSource.all;
        result = await api.browseVenues(filters: f);
      }
      items = result.items;
      degraded = result.degraded;
    } on ApiError catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notify();
    }
  }

  Future<void> search(String text) {
    query = text;
    return load();
  }

  /// The Near me / All places switch.
  Future<void> setShowAll(bool value) {
    if (showAll == value) return Future.value();
    showAll = value;
    return load();
  }

  /// GET /venues has no location, so the distances are worked out here from each
  /// venue's coordinates, and the list is sorted nearest first.
  SearchResult _withDistances(SearchResult result) {
    final p = _position;
    if (p == null) return result;
    final items = [
      for (final v in result.items)
        v.hasLocation && v.distanceMeters == null
            ? v.copyWithDistance(distanceMeters(p.lat, p.lng, v.lat!, v.lng!).round())
            : v,
    ]..sort((a, b) => (a.distanceMeters ?? 1 << 30).compareTo(b.distanceMeters ?? 1 << 30));
    return SearchResult(items: items, degraded: result.degraded);
  }

  Future<void> applyFilters(Preferences value) {
    filters = value;
    return load();
  }

  /// "Use my preferences" in the filter sheet (FR-022 feeds FR-013).
  Future<Preferences?> savedPreferences() async {
    try {
      return await api.getPreferences();
    } on ApiError {
      return null;
    }
  }

  /// Venues the map can place (they have coordinates).
  List<VenueSummary> get mappable => items.where((v) => v.hasLocation).toList();
}

/// Great-circle distance in meters between two points (haversine).
double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371000.0;
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1);
  final dLng = rad(lng2 - lng1);
  final h = math.pow(math.sin(dLat / 2), 2) +
      math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLng / 2), 2);
  return 2 * r * math.asin(math.sqrt(h));
}
