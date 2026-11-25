// Hand-written from contracts/openapi.yaml (StudyMatchAnswer). Field names match the spec.
import 'venue.dart';

class StudyMatchRecommendation {
  const StudyMatchRecommendation({
    required this.venue,
    this.reasons = const [],
  });

  final VenueSummary venue;
  final List<String> reasons;

  factory StudyMatchRecommendation.fromJson(Map<String, dynamic> json) =>
      StudyMatchRecommendation(
        venue: VenueSummary.fromJson(
          (json['venue'] as Map).cast<String, dynamic>(),
        ),
        reasons: ((json['reasons'] as List?) ?? const []).cast<String>(),
      );
}

/// One earlier chat message, sent with a new question so StudyMatch
/// understands follow-ups. Text only.
class StudyMatchMessage {
  const StudyMatchMessage({required this.fromStudent, required this.text});

  final bool fromStudent;
  final String text;

  Map<String, dynamic> toJson() => {
    'role': fromStudent ? 'user' : 'model',
    'text': text,
  };
}

/// POST /studymatch answer (PB-29). When [degraded] is true the AI was
/// unavailable and [recommendations] are standard results (AI-019, AI-029).
class StudyMatchAnswer {
  const StudyMatchAnswer({
    required this.reply,
    this.recommendations = const [],
    this.degraded = false,
    this.reasonCode = 'OK',
  });

  final String reply;
  final List<StudyMatchRecommendation> recommendations;
  final bool degraded;

  /// OK | AI_UNAVAILABLE | NEEDS_INFO | OFF_TOPIC
  final String reasonCode;

  factory StudyMatchAnswer.fromJson(Map<String, dynamic> json) =>
      StudyMatchAnswer(
        reply: (json['reply'] as String?) ?? '',
        recommendations: ((json['recommendations'] as List?) ?? const [])
            .map(
              (e) => StudyMatchRecommendation.fromJson(
                (e as Map).cast<String, dynamic>(),
              ),
            )
            .toList(),
        degraded: (json['degraded'] as bool?) ?? false,
        reasonCode: (json['reasonCode'] as String?) ?? 'OK',
      );
}
