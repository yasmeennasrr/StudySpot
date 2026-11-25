import '../../core/models/rewards.dart';

/// Display rules for points and coupons. Plain Dart, so each rule is unit tested.

String _two(int n) => n.toString().padLeft(2, '0');

/// RWD-019: the countdown, as m:ss ("4:59", "0:07"); never negative.
String countdownText(Duration left) {
  final seconds = left.isNegative ? 0 : (left.inMilliseconds / 1000).ceil();
  return '${seconds ~/ 60}:${_two(seconds % 60)}';
}

/// A clock time with seconds ("14:05:09"), in the phone's time zone.
String clockText(DateTime time) {
  final t = time.toLocal();
  return '${_two(t.hour)}:${_two(t.minute)}:${_two(t.second)}';
}

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// "24 Nov 2026".
String dateText(DateTime time) {
  final t = time.toLocal();
  return '${t.day} ${_months[t.month - 1]} ${t.year}';
}

String pointsText(int points) => points == 1 ? '1 point' : '$points points';

String statusText(CouponStatus status) => switch (status) {
  CouponStatus.issued => 'Ready to use',
  CouponStatus.active => 'Active',
  CouponStatus.expired => 'Expired',
};

/// PB-26: what happened to the coupon e-mail (SDS 6.6.9).
String emailStatusText(String emailStatus) => switch (emailStatus) {
  'sent' => 'E-mailed to you',
  'failed' => 'The e-mail could not be sent. Use the coupon from here.',
  _ => 'The e-mail is on its way. You can use the coupon from here.',
};
