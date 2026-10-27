import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindOperator, type Repository } from 'typeorm';
import { AppError } from '../../src/common/errors/app-error';
import { ErrorCode } from '../../src/common/errors/error-codes';
import { DomainEvent, type SignInFailedEvent } from '../../src/common/events/domain-events';
import type { SessionEntity, UserEntity } from '../../src/db/entities';
import { AuthService, hashRefreshToken } from '../../src/modules/accounts/auth.service';
import { RegisterDto } from '../../src/modules/accounts/dto/auth.dto';
import { FakeClock } from '../../src/modules/clock/fake-clock';

/**
 * TC-M2-01..TC-M2-14 (except 05): accounts rules without a database (PB-03, PB-04, PB-40).
 * The users and sessions tables are in-memory fakes; time comes from FakeClock.
 * TC-M2-05 and TC-M2-07 are also checked on a real database in test/int/accounts.int-spec.ts.
 */
const SECRET = 'unit-test-access-secret';
const ENV: Record<string, unknown> = {
  JWT_ACCESS_SECRET: SECRET,
  JWT_ACCESS_TTL_SECONDS: 900,
  SESSION_INACTIVITY_DAYS: 14,
};

/** Does a stored value match a `where` value? Supports IsNull(). */
function matches(value: unknown, wanted: unknown): boolean {
  if (wanted instanceof FindOperator && wanted.type === 'isNull') return value == null;
  return value === wanted;
}

/** Just enough of a TypeORM Repository for AuthService, backed by an array. */
function fakeRepo<T extends { id: string }>(rows: T[], defaults: () => Partial<T>) {
  const find = (where: Partial<Record<keyof T, unknown>>) =>
    rows.filter((r) => Object.entries(where).every(([k, v]) => matches(r[k as keyof T], v)));
  return {
    create: (data: Partial<T>) => ({ ...defaults(), ...data }) as T,
    save: async (row: T) => {
      const saved = { ...row, id: row.id ?? randomUUID() };
      rows.push(saved);
      return saved;
    },
    exists: async ({ where }: { where: Partial<T> }) => find(where).length > 0,
    findOne: async ({ where }: { where: Partial<T> }) => find(where)[0] ?? null,
    update: async (where: Partial<T>, patch: Partial<T>) => {
      const hit = find(where);
      hit.forEach((r) => Object.assign(r, patch));
      return { affected: hit.length };
    },
  } as unknown as Repository<T>;
}

function setup() {
  const clock = new FakeClock('2026-10-27T10:00:00Z');
  const users: UserEntity[] = [];
  const sessions: SessionEntity[] = [];
  const userRepo = fakeRepo(users, () => ({
    role: 'user' as const,
    suspended: false,
    pointsBalance: 0,
    createdAt: clock.now(),
  }));
  const sessionRepo = fakeRepo(sessions, () => ({ createdAt: clock.now() }));
  // findOne with relations: { user: true } needs the user attached.
  const sessionFindOne = sessionRepo.findOne.bind(sessionRepo);
  sessionRepo.findOne = (async (opts: Parameters<typeof sessionFindOne>[0]) => {
    const s = await sessionFindOne(opts);
    return s ? Object.assign(s, { user: users.find((u) => u.id === s.userId) }) : null;
  }) as typeof sessionRepo.findOne;

  const failures: SignInFailedEvent[] = [];
  const events = {
    emit: (name: string, e: SignInFailedEvent) =>
      name === DomainEvent.SignInFailed && failures.push(e),
  } as unknown as EventEmitter2;
  const config = {
    get: (k: string, d?: unknown) => ENV[k] ?? d,
    getOrThrow: (k: string) => ENV[k],
  } as unknown as ConfigService;
  const jwt = new JwtService({});
  const auth = new AuthService(userRepo, sessionRepo, jwt, config, events, clock);
  return { auth, clock, users, sessions, failures, jwt };
}

const NEW_USER = {
  email: 'Student@Example.com',
  password: 'secret123',
  displayName: 'Student',
  termsAccepted: true as const,
};

async function dtoErrors(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(RegisterDto, body));
  return errors.map((e) => e.property);
}

const codeOf = async (p: Promise<unknown>) =>
  p.then(
    () => 'OK',
    (e: unknown) => (e instanceof AppError ? e.code : String(e)),
  );

describe('Register (PB-03, UC-01)', () => {
  it('TC-M2-01 password length boundary: 7 characters refused, 8 accepted (SEC-002)', async () => {
    expect(await dtoErrors({ ...NEW_USER, password: 'abcdef1' })).toEqual(['password']);
    expect(await dtoErrors({ ...NEW_USER, password: 'abcdefg1' })).toEqual([]);
  });

  it('TC-M2-02 password needs letters and digits: letters only or digits only refused', async () => {
    expect(await dtoErrors({ ...NEW_USER, password: 'abcdefgh' })).toEqual(['password']);
    expect(await dtoErrors({ ...NEW_USER, password: '12345678' })).toEqual(['password']);
    expect(await dtoErrors({ ...NEW_USER, password: 'abcd1234' })).toEqual([]);
  });

  it('TC-M2-03 terms must be accepted: false or missing refused (FR-001, PRIV-011)', async () => {
    expect(await dtoErrors({ ...NEW_USER, termsAccepted: false })).toEqual(['termsAccepted']);
    const { termsAccepted: _t, ...noTerms } = NEW_USER;
    expect(await dtoErrors(noTerms)).toEqual(['termsAccepted']);
  });

  it('TC-M2-04 an e-mail already used, in other capitals, is refused with CONFLICT', async () => {
    const { auth, users } = setup();
    await auth.register(NEW_USER);
    expect(users[0].email).toBe('student@example.com');
    expect(await codeOf(auth.register({ ...NEW_USER, email: 'STUDENT@example.COM' }))).toBe(
      ErrorCode.CONFLICT,
    );
    expect(users).toHaveLength(1);
  });
});

