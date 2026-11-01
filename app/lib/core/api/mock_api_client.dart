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

  /// Every venue call, e.g. "search q=quiet", "nearby", "browse": tests check
  /// which endpoint the screen chose (FR-009 to FR-012).
  final List<String> venueCalls = [];

  /// Filters sent with the last venue call.
  Map<String, Object> lastFilters = const {};

  /// Set to make venue lists come back empty / degraded.
  bool returnNoVenues = false;
  bool degradedSearch = false;

  SearchResult _result(List<VenueSummary> items) => SearchResult(
      items: returnNoVenues ? const [] : items, degraded: degradedSearch);

  @override
  Future<SearchResult> browseVenues({Map<String, Object> filters = const {}}) async {
    venueCalls.add('browse');
    lastFilters = Map.of(filters)..remove('maxDistance');
    await _step();
    final items = List.of(venues)..sort((a, b) => a.name.compareTo(b.name));
    return _result(items);
  }

  @override
  Future<SearchResult> searchVenues({
    String? q,
    String? area,
    double? lat,
    double? lng,
    Map<String, Object> filters = const {},
  }) async {
    venueCalls.add([
      'search',
      if (q != null) 'q=$q',
      if (area != null) 'area=$area',
      if (lat != null) 'point',
    ].join(' '));
    lastFilters = filters;
    await _step();
    final text = (q ?? area ?? '').toLowerCase();
    return _result(venues
        .where((v) =>
            v.name.toLowerCase().contains(text) ||
            (v.area ?? '').toLowerCase().contains(text))
        .toList());
  }

  @override
  Future<SearchResult> nearbyVenues({
    required double lat,
    required double lng,
    Map<String, Object> filters = const {},
  }) async {
    venueCalls.add('nearby');
    lastFilters = filters;
    await _step();
    return _result(venues);
  }

  @override
  Future<Map<String, dynamic>> getVenue(String venueId) async {
    venueCalls.add('details');
    await _step();
    final v = venues.firstWhere(
      (v) => v.id == venueId,
      orElse: () => throw const ApiError(
          code: 'NOT_FOUND', statusCode: 404, message: 'This place was not found.'),
    );
    return {
      'static': {
        'id': v.id,
        'name': v.name,
        'location': {'lat': v.lat, 'lng': v.lng},
        'address': v.address,
        'area': v.area,
        'openingHours': {
          '0': [
            {'open': '08:00', 'close': '23:00'}
          ],
          '5': [
            {'open': '12:00', 'close': '02:00'}
          ],
        },
        'priceLevel': v.priceLevel,
        'wifiAvailable': v.wifiAvailable,
        'outletsAvailable': v.outletsAvailable,
        'studyType': v.studyType,
      },
      'dynamic': {
        'venueId': v.id,
        'crowd': {
          'level': 1,
          'label': 'Low',
          'status': 'current',
          'newestInputAt': DateTime.now().toUtc().toIso8601String(),
          'basedOn': ['surveys'],
          'isEstimate': true,
        },
        'noise': {
          'level': 1,
          'label': 'Quiet',
          'status': 'historical',
          'newestInputAt': null,
          'basedOn': ['historical'],
          'isEstimate': true,
        },
        'wifi': {
          'level': null,
          'label': null,
          'status': 'unavailable',
          'newestInputAt': null,
          'basedOn': <String>[],
          'isEstimate': false,
        },
      },
      'averageRating': 4.5,
      'reviewCount': 2,
      'reviews': [
        {
          'id': 'r1',
          'rating': 5,
          'text': 'Quiet upstairs, good Wi-Fi.',
          'authorDisplayName': 'Mona',
          'createdAt': '2026-10-20T10:00:00Z',
        },
        {
          'id': 'r2',
          'rating': 4,
          'text': null,
          'authorDisplayName': 'Omar',
          'createdAt': '2026-10-18T10:00:00Z',
        },
      ],
      'isFavorite': favoriteIds.contains(v.id),
    };
  }
}
