import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../config/env';
import { AccessService } from './access.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: env().JWT_SECRET, signOptions: { algorithm: 'HS256' } }),
    }),
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [AuthService, AccessService, TwoFactorService, { provide: APP_GUARD, useClass: AuthGuard }],
  // JwtModule is shared so other modules can sign short-lived tokens (e.g. the check-in kiosk).
  exports: [AccessService, TwoFactorService, JwtModule],
})
export class AuthModule {}
