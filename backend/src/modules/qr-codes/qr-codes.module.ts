import { Inject, Injectable, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppError } from '../../common/errors/app-error';
import {
  CLOCK,
  PRESENCE,
  RECEIPT_CODES,
  REWARDS,
  SURVEYS,
  type IClock,
  type IPresence,
  type IReceiptCodes,
  type IRewards,
  type ISurvey,
  type ReceiptCodeView,
  type StoredSurvey,
} from '../../contracts';
import { ReceiptCodeEntity, VenueApiKeyEntity, VenueEntity } from '../../db/entities';
import { ClockModule } from '../clock/clock.module';
import { PresenceModule } from '../presence/presence.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SurveysModule } from '../surveys/surveys.module';

/**
 * STUB. Real version in Sprint 2 (PB-21..PB-23).
 * TODO: token = randomBytes(16).toString('base64url') (SDS 6.6.7); State pattern
 * unused -> scanned -> used | expired; bind on first scan (QR-006) and call
 * IPresence.recordReceiptScan; submitSurvey runs ISurvey.submit + IRewards in
 * one transaction and marks the code used (QR-008). Venue API (IVenueAPI) with
 * API-key guard and 10 codes/minute limit (SEC-011, SEC-013).
 */
@Injectable()
export class StubReceiptCodesService implements IReceiptCodes {
  constructor(
    @Inject(SURVEYS) private readonly surveys: ISurvey,
    @Inject(REWARDS) private readonly rewards: IRewards,
    @Inject(PRESENCE) private readonly presence: IPresence,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async create(): Promise<{ token: string; link: string }> {
    throw AppError.notImplemented('Receipt codes', 'Sprint 2');
  }
  async scan(): Promise<ReceiptCodeView> {
    throw AppError.notImplemented('Receipt codes', 'Sprint 2');
  }
  async submitSurvey(): Promise<StoredSurvey> {
    throw AppError.notImplemented('Receipt codes', 'Sprint 2');
  }
  async expireStale(): Promise<number> {
    return 0;
  }
}

/** QR Codes. Provides IReceiptCodes. Uses ISurvey, IRewards, IPresence, IClock. */
@Module({
  imports: [
    TypeOrmModule.forFeature([ReceiptCodeEntity, VenueApiKeyEntity, VenueEntity]),
    SurveysModule,
    RewardsModule,
    PresenceModule,
    ClockModule,
  ],
  providers: [{ provide: RECEIPT_CODES, useClass: StubReceiptCodesService }],
  exports: [RECEIPT_CODES],
})
export class QrCodesModule {}
