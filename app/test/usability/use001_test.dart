import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/app.dart';

import '../helpers.dart';

/// PB-43 / USE-001: location search is reachable from the main screen in no
/// more than 2 interactions. TC-M2-60.
void main() {
  testWidgets(
    'TC-M2-60 search is on the main screen: one tap focuses it, so typing needs at most 2 interactions',
    (tester) async {
      final w = TestWorld();
      await tester.pumpWidget(StudySpotApp(services: w.services));
      await tester.pumpAndSettle();

      // 0 interactions: the app opens on the main screen with the search field visible.
      final field = find.byKey(const Key('search_field'));
      expect(field, findsOneWidget);
      expect(
        tester.getRect(field).top,
        lessThan(
          tester.view.physicalSize.height / tester.view.devicePixelRatio,
        ),
      );

      // 1 interaction: tapping it puts the cursor in the field, ready to type.
      var interactions = 0;
      await tester.tap(field);
      interactions++;
      await tester.pumpAndSettle();
      final editable = tester.widget<EditableText>(
        find.descendant(of: field, matching: find.byType(EditableText)),
      );
      expect(editable.focusNode.hasFocus, isTrue);
      expect(interactions, lessThanOrEqualTo(2));
    },
  );
}
