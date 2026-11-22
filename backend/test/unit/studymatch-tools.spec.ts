import { AdapterUnavailableError, AppError } from '../../src/common/errors/app-error';
import type {
  ConditionValue,
  FilterCriteria,
  IConditions,
  IPreferences,
  IVenueQuery,
  RecommendParams,
  SearchParams,
  VenueConditions,
  VenueSummary,
} from '../../src/contracts';
import {
  StudyMatchTools,
  type ToolContext,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
} from '../../src/modules/studymatch/studymatch-tools';

/**
 * TC-M2-35..TC-M2-40: the StudyMatch tools (PB-29, SDS 6.6.8, AI-007..AI-009, SEC-007).
 * Venues, Conditions and Preferences are fakes that record what they were asked.
 */
const VENUE_ID = '6f1c2a10-0000-4000-8000-000000000001';
const USER: ToolContext = { userId: 'user-from-session', location: { lat: 30.06, lng: 31.22 } };

const value = (label: string): ConditionValue => ({
  level: 1,
  label,
  status: 'current',
  newestInputAt: '2026-11-22T10:00:00Z',
  basedOn: ['surveys'],
  isEstimate: true,
});
const CONDITIONS: VenueConditions = {
  venueId: VENUE_ID,
  crowd: value('Low'),
  noise: value('Quiet'),
  wifi: value('Good'),
};
const VENUE: VenueSummary = {
  id: VENUE_ID,
  name: 'Quiet Corner Zamalek',
  location: { lat: 30.06, lng: 31.22 },
  address: null,
  area: 'Zamalek',
  openingHours: null,
  priceLevel: 2,
  wifiAvailable: true,
  outletsAvailable: true,
  studyType: 'individual',
  distanceMeters: 412.7,
  openNow: true,
  averageRating: 4.5,
  reviewCount: 8,
  conditions: CONDITIONS,
};

function setup(prefs: FilterCriteria = {}) {
  const asked = {
    search: [] as SearchParams[],
    recommend: [] as RecommendParams[],
    preferencesFor: [] as string[],
  };
  const venues = {
    search: async (p: SearchParams) => {
      asked.search.push(p);
      if (p.area === 'Atlantis') throw AppError.notFound('We could not find the area "Atlantis".');
      if (p.area === 'Maps down') throw new AdapterUnavailableError('maps', 'HTTP 503');
      return { origin: null, items: [VENUE], degraded: false };
    },
    getDetails: async (id: string) => {
      if (id !== VENUE_ID) throw AppError.notFound('That study place could not be found.');
      return {
        static: VENUE,
        dynamic: CONDITIONS,
        averageRating: 4.5,
        reviewCount: 8,
        reviews: [],
        isFavorite: null,
      };
    },
    exists: async (id: string) => id === VENUE_ID,
    recommend: async (p: RecommendParams) => {
      asked.recommend.push(p);
      return {
        origin: null,
        radiusMeters: 2000,
        items: [
          {
            venue: VENUE,
            score: 0.9,
            matches: [],
            unmetRequired: [],
            reasons: ['Quiet now (current).'],
          },
        ],
        allRequirementsMet: true,
        candidates: 3,
        degraded: false,
      };
    },
  } as unknown as IVenueQuery;
  const conditions = { getConditions: async () => CONDITIONS } as unknown as IConditions;
  const preferences = {
    get: async (userId: string) => {
      asked.preferencesFor.push(userId);
      return prefs;
    },
  } as unknown as IPreferences;
  return { tools: new StudyMatchTools(venues, conditions, preferences), asked };
}

