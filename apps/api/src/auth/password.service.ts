import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { AdminResetPasswordResponse, ChangePasswordInput, ChangePasswordResponse } from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanGrant } from '../rbac/grant';
import { platformSender } from '../subscriptions/billing-state.service';
import { AttemptLimiter } from './attempt-limiter';
import { hashPassword, verifyPassword } from './password';

/** Wrong current passwords per account before changing it pauses (a stolen, unlocked session can't brute-force it). */
export const WRONG_CURRENT_PASSWORD_LIMIT = 5;
export const WRONG_CURRENT_PASSWORD_WINDOW_MS = 15 * 60_000;

/** No 0/O, 1/l/I: read aloud or copied by hand without mistakes. */
const GENERATED_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 15 characters in three groups (about 86 bits), e.g. `kq7Fm-x2RtP-9wHcd`. */
export function generatePassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g++) {
    let s = '';
    for (let i = 0; i < 5; i++) s += GENERATED_ALPHABET[randomInt(GENERATED_ALPHABET.length)];
    groups.push(s);
  }
  return groups.join('-');
}

const fieldError = (path: string, message: string) => new BadRequestException({ message, errors: [{ path, message }] });

/** Rules the shared schema can't check alone (it doesn't know the account's email). */
function assertAcceptable(password: string, email: string, path: string) {
  const p = password.trim().toLowerCase();
  const e = email.trim().toLowerCase();
  if (p === e || p === e.split('@')[0]) throw fieldError(path, "Don't use your email address as the password");
}

export interface PasswordActor {
  userId: string;
  tenantId: string;
  permissions: ReadonlySet<string>;
}

/**
 * Changing your own password, and an admin setting a new one for a member.
 * Both end sessions (the auth guard checks the session on every request, so
 * ended sessions stop at once) and are audited.
 */
