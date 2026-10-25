import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import {
  VENUE_QUERY,
  type FilterCriteria,
  type IFavorites,
  type IPreferences,
  type IVenueQuery,
  type VenueSummary,
} from '../../contracts';

/**
 * STUB, in memory. Owner: M4 (PB-13, FR-022..FR-024).
 * TODO(M4): store in user_preferences (one row per user, criteria jsonb).
 */
@Injectable()
export class StubPreferencesService implements IPreferences {
  private readonly store = new Map<string, FilterCriteria>();

  async get(userId: string): Promise<FilterCriteria> {
    return this.store.get(userId) ?? {};
  }

  async replace(userId: string, criteria: FilterCriteria): Promise<FilterCriteria> {
    this.store.set(userId, criteria);
    return criteria;
  }

  async clear(userId: string): Promise<void> {
    this.store.delete(userId);
  }
}

/**
 * STUB, in memory. Owner: M4 (PB-14, FR-026, FR-027).
 * TODO(M4): store in favorites (user_id, venue_id); a user sees only their own (SEC-004).
 */
@Injectable()
export class StubFavoritesService implements IFavorites {
  private readonly store = new Map<string, Set<string>>();

  constructor(@Inject(VENUE_QUERY) private readonly venues: IVenueQuery) {}

  async list(userId: string): Promise<VenueSummary[]> {
    const ids = [...(this.store.get(userId) ?? [])];
    const details = await Promise.all(ids.map((id) => this.venues.getDetails(id)));
    return details.map((d) => ({
      ...d.static,
      distanceMeters: null,
      openNow: null,
      averageRating: d.averageRating,
      reviewCount: d.reviewCount,
      conditions: d.dynamic,
    }));
  }

  async add(userId: string, venueId: string): Promise<void> {
    if (!(await this.venues.exists(venueId)))
      throw AppError.notFound('This study location was not found.');
    const set = this.store.get(userId) ?? new Set<string>();
    set.add(venueId);
    this.store.set(userId, set);
  }

  async remove(userId: string, venueId: string): Promise<void> {
    this.store.get(userId)?.delete(venueId);
  }

  async isFavorite(userId: string, venueId: string): Promise<boolean> {
    return this.store.get(userId)?.has(venueId) ?? false;
  }
}
