import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { CONDITIONS, type IConditions, type VenueDetails } from '../../../contracts';
import { SAMPLE_VENUES } from '../venue-fixtures';

/**
 * STUB for venue details. Owner: M4 (PB-11).
 * TODO(M4): read the venue, its average rating and visible reviews (removed_at
 * IS NULL, author display name only) from the database; static and dynamic
 * groups stay separate (FR-019).
 */
@Injectable()
export class StubVenueDetailsService {
  private readonly logger = new Logger('VenuesDetails');

  constructor(@Inject(CONDITIONS) private readonly conditions: IConditions) {}

  async getDetails(venueId: string): Promise<VenueDetails> {
    this.logger.debug({ venueId }, 'Venues.getDetails (stub)');
    const venue = SAMPLE_VENUES.find((v) => v.id === venueId);
    if (!venue)
      throw AppError.notFound('This study location was not found. It may have been removed.');
    return {
      static: venue,
      dynamic: await this.conditions.getConditions(venueId),
      averageRating: null,
      reviewCount: 0,
      reviews: [],
      isFavorite: null,
    };
  }

  async exists(venueId: string): Promise<boolean> {
    return SAMPLE_VENUES.some((v) => v.id === venueId);
  }
}
