import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/models/venue.dart';

/// PB-09 / FR-014, FR-015: venues as pins on an OpenStreetMap map; tapping a
/// pin opens the venue's details. Shows the same results as the list.
class VenueMap extends StatelessWidget {
  const VenueMap({
    super.key,
    required this.venues,
    required this.onOpen,
    this.showTiles = true,
    this.markerInteractive = true,
  });

  final List<VenueSummary> venues;
  final void Function(VenueSummary venue) onOpen;

  /// False in tests (no network): the pins are drawn on a plain background.
  final bool showTiles;

  /// Detail pages display the selected café's pin without making it tappable.
  final bool markerInteractive;

  /// Cairo, when there is nothing to show.
  static const _cairo = LatLng(30.0444, 31.2357);

  @override
  Widget build(BuildContext context) {
    final points = [for (final v in venues) LatLng(v.lat!, v.lng!)];
    final scheme = Theme.of(context).colorScheme;
    return FlutterMap(
      options: MapOptions(
        backgroundColor: scheme.surfaceContainerHigh,
        initialCenter: points.isEmpty ? _cairo : points.first,
        initialZoom: 13,
        initialCameraFit: points.length < 2
            ? null
            : CameraFit.coordinates(
                coordinates: points,
                padding: const EdgeInsets.all(48),
                maxZoom: 16,
              ),
      ),
      children: [
        if (showTiles)
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'edu.aucegypt.studyspot',
          ),
        MarkerLayer(
          markers: [
            for (final v in venues)
              Marker(
                point: LatLng(v.lat!, v.lng!),
                width: 44,
                height: 44,
                child: Tooltip(
                  message: v.name,
                  child: markerInteractive
                      ? IconButton(
                          key: Key('pin_${v.id}'),
                          style: IconButton.styleFrom(
                            backgroundColor: scheme.primary,
                            foregroundColor: scheme.onPrimary,
                            side: BorderSide(
                              color: scheme.surfaceContainerLowest,
                              width: 2,
                            ),
                          ),
                          icon: const Icon(Icons.local_cafe_outlined, size: 20),
                          onPressed: () => onOpen(v),
                        )
                      : DecoratedBox(
                          decoration: BoxDecoration(
                            color: scheme.primary,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: scheme.surfaceContainerLowest,
                              width: 2,
                            ),
                          ),
                          child: SizedBox(
                            width: 44,
                            height: 44,
                            child: Center(
                              child: Icon(
                                Icons.local_cafe_outlined,
                                size: 20,
                                color: scheme.onPrimary,
                              ),
                            ),
                          ),
                        ),
                ),
              ),
          ],
        ),
        // OpenStreetMap's required credit. Our own small label rather than
        // SimpleAttributionWidget, whose Row overflows on narrow phones.
        if (showTiles) const _OsmCredit(),
      ],
    );
  }
}

/// "© OpenStreetMap contributors" in the map's corner. One line that shortens
/// with an ellipsis, so it never overflows however narrow the map is.
class _OsmCredit extends StatelessWidget {
  const _OsmCredit();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Align(
      alignment: Alignment.bottomRight,
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: theme.colorScheme.surfaceContainerLowest.withValues(
              alpha: 0.85,
            ),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            child: Text(
              '© OpenStreetMap contributors',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
