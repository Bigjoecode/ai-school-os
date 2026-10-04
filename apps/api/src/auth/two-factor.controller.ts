import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Put, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  securityPolicySchema,
  twoFactorCodeSchema,
  twoFactorDisableSchema,
  type RecoveryCodesResponse,
  type SecurityPolicy,
  type SecurityPolicyResponse,
  type TwoFactorCodeInput,
  type TwoFactorDisableInput,
  type TwoFactorSetupResponse,
  type TwoFactorStatus,
} from '@aischool/shared';
import { AllowNoTenant, RequirePermissions, RequirePlatformRole } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { AllowWithoutTwoFactor } from './two-factor.decorator';
import { TwoFactorService } from './two-factor.service';

const platformResetSchema = z
  .object({ userId: z.string().min(1).optional(), email: z.email().trim().toLowerCase().optional() })
  .refine((v) => !!v.userId || !!v.email, { message: 'Give a user ID or an email', path: ['email'] });

/** Two-step sign-in for the signed-in user, the school's policy, and support resets. */
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly access: AccessService,
    private readonly prisma: PrismaService,
  ) {}

  private async me() {
    const ctx = currentContext();
    const resolved = await this.access.resolve(ctx.userId!, ctx.tenantId ?? null);
    if (!resolved) throw new UnauthorizedException();
    return resolved;
  }

  @AllowNoTenant()
  @AllowWithoutTwoFactor()
  @Get('status')
  async status(): Promise<TwoFactorStatus> {
    return this.twoFactor.status(await this.me());
  }

  @AllowNoTenant()
  @AllowWithoutTwoFactor()
  @Post('setup')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 5 * 60_000 } })
  setup(): Promise<TwoFactorSetupResponse> {
    return this.twoFactor.beginSetup(currentContext().userId!);
  }

  @AllowNoTenant()
  @AllowWithoutTwoFactor()
  @Post('enable')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 5 * 60_000 } })
  enable(@Body(new ZodPipe(twoFactorCodeSchema)) body: TwoFactorCodeInput): Promise<RecoveryCodesResponse> {
    const ctx = currentContext();
    return this.twoFactor.enable(ctx.userId!, body.code, ctx.sessionId, ctx.tenantId ?? null);
  }

  @AllowNoTenant()
  @Post('disable')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 5 * 60_000 } })
  async disable(@Body(new ZodPipe(twoFactorDisableSchema)) body: TwoFactorDisableInput) {
    await this.twoFactor.disable(currentContext().userId!, body.password, body.code, await this.me());
    return { ok: true };
  }

  @AllowNoTenant()
  @Post('recovery-codes')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 5 * 60_000 } })
  recoveryCodes(@Body(new ZodPipe(twoFactorCodeSchema)) body: TwoFactorCodeInput): Promise<RecoveryCodesResponse> {
    const ctx = currentContext();
    return this.twoFactor.regenerateRecoveryCodes(ctx.userId!, body.code, ctx.tenantId ?? null);
  }

  // ------------------------------------------------------------ school policy

  @Get('policy')
  @RequirePermissions('users.read')
  async policy(): Promise<SecurityPolicyResponse> {
    const tenantId = currentTenantId();
    return { policy: await this.twoFactor.policy(tenantId), members: await this.twoFactor.members(tenantId) };
  }

  @Put('policy')
  @RequirePermissions('school.manage')
  async setPolicy(@Body(new ZodPipe(securityPolicySchema)) body: SecurityPolicy): Promise<SecurityPolicy> {
    const ctx = currentContext();
    if (body.requireTwoFactorForPowerfulStaff) {
      const me = await this.prisma.root.user.findUniqueOrThrow({ where: { id: ctx.userId! }, select: { totpEnabledAt: true } });
      if (!me.totpEnabledAt) {
        throw new BadRequestException('Turn on two-step sign-in for your own account first, so you are not locked out.');
      }
    }
    return this.twoFactor.setPolicy(currentTenantId(), body, ctx.userId!);
  }

  /** A member of this school lost their phone and their recovery codes. */
  @Post('reset/:userId')
  @HttpCode(200)
  @RequirePermissions('users.manage')
  reset(@Param('userId') userId: string) {
    const ctx = currentContext();
    return this.twoFactor.reset(userId, { userId: ctx.userId!, tenantId: currentTenantId(), platform: false });
  }

  /** Platform support: reset anyone's two-step sign-in (by user ID or email). */
  @Post('platform-reset')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN')
  async platformReset(@Body(new ZodPipe(platformResetSchema)) body: z.infer<typeof platformResetSchema>) {
    const user = await this.prisma.root.user.findFirst({
      where: body.userId ? { id: body.userId } : { email: body.email },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('No account with that email');
    return this.twoFactor.reset(user.id, { userId: currentContext().userId!, tenantId: null, platform: true });
  }
}
