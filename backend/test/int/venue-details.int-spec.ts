/**
 * Integration tests for venue details (PB-11) and the conditions read path on a
 * real PostgreSQL + PostGIS database, through the HTTP API. TC-M4-14, TC-M4-15.
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

const CAFE = '6f1c2a10-0000-4000-8000-000000000001';
const QUIET = '6f1c2a10-0000-4000-8000-000000000002';
const CLOSED_DOWN = '6f1c2a10-0000-4000-8000-0000000000aa';
const NOT_A_VENUE = '6f1c2a10-0000-4000-8000-0000000000ff';
const ALICE = '00000000-0000-4000-8000-0000000000a1';
const BOB = '00000000-0000-4000-8000-0000000000b2';
const CAROL = '00000000-0000-4000-8000-0000000000c3';

describe('Venue details and conditions on a real database (integration)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const admin = new DataSource(buildDataSourceOptions());
    await admin.initialize();
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await admin.runMigrations();

    await admin.query(
      `INSERT INTO venues (id, name, location, address, area, opening_hours, price_level,
                           wifi_available, outlets_available, study_type, active)
       VALUES ($1, 'Study Café', ST_SetSRID(ST_MakePoint(31.4952, 30.0205), 4326)::geography,
               '90th Street', 'New Cairo', '{"0":[{"open":"08:00","close":"00:00"}]}', 2,
               true, true, 'both', true),
              ($2, 'Quiet Corner', ST_SetSRID(ST_MakePoint(31.2197, 30.0626), 4326)::geography,
               null, 'Zamalek', null, null, null, null, null, true),
              ($3, 'Closed Down', ST_SetSRID(ST_MakePoint(31.2585, 29.9597), 4326)::geography,
               null, 'Maadi', null, 1, false, true, 'group', false)`,
      [CAFE, QUIET, CLOSED_DOWN],
    );
    for (const [id, name] of [
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
      [CAROL, 'Carol'],
    ]) {
      await admin.query(
        `INSERT INTO users (id, email, password_hash, display_name, terms_accepted_at)
         VALUES ($1, $2, 'x', $3, now())`,
        [id, `${name.toLowerCase()}@example.com`, name],
      );
    }
    // Two visible reviews (4 and 5 stars) and one removed by a moderator (1 star).
    await admin.query(
      `INSERT INTO reviews (venue_id, user_id, rating, text, removed_at, created_at) VALUES
         ($1, $2, 4, 'Good outlets', null, now() - interval '2 days'),
         ($1, $3, 5, null, null, now() - interval '1 day'),
         ($1, $4, 1, 'spam', now(), now())`,
      [CAFE, ALICE, BOB, CAROL],
    );
    // Noise: a survey 10 min ago -> current. Crowd: 3 hours ago -> hours_ago.
    // Wi-Fi: only a record of a survey a moderator removed -> unavailable.
    const [removed] = await admin.query(
      `INSERT INTO surveys (venue_id, user_id, source, wifi_answer, submitted_at, removed_at)
       VALUES ($1, $2, 'in_app', 'good', now() - interval '5 minutes', now()) RETURNING id`,
      [CAFE, CAROL],
    );
    await admin.query(
      `INSERT INTO dynamic_records (venue_id, condition_type, value, source_type, recorded_at, survey_id) VALUES
         ($1, 'noise', 1, 'qr_survey', now() - interval '10 minutes', null),
         ($1, 'crowd', 3, 'in_app_survey', now() - interval '3 hours', null),
         ($1, 'wifi', 3, 'in_app_survey', now() - interval '5 minutes', $2),
         ($3, 'noise', 3, 'audio_analysis', now() - interval '20 days', null)`,
      [CAFE, removed.id, QUIET],
    );
    await admin.destroy();

    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/main');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('TC-M4-14 details keep static and dynamic apart, rate from visible reviews only, and hide removed venues (FR-016..FR-019, FR-029)', async () => {
    const res = await api().get(`/api/v1/venues/${CAFE}`);
    expect(res.status).toBe(200);
    expect(res.body.static).toEqual({
      id: CAFE,
      name: 'Study Café',
      location: { lat: 30.0205, lng: 31.4952 },
      address: '90th Street',
      area: 'New Cairo',
      openingHours: { 0: [{ open: '08:00', close: '00:00' }] },
      priceLevel: 2,
      wifiAvailable: true,
      outletsAvailable: true,
      studyType: 'both',
    });
    expect(Object.keys(res.body.dynamic).sort()).toEqual(['crowd', 'noise', 'venueId', 'wifi']);
    // (4 + 5) / 2; the removed 1-star review is neither counted nor shown.
    expect(res.body.averageRating).toBe(4.5);
    expect(res.body.reviewCount).toBe(2);
    expect(res.body.reviews.map((r: { authorDisplayName: string }) => r.authorDisplayName)).toEqual(
      ['Bob', 'Alice'],
    );
    // Authors appear by display name only: no user id or e-mail (PRIV-014).
    expect(Object.keys(res.body.reviews[0]).sort()).toEqual([
      'authorDisplayName',
      'createdAt',
      'id',
      'rating',
      'text',
    ]);

    const empty = await api().get(`/api/v1/venues/${QUIET}`);
    expect(empty.body).toMatchObject({ averageRating: null, reviewCount: 0, reviews: [] });
    expect(empty.body.static).toMatchObject({
      priceLevel: null,
      studyType: null,
      openingHours: null,
    });

    for (const id of [CLOSED_DOWN, NOT_A_VENUE]) {
      const missing = await api().get(`/api/v1/venues/${id}`);
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('NOT_FOUND');
    }
  });

  it('TC-M4-15 each dynamic value carries its status from the stored records (RT-001, RT-016..RT-018)', async () => {
    const { body } = await api().get(`/api/v1/venues/${CAFE}`).expect(200);
    expect(body.dynamic.noise).toMatchObject({
      status: 'current',
      level: 1,
      label: 'Quiet',
      basedOn: ['surveys'],
      isEstimate: true,
    });
    expect(Date.now() - Date.parse(body.dynamic.noise.newestInputAt)).toBeLessThan(11 * 60_000);
    expect(body.dynamic.crowd).toMatchObject({ status: 'hours_ago', level: 3, label: 'High' });
    // The only Wi-Fi record belongs to a removed survey, so it is ignored.
    expect(body.dynamic.wifi).toMatchObject({ status: 'unavailable', level: null, label: null });

    const quiet = await api().get(`/api/v1/venues/${QUIET}`).expect(200);
    expect(quiet.body.dynamic.noise).toMatchObject({
      status: 'historical',
      label: 'Noisy',
      basedOn: ['historical'],
      newestInputAt: null,
    });
    expect(quiet.body.dynamic.crowd.status).toBe('unavailable');
  });
});
