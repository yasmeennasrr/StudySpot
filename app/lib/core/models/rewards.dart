// Hand-written from contracts/openapi.yaml (PointsSummary, CouponOffer,
// Coupon). Field names are identical to the spec. Plain Dart: no Flutter.

int _int(Object? v) => (v as num?)?.toInt() ?? 0;
DateTime? _time(Object? v) => v is String ? DateTime.parse(v) : null;

/// GET /me/points (PB-24, RWD-004, RWD-016).
class PointsSummary {
  const PointsSummary({
    required this.balance,
    required this.earnedToday,
    required this.dailyCap,
    required this.crowdPoints,
    required this.noisePoints,
    required this.wifiPoints,
  });

  final int balance;

  /// Survey points earned today (Cairo calendar day).
  final int earnedToday;
  final int dailyCap;

  /// Points one answer earns, per category (configurable by an admin).
  final int crowdPoints;
  final int noisePoints;
  final int wifiPoints;

  /// Points still possible from surveys today.
  int get leftToday => (dailyCap - earnedToday).clamp(0, dailyCap);

  /// 0.0 .. 1.0, for the progress bar.
  double get todayProgress =>
      dailyCap <= 0 ? 0 : (earnedToday / dailyCap).clamp(0.0, 1.0);

  /// The most one survey can earn (all three questions answered).
  int get perSurvey => crowdPoints + noisePoints + wifiPoints;

  factory PointsSummary.fromJson(Map<String, dynamic> json) {
    final per = (json['perCategory'] as Map?)?.cast<String, dynamic>() ?? const {};
    return PointsSummary(
      balance: _int(json['balance']),
      earnedToday: _int(json['earnedToday']),
      dailyCap: _int(json['dailyCap']),
      crowdPoints: _int(per['crowd']),
      noisePoints: _int(per['noise']),
      wifiPoints: _int(per['wifi']),
    );
  }
}

/// A coupon a venue offers for points (RWD-005).
class CouponOffer {
  const CouponOffer({
    required this.id,
    required this.venueId,
    required this.venueName,
    required this.reward,
    required this.pointCost,
  });

  final String id;
  final String venueId;
  final String venueName;
  final String reward;
  final int pointCost;

  factory CouponOffer.fromJson(Map<String, dynamic> json) => CouponOffer(
    id: json['id'] as String,
    venueId: json['venueId'] as String,
    venueName: (json['venueName'] as String?) ?? '',
    reward: json['reward'] as String,
    pointCost: _int(json['pointCost']),
  );
}

/// issued -> active (5 minutes) -> expired. Never back (RWD-017..RWD-020).
enum CouponStatus { issued, active, expired }

/// A coupon the student holds (RWD-021).
class Coupon {
  const Coupon({
    required this.id,
    required this.code,
    required this.reward,
    required this.venueId,
    required this.venueName,
    required this.pointCost,
    required this.status,
    required this.redeemedAt,
    this.activatedAt,
    this.expiresAt,
    this.emailStatus = 'pending',
  });

  final String id;

  /// XXXX-XXXX, shown to the staff at the counter.
  final String code;
  final String reward;
  final String venueId;
  final String venueName;
  final int pointCost;

  /// As the server last said. Use [statusAt] to show it: expiry is also
  /// checked on the phone, so the countdown never shows a negative time.
  final CouponStatus status;
  final DateTime redeemedAt;
  final DateTime? activatedAt;

  /// activatedAt + 5 minutes (RWD-018).
  final DateTime? expiresAt;

  /// pending (not sent yet or waiting for a retry), sent, or failed.
  final String emailStatus;

  CouponStatus statusAt(DateTime now) {
    final end = expiresAt;
    if (status == CouponStatus.active && end != null && !now.isBefore(end)) {
      return CouponStatus.expired;
    }
    return status;
  }

  /// Time left on an active coupon; zero otherwise.
  Duration remainingAt(DateTime now) {
    final end = expiresAt;
    if (statusAt(now) != CouponStatus.active || end == null) return Duration.zero;
    return end.difference(now);
  }

  static CouponStatus _status(Object? v) => switch (v) {
    'active' => CouponStatus.active,
    'expired' => CouponStatus.expired,
    _ => CouponStatus.issued,
  };

  factory Coupon.fromJson(Map<String, dynamic> json) => Coupon(
    id: json['id'] as String,
    code: json['code'] as String,
    reward: json['reward'] as String,
    venueId: (json['venueId'] as String?) ?? '',
    venueName: (json['venueName'] as String?) ?? '',
    pointCost: _int(json['pointCost']),
    status: _status(json['status']),
    redeemedAt: _time(json['redeemedAt']) ?? DateTime.now(),
    activatedAt: _time(json['activatedAt']),
    expiresAt: _time(json['expiresAt']),
    emailStatus: (json['emailStatus'] as String?) ?? 'pending',
  );

  Coupon copyWith({
    CouponStatus? status,
    DateTime? activatedAt,
    DateTime? expiresAt,
    String? emailStatus,
  }) => Coupon(
    id: id,
    code: code,
    reward: reward,
    venueId: venueId,
    venueName: venueName,
    pointCost: pointCost,
    status: status ?? this.status,
    redeemedAt: redeemedAt,
    activatedAt: activatedAt ?? this.activatedAt,
    expiresAt: expiresAt ?? this.expiresAt,
    emailStatus: emailStatus ?? this.emailStatus,
  );
}
