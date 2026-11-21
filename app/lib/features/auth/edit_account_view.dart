import 'package:flutter/material.dart';

import '../../core/services.dart';
import '../../core/widgets/back_or_home_button.dart';
import '../../core/widgets/error_view.dart';
import '../../core/widgets/view_model_builder.dart';
import 'edit_account_view_model.dart';
import 'repository.dart';

/// PB-05: edit the display name and change the password (FR-005, UC-02).
class EditAccountView extends StatelessWidget {
  const EditAccountView({super.key});

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<EditAccountViewModel>(
      create: (context) {
        final s = AppScope.of(context);
        return EditAccountViewModel(AuthRepository(s.api, s.session));
      },
      onReady: (vm) => vm.load(),
      builder: (context, vm) => Scaffold(
        appBar: AppBar(
          leading: const BackOrHomeButton(),
          title: const Text('Edit account'),
        ),
        body: SafeArea(
          child: vm.loading
              ? const Center(child: CircularProgressIndicator())
              : vm.loadError != null
                  ? ErrorView(message: vm.loadError!, onRetry: vm.load)
                  : _EditAccountForm(vm: vm),
        ),
      ),
    );
  }
}

class _EditAccountForm extends StatefulWidget {
  const _EditAccountForm({required this.vm});

  final EditAccountViewModel vm;

  @override
  State<_EditAccountForm> createState() => _EditAccountFormState();
}

class _EditAccountFormState extends State<_EditAccountForm> {
  late final _name = TextEditingController(text: widget.vm.displayName);
  final _current = TextEditingController();
  final _new = TextEditingController();
  late int _resets = widget.vm.passwordResets;

  @override
  void didUpdateWidget(covariant _EditAccountForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    // After a password change the view model empties the password fields.
    if (widget.vm.passwordResets != _resets) {
      _resets = widget.vm.passwordResets;
      _current.clear();
      _new.clear();
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _current.dispose();
    _new.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final vm = widget.vm;
    final colors = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        InputDecorator(
          decoration: const InputDecoration(
            labelText: 'E-mail',
            helperText: 'Your e-mail cannot be changed.',
            enabled: false,
          ),
          child: Text(vm.email, key: const Key('edit_account_email')),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('edit_account_name'),
          controller: _name,
          decoration: InputDecoration(
            labelText: 'Display name',
            helperText: 'Shown with your reviews. 2 to 30 characters.',
            errorText: vm.errors['displayName'],
          ),
          onChanged: vm.setDisplayName,
        ),
        const SizedBox(height: 24),
        Text('Change password', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        const Text('Leave these empty to keep your password.'),
        const SizedBox(height: 8),
        TextField(
          key: const Key('edit_account_current_password'),
          controller: _current,
          obscureText: true,
          autofillHints: const [AutofillHints.password],
          decoration: InputDecoration(
            labelText: 'Current password',
            errorText: vm.errors['currentPassword'],
          ),
          onChanged: vm.setCurrentPassword,
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('edit_account_new_password'),
          controller: _new,
          obscureText: true,
          autofillHints: const [AutofillHints.newPassword],
          decoration: InputDecoration(
            labelText: 'New password',
            helperText: 'At least 8 characters, with a letter and a digit.',
            errorText: vm.errors['newPassword'],
          ),
          onChanged: vm.setNewPassword,
        ),
        const SizedBox(height: 20),
        if (vm.generalError != null) ...[
          Text(
            vm.generalError!,
            key: const Key('edit_account_error'),
            style: TextStyle(color: colors.error),
          ),
          const SizedBox(height: 12),
        ],
        if (vm.savedMessage != null) ...[
          Text(vm.savedMessage!, key: const Key('edit_account_saved')),
          const SizedBox(height: 12),
        ],
        FilledButton(
          key: const Key('edit_account_save'),
          onPressed: vm.busy ? null : vm.save,
          child: vm.busy
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Save changes'),
        ),
      ],
    );
  }
}
