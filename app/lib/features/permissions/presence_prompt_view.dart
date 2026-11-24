import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/location/location_service.dart';
import '../../core/services.dart';

/// PB-31: show the optional background-location feature during onboarding.
class PresencePromptView extends StatefulWidget {
  const PresencePromptView({super.key, this.onboarding = true});

  final bool onboarding;

  @override
  State<PresencePromptView> createState() => _PresencePromptViewState();
}

class _PresencePromptViewState extends State<PresencePromptView> {
  bool _busy = false;
  bool _enabled = false;
  String? _message;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final services = AppScope.of(context);
    _enabled = services.flags.presencePromptsEnabled;
  }

  Future<void> _enable() async {
    final services = AppScope.of(context);
    setState(() {
      _busy = true;
      _message = null;
    });
    final result = await services.location.requestBackgroundAccess();
    if (!mounted) return;
    final granted = result == LocationAccess.backgroundGranted;
    await services.flags.setPresencePromptsEnabled(granted);
    setState(() {
      _busy = false;
      _enabled = granted;
      _message = granted
          ? 'Background location is enabled. StudySpot will ask you to confirm '
                'before counting you as present.'
          : switch (result) {
              LocationAccess.serviceOff =>
                'Location is turned off on this phone. You can enable it in '
                    'phone settings; receipt check-ins still work.',
              LocationAccess.deniedForever =>
                'Background location is blocked for StudySpot. You can change '
                    'that in phone settings; receipt check-ins still work.',
              _ =>
                'Background location was not enabled. You can still use '
                    'foreground location and receipt check-ins.',
            };
    });
  }

  Future<void> _skip() async {
    final flags = AppScope.of(context).flags;
    await flags.setPresencePromptsEnabled(false);
    await flags.markPresenceIntroSeen();
    if (mounted) _leave();
  }

  Future<void> _disable() async {
    await AppScope.of(context).flags.setPresencePromptsEnabled(false);
    if (!mounted) return;
    setState(() {
      _enabled = false;
      _message =
          'Presence prompts are off. You can still use nearby search '
          'and receipt check-ins.';
    });
  }

  Future<void> _continue() async {
    await AppScope.of(context).flags.markPresenceIntroSeen();
    if (mounted) _leave();
  }

  void _leave() {
    if (widget.onboarding) {
      context.go('/home');
    } else {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.onboarding ? 'Presence check-ins' : 'Presence settings',
        ),
        leading: widget.onboarding ? null : const BackButton(),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Icon(
                Icons.notifications_active_outlined,
                size: 72,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(height: 24),
              Text(
                'Want an “Are you here?” check-in?',
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              const Text(
                'If background location suggests you may have been at a venue '
                'for around 15 minutes, StudySpot can send at most one check-in '
                'prompt during that visit. We only count you after you confirm. '
                'Location updates depend on your phone and may not arrive at '
                'fixed times.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                'This is optional. Nearby search and receipt check-ins still '
                'work if you skip it.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium,
              ),
              if (_message != null) ...[
                const SizedBox(height: 16),
                Text(
                  _message!,
                  textAlign: TextAlign.center,
                  key: const Key('presence_permission_status'),
                ),
              ],
              const Spacer(),
              if (_enabled)
                OutlinedButton(
                  key: const Key('presence_disable'),
                  onPressed: _busy ? null : _disable,
                  child: const Text('Turn off check-ins'),
                )
              else
                FilledButton(
                  key: const Key('presence_enable'),
                  onPressed: _busy ? null : _enable,
                  child: Text(
                    _busy ? 'Requesting access…' : 'Enable check-ins',
                  ),
                ),
              const SizedBox(height: 8),
              if (widget.onboarding)
                TextButton(
                  key: const Key('presence_not_now'),
                  onPressed: _busy ? null : _skip,
                  child: const Text('Not now'),
                )
              else
                TextButton(
                  key: const Key('presence_settings_done'),
                  onPressed: _busy ? null : _continue,
                  child: const Text('Done'),
                ),
              if (_enabled && widget.onboarding)
                TextButton(
                  key: const Key('presence_continue'),
                  onPressed: _continue,
                  child: const Text('Continue'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
