import { Equals, IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Registration fields of SDS 6.6.6 (FR-001, PRIV-011). Nothing else is asked. */
export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email must be a valid e-mail address' })
  @MaxLength(254)
  email: string;

  @IsString()
  @Length(8, 128, { message: 'password must be at least 8 characters' })
  @Matches(/[A-Za-z]/, { message: 'password must contain at least one letter' })
  @Matches(/[0-9]/, { message: 'password must contain at least one digit' })
  password: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 30, { message: 'displayName must be 2 to 30 characters' })
  displayName: string;

  @Equals(true, {
    message: 'termsAccepted must be true: the terms and privacy notice must be accepted',
  })
  termsAccepted: true;
}

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email must be a valid e-mail address' })
  email: string;

  @IsString()
  @Length(1, 128)
  password: string;
}

export class RefreshDto {
  @IsString()
  @Length(10, 512)
  refreshToken: string;
}
