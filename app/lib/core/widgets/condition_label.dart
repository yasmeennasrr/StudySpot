import 'package:flutter/material.dart';

import '../format.dart';
import '../models/venue.dart';

/// A crowd / noise / Wi-Fi value with its status label (USE-003, USE-004).
class ConditionChip extends StatelessWidget {
  const ConditionChip({super.key, required this.kind, required this.value});

  /// crowd | noise | wifi
  final String kind;
  final ConditionValue value;

  static const _names = {'crowd': 'Crowd', 'noise': 'Noise', 'wifi': 'Wi-Fi'};

  Color _color(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return switch (value.status) {
      'current' => scheme.primary,
      'hours_ago' => Colors.orange.shade800,
      'historical' => Colors.indigo,
      _ => scheme.outline,
    };
  }

  @override
  Widget build(BuildContext context) {
    final color = _color(context);
    final estimate = showAsEstimate(kind, value) ? ' (estimate)' : '';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        '${_names[kind]} · ${conditionText(value)}$estimate',
        style: TextStyle(color: color, fontSize: 12),
      ),
    );
  }
}

/// The three chips for a venue, or one "Conditions unavailable" chip.
class ConditionChips extends StatelessWidget {
  const ConditionChips({super.key, required this.conditions});

  final VenueConditions? conditions;

  @override
  Widget build(BuildContext context) {
    final c = conditions;
    if (c == null) {
      return Text('Conditions unavailable',
          style: TextStyle(color: Theme.of(context).colorScheme.outline, fontSize: 12));
    }
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        ConditionChip(kind: 'crowd', value: c.crowd),
        ConditionChip(kind: 'noise', value: c.noise),
        ConditionChip(kind: 'wifi', value: c.wifi),
      ],
    );
  }
}
