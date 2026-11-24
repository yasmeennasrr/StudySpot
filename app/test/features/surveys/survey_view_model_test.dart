import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/api/api_error.dart';
import 'package:studyspot/core/models/survey.dart';
import 'package:studyspot/features/surveys/repository.dart';
import 'package:studyspot/features/surveys/survey_section.dart';
import 'package:studyspot/features/surveys/view_model.dart';

import '../../helpers.dart';

void main() {
  test('TC-M4-41 survey requires at least one answer and reports save failures', () async {
    final world = TestWorld();
    final venueId = world.api.venues.first.id;
    final form = SurveyFormViewModel(SurveysRepository(world.api), venueId: venueId);

    expect(form.canSubmit, isFalse);
    expect(await form.submit(), isNull);
    expect(form.error, 'Answer at least one question.');

    form.setCrowd('slightly_crowded');
    expect(form.canSubmit, isTrue);
    final saved = await form.submit();
    expect(saved, isNotNull);
    expect(world.api.surveySubmissions, [
      {'venueId': venueId, 'crowd': 'slightly_crowded'},
    ]);

    final failed = SurveyFormViewModel(SurveysRepository(world.api), venueId: venueId);
    failed.setWifi('good');
    world.api.failNext = ApiError.network;
    expect(await failed.submit(), isNull);
    expect(failed.error, ApiError.network.message);
  });

  testWidgets('TC-M4-42 quick survey lets users skip questions and submits selected answers',
      (tester) async {
    final world = TestWorld();
    final venueId = world.api.venues.first.id;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => showModalBottomSheet<StoredSurvey>(
              context: context,
              isScrollControlled: true,
              builder: (_) => SurveySheet(
                repository: SurveysRepository(world.api),
                venueId: venueId,
              ),
            ),
            child: const Text('Open survey'),
          ),
        ),
      ),
    ));

    await tester.tap(find.text('Open survey'));
    await tester.pumpAndSettle();
    expect(find.textContaining('You can skip any question.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('crowd-very_crowded')));
    await tester.ensureVisible(find.byKey(const Key('wifi-good')));
    await tester.tap(find.byKey(const Key('wifi-good')));
    await tester.tap(find.byKey(const Key('submit-survey')));
    await tester.pumpAndSettle();

    expect(world.api.surveySubmissions, [
      {'venueId': venueId, 'crowd': 'very_crowded', 'wifi': 'good'},
    ]);
    expect(find.text('Submit survey'), findsNothing);
  });
}
