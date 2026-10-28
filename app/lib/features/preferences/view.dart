import 'package:flutter/material.dart';

import '../../core/services.dart';
import '../../core/widgets/back_or_home_button.dart';
import '../../core/widgets/error_view.dart';
import '../../core/widgets/view_model_builder.dart';
import 'repository.dart';
import 'view_model.dart';

/// PB-13: the FR-013 criteria as saved preferences.
class PreferencesView extends StatelessWidget {
  const PreferencesView({super.key});

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<PreferencesViewModel>(
      create: (context) => PreferencesViewModel(
          PreferencesRepository(AppScope.of(context).api)),
      onReady: (vm) => vm.load(),
      builder: (context, vm) => Scaffold(
        appBar: AppBar(
          leading: const BackOrHomeButton(),
          title: const Text('Study preferences'),
        ),
        body: vm.loading
            ? const Center(child: CircularProgressIndicator())
            : vm.loadError != null
                ? ErrorView(message: vm.loadError!, onRetry: vm.load)
                : _Form(vm: vm),
      ),
    );
  }
}

class _Form extends StatelessWidget {
  const _Form({required this.vm});

  final PreferencesViewModel vm;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 8),
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Text('What do you usually need? Leave "Any" when it does not matter.'),
        ),
        _Choice<String>(
          key: const Key('pref_noise'),
          label: 'Noise',
          value: vm.noise,
          options: const {'quiet': 'Quiet', 'moderate': 'Moderate', 'noisy': 'Noisy is fine'},
          onChanged: (v) => vm.update((m) => m.noise = v),
        ),
        _Choice<String>(
          key: const Key('pref_wifi'),
          label: 'Wi-Fi at least',
          value: vm.wifi,
          options: const {'poor': 'Poor', 'average': 'Average', 'good': 'Good'},
          onChanged: (v) => vm.update((m) => m.wifi = v),
        ),
        _Choice<String>(
          key: const Key('pref_crowd'),
          label: 'Crowd at most',
          value: vm.crowd,
          options: const {'low': 'Low', 'moderate': 'Moderate', 'high': 'High'},
          onChanged: (v) => vm.update((m) => m.crowd = v),
        ),
        _Choice<int>(
          key: const Key('pref_price'),
          label: 'Price at most',
          value: vm.maxPrice,
          options: const {1: '\$', 2: '\$\$', 3: '\$\$\$', 4: '\$\$\$\$'},
          onChanged: (v) => vm.update((m) => m.maxPrice = v),
        ),
        _Choice<int>(
          key: const Key('pref_distance'),
          label: 'Distance at most',
          value: vm.maxDistance,
          options: const {500: '500 m', 1000: '1 km', 2000: '2 km', 5000: '5 km'},
          onChanged: (v) => vm.update((m) => m.maxDistance = v),
        ),
        _Choice<String>(
          key: const Key('pref_study_type'),
          label: 'Study type',
          value: vm.studyType,
          options: const {'individual': 'Alone', 'group': 'Group'},
          onChanged: (v) => vm.update((m) => m.studyType = v),
        ),
        SwitchListTile(
          key: const Key('pref_outlets'),
          title: const Text('Needs power outlets'),
          value: vm.outlets ?? false,
          onChanged: (v) => vm.update((m) => m.outlets = v ? true : null),
        ),
        SwitchListTile(
          key: const Key('pref_open_now'),
          title: const Text('Open now only'),
          value: vm.openNow ?? false,
          onChanged: (v) => vm.update((m) => m.openNow = v ? true : null),
        ),
        if (vm.message != null)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              vm.message!,
              key: const Key('pref_message'),
              style: TextStyle(
                color: vm.messageIsError ? Theme.of(context).colorScheme.error : null,
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: FilledButton(
            key: const Key('pref_save'),
            onPressed: vm.saving ? null : vm.save,
            child: const Text('Save'),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: TextButton(
            key: const Key('pref_clear'),
            onPressed: vm.saving ? null : vm.clearAll,
            child: const Text('Remove all preferences'),
          ),
        ),
      ],
    );
  }
}

/// One dropdown row with an "Any" choice that means no preference (null).
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
