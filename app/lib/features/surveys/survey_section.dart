import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/survey.dart';
import '../../core/services.dart';
import '../../core/widgets/view_model_builder.dart';
import 'repository.dart';
import 'view_model.dart';

/// Quick optional condition survey on a venue's detail page (PB-17).
class VenueSurveySection extends StatelessWidget {
  const VenueSurveySection({
    super.key,
    required this.venueId,
    required this.onChanged,
  });

  final String venueId;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    final repository = SurveysRepository(services.api);
    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton.icon(
          key: const Key('share-conditions'),
          onPressed: () async {
            if (!services.session.isSignedIn) {
              final here = GoRouterState.of(context).uri.toString();
              context.go('/signin?from=${Uri.encodeComponent(here)}');
              return;
            }
            final saved = await showModalBottomSheet<StoredSurvey>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              builder: (_) => SurveySheet(repository: repository, venueId: venueId),
            );
            if (saved == null || !context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Thanks! Your survey was saved.')),
            );
            await onChanged();
          },
          icon: const Icon(Icons.poll_outlined),
          label: const Text('Share conditions'),
        ),
      ),
    );
  }
}

class SurveySheet extends StatelessWidget {
  const SurveySheet({super.key, required this.repository, required this.venueId});

  final SurveysRepository repository;
  final String venueId;

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<SurveyFormViewModel>(
      create: (_) => SurveyFormViewModel(repository, venueId: venueId),
      builder: (context, vm) => SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            16,
            0,
            16,
            16 + MediaQuery.of(context).viewInsets.bottom,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('How are things here?', style: Theme.of(context).textTheme.titleLarge),
              const Padding(
                padding: EdgeInsets.only(top: 4, bottom: 12),
                child: Text('Answer what you know. You can skip any question.'),
              ),
              _SurveyQuestion(
                keyPrefix: 'crowd',
                title: 'Crowd',
                value: vm.crowd,
                enabled: !vm.saving,
                choices: const [
                  ('not_crowded', 'Not crowded'),
                  ('slightly_crowded', 'Slightly'),
                  ('moderately_crowded', 'Moderately'),
                  ('very_crowded', 'Very crowded'),
                ],
                onChanged: vm.setCrowd,
              ),
              _SurveyQuestion(
                keyPrefix: 'noise',
                title: 'Noise',
                value: vm.noise,
                enabled: !vm.saving,
                choices: const [
                  ('quiet', 'Quiet'),
                  ('moderate', 'Moderate'),
                  ('noisy', 'Noisy'),
                ],
                onChanged: vm.setNoise,
              ),
              _SurveyQuestion(
                keyPrefix: 'wifi',
                title: 'Wi-Fi',
                value: vm.wifi,
                enabled: !vm.saving,
                choices: const [
                  ('poor', 'Poor'),
                  ('average', 'Average'),
                  ('good', 'Good'),
                  ('not_used', 'Didn’t use it'),
                ],
                onChanged: vm.setWifi,
              ),
              if (vm.error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    vm.error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  key: const Key('submit-survey'),
                  onPressed: vm.canSubmit
                      ? () async {
                          final saved = await vm.submit();
                          if (saved != null && context.mounted) {
                            Navigator.pop(context, saved);
                          }
                        }
                      : null,
                  child: Text(vm.saving ? 'Saving…' : 'Submit survey'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SurveyQuestion extends StatelessWidget {
  const _SurveyQuestion({
    required this.keyPrefix,
    required this.title,
    required this.value,
    required this.enabled,
    required this.choices,
    required this.onChanged,
  });

  final String keyPrefix;
  final String title;
  final String? value;
  final bool enabled;
  final List<(String, String)> choices;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleSmall),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              for (final (option, label) in choices)
                ChoiceChip(
                  key: Key('$keyPrefix-$option'),
                  label: Text(label),
                  selected: value == option,
                  onSelected: enabled
                      ? (selected) => onChanged(selected ? option : null)
                      : null,
                ),
            ],
          ),
        ],
      ),
    );
  }
}
