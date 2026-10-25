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

/**
 * Google Geocoding API. Owner: M3 (Sprint 1, PB-07).
 * TODO(M3): call https://maps.googleapis.com/maps/api/geocode/json with
 * region=eg, map ZERO_RESULTS to null, and turn timeouts, HTTP errors and
 * OVER_QUERY_LIMIT into AdapterUnavailableError('maps', reason).
 */
@Injectable()
export class GoogleGeocodingAdapter implements IMaps {
  private readonly logger = new Logger('MapsAdapter');
  constructor(private readonly apiKey: string) {}

  async geocode(_area: string): Promise<GeocodeResult | null> {
    this.logger.warn('GoogleGeocodingAdapter is not implemented yet (M3)');
    throw new AdapterUnavailableError('maps', 'Google geocoding not implemented yet');
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
        return key ? new GoogleGeocodingAdapter(key) : new FakeMapsAdapter();
      },
    },
  ],
  exports: [MAPS],
})
export class MapsAdapterModule {}
