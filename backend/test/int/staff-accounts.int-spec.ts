/**
 * Integration test for account management on a real PostgreSQL database, through
 * HTTP: PB-33 create, suspend and reactivate accounts (TC-M4-26).
 * Uses the studyspot_test database (see ./test-database.ts); its schema is wiped.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/db/typeorm.options';
import { TEST_DATABASE_URL } from './test-database';

process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.THROTTLE_LIMIT = '10000';
process.env.STAFF_SIGNIN_LIMIT = '100';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL;

const STAFF_PASSWORD = 'staffpass123';
const ADMIN = { id: '00000000-0000-4000-8000-0000000000a1', email: 'admin@studyspot.test' };
const MOD = { id: '00000000-0000-4000-8000-0000000000a2', email: 'mod@studyspot.test' };

describe('Account management on a real database (integration)', () => {
  let app: INestApplication;
  let db: DataSource;
  const api = () => request(app.getHttpServer());
  const staff = async (email: string, password = STAFF_PASSWORD) => {
    const res = await api().post('/api/v1/staff/session').send({ email, password });
    expect(res.status).toBe(200);
    return `Bearer ${res.body.staffToken}`;
  };

  beforeAll(async () => {
    const admin = new DataSource(buildDataSourceOptions());
    await admin.initialize();
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await admin.runMigrations();
    const hash = await bcrypt.hash(STAFF_PASSWORD, 4);
    for (const [u, role] of [
      [ADMIN, 'admin'],
      [MOD, 'moderator'],
    ] as const) {
      await admin.query(
        `INSERT INTO users (id, email, password_hash, display_name, role, terms_accepted_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [u.id, u.email, hash, u.email.split('@')[0], role],
      );
    }
    await admin.destroy();

    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/main');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    // Listen once, so requests never race supertest closing the server.
    await app.listen(0);
    db = app.get(DataSource);
  });

  afterAll(async () => {
    if (db) {
      let last = -1;
      for (let i = 0; i < 40; i++) {
        const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM audit_log`);
        if (n === last) break;
        last = n;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    await app?.close();
  });

  it('TC-M4-26 an administrator creates a student, suspends them (sign-in refused, sessions ended) and reactivates them (FR-036 to FR-038, FR-044)', async () => {
    // Moderators cannot manage accounts.
    const asMod = await staff(MOD.email);
    expect((await api().get('/api/v1/staff/accounts').set('Authorization', asMod)).status).toBe(
      403,
    );

    const auth = await staff(ADMIN.email);
    const create = (body: Record<string, unknown>) =>
      api().post('/api/v1/staff/accounts').set('Authorization', auth).send(body);
    const tooShort = await create({
      email: 'mona@aucegypt.edu',
      displayName: 'Mona',
      role: 'moderator',
      password: 'abcdefg1',
    });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.message).toContain('at least 10 characters');

    const created = await create({
      email: ' Mona@AUCEgypt.edu ',
      displayName: 'Mona',
      role: 'user',
      password: 'abcdefg1',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      email: 'mona@aucegypt.edu',
      displayName: 'Mona',
      role: 'user',
      suspended: false,
    });
    const monaId = created.body.id as string;
    expect(
      (
        await create({
          email: 'mona@aucegypt.edu',
          displayName: 'M2',
          role: 'user',
          password: 'abcdefg1',
        })
      ).status,
    ).toBe(409);

    const found = await api()
      .get('/api/v1/staff/accounts?q=MONA&role=user')
      .set('Authorization', auth);
    expect(found.body.map((a: { id: string }) => a.id)).toEqual([monaId]);

    // The new student signs in with the password the administrator set.
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'mona@aucegypt.edu', password: 'abcdefg1' });
    expect(login.status).toBe(200);
    const access = `Bearer ${login.body.accessToken}`;
    expect((await api().get('/api/v1/me').set('Authorization', access)).status).toBe(200);

    // An administrator cannot suspend themselves.
    expect(
      (await api().post(`/api/v1/staff/accounts/${ADMIN.id}/suspend`).set('Authorization', auth))
        .status,
    ).toBe(403);

    const suspend = await api()
      .post(`/api/v1/staff/accounts/${monaId}/suspend`)
      .set('Authorization', auth);
    expect(suspend.status).toBe(200);
    expect(suspend.body.suspended).toBe(true);
    // At once: the access token, the refresh token and a new sign-in are all refused.
    expect((await api().get('/api/v1/me').set('Authorization', access)).status).toBe(403);
    expect(
      (await api().post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken }))
        .status,
    ).toBe(401);
    expect(
      (
        await api()
          .post('/api/v1/auth/login')
          .send({ email: 'mona@aucegypt.edu', password: 'abcdefg1' })
      ).status,
    ).toBe(403);
    const [{ open }] = await db.query(
      `SELECT count(*)::int AS open FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`,
      [monaId],
    );
    expect(open).toBe(0);
    const suspendedList = await api()
      .get('/api/v1/staff/accounts?suspended=true')
      .set('Authorization', auth);
    expect(suspendedList.body.map((a: { id: string }) => a.id)).toEqual([monaId]);

    const back = await api()
      .post(`/api/v1/staff/accounts/${monaId}/reactivate`)
      .set('Authorization', auth);
    expect(back.body.suspended).toBe(false);
    expect(
      (
        await api()
          .post('/api/v1/auth/login')
          .send({ email: 'mona@aucegypt.edu', password: 'abcdefg1' })
      ).status,
    ).toBe(200);

    let actions: string[] = [];
    for (let i = 0; i < 20 && actions.length < 3; i++) {
      const rows: { action: string }[] = await db.query(
        `SELECT action FROM audit_log WHERE action LIKE 'account.%' ORDER BY created_at`,
      );
      actions = rows.map((r) => r.action);
      if (actions.length < 3) await new Promise((r) => setTimeout(r, 50));
    }
    expect(actions).toEqual(['account.created', 'account.suspended', 'account.reactivated']);
  });
});
