import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Flashcard, FlashcardDeckRow, PracticeAttemptRow, PracticeAttemptView, PracticeQuestion, StudyPlanRow } from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { dateOnly } from '../common/format';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService, type ResolvedAccess } from '../student-ai/entitlements.service';
import { MasteryService, subjectKey } from './mastery.service';

/** A question as stored in an attempt: answers stay on the server until submission. */
export interface StoredQuestion {
  questionId?: string;
  stem: string;
  options: string[];
  answer: number;
  explanation: string | null;
  topicId: string | null;
  topic: string | null;
}

const MOCK_GRACE_MS = 2 * 60_000;
const LEITNER_DAYS = [0, 1, 2, 4, 7, 14];
const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);

const quizSchema = z.object({
  questions: z
    .array(
      z.object({
        stem: z.string().describe('The question, self-contained'),
        options: z.array(z.string()).describe('Exactly 4 options, without letters'),
        answer: z.number().int().describe('Index (0-3) of the correct option'),
        explanation: z.string().describe('One or two sentences on why it is right'),
      }),
    )
    .describe('Multiple-choice questions'),
});
const planSchema = z.object({
  title: z.string().describe('Short plan title'),
  items: z
    .array(z.object({ date: z.string().describe('YYYY-MM-DD'), subject: z.string(), topic: z.string(), activity: z.string().describe('What to do, concretely, e.g. "Do 10 factorisation questions, then check with the tutor"'), minutes: z.number().int() }))
    .describe('One to three activities per day'),
});
const cardsSchema = z.object({ cards: z.array(z.object({ front: z.string().describe('A question or term'), back: z.string().describe('A short, exact answer') })) });

/**
 * Practice sets, AI quizzes, timed mocks, study plans and flashcards. Every
 * graded answer is evidence for topic mastery; AI writes the content but
 * marking is exact (the answer key), never the model's opinion.
 */
