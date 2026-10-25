import { DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from './entities';

/**
 * One connection definition, used by the app (AppModule) and by the TypeORM CLI
 * (src/db/data-source.ts). The schema changes only through migrations;
 * synchronize is always off.
 */
export function buildDataSourceOptions(
  env: Record<string, string | undefined> = process.env,
): DataSourceOptions {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env.');
  }
  const ssl = String(env.DATABASE_SSL ?? 'false') === 'true';
  return {
    type: 'postgres',
    url,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    entities: ALL_ENTITIES,
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    migrationsTableName: 'schema_migrations',
    synchronize: false,
    logging: ['error', 'warn', 'migration'],
  };
}
