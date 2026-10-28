import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/app.dart';

import 'helpers.dart';

void main() {
  testWidgets('App starts without network and shows the first screen', (tester) async {
    final w = TestWorld(termsAccepted: false, locationAsked: false);
    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();
    expect(find.text('Welcome to StudySpot'), findsOneWidget);
  });
}
