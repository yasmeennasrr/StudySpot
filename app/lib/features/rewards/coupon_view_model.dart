import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/models/rewards.dart';
import '../../core/state/view_model.dart';

/// One coupon at the counter (PB-27, UC-14): activate once, then a live
/// 5-minute countdown the staff can check (RWD-017..RWD-020).
class CouponViewModel extends ViewModel {
  CouponViewModel({
    required this.api,
    required this.couponId,
    DateTime Function()? now,
  }) : now = now ?? DateTime.now;

  final ApiClient api;
  final String couponId;

  /// The clock; tests pass a fixed one to check the countdown.
  final DateTime Function() now;

  bool loading = false;
  bool activating = false;

  /// Set when the coupon could not be loaded.
  String? error;

  /// One-time message for a snackbar.
  String? _message;

  Coupon? coupon;

  String? takeMessage() {
    final m = _message;
    _message = null;
    return m;
  }

  /// Expiry is checked here too, so the screen flips to "Expired" the moment
  /// the 5 minutes end, without asking the server.
  CouponStatus? get status => coupon?.statusAt(now());

  Duration get remaining => coupon?.remainingAt(now()) ?? Duration.zero;

  /// 1.0 when just activated, 0.0 when expired.
  double get remainingFraction {
    final c = coupon;
    if (c == null || c.activatedAt == null || c.expiresAt == null) return 0;
    final total = c.expiresAt!.difference(c.activatedAt!).inMilliseconds;
    if (total <= 0) return 0;
    return (remaining.inMilliseconds / total).clamp(0.0, 1.0);
  }

  Future<void> load() async {
    loading = true;
    error = null;
    notify();
    try {
      final mine = await api.listMyCoupons();
      coupon = mine.where((c) => c.id == couponId).firstOrNull;
      if (coupon == null) error = 'This coupon was not found in your account.';
    } on ApiError catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notify();
    }
  }

  /// RWD-017: starts the 5 minutes. Tapping again while it runs shows the
  /// same countdown; after it, the coupon is expired for good (RWD-020).
  Future<void> activate() async {
    if (activating || coupon == null) return;
    activating = true;
    notify();
    try {
      coupon = await api.activateCoupon(couponId);
    } on ApiError catch (e) {
      _message = e.message;
      if (e.reason == 'COUPON_EXPIRED') {
        coupon = coupon!.copyWith(status: CouponStatus.expired);
      }
    } finally {
      activating = false;
      notify();
    }
  }

  /// Called every second by the screen while the countdown runs.
  void tick() => notify();
}
