import { Controller, Get, Module, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../package.json') as { version: string };

export interface HealthBody {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  database: 'up' | 'down';
}

/** GET /api/v1/health. Render's health check; 503 when the database is down. */
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @SkipThrottle()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthBody> {
    let database: HealthBody['database'] = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }
    const body: HealthBody = {
      status: database === 'up' ? 'ok' : 'degraded',
      version,
      uptimeSeconds: Math.round(process.uptime()),
      database,
    };
    res.status(database === 'up' ? 200 : 503);
    return body;
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
