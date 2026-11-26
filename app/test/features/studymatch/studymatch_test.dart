import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:studyspot/app.dart';
import 'package:studyspot/core/api/api_error.dart';
import 'package:studyspot/core/location/location_service.dart';
import 'package:studyspot/core/models/studymatch.dart';
import 'package:studyspot/core/routing/router.dart';
import 'package:studyspot/features/studymatch/studymatch_view_model.dart';

import '../../helpers.dart';

/// PB-29 / UC-05: the StudyMatch chat in the app. TC-M2-55..TC-M2-59, TC-M2-67, TC-M2-68,
/// TC-M2-72.
void main() {
  test('TC-M2-55 sending shows the question at once, a progress state, then the answer with places', () async {
    final w = TestWorld(locationAccess: LocationAccess.granted);
    final vm = StudyMatchViewModel(api: w.api, location: w.location);
    vm.setDraft('  a quiet café near me ');
    final states = <bool>[];
    vm.addListener(() => states.add(vm.sending));
    expect(await vm.send(), isTrue);

    expect(
      states.first,
      isTrue,
      reason: 'progress shown while waiting (PERF-007)',
    );
    expect(vm.sending, isFalse);
    expect(vm.messages.map((m) => m.fromStudent), [true, false]);
    expect(vm.messages.first.text, 'a quiet café near me');
    expect(vm.messages.last.answer!.recommendations, hasLength(1));
    expect(vm.draft, isEmpty);
  });

  test('TC-M2-56 location goes with the question only when granted (AI-003, SEN-002)', () async {
    final granted = TestWorld(locationAccess: LocationAccess.granted);
    await (StudyMatchViewModel(
      api: granted.api,
      location: granted.location,
    )..setDraft('quiet')).send();
    expect(granted.api.studyMatchQuestions.single.lat, isNotNull);

    final denied = TestWorld(locationAccess: LocationAccess.denied);
    await (StudyMatchViewModel(
      api: denied.api,
      location: denied.location,
    )..setDraft('quiet')).send();
    expect(denied.api.studyMatchQuestions.single.lat, isNull);
    expect(
      denied.location.requests,
      0,
      reason: 'the chat never asks for permission itself',
    );
  });

  test('TC-M2-72 "background" access counts as granted in StudyMatch too', () async {
    final w = TestWorld(locationAccess: LocationAccess.backgroundGranted);
    await (StudyMatchViewModel(
      api: w.api,
      location: w.location,
    )..setDraft('quiet')).send();
    expect(w.api.studyMatchQuestions.single.lat, isNotNull);
  });

  test(
    'TC-M2-57 limits: empty and 501 characters cannot be sent; 500 can',
    () async {
      final w = TestWorld();
      final vm = StudyMatchViewModel(api: w.api, location: w.location);
      vm.setDraft('   ');
      expect(vm.canSend, isFalse);
      vm.setDraft('x' * 501);
      expect(vm.canSend, isFalse);
      expect(await vm.send(), isFalse);
      vm.setDraft('x' * 500);
      expect(vm.canSend, isTrue);
      expect(await vm.send(), isTrue);
      expect(w.api.studyMatchQuestions, hasLength(1));
    },
  );

  test('TC-M2-58 a failed request shows a message and can be retried without retyping', () async {
    final w = TestWorld();
    final vm = StudyMatchViewModel(api: w.api, location: w.location);
    w.api.failNext = ApiError.network;
    vm.setDraft('quiet');
    await vm.send();
    expect(vm.error, ApiError.network.message);
    expect(vm.canRetry, isTrue);
    expect(vm.messages, hasLength(1), reason: 'the question stays in the chat');

    await vm.retry();
    expect(vm.error, isNull);
    expect(vm.messages.map((m) => m.fromStudent), [true, false]);

    w.api.failNext = const ApiError(
      code: 'RATE_LIMITED',
      statusCode: 429,
      message: 'x',
    );
    vm.setDraft('again');
    await vm.send();
    expect(vm.error, contains('Wait a minute'));
  });

  test('TC-M2-67 a follow-up carries the earlier messages as text: question, reply, place names', () async {
    final w = TestWorld();
    final vm = StudyMatchViewModel(api: w.api, location: w.location);
    final venue = w.api.venues.first;
    await (vm..setDraft('quiet places near me')).send();
    expect(
      w.api.studyMatchQuestions.last.history,
      isEmpty,
      reason: 'the first question has no history',
    );

    await (vm..setDraft('which of those is cheaper?')).send();
    final history = w.api.studyMatchQuestions.last.history;
    expect(history.map((m) => m.toJson()), [
      {'role': 'user', 'text': 'quiet places near me'},
      {
        'role': 'model',
        'text': 'Here are quiet places near you.\nPlaces shown: ${venue.name}',
      },
    ]);

    // An answer to StudyMatch's area question carries the first request too.
    final w2 = TestWorld();
    final vm2 = StudyMatchViewModel(api: w2.api, location: w2.location);
    w2.api.studyMatchAnswer = const StudyMatchAnswer(
      reply: 'Which area would you like to study in?',
      reasonCode: 'NEEDS_INFO',
    );
    await (vm2..setDraft('somewhere quiet')).send();
    await (vm2..setDraft('Zamalek')).send();
    expect(w2.api.studyMatchQuestions.last.history.map((m) => m.text), [
      'somewhere quiet',
      'Which area would you like to study in?',
    ]);
  });

  test('TC-M2-68 history limits: last 3 pairs, 1000 characters, no failed questions, no "unavailable" notice', () async {
    final w = TestWorld();
    final vm = StudyMatchViewModel(api: w.api, location: w.location);
    List<StudyMatchMessage> sent() => w.api.studyMatchQuestions.last.history;

    for (var i = 1; i <= 4; i++) {
      await (vm..setDraft('question $i')).send();
    }
    expect(sent(), hasLength(6), reason: 'exactly 3 pairs before question 4');
    await (vm..setDraft('question 5')).send();
    expect(sent(), hasLength(6));
    expect(sent().first.text, 'question 2');
    expect(sent().map((m) => m.fromStudent), [true, false, true, false, true, false]);

    // A failed question is not sent as history, not even to its own retry.
    w.api.failNext = ApiError.network;
    await (vm..setDraft('failed')).send();
    await vm.retry();
    expect(sent().map((m) => m.text), isNot(contains('failed')));
    expect(sent().map((m) => m.fromStudent), [true, false, true, false, true, false]);
    // Asked anew instead of retried: the unanswered question is skipped.
    w.api.failNext = ApiError.network;
    await (vm..setDraft('never answered')).send();
    await (vm..setDraft('something else')).send();
    expect(sent().map((m) => m.text), isNot(contains('never answered')));
    expect(sent()[4].text, 'failed', reason: 'answered by the retry');

    // A very long reply is cut, but the place names stay.
    w.api.studyMatchAnswer = StudyMatchAnswer(
      reply: 'x' * 3000,
      recommendations: [StudyMatchRecommendation(venue: w.api.venues.first)],
    );
    await (vm..setDraft('long')).send();
    w.api.studyMatchAnswer = StudyMatchAnswer(
      reply: 'Smart matching is unavailable right now.',
      degraded: true,
      reasonCode: 'AI_UNAVAILABLE',
      recommendations: [StudyMatchRecommendation(venue: w.api.venues.first)],
    );
    await (vm..setDraft('next')).send();
    expect(sent().last.text.length, 1000);
    expect(sent().last.text, endsWith('Places shown: ${w.api.venues.first.name}'));

    await (vm..setDraft('after the outage')).send();
    expect(sent().last.text, 'Places shown: ${w.api.venues.first.name}');
  });

  testWidgets('TC-M2-59 home -> Ask StudyMatch -> question; degraded answer shows the notice, '
      '"Standard results" and Open Search', (tester) async {
    expect(protectedRoutes, contains('/studymatch'));
    final w = TestWorld();
    await w.services.session.signIn(
      await w.api.login(email: 'dev@studyspot.test', password: 'devpass123'),
    );
    w.api.studyMatchAnswer = StudyMatchAnswer(
      reply: 'Smart matching is unavailable right now. Use Search to find study places by name or area.',
      degraded: true,
      reasonCode: 'AI_UNAVAILABLE',
      recommendations: [
        StudyMatchRecommendation(
          venue: w.api.venues.first,
          reasons: const ['280 m away.'],
        ),
      ],
    );
    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('home_studymatch')));
    await tester.pumpAndSettle();
    expect(
      find.text('What kind of place are you looking for?'),
      findsOneWidget,
    );

    await tester.enterText(
      find.byKey(const Key('studymatch_input')),
      'quiet place',
    );
    await tester.pump(); // the Send button enables on the next frame
    await tester.tap(find.byKey(const Key('studymatch_send')));
    await tester.pumpAndSettle();

    expect(find.text('quiet place'), findsOneWidget);
    expect(find.byKey(const Key('studymatch_degraded')), findsOneWidget);
    expect(find.text('Standard results'), findsOneWidget);
    expect(find.text(w.api.venues.first.name), findsOneWidget);
    await tester.tap(find.byKey(const Key('studymatch_open_search')));
    await tester.pumpAndSettle();
    final router =
        tester.widget<MaterialApp>(find.byType(MaterialApp)).routerConfig!
            as GoRouter;
    expect(router.routerDelegate.currentConfiguration.uri.path, '/home');
  });
}
