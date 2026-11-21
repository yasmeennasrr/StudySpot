import '../../core/api/api_client.dart';
import '../../core/models/review.dart';

/// PB-15 / PB-16: the signed-in student's reviews and their reports (FR-025, FR-034).
class ReviewsRepository {
  ReviewsRepository(this._api);

  final ApiClient _api;

  Future<MyReview?> mine(String venueId) => _api.getMyReview(venueId);
  Future<MyReview> write(String venueId, {required int rating, String? text}) =>
      _api.writeReview(venueId, rating: rating, text: text);
  Future<void> report(String reviewId) => _api.reportReview(reviewId);
}
