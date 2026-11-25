import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/services.dart';

/// PRIV-011: at first launch, before any account exists, show the terms and
/// privacy notice (what is collected, why, how long) and require acceptance.
class TermsView extends StatefulWidget {
  const TermsView({super.key});

  @override
  State<TermsView> createState() => _TermsViewState();
}

class _TermsViewState extends State<TermsView> {
  bool _accepted = false;

  Future<void> _continue() async {
    await AppScope.of(context).flags.acceptTerms();
    if (!mounted) return;
    context.go('/location');
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Welcome to StudySpot')),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Text('Terms and privacy notice', style: text.titleLarge),
                  const SizedBox(height: 12),
                  const Text(
                    'StudySpot helps you find places to study. Before you start, '
                    'please read what we collect and why.',
                  ),
                  const SizedBox(height: 16),
                  const _Point(
                    title: 'Your account',
                    body: 'E-mail, display name and a password (stored only as a '
                        'secure hash). Used to sign you in and to send coupons. '
                        'Kept until you delete your account.',
                  ),
                  const _Point(
                    title: 'Your location',
                    body: 'Only if you allow it. Used to show places near you and '
                        'to estimate how busy a place is. Never shown to other '
                        'users. Presence records are deleted after 2 hours.',
                  ),
                  const _Point(
                    title: 'Microphone',
                    body: 'Only if you allow it, for a short noise check at a '
                        'venue. The recording is never stored; only the level '
                        '(Quiet, Moderate or Noisy) is kept.',
                  ),
                  const _Point(
                    title: 'Surveys and reviews',
                    body: 'Your answers about crowd, noise and Wi-Fi are shown '
                        'without your name. Survey records are deleted after '
                        '90 days.',
                  ),
                  const _Point(
                    title: 'Your choices',
                    body: 'You can refuse any permission and keep using the app. '
                        'You can change permissions at any time in your phone '
                        'settings.',
                  ),
                ],
              ),
            ),
            CheckboxListTile(
              key: const Key('terms_checkbox'),
              value: _accepted,
              onChanged: (v) => setState(() => _accepted = v ?? false),
              title: const Text('I have read and accept the terms and privacy notice'),
              controlAffinity: ListTileControlAffinity.leading,
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  key: const Key('terms_continue'),
                  onPressed: _accepted ? _continue : null,
                  child: const Text('Continue'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Point extends StatelessWidget {
  const _Point({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(body),
        ],
      ),
    );
  }
}
