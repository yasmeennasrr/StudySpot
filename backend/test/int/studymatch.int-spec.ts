/**
 * Integration test for StudyMatch over HTTP on a real PostgreSQL + PostGIS database
 * (PB-29, PB-46, UC-05). The LLM is the fake (NODE_ENV=test), scripted per test; the
 * tools, Omar's ranking (PB-30), the database and the circuit breaker are real.
 * TC-M2-52, TC-M2-53. Uses the studyspot_test database (see ./test-database.ts).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { FakeLlmAdapter } from '../../src/adapters/llm/llm-adapter.module';
import { buildDataSourceOptions } from '../../src/db/typeorm.options';
import { TEST_DATABASE_URL } from './test-database';

process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.THROTTLE_LIMIT = '10000';
process.env.STUDYMATCH_LIMIT = '10000';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL;

const HERE = { lat: 30.0205, lng: 31.4952 };
const QUIET = '6f1c2a10-0000-4000-8000-0000000000d1';
const NOISY = '6f1c2a10-0000-4000-8000-0000000000d2';
const lngAt = (km: number) => HERE.lng + km / (111.32 * Math.cos((HERE.lat * Math.PI) / 180));

describe('StudyMatch over HTTP (integration)', () => {
  let app: INestApplication;
  let llm: FakeLlmAdapter;
  let bearer: { Authorization: string };
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const admin = new DataSource(buildDataSourceOptions());
    await admin.initialize();
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await admin.runMigrations();
    const always = JSON.stringify(
      Object.fromEntries(
        [0, 1, 2, 3, 4, 5, 6].map((d) => [d, [{ open: '00:00', close: '23:59' }]]),
      ),
    );
    for (const [id, name, km] of [
      [QUIET, 'Quiet Study Cafe', 0.8],
      [NOISY, 'Noisy Corner', 0.3],
    ] as const) {
      await admin.query(
        `INSERT INTO venues (id, name, location, area, opening_hours, price_level,
                             wifi_available, outlets_available, study_type, active)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, 'New Cairo', $5, 2,
                 true, true, 'both', true)`,
        [id, name, lngAt(km), HERE.lat, always],
      );
    }
    await admin.query(
      `INSERT INTO dynamic_records (venue_id, condition_type, value, source_type, recorded_at) VALUES
         ($1, 'noise', 1, 'qr_survey', now() - interval '10 minutes'),
         ($2, 'noise', 3, 'qr_survey', now() - interval '10 minutes')`,
      [QUIET, NOISY],
    );
    await admin.destroy();

    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/main');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    llm = app.get(FakeLlmAdapter);

    const reg = await api().post('/api/v1/auth/register').send({
      email: 'studymatch@studyspot.test',
      password: 'secret123',
      displayName: 'Study Match',
      termsAccepted: true,
    });
    bearer = { Authorization: `Bearer ${reg.body.accessToken}` };
  });

  afterAll(async () => {
    await app?.close();
  });

  it('TC-M2-52 input rules: sign-in needed; text 1-500; lat and lng together; no extra fields', async () => {
    const ask = (body: object, auth = true) => {
      const r = api().post('/api/v1/studymatch');
      return (auth ? r.set(bearer) : r).send(body);
    };
    expect((await ask({ text: 'quiet' }, false)).status).toBe(401);
    expect((await ask({ text: '   ' })).status).toBe(400);
    expect((await ask({ text: 'x'.repeat(501) })).status).toBe(400);
    expect((await ask({ text: 'quiet', lat: HERE.lat })).status).toBe(400);
    expect((await ask({ text: 'quiet', lat: 91, lng: 31 })).status).toBe(400);
    expect((await ask({ text: 'quiet', userId: 'someone-else' })).status).toBe(400);
    // 500 characters is allowed (the fake LLM is "down", so this is a standard-results answer).
    const longest = await ask({ text: 'x'.repeat(500) });
    expect(longest.status).toBe(200);
    expect(longest.body.reasonCode).toBe('AI_UNAVAILABLE');
  });

  it('TC-M2-53 a scripted AI uses the real ranking; AI down gives standard results, both 200', async () => {
    llm.queue(
      {
        role: 'model',
        toolCalls: [
          {
            name: 'recommend_venues',
            arguments: { criteria: [{ name: 'noise', value: 'quiet', required: true }] },
          },
        ],
      },
      { role: 'model', text: 'Quiet Study Cafe is quiet right now (current).' },
    );
    const ok = await api()
      .post('/api/v1/studymatch')
      .set(bearer)
      .send({ text: 'عايزة مكان هادي quiet place near me', ...HERE });
    expect(ok.status).toBe(200);
    expect(ok.body.reasonCode).toBe('OK');
    expect(ok.body.degraded).toBe(false);
    expect(ok.body.reply).toBe('Quiet Study Cafe is quiet right now (current).');
    expect(ok.body.recommendations[0].venue.id).toBe(QUIET);
    expect(ok.body.recommendations[0].reasons.length).toBeGreaterThan(0);

    llm.failNext(1);
    const down = await api()
      .post('/api/v1/studymatch')
      .set(bearer)
      .send({ text: 'quiet place near me', ...HERE });
    expect(down.status).toBe(200);
    expect(down.body).toMatchObject({ degraded: true, reasonCode: 'AI_UNAVAILABLE' });
    expect(down.body.reply).toContain('Smart matching is unavailable right now.');
    expect(down.body.recommendations.map((r: { venue: { id: string } }) => r.venue.id)).toEqual([
      NOISY,
      QUIET,
    ]);
  });
});
