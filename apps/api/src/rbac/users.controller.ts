import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  adminResetPasswordSchema,
  inviteUserSchema,
  type AdminResetPasswordInput,
  type AdminResetPasswordResponse,
  type InviteUserInput,
  type UserRow,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { PasswordService } from '../auth/password.service';
import { RequirePermissions } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { platformSender } from '../subscriptions/billing-state.service';
import { assertCanGrant } from './grant';
import { PrismaService } from '../prisma/prisma.service';

const updateMemberSchema = z.object({
  roleIds: z.array(z.string()).min(1).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});
type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

/** The people who can sign in to this school, and their roles. */
@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
  ) {}

  @Get()
  @RequirePermissions('users.read')
  async list(): Promise<UserRow[]> {
    const rows = await this.prisma.db.membership.findMany({
      include: { user: true, roles: { include: { role: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      status: m.status === 'DISABLED' ? 'DISABLED' : m.user.status,
      lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
      roles: m.roles.map((r) => r.role),
    }));
  }

  /**
   * Adds someone to the school. An email that already has an account (e.g. a
   * parent at two schools) only gets a membership: their password and name are
   * never touched (the typed password is not used), the admin is told so, and
   * the person is told they were added.
   */
  @Post()
  @RequirePermissions('users.manage')
  async invite(@Body(new ZodPipe(inviteUserSchema)) body: InviteUserInput) {
    const tenantId = currentTenantId();
    const roles = await this.prisma.db.role.findMany({ where: { id: { in: body.roleIds } } });
    if (roles.length !== body.roleIds.length) throw new BadRequestException('Unknown role');
    assertCanGrant(currentContext().permissions, roles);
    const passwordHash = await hashPassword(body.password);

    let existing: { id: string; email: string; firstName: string } | null = null;
    const membership = await this.prisma.root.$transaction(async (tx) => {
      const found = await tx.user.findUnique({ where: { email: body.email }, select: { id: true, email: true, firstName: true } });
      // Only a new account gets the typed password; an existing one keeps its own.
      const user = found ?? (await tx.user.create({ data: { email: body.email, firstName: body.firstName, lastName: body.lastName, passwordHash }, select: { id: true, email: true, firstName: true } }));
      const member = await tx.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } });
      if (member) throw new BadRequestException(`${body.email} is already a member of this school`);
      const m = await tx.membership.create({ data: { tenantId, userId: user.id } });
      await tx.membershipRole.createMany({ data: roles.map((r) => ({ membershipId: m.id, roleId: r.id })) });
      existing = found;
      return m;
    });
    const user = existing as { id: string; email: string; firstName: string } | null;
    const existingAccount = !!user;

    if (user) {
      const school = await this.prisma.root.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      const title = `You were added to ${school?.name ?? 'a school'}`;
      const text = `${school?.name ?? 'A school'} gave your AI School OS account access as ${roles.map((r) => r.name).join(', ')}. Sign in with your usual password and switch school to open it. If you don't know this school, contact them or AI School OS support.`;
      void this.prisma.root.notification.create({ data: { tenantId, userId: user.id, title, body: text, link: '/' } }).catch(() => undefined);
      const mail = platformSender();
      if (mail) void mail.send(user.email, `[AI School OS] ${title}`, `Hello ${user.firstName},\n\n${text}\n\nAI School OS`).catch(() => undefined);
    }

    await this.audit.log({
      action: 'users.added',
      entityType: 'Membership',
      entityId: membership.id,
      summary: `Gave ${body.firstName} ${body.lastName} (${body.email}) access as ${roles.map((r) => r.name).join(', ')}${existingAccount ? ' (an existing account: its password was not changed)' : ''}`,
    });
    return {
      membershipId: membership.id,
      existingAccount,
      ...(existingAccount ? { message: `${body.email} already has an AI School OS account, so it was added to your school with its own password (the password you typed was not used). They have been told.` } : {}),
    };
  }

  /**
   * Sets a new password for a member who can't sign in (typed by the admin,
   * or generated and shown once). They are signed out everywhere and must
   * choose their own password at their next sign-in. Not for yourself, for
   * someone holding permissions you don't, or for an account shared with
   * another school (see PasswordService.adminReset).
   */
  @Post(':membershipId/password')
  @HttpCode(200)
  @RequirePermissions('users.manage')
  @Throttle({ default: { limit: 20, ttl: 15 * 60_000 } })
  resetPassword(
    @Param('membershipId') membershipId: string,
    @Body(new ZodPipe(adminResetPasswordSchema)) body: AdminResetPasswordInput,
  ): Promise<AdminResetPasswordResponse> {
    const ctx = currentContext();
    return this.passwords.adminReset({ userId: ctx.userId!, tenantId: currentTenantId(), permissions: ctx.permissions }, membershipId, body.password);
  }

  @Patch(':membershipId')
  @RequirePermissions('users.manage')
  async update(
    @Param('membershipId') membershipId: string,
    @Body(new ZodPipe(updateMemberSchema)) body: UpdateMemberInput,
  ) {
    const membership = await this.prisma.db.membership.findUniqueOrThrow({
      where: { id: membershipId },
      include: { user: true, roles: { include: { role: { select: { name: true, permissions: true } } } } },
    });
    if (membership.userId === currentContext().userId) {
      throw new BadRequestException('You cannot change your own access; ask another admin');
    }
    // Someone with permissions you don't hold (e.g. a School Admin) is not yours to demote or disable.
    assertCanGrant(currentContext().permissions, membership.roles.map((r) => r.role));

    const changes: string[] = [];
    if (body.roleIds) {
      const roles = await this.prisma.db.role.findMany({ where: { id: { in: body.roleIds } } });
      if (roles.length !== body.roleIds.length) throw new BadRequestException('Unknown role');
      assertCanGrant(currentContext().permissions, roles);
      await this.prisma.root.$transaction([
        this.prisma.root.membershipRole.deleteMany({ where: { membershipId } }),
        this.prisma.root.membershipRole.createMany({
          data: roles.map((r) => ({ membershipId, roleId: r.id })),
        }),
      ]);
      changes.push(`roles set to ${roles.map((r) => r.name).join(', ')}`);
    }
    if (body.status) {
      await this.prisma.db.membership.update({ where: { id: membershipId }, data: { status: body.status } });
      changes.push(body.status === 'DISABLED' ? 'access disabled' : 'access restored');
    }

    await this.audit.log({
      action: 'users.updated',
      entityType: 'Membership',
      entityId: membershipId,
      summary: `${membership.user.firstName} ${membership.user.lastName}: ${changes.join('; ') || 'no changes'}`,
    });
    return { ok: true };
  }
}
