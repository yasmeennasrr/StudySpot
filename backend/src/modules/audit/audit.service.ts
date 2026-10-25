import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import {
  DomainEvent,
  type SignInFailedEvent,
  type StaffActionEvent,
} from '../../common/events/domain-events';
import type { AuditEntry, AuditRecord, IAudit } from '../../contracts';
import { AuditLogEntity } from '../../db/entities';

/**
 * Audit Log (SEC-010, FR-041, FR-044). Owner: M1.
 * Other modules never import this class: they emit SignInFailed / StaffAction
 * and the listeners below record them (Observer pattern), or call IAudit.record.
 */
@Injectable()
export class AuditService implements IAudit {
  private readonly logger = new Logger('AuditLog');

  constructor(
    @InjectRepository(AuditLogEntity) private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const row = this.repo.create({
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      target: entry.target ?? null,
      details: entry.details ?? null,
      ip: entry.ip ?? null,
    });
    await this.repo.save(row);
  }

  async list(filter: {
    from?: Date;
    to?: Date;
    action?: string;
    limit?: number;
  }): Promise<AuditRecord[]> {
    const where: FindOptionsWhere<AuditLogEntity> = {};
    if (filter.from && filter.to) where.createdAt = Between(filter.from, filter.to);
    else if (filter.from) where.createdAt = MoreThanOrEqual(filter.from);
    else if (filter.to) where.createdAt = LessThanOrEqual(filter.to);
    if (filter.action) where.action = filter.action;
    const rows = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(filter.limit ?? 100, 500),
    });
    return rows.map((r) => ({
      id: r.id,
      actorType: r.actorType,
      actorId: r.actorId,
      action: r.action,
      target: r.target,
      details: r.details ?? undefined,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Accounts -> Audit Log, failed sign-ins (SEC-010). Published by M2's AuthService. */
  @OnEvent(DomainEvent.SignInFailed, { async: true, promisify: true })
  async onSignInFailed(event: SignInFailedEvent): Promise<void> {
    await this.safe(() =>
      this.record({
        actorType: 'anonymous',
        action: DomainEvent.SignInFailed,
        target: event.email.toLowerCase(),
        details: { reason: event.reason },
        ip: event.ip ?? null,
      }),
    );
  }

  /** Administration -> Audit Log, every staff action (FR-044). */
  @OnEvent(DomainEvent.StaffAction, { async: true, promisify: true })
  async onStaffAction(event: StaffActionEvent): Promise<void> {
    await this.safe(() =>
      this.record({
        actorType: 'staff',
        actorId: event.staffUserId,
        action: event.action,
        target: event.target,
        details: event.details,
      }),
    );
  }

  /** A failing audit write must never break the request that caused it. */
  private async safe(write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch (err) {
      this.logger.error({ err }, 'Could not write audit entry');
    }
  }
}
