import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/account_view.dart';
import '../../features/auth/edit_account_view.dart';
import '../../features/auth/register_view.dart';
import '../../features/auth/sign_in_view.dart';
import '../../features/auth/terms_view.dart';
import '../../features/auth/welcome_view.dart';
import '../../features/favorites/view.dart';
import '../../features/permissions/location_view.dart';
import '../../features/permissions/presence_prompt_view.dart';
import '../../features/permissions/presence_response_view.dart';
import '../../features/preferences/view.dart';
import '../../features/rewards/coupon_view.dart';
import '../../features/rewards/rewards_view.dart';
import '../../features/search/search_view.dart';
import '../../features/studymatch/studymatch_view.dart';
import '../../features/venue_details/details_view.dart';
import '../layout/breakpoints.dart';
import '../services.dart';
import '../widgets/readable_width.dart';
import 'app_shell.dart';

/// Screens that need a signed-in user (FR-007). Visitors can still search,
/// view places and see the coupons on offer (FR-006).
const protectedRoutes = {
  '/account',
  '/account/edit',
  '/preferences',
  '/favorites',
  '/studymatch',
};

/// Protected screens with an id in the path, e.g. one coupon (PB-27).
const protectedPrefixes = {'/rewards/coupons/'};

bool isProtected(String location) =>
    protectedRoutes.contains(location) ||
    protectedPrefixes.any(location.startsWith);

