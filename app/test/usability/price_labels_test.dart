import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/app.dart';

import '../helpers.dart';

/// PB-43: prices are shown in words, not "E£E£" signs (FR-016). TC-M2-62.
void main() {
  testWidgets(
    'TC-M2-62 place cards and the price filter show Budget / Moderate / Pricey / Luxury, never E£',
    (tester) async {
      final w = TestWorld();
      await tester.pumpWidget(StudySpotApp(services: w.services));
      await tester.pumpAndSettle();
      await continueAsGuest(tester);

      // The mock venues are price level 2 and 3.
      expect(find.textContaining('Moderate'), findsWidgets);
      expect(find.textContaining('Pricey'), findsWidgets);
      expect(find.textContaining('E£'), findsNothing);

      await tester.tap(find.byKey(const Key('search_filters')));
      await tester.pumpAndSettle();
      final price = find.byKey(const Key('filter_price'));
      await tester.scrollUntilVisible(
        price,
        200,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.pumpAndSettle();
      // Open the "Price at most" dropdown: its choices are words.
      await tester.tap(
        find.descendant(of: price, matching: find.byType(DropdownButton<int?>)),
      );
      await tester.pumpAndSettle();
      for (final word in ['Budget', 'Moderate', 'Pricey', 'Luxury']) {
        expect(find.text(word), findsWidgets, reason: word);
      }
      expect(find.textContaining('E£'), findsNothing);
    },
  );
}
