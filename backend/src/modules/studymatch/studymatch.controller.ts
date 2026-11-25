import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { AppError } from '../../common/errors/app-error';
import { AuthGuard, CurrentUser } from '../../common/http/auth.guard';
import {
  STUDY_MATCH,
  type AuthUser,
  type IStudyMatch,
  type StudyMatchAnswer,
  type StudyMatchMessage,
} from '../../contracts';

/** At most 3 earlier question/answer pairs, so prompts stay short and fast (PERF-003). */
export const MAX_HISTORY_MESSAGES = 6;

/** One earlier chat message (contracts/openapi.yaml, StudyMatchMessage). */
export class StudyMatchMessageDto implements StudyMatchMessage {
  @IsIn(['user', 'model'], { message: 'role must be user or model' })
  role: 'user' | 'model';

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000, { message: 'text must be 1 to 1000 characters' })
  text: string;
}

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

  /** The chat so far, for follow-ups. Context only: never stored, never a source of facts. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_HISTORY_MESSAGES)
  @ValidateNested({ each: true })
  @Type(() => StudyMatchMessageDto)
  history?: StudyMatchMessageDto[];
}

/** Whole pairs, oldest first: user, model, user, model... Gemini refuses other orders. */
function isWholePairs(history: StudyMatchMessage[]): boolean {
  return (
    history.length % 2 === 0 && history.every((m, i) => m.role === (i % 2 === 0 ? 'user' : 'model'))
  );
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
    const history = dto.history ?? [];
    if (!isWholePairs(history)) {
      throw AppError.invalidInput(
        'Send history as whole pairs, oldest first: a user message, then the model reply to it.',
      );
    }
    const location = dto.lat !== undefined ? { lat: dto.lat, lng: dto.lng! } : undefined;
    return this.studyMatch.ask({ userId: user.id, text: dto.text, location, history });
  }
}
