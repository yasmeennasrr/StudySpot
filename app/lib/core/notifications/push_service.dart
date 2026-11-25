import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

class PresencePushMessage {
  const PresencePushMessage({
    required this.venueId,
    required this.venueName,
    this.simulated = false,
  });

  final String venueId;
  final String venueName;
  final bool simulated;
}

abstract class PushService {
  bool get isAvailable;
  bool get isSimulationMode => false;
  Future<bool> requestPermission();
  Future<bool> notificationsAllowed();
  Future<String?> registerAndGetInstallationId();
  Stream<String> get registrationChanges;
  Stream<PresencePushMessage> get foregroundMessages;
  Stream<PresencePushMessage> get openedMessages;
  Future<PresencePushMessage?> initialMessage();

  void simulatePresencePrompt({
    required String venueId,
    required String venueName,
  }) {}
}

/// Firebase-backed push transport. Platform Firebase files are project setup;
/// the app remains usable when they are absent.
class FirebasePushService implements PushService {
  FirebasePushService({this._messaging});

  final FirebaseMessaging? _messaging;
  FirebaseMessaging? _activeMessaging;

  @override
  bool get isAvailable => _activeMessaging != null;

  @override
  bool get isSimulationMode => false;

  @override
  void simulatePresencePrompt({
    required String venueId,
    required String venueName,
  }) {}

  /// False when push is not available here; the app then uses the demo
  /// service. Firebase is set up for Android and iOS only: in a browser or on
  /// a desktop it fails with errors other than FirebaseException, and an error
  /// thrown here would stop the app before its first screen (a white page).
  Future<bool> initialize() async {
    if (kIsWeb) return false;
    try {
      await Firebase.initializeApp();
      _activeMessaging = _messaging ?? FirebaseMessaging.instance;
      await _activeMessaging!.setForegroundNotificationPresentationOptions(
        alert: false,
        badge: false,
        sound: false,
      );
      return true;
    } catch (_) {
      // FirebaseException, MissingPluginException (desktop), UnimplementedError.
      return false;
    }
  }

  @override
  Future<bool> requestPermission() async {
    final messaging = _activeMessaging;
    if (messaging == null) return false;
    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<bool> notificationsAllowed() async {
    final messaging = _activeMessaging;
    if (messaging == null) return false;
    final settings = await messaging.getNotificationSettings();
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> registerAndGetInstallationId() async {
    final messaging = _activeMessaging;
    if (messaging == null) return null;
    final registered = messaging.onRegistered
        .map<String?>((id) => id)
        .first
        .timeout(const Duration(seconds: 15), onTimeout: () => null);
    await messaging.register();
    return registered;
  }

  @override
  Stream<String> get registrationChanges =>
      _activeMessaging?.onRegistered ?? const Stream<String>.empty();

  @override
  Stream<PresencePushMessage> get foregroundMessages =>
      (_activeMessaging == null
              ? const Stream<RemoteMessage>.empty()
              : FirebaseMessaging.onMessage)
          .map(_toPresenceMessage)
          .where((message) => message != null)
          .cast<PresencePushMessage>();

  @override
  Stream<PresencePushMessage> get openedMessages =>
      (_activeMessaging == null
              ? const Stream<RemoteMessage>.empty()
              : FirebaseMessaging.onMessageOpenedApp)
          .map(_toPresenceMessage)
          .where((message) => message != null)
          .cast<PresencePushMessage>();

  @override
  Future<PresencePushMessage?> initialMessage() async {
    final message = await _activeMessaging?.getInitialMessage();
    return message == null ? null : _toPresenceMessage(message);
  }

  PresencePushMessage? _toPresenceMessage(RemoteMessage message) {
    if (message.data['type'] != 'presence_check_in') return null;
    final venueId = message.data['venueId'];
    if (venueId is! String || venueId.isEmpty) return null;
    return PresencePushMessage(
      venueId: venueId,
      venueName: message.data['venueName'] as String? ?? 'this venue',
    );
  }
}

/// In-app push simulation used when Firebase isn't configured for the demo.
/// It never registers a device or records presence with the backend.
class DemoPushService implements PushService {
  final StreamController<PresencePushMessage> _foreground =
      StreamController<PresencePushMessage>.broadcast();

  @override
  bool get isAvailable => false;

  @override
  bool get isSimulationMode => true;

  @override
  Future<bool> requestPermission() async => false;

  @override
  Future<bool> notificationsAllowed() async => false;

  @override
  Future<String?> registerAndGetInstallationId() async => null;

  @override
  Stream<String> get registrationChanges => const Stream<String>.empty();

  @override
  Stream<PresencePushMessage> get foregroundMessages => _foreground.stream;

  @override
  Stream<PresencePushMessage> get openedMessages =>
      const Stream<PresencePushMessage>.empty();

  @override
  Future<PresencePushMessage?> initialMessage() async => null;

  @override
  void simulatePresencePrompt({
    required String venueId,
    required String venueName,
  }) {
    _foreground.add(
      PresencePushMessage(
        venueId: venueId,
        venueName: venueName,
        simulated: true,
      ),
    );
  }
}

/// Deterministic push fake for widget tests.
class FakePushService implements PushService {
  FakePushService({this.available = true, this.permissionGranted = true});

  bool available;
  bool permissionGranted;
  int permissionRequests = 0;
  final List<String> registeredTokens = [];

  @override
  bool get isAvailable => available;

  @override
  bool get isSimulationMode => false;

  @override
  void simulatePresencePrompt({
    required String venueId,
    required String venueName,
  }) {}

  @override
  Future<bool> requestPermission() async {
    permissionRequests++;
    return available && permissionGranted;
  }

  @override
  Future<bool> notificationsAllowed() async => available && permissionGranted;

  @override
  Future<String?> registerAndGetInstallationId() async =>
      available ? 'test-fcm-installation-id' : null;

  @override
  Stream<String> get registrationChanges => const Stream.empty();

  @override
  Stream<PresencePushMessage> get foregroundMessages => const Stream.empty();

  @override
  Stream<PresencePushMessage> get openedMessages => const Stream.empty();

  @override
  Future<PresencePushMessage?> initialMessage() async => null;
}
