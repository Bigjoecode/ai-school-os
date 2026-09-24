import { Body, Controller, Get, Post } from '@nestjs/common';
import { createTenantSchema, type CreateTenantInput, type TenantRow } from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { RequirePlatformRole } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { ProvisioningService } from './provisioning.service';

/** SaaS operator console: every school on the platform. */
@Controller('platform')
@RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN')
export class PlatformController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
    private readonly audit: AuditService,
  ) {}

  @Get('tenants')
  async tenants(): Promise<TenantRow[]> {
    const rows = await this.prisma.root.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { select: { name: true } },
        _count: { select: { students: true, memberships: true } },
      },
    });
    return rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      students: t._count.students,
      users: t._count.memberships,
      plan: t.plan?.name ?? null,
    }));
  }

  @Post('tenants')
  @RequirePlatformRole('SUPER_ADMIN')
  async create(@Body(new ZodPipe(createTenantSchema)) body: CreateTenantInput) {
    const tenant = await this.provisioning.createSchool(body);
    await this.audit.log({
      action: 'platform.school_created',
      summary: `Created school ${tenant.name} (${tenant.slug})`,
      entityType: 'Tenant',
      entityId: tenant.id,
      tenantId: tenant.id,
    });
    return { id: tenant.id, slug: tenant.slug, name: tenant.name };
  }
}
