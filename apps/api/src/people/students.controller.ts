import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  STUDENT_STATUSES,
  listQuerySchema,
  studentSchema,
  type Paginated,
  type StudentInput,
  type StudentRow,
} from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, paginate, parseDate } from '../common/format';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const studentListQuery = listQuerySchema.extend({
  classArmId: z.string().optional(),
  classLevelId: z.string().optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
});
type StudentListQuery = z.infer<typeof studentListQuery>;

const include = {
  classArm: { select: { id: true, name: true, classLevel: { select: { id: true, name: true, code: true } } } },
  guardians: {
    orderBy: { isPrimary: 'desc' },
    include: { guardian: { select: { id: true, firstName: true, lastName: true, phone: true, relationship: true } } },
  },
} satisfies Prisma.StudentInclude;

type StudentWithRelations = Prisma.StudentGetPayload<{ include: typeof include }>;

function toRow(s: StudentWithRelations): StudentRow {
  return {
    id: s.id,
    admissionNumber: s.admissionNumber,
    firstName: s.firstName,
    middleName: s.middleName,
    lastName: s.lastName,
    gender: s.gender,
    dateOfBirth: dateOnly(s.dateOfBirth),
    status: s.status,
    admittedOn: dateOnly(s.admittedOn)!,
    classArm: s.classArm,
    guardians: s.guardians.map((g) => g.guardian),
  };
}

@Controller('students')
export class StudentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('students.read')
  async list(@Query(new ZodPipe(studentListQuery)) q: StudentListQuery): Promise<Paginated<StudentRow>> {
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.StudentWhereInput = {
      ...(q.classArmId ? { classArmId: q.classArmId } : {}),
      ...(q.classLevelId ? { classArm: { classLevelId: q.classLevelId } } : {}),
      ...(q.status ? { status: q.status } : {}),
      AND: terms.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: 'insensitive' } },
          { lastName: { contains: t, mode: 'insensitive' } },
          { middleName: { contains: t, mode: 'insensitive' } },
          { admissionNumber: { contains: t, mode: 'insensitive' } },
        ],
      })),
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.student.findMany({
        where,
        include,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        ...paginate(q.page, q.pageSize),
      }),
      this.prisma.db.student.count({ where }),
    ]);
    return { items: rows.map(toRow), total, page: q.page, pageSize: q.pageSize };
  }

  @Get(':id')
  @RequirePermissions('students.read')
  async get(@Param('id') id: string) {
    const s = await this.prisma.db.student.findUniqueOrThrow({ where: { id }, include });
    return { ...toRow(s), address: s.address, medicalNotes: s.medicalNotes };
  }

  @Post()
  @RequirePermissions('students.manage')
  async create(@Body(new ZodPipe(studentSchema)) body: StudentInput) {
    await this.checkRefs(body);
    const admissionNumber = body.admissionNumber ?? (await this.nextAdmissionNumber());
    const student = await this.prisma.db.student.create({
      data: {
        ...body,
        tenantId: currentTenantId(),
        admissionNumber,
        dateOfBirth: parseDate(body.dateOfBirth),
        admittedOn: parseDate(body.admittedOn) ?? new Date(),
      },
      include,
    });
    const cls = student.classArm ? ` to ${student.classArm.classLevel.name} ${student.classArm.name}` : '';
    await this.audit.log({
      action: 'students.admitted',
      entityType: 'Student',
      entityId: student.id,
      summary: `Admitted ${student.firstName} ${student.lastName} (${admissionNumber})${cls}`,
    });
    return toRow(student);
  }

  @Patch(':id')
  @RequirePermissions('students.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(studentSchema.partial())) body: Partial<StudentInput>) {
    await this.checkRefs(body);
    const student = await this.prisma.db.student.update({
      where: { id },
      data: {
        ...body,
        dateOfBirth: body.dateOfBirth === undefined ? undefined : parseDate(body.dateOfBirth),
        admittedOn: body.admittedOn === undefined ? undefined : parseDate(body.admittedOn),
      },
      include,
    });
    await this.audit.log({
      action: 'students.updated',
      entityType: 'Student',
      entityId: id,
      summary: `Updated ${student.firstName} ${student.lastName}'s record (${Object.keys(body).join(', ')})`,
    });
    return toRow(student);
  }

  /** Scoped lookups throw 404 for another school's class or branch. */
  private async checkRefs(body: Partial<StudentInput>) {
    if (body.classArmId) await this.prisma.db.classArm.findUniqueOrThrow({ where: { id: body.classArmId } });
    if (body.branchId) await this.prisma.db.branch.findUniqueOrThrow({ where: { id: body.branchId } });
  }

  /** e.g. GRE/2026/0042 — school prefix, year, running number. */
  private async nextAdmissionNumber(): Promise<string> {
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: currentTenantId() },
      select: { slug: true, shortName: true },
    });
    const prefix = `${(tenant.shortName ?? tenant.slug).replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()}/${new Date().getFullYear()}/`;
    const last = await this.prisma.db.student.findFirst({
      where: { admissionNumber: { startsWith: prefix } },
      orderBy: { admissionNumber: 'desc' },
      select: { admissionNumber: true },
    });
    const next = (last ? Number(last.admissionNumber.slice(prefix.length)) || 0 : 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }
}
