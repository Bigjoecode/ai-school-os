import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  guardianSchema,
  listQuerySchema,
  type GuardianInput,
  type GuardianRow,
  type ListQuery,
  type Paginated,
} from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { paginate } from '../common/format';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const include = {
  students: {
    include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } },
  },
} satisfies Prisma.GuardianInclude;

function toRow(g: Prisma.GuardianGetPayload<{ include: typeof include }>): GuardianRow {
  return {
    id: g.id,
    firstName: g.firstName,
    lastName: g.lastName,
    relationship: g.relationship,
    phone: g.phone,
    email: g.email,
    occupation: g.occupation,
    students: g.students.map((s) => s.student),
  };
}

@Controller('guardians')
export class GuardiansController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('guardians.read')
  async list(@Query(new ZodPipe(listQuerySchema)) q: ListQuery): Promise<Paginated<GuardianRow>> {
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.GuardianWhereInput = {
      AND: terms.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: 'insensitive' } },
          { lastName: { contains: t, mode: 'insensitive' } },
          { phone: { contains: t } },
          { email: { contains: t, mode: 'insensitive' } },
        ],
      })),
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.guardian.findMany({
        where,
        include,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        ...paginate(q.page, q.pageSize),
      }),
      this.prisma.db.guardian.count({ where }),
    ]);
    return { items: rows.map(toRow), total, page: q.page, pageSize: q.pageSize };
  }

  @Post()
  @RequirePermissions('guardians.manage')
  async create(@Body(new ZodPipe(guardianSchema)) body: GuardianInput) {
    const { studentIds, ...data } = body;
    const guardian = await this.prisma.db.$transaction(async (tx) => {
      const students = await tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true } });
      const g = await tx.guardian.create({ data: { ...data, tenantId: currentTenantId() } });
      if (students.length) {
        // A student's first guardian on record becomes their primary contact.
        const withPrimary = await tx.studentGuardian.findMany({
          where: { studentId: { in: students.map((s) => s.id) }, isPrimary: true },
          select: { studentId: true },
        });
        const hasPrimary = new Set(withPrimary.map((r) => r.studentId));
        await tx.studentGuardian.createMany({
          data: students.map((s) => ({ tenantId: g.tenantId, studentId: s.id, guardianId: g.id, isPrimary: !hasPrimary.has(s.id) })),
        });
      }
      return tx.guardian.findUniqueOrThrow({ where: { id: g.id }, include });
    });
    await this.audit.log({
      action: 'guardians.added',
      entityType: 'Guardian',
      entityId: guardian.id,
      summary: `Added ${guardian.relationship.toLowerCase()} ${guardian.firstName} ${guardian.lastName}` +
        (guardian.students.length ? ` for ${guardian.students.map((s) => s.student.firstName).join(', ')}` : ''),
    });
    return toRow(guardian);
  }
}
