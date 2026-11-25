import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/services.dart';
import '../../core/widgets/back_or_home_button.dart';
import '../../core/widgets/view_model_builder.dart';
import 'register_view_model.dart';
import 'repository.dart';

/// PB-03: create an account.
class RegisterView extends StatelessWidget {
  const RegisterView({super.key, this.from});

  /// Where to go after success (the protected screen that sent us here).
  final String? from;

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<RegisterViewModel>(
      create: (context) {
        final s = AppScope.of(context);
        return RegisterViewModel(AuthRepository(s.api, s.session));
      },
      builder: (context, vm) => Scaffold(
        appBar: AppBar(
          leading: const BackOrHomeButton(),
          title: const Text('Create account'),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              TextField(
                key: const Key('register_email'),
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: InputDecoration(
                  labelText: 'E-mail',
                  errorText: vm.errors['email'],
                ),
                onChanged: vm.setEmail,
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('register_name'),
                decoration: InputDecoration(
                  labelText: 'Display name',
                  helperText: 'Shown with your reviews. 2 to 30 characters.',
                  errorText: vm.errors['displayName'],
                ),
                onChanged: vm.setDisplayName,
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('register_password'),
                obscureText: true,
                decoration: InputDecoration(
                  labelText: 'Password',
                  helperText: 'At least 8 characters, with a letter and a digit.',
                  errorText: vm.errors['password'],
                ),
                onChanged: vm.setPassword,
              ),
              const SizedBox(height: 20),
              if (vm.generalError != null) ...[
                Text(
                  vm.generalError!,
                  key: const Key('register_error'),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
                const SizedBox(height: 12),
              ],
              FilledButton(
                key: const Key('register_submit'),
                onPressed: vm.busy
                    ? null
                    : () async {
                        final ok = await vm.submit();
                        if (ok && context.mounted) context.go(from ?? '/home');
                      },
                child: vm.busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Create account'),
              ),
              TextButton(
                onPressed: () => context.go(
                    from == null ? '/signin' : '/signin?from=${Uri.encodeComponent(from!)}'),
                child: const Text('Already have an account? Sign in'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
