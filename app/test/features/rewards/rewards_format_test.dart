import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/models/rewards.dart';
import 'package:studyspot/features/rewards/rewards_format.dart';

void main() {
  test('TC-M6-38 shows the countdown as m:ss, never negative, and the e-mail status in words (RWD-019, RWD-014)', () {
    expect(countdownText(const Duration(minutes: 5)), '5:00');
    expect(countdownText(const Duration(minutes: 4, seconds: 59, milliseconds: 1)), '5:00');
    expect(countdownText(const Duration(minutes: 4, seconds: 59)), '4:59');
    expect(countdownText(const Duration(seconds: 7)), '0:07');
    expect(countdownText(const Duration(milliseconds: 1)), '0:01');
    expect(countdownText(Duration.zero), '0:00');
    expect(countdownText(const Duration(seconds: -3)), '0:00');

    expect(clockText(DateTime(2026, 11, 24, 9, 5, 3)), '09:05:03');
    expect(dateText(DateTime(2026, 11, 24, 23, 0)), '24 Nov 2026');
    expect(pointsText(1), '1 point');
    expect(pointsText(30), '30 points');

    expect(statusText(CouponStatus.issued), 'Ready to use');
    expect(statusText(CouponStatus.active), 'Active');
    expect(statusText(CouponStatus.expired), 'Expired');
    expect(emailStatusText('sent'), 'E-mailed to you');
    expect(emailStatusText('pending'), contains('on its way'));
    expect(emailStatusText('failed'), contains('could not be sent'));
  });

  test('TC-M6-39 reads points and coupons from the API and checks expiry on the phone (RWD-004, RWD-018, RWD-021)', () {
    final points = PointsSummary.fromJson({
      'balance': 120,
      'earnedToday': 90,
      'dailyCap': 100,
      'perCategory': {'crowd': 10, 'noise': 10, 'wifi': 10},
    });
    expect(points.balance, 120);
    expect(points.leftToday, 10);
    expect(points.todayProgress, closeTo(0.9, 1e-9));
    expect(points.perSurvey, 30);
    expect(
      PointsSummary.fromJson({'balance': 0, 'earnedToday': 130, 'dailyCap': 100}).leftToday,
      0,
    );

    final activatedAt = DateTime.utc(2026, 11, 24, 10);
    final coupon = Coupon.fromJson({
      'id': 'c1',
      'code': 'K7QM-4TXD',
      'reward': 'Free espresso',
      'venueId': 'v1',
      'venueName': 'Quiet Corner',
      'pointCost': 30,
      'status': 'active',
      'redeemedAt': '2026-11-24T09:00:00.000Z',
      'activatedAt': '2026-11-24T10:00:00.000Z',
      'expiresAt': '2026-11-24T10:05:00.000Z',
      'emailStatus': 'sent',
    });
    expect(coupon.status, CouponStatus.active);
    expect(coupon.activatedAt, activatedAt);
    DateTime at(int seconds) => activatedAt.add(Duration(seconds: seconds));
    expect(coupon.statusAt(at(0)), CouponStatus.active);
    expect(coupon.remainingAt(at(0)), const Duration(minutes: 5));
    expect(coupon.statusAt(at(299)), CouponStatus.active);
    expect(coupon.remainingAt(at(299)), const Duration(seconds: 1));
    expect(coupon.statusAt(at(300)), CouponStatus.expired);
    expect(coupon.remainingAt(at(300)), Duration.zero);

    final issued = Coupon.fromJson({
      'id': 'c2',
      'code': 'AAAA-2222',
      'reward': 'Free tea',
      'pointCost': 10,
      'status': 'issued',
      'redeemedAt': '2026-11-24T09:00:00.000Z',
      'activatedAt': null,
      'expiresAt': null,
      'emailStatus': 'pending',
    });
    expect(issued.statusAt(at(100000)), CouponStatus.issued);
    expect(issued.remainingAt(at(0)), Duration.zero);
  });
}