@Injectable()
export class PasswordService {
  private readonly wrongCurrent = new AttemptLimiter(WRONG_CURRENT_PASSWORD_LIMIT, WRONG_CURRENT_PASSWORD_WINDOW_MS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The signed-in user changes their password; every other device is signed out, this one stays. */
  async changeOwn(
    me: { userId: string; sessionId: string | undefined; tenantId: string | null },
    input: ChangePasswordInput,
  ): Promise<ChangePasswordResponse> {
    const blocked = this.wrongCurrent.blockedFor(me.userId);
    if (blocked) {
      throw new HttpException(
        `Too many wrong passwords. Try again in ${Math.max(1, Math.ceil(blocked / 60_000))} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = await this.prisma.root.user.findUnique({ where: { id: me.userId } });
    if (!user) throw new UnauthorizedException();
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      this.wrongCurrent.fail(me.userId);
      await this.audit.log({
        action: 'auth.password_change_failed',
        entityType: 'User',
        entityId: user.id,
        summary: `Wrong current password when ${user.firstName} ${user.lastName} tried to change their password`,
        tenantId: me.tenantId,
        actorUserId: user.id,
      });
      throw fieldError('currentPassword', 'Your current password is not right');
    }
    this.wrongCurrent.clear(me.userId);
    if (input.newPassword === input.currentPassword) throw fieldError('newPassword', 'Choose a password different from your current one');
    assertAcceptable(input.newPassword, user.email, 'newPassword');

    const passwordHash = await hashPassword(input.newPassword);
    const current = me.sessionId
      ? await this.prisma.root.authSession.findUnique({ where: { id: me.sessionId }, select: { familyId: true, userId: true } })
      : null;
    const keepFamily = current?.userId === user.id ? current.familyId : undefined;
    const [, ended] = await this.prisma.root.$transaction([
      this.prisma.root.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } }),
      // Every other sign-in (another phone, a forgotten laptop, whoever had the old password) ends now.
      this.prisma.root.authSession.updateMany({
        where: { userId: user.id, revokedAt: null, ...(keepFamily ? { familyId: { not: keepFamily } } : {}) },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.log({
      action: 'auth.password_changed',
      entityType: 'User',
      entityId: user.id,
      summary: `${user.firstName} ${user.lastName} changed their password${ended.count ? ` (${ended.count} other session${ended.count === 1 ? '' : 's'} signed out)` : ''}`,
      tenantId: me.tenantId,
      actorUserId: user.id,
      metadata: { otherSessionsEnded: ended.count, wasRequired: user.mustChangePassword },
    });
    this.tell(user, me.tenantId, 'Your password was changed', 'Your AI School OS password was just changed and your other devices were signed out. If this was not you, contact your school admin straight away.');
    return { ok: true, otherSessionsEnded: ended.count };
  }

  /**
   * An admin sets a new password for a member of their school (typed, or
   * generated and shown once). All the member's sessions end, and they must
   * choose their own password at their next sign-in.
   *
   * Never for: yourself (use Change password), platform staff, someone who
   * holds permissions you don't, or an account that also belongs to another
   * school or is an ambassador — a password is global, so resetting it here
   * would hand this school's admin a way into the other school.
   */
  async adminReset(actor: PasswordActor, membershipId: string, typed: string | undefined): Promise<AdminResetPasswordResponse> {
    const membership = await this.prisma.root.membership.findFirst({
      where: { id: membershipId, tenantId: actor.tenantId },
      include: { user: true, roles: { include: { role: { select: { name: true, permissions: true } } } } },
    });
    if (!membership) throw new NotFoundException('That person is not a member of this school');
    const target = membership.user;
    if (target.id === actor.userId) throw new BadRequestException('To change your own password, use Settings → Security');
    if (target.platformRole) throw new ForbiddenException('Platform staff passwords can only be reset by the platform team');
    // Someone with permissions you don't hold (e.g. a School Admin) is not yours to take over.
    try {
      assertCanGrant(actor.permissions, membership.roles.map((r) => r.role));
    } catch {
      throw new ForbiddenException(`You can't reset ${target.firstName} ${target.lastName}'s password: their roles have permissions you don't have yourself`);
    }
    const [otherSchools, ambassador] = await Promise.all([
      this.prisma.root.membership.count({ where: { userId: target.id, tenantId: { not: actor.tenantId } } }),
      this.prisma.root.ambassador.count({ where: { userId: target.id } }),
    ]);
    if (otherSchools || ambassador) {
      throw new ForbiddenException(
        `${target.firstName} ${target.lastName} also uses this account ${otherSchools ? 'at another school' : 'outside this school'}, so their password can't be reset here. Ask AI School OS support to help them.`,
      );
    }

    const password = typed ?? generatePassword();
    if (typed) assertAcceptable(typed, target.email, 'password');
    const passwordHash = await hashPassword(password);
    const [, ended] = await this.prisma.root.$transaction([
      this.prisma.root.user.update({ where: { id: target.id }, data: { passwordHash, mustChangePassword: true } }),
      this.prisma.root.authSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({
      action: 'auth.password_reset',
      entityType: 'User',
      entityId: target.id,
      summary: `Reset the password for ${target.firstName} ${target.lastName} (${target.email}); they were signed out everywhere and must choose a new one`,
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      metadata: { generated: !typed, sessionsEnded: ended.count },
    });
    this.tell(target, actor.tenantId, 'Your password was reset', 'A school admin reset your AI School OS password. Sign in with the password they give you, then choose your own. If you did not ask for this, contact your school straight away.');
    return { ok: true, generatedPassword: typed ? null : password, sessionsEnded: ended.count };
  }

  /** In-app notice (when signed into a school) and an email when the platform mailer is set up. Never blocks the change. */
  private tell(user: { id: string; email: string; firstName: string }, tenantId: string | null, title: string, body: string) {
    if (tenantId) {
      void this.prisma.root.notification
        .create({ data: { tenantId, userId: user.id, title, body, link: '/settings/security' } })
        .catch(() => undefined);
    }
    const mail = platformSender();
    if (mail) void mail.send(user.email, `[AI School OS] ${title}`, `Hello ${user.firstName},\n\n${body}\n\nAI School OS`).catch(() => undefined);
  }
}
