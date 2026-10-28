import '../../core/api/api_client.dart';
import '../../core/models/venue.dart';

/// PB-14: favorite venues of the signed-in user (FR-026, FR-027).
class FavoritesRepository {
  FavoritesRepository(this._api);

  final ApiClient _api;

  Future<List<VenueSummary>> list() => _api.listFavorites();
  Future<void> add(String venueId) => _api.addFavorite(venueId);
  Future<void> remove(String venueId) => _api.removeFavorite(venueId);
}
