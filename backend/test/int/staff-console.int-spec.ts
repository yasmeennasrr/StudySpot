/**
 * Integration tests for the Staff Console and Staff API on a real PostgreSQL
 * database, through HTTP: PB-32 staff sign-in (TC-M1-66..68), PB-34 settings (TC-M1-72, 73),
 * PB-36 statistics and security log (TC-M1-74, 75).
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
process.env.STAFF_SIGNIN_LIMIT = '5';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL;

export const STAFF_PASSWORD = 'staffpass123';
const ADMIN = {
  id: '00000000-0000-4000-8000-0000000000a1',
  email: 'admin@studyspot.test',
  role: 'admin',
};
const MOD = {
  id: '00000000-0000-4000-8000-0000000000a2',
  email: 'mod@studyspot.test',
  role: 'moderator',
};
const STUDENT = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'dev@studyspot.test',
  role: 'user',
};

/** Waits for the asynchronous audit listener to write its rows. */
async function auditRows(db: DataSource, where: string): Promise<Record<string, unknown>[]> {
  let rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 20 && rows.length === 0; i++) {
    rows = await db.query(`SELECT * FROM audit_log WHERE ${where} ORDER BY created_at`);
    if (!rows.length) await new Promise((r) => setTimeout(r, 50));
  }
  return rows;
}

