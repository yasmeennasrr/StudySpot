import '../../core/api/api_client.dart';
import '../../core/auth/session.dart';
import '../../core/models/auth.dart';

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

  /// PB-05: the signed-in user's account, fresh from the backend (the session
  /// may not know the name after an app restart).
  Future<AuthUser> loadAccount() async {
    final user = await _api.getMe();
    _session.user = user;
    return user;
  }

  /// PB-05: change the display name and/or password; keeps the session in step.
  Future<AuthUser> updateAccount({
    String? displayName,
    String? currentPassword,
    String? newPassword,
  }) async {
    final update = await _api.updateMe(
      displayName: displayName,
      currentPassword: currentPassword,
      newPassword: newPassword,
    );
    await _session.accountUpdated(update);
    return update.user;
  }
}
