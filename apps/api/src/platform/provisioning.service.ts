import { ConflictException, Injectable } from '@nestjs/common';
import { SYSTEM_ROLES, type CreateTenantInput } from '@aischool/shared';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

/**
 * Creates a school ready to use: the tenant, its copy of the system roles, a
 * main branch, and the first School Admin (a new user, or an existing user
 * who gains a membership). All in one transaction.
 */
@Injectable()
export class ProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async createSchool(input: CreateTenantInput) {
    const taken = await this.prisma.root.tenant.findUnique({ where: { slug: input.slug } });
    if (taken) {
      throw new ConflictException({
        statusCode: 409,
        message: 'That school ID is taken',
        errors: [{ path: 'slug', message: 'Already in use' }],
      });
    }
    const passwordHash = await hashPassword(input.admin.password);

    return this.prisma.root.$transaction(async (tx) => {
      const plan = await tx.plan.findFirst({ where: { code: 'school-license', isActive: true } });
      const tenant = await tx.tenant.create({
        data: {
          name: input.name,
          slug: input.slug,
          country: input.country,
          currency: input.currency,
          timezone: input.timezone,
          status: 'TRIAL',
          planId: plan?.id,
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      await createSystemRoles(tx, tenant.id);
      await tx.branch.create({ data: { tenantId: tenant.id, name: 'Main Campus', code: 'MAIN', isMain: true } });

      const admin = await tx.user.upsert({
        where: { email: input.admin.email },
        update: {},
        create: {
          email: input.admin.email,
          passwordHash,
          firstName: input.admin.firstName,
          lastName: input.admin.lastName,
        },
      });
      await addMember(tx, tenant.id, admin.id, ['school_admin']);
      return tenant;
    });
  }
}

export async function createSystemRoles(tx: Tx, tenantId: string) {
  await tx.role.createMany({
    data: SYSTEM_ROLES.map((r) => ({
      tenantId,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: true,
      permissions: [...r.permissions],
    })),
    skipDuplicates: true,
  });
}

export async function addMember(tx: Tx, tenantId: string, userId: string, roleKeys: string[]) {
  const membership = await tx.membership.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: { status: 'ACTIVE' },
    create: { tenantId, userId },
  });
  const roles = await tx.role.findMany({ where: { tenantId, key: { in: roleKeys } } });
  await tx.membershipRole.createMany({
    data: roles.map((r) => ({ membershipId: membership.id, roleId: r.id })),
    skipDuplicates: true,
  });
  return membership;
}
