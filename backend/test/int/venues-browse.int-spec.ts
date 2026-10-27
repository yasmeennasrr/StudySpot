/**
 * Integration tests for browsing every venue (GET /venues) on a real PostgreSQL + PostGIS
 * database, through the HTTP API. TC-M1-56..TC-M1-58.
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

// name, lng, lat, price level, outlets, active
const VENUES = [
  ['Zeta Corner', 31.2197, 30.0626, 3, false, true],
  ['Alpha Study Café', 31.4952, 30.0205, 1, true, true],
  ['Mid Town Books', 31.2357, 30.0444, 2, true, true],
  ['Closed Forever', 31.2585, 29.9597, 1, true, false],
] as const;

describe('Browse all venues on a real database (integration)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const admin = new DataSource(buildDataSourceOptions());
    await admin.initialize();
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await admin.runMigrations();
    for (const [name, lng, lat, price, outlets, active] of VENUES) {
      await admin.query(
        `INSERT INTO venues (name, location, price_level, outlets_available, active)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, $6)`,
        [name, lng, lat, price, outlets, active],
      );
    }
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

  it('TC-M1-56 lists every active venue A to Z with no name, area or location', async () => {
    const res = await api().get('/api/v1/venues');
    expect(res.status).toBe(200);
    expect(res.body.origin).toBeNull();
    expect(res.body.degraded).toBe(false);
    expect(res.body.items.map((v: { name: string }) => v.name)).toEqual([
      'Alpha Study Café',
      'Mid Town Books',
      'Zeta Corner',
    ]);
    for (const item of res.body.items) {
      expect(item.distanceMeters).toBeNull();
      expect(item.conditions.crowd.status).toBeDefined();
    }
  });

  it('TC-M1-57 applies the same filters as search', async () => {
    const res = await api().get('/api/v1/venues?maxPrice=2&outlets=true');
    expect(res.status).toBe(200);
    expect(res.body.items.map((v: { name: string }) => v.name)).toEqual([
      'Alpha Study Café',
      'Mid Town Books',
    ]);
  });

  it('TC-M1-58 limit boundaries 0 / 1 / 30 / 31, and maxDistance without a location', async () => {
    expect((await api().get('/api/v1/venues?limit=0')).status).toBe(400);
    const one = await api().get('/api/v1/venues?limit=1');
    expect(one.status).toBe(200);
    expect(one.body.items).toHaveLength(1);
    expect((await api().get('/api/v1/venues?limit=30')).status).toBe(200);
    expect((await api().get('/api/v1/venues?limit=31')).status).toBe(400);
    const dist = await api().get('/api/v1/venues?maxDistance=1000');
    expect(dist.status).toBe(400);
    expect(dist.body.code).toBe('INVALID_INPUT');
  });
});
