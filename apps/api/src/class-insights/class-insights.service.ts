import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  aiClassSummarySchema,
  aiPracticeSetSchema,
  CELL_BAND_LABELS,
  cellBand,
  INSIGHT_SOURCE_LABELS,
  STRUGGLING_BELOW,
  type ClassInsightsOptions,
  type ClassInsightsSummary,
  type ClassMastery,
  type ClassMasteryCell,
  type ClassMasteryInsights,
  type ClassMasteryStudent,
  type ClassMasteryTopic,
  type ClassStudentMastery,
  type ClassTopicDetail,
  type ClassTopicStudent,
  type MasteryCellBand,
  type MyClassInsights,
  type PracticeDraft,
  type PracticeHomeworkInput,
  type RemedialLessonInput,
  type RemedialLessonResult,
} from '@aischool/shared';
import { AcademicEngineService } from '../academic-engine/academic-engine.service';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { ResultsService } from '../assessment/results.service';
import { AuditService } from '../audit/audit.service';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { FeatureService } from '../features/features.service';
import { levelOf, subjectKey, type SyllabusLevel } from '../learning/mastery.service';
import { PrismaService } from '../prisma/prisma.service';

/** "Recent" for trends: the last 14 days against everything before. */
const TREND_DAYS = 14;
const DAY = 86_400_000;

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pctOf = (n: number, d: number) => (d ? Math.round((100 * n) / d) : null);

interface Scope {
  manage: boolean;
  staffId: string | null;
  teaches: Set<string>;
  leads: Set<string>;
}

interface TopicRow {
  id: string;
  name: string;
  level: string;
  order: number;
  parentId: string | null;
  exams: string[];
  objectives: string[];
  parent: { id: string; name: string; order: number } | null;
}

/** Per-student, per-topic score change: latest score against the latest one before the recent window. */
function trendMap(evidence: { studentId: string; topicId: string; scoreAfter: number; createdAt: Date }[], since: Date) {
  const before = new Map<string, number>();
  const after = new Map<string, number>();
  for (const e of evidence) {
    const k = `${e.studentId}|${e.topicId}`;
    if (e.createdAt < since) before.set(k, e.scoreAfter);
    else after.set(k, e.scoreAfter);
  }
  const out = new Map<string, number>();
  for (const [k, v] of after) {
    const b = before.get(k);
    if (b !== undefined) out.set(k, v - b);
  }
  return out;
}

/**
 * The teacher learning loop: a class's topic mastery as a heatmap, with
 * insights, a short summary, and remedial follow-up (a lesson plan from the
 * existing generator, practice homework, support groups). Teachers see the
 * classes and subjects they teach (and every subject of a class they lead);
 * academics.manage / results.publish see everything.
 */
@Injectable()
export class ClassInsightsService {
  private readonly logger = new Logger(ClassInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly engine: AcademicEngineService,
    private readonly results: ResultsService,
    private readonly audit: AuditService,
    private readonly features: FeatureService,
  ) {}

  // ---------------------------------------------------------- permissions

  async scope(): Promise<Scope> {
    const ctx = currentContext();
    const p = ctx.permissions;
    if (!p.has('academics.read') && !p.has('homework.manage')) throw new ForbiddenException('Class insights are for teachers and academic staff');
    const staff = await this.prisma.db.staff.findFirst({
      where: { userId: ctx.userId },
      include: { classSubjects: { select: { classArmId: true, subjectId: true } }, classesLed: { select: { id: true } } },
    });
    return {
      manage: p.has('academics.manage') || p.has('results.publish'),
      staffId: staff?.id ?? null,
      teaches: new Set(staff?.classSubjects.map((c) => `${c.classArmId}|${c.subjectId}`) ?? []),
      leads: new Set(staff?.classesLed.map((c) => c.id) ?? []),
    };
  }

  canView(s: Scope, classArmId: string, subjectId: string) {
    return s.manage || s.teaches.has(`${classArmId}|${subjectId}`) || s.leads.has(classArmId);
  }

  /** The class and subject, if the signed-in user teaches them (or manages). */
  async mustView(classArmId: string, subjectId: string) {
    const scope = await this.scope();
    if (!this.canView(scope, classArmId, subjectId)) throw new ForbiddenException('You can only see insights for the classes and subjects you teach');
    const [arm, subject] = await Promise.all([
      this.prisma.db.classArm.findUnique({ where: { id: classArmId }, include: { classLevel: true } }),
      this.prisma.db.subject.findUnique({ where: { id: subjectId } }),
    ]);
    if (!arm) throw new NotFoundException('Class not found');
    if (!subject) throw new NotFoundException('Subject not found');
    const level = levelOf(arm.classLevel.stage, arm.classLevel.name);
    return { scope, arm, subject, level, key: subjectKey(subject.name), label: `${arm.classLevel.name} ${arm.name}` };
  }

  // ---------------------------------------------------------- options

