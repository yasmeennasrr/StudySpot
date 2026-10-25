import { Body, Controller, Get, HttpCode, Inject, Ip, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../../common/http/auth.guard';
import { AUTH, type AuthTokens, type AuthUser, type IAuth, type Profile } from '../../contracts';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';

/** User API, accounts routes (contracts/openapi.yaml, tag "auth"). Owner: M2. */
@Controller()
export class AuthController {
  constructor(@Inject(AUTH) private readonly auth: IAuth) {}

  @Post('auth/register')
  register(@Body() dto: RegisterDto): Promise<AuthTokens> {
    return this.auth.register(dto);
  }

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string): Promise<AuthTokens> {
    return this.auth.login(dto, { ip });
  }

  @Post('auth/refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser): Promise<Profile> {
    return this.auth.getProfile(user.id);
  }
}
