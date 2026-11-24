import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import {
  DomainEvent,
  type SignInFailedEvent,
  type StaffActionEvent,
} from '../../common/events/domain-events';
import {
  CLOCK,
  type AuthUser,
  type IClock,
  type IStaffAuth,
  type LoginInput,
  type StaffSession,
  type UserRole,
} from '../../contracts';
import { UserEntity } from '../../db/entities';

/** Roles that may open a staff session (FR-035). */
export const STAFF_ROLES: readonly UserRole[] = ['admin', 'moderator'];

const BAD_CREDENTIALS = 'The e-mail or password is not correct.';
const NOT_STAFF = 'This account does not have staff access.';
const SUSPENDED = 'This account has been suspended.';
const STAFF_SESSION_ENDED = 'Your staff session has ended. Enter your password again.';

/** Compared against when the e-mail is unknown, so both cases take the same time. */
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);

interface StaffTokenPayload {
  sub: string;
  role: UserRole;
  typ: 'staff';
  iat: number;
  exp: number;
}

/**
 * Staff sign-in with re-authentication (PB-32, FR-035, UC-17). Owner: M1.
 *
 * - A staff session always starts from a fresh e-mail and password. An app access
 *   token or refresh token can never open one, and a staff token cannot be refreshed.
 * - Staff tokens are signed with a key derived from JWT_ACCESS_SECRET that app tokens
 *   do not use, so neither kind of token is accepted in place of the other.
 * - Every refusal is written to the security log (SEC-010); every sign-in and
 *   sign-out is a staff action (FR-044).
 * - Time comes from IClock (iat/exp and the expiry check), so tests can move it.
 */
@Injectable()
export class StaffAuthService implements IStaffAuth {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async signIn(input: LoginInput, context: { ip?: string }): Promise<StaffSession> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email } });
    const passwordOk = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordOk) {
      this.refused(email, user ? 'wrong_password' : 'unknown_email', context.ip);
      throw AppError.unauthenticated(BAD_CREDENTIALS);
    }
    if (user.suspended) {
      this.refused(email, 'suspended', context.ip);
      throw AppError.notAllowed(SUSPENDED);
    }
    if (!STAFF_ROLES.includes(user.role)) {
      // UC-17 alternative flow: not a staff account, refused and logged.
      this.refused(email, 'not_staff', context.ip);
      throw AppError.notAllowed(NOT_STAFF);
    }

    const ttl = this.ttlSeconds();
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const payload: StaffTokenPayload = {
      sub: user.id,
      role: user.role,
      typ: 'staff',
      iat,
      exp: iat + ttl,
    };
    const staffToken = await this.jwt.signAsync(payload, { secret: this.secret() });
    this.staffAction(user.id, 'staff.sign_in', email, { role: user.role, ip: context.ip ?? null });
    return {
      staffToken,
      expiresIn: ttl,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      user: toAuthUser(user),
    };
  }

  async verifyStaffToken(staffToken: string): Promise<AuthUser & { sessionExpiresAt: string }> {
    let payload: StaffTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<StaffTokenPayload>(staffToken, {
        secret: this.secret(),
        clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
      });
    } catch {
      throw AppError.unauthenticated(STAFF_SESSION_ENDED);
    }
    if (payload.typ !== 'staff') throw AppError.unauthenticated(STAFF_SESSION_ENDED);
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) throw AppError.unauthenticated(STAFF_SESSION_ENDED);
    if (user.suspended) throw AppError.notAllowed(SUSPENDED);
    // A role removed during the session takes effect immediately.
    if (!STAFF_ROLES.includes(user.role)) throw AppError.notAllowed(NOT_STAFF);
    return { ...toAuthUser(user), sessionExpiresAt: new Date(payload.exp * 1000).toISOString() };
  }

  async signOut(user: AuthUser): Promise<void> {
    this.staffAction(user.id, 'staff.sign_out', user.email);
  }

  private ttlSeconds(): number {
    return Number(this.config.get('STAFF_SESSION_TTL_SECONDS', 900));
  }

  /** A separate signing key for staff tokens, derived from the app secret. */
  private secret(): string {
    return `${this.config.getOrThrow<string>('JWT_ACCESS_SECRET')}:staff-console`;
  }

  private refused(email: string, reason: SignInFailedEvent['reason'], ip?: string): void {
    const event: SignInFailedEvent = { email, reason, ip, at: this.clock.now(), channel: 'staff' };
    this.events.emit(DomainEvent.SignInFailed, event);
  }

  private staffAction(
    staffUserId: string,
    action: string,
    target: string,
    details?: Record<string, unknown>,
  ): void {
    const event: StaffActionEvent = { staffUserId, action, target, at: this.clock.now(), details };
    this.events.emit(DomainEvent.StaffAction, event);
  }
}

function toAuthUser(user: UserEntity): AuthUser {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}
