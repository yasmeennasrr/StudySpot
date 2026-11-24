import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:studyspot/core/services.dart';
import 'package:studyspot/features/permissions/presence_response_view.dart';

import '../../helpers.dart';

void main() {
  for (final confirmed in [true, false]) {
    testWidgets(
      'PB-31 submits ${confirmed ? 'yes' : 'no'} and returns to the app',
      (tester) async {
        final world = TestWorld();
        final router = GoRouter(
          initialLocation: '/presence/respond',
          routes: [
            GoRoute(
              path: '/presence/respond',
              builder: (context, state) => const PresenceResponseView(
                venueId: 'venue-123',
                venueName: 'Campus Cafe',
              ),
            ),
            GoRoute(
              path: '/home',
              builder: (context, state) => const Scaffold(body: Text('Home')),
            ),
          ],
        );

        await tester.pumpWidget(
          AppScope(
            services: world.services,
            child: MaterialApp.router(routerConfig: router),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Are you at Campus Cafe?'), findsOneWidget);

        await tester.tap(
          find.byKey(
            Key(confirmed ? 'presence_response_yes' : 'presence_response_no'),
          ),
        );
        await tester.pumpAndSettle();

        expect(world.api.presencePromptResponses, [
          (venueId: 'venue-123', confirmed: confirmed),
        ]);
        expect(find.text('Home'), findsOneWidget);
        router.dispose();
      },
    );
  }
}
