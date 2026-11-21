import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional } from 'class-validator';
import { AppError } from '../../common/errors/app-error';
import { AuthGuard, CurrentUser } from '../../common/http/auth.guard';
import {
  CONFIG,
  NOISE,
  PRESENCE,
  VENUE_QUERY,
  type AuthUser,
  type IConfig,
  type INoise,
  type IPresence,
  type IVenueQuery,
} from '../../contracts';

/** A 7-second 16 kHz mono WAV is about 224 KB; 1 MB leaves room for other formats. */
export const MAX_SNIPPET_BYTES = 1024 * 1024;
export const ACCEPTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
];
const LEVEL_WORDS = { 1: 'quiet', 2: 'moderate', 3: 'noisy' } as const;

export class PositionDto {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

export interface NoiseEligibility {
  eligible: boolean;
  reason: 'not_present' | null;
  radiusMeters: number;
}

export interface NoiseSampleResponse {
  status: 'recorded' | 'unavailable';
  level: 'quiet' | 'moderate' | 'noisy' | null;
  message: string;
}

/** Great-circle distance in meters (good to well under a meter at venue scale). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * User API, noise samples (PB-19, UC-11, SEN-005..SEN-009, PRIV-001). Owner: M1.
 *
 * The app first asks whether the student is at the venue (eligibility) and only then
 * offers the 7-second recording, which starts when the student taps it (SEN-009).
 * The upload is kept in memory by multer (never on disk) and handed to Audio Analysis.
 * "At the venue" means Presence says so (receipt scan or confirmed presence, PB-18/PB-31),
 * or the position sent is within the venue radius (presence.venueRadiusMeters).
 */
@Controller('venues/:venueId/noise-samples')
@UseGuards(AuthGuard)
export class NoiseSamplesController {
  constructor(
    @Inject(NOISE) private readonly noise: INoise,
    @Inject(PRESENCE) private readonly presence: IPresence,
    @Inject(VENUE_QUERY) private readonly venues: IVenueQuery,
    @Inject(CONFIG) private readonly config: IConfig,
  ) {}

  @Get('eligibility')
  async eligibility(
    @Param('venueId', new ParseUUIDPipe()) venueId: string,
    @Query() position: PositionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<NoiseEligibility> {
    const radiusMeters = await this.config.get('presence.venueRadiusMeters');
    const eligible = await this.isAtVenue(user.id, venueId, position, radiusMeters);
    return { eligible, reason: eligible ? null : 'not_present', radiusMeters };
  }

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: () => Number(process.env.NOISE_SAMPLE_LIMIT ?? 6), ttl: 60_000 } })
  @UseInterceptors(
    // No `dest` or `storage`: multer keeps the file in memory as file.buffer, never
    // on disk (PRIV-001). Do not add a MulterModule with a destination.
    FileInterceptor('audio', {
      limits: { fileSize: MAX_SNIPPET_BYTES, files: 1, fields: 4 },
    }),
  )
  async submit(
    @Param('venueId', new ParseUUIDPipe()) venueId: string,
    @Body() position: PositionDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<NoiseSampleResponse> {
    try {
      if (!file || !file.buffer?.length) {
        throw AppError.invalidInput('Attach the recording as the "audio" field.');
      }
      const mimeType = file.mimetype.split(';')[0].trim().toLowerCase();
      if (!ACCEPTED_AUDIO_TYPES.includes(mimeType)) {
        throw AppError.invalidInput('Send the recording as WAV, WebM, OGG, MP4 or AAC audio.');
      }
      const radiusMeters = await this.config.get('presence.venueRadiusMeters');
      if (!(await this.isAtVenue(user.id, venueId, position, radiusMeters))) {
        throw AppError.notAllowed('You can share a noise sample only while you are at this place.');
      }
      const result = await this.noise.analyzeSnippet({
        userId: user.id,
        venueId,
        audio: file.buffer,
        mimeType,
      });
      return result.status === 'recorded' && result.level
        ? {
            status: 'recorded',
            level: LEVEL_WORDS[result.level],
            message: 'Thanks! The noise level was saved.',
          }
        : {
            status: 'unavailable',
            level: null,
            message: 'Noise analysis is not available right now. Nothing was saved.',
          };
    } finally {
      file?.buffer?.fill(0); // refused uploads are discarded too (PRIV-001)
    }
  }

  private async isAtVenue(
    userId: string,
    venueId: string,
    position: PositionDto,
    radiusMeters: number,
  ): Promise<boolean> {
    if (!(await this.venues.exists(venueId))) throw AppError.notFound('This place was not found.');
    if (await this.presence.isPresent(userId, venueId)) return true;
    if (position.lat === undefined || position.lng === undefined) return false;
    const venue = (await this.venues.getDetails(venueId)).static;
    return distanceMeters({ lat: position.lat, lng: position.lng }, venue.location) <= radiusMeters;
  }
}