@Injectable()
export class StudyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly entitlements: EntitlementService,
    private readonly mastery: MasteryService,
  ) {}

  /** Runs an AI request on the student's allowance: check, attribute the cost, count it on success. */
  async withAllowance<T>(access: ResolvedAccess, opts: { deep?: boolean; studyTool?: boolean; photos?: boolean }, run: (tier: 'standard' | 'advanced') => Promise<T>): Promise<T> {
    const { units, deep } = await this.entitlements.check(access, opts);
    this.entitlements.attribute(access);
    const result = await run(deep ? 'advanced' : 'standard');
    await this.entitlements.consume(access, units, deep);
    return result;
  }

  // ---------------------------------------------------------- attempts

  view(a: Prisma.PracticeAttemptGetPayload<object>): PracticeAttemptView {
    const qs = a.questions as unknown as StoredQuestion[];
    const answers = (a.answers as (number | null)[] | null) ?? [];
    const done = !!a.submittedAt;
    return {
      id: a.id,
      mode: a.mode as PracticeAttemptView['mode'],
      exam: a.exam as PracticeAttemptView['exam'],
      title: a.title,
      subject: a.subject,
      questions: qs.map((q, i): PracticeQuestion => ({
        index: i,
        stem: q.stem,
        options: q.options,
        topic: q.topic,
        chosen: answers[i] ?? null,
        ...(done ? { answer: q.answer, explanation: q.explanation, correct: answers[i] === q.answer } : {}),
      })),
      durationMinutes: a.durationMinutes,
      startedAt: a.startedAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
      endsAt: a.endsAt?.toISOString() ?? null,
      score: a.score,
      total: a.total,
      percent: a.score !== null && a.total ? Math.round((a.score / a.total) * 100) : null,
      perTopic: a.perTopic as PracticeAttemptView['perTopic'],
      review: a.review,
    };
  }

  row(a: Prisma.PracticeAttemptGetPayload<object>): PracticeAttemptRow {
    return {
      id: a.id,
      mode: a.mode as PracticeAttemptRow['mode'],
      exam: a.exam as PracticeAttemptRow['exam'],
      title: a.title,
      subject: a.subject,
      score: a.score,
      total: a.total,
      percent: a.score !== null && a.total ? Math.round((a.score / a.total) * 100) : null,
      startedAt: a.startedAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
    };
  }

  async createAttempt(access: ResolvedAccess, data: { mode: string; exam?: string | null; subject?: string | null; topicId?: string | null; title: string; questions: StoredQuestion[]; durationMinutes?: number | null }) {
    const now = new Date();
    return this.prisma.root.practiceAttempt.create({
      data: {
        tenantId: access.tenantId,
        studentId: access.studentId,
        mode: data.mode,
        exam: data.exam ?? null,
        subject: data.subject ?? null,
        topicId: data.topicId ?? null,
        title: data.title,
        questions: data.questions as unknown as Prisma.InputJsonValue,
        total: data.questions.length,
        durationMinutes: data.durationMinutes ?? null,
        endsAt: data.durationMinutes ? new Date(now.getTime() + data.durationMinutes * 60_000) : null,
      },
    });
  }

  async attempt(studentId: string, id: string) {
    let a = await this.prisma.root.practiceAttempt.findFirst({ where: { id, studentId } });
    if (!a) throw new NotFoundException('Attempt not found');
    // A timed mock left open past its time is marked with what was saved.
    if (!a.submittedAt && a.endsAt && Date.now() > a.endsAt.getTime() + MOCK_GRACE_MS) a = await this.grade(a, (a.answers as (number | null)[] | null) ?? []);
    return a;
  }

  async saveProgress(studentId: string, id: string, answers: (number | null)[]) {
    const a = await this.attempt(studentId, id);
    if (a.submittedAt) throw new BadRequestException('This attempt is already marked');
    await this.prisma.root.practiceAttempt.update({ where: { id }, data: { answers } });
    return { ok: true };
  }

  async submit(studentId: string, id: string, answers: (number | null)[]) {
    const a = await this.attempt(studentId, id);
    if (a.submittedAt) return a;
    return this.grade(a, answers);
  }

  /** Marks against the stored key, records topic evidence, and keeps the result. */
  private async grade(a: Prisma.PracticeAttemptGetPayload<object>, answers: (number | null)[]) {
    const qs = a.questions as unknown as StoredQuestion[];
    let score = 0;
    const topics = new Map<string, { topicId: string | null; topic: string; correct: number; total: number }>();
    qs.forEach((q, i) => {
      const ok = answers[i] === q.answer;
      if (ok) score++;
      const key = q.topicId ?? q.topic ?? 'General';
      const t = topics.get(key) ?? { topicId: q.topicId, topic: q.topic ?? 'General', correct: 0, total: 0 };
      t.total++;
      if (ok) t.correct++;
      topics.set(key, t);
    });
    const graded = await this.prisma.root.practiceAttempt.updateMany({
      where: { id: a.id, submittedAt: null },
      data: { answers, score, submittedAt: new Date(), perTopic: [...topics.values()].map(({ topic, correct, total }) => ({ topic, correct, total })) },
    });
    if (graded.count) {
      for (const t of topics.values()) {
        const topicId = t.topicId ?? (a.subject && t.topic !== 'General' ? (await this.mastery.topicFor(a.studentId, a.subject, t.topic)).id : null);
        if (topicId) await this.mastery.record(a.tenantId, a.studentId, topicId, t.correct, t.total);
      }
    }
    return this.prisma.root.practiceAttempt.findUniqueOrThrow({ where: { id: a.id } });
  }

  async attempts(studentId: string, take = 50) {
    return (await this.prisma.root.practiceAttempt.findMany({ where: { studentId }, orderBy: { startedAt: 'desc' }, take })).map((a) => this.row(a));
  }

  /** A short multiple-choice quiz on any topic (included in Basic). */
  async aiQuiz(access: ResolvedAccess, input: { subject: string; topic: string; questions: number }) {
    const subject = subjectKey(input.subject);
    const topic = await this.mastery.topicFor(access.studentId, subject, input.topic);
    const level = await this.mastery.studentLevel(access.studentId);
    const r = await this.withAllowance(access, {}, (tier) =>
      this.gateway.generateJson(
        {
          tier,
          system: `You write accurate multiple-choice practice questions for a Nigerian ${level.toLowerCase()} school student (${subject}, topic: ${topic.name}). Exactly 4 options each; vary which option is correct; no trick questions; British English; ₦ for money. Check every answer carefully.`,
          messages: [{ role: 'user', content: `Write ${input.questions} questions on ${topic.name}.` }],
          maxOutputTokens: 2500,
        },
        quizSchema,
        'tutor-quiz',
      ),
    );
    const questions: StoredQuestion[] = r.data.questions
      .filter((q) => q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length)
      .slice(0, input.questions)
      .map((q) => ({ stem: q.stem, options: q.options.slice(0, 5), answer: q.answer, explanation: q.explanation, topicId: topic.id, topic: topic.name }));
    if (!questions.length) throw new BadRequestException('The quiz could not be written. Please try again.');
    return this.createAttempt(access, { mode: 'AI_QUIZ', subject, topicId: topic.id, title: `${topic.name} quiz`, questions });
  }

  // ---------------------------------------------------------- study plans

  planRow(p: Prisma.StudyPlanGetPayload<object>): StudyPlanRow {
    const items = p.items as unknown as StudyPlanRow['items'];
    return {
      id: p.id,
      title: p.title,
      goal: p.goal,
      startsOn: dateOnly(p.startsOn)!,
      endsOn: dateOnly(p.endsOn)!,
      items,
      status: p.status as StudyPlanRow['status'],
      progressPct: items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : 0,
      createdAt: p.createdAt.toISOString(),
    };
  }

  async plans(studentId: string) {
    return (await this.prisma.root.studyPlan.findMany({ where: { studentId, status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'desc' } })).map((p) => this.planRow(p));
  }

  /** Builds a plan around the student's weakest topics and upcoming work (Plus). */
  async generatePlan(access: ResolvedAccess, input: { goal: string; days: number; minutesPerDay: number; subjects: string[] }) {
    const map = await this.mastery.map(access.studentId);
    const focus = map.subjects
      .filter((s) => !input.subjects.length || input.subjects.some((x) => subjectKey(x) === s.subject))
      .map((s) => `${s.subject}${s.officialPercent !== null ? ` (term ${s.officialPercent}%)` : ''}: weakest ${s.topics.filter((t) => t.score !== null).slice(0, 4).map((t) => `${t.topic} ${t.score}%`).join(', ') || 'no practice yet'}`)
      .join('\n');
    const start = today();
    const end = new Date(Date.parse(`${start}T00:00:00Z`) + (input.days - 1) * DAY).toISOString().slice(0, 10);
    const r = await this.withAllowance(access, { studyTool: true }, (tier) =>
      this.gateway.generateJson(
        {
          tier,
          system: `You plan revision for a Nigerian school student. Make a realistic day-by-day plan from ${start} to ${end}, about ${input.minutesPerDay} minutes a day, rotating subjects, putting more time on weaker topics, with a short review day each week. Activities are concrete and doable alone.`,
          messages: [{ role: 'user', content: `Goal: ${input.goal}\n\nWhere I am:\n${focus || 'No data yet: plan from the subjects named in the goal.'}` }],
          maxOutputTokens: 3500,
        },
        planSchema,
        'tutor-study-plan',
      ),
    );
    const items = r.data.items
      .filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date) && i.date >= start && i.date <= end)
      .map((i) => ({ date: i.date, subject: subjectKey(i.subject), topic: i.topic.slice(0, 120), activity: i.activity.slice(0, 300), minutes: Math.min(180, Math.max(5, Math.round(i.minutes))), done: false }));
    if (!items.length) throw new BadRequestException("The plan couldn't be put together. Please try again.");
    const plan = await this.prisma.root.studyPlan.create({
      data: { tenantId: access.tenantId, studentId: access.studentId, title: r.data.title.slice(0, 120) || 'My study plan', goal: input.goal, startsOn: new Date(`${start}T00:00:00Z`), endsOn: new Date(`${end}T00:00:00Z`), items },
    });
    return this.planRow(plan);
  }

  async updatePlan(studentId: string, id: string, change: { itemIndex?: number; done?: boolean; status?: 'ACTIVE' | 'DONE' | 'ARCHIVED' }) {
    const p = await this.prisma.root.studyPlan.findFirst({ where: { id, studentId } });
    if (!p) throw new NotFoundException('Plan not found');
    const items = p.items as unknown as StudyPlanRow['items'];
    if (change.itemIndex !== undefined) {
      if (!items[change.itemIndex]) throw new BadRequestException('No such item');
      items[change.itemIndex]!.done = change.done ?? !items[change.itemIndex]!.done;
    }
    const all = items.length > 0 && items.every((i) => i.done);
    return this.planRow(
      await this.prisma.root.studyPlan.update({ where: { id }, data: { items: items as unknown as Prisma.InputJsonValue, status: change.status ?? (all ? 'DONE' : p.status === 'DONE' ? 'ACTIVE' : p.status) } }),
    );
  }

  // ---------------------------------------------------------- flashcards (Leitner boxes)

  deckRow(d: Prisma.FlashcardDeckGetPayload<object>): FlashcardDeckRow {
    const cards = d.cards as unknown as Flashcard[];
    return { id: d.id, title: d.title, subject: d.subject, topic: d.topic, cards, due: cards.filter((c) => c.dueAt <= today()).length, createdAt: d.createdAt.toISOString() };
  }

  async decks(studentId: string) {
    return (await this.prisma.root.flashcardDeck.findMany({ where: { studentId }, orderBy: { updatedAt: 'desc' } })).map((d) => this.deckRow(d));
  }

  async generateDeck(access: ResolvedAccess, input: { subject: string; topic: string; count: number }) {
    const subject = subjectKey(input.subject);
    const r = await this.withAllowance(access, { studyTool: true }, (tier) =>
      this.gateway.generateJson(
        {
          tier,
          system: `You make revision flashcards for a Nigerian school student (${subject}). Each card tests one fact, definition, formula or step; answers are short and exactly right.`,
          messages: [{ role: 'user', content: `${input.count} flashcards on ${input.topic}.` }],
          maxOutputTokens: 2000,
        },
        cardsSchema,
        'tutor-flashcards',
      ),
    );
    return this.saveDeck(access, subject, input.topic, r.data.cards.slice(0, input.count));
  }

  async saveDeck(access: ResolvedAccess, subject: string, topic: string, cards: { front: string; back: string }[]) {
    const d = await this.prisma.root.flashcardDeck.create({
      data: {
        tenantId: access.tenantId,
        studentId: access.studentId,
        title: `${topic}`.slice(0, 120),
        subject: subjectKey(subject),
        topic: topic.slice(0, 120),
        cards: cards.map((c, i) => ({ id: `c${i + 1}`, front: c.front.slice(0, 400), back: c.back.slice(0, 600), box: 1, dueAt: today() })) as unknown as Prisma.InputJsonValue,
      },
    });
    return this.deckRow(d);
  }

  async review(studentId: string, deckId: string, cardId: string, result: 'AGAIN' | 'GOOD' | 'EASY') {
    const d = await this.prisma.root.flashcardDeck.findFirst({ where: { id: deckId, studentId } });
    if (!d) throw new NotFoundException('Deck not found');
    const cards = d.cards as unknown as Flashcard[];
    const card = cards.find((c) => c.id === cardId);
    if (!card) throw new NotFoundException('Card not found');
    card.box = result === 'AGAIN' ? 1 : Math.min(5, card.box + (result === 'EASY' ? 2 : 1));
    card.dueAt = new Date(Date.now() + LEITNER_DAYS[card.box]! * DAY).toISOString().slice(0, 10);
    return this.deckRow(await this.prisma.root.flashcardDeck.update({ where: { id: deckId }, data: { cards: cards as unknown as Prisma.InputJsonValue } }));
  }
}
