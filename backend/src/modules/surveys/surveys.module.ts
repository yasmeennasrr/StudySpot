import { Inject, Injectable, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppError } from '../../common/errors/app-error';
import {
  CLOCK,
  REWARDS,
  SURVEYS,
  type IClock,
  type IRewards,
  type ISurvey,
  type StoredSurvey,
} from '../../contracts';
import { DynamicRecordEntity, SurveyEntity } from '../../db/entities';
import { ClockModule } from '../clock/clock.module';
import { RewardsModule } from '../rewards/rewards.module';

/**
 * STUB. Real version in Sprint 2 (PB-17, optional stretch for M4 in Sprint 1).
 * TODO: in one transaction store the survey and one dynamic_records row per
 * answered category (crowd via RT-020 mapping; "not_used" Wi-Fi ignored), then
 * call IRewards.awardForSurvey (in-app surveys earn points too: CON-001, OD-27)
 * and emit DomainEvent.SurveyStored -> Conditions.
 */
@Injectable()
export class StubSurveysService implements ISurvey {
  constructor(
    @Inject(REWARDS) private readonly rewards: IRewards,
    private readonly events: EventEmitter2,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async submit(): Promise<StoredSurvey> {
    throw AppError.notImplemented('Surveys', 'Sprint 2');
  }

  async purgeExpired(): Promise<number> {
    return 0;
  }
}

/** Surveys. Provides ISurvey. Uses IRewards, IClock; publishes SurveyStored -> Conditions. */
@Module({
  imports: [
    TypeOrmModule.forFeature([SurveyEntity, DynamicRecordEntity]),
    RewardsModule,
    ClockModule,
  ],
  providers: [{ provide: SURVEYS, useClass: StubSurveysService }],
  exports: [SURVEYS],
})
export class SurveysModule {}
