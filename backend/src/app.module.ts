import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { createValidationPipe } from './common/http/validation';
import { LoggingModule } from './common/logging/logging.module';
import { envValidationSchema } from './config/env.validation';
import { buildDataSourceOptions } from './db/typeorm.options';
import { HealthModule } from './health/health.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AdminModule } from './modules/admin/admin.module';
import { AudioModule } from './modules/audio/audio.module';
import { AuditModule } from './modules/audit/audit.module';
import { ClockModule } from './modules/clock/clock.module';
import { ConditionsModule } from './modules/conditions/conditions.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PresenceModule } from './modules/presence/presence.module';
import { QrCodesModule } from './modules/qr-codes/qr-codes.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { StudyMatchModule } from './modules/studymatch/studymatch.module';
import { SurveysModule } from './modules/surveys/surveys.module';
import { VenuesModule } from './modules/venues/venues.module';

/**
 * The StudySpot modular monolith (SDS 3, Figure 2).
 * API Layer = controllers + the global guard, pipe and filter registered below.
 * Each business module talks to another only through src/contracts.
 */
@Module({
  imports: [
    // Platform
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidationSchema, cache: true }),
    LoggingModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildDataSourceOptions({
          DATABASE_URL: config.get<string>('DATABASE_URL'),
          DATABASE_SSL: String(config.get('DATABASE_SSL')),
        }),
        migrationsRun: String(config.get('DATABASE_RUN_MIGRATIONS')) === 'true',
        retryAttempts: 3,
      }),
    }),
    EventEmitterModule.forRoot({ wildcard: false }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { ttl: Number(config.get('THROTTLE_TTL_MS')), limit: Number(config.get('THROTTLE_LIMIT')) },
      ],
    }),
    ClockModule,
    ConfigurationModule,
    AuditModule,
    HealthModule,

    // Business modules (SDS 6.3)
    AccountsModule,
    VenuesModule,
    ConditionsModule,
    PresenceModule,
    SurveysModule,
    QrCodesModule,
    RewardsModule,
    StudyMatchModule,
    AudioModule,
    NotificationsModule,
    AdminModule,
    SchedulerModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
