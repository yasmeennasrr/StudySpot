import 'package:flutter/material.dart';

import '../../core/services.dart';
import '../../core/widgets/view_model_builder.dart';
import 'noise_sample_view_model.dart';

/// PB-19 / UC-11: the "share a noise sample" card on the venue details screen.
/// Shown only when the student is at this venue. While recording, a red
/// microphone indicator and countdown are always visible (SEN-008).
class NoiseSampleCard extends StatelessWidget {
  const NoiseSampleCard({super.key, required this.venueId});

  final String venueId;

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    return ViewModelBuilder<NoiseSampleViewModel>(
      create: (_) => NoiseSampleViewModel(
        api: services.api,
        location: services.location,
        recorder: services.noise,
        venueId: venueId,
        signedIn: services.session.isSignedIn,
      ),
      onReady: (vm) => vm.check(),
      builder: (context, vm) {
        if (!vm.visible) return const SizedBox.shrink();
        return Card(
          key: const Key('noise_card'),
          margin: const EdgeInsets.only(top: 12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: _content(context, vm),
          ),
        );
      },
    );
  }

  Widget _content(BuildContext context, NoiseSampleViewModel vm) {
    final theme = Theme.of(context);
    final muted = TextStyle(color: theme.colorScheme.outline);
    final note = Text(
      'Only the noise level is kept. The recording is never saved.',
      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
    );
    switch (vm.stage) {
      case NoiseStage.recording:
        return Row(
          key: const Key('noise_recording'),
          children: [
            Icon(Icons.mic, color: theme.colorScheme.error, semanticLabel: 'Microphone on'),
            const SizedBox(width: 12),
            Expanded(
              child: Semantics(
                liveRegion: true,
                child: Text('Recording… ${vm.secondsLeft} s',
                    style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.error)),
              ),
            ),
            TextButton(
              key: const Key('noise_cancel'),
              onPressed: vm.cancel,
              child: const Text('Cancel'),
            ),
          ],
        );
      case NoiseStage.analysing:
        return const Row(children: [
          SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 12),
          Text('Checking the noise level…'),
        ]);
      case NoiseStage.done:
        return Column(
          key: const Key('noise_done'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Thanks! Noise here: ${_word(vm.level)}', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text('Others now see it under Conditions now.', style: muted),
          ],
        );
      default:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('You are here', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            const Text('Help other students: share a 7-second noise sample.'),
            if (vm.message != null) ...[
              const SizedBox(height: 8),
              Text(
                vm.message!,
                key: const Key('noise_message'),
                style: TextStyle(
                  color: vm.stage == NoiseStage.ready
                      ? theme.colorScheme.outline
                      : theme.colorScheme.error,
                ),
              ),
            ],
            const SizedBox(height: 12),
            Row(children: [
              FilledButton.icon(
                key: const Key('noise_record'),
                onPressed: vm.record,
                icon: const Icon(Icons.mic_none),
                label: const Text('Record 7 seconds'),
              ),
            ]),
            const SizedBox(height: 8),
            note,
          ],
        );
    }
  }

  static String _word(String? level) => switch (level) {
        'quiet' => 'Quiet',
        'moderate' => 'Moderate',
        'noisy' => 'Noisy',
        _ => 'recorded',
      };
}
