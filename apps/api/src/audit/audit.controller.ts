import { Controller, Get, Query } from '@nestjs/common';
import { listQuerySchema, type AuditRow, type ListQuery, type Paginated } from '@aischool/shared';
import { RequirePermissions } from '../common/decorators';
import { fullName, paginate } from '../common/format';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit.read')
  async list(@Query(new ZodPipe(listQuerySchema)) q: ListQuery): Promise<Paginated<AuditRow>> {
    // AuditLog allows a null tenant (platform events), so it lives on the
    // root client; the tenant filter is applied explicitly here.
    const where = {
      tenantId: currentTenantId(),
      ...(q.q ? { summary: { contains: q.q, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.root.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
        ...paginate(q.page, q.pageSize),
      }),
      this.prisma.root.auditLog.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        actor: r.actor ? { id: r.actor.id, name: fullName(r.actor), email: r.actor.email } : null,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
