import { IsBoolean, IsUUID } from 'class-validator';

export class PresencePromptResponseDto {
  @IsUUID()
  venueId: string;

  @IsBoolean()
  confirmed: boolean;
}
