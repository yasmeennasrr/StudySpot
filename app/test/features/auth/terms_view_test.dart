import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/app.dart';

import '../../helpers.dart';

void main() {
  testWidgets('TC-M5-01 first launch shows the terms; Continue only works after accepting',
      (tester) async {
    final w = TestWorld(termsAccepted: false, locationAsked: false);
    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();

    expect(find.text('Terms and privacy notice'), findsOneWidget);
    final button = find.byKey(const Key('terms_continue'));
    expect(tester.widget<FilledButton>(button).onPressed, isNull);

    await tester.tap(find.byKey(const Key('terms_checkbox')));
    await tester.pump();
    expect(tester.widget<FilledButton>(button).onPressed, isNotNull);

    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(w.flags.termsAccepted, isTrue);
    expect(find.text('Find study places near you'), findsOneWidget);
  });
}
