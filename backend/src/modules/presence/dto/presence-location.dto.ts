import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNumber } from 'class-validator';

/** Transient coordinates used only to resolve an active venue; never stored. */
export class PresenceLocationDto {
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  lng: number;
}
