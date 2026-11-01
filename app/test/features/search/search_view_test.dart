import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/app.dart';

import '../../helpers.dart';

void main() {
  testWidgets('TC-M6-12 home lists places with labels; tapping one opens its details', (tester) async {
    final w = TestWorld();
    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();

    final first = w.api.venues.reduce((a, b) => a.name.compareTo(b.name) <= 0 ? a : b);
    expect(find.text('All study places, A to Z'), findsOneWidget);
    expect(find.text(first.name), findsOneWidget);

    await tester.tap(find.byKey(Key('venue_${first.id}')));
    await tester.pumpAndSettle();
    expect(find.text('Conditions now'), findsOneWidget);
    expect(find.text('About this place'), findsOneWidget);
    expect(find.textContaining('Current: Low'), findsOneWidget);
    expect(find.textContaining('Estimate based on historical data: Quiet'), findsOneWidget);
  });
}
