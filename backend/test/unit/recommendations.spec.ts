/**
 * Ranked recommendations (PB-30, SDS 6.6.4, AI-012, AI-014) without a database.
 * TC-M4-27 to TC-M4-32. The database path is in test/int/recommendations.int-spec.ts.
 */
import type {
  ConditionStatusKind,
  ConditionValue,
  Level,
  RecommendCriterion,
  VenueSummary,
} from '../../src/contracts';
import {
  matchCriterion,
  PREFERENCE_WEIGHT,
  rankVenues,
  reasonFor,
  weightedScore,
  withPreferences,
  type WeightedCriterion,
} from '../../src/modules/venues/recommendations/ranking';
import { RecommendationService } from '../../src/modules/venues/recommendations/recommendation.service';

// Thursday 2026-11-19 16:00 in Cairo (14:00 UTC).
const AT = new Date('2026-11-19T14:00:00Z');
const HOURS = { 4: [{ open: '09:00', close: '23:00' }] }; // Thursday only

function value(level: Level | null, status: ConditionStatusKind, hoursAgo = 0): ConditionValue {
  return {
    level,
    label: null,
    status,
    newestInputAt:
      status === 'current' || status === 'hours_ago'
        ? new Date(AT.getTime() - hoursAgo * 3_600_000).toISOString()
        : null,
    basedOn: [],
    isEstimate: true,
  };
}

