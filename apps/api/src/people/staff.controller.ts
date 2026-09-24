import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  STAFF_TYPES,
  listQuerySchema,
  staffSchema,
  type Paginated,
  type StaffInput,
  type StaffRow,
} from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, paginate, parseDate } from '../common/format';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const staffListQuery = listQuerySchema.extend({ type: z.enum(STAFF_TYPES).optional() });
type StaffListQuery = z.infer<typeof staffListQuery>;

const include = {
  classesLed: { select: { id: true, name: true, classLevel: { select: { name: true } } } },
} satisfies Prisma.StaffInclude;

function toRow(s: Prisma.StaffGetPayload<{ include: typeof include }>): StaffRow {
  return {
    id: s.id,
    staffNumber: s.staffNumber,
    firstName: s.firstName,
    lastName: s.lastName,
    gender: s.gender,
    email: s.email,
    phone: s.phone,
    jobTitle: s.jobTitle,
    type: s.type,
    status: s.status,
    employedOn: dateOnly(s.employedOn),
    classesLed: s.classesLed.map((c) => ({ id: c.id, name: `${c.classLevel.name} ${c.name}` })),
  };
}

@Controller('staff')
export class StaffController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('staff.read')
  async list(@Query(new ZodPipe(staffListQuery)) q: StaffListQuery): Promise<Paginated<StaffRow>> {
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.StaffWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      AND: terms.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: 'insensitive' } },
          { lastName: { contains: t, mode: 'insensitive' } },
          { staffNumber: { contains: t, mode: 'insensitive' } },
          { jobTitle: { contains: t, mode: 'insensitive' } },
        ],
      })),
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.staff.findMany({
        where,
        include,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        ...paginate(q.page, q.pageSize),
      }),
      this.prisma.db.staff.count({ where }),
    ]);
    return { items: rows.map(toRow), total, page: q.page, pageSize: q.pageSize };
  }

  @Post()
  @RequirePermissions('staff.manage')
  async create(@Body(new ZodPipe(staffSchema)) body: StaffInput) {
    const staffNumber = body.staffNumber ?? (await this.nextStaffNumber());
    const staff = await this.prisma.db.staff.create({
      data: { ...body, tenantId: currentTenantId(), staffNumber, employedOn: parseDate(body.employedOn) },
      include,
    });
    await this.audit.log({
      action: 'staff.added',
      entityType: 'Staff',
      entityId: staff.id,
      summary: `Added ${staff.jobTitle} ${staff.firstName} ${staff.lastName} (${staffNumber})`,
    });
    return toRow(staff);
  }

  private async nextStaffNumber(): Promise<string> {
    const last = await this.prisma.db.staff.findFirst({
      where: { staffNumber: { startsWith: 'STF-' } },
      orderBy: { staffNumber: 'desc' },
      select: { staffNumber: true },
    });
    const next = (last ? Number(last.staffNumber.slice(4)) || 0 : 0) + 1;
    return `STF-${String(next).padStart(4, '0')}`;
  }
}
