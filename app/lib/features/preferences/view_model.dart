import '../../core/api/api_error.dart';
import '../../core/models/preferences.dart';
import '../../core/state/view_model.dart';
import 'repository.dart';

/// PB-13 / UC-06: specify (FR-022), modify and remove (FR-023) study
/// preferences; they persist between sessions because the backend keeps them
/// (FR-024).
class PreferencesViewModel extends ViewModel {
  PreferencesViewModel(this._repository);

  final PreferencesRepository _repository;

  bool loading = true;
  bool saving = false;
  String? loadError;
  String? message;
  bool messageIsError = false;

  /// The form, edited in place. Null = no preference.
  String? noise;
  String? wifi;
  String? crowd;
  bool? outlets;
  int? maxPrice;
  bool? openNow;
  int? maxDistance;
  String? studyType;

  Preferences get current => Preferences(
        noise: noise,
        wifi: wifi,
        crowd: crowd,
        outlets: outlets,
        maxPrice: maxPrice,
        openNow: openNow,
        maxDistance: maxDistance,
        studyType: studyType,
      );

  void _fill(Preferences p) {
    noise = p.noise;
    wifi = p.wifi;
    crowd = p.crowd;
    outlets = p.outlets;
    maxPrice = p.maxPrice;
    openNow = p.openNow;
    maxDistance = p.maxDistance;
    studyType = p.studyType;
  }

  Future<void> load() async {
    loading = true;
    loadError = null;
    notify();
    try {
      _fill(await _repository.load());
    } on ApiError catch (e) {
      loadError = e.message;
    } finally {
      loading = false;
      notify();
    }
  }

  /// Any form change: update the field, clear the last message.
  void update(void Function(PreferencesViewModel vm) change) {
    change(this);
    message = null;
    notify();
  }

  Future<void> save() => _run(
        () async => _fill(await _repository.save(current)),
        done: 'Preferences saved.',
      );

  Future<void> clearAll() => _run(
        () async {
          await _repository.clear();
          _fill(Preferences.empty);
        },
        done: 'All preferences removed.',
      );

  Future<void> _run(Future<void> Function() action, {required String done}) async {
    saving = true;
    message = null;
    notify();
    try {
      await action();
      message = done;
      messageIsError = false;
    } on ApiError catch (e) {
      message = e.message;
      messageIsError = true;
    } finally {
      saving = false;
      notify();
    }
  }
}
