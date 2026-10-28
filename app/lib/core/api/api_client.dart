import '../models/auth.dart';
import '../models/preferences.dart';
import '../models/venue.dart';

/// Everything the app asks the backend (contracts/openapi.yaml).
///
/// Screens never call HTTP directly: they go through a repository that uses
/// this interface. Two implementations exist:
///  - [DioApiClient] talks to the real backend.
///  - [MockApiClient] answers from memory, for tests and offline work.
/// Swapping one for the other changes no screen (Strategy / Repository, SDS 8).
abstract class ApiClient {
  /// Called when the session is over: a 401 that a token refresh could not
  /// fix, e.g. after 14 days without use (SEC-009).
  void Function()? onUnauthorized;

  /// GET /health. Waits long enough for the free server to wake up.
  Future<bool> wakeUp();

  // Accounts (PB-03, PB-04)
  Future<AuthTokens> register({
    required String email,
    required String password,
    required String displayName,
  });
  Future<AuthTokens> login({required String email, required String password});

  /// Swaps a refresh token for new tokens; the old refresh token stops working.
  Future<AuthTokens> refresh(String refreshToken);
  Future<void> logout(String refreshToken);

  // Preferences (PB-13)
  Future<Preferences> getPreferences();
  Future<Preferences> savePreferences(Preferences preferences);
  Future<void> clearPreferences();

  // Favorites (PB-14)
  Future<List<VenueSummary>> listFavorites();
  Future<void> addFavorite(String venueId);
  Future<void> removeFavorite(String venueId);

  // Venues (M6: PB-07 to PB-11)
  /// [filters] uses the query names in the spec: noise, wifi, crowd, outlets,
  /// maxPrice, openNow, maxDistance, studyType, radius, limit.
  Future<SearchResult> searchVenues({
    String? q,
    String? area,
    double? lat,
    double? lng,
    Map<String, Object> filters = const {},
  });
  Future<SearchResult> nearbyVenues({
    required double lat,
    required double lng,
    Map<String, Object> filters = const {},
  });

  /// VenueDetails as raw JSON; M6 models it for the details screen.
  Future<Map<String, dynamic>> getVenue(String venueId);
}
