import type { Repository } from 'typeorm';
import { DomainEvent } from '../../src/common/events/domain-events';
import { CONFIG_DEFAULTS, type IConfig } from '../../src/contracts';
import { PresenceRecordEntity, PresenceVisitEntity, VenueEntity } from '../../src/db/entities';
import { FakeClock } from '../../src/modules/clock/fake-clock';
import { PresenceService } from '../../src/modules/presence/presence.service';

const USER = '6f1c2a10-0000-4000-8000-000000000001';
const VENUE = '6f1c2a10-0000-4000-8000-000000000002';

describe('PresenceService', () => {
  it('emits one dwell event after the candidate reaches the dwell threshold', async () => {
    const clock = new FakeClock('2026-10-27T10:16:00+03:00');
    const startedAt = new Date(clock.now().getTime() - 16 * 60_000);
    const visit = {
      id: 'visit-1',
      userId: USER,
      venueId: VENUE,
      active: true,
      startedAt,
      lastSeenAt: new Date(clock.now().getTime() - 60_000),
      promptedAt: null,
    } as PresenceVisitEntity;
    const txVisits = {
      findOne: jest.fn().mockResolvedValue(visit),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      update: jest.fn(),
    };
    const visits = {
      manager: {
        transaction: jest.fn(async (work) =>
          work({
            query: jest.fn(),
            getRepository: () => txVisits,
          }),
        ),
      },
      update: jest.fn(),
    };
    const events = { emit: jest.fn() };
    const venues = {
      createQueryBuilder: () => {
        const query = {
          select: () => query,
          where: () => query,
          andWhere: () => query,
          orderBy: () => query,
          addOrderBy: () => query,
          getRawOne: async () => ({ id: VENUE }),
        };
        return query;
      },
    };
    const config = {
      get: async (key: keyof typeof CONFIG_DEFAULTS) => CONFIG_DEFAULTS[key],
    } as IConfig;
    const service = new PresenceService(
      { save: jest.fn() } as unknown as Repository<PresenceRecordEntity>,
      visits as unknown as Repository<PresenceVisitEntity>,
      venues as unknown as Repository<VenueEntity>,
      config,
      clock,
      events as never,
    );

    await service.reportLocation(USER, 30, 31, false);
    await service.reportLocation(USER, 30, 31, false);

    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(DomainEvent.PresenceDwell, {
      userId: USER,
      venueId: VENUE,
      since: startedAt,
    });
    expect(txVisits.save).toHaveBeenCalledWith(
      expect.objectContaining({ promptedAt: clock.now() }),
    );
  });

  it('does not persist an unconfirmed location sample as crowd presence', async () => {
    const records = { save: jest.fn() };
    const visits = {
      manager: {
        transaction: jest.fn(async (work) =>
          work({
            query: jest.fn(),
            getRepository: () => ({
              findOne: jest.fn().mockResolvedValue(null),
              create: jest.fn((value) => value),
              save: jest.fn(),
              update: jest.fn(),
            }),
          }),
        ),
      },
      update: jest.fn(),
    };
    const venues = {
      createQueryBuilder: () => {
        const query = {
          select: () => query,
          where: () => query,
          andWhere: () => query,
          orderBy: () => query,
          addOrderBy: () => query,
          getRawOne: async () => ({ id: VENUE }),
        };
        return query;
      },
    };
    const service = new PresenceService(
      records as unknown as Repository<PresenceRecordEntity>,
      visits as unknown as Repository<PresenceVisitEntity>,
      venues as unknown as Repository<VenueEntity>,
      { get: async (key: keyof typeof CONFIG_DEFAULTS) => CONFIG_DEFAULTS[key] } as IConfig,
      new FakeClock('2026-10-27T10:00:00+03:00'),
      { emit: jest.fn() } as never,
    );

    await service.reportLocation(USER, 30, 31, false);

    expect(records.save).not.toHaveBeenCalled();
  });
});