let seq = 0;
function venue(over: Partial<VenueSummary> & { noise?: ConditionValue } = {}): VenueSummary {
  const id = over.id ?? `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const { noise, ...rest } = over;
  return {
    id,
    name: `Venue ${id.slice(-3)}`,
    location: { lat: 30, lng: 31 },
    address: null,
    area: null,
    openingHours: HOURS,
    priceLevel: 2,
    wifiAvailable: true,
    outletsAvailable: true,
    studyType: 'both',
    distanceMeters: 500,
    openNow: true,
    averageRating: null,
    reviewCount: 0,
    conditions: {
      venueId: id,
      crowd: value(1, 'current'),
      noise: noise ?? value(1, 'current'),
      wifi: value(3, 'current'),
    },
    ...rest,
  };
}

const ask = (c: RecommendCriterion): WeightedCriterion => ({
  criterion: c,
  source: 'request',
  weight: 1,
});
const score = (v: VenueSummary, c: RecommendCriterion, radius = 2000) =>
  matchCriterion(v, ask(c), radius, AT);

describe('Ranking rules (SDS 6.6.4)', () => {
  it('TC-M4-27 scores each criterion by the table, times the status factor; missing data scores 0 and never matches', () => {
    const quiet = { name: 'noise', value: 1, required: false } as const;
    // Same level 1.0, one away 0.5, two away 0, unavailable 0.
    expect(score(venue({ noise: value(1, 'current') }), quiet)).toMatchObject({
      score: 1,
      met: true,
    });
    expect(score(venue({ noise: value(2, 'current') }), quiet)).toMatchObject({
      score: 0.5,
      met: false,
    });
    expect(score(venue({ noise: value(3, 'current') }), quiet).score).toBe(0);
    expect(score(venue({ noise: value(null, 'unavailable') }), quiet)).toMatchObject({
      score: 0,
      met: false,
      actual: null,
    });
    // Status factors: hours ago 0.9, historical 0.75.
    expect(score(venue({ noise: value(1, 'hours_ago', 3) }), quiet)).toMatchObject({
      score: 0.9,
      status: 'hours_ago',
      met: true,
    });
    expect(score(venue({ noise: value(1, 'historical') }), quiet).score).toBe(0.75);
    expect(score(venue({ noise: value(2, 'historical') }), quiet).score).toBe(0.375);
    expect(score(venue({ conditions: null }), quiet)).toMatchObject({ score: 0, met: false });

    // Distance: 1 - d / radius, never below 0.
    const near = { name: 'distance', required: false } as const;
    expect(score(venue({ distanceMeters: 500 }), near).score).toBe(0.75);
    expect(score(venue({ distanceMeters: 2000 }), near).score).toBe(0);
    expect(score(venue({ distanceMeters: 3000 }), near).score).toBe(0);
    expect(score(venue({ distanceMeters: null }), near)).toMatchObject({ score: 0, met: false });

    // Price: within the budget 1, otherwise 0; unknown price 0.
    const budget = { name: 'price', value: 2, required: false } as const;
    expect(score(venue({ priceLevel: 1 }), budget).score).toBe(1);
    expect(score(venue({ priceLevel: 2 }), budget).score).toBe(1);
    expect(score(venue({ priceLevel: 3 }), budget).score).toBe(0);
    expect(score(venue({ priceLevel: null }), budget)).toMatchObject({ score: 0, met: false });

    // Opening hours: open at the time asked (now by default); unknown hours 0.
    expect(score(venue(), { name: 'openAt', required: false }).score).toBe(1);
    expect(
      score(venue(), { name: 'openAt', value: '2026-11-19T22:30:00Z', required: false }).score,
    ).toBe(0); // 00:30 on Friday in Cairo
    expect(score(venue({ openingHours: null }), { name: 'openAt', required: false })).toMatchObject(
      { score: 0, met: false, actual: null },
    );

    // Outlets and study type: offered 1, otherwise 0; "both" suits either.
    expect(score(venue(), { name: 'outlets', required: false }).score).toBe(1);
    expect(
      score(venue({ outletsAvailable: false }), { name: 'outlets', required: false }).score,
    ).toBe(0);
    expect(score(venue({ outletsAvailable: null }), { name: 'outlets', required: false }).met).toBe(
      false,
    );
    const group = { name: 'studyType', value: 'group', required: false } as const;
    expect(score(venue({ studyType: 'both' }), group).score).toBe(1);
    expect(score(venue({ studyType: 'group' }), group).score).toBe(1);
    expect(score(venue({ studyType: 'individual' }), group).score).toBe(0);
    expect(score(venue({ studyType: null }), group).met).toBe(false);
  });

  it('TC-M4-28 weighs the request 1.0 and stored preferences 0.5, skipping preferences the request covers', () => {
    const criteria = withPreferences(
      [
        { name: 'noise', value: 1, required: true },
        { name: 'noise', value: 3, required: false }, // a repeat: the first mention wins
      ],
      { noise: 3, wifi: 3, outlets: true, maxPriceLevel: 2, openNow: true, studyType: 'group' },
    );
    expect(criteria.map((c) => [c.criterion.name, c.source, c.weight])).toEqual([
      ['noise', 'request', 1],
      ['wifi', 'preference', PREFERENCE_WEIGHT],
      ['price', 'preference', 0.5],
      ['openAt', 'preference', 0.5],
      ['outlets', 'preference', 0.5],
      ['studyType', 'preference', 0.5],
    ]);
    expect(criteria.every((c) => c.source === 'request' || !c.criterion.required)).toBe(true);
    expect(withPreferences([], null)).toEqual([]);

    // (1 x 1.0 + 0.5 x 0) / 1.5 = 0.667
    const v = venue({ outletsAvailable: false });
    const matches = withPreferences([{ name: 'noise', value: 1, required: false }], {
      outlets: true,
    }).map((wc) => matchCriterion(v, wc, 2000, AT));
    expect(weightedScore(matches)).toBe(0.667);
    expect(weightedScore([])).toBe(0);
  });

  it('TC-M4-29 drops venues that fail a required criterion; when none is left returns the best 5 with the unmet requirement named', () => {
    const outlets = venue({ id: '00000000-0000-4000-8000-0000000000a1', outletsAvailable: true });
    const none = venue({ id: '00000000-0000-4000-8000-0000000000a2', outletsAvailable: false });
    const need = [ask({ name: 'outlets', required: true })];
    const ok = rankVenues([none, outlets], need, 2000, AT);
    expect(ok.allRequirementsMet).toBe(true);
    expect(ok.items.map((i) => i.venue.id)).toEqual([outlets.id]);

    const many = Array.from({ length: 7 }, (_, i) =>
      venue({ outletsAvailable: false, distanceMeters: 100 * (i + 1) }),
    );
    const fallback = rankVenues(
      many,
      [...need, ask({ name: 'distance', required: false })],
      2000,
      AT,
    );
    expect(fallback.allRequirementsMet).toBe(false);
    expect(fallback.items).toHaveLength(5);
    expect(fallback.items.every((i) => i.unmetRequired.join() === 'outlets')).toBe(true);
    expect(fallback.items[0].venue.distanceMeters).toBe(100);
  });

  it('TC-M4-30 orders by score, then higher rating, then nearer, deterministically; the same request gives the same order', () => {
    const want = [ask({ name: 'noise', value: 1, required: false })];
    const a = venue({
      name: 'A',
      noise: value(1, 'current'),
      averageRating: 3,
      distanceMeters: 900,
    });
    const b = venue({
      name: 'B',
      noise: value(1, 'current'),
      averageRating: 4.5,
      distanceMeters: 900,
    });
    const c = venue({
      name: 'C',
      noise: value(1, 'current'),
      averageRating: 4.5,
      distanceMeters: 300,
    });
    const d = venue({
      name: 'D',
      noise: value(1, 'historical'),
      averageRating: 5,
      distanceMeters: 50,
    });
    const e = venue({
      name: 'E',
      noise: value(1, 'current'),
      averageRating: null,
      distanceMeters: 10,
    });
    const order = (list: VenueSummary[]) =>
      rankVenues(list, want, 2000, AT).items.map((i) => i.venue.name);
    // C and B tie on score and rating, C is nearer; A has a lower rating; E has none; D is historical (0.75).
    expect(order([a, b, c, d, e])).toEqual(['C', 'B', 'A', 'E', 'D']);
    expect(order([e, d, c, b, a])).toEqual(['C', 'B', 'A', 'E', 'D']);
    expect(rankVenues([a], want, 2000, AT).items[0]).toMatchObject({
      score: 1,
      unmetRequired: [],
      matches: [{ name: 'noise', requested: 1, actual: 1, status: 'current' }],
    });
  });

  it('TC-M4-31 writes reasons from the data only: they say when a value is old, estimated or missing', () => {
    const quiet: RecommendCriterion = { name: 'noise', value: 1, required: false };
    const reason = (
      v: VenueSummary,
      c: RecommendCriterion,
      source: 'request' | 'preference' = 'request',
    ) => reasonFor(matchCriterion(v, { criterion: c, source, weight: 1 }, 2000, AT), AT);
    expect(reason(venue({ noise: value(1, 'current') }), quiet)).toBe('Noise: Quiet now');
    expect(reason(venue({ noise: value(1, 'hours_ago', 3) }), quiet)).toBe(
      'Noise: Quiet 3 hours ago',
    );
    expect(reason(venue({ noise: value(1, 'historical') }), quiet)).toBe(
      'Noise: usually Quiet at this time (estimate from past weeks)',
    );
    expect(reason(venue({ noise: value(2, 'current') }), quiet)).toBe(
      'Noise: Moderate now; you asked for Quiet',
    );
    expect(reason(venue({ noise: value(null, 'unavailable') }), quiet)).toBe(
      'Noise: no recent information, so we cannot say if it is quiet',
    );
    expect(reason(venue({ distanceMeters: 1234 }), { name: 'distance', required: false })).toBe(
      '1.2 km away',
    );
    expect(reason(venue({ priceLevel: 3 }), { name: 'price', value: 2, required: false })).toBe(
      'Price level 3 of 4, above your budget of 2',
    );
    expect(
      reason(venue(), { name: 'openAt', value: '2026-11-19T16:00:00Z', required: false }),
    ).toBe('Open at 18:00');
    expect(reason(venue({ outletsAvailable: null }), { name: 'outlets', required: false })).toBe(
      'Power outlets not known',
    );
    expect(
      reason(
        venue({ studyType: 'individual' }),
        { name: 'studyType', value: 'group', required: false },
        'preference',
      ),
    ).toBe('Set up for individual study, not group (your saved preference)');
  });
});

describe('RecommendationService', () => {
  const search = jest.fn();
  const ratingsFor = jest.fn();
  const getPreferences = jest.fn();
  const config = {
    get: jest.fn(async (key: string) =>
      key === 'search.defaultRadiusMeters' ? 2000 : key === 'search.maxRadiusMeters' ? 5000 : 30,
    ),
  };
  const service = new RecommendationService(
    { search } as never,
    { ratingsFor } as never,
    { get: getPreferences } as never,
    config as never,
    { now: () => AT },
  );

  beforeEach(() => {
    jest.clearAllMocks();
    search.mockResolvedValue({
      origin: { lat: 30, lng: 31 },
      items: [venue(), venue()],
      degraded: false,
    });
    ratingsFor.mockImplementation(
      async (ids: string[]) =>
        new Map(ids.map((id, i) => [id, { averageRating: i === 1 ? 4.8 : 3.1, reviewCount: 2 }])),
    );
    getPreferences.mockResolvedValue({ outlets: true });
  });

  it('TC-M4-32 validates the input, looks at the 30 nearest within at most 5 km, adds ratings, and uses preferences only for the signed-in user', async () => {
    await expect(service.recommend({ criteria: [] })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(
      service.recommend({
        near: { lat: 30, lng: 31 },
        criteria: [{ name: 'noise', value: 4 as Level, required: false }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      service.recommend({
        near: { lat: 30, lng: 31 },
        criteria: [{ name: 'openAt', value: 'tonight', required: false }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      service.recommend({
        near: { lat: 30, lng: 31 },
        criteria: [{ name: 'wifi_speed', required: false } as never],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(search).not.toHaveBeenCalled();

    const result = await service.recommend({
      near: { lat: 30, lng: 31 },
      radiusMeters: 9000,
      criteria: [{ name: 'noise', value: 1, required: false }],
    });
    expect(search).toHaveBeenCalledWith({
      near: { lat: 30, lng: 31 },
      area: undefined,
      radiusMeters: 5000,
      limit: 30,
    });
    expect(result).toMatchObject({
      radiusMeters: 5000,
      candidates: 2,
      allRequirementsMet: true,
      degraded: false,
    });
    // Same score: the higher-rated venue comes first.
    expect(result.items.map((i) => i.venue.averageRating)).toEqual([4.8, 3.1]);
    expect(getPreferences).not.toHaveBeenCalled(); // no user

    const withUser = await service.recommend({
      userId: 'u1',
      area: 'Zamalek',
      criteria: [{ name: 'noise', value: 1, required: false }],
    });
    expect(search).toHaveBeenLastCalledWith({
      near: undefined,
      area: 'Zamalek',
      radiusMeters: 2000,
      limit: 30,
    });
    expect(getPreferences).toHaveBeenCalledWith('u1');
    expect(withUser.items[0].matches.map((m) => `${m.name}:${m.source}`)).toEqual([
      'noise:request',
      'outlets:preference',
    ]);
    await service.recommend({
      userId: 'u1',
      area: 'Zamalek',
      criteria: [],
      includePreferences: false,
    });
    expect(getPreferences).toHaveBeenCalledTimes(1);

    // No candidate at all: nothing meets the requirements.
    search.mockResolvedValue({ origin: null, items: [], degraded: true });
    expect(await service.recommend({ area: 'Nowhere', criteria: [] })).toMatchObject({
      items: [],
      candidates: 0,
      allRequirementsMet: false,
      degraded: true,
    });
  });
});
