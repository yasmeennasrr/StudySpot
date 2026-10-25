import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CONDITIONS,
  PRESENCE,
  RECEIPT_CODES,
  REWARDS,
  SURVEYS,
  type IConditions,
  type IPresence,
  type IReceiptCodes,
  type IRewards,
  type ISurvey,
} from '../../contracts';
import { ConditionsModule } from '../conditions/conditions.module';
import { PresenceModule } from '../presence/presence.module';
import { QrCodesModule } from '../qr-codes/qr-codes.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SurveysModule } from '../surveys/surveys.module';

/**
 * Scheduler (UC-22, actor "Time"). Owns no data: each job calls the module that
 * owns the rule. Expiry is also checked on every read (SDS 2), so a late job
 * never lets an expired code or coupon through.
 *
 *   every minute  presence purge (PRIV-016), code expiry (QR-007, QR-009),
 *                 coupon expiry (RWD-018), coupon e-mail retries (SDS 6.6.9)
 *   daily 03:00   90-day purge of dynamic records and surveys (PRIV-013)
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('Scheduler');
  private readonly enabled: boolean;

  constructor(
    @Inject(PRESENCE) private readonly presence: IPresence,
    @Inject(RECEIPT_CODES) private readonly receiptCodes: IReceiptCodes,
    @Inject(REWARDS) private readonly rewards: IRewards,
    @Inject(CONDITIONS) private readonly conditions: IConditions,
    @Inject(SURVEYS) private readonly surveys: ISurvey,
    config: ConfigService,
  ) {
    this.enabled = String(config.get('SCHEDULER_ENABLED', 'true')) === 'true';
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'every-minute' })
  async everyMinute(): Promise<void> {
    if (!this.enabled) return;
    await this.run('presence.purge', () => this.presence.purgeExpired());
    await this.run('receipt-codes.expire', () => this.receiptCodes.expireStale());
    await this.run('coupons.expire', () => this.rewards.expireCoupons());
    await this.run('coupons.retry-email', () => this.rewards.retryFailedEmails());
  }

  @Cron('0 3 * * *', { name: 'daily-retention', timeZone: 'Africa/Cairo' })
  async daily(): Promise<void> {
    if (!this.enabled) return;
    await this.run('dynamic-records.purge-90d', () => this.conditions.purgeExpiredRecords());
    await this.run('surveys.purge-90d', () => this.surveys.purgeExpired());
  }

  /** One failing job never stops the others; each result is logged. */
  async run(job: string, fn: () => Promise<number>): Promise<void> {
    try {
      const affected = await fn();
      this.logger.debug({ job, affected }, 'Scheduled job done');
    } catch (err) {
      this.logger.error({ job, err }, 'Scheduled job failed');
    }
  }
}

/** Scheduler. Provides nothing. Uses IPresence, IReceiptCodes, IRewards, IConditions, ISurvey. */
@Module({
  imports: [PresenceModule, QrCodesModule, RewardsModule, ConditionsModule, SurveysModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
