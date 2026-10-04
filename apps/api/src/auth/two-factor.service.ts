import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SECURITY_POLICY,
  RECOVERY_CODE_COUNT,
  isPowerfulStaff,
  securityPolicySchema,
  type SecurityMemberRow,
  type SecurityPolicy,
  type TwoFactorStatus,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { decryptSecret, encryptSecret } from '../common/crypto-box';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedAccess } from './access.service';
import { verifyPassword } from './password';
import {
  generateRecoveryCode,
  generateTotpSecret,
  hashRecoveryCode,
  normaliseRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from './totp';

export const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 5 * 60;
const MAX_CHALLENGE_ATTEMPTS = 5;
const POLICY_CACHE_MS = 30_000;
const ISSUER = 'AI School OS';

interface ChallengePayload {
  sub: string;
  tid: string | null;
  jti: string;
  typ: '2fa';
}

export interface Requirement {
  required: boolean;
  recommended: boolean;
  reason: string | null;
}

/** Platform staff must use two-step sign-in when the operator sets REQUIRE_PLATFORM_2FA=true. */
function platformTwoFactorRequired(): boolean {
  const v = process.env.REQUIRE_PLATFORM_2FA;
  return v === 'true' || v === '1';
}

const policyKey = (tenantId: string) => `tenant-security:${tenantId}`;

/**
 * Two-step sign-in with an authenticator app: enrolment, recovery codes, the
 * login challenge, and the school's "require it for powerful staff" policy.
 *
 * Short-lived bookkeeping (challenge attempts, the last accepted time step per
 * user so a code can't be replayed) is kept in memory: the app runs as a single
 * Passenger process, and losing it on restart only ever errs towards asking
 * the user to sign in again.
 */
@Injectable()
export class TwoFactorService {
  private readonly policyCache = new Map<string, { at: number; policy: SecurityPolicy }>();
  private readonly lastStep = new Map<string, number>();
  private readonly challengeAttempts = new Map<string, { count: number; expires: number }>();
  private readonly usedChallenges = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ policy

  async policy(tenantId: string): Promise<SecurityPolicy> {
    const hit = this.policyCache.get(tenantId);
    if (hit && Date.now() - hit.at < POLICY_CACHE_MS) return hit.policy;
    const row = await this.prisma.root.platformSetting.findUnique({ where: { key: policyKey(tenantId) } });
    const parsed = securityPolicySchema.safeParse(row?.value);
    const policy = parsed.success ? parsed.data : DEFAULT_SECURITY_POLICY;
    this.policyCache.set(tenantId, { at: Date.now(), policy });
    return policy;
  }

  async setPolicy(tenantId: string, policy: SecurityPolicy, actorUserId: string): Promise<SecurityPolicy> {
    const before = await this.policy(tenantId);
    await this.prisma.root.platformSetting.upsert({
      where: { key: policyKey(tenantId) },
      create: { key: policyKey(tenantId), value: policy, updatedBy: actorUserId },
      update: { value: policy, updatedBy: actorUserId },
    });
    this.policyCache.delete(tenantId);
    if (before.requireTwoFactorForPowerfulStaff !== policy.requireTwoFactorForPowerfulStaff) {
      await this.audit.log({
        action: policy.requireTwoFactorForPowerfulStaff ? 'security.2fa_required' : 'security.2fa_not_required',
        summary: policy.requireTwoFactorForPowerfulStaff
          ? 'Two-step sign-in is now required for admins, principals and finance staff'
          : 'Two-step sign-in is no longer required for admins, principals and finance staff',
        tenantId,
        actorUserId,
      });
    }
    return policy;
  }

  /** Whether this account must (or should) use two-step sign-in in the school it is signed into. */
  async requirement(access: ResolvedAccess): Promise<Requirement> {
    if (access.user.platformRole) {
      return {
        required: platformTwoFactorRequired(),
        recommended: true,
        reason: 'Platform staff can reach every school, so two-step sign-in protects them all.',
      };
    }
    if (!access.tenant) return { required: false, recommended: false, reason: null };
    if (!isPowerfulStaff(access.roles.map((r) => r.key), access.permissions)) {
      return { required: false, recommended: false, reason: null };
    }
    const policy = await this.policy(access.tenant.id);
    return {
      required: policy.requireTwoFactorForPowerfulStaff,
      recommended: true,
      reason: policy.requireTwoFactorForPowerfulStaff
        ? `${access.tenant.name} requires two-step sign-in for staff who can manage the school, users or money.`
        : 'Your role can manage the school, users or money, so two-step sign-in is strongly recommended.',
    };
  }

  /** Used by the guard on every request: cheap for parents, students and most staff (no database call). */
  async mustEnrolFirst(access: ResolvedAccess): Promise<boolean> {
    if (access.user.twoFactorEnabled) return false;
    if (access.user.platformRole) return platformTwoFactorRequired();
    if (!access.tenant || !isPowerfulStaff(access.roles.map((r) => r.key), access.permissions)) return false;
    return (await this.policy(access.tenant.id)).requireTwoFactorForPowerfulStaff;
  }

  async status(access: ResolvedAccess): Promise<TwoFactorStatus> {
    const user = await this.prisma.root.user.findUniqueOrThrow({
      where: { id: access.user.id },
      select: { totpEnabledAt: true, recoveryCodes: true },
    });
    const req = await this.requirement(access);
    return {
      enabled: !!user.totpEnabledAt,
      enabledAt: user.totpEnabledAt?.toISOString() ?? null,
      recoveryCodesLeft: user.totpEnabledAt ? user.recoveryCodes.length : 0,
      ...req,
    };
  }

  /** Staff of this school and whether each has two-step sign-in on (for the policy screen). */
  async members(tenantId: string): Promise<SecurityMemberRow[]> {
    const rows = await this.prisma.root.membership.findMany({
      where: { tenantId, status: 'ACTIVE' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, totpEnabledAt: true, platformRole: true, status: true } },
        roles: { include: { role: { select: { key: true, name: true, permissions: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows
      .filter((m) => m.user.status !== 'DISABLED')
      .filter((m) => !m.roles.every((r) => r.role.key === 'parent' || r.role.key === 'student') || !!m.user.totpEnabledAt)
      .map((m) => {
        const keys = m.roles.map((r) => r.role.key);
        const perms = m.roles.flatMap((r) => r.role.permissions);
        return {
          userId: m.user.id,
          name: `${m.user.firstName} ${m.user.lastName}`,
          email: m.user.email,
          roles: m.roles.map((r) => r.role.name),
          powerful: isPowerfulStaff(keys, perms),
          twoFactorEnabled: !!m.user.totpEnabledAt,
          enabledAt: m.user.totpEnabledAt?.toISOString() ?? null,
          isPlatformStaff: !!m.user.platformRole,
        };
      })
      .sort((a, b) => Number(b.powerful) - Number(a.powerful) || a.name.localeCompare(b.name));
  }

  // -------------------------------------------------------------- enrolment

  /** Starts (or restarts) set-up: a fresh secret, kept encrypted until a code confirms it. */
  async beginSetup(userId: string) {
    const user = await this.prisma.root.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt) throw new ConflictException('Two-step sign-in is already on. Turn it off first to move it to a new device.');
    const secret = generateTotpSecret();
    await this.prisma.root.user.update({ where: { id: userId }, data: { totpSecret: encryptSecret(secret) } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email, ISSUER) };
  }

  async enable(userId: string, code: string, sessionId: string | undefined, tenantId: string | null) {
    const user = await this.prisma.root.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt) throw new ConflictException('Two-step sign-in is already on');
    if (!user.totpSecret) throw new BadRequestException('Start set-up first');
    if (!this.acceptTotp(userId, this.secretOf(user.totpSecret), code)) {
      throw new BadRequestException({
        message: "That code didn't match. Check the time on your phone is set automatically and try the newest code.",
        errors: [{ path: 'code', message: "That code didn't match" }],
      });
    }
    const codes = this.newRecoveryCodes();
    await this.prisma.root.user.update({
      where: { id: userId },
      data: { totpEnabledAt: new Date(), recoveryCodes: codes.map((c) => hashRecoveryCode(userId, c)) },
    });
    // Sign out everywhere else: any session started before this point never passed the second step.
    await this.revokeOtherSessions(userId, sessionId);
    await this.audit.log({
      action: 'auth.2fa_enabled',
      entityType: 'User',
      entityId: userId,
      summary: `${user.firstName} ${user.lastName} turned on two-step sign-in`,
      tenantId,
      actorUserId: userId,
    });
    return { recoveryCodes: codes };
  }

  async disable(userId: string, password: string, code: string, access: ResolvedAccess) {
    const user = await this.prisma.root.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabledAt || !user.totpSecret) throw new BadRequestException('Two-step sign-in is not on');
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new BadRequestException({ message: 'Incorrect password', errors: [{ path: 'password', message: 'Incorrect password' }] });
    }
    if ((await this.requirement(access)).required) {
      throw new ForbiddenException('Two-step sign-in is required for your role, so it cannot be turned off. Ask an admin to reset it if you have lost your phone.');
    }
    const method = await this.checkSecondFactor(user, code.replace(/\s+/g, '').length > 6 ? { recoveryCode: code } : { code });
    if (!method) throw this.codeMismatch();
    await this.prisma.root.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: [] },
    });
    this.lastStep.delete(userId);
    await this.audit.log({
      action: 'auth.2fa_disabled',
      entityType: 'User',
      entityId: userId,
      summary: `${user.firstName} ${user.lastName} turned off two-step sign-in`,
      tenantId: access.tenant?.id ?? null,
      actorUserId: userId,
    });
  }

  async regenerateRecoveryCodes(userId: string, code: string, tenantId: string | null) {
    const user = await this.prisma.root.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabledAt || !user.totpSecret) throw new BadRequestException('Two-step sign-in is not on');
    if (!this.acceptTotp(userId, this.secretOf(user.totpSecret), code)) {
      throw this.codeMismatch();
    }
    const codes = this.newRecoveryCodes();
    await this.prisma.root.user.update({
      where: { id: userId },
      data: { recoveryCodes: codes.map((c) => hashRecoveryCode(userId, c)) },
    });
    await this.audit.log({
      action: 'auth.2fa_recovery_regenerated',
      entityType: 'User',
      entityId: userId,
      summary: `${user.firstName} ${user.lastName} made new two-step recovery codes`,
      tenantId,
      actorUserId: userId,
    });
    return { recoveryCodes: codes };
  }

  /**
   * Support: clears someone's two-step sign-in (lost phone) and ends their
   * sessions. School admins may reset members of their own school, but never
   * platform staff; platform super/support admins may reset anyone.
   */
  async reset(targetUserId: string, actor: { userId: string; tenantId: string | null; platform: boolean }) {
    const target = await this.prisma.root.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');
    if (!actor.platform) {
      if (!actor.tenantId) throw new ForbiddenException('Select a school first');
      const m = await this.prisma.root.membership.findUnique({
        where: { tenantId_userId: { tenantId: actor.tenantId, userId: targetUserId } },
      });
      if (!m) throw new NotFoundException('That person is not a member of this school');
      if (target.platformRole) throw new ForbiddenException('Platform staff can only be reset by the platform team');
    }
    if (targetUserId === actor.userId) throw new BadRequestException('Use Settings → Security to change your own two-step sign-in');
    if (!target.totpEnabledAt && !target.totpSecret) return { ok: true, changed: false };

    await this.prisma.root.user.update({
      where: { id: targetUserId },
      data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: [] },
    });
    this.lastStep.delete(targetUserId);
    await this.prisma.root.authSession.updateMany({ where: { userId: targetUserId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({
      action: 'auth.2fa_reset',
      entityType: 'User',
      entityId: targetUserId,
      summary: `Reset two-step sign-in for ${target.firstName} ${target.lastName} (${target.email})${actor.platform ? ' (platform support)' : ''}`,
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      metadata: { platform: actor.platform },
    });
    return { ok: true, changed: true };
  }

  // -------------------------------------------------------------- login challenge

  async issueChallenge(userId: string, tenantId: string | null): Promise<string> {
    const payload: ChallengePayload = { sub: userId, tid: tenantId, jti: randomUUID(), typ: '2fa' };
    return this.jwt.signAsync(payload, { expiresIn: TWO_FACTOR_CHALLENGE_TTL_SECONDS });
  }

  async readChallenge(challenge: string): Promise<ChallengePayload> {
    let payload: ChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<ChallengePayload>(challenge);
    } catch {
      throw new UnauthorizedException('That sign-in attempt has expired. Enter your password again.');
    }
    if (payload.typ !== '2fa' || !payload.jti || !payload.sub) throw new UnauthorizedException('Enter your password again');
    this.sweep();
    if (this.usedChallenges.has(payload.jti)) throw new UnauthorizedException('That sign-in attempt has already been used. Enter your password again.');
    const attempts = this.challengeAttempts.get(payload.jti);
    if (attempts && attempts.count >= MAX_CHALLENGE_ATTEMPTS) {
      throw new UnauthorizedException('Too many wrong codes. Enter your password again.');
    }
    return payload;
  }

  noteFailedAttempt(jti: string) {
    const a = this.challengeAttempts.get(jti) ?? { count: 0, expires: Date.now() + TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000 };
    a.count += 1;
    this.challengeAttempts.set(jti, a);
  }

  markChallengeUsed(jti: string) {
    this.usedChallenges.set(jti, Date.now() + TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000);
    this.challengeAttempts.delete(jti);
  }

  /**
   * Checks a code from the app, or consumes one recovery code. Returns which
   * was used, or null when neither matched.
   */
  async checkSecondFactor(
    user: { id: string; totpSecret: string | null; recoveryCodes: string[] },
    input: { code?: string; recoveryCode?: string },
  ): Promise<'totp' | 'recovery' | null> {
    if (!user.totpSecret) return null;
    if (input.code) return this.acceptTotp(user.id, this.secretOf(user.totpSecret), input.code) ? 'totp' : null;
    if (input.recoveryCode) {
      const hash = hashRecoveryCode(user.id, normaliseRecoveryCode(input.recoveryCode));
      if (!user.recoveryCodes.includes(hash)) return null;
      // Conditional update: two simultaneous uses of one code can't both succeed.
      const done = await this.prisma.root.user.updateMany({
        where: { id: user.id, recoveryCodes: { has: hash } },
        data: { recoveryCodes: user.recoveryCodes.filter((h) => h !== hash) },
      });
      return done.count === 1 ? 'recovery' : null;
    }
    return null;
  }

  // ------------------------------------------------------------------ helpers

  private codeMismatch() {
    return new BadRequestException({
      message: "That code didn't match (or was just used). Wait for the next code in your app and try again.",
      errors: [{ path: 'code', message: "That code didn't match" }],
    });
  }

  private secretOf(box: string): string {
    try {
      return decryptSecret(box);
    } catch {
      throw new UnauthorizedException('Two-step sign-in could not be checked. Ask an admin to reset it for you.');
    }
  }

  /** A code is accepted once: the same (or an older) time step can't be replayed. */
  private acceptTotp(userId: string, secret: string, code: string): boolean {
    const step = verifyTotp(secret, code);
    if (step === null) return false;
    const last = this.lastStep.get(userId);
    if (last !== undefined && step <= last) return false;
    this.lastStep.set(userId, step);
    return true;
  }

  private newRecoveryCodes(): string[] {
    const set = new Set<string>();
    while (set.size < RECOVERY_CODE_COUNT) set.add(generateRecoveryCode());
    return [...set];
  }

  private async revokeOtherSessions(userId: string, sessionId: string | undefined) {
    const current = sessionId
      ? await this.prisma.root.authSession.findUnique({ where: { id: sessionId }, select: { familyId: true } })
      : null;
    await this.prisma.root.authSession.updateMany({
      where: { userId, revokedAt: null, ...(current ? { familyId: { not: current.familyId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  private sweep() {
    const now = Date.now();
    for (const [k, exp] of this.usedChallenges) if (exp < now) this.usedChallenges.delete(k);
    for (const [k, a] of this.challengeAttempts) if (a.expires < now) this.challengeAttempts.delete(k);
  }
}
