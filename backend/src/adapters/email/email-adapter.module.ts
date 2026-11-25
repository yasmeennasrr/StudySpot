import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdapterUnavailableError } from '../../common/errors/app-error';
import { EMAIL, type EmailMessage, type IEmail } from '../../contracts';

const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';

/**
 * Sends e-mail through the SendGrid v3 API (PB-26, EIR-013). Used when SENDGRID_API_KEY
 * and SENDGRID_FROM_EMAIL are both set. It never retries: any failure (timeout, network,
 * HTTP error) becomes AdapterUnavailableError, and Rewards records it and lets the
 * Scheduler retry (SDS 5.1, 6.6.9). Click tracking is off so SendGrid never rewrites
 * the Activate link (the token is in the link's #fragment).
 */
export class SendGridEmailAdapter implements IEmail {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const content = [{ type: 'text/plain', value: message.text }];
    if (message.html) content.push({ type: 'text/html', value: message.html });
    let response: Response;
    try {
      response = await this.fetchFn(SENDGRID_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from: { email: this.from, name: 'StudySpot' },
          subject: message.subject,
          content,
          tracking_settings: { click_tracking: { enable: false, enable_text: false } },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const reason =
        err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network error';
      throw new AdapterUnavailableError('email', reason);
    }
    if (!response.ok) {
      // The body may echo the address; only the status is kept.
      throw new AdapterUnavailableError('email', `SendGrid answered HTTP ${response.status}`);
    }
  }
}

/**
 * Records e-mails in memory instead of sending them: used in tests and whenever no
 * SendGrid key is set (local development). Tests read `sent`, and call `failNext(n)`
 * to make the next n sends fail like a provider outage.
 */
@Injectable()
export class FakeEmailAdapter implements IEmail {
  private readonly logger = new Logger('EmailAdapter');
  readonly sent: EmailMessage[] = [];
  private failures = 0;

  failNext(times = 1): void {
    this.failures = times;
  }

  async send(message: EmailMessage): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new AdapterUnavailableError('email', 'fake outage');
    }
    this.sent.push(message);
    this.logger.log({ subject: message.subject }, 'Fake e-mail recorded (not sent)');
  }
}

/** E-mail adapter. Provides IEmail: SendGrid when it is configured, otherwise the fake. */
@Module({
  providers: [
    {
      provide: EMAIL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IEmail => {
        const key = String(config.get('SENDGRID_API_KEY', '') ?? '').trim();
        const from = String(config.get('SENDGRID_FROM_EMAIL', '') ?? '').trim();
        if (key && from) return new SendGridEmailAdapter(key, from);
        if (key || from) {
          new Logger('EmailAdapter').warn(
            'Set both SENDGRID_API_KEY and SENDGRID_FROM_EMAIL to send real e-mail; using the fake adapter',
          );
        }
        return new FakeEmailAdapter();
      },
    },
  ],
  exports: [EMAIL],
})
export class EmailAdapterModule {}
