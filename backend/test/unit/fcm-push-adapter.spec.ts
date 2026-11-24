import { generateKeyPairSync } from 'node:crypto';
import { FcmPushAdapter } from '../../src/adapters/push/push-adapter.module';

describe('FcmPushAdapter', () => {
  it('exchanges a signed service-account assertion and sends the push payload to FCM', async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'oauth-token', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const adapter = new FcmPushAdapter({
      client_email: 'studyspot@example.iam.gserviceaccount.com',
      private_key: privateKey,
      project_id: 'studyspot-test',
    });

    await adapter.send('device-token', 'Are you here?', 'Are you at Campus Cafe?', {
      type: 'presence_check_in',
      venueId: 'venue-1',
      venueName: 'Campus Cafe',
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    expect(fetch.mock.calls[1][0]).toBe(
      'https://fcm.googleapis.com/v1/projects/studyspot-test/messages:send',
    );
    const sent = JSON.parse(String(fetch.mock.calls[1][1]?.body));
    expect(sent.message).toMatchObject({
      fid: 'device-token',
      notification: { title: 'Are you here?', body: 'Are you at Campus Cafe?' },
      data: { type: 'presence_check_in', venueId: 'venue-1' },
      android: { priority: 'HIGH' },
    });
    fetch.mockRestore();
  });
});