describe('Staff Console and staff sign-in on a real database (integration)', () => {
  let app: INestApplication;
  let db: DataSource;
  const api = () => request(app.getHttpServer());
  let clientNo = 0;
  /** Staff header for a fresh sign-in, from its own client address (sign-in is rate limited). */
  const staffAuth = async (email: string) => {
    const res = await api()
      .post('/api/v1/staff/session')
      .set('X-Forwarded-For', `198.51.100.${++clientNo}`)
      .send({ email, password: STAFF_PASSWORD });
    expect(res.status).toBe(200);
    return `Bearer ${res.body.staffToken}`;
  };

  beforeAll(async () => {
    const admin = new DataSource(buildDataSourceOptions());
    await admin.initialize();
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await admin.runMigrations();
    const hash = await bcrypt.hash(STAFF_PASSWORD, 4);
    for (const u of [ADMIN, MOD, STUDENT]) {
      await admin.query(
        `INSERT INTO users (id, email, password_hash, display_name, role, terms_accepted_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [u.id, u.email, hash, u.email.split('@')[0], u.role],
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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('TC-M1-66 staff routes refuse an app access token; a staff sign-in opens a session that signs out (FR-035, FR-044)', async () => {
    const appLogin = await api()
      .post('/api/v1/auth/login')
      .send({ email: ADMIN.email, password: STAFF_PASSWORD });
    expect(appLogin.status).toBe(200);
    const withAppToken = await api()
      .get('/api/v1/staff/session')
      .set('Authorization', `Bearer ${appLogin.body.accessToken}`);
    expect(withAppToken.status).toBe(401);
    expect((await api().get('/api/v1/staff/session')).status).toBe(401);

    const signIn = await api()
      .post('/api/v1/staff/session')
      .send({ email: ADMIN.email, password: STAFF_PASSWORD });
    expect(signIn.status).toBe(200);
    expect(signIn.body).toMatchObject({
      expiresIn: 900,
      user: { email: ADMIN.email, role: 'admin' },
    });
    const staff = `Bearer ${signIn.body.staffToken}`;

    const me = await api().get('/api/v1/staff/session').set('Authorization', staff);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: ADMIN.id, role: 'admin' });
    expect(me.body.sessionExpiresAt).toBe(signIn.body.expiresAt);

    expect((await api().delete('/api/v1/staff/session').set('Authorization', staff)).status).toBe(
      204,
    );
    await auditRows(db, `actor_id = '${ADMIN.id}' AND action = 'staff.sign_out'`);
    const all = await db.query(
      `SELECT action, actor_type FROM audit_log WHERE actor_id = $1 ORDER BY created_at`,
      [ADMIN.id],
    );
    expect(all.map((r: { action: string }) => r.action)).toEqual([
      'staff.sign_in',
      'staff.sign_out',
    ]);
    expect(all.every((r: { actor_type: string }) => r.actor_type === 'staff')).toBe(true);
  });

  it('TC-M1-67 a student is refused (403) and the attempt is in the security log; the 6th try in a minute gets 429 (SEC-010)', async () => {
    // Its own client address, so earlier sign-ins in this file do not count (the limit is per client).
    const client = { 'X-Forwarded-For': '203.0.113.67' };
    const student = await api()
      .post('/api/v1/staff/session')
      .set(client)
      .send({ email: STUDENT.email, password: STAFF_PASSWORD });
    expect(student.status).toBe(403);
    expect(student.body.message).toBe('This account does not have staff access.');
    const [row] = await auditRows(db, `target = '${STUDENT.email}'`);
    expect(row).toMatchObject({
      action: 'auth.sign_in_failed',
      details: { reason: 'not_staff', channel: 'staff' },
    });

    // Four more tries (five in total this minute) are answered; the sixth is throttled.
    for (let i = 0; i < 4; i++) {
      const res = await api()
        .post('/api/v1/staff/session')
        .set(client)
        .send({ email: MOD.email, password: 'wrong-pass1' });
      expect(res.status).toBe(401);
    }
    const sixth = await api()
      .post('/api/v1/staff/session')
      .set(client)
      .send({ email: MOD.email, password: STAFF_PASSWORD });
    expect(sixth.status).toBe(429);
    // Another client is not affected.
    const other = await api()
      .post('/api/v1/staff/session')
      .set('X-Forwarded-For', '203.0.113.99')
      .send({ email: MOD.email, password: STAFF_PASSWORD });
    expect(other.status).toBe(200);
  });

  it('TC-M1-68 the Staff Console page is served at /console with no inline script (CSP from helmet)', async () => {
    const page = await api().get('/console/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('StudySpot Staff Console');
    expect(page.text).not.toMatch(/<script>(?!\s*<\/script>)/);
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    const script = await api().get('/console/console.js');
    expect(script.status).toBe(200);
    expect(script.text).toContain('registerPage');
  });

  it('TC-M1-72 an administrator changes a setting: saved, in the history with their e-mail, logged (FR-039, DATA-012, FR-044)', async () => {
    const admin = await staffAuth(ADMIN.email);
    const list = await api().get('/api/v1/staff/settings').set('Authorization', admin);
    expect(list.status).toBe(200);
    expect(list.body.map((s: { key: string }) => s.key)).toEqual([
      'points.crowd',
      'points.noise',
      'points.wifi',
      'points.dailyCap',
      'freshness.crowdMinutes',
      'freshness.noiseMinutes',
      'freshness.wifiMinutes',
      'presence.venueRadiusMeters',
    ]);
    expect(list.body[3]).toMatchObject({ value: 100, defaultValue: 100, min: 0, max: 1000 });

    const put = await api()
      .put('/api/v1/staff/settings/presence.venueRadiusMeters')
      .set('Authorization', admin)
      .send({ value: 75 });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      key: 'presence.venueRadiusMeters',
      value: 75,
      defaultValue: 50,
    });

    const [stored] = await db.query(
      `SELECT value, updated_by FROM config_values WHERE key = 'presence.venueRadiusMeters'`,
    );
    expect(stored).toEqual({ value: 75, updated_by: ADMIN.id });

    const history = await api().get('/api/v1/staff/settings/history').set('Authorization', admin);
    expect(history.body[0]).toMatchObject({
      key: 'presence.venueRadiusMeters',
      label: 'Venue radius',
      oldValue: 50,
      newValue: 75,
      changedBy: { id: ADMIN.id, email: ADMIN.email },
    });
    const [log] = await auditRows(db, `action = 'config.changed'`);
    expect(log).toMatchObject({
      actor_type: 'staff',
      actor_id: ADMIN.id,
      target: 'presence.venueRadiusMeters',
      details: { oldValue: 50, newValue: 75 },
    });
  });

  it('TC-M1-73 settings refuse a moderator, an app token, unknown keys and bad values (UC-19 alternative)', async () => {
    const moderator = await staffAuth(MOD.email);
    expect((await api().get('/api/v1/staff/settings').set('Authorization', moderator)).status).toBe(
      403,
    );

    const app = await api()
      .post('/api/v1/auth/login')
      .send({ email: ADMIN.email, password: STAFF_PASSWORD });
    expect(
      (
        await api()
          .get('/api/v1/staff/settings')
          .set('Authorization', `Bearer ${app.body.accessToken}`)
      ).status,
    ).toBe(401);

    const admin = await staffAuth(ADMIN.email);
    const put = (key: string, value: unknown) =>
      api().put(`/api/v1/staff/settings/${key}`).set('Authorization', admin).send({ value });
    expect((await put('search.maxResults', 10)).status).toBe(404);
    expect((await put('points.crowd', 'ten')).status).toBe(400);
    const tooBig = await put('presence.venueRadiusMeters', 501);
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.message).toBe('Venue radius must be a whole number from 10 to 500 meters.');
    const underCap = await put('points.dailyCap', 5);
    expect(underCap.status).toBe(400);
    const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM config_history`);
    expect(n).toBe(1); // only the change from TC-M1-72
  });

  it('TC-M1-74 statistics count only what falls in the period: start included, end excluded (FR-042)', async () => {
    const VENUE = '6f1c2a10-0000-4000-8000-000000000002';
    await db.query(
      `INSERT INTO venues (id, name, location) VALUES ($1, 'Stats Cafe', ST_SetSRID(ST_MakePoint(31.2, 30.06), 4326)::geography)`,
      [VENUE],
    );
    // Period: 2026-11-01T00:00Z (in) .. 2026-11-08T00:00Z (out).
    const before = '2026-10-31T23:59:59Z';
    const start = '2026-11-01T00:00:00Z';
    const inside = '2026-11-05T12:00:00Z';
    const end = '2026-11-08T00:00:00Z';
    const hash = await bcrypt.hash('x', 4);
    for (const [i, at] of [before, start, inside, end].entries()) {
      await db.query(
        `INSERT INTO users (email, password_hash, display_name, terms_accepted_at, created_at)
         VALUES ($1, $2, 'S', now(), $3)`,
        [`stats${i}@studyspot.test`, hash, at],
      );
      await db.query(
        `INSERT INTO surveys (venue_id, source, noise_answer, submitted_at) VALUES ($1, 'in_app', 'quiet', $2)`,
        [VENUE, at],
      );
      await db.query(
        `INSERT INTO points_ledger (user_id, delta, reason, created_at) VALUES ($1, 10, 'survey_award', $2),
                                                                         ($1, -5, 'coupon_redemption', $2)`,
        [STUDENT.id, at],
      );
    }
    const [offer] = await db.query(
      `INSERT INTO coupon_offers (venue_id, reward, point_cost) VALUES ($1, 'Free tea', 5) RETURNING id`,
      [VENUE],
    );
    for (const [i, at] of [before, inside, end].entries()) {
      await db.query(
        `INSERT INTO coupons (code, offer_id, reward, venue_id, owner_user_id, point_cost, redeemed_at, activation_token_hash)
         VALUES ($1, $2, 'Free tea', $3, $4, 5, $5, $1)`,
        [`CODE${i}`, offer.id, VENUE, STUDENT.id, at],
      );
    }

    const admin = await staffAuth(ADMIN.email);
    const res = await api()
      .get(`/api/v1/staff/statistics?from=${start}&to=${end}`)
      .set('Authorization', admin);
    expect(res.status).toBe(200);
    // Users: the student from beforeAll (created now) is after the period, so total = 3
    // (before, start, inside); new in period = 2 (start, inside).
    expect(res.body).toMatchObject({
      period: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-08T00:00:00.000Z' },
      users: { total: 3, newInPeriod: 2 },
      surveysSubmitted: 2,
      pointsIssued: 20,
      couponsRedeemed: 1,
    });
  });

  it('TC-M1-75 the security log lists failed sign-ins and staff actions with filters; bad periods and moderators are refused (FR-041)', async () => {
    await api()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@studyspot.test', password: 'whatever1' });
    await auditRows(db, `target = 'nobody@studyspot.test'`);
    const admin = await staffAuth(ADMIN.email);

    const failed = await api()
      .get('/api/v1/staff/security-log?action=auth.sign_in_failed')
      .set('Authorization', admin);
    expect(failed.status).toBe(200);
    expect(failed.body.every((r: { action: string }) => r.action === 'auth.sign_in_failed')).toBe(
      true,
    );
    expect(failed.body.map((r: { target: string }) => r.target)).toEqual(
      expect.arrayContaining(['nobody@studyspot.test', STUDENT.email]),
    );
    const appFailure = failed.body.find(
      (r: { target: string }) => r.target === 'nobody@studyspot.test',
    );
    expect(appFailure.details).toEqual({ reason: 'unknown_email', channel: 'app' });

    const all = await api().get('/api/v1/staff/security-log').set('Authorization', admin);
    const change = all.body.find((r: { action: string }) => r.action === 'config.changed');
    expect(change.actor).toEqual({ email: ADMIN.email, displayName: 'admin' });
    // Newest first.
    const times = all.body.map((r: { createdAt: string }) => r.createdAt);
    expect([...times].sort().reverse()).toEqual(times);

    const get = (q: string) =>
      api().get(`/api/v1/staff/security-log?${q}`).set('Authorization', admin);
    expect((await get('from=2026-11-08&to=2026-11-01')).status).toBe(400);
    expect((await get('from=2025-01-01&to=2026-11-08')).status).toBe(400);
    expect((await get('action=drop.tables')).status).toBe(400);
    expect((await get('limit=501')).status).toBe(400);

    const moderator = await staffAuth(MOD.email);
    expect(
      (await api().get('/api/v1/staff/statistics').set('Authorization', moderator)).status,
    ).toBe(403);
    expect(
      (await api().get('/api/v1/staff/security-log').set('Authorization', moderator)).status,
    ).toBe(403);
  });
});
