import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/notifications/push_service.dart';

void main() {
  test(
    'PB-31 demo push emits a simulated prompt without device registration',
    () async {
      final push = DemoPushService();
      final messageFuture = push.foregroundMessages.first;

      push.simulatePresencePrompt(
        venueId: 'demo-campus-cafe',
        venueName: 'Campus Cafe',
      );

      final message = await messageFuture;
      expect(message.venueId, 'demo-campus-cafe');
      expect(message.venueName, 'Campus Cafe');
      expect(message.simulated, isTrue);
      expect(push.isSimulationMode, isTrue);
      expect(push.isAvailable, isFalse);
      expect(await push.registerAndGetInstallationId(), isNull);
    },
  );
}
