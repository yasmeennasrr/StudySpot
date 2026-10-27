import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdapterUnavailableError, AppError } from '../../../common/errors/app-error';
import {
  CONDITIONS,
  CONFIG,
  MAPS,
  type GeoPoint,
  type IConditions,
  type IConfig,
  type IMaps,
  type SearchParams,
  type SearchResult,
  type VenueSummary,
} from '../../../contracts';
import type { PriceLevel } from '../../../contracts/domain.types';
import { VenueEntity } from '../../../db/entities';

/**
 * Venue search and nearby read path. Owner: M3 (PB-07, PB-08, PB-10).
 * Area resolution stays behind IMaps, dynamic conditions stay behind
 * IConditions, and spatial filtering uses PostGIS geography in the database.
 * FR-013 filters are a separate follow-up; they are not applied here yet.
 */
@Injectable()
export class VenueSearchService {
  private readonly logger = new Logger('VenuesSearch');

  constructor(
    @InjectRepository(VenueEntity) private readonly venues: Repository<VenueEntity>,
    @Inject(MAPS) private readonly maps: IMaps,
    @Inject(CONDITIONS) private readonly conditions: IConditions,
    @Inject(CONFIG) private readonly config: IConfig,
  ) {}

  async search(params: SearchParams): Promise<SearchResult> {
    this.logger.debug({ params }, 'Venues.search');
    let origin: GeoPoint | null = params.near ?? null;
    let degraded = false;

    if (!origin && params.area) {
      try {
        const geo = await this.maps.geocode(params.area);
        if (!geo)
          throw AppError.notFound(
            `We could not find the area "${params.area}". Try a nearby neighbourhood name.`,
          );
        origin = geo.point;
      } catch (err) {
        if (!(err instanceof AdapterUnavailableError)) throw err;
        degraded = true; // EIR-011: fall back to name matching on the area text.
      }
    }

    const configuredRadius = await this.config.get('search.defaultRadiusMeters');
    const maximumRadius = await this.config.get('search.maxRadiusMeters');
    const radius = Math.min(params.radiusMeters ?? configuredRadius, maximumRadius);
    const maximumResults = await this.config.get('search.maxResults');
    const limit = Math.min(params.limit ?? maximumResults, maximumResults, 30);
    const text = (params.q ?? (degraded ? params.area : undefined))?.toLowerCase();

    const query = this.venues.createQueryBuilder('venue').where('venue.active = :active', {
      active: true,
    });
    if (text) {
      query.andWhere(
        '(venue.name ILIKE :searchText OR COALESCE(venue.area, \'\') ILIKE :searchText)',
        { searchText: `%${text}%` },
      );
    }
    if (origin) {
      const point = 'ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography';
      query
        .andWhere(`ST_DWithin(venue.location, ${point}, :radius)`, {
          lat: origin.lat,
          lng: origin.lng,
          radius,
        })
        .addSelect(`ST_Distance(venue.location, ${point})`, 'distanceMeters')
        .orderBy('"distanceMeters"', 'ASC')
        .addOrderBy('venue.id', 'ASC');
    } else {
      query.orderBy('venue.name', 'ASC').addOrderBy('venue.id', 'ASC');
    }
    const { entities, raw } = await query.take(limit).getRawAndEntities();

    const conditions = await this.conditions.getConditionsForMany(entities.map((v) => v.id));
    const items: VenueSummary[] = entities.map((v, index) => ({
      id: v.id,
      name: v.name,
      location: { lat: v.location.coordinates[1], lng: v.location.coordinates[0] },
      address: v.address,
      area: v.area,
      openingHours: v.openingHours,
      priceLevel: v.priceLevel as PriceLevel | null,
      wifiAvailable: v.wifiAvailable,
      outletsAvailable: v.outletsAvailable,
      studyType: v.studyType,
      distanceMeters: origin ? Math.round(Number(raw[index]?.distanceMeters)) : null,
      openNow: null,
      averageRating: null,
      reviewCount: 0,
      conditions: conditions.get(v.id) ?? null,
    }));
    return { origin, items, degraded };
  }
}