describe('StudyMatch tools (PB-29, SDS 6.6.8)', () => {
  it('TC-M2-35 only the 5 read-only operations exist; any other name is refused NOT_ALLOWED (AI-007, AI-008)', async () => {
    const { tools } = setup();
    expect(TOOL_DEFINITIONS.map((d) => d.name)).toEqual([...TOOL_NAMES]);
    expect(TOOL_NAMES).toEqual([
      'find_venues',
      'get_venue_details',
      'get_conditions',
      'get_my_preferences',
      'recommend_venues',
    ]);
    for (const name of ['delete_review', 'update_preferences', 'run_sql', '']) {
      const out = await tools.run(name, {}, USER);
      expect(out).toEqual({ ok: false, error: expect.objectContaining({ code: 'NOT_ALLOWED' }) });
    }
  });

  it('TC-M2-36 the user always comes from the session: a userId from the AI is refused (AI-009)', async () => {
    const { tools, asked } = setup({ noise: 1, maxPriceLevel: 2 });
    const sneaky = await tools.run('get_my_preferences', { userId: 'someone-else' }, USER);
    expect(sneaky).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INVALID_INPUT' }),
    });

    const own = await tools.run('get_my_preferences', {}, USER);
    expect(own).toEqual({
      ok: true,
      result: expect.objectContaining({ noise: 'quiet', maxPrice: 2 }),
    });
    expect(asked.preferencesFor).toEqual(['user-from-session']);

    await tools.run(
      'recommend_venues',
      { criteria: [{ name: 'distance', required: false }] },
      USER,
    );
    expect(asked.recommend[0].userId).toBe('user-from-session');
  });

  it('TC-M2-37 inputs are checked before anything runs: radius 5000/5001, bad ids, unknown filters and words', async () => {
    const { tools, asked } = setup();
    const code = async (name: string, args: unknown) => {
      const out = await tools.run(name, args, USER);
      return out.ok ? 'OK' : out.error.code;
    };
    expect(await code('find_venues', { radiusMeters: 5000 })).toBe('OK');
    expect(await code('find_venues', { radiusMeters: 5001 })).toBe('INVALID_INPUT');
    expect(await code('find_venues', { radiusMeters: 99 })).toBe('INVALID_INPUT');
    expect(await code('find_venues', { limit: 31 })).toBe('INVALID_INPUT');
    expect(await code('find_venues', { filters: { parking: true } })).toBe('INVALID_INPUT');
    expect(await code('find_venues', { filters: { noise: 'silent' } })).toBe('INVALID_INPUT');
    expect(await code('get_venue_details', { venueId: '1; DROP TABLE venues' })).toBe(
      'INVALID_INPUT',
    );
    expect(await code('get_conditions', {})).toBe('INVALID_INPUT');
    expect(await code('recommend_venues', { criteria: [] })).toBe('INVALID_INPUT');
    expect(
      await code('recommend_venues', {
        criteria: [{ name: 'noise', value: 'loud', required: true }],
      }),
    ).toBe('INVALID_INPUT');
    expect(await code('find_venues', [])).toBe('INVALID_INPUT');
    expect(asked.search).toHaveLength(1); // only the valid call reached Venues
  });

  it('TC-M2-38 find_venues and recommend_venues pass words as levels and return compact results with status', async () => {
    const { tools, asked } = setup();
    const found = await tools.run(
      'find_venues',
      { area: 'Zamalek', filters: { noise: 'quiet', wifi: 'good', maxPrice: 2, outlets: true } },
      USER,
    );
    expect(asked.search[0]).toEqual({
      area: 'Zamalek',
      near: undefined,
      radiusMeters: 2000,
      filters: { noise: 1, wifi: 3, maxPriceLevel: 2, outlets: true },
      limit: 10,
    });
    expect(found).toEqual({
      ok: true,
      result: {
        degraded: false,
        venues: [
          {
            id: VENUE_ID,
            name: 'Quiet Corner Zamalek',
            area: 'Zamalek',
            distanceMeters: 413,
            openNow: true,
            priceLevel: 2,
          },
        ],
      },
    });

    const ranked = await tools.run(
      'recommend_venues',
      {
        criteria: [
          { name: 'noise', value: 'quiet', required: true },
          { name: 'price', value: '2', required: false },
          { name: 'openAt', value: '', required: false },
        ],
      },
      USER,
    );
    expect(asked.recommend[0]).toMatchObject({
      near: USER.location,
      includePreferences: true,
      criteria: [
        { name: 'noise', value: 1, required: true },
        { name: 'price', value: 2, required: false },
        { name: 'openAt', required: false },
      ],
    });
    expect(ranked.ok && (ranked.result as { venues: unknown[] }).venues[0]).toMatchObject({
      name: 'Quiet Corner Zamalek',
      reasons: ['Quiet now (current).'],
      conditions: { noise: { label: 'Quiet', status: 'current' } },
    });
  });

  it('TC-M2-39 details and conditions of one venue; an unknown venue is NOT_FOUND', async () => {
    const { tools } = setup();
    const details = await tools.run('get_venue_details', { venueId: VENUE_ID }, USER);
    expect(details).toEqual({
      ok: true,
      result: expect.objectContaining({
        name: 'Quiet Corner Zamalek',
        averageRating: 4.5,
        reviewCount: 8,
      }),
    });
    const conditions = await tools.run('get_conditions', { venueId: VENUE_ID }, USER);
    expect(conditions).toEqual({
      ok: true,
      result: {
        crowd: { label: 'Low', status: 'current', newestInputAt: '2026-11-22T10:00:00Z' },
        noise: { label: 'Quiet', status: 'current', newestInputAt: '2026-11-22T10:00:00Z' },
        wifi: { label: 'Good', status: 'current', newestInputAt: '2026-11-22T10:00:00Z' },
      },
    });
    const missing = '6f1c2a10-0000-4000-8000-000000000999';
    for (const name of ['get_venue_details', 'get_conditions']) {
      const out = await tools.run(name, { venueId: missing }, USER);
      expect(out).toEqual({ ok: false, error: expect.objectContaining({ code: 'NOT_FOUND' }) });
    }
  });

  it('TC-M2-40 errors map to the four codes: unknown area NOT_FOUND, maps down UNAVAILABLE, no location INVALID_INPUT', async () => {
    const { tools } = setup();
    const err = async (args: object, ctx = USER) => {
      const out = await tools.run('find_venues', args, ctx);
      return out.ok ? 'OK' : out.error.code;
    };
    expect(await err({ area: 'Atlantis' })).toBe('NOT_FOUND');
    expect(await err({ area: 'Maps down' })).toBe('UNAVAILABLE');
    expect(await err({}, { userId: 'u' })).toBe('INVALID_INPUT');
    expect(await err({})).toBe('OK'); // uses the session location
  });
});
