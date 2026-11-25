import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/models/rewards.dart';
import '../../core/services.dart';
import '../../core/widgets/error_view.dart';
import '../../core/widgets/view_model_builder.dart';
import 'coupon_view_model.dart';
import 'rewards_format.dart';

/// A coupon at the counter (PB-27, UC-14, RWD-017..RWD-020). The student
/// activates it once, with a confirmation, and shows the staff this screen:
/// reward, venue, code, activation time and a live countdown (RWD-019). A
/// running clock proves it is the live screen and not a screenshot.
class CouponView extends StatefulWidget {
  const CouponView({super.key, required this.couponId, this.now});

  final String couponId;

  /// The clock; tests pass a fixed one.
  final DateTime Function()? now;

  @override
  State<CouponView> createState() => _CouponViewState();
}

class _CouponViewState extends State<CouponView> {
  Timer? _ticker;
  CouponViewModel? _vm;

  /// Ticks once a second while the countdown runs; stops by itself after.
  void _syncTicker() {
    final running = _vm?.status == CouponStatus.active;
    if (running && _ticker == null) {
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        final vm = _vm;
        if (vm == null || vm.isDisposed) return;
        vm.tick();
        if (vm.status != CouponStatus.active) _stopTicker();
      });
    } else if (!running) {
      _stopTicker();
    }
  }

  void _stopTicker() {
    _ticker?.cancel();
    _ticker = null;
  }

  @override
  void dispose() {
    _stopTicker();
    super.dispose();
  }

  Future<void> _activate(CouponViewModel vm) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Start the 5-minute timer now?'),
        content: const Text(
          'Do this at the counter, then show this screen to the staff. '
          'It cannot be undone, and an expired coupon cannot be used again.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Not yet')),
          FilledButton(
            key: const Key('coupon_activate_confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Activate'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await vm.activate();
    final message = vm.takeMessage();
    if (message != null && mounted) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<CouponViewModel>(
      create: (context) => CouponViewModel(
        api: AppScope.of(context).api,
        couponId: widget.couponId,
        now: widget.now,
      ),
      onReady: (vm) {
        _vm = vm;
        vm.load();
      },
      builder: (context, vm) {
        // After each rebuild: start or stop the one-second ticker.
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _syncTicker();
        });
        return Scaffold(
          appBar: AppBar(title: const Text('Your coupon')),
          body: _body(context, vm),
        );
      },
    );
  }

  Widget _body(BuildContext context, CouponViewModel vm) {
    if (vm.loading && vm.coupon == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (vm.coupon == null) {
      return ErrorView(message: vm.error ?? 'This coupon was not found.', onRetry: vm.load);
    }
    final coupon = vm.coupon!;
    final status = vm.status!;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Align(alignment: Alignment.centerLeft, child: _Chip(status: status)),
        const SizedBox(height: 12),
        Text(coupon.reward, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
        Text('at ${coupon.venueName}', style: text.titleMedium?.copyWith(color: scheme.outline)),
        const SizedBox(height: 24),
        Text('COUPON CODE', style: text.labelMedium?.copyWith(color: scheme.outline, letterSpacing: 1.2)),
        SelectableText(
          coupon.code,
          key: const Key('coupon_code'),
          style: text.displaySmall?.copyWith(
            fontFamily: 'monospace',
            fontWeight: FontWeight.bold,
            letterSpacing: 4,
          ),
        ),
        const SizedBox(height: 24),
        if (status == CouponStatus.issued) ..._issued(context, vm),
        if (status == CouponStatus.active) ..._active(context, vm, coupon),
        if (status == CouponStatus.expired) ..._expired(context, coupon),
        const SizedBox(height: 24),
        const Divider(),
        Text(
          'Redeemed on ${dateText(coupon.redeemedAt)} for ${pointsText(coupon.pointCost)}',
          style: text.bodySmall?.copyWith(color: scheme.outline),
        ),
        if (status == CouponStatus.issued)
          Text(
            emailStatusText(coupon.emailStatus),
            key: const Key('coupon_email_status'),
            style: text.bodySmall?.copyWith(color: scheme.outline),
          ),
      ],
    );
  }

  List<Widget> _issued(BuildContext context, CouponViewModel vm) {
    final scheme = Theme.of(context).colorScheme;
    return [
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: scheme.secondaryContainer,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          'Only activate at the counter. After you activate, the coupon is valid '
          'for 5 minutes and then expires for good.',
          style: TextStyle(color: scheme.onSecondaryContainer),
        ),
      ),
      const SizedBox(height: 16),
      FilledButton.icon(
        key: const Key('coupon_activate'),
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        onPressed: vm.activating ? null : () => _activate(vm),
        icon: vm.activating
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.timer_outlined),
        label: const Text('Activate at the counter'),
      ),
    ];
  }

  List<Widget> _active(BuildContext context, CouponViewModel vm, Coupon coupon) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final now = vm.now();
    return [
      Text('TIME LEFT', style: text.labelMedium?.copyWith(color: scheme.outline, letterSpacing: 1.2)),
      Text(
        countdownText(vm.remaining),
        key: const Key('coupon_countdown'),
        style: text.displayLarge?.copyWith(
          color: scheme.primary,
          fontWeight: FontWeight.bold,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
      const SizedBox(height: 8),
      ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: LinearProgressIndicator(
          value: vm.remainingFraction,
          minHeight: 10,
          semanticsLabel: 'Time left',
        ),
      ),
      const SizedBox(height: 12),
      Text('Activated at ${clockText(coupon.activatedAt!)}'),
      const SizedBox(height: 4),
      Row(
        children: [
          AnimatedOpacity(
            opacity: now.second.isEven ? 1 : 0.3,
            duration: const Duration(milliseconds: 400),
            child: Icon(Icons.circle, size: 12, color: scheme.primary),
          ),
          const SizedBox(width: 8),
          Text(
            'Live · ${clockText(now)}',
            key: const Key('coupon_live_clock'),
            style: text.titleSmall?.copyWith(color: scheme.primary),
          ),
        ],
      ),
      const SizedBox(height: 8),
      Text(
        'Staff: the moving clock shows this is the live screen, not a screenshot.',
        style: text.bodySmall?.copyWith(color: scheme.outline),
      ),
    ];
  }

  List<Widget> _expired(BuildContext context, Coupon coupon) {
    final scheme = Theme.of(context).colorScheme;
    return [
      Container(
        key: const Key('coupon_expired'),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          'This coupon has expired. A coupon can be activated only once, and its '
          'points are not refunded.'
          '${coupon.activatedAt == null ? '' : ' It was activated at ${clockText(coupon.activatedAt!)}.'}',
        ),
      ),
    ];
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.status});

  final CouponStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (background, foreground) = switch (status) {
      CouponStatus.active => (scheme.primary, scheme.onPrimary),
      CouponStatus.issued => (scheme.secondaryContainer, scheme.onSecondaryContainer),
      CouponStatus.expired => (scheme.surfaceContainerHigh, scheme.outline),
    };
    return Container(
      key: const Key('coupon_status'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
      child: Text(
        statusText(status),
        style: Theme.of(context).textTheme.labelLarge?.copyWith(color: foreground),
      ),
    );
  }
}
