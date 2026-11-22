/**
 * Ranking rules of SDS 6.6.4 (AI-012, AI-014), as pure functions so every rule can
 * be tested without a database. Owner: M4. RecommendationService feeds them.
 */
import {
  LEVEL_LABELS,
  type ConditionStatusKind,
  type ConditionType,
  type ConditionValue,
  type CriterionMatch,
  type CriterionName,
  type FilterCriteria,
  type Level,
  type RankedVenue,
  type RecommendCriterion,
  type VenueSummary,
} from '../../../contracts';
import { isOpenNow } from '../search/venue-search.service';

/** Step 4: how much a dynamic value counts, by its status. */
export const STATUS_FACTOR: Record<ConditionStatusKind, number> = {
  current: 1,
  hours_ago: 0.9,
  historical: 0.75,
  unavailable: 0,
};

/** Step 5: a criterion in the request counts fully; a stored preference half. */
export const REQUEST_WEIGHT = 1;
export const PREFERENCE_WEIGHT = 0.5;

/** Step 6: how many venues are returned. */
export const MAX_RECOMMENDATIONS = 5;

export interface WeightedCriterion {
  criterion: RecommendCriterion;
  source: 'request' | 'preference';
  weight: number;
}

const DYNAMIC = new Set<CriterionName>(['noise', 'crowd', 'wifi']);
const NOUN: Record<ConditionType, string> = { noise: 'Noise', crowd: 'Crowd', wifi: 'Wi-Fi' };

/**
 * The request's criteria at weight 1, then every stored preference the request does
 * not already cover at weight 0.5. Preferences are never required.
 */
export function withPreferences(
  criteria: RecommendCriterion[],
  preferences: FilterCriteria | null,
): WeightedCriterion[] {
  const out: WeightedCriterion[] = [];
  const seen = new Set<CriterionName>();
  for (const c of criteria) {
    if (seen.has(c.name)) continue; // the first mention wins
    seen.add(c.name);
    out.push({ criterion: c, source: 'request', weight: REQUEST_WEIGHT });
  }
  const add = (c: RecommendCriterion) => {
    if (seen.has(c.name)) return;
    seen.add(c.name);
    out.push({ criterion: c, source: 'preference', weight: PREFERENCE_WEIGHT });
  };
  const p = preferences ?? {};
  if (p.noise) add({ name: 'noise', value: p.noise, required: false });
  if (p.crowd) add({ name: 'crowd', value: p.crowd, required: false });
  if (p.wifi) add({ name: 'wifi', value: p.wifi, required: false });
  if (p.maxPriceLevel) add({ name: 'price', value: p.maxPriceLevel, required: false });
  if (p.openNow) add({ name: 'openAt', required: false });
  if (p.outlets) add({ name: 'outlets', required: false });
  if (p.studyType) add({ name: 'studyType', value: p.studyType, required: false });
  if (p.maxDistanceMeters) add({ name: 'distance', required: false });
  return out;
}

/** Step 3 and 4 for one venue and one criterion. Missing data scores 0 and never matches. */
export function matchCriterion(
  venue: VenueSummary,
  wc: WeightedCriterion,
  radiusMeters: number,
  at: Date,
): CriterionMatch {
  const c = wc.criterion;
  const base = {
    name: c.name,
    source: wc.source,
    required: c.required,
    weight: wc.weight,
    status: null,
    newestInputAt: null,
  };
  switch (c.name) {
    case 'noise':
    case 'crowd':
    case 'wifi': {
      const value: ConditionValue | undefined = venue.conditions?.[c.name];
      const status = value?.status ?? 'unavailable';
      const level = value?.level ?? null;
      const gap = level === null ? null : Math.abs(level - c.value);
      const match = gap === null ? 0 : gap === 0 ? 1 : gap === 1 ? 0.5 : 0;
      return {
        ...base,
        requested: c.value,
        actual: level,
        status,
        newestInputAt: value?.newestInputAt ?? null,
        score: round(match * STATUS_FACTOR[status]),
        met: match === 1 && status !== 'unavailable',
      };
    }
    case 'distance': {
      const d = venue.distanceMeters;
      if (d === null) return { ...base, requested: null, actual: null, score: 0, met: false };
      return {
        ...base,
        requested: null,
        actual: d,
        score: round(Math.max(0, 1 - d / radiusMeters)),
        met: d <= radiusMeters,
      };
    }
    case 'price': {
      const level = venue.priceLevel;
      if (level === null)
        return { ...base, requested: c.value, actual: null, score: 0, met: false };
      const over = (level - c.value) / c.value;
      const score = over <= 0 ? 1 : over <= 0.25 ? 0.5 : 0;
      return { ...base, requested: c.value, actual: level, score, met: score === 1 };
    }
    case 'openAt': {
      const when = c.value ? new Date(c.value) : at;
      const open = isOpenNow(venue.openingHours, when);
      return {
        ...base,
        requested: c.value ?? null,
        actual: open,
        score: open ? 1 : 0,
        met: open === true,
      };
    }
    case 'outlets': {
      const has = venue.outletsAvailable;
      return { ...base, requested: true, actual: has, score: has ? 1 : 0, met: has === true };
    }
    case 'studyType': {
      const type = venue.studyType;
      const ok = type !== null && (type === 'both' || type === c.value);
      return { ...base, requested: c.value, actual: type, score: ok ? 1 : 0, met: ok };
    }
  }
}

