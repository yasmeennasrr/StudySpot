import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import type { FilterCriteria, Level, PriceLevel } from '../../../contracts';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : value;

export const NOISE_WORDS = ['quiet', 'moderate', 'noisy'] as const;
export const WIFI_WORDS = ['poor', 'average', 'good'] as const;
export const CROWD_WORDS = ['low', 'moderate', 'high'] as const;

/**
 * FR-013 filters as the API spells them (words, not numbers). The same fields
 * are used in query strings (search, nearby) and in the preferences body (FR-022).
 */
export class FilterFieldsDto {
  @IsOptional() @IsIn(NOISE_WORDS) noise?: (typeof NOISE_WORDS)[number];
  @IsOptional() @IsIn(WIFI_WORDS) wifi?: (typeof WIFI_WORDS)[number];
  @IsOptional() @IsIn(CROWD_WORDS) crowd?: (typeof CROWD_WORDS)[number];
  @IsOptional() @Type(() => String) @Transform(toBool) @IsBoolean() outlets?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4) maxPrice?: number;
  @IsOptional() @Type(() => String) @Transform(toBool) @IsBoolean() openNow?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) maxDistance?: number;
  @IsOptional() @IsIn(['individual', 'group']) studyType?: 'individual' | 'group';
}

/** GET /venues/search: by name (q), by area, or near a point (FR-009, FR-010, FR-011). */
export class SearchVenuesQueryDto extends FilterFieldsDto {
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  q?: string;

  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  area?: string;

  // Coordinates are optional as a pair, but a partially supplied pair is invalid.
  @ValidateIf((o: SearchVenuesQueryDto) => o.lat !== undefined || o.lng !== undefined)
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ValidateIf((o: SearchVenuesQueryDto) => o.lat !== undefined || o.lng !== undefined)
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(5000) radius?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) limit?: number;
}

/** GET /venues/nearby: location is required (FR-010, FR-012). */
export class NearbyVenuesQueryDto extends FilterFieldsDto {
  @Type(() => Number) @IsNumber() @IsLatitude() lat: number;
  @Type(() => Number) @IsNumber() @IsLongitude() lng: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(5000) radius?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) limit?: number;
}

/** PUT /me/preferences body (FR-022, FR-023). */
export class PreferencesDto extends FilterFieldsDto {}

const levelOf = (words: readonly string[], word?: string): Level | undefined =>
  word ? ((words.indexOf(word) + 1) as Level) : undefined;

/** Words -> internal levels (SDS 6.6 numbering). */
export function toFilterCriteria(dto: FilterFieldsDto): FilterCriteria {
  const c: FilterCriteria = {
    noise: levelOf(NOISE_WORDS, dto.noise),
    wifi: levelOf(WIFI_WORDS, dto.wifi),
    crowd: levelOf(CROWD_WORDS, dto.crowd),
    outlets: dto.outlets,
    maxPriceLevel: dto.maxPrice as PriceLevel | undefined,
    openNow: dto.openNow,
    maxDistanceMeters: dto.maxDistance,
    studyType: dto.studyType,
  };
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as FilterCriteria;
}

/** Internal levels -> API words (for GET /me/preferences). */
export function fromFilterCriteria(c: FilterCriteria): FilterFieldsDto {
  const out: FilterFieldsDto = {
    noise: c.noise ? NOISE_WORDS[c.noise - 1] : undefined,
    wifi: c.wifi ? WIFI_WORDS[c.wifi - 1] : undefined,
    crowd: c.crowd ? CROWD_WORDS[c.crowd - 1] : undefined,
    outlets: c.outlets,
    maxPrice: c.maxPriceLevel,
    openNow: c.openNow,
    maxDistance: c.maxDistanceMeters,
    studyType: c.studyType,
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined),
  ) as FilterFieldsDto;
}
