import { QueryFailedError, type Repository } from 'typeorm';
import { AppError } from '../../src/common/errors/app-error';
import { ErrorCode } from '../../src/common/errors/error-codes';
import type { IVenueQuery, VenueDetails } from '../../src/contracts';
import type { FavoriteEntity, UserPreferencesEntity } from '../../src/db/entities';
import { FakeClock } from '../../src/modules/clock/fake-clock';
import {
  FavoritesService,
  PreferencesService,
} from '../../src/modules/venues/preferences-favorites.service';

/**
 * TC-M1-43..TC-M1-47: rules in the preferences and favorites services that do
 * not need a database (the database behaviour is covered by the integration tests).
 */
const USER = '00000000-0000-4000-8000-000000000001';
const VENUE = '6f1c2a10-0000-4000-8000-000000000002';

/** A query builder mock that records the inserted values and can fail. */
function insertBuilder(fail?: Error) {
  const calls: { values?: unknown; conflict?: unknown } = {};
  const qb = {
    insert: () => qb,
    into: () => qb,
    values: (v: unknown) => ((calls.values = v), qb),
    orUpdate: (...args: unknown[]) => ((calls.conflict = args), qb),
    orIgnore: () => ((calls.conflict = 'ignore'), qb),
    execute: async () => {
      if (fail) throw fail;
      return {};
    },
  };
  return { qb, calls };
}

const fkError = (constraint: string) =>
  new QueryFailedError(
    'INSERT ...',
    [],
    Object.assign(new Error('fk'), { code: '23503', constraint }),
  );

const details = (id: string): VenueDetails =>
  ({
    static: { id, name: `Venue ${id.slice(-1)}` },
    dynamic: {},
    averageRating: 4.5,
    reviewCount: 2,
    reviews: [],
    isFavorite: null,
  }) as unknown as VenueDetails;

describe('PreferencesService', () => {
  it('TC-M1-43 saves only the fields that are set, stamped with the clock time', async () => {
    const clock = new FakeClock('2026-10-27T10:00:00Z');
    const { qb, calls } = insertBuilder();
    const repo = { createQueryBuilder: () => qb } as unknown as Repository<UserPreferencesEntity>;
    const service = new PreferencesService(repo, clock);

    const saved = await service.replace(USER, { noise: 1, wifi: undefined, outlets: false });

    expect(saved).toEqual({ noise: 1, outlets: false });
    expect(calls.values).toEqual({
      userId: USER,
      criteria: { noise: 1, outlets: false },
      updatedAt: new Date('2026-10-27T10:00:00Z'),
    });
    expect(calls.conflict).toEqual([['criteria', 'updated_at'], ['user_id']]);
  });

  it('TC-M1-44 answers NOT_FOUND (not a 500) when the account row does not exist', async () => {
    const { qb } = insertBuilder(fkError('fk_user_preferences_user'));
    const repo = { createQueryBuilder: () => qb } as unknown as Repository<UserPreferencesEntity>;
    const service = new PreferencesService(repo, new FakeClock());
    await expect(service.replace(USER, { noise: 1 })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});

describe('FavoritesService', () => {
  it('TC-M1-45 refuses an unknown venue with NOT_FOUND and stores nothing', async () => {
    const createQueryBuilder = jest.fn();
    const repo = { createQueryBuilder } as unknown as Repository<FavoriteEntity>;
    const venues = { exists: async () => false } as unknown as IVenueQuery;
    const service = new FavoritesService(repo, venues, new FakeClock());

    await expect(service.add(USER, VENUE)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect(createQueryBuilder).not.toHaveBeenCalled();
  });

  it('TC-M1-46 lists only the caller’s rows and skips venues that were removed', async () => {
    const find = jest.fn(async () => [
      { userId: USER, venueId: 'v-1' },
      { userId: USER, venueId: 'v-gone' },
      { userId: USER, venueId: 'v-3' },
    ]);
    const repo = { find } as unknown as Repository<FavoriteEntity>;
    const venues = {
      getDetails: async (id: string) => {
        if (id === 'v-gone') throw AppError.notFound('gone');
        return details(id);
      },
    } as unknown as IVenueQuery;
    const service = new FavoritesService(repo, venues, new FakeClock());

    const items = await service.list(USER);

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER } }));
    expect(items.map((i) => i.id)).toEqual(['v-1', 'v-3']);
    expect(items[0]).toMatchObject({ averageRating: 4.5, reviewCount: 2, distanceMeters: null });
  });

  it('TC-M1-47 still fails loudly on errors other than NOT_FOUND', async () => {
    const repo = {
      find: async () => [{ venueId: 'v-1' }],
    } as unknown as Repository<FavoriteEntity>;
    const venues = {
      getDetails: async () => {
        throw new Error('conditions down');
      },
    } as unknown as IVenueQuery;
    const service = new FavoritesService(repo, venues, new FakeClock());
    await expect(service.list(USER)).rejects.toThrow('conditions down');
  });
});
