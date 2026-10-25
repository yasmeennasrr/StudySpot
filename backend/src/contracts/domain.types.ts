/**
 * Shared domain types used across module contracts and the API.
 * Change only through a pull request approved by every member it affects.
 */

/** Levels are numbered 1..3 wherever rules average them (SDS 6.6). */
export type Level = 1 | 2 | 3;

export type ConditionType = 'crowd' | 'noise' | 'wifi';

/** Crowd: Low/Moderate/High (RT-010). Noise: Quiet/Moderate/Noisy. Wi-Fi: Poor/Average/Good (RT-022). */
export const LEVEL_LABELS: Record<ConditionType, Record<Level, string>> = {
  crowd: { 1: 'Low', 2: 'Moderate', 3: 'High' },
  noise: { 1: 'Quiet', 2: 'Moderate', 3: 'Noisy' },
  wifi: { 1: 'Poor', 2: 'Average', 3: 'Good' },
};

/** The four statuses of SRS 3.9, in fallback order. */
export type ConditionStatusKind = 'current' | 'hours_ago' | 'historical' | 'unavailable';

export type ConditionInput = 'present_users' | 'surveys' | 'audio' | 'historical';

/**
 * One dynamic value as returned to the app and to StudyMatch (RT-004, SDS 6.6.8).
 * The same object drives every label in the app (USE-003, SDS 9 usability tactic).
 */
export interface ConditionValue {
  level: Level | null;
  label: string | null;
  status: ConditionStatusKind;
  /** ISO time of the newest input; set for current and hours_ago values. */
  newestInputAt: string | null;
  /** Kinds of input used (RT-012). */
  basedOn: ConditionInput[];
  /** Crowd and noise are always estimates (USE-004). */
  isEstimate: boolean;
}

export interface VenueConditions {
  venueId: string;
  crowd: ConditionValue;
  noise: ConditionValue;
  wifi: ConditionValue;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type PriceLevel = 1 | 2 | 3 | 4;
export type StudyType = 'individual' | 'group' | 'both';
export type VenueSizeClass = 'small' | 'medium' | 'large';

/** Opening hours per weekday, 0 = Sunday. Times are "HH:MM" in Africa/Cairo; close may be past midnight ("02:00"). */
export type OpeningHours = Partial<
  Record<0 | 1 | 2 | 3 | 4 | 5 | 6, { open: string; close: string }[]>
>;

/** Static information (SRS 1.4, DATA-002). */
export interface VenueStatic {
  id: string;
  name: string;
  location: GeoPoint;
  address: string | null;
  area: string | null;
  openingHours: OpeningHours | null;
  priceLevel: PriceLevel | null;
  wifiAvailable: boolean | null;
  outletsAvailable: boolean | null;
  studyType: StudyType | null;
}

export interface VenueSummary extends VenueStatic {
  distanceMeters: number | null;
  openNow: boolean | null;
  averageRating: number | null;
  reviewCount: number;
  conditions: VenueConditions | null;
}

export interface ReviewView {
  id: string;
  rating: number;
  text: string | null;
  authorDisplayName: string;
  createdAt: string;
}

export interface VenueDetails {
  static: VenueStatic;
  dynamic: VenueConditions;
  averageRating: number | null;
  reviewCount: number;
  reviews: ReviewView[];
  isFavorite: boolean | null;
}

/** Filter criteria of FR-013; also the shape of stored preferences (FR-022). */
export interface FilterCriteria {
  noise?: Level;
  wifi?: Level;
  crowd?: Level;
  outlets?: boolean;
  maxPriceLevel?: PriceLevel;
  openNow?: boolean;
  maxDistanceMeters?: number;
  studyType?: Exclude<StudyType, 'both'>;
}

export type UserRole = 'user' | 'admin' | 'moderator';

/** The signed-in user attached to a request by the auth guard. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}
