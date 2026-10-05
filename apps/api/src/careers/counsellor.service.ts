import { Injectable, NotFoundException } from '@nestjs/common';
import { INTEREST_TYPES, RIASEC, TRACK_LABELS, TRACKS, type CounsellorReply, type Track } from '@aischool/shared';
import { z, type ZodType } from 'zod';
import { AiGatewayService } from '../ai/ai-gateway.service';
import type { AiToolSpec } from '../ai/providers/provider';
import { currentContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService, type ResolvedAccess } from '../student-ai/entitlements.service';
import { CareersService, courseView } from './careers.service';

const AGENT = 'careers';
const HISTORY_TURNS = 16;
const VOICE_STYLE =
  '\n\nVOICE: the student is speaking to you and will HEAR your reply read aloud. Talk naturally: short sentences, under 100 words, one idea at a time, then one short question. No tables, headings or bullet symbols.';

interface ToolDef<I> {
  name: string;
  description: string;
  input: ZodType<I>;
  run: (input: I, ctx: Ctx) => Promise<unknown>;
}
interface Ctx {
  access: ResolvedAccess;
  saved: string[];
}

function jsonSchema(schema: ZodType<unknown>): Record<string, unknown> {
  const s = z.toJSONSchema(schema) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

/**
 * The AI careers counsellor: the tutor's chat machinery (gateway with tools,
 * the student's AI allowance, saved conversations) with a counsellor's
 * brief. It sees the student's interest profile, saved careers, subject
 * strengths and target course, and the career library; admission
 * requirements only when a person has verified them. It must never make up
 * UTME subjects, O'level requirements or cut-off marks.
 */
@Injectable()
export class CounsellorService {
  private readonly tools = new Map<string, ToolDef<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly entitlements: EntitlementService,
    private readonly careers: CareersService,
  ) {
    this.register();
  }

  private add<I>(def: ToolDef<I>) {
    this.tools.set(def.name, def as ToolDef<unknown>);
  }

  private register() {
    this.add({
      name: 'my_profile',
      description: "The student's first name, class, stage (JUNIOR/SENIOR) and class subjects.",
      input: z.object({}),
      run: async (_i, { access }) => {
        const s = await this.careers.student(access.studentId);
        return { name: s.firstName, class: s.className, stage: s.stage, classSubjects: s.classSubjects };
      },
    });
    this.add({
      name: 'my_interests',
      description: 'The interest quiz results: score (0–100) per interest type and the top three types. Null if the quiz has not been taken.',
      input: z.object({}),
      run: async (_i, { access }) => {
        const p = await this.prisma.db.careerProfile.findUnique({ where: { studentId: access.studentId } });
        const r = this.careers.interests(p);
        if (!r) return { note: 'The student has not taken the interest quiz yet. Suggest it (Careers → Take the quiz).' };
        return { top: r.top.map((t) => `${INTEREST_TYPES[t].name} (${INTEREST_TYPES[t].formal})`), scores: Object.fromEntries(RIASEC.map((t) => [INTEREST_TYPES[t].name, r.scores[t]])) };
      },
    });
    this.add({
      name: 'my_strengths',
      description: "The student's subject strengths: OFFICIAL school percentages from the latest term with results, and practice mastery averages. Quote official results exactly.",
      input: z.object({}),
      run: async (_i, { access }) => {
        const s = await this.careers.student(access.studentId);
        const rows = await this.careers.strengths(s);
        return rows.length ? rows : { note: 'No results or practice recorded yet.' };
      },
    });
    this.add({
      name: 'my_plan',
      description: 'Saved careers, target university course and planned SS1 track (SCIENCE, ARTS, COMMERCIAL or TECHNICAL), with subject-fit checks.',
      input: z.object({}),
      run: async (_i, { access }) => {
        const p = await this.careers.myPlan(access.studentId);
        return { plannedTrack: p.plan.plannedTrack ? TRACK_LABELS[p.plan.plannedTrack] : null, targetCourse: p.plan.targetCourse, savedCareers: p.saved.map((c) => `${c.name} (${c.slug})`), fitChecks: p.fits.map((f) => `${f.name}: ${f.status} — ${f.notes.join(' ')}`) };
      },
    });
    this.add({
      name: 'track_advice',
      description: 'How each SS1 track (Science, Arts, Commercial, Technical) fits the student, with reasons from their quiz, results and saved careers.',
      input: z.object({}),
      run: async (_i, { access }) => {
        const a = await this.careers.advice(access.studentId);
        return { note: a.stageNote, ranking: a.recommendations.map((r) => ({ track: TRACK_LABELS[r.track], fit: r.score, reasons: r.reasons })) };
      },
    });
    this.add({
      name: 'search_careers',
      description: 'Search the career library by words, field, track or interest type. Returns up to 15 careers with a slug for career_details.',
      input: z.object({ query: z.string().max(80).optional(), field: z.string().max(60).optional(), track: z.enum(TRACKS).optional(), interest: z.enum(RIASEC).optional() }),
      run: async (i) => {
        const rows = await this.careers.library({ search: i.query, field: i.field, track: i.track, interest: i.interest });
        return rows.length ? rows.slice(0, 15).map((c) => ({ slug: c.slug, name: c.name, field: c.field, summary: c.summary, tracks: c.tracks.map((t) => TRACK_LABELS[t as Track]) })) : { note: 'No careers matched. Try fewer or different words.' };
      },
    });
    this.add({
      name: 'career_details',
      description: 'Full details of one career by slug or name: what the work is, skills, helpful subjects, tracks, courses, other routes, professional bodies, and ONLY verified course requirements.',
      input: z.object({ career: z.string().min(2).max(120) }),
      run: async (i) => {
        const c =
          (await this.prisma.root.career.findFirst({ where: { slug: i.career, published: true } })) ??
          (await this.prisma.root.career.findFirst({ where: { name: { equals: i.career, mode: 'insensitive' }, published: true } })) ??
          (await this.prisma.root.career.findFirst({ where: { name: { contains: i.career, mode: 'insensitive' }, published: true } }));
        if (!c) return { note: 'Not in the library. Do not invent details; suggest search_careers.' };
        const courses = await this.careers.courseViews(c.courses);
        return { ...this.careers.full(c), courses: courses.map(requirementsFor) };
      },
    });
    this.add({
      name: 'course_requirements',
      description: 'Admission requirements (UTME subjects, O’level credits) for a university course — only if verified against the JAMB brochure. Otherwise says they are not loaded.',
      input: z.object({ course: z.string().min(2).max(160) }),
      run: async (i) => {
        const c = (await this.prisma.root.universityCourse.findFirst({ where: { name: { equals: i.course, mode: 'insensitive' } } })) ?? (await this.prisma.root.universityCourse.findFirst({ where: { name: { contains: i.course, mode: 'insensitive' } } }));
        return requirementsFor(courseView(c, i.course));
      },
    });
    this.add({
      name: 'save_career',
      description: "Save a career to the student's list when they clearly ask you to (by slug from search_careers).",
      input: z.object({ slug: z.string().min(2).max(80) }),
      run: async (i, ctx) => {
        await this.careers.setSaved(ctx.access.studentId, i.slug, true);
        ctx.saved.push(i.slug);
        return { saved: true };
      },
    });
  }

  private specs(): AiToolSpec[] {
    return [...this.tools.values()].map((t) => ({ name: t.name, description: t.description, inputSchema: jsonSchema(t.input as ZodType<unknown>) }));
  }

  private system(access: ResolvedAccess, today: string) {
    return [
      `You are a friendly careers counsellor for a Nigerian secondary school student (${access.name.split(' ')[0]}). Today is ${today}.`,
      'Help them discover careers that suit their interests and strengths, understand what the work is really like, choose an SS1 track (Science, Arts, Commercial or Technical) and plan for WAEC/NECO, JAMB UTME and university, polytechnic or other routes (ND/HND, apprenticeships, professional exams).',
      'Be encouraging and honest; British English; short replies (under 180 words unless asked), simple words for a young person, Nigerian examples. Ask one question at a time to understand them. Never say a career is closed to them because of gender, background or one weak result.',
      'Use tools: my_interests, my_strengths, my_plan and track_advice to personalise; search_careers and career_details for the library; course_requirements for admission requirements.',
      'STRICT RULE ON ADMISSIONS FACTS: never state UTME subject combinations, O’level requirements, cut-off marks, admission quotas or fees from your own knowledge. Only quote requirements a tool returns as verified, and name the brochure edition. If a tool says requirements are not loaded, say: "Those requirements aren’t loaded yet — check the current JAMB brochure (on the JAMB website or e-Facility) and confirm with your school counsellor." Cut-off marks are set by JAMB and each university every year: always tell them to check the official sources.',
      'Official results come from my_strengths: quote them exactly, never estimate grades. You only see this student’s own records. Never ask for personal details (address, phone, passwords). If the student seems worried, unsafe or very upset, respond kindly and encourage them to talk to a parent, teacher or the school counsellor.',
    ].join('\n');
  }

  /** For providers without tool use: the same context, fetched up front. */
  private async fallback(access: ResolvedAccess, today: string) {
    const ctx: Ctx = { access, saved: [] };
    const parts = await Promise.all(['my_profile', 'my_interests', 'my_strengths', 'my_plan'].map(async (n) => `${n}: ${JSON.stringify(await this.tools.get(n)!.run({}, ctx)).slice(0, 3000)}`));
    return `${this.system(access, today)}\n\nWhat you know about the student:\n${parts.join('\n')}\n\nYou have no admission requirements loaded in this mode: for any requirement or cut-off, send them to the JAMB brochure and their counsellor.`;
  }

  async conversations(studentId: string) {
    const rows = await this.prisma.root.aiConversation.findMany({ where: { studentId, agent: AGENT }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, title: true, updatedAt: true } });
    return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }));
  }

  async conversation(studentId: string, id: string) {
    const c = await this.prisma.root.aiConversation.findFirst({ where: { id, studentId, agent: AGENT }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!c) throw new NotFoundException('Conversation not found');
    return { id: c.id, title: c.title, messages: c.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })) };
  }

  async chat(studentId: string, input: { conversationId?: string | null; message: string; voice: boolean }): Promise<CounsellorReply> {
    const access = await this.entitlements.access(studentId);
    const { units } = await this.entitlements.check(access, { deep: false });
    const userId = currentContext().userId!;
    const conversation = input.conversationId
      ? await this.prisma.root.aiConversation.findFirst({ where: { id: input.conversationId, studentId, agent: AGENT } })
      : await this.prisma.root.aiConversation.create({ data: { tenantId: access.tenantId, userId, studentId, agent: AGENT, title: input.message.slice(0, 80) } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const history = await this.prisma.root.aiMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'desc' }, take: HISTORY_TURNS });
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: access.tenantId }, select: { timezone: true } });
    const today = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: tenant.timezone }).format(new Date());
    const ctx: Ctx = { access, saved: [] };

    this.entitlements.attribute(access);
    const result = await this.gateway.generateWithTools(
      {
        tier: 'standard',
        system: this.system(access, today) + (input.voice ? VOICE_STYLE : ''),
        messages: [...history.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })), { role: 'user', content: input.message }],
        maxOutputTokens: 1200,
      },
      this.specs(),
      async (name, raw) => {
        const tool = this.tools.get(name);
        if (!tool) return { content: `Unknown tool ${name}`, isError: true };
        const parsed = tool.input.safeParse(raw ?? {});
        if (!parsed.success) return { content: `Invalid input: ${parsed.error.issues[0]?.message}`, isError: true };
        try {
          return { content: JSON.stringify(await tool.run(parsed.data, ctx)).slice(0, 12_000) };
        } catch (err) {
          return { content: (err as Error).message, isError: true };
        }
      },
      AGENT,
      { maxSteps: 6, fallbackSystem: () => this.fallback(access, today) },
    );
    await this.entitlements.consume(access, units, false);
    const reply = result.text || "Sorry, I couldn't work that out. Could you ask it another way?";
    await this.prisma.root.aiMessage.createMany({
      data: [
        { tenantId: access.tenantId, conversationId: conversation.id, role: 'user', content: input.message },
        { tenantId: access.tenantId, conversationId: conversation.id, role: 'assistant', content: reply, provider: result.provider, model: result.model },
      ],
    });
    await this.prisma.root.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    const after = await this.entitlements.access(studentId);
    const { tenantId: _t, periodKey: _p, ...visible } = after;
    return { conversationId: conversation.id, reply, savedCareers: ctx.saved, access: visible };
  }
}

function requirementsFor(v: ReturnType<typeof courseView>) {
  if (!v.known) return { course: v.name, status: 'NOT IN COURSE LIST', instruction: 'Requirements not loaded. Tell the student to check the current JAMB brochure and their school counsellor. Do not guess.' };
  if (!v.verified) return { course: v.name, faculty: v.faculty, status: 'NOT VERIFIED', instruction: 'Requirements not loaded yet. Tell the student to check the current JAMB brochure and their school counsellor. Do not guess.' };
  return {
    course: v.name,
    faculty: v.faculty,
    status: 'VERIFIED',
    source: `JAMB brochure${v.sourceEdition ? ` ${v.sourceEdition}` : ''}`,
    utme: ['Use of English', ...(v.utmeSubjects ?? []).map((r) => (r.subjects.length > 1 ? `one of ${r.subjects.join(' / ')}` : r.subjects[0]))],
    olevel: v.olevelRequirements,
    notes: v.notes,
    reminder: 'Cut-off marks are not in this data: tell the student to check JAMB and the university.',
  };
}

