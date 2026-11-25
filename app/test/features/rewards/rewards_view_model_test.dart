import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/api/api_error.dart';
import 'package:studyspot/core/models/rewards.dart';
import 'package:studyspot/features/rewards/coupon_view_model.dart';
import 'package:studyspot/features/rewards/rewards_view_model.dart';

import '../../helpers.dart';

void main() {
  test('TC-M6-40 a signed-in student sees points, offers cheapest first and no coupons yet; a guest sees offers only (RWD-004, RWD-005)', () async {
    final w = TestWorld();
    final vm = RewardsViewModel(api: w.api, signedIn: true);
    await vm.load();
    expect(vm.error, isNull);
    expect(vm.points!.balance, 120);
    expect(vm.points!.earnedToday, 30);
    expect(vm.offers.map((o) => o.pointCost), [30, 80, 150]);
    expect(vm.coupons, isEmpty);
    expect(vm.canAfford(vm.offers[0]), isTrue);
    expect(vm.canAfford(vm.offers[2]), isFalse);
    expect(vm.shortBy(vm.offers[2]), 30);
    expect(vm.shortBy(vm.offers[0]), 0);

    final guest = RewardsViewModel(api: w.api, signedIn: false);
    await guest.load();
    expect(guest.points, isNull);
    expect(guest.offers, hasLength(3));
    expect(guest.canAfford(guest.offers[0]), isFalse);
  });

  test('TC-M6-41 redeeming lowers the balance, lists the coupon first and says it was e-mailed; too few points changes nothing (RWD-006..RWD-009, RWD-014)', () async {
    final w = TestWorld();
    final vm = RewardsViewModel(api: w.api, signedIn: true);
    await vm.load();

    final coupon = await vm.redeem(vm.offers[1]); // 80 of 120
    expect(coupon, isNotNull);
    expect(coupon!.status, CouponStatus.issued);
    expect(vm.points!.balance, 40);
    expect(vm.coupons.first.id, coupon.id);
    expect(vm.showMine, isTrue);
    expect(vm.takeMessage(), 'Coupon ready. We e-mailed it to you too.');
    expect(vm.takeMessage(), isNull, reason: 'shown once');

    // 40 left: the 80-point offer again is refused, and nothing changes.
    expect(await vm.redeem(vm.offers[1]), isNull);
    expect(vm.takeMessage(), 'You need 40 more points for this coupon. Your points have not changed.');
    expect(vm.points!.balance, 40);
    expect(vm.coupons, hasLength(1));
    expect(w.api.pointsBalance, 40);

    // The e-mail is late: the coupon is still there, and the message says so.
    w.api.couponEmailFails = true;
    final late = await vm.redeem(vm.offers[0]);
    expect(late!.emailStatus, 'pending');
    expect(vm.takeMessage(), contains('on its way'));
    expect(vm.activeOrReadyCount, 2);
  });

  test('TC-M6-42 a failed load shows the error and a retry works (EIR-011, USE-008)', () async {
    final w = TestWorld();
    w.api.failNext = ApiError.network;
    final vm = RewardsViewModel(api: w.api, signedIn: true);
    await vm.load();
    expect(vm.error, ApiError.network.message);
    expect(vm.loading, isFalse);
    await vm.load();
    expect(vm.error, isNull);
    expect(vm.offers, isNotEmpty);
  });

  test('TC-M6-43 activating starts a 5-minute countdown once; at 5:00 it expires and cannot be activated again (RWD-017, RWD-018, RWD-020)', () async {
    final w = TestWorld();
    var clock = DateTime(2026, 11, 24, 10);
    w.api.now = () => clock;
    final redeemed = await w.api.redeemCoupon(w.api.couponOffers.first.id);

    final vm = CouponViewModel(api: w.api, couponId: redeemed.id, now: () => clock);
    await vm.load();
    expect(vm.status, CouponStatus.issued);
    expect(vm.remaining, Duration.zero);

    await vm.activate();
    expect(vm.status, CouponStatus.active);
    expect(vm.remaining, const Duration(minutes: 5));
    expect(vm.remainingFraction, 1.0);

    clock = clock.add(const Duration(minutes: 2));
    await vm.activate(); // a second tap: same timer
    expect(vm.coupon!.activatedAt, DateTime(2026, 11, 24, 10));
    expect(vm.remaining, const Duration(minutes: 3));
    expect(vm.remainingFraction, closeTo(0.6, 1e-9));

    clock = clock.add(const Duration(minutes: 2, seconds: 59));
    expect(vm.status, CouponStatus.active);
    clock = clock.add(const Duration(seconds: 1));
    expect(vm.status, CouponStatus.expired, reason: 'checked on the phone at 5:00');

    await vm.activate();
    expect(vm.status, CouponStatus.expired);
    expect(vm.takeMessage(), contains('activated only once'));
    expect(w.api.pointsBalance, 90, reason: 'no refund');
  });

  test('TC-M6-44 a coupon that is not in the account shows an error', () async {
    final w = TestWorld();
    final vm = CouponViewModel(api: w.api, couponId: 'missing');
    await vm.load();
    expect(vm.coupon, isNull);
    expect(vm.error, 'This coupon was not found in your account.');
  });
}
