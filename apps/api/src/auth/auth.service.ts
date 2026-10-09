import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { AuthResponse, LoginInput, TwoFactorChallengeResponse, TwoFactorLoginInput } from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { DemoModeService } from './demo-mode.service';
import { TWO_FACTOR_CHALLENGE_TTL_SECONDS, TwoFactorService } from './two-factor.service';
import { burnPasswordCheck, verifyPassword } from './password';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  hashToken,
  newRefreshToken,
  type AccessTokenPayload,
} from './tokens';

interface ClientInfo {
  ip?: string;
  userAgent?: string;
  host?: string;
}

export interface IssuedSession {
  response: AuthResponse;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
    private readonly demo: DemoModeService,
  ) {}

  /** Demo schools can be closed to sign-in from the console (or DEMO_LOGINS=off). Neutral wording: nothing about why. */
  private async assertSchoolOpen(tenantId: string | null, platformRole: string | null) {
    if (!(await this.demo.allows(tenantId, platformRole))) {
      throw new ForbiddenException('Sign-in to this school is not available at the moment.');
    }
  }

  /**
   * Password sign-in. With two-step sign-in on, no session is issued yet:
   * the caller gets a 5-minute challenge to complete with POST /auth/2fa.
   */
  async login(input: LoginInput, client: ClientInfo): Promise<IssuedSession | TwoFactorChallengeResponse> {
    const user = await this.prisma.root.user.findUnique({ where: { email: input.email } });
    if (!user) {
      await burnPasswordCheck(input.password);
      throw new UnauthorizedException('Incorrect email or password');
    }
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      await this.audit.log({
        action: 'auth.login_failed',
        summary: `Failed sign-in for ${user.email}`,
        tenantId: null,
        actorUserId: user.id,
      });
      throw new UnauthorizedException('Incorrect email or password');
    }
    if (user.status === 'DISABLED') throw new ForbiddenException('This account has been disabled');

    const tenantId = await this.pickTenant(user.id, user.platformRole, input.school, client.host);
    await this.assertSchoolOpen(tenantId, user.platformRole);
    if (user.totpEnabledAt) {
      return {
        twoFactorRequired: true,
        challenge: await this.twoFactor.issueChallenge(user.id, tenantId),
        expiresIn: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
      };
    }
    return this.finishLogin(user, tenantId, client, 'password');
  }

  /** Second step: a code from the authenticator app, or one recovery code (used up). */
  async completeTwoFactor(input: TwoFactorLoginInput, client: ClientInfo): Promise<IssuedSession> {
    const challenge = await this.twoFactor.readChallenge(input.challenge);
    const user = await this.prisma.root.user.findUnique({ where: { id: challenge.sub } });
    if (!user || user.status === 'DISABLED') throw new ForbiddenException('This account has been disabled');
    if (!user.totpEnabledAt) {
      // Reset by an admin between the two steps: the password was already checked.
      this.twoFactor.markChallengeUsed(challenge.jti);
      return this.finishLogin(user, challenge.tid, client, 'password');
    }

    const method = await this.twoFactor.checkSecondFactor(user, input);
    if (!method) {
      this.twoFactor.noteFailedAttempt(challenge.jti);
      await this.audit.log({
        action: 'auth.2fa_failed',
        summary: `Wrong two-step ${input.recoveryCode ? 'recovery code' : 'code'} for ${user.email}`,
        tenantId: challenge.tid,
        actorUserId: user.id,
      });
      throw new UnauthorizedException(
        input.recoveryCode ? "That recovery code didn't work (each code works once)." : "That code didn't match. Try the newest code in your app.",
      );
    }
    this.twoFactor.markChallengeUsed(challenge.jti);
    if (method === 'recovery') {
      const left = user.recoveryCodes.length - 1;
      await this.audit.log({
        action: 'auth.2fa_recovery_used',
        entityType: 'User',
        entityId: user.id,
        summary: `${user.firstName} ${user.lastName} signed in with a recovery code (${left} left)`,
        tenantId: challenge.tid,
        actorUserId: user.id,
        metadata: { left },
      });
    }
    return this.finishLogin(user, challenge.tid, client, method);
  }

  private async finishLogin(
    user: { id: string; firstName: string; lastName: string },
    tenantId: string | null,
    client: ClientInfo,
    method: 'password' | 'totp' | 'recovery',
  ): Promise<IssuedSession> {
    const issued = await this.issue(user.id, tenantId, randomUUID(), client);
    await this.prisma.root.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      action: 'auth.login',
      summary: `${user.firstName} ${user.lastName} signed in${method === 'password' ? '' : ' with two-step sign-in'}`,
      tenantId,
      actorUserId: user.id,
      metadata: method === 'password' ? undefined : { secondFactor: method },
    });
    return issued;
  }

  /**
   * Rotates the refresh token. Presenting a token that was already rotated
   * means it was copied — the whole session family is revoked.
   */
  async refresh(refreshToken: string | undefined, client: ClientInfo): Promise<IssuedSession> {
    if (!refreshToken) throw new UnauthorizedException('Sign in to continue');
    const session = await this.prisma.root.authSession.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Your session has expired');
    }
    if (session.rotatedAt) {
      await this.prisma.root.authSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({
        action: 'auth.token_reuse',
        summary: 'A reused sign-in token was detected; the session was ended',
        tenantId: session.tenantId,
        actorUserId: session.userId,
      });
      throw new UnauthorizedException('Your session has expired');
    }

    await this.prisma.root.authSession.update({
      where: { id: session.id },
      data: { rotatedAt: new Date() },
    });
    return this.issue(session.userId, session.tenantId, session.familyId, client);
  }

  async switchTenant(userId: string, tenantId: string, familyId: string | undefined, client: ClientInfo) {
    const user = await this.prisma.root.user.findUniqueOrThrow({ where: { id: userId } });
    const allowed =
      user.platformRole === 'SUPER_ADMIN' ||
      (await this.prisma.root.membership.count({ where: { userId, tenantId, status: 'ACTIVE' } })) > 0;
    if (!allowed) throw new ForbiddenException('You are not a member of that school');

    if (familyId) {
      await this.prisma.root.authSession.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const issued = await this.issue(userId, tenantId, randomUUID(), client);
    await this.audit.log({
      action: 'auth.switch_school',
      summary: `${user.firstName} ${user.lastName} switched to ${issued.response.tenant?.name ?? 'a school'}`,
      tenantId,
      actorUserId: userId,
    });
    return issued;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const session = await this.prisma.root.authSession.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!session) return;
    await this.prisma.root.authSession.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async familyOf(refreshToken: string | undefined): Promise<string | undefined> {
    if (!refreshToken) return undefined;
    const s = await this.prisma.root.authSession.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      select: { familyId: true },
    });
    return s?.familyId;
  }

  private async issue(
    userId: string,
    tenantId: string | null,
    familyId: string,
    client: ClientInfo,
  ): Promise<IssuedSession> {
    const me = await this.access.me(userId, tenantId);
    if (!me) throw new UnauthorizedException('Your account is not active');
    // The school may have been suspended since the token was issued.
    const effectiveTenantId = me.tenant?.id ?? null;
    // Every way into a school (password, two-step, refresh, switching school) passes here.
    await this.assertSchoolOpen(effectiveTenantId, me.user.platformRole);

    const refreshToken = newRefreshToken();
    const session = await this.prisma.root.authSession.create({
      data: {
        userId,
        tenantId: effectiveTenantId,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 300),
      },
    });

    const payload: AccessTokenPayload = { sub: userId, tid: effectiveTenantId, sid: session.id, typ: 'access' };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
    return { response: { ...me, accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS }, refreshToken };
  }

  /**
   * Which school to sign into: the one this hostname belongs to, else the
   * school ID typed on the form, else the user's first school. Platform staff
   * with no school membership sign in with no school selected.
   */
  private async pickTenant(
    userId: string,
    platformRole: string | null,
    schoolSlug: string | undefined,
    host: string | undefined,
  ): Promise<string | null> {
    const hostname = host?.split(':')[0]?.toLowerCase();
    const byHost = hostname
      ? await this.prisma.root.tenantDomain.findUnique({ where: { hostname }, select: { tenantId: true } })
      : null;

    let wanted: string | undefined = byHost?.tenantId;
    if (!wanted && schoolSlug) {
      const t = await this.prisma.root.tenant.findUnique({ where: { slug: schoolSlug }, select: { id: true } });
      if (!t) throw new UnauthorizedException('We could not find that school ID');
      wanted = t.id;
    }

    if (wanted) {
      if (platformRole === 'SUPER_ADMIN') return wanted;
      const m = await this.prisma.root.membership.findUnique({
        where: { tenantId_userId: { tenantId: wanted, userId } },
      });
      if (!m || m.status !== 'ACTIVE') throw new ForbiddenException('You do not have access to this school');
      return wanted;
    }

    // Platform staff may always open a demo school; others skip demo schools closed to sign-in.
    const closed = platformRole ? [] : await this.demo.closedTenantIds();
    const first = await this.prisma.root.membership.findFirst({
      where: { userId, status: 'ACTIVE', tenant: { status: { notIn: ['SUSPENDED', 'ARCHIVED'] } }, ...(closed.length ? { tenantId: { notIn: closed } } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    if (first) return first.tenantId;
    if (platformRole) return null;
    if (closed.length && (await this.prisma.root.membership.count({ where: { userId, status: 'ACTIVE', tenantId: { in: closed } } }))) {
      throw new ForbiddenException('Sign-in to this school is not available at the moment.');
    }
    throw new ForbiddenException('Your account is not linked to any school yet');
  }
}
