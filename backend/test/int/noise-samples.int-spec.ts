/**
 * Integration tests for noise samples on a real PostgreSQL + PostGIS database,
 * through HTTP (PB-19, UC-11). TC-M1-81..TC-M1-84. The audio AI is the fake adapter
 * (AUDIO_AI_PROVIDER=fake), behind the real circuit breaker.
 * Uses the studyspot_test database (see ./test-database.ts); its schema is wiped.
 */
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { FakeAudioAiAdapter } from '../../src/adapters/audio-ai/audio-ai-adapter.module';
import { buildDataSourceOptions } from '../../src/db/typeorm.options';
import { makeWav } from '../helpers/wav';
import { TEST_DATABASE_URL } from './test-database';

process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.THROTTLE_LIMIT = '10000';
process.env.NOISE_SAMPLE_LIMIT = '10000';
process.env.AUDIO_AI_PROVIDER = 'fake';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL;

const VENUE = '6f1c2a10-0000-4000-8000-000000000002';
const AT = { lat: 30.0626, lng: 31.2197 }; // the venue itself
const NEAR = { lat: 30.0626 + 30 / 111_195, lng: 31.2197 }; // 30 m north
const FAR = { lat: 30.0626 + 200 / 111_195, lng: 31.2197 }; // 200 m north
const UNKNOWN = '6f1c2a10-0000-4000-8000-0000000000ff';

describe('Noise samples on a real database (integration)', () => {
  let app: INestApplication;
  let db: DataSource;
  let fake: FakeAudioAiAdapter;
  let student: string;
  const api = () => request(app.getHttpServer());
  const send = (
    pos: { lat: number; lng: number } | null,
    audio: Buffer | null,
    type = 'audio/wav',
  ) => {
    let req = api().post(`/api/v1/venues/${VENUE}/noise-samples`).set('Authorization', student);
    if (pos) req = req.field('lat', String(pos.lat)).field('lng', String(pos.lng));
    if (audio) req = req.attach('audio', audio, { filename: 'sample.wav', contentType: type });
    return req;
  };
  const noiseRows = () =>
    db.query(`SELECT * FROM dynamic_records WHERE condition_type = 'noise' ORDER BY recorded_at`);

  beforeAll(async () => {
    const admin = new DataSource(buildDataSourceOptions());
    await admin.initialize();
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await admin.runMigrations();
    await admin.query(
      `INSERT INTO venues (id, name, location) VALUES ($1, 'Quiet Corner', ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)`,
      [VENUE, AT.lng, AT.lat],
    );
    await admin.query(
      `INSERT INTO users (email, password_hash, display_name, terms_accepted_at)
       VALUES ('student@studyspot.test', $1, 'Student', now())`,
      [await bcrypt.hash('studentpass1', 4)],
    );
    await admin.destroy();

    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/main');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fake = app.get(FakeAudioAiAdapter);
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'student@studyspot.test', password: 'studentpass1' });
    student = `Bearer ${login.body.accessToken}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('TC-M1-81 eligibility: inside the venue radius yes; 200 m away, no position or unknown venue no (SEN-009)', async () => {
    const check = (venue: string, q: string) =>
      api()
        .get(`/api/v1/venues/${venue}/noise-samples/eligibility?${q}`)
        .set('Authorization', student);
    expect((await check(VENUE, `lat=${NEAR.lat}&lng=${NEAR.lng}`)).body).toEqual({
      eligible: true,
      reason: null,
      radiusMeters: 50,
    });
    expect((await check(VENUE, `lat=${FAR.lat}&lng=${FAR.lng}`)).body).toMatchObject({
      eligible: false,
      reason: 'not_present',
    });
    expect((await check(VENUE, '')).body.eligible).toBe(false);
    expect((await check(UNKNOWN, `lat=${NEAR.lat}&lng=${NEAR.lng}`)).status).toBe(404);
    expect((await check(VENUE, 'lat=95&lng=31')).status).toBe(400);
    expect(
      (
        await api().get(
          `/api/v1/venues/${VENUE}/noise-samples/eligibility?lat=${AT.lat}&lng=${AT.lng}`,
        )
      ).status,
    ).toBe(401);
  });

  it('TC-M1-82 a sample at the venue stores only the level and shows as the current noise; no file is written (PRIV-001, SEN-007)', async () => {
    const tmpBefore = readdirSync(tmpdir()).length;
    fake.willReturn(1);
    const res = await send(NEAR, makeWav(0.01, 7));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'recorded',
      level: 'quiet',
      message: 'Thanks! The noise level was saved.',
    });

    const rows = await noiseRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      venue_id: VENUE,
      value: 1,
      source_type: 'audio_analysis',
      survey_id: null,
    });
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        'condition_type',
        'id',
        'recorded_at',
        'source_type',
        'survey_id',
        'value',
        'venue_id',
      ].sort(),
    );
    expect(readdirSync(tmpdir()).length).toBe(tmpBefore);

    const details = await api().get(`/api/v1/venues/${VENUE}`);
    expect(details.body.dynamic.noise).toMatchObject({
      status: 'current',
      level: 1,
      label: 'Quiet',
      basedOn: ['audio'],
    });
  });

  it('TC-M1-83 refused: away from the venue (403), no file, wrong type, too big; nothing stored', async () => {
    fake.willReturn(3);
    const before = (await noiseRows()).length;
    const away = await send(FAR, makeWav(0.5));
    expect(away.status).toBe(403);
    expect(away.body.message).toBe(
      'You can share a noise sample only while you are at this place.',
    );
    expect((await send(NEAR, null)).status).toBe(400);
    const text = await send(NEAR, Buffer.from('hello'), 'text/plain');
    expect(text.status).toBe(400);
    expect(text.body.message).toBe('Send the recording as WAV, WebM, OGG, MP4 or AAC audio.');
    expect((await send(NEAR, Buffer.alloc(1024 * 1024 + 1), 'audio/wav')).status).toBe(413);
    expect(
      (
        await api()
          .post(`/api/v1/venues/${VENUE}/noise-samples`)
          .field('lat', String(NEAR.lat))
          .field('lng', String(NEAR.lng))
          .attach('audio', makeWav(0.5), { filename: 's.wav', contentType: 'audio/wav' })
      ).status,
    ).toBe(401);
    expect((await noiseRows()).length).toBe(before);
  });

  it('TC-M1-84 AI down: 5 failures give "unavailable" and nothing stored, then the breaker answers at once (AI-026, EIR-015)', async () => {
    const before = (await noiseRows()).length;
    fake.failNext(5);
    for (let i = 0; i < 5; i++) {
      const res = await send(NEAR, makeWav(0.3));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'unavailable',
        level: null,
        message: 'Noise analysis is not available right now. Nothing was saved.',
      });
    }
    // The fake would now answer "moderate", but the breaker is open: it is not called.
    fake.willReturn(2);
    const spy = jest.spyOn(fake, 'classifyNoise');
    const sixth = await send(NEAR, makeWav(0.3));
    expect(sixth.body.status).toBe('unavailable');
    expect(spy).not.toHaveBeenCalled();
    expect((await noiseRows()).length).toBe(before);
  });
});
