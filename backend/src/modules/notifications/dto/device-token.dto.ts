import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  installationId: string;
}
