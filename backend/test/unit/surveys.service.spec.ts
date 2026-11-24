import type { DataSource, Repository } from 'typeorm';
import { DomainEvent } from '../../src/common/events/domain-events';
import {
  CONFIG_DEFAULTS,
  type IConfig,
  type IRewards,
  type SurveyAnswers,
} from '../../src/contracts';
import { SurveyEntity, VenueEntity } from '../../src/db/entities';
import { FakeClock } from '../../src/modules/clock/fake-clock';
import { SurveysService } from '../../src/modules/surveys/surveys.module';

const USER = '6f1c2a10-0000-4000-8000-000000000001';
const VENUE = '6f1c2a10-0000-4000-8000-000000000002';
const SURVEY = '6f1c2a10-0000-4000-8000-000000000003';

function setup(activeVenue = true) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const tx = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return sql.includes('INSERT INTO surveys') ? [{ id: SURVEY }] : [];
    }),
  };
  const db = {
    transaction: jest.fn(async <T>(work: (manager: typeof tx) => Promise<T>) => work(tx)),
  };
  const surveys = { update: jest.fn(), delete: jest.fn(async () => ({ affected: 2 })) };
  const venues = { exists: jest.fn(async () => activeVenue) };
  const config = {
    get: async (key: keyof typeof CONFIG_DEFAULTS) => CONFIG_DEFAULTS[key],
  } as IConfig;
  const rewards = {
    awardForSurvey: jest.fn(async () => ({ points: 0, reason: 'Points start in Sprint 2.' })),
  } as unknown as IRewards;
  const events = { emit: jest.fn() };
  const clock = new FakeClock('2026-11-25T10:00:00+02:00');
  const service = new SurveysService(
    surveys as unknown as Repository<SurveyEntity>,
    venues as unknown as Repository<VenueEntity>,
    config,
    db as unknown as DataSource,
    rewards,
    events as never,
    clock,
  );
  return { service, queries, tx, surveys, venues, rewards, events, clock, config };
}

const dynamicQueries = (queries: { sql: string; params: unknown[] }[]) =>
  queries.filter(({ sql }) => sql.includes('INSERT INTO dynamic_records'));

describe('SurveysService (PB-17)', () => {
  it('stores optional answers and only writes dynamic inputs for usable answered categories', async () => {
    const { service, queries, surveys, rewards, events, clock } = setup();
    const answers: SurveyAnswers = {
      crowd: 'slightly_crowded',
      noise: 'moderate',
      wifi: 'not_used',
    };

    const result = await service.submit({
      userId: USER,
      venueId: VENUE,
      source: 'in_app',
      answers,
    });

    expect(result).toMatchObject({
      id: SURVEY,
      venueId: VENUE,
      userId: USER,
      source: 'in_app',
      answers,
      submittedAt: clock.now().toISOString(),
      pointsAwarded: 0,
      noPointsReason: 'Points start in Sprint 2.',
    });
    expect(queries[0].params).toEqual([
      VENUE,
      USER,
      'in_app',
      'slightly_crowded',
      'moderate',
      'not_used',
      clock.now(),
    ]);
    expect(dynamicQueries(queries).map(({ params }) => params.slice(1, 4))).toEqual([
      ['crowd', 1, 'in_app_survey'],
      ['noise', 2, 'in_app_survey'],
    ]);
    expect(rewards.awardForSurvey).toHaveBeenCalledWith(expect.objectContaining({ id: SURVEY }));
    expect(surveys.update).toHaveBeenCalledWith(SURVEY, {
      pointsAwarded: 0,
      noPointsReason: 'Points start in Sprint 2.',
    });
    expect(events.emit).toHaveBeenCalledWith(DomainEvent.SurveyStored, {
      surveyId: SURVEY,
      venueId: VENUE,
      userId: USER,
      source: 'in_app',
      submittedAt: clock.now(),
    });
  });

  it.each([
    ['not_crowded', 1],
    ['slightly_crowded', 1],
    ['moderately_crowded', 2],
    ['very_crowded', 3],
  ] as const)('maps crowd answer %s to level %i', async (answer, level) => {
    const { service, queries } = setup();
    await service.submit({
      userId: USER,
      venueId: VENUE,
      source: 'in_app',
      answers: { crowd: answer },
    });
    expect(dynamicQueries(queries).map(({ params }) => params.slice(1, 4))).toEqual([
      ['crowd', level, 'in_app_survey'],
    ]);
  });

  it.each([
    ['poor', 1],
    ['average', 2],
    ['good', 3],
  ] as const)('maps Wi-Fi answer %s to level %i', async (answer, level) => {
    const { service, queries } = setup();
    await service.submit({
      userId: USER,
      venueId: VENUE,
      source: 'in_app',
      answers: { wifi: answer },
    });
    expect(dynamicQueries(queries).map(({ params }) => params.slice(1, 4))).toEqual([
      ['wifi', level, 'in_app_survey'],
    ]);
  });

  it('rejects empty surveys and missing or inactive venues', async () => {
    const empty = setup();
    await expect(
      empty.service.submit({ userId: USER, venueId: VENUE, source: 'in_app', answers: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(empty.venues.exists).not.toHaveBeenCalled();

    const inactive = setup(false);
    await expect(
      inactive.service.submit({
        userId: USER,
        venueId: VENUE,
        source: 'in_app',
        answers: { crowd: 'not_crowded' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(inactive.tx.query).not.toHaveBeenCalled();
  });

  it('purges surveys older than the configured retention period', async () => {
    const { service, surveys, clock } = setup();
    surveys.delete = jest.fn(async () => ({ affected: 2 }));
    expect(await service.purgeExpired()).toBe(2);
    expect(surveys.delete).toHaveBeenCalledWith({
      submittedAt: expect.objectContaining({
        _value: new Date(clock.now().getTime() - 90 * 86_400_000),
      }),
    });
  });
});
