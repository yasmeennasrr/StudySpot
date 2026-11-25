import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { REWARDS } from '../../contracts';
import {
  CouponEntity,
  CouponOfferEntity,
  PointsLedgerEntity,
  UserEntity,
  VenueEntity,
} from '../../db/entities';
import { EmailAdapterModule } from '../../adapters/email/email-adapter.module';
import { AccountsModule } from '../accounts/accounts.module';
import { ClockModule } from '../clock/clock.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PresenceModule } from '../presence/presence.module';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

/**
 * Rewards & Coupons (SDS 6.3). Provides IRewards. Built in Sprints 2 and 3
 * (PB-24 points, PB-25 redeem, PB-26 e-mail, PB-27 activation, PB-38 coupon expiry).
 * Uses IPresence (anti-abuse rule 3), IConfig (points, daily cap), IEmail, IClock.
 * Called by Surveys and QR Codes (awardForSurvey) and by the Scheduler (expiry, e-mail retry).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CouponOfferEntity,
      CouponEntity,
      PointsLedgerEntity,
      UserEntity,
      VenueEntity,
    ]),
    AccountsModule,
    PresenceModule,
    ConfigurationModule,
    EmailAdapterModule,
    ClockModule,
  ],
  controllers: [RewardsController],
  providers: [{ provide: REWARDS, useClass: RewardsService }],
  exports: [REWARDS],
})
export class RewardsModule {}
