import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../../common/http/auth.guard';
import { PRESENCE, type AuthUser, type IPresence } from '../../contracts';
import { PresenceLocationDto } from './dto/presence-location.dto';
import { PresencePromptResponseDto } from './dto/presence-prompt-response.dto';

/** Signed-in presence samples and explicit confirmations (SEC-004, RT-008). */
@Controller('me/presence')
@UseGuards(AuthGuard)
export class PresenceController {
  constructor(@Inject(PRESENCE) private readonly presence: IPresence) {}

  /** Receives an opted-in location sample; it creates a candidate visit only. */
  @Post('location')
  @HttpCode(HttpStatus.OK)
  reportLocation(
    @CurrentUser() user: AuthUser,
    @Body() body: PresenceLocationDto,
  ): Promise<{ venueId: string | null }> {
    return this.presence.reportLocation(user.id, body.lat, body.lng);
  }

  /** Applies the user's yes/no response to a previously sent dwell prompt. */
  @Post('respond')
  @HttpCode(HttpStatus.OK)
  async respondToPrompt(
    @CurrentUser() user: AuthUser,
    @Body() body: PresencePromptResponseDto,
  ): Promise<{ accepted: boolean }> {
    const accepted = await this.presence.respondToPrompt(user.id, body.venueId, body.confirmed);
    return { accepted };
  }
}
