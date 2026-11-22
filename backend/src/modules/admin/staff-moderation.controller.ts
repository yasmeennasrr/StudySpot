import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/http/auth.guard';
import { StaffOnly } from '../../common/http/staff.guard';
import {
  ADMIN,
  type AuthUser,
  type IAdmin,
  type RecentSurveyView,
  type ReportedReviewView,
} from '../../contracts';

export class ModerationListQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class RecentSurveysQuery extends ModerationListQuery {
  @IsOptional()
  @IsUUID()
  venueId?: string;
}

/**
 * Staff API, moderation queue (PB-37, FR-029, UC-21). Owner: M4.
 * Moderators and administrators. Removals and dismissals are staff actions in the
 * security log (FR-044).
 */
@Controller('staff/moderation')
@StaffOnly('admin', 'moderator')
export class StaffModerationController {
  constructor(@Inject(ADMIN) private readonly admin: IAdmin) {}

  @Get('reviews')
  reportedReviews(@Query() q: ModerationListQuery): Promise<ReportedReviewView[]> {
    return this.admin.listReportedReviews(q.limit);
  }

  @Post('reviews/:reviewId/remove')
  @HttpCode(204)
  async removeReview(
    @CurrentUser() staff: AuthUser,
    @Param('reviewId', new ParseUUIDPipe()) reviewId: string,
  ): Promise<void> {
    await this.admin.removeReportedContent(staff.id, 'review', reviewId);
  }

  @Post('reviews/:reviewId/dismiss')
  @HttpCode(204)
  async dismissReports(
    @CurrentUser() staff: AuthUser,
    @Param('reviewId', new ParseUUIDPipe()) reviewId: string,
  ): Promise<void> {
    await this.admin.dismissReports(staff.id, reviewId);
  }

  @Get('surveys')
  recentSurveys(@Query() q: RecentSurveysQuery): Promise<RecentSurveyView[]> {
    return this.admin.listRecentSurveys({ venueId: q.venueId, limit: q.limit });
  }

  @Post('surveys/:surveyId/remove')
  @HttpCode(204)
  async removeSurvey(
    @CurrentUser() staff: AuthUser,
    @Param('surveyId', new ParseUUIDPipe()) surveyId: string,
  ): Promise<void> {
    await this.admin.removeReportedContent(staff.id, 'survey', surveyId);
  }
}
