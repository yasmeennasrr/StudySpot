import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ADMIN } from '../../contracts';
import { ReviewEntity, SurveyEntity, UserEntity, VenueApiKeyEntity } from '../../db/entities';
import { AccountsModule } from '../accounts/accounts.module';
import { AuditModule } from '../audit/audit.module';
import { ClockModule } from '../clock/clock.module';
import { ConditionsModule } from '../conditions/conditions.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { AdminService } from './admin.service';
import { StaffModerationController } from './staff-moderation.controller';
import { StaffSecurityController } from './staff-security.controller';
import { StaffSettingsController } from './staff-settings.controller';

/**
 * Administration & Moderation. Provides IAdmin. Uses IConditions (drop cached values
 * after a survey removal), IAudit, IConfig, IClock; publishes StaffAction -> Audit Log.
 * Owners: M1 (settings, security log, statistics), M4 (moderation, accounts).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, VenueApiKeyEntity, ReviewEntity, SurveyEntity]),
    AccountsModule,
    AuditModule,
    ConfigurationModule,
    ClockModule,
    ConditionsModule,
  ],
  controllers: [StaffSettingsController, StaffSecurityController, StaffModerationController],
  providers: [{ provide: ADMIN, useClass: AdminService }],
  exports: [ADMIN],
})
export class AdminModule {}
