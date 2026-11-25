import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/models/venue.dart';
import '../../core/services.dart';
import '../../core/widgets/back_or_home_button.dart';
import '../../core/widgets/condition_label.dart';
import '../../core/widgets/error_view.dart';
import '../../core/widgets/venue_photo.dart';
import '../../core/widgets/view_model_builder.dart';
import '../map/venue_map.dart';
import '../favorites/favorite_button.dart';
import '../noise/noise_sample_card.dart';
import '../reviews/reviews_section.dart';
import '../surveys/survey_section.dart';
import 'details_view_model.dart';

/// PB-11: venue details. Dynamic conditions and static information are shown
/// in separate groups (FR-019); every condition carries its status (FR-020).
class VenueDetailsView extends StatelessWidget {
  const VenueDetailsView({super.key, required this.venueId});

  final String venueId;

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<VenueDetailsViewModel>(
      create: (context) => VenueDetailsViewModel(
        api: AppScope.of(context).api,
        venueId: venueId,
      ),
      onReady: (vm) => vm.load(),
      builder: (context, vm) {
        final d = vm.details;
        return Scaffold(
          appBar: AppBar(
            leading: const BackOrHomeButton(),
            title: Text(d?.venue.name ?? 'Study place'),
            actions: [
              if (d != null)
                FavoriteButton(
                  venueId: d.venue.id,
                  initial: d.isFavorite == true,
                ),
            ],
          ),
          body: vm.loading
              ? const Center(child: CircularProgressIndicator())
              : vm.error != null
              ? ErrorView(message: vm.error!, onRetry: vm.load)
              : RefreshIndicator(
                  onRefresh: vm.load,
                  child: _Body(details: d!, onChanged: vm.load),
                ),
        );
      },
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.details, required this.onChanged});

  final VenueDetails details;

  /// Reloads the details, e.g. after the student saves a review.
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final v = details.venue;
    final hours = openingHoursLines(details.openingHours);
    final rating = details.averageRating == null
        ? 'No reviews yet'
        : '★ ${details.averageRating!.toStringAsFixed(1)} (${details.reviewCount} reviews)';
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (v.hasLocation)
          ClipRRect(
            key: const Key('venue_details_map'),
            borderRadius: BorderRadius.circular(16),
            child: SizedBox(
              height: 230,
              child: VenueMap(
                venues: [v],
                onOpen: (_) {},
                markerInteractive: false,
                showTiles: AppScope.of(context).loadNetworkImages,
              ),
            ),
          )
        else
          _MapUnavailable(address: v.address, area: v.area),
        const SizedBox(height: 16),
        // The place's photo across the top, when it has one.
        if (v.photoUrl != null) ...[
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 280),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: VenuePhoto(
                key: const Key('venue_details_photo'),
                url: v.photoUrl,
                radius: 16,
                iconSize: 40,
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
        Text(
          [
            if (v.address != null) v.address!,
            if (v.area != null) v.area!,
          ].join(', '),
        ),
        const SizedBox(height: 4),
        Text(
          '${priceText(v.priceLevel)} · $rating',
          style: TextStyle(color: Theme.of(context).colorScheme.outline),
        ),
        const _Heading('Conditions now'),
        _ConditionRow(
          kind: 'crowd',
          name: 'Crowd',
          value: details.conditions.crowd,
        ),
        _ConditionRow(
          kind: 'noise',
          name: 'Noise',
          value: details.conditions.noise,
        ),
        _ConditionRow(
          kind: 'wifi',
          name: 'Wi-Fi',
          value: details.conditions.wifi,
        ),
        VenueSurveySection(venueId: v.id, onChanged: onChanged),
        NoiseSampleCard(venueId: v.id),
        const _Heading('About this place'),
        _Fact('Wi-Fi', yesNo(v.wifiAvailable)),
        _Fact('Power outlets', yesNo(v.outletsAvailable)),
        _Fact('Good for', studyTypeText(v.studyType)),
        _Fact('Price', priceText(v.priceLevel)),
        const _Heading('Opening hours'),
        if (hours.isEmpty) const Text('Not known'),
        for (final (day, time) in hours) _Fact(day, time),
        // PB-15 / PB-16 (M4): write, edit and report reviews.
        VenueReviewsSection(
          venueId: v.id,
          reviews: details.reviews,
          onChanged: onChanged,
        ),
      ],
    );
  }
}

class _MapUnavailable extends StatelessWidget {
  const _MapUnavailable({this.address, this.area});

  final String? address;
  final String? area;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final place = [
      if (address != null) address!,
      if (area != null) area!,
    ].join(', ');
    return Container(
      key: const Key('venue_details_map_unavailable'),
      height: 150,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.location_off_outlined, color: scheme.onSurfaceVariant),
            const SizedBox(height: 8),
            Text(
              place.isEmpty ? 'Map location unavailable' : place,
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 8),
      child: Text(text, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(
              label,
              style: TextStyle(color: Theme.of(context).colorScheme.outline),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}

class _ConditionRow extends StatelessWidget {
  const _ConditionRow({
    required this.kind,
    required this.name,
    required this.value,
  });

  final String kind;
  final String name;
  final ConditionValue value;

  @override
  Widget build(BuildContext context) {
    final based = value.basedOn.isEmpty
        ? ''
        : 'Based on ${value.basedOn.join(', ')}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 70, child: Text(name)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ConditionChip(kind: kind, value: value),
                if (based.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      based,
                      style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
