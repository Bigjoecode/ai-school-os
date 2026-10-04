import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  academicListQuerySchema,
  aiLessonCheckSchema,
  bulkApproveSchema,
  complianceQuerySchema,
  generateLessonSchema,
  LESSON_REVIEW_STATUSES,
  mondayOf,
  reviewLessonSchema,
  submitLessonsSchema,
  submitWeekSchema,
  updateLessonSchema,
  vettingQueueQuerySchema,
  type AcademicListQuery,
  type AiLessonCheck,
  type BulkApproveInput,
  type ComplianceQuery,
  type ComplianceReport,
  type Differentiation,
  type GenerateLessonInput,
  type LessonReviewStatus,
  type LessonStep,
  type ReviewLessonInput,
  type SubmitLessonsInput,
  type SubmitLessonsResult,
  type SubmitWeekInput,
  type UpdateLessonInput,
  type VettedLessonDetail,
  type VettedLessonSummary,
  type VettingQueueQuery,
} from '@aischool/shared';
import { Prisma, type LessonStatus } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicEngineService, canEditLesson, lessonInclude } from './academic-engine.service';
import {
  complianceReport,
  isOwnLesson,
  lessonCheckPrompt,
  lessonContentProblem,
  notifyTeacher,
  reviewerNames,
  reviewInfo,
} from './lesson-vetting';

const regenerateSchema = z.object({ guidance: z.string().trim().max(1500).optional() });
const reviewFilterSchema = z.enum(LESSON_REVIEW_STATUSES).optional().catch(undefined);

/** Lesson rows plus what the vetting fields need (the scheme week's start date). */
const vettingInclude = {
  ...lessonInclude,
  schemeWeek: { select: { id: true, week: true, schemeId: true, startsOn: true } },
} satisfies Prisma.LessonPlanInclude;
type VettingRow = Prisma.LessonPlanGetPayload<{ include: typeof vettingInclude }>;

/** Fields whose change means a submitted or approved plan must be vetted again. */
const CONTENT_FIELDS = ['topic', 'date', 'durationMinutes', 'objectives', 'priorKnowledge', 'materials', 'steps', 'differentiation', 'assessment', 'homework'] as const;

/**
 * The edit-after-submission rule (see @aischool/shared vetting.ts): changing
 * a SUBMITTED or APPROVED plan's content takes it back to NOT_SUBMITTED, so
 * it is vetted again. A RETURNED plan stays RETURNED until it is resubmitted.
 */
function resetReview(status: string): Prisma.LessonPlanUpdateManyMutationInput {
  if (status === 'APPROVED') return { reviewStatus: 'NOT_SUBMITTED', submittedAt: null, reviewedAt: null, reviewedById: null, reviewNote: null };
  if (status === 'SUBMITTED') return { reviewStatus: 'NOT_SUBMITTED', submittedAt: null };
  return {};
}

const weekWhere = (weekStart: string): Prisma.LessonPlanWhereInput => {
  const from = parseDate(mondayOf(weekStart));
  const to = new Date(from.getTime() + 6 * 86_400_000);
  return { OR: [{ date: { gte: from, lte: to } }, { date: null, schemeWeek: { startsOn: { gte: from, lte: to } } }] };
};

type OwnedRow = { id: string; topic: string; createdById: string | null; teacher: { userId: string | null } | null };

