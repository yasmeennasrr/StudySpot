import 'package:geolocator/geolocator.dart';

enum LocationAccess { granted, denied, deniedForever, serviceOff }

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

  /// Null when access is not granted or the position can't be read.
  Future<DevicePosition?> currentPosition();
}

class GeolocatorLocationService implements LocationService {
  LocationAccess _map(LocationPermission p) {
    switch (p) {
      case LocationPermission.always:
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
    if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceOff;
    return _map(await Geolocator.checkPermission());
  }

  @override
  Future<LocationAccess> requestAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceOff;
    return _map(await Geolocator.requestPermission());
  }

  @override
  Future<DevicePosition?> currentPosition() async {
    // SEN-002: never touch the location without permission.
    if (await currentAccess() != LocationAccess.granted) return null;
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
  FakeLocationService({this.access = LocationAccess.denied, this.answerToRequest});

  LocationAccess access;

  /// What the OS prompt returns; defaults to [access].
  LocationAccess? answerToRequest;
  int requests = 0;

  @override
  Future<LocationAccess> currentAccess() async => access;

  @override
  Future<LocationAccess> requestAccess() async {
    requests++;
    access = answerToRequest ?? access;
    return access;
  }

  @override
  Future<DevicePosition?> currentPosition() async =>
      access == LocationAccess.granted ? const DevicePosition(30.0444, 31.2357) : null;
}
