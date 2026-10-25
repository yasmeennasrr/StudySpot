import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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

/** Fixed development user, so protected routes can be tried before M2's work lands. */
export const STUB_DEV_USER: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'dev@studyspot.test',
  displayName: 'Dev Student',
  role: 'user',
};
export const STUB_DEV_TOKEN = `stub.${STUB_DEV_USER.id}`;

interface StubUser extends AuthUser {
  password: string;
  createdAt: string;
}

/**
 * STUB. NOT SECURE. Replace with the real AuthService (M2, PB-03, PB-04).
 *
 * Keeps users in memory and issues "stub.<userId>" tokens so M4, M5 and M6 can
 * work against the deployed API today. The token `stub.00000000-0000-4000-8000-000000000001`
 * always works for the dev user. It already emits SignInFailed, so the
 * Accounts -> Audit Log link is live; keep that when you replace it.
 *
 * TODO(M2): bcrypt hashing (SEC-002), JWT access tokens (JWT_ACCESS_SECRET,
 * JWT_ACCESS_TTL_SECONDS), refresh tokens stored as SHA-256 hashes in `sessions`,
 * 14-day inactivity from IClock (SEC-009), suspended users refused (FR-038).
 */
@Injectable()
export class StubAuthService implements IAuth {
  private readonly logger = new Logger('Accounts');
  private readonly users = new Map<string, StubUser>();

  constructor(
    private readonly events: EventEmitter2,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {
    this.users.set(STUB_DEV_USER.email, {
      ...STUB_DEV_USER,
      password: 'devpass123',
      createdAt: this.clock.now().toISOString(),
    });
  }

  async register(input: RegisterInput): Promise<AuthTokens> {
    if (this.users.has(input.email)) {
      throw AppError.conflict(
        'An account with this e-mail already exists. Try signing in instead.',
      );
    }
    const user: StubUser = {
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      role: 'user',
      password: input.password,
      createdAt: this.clock.now().toISOString(),
    };
    this.users.set(user.email, user);
    this.logger.debug({ userId: user.id }, 'Accounts.register (stub)');
    return this.tokensFor(user);
  }

  async login(input: LoginInput, context: { ip?: string }): Promise<AuthTokens> {
    const user = this.users.get(input.email);
    if (!user || user.password !== input.password) {
      const event: SignInFailedEvent = {
        email: input.email,
        reason: user ? 'wrong_password' : 'unknown_email',
        ip: context.ip,
        at: this.clock.now(),
      };
      this.events.emit(DomainEvent.SignInFailed, event);
      throw AppError.unauthenticated('The e-mail or password is not correct.');
    }
    return this.tokensFor(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const user = this.findByToken(refreshToken.replace(/^refresh\./, 'stub.'));
    return this.tokensFor(user);
  }

  async logout(_refreshToken: string): Promise<void> {
    // Nothing to revoke in the stub.
  }

  async verifyAccessToken(accessToken: string): Promise<AuthUser> {
    const { password: _p, createdAt: _c, ...user } = this.findByToken(accessToken);
    return user;
  }

  async getProfile(userId: string): Promise<Profile> {
    const user = [...this.users.values()].find((u) => u.id === userId);
    if (!user) throw AppError.notFound('Account not found.');
    const { password: _p, ...rest } = user;
    return { ...rest, termsAcceptedAt: user.createdAt, pointsBalance: 0 };
  }

  private findByToken(token: string): StubUser {
    const id = token.startsWith('stub.') ? token.slice(5) : '';
    const user = [...this.users.values()].find((u) => u.id === id);
    if (!user) throw AppError.unauthenticated('Your session has ended. Please sign in again.');
    return user;
  }

  private tokensFor(user: StubUser): AuthTokens {
    const { password: _p, createdAt: _c, ...publicUser } = user;
    return {
      accessToken: `stub.${user.id}`,
      expiresIn: 900,
      refreshToken: `refresh.${user.id}`,
      user: publicUser,
    };
  }
}
