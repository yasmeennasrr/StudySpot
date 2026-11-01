// Hand-written from contracts/openapi.yaml (VenueSummary, SearchResult,
// ConditionValue, VenueConditions, VenueDetails, Review). Field names are
// identical to the spec.

double? _d(Object? v) => (v as num?)?.toDouble();
int? _i(Object? v) => (v as num?)?.toInt();
Map<String, dynamic>? _m(Object? v) =>
    v is Map ? v.cast<String, dynamic>() : null;

/// One dynamic value (RT-004): crowd, noise or Wi-Fi.
class ConditionValue {
  const ConditionValue({
    required this.status,
    this.level,
    this.label,
    this.newestInputAt,
    this.basedOn = const [],
    this.isEstimate = false,
  });

  /// current | hours_ago | historical | unavailable
  final String status;
  final int? level;
  final String? label;
  final DateTime? newestInputAt;

  /// present_users | surveys | audio | historical
  final List<String> basedOn;
  final bool isEstimate;

  static const unavailable = ConditionValue(status: 'unavailable');

  factory ConditionValue.fromJson(Map<String, dynamic>? json) {
    if (json == null) return unavailable;
    final at = json['newestInputAt'] as String?;
    return ConditionValue(
      status: (json['status'] as String?) ?? 'unavailable',
      level: _i(json['level']),
      label: json['label'] as String?,
      newestInputAt: at == null ? null : DateTime.tryParse(at),
      basedOn: ((json['basedOn'] as List?) ?? const []).cast<String>(),
      isEstimate: (json['isEstimate'] as bool?) ?? false,
    );
  }
}

class VenueConditions {
  const VenueConditions({
    this.crowd = ConditionValue.unavailable,
    this.noise = ConditionValue.unavailable,
    this.wifi = ConditionValue.unavailable,
  });

  final ConditionValue crowd;
  final ConditionValue noise;
  final ConditionValue wifi;

  factory VenueConditions.fromJson(Map<String, dynamic>? json) => VenueConditions(
        crowd: ConditionValue.fromJson(_m(json?['crowd'])),
        noise: ConditionValue.fromJson(_m(json?['noise'])),
        wifi: ConditionValue.fromJson(_m(json?['wifi'])),
      );
}

/// Opening hours: day 0 (Sunday) .. 6 (Saturday) -> ranges "HH:MM"-"HH:MM".
/// A missing day means closed; null means not known.
typedef OpeningHours = Map<int, List<({String open, String close})>>;

OpeningHours? _hours(Object? v) {
  if (v is! Map) return null;
  final out = <int, List<({String open, String close})>>{};
  v.forEach((day, ranges) {
    final d = int.tryParse('$day');
    if (d == null || ranges is! List) return;
    out[d] = [
      for (final r in ranges)
        if (r is Map) (open: '${r['open']}', close: '${r['close']}'),
    ];
  });
  return out;
}

class VenueSummary {
  const VenueSummary({
    required this.id,
    required this.name,
    this.lat,
    this.lng,
    this.address,
    this.area,
    this.priceLevel,
    this.wifiAvailable,
    this.outletsAvailable,
    this.studyType,
    this.distanceMeters,
    this.openNow,
    this.averageRating,
    this.reviewCount = 0,
    this.conditions,
  });

  final String id;
  final String name;
  final double? lat;
  final double? lng;
  final String? address;
  final String? area;
  final int? priceLevel;
  final bool? wifiAvailable;
  final bool? outletsAvailable;

  /// individual | group | both
  final String? studyType;
  final int? distanceMeters;
  final bool? openNow;
  final double? averageRating;
  final int reviewCount;
  final VenueConditions? conditions;

  bool get hasLocation => lat != null && lng != null;

  factory VenueSummary.fromJson(Map<String, dynamic> json) {
    final location = _m(json['location']);
    return VenueSummary(
      id: json['id'] as String,
      name: json['name'] as String,
      lat: _d(location?['lat']),
      lng: _d(location?['lng']),
      address: json['address'] as String?,
      area: json['area'] as String?,
      priceLevel: _i(json['priceLevel']),
      wifiAvailable: json['wifiAvailable'] as bool?,
      outletsAvailable: json['outletsAvailable'] as bool?,
      studyType: json['studyType'] as String?,
      distanceMeters: _i(json['distanceMeters']),
      openNow: json['openNow'] as bool?,
      averageRating: _d(json['averageRating']),
      reviewCount: _i(json['reviewCount']) ?? 0,
      conditions: json['conditions'] == null
          ? null
          : VenueConditions.fromJson(_m(json['conditions'])),
    );
  }
}

class SearchResult {
  const SearchResult({required this.items, this.degraded = false});

  final List<VenueSummary> items;

  /// True when the maps service failed and only name search ran (EIR-011).
  final bool degraded;

  factory SearchResult.fromJson(Map<String, dynamic> json) => SearchResult(
        items: ((json['items'] as List?) ?? const [])
            .map((e) => VenueSummary.fromJson((e as Map).cast<String, dynamic>()))
            .toList(),
        degraded: (json['degraded'] as bool?) ?? false,
      );
}

class Review {
  const Review({
    required this.rating,
    required this.authorDisplayName,
    required this.createdAt,
    this.text,
  });

  final int rating;
  final String? text;
  final String authorDisplayName;
  final DateTime createdAt;

  factory Review.fromJson(Map<String, dynamic> json) => Review(
        rating: _i(json['rating']) ?? 0,
        text: json['text'] as String?,
        authorDisplayName: (json['authorDisplayName'] as String?) ?? 'Student',
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime(2026),
      );
}

/// GET /venues/{id}: static and dynamic groups kept separate (FR-019).
class VenueDetails {
  const VenueDetails({
    required this.venue,
    required this.openingHours,
    required this.conditions,
    this.averageRating,
    this.reviewCount = 0,
    this.reviews = const [],
    this.isFavorite,
  });

  /// The static group (name, location, price, Wi-Fi, outlets, study type).
  final VenueSummary venue;
  final OpeningHours? openingHours;

  /// The dynamic group (crowd, noise, Wi-Fi now).
  final VenueConditions conditions;
  final double? averageRating;
  final int reviewCount;
  final List<Review> reviews;

  /// Null when nobody is signed in.
  final bool? isFavorite;

  factory VenueDetails.fromJson(Map<String, dynamic> json) {
    final s = _m(json['static']) ?? const <String, dynamic>{};
    return VenueDetails(
      venue: VenueSummary.fromJson(s),
      openingHours: _hours(s['openingHours']),
      conditions: VenueConditions.fromJson(_m(json['dynamic'])),
      averageRating: _d(json['averageRating']),
      reviewCount: _i(json['reviewCount']) ?? 0,
      reviews: ((json['reviews'] as List?) ?? const [])
          .map((e) => Review.fromJson((e as Map).cast<String, dynamic>()))
          .toList(),
      isFavorite: json['isFavorite'] as bool?,
    );
  }
}
