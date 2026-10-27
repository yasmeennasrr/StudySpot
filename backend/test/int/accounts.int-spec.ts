/**
 * Integration tests for Accounts on a real PostgreSQL database (PB-03, PB-04).
 * TC-M2-05 and TC-M2-07; the other M2 cases are unit tests in test/unit/auth.service.spec.ts.
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
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL;

describe('Accounts on a real database (integration)', () => {
  let app: INestApplication;
  let db: DataSource;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('TC-M2-05 stores a bcrypt hash, never the password, and a hashed refresh token (SEC-002)', async () => {
    const res = await api().post('/api/v1/auth/register').send({
      email: 'Hash.Check@StudySpot.test',
      password: 'secret123',
      displayName: 'Hash Check',
      termsAccepted: true,
    });
    expect(res.status).toBe(201);

    const [user] = await db.query(
      `SELECT email, password_hash, terms_accepted_at FROM users WHERE id = $1`,
      [res.body.user.id],
    );
    expect(user.email).toBe('hash.check@studyspot.test');
    expect(user.password_hash).toMatch(/^\$2b\$12\$/);
    expect(user.password_hash).not.toContain('secret123');
    expect(await bcrypt.compare('secret123', user.password_hash)).toBe(true);
    expect(user.terms_accepted_at).not.toBeNull();

    const sessions = await db.query(`SELECT refresh_token_hash FROM sessions WHERE user_id = $1`, [
      res.body.user.id,
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].refresh_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sessions[0].refresh_token_hash).not.toBe(res.body.refreshToken);
  });

  it('TC-M2-07 a failed sign-in is written to the audit log with its reason (SEC-010)', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'hash.check@studyspot.test', password: 'wrong1234' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('The e-mail or password is not correct.');

    // The audit listener runs asynchronously: wait for its row.
    let rows: { details: { reason: string } }[] = [];
    for (let i = 0; i < 20 && rows.length === 0; i++) {
      rows = await db.query(`SELECT details FROM audit_log WHERE action = 'auth.sign_in_failed'`);
      if (rows.length === 0) await new Promise((r) => setTimeout(r, 50));
    }
    expect(rows.map((r) => r.details.reason)).toEqual(['wrong_password']);
  });
});
