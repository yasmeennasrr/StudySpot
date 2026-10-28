import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/features/auth/register_view_model.dart';
import 'package:studyspot/features/auth/repository.dart';
import 'package:studyspot/features/auth/sign_in_view_model.dart';

import '../../helpers.dart';

void main() {
  late TestWorld w;
  late AuthRepository repo;

  setUp(() {
    w = TestWorld();
    repo = AuthRepository(w.api, w.services.session);
  });

  test('TC-M5-06 register: invalid input is not sent; duplicate e-mail shows the backend message', () async {
    final vm = RegisterViewModel(repo)
      ..setEmail('not-an-email')
      ..setPassword('short')
      ..setDisplayName('Z');
    expect(await vm.submit(), isFalse);
    expect(vm.errors.keys, containsAll(['email', 'password', 'displayName']));
    expect(w.api.accounts.length, 1, reason: 'nothing reached the API');

    final dup = RegisterViewModel(repo)
      ..setEmail('DEV@studyspot.test')
      ..setPassword('devpass123')
      ..setDisplayName('Dev');
    expect(await dup.submit(), isFalse);
    expect(dup.generalError, contains('already exists'));
    expect(w.services.session.isSignedIn, isFalse);
  });

  test('TC-M5-07 sign in with correct credentials signs in and stores the tokens', () async {
    final vm = SignInViewModel(repo)
      ..setEmail('dev@studyspot.test')
      ..setPassword('devpass123');
    expect(await vm.submit(), isTrue);
    expect(w.services.session.isSignedIn, isTrue);
    expect(w.tokens.access, isNotNull);
    expect(w.services.session.user?.displayName, 'Dev User');
  });

  test('TC-M5-08 wrong password shows an error and does not sign in', () async {
    final vm = SignInViewModel(repo)
      ..setEmail('dev@studyspot.test')
      ..setPassword('wrongpass1');
    expect(await vm.submit(), isFalse);
    expect(vm.generalError, 'E-mail or password is wrong. Please try again.');
    expect(w.services.session.isSignedIn, isFalse);
    expect(w.tokens.access, isNull);
  });

  test('TC-M5-09 sign out tells the backend and forgets the tokens', () async {
    await repo.signIn(email: 'dev@studyspot.test', password: 'devpass123');
    await repo.signOut();
    expect(w.api.logoutCalls, 1);
    expect(w.tokens.access, isNull);
    expect(w.tokens.refresh, isNull);
    expect(w.services.session.isSignedIn, isFalse);
  });

}
