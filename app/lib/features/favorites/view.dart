import 'package:flutter/material.dart';

import '../../core/models/venue.dart';
import '../../core/services.dart';
import '../../core/widgets/back_or_home_button.dart';
import '../../core/widgets/error_view.dart';
import '../../core/widgets/view_model_builder.dart';
import 'repository.dart';
import 'view_model.dart';

/// PB-14: the signed-in user's favorite places.
class FavoritesView extends StatelessWidget {
  const FavoritesView({super.key});

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<FavoritesViewModel>(
      create: (context) =>
          FavoritesViewModel(FavoritesRepository(AppScope.of(context).api)),
      onReady: (vm) => vm.load(),
      builder: (context, vm) => Scaffold(
        appBar: AppBar(
          leading: const BackOrHomeButton(),
          title: const Text('Favorites'),
        ),
        body: _body(context, vm),
      ),
    );
  }

  Widget _body(BuildContext context, FavoritesViewModel vm) {
    if (vm.loading) return const Center(child: CircularProgressIndicator());
    if (vm.loadError != null) return ErrorView(message: vm.loadError!, onRetry: vm.load);
    if (vm.items.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'No favorites yet. Tap the heart on a place to save it here.',
            key: Key('favorites_empty'),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    return Column(
      children: [
        if (vm.actionError != null)
          MaterialBanner(
            content: Text(vm.actionError!),
            actions: [TextButton(onPressed: vm.load, child: const Text('Reload'))],
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: vm.load,
            child: ListView.separated(
              itemCount: vm.items.length,
              separatorBuilder: (context, index) => const Divider(height: 1),
              itemBuilder: (context, i) => _FavoriteTile(
                venue: vm.items[i],
                onRemove: () => vm.remove(vm.items[i].id),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _FavoriteTile extends StatelessWidget {
  const _FavoriteTile({required this.venue, required this.onRemove});

  final VenueSummary venue;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      key: Key('favorite_${venue.id}'),
      title: Text(venue.name),
      subtitle: venue.area == null ? null : Text(venue.area!),
      // M6: open the details screen once the /venues/:id route exists, e.g.
      // onTap: () => context.push('/venues/${venue.id}'),
      trailing: IconButton(
        key: Key('favorite_remove_${venue.id}'),
        tooltip: 'Remove from favorites',
        icon: const Icon(Icons.favorite),
        color: Theme.of(context).colorScheme.primary,
        onPressed: onRemove,
      ),
    );
  }
}
