import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/services.dart';
import '../../core/widgets/back_or_home_button.dart';

/// The signed-in user's hub: preferences, favorites, sign out (FR-004).
class AccountView extends StatefulWidget {
  const AccountView({super.key});

  @override
  State<AccountView> createState() => _AccountViewState();
}

class _AccountViewState extends State<AccountView> {
  bool _signingOut = false;

  Future<void> _signOut() async {
    setState(() => _signingOut = true);
    final session = AppScope.of(context).session;
    // Leave this protected screen first, so the router does not bounce the
    // user to the sign-in screen when the session ends.
    context.go('/home');
    await session.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final user = AppScope.of(context).session.user;
    return Scaffold(
      appBar: AppBar(
        leading: const BackOrHomeButton(),
        title: const Text('My account'),
      ),
      body: ListView(
        children: [
          ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person)),
            title: Text(user?.displayName ?? 'Signed in'),
            subtitle: user == null ? null : Text(user.email),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.tune),
            title: const Text('Study preferences'),
            onTap: () => context.push('/preferences'),
          ),
          ListTile(
            leading: const Icon(Icons.favorite_border),
            title: const Text('Favorites'),
            onTap: () => context.push('/favorites'),
          ),
          ListTile(
            leading: const Icon(Icons.location_on_outlined),
            title: const Text('Location settings'),
            onTap: () => context.push('/location'),
          ),
          const Divider(),
          ListTile(
            key: const Key('account_signout'),
            leading: const Icon(Icons.logout),
            title: const Text('Sign out'),
            enabled: !_signingOut,
            onTap: _signOut,
          ),
        ],
      ),
    );
  }
}
