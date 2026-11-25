import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'dart:async';

import 'core/routing/router.dart';
import 'core/notifications/push_service.dart';
import 'core/services.dart';
import 'core/theme/app_theme.dart';

class StudySpotApp extends StatefulWidget {
  const StudySpotApp({super.key, required this.services});

  final AppServices services;

  @override
  State<StudySpotApp> createState() => _StudySpotAppState();
}

class _StudySpotAppState extends State<StudySpotApp> {
  final _rootNavigatorKey = GlobalKey<NavigatorState>();
  late final GoRouter _router = buildRouter(
    widget.services,
    navigatorKey: _rootNavigatorKey,
  );
  StreamSubscription? _foregroundPushSubscription;
  StreamSubscription? _openedPushSubscription;
  OverlayEntry? _presenceNotificationEntry;
  Timer? _presenceNotificationTimer;

  @override
  void initState() {
    super.initState();
    _foregroundPushSubscription = widget.services.push.foregroundMessages
        .listen(_showPresencePrompt);
    _openedPushSubscription = widget.services.push.openedMessages.listen(
      (message) => _openPresencePrompt(
        message.venueId,
        message.venueName,
        simulated: message.simulated,
      ),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final message = await widget.services.push.initialMessage();
      if (mounted && message != null) {
        _openPresencePrompt(
          message.venueId,
          message.venueName,
          simulated: message.simulated,
        );
      }
    });
  }

  @override
  void dispose() {
    unawaited(_foregroundPushSubscription?.cancel());
    unawaited(_openedPushSubscription?.cancel());
    _hidePresenceNotification();
    _router.dispose();
    super.dispose();
  }

  void _showPresencePrompt(PresencePushMessage pushMessage) {
    _hidePresenceNotification();
    final overlay = _rootNavigatorKey.currentState?.overlay;
    if (overlay == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showPresencePrompt(pushMessage);
      });
      return;
    }

    final entry = OverlayEntry(
      builder: (context) => Positioned(
        top: MediaQuery.viewPaddingOf(context).top + 8,
        left: 12,
        right: 12,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: _PresenceHeadsUpNotification(
              venueName: pushMessage.venueName,
              onOpen: () {
                _hidePresenceNotification();
                _openPresencePrompt(
                  pushMessage.venueId,
                  pushMessage.venueName,
                  simulated: pushMessage.simulated,
                );
              },
              onDismiss: _hidePresenceNotification,
            ),
          ),
        ),
      ),
    );
    _presenceNotificationEntry = entry;
    overlay.insert(entry);
    _presenceNotificationTimer = Timer(
      const Duration(seconds: 6),
      _hidePresenceNotification,
    );
  }

  void _hidePresenceNotification() {
    _presenceNotificationTimer?.cancel();
    _presenceNotificationTimer = null;
    final entry = _presenceNotificationEntry;
    _presenceNotificationEntry = null;
    if (entry != null) {
      entry.remove();
      entry.dispose();
    }
  }

  void _openPresencePrompt(
    String venueId,
    String venueName, {
    bool simulated = false,
  }) {
    _hidePresenceNotification();
    _router.go(
      '/presence/respond?venueId=${Uri.encodeQueryComponent(venueId)}'
      '&venueName=${Uri.encodeQueryComponent(venueName)}'
      '${simulated ? '&demo=true' : ''}',
    );
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      services: widget.services,
      child: MaterialApp.router(
        title: 'StudySpot',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: ThemeMode.system,
        routerConfig: _router,
      ),
    );
  }
}

class _PresenceHeadsUpNotification extends StatelessWidget {
  const _PresenceHeadsUpNotification({
    required this.venueName,
    required this.onOpen,
    required this.onDismiss,
  });

  final String venueName;
  final VoidCallback onOpen;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(18),
      side: BorderSide(color: colors.outlineVariant),
    );

    return Material(
      key: const Key('presence_heads_up_notification'),
      color: colors.surfaceContainerLowest,
      elevation: 8,
      shadowColor: colors.shadow.withValues(alpha: 0.18),
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 8, 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: colors.primaryContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.local_cafe_rounded,
                  color: colors.primary,
                  size: 21,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'StudySpot',
                            style: theme.textTheme.labelLarge,
                          ),
                        ),
                        Text(
                          'now',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: colors.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'Are you at $venueName?',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium,
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: onOpen,
                        child: const Text('Answer'),
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Dismiss notification',
                visualDensity: VisualDensity.compact,
                onPressed: onDismiss,
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