/// Screen flow (DRS feedback: logical and natural, on a phone and a laptop):
///
///   first launch: /welcome -> sign in / sign up / guest
///                 -> /terms -> /location -> /presence -> chosen destination
///
///   Main places, always one tap away (AppShell: bottom bar on a phone,
///   navigation rail on a tablet or laptop). Each keeps its own history:
///     Explore     /home        search list (+ map beside it on wide screens)
///     Saved       /favorites
///     StudyMatch  /studymatch
///     Rewards     /rewards     points, coupons on offer, my coupons
///     Account     /account     (shows "Sign in" to visitors)
///
///   Task screens open on top, full screen, with a back arrow:
///     /venues/:id, /rewards/coupons/:id, /signin, /register, /account/edit,
///     /preferences, /location, /presence, /presence/respond
///
///   A protected screen sends a visitor to /signin?from=..., and signing in
///   returns them to it. On wide screens every page keeps a readable width.
GoRouter buildRouter(
  AppServices services, {
  GlobalKey<NavigatorState>? navigatorKey,
}) {
  Widget readable(Widget child, [double maxWidth = pageMaxWidth]) =>
      ReadableWidth(maxWidth: maxWidth, child: child);
  Widget tab(WidgetBuilder builder, [double maxWidth = pageMaxWidth]) =>
      readable(SessionKeyed(builder: builder), maxWidth);

  return GoRouter(
    navigatorKey: navigatorKey,
    initialLocation: '/welcome',
    refreshListenable: _SessionListenable(services),
    redirect: (context, state) => appRedirect(
      services,
      location: state.matchedLocation,
      from: state.uri.queryParameters['from'],
      next: state.uri.queryParameters['next'],
      simulatedPresenceResponse: state.uri.queryParameters['demo'] == 'true',
    ),
    routes: [
      GoRoute(
        path: '/welcome',
        builder: (context, state) =>
            readable(const WelcomeView(), formMaxWidth),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home',
                builder: (context, state) => const SearchView(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/favorites',
                builder: (context, state) =>
                    tab((context) => const FavoritesView()),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/studymatch',
                builder: (context, state) =>
                    tab((context) => const StudyMatchView()),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/rewards',
                builder: (context, state) =>
                    tab((context) => const RewardsView(), wideContentMaxWidth),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/account',
                builder: (context, state) =>
                    tab((context) => const AccountView()),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/terms',
        builder: (context, state) => readable(
          TermsView(
            next: _safeOnboardingTarget(state.uri.queryParameters['next']),
          ),
          formMaxWidth,
        ),
      ),
      GoRoute(
        path: '/location',
        builder: (context, state) => readable(
          LocationView(
            next: state.uri.queryParameters['next'] == null
                ? null
                : _safeOnboardingTarget(state.uri.queryParameters['next']),
          ),
          formMaxWidth,
        ),
      ),
      GoRoute(
        path: '/presence',
        builder: (context, state) => readable(
          PresencePromptView(
            onboarding: state.uri.queryParameters['onboarding'] != 'false',
            next: state.uri.queryParameters['next'] == null
                ? null
                : _safeOnboardingTarget(state.uri.queryParameters['next']),
          ),
          formMaxWidth,
        ),
      ),
      GoRoute(
        path: '/presence/respond',
        redirect: (context, state) {
          if (services.session.isSignedIn ||
              state.uri.queryParameters['demo'] == 'true') {
            return null;
          }
          return '/signin?from=${Uri.encodeComponent(state.uri.toString())}';
        },
        builder: (context, state) => readable(
          PresenceResponseView(
            venueId: state.uri.queryParameters['venueId']!,
            venueName: state.uri.queryParameters['venueName'] ?? 'this venue',
            simulated: state.uri.queryParameters['demo'] == 'true',
          ),
          formMaxWidth,
        ),
      ),
      GoRoute(
        path: '/signin',
        builder: (context, state) => readable(
          SignInView(from: state.uri.queryParameters['from']),
          formMaxWidth,
        ),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => readable(
          RegisterView(from: state.uri.queryParameters['from']),
          formMaxWidth,
        ),
      ),
      GoRoute(
        path: '/account/edit',
        builder: (context, state) =>
            readable(const EditAccountView(), formMaxWidth),
      ),
      GoRoute(
        path: '/preferences',
        builder: (context, state) => readable(const PreferencesView()),
      ),
      GoRoute(
        path: '/venues/:id',
        builder: (context, state) =>
            readable(VenueDetailsView(venueId: state.pathParameters['id']!)),
      ),
      GoRoute(
        path: '/rewards/coupons/:id',
        builder: (context, state) => readable(
          CouponView(couponId: state.pathParameters['id']!),
          formMaxWidth,
        ),
      ),
    ],
  );
}

/// Where to send the user instead of [location], or null to stay. Kept as a
/// plain function so the rules can be unit-tested.
String? appRedirect(
  AppServices services, {
  required String location,
  String? from,
  String? next,
  bool simulatedPresenceResponse = false,
}) {
  final flags = services.flags;
  final onboardingTarget = _safeOnboardingTarget(next);

  if (location == '/welcome') {
    return services.session.isSignedIn ? '/home' : null;
  }

  if (!flags.termsAccepted && location != '/terms') {
    return _onboardingRoute('/terms', onboardingTarget);
  }
  if (!flags.locationAsked && location != '/location' && location != '/terms') {
    return _onboardingRoute('/location', onboardingTarget);
  }
  if (flags.locationAsked &&
      !flags.presenceIntroSeen &&
      location != '/presence' &&
      !(simulatedPresenceResponse && location == '/presence/respond') &&
      location != '/terms' &&
      location != '/location') {
    return _onboardingRoute('/presence', onboardingTarget);
  }
  final signedIn = services.session.isSignedIn;
  if (!signedIn && isProtected(location)) {
    return '/signin?from=${Uri.encodeComponent(location)}';
  }
  if (signedIn && (location == '/signin' || location == '/register')) {
    return from == '/account' ? '/home' : from ?? '/home';
  }
  return null;
}

String _safeOnboardingTarget(String? target) =>
    const {'/home', '/signin', '/register'}.contains(target)
    ? target!
    : '/home';

String _onboardingRoute(String route, String target) =>
    target == '/home' ? route : '$route?next=${Uri.encodeComponent(target)}';

/// go_router needs a Flutter Listenable; the session is a plain-Dart
/// ViewModel, so this adapter forwards its changes.
class _SessionListenable extends ChangeNotifier {
  _SessionListenable(AppServices services) {
    services.session.addListener(notifyListeners);
  }
}
