import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { inviteUserSchema, type InviteUserInput, type UserRow } from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { RequirePermissions } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
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
   * parent at two schools) gets a membership; their password is unchanged.
   */
  @Post()
  @RequirePermissions('users.manage')
  async invite(@Body(new ZodPipe(inviteUserSchema)) body: InviteUserInput) {
    const tenantId = currentTenantId();
    const roles = await this.prisma.db.role.findMany({ where: { id: { in: body.roleIds } } });
    if (roles.length !== body.roleIds.length) throw new BadRequestException('Unknown role');
    const passwordHash = await hashPassword(body.password);

    const membership = await this.prisma.root.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: body.email },
        update: {},
        create: { email: body.email, firstName: body.firstName, lastName: body.lastName, passwordHash },
      });
      const existing = await tx.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } });
      if (existing) throw new BadRequestException(`${body.email} is already a member of this school`);
      const m = await tx.membership.create({ data: { tenantId, userId: user.id } });
      await tx.membershipRole.createMany({ data: roles.map((r) => ({ membershipId: m.id, roleId: r.id })) });
      return m;
    });

    await this.audit.log({
      action: 'users.added',
      entityType: 'Membership',
      entityId: membership.id,
      summary: `Gave ${body.firstName} ${body.lastName} (${body.email}) access as ${roles.map((r) => r.name).join(', ')}`,
    });
    return { membershipId: membership.id };
  }

  @Patch(':membershipId')
  @RequirePermissions('users.manage')
  async update(
    @Param('membershipId') membershipId: string,
    @Body(new ZodPipe(updateMemberSchema)) body: UpdateMemberInput,
  ) {
    const membership = await this.prisma.db.membership.findUniqueOrThrow({
      where: { id: membershipId },
      include: { user: true },
    });
    if (membership.userId === currentContext().userId) {
      throw new BadRequestException('You cannot change your own access; ask another admin');
    }

    const changes: string[] = [];
    if (body.roleIds) {
      const roles = await this.prisma.db.role.findMany({ where: { id: { in: body.roleIds } } });
      if (roles.length !== body.roleIds.length) throw new BadRequestException('Unknown role');
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
