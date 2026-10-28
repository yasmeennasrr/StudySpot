// Hand-written from contracts/openapi.yaml (Preferences). Every field is
// optional: null means "no preference" (FR-022, the FR-013 criteria).

class Preferences {
  const Preferences({
    this.noise,
    this.wifi,
    this.crowd,
    this.outlets,
    this.maxPrice,
    this.openNow,
    this.maxDistance,
    this.studyType,
  });

  /// quiet | moderate | noisy
  final String? noise;

  /// poor | average | good
  final String? wifi;

  /// low | moderate | high
  final String? crowd;
  final bool? outlets;

  /// 1 (cheap) .. 4 (expensive)
  final int? maxPrice;
  final bool? openNow;

  /// Metres, 1 .. 5000
  final int? maxDistance;

  /// individual | group
  final String? studyType;

  static const empty = Preferences();

  bool get isEmpty => toJson().isEmpty;

  factory Preferences.fromJson(Map<String, dynamic> json) => Preferences(
        noise: json['noise'] as String?,
        wifi: json['wifi'] as String?,
        crowd: json['crowd'] as String?,
        outlets: json['outlets'] as bool?,
        maxPrice: (json['maxPrice'] as num?)?.toInt(),
        openNow: json['openNow'] as bool?,
        maxDistance: (json['maxDistance'] as num?)?.toInt(),
        studyType: json['studyType'] as String?,
      );

  /// Only the fields that are set; the backend rejects unknown fields and
  /// treats a missing field as "no preference".
  Map<String, dynamic> toJson() => {
        if (noise != null) 'noise': noise,
        if (wifi != null) 'wifi': wifi,
        if (crowd != null) 'crowd': crowd,
        if (outlets != null) 'outlets': outlets,
        if (maxPrice != null) 'maxPrice': maxPrice,
        if (openNow != null) 'openNow': openNow,
        if (maxDistance != null) 'maxDistance': maxDistance,
        if (studyType != null) 'studyType': studyType,
      };

  @override
  bool operator ==(Object other) =>
      other is Preferences &&
      other.noise == noise &&
      other.wifi == wifi &&
      other.crowd == crowd &&
      other.outlets == outlets &&
      other.maxPrice == maxPrice &&
      other.openNow == openNow &&
      other.maxDistance == maxDistance &&
      other.studyType == studyType;

  @override
  int get hashCode => Object.hash(
      noise, wifi, crowd, outlets, maxPrice, openNow, maxDistance, studyType);
}
