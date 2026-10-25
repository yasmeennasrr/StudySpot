/**
 * Accounts & Auth (SDS 6.3). Owner: M2. Provider: AccountsModule.
 * Requirements: FR-001..FR-008, FR-035..FR-038, SEC-001, SEC-002, SEC-009.
 */
import type { AuthUser } from './domain.types';

export const AUTH = Symbol('IAuth');

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  termsAccepted: true;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  user: AuthUser;
}

export interface Profile extends AuthUser {
  termsAcceptedAt: string;
  createdAt: string;
  pointsBalance: number;
}

export interface IAuth {
  register(input: RegisterInput): Promise<AuthTokens>;
  /** Emits DomainEvent.SignInFailed on failure (SEC-010). */
  login(input: LoginInput, context: { ip?: string }): Promise<AuthTokens>;
  /** Rotates the refresh token; refuses sessions idle for 14 days (SEC-009). */
  refresh(refreshToken: string): Promise<AuthTokens>;
  logout(refreshToken: string): Promise<void>;
  /** Used by the auth guard on every protected route (SEC-001, FR-007). */
  verifyAccessToken(accessToken: string): Promise<AuthUser>;
  getProfile(userId: string): Promise<Profile>;
}
