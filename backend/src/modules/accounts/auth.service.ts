import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { DomainEvent, type SignInFailedEvent } from '../../common/events/domain-events';
import {
  CLOCK,
  type AuthTokens,
  type AuthUser,
  type IAuth,
  type IClock,
  type LoginInput,
  type Profile,
  type RegisterInput,
} from '../../contracts';
import { SessionEntity, UserEntity } from '../../db/entities';

/** bcrypt work factor (SEC-002). 12 rounds is about 250 ms per hash on a laptop. */
const BCRYPT_ROUNDS = 12;

/** Hash of a random string, compared against when the e-mail is unknown (constant-time sign-in). */
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

const EMAIL_TAKEN = 'An account with this e-mail already exists. Try signing in instead.';
const BAD_CREDENTIALS = 'The e-mail or password is not correct.';
const SESSION_ENDED = 'Your session has ended. Please sign in again.';
const SUSPENDED ='This account has been suspended. Contact support if you think this is a mistake.';

/** What the access token carries. `sub` is the user id. */
interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: AuthUser['role'];
}

/** True when an insert hit the unique index on users.email (Postgres error 23505). */
function isDuplicateEmail(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driver = err.driverError as { code?: string; constraint?: string } | undefined;
  return driver?.code === '23505' && driver.constraint === 'uq_users_email';
}

/** SHA-256 of a refresh token. Only this hash is stored, never the token itself. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Accounts & Auth (SDS 6.3, PB-03, PB-04, PB-40). Replaces StubAuthService.
 *
 * - Passwords are stored as bcrypt hashes (SEC-002).
 * - Access tokens are short-lived signed JWTs (JWT_ACCESS_SECRET, JWT_ACCESS_TTL_SECONDS).
 * - Refresh tokens are random, stored as SHA-256 hashes in `sessions`, and
 *   rotated on every refresh.
 */
@Injectable()
export class AuthService implements IAuth {
  private readonly logger = new Logger('Accounts');

  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  /** PB-03, FR-001: create the account, record terms acceptance, and sign the user in. */
  async register(input: RegisterInput): Promise<AuthTokens> {
    const email = input.email.trim().toLowerCase();
    if (await this.users.exists({ where: { email } })) {
      throw AppError.conflict(EMAIL_TAKEN);
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    let user: UserEntity;
    try {
      user = await this.users.save(
        this.users.create({
          email,
          passwordHash,
          displayName: input.displayName,
          termsAcceptedAt: this.clock.now(),
        }),
      );
    } catch (err) {
      // Two registrations with the same e-mail at the same moment: the unique index decides.
      if (isDuplicateEmail(err)) throw AppError.conflict(EMAIL_TAKEN);
      throw err;
    }
    this.logger.log({ userId: user.id }, 'Account registered');
    return this.startSession(user);
  }

  /**
   * PB-04, FR-002: sign in with e-mail and password. Every failure emits
   * SignInFailed for the audit log (SEC-010); suspended accounts are refused (FR-038).
   */
  async login(input: LoginInput, context: { ip?: string }): Promise<AuthTokens> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email } });
    // Compare against a dummy hash when the e-mail is unknown, so both cases take
    // the same time and the response time does not reveal which e-mails exist.
    const passwordOk = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordOk) {
      this.signInFailed(email, user ? 'wrong_password' : 'unknown_email', context.ip);
      throw AppError.unauthenticated(BAD_CREDENTIALS);
    }
    if (user.suspended) {
      this.signInFailed(email, 'suspended', context.ip);
      throw AppError.notAllowed(SUSPENDED);
    }
    return this.startSession(user);
  }

  /**
   * PB-04: swap a refresh token for new tokens. The old refresh token stops
   * working (rotation). Sessions idle for SESSION_INACTIVITY_DAYS (14) end (SEC-009),
   * and so do sessions of suspended users (FR-038).
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const now = this.clock.now();
    const session = await this.sessions.findOne({
      where: { refreshTokenHash: hashRefreshToken(refreshToken) },
      relations: { user: true },
    });
    if (!session || session.revokedAt || !session.user) {
      throw AppError.unauthenticated(SESSION_ENDED);
    }
    if (this.isIdleTooLong(session, now) || session.user.suspended) {
      await this.sessions.update({ id: session.id }, { revokedAt: now });
      throw AppError.unauthenticated(SESSION_ENDED);
    }

    const nextToken = randomBytes(32).toString('base64url');
    // Only succeeds if nobody rotated this token in the meantime (two refreshes at once).
    const rotated = await this.sessions.update(
      { id: session.id, refreshTokenHash: session.refreshTokenHash, revokedAt: IsNull() },
      { refreshTokenHash: hashRefreshToken(nextToken), lastUsedAt: now },
    );
    if (!rotated.affected) throw AppError.unauthenticated(SESSION_ENDED);
    return this.tokensFor(session.user, nextToken);
  }

  /** PB-04, FR-003: end the session. Unknown or already-ended tokens are ignored. */
  async logout(refreshToken: string): Promise<void> {
    await this.sessions.update(
      { refreshTokenHash: hashRefreshToken(refreshToken), revokedAt: IsNull() },
      { revokedAt: this.clock.now() },
    );
  }

  /**
   * Called by AuthGuard on every protected route (SEC-001, FR-007). Checks the
   * signature and expiry, then the user row, so a suspension takes effect at once.
   */
  async verifyAccessToken(accessToken: string): Promise<AuthUser> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(accessToken, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw AppError.unauthenticated(SESSION_ENDED);
    }
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) throw AppError.unauthenticated(SESSION_ENDED);
    if (user.suspended) throw AppError.notAllowed(SUSPENDED);
    return toAuthUser(user);
  }

  /** GET /me. The id always comes from the verified access token (SEC-004). */
  async getProfile(userId: string): Promise<Profile> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw AppError.notFound('Your account could not be found. Please sign in again.');
    return {
      ...toAuthUser(user),
      termsAcceptedAt: user.termsAcceptedAt.toISOString(),
      createdAt: user.createdAt.toISOString(),
      pointsBalance: user.pointsBalance,
    };
  }

  private isIdleTooLong(session: SessionEntity, now: Date): boolean {
    const days = this.config.get<number>('SESSION_INACTIVITY_DAYS', 14);
    return now.getTime() - session.lastUsedAt.getTime() > days * 24 * 60 * 60 * 1000;
  }

  private signInFailed(email: string, reason: SignInFailedEvent['reason'], ip?: string): void {
    const event: SignInFailedEvent = { email, reason, ip, at: this.clock.now() };
    this.events.emit(DomainEvent.SignInFailed, event);
  }

  /** Opens a new session: random refresh token (hash stored) + signed access token. */
  private async startSession(user: UserEntity): Promise<AuthTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        lastUsedAt: now,
        revokedAt: null,
      }),
    );
    return this.tokensFor(user, refreshToken);
  }

  private async tokensFor(user: UserEntity, refreshToken: string): Promise<AuthTokens> {
    const expiresIn = this.config.get<number>('JWT_ACCESS_TTL_SECONDS', 900);
    const publicUser = toAuthUser(user);
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.displayName,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload,
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn },
    );
    return { accessToken, expiresIn, refreshToken, user: publicUser };
  }
}

function toAuthUser(user: UserEntity): AuthUser {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}
