import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  CLOCK,
  VENUE_QUERY,
  type FilterCriteria,
  type IClock,
  type IFavorites,
  type IPreferences,
  type IVenueQuery,
  type VenueSummary,
} from '../../contracts';
import { FavoriteEntity, UserPreferencesEntity } from '../../db/entities';

const ACCOUNT_MISSING = 'Your account could not be found. Please sign in again.';
const VENUE_MISSING = 'This study location was not found. It may have been removed.';

/** The Postgres foreign-key constraint a failed insert hit, if any (error 23503). */
function violatedForeignKey(err: unknown): string | null {
  if (!(err instanceof QueryFailedError)) return null;
  const driver = err.driverError as { code?: string; constraint?: string } | undefined;
  return driver?.code === '23503' ? (driver.constraint ?? '') : null;
}

/** Keeps only the fields that are set, so the stored jsonb has no nulls or undefined keys. */
function compact(criteria: FilterCriteria): FilterCriteria {
  return Object.fromEntries(
    Object.entries(criteria).filter(([, v]) => v !== undefined && v !== null),
  ) as FilterCriteria;
}

/**
 * Saved search preferences (PB-13, FR-022..FR-024). One row per user in
 * `user_preferences`; the criteria are stored as jsonb in the same shape as
 * search filters, so the app can apply them to a search unchanged.
 * Own data only (SEC-004): the user id always comes from the access token.
 */
@Injectable()
export class PreferencesService implements IPreferences {
  constructor(
    @InjectRepository(UserPreferencesEntity)
    private readonly repo: Repository<UserPreferencesEntity>,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async get(userId: string): Promise<FilterCriteria> {
    const row = await this.repo.findOne({ where: { userId } });
    return row?.criteria ?? {};
  }

  async replace(userId: string, criteria: FilterCriteria): Promise<FilterCriteria> {
    const clean = compact(criteria);
    try {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(UserPreferencesEntity)
        .values({ userId, criteria: clean, updatedAt: this.clock.now() })
        .orUpdate(['criteria', 'updated_at'], ['user_id'])
        .execute();
    } catch (err) {
      if (violatedForeignKey(err) !== null) throw AppError.notFound(ACCOUNT_MISSING);
      throw err;
    }
    return clean;
  }

  async clear(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }
}

/**
 * Favorites (PB-14, FR-026, FR-027). Rows in `favorites` (user_id, venue_id).
 * Adding and removing are idempotent (PUT/DELETE). A user only ever reads or
 * changes their own list (SEC-004): every query is filtered by the caller's id.
 * Venue data comes through IVenueQuery, so the list shows the same summary
 * (conditions with status labels) as search results.
 */
@Injectable()
export class FavoritesService implements IFavorites {
  private readonly logger = new Logger('VenuesFavorites');

  constructor(
    @InjectRepository(FavoriteEntity) private readonly repo: Repository<FavoriteEntity>,
    @Inject(VENUE_QUERY) private readonly venues: IVenueQuery,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async list(userId: string): Promise<VenueSummary[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC', venueId: 'ASC' },
    });
    const items = await Promise.all(rows.map((r) => this.summaryOrNull(r.venueId)));
    return items.filter((v): v is VenueSummary => v !== null);
  }

  async add(userId: string, venueId: string): Promise<void> {
    if (!(await this.venues.exists(venueId))) throw AppError.notFound(VENUE_MISSING);
    try {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(FavoriteEntity)
        .values({ userId, venueId, createdAt: this.clock.now() })
        .orIgnore()
        .execute();
    } catch (err) {
      const fk = violatedForeignKey(err);
      if (fk === 'fk_favorites_user') throw AppError.notFound(ACCOUNT_MISSING);
      if (fk !== null) throw AppError.notFound(VENUE_MISSING);
      throw err;
    }
  }

  async remove(userId: string, venueId: string): Promise<void> {
    await this.repo.delete({ userId, venueId });
  }

  async isFavorite(userId: string, venueId: string): Promise<boolean> {
    return this.repo.exists({ where: { userId, venueId } });
  }

  /** A favorite whose venue was removed since is skipped, not an error. */
  private async summaryOrNull(venueId: string): Promise<VenueSummary | null> {
    try {
      const d = await this.venues.getDetails(venueId);
      return {
        ...d.static,
        distanceMeters: null,
        openNow: null,
        averageRating: d.averageRating,
        reviewCount: d.reviewCount,
        conditions: d.dynamic,
      };
    } catch (err) {
      if (err instanceof AppError && err.code === ErrorCode.NOT_FOUND) {
        this.logger.debug({ venueId }, 'favorite points to a venue that no longer exists');
        return null;
      }
      throw err;
    }
  }
}
