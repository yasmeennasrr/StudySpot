import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '../../common/http/auth.guard';
import { StaffGuard } from '../../common/http/staff.guard';
import { AUTH, STAFF_AUTH } from '../../contracts';
import { SessionEntity, UserEntity } from '../../db/entities';
import { ClockModule } from '../clock/clock.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';

/**
 * Accounts & Auth. Owner: M2. Provides IAuth (and the AuthGuard that uses it).
 * Uses IClock; publishes SignInFailed -> Audit Log.
 * Staff sign-in (IStaffAuth, StaffGuard, /staff/session) is M1's, PB-32.
 * The JWT secret and lifetime are passed per call from config (JWT_ACCESS_*).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, SessionEntity]),
    JwtModule.register({}),
    ClockModule,
  ],
  controllers: [AuthController, StaffAuthController],
  providers: [
    { provide: AUTH, useClass: AuthService },
    { provide: STAFF_AUTH, useClass: StaffAuthService },
    AuthGuard,
    StaffGuard,
  ],
  exports: [AUTH, STAFF_AUTH, AuthGuard, StaffGuard],
})
export class AccountsModule {}
