import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/api/api_error.dart';
import 'package:studyspot/features/favorites/repository.dart';
import 'package:studyspot/features/favorites/view_model.dart';

import '../../helpers.dart';

void main() {
  test('TC-M5-14 save a favorite, see it in the list, remove it; a failed removal is undone',
      () async {
    final w = TestWorld();
    final repo = FavoritesRepository(w.api);
    final id = w.api.venues.first.id;

    final heart = FavoriteToggleViewModel(repo, venueId: id, initial: false);
    await heart.toggle();
    expect(heart.isFavorite, isTrue);

    final list = FavoritesViewModel(repo);
    await list.load();
    expect(list.items.map((v) => v.id), [id]);

    w.api.failNext = ApiError.network;
    await list.remove(id);
    expect(list.items.map((v) => v.id), [id], reason: 'put back after failure');
    expect(list.actionError, ApiError.network.message);

    await list.remove(id);
    expect(list.items, isEmpty);
    expect(w.api.favoriteIds, isEmpty);
  });
}
