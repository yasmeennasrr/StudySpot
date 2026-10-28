import 'package:studyspot/core/api/mock_api_client.dart';
import 'package:studyspot/core/auth/token_store.dart';
import 'package:studyspot/core/location/location_service.dart';
import 'package:studyspot/core/services.dart';
import 'package:studyspot/core/storage/local_flags.dart';

/// Test doubles for every outside dependency: no network, no phone storage.
class TestWorld {
  TestWorld({
    bool termsAccepted = true,
    bool locationAsked = true,
    LocationAccess locationAccess = LocationAccess.denied,
  })  : api = MockApiClient(),
        tokens = MemoryTokenStore(),
        flags = MemoryFlags(termsAccepted: termsAccepted, locationAsked: locationAsked),
        location = FakeLocationService(access: locationAccess) {
    services = AppServices(api: api, tokens: tokens, flags: flags, location: location);
  }

  final MockApiClient api;
  final MemoryTokenStore tokens;
  final MemoryFlags flags;
  final FakeLocationService location;
  late final AppServices services;
}
