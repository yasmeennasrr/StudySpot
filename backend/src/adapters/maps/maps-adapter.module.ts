import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdapterUnavailableError } from '../../common/errors/app-error';
import { MAPS, type GeocodeResult, type IMaps } from '../../contracts';

/** Known Cairo areas so search by area works offline and in tests. */
const KNOWN_AREAS: Record<string, GeocodeResult> = {
  'new cairo': {
    point: { lat: 30.0074, lng: 31.4913 },
    formattedAddress: 'New Cairo, Cairo Governorate, Egypt',
  },
  tagamo3: {
    point: { lat: 30.0074, lng: 31.4913 },
    formattedAddress: 'New Cairo, Cairo Governorate, Egypt',
  },
  'fifth settlement': {
    point: { lat: 30.0084, lng: 31.4285 },
    formattedAddress: 'Fifth Settlement, New Cairo, Egypt',
  },
  zamalek: {
    point: { lat: 30.0609, lng: 31.2197 },
    formattedAddress: 'Zamalek, Cairo Governorate, Egypt',
  },
  maadi: {
    point: { lat: 29.9602, lng: 31.2569 },
    formattedAddress: 'Maadi, Cairo Governorate, Egypt',
  },
  dokki: {
    point: { lat: 30.0384, lng: 31.2123 },
    formattedAddress: 'Dokki, Giza Governorate, Egypt',
  },
  heliopolis: {
    point: { lat: 30.0911, lng: 31.3225 },
    formattedAddress: 'Heliopolis, Cairo Governorate, Egypt',
  },
  'nasr city': {
    point: { lat: 30.0566, lng: 31.3301 },
    formattedAddress: 'Nasr City, Cairo Governorate, Egypt',
  },
  downtown: { point: { lat: 30.0444, lng: 31.2357 }, formattedAddress: 'Downtown Cairo, Egypt' },
  'sheikh zayed': {
    point: { lat: 30.0444, lng: 30.9815 },
    formattedAddress: 'Sheikh Zayed City, Giza, Egypt',
  },
  auc: {
    point: { lat: 30.0195, lng: 31.4996 },
    formattedAddress: 'The American University in Cairo, New Cairo, Egypt',
  },
};

/**
 * Offline geocoder used in tests and whenever GOOGLE_GEOCODING_API_KEY is empty.
 * The area "fail" simulates a provider outage (EIR-011, UC-03 alternative 4b).
 */
@Injectable()
export class FakeMapsAdapter implements IMaps {
  async geocode(area: string): Promise<GeocodeResult | null> {
    const key = area.trim().toLowerCase();
    if (key === 'fail') throw new AdapterUnavailableError('maps', 'simulated outage');
    return KNOWN_AREAS[key] ?? null;
  }
}

export interface GoogleGeocodingOptions {
  /** Give up after this many milliseconds (EIR-011). Default 3000. */
  timeoutMs?: number;
  /** Injected in tests; defaults to the global fetch of Node 20. */
  fetchFn?: typeof fetch;
}

interface GoogleGeocodeResponse {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: unknown; lng?: unknown } };
  }>;
}

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Google Geocoding API (PB-07, EIR-011). Active when GOOGLE_GEOCODING_API_KEY is set.
 *
 * - Searches inside Egypt only (region=eg, components=country:EG).
 * - ZERO_RESULTS -> null ("no such area"; the caller shows "area not found").
 * - Timeout, network error, HTTP error, OVER_QUERY_LIMIT, REQUEST_DENIED or an
 *   unusable answer -> AdapterUnavailableError('maps', reason). The caller picks
 *   the fallback (search near the user's location instead, UC-03 4b).
 * - The API key is never logged: only the area and Google's status are.
 */
@Injectable()
export class GoogleGeocodingAdapter implements IMaps {
  private readonly logger = new Logger('MapsAdapter');
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly apiKey: string,
    options: GoogleGeocodingOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
  }

  async geocode(area: string): Promise<GeocodeResult | null> {
    const query = area.trim();
    if (!query) return null;
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('address', query);
    url.searchParams.set('region', 'eg');
    url.searchParams.set('components', 'country:EG');
    url.searchParams.set('language', 'en');
    url.searchParams.set('key', this.apiKey);

    const body = await this.request(url, query);
    switch (body.status) {
      case 'OK':
        return this.firstResult(body, query);
      case 'ZERO_RESULTS':
        return null;
      default: {
        // OVER_QUERY_LIMIT, OVER_DAILY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR
        const status = body.status ?? 'missing status';
        this.logger.warn({ area: query, status }, 'Google geocoding refused the request');
        throw new AdapterUnavailableError('maps', status);
      }
    }
  }

  private async request(url: URL, query: string): Promise<GoogleGeocodeResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(url, { signal: controller.signal });
      if (!res.ok) {
        this.logger.warn({ area: query, httpStatus: res.status }, 'Google geocoding HTTP error');
        throw new AdapterUnavailableError('maps', `HTTP ${res.status}`);
      }
      try {
        return (await res.json()) as GoogleGeocodeResponse;
      } catch {
        throw new AdapterUnavailableError('maps', 'unusable response');
      }
    } catch (err) {
      if (err instanceof AdapterUnavailableError) throw err;
      const timedOut = controller.signal.aborted;
      this.logger.warn({ area: query, timedOut }, 'Google geocoding request failed');
      throw new AdapterUnavailableError('maps', timedOut ? 'timeout' : 'network error');
    } finally {
      clearTimeout(timer);
    }
  }

  private firstResult(body: GoogleGeocodeResponse, query: string): GeocodeResult {
    const first = body.results?.[0];
    const lat = first?.geometry?.location?.lat;
    const lng = first?.geometry?.location?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat + lng)) {
      this.logger.warn({ area: query }, 'Google geocoding answer had no usable location');
      throw new AdapterUnavailableError('maps', 'unusable response');
    }
    return { point: { lat, lng }, formattedAddress: first?.formatted_address ?? query };
  }
}

/** Maps adapter. Provides IMaps; real Google client when a key is set, otherwise the fake. */
@Module({
  providers: [
    {
      provide: MAPS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IMaps => {
        const key = config.get<string>('GOOGLE_GEOCODING_API_KEY', '');
        const timeoutMs = Number(config.get('GOOGLE_GEOCODING_TIMEOUT_MS', 3000));
        return key ? new GoogleGeocodingAdapter(key, { timeoutMs }) : new FakeMapsAdapter();
      },
    },
  ],
  exports: [MAPS],
})
export class MapsAdapterModule {}
