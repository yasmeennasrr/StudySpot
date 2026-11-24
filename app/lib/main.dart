import 'dart:async';

import 'package:flutter/material.dart';

import 'app.dart';
import 'core/api/dio_api_client.dart';
import 'core/auth/token_store.dart';
import 'core/location/location_service.dart';
import 'core/services.dart';
import 'core/storage/local_flags.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final tokens = SecureTokenStore();
  final flags = SharedPrefsFlags();
  await flags.load();

  final services = AppServices(
    api: DioApiClient(tokens: tokens),
    tokens: tokens,
    flags: flags,
    location: GeolocatorLocationService(),
  );
  await services.session.restore();
  _connectPresenceUpdates(services);

  // The free server sleeps when idle; start waking it now, without waiting.
  unawaited(services.api.wakeUp());

  runApp(StudySpotApp(services: services));
}

void _connectPresenceUpdates(AppServices services) {
  services.location.presenceUpdates.listen((position) {
    if (!services.session.isSignedIn ||
        !services.flags.presencePromptsEnabled) {
      return;
    }
    unawaited(_reportPresenceSample(services, position.lat, position.lng));
  });
  services.session.addListener(() => unawaited(_syncPresenceUpdates(services)));
  unawaited(_syncPresenceUpdates(services));
}

Future<void> _syncPresenceUpdates(AppServices services) async {
  if (!services.flags.presencePromptsEnabled ||
      !services.session.isSignedIn) {
    await services.location.stopPresenceUpdates();
    return;
  }

  if (await services.location.currentAccess() !=
      LocationAccess.backgroundGranted) {
    await services.flags.setPresencePromptsEnabled(false);
    await services.location.stopPresenceUpdates();
    return;
  }

  if (await services.location.startPresenceUpdates()) {
    final position = await services.location.currentPosition();
    if (position != null) {
      await _reportPresenceSample(services, position.lat, position.lng);
    }
  }
}

Future<void> _reportPresenceSample(
  AppServices services,
  double lat,
  double lng,
) async {
  try {
    await services.api.reportPresenceLocation(lat: lat, lng: lng);
  } catch (_) {
    // A missed sample is harmless; the next OS update will retry.
  }
}
