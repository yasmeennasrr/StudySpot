import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/api/api_error.dart';
import 'package:studyspot/core/api/dio_api_client.dart';
import 'package:studyspot/core/auth/session.dart';
import 'package:studyspot/core/auth/token_store.dart';

/// Answers HTTP calls from a script instead of the network.
class ScriptedAdapter implements HttpClientAdapter {
  ScriptedAdapter(this.answer);

  final ({int status, Object body}) Function(RequestOptions request) answer;
  final List<String> calls = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add('${options.method} ${options.path} ${options.headers['Authorization'] ?? '-'}');
    final a = answer(options);
    return ResponseBody.fromString(jsonEncode(a.body), a.status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

Map<String, Object> tokens(String n) => {
      'accessToken': 'access-$n',
      'expiresIn': 900,
      'refreshToken': 'refresh-$n',
      'user': {
        'id': '00000000-0000-4000-8000-000000000001',
        'email': 'dev@studyspot.test',
        'displayName': 'Dev User',
        'role': 'user',
      },
    };

const unauthenticated = {'code': 'UNAUTHENTICATED', 'message': 'Token expired'};

void main() {
  test('TC-M5-10 expired access token is renewed once and the call retried; '
      'a refused renewal ends the session', () async {
    // Part 1: the 15-minute access token expired, the refresh token is valid.
    var store = MemoryTokenStore()
      ..access = 'access-1'
      ..refresh = 'refresh-1';
    var adapter = ScriptedAdapter((r) {
      if (r.path == '/auth/refresh') return (status: 200, body: tokens('2'));
      final auth = r.headers['Authorization'];
      return auth == 'Bearer access-2'
          ? (status: 200, body: {'noise': 'quiet'})
          : (status: 401, body: unauthenticated);
    });
    var api = DioApiClient(
        tokens: store, dio: Dio(BaseOptions(baseUrl: 'https://test'))..httpClientAdapter = adapter);
    var session = Session(api: api, tokens: store);
    await session.restore();

    final prefs = await api.getPreferences();
    expect(prefs.noise, 'quiet');
    expect(store.access, 'access-2');
    expect(store.refresh, 'refresh-2', reason: 'rotated refresh token is stored');
    expect(adapter.calls, [
      'GET /me/preferences Bearer access-1',
      'POST /auth/refresh Bearer access-1',
      'GET /me/preferences Bearer access-2',
    ]);
    expect(session.isSignedIn, isTrue);

    // Part 2: the refresh token is refused too (14 days without use, SEC-009).
    store = MemoryTokenStore()
      ..access = 'access-old'
      ..refresh = 'refresh-old';
    adapter = ScriptedAdapter((r) => (status: 401, body: unauthenticated));
    api = DioApiClient(
        tokens: store, dio: Dio(BaseOptions(baseUrl: 'https://test'))..httpClientAdapter = adapter);
    session = Session(api: api, tokens: store);
    await session.restore();

    await expectLater(api.getPreferences(), throwsA(isA<ApiError>()));
    expect(session.isSignedIn, isFalse);
    expect(session.expiredMessage, contains('sign in again'));
    expect(store.access, isNull);
    expect(adapter.calls.length, 2, reason: 'one call + one refresh, no loop');
  });
}
