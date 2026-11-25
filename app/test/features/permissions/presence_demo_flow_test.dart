import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/app.dart';
import 'package:studyspot/core/notifications/push_service.dart';
import 'package:studyspot/core/services.dart';

import '../../helpers.dart';

void main() {
  for (final confirmed in [true, false]) {
    testWidgets(
      'PB-31 demo notification opens the simulated ${confirmed ? 'yes' : 'no'} response',
      (tester) async {
        final world = TestWorld(presenceIntroSeen: false);
        final services = AppServices(
          api: world.api,
          tokens: world.tokens,
          flags: world.flags,
          location: world.location,
          push: DemoPushService(),
          noise: world.noise,
          mapTiles: false,
        );
        await tester.pumpWidget(StudySpotApp(services: services));
        await tester.pumpAndSettle();

        await tester.scrollUntilVisible(
          find.byKey(const Key('presence_simulate_notification')),
          200,
        );
        await tester.tap(
          find.byKey(const Key('presence_simulate_notification')),
        );
        await tester.pumpAndSettle();
        expect(
          find.text('Demo notification: Are you at Campus Cafe?'),
          findsOneWidget,
        );

        await tester.tap(find.text('Answer'));
        await tester.pumpAndSettle();
        expect(find.text('Are you at Campus Cafe?'), findsOneWidget);
        expect(
          find.textContaining('will not be sent to the backend'),
          findsOneWidget,
        );

        await tester.tap(
          find.byKey(
            Key(confirmed ? 'presence_response_yes' : 'presence_response_no'),
          ),
        );
        await tester.pumpAndSettle();

        expect(world.api.presencePromptResponses, isEmpty);
        expect(find.textContaining('Demo only:'), findsOneWidget);
      },
    );
  }
}
