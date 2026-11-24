import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'dart:async';

import 'core/routing/router.dart';
import 'core/services.dart';

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
        .listen(
          (message) => _showPresencePrompt(message.venueId, message.venueName),
        );
    _openedPushSubscription = widget.services.push.openedMessages.listen(
      (message) => _openPresencePrompt(message.venueId, message.venueName),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final message = await widget.services.push.initialMessage();
      if (mounted && message != null) {
        _openPresencePrompt(message.venueId, message.venueName);
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

  void _showPresencePrompt(String venueId, String venueName) {
    _scaffoldMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('Are you at $venueName?'),
          action: SnackBarAction(
            label: 'Answer',
            onPressed: () => _openPresencePrompt(venueId, venueName),
          ),
        ),
      );
  }

  void _openPresencePrompt(String venueId, String venueName) {
    _router.go(
      '/presence/respond?venueId=${Uri.encodeQueryComponent(venueId)}'
      '&venueName=${Uri.encodeQueryComponent(venueName)}',
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
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2E6B5E)),
          useMaterial3: true,
        ),
        routerConfig: _router,
      ),
    );
  }
}
