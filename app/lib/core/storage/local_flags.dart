import 'package:shared_preferences/shared_preferences.dart';

/// Small facts the app remembers on this phone (not secrets).
abstract class LocalFlags {
  Future<void> load();

  /// PRIV-011: terms and privacy notice accepted at first launch.
  bool get termsAccepted;
  Future<void> acceptTerms();

  /// The location purpose screen has been shown once (PRIV-003).
  bool get locationAsked;
  Future<void> markLocationAsked();

  /// Area typed by a user who refused location (FR-011, USE-007). M6's
  /// search uses it when no device location is available.
  String? get manualArea;
  Future<void> setManualArea(String? area);
}

class SharedPrefsFlags implements LocalFlags {
  late SharedPreferences _prefs;

  static const _terms = 'terms_accepted_at';
  static const _location = 'location_asked';
  static const _area = 'manual_area';

  @override
  Future<void> load() async => _prefs = await SharedPreferences.getInstance();

  @override
  bool get termsAccepted => _prefs.getString(_terms) != null;

  @override
  Future<void> acceptTerms() =>
      _prefs.setString(_terms, DateTime.now().toUtc().toIso8601String());

  @override
  bool get locationAsked => _prefs.getBool(_location) ?? false;

  @override
  Future<void> markLocationAsked() => _prefs.setBool(_location, true);

  @override
  String? get manualArea => _prefs.getString(_area);

  @override
  Future<void> setManualArea(String? area) async {
    if (area == null) {
      await _prefs.remove(_area);
    } else {
      await _prefs.setString(_area, area);
    }
  }
}

/// For tests.
class MemoryFlags implements LocalFlags {
  MemoryFlags({this.termsAccepted = false, this.locationAsked = false, this.manualArea});

  @override
  bool termsAccepted;
  @override
  bool locationAsked;
  @override
  String? manualArea;

  @override
  Future<void> load() async {}

  @override
  Future<void> acceptTerms() async => termsAccepted = true;

  @override
  Future<void> markLocationAsked() async => locationAsked = true;

  @override
  Future<void> setManualArea(String? area) async => manualArea = area;
}
