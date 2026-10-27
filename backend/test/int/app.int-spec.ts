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
import { VenueEntity } from '../../src/db/entities';
import { SAMPLE_VENUES } from '../../src/modules/venues/venue-fixtures';
import { TEST_DATABASE_URL } from './test-database';

process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.THROTTLE_LIMIT = '10000';
// Only ever the test database: backend/.env (your dev database) is ignored on purpose.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL;

const SAMPLE_VENUE = '6f1c2a10-0000-4000-8000-000000000002';
const NEARBY_TEST_ORIGIN = { lat: 30.05, lng: 31.3 };
const NEARBY_TEST_VENUES = [
  {
    id: '6f1c2a10-0000-4000-8000-000000000004',
    name: 'Nearby test origin',
    coordinates: [31.3, 30.05] as [number, number],
    active: true,
    outletsAvailable: true,
    priceLevel: 2,
    studyType: 'both' as const,
    openingHours: {
      0: [{ open: '00:00', close: '00:01' }, { open: '00:01', close: '00:00' }],
      1: [{ open: '00:00', close: '00:01' }, { open: '00:01', close: '00:00' }],
      2: [{ open: '00:00', close: '00:01' }, { open: '00:01', close: '00:00' }],
      3: [{ open: '00:00', close: '00:01' }, { open: '00:01', close: '00:00' }],
      4: [{ open: '00:00', close: '00:01' }, { open: '00:01', close: '00:00' }],
      5: [{ open: '00:00', close: '00:01' }, { open: '00:01', close: '00:00' }],
      6: [{ open: '00:00', close: '00:01' }, { open: '00:01', close: '00:00' }],
    },
  },
  {
    id: '6f1c2a10-0000-4000-8000-000000000005',
    name: 'Nearby test inside radius',
    coordinates: [31.3008, 30.05] as [number, number],
    active: true,
    outletsAvailable: true,
    priceLevel: 1,
    studyType: 'group' as const,
    openingHours: {},
  },
  {
    id: '6f1c2a10-0000-4000-8000-000000000006',
    name: 'Nearby test outside radius',
    coordinates: [31.302, 30.05] as [number, number],
    active: true,
    outletsAvailable: false,
    priceLevel: 4,
    studyType: 'individual' as const,
    openingHours: {},
  },
  {
    id: '6f1c2a10-0000-4000-8000-000000000007',
    name: 'Nearby test inactive',
    coordinates: [31.3, 30.05] as [number, number],
    active: false,
    outletsAvailable: true,
    priceLevel: 1,
    studyType: 'both' as const,
    openingHours: {},
  },
];

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
    await db.getRepository(VenueEntity).save(
      SAMPLE_VENUES.map((venue) => ({
        id: venue.id,
        name: venue.name,
        location: {
          type: 'Point' as const,
          coordinates: [venue.location.lng, venue.location.lat] as [number, number],
        },
        address: venue.address,
        area: venue.area,
        openingHours: venue.openingHours,
        priceLevel: venue.priceLevel,
        wifiAvailable: venue.wifiAvailable,
        outletsAvailable: venue.outletsAvailable,
        studyType: venue.studyType,
        source: 'team' as const,
        active: true,
      })),
    );
    await db.getRepository(VenueEntity).save(
      NEARBY_TEST_VENUES.map((venue) => ({
        id: venue.id,
        name: venue.name,
        location: { type: 'Point' as const, coordinates: venue.coordinates },
        active: venue.active,
        outletsAvailable: venue.outletsAvailable,
        priceLevel: venue.priceLevel,
        studyType: venue.studyType,
        openingHours: venue.openingHours,
      })),
    );
    await db.query(
      `INSERT INTO dynamic_records (venue_id, condition_type, value, source_type, recorded_at)
       VALUES
         ($1, 'noise', 1, 'qr_survey', now() - interval '10 minutes'),
         ($1, 'wifi', 2, 'in_app_survey', now() - interval '10 minutes'),
         ($1, 'crowd', 1, 'in_app_survey', now() - interval '10 minutes'),
         ($2, 'noise', 2, 'qr_survey', now() - interval '10 minutes'),
         ($2, 'wifi', 3, 'in_app_survey', now() - interval '10 minutes'),
         ($2, 'crowd', 2, 'in_app_survey', now() - interval '10 minutes'),
         ($3, 'noise', 3, 'qr_survey', now() - interval '10 minutes'),
         ($3, 'wifi', 1, 'in_app_survey', now() - interval '10 minutes'),
         ($3, 'crowd', 3, 'in_app_survey', now() - interval '10 minutes')`,
      [NEARBY_TEST_VENUES[0].id, NEARBY_TEST_VENUES[1].id, NEARBY_TEST_VENUES[2].id],
    );

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

  it('TC-M3-01 finds database venues inside the requested nearby radius with distance', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/venues/nearby?lat=30.0205&lng=31.4952&radius=100&limit=30',
    );

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      '6f1c2a10-0000-4000-8000-000000000001',
    ]);
    expect(res.body.items[0].distanceMeters).toBe(0);

    const defaultRadius = await request(app.getHttpServer()).get(
      '/api/v1/venues/nearby?lat=30.0195&lng=31.4996',
    );
    expect(defaultRadius.status).toBe(200);
    expect(defaultRadius.body.items.map((item: { id: string }) => item.id)).toEqual([
      '6f1c2a10-0000-4000-8000-000000000001',
    ]);
  });

  it('TC-M3-05 includes venues within the radius and excludes venues beyond it', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&radius=100`,
    );

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[0].id,
      NEARBY_TEST_VENUES[1].id,
    ]);
  });

  it('TC-M3-06 returns nearby venues in ascending distance order', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&radius=500`,
    );

    expect(res.status).toBe(200);
    expect(res.body.items.slice(0, 3).map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[0].id,
      NEARBY_TEST_VENUES[1].id,
      NEARBY_TEST_VENUES[2].id,
    ]);
    const distances = res.body.items
      .slice(0, 3)
      .map((item: { distanceMeters: number }) => item.distanceMeters);
    expect(distances[0]).toBe(0);
    expect(distances[1]).toBeLessThan(distances[2]);
  });

  it('TC-M3-07 applies the requested result limit after nearest-first ordering', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&radius=500&limit=1`,
    );

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(NEARBY_TEST_VENUES[0].id);
  });

  it('TC-M3-08 excludes inactive venues from nearby results', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&radius=100`,
    );

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).not.toContain(
      NEARBY_TEST_VENUES[3].id,
    );
  });

  it('TC-M3-09 returns an empty list when no active venue is within range', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/venues/nearby?lat=30&lng=34&radius=100',
    );

    expect(res.status).toBe(200);
    expect(res.body.origin).toEqual({ lat: 30, lng: 34 });
    expect(res.body.items).toEqual([]);
  });

  it.each([99, 5001])('TC-M3-10 rejects radius %i outside the supported range', async (radius) => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=30&lng=31&radius=${radius}`,
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  it.each([0, 31])('TC-M3-11 rejects result limit %i outside the supported range', async (limit) => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=30&lng=31&limit=${limit}`,
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  it.each([
    ['latitude', 'lat=91&lng=31'],
    ['longitude', 'lat=30&lng=181'],
  ])('TC-M3-12 rejects an out-of-range %s', async (_field, coordinates) => {
    const res = await request(app.getHttpServer()).get(`/api/v1/venues/nearby?${coordinates}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  it('TC-M3-13 filters venues by outlet availability', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&outlets=false`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[2].id,
    ]);
  });

  it('TC-M3-14 applies the maximum price level', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&maxPrice=1`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[1].id,
    ]);
  });

  it('TC-M3-15 treats both study types as suitable for individual study', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&studyType=individual`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[0].id,
      NEARBY_TEST_VENUES[2].id,
    ]);
  });

  it('TC-M3-16 treats both study types as suitable for group study', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&studyType=group`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[0].id,
      NEARBY_TEST_VENUES[1].id,
    ]);
  });

  it('TC-M3-17 applies maximum distance from the supplied origin', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&maxDistance=100`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[0].id,
      NEARBY_TEST_VENUES[1].id,
    ]);
  });

  it('TC-M3-18 returns open venues when openNow=true', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&openNow=true`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string; openNow: boolean }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[0].id,
    ]);
    expect(res.body.items[0].openNow).toBe(true);
  });

  it('TC-M3-19 returns closed venues when openNow=false', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&openNow=false`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string; openNow: boolean }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[1].id,
      NEARBY_TEST_VENUES[2].id,
    ]);
    expect(res.body.items.every((item: { openNow: boolean }) => item.openNow === false)).toBe(true);
  });

  it('TC-M3-20 matches current noise levels returned by the real conditions service', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&noise=quiet`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[0].id,
    ]);
    expect(res.body.items[0].conditions.noise).toMatchObject({
      level: 1,
      label: 'Quiet',
      status: 'current',
    });
  });

  it('TC-M3-21 matches current Wi-Fi quality returned by the real conditions service', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&wifi=good`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[1].id,
    ]);
    expect(res.body.items[0].conditions.wifi).toMatchObject({
      level: 3,
      label: 'Good',
      status: 'current',
    });
  });

  it('TC-M3-22 matches current crowd levels returned by the real conditions service', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&crowd=low`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[0].id,
    ]);
    expect(res.body.items[0].conditions.crowd).toMatchObject({
      level: 1,
      label: 'Low',
      status: 'current',
    });
  });

  it('TC-M3-24 matches selected levels 2 and 3 from real conditions data', async () => {
    const moderateNoise = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&noise=moderate`,
    );
    const poorWifi = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&wifi=poor`,
    );
    const highCrowd = await request(app.getHttpServer()).get(
      `/api/v1/venues/nearby?lat=${NEARBY_TEST_ORIGIN.lat}&lng=${NEARBY_TEST_ORIGIN.lng}&crowd=high`,
    );
    expect(moderateNoise.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[1].id,
    ]);
    expect(poorWifi.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[2].id,
    ]);
    expect(highCrowd.body.items.map((item: { id: string }) => item.id)).toEqual([
      NEARBY_TEST_VENUES[2].id,
    ]);
  });

  it('TC-M3-26 excludes unavailable condition values from the matching filter', async () => {
    const base = '/api/v1/venues/nearby?lat=30.0626&lng=31.2197&radius=100';
    const noise = await request(app.getHttpServer()).get(`${base}&noise=quiet`);
    const wifi = await request(app.getHttpServer()).get(`${base}&wifi=good`);
    const crowd = await request(app.getHttpServer()).get(`${base}&crowd=low`);
    expect(noise.body.items).toEqual([]);
    expect(wifi.body.items).toEqual([]);
    expect(crowd.body.items).toEqual([]);
  });

  it('TC-M3-23 returns no matches for maxDistance without an origin', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/venues/search?q=Nearby&maxDistance=100');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
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
