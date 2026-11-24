import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/api/api_error.dart';
import 'package:studyspot/core/models/venue.dart';
import 'package:studyspot/features/reviews/repository.dart';
import 'package:studyspot/features/reviews/view_model.dart';
import 'package:studyspot/features/venue_details/details_view_model.dart';

import '../../helpers.dart';

void main() {
  test('TC-M4-22 the review form needs 1 to 5 stars, allows up to 1000 characters, and editing replaces the review', () async {
    final w = TestWorld();
    final venueId = w.api.venues.first.id;
    final repo = ReviewsRepository(w.api);

    final form = ReviewFormViewModel(repo, venueId: venueId);
    expect(form.isEdit, isFalse);
    expect(form.canSubmit, isFalse);
    expect(await form.submit(), isNull);
    expect(form.error, 'Choose 1 to 5 stars.');

    form.setRating(4);
    form.setText('x' * 1001);
    expect(form.textError, 'Use at most 1000 characters.');
    expect(form.canSubmit, isFalse);
    form.setText('  Quiet in the morning  ');
    expect(form.canSubmit, isTrue);
    final saved = await form.submit();
    expect(saved!.rating, 4);
    expect(saved.text, 'Quiet in the morning');

    // The details screen now shows it; the section knows it is the student's own.
    final details = VenueDetailsViewModel(api: w.api, venueId: venueId);
    await details.load();
    expect(details.details!.reviews.first.id, saved.id);
    final section = VenueReviewsViewModel(repo, venueId: venueId, signedIn: true);
    await section.load();
    expect(section.isMine(saved.id), isTrue);
    expect(section.canReport(saved.id), isFalse);

    // Editing starts from the saved review and keeps one review per venue.
    final edit = ReviewFormViewModel(repo, venueId: venueId, existing: section.mine);
    expect(edit.isEdit, isTrue);
    expect(edit.rating, 4);
    edit.setRating(2);
    edit.setText('   ');
    final replaced = await edit.submit();
    expect(replaced!.id, saved.id);
    expect(replaced.rating, 2);
    expect(replaced.text, isNull);
    expect(w.api.myReviews.length, 1);

    // A failure keeps the form open with the server's message.
    w.api.failNext = ApiError.network;
    expect(await edit.submit(), isNull);
    expect(edit.error, ApiError.network.message);
  });

  test('TC-M4-23 a student reports another review once; their own review has no report button', () async {
    final w = TestWorld();
    final venueId = w.api.venues.first.id;
    final repo = ReviewsRepository(w.api);
    final details = VenueDetailsViewModel(api: w.api, venueId: venueId);
    await details.load();
    final Review other = details.details!.reviews.first;
    expect(other.id, isNotEmpty);

    final section = VenueReviewsViewModel(repo, venueId: venueId, signedIn: true);
    await section.load();
    expect(section.mine, isNull);
    expect(section.canReport(other.id), isTrue);
    expect(await section.report(other.id), 'Thanks. A moderator will look at this review.');
    expect(w.api.reportedReviewIds, {other.id});
    expect(section.canReport(other.id), isFalse);

    // Own review: refused by the backend with its message.
    final mine = await repo.write(venueId, rating: 5);
    expect(await section.report(mine.id), 'You cannot report your own review. Edit it instead.');

    // Signed out, nothing is loaded; the buttons send the student to sign-in.
    final signedOut = VenueReviewsViewModel(repo, venueId: venueId, signedIn: false);
    await signedOut.load();
    expect(signedOut.mine, isNull);
  });
}
