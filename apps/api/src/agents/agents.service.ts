import { ForbiddenException, Injectable } from '@nestjs/common';
import { AI_AGENTS, type AgentInfo, type AiAgent, type AiChatInput, type AiChatResponse, type AiProposedAction, type AiToolCall } from '@aischool/shared';
import { AGENTS, systemPrompt } from '../ai/agents';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AiJobsService } from '../ai/ai-jobs.service';
import { AiService } from '../ai/ai.service';
import { currentContext, currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService } from '../student-ai/entitlements.service';
import { AgentToolsService } from './tools.service';

const HISTORY_TURNS = 20;

/** Plain-language capability names for the assistant picker. */
const TOOL_CAPABILITY: Record<string, string> = {
  school_overview: 'School overview',
  find_students: 'Find students',
  student_profile: 'Student records',
  class_overview: 'Class overviews',
  attendance_report: 'Attendance',
  results_overview: 'Results',
  fees_overview: 'Fees',
  staff_directory: 'Staff directory',
  hr_overview: 'Leave & punctuality',
  timetable: 'Timetables',
  calendar: 'School calendar',
  operations_overview: 'Library, stores, transport & hostel',
  at_risk_students: 'Students at risk',
  recent_messages: 'Recent messages',
  my_children: "Your children's records",
  my_learning: 'Your timetable & homework',
  school_documents: 'School documents',
  draft_message: 'Draft messages',
  draft_homework: 'Draft homework',
};

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly ai: AiService,
    private readonly tools: AgentToolsService,
    private readonly jobs: AiJobsService,
    private readonly entitlements: EntitlementService,
  ) {}

  canOpen(agent: AiAgent): boolean {
    const ctx = currentContext();
    return AGENTS[agent].gate.every((p) => ctx.permissions.has(p));
  }

  /** The assistants this user can open, and what each can do for them. */
  list(): AgentInfo[] {
    return AI_AGENTS.filter((a) => this.canOpen(a)).map((a) => ({
      agent: a,
      label: AGENTS[a].label,
      description: AGENTS[a].description,
      capabilities: this.tools.available(AGENTS[a].tools).map((t) => TOOL_CAPABILITY[t.name] ?? t.name),
      suggestions: AGENTS[a].suggestions,
    }));
  }

  /**
   * `opts.style` adds channel-specific instructions (e.g. the WhatsApp
   * assistant's plain, short replies) to the assistant's system prompt.
   */
  async chat(input: AiChatInput, opts: { style?: string } = {}): Promise<AiChatResponse> {
    const ctx = currentContext();
    if (!this.canOpen(input.agent)) throw new ForbiddenException(`${AGENTS[input.agent].label} isn't available for your role`);
    const userId = ctx.userId!;
    const db = this.prisma.db;
    const conversation = input.conversationId
      ? await db.aiConversation.findFirstOrThrow({ where: { id: input.conversationId, userId, agent: input.agent } })
      : await db.aiConversation.create({ data: { tenantId: currentTenantId(), userId, agent: input.agent, title: input.message.slice(0, 80) } });
    const history = await db.aiMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'desc' }, take: HISTORY_TURNS });
    const [tenant, user] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true, timezone: true } }),
      this.prisma.root.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true } }),
    ]);
    const today = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: tenant.timezone }).format(new Date());
    // A student's assistant runs on their AI allowance, like the tutor.
    const studentAccess = input.agent === 'student' && ctx.permissions.has('learning.use') ? await this.entitlements.access(await this.entitlements.me()) : null;
    const charge = studentAccess ? await this.entitlements.check(studentAccess, {}) : null;
    if (studentAccess) this.entitlements.attribute(studentAccess);
    const specs = this.tools.available(AGENTS[input.agent].tools);
    const allowed = new Set(specs.map((s) => s.name));
    const toolCalls: AiToolCall[] = [];
    const actions: AiProposedAction[] = [];
    const who = [`You are talking to ${user.firstName} ${user.lastName}.`, opts.style].filter(Boolean).join('\n\n');

    const result = await this.gateway.generateWithTools(
      {
        tier: AGENTS[input.agent].tier,
        system: systemPrompt(input.agent, tenant.name, who, today),
        messages: [...history.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })), { role: 'user', content: input.message }],
      },
      specs,
      async (name, toolInput) => {
        const r = await this.tools.execute(name, toolInput, { actions }, allowed);
        toolCalls.push({ name, label: this.tools.labelOf(name, toolInput), ok: !r.isError });
        return r;
      },
      input.agent,
      // Providers without tool use answer from data fetched up front.
      { maxSteps: 8, fallbackSystem: async () => systemPrompt(input.agent, tenant.name, `${who}\n\n${await this.ai.grounding(input.agent, userId)}`, today) },
    );

    if (studentAccess && charge) await this.entitlements.consume(studentAccess, charge.units, charge.deep);
    const reply = result.text || "I couldn't produce an answer to that. Please try rephrasing.";
    await db.aiMessage.createMany({
      data: [
        { tenantId: conversation.tenantId, conversationId: conversation.id, role: 'user', content: input.message },
        { tenantId: conversation.tenantId, conversationId: conversation.id, role: 'assistant', content: reply, provider: result.provider, model: result.model },
      ],
    });
    await db.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    return { conversationId: conversation.id, reply, provider: result.provider, model: result.model, toolCalls, actions };
  }

  /**
   * The principal's weekly briefing: the data is gathered now, with the
   * caller's permissions, and the writing runs as a background AI job.
   */
  async briefing() {
    if (!this.canOpen('principal')) throw new ForbiddenException('The weekly briefing is for the principal and school leaders');
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true, timezone: true } });
    const allowed = new Set(AGENTS.principal.tools);
    const gather = async (name: string, input: Record<string, unknown> = {}) => {
      const r = await this.tools.execute(name, input, { actions: [] }, allowed);
      return r.isError ? `(${name} unavailable)` : r.content;
    };
    const sections = await Promise.all([
      gather('school_overview'),
      gather('attendance_report'),
      gather('results_overview'),
      gather('fees_overview'),
      gather('at_risk_students', { limit: 12 }),
      gather('hr_overview'),
      gather('operations_overview'),
      gather('calendar'),
      gather('recent_messages', { limit: 8 }),
    ]);
    const names = ['SCHOOL', 'ATTENDANCE', 'RESULTS', 'FEES', 'STUDENTS AT RISK', 'STAFF', 'OPERATIONS', 'NEXT 30 DAYS', 'RECENT MESSAGES'];
    const data = sections.map((s, i) => `## ${names[i]}\n${s}`).join('\n\n');
    const today = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: tenant.timezone }).format(new Date());
    const system = [
      `You write the principal's weekly briefing for ${tenant.name}, a Nigerian school. Today is ${today}.`,
      'Format (markdown, at most 450 words): a one-paragraph headline on the state of the school; then sections — Learning, Attendance & wellbeing, Fees, Staff, Operations, Coming up — each with 2–4 bullets that state the fact with its number and why it matters;',
      'then "This week I would…": 3–5 concrete actions, each with who should do it. Name students only in the at-risk section, and only to arrange support. Use only the data given; if a section has no data, say so in one line.',
      'British English. Currency ₦.',
    ].join('\n');
    return this.jobs.start('principal-briefing', { kind: 'weekly' }, async () => {
      const r = await this.gateway.generate({ tier: 'advanced', system, messages: [{ role: 'user', content: data }] }, 'principal-briefing');
      return { text: r.text, provider: r.provider, model: r.model, generatedAt: new Date().toISOString() };
    });
  }
}
