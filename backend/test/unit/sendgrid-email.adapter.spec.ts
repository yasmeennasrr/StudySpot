import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AdapterUnavailableError } from '../../src/common/errors/app-error';
import {
  EmailAdapterModule,
  FakeEmailAdapter,
  SendGridEmailAdapter,
} from '../../src/adapters/email/email-adapter.module';
import { EMAIL, type EmailMessage } from '../../src/contracts';

const MESSAGE: EmailMessage = {
  to: 'student@studyspot.test',
  subject: 'Your StudySpot coupon',
  text: 'Plain text',
  html: '<p>HTML</p>',
};

function fakeFetch(response: Partial<Response> | Error) {
  return jest.fn(async () => {
    if (response instanceof Error) throw response;
    return { ok: true, status: 202, ...response } as Response;
  });
}

describe('E-mail adapter (PB-26)', () => {
  it('TC-M6-36 sends through SendGrid v3 with text then HTML, click tracking off, and turns every failure into AdapterUnavailableError (EIR-013, SDS 5.1)', async () => {
    const ok = fakeFetch({ ok: true, status: 202 });
    await new SendGridEmailAdapter('SG.key', 'coupons@studyspot.test', 10_000, ok).send(MESSAGE);
    expect(ok).toHaveBeenCalledTimes(1);
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer SG.key');
    expect(JSON.parse(String(init.body))).toEqual({
      personalizations: [{ to: [{ email: 'student@studyspot.test' }] }],
      from: { email: 'coupons@studyspot.test', name: 'StudySpot' },
      subject: 'Your StudySpot coupon',
      content: [
        { type: 'text/plain', value: 'Plain text' },
        { type: 'text/html', value: '<p>HTML</p>' },
      ],
      tracking_settings: { click_tracking: { enable: false, enable_text: false } },
    });
    expect(init.signal).toBeDefined();

    for (const [failure, reason] of [
      [{ ok: false, status: 401 }, 'SendGrid answered HTTP 401'],
      [{ ok: false, status: 503 }, 'SendGrid answered HTTP 503'],
      [Object.assign(new Error('aborted'), { name: 'TimeoutError' }), 'timeout'],
      [new TypeError('fetch failed'), 'network error'],
    ] as const) {
      const adapter = new SendGridEmailAdapter(
        'SG.key',
        'coupons@studyspot.test',
        10_000,
        fakeFetch(failure),
      );
      const err = await adapter.send(MESSAGE).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdapterUnavailableError);
      expect((err as AdapterUnavailableError).reason).toBe(reason);
      // The address never ends up in the error (it is logged).
      expect(String((err as Error).message)).not.toContain('student@');
    }
  });

  it('TC-M6-37 uses SendGrid only when both the key and the sender are set, otherwise the recording fake (EIR-013)', async () => {
    const build = async (values: Record<string, string>) => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => values] }),
          EmailAdapterModule,
        ],
      }).compile();
      return moduleRef.get(EMAIL);
    };
    expect(
      await build({ SENDGRID_API_KEY: 'SG.key', SENDGRID_FROM_EMAIL: 'a@b.test' }),
    ).toBeInstanceOf(SendGridEmailAdapter);
    expect(await build({ SENDGRID_API_KEY: 'SG.key' })).toBeInstanceOf(FakeEmailAdapter);
    expect(await build({})).toBeInstanceOf(FakeEmailAdapter);

    const fake = new FakeEmailAdapter();
    fake.failNext(1);
    await expect(fake.send(MESSAGE)).rejects.toBeInstanceOf(AdapterUnavailableError);
    await fake.send(MESSAGE);
    expect(fake.sent).toEqual([MESSAGE]);
  });
});
