import '../../core/api/api_error.dart';
import '../../core/models/venue.dart';
import '../../core/state/view_model.dart';
import 'repository.dart';

/// PB-14 / UC-07: view favorites and remove one (FR-027).
class FavoritesViewModel extends ViewModel {
  FavoritesViewModel(this._repository);

  final FavoritesRepository _repository;

  bool loading = true;
  String? loadError;

  /// Shown briefly after a failed removal.
  String? actionError;
  List<VenueSummary> items = const [];

  Future<void> load() async {
    loading = true;
    loadError = null;
    notify();
    try {
      items = await _repository.list();
    } on ApiError catch (e) {
      loadError = e.message;
    } finally {
      loading = false;
      notify();
    }
  }

  /// Removes at once on screen; puts it back if the backend refuses.
  Future<void> remove(String venueId) async {
    final before = items;
    items = items.where((v) => v.id != venueId).toList();
    actionError = null;
    notify();
    try {
      await _repository.remove(venueId);
    } on ApiError catch (e) {
      items = before;
      actionError = e.message;
      notify();
    }
  }
}

/// The heart button on a venue (used by M6 on the details screen, FR-026).
class FavoriteToggleViewModel extends ViewModel {
  FavoriteToggleViewModel(this._repository, {required this.venueId, required bool initial})
      : isFavorite = initial;

  final FavoritesRepository _repository;
  final String venueId;
  bool isFavorite;
  bool busy = false;
  String? error;

  Future<void> toggle() async {
    if (busy) return;
    final wanted = !isFavorite;
    isFavorite = wanted;
    busy = true;
    error = null;
    notify();
    try {
      if (wanted) {
        await _repository.add(venueId);
      } else {
        await _repository.remove(venueId);
      }
    } on ApiError catch (e) {
      isFavorite = !wanted;
      error = e.message;
    } finally {
      busy = false;
      notify();
    }
  }
}
