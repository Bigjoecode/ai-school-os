import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EXAM_LABELS,
  FREE_LABS_PER_TERM,
  SEED_MAX,
  SIMULATORS,
  SIMULATOR_STATE_SCHEMAS,
  isSimulatorId,
  rubricTotal,
  type CriterionScore,
  type PracticalAttemptView,
  type PracticalCheckResult,
  type PracticalContent,
  type PracticalExam,
  type PracticalLabAttemptRow,
  type PracticalLessonView,
  type PracticalListItem,
  type PracticalMode,
  type PracticalResult,
  type PracticalStatus,
  type PracticalSubjectRow,
  type PracticalSubjectView,
  type SimulatorId,
  type SimulatorState,
} from '@aischool/shared';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { MasteryService, subjectKey } from '../learning/mastery.service';
import { StudyService } from '../learning/study.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedAccess } from '../student-ai/entitlements.service';
import { graderFor, type GraderOutput } from './graders';
import { keywordMarks } from './graders/helpers';

/** A timed (EXAM) lab may still be handed in this long after its clock; after that the saved state is marked. */
export const LAB_GRACE_MS = 2 * 60_000;
/** Quick checks passed at this fraction count as "learned". */
const CHECK_PASS = 0.6;
/** A lab weighs in topic mastery like this many questions. */
const LAB_MASTERY_WEIGHT = 5;
const MAX_STATE_BYTES = 200_000;

const aiMarkSchema = z.object({
  marks: z.array(
    z.object({
      criterion: z.string().describe('The criterion id, as given'),
      awarded: z.number().describe('Marks awarded, from 0 to the criterion maximum (halves allowed)'),
      note: z.string().describe('One sentence: what earned the mark or what was missing'),
    }),
  ),
  feedback: z.string().describe('Three or four sentences of feedback on the whole lab: what went well, the marks lost and how to get them next time'),
});

export type LessonRow = Prisma.PracticalLessonGetPayload<{ include: { topic: { select: { name: true; parent: { select: { name: true } } } } } }>;
type AttemptRow = Prisma.PracticalAttemptGetPayload<object>;
export interface StoredOverride {
  score: number;
  note: string;
  byUserId: string;
  by: string;
  at: string;
}

export const lessonData = (l: { data: Prisma.JsonValue }) => l.data as unknown as PracticalContent & { practicalPaper?: string };
/** The score that counts: a teacher's review, else the marked score. */
export const effectiveScore = (a: { score: number | null; override: Prisma.JsonValue | null }) => (a.override as StoredOverride | null)?.score ?? a.score;
export const percentOf = (score: number | null, max: number) => (score !== null && max ? Math.round((score / max) * 100) : null);

/**
 * WAEC Practical Academy for students: lessons by subject and topic, quick
 * checks, and virtual labs. A lab's variant comes from a server-chosen seed;
 * the web and the API derive its hidden values with the same shared function,
 * so the server can mark exactly. AUTO criteria are marked by the simulator's
 * grader; AI criteria (written observations, precautions) by one AI request on
 * the student's allowance, with a keyword stand-in when AI can't run.
 */
