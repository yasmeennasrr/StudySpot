import { createSign } from 'node:crypto';
import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PUSH, type IPush } from '../../contracts';

type FcmServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

type GoogleAccessToken = { access_token: string; expires_in: number };

/** Sends notification messages through the FCM HTTP v1 API. */
export class FcmPushAdapter implements IPush {
  private readonly logger = new Logger(FcmPushAdapter.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly account: FcmServiceAccount) {}

  async send(
    deviceToken: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    const accessToken = await this.getAccessToken();
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.account.project_id)}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            fid: deviceToken,
            notification: { title, body },
            data,
            android: { priority: 'HIGH' },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
      },
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      this.logger.warn({ status: response.status, detail }, 'FCM rejected a push message');
      throw new Error(`FCM send failed with HTTP ${response.status}`);
    }
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.value;
    }

    const tokenUri = this.account.token_uri ?? 'https://oauth2.googleapis.com/token';
    const issuedAt = Math.floor(now / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      iss: this.account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: tokenUri,
      iat: issuedAt,
      exp: issuedAt + 3600,
    })}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    const assertion = `${unsigned}.${signer.sign(this.account.private_key, 'base64url')}`;
    const oauthResponse = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!oauthResponse.ok) {
      throw new Error(`Google OAuth token request failed with HTTP ${oauthResponse.status}`);
    }
    const token = (await oauthResponse.json()) as GoogleAccessToken;
    this.cachedToken = {
      value: token.access_token,
      expiresAt: now + token.expires_in * 1000,
    };
    return token.access_token;
  }
}

/** Logs messages for local development when no FCM service account is set. */
@Injectable()
export class FakePushAdapter implements IPush {
  private readonly logger = new Logger(FakePushAdapter.name);
  readonly sent: {
    deviceToken: string;
    title: string;
    body: string;
    data: Record<string, string>;
  }[] = [];

  async send(
    deviceToken: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    this.sent.push({ deviceToken, title, body, data });
    this.logger.log({ title, data }, 'Fake push recorded (not sent)');
  }
}

@Module({
  providers: [
    {
      provide: PUSH,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IPush => {
        const json = config.get<string>('FCM_SERVICE_ACCOUNT_JSON', '');
        if (!json.trim()) return new FakePushAdapter();
        let account: FcmServiceAccount;
        try {
          account = JSON.parse(json) as FcmServiceAccount;
        } catch {
          throw new Error('FCM_SERVICE_ACCOUNT_JSON must contain valid service-account JSON');
        }
        if (!account.client_email || !account.private_key || !account.project_id) {
          throw new Error(
            'FCM service account must include client_email, private_key and project_id',
          );
        }
        return new FcmPushAdapter(account);
      },
    },
  ],
  exports: [PUSH],
})
export class PushAdapterModule {}