  async options(): Promise<ClassInsightsOptions> {
    const s = await this.scope();
    const p = currentContext().permissions;
    const db = this.prisma.db;
    const arms = await db.classArm.findMany({
      where: s.manage ? {} : { id: { in: [...new Set([...[...s.teaches].map((k) => k.split('|')[0]), ...s.leads])] } },
      include: { classLevel: true, subjects: { include: { subject: { select: { id: true, name: true } } } } },
      orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }],
    });
    return {
      classes: arms
        .map((a) => ({
          classArmId: a.id,
          label: `${a.classLevel.name} ${a.name}`,
          level: levelOf(a.classLevel.stage, a.classLevel.name),
          subjects: a.subjects
            .filter((cs) => this.canView(s, a.id, cs.subjectId))
            .map((cs) => cs.subject)
            .sort((x, y) => x.name.localeCompare(y.name)),
        }))
        .filter((c) => c.subjects.length),
      manage: s.manage,
      canLessons: p.has('lessons.manage'),
      canHomework: p.has('homework.manage'),
      canAi: p.has('ai.use'),
    };
  }

  // ---------------------------------------------------------- the heatmap

  private async students(classArmId: string) {
    return this.prisma.db.student.findMany({
      where: { classArmId, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private topicSelect = { id: true, name: true, level: true, order: true, parentId: true, exams: true, objectives: true, parent: { select: { id: true, name: true, order: true } } } as const;

  /** Syllabus order: each topic after its parent; the class's own level first. */
  private sortTopics<T extends TopicRow>(topics: T[], level: SyllabusLevel): T[] {
    const key = (t: T) => {
      const root = t.parent ?? t;
      return [t.level === level ? 0 : 1, root.order, root.name.toLowerCase(), t.parent ? 1 : 0, t.order, t.name.toLowerCase()] as const;
    };
    return [...topics].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
      return 0;
    });
  }

  private async officialPercents(classArmId: string, subjectId: string): Promise<Map<string, number> | null> {
    if (!currentContext().permissions.has('results.read')) return null;
    const term = await this.prisma.db.term.findFirst({ where: { isCurrent: true } });
    if (!term) return null;
    if (!(await this.prisma.db.score.count({ where: { classArmId, termId: term.id, subjectId } }))) return null;
    try {
      const r = await this.results.classResults(classArmId, term.id);
      const out = new Map<string, number>();
      for (const [studentId, subjects] of r.results) {
        const p = subjects.get(subjectId)?.percent;
        if (p !== null && p !== undefined) out.set(studentId, Math.round(p));
      }
      return out;
    } catch {
      return null;
    }
  }

  /** Students × topics for one class and subject. */
  async mastery(classArmId: string, subjectId: string, allTopics = false): Promise<ClassMastery> {
    const { arm, subject, level, key, label } = await this.mustView(classArmId, subjectId);
    return this.build({ arm, subject, level, key, label }, allTopics, true);
  }

  private async build(
    c: { arm: { id: string }; subject: { id: string; name: string }; level: SyllabusLevel; key: string; label: string },
    allTopics: boolean,
    withOfficial: boolean,
  ): Promise<ClassMastery> {
    const db = this.prisma.db;
    const students = await this.students(c.arm.id);
    const ids = students.map((s) => s.id);
    const records = ids.length
      ? await db.masteryRecord.findMany({ where: { studentId: { in: ids }, topic: { subject: c.key } }, include: { topic: { select: this.topicSelect } } })
      : [];
    const byId = new Map<string, TopicRow>();
    for (const r of records) byId.set(r.topicId, r.topic);
    const evidenced = new Set(byId.keys());
    if (allTopics) {
      const syllabus = await this.prisma.root.syllabusTopic.findMany({ where: { subject: c.key, level: c.level, parentId: null }, select: this.topicSelect });
      for (const t of syllabus) if (!byId.has(t.id)) byId.set(t.id, t);
    }
    const topics = this.sortTopics([...byId.values()], c.level);
    const since = new Date(Date.now() - TREND_DAYS * DAY);
    const evidence = evidenced.size
      ? await db.masteryEvidence.findMany({
          where: { studentId: { in: ids }, topicId: { in: [...evidenced] } },
          select: { studentId: true, topicId: true, scoreAfter: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const trend = trendMap(evidence, since);
    const rec = new Map(records.map((r) => [`${r.studentId}|${r.topicId}`, r]));

    const cells: (ClassMasteryCell | null)[][] = students.map((s) =>
      topics.map((t) => {
        const r = rec.get(`${s.id}|${t.id}`);
        return r ? { score: r.score, confidence: r.confidence, attempts: r.attempts } : null;
      }),
    );

    const n = students.length;
    const topicRows: ClassMasteryTopic[] = topics.map((t, j) => {
      const scores = cells.map((row) => row[j]?.score).filter((x): x is number => x !== undefined);
      const struggling = scores.filter((x) => x < STRUGGLING_BELOW).length;
      const deltas = students.map((s) => trend.get(`${s.id}|${t.id}`)).filter((x): x is number => x !== undefined);
      return {
        id: t.id,
        name: t.name,
        parent: t.parent?.name ?? null,
        exams: t.exams,
        evidenced: evidenced.has(t.id),
        average: mean(scores),
        assessed: scores.length,
        struggling,
        strugglingPct: pctOf(struggling, scores.length),
        noEvidencePct: n ? Math.round((100 * (n - scores.length)) / n) : 0,
        trend: deltas.length >= 2 ? mean(deltas) : null,
      };
    });

    const studentRows: ClassMasteryStudent[] = students.map((s, i) => {
      const scores = cells[i].filter((x): x is ClassMasteryCell => !!x).map((x) => x.score);
      const deltas = topics.map((t) => trend.get(`${s.id}|${t.id}`)).filter((x): x is number => x !== undefined);
      return {
        id: s.id,
        name: fullName(s),
        admissionNumber: s.admissionNumber,
        overall: mean(scores),
        assessed: scores.length,
        low: scores.filter((x) => x < STRUGGLING_BELOW).length,
        trend: mean(deltas),
      };
    });

    const official = withOfficial ? await this.officialPercents(c.arm.id, c.subject.id) : null;
    const overalls = studentRows.map((s) => s.overall).filter((x): x is number => x !== null);
    return {
      class: { id: c.arm.id, label: c.label, level: c.level },
      subject: { id: c.subject.id, name: c.subject.name, key: c.key },
      allTopics,
      topics: topicRows,
      students: studentRows,
      cells,
      insights: this.insights(topicRows, studentRows, cells, topics),
      totals: {
        students: n,
        withEvidence: overalls.length,
        evidenceLast14Days: evidence.filter((e) => e.createdAt >= since).length,
        average: mean(overalls),
        officialAverage: official && official.size ? mean([...official.values()]) : null,
      },
    };
  }

  private insights(topics: ClassMasteryTopic[], students: ClassMasteryStudent[], cells: (ClassMasteryCell | null)[][], rows: TopicRow[]): ClassMasteryInsights {
    const strugglingTopics = topics
      .filter((t) => t.struggling > 0 && t.assessed >= 2)
      .sort((a, b) => (b.strugglingPct ?? 0) - (a.strugglingPct ?? 0) || b.struggling - a.struggling || (a.average ?? 0) - (b.average ?? 0))
      .slice(0, 5)
      .map((t) => ({ topicId: t.id, topic: t.name, struggling: t.struggling, assessed: t.assessed, average: t.average }));
    const needSupport = students
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.low >= 2 && s.low / Math.max(1, s.assessed) >= 0.4)
      .sort((a, b) => b.s.low - a.s.low || (a.s.overall ?? 0) - (b.s.overall ?? 0))
      .slice(0, 12)
      .map(({ s, i }) => ({
        studentId: s.id,
        name: s.name,
        low: s.low,
        assessed: s.assessed,
        overall: s.overall,
        topics: rows
          .map((t, j) => ({ t, c: cells[i][j] }))
          .filter((x) => x.c && x.c.score < STRUGGLING_BELOW)
          .sort((a, b) => a.c!.score - b.c!.score)
          .slice(0, 4)
          .map((x) => x.t.name),
      }));
    const improving = topics
      .filter((t) => t.trend !== null && t.trend >= 5)
      .sort((a, b) => b.trend! - a.trend!)
      .slice(0, 5)
      .map((t) => ({ topicId: t.id, topic: t.name, change: t.trend!, students: t.assessed }));
    return { strugglingTopics, needSupport, improving };
  }

  // ---------------------------------------------------------- one topic

  async topic(classArmId: string, subjectId: string, topicId: string): Promise<ClassTopicDetail> {
    const { arm, subject, label, key } = await this.mustView(classArmId, subjectId);
    const db = this.prisma.db;
    const t = await this.prisma.root.syllabusTopic.findUnique({ where: { id: topicId }, include: { parent: { select: { name: true } }, children: { select: { id: true, name: true, order: true }, orderBy: { order: 'asc' } } } });
    if (!t || t.subject !== key) throw new NotFoundException('That topic is not part of this subject');
    const students = await this.students(arm.id);
    const ids = students.map((s) => s.id);
    const topicIds = [t.id, ...t.children.map((c) => c.id)];
    const since = new Date(Date.now() - TREND_DAYS * DAY);
    const [records, evidence, homework, lessons] = await Promise.all([
      db.masteryRecord.findMany({ where: { studentId: { in: ids }, topicId: { in: topicIds } } }),
      db.masteryEvidence.findMany({ where: { studentId: { in: ids }, topicId: t.id }, orderBy: { createdAt: 'asc' } }),
      db.homework.findMany({ where: { classArmId: arm.id, topicId: t.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      db.lessonPlan.findMany({
        where: { classArmId: arm.id, subjectId: subject.id, topic: { contains: t.name.slice(0, 80), mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    const trend = trendMap(evidence, since);
    const mine = new Map(records.filter((r) => r.topicId === t.id).map((r) => [r.studentId, r]));
    const rows: ClassTopicStudent[] = students
      .map((s) => {
        const r = mine.get(s.id);
        return {
          id: s.id,
          name: fullName(s),
          admissionNumber: s.admissionNumber,
          score: r?.score ?? null,
          confidence: r?.confidence ?? 0,
          attempts: r?.attempts ?? 0,
          lastEvidenceAt: r?.lastEvidenceAt?.toISOString() ?? null,
          trend: trend.get(`${s.id}|${t.id}`) ?? null,
        };
      })
      .sort((a, b) => (a.score ?? 101) - (b.score ?? 101) || a.name.localeCompare(b.name));
    const scores = rows.map((r) => r.score).filter((x): x is number => x !== null);
    const bands: MasteryCellBand[] = ['LOW', 'MID', 'HIGH', 'NONE'];
    const sources = new Map<string, { count: number; correct: number; total: number }>();
    for (const e of evidence) {
      const s = sources.get(e.source) ?? { count: 0, correct: 0, total: 0 };
      s.count++;
      s.correct += e.correct;
      s.total += e.total;
      sources.set(e.source, s);
    }
    return {
      topic: { id: t.id, name: t.name, parent: t.parent?.name ?? null, objectives: t.objectives, exams: t.exams },
      classLabel: label,
      subject: subject.name,
      average: mean(scores),
      assessed: scores.length,
      classSize: students.length,
      distribution: bands.map((band) => ({ band, label: CELL_BAND_LABELS[band], count: rows.filter((r) => cellBand(r.score) === band).length })),
      students: rows,
      struggling: rows.filter((r) => r.score !== null && r.score < STRUGGLING_BELOW),
      sources: [...sources.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([source, s]) => ({ source, label: INSIGHT_SOURCE_LABELS[source] ?? source, count: s.count, percentCorrect: s.total ? Math.round((100 * s.correct) / s.total) : null })),
      subSkills: t.children.map((ch) => {
        const sc = records.filter((r) => r.topicId === ch.id).map((r) => r.score);
        return { topicId: ch.id, name: ch.name, average: mean(sc), assessed: sc.length, struggling: sc.filter((x) => x < STRUGGLING_BELOW).length };
      }),
      homework: homework.map((h) => ({ id: h.id, title: h.title, status: h.status, dueDate: dateOnly(h.dueDate)! })),
      lessons: lessons.map((l) => ({ id: l.id, topic: l.topic, generation: l.generation, reviewStatus: l.reviewStatus })),
    };
  }

  // ---------------------------------------------------------- one student

  async student(classArmId: string, subjectId: string, studentId: string): Promise<ClassStudentMastery> {
    const { arm, subject, label, key, level } = await this.mustView(classArmId, subjectId);
    const db = this.prisma.db;
    const s = await db.student.findFirst({ where: { id: studentId, classArmId: arm.id } });
    if (!s) throw new NotFoundException('That student is not in this class');
    const records = await db.masteryRecord.findMany({ where: { studentId, topic: { subject: key } }, include: { topic: { select: this.topicSelect } } });
    const evidence = records.length
      ? await db.masteryEvidence.findMany({ where: { studentId, topicId: { in: records.map((r) => r.topicId) } }, include: { topic: { select: { name: true } } }, orderBy: { createdAt: 'asc' } })
      : [];
    const trend = trendMap(evidence, new Date(Date.now() - TREND_DAYS * DAY));
    const order = new Map(this.sortTopics(records.map((r) => r.topic), level).map((t, i) => [t.id, i]));
    const official = await this.officialPercents(arm.id, subject.id);
    return {
      student: { id: s.id, name: fullName(s), admissionNumber: s.admissionNumber },
      classLabel: label,
      subject: subject.name,
      overall: mean(records.map((r) => r.score)),
      officialPercent: official?.get(s.id) ?? null,
      topics: records
        .sort((a, b) => (order.get(a.topicId) ?? 0) - (order.get(b.topicId) ?? 0))
        .map((r) => ({
          topicId: r.topicId,
          topic: r.topic.name,
          parent: r.topic.parent?.name ?? null,
          score: r.score,
          confidence: r.confidence,
          attempts: r.attempts,
          lastEvidenceAt: r.lastEvidenceAt?.toISOString() ?? null,
          trend: trend.get(`${studentId}|${r.topicId}`) ?? null,
        })),
      recent: evidence
        .slice(-15)
        .reverse()
        .map((e) => ({ at: e.createdAt.toISOString(), topic: e.topic.name, source: e.source, scoreAfter: e.scoreAfter, correct: e.correct, total: e.total })),
    };
  }

  // ---------------------------------------------------------- summary

  /** A short paragraph with suggestions: AI when available and allowed, otherwise rules. */
  async summary(classArmId: string, subjectId: string): Promise<ClassInsightsSummary> {
    const m = await this.mastery(classArmId, subjectId, false);
    const rules = this.rulesSummary(m);
    if (!m.totals.withEvidence) return rules;
    if (!currentContext().permissions.has('ai.use') || !this.gateway.configuredProviders().length) return rules;
    const facts = {
      class: m.class.label,
      subject: m.subject.name,
      students: m.totals.students,
      studentsWithEvidence: m.totals.withEvidence,
      classAverage: m.totals.average,
      officialTermAverage: m.totals.officialAverage,
      topics: m.topics
        .filter((t) => t.assessed)
        .map((t) => ({ topic: t.name, average: t.average, assessed: t.assessed, belowFifty: t.struggling, percentBelowFifty: t.strugglingPct, changeLast14Days: t.trend })),
      strugglingTopics: m.insights.strugglingTopics,
      studentsNeedingSupport: m.insights.needSupport.map((s) => ({ name: s.name, lowTopics: s.topics, overall: s.overall })),
      improving: m.insights.improving,
    };
    try {
      const r = await this.gateway.generateJson(
        {
          tier: 'standard',
          system:
            'You are an experienced head of department in a Nigerian secondary school, coaching a class teacher. Write in British English, plainly and warmly. ' +
            'Use only the numbers given; never invent students, topics or scores. Topic mastery comes from practice, homework, quizzes and online exams and is separate from official results. ' +
            'Name students only when listing who needs support.',
          messages: [
            {
              role: 'user',
              content:
                `Summarise this class's topic mastery for the teacher in one short paragraph (3–5 sentences) that leads with the most important finding and quotes the key numbers ` +
                `(for example "42% of JSS 2 B are below 50% on Simultaneous equations"). Then give 2–4 concrete suggestions for the next week (re-teaching, grouping, practice, checking understanding).\n\n` +
                JSON.stringify(facts),
            },
          ],
          maxOutputTokens: 700,
        },
        aiClassSummarySchema,
        'class-insights-summary',
      );
      const text = r.data.summary.trim();
      if (!text) return rules;
      return { text, suggestions: r.data.suggestions.map((x) => x.trim()).filter(Boolean).slice(0, 4), source: 'AI' };
    } catch (err) {
      this.logger.warn(`AI summary unavailable, using rules: ${(err as Error).message}`);
      return rules;
    }
  }

  rulesSummary(m: ClassMastery): ClassInsightsSummary {
    const { totals, insights } = m;
    const where = `${m.class.label} ${m.subject.name}`;
    if (!totals.withEvidence) {
      return {
        text: `There is no topic mastery evidence for ${where} yet. Evidence comes in as students practise in Exam Academy, use the AI tutor, and as topic-linked homework, quizzes and online exams are marked.`,
        suggestions: ['Set a short practice homework linked to this week’s topic so the first evidence comes in.', 'Encourage students to practise the topic in Exam Academy.'],
        source: 'RULES',
      };
    }
    const parts: string[] = [];
    const assessedTopics = m.topics.filter((t) => t.assessed).length;
    parts.push(`${totals.withEvidence} of ${totals.students} students in ${where} have mastery evidence across ${assessedTopics} topic${assessedTopics === 1 ? '' : 's'}, with a class average of ${totals.average ?? 0}%.`);
    const top = insights.strugglingTopics[0];
    if (top) {
      parts.push(`The hardest topic is ${top.topic}: ${Math.round((100 * top.struggling) / top.assessed)}% of the students assessed (${top.struggling} of ${top.assessed}) are below 50%.`);
      const more = insights.strugglingTopics.slice(1, 3);
      if (more.length) parts.push(`${more.map((t) => `${t.topic} (${t.struggling} below 50%)`).join(' and ')} also need attention.`);
    } else {
      parts.push('No topic has students below 50% at the moment.');
    }
    if (insights.improving.length) parts.push(`Improving in the last ${TREND_DAYS} days: ${insights.improving.slice(0, 2).map((t) => `${t.topic} (+${t.change} points)`).join(', ')}.`);
    if (insights.needSupport.length) {
      const names = insights.needSupport.slice(0, 4).map((s) => s.name);
      parts.push(`${insights.needSupport.length} student${insights.needSupport.length === 1 ? ' is' : 's are'} below 50% on several topics${names.length ? `, including ${names.join(', ')}` : ''}.`);
    }
    if (totals.officialAverage !== null) parts.push(`For comparison, the official term average for the subject is ${totals.officialAverage}%.`);
    const suggestions: string[] = [];
    if (top) {
      suggestions.push(`Re-teach ${top.topic} with a short remedial lesson: start with a diagnostic question, then worked examples and guided practice.`);
      suggestions.push(`Group the ${top.struggling} students below 50% on ${top.topic} for a 15-minute support session while the rest of the class does extension work.`);
      suggestions.push(`Set five practice questions on ${top.topic} as homework so you can see whether the re-teaching worked.`);
    }
    if (insights.needSupport.length) suggestions.push(`Check in with ${insights.needSupport.length === 1 ? 'the student' : 'the students'} who are low across several topics, and consider telling their parents.`);
    const noEvidence = totals.students - totals.withEvidence;
    if (noEvidence > 0 && suggestions.length < 4) suggestions.push(`${noEvidence} student${noEvidence === 1 ? ' has' : 's have'} no evidence yet: a quick topic quiz would show where they are.`);
    return { text: parts.join(' '), suggestions: suggestions.slice(0, 4), source: 'RULES' };
  }

  // ---------------------------------------------------------- remedial lesson

  /** Queues a draft remedial lesson plan with the existing lesson generator; the teacher reviews and edits it. */
  async remedialLesson(body: RemedialLessonInput): Promise<RemedialLessonResult> {
    const { arm, subject, label } = await this.mustView(body.classArmId, body.subjectId);
    this.engine.assertAiAvailable();
    const d = await this.topic(body.classArmId, body.subjectId, body.topicId);
    const ctx = currentContext();
    const staff = await this.prisma.db.staff.findFirst({ where: { userId: ctx.userId } });
    const guidance = this.remedialGuidance(d, body.note);
    const topic = `Remedial: ${d.topic.name}`.slice(0, 200);
    const lesson = await this.prisma.db.lessonPlan.create({
      data: {
        tenantId: currentTenantId(),
        subjectId: subject.id,
        classArmId: arm.id,
        teacherId: staff?.id,
        createdById: ctx.userId,
        topic,
        date: body.date ? parseDate(body.date) : null,
        durationMinutes: body.durationMinutes,
        guidance,
        source: 'AI',
        generation: 'QUEUED',
        // Left NOT_SUBMITTED (the default): the teacher reviews it and submits it for vetting as usual.
      },
    });
    this.engine.queueLesson(lesson.id);
    await this.audit.log({
      action: 'lesson.generation_started',
      entityType: 'LessonPlan',
      entityId: lesson.id,
      summary: `Asked AI to plan a remedial lesson on ${d.topic.name} for ${label} (from class insights)`,
    });
    return { lessonId: lesson.id, topic };
  }

  /** Guidance for the lesson generator (kept within the 1,500 characters lessons accept). */
  remedialGuidance(d: ClassTopicDetail, note?: string): string {
    const secure = d.students.filter((s) => s.score !== null && s.score >= 70).length;
    const developing = d.students.filter((s) => s.score !== null && s.score >= STRUGGLING_BELOW && s.score < 70).length;
    const weakSubs = d.subSkills.filter((s) => s.assessed && s.average !== null).sort((a, b) => a.average! - b.average!).slice(0, 3);
    const lines = [
      `This is a REMEDIAL (re-teaching) lesson on "${d.topic.name}"${d.topic.parent ? ` (part of ${d.topic.parent})` : ''} for ${d.classLabel}.`,
      d.assessed
        ? `Class evidence: ${d.struggling.length} of ${d.assessed} assessed students (${Math.round((100 * d.struggling.length) / d.assessed)}%) are below 50%; ${developing} are developing (50–69%) and ${secure} are secure (70%+). Class average ${d.average}%.`
        : 'There is little evidence yet: begin with a short diagnostic.',
      d.sources.length ? `Evidence came from: ${d.sources.map((s) => `${s.label}${s.percentCorrect !== null ? ` (${s.percentCorrect}% correct)` : ''}`).join(', ')}.` : '',
      weakSubs.length ? `Weakest sub-skills: ${weakSubs.map((s) => `${s.name} (average ${s.average}%)`).join('; ')}.` : '',
      d.topic.objectives.length ? `Objectives to secure: ${d.topic.objectives.slice(0, 4).map((o) => o.slice(0, 140)).join('; ')}.` : '',
      'Open with a quick diagnostic question that exposes the common misconception, re-teach with worked examples in familiar Nigerian contexts, then guided and independent practice.',
      `Differentiation: support = the ${d.struggling.length || 'few'} struggling students working with the teacher on scaffolded steps; core = developing students practising with partial worked examples; stretch = secure students on harder, exam-style questions.`,
      'Assessment: 3–4 quick checks (mini whiteboards or an exit ticket) so the teacher can see who has now got it.',
      note ? `Teacher's note: ${note}` : '',
    ].filter(Boolean);
    let out = lines.join('\n');
    if (out.length > 1500) out = `${out.slice(0, 1497)}…`;
    return out;
  }

  // ---------------------------------------------------------- practice homework

  async practiceDraft(classArmId: string, subjectId: string, topicId: string): Promise<PracticeDraft> {
    const d = await this.topic(classArmId, subjectId, topicId);
    const fallback: PracticeDraft = {
      title: `Practice: ${d.topic.name}`.slice(0, 160),
      instructions: `Answer all five questions on ${d.topic.name}. Show your working.`,
      questions: ['', '', '', '', ''],
      source: 'TEMPLATE',
    };
    if (!currentContext().permissions.has('ai.use') || !this.gateway.configuredProviders().length) return fallback;
    const weakSubs = d.subSkills.filter((s) => s.assessed && s.average !== null && s.average < 60).map((s) => s.name);
    try {
      const r = await this.gateway.generateJson(
        {
          tier: 'standard',
          system: 'You are an experienced Nigerian secondary school teacher writing short practice homework. British English; Nigerian names, places and naira where a context helps. No answers in the questions.',
          messages: [
            {
              role: 'user',
              content: [
                `Write exactly 5 practice questions on "${d.topic.name}"${d.topic.parent ? ` (${d.topic.parent})` : ''} in ${d.subject} for ${d.classLabel}, easiest first.`,
                d.topic.objectives.length ? `Objectives: ${d.topic.objectives.slice(0, 5).join('; ')}.` : '',
                weakSubs.length ? `Focus on the weak sub-skills: ${weakSubs.join(', ')}.` : '',
                d.assessed ? `${d.struggling.length} of ${d.assessed} students are below 50% on this topic, so start gently.` : '',
                'Each question must be answerable in a few lines in an exercise book.',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          maxOutputTokens: 900,
        },
        aiPracticeSetSchema,
        'class-insights-practice',
      );
      const questions = r.data.questions.map((q) => q.trim()).filter((q) => q.length >= 2).slice(0, 5);
      if (!questions.length) return fallback;
      return { title: (r.data.title.trim() || fallback.title).slice(0, 160), instructions: (r.data.instructions.trim() || fallback.instructions).slice(0, 3000), questions, source: 'AI' };
    } catch (err) {
      this.logger.warn(`AI practice draft unavailable: ${(err as Error).message}`);
      return fallback;
    }
  }

  /** Saves the practice set as a DRAFT homework linked to the topic; the teacher finishes and publishes it in Homework. */
  async practiceHomework(body: PracticeHomeworkInput): Promise<{ id: string }> {
    const { arm, subject, label, key, scope } = await this.mustView(body.classArmId, body.subjectId);
    await this.features.assert(currentTenantId(), 'live_classes');
    const t = await this.prisma.root.syllabusTopic.findUnique({ where: { id: body.topicId } });
    if (!t || t.subject !== key) throw new BadRequestException('That topic is not part of this subject');
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { timezone: true } });
    if (body.dueDate < schoolNow(tenant.timezone).date) throw new BadRequestException('The due date has passed');
    const h = await this.prisma.db.homework.create({
      data: {
        tenantId: currentTenantId(),
        classArmId: arm.id,
        subjectId: subject.id,
        topicId: t.id,
        teacherId: scope.staffId,
        title: body.title,
        instructions: body.instructions,
        questions: body.questions,
        kind: 'QUESTIONS',
        submissionTypes: ['TEXT', 'IMAGE'],
        // Marked out of a total, so marked work counts as mastery evidence for the topic.
        maxScore: body.questions.length * 2,
        dueDate: parseDate(body.dueDate),
        status: 'DRAFT',
        createdById: currentContext().userId,
      },
    });
    await this.audit.log({ action: 'homework.created', entityType: 'Homework', entityId: h.id, summary: `Drafted practice homework "${h.title}" on ${t.name} for ${label} (from class insights)` });
    return { id: h.id };
  }

  // ---------------------------------------------------------- dashboard card

  /** For each class and subject the signed-in teacher teaches: the topic most students are struggling with. */
  async mine(): Promise<MyClassInsights> {
    const s = await this.scope();
    if (!s.teaches.size) return { items: [] };
    const pairs = [...s.teaches].map((k) => {
      const [classArmId, subjectId] = k.split('|');
      return { classArmId, subjectId };
    });
    const db = this.prisma.db;
    const [arms, subjects] = await Promise.all([
      db.classArm.findMany({ where: { id: { in: pairs.map((p) => p.classArmId) } }, include: { classLevel: true } }),
      db.subject.findMany({ where: { id: { in: pairs.map((p) => p.subjectId) } } }),
    ]);
    const students = await db.student.findMany({ where: { classArmId: { in: arms.map((a) => a.id) }, status: 'ACTIVE' }, select: { id: true, classArmId: true } });
    const keys = [...new Set(subjects.map((x) => subjectKey(x.name)))];
    const records = students.length
      ? await db.masteryRecord.findMany({ where: { studentId: { in: students.map((x) => x.id) }, topic: { subject: { in: keys } } }, select: { studentId: true, score: true, topic: { select: { id: true, name: true, subject: true } } } })
      : [];
    const armOf = new Map(students.map((x) => [x.id, x.classArmId]));
    const items: MyClassInsights['items'] = [];
    for (const p of pairs) {
      const arm = arms.find((a) => a.id === p.classArmId);
      const subject = subjects.find((x) => x.id === p.subjectId);
      if (!arm || !subject) continue;
      const key = subjectKey(subject.name);
      const mine = records.filter((r) => r.topic.subject === key && armOf.get(r.studentId) === arm.id);
      const byTopic = new Map<string, { name: string; scores: number[] }>();
      for (const r of mine) {
        const t = byTopic.get(r.topic.id) ?? { name: r.topic.name, scores: [] };
        t.scores.push(r.score);
        byTopic.set(r.topic.id, t);
      }
      const ranked = [...byTopic.entries()]
        .map(([id, t]) => ({ id, name: t.name, assessed: t.scores.length, struggling: t.scores.filter((x) => x < STRUGGLING_BELOW).length, average: mean(t.scores) }))
        .filter((t) => t.struggling > 0 && t.assessed >= 2)
        .sort((a, b) => b.struggling / b.assessed - a.struggling / a.assessed || b.struggling - a.struggling);
      items.push({
        classArmId: arm.id,
        classLabel: `${arm.classLevel.name} ${arm.name}`,
        subjectId: subject.id,
        subject: subject.name,
        assessed: new Set(mine.map((r) => r.studentId)).size,
        topic: ranked[0] ?? null,
      });
    }
    items.sort((a, b) => (b.topic ? b.topic.struggling / b.topic.assessed : -1) - (a.topic ? a.topic.struggling / a.topic.assessed : -1) || a.classLabel.localeCompare(b.classLabel));
    return { items };
  }

  // ---------------------------------------------------------- assistants

  /**
   * For the School / Teacher AI tool: hardest topics and struggling students
   * in the given class arms (one subject, or every subject with evidence),
   * limited to what the caller may see.
   */
  async forAgent(armIds: string[], subjectName?: string) {
    const s = await this.scope();
    const db = this.prisma.db;
    const arms = await db.classArm.findMany({
      where: { id: { in: armIds } },
      include: { classLevel: true, subjects: { include: { subject: true } } },
      orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }],
    });
    const wanted = subjectName ? subjectKey(subjectName) : null;
    const targets = arms.flatMap((a) =>
      a.subjects
        .filter((cs) => (!wanted || subjectKey(cs.subject.name) === wanted) && this.canView(s, a.id, cs.subjectId))
        .map((cs) => ({ arm: a, subject: cs.subject, label: `${a.classLevel.name} ${a.name}`, level: levelOf(a.classLevel.stage, a.classLevel.name), key: subjectKey(cs.subject.name) })),
    );
    if (!targets.length) {
      const anyTaught = arms.some((a) => a.subjects.some((cs) => !wanted || subjectKey(cs.subject.name) === wanted));
      if (anyTaught) throw new ForbiddenException('You can only see topic mastery for the classes and subjects you teach.');
      throw new NotFoundException(subjectName ? `No class here takes ${subjectName}.` : 'No subjects are set up for that class.');
    }
    const classes: Record<string, unknown>[] = [];
    const noEvidence: string[] = [];
    const across = new Map<string, { topic: string; subject: string; scores: number[] }>();
    for (const t of targets.slice(0, 24)) {
      const m = await this.build(t, false, false);
      if (!m.totals.withEvidence) {
        if (wanted) classes.push({ class: t.label, subject: t.subject.name, students: m.totals.students, note: 'No topic mastery evidence yet' });
        else noEvidence.push(`${t.label} ${t.subject.name}`);
        continue;
      }
      m.topics.forEach((tp, j) => {
        const k = `${m.subject.key}|${tp.name.toLowerCase()}`;
        const a = across.get(k) ?? { topic: tp.name, subject: m.subject.name, scores: [] };
        for (const row of m.cells) if (row[j]) a.scores.push(row[j]!.score);
        across.set(k, a);
      });
      classes.push({
        class: m.class.label,
        subject: m.subject.name,
        students: m.totals.students,
        studentsWithEvidence: m.totals.withEvidence,
        classAverage: m.totals.average,
        hardestTopics: m.insights.strugglingTopics.map((x) => ({ topic: x.topic, average: x.average, belowFifty: x.struggling, assessed: x.assessed })),
        strugglingStudents: m.insights.needSupport.slice(0, 10).map((x) => ({ name: x.name, overall: x.overall, lowTopics: x.topics })),
        lowestStudents: m.students
          .filter((x) => x.overall !== null && x.overall < STRUGGLING_BELOW)
          .sort((a, b) => a.overall! - b.overall!)
          .slice(0, 10)
          .map((x) => ({ name: x.name, overall: x.overall, topicsAssessed: x.assessed })),
        improving: m.insights.improving.map((x) => ({ topic: x.topic, change: x.change })),
      });
    }
    const hardestAcross = [...across.values()]
      .filter((a) => a.scores.length >= 2)
      .map((a) => ({ subject: a.subject, topic: a.topic, average: mean(a.scores), assessed: a.scores.length, belowFifty: a.scores.filter((x) => x < STRUGGLING_BELOW).length }))
      .sort((a, b) => b.belowFifty / b.assessed - a.belowFifty / a.assessed || (a.average ?? 0) - (b.average ?? 0))
      .slice(0, 10);
    return {
      note: 'Topic mastery (0–100) from practice, tutor, quizzes, homework and online exams; separate from official results. "belowFifty" = students under 50%.',
      hardestTopicsAcrossClasses: hardestAcross,
      classes,
      ...(noEvidence.length ? { noEvidenceYet: noEvidence } : {}),
    };
  }
}
