/// Optional answers for the quick in-app conditions survey (PB-17).
class SurveyAnswers {
  const SurveyAnswers({this.crowd, this.noise, this.wifi});

  final String? crowd;
  final String? noise;
  final String? wifi;

  bool get hasAnswer => crowd != null || noise != null || wifi != null;

  Map<String, Object> toJson() => {
        'crowd': ?crowd,
        'noise': ?noise,
        'wifi': ?wifi,
      };
}

class StoredSurvey {
  const StoredSurvey({
    required this.id,
    required this.venueId,
    required this.submittedAt,
    required this.pointsAwarded,
    this.noPointsReason,
  });

  final String id;
  final String venueId;
  final DateTime submittedAt;
  final int pointsAwarded;
  final String? noPointsReason;

  factory StoredSurvey.fromJson(Map<String, dynamic> json) => StoredSurvey(
        id: json['id'] as String,
        venueId: json['venueId'] as String,
        submittedAt: DateTime.parse(json['submittedAt'] as String),
        pointsAwarded: json['pointsAwarded'] as int? ?? 0,
        noPointsReason: json['noPointsReason'] as String?,
      );
}
