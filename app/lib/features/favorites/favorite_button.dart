import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/services.dart';
import '../../core/widgets/view_model_builder.dart';
import 'repository.dart';
import 'view_model.dart';

/// Heart button for M6's venue details screen (FR-026). Usage:
///   FavoriteButton(venueId: venue.id, initial: details['isFavorite'] == true)
/// When nobody is signed in it opens sign-in and comes back (FR-007).
class FavoriteButton extends StatelessWidget {
  const FavoriteButton({super.key, required this.venueId, this.initial = false});

  final String venueId;
  final bool initial;

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    return ViewModelBuilder<FavoriteToggleViewModel>(
      create: (context) => FavoriteToggleViewModel(
        FavoritesRepository(services.api),
        venueId: venueId,
        initial: initial,
      ),
      builder: (context, vm) => IconButton(
        tooltip: vm.isFavorite ? 'Remove from favorites' : 'Save as favorite',
        icon: Icon(vm.isFavorite ? Icons.favorite : Icons.favorite_border),
        onPressed: vm.busy
            ? null
            : () async {
                if (!services.session.isSignedIn) {
                  final here = GoRouterState.of(context).uri.toString();
                  context.go('/signin?from=${Uri.encodeComponent(here)}');
                  return;
                }
                await vm.toggle();
                if (vm.error != null && context.mounted) {
                  ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text(vm.error!)));
                }
              },
      ),
    );
  }
}
