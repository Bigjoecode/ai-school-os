import { Injectable, Logger } from '@nestjs/common';
import { EVIDENCE_SOURCE_LABELS, OBJECTIVE_TYPES, type QuestionType, type EvidenceSource, type MasteryEvidenceRow, type SchoolEvidenceBackfill } from '@aischool/shared';
// Types only: cbt.service imports this file, so its helpers aren't imported here at runtime.
import type { Layout, StoredAnswers } from '../cbt/cbt.service';
import { PrismaService } from '../prisma/prisma.service';
import { MasteryService, levelOf, subjectKey, type SyllabusLevel } from './mastery.service';

/** Question-bank "topics" that don't name a topic. */
const NOT_A_TOPIC = /^(general|misc(ellaneous)?|mixed|revision|others?|various|all( topics)?|n\/?a|none|test|exam|-+)$/i;

/**
 * School work feeding the learning graph: a marked online exam (CBT) gives
 * evidence for each topic its questions cover; marked homework gives evidence
 * for the topic the teacher chose. Each piece of work replaces its own earlier
 * evidence (see MasteryService.replaceEvidence), so re-marking, re-grading and
 * the backfill can run any number of times. Score sheets (CA/exam totals per
 * subject) have no topic breakdown and are never turned into topic evidence.
 */
@Injectable()
export class SchoolEvidenceService {
  private readonly logger = new Logger(SchoolEvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mastery: MasteryService,
  ) {}

