import '../../core/api/api_client.dart';
import '../../core/models/preferences.dart';

/// PB-13: study preferences, saved on the backend per user (FR-022 to FR-024).
class PreferencesRepository {
  PreferencesRepository(this._api);

  final ApiClient _api;

  Future<Preferences> load() => _api.getPreferences();
  Future<Preferences> save(Preferences preferences) => _api.savePreferences(preferences);
  Future<void> clear() => _api.clearPreferences();
}
