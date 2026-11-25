import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../layout/breakpoints.dart';
import '../services.dart';
import '../theme/app_theme.dart';

/// One place in the app's main navigation.
class AppDestination {
  const AppDestination({
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.key,
    this.compactLabel,
  });

  final String label;
  final String? compactLabel;
  final IconData icon;
  final IconData selectedIcon;

  /// Key on the icon, so tests (and screen readers' tooling) can find the tab.
  final Key key;
}

/// The frame around the main screens (DRS feedback: a logical, natural flow
/// that adapts to the screen). The five main places are always one tap away:
///
///  - phone (compact), or any window under 480 high: a bottom navigation bar;
///  - tablet or laptop: a navigation rail on the left, with labels beside the
///    icons on wide screens.
///
/// Each tab keeps its own history and scroll position (go_router
/// StatefulShellRoute), so going to Rewards and back to Explore returns to the
/// same list. Screens that belong to one task (sign in, a venue's details, a
/// coupon at the counter) open on top, full screen, with a back arrow.
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  /// Tab order; the router's branches follow the same order.
  static List<AppDestination> destinations({required bool signedIn}) => [
    const AppDestination(
      label: 'Explore',
      icon: Icons.explore_outlined,
      selectedIcon: Icons.explore,
      key: Key('nav_explore'),
    ),
    const AppDestination(
      label: 'Saved',
      icon: Icons.favorite_border,
      selectedIcon: Icons.favorite,
      key: Key('nav_saved'),
    ),
    const AppDestination(
      label: 'StudyMatch',
      compactLabel: 'Match',
      icon: Icons.auto_awesome_outlined,
      selectedIcon: Icons.auto_awesome,
      key: Key('home_studymatch'),
    ),
    const AppDestination(
      label: 'Rewards',
      icon: Icons.card_giftcard_outlined,
      selectedIcon: Icons.card_giftcard,
      key: Key('nav_rewards'),
    ),
    AppDestination(
      label: signedIn ? 'Account' : 'Sign in',
      icon: signedIn ? Icons.person_outline : Icons.login,
      selectedIcon: Icons.person,
      key: const Key('home_account'),
    ),
  ];

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  AppServices? _services;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final services = AppScope.of(context);
    if (!identical(services, _services)) {
      _services?.session.removeListener(_rebuild);
      _services = services..session.addListener(_rebuild);
    }
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _services?.session.removeListener(_rebuild);
    super.dispose();
  }

  void _select(int index) {
    // Tapping the tab you are on goes back to its first screen.
    widget.navigationShell.goBranch(
      index,
      initialLocation: index == widget.navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    final destinations = AppShell.destinations(
      signedIn: _services?.session.isSignedIn ?? false,
    );
    final index = widget.navigationShell.currentIndex;
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = windowSizeOf(constraints.maxWidth);
        // A phone on its side is wide but short: the rail would not fit.
        if (size == WindowSize.compact || constraints.maxHeight < 480) {
          return Scaffold(
            body: widget.navigationShell,
            bottomNavigationBar: NavigationBar(
              key: const Key('nav_bar'),
              selectedIndex: index,
              onDestinationSelected: _select,
              destinations: [
                for (final d in destinations)
                  NavigationDestination(
                    icon: Icon(d.icon, key: d.key),
                    selectedIcon: Icon(d.selectedIcon),
                    label: d.compactLabel ?? d.label,
                  ),
              ],
            ),
          );
        }
        final extended = size == WindowSize.large;
        return Scaffold(
          body: Row(
            children: [
              SafeArea(
                right: false,
                child: NavigationRail(
                  key: const Key('nav_rail'),
                  extended: extended,
                  labelType: extended
                      ? NavigationRailLabelType.none
                      : NavigationRailLabelType.all,
                  groupAlignment: -0.85,
                  selectedIndex: index,
                  onDestinationSelected: _select,
                  leading: constraints.maxHeight >= 560 ? _Brand(extended: extended) : null,
                  destinations: [
                    for (final d in destinations)
                      NavigationRailDestination(
                        icon: Icon(d.icon, key: d.key),
                        selectedIcon: Icon(d.selectedIcon),
                        label: Text(d.label),
                      ),
                  ],
                ),
              ),
              const VerticalDivider(width: 1, thickness: 1),
              Expanded(child: widget.navigationShell),
            ],
          ),
        );
      },
    );
  }
}

class _Brand extends StatelessWidget {
  const _Brand({required this.extended});

  final bool extended;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final mark = Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: scheme.primary,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        'S',
        style: TextStyle(color: scheme.onPrimary, fontFamily: AppTheme.serif, fontSize: 18),
      ),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: extended
          ? SizedBox(
              width: 200,
              child: Row(
                children: [
                  mark,
                  const SizedBox(width: 12),
                  // Flexible: the name never overflows, whatever the font.
                  Flexible(
                    child: Text(
                      'StudySpot',
                      maxLines: 1,
                      softWrap: false,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontFamily: AppTheme.serif,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  ),
                ],
              ),
            )
          : mark,
    );
  }
}

/// Rebuilds [builder] from scratch when someone signs in or out, so a tab never
/// shows the previous account's data (each tab keeps its screen alive).
class SessionKeyed extends StatefulWidget {
  const SessionKeyed({super.key, required this.builder});

  final WidgetBuilder builder;

  @override
  State<SessionKeyed> createState() => _SessionKeyedState();
}

class _SessionKeyedState extends State<SessionKeyed> {
  AppServices? _services;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final services = AppScope.of(context);
    if (!identical(services, _services)) {
      _services?.session.removeListener(_rebuild);
      _services = services..session.addListener(_rebuild);
    }
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _services?.session.removeListener(_rebuild);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = _services!.session;
    final identity = session.isSignedIn ? 'in:${session.user?.email ?? ''}' : 'out';
    return KeyedSubtree(key: ValueKey(identity), child: widget.builder(context));
  }
}
