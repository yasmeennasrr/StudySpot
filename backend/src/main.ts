import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as yaml from 'js-yaml';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

export const API_PREFIX = 'api/v1';

/** Shared by main() and the e2e tests so both run the exact same API Layer. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  (app as NestExpressApplication).set('trust proxy', 1); // Render sits behind a proxy (rate limit per client IP)
  app.use(helmet());
  const origins = String(config.get('CORS_ORIGINS', '*'));
  app.enableCors({ origin: origins === '*' ? true : origins.split(',').map((o) => o.trim()) });
  app.setGlobalPrefix(API_PREFIX, { exclude: ['/'] });
  app.enableShutdownHooks();
}

/** Serves contracts/openapi.yaml (the single source of truth) at /api/docs. */
function mountApiDocs(app: INestApplication): void {
  const candidates = [
    join(process.cwd(), '../contracts/openapi.yaml'),
    join(process.cwd(), 'contracts/openapi.yaml'),
  ];
  const file = candidates.find((p) => existsSync(p));
  if (!file) return;
  const document = yaml.load(readFileSync(file, 'utf8')) as OpenAPIObject;
  // "Try it out" calls the server that served the page first, whatever its URL (local, Render).
  document.servers = [
    { url: `/${API_PREFIX}`, description: 'This server' },
    ...(document.servers ?? []).filter((s) => s.url !== `/${API_PREFIX}`),
  ];
  SwaggerModule.setup('api/docs', app, document, { customSiteTitle: 'StudySpot API' });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  mountApiDocs(app);
  const port = Number(app.get(ConfigService).get('PORT', 3000));
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`StudySpot API on http://localhost:${port}/${API_PREFIX} (docs: /api/docs)`);
}

if (require.main === module) {
  void bootstrap();
}
