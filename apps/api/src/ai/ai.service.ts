import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AiAgent, AiChatInput, AiChatResponse, AiStatus, Permission } from '@aischool/shared';
import { currentContext, currentTenantId } from '../common/request-context';
import { SchoolSnapshotService } from '../dashboard/school-snapshot.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiGatewayService } from './ai-gateway.service';
import { AGENTS, snapshotToText, systemPrompt } from './agents';

const HISTORY_TURNS = 20;

/**
 * School-wide agents see aggregate school data, so they need more than
 * `ai.use`: a parent or student can't open the School AI and read the roll.
 */
const AGENT_PERMISSION: Partial<Record<AiAgent, Permission>> = {
  school: 'school.read',
  admissions: 'students.read',
  finance: 'finance.read',
  teacher: 'academics.read',
};

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly snapshot: SchoolSnapshotService,
  ) {}

  async status(): Promise<AiStatus> {
    const providers = this.gateway.configuredProviders();
    return {
      configured: providers.length > 0,
      providers,
      monthSpendUsd: Math.round((await this.gateway.monthSpendUsd()) * 100) / 100,
      monthBudgetUsd: await this.gateway.monthBudgetUsd(),
    };
  }

  async chat(input: AiChatInput): Promise<AiChatResponse> {
    const ctx = currentContext();
    const needed = AGENT_PERMISSION[input.agent];
    if (needed && !ctx.permissions.has(needed)) {
      throw new ForbiddenException(`${AGENTS[input.agent].label} isn't available for your role`);
    }
    const userId = ctx.userId!;
    const db = this.prisma.db;

    const conversation = input.conversationId
      ? await db.aiConversation.findFirstOrThrow({ where: { id: input.conversationId, userId, agent: input.agent } })
      : await db.aiConversation.create({
          data: { tenantId: currentTenantId(), userId, agent: input.agent, title: input.message.slice(0, 80) },
        });

    const history = await db.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_TURNS,
    });

    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: currentTenantId() },
      select: { name: true, timezone: true },
    });
    const today = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: tenant.timezone }).format(new Date());

    const result = await this.gateway.generate(
      {
        tier: AGENTS[input.agent].tier,
        system: systemPrompt(input.agent, tenant.name, await this.grounding(input.agent, userId), today),
        messages: [
          ...history.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: input.message },
        ],
      },
      input.agent,
    );

    const reply = result.text || "I couldn't produce an answer to that. Please try rephrasing.";
    await db.aiMessage.createMany({
      data: [
        { tenantId: conversation.tenantId, conversationId: conversation.id, role: 'user', content: input.message },
        { tenantId: conversation.tenantId, conversationId: conversation.id, role: 'assistant', content: reply, provider: result.provider, model: result.model },
      ],
    });
    await db.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    return { conversationId: conversation.id, reply, provider: result.provider, model: result.model };
  }

  /** The records each agent may draw on. */
  private async grounding(agent: AiAgent, userId: string): Promise<string> {
    if (agent === 'school' || agent === 'admissions' || agent === 'finance') {
      return snapshotToText(await this.snapshot.overview());
    }
    if (agent === 'parent') {
      const guardians = await this.prisma.db.guardian.findMany({
        where: { userId },
        include: {
          students: {
            include: {
              student: {
                select: {
                  firstName: true,
                  lastName: true,
                  admissionNumber: true,
                  status: true,
                  classArm: { select: { name: true, classLevel: { select: { name: true } } } },
                },
              },
            },
          },
        },
      });
      const children = guardians.flatMap((g) => g.students.map((s) => s.student));
      if (!children.length) return 'PARENT DATA\nNo children are linked to this account yet.';
      return (
        'PARENT DATA\nChildren: ' +
        children
          .map((c) => `${c.firstName} ${c.lastName} (${c.admissionNumber}), ${c.classArm ? `${c.classArm.classLevel.name} ${c.classArm.name}` : 'no class yet'}, ${c.status.toLowerCase()}`)
          .join('; ') +
        '\nNot yet tracked: attendance, results, fees, homework.'
      );
    }
    if (agent === 'student') {
      const me = await this.prisma.db.student.findFirst({
        where: { userId },
        select: { firstName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } },
      });
      return me
        ? `STUDENT DATA\nName: ${me.firstName}; class: ${me.classArm ? `${me.classArm.classLevel.name} ${me.classArm.name}` : 'not assigned'}`
        : 'STUDENT DATA\nNo student record is linked to this account; ask the student for their class level if needed.';
    }
    return '';
  }
}
