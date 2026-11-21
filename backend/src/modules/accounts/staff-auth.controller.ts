import { Body, Controller, Delete, Get, HttpCode, Inject, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/http/auth.guard';
import { StaffOnly } from '../../common/http/staff.guard';
import { STAFF_AUTH, type AuthUser, type IStaffAuth, type StaffSession } from '../../contracts';
import { LoginDto } from './dto/auth.dto';

/** Brute-force limit for staff sign-in, per client (STAFF_SIGNIN_LIMIT, default 5 per minute). */
const staffSignInLimit = () => Number(process.env.STAFF_SIGNIN_LIMIT ?? 5);

/** Staff API, sessions (PB-32, UC-17). Owner: M1. Tag "staff" in contracts/openapi.yaml. */
@Controller('staff/session')
export class StaffAuthController {
  constructor(@Inject(STAFF_AUTH) private readonly staffAuth: IStaffAuth) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: staffSignInLimit, ttl: 60_000 } })
  signIn(@Body() dto: LoginDto, @Ip() ip: string): Promise<StaffSession> {
    return this.staffAuth.signIn(dto, { ip });
  }

  @Get()
  @StaffOnly()
  current(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Delete()
  @HttpCode(204)
  @StaffOnly()
  async signOut(@CurrentUser() user: AuthUser): Promise<void> {
    await this.staffAuth.signOut(user);
  }
}
