import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import {
  CONDITIONS,
  type IConditions,
  type PriceLevel,
  type ReviewView,
  type VenueDetails,
  type VenueStatic,
} from '../../../contracts';
import { FavoriteEntity, ReviewEntity, VenueEntity } from '../../../db/entities';

const VENUE_MISSING = 'This study location was not found. It may have been removed.';

/** How many reviews the details screen shows, newest first. */
export const REVIEWS_SHOWN = 20;

export interface RatingSummary {
  averageRating: number | null;
  reviewCount: number;
}

/** A venue row as the API's static group (DATA-002). */
export function toVenueStatic(v: VenueEntity): VenueStatic {
  const [lng, lat] = v.location.coordinates;
  return {
    id: v.id,
    name: v.name,
    location: { lat, lng },
    address: v.address,
    area: v.area,
    openingHours: v.openingHours,
    priceLevel: v.priceLevel as PriceLevel | null,
    wifiAvailable: v.wifiAvailable,
    outletsAvailable: v.outletsAvailable,
    studyType: v.studyType,
  };
}

/**
 * Venue details (PB-11, UC-04, FR-016 to FR-021). Owner: M4.
 * Static information comes from the venue row; dynamic values come from
 * IConditions with their status label. The two groups stay separate (FR-019).
 * Reviews hidden by a moderator (removed_at set) are not shown or counted, and an
 * author appears only by display name (PRIV-014). A deactivated venue is not found.
 */
@Injectable()
export class VenueDetailsService {
  constructor(
    @InjectRepository(VenueEntity) private readonly venues: Repository<VenueEntity>,
    @InjectRepository(ReviewEntity) private readonly reviews: Repository<ReviewEntity>,
    @InjectRepository(FavoriteEntity) private readonly favorites: Repository<FavoriteEntity>,
    @Inject(CONDITIONS) private readonly conditions: IConditions,
  ) {}

  async getDetails(venueId: string, viewerUserId?: string): Promise<VenueDetails> {
    const venue = await this.venues.findOne({ where: { id: venueId, active: true } });
    if (!venue) throw AppError.notFound(VENUE_MISSING);

    const [ratings, reviews, dynamic, isFavorite] = await Promise.all([
      this.ratingsFor([venueId]),
      this.visibleReviews(venueId),
      this.conditions.getConditions(venueId),
      viewerUserId
        ? this.favorites.exists({ where: { userId: viewerUserId, venueId } })
        : Promise.resolve(null),
    ]);
    const rating = ratings.get(venueId)!;
    return {
      static: toVenueStatic(venue),
      dynamic,
      averageRating: rating.averageRating,
      reviewCount: rating.reviewCount,
      reviews,
      isFavorite,
    };
  }

  async exists(venueId: string): Promise<boolean> {
    return this.venues.exists({ where: { id: venueId, active: true } });
  }

  /**
   * Average rating (one decimal) and number of visible reviews per venue, in one
   * query. Venues with no review get { null, 0 }. Search results can use it too.
   */
  async ratingsFor(venueIds: string[]): Promise<Map<string, RatingSummary>> {
    const out = new Map<string, RatingSummary>(
      venueIds.map((id) => [id, { averageRating: null, reviewCount: 0 }]),
    );
    if (venueIds.length === 0) return out;
    const rows = await this.reviews
      .createQueryBuilder('r')
      .select('r.venue_id', 'venueId')
      .addSelect('ROUND(AVG(r.rating)::numeric, 1)', 'average')
      .addSelect('COUNT(*)', 'count')
      .where({ venueId: In(venueIds), removedAt: IsNull() })
      .groupBy('r.venue_id')
      .getRawMany<{ venueId: string; average: string; count: string }>();
    for (const row of rows) {
      out.set(row.venueId, { averageRating: Number(row.average), reviewCount: Number(row.count) });
    }
    return out;
  }

  private async visibleReviews(venueId: string): Promise<ReviewView[]> {
    const rows = await this.reviews.find({
      where: { venueId, removedAt: IsNull() },
      relations: { user: true },
      order: { createdAt: 'DESC', id: 'ASC' },
      take: REVIEWS_SHOWN,
    });
    return rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      authorDisplayName: r.user?.displayName ?? 'StudySpot user',
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
