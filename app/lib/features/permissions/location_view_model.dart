import '../../core/location/location_service.dart';
import '../../core/state/view_model.dart';
import '../../core/storage/local_flags.dart';

enum LocationStep {
  /// PRIV-003: explain the purpose before the OS prompt.
  explain,

  /// The OS prompt is open.
  asking,

  /// Granted: nearby search works (FR-010).
  granted,

  /// Refused or skipped: offer manual area entry (FR-011, USE-007).
  manualArea,
}

/// PB-39: location permission with a working alternative when refused.
class LocationViewModel extends ViewModel {
  LocationViewModel({required this.location, required LocalFlags flags})
      : _flags = flags,
        area = flags.manualArea ?? '';

  final LocationService location;
  final LocalFlags _flags;

  LocationStep step = LocationStep.explain;

  /// Why manual entry is shown: null (user chose "Not now"), or the OS answer.
  LocationAccess? refusal;

  String area;
  String? areaError;

  /// Runs when the screen opens: if access was already granted, say so.
  Future<void> init() async {
    if (await location.currentAccess() == LocationAccess.granted) {
      step = LocationStep.granted;
      notify();
    }
  }

  /// "Allow location": only now does the OS prompt appear.
  Future<void> allow() async {
    step = LocationStep.asking;
    notify();
    final result = await location.requestAccess();
    await _flags.markLocationAsked();
    if (result == LocationAccess.granted) {
      step = LocationStep.granted;
    } else {
      refusal = result;
      step = LocationStep.manualArea;
    }
    notify();
  }

  /// "Not now": never shows the OS prompt.
  Future<void> notNow() async {
    await _flags.markLocationAsked();
    refusal = null;
    step = LocationStep.manualArea;
    notify();
  }

  void setArea(String v) {
    area = v;
    if (areaError != null) {
      areaError = null;
      notify();
    }
  }

  /// Saves the typed area for search. Same limits as the API's `area`
  /// parameter (2 to 100 characters).
  Future<bool> saveArea() async {
    final v = area.trim();
    if (v.length < 2) {
      areaError = 'Type at least 2 characters, for example Zamalek.';
    } else if (v.length > 100) {
      areaError = 'Use at most 100 characters.';
    }
    if (areaError != null) {
      notify();
      return false;
    }
    await _flags.setManualArea(v);
    return true;
  }

  /// Message under the area field, depending on why we are here.
  String get refusalHelp {
    switch (refusal) {
      case LocationAccess.deniedForever:
        return 'Location is blocked for StudySpot. You can allow it later in '
            'your phone settings. For now, type an area instead.';
      case LocationAccess.serviceOff:
        return 'Location is turned off on this phone. Type an area instead, or '
            'turn location on in your settings.';
      default:
        return 'No problem. Type an area to find study places there instead.';
    }
  }
}
