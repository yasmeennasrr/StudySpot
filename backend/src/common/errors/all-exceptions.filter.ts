import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AdapterUnavailableError, AppError } from './app-error';
import { ErrorBody, ErrorCode, HTTP_STATUS_BY_CODE } from './error-codes';

const CODE_BY_HTTP_STATUS: Record<number, ErrorCode> = {
  400: ErrorCode.INVALID_INPUT,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.NOT_ALLOWED,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
  501: ErrorCode.NOT_IMPLEMENTED,
  503: ErrorCode.UNAVAILABLE,
};

/**
 * API Layer: turns every thrown error into one body shape,
 * { code, message, details?, requestId } (EIR-011, USE-008).
 * Unknown errors are logged with their stack and returned as INTERNAL
 * without internal details, so nothing leaks to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('API');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const { status, body } = this.toBody(exception);
    body.requestId = req?.id ? String(req.id) : undefined;

    if (
      status >= 500 &&
      body.code !== ErrorCode.UNAVAILABLE &&
      body.code !== ErrorCode.NOT_IMPLEMENTED
    ) {
      this.logger.error(
        { requestId: body.requestId, err: exception },
        `Unhandled error on ${req?.method} ${req?.url}`,
      );
    }
    res.status(status).json(body);
  }

  toBody(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof AppError) {
      return {
        status: HTTP_STATUS_BY_CODE[exception.code],
        body: { code: exception.code, message: exception.message, details: exception.details },
      };
    }
    if (exception instanceof AdapterUnavailableError) {
      return {
        status: 503,
        body: {
          code: ErrorCode.UNAVAILABLE,
          message: 'An outside service is not responding right now. Please try again in a moment.',
          details: { service: exception.adapter },
        },
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        status: 429,
        body: {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests. Please wait a moment and try again.',
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        CODE_BY_HTTP_STATUS[status] ??
        (status >= 500 ? ErrorCode.INTERNAL : ErrorCode.INVALID_INPUT);
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : typeof (response as { message?: unknown }).message === 'string'
            ? (response as { message: string }).message
            : exception.message;
      return { status, body: { code, message } };
    }
    return {
      status: 500,
      body: {
        code: ErrorCode.INTERNAL,
        message: 'Something went wrong on our side. Please try again.',
      },
    };
  }
}
