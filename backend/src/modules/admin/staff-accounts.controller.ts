import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from '../../common/http/auth.guard';
import { StaffOnly } from '../../common/http/staff.guard';
import {
  ADMIN,
  type AccountView,
  type AuthUser,
  type IAdmin,
  type UserRole,
} from '../../contracts';

const ROLES: UserRole[] = ['user', 'moderator', 'admin'];
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AccountsQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  q?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  suspended?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** Same e-mail and display name rules as registration (SDS 6.6.6). */
export class CreateAccountDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email must be a valid e-mail address' })
  @MaxLength(254)
  email: string;

  @Transform(trim)
  @IsString()
  @Length(2, 30, { message: 'displayName must be 2 to 30 characters' })
  displayName: string;

  @IsIn(ROLES, { message: 'role must be user, moderator or admin' })
  role: UserRole;

  /** Length and strength are checked per role in AdminService. */
  @IsString()
  @Length(1, 128)
  password: string;
}

/**
 * Staff API, accounts (PB-33, FR-036 to FR-038, FR-044, UC-18). Owner: M4.
 * Administrators only. Every change is a staff action in the security log.
 */
@Controller('staff/accounts')
@StaffOnly('admin')
export class StaffAccountsController {
  constructor(@Inject(ADMIN) private readonly admin: IAdmin) {}

  @Get()
  list(@Query() q: AccountsQuery): Promise<AccountView[]> {
    return this.admin.listAccounts(q);
  }

  @Post()
  @HttpCode(201)
  create(@CurrentUser() staff: AuthUser, @Body() body: CreateAccountDto): Promise<AccountView> {
    return this.admin.createAccount(staff.id, body);
  }

  @Post(':userId/suspend')
  @HttpCode(200)
  suspend(
    @CurrentUser() staff: AuthUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<AccountView> {
    return this.admin.suspendUser(staff.id, userId);
  }

  @Post(':userId/reactivate')
  @HttpCode(200)
  reactivate(
    @CurrentUser() staff: AuthUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<AccountView> {
    return this.admin.reactivateUser(staff.id, userId);
  }
}
