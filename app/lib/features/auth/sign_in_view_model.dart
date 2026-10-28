import '../../core/api/api_error.dart';
import '../../core/state/view_model.dart';
import 'repository.dart';
import 'validators.dart';

/// PB-04 / UC-02: sign in (FR-002); wrong credentials show an error (FR-003).
class SignInViewModel extends ViewModel {
  SignInViewModel(this._repository, {this.expiredMessage});

  final AuthRepository _repository;

  /// Shown when the previous session ended (SEC-009).
  final String? expiredMessage;

  String email = '';
  String password = '';
  final Map<String, String> errors = {};
  String? generalError;
  bool busy = false;

  void setEmail(String v) {
    email = v;
    if (errors.remove('email') != null) notify();
  }

  void setPassword(String v) {
    password = v;
    if (errors.remove('password') != null) notify();
  }

  Future<bool> submit() async {
    generalError = null;
    errors.clear();
    final e1 = AuthValidators.required(email, 'e-mail');
    final e2 = AuthValidators.required(password, 'password');
    if (e1 != null) errors['email'] = e1;
    if (e2 != null) errors['password'] = e2;
    if (errors.isNotEmpty) {
      notify();
      return false;
    }
    return _run(() => _repository.signIn(email: email, password: password));
  }

  Future<bool> _run(Future<void> Function() action) async {
    busy = true;
    notify();
    try {
      await action();
      return true;
    } on ApiError catch (e) {
      generalError = e.isUnauthenticated
          ? 'E-mail or password is wrong. Please try again.'
          : e.message;
      return false;
    } finally {
      busy = false;
      notify();
    }
  }
}
