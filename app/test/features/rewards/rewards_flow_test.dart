import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/app.dart';

import '../../helpers.dart';

/// A phone-sized window (390 x 844 points).
void usePhone(WidgetTester tester) {
  tester.view.devicePixelRatio = 3;
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  addTearDown(tester.view.reset);
}

void main() {
  testWidgets('TC-M6-45 phone: Rewards tab -> redeem a coupon -> My coupons -> activate at the counter -> live countdown (UC-13, UC-14)', (tester) async {
    usePhone(tester);
    final w = TestWorld();
    await w.services.session.signIn(
      await w.api.login(email: 'dev@studyspot.test', password: 'devpass123'),
    );
    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();
    await continueAsGuest(tester);

    // A phone gets the bottom navigation bar.
    expect(find.byKey(const Key('nav_bar')), findsOneWidget);
    await tester.tap(find.byKey(const Key('nav_rewards')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('rewards_balance')), findsOneWidget);
    expect(find.text('120'), findsOneWidget);
    expect(find.text('Today: 30 of 100 points from surveys'), findsOneWidget);

    final offer = w.api.couponOffers.first; // 30 points
    await tester.tap(find.byKey(Key('redeem_${offer.id}')));
    await tester.pumpAndSettle();
    expect(find.text('Redeem 30 points?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('redeem_confirm')));
    await tester.pumpAndSettle();

    expect(find.text('Coupon ready. We e-mailed it to you too.'), findsOneWidget);
    expect(find.text('90'), findsOneWidget);
    final coupon = w.api.coupons.single;
    expect(find.byKey(Key('coupon_${coupon.id}')), findsOneWidget);
    expect(find.text('My coupons (1)'), findsOneWidget);

    await tester.tap(find.byKey(Key('coupon_${coupon.id}')));
    await tester.pumpAndSettle();
    expect(find.text(coupon.code), findsOneWidget);
    expect(find.text('Ready to use'), findsOneWidget);
    expect(find.byKey(const Key('coupon_email_status')), findsOneWidget);

    await tester.tap(find.byKey(const Key('coupon_activate')));
    await tester.pumpAndSettle();
    expect(find.text('Start the 5-minute timer now?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('coupon_activate_confirm')));
    await tester.pump();
    await tester.pump();

    expect(find.text('Active'), findsOneWidget);
    expect(find.byKey(const Key('coupon_countdown')), findsOneWidget);
    final countdown = tester.widget<Text>(find.byKey(const Key('coupon_countdown'))).data!;
    expect(countdown, anyOf('5:00', '4:59'));
    expect(find.byKey(const Key('coupon_live_clock')), findsOneWidget);
    expect(find.textContaining('Activated at'), findsOneWidget);
  });

  testWidgets('TC-M6-46 phone: a guest sees the offers and a sign-in card, with no Redeem buttons (FR-006, RWD-005)', (tester) async {
    usePhone(tester);
    final w = TestWorld();
    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();
    await continueAsGuest(tester);

    await tester.tap(find.byKey(const Key('nav_rewards')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('rewards_guest_card')), findsOneWidget);
    expect(find.text('Free Turkish coffee'), findsOneWidget);
    expect(find.text('Redeem'), findsNothing);
    expect(find.text('Sign in'), findsWidgets); // card button and the Account tab label

    await tester.tap(find.byKey(const Key('rewards_signin')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('signin_email')), 'dev@studyspot.test');
    await tester.enterText(find.byKey(const Key('signin_password')), 'devpass123');
    await tester.tap(find.byKey(const Key('signin_submit')));
    await tester.pumpAndSettle();

    // Back on Rewards, now with points (the tab was rebuilt for the new session).
    expect(find.byKey(const Key('rewards_balance')), findsOneWidget);
    expect(find.byKey(const Key('rewards_guest_card')), findsNothing);
  });
}
