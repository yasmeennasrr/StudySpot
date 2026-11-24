import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/services.dart';

/// Response to the notification sent after a possible 15-minute venue visit.
class PresenceResponseView extends StatefulWidget {
  const PresenceResponseView({
    super.key,
    required this.venueId,
    required this.venueName,
  });

  final String venueId;
  final String venueName;

  @override
  State<PresenceResponseView> createState() => _PresenceResponseViewState();
}

class _PresenceResponseViewState extends State<PresenceResponseView> {
  bool _busy = false;
  String? _error;

  Future<void> _respond(bool confirmed) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final accepted = await AppScope.of(context).api.respondToPresencePrompt(
        venueId: widget.venueId,
        confirmed: confirmed,
      );
      if (!mounted) return;
      if (!accepted) {
        setState(() {
          _busy = false;
          _error = 'This check-in has already been answered or has expired.';
        });
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            confirmed
                ? 'Thanks. You count as present for this visit.'
                : 'Thanks. You will not count as present for this visit.',
          ),
        ),
      );
      context.go('/home');
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'We couldn’t save your response. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Presence check-in')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 48),
              const Icon(Icons.location_on_outlined, size: 64),
              const SizedBox(height: 24),
              Text(
                'Are you at ${widget.venueName}?',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              const Text(
                'Your answer helps estimate how busy this study place is. '
                'Your presence is counted only if you confirm.',
                textAlign: TextAlign.center,
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              const Spacer(),
              FilledButton(
                key: const Key('presence_response_yes'),
                onPressed: _busy ? null : () => _respond(true),
                child: Text(_busy ? 'Saving…' : 'Yes, I’m here'),
              ),
              OutlinedButton(
                key: const Key('presence_response_no'),
                onPressed: _busy ? null : () => _respond(false),
                child: const Text('No, I’m not here'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
