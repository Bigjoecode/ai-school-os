import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import type { ClassroomEngagement, ModuleResults, ModuleStepKind, MyModuleStatus, SessionStepResult, SessionSummary, Workbook, WorkbookWeek, workbookQuerySchema } from '@aischool/shared';
import type { ClassroomSession } from '../generated/prisma/client';
import { fullName } from '../common/format';
import { currentTenantId } from '../common/request-context';
import { addDays, localDate, localMidnight, mondayOf } from '../success/success-time';
import { levelOf, subjectKey } from '../learning/mastery.service';
import { questionsOf, WEEKS_PER_TERM, yearOf } from './modules.helpers';
import { ModulesService } from './modules.service';

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The teacher's weekly workbook, a module's results, session summaries and the school's classroom engagement. */
@Injectable()
export class WorkbookService {
  constructor(private readonly modules: ModulesService) {}

  private get db() {
    return this.modules.prisma.db;
  }

  // ---------------------------------------------------------- sessions

  async sessionSummaries(list: (ClassroomSession & { module?: { title: string } })[]): Promise<SessionSummary[]> {
    if (!list.length) return [];
    const db = this.db;
    const [arms, modules, users, attempts] = await Promise.all([
      db.classArm.findMany({ where: { id: { in: [...new Set(list.map((s) => s.classArmId))] } }, select: { id: true, name: true, classLevel: { select: { name: true } } } }),
      db.learningModule.findMany({ where: { id: { in: [...new Set(list.map((s) => s.moduleId))] } }, select: { id: true, title: true } }),
      this.modules.prisma.root.user.findMany({ where: { id: { in: list.map((s) => s.teacherUserId).filter((x): x is string => !!x) } }, select: { id: true, firstName: true, lastName: true } }),
      db.checkInAttempt.findMany({ where: { sessionId: { in: list.map((s) => s.id) }, submittedAt: { not: null } }, select: { sessionId: true, studentId: true } }),
    ]);
    return list.map((s) => {
      const arm = arms.find((a) => a.id === s.classArmId);
      const u = users.find((x) => x.id === s.teacherUserId);
      const results = Object.values((s.results ?? {}) as unknown as Record<string, SessionStepResult>);
      const answered = new Set(attempts.filter((a) => a.sessionId === s.id).map((a) => a.studentId)).size;
      const hands = Math.max(0, ...results.filter((r) => r.mode === 'HANDS').map((r) => r.responses));
      const shares = results.filter((r) => r.responses > 0).map((r) => r.understood / r.responses);
      return {
        id: s.id,
        moduleId: s.moduleId,
        moduleTitle: modules.find((m) => m.id === s.moduleId)?.title ?? 'Module',
        class: { id: s.classArmId, label: arm ? `${arm.classLevel.name} ${arm.name}`.trim() : 'Class' },
        status: s.status === 'LIVE' ? 'LIVE' : 'ENDED',
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        present: s.present,
        participants: Math.max(answered, hands),
        checkIns: results.length,
        understoodPercent: shares.length ? Math.round((100 * shares.reduce((t, x) => t + x, 0)) / shares.length) : null,
        teacher: u ? fullName(u) : null,
      };
    });
  }

  // ---------------------------------------------------------- results

