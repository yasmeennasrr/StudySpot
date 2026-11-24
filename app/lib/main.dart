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

  // Resume optional background updates only when the user enabled the feature
  // and the OS still grants Always/background access.
  if (flags.presencePromptsEnabled) {
    if (await services.location.currentAccess() ==
        LocationAccess.backgroundGranted) {
      await services.location.startPresenceUpdates();
    } else {
      await flags.setPresencePromptsEnabled(false);
    }
  }

  // The free server sleeps when idle; start waking it now, without waiting.
  unawaited(services.api.wakeUp());

  runApp(StudySpotApp(services: services));
}