describe('Sign in (PB-04, UC-02)', () => {
  it('TC-M2-06 right password gives a signed access token and a stored refresh session', async () => {
    const { auth, sessions, jwt } = setup();
    await auth.register(NEW_USER);
    const tokens = await auth.login({ email: 'student@example.com', password: 'secret123' }, {});

    const payload = await jwt.verifyAsync(tokens.accessToken, { secret: SECRET });
    expect(payload.sub).toBe(tokens.user.id);
    expect(tokens.expiresIn).toBe(900);
    expect(sessions.map((s) => s.refreshTokenHash)).toContain(
      hashRefreshToken(tokens.refreshToken),
    );
    expect(await auth.verifyAccessToken(tokens.accessToken)).toEqual(tokens.user);
  });

  it('TC-M2-07 wrong password and unknown e-mail get the same answer and are both logged (SEC-010)', async () => {
    const { auth, failures } = setup();
    await auth.register(NEW_USER);
    const answer = (p: Promise<unknown>) =>
      p.catch((e: AppError) => [e.code, e.message].join(': '));
    const messages = [
      await answer(
        auth.login({ email: 'student@example.com', password: 'wrong1234' }, { ip: '1.2.3.4' }),
      ),
      await answer(auth.login({ email: 'nobody@example.com', password: 'secret123' }, {})),
    ];
    expect(messages[0]).toBe(messages[1]);
    expect(messages[0]).toMatch(/^UNAUTHENTICATED/);
    expect(failures.map((f) => [f.reason, f.ip])).toEqual([
      ['wrong_password', '1.2.3.4'],
      ['unknown_email', undefined],
    ]);
  });

  it('TC-M2-08 a suspended user with the right password is refused and logged (FR-038)', async () => {
    const { auth, users, failures } = setup();
    await auth.register(NEW_USER);
    users[0].suspended = true;
    expect(
      await codeOf(auth.login({ email: 'student@example.com', password: 'secret123' }, {})),
    ).toBe(ErrorCode.NOT_ALLOWED);
    expect(failures.map((f) => f.reason)).toEqual(['suspended']);
  });

  it('TC-M2-09 a user suspended after signing in is refused on the next request and refresh', async () => {
    const { auth, users } = setup();
    const tokens = await auth.register(NEW_USER);
    users[0].suspended = true;
    expect(await codeOf(auth.verifyAccessToken(tokens.accessToken))).toBe(ErrorCode.NOT_ALLOWED);
    expect(await codeOf(auth.refresh(tokens.refreshToken))).toBe(ErrorCode.UNAUTHENTICATED);
  });
});

describe('Tokens and sessions (PB-04, SEC-001, SEC-009)', () => {
  it('TC-M2-10 inactivity boundary: refresh works at 13 d 23 h idle, refused after 14 d', async () => {
    const { auth, clock } = setup();
    const first = await auth.register(NEW_USER);

    clock.advance({ days: 13, hours: 23 });
    const second = await auth.refresh(first.refreshToken);
    expect(second.user.email).toBe('student@example.com');

    clock.advance({ days: 14, minutes: 1 });
    expect(await codeOf(auth.refresh(second.refreshToken))).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('TC-M2-11 a refresh token works once: the old one is refused after rotation', async () => {
    const { auth } = setup();
    const first = await auth.register(NEW_USER);
    const second = await auth.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(await codeOf(auth.refresh(first.refreshToken))).toBe(ErrorCode.UNAUTHENTICATED);
    expect(await codeOf(auth.refresh(second.refreshToken))).toBe('OK');
  });

  it('TC-M2-12 after sign-out the session cannot be refreshed; signing out twice is fine (FR-003)', async () => {
    const { auth, sessions } = setup();
    const tokens = await auth.register(NEW_USER);
    await auth.logout(tokens.refreshToken);
    expect(sessions[0].revokedAt).toEqual(new Date('2026-10-27T10:00:00Z'));
    await expect(auth.logout(tokens.refreshToken)).resolves.toBeUndefined();
    expect(await codeOf(auth.refresh(tokens.refreshToken))).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it.each([
    ['the old stub token', 'stub.00000000-0000-4000-8000-000000000001'],
    ['a made-up string', 'not-a-token'],
    ['an empty token', ''],
  ])('TC-M2-13 %s is refused as UNAUTHENTICATED (SEC-001)', async (_name, token) => {
    const { auth } = setup();
    expect(await codeOf(auth.verifyAccessToken(token))).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('TC-M2-13 an expired access token is refused (15-minute lifetime)', async () => {
    const { auth, users, jwt } = setup();
    await auth.register(NEW_USER);
    const expired = await jwt.signAsync(
      { sub: users[0].id, exp: Math.floor(Date.now() / 1000) - 1 },
      { secret: SECRET },
    );
    expect(await codeOf(auth.verifyAccessToken(expired))).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('TC-M2-14 a token signed with another secret is refused, even for a real user', async () => {
    const { auth, users, jwt } = setup();
    await auth.register(NEW_USER);
    const forged = await jwt.signAsync(
      { sub: users[0].id, role: 'admin' },
      { secret: 'someone-elses-secret', expiresIn: 900 },
    );
    expect(await codeOf(auth.verifyAccessToken(forged))).toBe(ErrorCode.UNAUTHENTICATED);
  });
});
