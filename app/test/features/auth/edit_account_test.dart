import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:studyspot/app.dart';
import 'package:studyspot/core/routing/router.dart';
import 'package:studyspot/features/auth/edit_account_view_model.dart';
import 'package:studyspot/features/auth/repository.dart';

import '../../helpers.dart';

/// PB-05 / UC-02 (FR-005): edit account in the app. TC-M2-21..TC-M2-25.
/// The backend side is TC-M2-15..TC-M2-20.
void main() {
  late TestWorld w;
  late AuthRepository repo;

  Future<EditAccountViewModel> signedInForm() async {
    await repo.signIn(email: 'dev@studyspot.test', password: 'devpass123');
    final vm = EditAccountViewModel(repo);
    await vm.load();
    return vm;
  }

  setUp(() {
    w = TestWorld();
    repo = AuthRepository(w.api, w.services.session);
  });

  test('TC-M2-21 the form loads the account; a name-only change sends only the name', () async {
    final vm = await signedInForm();
    expect(vm.email, 'dev@studyspot.test');
    expect(vm.displayName, 'Dev User');
    final tokensBefore = w.tokens.access;

    vm.setDisplayName('  Karma  ');
    expect(await vm.save(), isTrue);

    expect(w.api.accountUpdates.single, {'displayName': 'Karma'});
    expect(vm.savedMessage, 'Saved.');
    expect(w.services.session.user?.displayName, 'Karma');
    expect(w.tokens.access, tokensBefore, reason: 'no password change, same session');
  });

  test('TC-M2-22 invalid input is not sent: short name, new password without the current one, '
      'same or weak password, nothing changed', () async {
    final vm = await signedInForm();

    expect(await vm.save(), isFalse);
    expect(vm.generalError, startsWith('Nothing to save'));

    vm.setDisplayName('K');
    expect(await vm.save(), isFalse);
    expect(vm.errors.keys, ['displayName']);

    vm
      ..setDisplayName('Dev User')
      ..setNewPassword('newpass456');
    expect(await vm.save(), isFalse);
    expect(vm.errors['currentPassword'], 'Enter your current password to set a new one.');

    vm
      ..setCurrentPassword('devpass123')
      ..setNewPassword('devpass123');
    expect(await vm.save(), isFalse);
    expect(vm.errors['newPassword'], 'Use a password different from your current one.');

    vm.setNewPassword('abcdefgh');
    expect(await vm.save(), isFalse);
    expect(vm.errors['newPassword'], 'Include at least one digit.');

    expect(w.api.accountUpdates, isEmpty, reason: 'nothing reached the API');
  });

  test('TC-M2-23 a wrong current password shows the backend message and keeps the user signed in', () async {
    final vm = await signedInForm();
    vm
      ..setCurrentPassword('wrongpass1')
      ..setNewPassword('newpass456');

    expect(await vm.save(), isFalse);
    expect(vm.errors['currentPassword'], contains('not correct'));
    expect(vm.generalError, contains('Nothing was changed'));
    expect(w.services.session.isSignedIn, isTrue);
    expect(w.api.accounts['dev@studyspot.test'], 'devpass123');
  });

  test('TC-M2-24 a password change stores the new session tokens and clears the password fields', () async {
    final vm = await signedInForm();
    final refreshBefore = w.tokens.refresh;
    final resetsBefore = vm.passwordResets;
    vm
      ..setCurrentPassword('devpass123')
      ..setNewPassword('newpass456');

    expect(await vm.save(), isTrue);

    expect(w.tokens.refresh, isNot(refreshBefore));
    expect(w.tokens.refresh, isNotNull);
    expect(w.services.session.isSignedIn, isTrue);
    expect(vm.currentPassword, isEmpty);
    expect(vm.newPassword, isEmpty);
    expect(vm.passwordResets, resetsBefore + 1);
    expect(vm.savedMessage, contains('other devices were signed out'));
    expect(w.api.accounts['dev@studyspot.test'], 'newpass456');
  });

  testWidgets('TC-M2-25 My account -> Edit account: change the name, save, and see it on My account',
      (tester) async {
    expect(protectedRoutes, contains('/account/edit'));
    await w.services.session
        .signIn(await w.api.login(email: 'dev@studyspot.test', password: 'devpass123'));
    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();

    final router = tester.widget<MaterialApp>(find.byType(MaterialApp)).routerConfig! as GoRouter;
    router.go('/account');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('account_edit')));
    await tester.pumpAndSettle();

    expect(find.text('Edit account'), findsWidgets);
    expect(find.text('dev@studyspot.test'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('edit_account_name')), 'Karma');
    await tester.tap(find.byKey(const Key('edit_account_save')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('edit_account_saved')), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    expect(find.text('Karma'), findsOneWidget);
  });
}
