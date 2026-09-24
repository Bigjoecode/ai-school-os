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
import type { Permission, PlatformRole } from '@aischool/shared';
import {
  ALLOW_NO_TENANT,
  IS_PUBLIC,
  PERMISSIONS,
  PLATFORM_ROLES_KEY,
} from '../common/decorators';
import { RequestContextStore } from '../common/request-context';
import { AccessService } from './access.service';
import type { AccessTokenPayload } from './tokens';

/**
 * Global guard. For every non-public route it:
 *  1. verifies the Bearer access token,
 *  2. resolves the user's roles/permissions in the token's school,
 *  3. fills the request context (read by the tenant-scoped Prisma client),
 *  4. enforces @RequirePermissions / @RequirePlatformRole / tenant presence.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly access: AccessService,
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

    const ctx = RequestContextStore.get();
    if (!ctx) throw new Error('Request context middleware is not installed');
    ctx.userId = resolved.user.id;
    ctx.platformRole = resolved.user.platformRole;
    ctx.sessionId = payload.sid;
    ctx.tenantId = resolved.tenant?.id ?? null;
    ctx.permissions = resolved.permissions;

    const platformRoles = this.reflector.getAllAndOverride<PlatformRole[]>(PLATFORM_ROLES_KEY, targets);
    if (platformRoles?.length) {
      if (!resolved.user.platformRole || !platformRoles.includes(resolved.user.platformRole)) {
        throw new ForbiddenException('Platform administrators only');
      }
      return true;
    }

    const allowNoTenant = this.reflector.getAllAndOverride<boolean>(ALLOW_NO_TENANT, targets);
    if (!ctx.tenantId && !allowNoTenant) throw new ForbiddenException('Select a school first');

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS, targets) ?? [];
    const missing = required.filter((p) => !ctx.permissions.has(p));
    if (missing.length) {
      throw new ForbiddenException(`You don't have permission to do this (${missing.join(', ')})`);
    }
    return true;
  }
}