/** Step 5: the weighted average of the criterion scores; 0 when there are no criteria. */
export function weightedScore(matches: CriterionMatch[]): number {
  const total = matches.reduce((sum, m) => sum + m.weight, 0);
  if (total === 0) return 0;
  return round(matches.reduce((sum, m) => sum + m.weight * m.score, 0) / total);
}

/**
 * Steps 2 to 6. Drops candidates that fail a required criterion; if none is left,
 * returns the best candidates anyway with the unmet requirements named.
 */
export function rankVenues(
  candidates: VenueSummary[],
  criteria: WeightedCriterion[],
  radiusMeters: number,
  at: Date,
): { items: RankedVenue[]; allRequirementsMet: boolean } {
  const scored = candidates.map((venue) => {
    const matches = criteria.map((wc) => matchCriterion(venue, wc, radiusMeters, at));
    const unmet = matches.filter((m) => m.required && !m.met).map((m) => m.name);
    return { venue, matches, unmet, score: weightedScore(matches) };
  });
  const meetAll = scored.filter((s) => s.unmet.length === 0);
  const allRequirementsMet = meetAll.length > 0;
  const pool = allRequirementsMet ? meetAll : scored;
  pool.sort(byRank);
  const items = pool.slice(0, MAX_RECOMMENDATIONS).map((s) => ({
    venue: s.venue,
    score: s.score,
    matches: s.matches,
    unmetRequired: s.unmet,
    reasons: s.matches.map((m) => reasonFor(m, at)),
  }));
  return { items, allRequirementsMet };
}

/** Step 6: score, then the higher average rating, then the nearer venue; then name and id so the order never changes. */
function byRank(
  a: { venue: VenueSummary; score: number },
  b: { venue: VenueSummary; score: number },
): number {
  return (
    b.score - a.score ||
    (b.venue.averageRating ?? -1) - (a.venue.averageRating ?? -1) ||
    (a.venue.distanceMeters ?? Infinity) - (b.venue.distanceMeters ?? Infinity) ||
    a.venue.name.localeCompare(b.venue.name) ||
    a.venue.id.localeCompare(b.venue.id)
  );
}

/**
 * A plain sentence from the data only (AI-014): what the value is, how fresh it is,
 * and whether it meets the request. Never claims a match the data does not show.
 */
export function reasonFor(m: CriterionMatch, at: Date): string {
  const mine = m.source === 'preference' ? ' (your saved preference)' : '';
  if (DYNAMIC.has(m.name)) {
    const type = m.name as ConditionType;
    const noun = NOUN[type];
    const wanted = LEVEL_LABELS[type][m.requested as Level];
    if (m.actual === null || m.status === 'unavailable') {
      return `${noun}: no recent information, so we cannot say if it is ${wanted.toLowerCase()}${mine}`;
    }
    const label = LEVEL_LABELS[type][m.actual as Level];
    const when =
      m.status === 'current'
        ? `${label} now`
        : m.status === 'hours_ago'
          ? `${label} ${hoursAgo(m.newestInputAt, at)}`
          : `usually ${label} at this time (estimate from past weeks)`;
    return m.met ? `${noun}: ${when}${mine}` : `${noun}: ${when}; you asked for ${wanted}${mine}`;
  }
  switch (m.name) {
    case 'distance':
      return m.actual === null
        ? `Distance not known${mine}`
        : `${formatDistance(m.actual as number)} away${mine}`;
    case 'price':
      if (m.actual === null) return `Price not known${mine}`;
      return m.met
        ? `Price level ${m.actual} of 4, within your budget${mine}`
        : `Price level ${m.actual} of 4, above your budget of ${m.requested}${mine}`;
    case 'openAt': {
      const time = m.requested ? `at ${cairoTime(new Date(m.requested as string))}` : 'now';
      if (m.actual === null) return `Opening hours not known${mine}`;
      return `${m.actual ? 'Open' : 'Closed'} ${time}${mine}`;
    }
    case 'outlets':
      if (m.actual === null) return `Power outlets not known${mine}`;
      return `${m.actual ? 'Has' : 'No'} power outlets${mine}`;
    case 'studyType':
      if (m.actual === null) return `Study type not known${mine}`;
      return m.met
        ? `Good for ${m.requested} study${mine}`
        : `Set up for ${m.actual} study, not ${m.requested}${mine}`;
    default:
      return '';
  }
}

function hoursAgo(newestInputAt: string | null, at: Date): string {
  if (!newestInputAt) return 'a few hours ago';
  const hours = Math.max(1, Math.round((at.getTime() - Date.parse(newestInputAt)) / 3_600_000));
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

function cairoTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
