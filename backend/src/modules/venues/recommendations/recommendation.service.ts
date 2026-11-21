import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import {
  CLOCK,
  CONFIG,
  PREFERENCES,
  type IClock,
  type IConfig,
  type IPreferences,
  type RecommendCriterion,
  type RecommendParams,
  type RecommendResult,
  type VenueSummary,
} from '../../../contracts';
import { VenueDetailsService } from '../details/venue-details.service';
import { VenueSearchService } from '../search/venue-search.service';
import { rankVenues, withPreferences } from './ranking';

/** Step 1 of SDS 6.6.4: at most the 30 nearest venues are considered. */
export const MAX_CANDIDATES = 30;

/**
 * Ranked recommendations with reasons (PB-30, UC-05, SDS 6.6.4, AI-011 to AI-019). Owner: M4.
 * StudyMatch (PB-29) calls this through IVenueQuery.recommend for its recommend_venues
 * operation (SDS 6.6.8). The backend ranks, not the LLM: the same request gives the
 * same order, and every value, status and reason comes from retrieved data (AI-014).
 *
 * 1. Candidates: venues within the radius of the location or area, the 30 nearest.
 * 2. A candidate failing a required criterion is dropped; if none is left, the 5 best
 *    are returned with allRequirementsMet = false and the unmet requirements named.
 * 3-5. Score per criterion (0..1), times the status factor for crowd, noise and Wi-Fi,
 *    weighted 1 for the request and 0.5 for stored preferences it does not cover.
 * 6. Order by score, then average rating, then distance; the top 5.
 */
@Injectable()
export class RecommendationService {
  constructor(
    private readonly search: VenueSearchService,
    private readonly details: VenueDetailsService,
    @Inject(PREFERENCES) private readonly preferences: IPreferences,
    @Inject(CONFIG) private readonly config: IConfig,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async recommend(params: RecommendParams): Promise<RecommendResult> {
    if (!params.near && !params.area?.trim()) {
      throw AppError.invalidInput(
        'Share your location or name an area, so we know where to look for study places.',
      );
    }
    for (const c of params.criteria) checkCriterion(c);

    const at = params.at ?? this.clock.now();
    const radius = Math.min(
      params.radiusMeters ?? (await this.config.get('search.defaultRadiusMeters')),
      await this.config.get('search.maxRadiusMeters'),
    );
    if (!(radius > 0)) throw AppError.invalidInput('The search radius must be more than 0 m.');

    const found = await this.search.search({
      near: params.near,
      area: params.near ? undefined : params.area,
      radiusMeters: radius,
      limit: MAX_CANDIDATES,
    });
    const ratings = await this.details.ratingsFor(found.items.map((v) => v.id));
    const candidates: VenueSummary[] = found.items.map((v) => ({
      ...v,
      ...(ratings.get(v.id) ?? { averageRating: null, reviewCount: 0 }),
    }));

    const stored =
      params.includePreferences !== false && params.userId
        ? await this.preferences.get(params.userId)
        : null;
    const criteria = withPreferences(params.criteria, stored);
    const { items, allRequirementsMet } = rankVenues(candidates, criteria, radius, at);
    return {
      origin: found.origin,
      radiusMeters: radius,
      items,
      allRequirementsMet: candidates.length === 0 ? false : allRequirementsMet,
      candidates: candidates.length,
      degraded: found.degraded,
    };
  }
}

/** The backend validates every input from the LLM (SEC-007, SDS 6.6.8). */
function checkCriterion(c: RecommendCriterion): void {
  const bad = (what: string) => AppError.invalidInput(`Criterion "${c.name}": ${what}.`);
  switch (c.name) {
    case 'noise':
    case 'crowd':
    case 'wifi':
      if (![1, 2, 3].includes(c.value)) throw bad('the level must be 1, 2 or 3');
      return;
    case 'price':
      if (![1, 2, 3, 4].includes(c.value)) throw bad('the price level must be 1 to 4');
      return;
    case 'openAt':
      if (c.value !== undefined && Number.isNaN(Date.parse(c.value))) {
        throw bad('the time must be an ISO date-time');
      }
      return;
    case 'studyType':
      if (c.value !== 'individual' && c.value !== 'group') {
        throw bad('the study type must be individual or group');
      }
      return;
    case 'distance':
    case 'outlets':
      return;
    default:
      throw AppError.invalidInput(
        `Unknown criterion "${(c as { name: string }).name}". Use noise, crowd, wifi, distance, price, openAt, outlets or studyType.`,
      );
  }
}
