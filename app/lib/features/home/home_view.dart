import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/services.dart';

/// Temporary home screen from M5. M6 replaces the body with the search list
/// and map (features/search, features/map); keep the account button.
class HomeView extends StatefulWidget {
  const HomeView({super.key});

  @override
  State<HomeView> createState() => _HomeViewState();
}

class _HomeViewState extends State<HomeView> {
  late final AppServices _services;

  @override
  void initState() {
    super.initState();
    _services = AppScope.of(context);
    _services.session.addListener(_rebuild);
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _services.session.removeListener(_rebuild);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = _services.session.isSignedIn;
    final area = _services.flags.manualArea;
    return Scaffold(
      appBar: AppBar(
        title: const Text('StudySpot'),
        actions: [
          IconButton(
            key: const Key('home_account'),
            tooltip: signedIn ? 'My account' : 'Sign in',
            icon: Icon(signedIn ? Icons.account_circle : Icons.login),
            onPressed: () => context.push(signedIn ? '/account' : '/signin'),
          ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.local_cafe, size: 64),
              const SizedBox(height: 16),
              const Text(
                'Search and map screens are coming from M6.',
                textAlign: TextAlign.center,
              ),
              if (area != null) ...[
                const SizedBox(height: 8),
                Text('Searching around: $area', key: const Key('home_area')),
              ],
              const SizedBox(height: 24),
              OutlinedButton.icon(
                onPressed: () => context.push('/preferences'),
                icon: const Icon(Icons.tune),
                label: const Text('Study preferences'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => context.push('/favorites'),
                icon: const Icon(Icons.favorite_border),
                label: const Text('Favorites'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
