import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/app.dart';
import 'package:studyspot/core/location/location_service.dart';

import '../../helpers.dart';

void main() {
  testWidgets('PB-31 enabling check-ins requests background updates', (
    tester,
  ) async {
    final w = TestWorld(presenceIntroSeen: false)
      ..location.answerToBackgroundRequest = LocationAccess.backgroundGranted;
    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();

    expect(find.text('Want an “Are you here?” check-in?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('presence_enable')));
    await tester.pumpAndSettle();

    expect(w.location.backgroundRequests, 1);
    expect(w.location.presenceUpdatesStarted, isTrue);
    expect(w.flags.presencePromptsEnabled, isTrue);
    await tester.scrollUntilVisible(
      find.byKey(const Key('presence_continue')),
      200,
    );
    expect(find.byKey(const Key('presence_continue')), findsOneWidget);
  });

  testWidgets('PB-31 not now skips background permission and continues', (
    tester,
  ) async {
    final w = TestWorld(presenceIntroSeen: false);
    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('presence_not_now')));
    await tester.pumpAndSettle();

    expect(w.location.backgroundRequests, 0);
    expect(w.location.presenceUpdatesStarted, isFalse);
    expect(w.flags.presencePromptsEnabled, isFalse);
    expect(w.flags.presenceIntroSeen, isTrue);
  });
}
