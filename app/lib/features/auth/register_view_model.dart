import '../../core/api/api_error.dart';
import '../../core/state/view_model.dart';
import 'repository.dart';
import 'validators.dart';

/// PB-03 / UC-01: create an account (FR-001). Terms were accepted at first
/// launch (PRIV-011); the request sends termsAccepted: true.
class RegisterViewModel extends ViewModel {
  RegisterViewModel(this._repository);

  final AuthRepository _repository;

  String email = '';
  String password = '';
  String displayName = '';

  /// Field name (email, password, displayName) -> problem.
  final Map<String, String> errors = {};
  String? generalError;
  bool busy = false;

  void setEmail(String v) => _set('email', () => email = v);
  void setPassword(String v) => _set('password', () => password = v);
  void setDisplayName(String v) => _set('displayName', () => displayName = v);

  void _set(String field, void Function() change) {
    change();
    if (errors.remove(field) != null) notify();
  }

  bool _validate() {
    errors.clear();
    final checks = {
      'email': AuthValidators.email(email),
      'password': AuthValidators.password(password),
      'displayName': AuthValidators.displayName(displayName),
    };
    checks.forEach((field, problem) {
      if (problem != null) errors[field] = problem;
    });
    return errors.isEmpty;
  }

  /// True when the account was created and the user is signed in.
  Future<bool> submit() async {
    generalError = null;
    if (!_validate()) {
      notify();
      return false;
    }
    busy = true;
    notify();
    try {
      await _repository.register(
          email: email, password: password, displayName: displayName);
      return true;
    } on ApiError catch (e) {
      errors.addAll(e.fieldErrors);
      generalError = e.message;
      return false;
    } finally {
      busy = false;
      notify();
    }
  }
}
