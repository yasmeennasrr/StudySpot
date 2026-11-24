import { Inject, Injectable, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { DomainEvent } from '../../common/events/domain-events';
import {
  CLOCK,
  CONFIG,
  REWARDS,
  SURVEYS,
  type IClock,
  type IConfig,
  type IRewards,
  type ISurvey,
  type SurveyAnswers,
  type StoredSurvey,
} from '../../contracts';
import { DynamicRecordEntity, SurveyEntity, VenueEntity } from '../../db/entities';
import { AccountsModule } from '../accounts/accounts.module';
import { ClockModule } from '../clock/clock.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SurveysController } from './surveys.controller';

/**
 * Stores in-app and QR answers as a survey plus dynamic condition inputs. Rewards
 * are delegated to IRewards so the PB-24 points policy stays in the rewards module.
 */
@Injectable()
export class SurveysService implements ISurvey {
  constructor(
    @InjectRepository(SurveyEntity) private readonly surveys: Repository<SurveyEntity>,
    @InjectRepository(VenueEntity) private readonly venues: Repository<VenueEntity>,
    @Inject(CONFIG) private readonly config: IConfig,
    @InjectDataSource() private readonly db: DataSource,
    @Inject(REWARDS) private readonly rewards: IRewards,
    private readonly events: EventEmitter2,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async submit(input: {
    userId: string;
    venueId: string;
    source: 'qr' | 'in_app';
    answers: SurveyAnswers;
  }): Promise<StoredSurvey> {
    if (!input.answers.crowd && !input.answers.noise && !input.answers.wifi) {
      throw AppError.invalidInput('Answer at least one survey question.');
    }
    if (!(await this.venues.exists({ where: { id: input.venueId, active: true } }))) {
      throw AppError.notFound('This study location was not found. It may have been removed.');
    }

    const submittedAt = this.clock.now();
    const id = await this.db.transaction(async (tx) => {
      const [survey] = await tx.query(
        `INSERT INTO surveys (venue_id, user_id, source, crowd_answer, noise_answer, wifi_answer,
                             submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          input.venueId,
          input.userId,
          input.source,
          input.answers.crowd ?? null,
          input.answers.noise ?? null,
          input.answers.wifi ?? null,
          submittedAt,
        ],
      );

      const records: { type: 'crowd' | 'noise' | 'wifi'; value: number }[] = [];
      if (input.answers.crowd) {
        records.push({
          type: 'crowd',
          value:
            input.answers.crowd === 'very_crowded'
              ? 3
              : input.answers.crowd === 'moderately_crowded'
                ? 2
                : 1,
        });
      }
      if (input.answers.noise) {
        records.push({
          type: 'noise',
          value: input.answers.noise === 'quiet' ? 1 : input.answers.noise === 'moderate' ? 2 : 3,
        });
      }
      if (input.answers.wifi && input.answers.wifi !== 'not_used') {
        records.push({
          type: 'wifi',
          value: input.answers.wifi === 'poor' ? 1 : input.answers.wifi === 'average' ? 2 : 3,
        });
      }
      for (const record of records) {
        await tx.query(
          `INSERT INTO dynamic_records (venue_id, condition_type, value, source_type, recorded_at,
                                       survey_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            input.venueId,
            record.type,
            record.value,
            `${input.source}_survey`,
            submittedAt,
            survey.id,
          ],
        );
      }
      return survey.id as string;
    });

    const stored: StoredSurvey = {
      id,
      venueId: input.venueId,
      userId: input.userId,
      source: input.source,
      answers: input.answers,
      submittedAt: submittedAt.toISOString(),
      pointsAwarded: 0,
      noPointsReason: null,
    };
    this.events.emit(DomainEvent.SurveyStored, {
      surveyId: id,
      venueId: input.venueId,
      userId: input.userId,
      source: input.source,
      submittedAt,
    });

    const award = await this.rewards.awardForSurvey(stored);
    await this.surveys.update(id, {
      pointsAwarded: award.points,
      noPointsReason: award.reason,
    });
    return { ...stored, pointsAwarded: award.points, noPointsReason: award.reason };
  }

  async purgeExpired(): Promise<number> {
    const days = await this.config.get('conditions.historicalDays');
    const before = new Date(this.clock.now().getTime() - days * 86_400_000);
    const result = await this.surveys.delete({ submittedAt: LessThan(before) });
    return result.affected ?? 0;
  }
}

/** Surveys. Provides ISurvey. Uses IRewards, IClock; publishes SurveyStored -> Conditions. */
@Module({
  imports: [
    TypeOrmModule.forFeature([SurveyEntity, DynamicRecordEntity, VenueEntity]),
    AccountsModule,
    ConfigurationModule,
    RewardsModule,
    ClockModule,
  ],
  controllers: [SurveysController],
  providers: [{ provide: SURVEYS, useClass: SurveysService }],
  exports: [SURVEYS],
})
export class SurveysModule {}
