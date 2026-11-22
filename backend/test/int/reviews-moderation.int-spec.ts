/**
 * Integration tests for reviews and moderation on a real PostgreSQL database,
 * through HTTP: PB-15 write a review (TC-M4-18), PB-16 report one (TC-M4-19),
 * PB-37 moderation queue (TC-M4-20, TC-M4-21).
 * Uses the studyspot_test database (see ./test-database.ts); its schema is wiped.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CONDITIONS, type IConditions } from '../../src/contracts';
import { buildDataSourceOptions } from '../../src/db/typeorm.options';
import { TEST_DATABASE_URL } from './test-database';

process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.THROTTLE_LIMIT = '10000';
process.env.STAFF_SIGNIN_LIMIT = '100';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL;

const PASSWORD = 'testpass123';
const CAFE = '6f1c2a10-0000-4000-8000-000000000001';
const CLOSED_DOWN = '6f1c2a10-0000-4000-8000-0000000000aa';
const USERS = {
  alice: { id: '00000000-0000-4000-8000-0000000000a1', role: 'user' },
  bob: { id: '00000000-0000-4000-8000-0000000000b2', role: 'user' },
  carol: { id: '00000000-0000-4000-8000-0000000000c3', role: 'user' },
  mod: { id: '00000000-0000-4000-8000-0000000000d4', role: 'moderator' },
} as const;
type Name = keyof typeof USERS;
const emailOf = (name: Name) => `${name}@studyspot.test`;

describe('Reviews and moderation on a real database (integration)', () => {
  let app: INestApplication;
  let db: DataSource;
  const api = () => request(app.getHttpServer());
  const tokens = new Map<Name, string>();
  /** App access token for a student, signed in once. */
  const as = async (name: Name) => {
    if (!tokens.has(name)) {
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ email: emailOf(name), password: PASSWORD });
      expect(res.status).toBe(200);
      tokens.set(name, res.body.accessToken);
    }
    return `Bearer ${tokens.get(name)}`;
  };
  const staff = async () => {
    const res = await api()
      .post('/api/v1/staff/session')
      .send({ email: emailOf('mod'), password: PASSWORD });
    expect(res.status).toBe(200);
    return `Bearer ${res.body.staffToken}`;
  };
  const writeReview = async (name: Name, body: Record<string, unknown>, venue = CAFE) =>
    api()
      .put(`/api/v1/venues/${venue}/review`)
      .set('Authorization', await as(name))
      .send(body);

  beforeAll(async () => {
    const admin = new DataSource(buildDataSourceOptions());
    await admin.initialize();
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await admin.runMigrations();
    await admin.query(
      `INSERT INTO venues (id, name, location, area, active) VALUES
         ($1, 'Study Café', ST_SetSRID(ST_MakePoint(31.4952, 30.0205), 4326)::geography, 'New Cairo', true),
         ($2, 'Closed Down', ST_SetSRID(ST_MakePoint(31.2585, 29.9597), 4326)::geography, 'Maadi', false)`,
      [CAFE, CLOSED_DOWN],
    );
    const hash = await bcrypt.hash(PASSWORD, 4);
    for (const [name, u] of Object.entries(USERS)) {
      await admin.query(
        `INSERT INTO users (id, email, password_hash, display_name, role, terms_accepted_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [u.id, emailOf(name as Name), hash, name[0].toUpperCase() + name.slice(1), u.role],
      );
    }
    await admin.destroy();

    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/main');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    // Listen once, so a request that awaits a sign-in first does not race supertest closing the server.
    await app.listen(0);
    db = app.get(DataSource);
  });

  afterAll(async () => {
    // Staff actions write to the audit log in the background: let them finish.
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

  it('TC-M4-18 a student writes one review per venue; writing again replaces it (FR-025, DATA-007)', async () => {
    const none = await api()
      .get(`/api/v1/me/reviews/${CAFE}`)
      .set('Authorization', await as('alice'));
    expect(none.status).toBe(200);
    expect(none.body).toEqual({ review: null });

    const first = await writeReview('alice', { rating: 2, text: '  Too loud at noon  ' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      venueId: CAFE,
      rating: 2,
      text: 'Too loud at noon',
      authorDisplayName: 'Alice',
      hidden: false,
    });
    expect((await writeReview('bob', { rating: 5 })).status).toBe(200);

    const again = await writeReview('alice', { rating: 4, text: 'Better in the morning' });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(Date.parse(again.body.createdAt)).toBeGreaterThanOrEqual(
      Date.parse(first.body.createdAt),
    );
    const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM reviews WHERE user_id = $1`, [
      USERS.alice.id,
    ]);
    expect(n).toBe(1);

    const details = await api().get(`/api/v1/venues/${CAFE}`).expect(200);
    expect(details.body).toMatchObject({ averageRating: 4.5, reviewCount: 2 });
    expect(details.body.reviews[0]).toMatchObject({ rating: 4, authorDisplayName: 'Alice' });

    const mine = await api()
      .get(`/api/v1/me/reviews/${CAFE}`)
      .set('Authorization', await as('alice'));
    expect(mine.body.review).toMatchObject({ id: first.body.id, rating: 4 });

    // Refusals: not signed in, bad input, a deactivated venue.
    expect((await api().put(`/api/v1/venues/${CAFE}/review`).send({ rating: 3 })).status).toBe(401);
    const bad = await writeReview('carol', { rating: 6 });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_INPUT');
    expect((await writeReview('carol', { rating: 3, text: 'x'.repeat(1001) })).status).toBe(400);
    expect((await writeReview('carol', { rating: 3 }, CLOSED_DOWN)).status).toBe(404);
  });

  it('TC-M4-19 another student reports a review once; own and removed reviews cannot be reported (FR-034)', async () => {
    const [review] = await db.query(`SELECT id FROM reviews WHERE user_id = $1`, [USERS.alice.id]);
    const report = async (name: Name, id = review.id as string) =>
      api()
        .post(`/api/v1/reviews/${id}/reports`)
        .set('Authorization', await as(name));

    expect((await report('bob')).status).toBe(204);
    expect((await report('bob')).status).toBe(204); // safe to repeat
    expect((await report('carol')).status).toBe(204);
    const [{ n }] = await db.query(
      `SELECT count(*)::int AS n FROM review_reports WHERE review_id = $1`,
      [review.id],
    );
    expect(n).toBe(2);

    const own = await report('alice');
    expect(own.status).toBe(403);
    expect(own.body.code).toBe('NOT_ALLOWED');
    expect((await report('bob', '00000000-0000-4000-8000-00000000dead')).status).toBe(404);
    expect((await api().post(`/api/v1/reviews/${review.id}/reports`)).status).toBe(401);
  });

  it('TC-M4-20 the moderation queue lists reported reviews; removing one hides it from the venue at once (FR-029, FR-044)', async () => {
    const auth = await staff();
    // A student's app token is not a staff token.
    expect(
      (
        await api()
          .get('/api/v1/staff/moderation/reviews')
          .set('Authorization', await as('bob'))
      ).status,
    ).toBe(401);

    const queue = await api().get('/api/v1/staff/moderation/reviews').set('Authorization', auth);
    expect(queue.status).toBe(200);
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0]).toMatchObject({
      venue: { id: CAFE, name: 'Study Café' },
      rating: 4,
      text: 'Better in the morning',
      author: { id: USERS.alice.id, displayName: 'Alice', email: emailOf('alice') },
      reportCount: 2,
    });
    const reviewId = queue.body[0].reviewId as string;

    const removed = await api()
      .post(`/api/v1/staff/moderation/reviews/${reviewId}/remove`)
      .set('Authorization', auth);
    expect(removed.status).toBe(204);
    const again = await api()
      .post(`/api/v1/staff/moderation/reviews/${reviewId}/remove`)
      .set('Authorization', auth);
    expect(again.status).toBe(404);

    const details = await api().get(`/api/v1/venues/${CAFE}`).expect(200);
    expect(details.body).toMatchObject({ averageRating: 5, reviewCount: 1 });
    const empty = await api().get('/api/v1/staff/moderation/reviews').set('Authorization', auth);
    expect(empty.body).toEqual([]);
    // The author sees that a moderator hid it, and a removed review cannot be reported.
    const mine = await api()
      .get(`/api/v1/me/reviews/${CAFE}`)
      .set('Authorization', await as('alice'));
    expect(mine.body.review).toMatchObject({ id: reviewId, hidden: true });
    expect(
      (
        await api()
          .post(`/api/v1/reviews/${reviewId}/reports`)
          .set('Authorization', await as('carol'))
      ).status,
    ).toBe(404);

    let audit: { action: string; target: string; actor_id: string }[] = [];
    for (let i = 0; i < 20 && audit.length === 0; i++) {
      audit = await db.query(`SELECT * FROM audit_log WHERE action = 'moderation.review_removed'`);
      if (!audit.length) await new Promise((r) => setTimeout(r, 50));
    }
    expect(audit[0]).toMatchObject({ target: reviewId, actor_id: USERS.mod.id });
  });

  it('TC-M4-21 a moderator dismisses reports to keep a review, and removes a survey so it stops feeding conditions (FR-029)', async () => {
    const auth = await staff();
    const [bobs] = await db.query(`SELECT id FROM reviews WHERE user_id = $1`, [USERS.bob.id]);
    await api()
      .post(`/api/v1/reviews/${bobs.id}/reports`)
      .set('Authorization', await as('carol'))
      .expect(204);
    expect(
      (await api().get('/api/v1/staff/moderation/reviews').set('Authorization', auth)).body,
    ).toHaveLength(1);
    await api()
      .post(`/api/v1/staff/moderation/reviews/${bobs.id}/dismiss`)
      .set('Authorization', auth)
      .expect(204);
    expect(
      (await api().get('/api/v1/staff/moderation/reviews').set('Authorization', auth)).body,
    ).toEqual([]);
    expect((await api().get(`/api/v1/venues/${CAFE}`)).body.reviewCount).toBe(1);

    // A survey that says "noisy" makes the noise value current; removing it takes that away.
    const [survey] = await db.query(
      `INSERT INTO surveys (venue_id, user_id, source, noise_answer, submitted_at)
       VALUES ($1, $2, 'in_app', 'noisy', now() - interval '5 minutes') RETURNING id`,
      [CAFE, USERS.carol.id],
    );
    await db.query(
      `INSERT INTO dynamic_records (venue_id, condition_type, value, source_type, recorded_at, survey_id)
       VALUES ($1, 'noise', 3, 'in_app_survey', now() - interval '5 minutes', $2)`,
      [CAFE, survey.id],
    );
    const listed = await api()
      .get(`/api/v1/staff/moderation/surveys?venueId=${CAFE}`)
      .set('Authorization', auth);
    expect(listed.status).toBe(200);
    expect(listed.body[0]).toMatchObject({
      surveyId: survey.id,
      source: 'in_app',
      answers: { noise: 'noisy', crowd: null, wifi: null },
      author: { displayName: 'Carol' },
    });
    // Inserted directly, so no SurveyStored event: drop the cached conditions as that event would.
    app.get<IConditions>(CONDITIONS).invalidate(CAFE);
    const before = await api().get(`/api/v1/venues/${CAFE}`).expect(200);
    expect(before.body.dynamic.noise.status).toBe('current');

    await api()
      .post(`/api/v1/staff/moderation/surveys/${survey.id}/remove`)
      .set('Authorization', auth)
      .expect(204);
    const after = await api().get(`/api/v1/venues/${CAFE}`).expect(200);
    expect(after.body.dynamic.noise.status).toBe('unavailable');
    const left = await api()
      .get(`/api/v1/staff/moderation/surveys?venueId=${CAFE}`)
      .set('Authorization', auth);
    expect(left.body).toEqual([]);
  });
});
