import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_PASS_MARK,
  checkInQuestionSchema,
  youtubeId,
  type CheckInAiInput,
  type CheckInQuestion,
  type ClassModulesSummary,
  type ModuleAiDraftInput,
  type ModuleBankQuery,
  type ModuleDetail,
  type ModuleInput,
  type ModuleLibraryQuery,
  type ModuleListQuery,
  type ModuleMaterialRef,
  type ModuleOptions,
  type ModuleStats,
  type ModuleStatus,
  type ModuleStepKind,
  type ModuleStepRow,
  type ModuleStepsInput,
  type ModuleSummary,
  type ModuleTopicOption,
  type Permission,
} from '@aischool/shared';
import { z } from 'zod';
import type { LearningModule, LearningModuleStep, Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { levelOf, MasteryService } from '../learning/mastery.service';
import { SchoolEvidenceService } from '../learning/school-evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { questionId, questionsOf } from './modules.helpers';

type ModuleInputOut = z.output<typeof import('@aischool/shared').moduleSchema>;
type StepsOut = z.output<typeof import('@aischool/shared').moduleStepsSchema>;

/** Who is asking, and what they teach. */
export interface Scope {
  userId: string;
  staffId: string | null;
  /** Any class (academics.manage / curriculum.manage). */
  manageAll: boolean;
  /** Read any class's modules and sessions (school leaders). */
  readAll: boolean;
  /** Publish to the content library (academic managers and heads of department). */
  library: boolean;
  teaches: Set<string>;
  leads: Set<string>;
}

type ModuleWithSteps = LearningModule & { steps: LearningModuleStep[] };

const draftSchema = z.object({
  title: z.string().describe('A short, friendly title for the lesson module, e.g. "Photosynthesis: how plants make food"'),
  summary: z.string().describe('One or two sentences saying what students will learn'),
  steps: z
    .array(
      z.object({
        title: z.string().describe('Step title, e.g. "Introduction", "Key ideas", "Worked example"'),
        notes: z.string().describe('The teaching notes for this step in simple markdown: short paragraphs, bullet points, **key terms** in bold'),
      }),
    )
    .describe('The lesson content as exactly 3 steps: an introduction that links to what students know, the key ideas, and a worked example or activity'),
  questions: z
    .array(
      z.object({
        type: z.enum(['MCQ', 'TRUE_FALSE', 'SHORT']).describe('MCQ (four options), TRUE_FALSE, or SHORT (a one or two word answer)'),
        prompt: z.string().describe('The question'),
        options: z.array(z.string()).describe('Four options for MCQ, without letters; empty for TRUE_FALSE and SHORT'),
        correctIndex: z.number().int().describe('Index of the correct option (MCQ), 0 = True / 1 = False (TRUE_FALSE), 0 for SHORT'),
        answer: z.string().describe('The correct answer as text (for SHORT: the accepted answer, one or two words)'),
        explanation: z.string().describe('One sentence on why it is right'),
      }),
    )
    .describe('Four quick check-in questions to verify understanding, mostly MCQ'),
});
type DraftQuestion = z.infer<typeof draftSchema>['questions'][number];

const questionsOnlySchema = z.object({ questions: draftSchema.shape.questions });

/**
 * Learning modules: the teacher's side (create, edit, publish, library,
 * AI drafting, results, workbook). The student and classroom flows live in
 * CheckInService.
 */
@Injectable()
export class ModulesService {
  constructor(
    readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
    readonly mastery: MasteryService,
    private readonly evidence: SchoolEvidenceService,
  ) {}

  // ---------------------------------------------------------- who

  has(...perms: Permission[]) {
    const p = currentContext().permissions;
    return perms.some((x) => p.has(x));
  }

  /** Staff who teach or lead academics; throws for everyone else. */
  async scope(): Promise<Scope> {
    const ctx = currentContext();
    const manageAll = this.has('academics.manage', 'curriculum.manage');
    const readAll = manageAll || this.has('results.publish', 'lessons.approve');
    if (!readAll && !this.has('lessons.manage', 'homework.manage')) throw new ForbiddenException('Lesson modules are for teachers and academic staff');
    const staff = await this.prisma.db.staff.findFirst({ where: { userId: ctx.userId }, include: { classSubjects: { select: { classArmId: true, subjectId: true } }, classesLed: { select: { id: true } } } });
    return {
      userId: ctx.userId!,
      staffId: staff?.id ?? null,
      manageAll,
      readAll,
      library: manageAll || this.has('lessons.approve'),
      teaches: new Set(staff?.classSubjects.map((c) => `${c.classArmId}|${c.subjectId}`) ?? []),
      leads: new Set(staff?.classesLed.map((c) => c.id) ?? []),
    };
  }

  teachesArm(s: Scope, armId: string, subjectId: string) {
    return s.manageAll || s.leads.has(armId) || s.teaches.has(`${armId}|${subjectId}`);
  }

  canEdit(s: Scope, m: LearningModule) {
    if (m.library) return s.library;
    return s.manageAll || m.createdById === s.userId || (!!m.classArmId && this.teachesArm(s, m.classArmId, m.subjectId));
  }

  canView(s: Scope, m: LearningModule) {
    if (m.library) return m.status === 'PUBLISHED' || s.library || m.createdById === s.userId;
    return s.readAll || this.canEdit(s, m);
  }

  async mustView(id: string) {
    const s = await this.scope();
    const m = await this.prisma.db.learningModule.findUnique({ where: { id }, include: { steps: { orderBy: { order: 'asc' } } } });
    if (!m || !this.canView(s, m)) throw new NotFoundException('Module not found');
    return { s, m };
  }

  async mustEdit(id: string) {
    const { s, m } = await this.mustView(id);
    if (!this.canEdit(s, m)) throw new ForbiddenException('Only the teacher of this class (or an academic manager) can change this module');
    return { s, m };
  }

  // ---------------------------------------------------------- options

  async options(): Promise<ModuleOptions> {
    const s = await this.scope();
    const db = this.prisma.db;
    const armIds = [...new Set([...[...s.teaches].map((k) => k.split('|')[0]!), ...s.leads])];
    const [arms, levels, subjects, term] = await Promise.all([
      db.classArm.findMany({
        where: s.readAll ? {} : { id: { in: armIds } },
        include: { classLevel: true, subjects: { include: { subject: { select: { id: true, name: true } } } } },
        orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }],
      }),
      db.classLevel.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true } }),
      db.subject.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      db.term.findFirst({ where: { isCurrent: true }, select: { id: true, name: true } }),
    ]);
    return {
      classes: arms
        .map((a) => ({
          classArmId: a.id,
          label: `${a.classLevel.name} ${a.name}`.trim(),
          classLevelId: a.classLevelId,
          levelName: a.classLevel.name,
          subjects: a.subjects
            .filter((cs) => s.readAll || this.teachesArm(s, a.id, cs.subjectId))
            .map((cs) => cs.subject)
            .sort((x, y) => x.name.localeCompare(y.name)),
        }))
        .filter((c) => c.subjects.length),
      levels,
      subjects,
      manageAll: s.manageAll,
      canLibrary: s.library,
      canAi: this.has('ai.use'),
      canLessons: this.has('lessons.manage'),
      currentTerm: term,
    };
  }

  /** Syllabus topics for a subject at a class's level (any level when that level has none). */
  async topics(subjectId: string, classLevelId: string): Promise<ModuleTopicOption[]> {
    const [subject, level] = await Promise.all([
      this.prisma.db.subject.findUnique({ where: { id: subjectId } }),
      this.prisma.db.classLevel.findUnique({ where: { id: classLevelId } }),
    ]);
    if (!subject || !level) throw new NotFoundException('Class or subject not found');
    const rows = await this.evidence.homeworkTopics(subject.name, level.stage, level.name);
    const names = new Map(rows.map((r) => [r.id, r.name]));
    return rows.map((r) => ({ id: r.id, name: r.name, parent: r.parentId ? (names.get(r.parentId) ?? null) : null, objectives: r.objectives }));
  }

  // ---------------------------------------------------------- rows

  async stats(list: LearningModule[]): Promise<Map<string, ModuleStats>> {
    const out = new Map<string, ModuleStats>();
    const taught = list.filter((m) => m.classArmId);
    if (!taught.length) return out;
    const db = this.prisma.db;
    const ids = taught.map((m) => m.id);
    const armIds = [...new Set(taught.map((m) => m.classArmId!))];
    const [counts, progress, attempts, sessions] = await Promise.all([
      db.student.groupBy({ by: ['classArmId'], where: { classArmId: { in: armIds }, status: 'ACTIVE' }, _count: { _all: true } }),
      db.moduleProgress.findMany({ where: { moduleId: { in: ids } }, select: { moduleId: true, status: true } }),
      db.checkInAttempt.findMany({ where: { moduleId: { in: ids }, submittedAt: { not: null } }, orderBy: { submittedAt: 'asc' }, select: { moduleId: true, stepId: true, studentId: true, percent: true } }),
      db.classroomSession.findMany({ where: { moduleId: { in: ids } }, select: { moduleId: true, startedAt: true }, orderBy: { startedAt: 'desc' } }),
    ]);
    const size = new Map(counts.map((c) => [c.classArmId, c._count._all]));
    for (const m of taught) {
      const p = progress.filter((x) => x.moduleId === m.id);
      const latest = new Map<string, number>();
      for (const a of attempts) if (a.moduleId === m.id) latest.set(`${a.studentId}|${a.stepId}`, a.percent);
      const scores = [...latest.values()];
      const sess = sessions.filter((x) => x.moduleId === m.id);
      out.set(m.id, {
        students: size.get(m.classArmId) ?? 0,
        started: p.length,
        completed: p.filter((x) => x.status === 'COMPLETED').length,
        averageScore: scores.length ? Math.round(scores.reduce((t, x) => t + x, 0) / scores.length) : null,
        sessions: sess.length,
        lastSessionAt: sess[0]?.startedAt.toISOString() ?? null,
      });
    }
    return out;
  }

  async summaries(list: (LearningModule & { steps?: LearningModuleStep[] })[], s: Scope | null, withStats = true): Promise<ModuleSummary[]> {
    if (!list.length) return [];
    const db = this.prisma.db;
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const [subjects, levels, arms, users, steps, copied, stats] = await Promise.all([
      db.subject.findMany({ where: { id: { in: uniq(list.map((m) => m.subjectId)) } }, select: { id: true, name: true } }),
      db.classLevel.findMany({ where: { id: { in: uniq(list.map((m) => m.classLevelId)) } }, select: { id: true, name: true } }),
      db.classArm.findMany({ where: { id: { in: uniq(list.map((m) => m.classArmId)) } }, select: { id: true, name: true, classLevel: { select: { name: true } } } }),
      this.prisma.root.user.findMany({ where: { id: { in: uniq(list.map((m) => m.createdById)) } }, select: { id: true, firstName: true, lastName: true } }),
      list.every((m) => m.steps) ? Promise.resolve(list.flatMap((m) => m.steps!)) : db.learningModuleStep.findMany({ where: { moduleId: { in: list.map((m) => m.id) } } }),
      db.learningModule.findMany({ where: { id: { in: uniq(list.map((m) => m.copiedFromId)) } }, select: { id: true, title: true } }),
      withStats ? this.stats(list) : Promise.resolve(new Map<string, ModuleStats>()),
    ]);
    const by = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const [S, L, A, U, C] = [by(subjects), by(levels), by(arms), by(users), by(copied)];
    return list.map((m) => {
      const st = steps.filter((x) => x.moduleId === m.id);
      const arm = m.classArmId ? A.get(m.classArmId) : null;
      const u = m.createdById ? U.get(m.createdById) : null;
      return {
        id: m.id,
        title: m.title,
        summary: m.summary,
        subject: S.get(m.subjectId) ?? { id: m.subjectId, name: 'Subject' },
        classLevel: L.get(m.classLevelId) ?? { id: m.classLevelId, name: '' },
        class: arm ? { id: arm.id, label: `${arm.classLevel.name} ${arm.name}`.trim() } : null,
        topic: m.topicName ? { id: m.topicId, name: m.topicName } : null,
        termId: m.termId,
        week: m.week,
        status: m.status as ModuleStatus,
        library: m.library,
        source: m.source === 'AI' ? 'AI' : 'MANUAL',
        mustPass: m.mustPass,
        passMark: m.passMark,
        stepCount: st.length,
        checkInCount: st.filter((x) => x.kind === 'CHECKIN').length,
        videoQuizCount: st.filter((x) => x.kind === 'VIDEO' && questionsOf(x.questions).length).length,
        createdBy: u ? fullName(u) : null,
        copiedFrom: m.copiedFromId ? (C.get(m.copiedFromId)?.title ?? null) : null,
        updatedAt: m.updatedAt.toISOString(),
        publishedAt: m.publishedAt?.toISOString() ?? null,
        canEdit: s ? this.canEdit(s, m) : false,
        stats: stats.get(m.id) ?? null,
      };
    });
  }

  /** Materials and files behind the steps. */
  async stepRows(steps: LearningModuleStep[], withAnswers: boolean): Promise<ModuleStepRow[]> {
    const db = this.prisma.db;
    const fileIds = steps.map((s) => s.fileId).filter((x): x is string => !!x);
    const matIds = steps.map((s) => s.materialId).filter((x): x is string => !!x);
    const [files, mats] = await Promise.all([
      fileIds.length ? db.fileObject.findMany({ where: { id: { in: fileIds } }, select: { id: true, filename: true, mimeType: true, sizeBytes: true } }) : [],
      matIds.length ? db.studyMaterial.findMany({ where: { id: { in: matIds } } }) : [],
    ]);
    const matFiles = mats.some((m) => m.fileId) ? await db.fileObject.findMany({ where: { id: { in: mats.map((m) => m.fileId).filter((x): x is string => !!x) } }, select: { id: true, filename: true, mimeType: true, sizeBytes: true } }) : [];
    const F = new Map([...files, ...matFiles].map((f) => [f.id, f]));
    const M = new Map(mats.map((m) => [m.id, m]));
    return steps.map((s) => {
      const f = s.fileId ? F.get(s.fileId) : null;
      const mat = s.materialId ? M.get(s.materialId) : null;
      const mf = mat?.fileId ? F.get(mat.fileId) : null;
      const material: ModuleMaterialRef | null = mat
        ? { id: mat.id, title: mat.title, kind: mat.kind, youtubeId: youtubeId(mat.url), url: mat.url, body: mat.body, file: mf ? { name: mf.filename, mimeType: mf.mimeType, sizeBytes: mf.sizeBytes } : null }
        : null;
      const questions = questionsOf(s.questions);
      return {
        id: s.id,
        order: s.order,
        kind: s.kind as ModuleStepKind,
        title: s.title,
        body: s.body,
        fileId: s.fileId,
        mimeType: f?.mimeType ?? s.mimeType,
        fileName: f?.filename ?? null,
        url: s.url,
        youtubeId: youtubeId(s.url),
        materialId: s.materialId,
        material,
        questions: withAnswers ? questions : questions.map((q) => ({ ...q, correctIndex: null, answers: [], explanation: null })),
        passMark: s.passMark,
      };
    });
  }

  async detail(m: ModuleWithSteps, s: Scope): Promise<ModuleDetail> {
    const db = this.prisma.db;
    const [summary] = await this.summaries([m], s);
    const [steps, plan, week] = await Promise.all([
      this.stepRows(m.steps, true),
      m.lessonPlanId ? db.lessonPlan.findUnique({ where: { id: m.lessonPlanId }, select: { id: true, topic: true } }) : null,
      m.schemeWeekId ? db.schemeWeek.findUnique({ where: { id: m.schemeWeekId }, select: { id: true, week: true, topic: true } }) : null,
    ]);
    return { ...summary!, steps, lessonPlan: plan, schemeWeek: week };
  }

  // ---------------------------------------------------------- list

  async list(q: ModuleListQuery): Promise<ModuleSummary[]> {
    const s = await this.scope();
    const where: Prisma.LearningModuleWhereInput = { library: false };
    if (q.classArmId) where.classArmId = q.classArmId;
    if (q.subjectId) where.subjectId = q.subjectId;
    where.status = q.status ?? { not: 'ARCHIVED' };
    const list = await this.prisma.db.learningModule.findMany({ where, orderBy: [{ week: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }], take: 300, include: { steps: true } });
    return this.summaries(list.filter((m) => this.canView(s, m)), s);
  }

  async library(q: ModuleLibraryQuery): Promise<ModuleSummary[]> {
    const s = await this.scope();
    const where: Prisma.LearningModuleWhereInput = { library: true, status: s.library ? { not: 'ARCHIVED' } : 'PUBLISHED' };
    if (q.subjectId) where.subjectId = q.subjectId;
    if (q.classLevelId) where.classLevelId = q.classLevelId;
    if (q.q) where.OR = [{ title: { contains: q.q, mode: 'insensitive' } }, { topicName: { contains: q.q, mode: 'insensitive' } }, { summary: { contains: q.q, mode: 'insensitive' } }];
    let list = await this.prisma.db.learningModule.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 300, include: { steps: true } });
    // Teachers see the subjects and levels they teach.
    if (!s.readAll && !s.library) {
      const arms = await this.prisma.db.classArm.findMany({ where: { id: { in: [...[...s.teaches].map((k) => k.split('|')[0]!), ...s.leads] } }, select: { id: true, classLevelId: true } });
      const levelOf = new Map(arms.map((a) => [a.id, a.classLevelId]));
      const pairs = new Set([...s.teaches].map((k) => `${levelOf.get(k.split('|')[0]!)}|${k.split('|')[1]}`));
      // A class teacher can teach any subject in the class they lead.
      const ledLevels = new Set([...s.leads].map((a) => levelOf.get(a)));
      list = list.filter((m) => ledLevels.has(m.classLevelId) || pairs.has(`${m.classLevelId}|${m.subjectId}`));
    }
    return this.summaries(list, s, false);
  }

  /** Modules of a class and subject with their numbers (beside class insights). */
  async classSummary(classArmId: string, subjectId: string): Promise<ClassModulesSummary> {
    const s = await this.scope();
    if (!s.readAll && !this.teachesArm(s, classArmId, subjectId)) throw new ForbiddenException('You can only see the classes and subjects you teach');
    const list = await this.prisma.db.learningModule.findMany({ where: { classArmId, subjectId, library: false, status: { not: 'ARCHIVED' } }, orderBy: [{ week: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }], include: { steps: true } });
    const term = await this.prisma.db.term.findFirst({ where: { isCurrent: true } });
    const sessionsThisTerm = await this.prisma.db.classroomSession.count({ where: { classArmId, module: { subjectId }, ...(term ? { startedAt: { gte: term.startsOn } } : {}) } });
    return { modules: await this.summaries(list, s), sessionsThisTerm };
  }

  // ---------------------------------------------------------- create & edit

  /** Checks class, subject, topic and links; returns the data to save. */
  private async prepare(s: Scope, body: ModuleInputOut) {
    const db = this.prisma.db;
    const subject = await db.subject.findUnique({ where: { id: body.subjectId } });
    if (!subject) throw new BadRequestException('Subject not found');
    let classLevelId = body.classLevelId;
    let library = false;
    if (body.classArmId) {
      const arm = await db.classArm.findUnique({ where: { id: body.classArmId } });
      if (!arm) throw new BadRequestException('Class not found');
      if (!this.teachesArm(s, arm.id, subject.id)) throw new ForbiddenException('You can only make modules for the classes and subjects you teach');
      classLevelId = arm.classLevelId;
    } else {
      if (!classLevelId) throw new BadRequestException('Choose the class');
      if (!s.library) throw new ForbiddenException('Only academic managers and heads of department can add to the content library');
      if (!(await db.classLevel.findUnique({ where: { id: classLevelId } }))) throw new BadRequestException('Class not found');
      library = true;
    }
    let topicName = body.topicName;
    if (body.topicId) {
      const t = await this.prisma.root.syllabusTopic.findUnique({ where: { id: body.topicId } });
      if (!t) throw new BadRequestException('Topic not found');
      topicName = t.name;
    }
    if (body.termId && !(await db.term.findUnique({ where: { id: body.termId } }))) throw new BadRequestException('Term not found');
    if (body.schemeWeekId && !(await db.schemeWeek.findUnique({ where: { id: body.schemeWeekId } }))) throw new BadRequestException('Scheme week not found');
    if (body.lessonPlanId && !(await db.lessonPlan.findUnique({ where: { id: body.lessonPlanId } }))) throw new BadRequestException('Lesson plan not found');
    return {
      title: body.title,
      summary: body.summary,
      subjectId: subject.id,
      classLevelId: classLevelId!,
      classArmId: body.classArmId,
      topicId: body.topicId,
      topicName,
      termId: body.termId,
      week: body.week,
      schemeWeekId: body.schemeWeekId,
      lessonPlanId: body.lessonPlanId,
      mustPass: body.mustPass,
      passMark: body.passMark,
      library,
    };
  }

  async create(body: ModuleInputOut): Promise<ModuleDetail> {
    const s = await this.scope();
    const data = await this.prepare(s, body);
    const m = await this.prisma.db.learningModule.create({
      data: { ...data, tenantId: currentTenantId(), createdById: s.userId, status: data.library ? 'PUBLISHED' : 'DRAFT', publishedAt: data.library ? new Date() : null },
      include: { steps: true },
    });
    await this.audit.log({ action: 'modules.created', entityType: 'LearningModule', entityId: m.id, summary: `Created the lesson module "${m.title}"` });
    return this.detail(m, s);
  }

  async update(id: string, body: ModuleInputOut): Promise<ModuleDetail> {
    const { s, m: before } = await this.mustEdit(id);
    const data = await this.prepare(s, body);
    if (data.library !== before.library) throw new BadRequestException(before.library ? 'Library modules have no class: copy it into a class instead' : 'Choose the class');
    const m = await this.prisma.db.learningModule.update({ where: { id }, data, include: { steps: { orderBy: { order: 'asc' } } } });
    await this.audit.log({ action: 'modules.updated', entityType: 'LearningModule', entityId: id, summary: `Updated the lesson module "${m.title}"` });
    return this.detail(m, s);
  }

  /** Checks each step's file and material, gives questions ids, and replaces the step list (keeping step ids). */
  async saveSteps(id: string, body: StepsOut): Promise<ModuleDetail> {
    const { s, m } = await this.mustEdit(id);
    const db = this.prisma.db;
    const fileIds = [...new Set(body.steps.map((x) => x.fileId).filter((x): x is string => !!x))];
    const matIds = [...new Set(body.steps.map((x) => x.materialId).filter((x): x is string => !!x))];
    const [files, mats] = await Promise.all([
      fileIds.length ? db.fileObject.findMany({ where: { id: { in: fileIds } } }) : [],
      matIds.length ? db.studyMaterial.findMany({ where: { id: { in: matIds } }, select: { id: true, published: true, kind: true } }) : [],
    ]);
    const F = new Map(files.map((f) => [f.id, f]));
    const known = new Set(m.steps.flatMap((x) => [x.fileId]).filter(Boolean));
    for (const st of body.steps) {
      if (st.fileId) {
        const f = F.get(st.fileId);
        if (!f) throw new BadRequestException(`Upload the file for "${st.title}" again: it was not found`);
        if (!known.has(f.id) && f.uploadedById && f.uploadedById !== s.userId) {
          const family = (await db.student.count({ where: { userId: f.uploadedById } })) + (await db.guardian.count({ where: { userId: f.uploadedById } }));
          if (family) throw new BadRequestException('Upload the file yourself to use it');
        }
        const ok = st.kind === 'VIDEO' ? f.mimeType.startsWith('video/') : st.kind === 'IMAGE' ? f.mimeType.startsWith('image/') : true;
        if (!ok) throw new BadRequestException(`"${st.title}": that file isn’t ${st.kind === 'VIDEO' ? 'a video' : 'a picture'}`);
      }
      if (st.materialId && !mats.some((x) => x.id === st.materialId)) throw new BadRequestException(`"${st.title}": that study material was not found`);
    }
    const keep = new Set(m.steps.map((x) => x.id));
    const tenantId = currentTenantId();
    await this.prisma.db.$transaction(async (tx) => {
      const ids = body.steps.map((x) => x.id).filter((x): x is string => !!x && keep.has(x));
      await tx.learningModuleStep.deleteMany({ where: { moduleId: id, id: { notIn: ids } } });
      for (const [order, st] of body.steps.entries()) {
        const questions = st.questions.map((q) => ({ ...q, id: q.id ?? questionId() })) as unknown as Prisma.InputJsonValue;
        const f = st.fileId ? F.get(st.fileId) : null;
        const data = {
          order,
          kind: st.kind,
          title: st.title,
          body: st.body,
          fileId: ['NOTE', 'LINK', 'MATERIAL', 'CHECKIN'].includes(st.kind) ? null : st.fileId,
          mimeType: f?.mimeType ?? null,
          url: ['VIDEO', 'LINK'].includes(st.kind) && !st.fileId ? st.url : null,
          materialId: st.kind === 'MATERIAL' || (st.kind === 'VIDEO' && !st.fileId && !st.url) ? st.materialId : null,
          questions: ['CHECKIN', 'VIDEO'].includes(st.kind) ? questions : ([] as Prisma.InputJsonValue),
          passMark: st.passMark,
        };
        if (st.id && keep.has(st.id)) await tx.learningModuleStep.update({ where: { id: st.id }, data });
        else await tx.learningModuleStep.create({ data: { ...data, tenantId, moduleId: id } });
      }
      await tx.learningModule.update({ where: { id }, data: { updatedAt: new Date() } });
    });
    const fresh = await db.learningModule.findUniqueOrThrow({ where: { id }, include: { steps: { orderBy: { order: 'asc' } } } });
    return this.detail(fresh, s);
  }

  async publish(id: string, published: boolean, notify: boolean): Promise<ModuleDetail> {
    const { s, m: before } = await this.mustEdit(id);
    if (published && !before.steps.length) throw new BadRequestException('Add at least one step before publishing');
    const m = await this.prisma.db.learningModule.update({
      where: { id },
      data: { status: published ? 'PUBLISHED' : 'DRAFT', publishedAt: published ? (before.publishedAt ?? new Date()) : before.publishedAt },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (published && before.status !== 'PUBLISHED' && notify && m.classArmId) await this.notify(m);
    await this.audit.log({ action: published ? 'modules.published' : 'modules.unpublished', entityType: 'LearningModule', entityId: id, summary: `${published ? 'Published' : 'Unpublished'} the lesson module "${m.title}"` });
    return this.detail(m, s);
  }

  async archive(id: string) {
    const { m } = await this.mustEdit(id);
    const used = (await this.prisma.db.checkInAttempt.count({ where: { moduleId: id } })) + (await this.prisma.db.classroomSession.count({ where: { moduleId: id } }));
    // Taught or answered: keep the evidence, just hide it.
    if (used) await this.prisma.db.learningModule.update({ where: { id }, data: { status: 'ARCHIVED' } });
    else await this.prisma.db.learningModule.delete({ where: { id } });
    await this.audit.log({ action: used ? 'modules.archived' : 'modules.deleted', entityType: 'LearningModule', entityId: id, summary: `${used ? 'Archived' : 'Deleted'} the lesson module "${m.title}"` });
    return { archived: !!used };
  }

  /** Copies a module (from the library, or another class) into a class as a draft. */
  async copy(id: string, classArmId: string): Promise<ModuleDetail> {
    const { s, m } = await this.mustView(id);
    const arm = await this.prisma.db.classArm.findUnique({ where: { id: classArmId } });
    if (!arm) throw new BadRequestException('Class not found');
    if (!this.teachesArm(s, arm.id, m.subjectId)) throw new ForbiddenException('You can only copy into the classes you teach this subject in');
    const term = await this.prisma.db.term.findFirst({ where: { isCurrent: true } });
    const made = await this.clone(m, { classArmId: arm.id, classLevelId: arm.classLevelId, library: false, status: 'DRAFT', termId: term?.id ?? m.termId }, s.userId);
    await this.audit.log({ action: 'modules.copied', entityType: 'LearningModule', entityId: made.id, summary: `Copied the lesson module "${m.title}" into ${arm.name}` });
    return this.detail(made, s);
  }

  /** Shares a copy of a class module in the content library. */
  async toLibrary(id: string): Promise<ModuleDetail> {
    const { s, m } = await this.mustView(id);
    if (!s.library) throw new ForbiddenException('Only academic managers and heads of department can add to the content library');
    if (m.library) throw new BadRequestException('This module is already in the library');
    const made = await this.clone(m, { classArmId: null, library: true, status: 'PUBLISHED', week: m.week }, s.userId);
    await this.audit.log({ action: 'modules.shared', entityType: 'LearningModule', entityId: made.id, summary: `Shared "${m.title}" in the content library` });
    return this.detail(made, s);
  }

  private async clone(m: ModuleWithSteps, over: Partial<Prisma.LearningModuleUncheckedCreateInput>, userId: string): Promise<ModuleWithSteps> {
    const tenantId = currentTenantId();
    const made = await this.prisma.db.learningModule.create({
      data: {
        tenantId,
        title: m.title,
        summary: m.summary,
        subjectId: m.subjectId,
        classLevelId: m.classLevelId,
        classArmId: m.classArmId,
        topicId: m.topicId,
        topicName: m.topicName,
        termId: m.termId,
        week: m.week,
        schemeWeekId: m.schemeWeekId,
        mustPass: m.mustPass,
        passMark: m.passMark,
        source: m.source,
        copiedFromId: m.id,
        createdById: userId,
        ...over,
        publishedAt: over.status === 'PUBLISHED' ? new Date() : null,
      },
    });
    if (m.steps.length) {
      await this.prisma.db.learningModuleStep.createMany({
        data: m.steps.map((x) => ({ tenantId, moduleId: made.id, order: x.order, kind: x.kind, title: x.title, body: x.body, fileId: x.fileId, mimeType: x.mimeType, url: x.url, materialId: x.materialId, questions: x.questions as Prisma.InputJsonValue, passMark: x.passMark })),
      });
    }
    return this.prisma.db.learningModule.findUniqueOrThrow({ where: { id: made.id }, include: { steps: { orderBy: { order: 'asc' } } } });
  }

  private async notify(m: LearningModule) {
    try {
      const db = this.prisma.db;
      const students = await db.student.findMany({ where: { status: 'ACTIVE', classArmId: m.classArmId! }, select: { userId: true, guardians: { select: { guardian: { select: { userId: true } } } } } });
      const subject = (await db.subject.findUnique({ where: { id: m.subjectId }, select: { name: true } }))?.name;
      const title = `New ${subject ? `${subject} ` : ''}lesson: ${m.title}`.slice(0, 200);
      const body = (m.summary ?? (m.topicName ? `Topic: ${m.topicName}` : 'Open it in My lessons.')).slice(0, 300);
      const kids = new Set(students.map((s) => s.userId).filter((x): x is string => !!x));
      const parents = new Set(students.flatMap((s) => s.guardians.map((g) => g.guardian.userId)).filter((x): x is string => !!x));
      const data = [...[...kids].map((userId) => ({ userId, link: `/my-lessons/${m.id}` })), ...[...parents].filter((u) => !kids.has(u)).map((userId) => ({ userId, link: '/family' }))];
      if (data.length) await db.notification.createMany({ data: data.map((d) => ({ tenantId: currentTenantId(), title, body, ...d })) });
    } catch {
      // A failed notification never stops the module being published.
    }
  }

  // ---------------------------------------------------------- question sources

  /** Objective and short-answer questions from the school's question bank and the practice bank, ready to drop into a check-in. */
  async bank(q: ModuleBankQuery): Promise<CheckInQuestion[]> {
    await this.scope();
    const db = this.prisma.db;
    const [subject, level] = await Promise.all([db.subject.findUnique({ where: { id: q.subjectId } }), db.classLevel.findUnique({ where: { id: q.classLevelId } })]);
    if (!subject || !level) throw new NotFoundException('Class or subject not found');
    const topic = q.topicId ? await this.prisma.root.syllabusTopic.findUnique({ where: { id: q.topicId } }) : null;
    const words = q.q || topic?.name;
    const school = await db.question.findMany({
      where: { subjectId: subject.id, classLevelId: level.id, status: 'APPROVED', type: { in: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'] }, ...(words ? { OR: [{ topic: { contains: words, mode: 'insensitive' } }, { stem: { contains: words, mode: 'insensitive' } }] } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });
    const practice = topic
      ? await this.prisma.root.examQuestion.findMany({ where: { topicId: topic.id, status: 'PUBLISHED', type: 'OBJECTIVE' }, orderBy: { updatedAt: 'desc' }, take: 20 })
      : [];
    const out: CheckInQuestion[] = [];
    for (const x of school) {
      const raw =
        x.type === 'SHORT_ANSWER'
          ? { type: 'SHORT' as const, prompt: x.stem, answers: (x.answer ?? '').split(/\s*[|;]\s*/).filter(Boolean).slice(0, 6), source: 'BANK' as const, sourceId: x.id }
          : { type: x.type === 'TRUE_FALSE' ? ('TRUE_FALSE' as const) : ('MCQ' as const), prompt: x.stem, options: x.options.slice(0, 6), correctIndex: x.correctIndex, source: 'BANK' as const, sourceId: x.id };
      const parsed = checkInQuestionSchema.safeParse(raw);
      if (parsed.success) out.push({ ...parsed.data, id: questionId() });
    }
    for (const x of practice) {
      const opts = (Array.isArray(x.options) ? x.options : []).map((o) => (typeof o === 'string' ? o : typeof o === 'object' && o && 'text' in o ? String((o as { text: unknown }).text) : '')).filter(Boolean);
      const parsed = checkInQuestionSchema.safeParse({ type: 'MCQ', prompt: x.stem, options: opts.slice(0, 6), correctIndex: x.answer, explanation: x.explanation, source: 'EXAM_BANK', sourceId: x.id });
      if (parsed.success) out.push({ ...parsed.data, id: questionId() });
    }
    return out;
  }

  private async aboutTopic(subjectId: string, classLevelId: string, topicId: string | null, topic: string | null) {
    const db = this.prisma.db;
    const [subject, level] = await Promise.all([db.subject.findUniqueOrThrow({ where: { id: subjectId } }), db.classLevel.findUniqueOrThrow({ where: { id: classLevelId } })]);
    const t = topicId ? await this.prisma.root.syllabusTopic.findUnique({ where: { id: topicId } }) : topic ? await this.mastery.findTopic(levelOf(level.stage, level.name), subject.name, topic) : null;
    return { subject, level, topic: t, name: t?.name ?? topic ?? '' };
  }

  private toQuestions(raw: DraftQuestion[], source: 'AI'): CheckInQuestion[] {
    const out: CheckInQuestion[] = [];
    for (const q of raw) {
      const options = q.type === 'MCQ' ? q.options.map((o) => o.trim()).filter(Boolean).slice(0, 5) : [];
      let correctIndex = q.correctIndex;
      if (q.type === 'MCQ') {
        const byText = options.findIndex((o) => o.toLowerCase() === q.answer.trim().toLowerCase());
        if (byText >= 0) correctIndex = byText;
        correctIndex = Math.max(0, Math.min(options.length - 1, correctIndex));
      }
      if (q.type === 'TRUE_FALSE') correctIndex = /^f/i.test(q.answer.trim()) ? 1 : /^t/i.test(q.answer.trim()) ? 0 : correctIndex === 1 ? 1 : 0;
      const parsed = checkInQuestionSchema.safeParse({ type: q.type, prompt: q.prompt, options, correctIndex, answers: q.type === 'SHORT' ? [q.answer] : [], explanation: q.explanation, source });
      if (parsed.success) out.push({ ...parsed.data, id: questionId() });
    }
    return out;
  }

  /** AI-drafted check-in questions for a topic; the teacher reviews them before saving. */
  async aiCheckIn(body: z.output<typeof import('@aischool/shared').checkInAiSchema>): Promise<CheckInQuestion[]> {
    await this.scope();
    let levelId = body.classLevelId;
    if (body.classArmId) levelId = (await this.prisma.db.classArm.findUniqueOrThrow({ where: { id: body.classArmId } })).classLevelId;
    if (!levelId) throw new BadRequestException('Choose the class');
    const { subject, level, topic, name } = await this.aboutTopic(body.subjectId, levelId, body.topicId, body.topic);
    const r = await this.gateway.generateJson(
      {
        tier: 'standard',
        system: [
          `You write quick lesson check-in questions for ${level.name} ${subject.name} students in a Nigerian school, on "${name}". Use British English and simple, clear wording suited to the class.`,
          'Each question checks one key idea from the lesson. Mostly multiple choice with four plausible options and exactly one right answer; at most one true-or-false and one short answer (one or two words). Copy the correct option into "answer".',
          topic?.objectives.length ? `The lesson objectives: ${topic.objectives.slice(0, 8).join('; ')}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        messages: [{ role: 'user', content: `Write exactly ${body.count} check-in questions on ${name}.` }],
        maxOutputTokens: 2000,
      },
      questionsOnlySchema,
      'modules-checkin',
    );
    const qs = this.toQuestions(r.data.questions.slice(0, body.count), 'AI');
    return body.forVideo ? qs.map((q, i) => ({ ...q, at: 60 * (i + 1) })) : qs;
  }

  /** One click from the workbook: the AI drafts the module (notes in three steps and a check-in); the teacher reviews it before publishing. */
  async aiDraft(body: z.output<typeof import('@aischool/shared').moduleAiDraftSchema>): Promise<ModuleDetail> {
    const s = await this.scope();
    const db = this.prisma.db;
    const arm = await db.classArm.findUnique({ where: { id: body.classArmId }, include: { classLevel: true } });
    if (!arm) throw new BadRequestException('Class not found');
    if (!this.teachesArm(s, arm.id, body.subjectId)) throw new ForbiddenException('You can only make modules for the classes and subjects you teach');
    const week = body.schemeWeekId ? await db.schemeWeek.findUnique({ where: { id: body.schemeWeekId }, include: { scheme: true } }) : null;
    if (body.schemeWeekId && !week) throw new BadRequestException('Scheme week not found');
    const { subject, level, topic, name } = await this.aboutTopic(body.subjectId, arm.classLevelId, body.topicId, body.topic ?? week?.topic ?? null);
    const objectives = week?.objectives.length ? week.objectives : (topic?.objectives ?? []);
    const r = await this.gateway.generateJson(
      {
        tier: 'standard',
        system: [
          `You are an experienced Nigerian teacher preparing a short lesson module for ${level.name} ${subject.name} on "${name}", to be taught in class from a projector and read again by students on their phones.`,
          'Use British English, short sentences, Nigerian examples and names where they help (naira, markets, local foods, places). Keep facts accurate and at the level of the class. Each step should fit on one screen.',
          'Then write four quick check-in questions to verify the class understood before the lesson moves on.',
          objectives.length ? `Lesson objectives: ${objectives.slice(0, 8).join('; ')}` : '',
          week?.subtopics.length ? `Sub-topics: ${week.subtopics.join('; ')}` : '',
          body.guidance ? `The teacher adds: ${body.guidance}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        messages: [{ role: 'user', content: `Draft the module on ${name} in exactly 3 steps, then the check-in questions.` }],
        maxOutputTokens: 4000,
      },
      draftSchema,
      'modules-draft',
    );
    // Study materials the school already has on the topic (videos first).
    const mats = await db.studyMaterial.findMany({
      where: {
        published: true,
        subjectId: subject.id,
        OR: [{ topic: { contains: name.slice(0, 60), mode: 'insensitive' } }, { title: { contains: name.slice(0, 60), mode: 'insensitive' } }],
        AND: [{ OR: [{ classArmIds: { isEmpty: true }, classLevelIds: { isEmpty: true } }, { classArmIds: { has: arm.id } }, { classLevelIds: { has: arm.classLevelId } }] }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    });
    const picked = [...mats.filter((x) => x.kind === 'VIDEO'), ...mats.filter((x) => x.kind !== 'VIDEO')].slice(0, 2);
    const questions = this.toQuestions(r.data.questions.slice(0, 5), 'AI');
    const notes = r.data.steps.slice(0, 5).filter((x) => x.notes.trim());
    const steps = [
      ...notes.slice(0, 1).map((x) => ({ kind: 'NOTE', title: x.title.slice(0, 160) || 'Introduction', body: x.notes })),
      ...picked.map((x) => ({ kind: x.kind === 'VIDEO' ? 'VIDEO' : 'MATERIAL', title: x.title.slice(0, 160), body: null, materialId: x.id })),
      ...notes.slice(1).map((x) => ({ kind: 'NOTE', title: x.title.slice(0, 160) || 'Key ideas', body: x.notes })),
      ...(questions.length ? [{ kind: 'CHECKIN', title: `Check-in: ${name}`.slice(0, 160), body: null, questions }] : []),
    ];
    const term = body.termId ? await db.term.findUnique({ where: { id: body.termId } }) : await db.term.findFirst({ where: { isCurrent: true } });
    const tenantId = currentTenantId();
    const m = await db.learningModule.create({
      data: {
        tenantId,
        title: (r.data.title || name).slice(0, 160),
        summary: r.data.summary.slice(0, 1000) || null,
        subjectId: subject.id,
        classLevelId: arm.classLevelId,
        classArmId: arm.id,
        topicId: topic?.id ?? null,
        topicName: topic?.name ?? name,
        termId: term?.id ?? week?.scheme.termId ?? null,
        week: body.week ?? week?.week ?? null,
        schemeWeekId: week?.id ?? null,
        passMark: DEFAULT_PASS_MARK,
        source: 'AI',
        createdById: s.userId,
      },
    });
    await db.learningModuleStep.createMany({
      data: steps.map((x, order) => ({
        tenantId,
        moduleId: m.id,
        order,
        kind: x.kind,
        title: x.title,
        body: x.body,
        materialId: 'materialId' in x ? x.materialId : null,
        questions: ('questions' in x ? x.questions : []) as unknown as Prisma.InputJsonValue,
      })),
    });
    await this.audit.log({ action: 'modules.ai_drafted', entityType: 'LearningModule', entityId: m.id, summary: `Asked AI to draft a lesson module on ${name} for ${arm.classLevel.name} ${arm.name}` });
    return this.detail(await db.learningModule.findUniqueOrThrow({ where: { id: m.id }, include: { steps: { orderBy: { order: 'asc' } } } }), s);
  }
}

export type { ModuleInput, ModuleStepsInput, CheckInAiInput, ModuleAiDraftInput };
