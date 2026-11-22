import '../../core/api/api_error.dart';
import '../../core/state/view_model.dart';
import 'repository.dart';
import 'validators.dart';

/// PB-05 / UC-02: view and edit account information (FR-005).
///
/// The display name can be changed on its own. A new password needs the
/// current one (the backend checks it); after a password change the backend
/// signs out every other session and the app keeps the new tokens. The e-mail
/// is shown but cannot be changed.
class EditAccountViewModel extends ViewModel {
  EditAccountViewModel(this._repository);

  final AuthRepository _repository;

  bool loading = true;
  String? loadError;

  String email = '';
  String _savedName = '';
  String displayName = '';
  String currentPassword = '';
  String newPassword = '';

  /// Field name (displayName, currentPassword, newPassword) -> problem.
  final Map<String, String> errors = {};
  String? generalError;
  String? savedMessage;
  bool busy = false;

  /// Bumped after a password change so the view can clear the password fields.
  int passwordResets = 0;

  bool get _nameChanged => displayName.trim() != _savedName;
  bool get _passwordChanging => newPassword.isNotEmpty;

  Future<void> load() async {
    loading = true;
    loadError = null;
    notify();
    try {
      final user = await _repository.loadAccount();
      email = user.email;
      _savedName = user.displayName;
      displayName = user.displayName;
    } on ApiError catch (e) {
      loadError = e.message;
    } finally {
      loading = false;
      notify();
    }
  }

  void setDisplayName(String v) => _set('displayName', () => displayName = v);
  void setCurrentPassword(String v) => _set('currentPassword', () => currentPassword = v);
  void setNewPassword(String v) => _set('newPassword', () => newPassword = v);

  void _set(String field, void Function() change) {
    change();
    savedMessage = null;
    errors.remove(field);
    notify();
  }

  bool _validate() {
    errors.clear();
    final name = AuthValidators.displayName(displayName);
    if (name != null) errors['displayName'] = name;
    if (_passwordChanging) {
      if (currentPassword.isEmpty) {
        errors['currentPassword'] = 'Enter your current password to set a new one.';
      }
      final pw = AuthValidators.password(newPassword);
      if (pw != null) {
        errors['newPassword'] = pw;
      } else if (newPassword == currentPassword) {
        errors['newPassword'] = 'Use a password different from your current one.';
      }
    }
    return errors.isEmpty;
  }

  /// True when something was saved.
  Future<bool> save() async {
    generalError = null;
    savedMessage = null;
    if (!_nameChanged && !_passwordChanging) {
      generalError = 'Nothing to save: change your name or enter a new password.';
      notify();
      return false;
    }
    if (!_validate()) {
      notify();
      return false;
    }
    busy = true;
    notify();
    final changingPassword = _passwordChanging;
    try {
      final user = await _repository.updateAccount(
        displayName: _nameChanged ? displayName.trim() : null,
        currentPassword: changingPassword ? currentPassword : null,
        newPassword: changingPassword ? newPassword : null,
      );
      _savedName = user.displayName;
      displayName = user.displayName;
      if (changingPassword) {
        currentPassword = '';
        newPassword = '';
        passwordResets++;
        savedMessage = 'Saved. Your password was changed and your other devices were signed out.';
      } else {
        savedMessage = 'Saved.';
      }
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
