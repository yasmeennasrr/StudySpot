import { Inject, Injectable, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppError } from '../../common/errors/app-error';
import {
  ADMIN,
  AUTH,
  AUDIT,
  CONFIG,
  type IAdmin,
  type IAudit,
  type IAuth,
  type IConfig,
} from '../../contracts';
import { ReviewEntity, SurveyEntity, UserEntity, VenueApiKeyEntity } from '../../db/entities';
import { AccountsModule } from '../accounts/accounts.module';
import { AuditModule } from '../audit/audit.module';
import { ConfigurationModule } from '../configuration/configuration.module';

/**
 * STUB. Venue keys in Sprint 2 (PB-35, by script until then); the rest in Sprint 3 (PB-32..PB-37).
 * TODO: Staff API (IStaffAPI) behind AuthGuard + @Roles('admin'|'moderator')
 * and re-authentication (FR-035); every action emits DomainEvent.StaffAction.
 */
@Injectable()
export class StubAdminService implements IAdmin {
  constructor(
    @Inject(AUTH) private readonly auth: IAuth,
    @Inject(AUDIT) private readonly audit: IAudit,
    @Inject(CONFIG) private readonly config: IConfig,
    private readonly events: EventEmitter2,
  ) {}

  async suspendUser(): Promise<void> {
    throw AppError.notImplemented('Administration', 'Sprint 3');
  }
  async reactivateUser(): Promise<void> {
    throw AppError.notImplemented('Administration', 'Sprint 3');
  }
  async registerVenueKey(): Promise<{ apiKey: string }> {
    throw AppError.notImplemented('Venue keys', 'Sprint 2');
  }
  async revokeVenueKey(): Promise<void> {
    throw AppError.notImplemented('Venue keys', 'Sprint 2');
  }
  async removeReportedContent(): Promise<void> {
    throw AppError.notImplemented('Moderation', 'Sprint 3');
  }
  async statistics(): Promise<{
    users: number;
    surveys: number;
    pointsIssued: number;
    couponsRedeemed: number;
  }> {
    throw AppError.notImplemented('Statistics', 'Sprint 3');
  }
}

/** Administration & Moderation. Provides IAdmin. Uses IAuth, IAudit, IConfig; publishes StaffAction -> Audit Log. */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, VenueApiKeyEntity, ReviewEntity, SurveyEntity]),
    AccountsModule,
    AuditModule,
    ConfigurationModule,
  ],
  providers: [{ provide: ADMIN, useClass: StubAdminService }],
  exports: [ADMIN],
})
export class AdminModule {}
