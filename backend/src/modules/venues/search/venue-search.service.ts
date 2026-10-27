import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdapterUnavailableError, AppError } from '../../../common/errors/app-error';
import {
  CONDITIONS,
  CLOCK,
  CONFIG,
  MAPS,
  type GeoPoint,
  type IConditions,
  type IClock,
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
 * FR-013 static and condition filters are applied before the result limit.
 */
@Injectable()
export class VenueSearchService {
  private readonly logger = new Logger('VenuesSearch');

  constructor(
    @InjectRepository(VenueEntity) private readonly venues: Repository<VenueEntity>,
    @Inject(MAPS) private readonly maps: IMaps,
    @Inject(CONDITIONS) private readonly conditions: IConditions,
    @Inject(CONFIG) private readonly config: IConfig,
    @Inject(CLOCK) private readonly clock: IClock,
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
    if (!origin && params.filters?.maxDistanceMeters !== undefined) {
      return { origin: null, items: [], degraded };
    }

    const configuredRadius = await this.config.get('search.defaultRadiusMeters');
    const maximumRadius = await this.config.get('search.maxRadiusMeters');
    const radius = Math.min(
      params.radiusMeters ?? configuredRadius,
      maximumRadius,
      params.filters?.maxDistanceMeters ?? maximumRadius,
    );
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
    if (params.filters?.outlets !== undefined) {
      query.andWhere('venue.outletsAvailable = :outlets', { outlets: params.filters.outlets });
    }
    if (params.filters?.maxPriceLevel !== undefined) {
      query.andWhere('venue.priceLevel <= :maxPriceLevel', {
        maxPriceLevel: params.filters.maxPriceLevel,
      });
    }
    if (params.filters?.studyType !== undefined) {
      query.andWhere('venue.studyType IN (:...studyTypes)', {
        studyTypes: [params.filters.studyType, 'both'],
      });
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
    const now = this.clock.now();
    const items: VenueSummary[] = [];
    const batchSize = Math.max(limit, 30);
    let offset = 0;
    while (items.length < limit) {
      const { entities, raw } = await query
        .clone()
        .skip(offset)
        .take(batchSize)
        .getRawAndEntities();
      if (!entities.length) break;
      offset += entities.length;
      const conditions = await this.conditions.getConditionsForMany(entities.map((v) => v.id));
      for (const [index, venue] of entities.entries()) {
        const item: VenueSummary = {
          id: venue.id,
          name: venue.name,
          location: { lat: venue.location.coordinates[1], lng: venue.location.coordinates[0] },
          address: venue.address,
          area: venue.area,
          openingHours: venue.openingHours,
          priceLevel: venue.priceLevel as PriceLevel | null,
          wifiAvailable: venue.wifiAvailable,
          outletsAvailable: venue.outletsAvailable,
          studyType: venue.studyType,
          distanceMeters: origin ? Math.round(Number(raw[index]?.distanceMeters)) : null,
          openNow: isOpenNow(venue.openingHours, now),
          averageRating: null,
          reviewCount: 0,
          conditions: conditions.get(venue.id) ?? null,
        };
        const criteria = params.filters;
        if (
          criteria?.openNow !== undefined &&
          item.openNow !== criteria.openNow
        ) continue;
        if (criteria?.noise !== undefined && item.conditions?.noise.level !== criteria.noise) continue;
        if (criteria?.wifi !== undefined && item.conditions?.wifi.level !== criteria.wifi) continue;
        if (criteria?.crowd !== undefined && item.conditions?.crowd.level !== criteria.crowd) continue;
        items.push(item);
        if (items.length === limit) break;
      }
      if (entities.length < batchSize) break;
    }
    return { origin, items, degraded };
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Resolve a venue's opening schedule against the contract's Africa/Cairo timezone. */
function isOpenNow(hours: VenueEntity['openingHours'], now: Date): boolean | null {
  if (!hours) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const day = WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]);
  if (day < 0 || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const today = day as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const previous = ((day + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const currentMinute = hour * 60 + minute;
  const toMinute = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  const todayOpen = (hours[today] ?? []).some(({ open, close }) => {
    const start = toMinute(open);
    const end = toMinute(close);
    return start < end
      ? currentMinute >= start && currentMinute < end
      : start > end && currentMinute >= start;
  });
  const overnightOpen = (hours[previous] ?? []).some(({ open, close }) => {
    const start = toMinute(open);
    const end = toMinute(close);
    return start > end && currentMinute < end;
  });
  return todayOpen || overnightOpen;
}
