import * as Joi from 'joi';

/**
 * Every setting comes from environment variables (SEC-005, DC-006).
 * Nothing secret is ever committed: copy .env.example to .env locally,
 * and set the same keys in Render for the deployed backend.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),

  // Database: local Postgres+PostGIS (docker compose) or Supabase.
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DATABASE_SSL: Joi.boolean().default(false),
  DATABASE_RUN_MIGRATIONS: Joi.boolean().default(false),

  // Auth (used by M2's AccountsModule).
  JWT_ACCESS_SECRET: Joi.string().min(16).default('dev-only-access-secret-change-me'),
  JWT_ACCESS_TTL_SECONDS: Joi.number().default(900),
  SESSION_INACTIVITY_DAYS: Joi.number().default(14),

  // API layer.
  CORS_ORIGINS: Joi.string().default('*'),
  THROTTLE_TTL_MS: Joi.number().default(60_000),
  THROTTLE_LIMIT: Joi.number().default(120),

  // External services. Leave empty to use the fake adapters.
  GOOGLE_GEOCODING_API_KEY: Joi.string().allow('').default(''),
  GEMINI_API_KEY: Joi.string().allow('').default(''),
  SENDGRID_API_KEY: Joi.string().allow('').default(''),
  SENDGRID_FROM_EMAIL: Joi.string().allow('').default(''),
  FCM_SERVICE_ACCOUNT_JSON: Joi.string().allow('').default(''),

  // Periodic jobs (expiry, purges, retries). Off in tests.
  SCHEDULER_ENABLED: Joi.boolean().default(true),

  // Public base URL used in receipt-code and coupon links.
  PUBLIC_BASE_URL: Joi.string().uri().default('http://localhost:3000'),
});
