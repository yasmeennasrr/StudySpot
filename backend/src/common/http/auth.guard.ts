import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH, type AuthUser, type IAuth, type UserRole } from '../../contracts';
import { AppError } from '../errors/app-error';

export type AuthedRequest = Request & { user?: AuthUser };

const ROLES_KEY = 'studyspot:roles';
/** Restrict a route to staff roles, e.g. @Roles('admin'). Staff re-auth (FR-035) comes in Sprint 3. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * API Layer auth guard (SEC-001, FR-007). Reads "Authorization: Bearer <token>"
 * and asks IAuth to verify it, so the guard never knows how tokens work.
 * Use @UseGuards(AuthGuard) on any route that needs a signed-in user; the module
 * that owns the route must import AccountsModule (the visible API -> IAuth link).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: IAuth,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw AppError.unauthenticated();
    }
    const user = await this.auth.verifyAccessToken(header.slice('Bearer '.length).trim());
    req.user = user;

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && roles.length > 0 && !roles.includes(user.role)) {
      throw AppError.notAllowed();
    }
    return true;
  }
}

/** The signed-in user, in a route guarded by AuthGuard: `me(@CurrentUser() user: AuthUser)`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw AppError.unauthenticated();
    return req.user;
  },
);
