import { Injectable, Logger, Module } from '@nestjs/common';
import { PUSH, type IPush } from '../../contracts';

/** Logs push messages instead of sending them. Used until the FCM adapter is built in Sprint 3 (PB-31). */
@Injectable()
export class FakePushAdapter implements IPush {
  private readonly logger = new Logger('PushAdapter');
  readonly sent: { deviceToken: string; title: string; body: string }[] = [];

  async send(deviceToken: string, title: string, body: string): Promise<void> {
    this.sent.push({ deviceToken, title, body });
    this.logger.log({ title }, 'Fake push recorded (not sent)');
  }
}

/** Push adapter. Provides IPush. TODO(Sprint 3): FcmPushAdapter when FCM_SERVICE_ACCOUNT_JSON is set. */
@Module({
  providers: [{ provide: PUSH, useClass: FakePushAdapter }],
  exports: [PUSH],
})
export class PushAdapterModule {}
