import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailAdapterModule } from '../../adapters/email/email-adapter.module';
import { AppError } from '../../common/errors/app-error';
import {
  CLOCK,
  CONFIG,
  EMAIL,
  PRESENCE,
  REWARDS,
  type CouponOfferView,
  type CouponView,
  type IClock,
  type IConfig,
  type IEmail,
  type IPresence,
  type IRewards,
} from '../../contracts';
import { CouponEntity, CouponOfferEntity, PointsLedgerEntity, UserEntity } from '../../db/entities';
import { ClockModule } from '../clock/clock.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PresenceModule } from '../presence/presence.module';

/**
 * STUB. Points arrive in Sprint 2 (PB-24), coupons in Sprint 3 (PB-25..PB-27).
 * TODO: awardForSurvey applies points.* and points.dailyCap from IConfig, the
 * anti-abuse rules of SDS 6.6.5 (rule 3 asks IPresence.isPresent), and writes the
 * ledger + balance in one transaction (Unit of Work). redeem/activate follow the
 * coupon state machine issued -> active -> expired (RWD-017..RWD-020).
 */
@Injectable()
export class StubRewardsService implements IRewards {
  private readonly logger = new Logger('Rewards');

  constructor(
    @Inject(PRESENCE) private readonly presence: IPresence,
    @Inject(CONFIG) private readonly config: IConfig,
    @Inject(EMAIL) private readonly email: IEmail,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async awardForSurvey(): Promise<{ points: number; reason: string | null }> {
    return { points: 0, reason: 'Points start in Sprint 2.' };
  }
  async getBalance(): Promise<number> {
    return 0;
  }
  async listOffers(): Promise<CouponOfferView[]> {
    return [];
  }
  async redeem(): Promise<CouponView> {
    throw AppError.notImplemented('Coupons', 'Sprint 3');
  }
  async activate(): Promise<CouponView> {
    throw AppError.notImplemented('Coupons', 'Sprint 3');
  }
  async listCoupons(): Promise<CouponView[]> {
    return [];
  }
  async expireCoupons(): Promise<number> {
    return 0;
  }
  async retryFailedEmails(): Promise<number> {
    return 0;
  }
}

/** Rewards & Coupons. Provides IRewards. Uses IPresence, IConfig, IEmail, IClock. */
@Module({
  imports: [
    TypeOrmModule.forFeature([CouponOfferEntity, CouponEntity, PointsLedgerEntity, UserEntity]),
    PresenceModule,
    ConfigurationModule,
    EmailAdapterModule,
    ClockModule,
  ],
  providers: [{ provide: REWARDS, useClass: StubRewardsService }],
  exports: [REWARDS],
})
export class RewardsModule {}
