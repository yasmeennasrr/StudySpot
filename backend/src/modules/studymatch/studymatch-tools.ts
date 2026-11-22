import { Inject, Injectable, Logger } from '@nestjs/common';
import { AdapterUnavailableError, AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  CONDITIONS,
  PREFERENCES,
  VENUE_QUERY,
  type ConditionValue,
  type FilterCriteria,
  type GeoPoint,
  type IConditions,
  type IPreferences,
  type IVenueQuery,
  type Level,
  type PriceLevel,
  type RecommendCriterion,
  type VenueConditions,
  type VenueSummary,
} from '../../contracts';

/**
 * The operations the StudyMatch AI may ask for (SDS 6.6.8, EIR-010). Owner: M2.
 *
 * - Read-only (AI-008) and on an allow-list: any other name is refused (AI-007).
 * - The user always comes from the session (`ToolContext`), never from the AI (AI-009).
 * - Every input is checked here before anything runs (SEC-007).
 * - Errors go back to the AI as one of four codes: INVALID_INPUT, NOT_FOUND,
 *   NOT_ALLOWED, UNAVAILABLE.
 * - Every call is logged with name, outcome and time; the user's text is not.
 */

export type ToolErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'NOT_ALLOWED' | 'UNAVAILABLE';

export type ToolOutcome =
  { ok: true; result: unknown } | { ok: false; error: { code: ToolErrorCode; message: string } };

/** Who is asking and from where: set by the orchestrator from the session, never by the AI. */
export interface ToolContext {
  userId: string;
  location?: GeoPoint;
}

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: object;
}

export const TOOL_NAMES = [
  'find_venues',
  'get_venue_details',
  'get_conditions',
  'get_my_preferences',
  'recommend_venues',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

// ------------------------------------------------------------------ words <-> levels

/** The AI speaks in the app's words (RT-010, RT-022); the backend works with levels 1..3. */
const LEVEL_WORDS = {
  noise: ['quiet', 'moderate', 'noisy'],
  crowd: ['low', 'moderate', 'high'],
  wifi: ['poor', 'average', 'good'],
} as const;
type LevelKind = keyof typeof LEVEL_WORDS;

function levelOf(kind: LevelKind, word: unknown, field: string): Level {
  const i = (LEVEL_WORDS[kind] as readonly string[]).indexOf(String(word).toLowerCase());
  if (i < 0) throw bad(`${field} must be one of ${LEVEL_WORDS[kind].join(', ')}`);
  return (i + 1) as Level;
}

// ------------------------------------------------------------------ JSON schemas for Gemini

const levelSchema = (kind: LevelKind) => ({ type: 'string', enum: [...LEVEL_WORDS[kind]] });
const FILTERS_SCHEMA = {
  type: 'object',
  description: 'Optional filters (FR-013). Leave out what the student did not ask for.',
  properties: {
    noise: levelSchema('noise'),
    crowd: levelSchema('crowd'),
    wifi: levelSchema('wifi'),
    outlets: { type: 'boolean', description: 'true = must have power outlets' },
    maxPrice: { type: 'integer', minimum: 1, maximum: 4, description: '1 = cheapest' },
    openNow: { type: 'boolean' },
    studyType: { type: 'string', enum: ['individual', 'group'] },
  },
};
const PLACE_PROPERTIES = {
  area: {
    type: 'string',
    description:
      'Neighbourhood or area named by the student, e.g. "Zamalek". Leave out to use their location.',
  },
  radiusMeters: { type: 'integer', minimum: 100, maximum: 5000, description: 'Default 2000' },
};
const VENUE_ID_SCHEMA = {
  type: 'object',
  properties: {
    venueId: { type: 'string', description: 'The id from find_venues or recommend_venues' },
  },
  required: ['venueId'],
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'find_venues',
    description:
      'Lists study places near the student or in an area, nearest first, with distance, price level and whether open now. Use for browsing; use recommend_venues to rank by what the student wants.',
    parameters: {
      type: 'object',
      properties: {
        ...PLACE_PROPERTIES,
        filters: FILTERS_SCHEMA,
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Default 10' },
      },
    },
  },
  {
    name: 'get_venue_details',
    description:
      'Name, area, opening hours, price level, outlets, study type, average rating and number of reviews of one study place.',
    parameters: VENUE_ID_SCHEMA,
  },
  {
    name: 'get_conditions',
    description:
      'Crowd, noise and Wi-Fi of one study place, each with a label, a status (current, hours_ago, historical, unavailable) and the time of the newest input. Always say the status.',
    parameters: VENUE_ID_SCHEMA,
  },
  {
    name: 'get_my_preferences',
    description: "The student's saved study preferences. Empty when none are saved.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'recommend_venues',
    description:
      'Ranks up to 5 study places for what the student asked, with reasons from real data. Mark a criterion required only when the student said need, must or has to.',
    parameters: {
      type: 'object',
      properties: {
        criteria: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                enum: [
                  'noise',
                  'crowd',
                  'wifi',
                  'distance',
                  'price',
                  'openAt',
                  'outlets',
                  'studyType',
                ],
              },
              value: {
                type: 'string',
                description:
                  'noise: quiet/moderate/noisy; crowd: low/moderate/high; wifi: poor/average/good; price: 1-4 (highest wanted); openAt: ISO time (empty = now); studyType: individual/group; distance and outlets: no value',
              },
              required: { type: 'boolean' },
            },
            required: ['name', 'required'],
          },
        },
        ...PLACE_PROPERTIES,
        includePreferences: {
          type: 'boolean',
          description: 'Also use saved preferences the request does not mention. Default true.',
        },
      },
      required: ['criteria'],
    },
  },
];

