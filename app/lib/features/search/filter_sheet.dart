import 'package:flutter/material.dart';

import '../../core/models/preferences.dart';

/// PB-10 / FR-013: the filter bottom sheet. Returns the chosen filters, or
/// null when closed without applying.
Future<Preferences?> showFilterSheet(
  BuildContext context, {
  required Preferences current,
  required bool canUseDistance,
  Future<Preferences?> Function()? loadSaved,
}) {
  return showModalBottomSheet<Preferences>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => _FilterSheet(
      initial: current,
      canUseDistance: canUseDistance,
      loadSaved: loadSaved,
    ),
  );
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial, required this.canUseDistance, this.loadSaved});

  final Preferences initial;
  final bool canUseDistance;
  final Future<Preferences?> Function()? loadSaved;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late String? _noise = widget.initial.noise;
  late String? _wifi = widget.initial.wifi;
  late String? _crowd = widget.initial.crowd;
  late bool? _outlets = widget.initial.outlets;
  late int? _maxPrice = widget.initial.maxPrice;
  late bool? _openNow = widget.initial.openNow;
  late int? _maxDistance = widget.initial.maxDistance;
  late String? _studyType = widget.initial.studyType;
  String? _note;

  Preferences get _current => Preferences(
        noise: _noise,
        wifi: _wifi,
        crowd: _crowd,
        outlets: _outlets,
        maxPrice: _maxPrice,
        openNow: _openNow,
        maxDistance: widget.canUseDistance ? _maxDistance : null,
        studyType: _studyType,
      );

  void _fill(Preferences p) => setState(() {
        _noise = p.noise;
        _wifi = p.wifi;
        _crowd = p.crowd;
        _outlets = p.outlets;
        _maxPrice = p.maxPrice;
        _openNow = p.openNow;
        _maxDistance = p.maxDistance;
        _studyType = p.studyType;
      });

  Future<void> _useSaved() async {
    final saved = await widget.loadSaved?.call();
    if (!mounted) return;
    if (saved == null) {
      setState(() => _note = 'Sign in to use your saved preferences.');
    } else if (saved.isEmpty) {
      setState(() => _note = 'You have no saved preferences yet.');
    } else {
      _fill(saved);
      setState(() => _note = 'Filled in from your saved preferences.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text('Filters', style: Theme.of(context).textTheme.titleLarge),
            ),
            _Choice<String>(
              key: const Key('filter_noise'),
              label: 'Noise',
              value: _noise,
              options: const {'quiet': 'Quiet', 'moderate': 'Moderate', 'noisy': 'Noisy'},
              onChanged: (v) => setState(() => _noise = v),
            ),
            _Choice<String>(
              key: const Key('filter_wifi'),
              label: 'Wi-Fi',
              value: _wifi,
              options: const {'poor': 'Poor', 'average': 'Average', 'good': 'Good'},
              onChanged: (v) => setState(() => _wifi = v),
            ),
            _Choice<String>(
              key: const Key('filter_crowd'),
              label: 'Crowd',
              value: _crowd,
              options: const {'low': 'Low', 'moderate': 'Moderate', 'high': 'High'},
              onChanged: (v) => setState(() => _crowd = v),
            ),
            _Choice<int>(
              key: const Key('filter_price'),
              label: 'Price at most',
              value: _maxPrice,
              options: const {1: 'E£', 2: 'E£E£', 3: 'E£E£E£', 4: 'E£E£E£E£'},
              onChanged: (v) => setState(() => _maxPrice = v),
            ),
            if (widget.canUseDistance)
              _Choice<int>(
                key: const Key('filter_distance'),
                label: 'Distance at most',
                value: _maxDistance,
                options: const {500: '500 m', 1000: '1 km', 2000: '2 km', 5000: '5 km'},
                onChanged: (v) => setState(() => _maxDistance = v),
              ),
            _Choice<String>(
              key: const Key('filter_study_type'),
              label: 'Study type',
              value: _studyType,
              options: const {'individual': 'Alone', 'group': 'Group'},
              onChanged: (v) => setState(() => _studyType = v),
            ),
            SwitchListTile(
              key: const Key('filter_outlets'),
              title: const Text('Has power outlets'),
              value: _outlets ?? false,
              onChanged: (v) => setState(() => _outlets = v ? true : null),
            ),
            SwitchListTile(
              key: const Key('filter_open_now'),
              title: const Text('Open now'),
              value: _openNow ?? false,
              onChanged: (v) => setState(() => _openNow = v ? true : null),
            ),
            if (_note != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Text(_note!),
              ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  if (widget.loadSaved != null)
                    TextButton(
                      key: const Key('filter_use_saved'),
                      onPressed: _useSaved,
                      child: const Text('Use my preferences'),
                    ),
                  const Spacer(),
                  TextButton(
                    key: const Key('filter_clear'),
                    onPressed: () => _fill(Preferences.empty),
                    child: const Text('Clear'),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    key: const Key('filter_apply'),
                    onPressed: () => Navigator.of(context).pop(_current),
                    child: const Text('Apply'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One dropdown row with "Any" meaning no filter.
class _Choice<T extends Object> extends StatelessWidget {
  const _Choice({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String label;
  final T? value;
  final Map<T, String> options;
  final ValueChanged<T?> onChanged;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(label),
      trailing: DropdownButton<T?>(
        value: value,
        onChanged: onChanged,
        items: [
          DropdownMenuItem<T?>(value: null, child: const Text('Any')),
          for (final entry in options.entries)
            DropdownMenuItem<T?>(value: entry.key, child: Text(entry.value)),
        ],
      ),
    );
  }
}
