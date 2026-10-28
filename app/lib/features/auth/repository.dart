import '../../core/api/api_client.dart';
import '../../core/auth/session.dart';

/// Accounts: calls the API and keeps the session up to date.
class AuthRepository {
  AuthRepository(this._api, this._session);

  final ApiClient _api;
  final Session _session;

  Future<void> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    final tokens = await _api.register(
      email: email.trim(),
      password: password,
      displayName: displayName.trim(),
    );
    await _session.signIn(tokens);
  }

  Future<void> signIn({required String email, required String password}) async {
    final tokens = await _api.login(email: email.trim(), password: password);
    await _session.signIn(tokens);
  }

  Future<void> signOut() => _session.signOut();
}
