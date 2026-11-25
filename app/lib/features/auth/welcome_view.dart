import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Mobile-first entry screen. First-time visitors continue through the
/// existing privacy and permission flow before reaching their chosen page.
class WelcomeView extends StatelessWidget {
  const WelcomeView({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(28, 24, 28, 24),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: constraints.maxHeight - 48,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const SizedBox(height: 12),
                      Column(
                        children: [
                          Container(
                            width: 88,
                            height: 88,
                            decoration: BoxDecoration(
                              color: colors.primaryContainer,
                              borderRadius: BorderRadius.circular(28),
                            ),
                            child: Icon(
                              Icons.local_cafe_rounded,
                              size: 44,
                              color: colors.primary,
                            ),
                          ),
                          const SizedBox(height: 24),
                          Text(
                            'Welcome to StudySpot',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.headlineMedium,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Find your next\nfavorite study spot.',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.headlineSmall?.copyWith(
                              height: 1.2,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Explore nearby cafés, compare study conditions, '
                            'and find a place that fits your day.',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodyLarge?.copyWith(
                              color: colors.onSurfaceVariant,
                              height: 1.45,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 36),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          FilledButton(
                            key: const Key('welcome_signin'),
                            onPressed: () => context.go('/signin?next=/signin'),
                            child: const Text('Sign in'),
                          ),
                          const SizedBox(height: 12),
                          OutlinedButton(
                            key: const Key('welcome_signup'),
                            onPressed: () =>
                                context.go('/register?next=/register'),
                            child: const Text('Create an account'),
                          ),
                          const SizedBox(height: 8),
                          TextButton(
                            key: const Key('welcome_guest'),
                            onPressed: () => context.go('/home'),
                            child: const Text('Continue as a guest'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
