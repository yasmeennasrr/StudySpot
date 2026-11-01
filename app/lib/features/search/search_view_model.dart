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

  /// No location, no area, no name: every venue A to Z.
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

  /// FR-013 filters, same fields as saved preferences.
  Preferences filters = Preferences.empty;

  DevicePosition? _position;

  int get activeFilterCount => filters.toJson().length;

  String get sourceLabel => switch (source) {
        SearchSource.nearby => 'Near you, nearest first',
        SearchSource.area => 'Around ${flags.manualArea}',
        SearchSource.name => 'Results for "$query"',
        SearchSource.all => 'All study places, A to Z',
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
