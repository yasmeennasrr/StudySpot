import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUDIT } from '../../contracts';
import { AuditLogEntity } from '../../db/entities';
import { AuditService } from './audit.service';

/**
 * Audit Log. Owner: M1. Provides IAudit.
 * Listens to SignInFailed (from Accounts) and StaffAction (from Administration).
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  providers: [AuditService, { provide: AUDIT, useExisting: AuditService }],
  exports: [AUDIT],
})
export class AuditModule {}
