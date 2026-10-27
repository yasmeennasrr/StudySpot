/**
 * Integration tests: the whole application on a real PostgreSQL + PostGIS database.
 * Uses the studyspot_test database (see ./test-database.ts); `npm run setup` creates it.
 * TC-M1-26..TC-M1-33.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as yaml from 'js-yaml';
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as contracts from '../../src/contracts';
import { buildDataSourceOptions } from '../../src/db/typeorm.options';
import { TEST_DATABASE_URL } from './test-database';

process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.THROTTLE_LIMIT = '10000';
// Only ever the test database: backend/.env (your dev database) is ignored on purpose.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL;

const SAMPLE_VENUE = '6f1c2a10-0000-4000-8000-000000000002';

describe('StudySpot backend on a real database (integration)', () => {
  let app: INestApplication;
  let db: DataSource;
  let accessToken: string;

  beforeAll(async () => {
    // Fresh schema through the real migrations.
    const admin = new DataSource(buildDataSourceOptions());
    await admin.initialize();
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await admin.runMigrations();
    await admin.destroy();

    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/main');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(DataSource);

    const signUp = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'int-test@studyspot.test',
      password: 'testpass123',
      displayName: 'Integration Test',
      termsAccepted: true,
    });
    accessToken = signUp.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('TC-M1-26 wires all 14 modules: every contract token resolves', () => {
    const tokens = [
      'CLOCK',
      'CONFIG',
      'AUDIT',
      'AUTH',
      'VENUE_QUERY',
      'PREFERENCES',
      'FAVORITES',
      'CONDITIONS',
      'PRESENCE',
      'SURVEYS',
      'RECEIPT_CODES',
      'NOISE',
      'REWARDS',
      'STUDY_MATCH',
      'NOTIFY',
      'ADMIN',
    ] as const;
    for (const name of tokens) {
      const token = (contracts as unknown as Record<string, symbol>)[name];
      expect(app.get(token, { strict: false })).toBeDefined();
    }
  });

  it('TC-M1-27 reports healthy with the database up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('TC-M1-28 implements every operation in contracts/openapi.yaml (no unrouted paths)', async () => {
    const spec = yaml.load(
      readFileSync(join(__dirname, '../../../contracts/openapi.yaml'), 'utf8'),
    ) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const missing: string[] = [];
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const method of Object.keys(ops).filter((m) =>
        ['get', 'post', 'put', 'delete'].includes(m),
      )) {
        const url = '/api/v1' + path.replace('{venueId}', SAMPLE_VENUE);
        const res = await (
          request(app.getHttpServer()) as unknown as Record<string, (u: string) => request.Test>
        )
          [method](url)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({});
        const unrouted = res.status === 404 && /^Cannot /.test(String(res.body?.message ?? ''));
        if (unrouted) missing.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('TC-M1-29 records a failed sign-in in the audit log through the SignInFailed event (SEC-010)', async () => {
    await db.query('DELETE FROM audit_log');
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'Nobody@Example.com', password: 'whatever1' });
    expect(res.status).toBe(401);
    await new Promise((r) => setTimeout(r, 200)); // listener is async
    const rows = await db.query(`SELECT action, target, details FROM audit_log`);
    expect(rows).toEqual([
      {
        action: 'auth.sign_in_failed',
        target: 'nobody@example.com',
        details: { reason: 'unknown_email' },
      },
    ]);
  });

  it('TC-M1-30 stores a configuration change with its history (DATA-012)', async () => {
    const config = app.get<contracts.IConfig>(contracts.CONFIG);
    await config.set('points.dailyCap', 150, '00000000-0000-4000-8000-0000000000aa');
    expect(await config.get('points.dailyCap')).toBe(150);
    const history = await db.query(`SELECT key, old_value, new_value FROM config_history`);
    expect(history).toEqual([{ key: 'points.dailyCap', old_value: 100, new_value: 150 }]);
  });

  it('TC-M1-31 search goes API -> Venues -> Maps -> Conditions and returns status-labelled values', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/venues/search?area=zamalek');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      for (const attr of ['crowd', 'noise', 'wifi']) {
        expect(['current', 'hours_ago', 'historical', 'unavailable']).toContain(
          item.conditions[attr].status,
        );
      }
    }
  });

  it('TC-M1-32 creates the full schema with PostGIS', async () => {
    const tables = await db.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
    );
    const names = tables.map((t: { table_name: string }) => t.table_name);
    for (const t of [
      'users',
      'sessions',
      'device_tokens',
      'venues',
      'reviews',
      'review_reports',
      'user_preferences',
      'favorites',
      'surveys',
      'dynamic_records',
      'presence_records',
      'receipt_codes',
      'venue_api_keys',
      'coupon_offers',
      'coupons',
      'points_ledger',
      'audit_log',
      'config_values',
      'config_history',
    ]) {
      expect(names).toContain(t);
    }
    const [{ postgis_version }] = await db.query('SELECT postgis_version()');
    expect(postgis_version).toMatch(/^3\./);
  });

  it('TC-M1-33 enforces data rules in the database (RWD-009 balance never negative, price level 1..4)', async () => {
    await expect(
      db.query(
        `INSERT INTO users (email, password_hash, display_name, terms_accepted_at, points_balance)
         VALUES ('neg@test.com', 'x', 'Neg', now(), -1)`,
      ),
    ).rejects.toThrow(/chk_users_points_nonnegative/);
    await expect(
      db.query(
        `INSERT INTO venues (name, location, price_level) VALUES ('Bad', ST_MakePoint(31.2, 30.0)::geography, 5)`,
      ),
    ).rejects.toThrow(/chk_venues_price_level/);
  });
});
