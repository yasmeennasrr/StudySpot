import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/rewards.dart';
import '../../core/services.dart';
import '../../core/widgets/error_view.dart';
import '../../core/widgets/view_model_builder.dart';
import 'rewards_format.dart';
import 'rewards_view_model.dart';

/// The Rewards tab (PB-24, PB-25, UC-13): points, today's progress towards the
/// daily cap, coupons on offer, and My coupons. On a wide screen the offers and
/// My coupons sit side by side; on a phone a switch shows one at a time.
class RewardsView extends StatelessWidget {
  const RewardsView({super.key});

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    return ViewModelBuilder<RewardsViewModel>(
      create: (context) => RewardsViewModel(
        api: services.api,
        signedIn: services.session.isSignedIn,
      ),
      onReady: (vm) => vm.load(),
      builder: (context, vm) => Scaffold(
        appBar: AppBar(
          title: const Text('Rewards'),
          actions: [
            IconButton(
              key: const Key('rewards_refresh'),
              tooltip: 'Refresh',
              icon: const Icon(Icons.refresh),
              onPressed: vm.loading ? null : vm.load,
            ),
          ],
        ),
        body: _Body(vm: vm),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.vm});

  final RewardsViewModel vm;

  @override
  Widget build(BuildContext context) {
    if (vm.loading && !vm.hasData) {
      return const Center(child: CircularProgressIndicator());
    }
    if (vm.error != null && !vm.hasData) {
      return ErrorView(message: vm.error!, onRetry: vm.load);
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 840;
        final offers = _OffersList(vm: vm);
        final mine = _MyCouponsList(vm: vm);
        return RefreshIndicator(
          onRefresh: vm.load,
          child: ListView(
            key: const Key('rewards_list'),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (vm.signedIn && vm.points != null)
                _PointsCard(points: vm.points!)
              else if (!vm.signedIn)
                const _GuestCard(),
              const SizedBox(height: 16),
              if (!vm.signedIn)
                offers
              else if (wide)
                Row(
                  key: const Key('rewards_two_columns'),
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: offers),
                    const SizedBox(width: 24),
                    Expanded(child: mine),
                  ],
                )
              else ...[
                Center(
                  child: SegmentedButton<bool>(
                    key: const Key('rewards_switch'),
                    showSelectedIcon: false,
                    segments: [
                      const ButtonSegment(
                        value: false,
                        icon: Icon(Icons.storefront_outlined),
                        label: Text('On offer'),
                      ),
                      ButtonSegment(
                        value: true,
                        icon: const Icon(Icons.confirmation_number_outlined),
                        label: Text(
                          vm.activeOrReadyCount == 0
                              ? 'My coupons'
                              : 'My coupons (${vm.activeOrReadyCount})',
                        ),
                      ),
                    ],
                    selected: {vm.showMine},
                    onSelectionChanged: (s) => vm.setShowMine(s.first),
                  ),
                ),
                const SizedBox(height: 12),
                vm.showMine ? mine : offers,
              ],
            ],
          ),
        );
      },
    );
  }
}

/// RWD-004, RWD-016: balance, and today's progress towards the cap.
class _PointsCard extends StatelessWidget {
  const _PointsCard({required this.points});

  final PointsSummary points;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final capReached = points.leftToday == 0;
    return Card(
      key: const Key('rewards_points_card'),
      color: scheme.primaryContainer,
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Your points', style: text.labelLarge?.copyWith(color: scheme.onPrimaryContainer)),
            Text(
              '${points.balance}',
              key: const Key('rewards_balance'),
              style: text.displaySmall?.copyWith(
                color: scheme.onPrimaryContainer,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Today: ${points.earnedToday} of ${points.dailyCap} points from surveys',
              key: const Key('rewards_today'),
              style: TextStyle(color: scheme.onPrimaryContainer),
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: points.todayProgress,
                minHeight: 8,
                semanticsLabel: 'Points earned today',
              ),
            ),
            const SizedBox(height: 10),
            Text(
              capReached
                  ? 'You reached today\'s limit. Surveys still help others; points start again tomorrow.'
                  : 'Answer the crowd, noise and Wi-Fi questions in a survey at a place: '
                        '${points.crowdPoints} points each, up to ${points.dailyCap} a day.',
              style: text.bodySmall?.copyWith(color: scheme.onPrimaryContainer),
            ),
          ],
        ),
      ),
    );
  }
}

