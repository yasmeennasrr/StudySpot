import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/models/rewards.dart';
import '../../core/state/view_model.dart';

/// The Rewards tab (PB-24, PB-25): points, the coupons on offer, and the
/// student's own coupons. Guests see the offers, so they know what points are
/// worth, and are asked to sign in to collect them.
class RewardsViewModel extends ViewModel {
  RewardsViewModel({required this.api, required this.signedIn});

  final ApiClient api;
  final bool signedIn;

  bool loading = false;

  /// Set when the screen could not load at all.
  String? error;

  /// One-time message for a snackbar (a redemption result); read it with
  /// [takeMessage] so it is shown once.
  String? _message;

  PointsSummary? points;
  List<CouponOffer> offers = const [];
  List<Coupon> coupons = const [];

  /// Phones show one list at a time: the offers, or "My coupons".
  bool showMine = false;

  /// The offer being redeemed right now (its button shows progress).
  String? redeemingOfferId;

  bool get hasData => offers.isNotEmpty || coupons.isNotEmpty || points != null;

  String? takeMessage() {
    final m = _message;
    _message = null;
    return m;
  }

  Future<void> load() async {
    loading = true;
    error = null;
    notify();
    try {
      // Together, and every failure is caught (Future.wait waits for all).
      final results = await Future.wait<Object>([
        api.listCouponOffers(),
        if (signedIn) api.getPoints(),
        if (signedIn) api.listMyCoupons(),
      ]);
      offers = results[0] as List<CouponOffer>;
      if (signedIn) {
        points = results[1] as PointsSummary;
        coupons = results[2] as List<Coupon>;
      }
    } on ApiError catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notify();
    }
  }

  void setShowMine(bool value) {
    showMine = value;
    notify();
  }

  bool canAfford(CouponOffer offer) =>
      points != null && points!.balance >= offer.pointCost;

  /// How many more points the student needs for [offer]; 0 if none.
  int shortBy(CouponOffer offer) {
    final balance = points?.balance ?? 0;
    return offer.pointCost > balance ? offer.pointCost - balance : 0;
  }

  int get activeOrReadyCount =>
      coupons.where((c) => c.status != CouponStatus.expired).length;

  /// RWD-006..RWD-009. Returns the new coupon, or null when it failed (the
  /// reason is in the message). On success the list switches to My coupons.
  Future<Coupon?> redeem(CouponOffer offer) async {
    if (redeemingOfferId != null) return null; // one at a time
    redeemingOfferId = offer.id;
    notify();
    try {
      final coupon = await api.redeemCoupon(offer.id);
      coupons = [coupon, ...coupons];
      showMine = true;
      _message = coupon.emailStatus == 'sent'
          ? 'Coupon ready. We e-mailed it to you too.'
          : 'Coupon ready. The e-mail is on its way; you can use it from here.';
      await _refreshPoints();
      return coupon;
    } on ApiError catch (e) {
      _message = e.message;
      // The balance may have changed elsewhere: show the real one.
      if (e.reason == 'INSUFFICIENT_POINTS') await _refreshPoints();
      return null;
    } finally {
      redeemingOfferId = null;
      notify();
    }
  }

  Future<void> _refreshPoints() async {
    try {
      points = await api.getPoints();
    } on ApiError {
      // Keep the last known points; the next load fixes them.
    }
  }
}
