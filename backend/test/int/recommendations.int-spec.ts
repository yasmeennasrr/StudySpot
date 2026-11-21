/**
 * Integration test for ranked recommendations (PB-30, SDS 6.6.4) on a real PostgreSQL
 * + PostGIS database, called the way StudyMatch calls it: through IVenueQuery.recommend.
 * TC-M4-33. Uses the studyspot_test database (see ./test-database.ts); its schema is wiped.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { VENUE_QUERY, type IVenueQuery } from '../../src/contracts';
import { buildDataSourceOptions } from '../../src/db/typeorm.options';
import { TEST_DATABASE_URL } from './test-database';

process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL;

// A point in New Cairo and three cafés 0.3, 0.9 and 1.5 km east of it, plus one 8 km away.
const HERE = { lat: 30.0205, lng: 31.4952 };
const QUIET_FAR = '6f1c2a10-0000-4000-8000-0000000000c1';
const NOISY_NEAR = '6f1c2a10-0000-4000-8000-0000000000c2';
const QUIET_NO_OUTLETS = '6f1c2a10-0000-4000-8000-0000000000c3';
const OUT_OF_RANGE = '6f1c2a10-0000-4000-8000-0000000000c4';
const STUDENT = '00000000-0000-4000-8000-0000000000e1';
const lngAt = (km: number) => HERE.lng + km / (111.32 * Math.cos((HERE.lat * Math.PI) / 180));

describe('Recommendations on a real database (integration)', () => {
  let app: INestApplication;
  let venues: IVenueQuery;

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
    for (const [id, name, km, outlets, price] of [
      [QUIET_FAR, 'Quiet Far', 1.5, true, 2],
      [NOISY_NEAR, 'Noisy Near', 0.3, true, 2],
      [QUIET_NO_OUTLETS, 'Quiet No Outlets', 0.9, false, 1],
      [OUT_OF_RANGE, 'Out Of Range', 8, true, 1],
    ] as const) {
      await admin.query(
        `INSERT INTO venues (id, name, location, area, opening_hours, price_level,
                             wifi_available, outlets_available, study_type, active)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, 'New Cairo', $5, $6,
                 true, $7, 'both', true)`,
        [id, name, lngAt(km), HERE.lat, always, price, outlets],
      );
    }
    // Noise now: quiet at the two quiet cafés, noisy at the near one.
    await admin.query(
      `INSERT INTO dynamic_records (venue_id, condition_type, value, source_type, recorded_at) VALUES
         ($1, 'noise', 1, 'qr_survey', now() - interval '10 minutes'),
         ($2, 'noise', 3, 'qr_survey', now() - interval '10 minutes'),
         ($3, 'noise', 1, 'qr_survey', now() - interval '10 minutes')`,
      [QUIET_FAR, NOISY_NEAR, QUIET_NO_OUTLETS],
    );
    await admin.query(
      `INSERT INTO users (id, email, password_hash, display_name, terms_accepted_at)
       VALUES ($1, 'e1@studyspot.test', 'x', 'Eman', now())`,
      [STUDENT],
    );
    await admin.query(`INSERT INTO reviews (venue_id, user_id, rating) VALUES ($1, $2, 5)`, [
      QUIET_FAR,
      STUDENT,
    ]);
    // Stored preference: outlets (FR-022).
    await admin.query(`INSERT INTO user_preferences (user_id, criteria) VALUES ($1, $2)`, [
      STUDENT,
      JSON.stringify({ outlets: true }),
    ]);
    await admin.destroy();

    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/main');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    venues = app.get<IVenueQuery>(VENUE_QUERY);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('TC-M4-33 ranks real venues by the request and stored preferences, with values, statuses and reasons (AI-011 to AI-014, FR-022)', async () => {
    const quietNearMe = await venues.recommend({
      userId: STUDENT,
      near: HERE,
      criteria: [
        { name: 'noise', value: 1, required: false },
        { name: 'distance', required: false },
      ],
    });
    expect(quietNearMe).toMatchObject({
      radiusMeters: 2000,
      candidates: 3,
      allRequirementsMet: true,
    });
    // Out Of Range (8 km) is not a candidate. Scores, request weight 1 and the outlets preference 0.5:
    //   Quiet Far        (1 + 0.25 + 0.5) / 2.5 = 0.70
    //   Quiet No Outlets (1 + 0.55 + 0)   / 2.5 = 0.62
    //   Noisy Near       (0 + 0.85 + 0.5) / 2.5 = 0.54
    expect(quietNearMe.items.map((i) => i.venue.name)).toEqual([
      'Quiet Far',
      'Quiet No Outlets',
      'Noisy Near',
    ]);
    const best = quietNearMe.items[0];
    expect(best.score).toBeCloseTo(0.7, 1);
    expect(best.venue).toMatchObject({ averageRating: 5, reviewCount: 1 });
    expect(best.matches[0]).toMatchObject({
      name: 'noise',
      source: 'request',
      requested: 1,
      actual: 1,
      status: 'current',
      met: true,
    });
    expect(best.matches[2]).toMatchObject({ name: 'outlets', source: 'preference', weight: 0.5 });
    expect(best.reasons[0]).toBe('Noise: Quiet now');
    expect(best.reasons[2]).toBe('Has power outlets (your saved preference)');

    // "Must have outlets": the café without outlets is dropped.
    const mustOutlets = await venues.recommend({
      near: HERE,
      criteria: [
        { name: 'outlets', required: true },
        { name: 'noise', value: 1, required: false },
      ],
    });
    expect(mustOutlets.items.map((i) => i.venue.id)).toEqual([QUIET_FAR, NOISY_NEAR]);

    // Nothing meets "noise must be moderate": the best candidates come back with the unmet requirement.
    const none = await venues.recommend({
      near: HERE,
      criteria: [{ name: 'noise', value: 2, required: true }],
    });
    expect(none.allRequirementsMet).toBe(false);
    expect(none.items).toHaveLength(3);
    expect(none.items.every((i) => i.unmetRequired.includes('noise'))).toBe(true);

    // The same request gives the same order (AI-012).
    const again = await venues.recommend({
      userId: STUDENT,
      near: HERE,
      criteria: [
        { name: 'noise', value: 1, required: false },
        { name: 'distance', required: false },
      ],
    });
    expect(again.items.map((i) => i.venue.id)).toEqual(quietNearMe.items.map((i) => i.venue.id));
  });
});
