import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../config/env';
import { ConsentEnforcementService } from '../data-protection/consent-enforcement.service';
import { AccessService } from './access.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { DemoModeController, DemoModeService } from './demo-mode.service';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: env().JWT_SECRET, signOptions: { algorithm: 'HS256' } }),
    }),
  ],
  controllers: [AuthController, TwoFactorController, DemoModeController],
  providers: [AuthService, AccessService, TwoFactorService, DemoModeService, ConsentEnforcementService, { provide: APP_GUARD, useClass: AuthGuard }],
  // JwtModule is shared so other modules can sign short-lived tokens (e.g. the check-in kiosk).
  exports: [AccessService, TwoFactorService, DemoModeService, ConsentEnforcementService, JwtModule],
})
export class AuthModule {}