// ------------------------------------------------------------------ input checks

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(message: string): AppError {
  return AppError.invalidInput(`Invalid input: ${message}.`);
}

type Args = Record<string, unknown>;

function onlyKeys(args: Args, allowed: string[], where = 'arguments'): void {
  const extra = Object.keys(args).filter((k) => !allowed.includes(k));
  if (extra.length) throw bad(`unknown ${where}: ${extra.join(', ')}`);
}

function venueIdOf(args: Args): string {
  onlyKeys(args, ['venueId']);
  const id = args.venueId;
  if (typeof id !== 'string' || !UUID.test(id)) throw bad('venueId must be a venue id (UUID)');
  return id;
}

function intIn(value: unknown, min: number, max: number, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw bad(`${field} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

function boolOf(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw bad(`${field} must be true or false`);
  return value;
}

function areaOf(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > 100) {
    throw bad('area must be 2 to 100 characters');
  }
  return value.trim();
}

function filtersOf(value: unknown): FilterCriteria | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw bad('filters must be an object');
  const f = value as Args;
  onlyKeys(f, ['noise', 'crowd', 'wifi', 'outlets', 'maxPrice', 'openNow', 'studyType'], 'filters');
  const out: FilterCriteria = {};
  for (const kind of ['noise', 'crowd', 'wifi'] as const) {
    if (f[kind] !== undefined) out[kind] = levelOf(kind, f[kind], `filters.${kind}`);
  }
  const outlets = boolOf(f.outlets, 'filters.outlets');
  if (outlets !== undefined) out.outlets = outlets;
  const maxPrice = intIn(f.maxPrice, 1, 4, 'filters.maxPrice');
  if (maxPrice !== undefined) out.maxPriceLevel = maxPrice as PriceLevel;
  const openNow = boolOf(f.openNow, 'filters.openNow');
  if (openNow !== undefined) out.openNow = openNow;
  if (f.studyType !== undefined) {
    if (f.studyType !== 'individual' && f.studyType !== 'group') {
      throw bad('filters.studyType must be individual or group');
    }
    out.studyType = f.studyType;
  }
  return out;
}

function criteriaOf(value: unknown): RecommendCriterion[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    throw bad('criteria must be a list of 1 to 8 criteria');
  }
  return value.map((raw, i): RecommendCriterion => {
    if (!raw || typeof raw !== 'object') throw bad(`criteria[${i}] must be an object`);
    const c = raw as Args;
    onlyKeys(c, ['name', 'value', 'required'], `criteria[${i}] fields`);
    const required = boolOf(c.required, `criteria[${i}].required`) ?? false;
    const field = `criteria[${i}].value`;
    switch (c.name) {
      case 'noise':
      case 'crowd':
      case 'wifi':
        return { name: c.name, value: levelOf(c.name, c.value, field), required };
      case 'price':
        return { name: 'price', value: intIn(c.value, 1, 4, field) as PriceLevel, required };
      case 'openAt': {
        if (c.value === undefined || c.value === null || c.value === '') {
          return { name: 'openAt', required };
        }
        if (typeof c.value !== 'string' || Number.isNaN(Date.parse(c.value))) {
          throw bad(`${field} must be an ISO date-time`);
        }
        return { name: 'openAt', value: c.value, required };
      }
      case 'studyType':
        if (c.value !== 'individual' && c.value !== 'group') {
          throw bad(`${field} must be individual or group`);
        }
        return { name: 'studyType', value: c.value, required };
      case 'distance':
      case 'outlets':
        return { name: c.name, required };
      default:
        throw bad(
          `criteria[${i}].name must be noise, crowd, wifi, distance, price, openAt, outlets or studyType`,
        );
    }
  });
}

// ------------------------------------------------------------------ compact results for the AI

function conditionOut(v: ConditionValue) {
  return { label: v.label, status: v.status, newestInputAt: v.newestInputAt };
}

function conditionsOut(c: VenueConditions | null) {
  if (!c) return null;
  return { crowd: conditionOut(c.crowd), noise: conditionOut(c.noise), wifi: conditionOut(c.wifi) };
}

function venueOut(v: VenueSummary) {
  return {
    id: v.id,
    name: v.name,
    area: v.area,
    distanceMeters: v.distanceMeters === null ? null : Math.round(v.distanceMeters),
    openNow: v.openNow,
    priceLevel: v.priceLevel,
  };
}

/** Saved levels go back to the AI as the app's words. */
function preferencesOut(p: FilterCriteria) {
  const word = (kind: LevelKind, l?: Level) => (l ? LEVEL_WORDS[kind][l - 1] : undefined);
  return {
    noise: word('noise', p.noise),
    crowd: word('crowd', p.crowd),
    wifi: word('wifi', p.wifi),
    outlets: p.outlets,
    maxPrice: p.maxPriceLevel,
    openNow: p.openNow,
    maxDistanceMeters: p.maxDistanceMeters,
    studyType: p.studyType,
  };
}

// ------------------------------------------------------------------ the tools

@Injectable()
export class StudyMatchTools {
  private readonly logger = new Logger('StudyMatchTools');

  constructor(
    @Inject(VENUE_QUERY) private readonly venues: IVenueQuery,
    @Inject(CONDITIONS) private readonly conditions: IConditions,
    @Inject(PREFERENCES) private readonly preferences: IPreferences,
  ) {}

  readonly definitions = TOOL_DEFINITIONS;

  /** Runs one tool the AI asked for. Never throws: failures come back as a ToolOutcome. */
  async run(name: string, args: unknown, ctx: ToolContext): Promise<ToolOutcome> {
    const started = Date.now();
    let outcome: ToolOutcome;
    try {
      if (!(TOOL_NAMES as readonly string[]).includes(name)) {
        throw AppError.notAllowed(`"${name}" is not an available operation.`);
      }
      const input = (args ?? {}) as Args;
      if (typeof input !== 'object' || Array.isArray(input))
        throw bad('arguments must be an object');
      outcome = { ok: true, result: await this.dispatch(name as ToolName, input, ctx) };
    } catch (err) {
      outcome = { ok: false, error: toToolError(err) };
      if (!(err instanceof AppError) && !(err instanceof AdapterUnavailableError)) {
        this.logger.error({ tool: name, err: String(err) }, 'StudyMatch tool failed unexpectedly');
      }
    }
    this.logger.log(
      {
        tool: name,
        userId: ctx.userId,
        ok: outcome.ok,
        code: outcome.ok ? undefined : outcome.error.code,
        ms: Date.now() - started,
      },
      'StudyMatch tool call',
    );
    return outcome;
  }

  private dispatch(name: ToolName, args: Args, ctx: ToolContext): Promise<unknown> {
    switch (name) {
      case 'find_venues':
        return this.findVenues(args, ctx);
      case 'get_venue_details':
        return this.venueDetails(venueIdOf(args));
      case 'get_conditions':
        return this.venueConditions(venueIdOf(args));
      case 'get_my_preferences':
        onlyKeys(args, []);
        return this.preferences.get(ctx.userId).then(preferencesOut);
      case 'recommend_venues':
        return this.recommend(args, ctx);
    }
  }

  private async findVenues(args: Args, ctx: ToolContext) {
    onlyKeys(args, ['area', 'radiusMeters', 'filters', 'limit']);
    const area = areaOf(args.area);
    const radiusMeters = intIn(args.radiusMeters, 100, 5000, 'radiusMeters') ?? 2000;
    const filters = filtersOf(args.filters);
    const limit = intIn(args.limit, 1, 30, 'limit') ?? 10;
    const near = area ? undefined : ctx.location;
    if (!area && !near) throw noPlace();
    const found = await this.venues.search({ area, near, radiusMeters, filters, limit });
    return { degraded: found.degraded, venues: found.items.map(venueOut) };
  }

  private async venueDetails(venueId: string) {
    const d = await this.venues.getDetails(venueId);
    const s = d.static;
    return {
      id: s.id,
      name: s.name,
      area: s.area,
      address: s.address,
      openingHours: s.openingHours,
      priceLevel: s.priceLevel,
      wifiAvailable: s.wifiAvailable,
      outletsAvailable: s.outletsAvailable,
      studyType: s.studyType,
      averageRating: d.averageRating,
      reviewCount: d.reviewCount,
    };
  }

  private async venueConditions(venueId: string) {
    if (!(await this.venues.exists(venueId))) {
      throw AppError.notFound('That study place could not be found.');
    }
    return conditionsOut(await this.conditions.getConditions(venueId));
  }

  private async recommend(args: Args, ctx: ToolContext) {
    onlyKeys(args, ['criteria', 'area', 'radiusMeters', 'includePreferences']);
    const criteria = criteriaOf(args.criteria);
    const area = areaOf(args.area);
    const radiusMeters = intIn(args.radiusMeters, 100, 5000, 'radiusMeters');
    const includePreferences = boolOf(args.includePreferences, 'includePreferences') ?? true;
    const near = area ? undefined : ctx.location;
    if (!area && !near) throw noPlace();
    // PB-30 (Omar): the backend ranks, not the LLM (AI-012).
    const r = await this.venues.recommend({
      userId: ctx.userId,
      criteria,
      near,
      area,
      radiusMeters,
      includePreferences,
    });
    return {
      allRequirementsMet: r.allRequirementsMet,
      degraded: r.degraded,
      venues: r.items.map((item) => ({
        ...venueOut(item.venue),
        conditions: conditionsOut(item.venue.conditions),
        unmetRequired: item.unmetRequired,
        reasons: item.reasons,
      })),
    };
  }
}

function noPlace(): AppError {
  return AppError.invalidInput(
    'No place to search: the student has not shared a location. Ask which area they want.',
  );
}

/** Any error -> one of the four SDS 6.6.8 codes, with a message safe to show. */
export function toToolError(err: unknown): { code: ToolErrorCode; message: string } {
  if (err instanceof AdapterUnavailableError) {
    return { code: 'UNAVAILABLE', message: 'A service needed for this is unavailable right now.' };
  }
  if (err instanceof AppError) {
    switch (err.code) {
      case ErrorCode.INVALID_INPUT:
        return { code: 'INVALID_INPUT', message: err.message };
      case ErrorCode.NOT_FOUND:
        return { code: 'NOT_FOUND', message: err.message };
      case ErrorCode.NOT_ALLOWED:
      case ErrorCode.UNAUTHENTICATED:
        return { code: 'NOT_ALLOWED', message: err.message };
      default:
        return { code: 'UNAVAILABLE', message: 'This information is unavailable right now.' };
    }
  }
  return { code: 'UNAVAILABLE', message: 'This information is unavailable right now.' };
}
