import '../models/auth.dart';
import '../models/preferences.dart';
import '../models/venue.dart';
import 'api_client.dart';
import 'api_error.dart';

/// In-memory backend for widget tests and offline work. Behaves like the
/// contract: same validation messages for the cases the screens care about.
class MockApiClient extends ApiClient {
  MockApiClient({this.delay = Duration.zero});

  final Duration delay;

  /// Registered accounts: e-mail (lower case) -> password.
  final Map<String, String> accounts = {'dev@studyspot.test': 'devpass123'};
  final Map<String, String> displayNames = {'dev@studyspot.test': 'Dev User'};
  Preferences preferences = Preferences.empty;
  final List<VenueSummary> venues = const [
    VenueSummary(
      id: '6f1c2a10-0000-4000-8000-000000000001',
      name: 'Sample Study Café (New Cairo)',
      lat: 30.0205,
      lng: 31.4952,
      area: 'New Cairo',
      priceLevel: 2,
      wifiAvailable: true,
      outletsAvailable: true,
      studyType: 'both',
    ),
    VenueSummary(
      id: '6f1c2a10-0000-4000-8000-000000000002',
      name: 'Quiet Corner Zamalek',
      lat: 30.0626,
      lng: 31.2197,
      area: 'Zamalek',
      priceLevel: 3,
      wifiAvailable: true,
      outletsAvailable: false,
      studyType: 'individual',
    ),
  ];
  final Set<String> favoriteIds = {};

  /// Set to make the next call fail, e.g. ApiError.network.
  ApiError? failNext;

  int logoutCalls = 0;

  Future<void> _step() async {
    if (delay > Duration.zero) await Future<void>.delayed(delay);
    final error = failNext;
    if (error != null) {
      failNext = null;
      if (error.isUnauthenticated) onUnauthorized?.call();
      throw error;
    }
  }

  AuthTokens _tokensFor(String email) => AuthTokens(
        accessToken: 'mock-access-$email',
        expiresIn: 900,
        refreshToken: 'mock-refresh-$email',
        user: AuthUser(
          id: '00000000-0000-4000-8000-000000000001',
          email: email,
          displayName: displayNames[email] ?? email,
          role: 'user',
        ),
      );

  @override
  Future<bool> wakeUp() async {
    await _step();
    return true;
  }

  @override
  Future<AuthTokens> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    await _step();
    final key = email.trim().toLowerCase();
    if (accounts.containsKey(key)) {
      throw const ApiError(
        code: 'CONFLICT',
        statusCode: 409,
        message: 'An account with this e-mail already exists. Sign in instead.',
      );
    }
    accounts[key] = password;
    displayNames[key] = displayName;
    return _tokensFor(key);
  }

  @override
  Future<AuthTokens> login({required String email, required String password}) async {
    await _step();
    final key = email.trim().toLowerCase();
    if (accounts[key] != password) {
      throw const ApiError(
        code: 'UNAUTHENTICATED',
        statusCode: 401,
        message: 'E-mail or password is wrong. Please try again.',
      );
    }
    return _tokensFor(key);
  }

  @override
  Future<AuthTokens> refresh(String refreshToken) async {
    await _step();
    if (!refreshToken.startsWith('mock-refresh-')) {
      throw const ApiError(
          code: 'UNAUTHENTICATED', statusCode: 401, message: 'Please sign in again.');
    }
    return _tokensFor(refreshToken.substring('mock-refresh-'.length));
  }

  @override
  Future<void> logout(String refreshToken) async {
    await _step();
    logoutCalls++;
  }

  @override
  Future<Preferences> getPreferences() async {
    await _step();
    return preferences;
  }

  @override
  Future<Preferences> savePreferences(Preferences value) async {
    await _step();
    preferences = value;
    return preferences;
  }

  @override
  Future<void> clearPreferences() async {
    await _step();
    preferences = Preferences.empty;
  }

  @override
  Future<List<VenueSummary>> listFavorites() async {
    await _step();
    return venues.where((v) => favoriteIds.contains(v.id)).toList();
  }

  @override
  Future<void> addFavorite(String venueId) async {
    await _step();
    favoriteIds.add(venueId);
  }

  @override
  Future<void> removeFavorite(String venueId) async {
    await _step();
    favoriteIds.remove(venueId);
  }

  @override
  Future<SearchResult> searchVenues({
    String? q,
    String? area,
    double? lat,
    double? lng,
    Map<String, Object> filters = const {},
  }) async {
    await _step();
    final text = (q ?? area ?? '').toLowerCase();
    return SearchResult(
      items: venues
          .where((v) =>
              v.name.toLowerCase().contains(text) ||
              (v.area ?? '').toLowerCase().contains(text))
          .toList(),
    );
  }

  @override
  Future<SearchResult> nearbyVenues({
    required double lat,
    required double lng,
    Map<String, Object> filters = const {},
  }) async {
    await _step();
    return SearchResult(items: venues);
  }

  @override
  Future<Map<String, dynamic>> getVenue(String venueId) async {
    await _step();
    final v = venues.firstWhere(
      (v) => v.id == venueId,
      orElse: () => throw const ApiError(
          code: 'NOT_FOUND', statusCode: 404, message: 'This place was not found.'),
    );
    return {
      'static': {'id': v.id, 'name': v.name, 'area': v.area},
      'isFavorite': favoriteIds.contains(v.id),
    };
  }
}
