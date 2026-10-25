import { ErrorCode } from './error-codes';

/**
 * Throw this from any service. The global AllExceptionsFilter turns it into
 * the standard error body and the right HTTP status. Messages must say what
 * failed and what the user can do next (USE-008).
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static invalidInput(message: string, details?: unknown) {
    return new AppError(ErrorCode.INVALID_INPUT, message, details);
  }
  static notFound(message: string) {
    return new AppError(ErrorCode.NOT_FOUND, message);
  }
  static notAllowed(message = 'You are not allowed to do this.') {
    return new AppError(ErrorCode.NOT_ALLOWED, message);
  }
  static unauthenticated(message = 'Please sign in to continue.') {
    return new AppError(ErrorCode.UNAUTHENTICATED, message);
  }
  static conflict(message: string) {
    return new AppError(ErrorCode.CONFLICT, message);
  }
  static unavailable(message: string) {
    return new AppError(ErrorCode.UNAVAILABLE, message);
  }
  /** Used by stubs for features planned in a later sprint. */
  static notImplemented(feature: string, sprint: string) {
    return new AppError(
      ErrorCode.NOT_IMPLEMENTED,
      `${feature} is not available yet (planned for ${sprint}).`,
    );
  }
}

/**
 * Raised by every adapter (Maps, E-mail, Push, LLM, Audio AI) for any provider
 * failure: timeout, open circuit, provider error, unusable answer (SDS 5.1).
 * The calling module decides the fallback; the adapter never does.
 */
export class AdapterUnavailableError extends Error {
  constructor(
    public readonly adapter: string,
    public readonly reason: string,
  ) {
    super(`${adapter} unavailable: ${reason}`);
    this.name = 'AdapterUnavailableError';
  }
}
