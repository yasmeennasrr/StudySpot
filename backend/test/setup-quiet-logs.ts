import { Logger } from '@nestjs/common';

// Keep test output readable: Nest's logger is silenced in every test run.
Logger.overrideLogger(false);
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