@Controller('lessons')
export class LessonsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AcademicEngineService,
    private readonly audit: AuditService,
    private readonly gateway: AiGatewayService,
  ) {}

  @Get()
  @RequirePermissions('lessons.read')
  async list(
    @Query(new ZodPipe(academicListQuerySchema)) q: AcademicListQuery,
    @Query('review') review?: string,
  ): Promise<VettedLessonSummary[]> {
    const userId = currentContext().userId!;
    const reviewStatus = reviewFilterSchema.parse(review);
    const where: Prisma.LessonPlanWhereInput = {
      ...(q.subjectId ? { subjectId: q.subjectId } : {}),
      ...(q.classArmId ? { classArmId: q.classArmId } : {}),
      ...(q.classLevelId ? { classArm: { classLevelId: q.classLevelId } } : {}),
      ...(q.status ? { status: q.status as LessonStatus } : {}),
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(q.mine ? { OR: [{ createdById: userId }, { teacher: { userId } }] } : {}),
    };
    const rows = await this.prisma.db.lessonPlan.findMany({
      where,
      include: vettingInclude,
      orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 200,
    });
    return this.vettedSummaries(rows);
  }

  // ---------------------------------------------------------- vetting: reviewers

  /** Lesson notes waiting to be vetted (oldest submission first), or past decisions. */
  @Get('vetting/queue')
  @RequirePermissions('lessons.approve')
  async queue(@Query(new ZodPipe(vettingQueueQuerySchema)) q: VettingQueueQuery): Promise<VettedLessonSummary[]> {
    const rows = await this.prisma.db.lessonPlan.findMany({
      where: {
        reviewStatus: q.status,
        ...(q.subjectId ? { subjectId: q.subjectId } : {}),
        ...(q.classArmId ? { classArmId: q.classArmId } : {}),
        ...(q.teacherId ? { teacherId: q.teacherId } : {}),
        ...(q.weekStart ? weekWhere(q.weekStart) : {}),
      },
      include: vettingInclude,
      orderBy:
        q.status === 'SUBMITTED'
          ? [{ submittedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }]
          : [{ reviewedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 300,
    });
    return this.vettedSummaries(rows);
  }

  /** Per teacher for one week: lesson notes expected, handed in, approved, returned and missing. */
  @Get('vetting/compliance')
  @RequirePermissions('lessons.approve')
  compliance(@Query(new ZodPipe(complianceQuerySchema)) q: ComplianceQuery): Promise<ComplianceReport> {
    return complianceReport(this.prisma.db, q.weekStart);
  }

  /** Approves several submitted lesson notes at once (never your own). */
  @Post('vetting/approve')
  @RequirePermissions('lessons.approve')
  async bulkApprove(@Body(new ZodPipe(bulkApproveSchema)) body: BulkApproveInput): Promise<SubmitLessonsResult> {
    const rows = await this.prisma.db.lessonPlan.findMany({ where: { id: { in: body.ids } }, include: { teacher: true } });
    const result: SubmitLessonsResult = { submitted: 0, skipped: [] };
    for (const l of rows) {
      if (l.reviewStatus !== 'SUBMITTED') {
        result.skipped.push({ id: l.id, topic: l.topic, reason: 'It is not waiting to be vetted' });
      } else if (isOwnLesson(l)) {
        result.skipped.push({ id: l.id, topic: l.topic, reason: 'Someone else must vet your own lesson notes' });
      } else if (await this.decide(l, { decision: 'APPROVE', note: body.note })) {
        result.submitted++;
      } else {
        result.skipped.push({ id: l.id, topic: l.topic, reason: 'It changed while you were vetting it' });
      }
    }
    return result;
  }

  // ---------------------------------------------------------- vetting: teachers

  /** Submits several of your own lesson plans for vetting. */
  @Post('submit')
  @RequirePermissions('lessons.manage')
  async submitMany(@Body(new ZodPipe(submitLessonsSchema)) body: SubmitLessonsInput): Promise<SubmitLessonsResult> {
    const rows = await this.prisma.db.lessonPlan.findMany({ where: { id: { in: body.ids } }, include: { teacher: true } });
    const result = await this.submitRows(rows);
    for (const id of body.ids) if (!rows.some((r) => r.id === id)) result.skipped.push({ id, topic: '', reason: 'Lesson plan not found' });
    return result;
  }

  /** Submits all your own unsubmitted or returned lesson plans for one week. */
  @Post('submit-week')
  @RequirePermissions('lessons.manage')
  async submitWeek(@Body(new ZodPipe(submitWeekSchema)) body: SubmitWeekInput): Promise<SubmitLessonsResult> {
    const userId = currentContext().userId!;
    const rows = await this.prisma.db.lessonPlan.findMany({
      where: {
        AND: [
          { OR: [{ createdById: userId }, { teacher: { userId } }] },
          weekWhere(body.weekStart),
          { reviewStatus: { in: ['NOT_SUBMITTED', 'RETURNED'] } },
        ],
      },
      include: { teacher: true },
    });
    return this.submitRows(rows);
  }

  @Get(':id')
  @RequirePermissions('lessons.read')
  detail(@Param('id') id: string): Promise<VettedLessonDetail> {
    return this.vettedDetail(id);
  }

  /** Hands your own lesson plan to the HOD / vice principal / principal for vetting. */
  @Post(':id/submit')
  @RequirePermissions('lessons.manage')
  async submit(@Param('id') id: string): Promise<VettedLessonDetail> {
    const l = await this.prisma.db.lessonPlan.findUniqueOrThrow({ where: { id }, include: { teacher: true } });
    if (!isOwnLesson(l)) throw new ForbiddenException('You can only submit your own lesson notes');
    const { skipped } = await this.submitRows([l]);
    if (skipped.length) throw new BadRequestException(skipped[0].reason);
    return this.vettedDetail(id);
  }

  /** Takes back a submission that hasn't been vetted yet. */
  @Post(':id/withdraw')
  @RequirePermissions('lessons.manage')
  async withdraw(@Param('id') id: string): Promise<VettedLessonDetail> {
    const l = await this.prisma.db.lessonPlan.findUniqueOrThrow({ where: { id }, include: { teacher: true } });
    if (!isOwnLesson(l)) throw new ForbiddenException('You can only withdraw your own lesson notes');
    const { count } = await this.prisma.db.lessonPlan.updateMany({
      where: { id, reviewStatus: 'SUBMITTED' },
      data: { reviewStatus: 'NOT_SUBMITTED', submittedAt: null },
    });
    if (!count) throw new BadRequestException('Only a lesson note awaiting vetting can be withdrawn');
    await this.audit.log({ action: 'lesson.withdrawn', entityType: 'LessonPlan', entityId: id, summary: `Withdrew the lesson note “${l.topic}” from vetting` });
    return this.vettedDetail(id);
  }

  /** Approves a submitted lesson note, or returns it with corrections (a note is required to return). */
  @Post(':id/review')
  @RequirePermissions('lessons.approve')
  async review(@Param('id') id: string, @Body(new ZodPipe(reviewLessonSchema)) body: ReviewLessonInput): Promise<VettedLessonDetail> {
    const l = await this.prisma.db.lessonPlan.findUniqueOrThrow({ where: { id }, include: { teacher: true } });
    if (isOwnLesson(l)) throw new ForbiddenException('Someone else must vet your own lesson notes');
    if (l.reviewStatus !== 'SUBMITTED') throw new BadRequestException('This lesson note is not waiting to be vetted');
    if (!(await this.decide(l, body))) throw new ConflictException('This lesson note changed while you were vetting it. Refresh and try again.');
    return this.vettedDetail(id);
  }

  /** AI reads the plan against its objectives and drafts 2–4 improvements for the reviewer. Nothing is saved. */
  @Post(':id/ai-check')
  @RequirePermissions('lessons.approve', 'ai.use')
  async aiCheck(@Param('id') id: string): Promise<AiLessonCheck> {
    this.engine.assertAiAvailable();
    const l = await this.prisma.db.lessonPlan.findUniqueOrThrow({ where: { id }, include: lessonInclude });
    const problem = lessonContentProblem(l);
    if (problem) throw new BadRequestException(`There isn't enough in this plan to check yet. ${problem}.`);
    const { system, user } = lessonCheckPrompt({
      topic: l.topic,
      durationMinutes: l.durationMinutes,
      objectives: l.objectives,
      priorKnowledge: l.priorKnowledge,
      materials: l.materials,
      steps: (l.steps ?? []) as unknown as LessonStep[],
      differentiation: (l.differentiation ?? null) as unknown as Differentiation | null,
      assessment: l.assessment,
      homework: l.homework,
      subject: l.subject.name,
      classLabel: `${l.classArm.classLevel.name} ${l.classArm.name}`,
    });
    const r = await this.gateway.generateJson(
      { tier: 'standard', system, messages: [{ role: 'user', content: user }], maxOutputTokens: 1500 },
      aiLessonCheckSchema,
      'lesson-vetting-check',
    );
    return {
      summary: r.data.summary.trim(),
      strengths: r.data.strengths.map((x) => x.trim()).filter(Boolean).slice(0, 3),
      suggestions: r.data.suggestions.filter((x) => x.title.trim() || x.detail.trim()).slice(0, 4),
    };
  }

  // ---------------------------------------------------------- lesson plans

  /**
   * Plans a lesson with AI — from a scheme-of-work week (inheriting its topic
   * and objectives) or from a free topic. The lesson is attributed to the
   * signed-in teacher when they have a staff record.
   */
  @Post('generate')
  @HttpCode(202)
  @RequirePermissions('lessons.manage', 'ai.use')
  async generate(@Body(new ZodPipe(generateLessonSchema)) body: GenerateLessonInput): Promise<VettedLessonSummary> {
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
      include: vettingInclude,
    });
    this.engine.queueLesson(lesson.id);
    await this.audit.log({
      action: 'lesson.generation_started',
      entityType: 'LessonPlan',
      entityId: lesson.id,
      summary: `Asked AI to plan a lesson on ${lesson.topic} for ${lesson.classArm.classLevel.name} ${lesson.classArm.name}`,
    });
    return (await this.vettedSummaries([lesson]))[0];
  }

  @Post(':id/regenerate')
  @HttpCode(202)
  @RequirePermissions('lessons.manage', 'ai.use')
  async regenerate(
    @Param('id') id: string,
    @Body(new ZodPipe(regenerateSchema)) body: { guidance?: string },
  ): Promise<VettedLessonSummary> {
    this.engine.assertAiAvailable();
    const existing = await this.ownLesson(id);
    if (existing.generation === 'QUEUED' || existing.generation === 'RUNNING') {
      throw new BadRequestException('This lesson is already being generated');
    }
    const lesson = await this.prisma.db.lessonPlan.update({
      where: { id },
      data: { ...resetReview(existing.reviewStatus), generation: 'QUEUED', generationError: null, source: 'AI', guidance: body.guidance ?? existing.guidance },
      include: vettingInclude,
    });
    this.engine.queueLesson(id);
    return (await this.vettedSummaries([lesson]))[0];
  }

  /** Saves changes. Changing the content of a submitted or approved plan sends it back to "not submitted". */
  @Patch(':id')
  @RequirePermissions('lessons.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(updateLessonSchema)) body: UpdateLessonInput): Promise<VettedLessonDetail> {
    const existing = await this.ownLesson(id);
    if (existing.generation === 'QUEUED' || existing.generation === 'RUNNING') {
      throw new BadRequestException('Wait for generation to finish before editing');
    }
    const contentChanged = CONTENT_FIELDS.some((k) => body[k] !== undefined);
    const revet = contentChanged && (existing.reviewStatus === 'SUBMITTED' || existing.reviewStatus === 'APPROVED');
    const { date, steps, differentiation, ...rest } = body;
    await this.prisma.db.lessonPlan.update({
      where: { id },
      data: {
        ...(contentChanged ? resetReview(existing.reviewStatus) : {}),
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
      summary: `Updated the lesson plan “${existing.topic}” (${Object.keys(body).join(', ')})${revet ? ' — it must be vetted again' : ''}`,
    });
    return this.vettedDetail(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('lessons.manage')
  async remove(@Param('id') id: string) {
    const lesson = await this.ownLesson(id);
    await this.prisma.db.lessonPlan.delete({ where: { id } });
    await this.audit.log({ action: 'lesson.deleted', entityType: 'LessonPlan', entityId: id, summary: `Deleted the lesson plan “${lesson.topic}”` });
  }

  // ---------------------------------------------------------- helpers

  private async vettedSummaries(rows: VettingRow[]): Promise<VettedLessonSummary[]> {
    const names = await reviewerNames(this.prisma.db, rows);
    return rows.map((r) => ({
      ...this.engine.lessonSummary(r),
      schemeWeek: r.schemeWeek && { id: r.schemeWeek.id, week: r.schemeWeek.week, schemeId: r.schemeWeek.schemeId },
      ...reviewInfo(r, names),
    }));
  }

  private async vettedDetail(id: string): Promise<VettedLessonDetail> {
    const [detail, row] = await Promise.all([
      this.engine.lessonDetail(id),
      this.prisma.db.lessonPlan.findUniqueOrThrow({
        where: { id },
        select: {
          reviewStatus: true,
          submittedAt: true,
          reviewedAt: true,
          reviewedById: true,
          reviewNote: true,
          date: true,
          createdById: true,
          teacher: { select: { userId: true } },
          schemeWeek: { select: { startsOn: true } },
        },
      }),
    ]);
    return { ...detail, ...reviewInfo(row, await reviewerNames(this.prisma.db, [row])) };
  }

  /** Submits the plans that are yours, not already in vetting, and have content; says why the rest were skipped. */
  private async submitRows(
    rows: (OwnedRow & { reviewStatus: string; objectives: string[]; steps: unknown; generation: string })[],
  ): Promise<SubmitLessonsResult> {
    const result: SubmitLessonsResult = { submitted: 0, skipped: [] };
    const ok: OwnedRow[] = [];
    for (const l of rows) {
      const status = l.reviewStatus as LessonReviewStatus;
      const reason = !isOwnLesson(l)
        ? 'You can only submit your own lesson notes'
        : status === 'SUBMITTED'
          ? 'It is already waiting to be vetted'
          : status === 'APPROVED'
            ? 'It has already been approved'
            : lessonContentProblem(l);
      if (reason) result.skipped.push({ id: l.id, topic: l.topic, reason });
      else ok.push(l);
    }
    if (ok.length) {
      const { count } = await this.prisma.db.lessonPlan.updateMany({
        where: { id: { in: ok.map((l) => l.id) }, reviewStatus: { in: ['NOT_SUBMITTED', 'RETURNED'] } },
        data: { reviewStatus: 'SUBMITTED', submittedAt: new Date() },
      });
      result.submitted = count;
      await this.audit.log({
        action: 'lesson.submitted',
        entityType: 'LessonPlan',
        entityId: ok.length === 1 ? ok[0].id : undefined,
        summary: ok.length === 1 ? `Submitted the lesson note “${ok[0].topic}” for vetting` : `Submitted ${ok.length} lesson notes for vetting`,
      });
    }
    return result;
  }

  /** Records a vetting decision if the plan is still waiting, and tells the teacher. */
  private async decide(l: OwnedRow, body: ReviewLessonInput): Promise<boolean> {
    const approve = body.decision === 'APPROVE';
    const note = body.note?.trim() || null;
    const { count } = await this.prisma.db.lessonPlan.updateMany({
      where: { id: l.id, reviewStatus: 'SUBMITTED' },
      data: { reviewStatus: approve ? 'APPROVED' : 'RETURNED', reviewedAt: new Date(), reviewedById: currentContext().userId!, reviewNote: note },
    });
    if (!count) return false;
    await this.audit.log({
      action: approve ? 'lesson.approved' : 'lesson.returned',
      entityType: 'LessonPlan',
      entityId: l.id,
      summary: approve ? `Approved the lesson note “${l.topic}”` : `Returned the lesson note “${l.topic}” for corrections`,
    });
    await notifyTeacher(this.prisma.db, l, body.decision, note);
    return true;
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
