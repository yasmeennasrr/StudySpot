import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/app.dart';
import 'package:studyspot/core/location/location_service.dart';

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

  testWidgets('TC-M1-93 with a location, "All places" switches the list to every venue', (tester) async {
    final w = TestWorld(locationAccess: LocationAccess.granted);
    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();
    expect(find.text('Near you, nearest first'), findsOneWidget);

    await tester.tap(find.byKey(const Key('scope_all')));
    await tester.pumpAndSettle();
    expect(find.text('All study places, nearest first'), findsOneWidget);
    expect(find.textContaining('km away'), findsWidgets);
  });
}

