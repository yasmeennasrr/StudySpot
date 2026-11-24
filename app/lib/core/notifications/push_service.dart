import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

class PresencePushMessage {
  const PresencePushMessage({required this.venueId, required this.venueName});

  final String venueId;
  final String venueName;
}

abstract class PushService {
  bool get isAvailable;
  Future<bool> requestPermission();
  Future<bool> notificationsAllowed();
  Future<String?> registerAndGetInstallationId();
  Stream<String> get registrationChanges;
  Stream<PresencePushMessage> get foregroundMessages;
  Stream<PresencePushMessage> get openedMessages;
  Future<PresencePushMessage?> initialMessage();
}

/// Firebase-backed push transport. Platform Firebase files are project setup;
/// the app remains usable when they are absent.
class FirebasePushService implements PushService {
  FirebasePushService({this._messaging});

  final FirebaseMessaging? _messaging;
  FirebaseMessaging? _activeMessaging;

  @override
  bool get isAvailable => _activeMessaging != null;

  Future<bool> initialize() async {
    try {
      await Firebase.initializeApp();
      _activeMessaging = _messaging ?? FirebaseMessaging.instance;
      await _activeMessaging!.setForegroundNotificationPresentationOptions(
        alert: false,
        badge: false,
        sound: false,
      );
      return true;
    } on FirebaseException {
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
