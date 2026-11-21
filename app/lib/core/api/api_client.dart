import 'dart:typed_data';

import '../models/auth.dart';
import '../models/noise.dart';
import '../models/preferences.dart';
import '../models/review.dart';
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
  /// GET /venues: every venue A to Z (no name, area or location needed).
  /// `maxDistance` is ignored here; it needs a location.
  Future<SearchResult> browseVenues({Map<String, Object> filters = const {}});

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

  // Reviews (M4: PB-15, PB-16)
  /// The signed-in student's review of a venue, or null if they have none.
  Future<MyReview?> getMyReview(String venueId);

  /// Writes or replaces the signed-in student's review (one per venue).
  Future<MyReview> writeReview(String venueId, {required int rating, String? text});

  /// Reports someone else's review to the moderators. Safe to repeat.
  Future<void> reportReview(String reviewId);

  // Noise sampling (M1: PB-19, UC-11)
  /// True when the signed-in student is at this venue now, so the app may offer
  /// a noise sample (SEN-009).
  Future<bool> noiseSampleEligible(String venueId, {required double lat, required double lng});

  /// Sends a 7-second WAV snippet held in memory. The backend keeps only the
  /// noise level (PRIV-001, SEN-007).
  Future<NoiseSampleResult> sendNoiseSample(
    String venueId,
    Uint8List wav, {
    required double lat,
    required double lng,
  });
}
