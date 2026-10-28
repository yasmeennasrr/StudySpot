import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/services.dart';
import '../../core/widgets/back_or_home_button.dart';
import '../../core/widgets/view_model_builder.dart';
import 'repository.dart';
import 'sign_in_view_model.dart';

/// PB-04: sign in.
class SignInView extends StatelessWidget {
  const SignInView({super.key, this.from});

  final String? from;

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<SignInViewModel>(
      create: (context) {
        final s = AppScope.of(context);
        final expired = s.session.expiredMessage;
        s.session.expiredMessage = null;
        return SignInViewModel(AuthRepository(s.api, s.session),
            expiredMessage: expired);
      },
      builder: (context, vm) {
        Future<void> done(bool ok) async {
          if (ok && context.mounted) context.go(from ?? '/home');
        }

        return Scaffold(
          appBar: AppBar(
            leading: const BackOrHomeButton(),
            title: const Text('Sign in'),
          ),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                if (vm.expiredMessage != null) ...[
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.lock_clock),
                      title: Text(vm.expiredMessage!),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                TextField(
                  key: const Key('signin_email'),
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
                  key: const Key('signin_password'),
                  obscureText: true,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    errorText: vm.errors['password'],
                  ),
                  onChanged: vm.setPassword,
                ),
                const SizedBox(height: 20),
                if (vm.generalError != null) ...[
                  Text(
                    vm.generalError!,
                    key: const Key('signin_error'),
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                  const SizedBox(height: 12),
                ],
                FilledButton(
                  key: const Key('signin_submit'),
                  onPressed: vm.busy ? null : () async => done(await vm.submit()),
                  child: vm.busy
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Sign in'),
                ),
                TextButton(
                  onPressed: () => context.go(from == null
                      ? '/register'
                      : '/register?from=${Uri.encodeComponent(from!)}'),
                  child: const Text('New here? Create an account'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
