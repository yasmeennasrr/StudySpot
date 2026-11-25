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
  late final GoRouter _router = buildRouter(widget.services);
  final _scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();
  StreamSubscription? _foregroundPushSubscription;
  StreamSubscription? _openedPushSubscription;

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
    _router.dispose();
    super.dispose();
  }

  void _showPresencePrompt(PresencePushMessage pushMessage) {
    final message = pushMessage.simulated
        ? 'Demo notification: Are you at ${pushMessage.venueName}?'
        : 'Are you at ${pushMessage.venueName}?';
    _scaffoldMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          action: SnackBarAction(
            label: 'Answer',
            onPressed: () => _openPresencePrompt(
              pushMessage.venueId,
              pushMessage.venueName,
              simulated: pushMessage.simulated,
            ),
          ),
        ),
      );
  }

  void _openPresencePrompt(
    String venueId,
    String venueName, {
    bool simulated = false,
  }) {
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
        scaffoldMessengerKey: _scaffoldMessengerKey,
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
