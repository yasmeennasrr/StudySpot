import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

enum LocationAccess {
  granted,
  backgroundGranted,
  denied,
  deniedForever,
  serviceOff,
}

extension LocationAccessStatus on LocationAccess {
  bool get hasForegroundAccess =>
      this == LocationAccess.granted ||
      this == LocationAccess.backgroundGranted;
}

class DevicePosition {
  const DevicePosition(this.lat, this.lng);
  final double lat;
  final double lng;
}

/// The device location, only through the OS permission system (EIR-004,
/// SEN-001, SEN-002). Behind an interface so screens can be tested.
abstract class LocationService {
  Future<LocationAccess> currentAccess();

  /// Shows the operating system's own prompt.
  Future<LocationAccess> requestAccess();

  /// Requests the stronger permission used by the optional presence prompt.
  Future<LocationAccess> requestBackgroundAccess();

  /// Location samples received while optional presence check-ins are enabled.
  Stream<DevicePosition> get presenceUpdates;

  /// Starts OS location updates after background access has been granted.
  Future<bool> startPresenceUpdates();

  /// Stops OS location updates when the user turns the feature off.
  Future<void> stopPresenceUpdates();

  /// Null when access is not granted or the position can't be read.
  Future<DevicePosition?> currentPosition();
}

class GeolocatorLocationService implements LocationService {
  GeolocatorLocationService({
    this.isWeb = kIsWeb,
    this.allowedInApp = _never,
    this.positionTimeout = const Duration(seconds: 10),
  });

  final bool isWeb;

  /// True when the student's last choice in the app was to allow location.
  final bool Function() allowedInApp;

  /// Our own limit: geolocator_web 4.1.4 sends the browser microseconds where it
  /// expects milliseconds, so its `timeLimit` of 10 s becomes almost 3 hours.
  final Duration positionTimeout;

  static bool _never() => false;

  final StreamController<DevicePosition> _presenceUpdates =
      StreamController<DevicePosition>.broadcast();
  StreamSubscription<Position>? _presenceSubscription;

  @override
  Stream<DevicePosition> get presenceUpdates => _presenceUpdates.stream;

  LocationAccess _map(LocationPermission p) {
    switch (p) {
      case LocationPermission.always:
        return LocationAccess.backgroundGranted;
      case LocationPermission.whileInUse:
        return LocationAccess.granted;
      case LocationPermission.deniedForever:
        return LocationAccess.deniedForever;
      default:
        return LocationAccess.denied;
    }
  }

  @override
  Future<LocationAccess> currentAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return LocationAccess.serviceOff;
    }
    return _map(await Geolocator.checkPermission());
  }

  @override
  Future<LocationAccess> requestAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return LocationAccess.serviceOff;
    }
    return _map(await Geolocator.requestPermission());
  }

  @override
  Future<LocationAccess> requestBackgroundAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return LocationAccess.serviceOff;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    // Platforms request foreground access first and may then present a separate
    // step for background access. Calling again after foreground is granted
    // allows the OS/plugin to show that second step when supported.
    if (permission == LocationPermission.whileInUse) {
      permission = await Geolocator.requestPermission();
    }
    return _map(permission);
  }

  @override
  Future<bool> startPresenceUpdates() async {
    if (_presenceSubscription != null) return true;
    if (await currentAccess() != LocationAccess.backgroundGranted) return false;

    _presenceSubscription =
        Geolocator.getPositionStream(
          locationSettings: _presenceLocationSettings(),
        ).listen(
          (position) => _presenceUpdates.add(
            DevicePosition(position.latitude, position.longitude),
          ),
          onError: (Object error, StackTrace stackTrace) {
            _presenceUpdates.addError(error, stackTrace);
            _presenceSubscription = null;
          },
          onDone: () => _presenceSubscription = null,
        );
    return true;
  }

  @override
  Future<void> stopPresenceUpdates() async {
    await _presenceSubscription?.cancel();
    _presenceSubscription = null;
  }

  LocationSettings _presenceLocationSettings() {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.medium,
        distanceFilter: 50,
        intervalDuration: const Duration(minutes: 15),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'StudySpot presence check-ins',
          notificationText: 'Location is used for optional venue check-ins.',
          enableWakeLock: false,
        ),
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.medium,
        activityType: ActivityType.other,
        distanceFilter: 50,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.medium,
      distanceFilter: 50,
    );
  }

  @override
  Future<DevicePosition?> currentPosition() async {
    // SEN-002: never touch the location without permission.
    try {
      final access = await currentAccess();
      if (!access.hasForegroundAccess && !_browserUndecided(access)) return null;
      final p = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: positionTimeout,
        ),
      ).timeout(positionTimeout);
      return DevicePosition(p.latitude, p.longitude);
    } catch (_) {
      return null;
    }
  }

  /// iPhone Safari can keep answering "prompt" (which geolocator maps to denied)
  /// after the student allowed location (WebKit bug 258726). If they allowed it
  /// in the app, read the position anyway: the browser still refuses or asks by
  /// itself. A real "denied" arrives as deniedForever and is never overridden.
  bool _browserUndecided(LocationAccess access) =>
      isWeb && access == LocationAccess.denied && allowedInApp();
}

/// For tests: answers whatever [access] says.
class FakeLocationService implements LocationService {
  FakeLocationService({
    this.access = LocationAccess.denied,
    this.answerToRequest,
    this.answerToBackgroundRequest,
  });

  LocationAccess access;

  /// What the OS prompt returns; defaults to [access].
  LocationAccess? answerToRequest;
  LocationAccess? answerToBackgroundRequest;
  int requests = 0;
  int backgroundRequests = 0;
  bool presenceUpdatesStarted = false;
  final StreamController<DevicePosition> _presenceUpdates =
      StreamController<DevicePosition>.broadcast();

  @override
  Stream<DevicePosition> get presenceUpdates => _presenceUpdates.stream;

  @override
  Future<LocationAccess> currentAccess() async => access;

  @override
  Future<LocationAccess> requestAccess() async {
    requests++;
    access = answerToRequest ?? access;
    return access;
  }

  @override
  Future<LocationAccess> requestBackgroundAccess() async {
    backgroundRequests++;
    access = answerToBackgroundRequest ?? access;
    return access;
  }

  @override
  Future<bool> startPresenceUpdates() async {
    presenceUpdatesStarted = access == LocationAccess.backgroundGranted;
    return presenceUpdatesStarted;
  }

  @override
  Future<void> stopPresenceUpdates() async {
    presenceUpdatesStarted = false;
  }

  @override
  Future<DevicePosition?> currentPosition() async => access.hasForegroundAccess
      ? const DevicePosition(30.0444, 31.2357)
      : null;
}
