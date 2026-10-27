import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '../../common/http/auth.guard';
import { AUTH } from '../../contracts';
import { SessionEntity, UserEntity } from '../../db/entities';
import { ClockModule } from '../clock/clock.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Accounts & Auth. Owner: M2. Provides IAuth (and the AuthGuard that uses it).
 * Uses IClock; publishes SignInFailed -> Audit Log.
 * The JWT secret and lifetime are passed per call from config (JWT_ACCESS_*).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, SessionEntity]),
    JwtModule.register({}),
    ClockModule,
  ],
  controllers: [AuthController],
  providers: [{ provide: AUTH, useClass: AuthService }, AuthGuard],
  exports: [AUTH, AuthGuard],
})
export class AccountsModule {}
