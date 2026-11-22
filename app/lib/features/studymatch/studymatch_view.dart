import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models/studymatch.dart';
import '../../core/services.dart';
import '../../core/widgets/back_or_home_button.dart';
import '../../core/widgets/condition_label.dart';
import '../../core/widgets/view_model_builder.dart';
import 'studymatch_view_model.dart';

/// Content never gets wider than a large phone, so the chat looks natural on a
/// wide browser window instead of stretched edge to edge.
const double _maxContentWidth = 600;

/// Bubbles and place cards take at most this share of the column.
const double _bubbleShare = 0.8;

const _suggestions = [
  'A quiet café near me',
  'Somewhere cheap with good Wi-Fi',
  'A place for group study, open now',
];

/// PB-29 / UC-05: the StudyMatch chat (AI-001).
class StudyMatchView extends StatelessWidget {
  const StudyMatchView({super.key});

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<StudyMatchViewModel>(
      create: (context) {
        final s = AppScope.of(context);
        return StudyMatchViewModel(api: s.api, location: s.location);
      },
      builder: (context, vm) => Scaffold(
        appBar: AppBar(
          leading: const BackOrHomeButton(),
          title: const Text('StudyMatch'),
        ),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: _maxContentWidth),
              child: Column(
                children: [
                  Expanded(
                    child: vm.messages.isEmpty && !vm.sending
                        ? _Welcome(onPick: vm.sendSuggestion)
                        : _Conversation(vm: vm),
                  ),
                  if (vm.error != null) _ErrorBar(vm: vm),
                  _InputBar(vm: vm),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Welcome extends StatelessWidget {
  const _Welcome({required this.onPick});

  final void Function(String) onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
      children: [
        Icon(Icons.auto_awesome, size: 36, color: theme.colorScheme.primary),
        const SizedBox(height: 12),
        Text(
          'What kind of place are you looking for?',
          style: theme.textTheme.titleMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        Text(
          'Ask in English or Arabic. StudyMatch picks places from real StudySpot data '
          'and tells you why.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final s in _suggestions)
              ActionChip(
                key: Key('studymatch_suggestion_${_suggestions.indexOf(s)}'),
                label: Text(s),
                onPressed: () => onPick(s),
              ),
          ],
        ),
      ],
    );
  }
}

class _Conversation extends StatelessWidget {
  const _Conversation({required this.vm});

  final StudyMatchViewModel vm;

  @override
  Widget build(BuildContext context) {
    // Newest at the bottom; reverse keeps the list scrolled to the latest message.
    final items = <Widget>[
      for (final m in vm.messages)
        m.fromStudent
            ? _StudentBubble(text: m.text)
            : _AnswerBlock(answer: m.answer!),
      if (vm.sending) const _Thinking(),
    ];
    return LayoutBuilder(
      builder: (context, box) => ListView.builder(
        key: const Key('studymatch_messages'),
        reverse: true,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
        itemCount: items.length,
        itemBuilder: (context, i) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: box.maxWidth),
            child: items[items.length - 1 - i],
          ),
        ),
      ),
    );
  }
}

/// A bubble sized to its text, at most [_bubbleShare] of the column.
class _Bubble extends StatelessWidget {
  const _Bubble({required this.mine, required this.child});

