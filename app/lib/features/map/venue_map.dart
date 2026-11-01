import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/models/venue.dart';

/// PB-09 / FR-014, FR-015: venues as pins on an OpenStreetMap map; tapping a
/// pin opens the venue's details. Shows the same results as the list.
class VenueMap extends StatelessWidget {
  const VenueMap({super.key, required this.venues, required this.onOpen});

  final List<VenueSummary> venues;
  final void Function(VenueSummary venue) onOpen;

  /// Cairo, when there is nothing to show.
  static const _cairo = LatLng(30.0444, 31.2357);

  @override
  Widget build(BuildContext context) {
    final points = [for (final v in venues) LatLng(v.lat!, v.lng!)];
    final color = Theme.of(context).colorScheme.primary;
    return FlutterMap(
      options: MapOptions(
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
                  child: IconButton(
                    key: Key('pin_${v.id}'),
                    icon: Icon(Icons.location_on, color: color, size: 36),
                    onPressed: () => onOpen(v),
                  ),
                ),
              ),
          ],
        ),
        const SimpleAttributionWidget(source: Text('OpenStreetMap contributors')),
      ],
    );
  }
}
