import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../../common/http/auth.guard';
import {
  REWARDS,
  type AuthUser,
  type CouponOfferView,
  type CouponView,
  type IRewards,
  type PointsSummary,
} from '../../contracts';

/**
 * Rewards API (PB-24..PB-27). The signed-in user is always taken from the session,
 * never from the request (SEC-004): a student can only see and use their own coupons.
 */
@Controller()
export class RewardsController {
  constructor(@Inject(REWARDS) private readonly rewards: IRewards) {}

  /** RWD-004, RWD-016: balance, today's progress towards the cap, points per answer. */
  @Get('me/points')
  @UseGuards(AuthGuard)
  points(@CurrentUser() user: AuthUser): Promise<PointsSummary> {
    return this.rewards.getPointsSummary(user.id);
  }

  /** RWD-005: coupons on offer with their cost and venue. Open to guests too. */
  @Get('coupon-offers')
  offers(): Promise<CouponOfferView[]> {
    return this.rewards.listOffers();
  }

  /** RWD-006..RWD-009, RWD-014: spend points on a coupon; the coupon is e-mailed. */
  @Post('coupon-offers/:offerId/redeem')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  redeem(
    @CurrentUser() user: AuthUser,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
  ): Promise<CouponView> {
    return this.rewards.redeem(user.id, offerId);
  }

  /** RWD-021: the user's issued, active and expired coupons. */
  @Get('me/coupons')
  @UseGuards(AuthGuard)
  coupons(@CurrentUser() user: AuthUser): Promise<CouponView[]> {
    return this.rewards.listCoupons(user.id);
  }

  /** RWD-017: activate from the app; starts the 5-minute countdown once. */
  @Post('me/coupons/:couponId/activate')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  activate(
    @CurrentUser() user: AuthUser,
    @Param('couponId', new ParseUUIDPipe()) couponId: string,
  ): Promise<CouponView> {
    return this.rewards.activate(user.id, couponId);
  }

  /** The e-mail "Activate" link page reads the coupon first, so opening the link never activates it. */
  @Get('coupons/by-token/:token')
  byToken(@Param('token') token: string): Promise<CouponView> {
    return this.rewards.getCouponByToken(token);
  }

  /** RWD-017 from the e-mail link: the student presses "Activate now" on the page. */
  @Post('coupons/by-token/:token/activate')
  @HttpCode(HttpStatus.OK)
  activateByToken(@Param('token') token: string): Promise<CouponView> {
    return this.rewards.activateByToken(token);
  }
}
