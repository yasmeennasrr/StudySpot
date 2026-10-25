import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '../../common/http/auth.guard';
import { AUTH } from '../../contracts';
import { SessionEntity, UserEntity } from '../../db/entities';
import { ClockModule } from '../clock/clock.module';
import { AuthController } from './auth.controller';
import { StubAuthService } from './auth.service.stub';

/**
 * Accounts & Auth. Owner: M2. Provides IAuth (and the AuthGuard that uses it).
 * Uses IClock; publishes SignInFailed -> Audit Log.
 * TODO(M2): swap StubAuthService for the real AuthService using the two repositories.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, SessionEntity]), ClockModule],
  controllers: [AuthController],
  providers: [{ provide: AUTH, useClass: StubAuthService }, AuthGuard],
  exports: [AUTH, AuthGuard],
})
export class AccountsModule {}
