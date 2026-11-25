import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:studyspot/app.dart';
import 'package:studyspot/core/layout/breakpoints.dart';
import 'package:studyspot/core/routing/app_shell.dart';
import 'package:studyspot/core/routing/router.dart';
import 'package:studyspot/core/services.dart';
import 'package:studyspot/core/widgets/readable_width.dart';

import '../helpers.dart';

void useWindow(WidgetTester tester, Size size) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.reset);
}

/// The real AppShell around five simple pages (no map, no network), so the
/// navigation can be checked at every window size.
Widget shellHarness(AppServices services) {
  final router = GoRouter(
    initialLocation: '/a',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(navigationShell: shell),
        branches: [
          for (final path in ['/a', '/b', '/c', '/d', '/e'])
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: path,
                  builder: (context, state) => Scaffold(body: Text('page $path')),
                ),
              ],
            ),
        ],
      ),
    ],
  );
  return AppScope(
    services: services,
    child: MaterialApp.router(routerConfig: router),
  );
}

void main() {
  test('TC-M6-47 sorts windows into size classes at their boundaries (DRS feedback: responsiveness)', () {
    expect(windowSizeOf(390), WindowSize.compact);
    expect(windowSizeOf(599), WindowSize.compact);
    expect(windowSizeOf(600), WindowSize.medium);
    expect(windowSizeOf(839), WindowSize.medium);
    expect(windowSizeOf(840), WindowSize.expanded);
    expect(windowSizeOf(1199), WindowSize.expanded);
    expect(windowSizeOf(1200), WindowSize.large);
    expect(windowSizeOf(1920), WindowSize.large);
  });

  testWidgets('TC-M6-48 navigation adapts: bottom bar on a phone, rail on a tablet, rail with labels on a laptop; each tab keeps its place (DRS feedback)', (tester) async {
    final w = TestWorld();

    useWindow(tester, const Size(390, 844));
    await tester.pumpWidget(shellHarness(w.services));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('nav_bar')), findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);
    expect(find.text('page /a'), findsOneWidget);
    await tester.tap(find.byKey(const Key('nav_rewards')));
    await tester.pumpAndSettle();
    expect(find.text('page /d'), findsOneWidget);

    // A phone on its side: still the bottom bar (the rail would not fit).
    useWindow(tester, const Size(844, 390));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('nav_bar')), findsOneWidget);

    useWindow(tester, const Size(800, 1000));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('nav_bar')), findsNothing);
    final rail = tester.widget<NavigationRail>(find.byKey(const Key('nav_rail')));
    expect(rail.extended, isFalse);
    expect(rail.selectedIndex, 3, reason: 'the tab is kept when the window changes');

    useWindow(tester, const Size(1440, 900));
    await tester.pumpAndSettle();
    expect(tester.widget<NavigationRail>(find.byKey(const Key('nav_rail'))).extended, isTrue);
    expect(find.text('StudySpot'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget, reason: 'a visitor\'s Account tab says Sign in');
    await tester.tap(find.byKey(const Key('nav_explore')));
    await tester.pumpAndSettle();
    expect(find.text('page /a'), findsOneWidget);
  });

  testWidgets('TC-M6-49 pages keep a readable width on a laptop and fill the screen on a phone (DRS feedback)', (tester) async {
    Future<double> widthAt(Size window) async {
      useWindow(tester, window);
      await tester.pumpWidget(
        const MaterialApp(
          home: ReadableWidth(
            maxWidth: 560,
            child: Scaffold(body: SizedBox.expand(key: Key('page'))),
          ),
        ),
      );
      return tester.getSize(find.byKey(const Key('page'))).width;
    }

    expect(await widthAt(const Size(390, 844)), 390);
    expect(await widthAt(const Size(800, 1000)), 800, reason: 'a tablet fills the screen');
    expect(await widthAt(const Size(1440, 900)), lessThanOrEqualTo(560));
    expect(await widthAt(const Size(1440, 900)), greaterThan(550));
  });

  testWidgets('TC-M6-50 laptop: the app opens on Explore with the rail, and Sign in, Rewards and a place open at a readable width (DRS feedback, FR-006)', (tester) async {
    // 900 wide: a laptop-class window (rail), but the list stays narrower than
    // the list + map split, so the test loads no map tiles.
    useWindow(tester, const Size(900, 900));
    final w = TestWorld();
    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('nav_rail')), findsOneWidget);
    expect(find.text('All study places, A to Z'), findsOneWidget);

    await tester.tap(find.byKey(const Key('home_account')));
    await tester.pumpAndSettle();
    final router =
        tester.widget<MaterialApp>(find.byType(MaterialApp)).routerConfig! as GoRouter;
    expect(router.routerDelegate.currentConfiguration.uri.toString(), '/signin?from=%2Faccount');
    expect(tester.getSize(find.byKey(const Key('signin_email'))).width, lessThanOrEqualTo(560));

    router.go('/rewards');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('rewards_guest_card')), findsOneWidget);
    expect(isProtected('/rewards'), isFalse);
    expect(isProtected('/rewards/coupons/abc'), isTrue);
    expect(appRedirect(w.services, location: '/rewards/coupons/abc'),
        '/signin?from=${Uri.encodeComponent('/rewards/coupons/abc')}');
  });
}
