import { IsBoolean } from 'class-validator';

export class PresencePromptPreferenceDto {
  @IsBoolean()
  enabled: boolean;
}
