import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.options';

/** Used only by the TypeORM CLI (npm run migration:*). Reads backend/.env when present. */
loadEnv({ path: __dirname + '/../../.env', quiet: true });

export default new DataSource(buildDataSourceOptions());
