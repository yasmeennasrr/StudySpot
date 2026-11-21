import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthGuard, CurrentUser } from '../../../common/http/auth.guard';
import type { AuthUser } from '../../../contracts';
import { ReviewsService, type MyReviewView } from './reviews.service';

/** Review fields of SDS 6.6.6: whole stars 1 to 5 (required), text up to 1000 characters. */
export class WriteReviewDto {
  @Type(() => Number)
  @IsInt({ message: 'rating must be a whole number of stars' })
  @Min(1, { message: 'rating must be 1 to 5 stars' })
  @Max(5, { message: 'rating must be 1 to 5 stars' })
  rating: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000, { message: 'text must be at most 1000 characters' })
  text?: string | null;
}

/**
 * User API, reviews (tags "venues" and "me"). Owner: M4. PB-15, PB-16, UC-08.
 * Every route needs a signed-in user; the author is always the session user (SEC-004).
 */
@Controller()
@UseGuards(AuthGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Write or replace the signed-in user's review of a venue (FR-025). */
  @Put('venues/:venueId/review')
  write(
    @CurrentUser() user: AuthUser,
    @Param('venueId', new ParseUUIDPipe()) venueId: string,
    @Body() body: WriteReviewDto,
  ): Promise<MyReviewView> {
    return this.reviews.write(user.id, venueId, body);
  }

  /** The signed-in user's own review of a venue, so the app can prefill the form. */
  @Get('me/reviews/:venueId')
  async mine(
    @CurrentUser() user: AuthUser,
    @Param('venueId', new ParseUUIDPipe()) venueId: string,
  ): Promise<{ review: MyReviewView | null }> {
    return { review: await this.reviews.mine(user.id, venueId) };
  }

  /** Report someone else's review to the moderators (FR-034). Safe to repeat. */
  @Post('reviews/:reviewId/reports')
  @HttpCode(204)
  async report(
    @CurrentUser() user: AuthUser,
    @Param('reviewId', new ParseUUIDPipe()) reviewId: string,
  ): Promise<void> {
    await this.reviews.report(user.id, reviewId);
  }
}
