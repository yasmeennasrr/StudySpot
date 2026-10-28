import 'package:flutter/widgets.dart';

import 'api/api_client.dart';
import 'auth/session.dart';
import 'auth/token_store.dart';
import 'location/location_service.dart';
import 'storage/local_flags.dart';

/// The app's shared objects, created once in main.dart. Tests build their own
/// with MockApiClient, MemoryTokenStore, MemoryFlags and FakeLocationService.
class AppServices {
  AppServices({
    required this.api,
    required this.tokens,
    required this.flags,
    required this.location,
  }) : session = Session(api: api, tokens: tokens);

  final ApiClient api;
  final TokenStore tokens;
  final LocalFlags flags;
  final LocationService location;
  final Session session;
}

/// Makes [AppServices] reachable from any widget: `AppScope.of(context)`.
class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.services, required super.child});

  final AppServices services;

  static AppServices of(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'No AppScope above this widget');
    return scope!.services;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) => oldWidget.services != services;
}