  /** Never lets mastery bookkeeping break marking: failures are logged. */
  private async safely(what: string, fn: () => Promise<boolean>) {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Couldn't update mastery from ${what}: ${(err as Error).message}`);
      return false;
    }
  }

  // ---------------------------------------------------------- CBT

  /** A CBT attempt's evidence: per topic, marks earned out of marks available — none until it is fully MARKED. */
  syncCbtAttempt(attemptId: string) {
    return this.safely(`CBT attempt ${attemptId}`, async () => {
      const db = this.prisma.root;
      const a = await db.onlineExamAttempt.findUnique({ where: { id: attemptId }, include: { exam: { select: { paperId: true } } } });
      if (!a) return false;
      if (a.status !== 'MARKED') return this.mastery.replaceEvidence(a.tenantId, a.studentId, 'CBT', a.id, []);
      const paper = await db.examPaper.findUnique({ where: { id: a.exam.paperId }, select: { subject: { select: { name: true } }, classLevel: { select: { stage: true, name: true } } } });
      const layout = a.layout as unknown as Layout;
      const questions = await db.question.findMany({ where: { id: { in: layout.items.map((i) => i.id) } }, select: { id: true, topic: true } });
      const topicOf = new Map(questions.map((q) => [q.id, q.topic.trim().replace(/\s+/g, ' ')]));
      const answers = (a.answers ?? {}) as unknown as StoredAnswers;
      const theory = (a.theoryMarks ?? {}) as unknown as Record<string, number>;
      // Marks per question-bank topic.
      const byName = new Map<string, { correct: number; total: number }>();
      for (const item of layout.items) {
        const name = topicOf.get(item.id);
        if (!name || name.length < 3 || NOT_A_TOPIC.test(name) || item.marks <= 0) continue;
        const earned = OBJECTIVE_TYPES.includes(item.type as QuestionType) ? (item.correct != null && answers[item.id] === item.correct ? item.marks : 0) : (theory[item.id] ?? 0);
        const t = byName.get(name.toLowerCase()) ?? { correct: 0, total: 0 };
        byName.set(name.toLowerCase(), { correct: t.correct + earned, total: t.total + item.marks });
      }
      const items = paper ? await this.toTopics(a.studentId, paper.subject.name, [...byName.entries()].map(([name, m]) => ({ name, ...m })), paper.classLevel) : [];
      return this.mastery.replaceEvidence(a.tenantId, a.studentId, 'CBT', a.id, items);
    });
  }

  /** Question-bank topic names → syllabus topics for the student's level (unknown names are skipped, never created). */
  private async toTopics(studentId: string, subject: string, marks: { name: string; correct: number; total: number }[], paperLevel: { stage: string | null; name: string }) {
    if (!marks.length) return [];
    const student = await this.prisma.root.student.findUnique({ where: { id: studentId }, select: { classArmId: true } });
    const level: SyllabusLevel = student?.classArmId ? await this.mastery.studentLevel(studentId) : levelOf(paperLevel.stage, paperLevel.name);
    const byTopic = new Map<string, { topicId: string; correct: number; total: number }>();
    for (const m of marks) {
      const topic = await this.mastery.findTopic(level, subject, m.name);
      if (!topic) continue;
      const t = byTopic.get(topic.id) ?? { topicId: topic.id, correct: 0, total: 0 };
      byTopic.set(topic.id, { topicId: topic.id, correct: Math.round((t.correct + m.correct) * 100) / 100, total: t.total + m.total });
    }
    return [...byTopic.values()];
  }

  // ---------------------------------------------------------- homework

  /** A hand-in's evidence: score out of the maximum, for the homework's topic, once it is GRADED. */
  syncHomeworkSubmission(submissionId: string) {
    return this.safely(`homework submission ${submissionId}`, async () => {
      const s = await this.prisma.root.homeworkSubmission.findUnique({ where: { id: submissionId }, include: { homework: { select: { topicId: true, maxScore: true } } } });
      if (!s) return false;
      const h = s.homework;
      const counts = s.status === 'GRADED' && s.score != null && !!h.topicId && !!h.maxScore && h.maxScore > 0;
      const items = counts ? [{ topicId: h.topicId!, correct: Math.min(s.score!, h.maxScore!), total: h.maxScore! }] : [];
      return this.mastery.replaceEvidence(s.tenantId, s.studentId, 'HOMEWORK', s.id, items);
    });
  }

  /** After the homework's topic or maximum changes. */
  async syncHomework(homeworkId: string) {
    const subs = await this.prisma.root.homeworkSubmission.findMany({ where: { homeworkId }, select: { id: true } });
    for (const s of subs) await this.syncHomeworkSubmission(s.id);
  }

  /** Before homework is deleted: its hand-ins stop counting. */
  async clearHomework(homeworkId: string) {
    const subs = await this.prisma.root.homeworkSubmission.findMany({ where: { homeworkId }, select: { id: true, tenantId: true, studentId: true } });
    for (const s of subs) await this.safely(`homework submission ${s.id}`, () => this.mastery.replaceEvidence(s.tenantId, s.studentId, 'HOMEWORK', s.id, []));
  }

  // ---------------------------------------------------------- backfill

  /** Replays marked CBT attempts and graded homework with a topic (one school, or all). Safe to run again. */
  async backfill(tenantId: string | null): Promise<SchoolEvidenceBackfill> {
    const where = tenantId ? { tenantId } : {};
    const attempts = await this.prisma.root.onlineExamAttempt.findMany({ where: { ...where, status: 'MARKED' }, select: { id: true }, orderBy: { submittedAt: 'asc' } });
    const subs = await this.prisma.root.homeworkSubmission.findMany({
      where: { ...where, status: 'GRADED', score: { not: null }, homework: { topicId: { not: null } } },
      select: { id: true },
      orderBy: { gradedAt: 'asc' },
    });
    let changed = 0;
    for (const a of attempts) if (await this.syncCbtAttempt(a.id)) changed++;
    for (const s of subs) if (await this.syncHomeworkSubmission(s.id)) changed++;
    return { cbtAttempts: attempts.length, homeworkSubmissions: subs.length, changed };
  }

  // ---------------------------------------------------------- reading

  /** Recent evidence for a student (one topic, or across topics), labelled by where it came from. */
  async recent(studentId: string, topicId?: string, limit = 20): Promise<MasteryEvidenceRow[]> {
    const rows = await this.prisma.root.masteryEvidence.findMany({
      where: { studentId, ...(topicId ? { topicId } : {}) },
      include: { topic: { select: { name: true, subject: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
    const ids = (s: string) => rows.filter((r) => r.source === s && r.sourceId).map((r) => r.sourceId!);
    const [attempts, subs, checkIns] = await Promise.all([
      ids('CBT').length ? this.prisma.root.onlineExamAttempt.findMany({ where: { id: { in: ids('CBT') } }, select: { id: true, exam: { select: { title: true } } } }) : [],
      ids('HOMEWORK').length ? this.prisma.root.homeworkSubmission.findMany({ where: { id: { in: ids('HOMEWORK') } }, select: { id: true, homework: { select: { title: true } } } }) : [],
      ids('CHECKIN').length ? this.prisma.root.checkInAttempt.findMany({ where: { id: { in: ids('CHECKIN') } }, select: { id: true, module: { select: { title: true } } } }) : [],
    ]);
    const titles = new Map<string, string>([...attempts.map((a) => [a.id, a.exam.title] as const), ...subs.map((s) => [s.id, s.homework.title] as const), ...checkIns.map((c) => [c.id, c.module.title] as const)]);
    return rows.map((r) => {
      const source = (r.source in EVIDENCE_SOURCE_LABELS ? r.source : 'PRACTICE') as EvidenceSource;
      return {
        id: r.id,
        topicId: r.topicId,
        topic: r.topic.name,
        subject: r.topic.subject,
        source,
        sourceLabel: EVIDENCE_SOURCE_LABELS[source],
        title: (r.sourceId && titles.get(r.sourceId)) || null,
        correct: r.correct,
        total: r.total,
        percent: r.total > 0 ? Math.round((100 * r.correct) / r.total) : 0,
        scoreAfter: r.scoreAfter,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /** Syllabus topics a teacher can pick for homework: the subject at the class's level (any level if none there). */
  async homeworkTopics(subjectName: string, stage: string | null, levelName: string) {
    const subject = subjectKey(subjectName);
    const level = levelOf(stage, levelName);
    const order = [{ order: 'asc' as const }, { name: 'asc' as const }];
    const atLevel = await this.prisma.root.syllabusTopic.findMany({ where: { subject, level }, orderBy: order });
    return atLevel.length ? atLevel : this.prisma.root.syllabusTopic.findMany({ where: { subject }, orderBy: [{ level: 'asc' }, ...order] });
  }
}
