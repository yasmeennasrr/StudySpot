import 'package:dio/dio.dart';

import '../auth/token_store.dart';
import '../config.dart';
import '../models/auth.dart';
import '../models/preferences.dart';
import '../models/venue.dart';
import 'api_client.dart';
import 'api_error.dart';

/// Talks to the real backend over HTTPS (EIR-008, SEC-003).
class DioApiClient extends ApiClient {
  DioApiClient({required this.tokens, String? baseUrl, Dio? dio})
      : _dio = dio ??
            Dio(BaseOptions(
              baseUrl: baseUrl ?? AppConfig.baseUrl,
              connectTimeout: AppConfig.requestTimeout,
              receiveTimeout: AppConfig.requestTimeout,
              contentType: 'application/json',
            )) {
    _dio.interceptors.add(InterceptorsWrapper(onRequest: _addAuthHeader));
  }

  final Dio _dio;
  final TokenStore tokens;

  /// AuthInterceptor: adds `Authorization: Bearer <token>` to every call.
  Future<void> _addAuthHeader(
      RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await tokens.readAccessToken();
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  /// Runs one request and turns every failure into an [ApiError].
  ///
  /// Access tokens last 15 minutes. On a 401 from a protected call, swap the
  /// refresh token for new tokens and retry once (app/README.md). If that
  /// fails too, the session is over (SEC-009).
  Future<Response<dynamic>> _send(
    Future<Response<dynamic>> Function() request, {
    bool isAuthCall = false,
  }) async {
    try {
      return await request();
    } on DioException catch (e) {
      final error = _toApiError(e);
      if (!error.isUnauthenticated || isAuthCall) throw error;
      if (await _refreshTokens()) {
        try {
          return await request();
        } on DioException catch (retryError) {
          final second = _toApiError(retryError);
          if (second.isUnauthenticated) onUnauthorized?.call();
          throw second;
        }
      }
      onUnauthorized?.call();
      throw error;
    }
  }

  /// One refresh at a time: calls that fail together share it, because each
  /// refresh token works only once (it is rotated).
  Future<bool>? _refreshing;

  Future<bool> _refreshTokens() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<bool> _doRefresh() async {
    final refreshToken = await tokens.readRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) return false;
    try {
      final fresh = await refresh(refreshToken);
      await tokens.save(
          accessToken: fresh.accessToken, refreshToken: fresh.refreshToken);
      return true;
    } on ApiError {
      return false;
    }
  }

  ApiError _toApiError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ApiError.timeout;
      case DioExceptionType.badResponse:
        return ApiError.fromBody(e.response?.data, e.response?.statusCode);
      default:
        return ApiError.network;
    }
  }

  Map<String, dynamic> _json(Response<dynamic> r) =>
      (r.data as Map).cast<String, dynamic>();

  @override
  Future<bool> wakeUp() async {
    try {
      final r = await _dio.get<dynamic>(
        '/health',
        options: Options(receiveTimeout: AppConfig.wakeUpTimeout),
      );
      return r.statusCode == 200;
    } on DioException {
      return false;
    }
  }

  @override
  Future<AuthTokens> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    final r = await _send(
      () => _dio.post<dynamic>('/auth/register', data: {
        'email': email,
        'password': password,
        'displayName': displayName,
        'termsAccepted': true,
      }),
      isAuthCall: true,
    );
    return AuthTokens.fromJson(_json(r));
  }

  @override
  Future<AuthTokens> login({required String email, required String password}) async {
    final r = await _send(
      () => _dio.post<dynamic>('/auth/login',
          data: {'email': email, 'password': password}),
      isAuthCall: true,
    );
    return AuthTokens.fromJson(_json(r));
  }

  @override
  Future<AuthTokens> refresh(String refreshToken) async {
    final r = await _send(
      () => _dio.post<dynamic>('/auth/refresh',
          data: {'refreshToken': refreshToken}),
      isAuthCall: true,
    );
    return AuthTokens.fromJson(_json(r));
  }

  @override
  Future<void> logout(String refreshToken) async {
    await _send(
      () => _dio.post<dynamic>('/auth/logout',
          data: {'refreshToken': refreshToken}),
      isAuthCall: true,
    );
  }

  @override
  Future<Preferences> getPreferences() async {
    final r = await _send(() => _dio.get<dynamic>('/me/preferences'));
    return Preferences.fromJson(_json(r));
  }

  @override
  Future<Preferences> savePreferences(Preferences preferences) async {
    final r = await _send(
        () => _dio.put<dynamic>('/me/preferences', data: preferences.toJson()));
    return Preferences.fromJson(_json(r));
  }

  @override
  Future<void> clearPreferences() async {
    await _send(() => _dio.delete<dynamic>('/me/preferences'));
  }

  @override
  Future<List<VenueSummary>> listFavorites() async {
    final r = await _send(() => _dio.get<dynamic>('/me/favorites'));
    return ((_json(r)['items'] as List?) ?? const [])
        .map((e) => VenueSummary.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  @override
  Future<void> addFavorite(String venueId) async {
    await _send(() => _dio.put<dynamic>('/me/favorites/$venueId'));
  }

  @override
  Future<void> removeFavorite(String venueId) async {
    await _send(() => _dio.delete<dynamic>('/me/favorites/$venueId'));
  }

  @override
  Future<SearchResult> searchVenues({
    String? q,
    String? area,
    double? lat,
    double? lng,
    Map<String, Object> filters = const {},
  }) async {
    final r = await _send(() => _dio.get<dynamic>('/venues/search', queryParameters: {
          if (q != null && q.isNotEmpty) 'q': q,
          if (area != null && area.isNotEmpty) 'area': area,
          'lat': ?lat,
          'lng': ?lng,
          ...filters,
        }));
    return SearchResult.fromJson(_json(r));
  }

  @override
  Future<SearchResult> nearbyVenues({
    required double lat,
    required double lng,
    Map<String, Object> filters = const {},
  }) async {
    final r = await _send(() => _dio.get<dynamic>('/venues/nearby',
        queryParameters: {'lat': lat, 'lng': lng, ...filters}));
    return SearchResult.fromJson(_json(r));
  }

  @override
  Future<Map<String, dynamic>> getVenue(String venueId) async {
    final r = await _send(() => _dio.get<dynamic>('/venues/$venueId'));
    return _json(r);
  }
}
