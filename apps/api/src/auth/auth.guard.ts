import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { TWO_FACTOR_SETUP_REQUIRED, type Permission, type PlatformRole } from '@aischool/shared';
import {
  ALLOW_NO_TENANT,
  FEATURE_KEY,
  IS_PUBLIC,
  PERMISSIONS,
  PLATFORM_ROLES_KEY,
} from '../common/decorators';
import { RequestContextStore } from '../common/request-context';
import { FeatureService } from '../features/features.service';
import { ConsentEnforcementService } from '../data-protection/consent-enforcement.service';
import { BillingStateService } from '../subscriptions/billing-state.service';
import { AccessService } from './access.service';
import { DemoModeService } from './demo-mode.service';
import { ALLOW_WITHOUT_2FA } from './two-factor.decorator';
import { TwoFactorService } from './two-factor.service';
import type { AccessTokenPayload } from './tokens';

/**
 * Global guard. For every non-public route it:
 *  1. verifies the Bearer access token,
 *  2. resolves the user's roles/permissions in the token's school,
 *  3. fills the request context (read by the tenant-scoped Prisma client),
 *  4. enforces @RequirePermissions / @RequirePlatformRole / tenant presence,
 *  5. checks the school's plan includes the route's @RequireFeature module,
 *  6. blocks everything but set-up when two-step sign-in is required and not on yet,
 *  7. ends sessions in a demo school whose logins are switched off (DemoModeService),
 *  8. holds parents at the consent step when their school requires NDPA consent (ConsentEnforcementService),
 *  9. refuses writes in a school whose subscription has lapsed past its grace period (BillingStateService).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly access: AccessService,
    private readonly features: FeatureService,
    private readonly twoFactor: TwoFactorService,
    private readonly demo: DemoModeService,
    private readonly consent: ConsentEnforcementService,
    private readonly billingState: BillingStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Sign in to continue');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Your session has expired');
    }
    if (payload.typ !== 'access') throw new UnauthorizedException();

    const resolved = await this.access.resolve(payload.sub, payload.tid ?? null);
    if (!resolved) throw new UnauthorizedException('Your account is not active');
    if (!(await this.demo.allows(resolved.tenant?.id, resolved.user.platformRole))) throw new UnauthorizedException('Your session has ended');

    const ctx = RequestContextStore.get();
    if (!ctx) throw new Error('Request context middleware is not installed');
    ctx.userId = resolved.user.id;
    ctx.platformRole = resolved.user.platformRole;
    ctx.sessionId = payload.sid;
    ctx.tenantId = resolved.tenant?.id ?? null;
    ctx.permissions = resolved.permissions;

    // A school (or the platform) that requires two-step sign-in: until it is set up,
    // only the profile, the set-up endpoints and sign-out are open.
    if (
      !resolved.user.twoFactorEnabled &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_2FA, targets) &&
      (await this.twoFactor.mustEnrolFirst(resolved))
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: TWO_FACTOR_SETUP_REQUIRED,
        message: 'Set up two-step sign-in to continue (Settings → Security).',
      });
    }

    const platformRoles = this.reflector.getAllAndOverride<PlatformRole[]>(PLATFORM_ROLES_KEY, targets);
    if (platformRoles?.length) {
      if (!resolved.user.platformRole || !platformRoles.includes(resolved.user.platformRole)) {
        throw new ForbiddenException('Platform administrators only');
      }
      // Console routes act across schools, never inside the one a super admin has open.
      ctx.tenantId = null;
      return true;
    }

    const allowNoTenant = this.reflector.getAllAndOverride<boolean>(ALLOW_NO_TENANT, targets);
    if (!ctx.tenantId && !allowNoTenant) throw new ForbiddenException('Select a school first');

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS, targets) ?? [];
    const missing = required.filter((p) => !ctx.permissions.has(p));
    if (missing.length) {
      throw new ForbiddenException(`You don't have permission to do this (${missing.join(', ')})`);
    }

    const feature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, targets);
    if (feature && ctx.tenantId) await this.features.assert(ctx.tenantId, feature);
    await this.consent.assertRequest(req.path, ctx.tenantId, resolved.user.id, resolved.roles.map((r) => r.key), resolved.user.platformRole);
    await this.billingState.assertWritable(req.method, req.path, ctx.tenantId, resolved.user.platformRole);
    return true;
  }
}
