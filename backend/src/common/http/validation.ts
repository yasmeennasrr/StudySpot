import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppError } from '../errors/app-error';

export interface FieldError {
  field: string;
  problems: string[];
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, problems: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/**
 * API Layer input validation (SEC-007). Unknown fields are rejected, types are
 * converted, and failures come back as INVALID_INPUT with one entry per field.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors) => {
      const details = flatten(errors);
      const first = details[0];
      const message = first
        ? `Please check ${first.field}: ${first.problems[0]}.`
        : 'Some of the information sent is not valid.';
      return AppError.invalidInput(message, details);
    },
  });
}
