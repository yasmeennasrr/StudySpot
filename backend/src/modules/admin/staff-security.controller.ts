import { Controller, Get, Inject, Query } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { DataSource, In, Repository } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { StaffOnly } from '../../common/http/staff.guard';
import { AUDIT, CLOCK, type AuditRecord, type IAudit, type IClock } from '../../contracts';
import { UserEntity } from '../../db/entities';

const DAY_MS = 86_400_000;

/** The kinds of entry an administrator can filter the security log by (FR-041). */
export const SECURITY_LOG_ACTIONS = [
  'auth.sign_in_failed',
  'staff.sign_in',
  'staff.sign_out',
  'config.changed',
] as const;

export class PeriodQuery {
  /** Start of the period, inclusive. A date (2026-11-01) or a date-time. */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** End of the period, exclusive. A date means the start of that day. */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class SecurityLogQuery extends PeriodQuery {
  @IsOptional()
  @IsIn(SECURITY_LOG_ACTIONS as unknown as string[])
  action?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export interface SecurityLogEntry extends AuditRecord {
  actor: { email: string; displayName: string } | null;
}

export interface Statistics {
  period: { from: string; to: string };
  users: { total: number; newInPeriod: number };
  surveysSubmitted: number;
  pointsIssued: number;
  couponsRedeemed: number;
  failedSignIns: number;
}

/**
 * Staff API, security log and statistics (PB-36, FR-041, FR-042, SEC-010, UC-20).
 * Owner: M1. Administrators only.
 *
 * Periods run from `from` (inclusive) to `to` (exclusive). Without them: the last
 * 30 days up to now. A period is at most 366 days.
 */
@Controller('staff')
@StaffOnly('admin')
export class StaffSecurityController {
  constructor(
    @Inject(AUDIT) private readonly audit: IAudit,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectDataSource() private readonly db: DataSource,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  @Get('security-log')
  async securityLog(@Query() q: SecurityLogQuery): Promise<SecurityLogEntry[]> {
    const { from, to } = this.period(q);
    const rows = await this.audit.list({ from, to, action: q.action, limit: q.limit ?? 100 });
    const ids = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
    const people = ids.length ? await this.users.find({ where: { id: In(ids) } }) : [];
    return rows.map((r) => {
      const who = people.find((p) => p.id === r.actorId);
      return { ...r, actor: who ? { email: who.email, displayName: who.displayName } : null };
    });
  }

  @Get('statistics')
  async statistics(@Query() q: PeriodQuery): Promise<Statistics> {
    const { from, to } = this.period(q);
    const [[users], [surveys], [points], [coupons], [failed]] = await Promise.all([
      this.db.query(
        `SELECT count(*) FILTER (WHERE created_at < $2)::int AS total,
                count(*) FILTER (WHERE created_at >= $1 AND created_at < $2)::int AS new
           FROM users WHERE role = 'user'`,
        [from, to],
      ),
      this.db.query(
        `SELECT count(*)::int AS n FROM surveys WHERE submitted_at >= $1 AND submitted_at < $2`,
        [from, to],
      ),
      this.db.query(
        `SELECT coalesce(sum(delta), 0)::int AS n FROM points_ledger
          WHERE delta > 0 AND created_at >= $1 AND created_at < $2`,
        [from, to],
      ),
      this.db.query(
        `SELECT count(*)::int AS n FROM coupons WHERE redeemed_at >= $1 AND redeemed_at < $2`,
        [from, to],
      ),
      this.db.query(
        `SELECT count(*)::int AS n FROM audit_log
          WHERE action = 'auth.sign_in_failed' AND created_at >= $1 AND created_at < $2`,
        [from, to],
      ),
    ]);
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      users: { total: users.total, newInPeriod: users.new },
      surveysSubmitted: surveys.n,
      pointsIssued: points.n,
      couponsRedeemed: coupons.n,
      failedSignIns: failed.n,
    };
  }

  private period(q: PeriodQuery): { from: Date; to: Date } {
    const to = q.to ? new Date(q.to) : this.clock.now();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * DAY_MS);
    if (from.getTime() >= to.getTime()) {
      throw AppError.invalidInput('The start of the period must be before its end.');
    }
    if (to.getTime() - from.getTime() > 366 * DAY_MS) {
      throw AppError.invalidInput('Choose a period of at most 366 days.');
    }
    return { from, to };
  }
}
