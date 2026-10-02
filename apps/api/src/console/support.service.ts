import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketAssist,
  type TicketCategory,
  type TicketDetail,
  type TicketPriority,
  type TicketRow,
  type TicketStatus,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { fullName } from '../common/format';
import { currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const ticketInclude = {
  tenant: { select: { id: true, name: true, slug: true } },
  openedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { messages: { where: { internal: false } } } },
} satisfies Prisma.SupportTicketInclude;
type TicketWith = Prisma.SupportTicketGetPayload<{ include: typeof ticketInclude }>;

const assistSchema = z.object({
  summary: z.string().describe('Two sentences: what the school needs and what has happened so far'),
  suggestedCategory: z.enum(TICKET_CATEGORIES),
  suggestedPriority: z.enum(TICKET_PRIORITIES).describe('URGENT only if a school cannot work (cannot sign in, data loss, payments failing for everyone)'),
  draftReply: z.string().describe('A reply to the school, warm and specific, under 180 words, with clear next steps; no promises about dates or refunds'),
});

/**
 * Help desk between schools and the platform. Schools see their own tickets
 * (through the tenant-scoped client) without internal notes; platform staff
 * see everything (unscoped).
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  row(t: TicketWith): TicketRow {
    return {
      id: t.id,
      number: t.number,
      subject: t.subject,
      category: t.category as TicketCategory,
      priority: t.priority as TicketPriority,
      status: t.status as TicketStatus,
      tenant: t.tenant,
      openedBy: t.openedBy ? { id: t.openedBy.id, name: fullName(t.openedBy), email: t.openedBy.email } : null,
      assignedTo: t.assignedTo ? { id: t.assignedTo.id, name: fullName(t.assignedTo) } : null,
      messages: t._count.messages,
      lastMessageAt: t.lastMessageAt.toISOString(),
      awaitingPlatform: t.awaitingPlatform,
      createdAt: t.createdAt.toISOString(),
    };
  }

  async list(where: Prisma.SupportTicketWhereInput, scoped: boolean) {
    // Schools only ever see their own tickets.
    const rows = await this.prisma.root.supportTicket.findMany({ where: scoped ? { ...where, tenantId: currentTenantId() } : where, include: ticketInclude, orderBy: [{ lastMessageAt: 'desc' }], take: 300 });
    return rows.map((t) => this.row(t));
  }

  async detail(id: string, opts: { scoped: boolean }): Promise<TicketDetail> {
    const t = await this.prisma.root.supportTicket.findFirst({ where: { id, ...(opts.scoped ? { tenantId: currentTenantId() } : {}) }, include: ticketInclude });
    if (!t) throw new NotFoundException('Ticket not found');
    const messages = await this.prisma.root.supportMessage.findMany({
      where: { ticketId: id, ...(opts.scoped ? { internal: false } : {}) },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...this.row(t),
      thread: messages.map((m) => ({
        id: m.id,
        body: m.body,
        fromPlatform: m.fromPlatform,
        internal: m.internal,
        // Schools see "AI School OS support", not which staff member replied.
        author: m.author ? (opts.scoped && m.fromPlatform ? { id: '', name: 'AI School OS support' } : { id: m.author.id, name: fullName(m.author) }) : null,
        createdAt: m.createdAt.toISOString(),
      })),
      firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
    };
  }

  async open(tenantId: string, userId: string, input: { subject: string; category: string; priority: string; body: string }) {
    const t = await this.prisma.db.supportTicket.create({
      data: { tenantId, openedById: userId, subject: input.subject, category: input.category, priority: input.priority, awaitingPlatform: true },
    });
    await this.prisma.db.supportMessage.create({ data: { tenantId, ticketId: t.id, authorId: userId, body: input.body } });
    await this.audit.log({ action: 'support.ticket_opened', entityType: 'SupportTicket', entityId: t.id, summary: `Opened support ticket #${t.number}: ${t.subject}` });
    return this.detail(t.id, { scoped: true });
  }

  async schoolReply(id: string, userId: string, body: string) {
    const t = await this.prisma.db.supportTicket.findFirst({ where: { id } });
    if (!t) throw new NotFoundException('Ticket not found');
    if (t.status === 'CLOSED') throw new BadRequestException('This ticket is closed. Open a new one if you still need help.');
    await this.prisma.db.supportMessage.create({ data: { tenantId: t.tenantId, ticketId: id, authorId: userId, body } });
    await this.prisma.db.supportTicket.update({ where: { id }, data: { lastMessageAt: new Date(), awaitingPlatform: true, status: 'OPEN', resolvedAt: null } });
    return this.detail(id, { scoped: true });
  }

  async schoolClose(id: string) {
    const t = await this.prisma.db.supportTicket.findFirst({ where: { id } });
    if (!t) throw new NotFoundException('Ticket not found');
    await this.prisma.db.supportTicket.update({ where: { id }, data: { status: 'CLOSED', awaitingPlatform: false, resolvedAt: t.resolvedAt ?? new Date() } });
    return this.detail(id, { scoped: true });
  }

  /** A platform reply notifies whoever opened the ticket, inside their school. */
  async platformReply(id: string, userId: string, input: { body: string; internal: boolean; status?: TicketStatus }) {
    const t = await this.prisma.root.supportTicket.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Ticket not found');
    const now = new Date();
    await this.prisma.root.supportMessage.create({ data: { tenantId: t.tenantId, ticketId: id, authorId: userId, fromPlatform: true, internal: input.internal, body: input.body } });
    if (!input.internal) {
      const status = input.status ?? 'PENDING';
      await this.prisma.root.supportTicket.update({
        where: { id },
        data: {
          lastMessageAt: now,
          awaitingPlatform: false,
          status,
          firstResponseAt: t.firstResponseAt ?? now,
          resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? (t.resolvedAt ?? now) : null,
          assignedToId: t.assignedToId ?? userId,
        },
      });
      if (t.openedById) {
        await this.prisma.root.notification.create({
          data: { tenantId: t.tenantId, userId: t.openedById, title: `Support replied to #${t.number}`, body: input.body.slice(0, 180), link: `/support/${t.id}` },
        });
      }
    } else if (input.status) {
      await this.prisma.root.supportTicket.update({ where: { id }, data: { status: input.status } });
    }
    return this.detail(id, { scoped: false });
  }

  async update(id: string, input: { status?: TicketStatus; priority?: string; category?: string; assignedToId?: string | null }) {
    const t = await this.prisma.root.supportTicket.findUniqueOrThrow({ where: { id } });
    if (input.assignedToId) {
      const u = await this.prisma.root.user.findUnique({ where: { id: input.assignedToId }, select: { platformRole: true } });
      if (!u?.platformRole) throw new BadRequestException('Tickets can only be assigned to platform staff');
    }
    const resolving = input.status === 'RESOLVED' || input.status === 'CLOSED';
    await this.prisma.root.supportTicket.update({
      where: { id },
      data: {
        ...input,
        ...(input.status ? { resolvedAt: resolving ? (t.resolvedAt ?? new Date()) : null, ...(resolving ? { awaitingPlatform: false } : {}) } : {}),
      },
    });
    await this.audit.log({ tenantId: null, action: 'support.ticket_updated', entityType: 'SupportTicket', entityId: id, summary: `Updated ticket #${t.number}: ${Object.entries(input).map(([k, v]) => `${k} ${v ?? 'none'}`).join(', ')}` });
    return this.detail(id, { scoped: false });
  }

  /** AI triage and a draft reply, from the thread and the school's account facts. */
  async assist(id: string): Promise<TicketAssist> {
    const t = await this.detail(id, { scoped: false });
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: t.tenant.id },
      select: { name: true, status: true, trialEndsAt: true, plan: { select: { name: true } }, _count: { select: { students: { where: { status: 'ACTIVE' } } } } },
    });
    const thread = t.thread.map((m) => `${m.internal ? '[internal note] ' : ''}${m.fromPlatform ? 'SUPPORT' : 'SCHOOL'} (${m.author?.name ?? 'unknown'}, ${m.createdAt.slice(0, 16)}): ${m.body}`).join('\n\n');
    const facts = `School: ${tenant.name}; account ${tenant.status}${tenant.trialEndsAt ? `, trial ends ${tenant.trialEndsAt.toISOString().slice(0, 10)}` : ''}; plan ${tenant.plan?.name ?? 'none'}; ${tenant._count.students} active students.`;
    const r = await this.gateway.generateJson(
      {
        tier: 'standard',
        system: [
          'You help the support team of AI School OS, a school management SaaS used by Nigerian schools. Read the ticket and produce a triage and a draft reply for a support agent to edit before sending.',
          'British English, warm and plain. Never invent features, policies, refunds or timelines; if something needs checking, say the team will check and come back.',
          'Never ask the school for passwords or full card details.',
          '',
          `ACCOUNT: ${facts}`,
          `TICKET #${t.number} (${t.category}, ${t.priority}, ${t.status}): ${t.subject}`,
        ].join('\n'),
        messages: [{ role: 'user', content: thread.slice(-12_000) }],
        maxOutputTokens: 900,
      },
      assistSchema,
      'support-assist',
    );
    return { ...r.data, provider: r.provider, model: r.model };
  }
}
