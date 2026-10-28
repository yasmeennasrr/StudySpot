import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

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

  @override
  void dispose() {
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      services: widget.services,
      child: MaterialApp.router(
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
