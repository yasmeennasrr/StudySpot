/**
 * The error codes every endpoint returns, in the body { code, message, details?, requestId }.
 * The first four are the SDS 6.6.8 codes; the others cover the user API.
 * Keep this list in sync with contracts/openapi.yaml (components.schemas.ErrorCode).
 */
export enum ErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  NOT_ALLOWED = 'NOT_ALLOWED',
  UNAVAILABLE = 'UNAVAILABLE',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  INTERNAL = 'INTERNAL',
}

export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.UNAUTHENTICATED]: 401,
  [ErrorCode.NOT_ALLOWED]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.INTERNAL]: 500,
  [ErrorCode.NOT_IMPLEMENTED]: 501,
  [ErrorCode.UNAVAILABLE]: 503,
};

/** Shape of every error response body. */
export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
}
