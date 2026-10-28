/// Registration rules from SDS 6.6.6 / RegisterRequest in openapi.yaml.
/// Checked in the app for instant feedback; the backend checks them again
/// (SEC-007). Each returns null when the value is fine, otherwise a message.
class AuthValidators {
  AuthValidators._();

  static final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
  static final _letter = RegExp(r'[A-Za-z]');
  static final _digit = RegExp(r'\d');

  static String? email(String value) {
    final v = value.trim();
    if (v.isEmpty) return 'Enter your e-mail.';
    if (v.length > 254 || !_emailPattern.hasMatch(v)) {
      return 'Enter a valid e-mail, like name@example.com.';
    }
    return null;
  }

  /// At least 8 characters with at least one letter and one digit.
  static String? password(String value) {
    if (value.length < 8) return 'Use at least 8 characters.';
    if (value.length > 128) return 'Use at most 128 characters.';
    if (!_letter.hasMatch(value)) return 'Include at least one letter.';
    if (!_digit.hasMatch(value)) return 'Include at least one digit.';
    return null;
  }

  /// 2 to 30 characters.
  static String? displayName(String value) {
    final v = value.trim();
    if (v.length < 2) return 'Use at least 2 characters.';
    if (v.length > 30) return 'Use at most 30 characters.';
    return null;
  }

  /// Sign-in only checks that something was typed; the backend decides.
  static String? required(String value, String what) =>
      value.trim().isEmpty ? 'Enter your $what.' : null;
}
