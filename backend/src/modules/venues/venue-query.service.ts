import { Injectable } from '@nestjs/common';
import type {
  IVenueQuery,
  RecommendParams,
  RecommendResult,
  SearchParams,
  SearchResult,
  VenueDetails,
} from '../../contracts';
import { VenueDetailsService } from './details/venue-details.service';
import { RecommendationService } from './recommendations/recommendation.service';
import { VenueSearchService } from './search/venue-search.service';

/**
 * Facade (SDS 8): the one entry point other modules use for venue data.
 * StudyMatch calls only this, never the search, details or recommendation services.
 * Owner: M4. It delegates, so it keeps working when M3 and M4 swap the stubs.
 */
@Injectable()
export class VenueQueryFacade implements IVenueQuery {
  constructor(
    private readonly searchService: VenueSearchService,
    private readonly detailsService: VenueDetailsService,
    private readonly recommendations: RecommendationService,
  ) {}

  search(params: SearchParams): Promise<SearchResult> {
    return this.searchService.search(params);
  }

  getDetails(venueId: string, viewerUserId?: string): Promise<VenueDetails> {
    return this.detailsService.getDetails(venueId, viewerUserId);
  }

  exists(venueId: string): Promise<boolean> {
    return this.detailsService.exists(venueId);
  }

  recommend(params: RecommendParams): Promise<RecommendResult> {
    return this.recommendations.recommend(params);
  }
}
