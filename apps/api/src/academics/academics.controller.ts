import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  academicSessionSchema,
  branchSchema,
  classArmSchema,
  classLevelSchema,
  subjectSchema,
  termSchema,
  type AcademicSessionInput,
  type AcademicStructure,
  type BranchInput,
  type ClassArmInput,
  type ClassLevelInput,
  type SubjectInput,
  type TermInput,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, parseDate } from '../common/format';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const DELETABLE = {
  sessions: 'academicSession',
  terms: 'term',
  'class-levels': 'classLevel',
  'class-arms': 'classArm',
  subjects: 'subject',
  branches: 'branch',
} as const;

@Controller('academics')
export class AcademicsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('structure')
  @RequirePermissions('academics.read')
  async structure(): Promise<AcademicStructure> {
    const db = this.prisma.db;
    const [sessions, levels, subjects, branches] = await Promise.all([
      db.academicSession.findMany({ orderBy: { startsOn: 'desc' }, include: { terms: { orderBy: { order: 'asc' } } } }),
      db.classLevel.findMany({
        orderBy: { order: 'asc' },
        include: {
          arms: {
            orderBy: { name: 'asc' },
            include: {
              classTeacher: { select: { id: true, firstName: true, lastName: true } },
              _count: { select: { students: { where: { status: 'ACTIVE' } } } },
            },
          },
        },
      }),
      db.subject.findMany({ orderBy: [{ isCore: 'desc' }, { name: 'asc' }] }),
      db.branch.findMany({ orderBy: [{ isMain: 'desc' }, { name: 'asc' }] }),
    ]);

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        name: s.name,
        startsOn: dateOnly(s.startsOn)!,
        endsOn: dateOnly(s.endsOn)!,
        isCurrent: s.isCurrent,
        terms: s.terms.map((t) => ({
          id: t.id,
          name: t.name,
          order: t.order,
          startsOn: dateOnly(t.startsOn)!,
          endsOn: dateOnly(t.endsOn)!,
          isCurrent: t.isCurrent,
        })),
      })),
      classLevels: levels.map((l) => ({
        id: l.id,
        name: l.name,
        code: l.code,
        stage: l.stage,
        order: l.order,
        arms: l.arms.map((a) => ({
          id: a.id,
          name: a.name,
          capacity: a.capacity,
          studentCount: a._count.students,
          classTeacher: a.classTeacher,
        })),
      })),
      subjects: subjects.map(({ id, name, code, category, isCore }) => ({ id, name, code, category, isCore })),
      branches: branches.map(({ id, name, code, isMain }) => ({ id, name, code, isMain })),
    };
  }

  @Post('sessions')
  @RequirePermissions('academics.manage')
  async createSession(@Body(new ZodPipe(academicSessionSchema)) body: AcademicSessionInput) {
    const session = await this.prisma.db.$transaction(async (tx) => {
      if (body.isCurrent) await tx.academicSession.updateMany({ data: { isCurrent: false } });
      return tx.academicSession.create({
        data: {
          tenantId: currentTenantId(),
          name: body.name,
          startsOn: parseDate(body.startsOn),
          endsOn: parseDate(body.endsOn),
          isCurrent: body.isCurrent,
        },
      });
    });
    await this.log('session', session.id, `Created academic session ${session.name}`);
    return session;
  }

  @Patch('sessions/:id/current')
  @RequirePermissions('academics.manage')
  async makeSessionCurrent(@Param('id') id: string) {
    const session = await this.prisma.db.$transaction(async (tx) => {
      const target = await tx.academicSession.findUniqueOrThrow({ where: { id } });
      await tx.academicSession.updateMany({ data: { isCurrent: false } });
      return tx.academicSession.update({ where: { id: target.id }, data: { isCurrent: true } });
    });
    await this.log('session', id, `Set ${session.name} as the current session`);
    return { ok: true };
  }

  @Post('terms')
  @RequirePermissions('academics.manage')
  async createTerm(@Body(new ZodPipe(termSchema)) body: TermInput) {
    const term = await this.prisma.db.$transaction(async (tx) => {
      const session = await tx.academicSession.findUniqueOrThrow({ where: { id: body.sessionId } });
      if (body.startsOn < dateOnly(session.startsOn)! || body.endsOn > dateOnly(session.endsOn)!) {
        throw new BadRequestException({
          statusCode: 400,
          message: `Term dates must fall within ${session.name}`,
          errors: [{ path: 'startsOn', message: 'Outside the session' }],
        });
      }
      if (body.isCurrent) await tx.term.updateMany({ data: { isCurrent: false } });
      return tx.term.create({
        data: {
          tenantId: currentTenantId(),
          sessionId: session.id,
          name: body.name,
          order: body.order,
          startsOn: parseDate(body.startsOn),
          endsOn: parseDate(body.endsOn),
          isCurrent: body.isCurrent,
        },
      });
    });
    await this.log('term', term.id, `Created ${term.name}`);
    return term;
  }

  @Patch('terms/:id/current')
  @RequirePermissions('academics.manage')
  async makeTermCurrent(@Param('id') id: string) {
    const term = await this.prisma.db.$transaction(async (tx) => {
      const target = await tx.term.findUniqueOrThrow({ where: { id } });
      await tx.term.updateMany({ data: { isCurrent: false } });
      await tx.academicSession.updateMany({ data: { isCurrent: false } });
      await tx.academicSession.update({ where: { id: target.sessionId }, data: { isCurrent: true } });
      return tx.term.update({ where: { id }, data: { isCurrent: true } });
    });
    await this.log('term', id, `Set ${term.name} as the current term`);
    return { ok: true };
  }

  @Post('class-levels')
  @RequirePermissions('academics.manage')
  async createLevel(@Body(new ZodPipe(classLevelSchema)) body: ClassLevelInput) {
    const level = await this.prisma.db.classLevel.create({ data: { ...body, tenantId: currentTenantId() } });
    await this.log('class-level', level.id, `Added class level ${level.name}`);
    return level;
  }

  @Post('class-arms')
  @RequirePermissions('academics.manage')
  async createArm(@Body(new ZodPipe(classArmSchema)) body: ClassArmInput) {
    const db = this.prisma.db;
    // Referenced rows must belong to this school: the scoped lookups 404 otherwise.
    const level = await db.classLevel.findUniqueOrThrow({ where: { id: body.classLevelId } });
    if (body.classTeacherId) await db.staff.findUniqueOrThrow({ where: { id: body.classTeacherId } });
    if (body.branchId) await db.branch.findUniqueOrThrow({ where: { id: body.branchId } });
    const arm = await db.classArm.create({ data: { ...body, tenantId: currentTenantId() } });
    await this.log('class-arm', arm.id, `Added class ${level.name} ${arm.name}`);
    return arm;
  }

  @Patch('class-arms/:id')
  @RequirePermissions('academics.manage')
  async updateArm(@Param('id') id: string, @Body(new ZodPipe(classArmSchema.partial())) body: Partial<ClassArmInput>) {
    const db = this.prisma.db;
    if (body.classTeacherId) await db.staff.findUniqueOrThrow({ where: { id: body.classTeacherId } });
    if (body.classLevelId) await db.classLevel.findUniqueOrThrow({ where: { id: body.classLevelId } });
    const arm = await db.classArm.update({ where: { id }, data: body });
    await this.log('class-arm', id, `Updated class ${arm.name}`);
    return arm;
  }

  @Post('subjects')
  @RequirePermissions('academics.manage')
  async createSubject(@Body(new ZodPipe(subjectSchema)) body: SubjectInput) {
    const subject = await this.prisma.db.subject.create({ data: { ...body, tenantId: currentTenantId() } });
    await this.log('subject', subject.id, `Added subject ${subject.name}`);
    return subject;
  }

  @Post('branches')
  @RequirePermissions('school.manage')
  async createBranch(@Body(new ZodPipe(branchSchema)) body: BranchInput) {
    const branch = await this.prisma.db.$transaction(async (tx) => {
      if (body.isMain) await tx.branch.updateMany({ data: { isMain: false } });
      return tx.branch.create({ data: { ...body, tenantId: currentTenantId() } });
    });
    await this.log('branch', branch.id, `Added branch ${branch.name}`);
    return branch;
  }

  @Delete(':kind/:id')
  @HttpCode(204)
  @RequirePermissions('academics.manage')
  async remove(@Param('kind') kind: string, @Param('id') id: string) {
    const model = DELETABLE[kind as keyof typeof DELETABLE];
    if (!model) throw new BadRequestException('Unknown record type');
    // A dynamic model name loses Prisma's per-model typing; the scoped
    // client still applies the tenant filter.
    const delegate = this.prisma.db[model] as unknown as {
      delete(args: { where: { id: string } }): Promise<{ name?: string }>;
    };
    const removed = await delegate.delete({ where: { id } });
    await this.log(kind, id, `Deleted ${kind.replace(/-/g, ' ').replace(/s$/, '')} ${removed.name ?? ''}`.trim());
  }

  private log(entity: string, id: string, summary: string) {
    return this.audit.log({ action: `academics.${entity}`, entityType: entity, entityId: id, summary });
  }
}
