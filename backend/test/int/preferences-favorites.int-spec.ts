/**
 * Integration tests for saved preferences (PB-13) and favorites (PB-14) on a real
 * PostgreSQL + PostGIS database, through the HTTP API. TC-M1-48..TC-M1-55.
 * Uses the studyspot_test database (see ./test-database.ts); its schema is wiped.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/db/typeorm.options';
import { TEST_DATABASE_URL } from './test-database';

process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.THROTTLE_LIMIT = '10000';
// Only ever the test database: backend/.env (your dev database) is ignored on purpose.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL;

const DEV_ID = '00000000-0000-4000-8000-000000000001';
const DEV = `Bearer stub.${DEV_ID}`;
const ZAMALEK = '6f1c2a10-0000-4000-8000-000000000002';
const MAADI = '6f1c2a10-0000-4000-8000-000000000003';
const NOT_A_VENUE = '6f1c2a10-0000-4000-8000-0000000000ff';

describe('Preferences and favorites on a real database (integration)', () => {
  let app: INestApplication;
  let db: DataSource;
  const api = () => request(app.getHttpServer());

  /** Inserts a users row, as M2's real registration will. */
  const addUserRow = (id: string, email: string) =>
    db.query(
      `INSERT INTO users (id, email, password_hash, display_name, terms_accepted_at)
       VALUES ($1, $2, 'x', 'Test', now()) ON CONFLICT DO NOTHING`,
      [id, email],
    );

  beforeAll(async () => {
    const admin = new DataSource(buildDataSourceOptions());
    await admin.initialize();
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await admin.runMigrations();
    for (const [id, name, lng, lat] of [
      [ZAMALEK, 'Sample Quiet Corner (Zamalek)', 31.2197, 30.0626],
      [MAADI, 'Sample Group Hub (Maadi)', 31.2585, 29.9597],
    ] as const) {
      await admin.query(
        `INSERT INTO venues (id, name, location) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)`,
        [id, name, lng, lat],
      );
    }
    await admin.destroy();

    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/main');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    await addUserRow(DEV_ID, 'dev@studyspot.test');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('TC-M1-48 saves, reads back and clears preferences in user_preferences (FR-022..FR-024)', async () => {
    expect((await api().get('/api/v1/me/preferences').set('Authorization', DEV)).body).toEqual({});

    const body = {
      noise: 'quiet',
      wifi: 'good',
      outlets: true,
      maxPrice: 2,
      studyType: 'individual',
    };
    const put = await api().put('/api/v1/me/preferences').set('Authorization', DEV).send(body);
    expect(put.status).toBe(200);
    expect(put.body).toEqual(body);

    const [row] = await db.query(`SELECT criteria FROM user_preferences WHERE user_id = $1`, [
      DEV_ID,
    ]);
    expect(row.criteria).toEqual({
      noise: 1,
      wifi: 3,
      outlets: true,
      maxPriceLevel: 2,
      studyType: 'individual',
    });

    // PUT replaces the whole set: fields left out are gone.
    await api().put('/api/v1/me/preferences').set('Authorization', DEV).send({ crowd: 'low' });
    expect((await api().get('/api/v1/me/preferences').set('Authorization', DEV)).body).toEqual({
      crowd: 'low',
    });

    expect((await api().delete('/api/v1/me/preferences').set('Authorization', DEV)).status).toBe(
      204,
    );
    expect((await api().get('/api/v1/me/preferences').set('Authorization', DEV)).body).toEqual({});
  });

  it('TC-M1-49 rejects invalid preference values and unknown fields with 400 INVALID_INPUT', async () => {
    for (const bad of [{ noise: 'loud' }, { maxPrice: 5 }, { maxPrice: 0 }, { colour: 'blue' }]) {
      const res = await api().put('/api/v1/me/preferences').set('Authorization', DEV).send(bad);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    }
  });

  it('TC-M1-50 adds a favorite once even if PUT is repeated, lists it, and removes it (FR-026, FR-027)', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await api().put(`/api/v1/me/favorites/${ZAMALEK}`).set('Authorization', DEV);
      expect(res.status).toBe(204);
    }
    const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM favorites WHERE user_id = $1`, [
      DEV_ID,
    ]);
    expect(n).toBe(1);

    const list = await api().get('/api/v1/me/favorites').set('Authorization', DEV);
    expect(list.status).toBe(200);
    expect(list.body.items.map((v: { id: string }) => v.id)).toEqual([ZAMALEK]);
    expect(list.body.items[0].conditions.crowd.status).toBeDefined();

    expect(
      (await api().delete(`/api/v1/me/favorites/${ZAMALEK}`).set('Authorization', DEV)).status,
    ).toBe(204);
    expect(
      (await api().delete(`/api/v1/me/favorites/${ZAMALEK}`).set('Authorization', DEV)).status,
    ).toBe(204);
    expect((await api().get('/api/v1/me/favorites').set('Authorization', DEV)).body.items).toEqual(
      [],
    );
  });

  it('TC-M1-51 lists the most recently added favorite first', async () => {
    await api().put(`/api/v1/me/favorites/${ZAMALEK}`).set('Authorization', DEV);
    await new Promise((r) => setTimeout(r, 20));
    await api().put(`/api/v1/me/favorites/${MAADI}`).set('Authorization', DEV);
    const list = await api().get('/api/v1/me/favorites').set('Authorization', DEV);
    expect(list.body.items.map((v: { id: string }) => v.id)).toEqual([MAADI, ZAMALEK]);
  });

  it('TC-M1-52 refuses an unknown venue (404) and a malformed id (400)', async () => {
    const unknown = await api()
      .put(`/api/v1/me/favorites/${NOT_A_VENUE}`)
      .set('Authorization', DEV);
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('NOT_FOUND');
    const malformed = await api().put('/api/v1/me/favorites/not-a-uuid').set('Authorization', DEV);
    expect(malformed.status).toBe(400);
  });

  it('TC-M1-53 shows and changes only the caller’s own data (SEC-004)', async () => {
    const reg = await api().post('/api/v1/auth/register').send({
      email: 'other@studyspot.test',
      password: 'otherpass1',
      displayName: 'Other',
      termsAccepted: true,
    });
    expect(reg.status).toBe(201);
    const otherId: string = reg.body.user.id;
    const OTHER = `Bearer ${reg.body.accessToken}`;
    await addUserRow(otherId, 'other@studyspot.test');

    // The other user starts empty and cannot remove the dev user's favorite.
    expect(
      (await api().get('/api/v1/me/favorites').set('Authorization', OTHER)).body.items,
    ).toEqual([]);
    await api().delete(`/api/v1/me/favorites/${MAADI}`).set('Authorization', OTHER);
    await api().put('/api/v1/me/preferences').set('Authorization', OTHER).send({ noise: 'noisy' });

    const devList = await api().get('/api/v1/me/favorites').set('Authorization', DEV);
    expect(devList.body.items.map((v: { id: string }) => v.id)).toContain(MAADI);
    expect((await api().get('/api/v1/me/preferences').set('Authorization', DEV)).body).toEqual({});
    expect((await api().get('/api/v1/me/preferences').set('Authorization', OTHER)).body).toEqual({
      noise: 'noisy',
    });
  });

  it('TC-M1-54 requires sign-in for every /me route (401)', async () => {
    for (const [method, url] of [
      ['get', '/api/v1/me/preferences'],
      ['put', '/api/v1/me/preferences'],
      ['get', '/api/v1/me/favorites'],
      ['put', `/api/v1/me/favorites/${ZAMALEK}`],
    ] as const) {
      const res = await api()[method](url);
      expect(res.status).toBe(401);
    }
  });

  it('TC-M1-55 deleting a venue removes it from favorites (ON DELETE CASCADE)', async () => {
    await api().put(`/api/v1/me/favorites/${MAADI}`).set('Authorization', DEV);
    await db.query(`DELETE FROM venues WHERE id = $1`, [MAADI]);
    const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM favorites WHERE venue_id = $1`, [
      MAADI,
    ]);
    expect(n).toBe(0);
  });
});
