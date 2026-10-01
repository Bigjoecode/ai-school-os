import { ForbiddenException, Injectable } from '@nestjs/common';
import { formatMoney, type AiAgent, type AiChatInput, type AiChatResponse, type AiStatus, type Permission } from '@aischool/shared';
import { dateOnly } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
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
  hr: 'hr.read',
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
    if (agent === 'finance') {
      return [snapshotToText(await this.snapshot.overview()), await this.financeText()].join('\n\n');
    }
    if (agent === 'hr') {
      return [snapshotToText(await this.snapshot.overview()), await this.hrText()].join('\n\n');
    }
    if (agent === 'school' || agent === 'admissions') {
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

  /** Fees, collections and spending for the Finance AI (finance.read is required to open it). */
  private async financeText(): Promise<string> {
    const db = this.prisma.db;
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { currency: true, timezone: true } });
    const money = (k: number) => formatMoney(k, tenant.currency);
    const term = await db.term.findFirst({ where: { isCurrent: true } });
    if (!term) return 'FINANCE DATA\nNo current term is set.';
    const today = schoolNow(tenant.timezone).date;
    const monthStart = `${today.slice(0, 7)}-01`;
    const prev = new Date(`${monthStart}T00:00:00Z`);
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);

    const [invoices, expenses, recent] = await Promise.all([
      db.invoice.findMany({
        where: { termId: term.id, status: { not: 'CANCELLED' } },
        include: { student: { select: { firstName: true, lastName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } } },
      }),
      db.expense.findMany({ where: { spentOn: { gte: prev } } }),
      db.payment.findMany({ where: { status: 'SUCCESS', paidAt: { gte: weekAgo } }, select: { amountKobo: true } }),
    ]);
    if (!invoices.length) return `FINANCE DATA\nNo invoices have been issued for ${term.name} yet.`;

    const billed = invoices.reduce((n, i) => n + i.totalKobo, 0);
    const paid = invoices.reduce((n, i) => n + i.paidKobo, 0);
    const owing = invoices.filter((i) => i.totalKobo > i.paidKobo);
    const overdue = owing.filter((i) => dateOnly(i.dueDate)! < today);
    const byClass = new Map<string, { b: number; p: number }>();
    for (const i of invoices) {
      const k = i.student.classArm ? `${i.student.classArm.classLevel.name} ${i.student.classArm.name}` : '-';
      const c = byClass.get(k) ?? { b: 0, p: 0 };
      c.b += i.totalKobo;
      c.p += i.paidKobo;
      byClass.set(k, c);
    }
    const monthExp = expenses.filter((e) => dateOnly(e.spentOn)! >= monthStart);
    const lastMonthExp = expenses.filter((e) => dateOnly(e.spentOn)! < monthStart);
    const byCat = new Map<string, number>();
    for (const e of monthExp) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amountKobo);
    const balance = (i: { totalKobo: number; paidKobo: number }) => i.totalKobo - i.paidKobo;

    return [
      'FINANCE DATA',
      `${term.name}: billed ${money(billed)}, collected ${money(paid)} (${billed ? Math.round((paid / billed) * 1000) / 10 : 0}%), outstanding ${money(billed - paid)} across ${owing.length} of ${invoices.length} invoices; overdue ${money(overdue.reduce((n, i) => n + balance(i), 0))} on ${overdue.length} invoices.`,
      `Collection by class: ${[...byClass].map(([k, c]) => `${k} ${c.b ? Math.round((c.p / c.b) * 100) : 0}%`).join(', ')}.`,
      `Largest balances: ${[...owing]
        .sort((a, b) => balance(b) - balance(a))
        .slice(0, 10)
        .map((i) => `${i.student.firstName} ${i.student.lastName} (${i.number}) ${money(balance(i))}`)
        .join('; ')}.`,
      `Payments in the last 7 days: ${money(recent.reduce((n, p) => n + p.amountKobo, 0))} from ${recent.length} payments.`,
      `Spending this month: ${money(monthExp.reduce((n, e) => n + e.amountKobo, 0))} (${[...byCat].map(([c, a]) => `${c} ${money(a)}`).join(', ') || 'none'}); last month ${money(lastMonthExp.reduce((n, e) => n + e.amountKobo, 0))}.`,
    ].join('\n');
  }

  /** Staff, leave, punctuality, awards and (with payroll.read) pay for the HR AI. */
  private async hrText(): Promise<string> {
    const db = this.prisma.db;
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { currency: true, timezone: true } });
    const money = (k: number) => formatMoney(k, tenant.currency);
    const today = schoolNow(tenant.timezone).date;
    const d = new Date(`${today}T00:00:00.000Z`);
    const month = today.slice(0, 7);
    const [staff, leave, attendance, awards] = await Promise.all([
      db.staff.findMany({
        where: { status: { not: 'EXITED' } },
        select: { id: true, firstName: true, lastName: true, jobTitle: true, type: true, gender: true, employedOn: true, department: { select: { name: true } } },
        orderBy: [{ lastName: 'asc' }],
      }),
      db.leaveRequest.findMany({
        where: { status: { in: ['PENDING', 'APPROVED'] }, endDate: { gte: d } },
        include: { staff: { select: { firstName: true, lastName: true } }, leaveType: { select: { name: true } } },
        orderBy: { startDate: 'asc' },
        take: 40,
      }),
      db.staffAttendance.groupBy({ by: ['staffId', 'status'], where: { date: { gte: new Date(`${month}-01T00:00:00.000Z`), lte: d } }, _count: { _all: true } }),
      db.award.findMany({ include: { staff: { select: { firstName: true, lastName: true } } }, orderBy: { awardedOn: 'desc' }, take: 10 }),
    ]);
    const late = new Map<string, number>();
    const absent = new Map<string, number>();
    for (const a of attendance) {
      if (a.status === 'LATE') late.set(a.staffId, a._count._all);
      if (a.status === 'ABSENT') absent.set(a.staffId, a._count._all);
    }
    const lines = [
      'HR DATA',
      `Staff (${staff.length} active): ` +
        staff
          .map(
            (s) =>
              `${s.firstName} ${s.lastName} — ${s.jobTitle}${s.department ? `, ${s.department.name}` : ''}${s.employedOn ? `, since ${dateOnly(s.employedOn)!.slice(0, 4)}` : ''}` +
              `${late.get(s.id) ? `, late ${late.get(s.id)}× this month` : ''}${absent.get(s.id) ? `, absent ${absent.get(s.id)}× this month` : ''}`,
          )
          .join('; '),
      `Leave (pending and current/upcoming approved): ${
        leave.map((l) => `${l.staff.firstName} ${l.staff.lastName} ${l.leaveType.name} ${dateOnly(l.startDate)} to ${dateOnly(l.endDate)} (${l.days} days, ${l.status.toLowerCase()})`).join('; ') || 'none'
      }`,
      `Recent awards: ${awards.map((a) => `${a.title} — ${a.staff.firstName} ${a.staff.lastName} (${dateOnly(a.awardedOn)})`).join('; ') || 'none'}`,
    ];
    if (currentContext().permissions.has('payroll.read')) {
      const runs = await db.payrollRun.findMany({ orderBy: { period: 'desc' }, take: 3, include: { payslips: { select: { grossKobo: true, netKobo: true, payeKobo: true } } } });
      lines.push(
        `Payroll (latest first): ${
          runs
            .map((r) => `${r.period} ${r.status.toLowerCase()}: ${r.payslips.length} staff, gross ${money(r.payslips.reduce((n, p) => n + p.grossKobo, 0))}, net ${money(r.payslips.reduce((n, p) => n + p.netKobo, 0))}, PAYE ${money(r.payslips.reduce((n, p) => n + p.payeKobo, 0))}`)
            .join('; ') || 'no payroll prepared yet'
        }`,
      );
    } else {
      lines.push('Payroll: not available to this user.');
    }
    return lines.join('\n');
  }
}
