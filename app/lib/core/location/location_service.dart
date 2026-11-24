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

  /// Null when access is not granted or the position can't be read.
  Future<DevicePosition?> currentPosition();
}

class GeolocatorLocationService implements LocationService {
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
  Future<DevicePosition?> currentPosition() async {
    // SEN-002: never touch the location without permission.
    final access = await currentAccess();
    if (!access.hasForegroundAccess) return null;
    try {
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 10),
        ),
      );
      return DevicePosition(p.latitude, p.longitude);
    } catch (_) {
      return null;
    }
  }
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
  Future<DevicePosition?> currentPosition() async => access.hasForegroundAccess
      ? const DevicePosition(30.0444, 31.2357)
      : null;
}