  async results(id: string): Promise<ModuleResults> {
    const { s, m } = await this.modules.mustView(id);
    const [summary] = await this.modules.summaries([m], s);
    const steps = m.steps.filter((x) => x.kind === 'CHECKIN' || (x.kind === 'VIDEO' && questionsOf(x.questions).length));
    const db = this.db;
    const [students, progress, attempts, sessions] = await Promise.all([
      m.classArmId ? db.student.findMany({ where: { classArmId: m.classArmId, status: 'ACTIVE' }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true } }) : [],
      db.moduleProgress.findMany({ where: { moduleId: id } }),
      db.checkInAttempt.findMany({ where: { moduleId: id, submittedAt: { not: null } }, orderBy: { submittedAt: 'asc' }, select: { studentId: true, stepId: true, percent: true, passed: true } }),
      db.classroomSession.findMany({ where: { moduleId: id }, orderBy: { startedAt: 'desc' }, take: 30 }),
    ]);
    return {
      module: summary!,
      steps: steps.map((x) => ({ id: x.id, title: x.title, kind: x.kind as ModuleStepKind })),
      students: students.map((st) => {
        const p = progress.find((x) => x.studentId === st.id);
        const checkIns: ModuleResults['students'][number]['checkIns'] = {};
        for (const a of attempts) {
          if (a.studentId !== st.id) continue;
          const prev = checkIns[a.stepId];
          checkIns[a.stepId] = { percent: a.percent, passed: a.passed || !!prev?.passed, tries: (prev?.tries ?? 0) + 1 };
        }
        const status: MyModuleStatus = !p ? 'NOT_STARTED' : p.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
        return { studentId: st.id, name: fullName(st), status, done: p?.completedStepIds.filter((x) => m.steps.some((y) => y.id === x)).length ?? 0, lastSeenAt: p?.lastSeenAt.toISOString() ?? null, checkIns };
      }),
      sessions: await this.sessionSummaries(sessions),
    };
  }

  // ---------------------------------------------------------- workbook

  /** Syllabus topics for this class's year and term, spread over the weeks (when there is no scheme of work). */
  private async syllabusWeeks(subjectName: string, level: { stage: string | null; name: string }, termOrder: number, weeks: number): Promise<{ topics: string[][]; ids: (string | null)[] }> {
    const lv = levelOf(level.stage, level.name);
    const all = await this.modules.prisma.root.syllabusTopic.findMany({ where: { subject: subjectKey(subjectName), level: lv, parentId: null }, orderBy: [{ order: 'asc' }, { name: 'asc' }] });
    if (!all.length) return { topics: [], ids: [] };
    const years = lv === 'PRIMARY' ? 6 : 3;
    const y = Math.min(years, Math.max(1, yearOf(level.name))) - 1;
    const yearTopics = all.slice(Math.floor((all.length * y) / years), Math.floor((all.length * (y + 1)) / years));
    const t = Math.min(3, Math.max(1, termOrder)) - 1;
    const termTopics = yearTopics.slice(Math.floor((yearTopics.length * t) / 3), Math.floor((yearTopics.length * (t + 1)) / 3));
    const topics: string[][] = Array.from({ length: weeks }, () => []);
    const ids: (string | null)[] = Array.from({ length: weeks }, () => null);
    // Leave the last two weeks for revision and exams when there's room.
    const teach = termTopics.length < weeks - 2 ? termTopics.length || 1 : weeks - 2;
    termTopics.forEach((tp, j) => {
      const w = Math.min(teach - 1, Math.floor((j * teach) / termTopics.length));
      topics[w]!.push(tp.name);
      ids[w] ??= tp.id;
    });
    return { topics, ids };
  }

  async workbook(q: z.output<typeof workbookQuerySchema>): Promise<Workbook> {
    const s = await this.modules.scope();
    if (!s.readAll && !this.modules.teachesArm(s, q.classArmId, q.subjectId)) throw new ForbiddenException('The workbook shows the classes and subjects you teach');
    const db = this.db;
    const [arm, subject, tenant] = await Promise.all([
      db.classArm.findUnique({ where: { id: q.classArmId }, include: { classLevel: true } }),
      db.subject.findUnique({ where: { id: q.subjectId } }),
      this.modules.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { timezone: true } }),
    ]);
    if (!arm || !subject) throw new NotFoundException('Class or subject not found');
    const term = q.termId ? await db.term.findUnique({ where: { id: q.termId } }) : ((await db.term.findFirst({ where: { isCurrent: true } })) ?? (await db.term.findFirst({ orderBy: { startsOn: 'desc' } })));
    const today = localDate(new Date(), tenant.timezone);

    // The weeks: the scheme of work, else the syllabus order.
    const scheme = term
      ? await db.schemeOfWork.findFirst({ where: { subjectId: subject.id, classLevelId: arm.classLevelId, termId: term.id, status: { not: 'ARCHIVED' } }, include: { weeks: { orderBy: { week: 'asc' } } } })
      : null;
    let weeks: WorkbookWeek[] = [];
    let source: Workbook['source'] = 'NONE';
    let sylIds: (string | null)[] = [];
    const termStart = term ? day(term.startsOn) : null;
    const startOf = (w: number) => (termStart ? addDays(mondayOf(termStart), (w - 1) * 7) : null);
    if (scheme?.weeks.length) {
      source = 'SCHEME';
      weeks = scheme.weeks.map((w) => ({ week: w.week, topic: w.topic, startsOn: w.startsOn ? day(w.startsOn) : startOf(w.week) }));
    } else {
      const count = term ? Math.min(WEEKS_PER_TERM + 2, Math.max(8, Math.round((term.endsOn.getTime() - term.startsOn.getTime()) / (7 * 86_400_000)))) : WEEKS_PER_TERM;
      const syl = await this.syllabusWeeks(subject.name, arm.classLevel, term?.order ?? 1, count);
      if (syl.topics.length) {
        source = 'SYLLABUS';
        sylIds = syl.ids;
        weeks = syl.topics.map((t, i) => ({ week: i + 1, topic: t.length ? t.join(' · ') : 'Revision and assessment', startsOn: startOf(i + 1) }));
      }
    }
    let currentWeek: number | null = null;
    if (termStart && term && today >= termStart && today <= day(term.endsOn)) {
      currentWeek = Math.floor((new Date(`${mondayOf(today)}T00:00:00Z`).getTime() - new Date(`${mondayOf(termStart)}T00:00:00Z`).getTime()) / (7 * 86_400_000)) + 1;
      if (weeks.length) currentWeek = Math.min(Math.max(1, currentWeek), weeks[weeks.length - 1]!.week);
    }
    const week = q.week ?? currentWeek ?? weeks[0]?.week ?? 1;

    // This week's plan.
    let plan: Workbook['plan'] = null;
    const level = levelOf(arm.classLevel.stage, arm.classLevel.name);
    if (source === 'SCHEME') {
      const w = scheme!.weeks.find((x) => x.week === week);
      if (w) {
        const topic = await this.modules.mastery.findTopic(level, subject.name, w.topic);
        plan = { topic: w.topic, schemeWeekId: w.id, subtopics: w.subtopics, objectives: w.objectives, activities: w.activities, resources: w.resources, topicId: topic?.id ?? null, topicName: topic?.name ?? null };
      }
    } else if (source === 'SYLLABUS') {
      const id = sylIds[week - 1] ?? null;
      const topic = id ? await this.modules.prisma.root.syllabusTopic.findUnique({ where: { id }, include: { children: { orderBy: { order: 'asc' }, select: { name: true } } } }) : null;
      const label = weeks.find((x) => x.week === week)?.topic ?? '';
      plan = { topic: label, schemeWeekId: null, subtopics: topic?.children.map((c) => c.name).slice(0, 12) ?? [], objectives: topic?.objectives ?? [], activities: [], resources: [], topicId: topic?.id ?? null, topicName: topic?.name ?? null };
    }

    const topicWords = plan?.topicName ?? plan?.topic?.split(' · ')[0] ?? null;
    const weekStart = startOf(week);
    const [lessons, modules, materials, library] = await Promise.all([
      db.lessonPlan.findMany({
        where: {
          classArmId: arm.id,
          subjectId: subject.id,
          OR: [
            ...(plan?.schemeWeekId ? [{ schemeWeekId: plan.schemeWeekId }] : []),
            ...(topicWords ? [{ topic: { contains: topicWords.slice(0, 60), mode: 'insensitive' as const } }] : []),
            ...(weekStart ? [{ date: { gte: new Date(`${weekStart}T00:00:00Z`), lt: new Date(`${addDays(weekStart, 7)}T00:00:00Z`) } }] : []),
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      db.learningModule.findMany({
        where: {
          classArmId: arm.id,
          subjectId: subject.id,
          library: false,
          status: { not: 'ARCHIVED' },
          OR: [{ week, ...(term ? { OR: [{ termId: term.id }, { termId: null }] } : {}) }, ...(plan?.schemeWeekId ? [{ schemeWeekId: plan.schemeWeekId }] : []), ...(plan?.topicId ? [{ topicId: plan.topicId, week: null }] : [])],
        },
        include: { steps: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.studyMaterial.findMany({
        where: {
          subjectId: subject.id,
          published: true,
          AND: [
            { OR: [{ classArmIds: { isEmpty: true }, classLevelIds: { isEmpty: true } }, { classArmIds: { has: arm.id } }, { classLevelIds: { has: arm.classLevelId } }] },
            ...(topicWords ? [{ OR: [{ topic: { contains: topicWords.slice(0, 60), mode: 'insensitive' as const } }, { title: { contains: topicWords.slice(0, 60), mode: 'insensitive' as const } }] }] : []),
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: { id: true, title: true, kind: true, topic: true },
      }),
      topicWords
        ? db.learningModule.findMany({
            where: { library: true, status: 'PUBLISHED', subjectId: subject.id, classLevelId: arm.classLevelId, OR: [...(plan?.topicId ? [{ topicId: plan.topicId }] : []), { topicName: { contains: topicWords.slice(0, 60), mode: 'insensitive' } }, { title: { contains: topicWords.slice(0, 60), mode: 'insensitive' } }] },
            include: { steps: true },
            take: 6,
          })
        : [],
    ]);

    // Last week's check-ins.
    let lastWeek: Workbook['lastWeek'] = null;
    if (week > 1) {
      const prev = await db.learningModule.findMany({ where: { classArmId: arm.id, subjectId: subject.id, library: false, week: week - 1, ...(term ? { termId: term.id } : {}) }, include: { steps: true } });
      const prevStart = startOf(week - 1);
      const sessions = await db.classroomSession.findMany({
        where: {
          classArmId: arm.id,
          module: { subjectId: subject.id },
          OR: [{ moduleId: { in: prev.map((m) => m.id) } }, ...(prevStart ? [{ startedAt: { gte: localMidnight(prevStart, tenant.timezone), lt: localMidnight(addDays(prevStart, 7), tenant.timezone) } }] : [])],
        },
        orderBy: { startedAt: 'desc' },
        take: 10,
      });
      const stats = await this.modules.stats(prev);
      if (prev.length || sessions.length) {
        lastWeek = {
          week: week - 1,
          modules: prev.map((m) => ({ id: m.id, title: m.title, completed: stats.get(m.id)?.completed ?? 0, students: stats.get(m.id)?.students ?? 0, averageScore: stats.get(m.id)?.averageScore ?? null })),
          sessions: await this.sessionSummaries(sessions),
        };
      }
    }

    return {
      class: { id: arm.id, label: `${arm.classLevel.name} ${arm.name}`.trim(), classLevelId: arm.classLevelId },
      subject: { id: subject.id, name: subject.name },
      term: term ? { id: term.id, name: term.name, startsOn: day(term.startsOn), endsOn: day(term.endsOn) } : null,
      source,
      scheme: scheme ? { id: scheme.id, title: scheme.title } : null,
      weeks,
      week,
      currentWeek,
      plan,
      lessonPlans: lessons.map((l) => ({ id: l.id, topic: l.topic, date: l.date ? day(l.date) : null, status: l.status, reviewStatus: l.reviewStatus, generation: l.generation })),
      modules: await this.modules.summaries(modules, s),
      materials,
      library: await this.modules.summaries(library, s, false),
      lastWeek,
    };
  }

  // ---------------------------------------------------------- school leaders

  /** "Classroom check-ins this week" for the success dashboard. */
  async engagement(): Promise<ClassroomEngagement> {
    const db = this.db;
    const tz = (await this.modules.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { timezone: true } })).timezone;
    const monday = mondayOf(localDate(new Date(), tz));
    const from = localMidnight(monday, tz);
    const before = localMidnight(addDays(monday, -7), tz);
    const [sessions, prevCount, answered, completions] = await Promise.all([
      db.classroomSession.findMany({ where: { startedAt: { gte: from } } }),
      db.classroomSession.count({ where: { startedAt: { gte: before, lt: from } } }),
      db.checkInAttempt.count({ where: { submittedAt: { gte: from }, mode: { in: ['CLASS', 'MARKED'] } } }),
      db.moduleProgress.count({ where: { completedAt: { gte: from } } }),
    ]);
    const rows = await this.sessionSummaries(sessions);
    const shares = rows.map((r) => r.understoodPercent).filter((x): x is number => x !== null);
    return {
      weekStart: monday,
      sessions: sessions.length,
      classes: new Set(sessions.map((s) => s.classArmId)).size,
      teachers: new Set(sessions.map((s) => s.teacherUserId).filter(Boolean)).size,
      participants: rows.reduce((t, r) => t + r.participants, 0),
      checkInsAnswered: answered,
      understoodPercent: shares.length ? Math.round(shares.reduce((t, x) => t + x, 0) / shares.length) : null,
      selfPacedCompletions: completions,
      previousWeekSessions: prevCount,
    };
  }
}
