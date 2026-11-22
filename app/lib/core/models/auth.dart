// Hand-written from contracts/openapi.yaml (AuthUser, AuthTokens).
// Field names match the spec exactly.

class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.role,
  });

  final String id;
  final String email;
  final String displayName;

  /// user | admin | moderator
  final String role;

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        email: json['email'] as String,
        displayName: json['displayName'] as String,
        role: (json['role'] as String?) ?? 'user',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'displayName': displayName,
        'role': role,
      };
}

/// PATCH /me answer (UpdateProfileResult): the updated user, and new tokens
/// only after a password change (every other session was signed out).
class AccountUpdate {
  const AccountUpdate({required this.user, this.tokens});

  final AuthUser user;
  final AuthTokens? tokens;

  factory AccountUpdate.fromJson(Map<String, dynamic> json) => AccountUpdate(
        user: AuthUser.fromJson(json),
        tokens: json['tokens'] is Map
            ? AuthTokens.fromJson((json['tokens'] as Map).cast<String, dynamic>())
            : null,
      );
}

class AuthTokens {
  const AuthTokens({
    required this.accessToken,
    required this.expiresIn,
    required this.refreshToken,
    required this.user,
  });

  final String accessToken;

  /// Seconds until the access token expires.
  final int expiresIn;
  final String refreshToken;
  final AuthUser user;

  factory AuthTokens.fromJson(Map<String, dynamic> json) => AuthTokens(
        accessToken: json['accessToken'] as String,
        expiresIn: (json['expiresIn'] as num).toInt(),
        refreshToken: json['refreshToken'] as String,
        user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
      );
}
