import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/services.dart';
import '../../core/widgets/view_model_builder.dart';
import 'location_view_model.dart';

/// PB-39: explain why location is needed (PRIV-003), then ask. If refused,
/// the app keeps working with a typed area (USE-007, PRIV-004).
class LocationView extends StatelessWidget {
  const LocationView({super.key});

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<LocationViewModel>(
      create: (context) {
        final s = AppScope.of(context);
        return LocationViewModel(location: s.location, flags: s.flags);
      },
      onReady: (vm) => vm.init(),
      builder: (context, vm) => Scaffold(
        appBar: AppBar(title: const Text('Your location')),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: switch (vm.step) {
              LocationStep.explain || LocationStep.asking => _Explain(vm: vm),
              LocationStep.granted => _Granted(onContinue: () => context.go('/home')),
              LocationStep.manualArea => _ManualArea(vm: vm),
            },
          ),
        ),
      ),
    );
  }
}

class _Explain extends StatelessWidget {
  const _Explain({required this.vm});

  final LocationViewModel vm;

  @override
  Widget build(BuildContext context) {
    final asking = vm.step == LocationStep.asking;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Spacer(),
        Icon(Icons.near_me, size: 72, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 24),
        Text(
          'Find study places near you',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 12),
        const Text(
          'StudySpot uses your location only to show places near you with their '
          'distance, and to estimate how busy a place is. Other users never see '
          'where you are. You can change this any time in your phone settings.',
          key: Key('location_purpose'),
          textAlign: TextAlign.center,
        ),
        const Spacer(),
        FilledButton(
          key: const Key('location_allow'),
          onPressed: asking ? null : vm.allow,
          child: const Text('Allow location'),
        ),
        const SizedBox(height: 8),
        TextButton(
          key: const Key('location_not_now'),
          onPressed: asking ? null : vm.notNow,
          child: const Text('Not now'),
        ),
      ],
    );
  }
}

class _Granted extends StatelessWidget {
  const _Granted({required this.onContinue});

  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Spacer(),
        const Icon(Icons.check_circle, size: 72, color: Colors.green),
        const SizedBox(height: 24),
        const Text(
          'Location is on. We will show study places near you.',
          textAlign: TextAlign.center,
        ),
        const Spacer(),
        FilledButton(
          key: const Key('location_continue'),
          onPressed: onContinue,
          child: const Text('Continue'),
        ),
      ],
    );
  }
}

class _ManualArea extends StatelessWidget {
  const _ManualArea({required this.vm});

  final LocationViewModel vm;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Choose an area', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text(vm.refusalHelp, key: const Key('location_refusal_help')),
        const SizedBox(height: 20),
        TextFormField(
          key: const Key('location_area'),
          initialValue: vm.area,
          decoration: InputDecoration(
            labelText: 'Area',
            hintText: 'e.g. Zamalek, New Cairo, Maadi',
            errorText: vm.areaError,
          ),
          onChanged: vm.setArea,
        ),
        const SizedBox(height: 20),
        FilledButton(
          key: const Key('location_area_save'),
          onPressed: () async {
            final ok = await vm.saveArea();
            if (ok && context.mounted) context.go('/home');
          },
          child: const Text('Continue'),
        ),
        TextButton(
          key: const Key('location_skip'),
          onPressed: () => context.go('/home'),
          child: const Text('Skip, I will search by name'),
        ),
      ],
    );
  }
}