/// Guests see what points are worth and how to start collecting them.
class _GuestCard extends StatelessWidget {
  const _GuestCard();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Card(
      key: const Key('rewards_guest_card'),
      color: scheme.primaryContainer,
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.card_giftcard, color: scheme.onPrimaryContainer, size: 32),
            const SizedBox(height: 8),
            Text(
              'Earn points, get treats',
              style: text.titleLarge?.copyWith(color: scheme.onPrimaryContainer),
            ),
            const SizedBox(height: 4),
            Text(
              'Share how busy, loud and connected a place is and earn points. '
              'Swap them for coupons at the cafés below.',
              style: TextStyle(color: scheme.onPrimaryContainer),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                FilledButton(
                  key: const Key('rewards_signin'),
                  onPressed: () => context.push('/signin?from=${Uri.encodeComponent('/rewards')}'),
                  child: const Text('Sign in'),
                ),
                OutlinedButton(
                  key: const Key('rewards_register'),
                  onPressed: () =>
                      context.push('/register?from=${Uri.encodeComponent('/rewards')}'),
                  child: const Text('Create account'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
    child: Text(text, style: Theme.of(context).textTheme.titleMedium),
  );
}

/// RWD-005, RWD-006: coupons on offer, with cost and venue.
class _OffersList extends StatelessWidget {
  const _OffersList({required this.vm});

  final RewardsViewModel vm;

  Future<void> _redeem(BuildContext context, CouponOffer offer) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Redeem ${pointsText(offer.pointCost)}?'),
        content: Text(
          'You get: ${offer.reward} at ${offer.venueName}.\n\n'
          'We e-mail the coupon to you, and it is also saved under My coupons. '
          'Activate it only at the counter: it is valid for 5 minutes after you activate it.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            key: const Key('redeem_confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Redeem'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await vm.redeem(offer);
    final message = vm.takeMessage();
    if (message != null && context.mounted) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('rewards_offers'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionTitle('Coupons on offer'),
        if (vm.offers.isEmpty)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('No coupons on offer right now. Check back soon.'),
          ),
        for (final offer in vm.offers)
          _OfferCard(
            offer: offer,
            signedIn: vm.signedIn,
            affordable: vm.canAfford(offer),
            shortBy: vm.shortBy(offer),
            busy: vm.redeemingOfferId == offer.id,
            onRedeem: vm.redeemingOfferId == null ? () => _redeem(context, offer) : null,
          ),
      ],
    );
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({
    required this.offer,
    required this.signedIn,
    required this.affordable,
    required this.shortBy,
    required this.busy,
    required this.onRedeem,
  });

  final CouponOffer offer;
  final bool signedIn;
  final bool affordable;
  final int shortBy;
  final bool busy;
  final VoidCallback? onRedeem;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    Widget action;
    if (!signedIn) {
      action = const SizedBox.shrink();
    } else if (busy) {
      action = const SizedBox(
        width: 24,
        height: 24,
        child: CircularProgressIndicator(strokeWidth: 2.5),
      );
    } else if (affordable) {
      action = FilledButton.tonal(
        key: Key('redeem_${offer.id}'),
        onPressed: onRedeem,
        child: const Text('Redeem'),
      );
    } else {
      action = Text(
        '$shortBy more\nneeded',
        key: Key('short_${offer.id}'),
        textAlign: TextAlign.end,
        style: text.bodySmall?.copyWith(color: scheme.outline),
      );
    }
    return Card(
      key: Key('offer_${offer.id}'),
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: scheme.outlineVariant),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: scheme.secondaryContainer,
              child: Icon(Icons.local_cafe_outlined, color: scheme.onSecondaryContainer),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(offer.reward, style: text.titleSmall),
                  Text(offer.venueName, style: text.bodyMedium?.copyWith(color: scheme.outline)),
                  const SizedBox(height: 4),
                  Text(
                    pointsText(offer.pointCost),
                    style: text.labelLarge?.copyWith(color: scheme.primary),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            action,
          ],
        ),
      ),
    );
  }
}

/// RWD-021: the student's coupons; tap one to use it at the counter.
class _MyCouponsList extends StatelessWidget {
  const _MyCouponsList({required this.vm});

  final RewardsViewModel vm;

  Future<void> _open(BuildContext context, Coupon coupon) async {
    await context.push('/rewards/coupons/${coupon.id}');
    // Back from the counter: the coupon may now be active or expired.
    if (!vm.isDisposed) await vm.load();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('rewards_mine'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionTitle('My coupons'),
        if (vm.coupons.isEmpty)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'No coupons yet. Redeem your points for one under Coupons on offer.',
              key: Key('rewards_mine_empty'),
            ),
          ),
        for (final coupon in vm.coupons)
          _CouponTile(coupon: coupon, onTap: () => _open(context, coupon)),
      ],
    );
  }
}

class _CouponTile extends StatelessWidget {
  const _CouponTile({required this.coupon, required this.onTap});

  final Coupon coupon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final status = coupon.statusAt(DateTime.now());
    final expired = status == CouponStatus.expired;
    return Card(
      key: Key('coupon_${coupon.id}'),
      elevation: 0,
      color: expired ? scheme.surfaceContainerHighest : null,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: scheme.outlineVariant),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        title: Text(coupon.reward, style: expired ? text.titleSmall?.copyWith(color: scheme.outline) : text.titleSmall),
        subtitle: Text(
          '${coupon.venueName}\n'
          '${status == CouponStatus.issued ? emailStatusText(coupon.emailStatus) : status == CouponStatus.active ? 'Running now: tap to show the timer' : 'Used'}',
        ),
        isThreeLine: true,
        trailing: _StatusChip(status: status),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

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
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
      child: Text(
        statusText(status),
        style: Theme.of(context).textTheme.labelMedium?.copyWith(color: foreground),
      ),
    );
  }
}
