import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/models/venue.dart';
import '../../core/services.dart';
import '../../core/widgets/error_view.dart';
import '../../core/widgets/view_model_builder.dart';
import '../map/venue_map.dart';
import 'filter_sheet.dart';
import 'search_view_model.dart';
import 'venue_card.dart';

/// The home screen (UC-03): search, nearby list with distance, filters, and
/// the same results on a map. Visitors can use it without an account (FR-006).
/// On a phone or tablet the map runs across the top with the list on a sheet
/// below it (the switch shows the map full screen); on a laptop
/// (splitViewMinWidth) they sit side by side.
class SearchView extends StatefulWidget {
  const SearchView({super.key});

  @override
  State<SearchView> createState() => _SearchViewState();
}

class _SearchViewState extends State<SearchView> {
  bool _showMap = false;
  final _searchController = TextEditingController();
  late final AppServices _services;

  @override
  void initState() {
    super.initState();
    _services = AppScope.of(context);
    _services.session.addListener(_rebuild);
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _services.session.removeListener(_rebuild);
    _searchController.dispose();
    super.dispose();
  }

  void _open(VenueSummary v) => context.push('/venues/${v.id}');

  Future<void> _filters(SearchViewModel vm) async {
    final chosen = await showFilterSheet(
      context,
      current: vm.filters,
      canUseDistance: vm.source != SearchSource.all,
      loadSaved: _services.session.isSignedIn ? vm.savedPreferences : null,
    );
    if (chosen != null) await vm.applyFilters(chosen);
  }

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<SearchViewModel>(
      create: (context) => SearchViewModel(
        api: _services.api,
        location: _services.location,
        flags: _services.flags,
      ),
      onReady: (vm) => vm.load(),
      builder: (context, vm) => Scaffold(
        // StudyMatch, Saved, Rewards and Account are tabs now (AppShell).
        appBar: AppBar(title: const Text('StudySpot')),
        body: LayoutBuilder(
          builder: (context, constraints) {
            final split = constraints.maxWidth >= splitViewMinWidth;
            final panel = _panel(context, vm, split: split);
            if (!split) return _mapFirst(context, vm, panel, constraints);
            // Laptop: the list and the map side by side, like a maps app.
            return Row(
              key: const Key('search_split'),
              children: [
                SizedBox(
                  width: 420,
                  child: ColoredBox(
                    color: Theme.of(context).colorScheme.surfaceContainerLowest,
                    child: panel,
                  ),
                ),
                const VerticalDivider(width: 1, thickness: 1),
                Expanded(child: _map(vm)),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _map(SearchViewModel vm) => VenueMap(
        key: ValueKey(vm.mappable.map((v) => v.id).join(',')),
        venues: vm.mappable,
        onOpen: _open,
        showTiles: _services.loadNetworkImages,
      );

  /// Phone and tablet: the map across the top and the list on a sheet below
  /// it, like a maps app. "Map" in the switch shows the map full screen. In a
  /// short window (a phone on its side) the list gets all the room.
  Widget _mapFirst(
    BuildContext context,
    SearchViewModel vm,
    Widget panel,
    BoxConstraints constraints,
  ) {
    final showStrip = !_showMap && vm.error == null && constraints.maxHeight >= 560;
    if (!showStrip) return panel;
    final scheme = Theme.of(context).colorScheme;
    final mapHeight = (constraints.maxHeight * 0.34).clamp(170.0, 300.0);
    return Stack(
      key: const Key('search_map_first'),
      children: [
        // The map runs under the sheet's rounded corners.
        Positioned(top: 0, left: 0, right: 0, height: mapHeight + 24, child: _map(vm)),
        Positioned.fill(
          top: mapHeight,
          child: Material(
            color: scheme.surfaceContainerLowest,
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
              side: BorderSide(color: scheme.outlineVariant),
            ),
            child: Column(
              children: [
                Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(top: 8, bottom: 4),
                  decoration: BoxDecoration(
                    color: scheme.outlineVariant,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                Expanded(child: panel),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// Search box, source line, filters and results. With [split] the map is
  /// already beside the list, so the list/map switch is hidden.
  Widget _panel(BuildContext context, SearchViewModel vm, {required bool split}) {
    final theme = Theme.of(context);
    return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
              child: TextField(
                key: const Key('search_field'),
                controller: _searchController,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Search by café name',
                  prefixIcon: const Icon(Icons.search),
                  isDense: true,
                  suffixIcon: vm.query.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            _searchController.clear();
                            vm.search('');
                          },
                        ),
                ),
                onSubmitted: vm.search,
              ),
            ),
            // What the list shows ("Near you, nearest first"), as the heading.
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 12, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Text(vm.sourceLabel,
                        key: const Key('search_source'),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleLarge),
                  ),
                  if (!split)
                    SegmentedButton<bool>(
                      key: const Key('search_view_toggle'),
                      showSelectedIcon: false,
                      segments: const [
                        ButtonSegment(value: false, icon: Icon(Icons.list), tooltip: 'List'),
                        ButtonSegment(value: true, icon: Icon(Icons.map), tooltip: 'Map'),
                      ],
                      selected: {_showMap},
                      onSelectionChanged: (s) => setState(() => _showMap = s.first),
                    ),
                ],
              ),
            ),
            // Near me / All places (see every café, however far, to plan
            // ahead) and Filters. A Wrap, so they never overflow a narrow phone.
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (vm.hasLocation && vm.query.trim().isEmpty) ...[
                      ChoiceChip(
                        key: const Key('scope_nearby'),
                        label: const Text('Near me'),
                        selected: !vm.showAll,
                        onSelected: (_) => vm.setShowAll(false),
                      ),
                      ChoiceChip(
                        key: const Key('scope_all'),
                        label: const Text('All places'),
                        selected: vm.showAll,
                        onSelected: (_) => vm.setShowAll(true),
                      ),
                    ],
                    TextButton.icon(
                      key: const Key('search_filters'),
                      onPressed: () => _filters(vm),
                      icon: const Icon(Icons.tune),
                      label: Text(vm.activeFilterCount == 0
                          ? 'Filters'
                          : 'Filters (${vm.activeFilterCount})'),
                    ),
                  ],
                ),
              ),
            ),
            if (vm.degraded)
              Container(
                key: const Key('search_degraded'),
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(12, 4, 12, 0),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'The maps service is unavailable, so the area could not '
                  'be located. Showing name matches only.',
                  style: TextStyle(color: theme.colorScheme.onErrorContainer),
                ),
              ),
            Expanded(child: _results(context, vm, split: split)),
          ],
        );
  }

  Widget _results(BuildContext context, SearchViewModel vm, {bool split = false}) {
    if (vm.loading && vm.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (vm.error != null) return ErrorView(message: vm.error!, onRetry: vm.load);
    if (vm.items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(vm.emptyMessage,
              key: const Key('search_empty'), textAlign: TextAlign.center),
        ),
      );
    }
    if (_showMap && !split) return _map(vm);
    return RefreshIndicator(
      onRefresh: vm.load,
      child: ListView.builder(
        padding: const EdgeInsets.only(bottom: 16),
        itemCount: vm.items.length,
        itemBuilder: (context, i) =>
            VenueCard(venue: vm.items[i], onTap: () => _open(vm.items[i])),
      ),
    );
  }
}
