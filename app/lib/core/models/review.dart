// The signed-in student's own review (PB-15, contracts/openapi.yaml MyReview).

/// Review rules of SDS 6.6.6, checked before sending.
const int maxReviewLength = 1000;

class MyReview {
  const MyReview({
    required this.id,
    required this.venueId,
    required this.rating,
    required this.createdAt,
    this.text,
    this.hidden = false,
  });

  final String id;
  final String venueId;
  final int rating;
  final String? text;
  final DateTime createdAt;

  /// True when a moderator removed it (FR-029). Writing again shows it again.
  final bool hidden;

  factory MyReview.fromJson(Map<String, dynamic> json) => MyReview(
        id: json['id'] as String,
        venueId: json['venueId'] as String,
        rating: (json['rating'] as num).toInt(),
        text: json['text'] as String?,
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime(2026),
        hidden: json['hidden'] == true,
      );
}
