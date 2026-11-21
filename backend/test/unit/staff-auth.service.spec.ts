import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Repository } from 'typeorm';
import { AppError } from '../../src/common/errors/app-error';
import {
  DomainEvent,
  type SignInFailedEvent,
  type StaffActionEvent,
} from '../../src/common/events/domain-events';
import type { UserEntity } from '../../src/db/entities';
import { staffPasswordProblem } from '../../src/db/staff-create';
import { StaffAuthService } from '../../src/modules/accounts/staff-auth.service';
import { FakeClock } from '../../src/modules/clock/fake-clock';

/**
 * TC-M1-59..TC-M1-65: staff sign-in with re-authentication (PB-32, FR-035, UC-17).
 * No database: users are an in-memory list; time comes from FakeClock.
 * The HTTP side (guard, rate limit, audit rows) is in test/int/staff-console.int-spec.ts.
 */
const SECRET = 'unit-test-access-secret';
const ENV: Record<string, unknown> = { JWT_ACCESS_SECRET: SECRET, STAFF_SESSION_TTL_SECONDS: 900 };
const PASSWORD = 'staffpass123';
const HASH = bcrypt.hashSync(PASSWORD, 4);

function user(id: string, email: string, role: UserEntity['role']): UserEntity {
  return {
    id,
    email,
    displayName: email.split('@')[0],
    role,
    suspended: false,
    passwordHash: HASH,
  } as UserEntity;
}

function setup() {
  const clock = new FakeClock('2026-11-21T10:00:00Z');
  const users = [
    user('a1', 'admin@studyspot.test', 'admin'),
    user('m1', 'mod@studyspot.test', 'moderator'),
    user('u1', 'student@studyspot.test', 'user'),
  ];
  const repo = {
    findOne: async ({ where }: { where: Partial<UserEntity> }) =>
      users.find((u) => Object.entries(where).every(([k, v]) => u[k as keyof UserEntity] === v)) ??
      null,
  } as unknown as Repository<UserEntity>;
  const failures: SignInFailedEvent[] = [];
  const actions: StaffActionEvent[] = [];
  const events = {
    emit: (name: string, e: unknown) => {
      if (name === DomainEvent.SignInFailed) failures.push(e as SignInFailedEvent);
      if (name === DomainEvent.StaffAction) actions.push(e as StaffActionEvent);
    },
  } as unknown as EventEmitter2;
  const config = {
    get: (k: string, d?: unknown) => ENV[k] ?? d,
    getOrThrow: (k: string) => ENV[k],
  } as unknown as ConfigService;
  const jwt = new JwtService({});
  const staff = new StaffAuthService(repo, jwt, config, events, clock);
  return { staff, clock, users, failures, actions, jwt };
}

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => 'OK',
    (e: unknown) => (e instanceof AppError ? e.code : String(e)),
  );

describe('Staff sign-in (PB-32, UC-17)', () => {
  it('TC-M1-59 an administrator and a moderator get a 15-minute staff token, logged as a staff action', async () => {
    const { staff, actions } = setup();
    for (const email of ['admin@studyspot.test', 'MOD@studyspot.test ']) {
      const s = await staff.signIn({ email, password: PASSWORD }, { ip: '10.0.0.1' });
      expect(s.expiresIn).toBe(900);
      expect(s.expiresAt).toBe('2026-11-21T10:15:00.000Z');
      expect(s.staffToken.split('.')).toHaveLength(3);
    }
    expect(actions.map((a) => [a.action, a.target])).toEqual([
      ['staff.sign_in', 'admin@studyspot.test'],
      ['staff.sign_in', 'mod@studyspot.test'],
    ]);
  });

  it('TC-M1-60 a wrong password or unknown e-mail gives the same 401, logged on the staff channel (SEC-010)', async () => {
    const { staff, failures } = setup();
    expect(
      await codeOf(staff.signIn({ email: 'admin@studyspot.test', password: 'nope12345' }, {})),
    ).toBe('UNAUTHENTICATED');
    expect(
      await codeOf(staff.signIn({ email: 'ghost@studyspot.test', password: PASSWORD }, {})),
    ).toBe('UNAUTHENTICATED');
    expect(failures.map((f) => [f.reason, f.channel])).toEqual([
      ['wrong_password', 'staff'],
      ['unknown_email', 'staff'],
    ]);
  });

  it('TC-M1-61 a student account is refused with 403 and the refusal is logged (UC-17 alternative flow)', async () => {
    const { staff, failures } = setup();
    expect(
      await codeOf(staff.signIn({ email: 'student@studyspot.test', password: PASSWORD }, {})),
    ).toBe('NOT_ALLOWED');
    expect(failures).toMatchObject([
      { email: 'student@studyspot.test', reason: 'not_staff', channel: 'staff' },
    ]);
  });

  it('TC-M1-62 a suspended staff account cannot sign in (FR-038)', async () => {
    const { staff, users, failures } = setup();
    users[0].suspended = true;
    expect(
      await codeOf(staff.signIn({ email: 'admin@studyspot.test', password: PASSWORD }, {})),
    ).toBe('NOT_ALLOWED');
    expect(failures[0].reason).toBe('suspended');
  });

  it('TC-M1-63 session boundary: the token works at 14 min 59 s and is refused at 15 min', async () => {
    const { staff, clock } = setup();
    const { staffToken } = await staff.signIn(
      { email: 'admin@studyspot.test', password: PASSWORD },
      {},
    );
    clock.advance({ minutes: 14, seconds: 59 });
    expect((await staff.verifyStaffToken(staffToken)).role).toBe('admin');
    clock.advance({ seconds: 1 });
    expect(await codeOf(staff.verifyStaffToken(staffToken))).toBe('UNAUTHENTICATED');
  });

  it('TC-M1-64 an app access token is never accepted as a staff token (re-authentication, FR-035)', async () => {
    const { staff, jwt } = setup();
    // Exactly what AuthService signs for an admin who signed in to the app.
    const appToken = await jwt.signAsync(
      { sub: 'a1', email: 'admin@studyspot.test', name: 'admin', role: 'admin' },
      { secret: SECRET, expiresIn: 900 },
    );
    expect(await codeOf(staff.verifyStaffToken(appToken))).toBe('UNAUTHENTICATED');
    // And the reverse: a staff token does not verify with the app key.
    const { staffToken } = await staff.signIn(
      { email: 'admin@studyspot.test', password: PASSWORD },
      {},
    );
    await expect(jwt.verifyAsync(staffToken, { secret: SECRET })).rejects.toThrow();
  });

  it('TC-M1-65 losing the staff role or being suspended ends the staff session at once', async () => {
    const { staff, users } = setup();
    const { staffToken } = await staff.signIn(
      { email: 'mod@studyspot.test', password: PASSWORD },
      {},
    );
    users[1].role = 'user';
    expect(await codeOf(staff.verifyStaffToken(staffToken))).toBe('NOT_ALLOWED');
    users[1].role = 'moderator';
    users[1].suspended = true;
    expect(await codeOf(staff.verifyStaffToken(staffToken))).toBe('NOT_ALLOWED');
  });

  it('TC-M1-69 staff passwords made with staff:create: 9 characters refused, 10 with a letter and digit accepted', () => {
    expect(staffPasswordProblem('abcdefgh1')).toBe('Use at least 10 characters.');
    expect(staffPasswordProblem('abcdefghi1')).toBeNull();
    expect(staffPasswordProblem('abcdefghij')).toBe('Include at least one digit.');
    expect(staffPasswordProblem('1234567890')).toBe('Include at least one letter.');
  });
});
