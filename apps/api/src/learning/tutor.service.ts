import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MEMORY_KINDS, type StudentMemoryRow, type TutorChatInput, type TutorReply } from '@aischool/shared';
import { z, type ZodType } from 'zod';
import { AiGatewayService } from '../ai/ai-gateway.service';
import type { AiImage, AiToolSpec } from '../ai/providers/provider';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService, type ResolvedAccess } from '../student-ai/entitlements.service';
import { MasteryService, subjectKey } from './mastery.service';
import { StudyService, type StoredQuestion } from './study.service';

const HISTORY_TURNS = 16;
const MAX_MEMORIES = 40;

interface ToolDef<I> {
  name: string;
  description: string;
  input: ZodType<I>;
  /** Plus/Pro only (study plans, flashcards). */
  studyTool?: boolean;
  run: (input: I, ctx: TutorCtx) => Promise<unknown>;
}
interface TutorCtx {
  access: ResolvedAccess;
  saved: TutorReply['savedItems'];
}

function jsonSchema(schema: ZodType<unknown>): Record<string, unknown> {
  const s = z.toJSONSchema(schema) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

/**
 * The learning companion. A patient, Socratic tutor that knows the student
 * (their class, official results, topic mastery and what it has learned
 * about how they learn) only through tools scoped to that one student.
 * Official records are read, never changed: the tutor's own evidence goes
 * to mastery and memory, which are separate from the school's results.
 */
@Injectable()
export class TutorService {
  private readonly tools = new Map<string, ToolDef<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly entitlements: EntitlementService,
    private readonly mastery: MasteryService,
    private readonly study: StudyService,
    private readonly files: FilesService,
  ) {
    this.register();
  }

  private add<I>(def: ToolDef<I>) {
    this.tools.set(def.name, def as ToolDef<unknown>);
  }

  private register() {
    this.add({
      name: 'my_profile',
      description: "The student's name, class, school, subjects and AI plan. Use at the start of a conversation if you need context.",
      input: z.object({}),
      run: async (_i, { access }) => {
        const s = await this.prisma.root.student.findUniqueOrThrow({
          where: { id: access.studentId },
          include: { tenant: { select: { name: true } }, classArm: { include: { classLevel: true, subjects: { include: { subject: true } } } } },
        });
        return {
          name: s.firstName,
          class: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}` : null,
          stage: s.classArm?.classLevel.stage ?? null,
          school: s.tenant.name,
          subjects: s.classArm?.subjects.map((x) => x.subject.name) ?? [],
          plan: access.tierLabel,
          examPrep: access.exams,
        };
      },
    });
    this.add({
      name: 'my_results',
      description: "The student's OFFICIAL results this term from the school (percent per subject). Authoritative: quote them exactly, never estimate.",
      input: z.object({}),
      run: async (_i, { access }) => {
        const s = await this.prisma.root.student.findUniqueOrThrow({ where: { id: access.studentId }, select: { tenantId: true, classArmId: true } });
        const official = await this.mastery.officialPercents(s.tenantId, access.studentId, s.classArmId);
        return official.size ? Object.fromEntries(official) : { note: 'No results recorded for this term yet.' };
      },
    });
    this.add({
      name: 'my_mastery',
      description: 'Topic mastery from practice and tutoring (separate from official results): weakest and strongest topics, per subject.',
      input: z.object({ subject: z.string().optional() }),
      run: async (i, { access }) => {
        const m = await this.mastery.map(access.studentId);
        const subjects = i.subject ? m.subjects.filter((s) => s.subject === subjectKey(i.subject!)) : m.subjects;
        return {
          weakest: m.weakest.map((t) => `${t.topic} ${t.score}%`),
          strongest: m.strongest.map((t) => `${t.topic} ${t.score}%`),
          subjects: subjects.map((s) => ({ subject: s.subject, practiceAverage: s.average, topics: s.topics.filter((t) => t.score !== null).slice(0, 8).map((t) => `${t.topic} ${t.score}% (${t.attempts} answers)`) })),
        };
      },
    });
    this.add({
      name: 'my_homework',
      description: "Homework set for the student's class that is due soon.",
      input: z.object({}),
      run: async (_i, { access }) => {
        const s = await this.prisma.root.student.findUniqueOrThrow({ where: { id: access.studentId }, select: { classArmId: true, tenant: { select: { timezone: true } } } });
        if (!s.classArmId) return { note: 'Not in a class yet.' };
        const today = schoolNow(s.tenant.timezone).date;
        const hw = await this.prisma.root.homework.findMany({ where: { classArmId: s.classArmId, status: 'PUBLISHED', dueDate: { gte: parseDate(today) } }, include: { subject: true }, orderBy: { dueDate: 'asc' }, take: 10 });
        return hw.map((h) => ({ title: h.title, subject: h.subject?.name ?? null, due: dateOnly(h.dueDate), instructions: h.instructions, questions: h.questions }));
      },
    });
    this.add({
      name: 'my_memory',
      description: 'What you have learned before about how this student learns: strengths, struggles, preferences and goals.',
      input: z.object({}),
      run: async (_i, { access }) =>
        (await this.prisma.root.studentMemory.findMany({ where: { studentId: access.studentId, active: true }, orderBy: { updatedAt: 'desc' }, take: 25 })).map((m) => `${m.kind}: ${m.content}`),
    });
    this.add({
      name: 'remember',
      description:
        'Save something durable about how the student learns (e.g. "prefers worked examples before rules", "struggles with negative numbers", "goal: B in WAEC maths"). Not for chit-chat, personal details, feelings or anything about other people.',
      input: z.object({ kind: z.enum(MEMORY_KINDS), content: z.string().min(5).max(200), evidence: z.string().max(200).optional() }),
      run: async (i, { access, saved }) => {
        const similar = await this.prisma.root.studentMemory.findFirst({ where: { studentId: access.studentId, active: true, kind: i.kind, content: { equals: i.content, mode: 'insensitive' } } });
        if (similar) {
          await this.prisma.root.studentMemory.update({ where: { id: similar.id }, data: { confidence: Math.min(0.95, similar.confidence + 0.1), evidence: i.evidence ?? similar.evidence } });
          return { ok: true, updated: true };
        }
        const count = await this.prisma.root.studentMemory.count({ where: { studentId: access.studentId, active: true } });
        if (count >= MAX_MEMORIES) {
          const oldest = await this.prisma.root.studentMemory.findFirst({ where: { studentId: access.studentId, active: true }, orderBy: { updatedAt: 'asc' } });
          if (oldest) await this.prisma.root.studentMemory.update({ where: { id: oldest.id }, data: { active: false } });
        }
        const m = await this.prisma.root.studentMemory.create({ data: { tenantId: access.tenantId, studentId: access.studentId, kind: i.kind, content: i.content, evidence: i.evidence ?? null } });
        saved.push({ kind: 'MEMORY', id: m.id, label: i.content });
        return { ok: true };
      },
    });
    this.add({
      name: 'record_mastery',
      description:
        "Record evidence about a topic from this conversation: the student answered your check question correctly or not, or clearly struggled / was confident. Use a specific syllabus topic name (e.g. 'Quadratic equations', 'Photosynthesis').",
      input: z.object({ subject: z.string().min(2), topic: z.string().min(2).max(120), correct: z.number().int().min(0).max(10), total: z.number().int().min(1).max(10) }),
      run: async (i, { access, saved }) => {
        const topic = await this.mastery.topicFor(access.studentId, i.subject, i.topic);
        const r = await this.mastery.record(access.tenantId, access.studentId, topic.id, Math.min(i.correct, i.total), i.total);
        saved.push({ kind: 'MASTERY', label: `${topic.name}: ${r?.score ?? '–'}%` });
        return { topic: topic.name, mastery: r?.score };
      },
    });
    this.add({
      name: 'create_quiz',
      description: 'Save a short multiple-choice quiz (3–10 questions, exactly 4 options each) the student can take and have marked. Use when they want to test themselves.',
      input: z.object({
        subject: z.string().min(2),
        topic: z.string().min(2).max(120),
        questions: z.array(z.object({ stem: z.string().min(5), options: z.array(z.string().min(1)).length(4), answer: z.number().int().min(0).max(3), explanation: z.string().max(400) })).min(3).max(10),
      }),
      run: async (i, { access, saved }) => {
        const topic = await this.mastery.topicFor(access.studentId, i.subject, i.topic);
        const qs: StoredQuestion[] = i.questions.map((q) => ({ stem: q.stem, options: q.options, answer: q.answer, explanation: q.explanation, topicId: topic.id, topic: topic.name }));
        const a = await this.study.createAttempt(access, { mode: 'AI_QUIZ', subject: subjectKey(i.subject), topicId: topic.id, title: `${topic.name} quiz`, questions: qs });
        saved.push({ kind: 'QUIZ', id: a.id, label: `${topic.name} quiz (${qs.length} questions)` });
        return { saved: true, attemptId: a.id, note: 'Tell the student the quiz is ready to take below. Do not reveal the answers.' };
      },
    });
    this.add({
      name: 'create_flashcards',
      description: 'Save a flashcard deck (6–20 cards) for spaced-repetition revision.',
      input: z.object({ subject: z.string().min(2), topic: z.string().min(2).max(120), cards: z.array(z.object({ front: z.string().min(2).max(300), back: z.string().min(1).max(500) })).min(4).max(20) }),
      studyTool: true,
      run: async (i, { access, saved }) => {
        const d = await this.study.saveDeck(access, i.subject, i.topic, i.cards);
        saved.push({ kind: 'FLASHCARDS', id: d.id, label: `${d.title} (${d.cards.length} cards)` });
        return { saved: true };
      },
    });
    this.add({
      name: 'create_study_plan',
      description: 'Save a day-by-day study plan (dates YYYY-MM-DD from today). Base it on my_mastery and my_homework.',
      input: z.object({
        title: z.string().min(3).max(120),
        goal: z.string().min(3).max(300),
        items: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), subject: z.string(), topic: z.string(), activity: z.string().max(300), minutes: z.number().int().min(5).max(180) })).min(3).max(60),
      }),
      studyTool: true,
      run: async (i, { access, saved }) => {
        const dates = i.items.map((x) => x.date).sort();
        const p = await this.prisma.root.studyPlan.create({
          data: {
            tenantId: access.tenantId,
            studentId: access.studentId,
            title: i.title,
            goal: i.goal,
            startsOn: new Date(`${dates[0]}T00:00:00Z`),
            endsOn: new Date(`${dates.at(-1)}T00:00:00Z`),
            items: i.items.map((x) => ({ ...x, subject: subjectKey(x.subject), done: false })),
          },
        });
        saved.push({ kind: 'STUDY_PLAN', id: p.id, label: i.title });
        return { saved: true };
      },
    });
  }

  private specs(access: ResolvedAccess): AiToolSpec[] {
    return [...this.tools.values()]
      .filter((t) => !t.studyTool || access.studyTools)
      .map((t) => ({ name: t.name, description: t.description, inputSchema: jsonSchema(t.input as ZodType<unknown>) }));
  }

  private system(access: ResolvedAccess, today: string, subject: string | null | undefined) {
    return [
      `You are the AI learning companion for a Nigerian school student (${access.name.split(' ')[0]}). Today is ${today}.${subject ? ` They are working on ${subjectKey(subject)}.` : ''}`,
      'Teach, don\'t just tell: find out what they already know, explain step by step with simple examples (Nigerian contexts, ₦, local names), check understanding with one short question, and praise effort specifically. For homework, guide them to the answer rather than writing it for them; give full worked solutions for practice questions.',
      'Keep replies short and friendly for a young person (under 180 words unless they ask for more); use markdown for steps and maths (plain characters like x², √, ÷).',
      'Use tools: my_mastery, my_memory and my_homework to personalise; my_results for OFFICIAL school results (quote exactly; never estimate grades). After the student answers your check question, call record_mastery. When you learn something lasting about how they learn, call remember.',
      access.studyTools ? 'They have AI Plus: you can save study plans (create_study_plan), flashcards (create_flashcards) and quizzes (create_quiz).' : 'They are on AI Basic: you can save short quizzes (create_quiz). Study plans and flashcards come with AI Student Plus; mention it only if they ask for those.',
      'Safety: you only ever see this student\'s own records. Never ask for or store personal details (address, phone, passwords), never discuss other students, and keep to learning. If the student mentions being unsafe, hurt or very upset, respond kindly and encourage them to talk to a parent, teacher or the school counsellor straight away. Refuse to help with cheating in exams.',
    ].join('\n');
  }

  async conversations(studentId: string) {
    const rows = await this.prisma.root.aiConversation.findMany({ where: { studentId, agent: 'tutor' }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, title: true, updatedAt: true } });
    return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }));
  }

  async conversation(studentId: string, id: string) {
    const c = await this.prisma.root.aiConversation.findFirst({ where: { id, studentId, agent: 'tutor' }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!c) throw new NotFoundException('Conversation not found');
    return { id: c.id, title: c.title, messages: c.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })) };
  }

  private async images(fileIds: string[]): Promise<AiImage[]> {
    const out: AiImage[] = [];
    const userId = currentContext().userId;
    for (const id of fileIds) {
      const row = await this.prisma.db.fileObject.findFirst({ where: { id, uploadedById: userId } });
      if (!row || !row.mimeType.startsWith('image/')) throw new BadRequestException('Attach photos you uploaded yourself');
      const f = await this.files.read(id, false);
      out.push({ mediaType: f.mimeType as AiImage['mediaType'], data: f.data.toString('base64') });
    }
    return out;
  }

  async chat(studentId: string, input: TutorChatInput): Promise<TutorReply> {
    const access = await this.entitlements.access(studentId);
    const photos = input.imageFileIds.length > 0;
    const { units, deep } = await this.entitlements.check(access, { deep: input.deep, photos });
    const userId = currentContext().userId!;
    const conversation = input.conversationId
      ? await this.prisma.root.aiConversation.findFirst({ where: { id: input.conversationId, studentId, agent: 'tutor' } })
      : await this.prisma.root.aiConversation.create({ data: { tenantId: access.tenantId, userId, studentId, agent: 'tutor', title: input.message.slice(0, 80) } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const history = await this.prisma.root.aiMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'desc' }, take: HISTORY_TURNS });
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: access.tenantId }, select: { timezone: true } });
    const today = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: tenant.timezone }).format(new Date());
    const images = photos ? await this.images(input.imageFileIds) : [];
    const ctx: TutorCtx = { access, saved: [] };
    const specs = this.specs(access);
    const allowed = new Set(specs.map((s) => s.name));

    this.entitlements.attribute(access);
    const result = await this.gateway.generateWithTools(
      {
        tier: deep ? 'advanced' : 'standard',
        system: this.system(access, today, input.subject),
        messages: [
          ...history.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: input.message || 'Please help me with the question in this photo.', ...(images.length ? { images } : {}) },
        ],
        maxOutputTokens: deep ? 2500 : 1200,
      },
      specs,
      async (name, raw) => {
        const tool = this.tools.get(name);
        if (!tool || !allowed.has(name)) return { content: `Unknown tool ${name}`, isError: true };
        const parsed = tool.input.safeParse(raw ?? {});
        if (!parsed.success) return { content: `Invalid input: ${parsed.error.issues[0]?.message}`, isError: true };
        try {
          const out = await tool.run(parsed.data, ctx);
          return { content: JSON.stringify(out).slice(0, 12_000) };
        } catch (err) {
          return { content: (err as Error).message, isError: true };
        }
      },
      'tutor',
      { maxSteps: 6, fallbackSystem: async () => this.system(access, today, input.subject) },
    );
    await this.entitlements.consume(access, units, deep);
    const reply = result.text || "Sorry, I couldn't work that out. Could you ask it another way?";
    await this.prisma.root.aiMessage.createMany({
      data: [
        { tenantId: access.tenantId, conversationId: conversation.id, role: 'user', content: images.length ? `${input.message}\n\n📷 (${images.length} photo${images.length === 1 ? '' : 's'})` : input.message },
        { tenantId: access.tenantId, conversationId: conversation.id, role: 'assistant', content: reply, provider: result.provider, model: result.model },
      ],
    });
    await this.prisma.root.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    const after = await this.entitlements.access(studentId);
    const { tenantId: _t, periodKey: _p, ...visible } = after;
    return { conversationId: conversation.id, reply, deep, access: visible, savedItems: ctx.saved, provider: result.provider, model: result.model };
  }

  // ---------------------------------------------------------- memory (visible and editable)

  async memories(studentId: string): Promise<StudentMemoryRow[]> {
    const rows = await this.prisma.root.studentMemory.findMany({ where: { studentId, active: true }, orderBy: { updatedAt: 'desc' } });
    return rows.map((m) => ({ id: m.id, kind: m.kind as StudentMemoryRow['kind'], content: m.content, confidence: m.confidence, source: m.source as StudentMemoryRow['source'], evidence: m.evidence, createdAt: m.createdAt.toISOString() }));
  }

  async forget(studentId: string, id: string) {
    const r = await this.prisma.root.studentMemory.updateMany({ where: { id, studentId }, data: { active: false } });
    if (!r.count) throw new NotFoundException('Not found');
    return { ok: true };
  }

  async addMemory(access: { tenantId: string; studentId: string }, input: { kind: string; content: string }, source: 'STUDENT' | 'PARENT' | 'TEACHER') {
    const m = await this.prisma.root.studentMemory.create({ data: { tenantId: access.tenantId, studentId: access.studentId, kind: input.kind, content: input.content, source, confidence: 0.9 } });
    return { id: m.id };
  }

  childName(s: { firstName: string; lastName: string }) {
    return fullName(s);
  }
}
