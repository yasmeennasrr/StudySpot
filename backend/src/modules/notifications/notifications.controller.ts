import { Body, Controller, HttpCode, HttpStatus, Inject, Put, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../../common/http/auth.guard';
import { NOTIFY, type AuthUser, type INotify } from '../../contracts';
import { DeviceTokenDto } from './dto/device-token.dto';
import { PresencePromptPreferenceDto } from './dto/presence-prompt-preference.dto';

/** Authenticated push-token and presence-prompt settings. */
@Controller('me')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(@Inject(NOTIFY) private readonly notifications: INotify) {}

  @Put('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerDevice(@CurrentUser() user: AuthUser, @Body() body: DeviceTokenDto): Promise<void> {
    await this.notifications.registerDevice(user.id, body.installationId);
  }

  @Put('presence-prompts')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPresencePromptsEnabled(
    @CurrentUser() user: AuthUser,
    @Body() body: PresencePromptPreferenceDto,
  ): Promise<void> {
    await this.notifications.setPresencePromptsEnabled(user.id, body.enabled);
  }
}
