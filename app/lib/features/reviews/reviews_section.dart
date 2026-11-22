import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/review.dart';
import '../../core/models/venue.dart';
import '../../core/services.dart';
import '../../core/widgets/view_model_builder.dart';
import 'repository.dart';
import 'view_model.dart';

/// The reviews part of M6's venue details screen (PB-15, PB-16, UC-08).
/// Lists the reviews, offers "Write a review" (or "Edit your review"), and a
/// report button on everyone else's review. Signed out, both buttons open
/// sign-in and come back (FR-007). [onChanged] reloads the details after a save.
class VenueReviewsSection extends StatelessWidget {
  const VenueReviewsSection({
    super.key,
    required this.venueId,
    required this.reviews,
    required this.onChanged,
  });

  final String venueId;
  final List<Review> reviews;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    final repository = ReviewsRepository(services.api);
    return ViewModelBuilder<VenueReviewsViewModel>(
      create: (context) => VenueReviewsViewModel(repository,
          venueId: venueId, signedIn: services.session.isSignedIn),
      onReady: (vm) => vm.load(),
      builder: (context, vm) {
        void signIn() {
          final here = GoRouterState.of(context).uri.toString();
          context.go('/signin?from=${Uri.encodeComponent(here)}');
        }

        Future<void> write() async {
          if (!vm.signedIn) {
            signIn();
            return;
          }
          final saved = await showModalBottomSheet<MyReview>(
            context: context,
            isScrollControlled: true,
            showDragHandle: true,
            builder: (_) => ReviewSheet(
                repository: repository, venueId: venueId, existing: vm.mine),
          );
          if (saved == null || !context.mounted) return;
          vm.saved(saved);
          ScaffoldMessenger.of(context)
              .showSnackBar(const SnackBar(content: Text('Thanks! Your review is saved.')));
          await onChanged();
        }

        Future<void> report(Review review) async {
          if (!vm.signedIn) {
            signIn();
            return;
          }
          final sure = await showDialog<bool>(
            context: context,
            builder: (dialog) => AlertDialog(
              title: const Text('Report this review?'),
              content: const Text(
                  'A moderator will read it and remove it if it is inappropriate.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(dialog, false), child: const Text('Cancel')),
                FilledButton(
                    onPressed: () => Navigator.pop(dialog, true), child: const Text('Report')),
              ],
            ),
          );
          if (sure != true) return;
          final message = await vm.report(review.id);
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
          }
        }

        final mine = vm.mine;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 20, bottom: 8),
              child: Row(
                children: [
                  Expanded(
                      child: Text('Reviews', style: Theme.of(context).textTheme.titleMedium)),
                  TextButton.icon(
                    key: const Key('write-review'),
                    onPressed: write,
                    icon: Icon(mine == null ? Icons.rate_review_outlined : Icons.edit_outlined),
                    label: Text(mine == null ? 'Write a review' : 'Edit your review'),
                  ),
                ],
              ),
            ),
            if (mine != null && mine.hidden)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  'A moderator removed your review. Edit it to post a new one.',
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            if (reviews.isEmpty) const Text('No reviews yet. Be the first to write one.'),
            for (final r in reviews)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('★' * r.rating, semanticsLabel: '${r.rating} of 5 stars'),
                subtitle: Text([
                  if (r.text != null && r.text!.isNotEmpty) r.text!,
                  '${vm.isMine(r.id) ? 'You' : r.authorDisplayName} · '
                      '${r.createdAt.day}/${r.createdAt.month}/${r.createdAt.year}',
                ].join('\n')),
                trailing: vm.isMine(r.id) || r.id.isEmpty
                    ? null
                    : vm.reported.contains(r.id)
                        ? const Tooltip(
                            message: 'Reported', child: Icon(Icons.flag, size: 20))
                        : IconButton(
                            key: Key('report-${r.id}'),
                            tooltip: 'Report this review',
                            icon: const Icon(Icons.outlined_flag),
                            onPressed: vm.busyReviewId == null ? () => report(r) : null,
                          ),
              ),
          ],
        );
      },
    );
  }
}

/// Star picker and text box. Pops with the saved review.
class ReviewSheet extends StatelessWidget {
  const ReviewSheet({
    super.key,
    required this.repository,
    required this.venueId,
    this.existing,
  });

  final ReviewsRepository repository;
  final String venueId;
  final MyReview? existing;

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<ReviewFormViewModel>(
      create: (_) =>
          ReviewFormViewModel(repository, venueId: venueId, existing: existing),
      builder: (context, vm) => Padding(
        padding: EdgeInsets.fromLTRB(
            16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(vm.isEdit ? 'Edit your review' : 'Write a review',
                style: Theme.of(context).textTheme.titleLarge),
            if (vm.isEdit)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text('Saving replaces your earlier review of this place.'),
              ),
            const SizedBox(height: 12),
            Row(
              children: [
                for (var star = 1; star <= 5; star++)
                  IconButton(
                    key: Key('star-$star'),
                    tooltip: '$star star${star == 1 ? '' : 's'}',
                    icon: Icon(star <= vm.rating ? Icons.star : Icons.star_border,
                        color: Colors.amber.shade700),
                    onPressed: vm.saving ? null : () => vm.setRating(star),
                  ),
              ],
            ),
            TextFormField(
              key: const Key('review-text'),
              initialValue: vm.text,
              enabled: !vm.saving,
              minLines: 3,
              maxLines: 6,
              maxLength: maxReviewLength,
              decoration: InputDecoration(
                labelText: 'What was it like to study here? (optional)',
                border: const OutlineInputBorder(),
                errorText: vm.textError,
              ),
              onChanged: vm.setText,
            ),
            if (vm.error != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(vm.error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const Key('save-review'),
                onPressed: vm.saving
                    ? null
                    : () async {
                        final saved = await vm.submit();
                        if (saved != null && context.mounted) Navigator.pop(context, saved);
                      },
                child: Text(vm.saving ? 'Saving…' : 'Save review'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