  final bool mine;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    const r = Radius.circular(18);
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: LayoutBuilder(
        builder: (context, box) => ConstrainedBox(
          constraints: BoxConstraints(maxWidth: box.maxWidth * _bubbleShare),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: mine
                  ? scheme.primaryContainer
                  : scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.only(
                topLeft: r,
                topRight: r,
                bottomLeft: mine ? r : const Radius.circular(4),
                bottomRight: mine ? const Radius.circular(4) : r,
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}

class _StudentBubble extends StatelessWidget {
  const _StudentBubble({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return _Bubble(
      mine: true,
      child: Text(text, style: TextStyle(color: scheme.onPrimaryContainer)),
    );
  }
}

/// StudyMatch's reply bubble, then its places underneath.
class _AnswerBlock extends StatelessWidget {
  const _AnswerBlock({required this.answer});

  final StudyMatchAnswer answer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final places = answer.recommendations;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Bubble(
          mine: false,
          child: answer.degraded
              // AI-019: the notice is the reply itself; the icon marks it.
              ? Row(
                  key: const Key('studymatch_degraded'),
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Icon(
                        Icons.info_outline,
                        size: 16,
                        color: theme.colorScheme.tertiary,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        answer.reply,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ),
                  ],
                )
              : Text(answer.reply, style: theme.textTheme.bodyMedium),
        ),
        if (places.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 10, 0, 6),
            child: Text(
              answer.degraded ? 'Standard results' : 'Recommended for you',
              key: const Key('studymatch_places_title'),
              style: theme.textTheme.labelLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          for (final p in places)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _PlaceCard(place: p),
            ),
        ],
        if (answer.degraded)
          TextButton.icon(
            key: const Key('studymatch_open_search'),
            onPressed: () => context.go('/home'),
            icon: const Icon(Icons.search, size: 18),
            label: const Text('Open Search'),
          ),
      ],
    );
  }
}

/// A compact place card: name and distance on one line, up to 3 reasons, conditions.
class _PlaceCard extends StatelessWidget {
  const _PlaceCard({required this.place});

  final StudyMatchRecommendation place;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final v = place.venue;
    final distance = distanceText(v.distanceMeters);
    return LayoutBuilder(
      builder: (context, box) => ConstrainedBox(
        constraints: BoxConstraints(maxWidth: box.maxWidth * _bubbleShare + 40),
        child: Card(
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            key: Key('studymatch_place_${v.id}'),
            onTap: () => context.push('/venues/${v.id}'),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Expanded(
                        child: Text(
                          v.name,
                          style: theme.textTheme.titleSmall,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (distance.isNotEmpty)
                        Text(
                          distance,
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                    ],
                  ),
                  for (final reason in place.reasons.take(3)) ...[
                    const SizedBox(height: 4),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Icon(
                            Icons.check,
                            size: 14,
                            color: theme.colorScheme.primary,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(reason, style: theme.textTheme.bodySmall),
                        ),
                      ],
                    ),
                  ],
                  if (v.conditions != null) ...[
                    const SizedBox(height: 8),
                    ConditionChips(conditions: v.conditions),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// PERF-007: shown while StudyMatch works on the answer.
class _Thinking extends StatelessWidget {
  const _Thinking();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _Bubble(
      mine: false,
      child: Row(
        key: const Key('studymatch_thinking'),
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: 10),
          Text(
            'Finding places…',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorBar extends StatelessWidget {
  const _ErrorBar({required this.vm});

  final StudyMatchViewModel vm;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
      child: Row(
        children: [
          Icon(Icons.error_outline, size: 18, color: scheme.error),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              vm.error!,
              key: const Key('studymatch_error'),
              style: TextStyle(color: scheme.error),
            ),
          ),
          if (vm.canRetry)
            TextButton(
              key: const Key('studymatch_retry'),
              onPressed: vm.retry,
              child: const Text('Try again'),
            ),
        ],
      ),
    );
  }
}

class _InputBar extends StatefulWidget {
  const _InputBar({required this.vm});

  final StudyMatchViewModel vm;

  @override
  State<_InputBar> createState() => _InputBarState();
}

class _InputBarState extends State<_InputBar> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (await widget.vm.send()) _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final vm = widget.vm;
    final tooLong = vm.draft.length > StudyMatchViewModel.maxLength;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 8, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              key: const Key('studymatch_input'),
              controller: _controller,
              minLines: 1,
              maxLines: 4,
              textInputAction: TextInputAction.send,
              onChanged: vm.setDraft,
              onSubmitted: (_) => _send(),
              decoration: InputDecoration(
                hintText: 'Ask StudyMatch…',
                filled: true,
                isDense: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                errorText: tooLong
                    ? 'Keep it under ${StudyMatchViewModel.maxLength} characters '
                          '(${vm.draft.length} now).'
                    : null,
              ),
            ),
          ),
          const SizedBox(width: 6),
          IconButton.filled(
            key: const Key('studymatch_send'),
            tooltip: 'Send',
            onPressed: vm.canSend ? _send : null,
            icon: const Icon(Icons.arrow_upward),
          ),
        ],
      ),
    );
  }
}
