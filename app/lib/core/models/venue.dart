// Hand-written from contracts/openapi.yaml (VenueSummary, SearchResult).
// M6 owns the venue screens and can extend these models; keep field names
// identical to the spec.

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

  factory VenueSummary.fromJson(Map<String, dynamic> json) {
    final location = json['location'];
    return VenueSummary(
      id: json['id'] as String,
      name: json['name'] as String,
      lat: location is Map ? (location['lat'] as num?)?.toDouble() : null,
      lng: location is Map ? (location['lng'] as num?)?.toDouble() : null,
      address: json['address'] as String?,
      area: json['area'] as String?,
      priceLevel: (json['priceLevel'] as num?)?.toInt(),
      wifiAvailable: json['wifiAvailable'] as bool?,
      outletsAvailable: json['outletsAvailable'] as bool?,
      studyType: json['studyType'] as String?,
      distanceMeters: (json['distanceMeters'] as num?)?.toInt(),
      openNow: json['openNow'] as bool?,
      averageRating: (json['averageRating'] as num?)?.toDouble(),
      reviewCount: (json['reviewCount'] as num?)?.toInt() ?? 0,
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
            .map((e) => VenueSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
        degraded: (json['degraded'] as bool?) ?? false,
      );
}
