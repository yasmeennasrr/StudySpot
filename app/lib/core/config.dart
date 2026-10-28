/// App-wide settings. Override at run time with --dart-define, for example:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
class AppConfig {
  AppConfig._();

  /// The live backend on Render (see app/README.md for local URLs).
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://studyspot-api-x8u6.onrender.com/api/v1',
  );

  /// Dev account on every backend: dev@studyspot.test / devpass123.

  /// Normal calls (app/README.md: 10 s).
  static const Duration requestTimeout = Duration(seconds: 10);

  /// The free Render server sleeps after 15 minutes idle and needs up to a
  /// minute to wake. Only the start-up health check waits this long.
  static const Duration wakeUpTimeout = Duration(seconds: 90);
}
