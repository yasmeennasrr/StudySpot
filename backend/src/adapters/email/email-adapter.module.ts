import { Injectable, Logger, Module } from '@nestjs/common';
import { EMAIL, type EmailMessage, type IEmail } from '../../contracts';

/**
 * Records e-mails in memory instead of sending them. Used in tests and until the
 * SendGrid adapter is built in Sprint 3 (PB-26). Tests read `sent` to assert.
 */
@Injectable()
export class FakeEmailAdapter implements IEmail {
  private readonly logger = new Logger('EmailAdapter');
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    this.logger.log(
      { to: message.to, subject: message.subject },
      'Fake e-mail recorded (not sent)',
    );
  }
}

/** E-mail adapter. Provides IEmail. TODO(Sprint 3): SendGridEmailAdapter when SENDGRID_API_KEY is set. */
@Module({
  providers: [{ provide: EMAIL, useClass: FakeEmailAdapter }],
  exports: [EMAIL],
})
export class EmailAdapterModule {}
