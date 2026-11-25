import 'package:studyspot/core/api/mock_api_client.dart';
import 'package:studyspot/core/audio/noise_recorder.dart';
import 'package:studyspot/core/auth/token_store.dart';
import 'package:studyspot/core/location/location_service.dart';
import 'package:studyspot/core/notifications/push_service.dart';
import 'package:studyspot/core/services.dart';
import 'package:studyspot/core/storage/local_flags.dart';

/// Test doubles for every outside dependency: no network, no phone storage.
class TestWorld {
  TestWorld({
    bool termsAccepted = true,
    bool locationAsked = true,
    bool presenceIntroSeen = true,
    LocationAccess locationAccess = LocationAccess.denied,
  }) : api = MockApiClient(),
       tokens = MemoryTokenStore(),
       flags = MemoryFlags(
         termsAccepted: termsAccepted,
         locationAsked: locationAsked,
         presenceIntroSeen: presenceIntroSeen,
       ),
       location = FakeLocationService(access: locationAccess),
       noise = FakeNoiseRecorder() {
    services = AppServices(
      api: api,
      tokens: tokens,
      flags: flags,
      location: location,
      push: push,
      noise: noise,
      loadNetworkImages: false,
    );
  }

  final MockApiClient api;
  final MemoryTokenStore tokens;
  final MemoryFlags flags;
  final FakeLocationService location;
  final FakePushService push = FakePushService();
  final FakeNoiseRecorder noise;
  late final AppServices services;
}
