import '../../core/api/api_error.dart';
import '../../core/models/review.dart';
import '../../core/state/view_model.dart';
import 'repository.dart';

/// PB-15 / PB-16 / UC-08 on the details screen: knows the student's own review
/// (so the button says "Edit" and their review has no report button) and
/// reports other reviews.
class VenueReviewsViewModel extends ViewModel {
  VenueReviewsViewModel(this._repository, {required this.venueId, required this.signedIn});

  final ReviewsRepository _repository;
  final String venueId;
  final bool signedIn;

  MyReview? mine;

  /// Reviews reported in this visit; their button turns into "Reported".
  final Set<String> reported = {};
  String? busyReviewId;

  Future<void> load() async {
    if (!signedIn) return;
    try {
      mine = await _repository.mine(venueId);
    } on ApiError {
      mine = null; // The form still works; it just starts empty.
    }
    notify();
  }

  bool isMine(String reviewId) => mine != null && mine!.id == reviewId;

  /// Whether a review gets a report button: not one's own, not already reported.
  bool canReport(String reviewId) =>
      reviewId.isNotEmpty && !isMine(reviewId) && !reported.contains(reviewId);

  /// Returns the message to show.
  Future<String> report(String reviewId) async {
    busyReviewId = reviewId;
    notify();
    try {
      await _repository.report(reviewId);
      reported.add(reviewId);
      return 'Thanks. A moderator will look at this review.';
    } on ApiError catch (e) {
      return e.message;
    } finally {
      busyReviewId = null;
      notify();
    }
  }

  void saved(MyReview review) {
    mine = review;
    notify();
  }
}

/// The review form (FR-025, SDS 6.6.6): 1 to 5 whole stars (required) and up
/// to 1000 characters of text (optional). Writing again replaces the review.
class ReviewFormViewModel extends ViewModel {
  ReviewFormViewModel(this._repository, {required this.venueId, MyReview? existing})
      : rating = existing?.rating ?? 0,
        text = existing?.text ?? '',
        isEdit = existing != null;

  final ReviewsRepository _repository;
  final String venueId;
  final bool isEdit;

  int rating;
  String text;
  bool saving = false;
  String? error;

  String? get textError =>
      text.length > maxReviewLength ? 'Use at most $maxReviewLength characters.' : null;

  bool get canSubmit => !saving && rating >= 1 && rating <= 5 && textError == null;

  void setRating(int stars) {
    rating = stars < 1 ? 1 : (stars > 5 ? 5 : stars);
    error = null;
    notify();
  }

  void setText(String value) {
    text = value;
    notify();
  }

  /// Saves the review; null when it failed ([error] says why).
  Future<MyReview?> submit() async {
    if (!canSubmit) {
      error = rating == 0 ? 'Choose 1 to 5 stars.' : textError;
      notify();
      return null;
    }
    saving = true;
    error = null;
    notify();
    try {
      final trimmed = text.trim();
      return await _repository.write(venueId,
          rating: rating, text: trimmed.isEmpty ? null : trimmed);
    } on ApiError catch (e) {
      error = e.fieldErrors['text'] ?? e.fieldErrors['rating'] ?? e.message;
      return null;
    } finally {
      saving = false;
      notify();
    }
  }
}
