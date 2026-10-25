import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { haversineMeters, SAMPLE_VENUES } from '../venue-fixtures';

/**
 * STUB for search and nearby. Owner: M3 (PB-07, PB-08, PB-10).
 * Works on the 3 sample venues in memory so the app can integrate today.
 * The Venues -> Maps and Venues -> Conditions calls are already real.
 *
 * TODO(M3): replace with VenueSearchService over VenueRepository (PostGIS
 * ST_DWithin + ST_Distance, trigram ILIKE on name), and the Strategy filters:
 * one IFilterCriterion per FR-013 criterion combined by VenueFilterPipeline.
 * Filters are accepted but ignored by this stub.
 */
@Injectable()
export class StubVenueSearchService {
  private readonly logger = new Logger('VenuesSearch');

  constructor(
    @Inject(MAPS) private readonly maps: IMaps,
    @Inject(CONDITIONS) private readonly conditions: IConditions,
    @Inject(CONFIG) private readonly config: IConfig,
  ) {}

  async search(params: SearchParams): Promise<SearchResult> {
    this.logger.debug({ params }, 'Venues.search (stub)');
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

    const radius = params.radiusMeters ?? (await this.config.get('search.defaultRadiusMeters'));
    const limit = params.limit ?? (await this.config.get('search.maxResults'));
    const text = (params.q ?? (degraded ? params.area : undefined))?.toLowerCase();

    let rows = SAMPLE_VENUES.map((v) => ({
      venue: v,
      distance: origin ? haversineMeters(origin, v.location) : null,
    }));
    if (text) {
      rows = rows.filter(
        (r) =>
          r.venue.name.toLowerCase().includes(text) ||
          (r.venue.area ?? '').toLowerCase().includes(text),
      );
    }
    if (origin) {
      rows = rows
        .filter((r) => (r.distance ?? 0) <= radius)
        .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    }
    rows = rows.slice(0, limit);

    const conditions = await this.conditions.getConditionsForMany(rows.map((r) => r.venue.id));
    const items: VenueSummary[] = rows.map((r) => ({
      ...r.venue,
      distanceMeters: r.distance,
      openNow: null,
      averageRating: null,
      reviewCount: 0,
      conditions: conditions.get(r.venue.id) ?? null,
    }));
    return { origin, items, degraded };
  }
}
