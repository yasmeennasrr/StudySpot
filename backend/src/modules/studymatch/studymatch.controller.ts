import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';
import { AppError } from '../../common/errors/app-error';
import { AuthGuard, CurrentUser } from '../../common/http/auth.guard';
import {
  STUDY_MATCH,
  type AuthUser,
  type IStudyMatch,
  type StudyMatchAnswer,
} from '../../contracts';

/** POST /studymatch body (contracts/openapi.yaml, StudyMatchRequest). */
export class StudyMatchRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 500, { message: 'text must be 1 to 500 characters' })
  text: string;

  /** The device location, only when the student granted location permission (AI-003). */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

/**
 * User API, StudyMatch route (PB-29, UC-05, AI-001, AI-005). Owner: M2.
 * The app sends the question here; only the backend talks to the LLM. The user
 * comes from the access token, never from the body (AI-009). Rate limited per
 * client to protect the LLM quota (STUDYMATCH_LIMIT a minute, default 10).
 */
@Controller('studymatch')
@UseGuards(AuthGuard)
export class StudyMatchController {
  constructor(@Inject(STUDY_MATCH) private readonly studyMatch: IStudyMatch) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: () => Number(process.env.STUDYMATCH_LIMIT ?? 10), ttl: 60_000 } })
  ask(@Body() dto: StudyMatchRequestDto, @CurrentUser() user: AuthUser): Promise<StudyMatchAnswer> {
    if ((dto.lat === undefined) !== (dto.lng === undefined)) {
      throw AppError.invalidInput('Send lat and lng together, or neither.');
    }
    const location = dto.lat !== undefined ? { lat: dto.lat, lng: dto.lng! } : undefined;
    return this.studyMatch.ask({ userId: user.id, text: dto.text, location });
  }
}
