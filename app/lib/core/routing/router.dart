import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/account_view.dart';
import '../../features/auth/register_view.dart';
import '../../features/auth/sign_in_view.dart';
import '../../features/auth/terms_view.dart';
import '../../features/favorites/view.dart';
import '../../features/home/home_view.dart';
import '../../features/permissions/location_view.dart';
import '../../features/preferences/view.dart';
import '../services.dart';

/// Screens that need a signed-in user (FR-007). Visitors can still search and
/// view places (FR-006). M6: add protected routes here if you create any.
const protectedRoutes = {'/account', '/preferences', '/favorites'};

/// Screen flow:
///   first launch: /terms -> /location -> /home
///   /home -> search, map, details (M6) and /signin or /account
///   /signin <-> /register; protected screens redirect to /signin?from=...
GoRouter buildRouter(AppServices services) {
  return GoRouter(
    initialLocation: '/home',
    refreshListenable: _SessionListenable(services),
    redirect: (context, state) => appRedirect(
      services,
      location: state.matchedLocation,
      from: state.uri.queryParameters['from'],
    ),
    routes: [
      GoRoute(path: '/terms', builder: (context, state) => const TermsView()),
      GoRoute(path: '/location', builder: (context, state) => const LocationView()),
      GoRoute(path: '/home', builder: (context, state) => const HomeView()),
      GoRoute(
        path: '/signin',
        builder: (context, state) =>
            SignInView(from: state.uri.queryParameters['from']),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) =>
            RegisterView(from: state.uri.queryParameters['from']),
      ),
      GoRoute(path: '/account', builder: (context, state) => const AccountView()),
      GoRoute(path: '/preferences', builder: (context, state) => const PreferencesView()),
      GoRoute(path: '/favorites', builder: (context, state) => const FavoritesView()),
      // M6: /venues/:id (details), search and map routes go here.
    ],
  );
}

/// Where to send the user instead of [location], or null to stay. Kept as a
/// plain function so the rules can be unit-tested.
String? appRedirect(AppServices services, {required String location, String? from}) {
  final flags = services.flags;
  if (!flags.termsAccepted) return location == '/terms' ? null : '/terms';
  if (!flags.locationAsked && location != '/location' && location != '/terms') {
    return '/location';
  }
  final signedIn = services.session.isSignedIn;
  if (!signedIn && protectedRoutes.contains(location)) {
    return '/signin?from=${Uri.encodeComponent(location)}';
  }
  if (signedIn && (location == '/signin' || location == '/register')) {
    return from ?? '/home';
  }
  return null;
}

/// go_router needs a Flutter Listenable; the session is a plain-Dart
/// ViewModel, so this adapter forwards its changes.
class _SessionListenable extends ChangeNotifier {
  _SessionListenable(AppServices services) {
    services.session.addListener(notifyListeners);
  }
}