@Injectable()
export class PracticalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly study: StudyService,
    private readonly mastery: MasteryService,
  ) {}

  private lessonInclude = { topic: { select: { name: true, parent: { select: { name: true } } } } } as const;

  async lessons(where: Prisma.PracticalLessonWhereInput = {}): Promise<LessonRow[]> {
    return this.prisma.root.practicalLesson.findMany({ where, include: this.lessonInclude, orderBy: [{ subject: 'asc' }, { file: 'asc' }, { order: 'asc' }] });
  }

  async lesson(id: string): Promise<LessonRow> {
    const l = await this.prisma.root.practicalLesson.findUnique({ where: { id }, include: this.lessonInclude });
    if (!l) throw new NotFoundException('Practical not found');
    return l;
  }

  /** Per practical: learned (quick checks passed or a lab handed in), how often practised, best lab percent. */
  async statuses(studentId: string, subject?: string): Promise<Map<string, PracticalStatus>> {
    const attempts = await this.prisma.root.practicalAttempt.findMany({ where: { studentId, submittedAt: { not: null } }, select: { practicalId: true, mode: true, score: true, maxScore: true, override: true } });
    const out = new Map<string, PracticalStatus>();
    const get = (id: string) => out.get(id) ?? out.set(id, { learned: false, practised: 0, best: null }).get(id)!;
    for (const a of attempts) {
      const s = get(a.practicalId);
      const pct = percentOf(effectiveScore(a), a.maxScore);
      if (a.mode === 'CHECK') {
        if (pct !== null && pct >= CHECK_PASS * 100) s.learned = true;
        continue;
      }
      s.learned = true;
      s.practised++;
      if (pct !== null) s.best = Math.max(s.best ?? 0, pct);
    }
    // Practical-question practice on a lesson's topic counts as practice too.
    if (subject) {
      const lessons = await this.prisma.root.practicalLesson.findMany({ where: { subject, topicId: { not: null } }, select: { id: true, topicId: true } });
      const practice = await this.prisma.root.practiceAttempt.groupBy({ by: ['topicId'], where: { studentId, mode: 'THEORY', subject, submittedAt: { not: null }, topicId: { in: lessons.map((l) => l.topicId!) } }, _count: { _all: true } });
      for (const p of practice) for (const l of lessons.filter((x) => x.topicId === p.topicId)) get(l.id).practised += p._count._all;
    }
    return out;
  }

  private listItem(l: LessonRow, status: PracticalStatus | undefined): PracticalListItem {
    const d = lessonData(l);
    return {
      id: l.id,
      title: l.title,
      topic: l.topic?.name ?? l.topicName,
      topicId: l.topicId,
      parentTopic: l.topic?.parent?.name ?? null,
      kind: l.kind as PracticalListItem['kind'],
      skills: d.skills ?? [],
      simulator: isSimulatorId(l.simulator) ? l.simulator : null,
      status: status ?? { learned: false, practised: 0, best: null },
    };
  }

  // ---------------------------------------------------------- hub, subject, lesson

  async subjects(access: ResolvedAccess): Promise<PracticalSubjectRow[]> {
    const rows = await this.prisma.root.practicalLesson.findMany({ select: { id: true, exam: true, subject: true, simulator: true, data: true }, orderBy: [{ subject: 'asc' }] });
    const status = await this.statuses(access.studentId);
    const by = new Map<string, PracticalSubjectRow>();
    for (const r of rows) {
      const k = `${r.exam}|${r.subject}`;
      const row = by.get(k) ?? { exam: r.exam as PracticalExam, subject: r.subject, practicalPaper: lessonData(r).practicalPaper ?? '', practicals: 0, labs: 0, learned: 0, practised: 0 };
      row.practicals++;
      if (isSimulatorId(r.simulator)) row.labs++;
      const s = status.get(r.id);
      if (s?.learned) row.learned++;
      if (s?.practised) row.practised++;
      by.set(k, row);
    }
    return [...by.values()];
  }

  async subject(access: ResolvedAccess, name: string): Promise<PracticalSubjectView> {
    const subject = subjectKey(name);
    const lessons = await this.lessons({ subject });
    if (!lessons.length) throw new NotFoundException(`There are no practicals for ${subject} yet`);
    const exam = lessons[0]!.exam as PracticalExam;
    const status = await this.statuses(access.studentId, subject);
    const practicalQuestions = await this.prisma.root.examQuestion.count({ where: { exam, subject, status: 'PUBLISHED', type: 'PRACTICAL' } });
    return {
      exam,
      subject,
      practicalPaper: lessonData(lessons[0]!).practicalPaper ?? '',
      practicals: lessons.map((l) => this.listItem(l, status.get(l.id))),
      practicalQuestions,
      entitled: access.exams.includes(exam),
    };
  }

  /** Free practice-mode labs used this term (without the exam's Prep). */
  private async freeLabsUsed(access: ResolvedAccess) {
    return this.prisma.root.practicalAttempt.count({ where: { studentId: access.studentId, mode: 'LAB', startedAt: { gte: new Date(access.windowStart) } } });
  }

  async lessonView(access: ResolvedAccess, id: string): Promise<PracticalLessonView> {
    const l = await this.lesson(id);
    const d = lessonData(l);
    const exam = l.exam as PracticalExam;
    const sim = isSimulatorId(l.simulator) ? SIMULATORS[l.simulator] : null;
    // A topic's practical questions take in its subtopics.
    const topicIds = l.topicId ? [l.topicId, ...(await this.prisma.root.syllabusTopic.findMany({ where: { parentId: l.topicId }, select: { id: true } })).map((t) => t.id)] : [];
    const [topicQs, subjectQs, years, attempts, status] = await Promise.all([
      topicIds.length ? this.prisma.root.examQuestion.count({ where: { exam, subject: l.subject, status: 'PUBLISHED', type: 'PRACTICAL', topicId: { in: topicIds } } }) : 0,
      this.prisma.root.examQuestion.count({ where: { exam, subject: l.subject, status: 'PUBLISHED', type: 'PRACTICAL' } }),
      topicIds.length ? this.prisma.root.examQuestion.findMany({ where: { exam, subject: l.subject, status: 'PUBLISHED', type: 'PRACTICAL', source: 'LICENSED', year: { not: null }, topicId: { in: topicIds } }, select: { year: true }, distinct: ['year'], orderBy: { year: 'desc' } }) : [],
      this.prisma.root.practicalAttempt.findMany({ where: { studentId: access.studentId, practicalId: id, mode: { in: ['LAB', 'EXAM'] } }, orderBy: { startedAt: 'desc' }, take: 20 }),
      this.statuses(access.studentId, l.subject),
    ]);
    const entitled = access.exams.includes(exam);
    return {
      ...d,
      exam,
      subject: l.subject,
      practicalPaper: d.practicalPaper ?? '',
      topic: l.topic?.name ?? l.topicName,
      topicId: l.topicId,
      parentTopic: l.topic?.parent?.name ?? null,
      simulator: sim ? sim.id : null,
      checkQuestions: (d.checkQuestions ?? []).map((c) => ({ q: c.q, options: c.options })),
      practicalQuestions: { topic: topicQs, subject: subjectQs, pastYears: years.map((y) => y.year!).filter(Boolean) },
      lab: sim ? { ...sim, maxScore: rubricTotal(sim.rubric) } : null,
      attempts: attempts.map((a) => this.row(a, l.title)),
      status: status.get(id) ?? { learned: false, practised: 0, best: null },
      access: { entitled, freeLabsLeft: entitled ? FREE_LABS_PER_TERM : Math.max(0, FREE_LABS_PER_TERM - (await this.freeLabsUsed(access))), freeLabsPerTerm: FREE_LABS_PER_TERM },
    };
  }

  row(a: AttemptRow, title: string): PracticalLabAttemptRow {
    const score = effectiveScore(a);
    return {
      id: a.id,
      practicalId: a.practicalId,
      title,
      simulatorId: isSimulatorId(a.simulatorId) ? a.simulatorId : null,
      mode: a.mode as PracticalMode,
      startedAt: a.startedAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
      score: a.submittedAt ? score : null,
      maxScore: a.maxScore,
      percent: a.submittedAt ? percentOf(score, a.maxScore) : null,
      reviewed: !!a.override,
    };
  }

  // ---------------------------------------------------------- quick checks

  async check(access: ResolvedAccess, id: string, answers: number[]): Promise<PracticalCheckResult> {
    const l = await this.lesson(id);
    const checks = lessonData(l).checkQuestions ?? [];
    if (!checks.length) throw new BadRequestException('This practical has no quick check questions');
    const items = checks.map((c, i) => ({ correct: answers[i] === c.answer, answer: c.answer, explanation: c.explanation }));
    const correct = items.filter((x) => x.correct).length;
    await this.prisma.root.practicalAttempt.create({
      data: { tenantId: access.tenantId, studentId: access.studentId, practicalId: id, seed: 0, mode: 'CHECK', state: { answers } as Prisma.InputJsonValue, score: correct, maxScore: checks.length, submittedAt: new Date() },
    });
    if (l.topicId) await this.mastery.record(access.tenantId, access.studentId, l.topicId, correct, checks.length, { source: 'PRACTICE', sourceId: id }).catch(() => undefined);
    return { correct, total: checks.length, passed: correct >= CHECK_PASS * checks.length, items };
  }

  // ---------------------------------------------------------- virtual labs

  /**
   * Opens a lab. EXAM mode (timed) needs the exam's Prep; practice mode is
   * free FREE_LABS_PER_TERM times a term without it. An unfinished attempt of
   * the same practical and mode is resumed rather than re-rolled.
   */
  async startLab(access: ResolvedAccess, input: { practicalId: string; mode: PracticalMode }) {
    const l = await this.lesson(input.practicalId);
    if (!isSimulatorId(l.simulator)) throw new BadRequestException('This practical has no virtual lab yet');
    const spec = SIMULATORS[l.simulator];
    const exam = l.exam as PracticalExam;
    const entitled = access.exams.includes(exam);
    const open = await this.prisma.root.practicalAttempt.findFirst({ where: { studentId: access.studentId, practicalId: l.id, mode: input.mode, submittedAt: null }, orderBy: { startedAt: 'desc' } });
    if (open && (!open.endsAt || Date.now() <= open.endsAt.getTime() + LAB_GRACE_MS)) return this.view(open, l);
    if (open) await this.settle(access, open);
    if (input.mode === 'EXAM' && !entitled) throw new ForbiddenException({ statusCode: 403, code: 'EXAM_NOT_INCLUDED', exam, message: `Timed practical exams come with ${EXAM_LABELS[exam]} Prep.` });
    if (input.mode === 'LAB' && !entitled && (await this.freeLabsUsed(access)) >= FREE_LABS_PER_TERM) {
      throw new ForbiddenException({ statusCode: 403, code: 'EXAM_NOT_INCLUDED', exam, message: `You've used this term's ${FREE_LABS_PER_TERM} free virtual labs. ${EXAM_LABELS[exam]} Prep unlocks unlimited labs and timed practical exams.` });
    }
    const now = new Date();
    const a = await this.prisma.root.practicalAttempt.create({
      data: {
        tenantId: access.tenantId,
        studentId: access.studentId,
        practicalId: l.id,
        simulatorId: spec.id,
        seed: randomInt(1, SEED_MAX),
        mode: input.mode,
        state: {},
        maxScore: rubricTotal(spec.rubric),
        startedAt: now,
        endsAt: input.mode === 'EXAM' ? new Date(now.getTime() + spec.minutes * 60_000) : null,
      },
    });
    return this.view(a, l);
  }

  private async own(studentId: string, id: string) {
    const a = await this.prisma.root.practicalAttempt.findFirst({ where: { id, studentId, mode: { in: ['LAB', 'EXAM'] } } });
    if (!a) throw new NotFoundException('Lab attempt not found');
    return a;
  }

  /** A timed lab left past its clock and grace is marked from its saved state. */
  private async settle(access: ResolvedAccess, a: AttemptRow): Promise<AttemptRow> {
    if (a.submittedAt || !a.endsAt || Date.now() <= a.endsAt.getTime() + LAB_GRACE_MS) return a;
    try {
      return await this.mark(access, a, a.state);
    } catch {
      return a;
    }
  }

  async attempt(access: ResolvedAccess, id: string): Promise<PracticalAttemptView> {
    const a = await this.settle(access, await this.own(access.studentId, id));
    return this.view(a, await this.lesson(a.practicalId).catch(() => null));
  }

  async saveDraft(access: ResolvedAccess, id: string, state: Record<string, unknown>) {
    const a = await this.own(access.studentId, id);
    if (a.submittedAt) throw new BadRequestException('This lab is already marked');
    if (a.endsAt && Date.now() > a.endsAt.getTime() + LAB_GRACE_MS) throw new BadRequestException('Time is up for this lab: what was saved before the end will be marked');
    if (JSON.stringify(state).length > MAX_STATE_BYTES) throw new BadRequestException('This lab record is too large to save');
    await this.prisma.root.practicalAttempt.updateMany({ where: { id, submittedAt: null }, data: { state: state as Prisma.InputJsonValue } });
    return { ok: true };
  }

  async submit(access: ResolvedAccess, id: string, state: Record<string, unknown>): Promise<PracticalAttemptView> {
    let a = await this.own(access.studentId, id);
    if (!a.submittedAt) {
      const late = !!a.endsAt && Date.now() > a.endsAt.getTime() + LAB_GRACE_MS;
      if (JSON.stringify(state).length > MAX_STATE_BYTES) throw new BadRequestException('This lab record is too large to mark');
      a = await this.mark(access, a, late ? a.state : state);
    }
    return this.view(a, await this.lesson(a.practicalId).catch(() => null));
  }

  /** Validates the state against the simulator's schema (an unreadable state is marked as empty work). */
  parseState(simulatorId: SimulatorId, raw: unknown): SimulatorState | null {
    const r = SIMULATOR_STATE_SCHEMAS[simulatorId].safeParse(raw);
    return r.success ? (r.data as SimulatorState) : null;
  }

  /** The grader's exact output for an attempt's state (also used to show the worked solution). */
  graded(simulatorId: SimulatorId, state: SimulatorState, seed: number): GraderOutput {
    return graderFor(simulatorId).grade(state as never, seed);
  }

  /**
   * Marks a lab: AUTO criteria from the grader; AI criteria in one AI request
   * (answered items only, on the student's allowance), else the keyword
   * stand-in. Records topic mastery once.
   */
  private async mark(access: ResolvedAccess, a: AttemptRow, rawState: unknown): Promise<AttemptRow> {
    if (!isSimulatorId(a.simulatorId)) throw new BadRequestException('This attempt has no virtual lab');
    const spec = SIMULATORS[a.simulatorId];
    const state = this.parseState(a.simulatorId, rawState);
    if (!state) throw new BadRequestException('This lab record could not be read: refresh the page and try again');
    const out = this.graded(a.simulatorId, state, a.seed);
    const answered = out.ai.filter((x) => x.answer.trim());
    const aiScores = new Map<string, CriterionScore>();
    let feedback: string | null = null;
    if (answered.length) {
      try {
        const res = await this.study.withAllowance(access, {}, (tier) =>
          this.gateway.generateJson(
            {
              tier,
              system:
                'You are an experienced WAEC practical examiner. Mark each written answer strictly against its guide: award marks only for points the answer actually makes (equivalent wording and spelling slips are fine). Never re-mark numbers or readings: they are already marked. Then write brief feedback on the whole lab from the facts given. British English, encouraging and specific.',
              messages: [
                {
                  role: 'user',
                  content: [
                    `LAB: ${spec.title}`,
                    ...answered.map((x) => {
                      const c = spec.rubric.find((r) => r.id === x.criterionId)!;
                      return `CRITERION ${x.criterionId} (max ${c.marks}): ${c.label}\nQUESTION: ${x.question}\nGUIDE: ${x.guide ?? c.guide}\nSTUDENT'S ANSWER: ${x.answer.slice(0, 1500)}`;
                    }),
                    'FACTS:',
                    ...out.facts,
                    'MARKS ALREADY GIVEN (exact):',
                    ...out.auto.map((s) => `- ${s.label}: ${s.awarded}/${s.max}. ${s.note}`),
                  ].join('\n\n'),
                },
              ],
              maxOutputTokens: 1200,
            },
            aiMarkSchema,
            'practical-lab-mark',
          ),
        );
        for (const x of answered) {
          const c = spec.rubric.find((r) => r.id === x.criterionId)!;
          const m = res.data.marks.find((r) => r.criterion === x.criterionId);
          if (m && Number.isFinite(m.awarded)) aiScores.set(x.criterionId, { id: c.id, label: c.label, awarded: Math.max(0, Math.min(c.marks, Math.round(m.awarded * 2) / 2)), max: c.marks, how: 'AI', note: m.note.trim() || 'Marked against the guide.' });
        }
        feedback = res.data.feedback.trim() || null;
      } catch {
        /* no allowance or no provider: the keyword stand-in below */
      }
    }
    const criteria: CriterionScore[] = spec.rubric.map((c) => {
      if (c.how === 'AUTO') return out.auto.find((s) => s.id === c.id) ?? { id: c.id, label: c.label, awarded: 0, max: c.marks, how: 'AUTO', note: 'Not marked.' };
      const item = out.ai.find((x) => x.criterionId === c.id);
      if (!item?.answer.trim()) return { id: c.id, label: c.label, awarded: 0, max: c.marks, how: 'AI', note: 'Not answered.' };
      const ai = aiScores.get(c.id);
      if (ai) return ai;
      const k = keywordMarks(item.answer, item.keywords, item.need, c.marks);
      return { id: c.id, label: c.label, awarded: k.awarded, max: c.marks, how: 'AI', note: `Marked automatically from key points (${k.found} found); your teacher can review it.` };
    });
    const score = criteria.reduce((t, c) => t + c.awarded, 0);
    const max = rubricTotal(spec.rubric);
    if (!feedback) {
      const lost = criteria.filter((c) => c.awarded < c.max);
      feedback = lost.length ? `You scored ${score}/${max}. Marks lost: ${lost.map((c) => `${c.label} (${c.awarded}/${c.max})`).join('; ')}. See each criterion below for how to earn them next time.` : `Full marks: ${score}/${max}. Well done.`;
    }
    const saved = await this.prisma.root.practicalAttempt.updateMany({
      where: { id: a.id, submittedAt: null },
      data: { state: state as unknown as Prisma.InputJsonValue, scores: criteria as unknown as Prisma.InputJsonValue, score, aiFeedback: feedback, submittedAt: new Date() },
    });
    if (saved.count) {
      const lesson = await this.prisma.root.practicalLesson.findUnique({ where: { id: a.practicalId }, select: { topicId: true } });
      if (lesson?.topicId) await this.mastery.record(a.tenantId, a.studentId, lesson.topicId, (score / max) * LAB_MASTERY_WEIGHT, LAB_MASTERY_WEIGHT, { source: 'PRACTICE', sourceId: a.id }).catch(() => undefined);
    }
    return this.prisma.root.practicalAttempt.findUniqueOrThrow({ where: { id: a.id } });
  }

  /** The next practical to do in the subject: the next unlearned one after this, else the next one. */
  private async next(studentId: string, l: { id: string; subject: string }) {
    const all = await this.prisma.root.practicalLesson.findMany({ where: { subject: l.subject }, select: { id: true, title: true, simulator: true }, orderBy: [{ file: 'asc' }, { order: 'asc' }] });
    const i = all.findIndex((x) => x.id === l.id);
    const after = [...all.slice(i + 1), ...all.slice(0, Math.max(0, i))];
    const status = await this.statuses(studentId);
    const pick = after.find((x) => !status.get(x.id)?.learned && isSimulatorId(x.simulator)) ?? after.find((x) => !status.get(x.id)?.learned) ?? after[0];
    return pick ? { id: pick.id, title: pick.title } : null;
  }

  /** The student's (or a teacher's) view of an attempt: the result only once marked. */
  async view(a: AttemptRow, l: Pick<LessonRow, 'id' | 'title' | 'subject' | 'topicName' | 'topic'> | null): Promise<PracticalAttemptView> {
    if (!isSimulatorId(a.simulatorId)) throw new BadRequestException('This attempt has no virtual lab');
    const spec = SIMULATORS[a.simulatorId];
    let result: PracticalResult | null = null;
    const state = a.state && typeof a.state === 'object' && Object.keys(a.state).length ? this.parseState(a.simulatorId, a.state) : null;
    if (a.submittedAt) {
      const criteria = (a.scores as unknown as CriterionScore[] | null) ?? [];
      const marked = criteria.reduce((t, c) => t + c.awarded, 0);
      const o = a.override as StoredOverride | null;
      const score = o?.score ?? a.score ?? marked;
      result = {
        score,
        maxScore: a.maxScore,
        percent: percentOf(score, a.maxScore) ?? 0,
        markedScore: marked,
        criteria,
        feedback: a.aiFeedback,
        solution: state ? this.graded(a.simulatorId, state, a.seed).solution : [],
        review: o ? { score: o.score, note: o.note, by: o.by, at: o.at } : null,
        next: l ? await this.next(a.studentId, l) : null,
      };
    }
    return {
      id: a.id,
      practicalId: a.practicalId,
      title: l?.title ?? spec.title,
      subject: l?.subject ?? spec.subject,
      topic: l ? (l.topic?.name ?? l.topicName) : null,
      simulatorId: a.simulatorId,
      spec,
      mode: a.mode as PracticalMode,
      seed: a.seed,
      state,
      startedAt: a.startedAt.toISOString(),
      endsAt: a.endsAt?.toISOString() ?? null,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      result,
    };
  }
}
