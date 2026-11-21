/**
 * Venues & Search (SDS 6.3).
 * Owners: M3 (search, nearby, filters, seed data), M4 (details, preferences,
 * favorites, the IVenueQuery facade). Provider: VenuesModule.
 * Requirements: FR-009..FR-027, DATA-001, DATA-002.
 */
import type {
  ConditionStatusKind,
  FilterCriteria,
  GeoPoint,
  Level,
  PriceLevel,
  VenueDetails,
  VenueSummary,
} from './domain.types';

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
  /**
   * Ranked recommendations (PB-30, SDS 6.6.4, AI-012): the backend ranks, not the LLM.
   * StudyMatch's recommend_venues operation (SDS 6.6.8) calls this.
   */
  recommend(params: RecommendParams): Promise<RecommendResult>;
}

// ---------------------------------------------------------------- Recommendations (PB-30)

export type CriterionName =
  'noise' | 'crowd' | 'wifi' | 'distance' | 'price' | 'openAt' | 'outlets' | 'studyType';

/**
 * One criterion the LLM extracted (AI-002). `required` is true when the student said
 * need, must or with; otherwise it is preferred (SDS 6.6.4 step 2).
 */
export type RecommendCriterion =
  | { name: 'noise' | 'crowd' | 'wifi'; value: Level; required: boolean }
  /** Nearer is better within the search radius. */
  | { name: 'distance'; required: boolean }
  /** The budget: the highest price level wanted. */
  | { name: 'price'; value: PriceLevel; required: boolean }
  /** Open at this ISO time; now when no time is given. */
  | { name: 'openAt'; value?: string; required: boolean }
  | { name: 'outlets'; required: boolean }
  | { name: 'studyType'; value: 'individual' | 'group'; required: boolean };

export interface RecommendParams {
  /** From the session, never from the LLM (AI-009). Needed to use stored preferences. */
  userId?: string;
  criteria: RecommendCriterion[];
  /** The student's location, or an area name; one of them is required. */
  near?: GeoPoint;
  area?: string;
  /** Default search.defaultRadiusMeters (2 km), at most search.maxRadiusMeters (5 km). */
  radiusMeters?: number;
  /** Add stored preferences the request does not cover, at half weight (FR-022). Default true. */
  includePreferences?: boolean;
  /** For tests; status and "open now" are decided at this time. */
  at?: Date;
}

/** How one venue does on one criterion: what was asked, what the data says, and how sure it is. */
export interface CriterionMatch {
  name: CriterionName;
  source: 'request' | 'preference';
  required: boolean;
  /** 1.0 for the request, 0.5 for a stored preference (SDS 6.6.4 step 5). */
  weight: number;
  /** Level, price level, ISO time, study type, true for outlets; null for distance. */
  requested: Level | PriceLevel | string | boolean | null;
  /** What the data shows: level, metres, price level, open (boolean), outlets, study type; null when missing. */
  actual: Level | PriceLevel | number | string | boolean | null;
  /** For crowd, noise and Wi-Fi only (RT-004); null for static criteria. */
  status: ConditionStatusKind | null;
  newestInputAt: string | null;
  /** 0 to 1, after the status factor. */
  score: number;
  /** The data shows a full match. Missing data is never a match. */
  met: boolean;
}

export interface RankedVenue {
  venue: VenueSummary;
  /** Weighted average of the criterion scores, 0 to 1, rounded to 3 decimals. */
  score: number;
  matches: CriterionMatch[];
  /** Required criteria this venue does not meet (only when nothing meets every requirement). */
  unmetRequired: CriterionName[];
  /** One plain sentence per criterion, from the data only; the LLM may reword them (AI-014). */
  reasons: string[];
}

export interface RecommendResult {
  origin: GeoPoint | null;
  radiusMeters: number;
  /** At most 5, best first. */
  items: RankedVenue[];
  /** False when no candidate meets every required criterion: items are then the 5 best anyway. */
  allRequirementsMet: boolean;
  /** How many venues were considered (at most 30). */
  candidates: number;
  /** True when the maps service failed and the area was matched by name only (EIR-011). */
  degraded: boolean;
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
