import { Body, Controller, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { AuthGuard, CurrentUser } from '../../common/http/auth.guard';
import {
  SURVEYS,
  type AuthUser,
  type CrowdAnswer,
  type ISurvey,
  type NoiseAnswer,
  type StoredSurvey,
  type WifiAnswer,
} from '../../contracts';

export class SubmitSurveyDto {
  @IsOptional()
  @IsIn(['not_crowded', 'slightly_crowded', 'moderately_crowded', 'very_crowded'])
  crowd?: CrowdAnswer;

  @IsOptional()
  @IsIn(['quiet', 'moderate', 'noisy'])
  noise?: NoiseAnswer;

  @IsOptional()
  @IsIn(['poor', 'average', 'good', 'not_used'])
  wifi?: WifiAnswer;
}

/** Authenticated in-app survey submission (PB-17, CON-001..CON-008). */
@Controller('venues')
@UseGuards(AuthGuard)
export class SurveysController {
  constructor(@Inject(SURVEYS) private readonly surveys: ISurvey) {}

  @Post(':venueId/surveys')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('venueId', new ParseUUIDPipe()) venueId: string,
    @Body() body: SubmitSurveyDto,
  ): Promise<StoredSurvey> {
    return this.surveys.submit({
      userId: user.id,
      venueId,
      source: 'in_app',
      answers: body,
    });
  }
}
