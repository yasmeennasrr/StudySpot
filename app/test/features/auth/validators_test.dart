import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/features/auth/validators.dart';

void main() {
  test('TC-M5-02 e-mail: valid, missing @, missing domain, empty (EP)', () {
    expect(AuthValidators.email('student@aucegypt.edu'), isNull);
    expect(AuthValidators.email('  student@aucegypt.edu  '), isNull);
    expect(AuthValidators.email('student.aucegypt.edu'), isNotNull);
    expect(AuthValidators.email('student@aucegypt'), isNotNull);
    expect(AuthValidators.email(''), 'Enter your e-mail.');
  });

  test('TC-M5-03 password length boundaries: 7 rejected, 8 accepted, 128 ok, 129 rejected (BVA)', () {
    expect(AuthValidators.password('abcdef1'), 'Use at least 8 characters.');
    expect(AuthValidators.password('abcdefg1'), isNull);
    expect(AuthValidators.password('a1${'x' * 126}'), isNull);
    expect(AuthValidators.password('a1${'x' * 127}'), 'Use at most 128 characters.');
  });

  test('TC-M5-04 password needs a letter and a digit (EP)', () {
    expect(AuthValidators.password('abcdefgh'), 'Include at least one digit.');
    expect(AuthValidators.password('12345678'), 'Include at least one letter.');
    expect(AuthValidators.password('study2026'), isNull);
  });

  test('TC-M5-05 display name boundaries: 1 rejected, 2 and 30 accepted, 31 rejected (BVA)', () {
    expect(AuthValidators.displayName('Z'), 'Use at least 2 characters.');
    expect(AuthValidators.displayName('Zi'), isNull);
    expect(AuthValidators.displayName('Z' * 30), isNull);
    expect(AuthValidators.displayName('Z' * 31), 'Use at most 30 characters.');
  });
}
