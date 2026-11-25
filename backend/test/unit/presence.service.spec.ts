import type { Repository } from 'typeorm';
import { DomainEvent } from '../../src/common/events/domain-events';
import { CONFIG_DEFAULTS, type IConfig } from '../../src/contracts';
import {
  PresenceRecordEntity,
  PresenceVisitEntity,
  UserEntity,
  VenueEntity,
} from '../../src/db/entities';
import { FakeClock } from '../../src/modules/clock/fake-clock';
import { PresenceService } from '../../src/modules/presence/presence.service';

const USER = '6f1c2a10-0000-4000-8000-000000000001';
const VENUE = '6f1c2a10-0000-4000-8000-000000000002';

describe('PresenceService', () => {
  it('counts confirmed location visits for up to two hours and unions receipt scans by user', async () => {
    const clock = new FakeClock('2026-10-27T10:00:00+03:00');
    const makeQuery = (rows: { userId: string }[]) => {
      type Query = {
        select: (...args: unknown[]) => Query;
        where: (...args: unknown[]) => Query;
        andWhere: (...args: unknown[]) => Query;
        getRawMany: () => Promise<{ userId: string }[]>;
      };
      const query = {} as Query;
      query.select = jest.fn(() => query);
      query.where = jest.fn(() => query);
      query.andWhere = jest.fn(() => query);
      query.getRawMany = jest.fn(async () => rows);
      return query;
    };
    const locationQuery = makeQuery([{ userId: USER }]);
    const scanQuery = makeQuery([
      { userId: USER },
      { userId: '6f1c2a10-0000-4000-8000-000000000003' },
    ]);
    const visits = { createQueryBuilder: () => locationQuery };
    const records = { createQueryBuilder: () => scanQuery };
    const config = {
      get: async (key: keyof typeof CONFIG_DEFAULTS) => CONFIG_DEFAULTS[key],
    } as IConfig;
    const service = new PresenceService(
      records as unknown as Repository<PresenceRecordEntity>,
      visits as unknown as Repository<PresenceVisitEntity>,
      {} as Repository<UserEntity>,
      {} as Repository<VenueEntity>,
      config,
      clock,
      { emit: jest.fn() } as never,
    );

    expect(await service.countPresent(VENUE)).toBe(2);
    expect(locationQuery.andWhere).toHaveBeenCalledWith('presence.lastSeenAt >= :locationSince', {
      locationSince: new Date(clock.now().getTime() - 2 * 3_600_000),
    });
    expect(locationQuery.andWhere).toHaveBeenCalledWith('presence.active = true');
    expect(locationQuery.andWhere).toHaveBeenCalledWith('presence.confirmedAt IS NOT NULL');
  });

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
      {
        findOne: jest.fn().mockResolvedValue({ id: USER, presencePromptsEnabled: true }),
      } as unknown as Repository<UserEntity>,
      venues as unknown as Repository<VenueEntity>,
      config,
      clock,
      events as never,
    );

    await service.reportLocation(USER, 30, 31);
    await service.reportLocation(USER, 30, 31);

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

  it('TC-M4-36 does not persist an unconfirmed location sample as crowd presence', async () => {
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
    const events = { emit: jest.fn() };
    const service = new PresenceService(
      records as unknown as Repository<PresenceRecordEntity>,
      visits as unknown as Repository<PresenceVisitEntity>,
      {
        findOne: jest.fn().mockResolvedValue({ id: USER, presencePromptsEnabled: true }),
      } as unknown as Repository<UserEntity>,
      venues as unknown as Repository<VenueEntity>,
      { get: async (key: keyof typeof CONFIG_DEFAULTS) => CONFIG_DEFAULTS[key] } as IConfig,
      new FakeClock('2026-10-27T10:00:00+03:00'),
      events as never,
    );

    await service.reportLocation(USER, 30, 31);

    expect(records.save).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('ignores location samples when the user has not opted into presence prompts', async () => {
    const venues = { createQueryBuilder: jest.fn() };
    const visits = { manager: { transaction: jest.fn() } };
    const users = {
      findOne: jest.fn().mockResolvedValue({ id: USER, presencePromptsEnabled: false }),
    };
    const service = new PresenceService(
      {} as Repository<PresenceRecordEntity>,
      visits as unknown as Repository<PresenceVisitEntity>,
      users as unknown as Repository<UserEntity>,
      venues as unknown as Repository<VenueEntity>,
      { get: async (key: keyof typeof CONFIG_DEFAULTS) => CONFIG_DEFAULTS[key] } as IConfig,
      new FakeClock('2026-10-27T10:00:00+03:00'),
      { emit: jest.fn() } as never,
    );

    await expect(service.reportLocation(USER, 30, 31)).resolves.toEqual({ venueId: null });
    expect(venues.createQueryBuilder).not.toHaveBeenCalled();
    expect(visits.manager.transaction).not.toHaveBeenCalled();
  });

  it('TC-M4-35 counts only the first yes response and leaves a declined visit unconfirmed', async () => {
    const clock = new FakeClock('2026-10-27T10:20:00+03:00');
    const visit = {
      id: 'visit-1',
      userId: USER,
      venueId: VENUE,
      active: true,
      startedAt: new Date(clock.now().getTime() - 20 * 60_000),
      lastSeenAt: new Date(clock.now().getTime() - 1 * 60_000),
      promptedAt: new Date(clock.now().getTime() - 5 * 60_000),
      confirmedAt: null,
      respondedAt: null,
    } as PresenceVisitEntity;
    const txVisits = {
      findOne: jest.fn().mockResolvedValue(visit),
      save: jest.fn(async (value) => value),
    };
    const records = { save: jest.fn() };
    const visits = {
      manager: {
        transaction: jest.fn(async (work) =>
          work({
            query: jest.fn(),
            getRepository: (entity: unknown) =>
              entity === PresenceVisitEntity ? txVisits : records,
          }),
        ),
      },
    };
    const events = { emit: jest.fn() };
    const service = new PresenceService(
      records as unknown as Repository<PresenceRecordEntity>,
      visits as unknown as Repository<PresenceVisitEntity>,
      {} as Repository<UserEntity>,
      {} as Repository<VenueEntity>,
      { get: async (key: keyof typeof CONFIG_DEFAULTS) => CONFIG_DEFAULTS[key] } as IConfig,
      clock,
      events as never,
    );

    expect(await service.respondToPrompt(USER, VENUE, true)).toBe(true);
    expect(visit.confirmedAt).toEqual(clock.now());
    expect(visit.respondedAt).toEqual(clock.now());
    expect(records.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, venueId: VENUE, source: 'location' }),
    );
    expect(events.emit).toHaveBeenCalledWith(DomainEvent.PresenceChanged, { venueId: VENUE });

    expect(await service.respondToPrompt(USER, VENUE, false)).toBe(false);
    expect(records.save).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('TC-M4-37 invalidates crowd conditions after a receipt check-in', async () => {
    const records = { save: jest.fn() };
    const events = { emit: jest.fn() };
    const service = new PresenceService(
      records as unknown as Repository<PresenceRecordEntity>,
      {} as Repository<PresenceVisitEntity>,
      {} as Repository<UserEntity>,
      {} as Repository<VenueEntity>,
      { get: async (key: keyof typeof CONFIG_DEFAULTS) => CONFIG_DEFAULTS[key] } as IConfig,
      new FakeClock('2026-10-27T10:20:00+03:00'),
      events as never,
    );

    await service.recordReceiptScan(USER, VENUE);

    expect(records.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, venueId: VENUE, source: 'receipt_scan' }),
    );
    expect(events.emit).toHaveBeenCalledWith(DomainEvent.PresenceChanged, { venueId: VENUE });
  });
});
