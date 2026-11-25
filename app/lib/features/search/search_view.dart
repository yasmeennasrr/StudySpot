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
/// On a phone the list and the map are two views of one area; on a laptop
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
            if (!split) return panel;
            // Laptop: the list and the map side by side, like a maps app.
            return Row(
              key: const Key('search_split'),
              children: [
                SizedBox(width: 420, child: panel),
                const VerticalDivider(width: 1, thickness: 1),
                Expanded(
                  child: VenueMap(
                    key: ValueKey(vm.mappable.map((v) => v.id).join(',')),
                    venues: vm.mappable,
                    onOpen: _open,
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  /// Search box, source line, filters and results. With [split] the map is
  /// already beside the list, so the list/map switch is hidden.
  Widget _panel(BuildContext context, SearchViewModel vm, {required bool split}) {
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
                  border: const OutlineInputBorder(),
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
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(vm.sourceLabel,
                        key: const Key('search_source'),
                        overflow: TextOverflow.ellipsis),
                  ),
                  TextButton.icon(
                    key: const Key('search_filters'),
                    onPressed: () => _filters(vm),
                    icon: const Icon(Icons.tune),
                    label: Text(vm.activeFilterCount == 0
                        ? 'Filters'
                        : 'Filters (${vm.activeFilterCount})'),
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
            // Near me / All places: see every café, however far (planning ahead).
            if (vm.hasLocation && vm.query.trim().isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
                child: Row(
                  children: [
                    ChoiceChip(
                      key: const Key('scope_nearby'),
                      label: const Text('Near me'),
                      selected: !vm.showAll,
                      onSelected: (_) => vm.setShowAll(false),
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      key: const Key('scope_all'),
                      label: const Text('All places'),
                      selected: vm.showAll,
                      onSelected: (_) => vm.setShowAll(true),
                    ),
                  ],
                ),
              ),
            if (vm.degraded)
              Container(
                key: const Key('search_degraded'),
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(12, 4, 12, 0),
                padding: const EdgeInsets.all(10),
                color: Theme.of(context).colorScheme.errorContainer,
                child: const Text('The maps service is unavailable, so the area could not '
                    'be located. Showing name matches only.'),
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
    if (_showMap && !split) {
      return VenueMap(
        key: ValueKey(vm.mappable.map((v) => v.id).join(',')),
        venues: vm.mappable,
        onOpen: _open,
      );
    }
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
