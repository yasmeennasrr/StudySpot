import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/models/venue.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/condition_label.dart';

/// One result in the list: name, area, distance, price, open now, rating and
/// the three condition labels (FR-012, FR-016, FR-020).
class VenueCard extends StatelessWidget {
  const VenueCard({super.key, required this.venue, required this.onTap});

  final VenueSummary venue;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = TextStyle(color: theme.colorScheme.onSurfaceVariant);
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
                    // Place names use the heading serif, like a café menu.
                    child: Text(
                      venue.name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontFamily: AppTheme.serif,
                        fontWeight: FontWeight.w400,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  if (venue.openNow != null)
                    Text(
                      venue.openNow! ? 'Open now' : 'Closed',
                      style: TextStyle(
                        color: venue.openNow!
                            ? StatusColors.of(context).success
                            : theme.colorScheme.error,
                        fontWeight: FontWeight.w500,
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
