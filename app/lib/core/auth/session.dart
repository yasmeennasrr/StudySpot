import '../api/api_client.dart';
import '../api/api_error.dart';
import '../models/auth.dart';
import '../state/view_model.dart';
import 'token_store.dart';

/// Who is signed in. The router listens to it: when the session ends, every
/// protected screen sends the user to sign-in (FR-004, FR-007, SEC-009).
class Session extends ViewModel {
  Session({required this.api, required this.tokens}) {
    api.onUnauthorized = handleExpired;
  }

  final ApiClient api;
  final TokenStore tokens;

  bool _signedIn = false;
  AuthUser? user;

  /// Shown once on the sign-in screen after the backend ended the session.
  String? expiredMessage;

  bool get isSignedIn => _signedIn;

  /// At start-up: signed in if a token is stored from last time.
  Future<void> restore() async {
    _signedIn = await tokens.readAccessToken() != null;
    notify();
  }

  Future<void> signIn(AuthTokens result) async {
    await tokens.save(
        accessToken: result.accessToken, refreshToken: result.refreshToken);
    user = result.user;
    _signedIn = true;
    expiredMessage = null;
    notify();
  }

  /// FR-004: tell the backend, then forget the tokens on this phone. The local
  /// sign-out happens even if the backend can't be reached.
  Future<void> signOut() async {
    final refresh = await tokens.readRefreshToken();
    if (refresh != null && refresh.isNotEmpty) {
      try {
        await api.logout(refresh);
      } on ApiError {
        // Still sign out locally.
      }
    }
    await tokens.clear();
    user = null;
    _signedIn = false;
    notify();
  }

  /// The backend answered 401 (token expired after inactivity, SEC-009).
  void handleExpired() {
    if (!_signedIn) return;
    tokens.clear();
    user = null;
    _signedIn = false;
    expiredMessage = 'Your session has ended. Please sign in again.';
    notify();
  }
}
