import { BadRequestException, ConflictException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import {
  academicSessionSchema,
  branchSchema,
  classArmSchema,
  classLevelSchema,
  subjectClassesSchema,
  mergeArmSchema,
  subjectSchema,
  updateSubjectSchema,
  termSchema,
  type AcademicSessionInput,
  type AcademicStructure,
  type BranchInput,
  type ClassArmInput,
  type ClassLevelInput,
  type SubjectClasses,
  type SubjectInput,
  type TermInput,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, fullName, parseDate } from '../common/format';
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
              classTeacher: { select: { id: true, firstName: true, lastName: true, userId: true } },
              _count: { select: { students: { where: { status: 'ACTIVE' } } } },
            },
          },
        },
      }),
      db.subject.findMany({ orderBy: [{ isCore: 'desc' }, { name: 'asc' }], include: { _count: { select: { classes: true } } } }),
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
      subjects: subjects.map(({ id, name, code, category, isCore, _count }) => ({ id, name, code, category, isCore, classCount: _count.classes })),
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

  /**
   * Merges one class arm into another (e.g. JSS 1 B into JSS 1 A when a
   * school stops using arms). Students, scores, report cards, attendance,
   * homework, live classes and lesson plans move across; subjects the target
   * doesn't have yet move too; the emptied arm's timetable periods are
   * removed (regenerate the timetable afterwards).
   */
  @Post('class-arms/:id/merge')
  @HttpCode(200)
  @RequirePermissions('academics.manage')
  async mergeArm(@Param('id') id: string, @Body(new ZodPipe(mergeArmSchema)) body: { intoId: string }) {
    if (id === body.intoId) throw new BadRequestException('Choose a different class to merge into');
    const db = this.prisma.db;
    const [from, into] = await Promise.all([
      db.classArm.findUniqueOrThrow({ where: { id }, include: { classLevel: true } }),
      db.classArm.findUniqueOrThrow({ where: { id: body.intoId }, include: { classLevel: true, subjects: { select: { subjectId: true } } } }),
    ]);
    const label = (a: { name: string; classLevel: { name: string } }) => `${a.classLevel.name} ${a.name}`.trim();
    const has = new Set(into.subjects.map((s) => s.subjectId));
    const result = await db.$transaction(async (tx) => {
      const students = await tx.student.updateMany({ where: { classArmId: id }, data: { classArmId: into.id } });
      const scores = await tx.score.updateMany({ where: { classArmId: id }, data: { classArmId: into.id } });
      await tx.reportCard.updateMany({ where: { classArmId: id }, data: { classArmId: into.id } });
      await tx.homework.updateMany({ where: { classArmId: id }, data: { classArmId: into.id } });
      await tx.liveClass.updateMany({ where: { classArmId: id }, data: { classArmId: into.id } });
      await tx.lessonPlan.updateMany({ where: { classArmId: id }, data: { classArmId: into.id } });
      // Subjects: move the ones the target lacks; drop duplicates.
      const subs = await tx.classSubject.findMany({ where: { classArmId: id } });
      for (const s of subs) {
        if (has.has(s.subjectId)) await tx.classSubject.delete({ where: { id: s.id } });
        else await tx.classSubject.update({ where: { id: s.id }, data: { classArmId: into.id } });
      }
      // Attendance: one register per class per day, so same-day registers combine.
      const registers = await tx.attendanceRegister.findMany({ where: { classArmId: id } });
      for (const r of registers) {
        const same = await tx.attendanceRegister.findFirst({ where: { classArmId: into.id, date: r.date } });
        if (same) {
          await tx.studentAttendance.updateMany({ where: { registerId: r.id }, data: { registerId: same.id } });
          await tx.attendanceRegister.delete({ where: { id: r.id } });
        } else {
          await tx.attendanceRegister.update({ where: { id: r.id }, data: { classArmId: into.id } });
        }
      }
      const periods = await tx.timetableEntry.deleteMany({ where: { classArmId: id } });
      if (!into.classTeacherId && from.classTeacherId) await tx.classArm.update({ where: { id: into.id }, data: { classTeacherId: from.classTeacherId } });
      await tx.classArm.delete({ where: { id } });
      return { students: students.count, scores: scores.count, registers: registers.length, timetablePeriodsRemoved: periods.count };
    }, { timeout: 60_000 });
    await this.log('class-arm', id, `Merged ${label(from)} into ${label(into)}: ${result.students} students moved`);
    return { ...result, into: { id: into.id, name: label(into) } };
  }

  @Post('subjects')
  @RequirePermissions('academics.manage')
  async createSubject(@Body(new ZodPipe(subjectSchema)) body: SubjectInput) {
    const subject = await this.prisma.db.subject.create({ data: { ...body, tenantId: currentTenantId() } });
    await this.log('subject', subject.id, `Added subject ${subject.name}`);
    return subject;
  }

  @Patch('subjects/:id')
  @RequirePermissions('academics.manage')
  async updateSubject(@Param('id') id: string, @Body(new ZodPipe(updateSubjectSchema)) body: z.infer<typeof updateSubjectSchema>) {
    const subject = await this.prisma.db.subject.update({ where: { id }, data: body });
    await this.log('subject', id, `Updated subject ${subject.name}`);
    return subject;
  }

  /** Which classes take a subject, and who teaches it in each. */
  @Get('subjects/:id/classes')
  @RequirePermissions('academics.read')
  async subjectClasses(@Param('id') id: string): Promise<SubjectClasses> {
    const db = this.prisma.db;
    const [subject, levels, links, teachers, scored] = await Promise.all([
      db.subject.findUniqueOrThrow({ where: { id } }),
      db.classLevel.findMany({ include: { arms: { orderBy: { name: 'asc' } } }, orderBy: { order: 'asc' } }),
      db.classSubject.findMany({ where: { subjectId: id }, include: { teacher: true } }),
      db.staff.findMany({ where: { status: { not: 'EXITED' } }, orderBy: [{ type: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true, jobTitle: true, type: true } }),
      db.score.groupBy({ by: ['classArmId'], where: { subjectId: id } }),
    ]);
    const byArm = new Map(links.map((l) => [l.classArmId, l]));
    const hasScores = new Set(scored.map((s) => s.classArmId));
    return {
      subject: { id: subject.id, name: subject.name, code: subject.code },
      levels: levels.map((l) => ({
        id: l.id,
        name: l.name,
        arms: l.arms.map((a) => {
          const link = byArm.get(a.id);
          return { id: a.id, name: a.name, linked: !!link, teacherId: link?.teacherId ?? null, teacherName: link?.teacher ? fullName(link.teacher) : null, periodsPerWeek: link?.periodsPerWeek ?? 0, hasScores: hasScores.has(a.id) };
        }),
      })),
      teachers: teachers.map((t) => ({ id: t.id, name: fullName(t), jobTitle: t.jobTitle })),
    };
  }

  /**
   * Sets exactly which classes take the subject and their teachers. Classes
   * left out are unlinked (their scores are kept; the subject just stops
   * appearing on new score sheets and timetables for them).
   */
  @Put('subjects/:id/classes')
  @RequirePermissions('academics.manage')
  async setSubjectClasses(@Param('id') id: string, @Body(new ZodPipe(subjectClassesSchema)) body: { assignments: { classArmId: string; teacherId: string | null }[] }): Promise<SubjectClasses> {
    const db = this.prisma.db;
    const subject = await db.subject.findUniqueOrThrow({ where: { id } });
    const armIds = [...new Set(body.assignments.map((a) => a.classArmId))];
    const teacherIds = [...new Set(body.assignments.map((a) => a.teacherId).filter((t): t is string => !!t))];
    const [arms, teachers] = await Promise.all([db.classArm.count({ where: { id: { in: armIds } } }), db.staff.count({ where: { id: { in: teacherIds } } })]);
    if (arms !== armIds.length || teachers !== teacherIds.length) throw new BadRequestException('Some classes or teachers were not found');
    const tenantId = currentTenantId();
    const before = await db.classSubject.count({ where: { subjectId: id } });
    await db.$transaction([
      db.classSubject.deleteMany({ where: { subjectId: id, classArmId: { notIn: armIds } } }),
      ...body.assignments.map((a) =>
        db.classSubject.upsert({
          where: { classArmId_subjectId: { classArmId: a.classArmId, subjectId: id } },
          update: { teacherId: a.teacherId },
          create: { tenantId, classArmId: a.classArmId, subjectId: id, teacherId: a.teacherId },
        }),
      ),
    ]);
    await this.log('subject', id, `Set the classes for ${subject.name}: ${armIds.length} class${armIds.length === 1 ? '' : 'es'} (was ${before})`);
    return this.subjectClasses(id);
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
    // Deleting a class would take its students' results and attendance with it.
    if (kind === 'class-arms' || kind === 'class-levels') await this.assertClassesEmpty(kind, id);
    // A dynamic model name loses Prisma's per-model typing; the scoped
    // client still applies the tenant filter.
    const delegate = this.prisma.db[model] as unknown as {
      delete(args: { where: { id: string } }): Promise<{ name?: string }>;
    };
    const removed = await delegate.delete({ where: { id } });
    await this.log(kind, id, `Deleted ${kind.replace(/-/g, ' ').replace(/s$/, '')} ${removed.name ?? ''}`.trim());
  }

  private async assertClassesEmpty(kind: 'class-arms' | 'class-levels', id: string) {
    const db = this.prisma.db;
    const arms = kind === 'class-arms' ? { id } : { classLevelId: id };
    const [students, scores, reports, registers] = await Promise.all([
      db.student.count({ where: { classArm: arms } }),
      db.score.count({ where: { classArm: arms } }),
      db.reportCard.count({ where: { classArm: arms } }),
      db.attendanceRegister.count({ where: { classArm: arms } }),
    ]);
    const what = [students && `${students} student(s)`, scores && `${scores} score(s)`, reports && `${reports} report card(s)`, registers && `${registers} attendance register(s)`].filter(Boolean);
    if (what.length) {
      throw new ConflictException({
        statusCode: 409,
        code: 'CLASS_IN_USE',
        message: kind === 'class-arms'
          ? `This class has ${what.join(', ')}. Merge it into another class instead, so nothing is lost.`
          : `This level's classes have ${what.join(', ')}. Merge or move them first.`,
      });
    }
  }

  private log(entity: string, id: string, summary: string) {
    return this.audit.log({ action: `academics.${entity}`, entityType: entity, entityId: id, summary });
  }
}
