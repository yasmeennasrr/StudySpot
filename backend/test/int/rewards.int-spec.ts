/**
 * Integration tests for Rewards & Coupons (PB-24 points, PB-25 redeem, PB-26 e-mail,
 * PB-27 activation, PB-38 expiry and 90-day purge) on a real PostgreSQL + PostGIS
 * database, through the HTTP API where an endpoint exists. TC-M6-20..TC-M6-35.
 * Time comes from a FakeClock so every rule is checked at its boundary.
 * Uses the studyspot_test database (see ./test-database.ts); its schema is wiped.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  CLOCK,
  EMAIL,
  PRESENCE,
  RECEIPT_CODES,
  REWARDS,
  SURVEYS,
  type IReceiptCodes,
  type IRewards,
  type ISurvey,
  type StoredSurvey,
  type SurveyAnswers,
} from '../../src/contracts';
import { buildDataSourceOptions } from '../../src/db/typeorm.options';
import type { FakeEmailAdapter } from '../../src/adapters/email/email-adapter.module';
import { FakeClock } from '../../src/modules/clock/fake-clock';
import { TEST_DATABASE_URL } from './test-database';

process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.THROTTLE_LIMIT = '10000';
process.env.SENDGRID_API_KEY = '';
process.env.SENDGRID_FROM_EMAIL = '';
process.env.PUBLIC_BASE_URL = 'https://studyspot.example';
// Only ever the test database: backend/.env (your dev database) is ignored on purpose.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL;

const PASSWORD = 'devpass123';
const ZAMALEK = '6f1c2a10-0000-4000-8000-000000000002';
const MAADI = '6f1c2a10-0000-4000-8000-000000000003';
const DOKKI = '6f1c2a10-0000-4000-8000-000000000004';
const CLOSED_VENUE = '6f1c2a10-0000-4000-8000-000000000009';
const OFFER_30 = 'c0a1b2c3-0000-4000-8000-000000000001';
const OFFER_80 = 'c0a1b2c3-0000-4000-8000-000000000002';
const OFFER_INACTIVE = 'c0a1b2c3-0000-4000-8000-000000000003';
const OFFER_CLOSED_VENUE = 'c0a1b2c3-0000-4000-8000-000000000004';

const ALL: SurveyAnswers = { crowd: 'not_crowded', noise: 'quiet', wifi: 'good' };

describe('Rewards and coupons on a real database (integration)', () => {
  let app: INestApplication;
  let db: DataSource;
  let rewards: IRewards;
  let email: FakeEmailAdapter;
  const clock = new FakeClock('2026-11-24T10:00:00+02:00');
  /** Rule 3 (SDS 6.6.5): who counts as present. Real presence has its own tests. */
  const present = new Set<string>();
  const api = () => request(app.getHttpServer());
  let userCount = 0;
  let surveyCount = 0;

  /** A new student with a known balance, signed in through the real API. */
  async function student(balance = 0): Promise<{ id: string; auth: string; email: string }> {
    userCount += 1;
    const id = `00000000-0000-4000-8000-${String(userCount).padStart(12, '0')}`;
    const mail = `student${userCount}@studyspot.test`;
    await db.query(
      `INSERT INTO users (id, email, password_hash, display_name, terms_accepted_at, points_balance)
       VALUES ($1, $2, $3, $4, now(), $5)`,
      [id, mail, await bcrypt.hash(PASSWORD, 4), `Student ${userCount}`, balance],
    );
    const login = await api().post('/api/v1/auth/login').send({ email: mail, password: PASSWORD });
    expect(login.status).toBe(200);
    return { id, auth: `Bearer ${login.body.accessToken}`, email: mail };
  }

  /** Stores a survey the way Surveys (PB-17) will, then asks Rewards for the points. */
  async function survey(
    userId: string,
    venueId: string,
    answers: SurveyAnswers = ALL,
    source: 'in_app' | 'qr' = 'in_app',
  ): Promise<{ stored: StoredSurvey; award: { points: number; reason: string | null } }> {
    surveyCount += 1;
    const id = `5a000000-0000-4000-8000-${String(surveyCount).padStart(12, '0')}`;
    const submittedAt = clock.now();
    await db.query(
      `INSERT INTO surveys (id, venue_id, user_id, source, crowd_answer, noise_answer, wifi_answer, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        venueId,
        userId,
        source,
        answers.crowd ?? null,
        answers.noise ?? null,
        answers.wifi ?? null,
        submittedAt,
      ],
    );
    const stored: StoredSurvey = {
      id,
      venueId,
      userId,
      source,
      answers,
      submittedAt: submittedAt.toISOString(),
      pointsAwarded: 0,
      noPointsReason: null,
    };
    return { stored, award: await rewards.awardForSurvey(stored) };
  }

  async function balanceOf(userId: string): Promise<number> {
    const [row] = await db.query('SELECT points_balance FROM users WHERE id = $1', [userId]);
    return row.points_balance;
  }

  /** The raw activation token from the last e-mail sent (only its hash is stored). */
  function lastLinkToken(): string {
    const text = email.sent[email.sent.length - 1].text;
    const match = /\/coupon\/#t=([A-Za-z0-9_-]{22})/.exec(text);
    expect(match).not.toBeNull();
    return match![1];
  }

  beforeAll(async () => {
    const admin = new DataSource(buildDataSourceOptions());
    await admin.initialize();
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await admin.runMigrations();
    for (const [id, name, lng, lat, active] of [
      [ZAMALEK, 'Sample Quiet Corner (Zamalek)', 31.2197, 30.0626, true],
      [MAADI, 'Sample Group Hub (Maadi)', 31.2585, 29.9597, true],
      [DOKKI, 'Sample Reading Room (Dokki)', 31.2118, 30.0384, true],
      [CLOSED_VENUE, 'Sample Closed Café', 31.24, 30.05, false],
    ] as const) {
      await admin.query(
        `INSERT INTO venues (id, name, location, active) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5)`,
        [id, name, lng, lat, active],
      );
    }
    await admin.query(
      `INSERT INTO coupon_offers (id, venue_id, reward, point_cost, active) VALUES
        ($1, $5, 'Free Turkish coffee', 30, true),
        ($2, $6, 'Free cappuccino', 80, true),
        ($3, $5, 'Old offer', 10, false),
        ($4, $7, 'Offer at a closed venue', 10, true)`,
      [OFFER_30, OFFER_80, OFFER_INACTIVE, OFFER_CLOSED_VENUE, ZAMALEK, MAADI, CLOSED_VENUE],
    );
    await admin.destroy();

    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/main');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .overrideProvider(PRESENCE)
      .useValue({
        isPresent: async (userId: string, venueId: string) => present.has(`${userId}:${venueId}`),
        reportLocation: async () => ({ venueId: null }),
        respondToPrompt: async () => false,
        recordReceiptScan: async () => undefined,
        countPresent: async () => 0,
        purgeExpired: async () => 0,
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    rewards = app.get(REWARDS);
    email = app.get(EMAIL);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    clock.set('2026-11-24T10:00:00+02:00');
  });

  // ------------------------------------------------------------------ PB-24 points

  it('TC-M6-20 awards the configured points per answered category, writes the ledger and the balance (RWD-001..RWD-004, RWD-010)', async () => {
    const s = await student();
    present.add(`${s.id}:${ZAMALEK}`);
    const { stored, award } = await survey(s.id, ZAMALEK);
    expect(award).toEqual({ points: 30, reason: null });
    expect(await balanceOf(s.id)).toBe(30);
    const ledger = await db.query(
      `SELECT delta, reason, survey_id, created_at FROM points_ledger WHERE user_id = $1`,
      [s.id],
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ delta: 30, reason: 'survey_award', survey_id: stored.id });
    // The award time is the clock's, so the time rules below are exact.
    expect(new Date(ledger[0].created_at).toISOString()).toBe(clock.now().toISOString());

    const points = await api().get('/api/v1/me/points').set('Authorization', s.auth);
    expect(points.status).toBe(200);
    expect(points.body).toEqual({
      balance: 30,
      earnedToday: 30,
      dailyCap: 100,
      perCategory: { crowd: 10, noise: 10, wifi: 10 },
    });
    const me = await api().get('/api/v1/me').set('Authorization', s.auth);
    expect(me.body.pointsBalance).toBe(30);

    // Two categories, and Wi-Fi "not used": 10 points; nothing answered: none, with a reason.
    clock.advance({ minutes: 5 });
    present.add(`${s.id}:${MAADI}`);
    expect(
      (await survey(s.id, MAADI, { crowd: 'very_crowded', wifi: 'not_used' })).award.points,
    ).toBe(10);
    clock.advance({ minutes: 5 });
    present.add(`${s.id}:${DOKKI}`);
    const empty = await survey(s.id, DOKKI, {});
    expect(empty.award.points).toBe(0);
    expect(empty.award.reason).toMatch(/answer at least one question/);
    expect(await balanceOf(s.id)).toBe(40);
  });

  it('TC-M6-21 awards a survey at most once, even when asked twice or twice at the same time (RWD-011)', async () => {
    const s = await student();
    present.add(`${s.id}:${ZAMALEK}`);
    const { stored, award } = await survey(s.id, ZAMALEK);
    expect(award.points).toBe(30);
    expect(await rewards.awardForSurvey(stored)).toEqual({ points: 30, reason: null });
    await Promise.all([rewards.awardForSurvey(stored), rewards.awardForSurvey(stored)]);
    expect(await balanceOf(s.id)).toBe(30);
    const [{ n }] = await db.query(
      `SELECT count(*)::int AS n FROM points_ledger WHERE survey_id = $1`,
      [stored.id],
    );
    expect(n).toBe(1);
  });

  it('TC-M6-22 gives no points for an in-app survey sent away from the venue, but a QR survey counts as present (SDS 6.6.5 rule 3, RWD-013)', async () => {
    const s = await student();
    const away = await survey(s.id, ZAMALEK);
    expect(away.award.points).toBe(0);
    expect(away.award.reason).toMatch(/be at the venue/);
    const [row] = await db.query(
      `SELECT delta, reason, note FROM points_ledger WHERE survey_id = $1`,
      [away.stored.id],
    );
    expect(row).toMatchObject({ delta: 0, reason: 'no_award' });
    expect(row.note).toBe(away.award.reason);

    clock.advance({ minutes: 5 });
    expect((await survey(s.id, MAADI, ALL, 'qr')).award.points).toBe(30);
    // Every reason fits surveys.no_points_reason (120 characters).
    expect(away.award.reason!.length).toBeLessThanOrEqual(120);
  });

  it('TC-M6-23 limits points to one survey per venue per Cairo day and 5 minutes between awards (SDS 6.6.5 rules 1 and 2)', async () => {
    const s = await student();
    for (const v of [ZAMALEK, MAADI, DOKKI]) present.add(`${s.id}:${v}`);
    clock.set('2026-11-24T23:50:00+02:00');
    expect((await survey(s.id, ZAMALEK)).award.points).toBe(30);

    // Rule 2 at its boundary: 4 min 59 s blocked, 5 min allowed.
    clock.set('2026-11-24T23:54:59+02:00');
    const tooSoon = await survey(s.id, MAADI);
    expect(tooSoon.award).toMatchObject({ points: 0 });
    expect(tooSoon.award.reason).toMatch(/wait 5 minutes/);
    clock.set('2026-11-24T23:55:00+02:00');
    expect((await survey(s.id, MAADI)).award.points).toBe(30);

    // Rule 1: same venue, same Cairo day, blocked; a blocked survey never resets rule 2.
    clock.set('2026-11-24T23:59:59+02:00');
    const sameDay = await survey(s.id, ZAMALEK);
    expect(sameDay.award.points).toBe(0);
    expect(sameDay.award.reason).toMatch(/already earned points at this venue today/);

    // Cairo midnight: a new day, so the same venue earns again.
    clock.set('2026-11-25T00:00:00+02:00');
    expect((await survey(s.id, ZAMALEK)).award.points).toBe(30);
    expect(await balanceOf(s.id)).toBe(90);
  });

  it('TC-M6-24 caps survey points at 100 per Cairo day, partly when needed, and starts again the next day (RWD-016)', async () => {
    const s = await student();
    const venues: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = `6f1c2a10-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`;
      await db.query(
        `INSERT INTO venues (id, name, location) VALUES ($1, $2, ST_SetSRID(ST_MakePoint(31.2, 30.0), 4326)::geography)`,
        [id, `Cap test venue ${i}`],
      );
      venues.push(id);
      present.add(`${s.id}:${id}`);
    }
    const awards: number[] = [];
    const reasons: (string | null)[] = [];
    for (const v of venues) {
      const { award } = await survey(s.id, v);
      awards.push(award.points);
      reasons.push(award.reason);
      clock.advance({ minutes: 5 });
    }
    // 30 + 30 + 30 = 90, then 10 of 30 (partly capped), then none.
    expect(awards).toEqual([30, 30, 30, 10, 0]);
    expect(reasons[3]).toBe(
      "You reached today's limit of 100 points, so this survey earned 10 of 30 points.",
    );
    expect(reasons[4]).toMatch(/reached today's limit of 100 points/);
    expect(await balanceOf(s.id)).toBe(100);
    const summary = await api().get('/api/v1/me/points').set('Authorization', s.auth);
    expect(summary.body).toMatchObject({ balance: 100, earnedToday: 100, dailyCap: 100 });

    clock.set('2026-11-25T09:00:00+02:00');
    expect((await survey(s.id, venues[0])).award.points).toBe(30);
    expect(
      (await api().get('/api/v1/me/points').set('Authorization', s.auth)).body.earnedToday,
    ).toBe(30);
  });

  // ------------------------------------------------------------------ PB-25 offers and redeem

  it('TC-M6-25 lists active offers of active venues with cost and venue, cheapest first, to guests too (RWD-005)', async () => {
    const res = await api().get('/api/v1/coupon-offers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: OFFER_30,
        venueId: ZAMALEK,
        venueName: 'Sample Quiet Corner (Zamalek)',
        reward: 'Free Turkish coffee',
        pointCost: 30,
      },
      {
        id: OFFER_80,
        venueId: MAADI,
        venueName: 'Sample Group Hub (Maadi)',
        reward: 'Free cappuccino',
        pointCost: 80,
      },
    ]);
  });

  it('TC-M6-26 redeems points for a coupon in one transaction and e-mails it with code and Activate link (RWD-006, RWD-007, RWD-014, PERF-010)', async () => {
    const s = await student(100);
    const before = email.sent.length;
    const res = await api()
      .post(`/api/v1/coupon-offers/${OFFER_30}/redeem`)
      .set('Authorization', s.auth);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      reward: 'Free Turkish coffee',
      venueId: ZAMALEK,
      venueName: 'Sample Quiet Corner (Zamalek)',
      pointCost: 30,
      status: 'issued',
      activatedAt: null,
      expiresAt: null,
      emailStatus: 'sent',
      redeemedAt: clock.now().toISOString(),
    });
    expect(res.body.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(await balanceOf(s.id)).toBe(70);
    const [ledger] = await db.query(
      `SELECT delta, reason, coupon_id FROM points_ledger WHERE user_id = $1`,
      [s.id],
    );
    expect(ledger).toEqual({ delta: -30, reason: 'coupon_redemption', coupon_id: res.body.id });

    expect(email.sent.length).toBe(before + 1);
    const mail = email.sent[email.sent.length - 1];
    expect(mail.to).toBe(s.email);
    expect(mail.subject).toBe(
      'Your StudySpot coupon: Free Turkish coffee at Sample Quiet Corner (Zamalek)',
    );
    expect(mail.text).toContain(res.body.code);
    expect(mail.text).toContain('https://studyspot.example/coupon/#t=');
    expect(mail.html).toContain('>Activate</a>');
    // Only the token's hash is stored, never the token.
    const token = lastLinkToken();
    const [row] = await db.query(`SELECT activation_token_hash FROM coupons WHERE id = $1`, [
      res.body.id,
    ]);
    expect(row.activation_token_hash).not.toContain(token);
    expect(row.activation_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('TC-M6-27 rejects a redemption without enough points and never lets two at once spend the same points (RWD-008, RWD-009)', async () => {
    const poor = await student(79);
    const res = await api()
      .post(`/api/v1/coupon-offers/${OFFER_80}/redeem`)
      .set('Authorization', poor.auth);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(res.body.message).toBe(
      'You need 1 more points for this coupon. Your points have not changed.',
    );
    expect(res.body.details).toEqual({ reason: 'INSUFFICIENT_POINTS', balance: 79, pointCost: 80 });
    expect(await balanceOf(poor.id)).toBe(79);

    // Exactly enough: 80 -> 0. Not negative, never below.
    const exact = await student(80);
    const [a, b] = await Promise.all([
      api().post(`/api/v1/coupon-offers/${OFFER_80}/redeem`).set('Authorization', exact.auth),
      api().post(`/api/v1/coupon-offers/${OFFER_80}/redeem`).set('Authorization', exact.auth),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await balanceOf(exact.id)).toBe(0);
    const [{ n }] = await db.query(
      `SELECT count(*)::int AS n FROM coupons WHERE owner_user_id = $1`,
      [exact.id],
    );
    expect(n).toBe(1);

    for (const offer of [
      OFFER_INACTIVE,
      OFFER_CLOSED_VENUE,
      '0a0a0a0a-0000-4000-8000-000000000000',
    ]) {
      const missing = await api()
        .post(`/api/v1/coupon-offers/${offer}/redeem`)
        .set('Authorization', exact.auth);
      expect(missing.status).toBe(404);
    }
    const bad = await api()
      .post('/api/v1/coupon-offers/not-a-uuid/redeem')
      .set('Authorization', exact.auth);
    expect(bad.status).toBe(400);
  });

  it('TC-M6-28 lists only my own coupons, the running one first, and hides other students’ coupons (RWD-021, SEC-004)', async () => {
    const me = await student(200);
    const other = await student(100);
    const first = await api()
      .post(`/api/v1/coupon-offers/${OFFER_30}/redeem`)
      .set('Authorization', me.auth);
    clock.advance({ minutes: 1 });
    const second = await api()
      .post(`/api/v1/coupon-offers/${OFFER_80}/redeem`)
      .set('Authorization', me.auth);
    const theirs = await api()
      .post(`/api/v1/coupon-offers/${OFFER_30}/redeem`)
      .set('Authorization', other.auth);
    await api()
      .post(`/api/v1/me/coupons/${first.body.id}/activate`)
      .set('Authorization', me.auth)
      .expect(200);

    const list = await api().get('/api/v1/me/coupons').set('Authorization', me.auth);
    expect(list.status).toBe(200);
    expect(list.body.map((c: { id: string; status: string }) => [c.id, c.status])).toEqual([
      [first.body.id, 'active'],
      [second.body.id, 'issued'],
    ]);
    const steal = await api()
      .post(`/api/v1/me/coupons/${theirs.body.id}/activate`)
      .set('Authorization', me.auth);
    expect(steal.status).toBe(404);
  });

  // ------------------------------------------------------------------ PB-26 e-mail and retries

  it('TC-M6-29 keeps the coupon in the app when the e-mail fails and retries 1, 5, 15 and 60 minutes after the first failure (EIR-013, SDS 6.6.9)', async () => {
    const s = await student(100);
    email.failNext(5);
    const redeemed = await api()
      .post(`/api/v1/coupon-offers/${OFFER_30}/redeem`)
      .set('Authorization', s.auth);
    expect(redeemed.status).toBe(201);
    expect(redeemed.body.emailStatus).toBe('pending');
    const list = await api().get('/api/v1/me/coupons').set('Authorization', s.auth);
    expect(list.body.map((c: { id: string }) => c.id)).toContain(redeemed.body.id);

    const t0 = clock.now().getTime();
    const due = async () =>
      (
        await db.query(
          `SELECT email_status, email_attempts, next_email_attempt_at FROM coupons WHERE id = $1`,
          [redeemed.body.id],
        )
      )[0];
    expect(await due()).toMatchObject({ email_status: 'pending', email_attempts: 1 });
    for (const [minutes, attempts] of [
      [1, 2],
      [5, 3],
      [15, 4],
    ] as const) {
      expect(new Date((await due()).next_email_attempt_at).getTime()).toBe(t0 + minutes * 60_000);
      clock.set(new Date(t0 + minutes * 60_000 - 1000));
      expect(await rewards.retryFailedEmails()).toBe(0); // one second early: not yet
      clock.set(new Date(t0 + minutes * 60_000));
      expect(await rewards.retryFailedEmails()).toBe(1);
      expect(await due()).toMatchObject({ email_status: 'pending', email_attempts: attempts });
    }
    expect(new Date((await due()).next_email_attempt_at).getTime()).toBe(t0 + 60 * 60_000);
    clock.set(new Date(t0 + 60 * 60_000));
    expect(await rewards.retryFailedEmails()).toBe(1);
    // The fourth retry failed too: "e-mail failed", and the Scheduler stops.
    expect(await due()).toMatchObject({
      email_status: 'failed',
      email_attempts: 5,
      next_email_attempt_at: null,
    });
    clock.advance({ hours: 5 });
    expect(await rewards.retryFailedEmails()).toBe(0);
    const after = await api().get('/api/v1/me/coupons').set('Authorization', s.auth);
    expect(after.body[0]).toMatchObject({ id: redeemed.body.id, emailStatus: 'failed' });
    // The coupon still works from the app.
    await api()
      .post(`/api/v1/me/coupons/${redeemed.body.id}/activate`)
      .set('Authorization', s.auth)
      .expect(200);
  });

  it('TC-M6-30 a successful retry sends a fresh link that works; the undelivered first link never does (EIR-013, SDS 6.6.7)', async () => {
    const s = await student(100);
    email.failNext(1);
    const sentBefore = email.sent.length;
    const redeemed = await api()
      .post(`/api/v1/coupon-offers/${OFFER_30}/redeem`)
      .set('Authorization', s.auth);
    expect(redeemed.body.emailStatus).toBe('pending');
    expect(email.sent.length).toBe(sentBefore);
    clock.advance({ minutes: 1 });
    expect(await rewards.retryFailedEmails()).toBe(1);
    expect(email.sent.length).toBe(sentBefore + 1);
    const token = lastLinkToken();
    const view = await api().get(`/api/v1/coupons/by-token/${token}`);
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({
      id: redeemed.body.id,
      emailStatus: 'sent',
      status: 'issued',
    });
  });

  // ------------------------------------------------------------------ PB-27 activation

  it('TC-M6-31 activates once from the app and starts a 5-minute timer that a second tap never restarts (RWD-017, RWD-019)', async () => {
    const s = await student(100);
    const c = (
      await api().post(`/api/v1/coupon-offers/${OFFER_30}/redeem`).set('Authorization', s.auth)
    ).body;
    clock.advance({ minutes: 30 });
    const activatedAt = clock.now().toISOString();
    const first = await api()
      .post(`/api/v1/me/coupons/${c.id}/activate`)
      .set('Authorization', s.auth);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      status: 'active',
      activatedAt,
      expiresAt: new Date(clock.now().getTime() + 5 * 60_000).toISOString(),
      code: c.code,
      reward: 'Free Turkish coffee',
      venueName: 'Sample Quiet Corner (Zamalek)',
    });
    clock.advance({ minutes: 2 });
    const again = await api()
      .post(`/api/v1/me/coupons/${c.id}/activate`)
      .set('Authorization', s.auth);
    expect(again.status).toBe(200);
    expect(again.body.activatedAt).toBe(activatedAt);
    // Two taps at the same moment on a fresh coupon: one timer.
    const c2 = (
      await api().post(`/api/v1/coupon-offers/${OFFER_30}/redeem`).set('Authorization', s.auth)
    ).body;
    const [x, y] = await Promise.all([
      api().post(`/api/v1/me/coupons/${c2.id}/activate`).set('Authorization', s.auth),
      api().post(`/api/v1/me/coupons/${c2.id}/activate`).set('Authorization', s.auth),
    ]);
    expect(x.body.activatedAt).toBe(y.body.activatedAt);
  });

  it('TC-M6-32 expires 5 minutes after activation, never reactivates and never refunds (RWD-018, RWD-020)', async () => {
    const s = await student(100);
    const c = (
      await api().post(`/api/v1/coupon-offers/${OFFER_30}/redeem`).set('Authorization', s.auth)
    ).body;
    await api().post(`/api/v1/me/coupons/${c.id}/activate`).set('Authorization', s.auth);
    const status = async () =>
      (await api().get('/api/v1/me/coupons').set('Authorization', s.auth)).body.find(
        (x: { id: string }) => x.id === c.id,
      ).status;

    clock.advance({ minutes: 4, seconds: 59 });
    expect(await status()).toBe('active');
    expect(await rewards.expireCoupons()).toBe(0);
    clock.advance({ seconds: 1 });
    // Checked on read before the Scheduler has run...
    expect(await status()).toBe('expired');
    const again = await api()
      .post(`/api/v1/me/coupons/${c.id}/activate`)
      .set('Authorization', s.auth);
    expect(again.status).toBe(409);
    expect(again.body.details.reason).toBe('COUPON_EXPIRED');
    expect(again.body.message).toMatch(/activated only once.*not refunded/);
    // ...and stored by the Scheduler job (PB-38).
    const c2 = (
      await api().post(`/api/v1/coupon-offers/${OFFER_30}/redeem`).set('Authorization', s.auth)
    ).body;
    await api().post(`/api/v1/me/coupons/${c2.id}/activate`).set('Authorization', s.auth);
    clock.advance({ minutes: 4, seconds: 59 });
    await rewards.expireCoupons();
    const stored = async () =>
      (await db.query(`SELECT status FROM coupons WHERE id = $1`, [c2.id]))[0].status;
    expect(await stored()).toBe('active');
    clock.advance({ seconds: 1 });
    expect(await rewards.expireCoupons()).toBeGreaterThanOrEqual(1);
    expect(await stored()).toBe('expired');
    expect(await balanceOf(s.id)).toBe(40); // 100 - 30 - 30, nothing refunded
  });

  it('TC-M6-33 the e-mail link page reads the coupon without activating it; Activate on the page starts the timer (RWD-017)', async () => {
    const s = await student(100);
    const c = (
      await api().post(`/api/v1/coupon-offers/${OFFER_30}/redeem`).set('Authorization', s.auth)
    ).body;
    const token = lastLinkToken();
    for (let i = 0; i < 3; i += 1) {
      const view = await api().get(`/api/v1/coupons/by-token/${token}`);
      expect(view.status).toBe(200);
      expect(view.body).toMatchObject({ id: c.id, status: 'issued', activatedAt: null });
    }
    const activated = await api().post(`/api/v1/coupons/by-token/${token}/activate`);
    expect(activated.status).toBe(200);
    expect(activated.body).toMatchObject({ id: c.id, status: 'active' });
    // The app sees the same running coupon.
    const mine = await api().get('/api/v1/me/coupons').set('Authorization', s.auth);
    expect(mine.body[0]).toMatchObject({ id: c.id, status: 'active' });

    for (const bad of ['short', 'A'.repeat(22), `${token.slice(0, 21)}!`]) {
      const res = await api().get(`/api/v1/coupons/by-token/${encodeURIComponent(bad)}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/activation link is not valid/);
      expect(
        (await api().post(`/api/v1/coupons/by-token/${encodeURIComponent(bad)}/activate`)).status,
      ).toBe(404);
    }
    const page = await api().get('/coupon/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('coupon.js');
  });

  it('TC-M6-34 refuses the rewards endpoints without sign-in (SEC-001, FR-007)', async () => {
    for (const [method, path] of [
      ['get', '/api/v1/me/points'],
      ['get', '/api/v1/me/coupons'],
      ['post', `/api/v1/coupon-offers/${OFFER_30}/redeem`],
      ['post', `/api/v1/me/coupons/${OFFER_30}/activate`],
    ] as const) {
      const res = await api()[method](path);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    }
  });

  // ------------------------------------------------------------------ PB-38 expiry and purge

  it('TC-M6-35 deletes surveys older than 90 days with their records but keeps the points, and expires stale receipt codes (PRIV-013, QR-007, QR-009)', async () => {
    const s = await student();
    present.add(`${s.id}:${DOKKI}`);
    clock.set('2026-08-01T12:00:00+03:00');
    const old = await survey(s.id, DOKKI);
    await db.query(
      `INSERT INTO dynamic_records (venue_id, condition_type, value, source_type, recorded_at, survey_id)
       VALUES ($1, 'crowd', 1, 'in_app_survey', $2, $3)`,
      [DOKKI, clock.now(), old.stored.id],
    );
    const surveys: ISurvey = app.get(SURVEYS);

    // 89 days later: kept. 91 days later: gone, with its records; the points stay.
    clock.set(new Date(clock.now().getTime() + 89 * 86_400_000));
    const recent = await survey(s.id, DOKKI);
    expect(await surveys.purgeExpired()).toBe(0);
    clock.set(new Date(new Date('2026-08-01T12:00:00+03:00').getTime() + 91 * 86_400_000));
    expect(await surveys.purgeExpired()).toBeGreaterThanOrEqual(1);
    const ids = (await db.query(`SELECT id FROM surveys WHERE user_id = $1`, [s.id])).map(
      (r: { id: string }) => r.id,
    );
    expect(ids).toEqual([recent.stored.id]);
    const [{ n }] = await db.query(
      `SELECT count(*)::int AS n FROM dynamic_records WHERE survey_id = $1`,
      [old.stored.id],
    );
    expect(n).toBe(0);
    const ledger = await db.query(
      `SELECT delta, survey_id FROM points_ledger WHERE user_id = $1 ORDER BY created_at`,
      [s.id],
    );
    expect(ledger[0]).toEqual({ delta: 30, survey_id: null });
    expect(await balanceOf(s.id)).toBe(60);

    // Receipt codes (QR-007: 10 minutes after the scan; QR-009: 24 hours unscanned).
    clock.set('2026-11-24T10:00:00+02:00');
    const now = clock.now().getTime();
    const minutesAgo = (m: number) => new Date(now - m * 60_000);
    const codes: [string, string, Date, Date | null][] = [
      ['scanned-9m59s', 'scanned', minutesAgo(30), new Date(now - (9 * 60 + 59) * 1000)],
      ['scanned-10m', 'scanned', minutesAgo(30), minutesAgo(10)],
      ['unused-23h59m', 'unused', minutesAgo(23 * 60 + 59), null],
      ['unused-24h', 'unused', minutesAgo(24 * 60), null],
      ['used-old', 'used', minutesAgo(48 * 60), minutesAgo(47 * 60)],
    ];
    for (const [token, status, createdAt, firstScanAt] of codes) {
      await db.query(
        `INSERT INTO receipt_codes (token, venue_id, created_at, first_scan_at, status, scanned_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [token, ZAMALEK, createdAt, firstScanAt, status, firstScanAt ? s.id : null],
      );
    }
    const receiptCodes: IReceiptCodes = app.get(RECEIPT_CODES);
    expect(await receiptCodes.expireStale()).toBe(2);
    const rows: { token: string; status: string }[] = await db.query(
      `SELECT token, status FROM receipt_codes ORDER BY token`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.token, r.status]))).toEqual({
      'scanned-10m': 'expired',
      'scanned-9m59s': 'scanned',
      'unused-23h59m': 'unused',
      'unused-24h': 'expired',
      'used-old': 'used',
    });
  });
});
