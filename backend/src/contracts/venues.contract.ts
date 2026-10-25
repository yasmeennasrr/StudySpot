/**
 * Venues & Search (SDS 6.3).
 * Owners: M3 (search, nearby, filters, seed data), M4 (details, preferences,
 * favorites, the IVenueQuery facade). Provider: VenuesModule.
 * Requirements: FR-009..FR-027, DATA-001, DATA-002.
 */
import type { FilterCriteria, GeoPoint, VenueDetails, VenueSummary } from './domain.types';

/** Facade over Venues and Conditions: the one entry point other modules use (SDS 8, Facade). */
export const VENUE_QUERY = Symbol('IVenueQuery');

export interface SearchParams {
  /** Name text (FR-009). */
  q?: string;
  /** Area text, geocoded through IMaps (FR-011). */
  area?: string;
  /** Device location when permission is granted (FR-010). */
  near?: GeoPoint;
  radiusMeters?: number;
  filters?: FilterCriteria;
  limit?: number;
}

export interface SearchResult {
  /** The point distances were measured from, if any. */
  origin: GeoPoint | null;
  items: VenueSummary[];
  /** True when the map/geocoding service failed and only name search ran (EIR-011). */
  degraded: boolean;
}

export interface IVenueQuery {
  search(params: SearchParams): Promise<SearchResult>;
  getDetails(venueId: string, viewerUserId?: string): Promise<VenueDetails>;
  exists(venueId: string): Promise<boolean>;
}

/** Preferences and favorites are part of Venues & Search in the SDS (6.3). */
export const PREFERENCES = Symbol('IPreferences');

export interface IPreferences {
  get(userId: string): Promise<FilterCriteria>;
  replace(userId: string, criteria: FilterCriteria): Promise<FilterCriteria>;
  clear(userId: string): Promise<void>;
}

export const FAVORITES = Symbol('IFavorites');

export interface IFavorites {
  list(userId: string): Promise<VenueSummary[]>;
  add(userId: string, venueId: string): Promise<void>;
  remove(userId: string, venueId: string): Promise<void>;
  isFavorite(userId: string, venueId: string): Promise<boolean>;
}
