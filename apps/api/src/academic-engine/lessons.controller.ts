import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  academicListQuerySchema,
  generateLessonSchema,
  updateLessonSchema,
  type AcademicListQuery,
  type GenerateLessonInput,
  type LessonDetail,
  type LessonSummary,
  type UpdateLessonInput,
} from '@aischool/shared';
import { Prisma, type LessonStatus } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicEngineService, canEditLesson, lessonInclude } from './academic-engine.service';

const regenerateSchema = z.object({ guidance: z.string().trim().max(1500).optional() });

@Controller('lessons')
export class LessonsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AcademicEngineService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('lessons.read')
  async list(@Query(new ZodPipe(academicListQuerySchema)) q: AcademicListQuery): Promise<LessonSummary[]> {
    const userId = currentContext().userId!;
    const where: Prisma.LessonPlanWhereInput = {
      ...(q.subjectId ? { subjectId: q.subjectId } : {}),
      ...(q.classArmId ? { classArmId: q.classArmId } : {}),
      ...(q.classLevelId ? { classArm: { classLevelId: q.classLevelId } } : {}),
      ...(q.status ? { status: q.status as LessonStatus } : {}),
      ...(q.mine ? { OR: [{ createdById: userId }, { teacher: { userId } }] } : {}),
    };
    const rows = await this.prisma.db.lessonPlan.findMany({
      where,
      include: lessonInclude,
      orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 200,
    });
    return rows.map((r) => this.engine.lessonSummary(r));
  }

  @Get(':id')
  @RequirePermissions('lessons.read')
  detail(@Param('id') id: string): Promise<LessonDetail> {
    return this.engine.lessonDetail(id);
  }

  /**
   * Plans a lesson with AI — from a scheme-of-work week (inheriting its topic
   * and objectives) or from a free topic. The lesson is attributed to the
   * signed-in teacher when they have a staff record.
   */
  @Post('generate')
  @HttpCode(202)
  @RequirePermissions('lessons.manage', 'ai.use')
  async generate(@Body(new ZodPipe(generateLessonSchema)) body: GenerateLessonInput): Promise<LessonSummary> {
    this.engine.assertAiAvailable();
    const db = this.prisma.db;
    const userId = currentContext().userId!;
    const [subject, arm, week, staff] = await Promise.all([
      db.subject.findUniqueOrThrow({ where: { id: body.subjectId } }),
      db.classArm.findUniqueOrThrow({ where: { id: body.classArmId } }),
      body.schemeWeekId
        ? db.schemeWeek.findUniqueOrThrow({ where: { id: body.schemeWeekId }, include: { scheme: true } })
        : null,
      db.staff.findFirst({ where: { userId } }),
    ]);
    if (week && (week.scheme.subjectId !== subject.id || week.scheme.classLevelId !== arm.classLevelId)) {
      throw new BadRequestException({
        statusCode: 400,
        message: "That scheme week belongs to a different subject or class",
        errors: [{ path: 'schemeWeekId', message: "Doesn't match the subject and class" }],
      });
    }

    const lesson = await db.lessonPlan.create({
      data: {
        tenantId: currentTenantId(),
        subjectId: subject.id,
        classArmId: arm.id,
        schemeWeekId: week?.id,
        teacherId: staff?.id,
        createdById: userId,
        topic: body.topic || week!.topic,
        date: parseDate(body.date),
        durationMinutes: body.durationMinutes,
        guidance: body.guidance,
        source: 'AI',
        generation: 'QUEUED',
      },
      include: lessonInclude,
    });
    this.engine.queueLesson(lesson.id);
    await this.audit.log({
      action: 'lesson.generation_started',
      entityType: 'LessonPlan',
      entityId: lesson.id,
      summary: `Asked AI to plan a lesson on ${lesson.topic} for ${lesson.classArm.classLevel.name} ${lesson.classArm.name}`,
    });
    return this.engine.lessonSummary(lesson);
  }

  @Post(':id/regenerate')
  @HttpCode(202)
  @RequirePermissions('lessons.manage', 'ai.use')
  async regenerate(
    @Param('id') id: string,
    @Body(new ZodPipe(regenerateSchema)) body: { guidance?: string },
  ): Promise<LessonSummary> {
    this.engine.assertAiAvailable();
    const existing = await this.ownLesson(id);
    if (existing.generation === 'QUEUED' || existing.generation === 'RUNNING') {
      throw new BadRequestException('This lesson is already being generated');
    }
    const lesson = await this.prisma.db.lessonPlan.update({
      where: { id },
      data: { generation: 'QUEUED', generationError: null, source: 'AI', guidance: body.guidance ?? existing.guidance },
      include: lessonInclude,
    });
    this.engine.queueLesson(id);
    return this.engine.lessonSummary(lesson);
  }

  @Patch(':id')
  @RequirePermissions('lessons.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(updateLessonSchema)) body: UpdateLessonInput): Promise<LessonDetail> {
    const existing = await this.ownLesson(id);
    if (existing.generation === 'QUEUED' || existing.generation === 'RUNNING') {
      throw new BadRequestException('Wait for generation to finish before editing');
    }
    const { date, steps, differentiation, ...rest } = body;
    await this.prisma.db.lessonPlan.update({
      where: { id },
      data: {
        ...rest,
        ...(date !== undefined ? { date: date ? parseDate(date) : null } : {}),
        ...(steps ? { steps: steps as unknown as Prisma.InputJsonValue } : {}),
        ...(differentiation ? { differentiation: differentiation as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    await this.audit.log({
      action: 'lesson.updated',
      entityType: 'LessonPlan',
      entityId: id,
      summary: `Updated the lesson plan “${existing.topic}” (${Object.keys(body).join(', ')})`,
    });
    return this.engine.lessonDetail(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('lessons.manage')
  async remove(@Param('id') id: string) {
    const lesson = await this.ownLesson(id);
    await this.prisma.db.lessonPlan.delete({ where: { id } });
    await this.audit.log({ action: 'lesson.deleted', entityType: 'LessonPlan', entityId: id, summary: `Deleted the lesson plan “${lesson.topic}”` });
  }

  /** Teachers change their own lessons; curriculum managers can change any. */
  private async ownLesson(id: string) {
    const lesson = await this.prisma.db.lessonPlan.findUniqueOrThrow({ where: { id }, include: { teacher: true } });
    if (!canEditLesson(lesson)) {
      throw new ForbiddenException("You can only change your own lesson plans");
    }
    return lesson;
  }
}
