import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:studyspot/core/location/location_service.dart';

/// What the OS or browser answers; counts how often the position is read.
class _FakeGeolocator extends GeolocatorPlatform {
  _FakeGeolocator(this.permission);

  LocationPermission permission;
  int reads = 0;
  Future<Position> Function() answer = () async => Position(
    latitude: 30.02,
    longitude: 31.5,
    timestamp: DateTime.utc(2026, 11, 25),
    accuracy: 20,
    altitude: 0,
    altitudeAccuracy: 0,
    heading: 0,
    headingAccuracy: 0,
    speed: 0,
    speedAccuracy: 0,
  );

  @override
  Future<bool> isLocationServiceEnabled() async => true;

  @override
  Future<LocationPermission> checkPermission() async => permission;

  @override
  Future<Position> getCurrentPosition({LocationSettings? locationSettings}) {
    reads++;
    return answer();
  }
}

/// Location on iPhone Safari (found in the PB-43 sessions). TC-M2-69, TC-M2-70.
void main() {
  late _FakeGeolocator os;

  Future<DevicePosition?> read(
    LocationPermission permission, {
    bool isWeb = true,
    bool allowed = true,
  }) {
    GeolocatorPlatform.instance = os = _FakeGeolocator(permission);
    return GeolocatorLocationService(
      isWeb: isWeb,
      allowedInApp: () => allowed,
      positionTimeout: const Duration(milliseconds: 50),
    ).currentPosition();
  }

  test('TC-M2-69 the browser says "undecided": the position is read only on the web and only after Allow in the app', () async {
    // iPhone Safari: "prompt" (denied) or no answer at all, though allowed.
    for (final p in [
      LocationPermission.denied,
      LocationPermission.unableToDetermine,
    ]) {
      expect((await read(p))!.lat, 30.02, reason: '$p');
      expect(os.reads, 1);

      expect(await read(p, allowed: false), isNull, reason: '"Not now" ($p)');
      expect(os.reads, 0, reason: 'SEN-002: the location is not touched');

      expect(await read(p, isWeb: false), isNull, reason: 'phone app ($p)');
      expect(os.reads, 0);
    }

    // A real refusal is never overridden.
    expect(await read(LocationPermission.deniedForever), isNull);
    expect(os.reads, 0);

    // Granted works as before, whatever the app remembers.
    for (final p in [LocationPermission.whileInUse, LocationPermission.always]) {
      expect(await read(p, isWeb: false, allowed: false), isNotNull);
    }
  });

  test('TC-M2-70 a refused or hanging position read gives no location, within our own time limit', () async {
    GeolocatorPlatform.instance = os = _FakeGeolocator(LocationPermission.denied)
      ..answer = () => Future.error(const PermissionDeniedException('no'));
    final service = GeolocatorLocationService(
      isWeb: true,
      allowedInApp: () => true,
      positionTimeout: const Duration(milliseconds: 50),
    );
    expect(await service.currentPosition(), isNull);

    os.permission = LocationPermission.whileInUse;
    os.answer = () => Completer<Position>().future; // never answers
    final watch = Stopwatch()..start();
    expect(await service.currentPosition(), isNull);
    expect(watch.elapsed, lessThan(const Duration(seconds: 5)));
    expect(
      GeolocatorLocationService().positionTimeout,
      const Duration(seconds: 10),
    );
  });
}
