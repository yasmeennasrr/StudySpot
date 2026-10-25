import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AdapterUnavailableError, AppError } from '../../src/common/errors/app-error';
import { AllExceptionsFilter } from '../../src/common/errors/all-exceptions.filter';
import { ErrorCode, HTTP_STATUS_BY_CODE } from '../../src/common/errors/error-codes';

/** TC-M1-01..07: one error body shape and the right HTTP status for every error kind (EIR-011, USE-008). */
describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it.each(Object.values(ErrorCode))('TC-M1-01 maps AppError %s to its status and code', (code) => {
    const { status, body } = filter.toBody(new AppError(code, 'msg'));
    expect(status).toBe(HTTP_STATUS_BY_CODE[code]);
    expect(body).toMatchObject({ code, message: 'msg' });
  });

  it('TC-M1-02 keeps field details for INVALID_INPUT', () => {
    const details = [{ field: 'email', problems: ['bad'] }];
    expect(filter.toBody(AppError.invalidInput('x', details)).body.details).toEqual(details);
  });

  it('TC-M1-03 turns an adapter failure into 503 UNAVAILABLE naming the service', () => {
    const { status, body } = filter.toBody(new AdapterUnavailableError('maps', 'timeout'));
    expect(status).toBe(503);
    expect(body.code).toBe(ErrorCode.UNAVAILABLE);
    expect(body.details).toEqual({ service: 'maps' });
    expect(body.message).not.toContain('timeout');
  });

  it('TC-M1-04 turns the rate limiter into 429 RATE_LIMITED', () => {
    const { status, body } = filter.toBody(new ThrottlerException());
    expect(status).toBe(429);
    expect(body.code).toBe(ErrorCode.RATE_LIMITED);
  });

  it('TC-M1-05 maps framework HTTP errors by status', () => {
    expect(filter.toBody(new NotFoundException('Cannot GET /x')).body.code).toBe(
      ErrorCode.NOT_FOUND,
    );
    expect(filter.toBody(new BadRequestException('bad')).body.code).toBe(ErrorCode.INVALID_INPUT);
    expect(filter.toBody(new HttpException('gone', 410)).body.code).toBe(ErrorCode.INVALID_INPUT);
    expect(filter.toBody(new HttpException('boom', 502)).body.code).toBe(ErrorCode.INTERNAL);
  });

  it('TC-M1-06 never leaks internal error text for unknown errors', () => {
    const { status, body } = filter.toBody(new Error('password=hunter2 at db.ts:42'));
    expect(status).toBe(500);
    expect(body.code).toBe(ErrorCode.INTERNAL);
    expect(body.message).not.toContain('hunter2');
  });

  it('TC-M1-07 gives every code a status', () => {
    for (const code of Object.values(ErrorCode))
      expect(HTTP_STATUS_BY_CODE[code]).toBeGreaterThanOrEqual(400);
  });
});
