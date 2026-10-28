import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/routing/router.dart';

import '../helpers.dart';

void main() {
  test('TC-M5-15 visitors can browse; protected screens send them to sign-in and back', () async {
    final w = TestWorld();

    // FR-006: a visitor stays on home.
    expect(appRedirect(w.services, location: '/home'), isNull);

    // FR-007: protected screens need sign-in, remembering where to return.
    for (final route in protectedRoutes) {
      expect(appRedirect(w.services, location: route),
          '/signin?from=${Uri.encodeComponent(route)}');
    }

    // After signing in, the sign-in screen forwards to the saved place.
    await w.services.session
        .signIn(await w.api.login(email: 'dev@studyspot.test', password: 'devpass123'));
    expect(appRedirect(w.services, location: '/signin', from: '/favorites'), '/favorites');
    expect(appRedirect(w.services, location: '/favorites'), isNull);

    // PRIV-011: nothing opens before the terms are accepted.
    w.flags.termsAccepted = false;
    expect(appRedirect(w.services, location: '/home'), '/terms');
  });
}
