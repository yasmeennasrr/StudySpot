import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STAFF_AUTH, type IStaffAuth, type UserRole } from '../../contracts';
import { AppError } from '../errors/app-error';
import type { AuthedRequest } from './auth.guard';

const STAFF_ROLES_KEY = 'studyspot:staff-roles';

/**
 * Staff API guard (PB-32, FR-035). Accepts only a staff token from
 * POST /staff/session, sent as "Authorization: Bearer <staffToken>". An app access
 * token is refused, so every staff function needs the password re-entered.
 * The module that owns the route must import AccountsModule.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    @Inject(STAFF_AUTH) private readonly staffAuth: IStaffAuth,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw AppError.unauthenticated('Sign in to the Staff Console to continue.');
    }
    const user = await this.staffAuth.verifyStaffToken(header.slice('Bearer '.length).trim());
    req.user = user;
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(STAFF_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && roles.length > 0 && !roles.includes(user.role)) {
      throw AppError.notAllowed('Your staff role cannot use this function.');
    }
    return true;
  }
}

/**
 * Put on a staff route or controller: `@StaffOnly('admin')`, or `@StaffOnly()`
 * for any staff role (admin or moderator). Read the user with @CurrentUser().
 */
export const StaffOnly = (...roles: UserRole[]) =>
  applyDecorators(SetMetadata(STAFF_ROLES_KEY, roles), UseGuards(StaffGuard));
