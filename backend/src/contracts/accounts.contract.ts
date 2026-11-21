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

/**
 * PATCH /me (PB-05, FR-005, UC-02). Send at least one change. A new password
 * needs the current one, and must follow the registration rules (SEC-002).
 */
export interface UpdateProfileInput {
  displayName?: string;
  currentPassword?: string;
  newPassword?: string;
}

/**
 * The updated profile. After a password change every other session is signed
 * out (their refresh tokens stop working) and `tokens` holds the one new session,
 * which the app must store in place of its old tokens.
 */
export interface UpdateProfileResult extends Profile {
  tokens?: AuthTokens;
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
  /** PB-05: edit the display name and/or change the password. */
  updateProfile(userId: string, input: UpdateProfileInput): Promise<UpdateProfileResult>;
}

// ---------------------------------------------------------------- IStaffAuth (PB-32, M1)
export const STAFF_AUTH = Symbol('IStaffAuth');

/**
 * A staff session (FR-035, UC-17). Opened only with a fresh e-mail and password,
 * never from an app session or refresh token, and it cannot be refreshed: when it
 * ends, the staff member re-enters the password.
 */
export interface StaffSession {
  staffToken: string;
  /** Seconds until the staff token expires (STAFF_SESSION_TTL_SECONDS, default 900). */
  expiresIn: number;
  expiresAt: string;
  user: AuthUser;
}

export interface IStaffAuth {
  /**
   * Checks the password again and the staff role. Refusals are logged (SEC-010):
   * wrong credentials give 401, a non-staff account gives 403.
   */
  signIn(input: LoginInput, context: { ip?: string }): Promise<StaffSession>;
  /** Used by StaffGuard on every staff route. Re-reads the user, so a suspension or role change applies at once. */
  verifyStaffToken(staffToken: string): Promise<AuthUser & { sessionExpiresAt: string }>;
  /** Records the sign-out in the security log; the console forgets the token. */
  signOut(user: AuthUser): Promise<void>;
}
