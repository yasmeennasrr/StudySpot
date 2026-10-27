import { Injectable } from '@nestjs/common';
import type { IVenueQuery, SearchParams, SearchResult, VenueDetails } from '../../contracts';
import { StubVenueDetailsService } from './details/venue-details.service.stub';
import { VenueSearchService } from './search/venue-search.service';

/**
 * Facade (SDS 8): the one entry point other modules use for venue data.
 * StudyMatch (Sprint 3) calls only this, never the search or details services.
 * Owner: M4. It delegates, so it keeps working when M3 and M4 swap the stubs.
 */
@Injectable()
export class VenueQueryFacade implements IVenueQuery {
  constructor(
    private readonly searchService: VenueSearchService,
    private readonly detailsService: StubVenueDetailsService,
  ) {}

  search(params: SearchParams): Promise<SearchResult> {
    return this.searchService.search(params);
  }

  getDetails(venueId: string): Promise<VenueDetails> {
    return this.detailsService.getDetails(venueId);
  }

  exists(venueId: string): Promise<boolean> {
    return this.detailsService.exists(venueId);
  }
}
