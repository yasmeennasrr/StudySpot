import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/models/venue.dart';
import '../../core/widgets/condition_label.dart';

/// One result in the list: name, area, distance, price, open now, rating and
/// the three condition labels (FR-012, FR-016, FR-020).
class VenueCard extends StatelessWidget {
  const VenueCard({super.key, required this.venue, required this.onTap});

  final VenueSummary venue;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(color: Theme.of(context).colorScheme.outline);
    final meta = <String>[
      if (venue.area != null) venue.area!,
      if (venue.distanceMeters != null) '${distanceText(venue.distanceMeters)} away',
      priceText(venue.priceLevel),
      if (venue.averageRating != null)
        '★ ${venue.averageRating!.toStringAsFixed(1)} (${venue.reviewCount})',
    ];
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: InkWell(
        key: Key('venue_${venue.id}'),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(venue.name, style: Theme.of(context).textTheme.titleMedium),
                  ),
                  if (venue.openNow != null)
                    Text(
                      venue.openNow! ? 'Open now' : 'Closed',
                      style: TextStyle(
                        color: venue.openNow!
                            ? Theme.of(context).colorScheme.primary
                            : Theme.of(context).colorScheme.error,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(meta.join(' · '), style: muted),
              const SizedBox(height: 8),
              ConditionChips(conditions: venue.conditions),
            ],
          ),
        ),
      ),
    );
  }
}
