import { Body, Controller, Get, INestApplication, Module, Post, Query } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsString, Length, Max, Min } from 'class-validator';
import request from 'supertest';
import { AdapterUnavailableError, AppError } from '../../src/common/errors/app-error';
import { AllExceptionsFilter } from '../../src/common/errors/all-exceptions.filter';
import { createValidationPipe } from '../../src/common/http/validation';
import { LoggingModule } from '../../src/common/logging/logging.module';
import { configureApp } from '../../src/main';

class ProbeDto {
  @IsEmail() email: string;
  @IsString() @Length(2, 30) name: string;
}

class RangeQuery {
  @Type(() => Number) @IsInt() @Min(100) @Max(5000) radius: number;
}

@Controller('probe')
class ProbeController {
  @Post() create(@Body() dto: ProbeDto) {
    return dto;
  }
  @Get('range') range(@Query() q: RangeQuery) {
    return q;
  }
  @Get('missing') missing() {
    throw AppError.notFound('Nothing here.');
  }
  @Get('maps-down') mapsDown() {
    throw new AdapterUnavailableError('maps', 'timeout');
  }
  @Get('crash') crash() {
    throw new Error('secret internals');
  }
}

/**
 * The real API Layer (helmet, CORS, prefix, validation pipe, error filter, request IDs,
 * rate limiting) around a probe controller, with no database. TC-M1-08..TC-M1-17.
 */
describe('API layer (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    @Module({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ LOG_LEVEL: 'silent', NODE_ENV: 'test' })],
        }),
        LoggingModule,
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
      ],
      controllers: [ProbeController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_PIPE, useFactory: createValidationPipe },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    })
    class ProbeAppModule {}

    const moduleRef = await Test.createTestingModule({ imports: [ProbeAppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  // Each test uses its own client IP so the 5-per-minute limit only bites in the rate-limit test.
  let ip = 10;
  const api = () => {
    const agent = request(app.getHttpServer());
    const forwarded = `10.0.0.${ip++}`;
    return {
      get: (url: string) => agent.get(url).set('X-Forwarded-For', forwarded),
      post: (url: string) => agent.post(url).set('X-Forwarded-For', forwarded),
    };
  };

  it('TC-M1-08 accepts valid input under /api/v1', async () => {
    const res = await api().post('/api/v1/probe').send({ email: 'a@b.co', name: 'Sa' });
    expect(res.status).toBe(201);
  });

  it('TC-M1-09 rejects unknown fields with INVALID_INPUT and lists every field problem', async () => {
    const res = await api().post('/api/v1/probe').send({ email: 'nope', name: 'S', admin: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    const fields = res.body.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(['admin', 'email', 'name']);
    expect(res.body.message).toMatch(/^Please check /);
  });

  it.each([
    [99, 400],
    [100, 200],
    [5000, 200],
    [5001, 400],
  ])('TC-M1-10 boundary values: radius=%i -> %i', async (radius, status) => {
    const res = await api().get(`/api/v1/probe/range?radius=${radius}`);
    expect(res.status).toBe(status);
    if (status === 200) expect(res.body.radius).toBe(radius); // converted from query string to number
  });

  it('TC-M1-11 returns NOT_FOUND bodies for service errors and unknown routes', async () => {
    const own = await api().get('/api/v1/probe/missing');
    expect(own.status).toBe(404);
    expect(own.body).toMatchObject({ code: 'NOT_FOUND', message: 'Nothing here.' });
    const route = await api().get('/api/v1/does-not-exist');
    expect(route.status).toBe(404);
    expect(route.body.code).toBe('NOT_FOUND');
  });

  it('TC-M1-12 answers 503 UNAVAILABLE when an outside service fails (EIR-011)', async () => {
    const res = await api().get('/api/v1/probe/maps-down');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'UNAVAILABLE', details: { service: 'maps' } });
  });

  it('TC-M1-13 hides internals of unexpected errors', async () => {
    const res = await api().get('/api/v1/probe/crash');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('TC-M1-14 generates a request ID, returns it in the header and in error bodies', async () => {
    const res = await api().get('/api/v1/probe/missing');
    const id = res.headers['x-request-id'];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.requestId).toBe(id);
  });

  it('TC-M1-15 reuses a safe client request ID and replaces an unsafe one', async () => {
    const safe = await api().get('/api/v1/probe/missing').set('X-Request-Id', 'demo-trace-001');
    expect(safe.headers['x-request-id']).toBe('demo-trace-001');
    const unsafe = await api().get('/api/v1/probe/missing').set('X-Request-Id', 'bad id <script>');
    expect(unsafe.headers['x-request-id']).not.toBe('bad id <script>');
  });

  it('TC-M1-16 sets security headers (helmet)', async () => {
    const res = await api().get('/api/v1/probe/missing');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('TC-M1-17 rate-limits a client after 5 requests per minute with RATE_LIMITED', async () => {
    const client = api();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await client.get('/api/v1/probe/missing')).status);
    expect(codes.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(codes[5]).toBe(429);
    const last = await client.get('/api/v1/probe/missing');
    expect(last.body.code).toBe('RATE_LIMITED');
  });
});
