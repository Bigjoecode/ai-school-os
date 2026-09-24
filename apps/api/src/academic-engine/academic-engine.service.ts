import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import {
  aiCurriculumTermSchema,
  aiLessonSchema,
  aiSchemeSchema,
  type CurriculumDetail,
  type CurriculumSummary,
  type Differentiation,
  type LessonDetail,
  type LessonStep,
  type LessonSummary,
  type SchemeDetail,
  type SchemeSummary,
} from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { dateOnly, fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { GenerationQueue } from '../ai/generation-queue';
import { curriculumTermPrompt, lessonPrompt, schemePrompt, type SchoolContext } from './prompts';

const MAX_TERM_WEEKS = 14;

// ------------------------------------------------------------ includes

export const curriculumInclude = {
  subject: { select: { id: true, name: true, code: true } },
  classLevel: { select: { id: true, name: true, code: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  _count: { select: { units: true } },
} satisfies Prisma.CurriculumInclude;

export const schemeInclude = {
  subject: { select: { id: true, name: true, code: true } },
  classLevel: { select: { id: true, name: true, code: true } },
  term: { select: { id: true, name: true, startsOn: true, endsOn: true, session: { select: { name: true } } } },
  curriculum: { select: { id: true, version: true } },
  _count: { select: { weeks: true } },
} satisfies Prisma.SchemeOfWorkInclude;

export const lessonInclude = {
  subject: { select: { id: true, name: true, code: true } },
  classArm: { select: { id: true, name: true, classLevel: { select: { name: true } } } },
  teacher: { select: { id: true, firstName: true, lastName: true, userId: true } },
  schemeWeek: { select: { id: true, week: true, schemeId: true } },
} satisfies Prisma.LessonPlanInclude;

type CurriculumRow = Prisma.CurriculumGetPayload<{ include: typeof curriculumInclude }>;
type SchemeRow = Prisma.SchemeOfWorkGetPayload<{ include: typeof schemeInclude }>;
type LessonRow = Prisma.LessonPlanGetPayload<{ include: typeof lessonInclude }>;

/**
 * Curriculum → Scheme of Work → Lesson Plan generation, plus the response
 * shapes for all three. Every generator follows the same path: the record is
 * created as QUEUED, a background job asks the AI gateway for structured
 * output, and the validated result is written into ordinary columns.
 */
@Injectable()
export class AcademicEngineService implements OnModuleInit {
  private readonly logger = new Logger(AcademicEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly queue: GenerationQueue,
    private readonly audit: AuditService,
  ) {}

  /** Jobs don't survive a restart: mark any left mid-flight as failed. */
  async onModuleInit() {
    const data = { generation: 'FAILED' as const, generationError: 'Interrupted by a server restart. Please try again.' };
    const where = { generation: { in: ['QUEUED' as const, 'RUNNING' as const] } };
    const counts = await Promise.all([
      this.prisma.root.curriculum.updateMany({ where, data }),
      this.prisma.root.schemeOfWork.updateMany({ where, data }),
      this.prisma.root.lessonPlan.updateMany({ where, data }),
    ]);
    const n = counts.reduce((sum, c) => sum + c.count, 0);
    if (n) this.logger.warn(`Marked ${n} interrupted AI generation job(s) as failed`);
  }

  // ---------------------------------------------------------- jobs

  /** Refuse up front rather than create a record that can only fail. */
  assertAiAvailable() {
    if (!this.gateway.configuredProviders().length) {
      throw new ServiceUnavailableException("AI isn't connected yet — add an AI provider API key to the server");
    }
  }

  queueCurriculum(id: string) {
    this.queue.enqueue(`curriculum ${id}`, () =>
      this.track('curriculum', id, async () => {
        const cur = await this.prisma.db.curriculum.findUniqueOrThrow({ where: { id }, include: curriculumInclude });
        const ctx = await this.context(cur.subject.name, cur.classLevelId);
        const summaries: string[] = [];
        const earlier: string[] = [];

        // Terms in sequence, so each one knows what came before.
        for (const order of [1, 2, 3]) {
          const { system, user } = curriculumTermPrompt(ctx, { order, weeks: cur.weeksPerTerm, earlierTopics: earlier }, cur.guidance);
          const result = await this.gateway.generateJson(
            { tier: 'advanced', system, messages: [{ role: 'user', content: user }] },
            aiCurriculumTermSchema,
            'curriculum',
          );
          const weeks = result.data.weeks.slice(0, cur.weeksPerTerm);
          await this.prisma.db.$transaction(async (tx) => {
            await tx.curriculumUnit.deleteMany({ where: { curriculumId: id, termOrder: order } });
            await tx.curriculumUnit.createMany({
              data: weeks.map((w, i) => ({
                tenantId: cur.tenantId,
                curriculumId: id,
                termOrder: order,
                // Week numbers come from position, never from the model.
                week: i + 1,
                topic: w.topic,
                subtopics: w.subtopics,
                objectives: w.objectives,
                activities: w.activities,
                resources: w.resources,
                assessment: w.assessment,
              })),
            });
          });
          summaries.push(`Term ${order}: ${result.data.termSummary}`);
          earlier.push(...weeks.map((w) => w.topic));
        }
        await this.prisma.db.curriculum.update({ where: { id }, data: { overview: summaries.join('\n\n') } });
      }),
    );
  }

  queueScheme(id: string) {
    this.queue.enqueue(`scheme ${id}`, () =>
      this.track('scheme', id, async () => {
        const scheme = await this.prisma.db.schemeOfWork.findUniqueOrThrow({ where: { id }, include: schemeInclude });
        const ctx = await this.context(scheme.subject.name, scheme.classLevelId);
        const calendar = termWeeks(scheme.term.startsOn, scheme.term.endsOn);

        const units = scheme.curriculumId
          ? await this.prisma.db.curriculumUnit.findMany({
              where: { curriculumId: scheme.curriculumId, termOrder: await this.termOrder(scheme.termId) },
              orderBy: { week: 'asc' },
            })
          : null;

        const { system, user } = schemePrompt(
          ctx,
          { name: scheme.term.name, sessionName: scheme.term.session.name, weeks: calendar },
          units,
          scheme.guidance,
        );
        const result = await this.gateway.generateJson(
          { tier: 'advanced', system, messages: [{ role: 'user', content: user }] },
          aiSchemeSchema,
          'scheme',
        );
        const weeks = result.data.weeks.slice(0, calendar.length);
        await this.prisma.db.$transaction(async (tx) => {
          await tx.schemeWeek.deleteMany({ where: { schemeId: id } });
          await tx.schemeWeek.createMany({
            data: weeks.map((w, i) => ({
              tenantId: scheme.tenantId,
              schemeId: id,
              week: i + 1,
              startsOn: new Date(`${calendar[i]!.startsOn}T00:00:00.000Z`),
              topic: w.topic,
              subtopics: w.subtopics,
              objectives: w.objectives,
              activities: w.activities,
              resources: w.resources,
              evaluation: w.evaluation,
            })),
          });
        });
      }),
    );
  }

  queueLesson(id: string) {
    this.queue.enqueue(`lesson ${id}`, () =>
      this.track('lesson', id, async () => {
        const lesson = await this.prisma.db.lessonPlan.findUniqueOrThrow({
          where: { id },
          include: { ...lessonInclude, schemeWeek: true },
        });
        const arm = await this.prisma.db.classArm.findUniqueOrThrow({ where: { id: lesson.classArmId } });
        const ctx = { ...(await this.context(lesson.subject.name, arm.classLevelId)), classArm: arm.name };
        const week = lesson.schemeWeek;

        const { system, user } = lessonPrompt(
          ctx,
          {
            topic: lesson.topic,
            durationMinutes: lesson.durationMinutes,
            objectives: week?.objectives ?? [],
            subtopics: week?.subtopics ?? [],
            date: dateOnly(lesson.date),
          },
          lesson.guidance,
        );
        const result = await this.gateway.generateJson(
          { tier: 'advanced', system, messages: [{ role: 'user', content: user }] },
          aiLessonSchema,
          'lesson',
        );
        const plan = result.data;
        await this.prisma.db.lessonPlan.update({
          where: { id },
          data: {
            topic: plan.topic || lesson.topic,
            objectives: plan.objectives,
            priorKnowledge: plan.priorKnowledge,
            materials: plan.materials,
            steps: plan.steps as unknown as Prisma.InputJsonValue,
            differentiation: plan.differentiation as unknown as Prisma.InputJsonValue,
            assessment: plan.assessment,
            homework: plan.homework,
          },
        });
      }),
    );
  }

  /** Moves a record through RUNNING → DONE/FAILED around the job body. */
  private async track(kind: 'curriculum' | 'scheme' | 'lesson', id: string, body: () => Promise<void>) {
    const set = (data: { generation: 'RUNNING' | 'DONE' | 'FAILED'; generationError: string | null }) => {
      if (kind === 'curriculum') return this.prisma.db.curriculum.update({ where: { id }, data });
      if (kind === 'scheme') return this.prisma.db.schemeOfWork.update({ where: { id }, data });
      return this.prisma.db.lessonPlan.update({ where: { id }, data });
    };
    await set({ generation: 'RUNNING', generationError: null });
    try {
      await body();
      await set({ generation: 'DONE', generationError: null });
      await this.audit.log({
        action: `ai.${kind}_generated`,
        entityType: kind,
        entityId: id,
        summary: `AI generated a ${kind === 'scheme' ? 'scheme of work' : kind === 'lesson' ? 'lesson plan' : 'curriculum'}`,
      });
    } catch (err) {
      const message = (err as { response?: { message?: string } }).response?.message ?? (err as Error).message;
      await set({ generation: 'FAILED', generationError: String(message).slice(0, 500) }).catch(() => undefined);
      throw err;
    }
  }

  private async context(subject: string, classLevelId: string): Promise<SchoolContext> {
    const [tenant, level] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true, country: true } }),
      this.prisma.db.classLevel.findUniqueOrThrow({ where: { id: classLevelId }, select: { name: true, stage: true } }),
    ]);
    return { schoolName: tenant.name, country: tenant.country, subject, level: level.name, stage: level.stage };
  }

  private async termOrder(termId: string) {
    return (await this.prisma.db.term.findUniqueOrThrow({ where: { id: termId }, select: { order: true } })).order;
  }

  // ---------------------------------------------------------- mappers

  curriculumSummary(c: CurriculumRow): CurriculumSummary {
    return {
      id: c.id,
      title: c.title,
      version: c.version,
      status: c.status,
      weeksPerTerm: c.weeksPerTerm,
      subject: c.subject,
      classLevel: c.classLevel,
      unitCount: c._count.units,
      createdBy: c.createdBy ? fullName(c.createdBy) : null,
      updatedAt: c.updatedAt.toISOString(),
      source: c.source,
      generation: c.generation,
      generationError: c.generationError,
    };
  }

  async curriculumDetail(id: string): Promise<CurriculumDetail> {
    const c = await this.prisma.db.curriculum.findUniqueOrThrow({
      where: { id },
      include: { ...curriculumInclude, units: { orderBy: [{ termOrder: 'asc' }, { week: 'asc' }] } },
    });
    return {
      ...this.curriculumSummary(c),
      overview: c.overview,
      guidance: c.guidance,
      units: c.units.map(({ id: unitId, termOrder, week, topic, subtopics, objectives, activities, resources, assessment }) => ({
        id: unitId,
        termOrder,
        week,
        topic,
        subtopics,
        objectives,
        activities,
        resources,
        assessment,
      })),
    };
  }

  schemeSummary(s: SchemeRow): SchemeSummary {
    return {
      id: s.id,
      title: s.title,
      status: s.status,
      subject: s.subject,
      classLevel: s.classLevel,
      term: {
        id: s.term.id,
        name: s.term.name,
        sessionName: s.term.session.name,
        startsOn: dateOnly(s.term.startsOn)!,
        endsOn: dateOnly(s.term.endsOn)!,
      },
      curriculum: s.curriculum,
      weekCount: s._count.weeks,
      updatedAt: s.updatedAt.toISOString(),
      source: s.source,
      generation: s.generation,
      generationError: s.generationError,
    };
  }

  async schemeDetail(id: string): Promise<SchemeDetail> {
    const s = await this.prisma.db.schemeOfWork.findUniqueOrThrow({
      where: { id },
      include: {
        ...schemeInclude,
        weeks: { orderBy: { week: 'asc' }, include: { _count: { select: { lessonPlans: true } } } },
      },
    });
    return {
      ...this.schemeSummary(s),
      guidance: s.guidance,
      weeks: s.weeks.map((w) => ({
        id: w.id,
        week: w.week,
        startsOn: dateOnly(w.startsOn),
        topic: w.topic,
        subtopics: w.subtopics,
        objectives: w.objectives,
        activities: w.activities,
        resources: w.resources,
        evaluation: w.evaluation,
        lessonCount: w._count.lessonPlans,
      })),
    };
  }

  lessonSummary(l: LessonRow): LessonSummary {
    return {
      id: l.id,
      topic: l.topic,
      date: dateOnly(l.date),
      durationMinutes: l.durationMinutes,
      status: l.status,
      subject: l.subject,
      classArm: { id: l.classArm.id, name: l.classArm.name, levelName: l.classArm.classLevel.name },
      teacher: l.teacher ? { id: l.teacher.id, name: fullName(l.teacher) } : null,
      schemeWeek: l.schemeWeek,
      canEdit: canEditLesson(l),
      updatedAt: l.updatedAt.toISOString(),
      source: l.source,
      generation: l.generation,
      generationError: l.generationError,
    };
  }

  async lessonDetail(id: string): Promise<LessonDetail> {
    const l = await this.prisma.db.lessonPlan.findUniqueOrThrow({ where: { id }, include: lessonInclude });
    return {
      ...this.lessonSummary(l),
      objectives: l.objectives,
      priorKnowledge: l.priorKnowledge,
      materials: l.materials,
      steps: (l.steps ?? []) as unknown as LessonStep[],
      differentiation: (l.differentiation ?? null) as unknown as Differentiation | null,
      assessment: l.assessment,
      homework: l.homework,
      guidance: l.guidance,
    };
  }
}

/** Teachers change their own lessons; curriculum managers can change any. */
export function canEditLesson(l: { createdById: string | null; teacher: { userId: string | null } | null }): boolean {
  const ctx = currentContext();
  if (!ctx.permissions.has('lessons.manage')) return false;
  return l.createdById === ctx.userId || l.teacher?.userId === ctx.userId || ctx.permissions.has('curriculum.manage');
}

/** The teaching weeks of a term: week 1 starts on the term's first day. */
export function termWeeks(startsOn: Date, endsOn: Date): { week: number; startsOn: string }[] {
  const days = Math.floor((endsOn.getTime() - startsOn.getTime()) / 86_400_000) + 1;
  const count = Math.min(MAX_TERM_WEEKS, Math.max(1, Math.ceil(days / 7)));
  return Array.from({ length: count }, (_, i) => ({
    week: i + 1,
    startsOn: new Date(startsOn.getTime() + i * 7 * 86_400_000).toISOString().slice(0, 10),
  }));
}
