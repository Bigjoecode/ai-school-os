import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  MODULE_FEATURE_KEYS,
  PLATFORM_AREAS,
  planSchema,
  platformTenantUpdateSchema,
  tenantFeatureSchema,
  tenantStatusSchema,
  type PlanInput,
  type PlanRow,
  type PlatformBriefing,
  type PlatformOverview,
  type PlatformSchoolRow,
  type TenantStatusKey,
} from '@aischool/shared';
import { z } from 'zod';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RequirePlatformRole } from '../common/decorators';
import { dateOnly, fullName } from '../common/format';
import { currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { FeatureService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformBillingService } from './billing.service';

const DAY = 86_400_000;
const monthStart = (offset = 0) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
};
const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const sumBy = <T>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0);

const briefingSchema = z.object({
  headline: z.string().describe('One line: the most important thing about the platform this week'),
  summary: z.string().describe('3–4 sentences on revenue, growth, usage and support'),
  risks: z.array(z.object({ school: z.string(), issue: z.string(), action: z.string() })).describe('Up to 5 schools at risk (overdue, inactive, trial ending without engagement, over budget, urgent tickets)'),
  opportunities: z.array(z.object({ school: z.string(), insight: z.string(), action: z.string() })).describe('Up to 4 upsell or success opportunities (near plan limits, heavy AI use, growing fast)'),
  operations: z.array(z.string()).describe('Up to 4 notes on platform health: errors, AI failures, queues'),
});

/** The SaaS operator console: overview, schools, branches, plans and the platform team. */
@Controller('platform')
export class ConsoleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: PlatformBillingService,
    private readonly features: FeatureService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- overview

  @Get('overview')
  @RequirePlatformRole(...PLATFORM_AREAS.overview)
  async overview(): Promise<PlatformOverview> {
    const root = this.prisma.root;
    const now = new Date();
    const since24h = new Date(now.getTime() - DAY);
    const yearAgo = monthStart(-11);
    const [tenants, students, staff, users, subs, openInvoices, paidThisMonth, ai, aiLast, api, tickets, urgent, payments] = await Promise.all([
      root.tenant.findMany({ select: { id: true, name: true, slug: true, status: true, createdAt: true, trialEndsAt: true } }),
      root.student.count({ where: { status: 'ACTIVE' } }),
      root.staff.count({ where: { status: { not: 'EXITED' } } }),
      root.user.count({ where: { status: 'ACTIVE' } }),
      root.subscription.findMany({ where: { status: { in: ['ACTIVE', 'PAST_DUE'] } }, include: { plan: true } }),
      root.platformInvoice.findMany({ where: { status: 'OPEN' }, select: { amountKobo: true, paidKobo: true, dueDate: true } }),
      root.platformPayment.aggregate({ where: { status: 'SUCCESS', paidAt: { gte: monthStart() } }, _sum: { amountKobo: true } }),
      root.aiUsage.aggregate({ where: { createdAt: { gte: monthStart() } }, _sum: { costUsd: true } }),
      root.aiUsage.aggregate({ where: { createdAt: { gte: monthStart(-1), lt: monthStart() } }, _sum: { costUsd: true } }),
      root.apiUsageDaily.findMany({ where: { day: { gte: new Date(since24h.toISOString().slice(0, 10)) } } }),
      root.supportTicket.count({ where: { status: { in: ['OPEN', 'PENDING'] } } }),
      root.supportTicket.count({ where: { status: { in: ['OPEN', 'PENDING'] }, priority: 'URGENT' } }),
      root.platformPayment.findMany({ where: { status: 'SUCCESS', paidAt: { gte: yearAgo } }, select: { amountKobo: true, paidAt: true } }),
    ]);
    const active = await this.billing.activeStudents(subs.map((s) => s.tenantId));
    const mrr = sumBy(subs, (s) => this.billing.quote(s, active.get(s.tenantId) ?? 0).monthly);
    const today = new Date(now.toISOString().slice(0, 10));
    const byStatus = { TRIAL: 0, ACTIVE: 0, SUSPENDED: 0, ARCHIVED: 0 } as Record<TenantStatusKey, number>;
    for (const t of tenants) byStatus[t.status as TenantStatusKey]++;
    const soon = tenants
      .filter((t) => t.status === 'TRIAL' && t.trialEndsAt && t.trialEndsAt.getTime() - now.getTime() < 14 * DAY)
      .sort((a, b) => a.trialEndsAt!.getTime() - b.trialEndsAt!.getTime());
    const soonStudents = await this.billing.activeStudents(soon.map((t) => t.id));
    const months = Array.from({ length: 12 }, (_, i) => monthKey(monthStart(i - 11)));
    const apiRequests = sumBy(api, (r) => r.requests);
    return {
      schools: { ...byStatus, total: tenants.length, newThisMonth: tenants.filter((t) => t.createdAt >= monthStart()).length },
      students,
      staff,
      users,
      mrrKobo: mrr,
      arrKobo: mrr * 12,
      collectedThisMonthKobo: paidThisMonth._sum.amountKobo ?? 0,
      outstandingKobo: sumBy(openInvoices, (i) => i.amountKobo - i.paidKobo),
      overdueKobo: sumBy(openInvoices.filter((i) => i.dueDate < today), (i) => i.amountKobo - i.paidKobo),
      overdueInvoices: openInvoices.filter((i) => i.dueDate < today).length,
      pastDue: subs.filter((s) => s.status === 'PAST_DUE').length,
      trialsEndingSoon: soon.slice(0, 8).map((t) => ({ id: t.id, name: t.name, slug: t.slug, trialEndsAt: t.trialEndsAt!.toISOString(), students: soonStudents.get(t.id) ?? 0 })),
      aiSpendThisMonthUsd: Math.round(Number(ai._sum.costUsd ?? 0) * 100) / 100,
      aiSpendLastMonthUsd: Math.round(Number(aiLast._sum.costUsd ?? 0) * 100) / 100,
      apiRequests24h: apiRequests,
      apiErrorRate24h: apiRequests ? Math.round((sumBy(api, (r) => r.serverErrors) / apiRequests) * 10_000) / 100 : 0,
      openTickets: tickets,
      urgentTickets: urgent,
      signups: months.map((m) => ({ month: m, count: tenants.filter((t) => monthKey(t.createdAt) === m).length })),
      revenue: months.map((m) => ({ month: m, kobo: sumBy(payments.filter((p) => p.paidAt && monthKey(p.paidAt) === m), (p) => p.amountKobo) })),
    };
  }

  /** The AI weekly briefing for the operator: risks, opportunities and platform health. */
  @Post('ai/briefing')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async briefing(): Promise<PlatformBriefing> {
    const o = await this.overview();
    const schools = await this.schoolRows();
    const facts = [
      `Schools: ${o.schools.total} (${o.schools.ACTIVE} active, ${o.schools.TRIAL} on trial, ${o.schools.SUSPENDED} suspended), ${o.schools.newThisMonth} new this month. ${o.students} active students.`,
      `MRR ₦${(o.mrrKobo / 100).toLocaleString('en-NG')}; collected this month ₦${(o.collectedThisMonthKobo / 100).toLocaleString('en-NG')}; outstanding ₦${(o.outstandingKobo / 100).toLocaleString('en-NG')} of which overdue ₦${(o.overdueKobo / 100).toLocaleString('en-NG')} (${o.overdueInvoices} invoices); ${o.pastDue} subscriptions past due.`,
      `AI spend this month $${o.aiSpendThisMonthUsd} (last month $${o.aiSpendLastMonthUsd}). API requests 24h ${o.apiRequests24h}, server error rate ${o.apiErrorRate24h}%. Open tickets ${o.openTickets} (${o.urgentTickets} urgent).`,
      'SCHOOLS (name | status | plan | subscription | students | AI $ this month | API requests 30d | outstanding ₦ | last active | trial ends):',
      ...schools.map((s) => `${s.name} | ${s.status} | ${s.plan ?? '-'} | ${s.subscriptionStatus ?? '-'} | ${s.students} | ${s.aiSpendUsd} | ${s.apiRequests30d} | ${(s.outstandingKobo / 100).toLocaleString('en-NG')} | ${s.lastActiveAt?.slice(0, 10) ?? 'never'} | ${s.trialEndsAt?.slice(0, 10) ?? '-'}`),
    ].join('\n');
    const r = await this.gateway.generateJson(
      {
        tier: 'standard',
        system: 'You brief the operator of AI School OS, a school management SaaS for Nigerian schools. Use only the facts given; name schools exactly as listed; be concrete and brief; British English; money in naira as given.',
        messages: [{ role: 'user', content: facts.slice(0, 30_000) }],
        maxOutputTokens: 1200,
      },
      briefingSchema,
      'platform-briefing',
    );
    return { ...r.data, provider: r.provider, model: r.model };
  }

  // ---------------------------------------------------------- schools

  private async schoolRows(onlyId?: string): Promise<PlatformSchoolRow[]> {
    const root = this.prisma.root;
    const since30 = new Date(Date.now() - 30 * DAY);
    const [tenants, students, staff, ai, api, logins] = await Promise.all([
      root.tenant.findMany({
        where: onlyId ? { id: onlyId } : undefined,
        include: { plan: { select: { name: true } }, subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } }, _count: { select: { memberships: true, branches: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      root.student.groupBy({ by: ['tenantId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
      root.staff.groupBy({ by: ['tenantId'], where: { status: { not: 'EXITED' } }, _count: { _all: true } }),
      root.aiUsage.groupBy({ by: ['tenantId'], where: { createdAt: { gte: monthStart() } }, _sum: { costUsd: true } }),
      root.apiUsageDaily.groupBy({ by: ['scope'], where: { day: { gte: since30 } }, _sum: { requests: true }, _max: { day: true } }),
      root.$queryRaw<{ tenantId: string; last: Date | null }[]>`SELECT m."tenantId", MAX(u."lastLoginAt") AS last FROM "memberships" m JOIN "users" u ON u."id" = m."userId" GROUP BY m."tenantId"`,
    ]);
    const outstanding = await this.billing.outstanding(tenants.map((t) => t.id));
    const count = (rows: { tenantId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.tenantId, r._count._all]));
    const s = count(students);
    const st = count(staff);
    const aiBy = new Map(ai.map((r) => [r.tenantId, Number(r._sum.costUsd ?? 0)]));
    const apiBy = new Map(api.map((r) => [r.scope, r]));
    const loginBy = new Map(logins.map((r) => [r.tenantId, r.last]));
    return tenants.map((t) => {
      const lastApi = apiBy.get(t.id)?._max.day ?? null;
      const lastLogin = loginBy.get(t.id) ?? null;
      const last = [lastApi, lastLogin].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        status: t.status as TenantStatusKey,
        plan: t.plan?.name ?? null,
        subscriptionStatus: (t.subscriptions[0]?.status as PlatformSchoolRow['subscriptionStatus']) ?? null,
        students: s.get(t.id) ?? 0,
        staff: st.get(t.id) ?? 0,
        users: t._count.memberships,
        branches: t._count.branches,
        aiSpendUsd: Math.round((aiBy.get(t.id) ?? 0) * 100) / 100,
        apiRequests30d: apiBy.get(t.id)?._sum.requests ?? 0,
        outstandingKobo: outstanding.get(t.id) ?? 0,
        lastActiveAt: last?.toISOString() ?? null,
        trialEndsAt: t.trialEndsAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      };
    });
  }

  @Get('schools')
  @RequirePlatformRole(...PLATFORM_AREAS.schools)
  schools(): Promise<PlatformSchoolRow[]> {
    return this.schoolRows();
  }

  @Get('schools/:id')
  @RequirePlatformRole(...PLATFORM_AREAS.schools)
  async school(@Param('id') id: string) {
    const root = this.prisma.root;
    const t = await root.tenant.findUnique({
      where: { id },
      include: { plan: true, domains: { orderBy: { createdAt: 'asc' } }, branches: { orderBy: [{ isMain: 'desc' }, { name: 'asc' }] } },
    });
    if (!t) throw new NotFoundException('School not found');
    const since30 = new Date(Date.now() - 30 * DAY);
    const [row] = await this.schoolRows(id);
    const [counts, admins, branchStudents, api, aiCalls, audit, invoices, tickets, sub, states] = await Promise.all([
      Promise.all([
        root.classArm.count({ where: { tenantId: id } }),
        root.guardian.count({ where: { tenantId: id } }),
        root.subject.count({ where: { tenantId: id } }),
        root.invoice.count({ where: { tenantId: id } }),
      ]),
      root.membership.findMany({
        where: { tenantId: id, status: 'ACTIVE', roles: { some: { role: { key: { in: ['school_admin', 'principal'] } } } } },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true, lastLoginAt: true } }, roles: { include: { role: { select: { name: true } } } } },
      }),
      root.student.groupBy({ by: ['branchId'], where: { tenantId: id, status: 'ACTIVE' }, _count: { _all: true } }),
      root.apiUsageDaily.findMany({ where: { scope: id, day: { gte: since30 } }, orderBy: { day: 'asc' } }),
      root.aiUsage.count({ where: { tenantId: id, createdAt: { gte: since30 } } }),
      root.auditLog.findMany({ where: { tenantId: id }, include: { actor: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 25 }),
      root.platformInvoice.findMany({ where: { tenantId: id }, include: { tenant: true }, orderBy: { issuedAt: 'desc' }, take: 12 }),
      root.supportTicket.findMany({ where: { tenantId: id }, orderBy: { lastMessageAt: 'desc' }, take: 8, select: { id: true, number: true, subject: true, status: true, priority: true, lastMessageAt: true } }),
      this.billing.current(id),
      this.features.states(id),
    ]);
    const perBranch = new Map(branchStudents.map((b) => [b.branchId, b._count._all]));
    return {
      ...row,
      shortName: t.shortName,
      email: t.email,
      phone: t.phone,
      address: t.address,
      country: t.country,
      currency: t.currency,
      timezone: t.timezone,
      aiMonthlyBudgetUsd: t.aiMonthlyBudgetUsd !== null ? Number(t.aiMonthlyBudgetUsd) : null,
      defaultAiBudgetUsd: env().AI_DEFAULT_MONTHLY_BUDGET_USD,
      planId: t.planId,
      counts: { classes: counts[0], guardians: counts[1], subjects: counts[2], feeInvoices: counts[3], aiCalls30d: aiCalls },
      admins: admins.map((m) => ({ id: m.user.id, name: fullName(m.user), email: m.user.email, roles: m.roles.map((r) => r.role.name), lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null })),
      branches: t.branches.map((b) => ({ id: b.id, name: b.name, code: b.code, isMain: b.isMain, students: perBranch.get(b.id) ?? 0 })),
      unassignedStudents: perBranch.get(null) ?? 0,
      domains: t.domains.map((d) => ({ id: d.id, hostname: d.hostname, kind: d.kind, isPrimary: d.isPrimary, verifiedAt: d.verifiedAt?.toISOString() ?? null })),
      apiDaily: api.map((d) => ({ day: dateOnly(d.day)!, requests: d.requests, serverErrors: d.serverErrors })),
      subscription: sub ? this.billing.subscriptionRow(sub, row?.students ?? 0, row?.outstandingKobo ?? 0) : null,
      invoices: invoices.map((i) => this.billing.invoiceRow(i)),
      tickets: tickets.map((x) => ({ ...x, lastMessageAt: x.lastMessageAt.toISOString() })),
      features: states,
      audit: audit.map((a) => ({ id: a.id, action: a.action, summary: a.summary, actor: a.actor ? fullName(a.actor) : null, createdAt: a.createdAt.toISOString() })),
    };
  }

  @Put('schools/:id')
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN')
  async updateSchool(@Param('id') id: string, @Body(new ZodPipe(platformTenantUpdateSchema)) body: z.infer<typeof platformTenantUpdateSchema>) {
    const t = await this.prisma.root.tenant.update({
      where: { id },
      data: { ...body, trialEndsAt: body.trialEndsAt ? new Date(`${body.trialEndsAt}T23:59:59Z`) : null },
    });
    await this.audit.log({ tenantId: null, action: 'platform.school_updated', entityType: 'Tenant', entityId: id, summary: `Updated ${t.name}'s account details` });
    return { ok: true };
  }

  @Post('schools/:id/status')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN')
  async setStatus(@Param('id') id: string, @Body(new ZodPipe(tenantStatusSchema)) body: z.infer<typeof tenantStatusSchema>) {
    const before = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id } });
    if (before.status === body.status) return { status: body.status };
    await this.prisma.root.tenant.update({ where: { id }, data: { status: body.status } });
    if (body.status === 'SUSPENDED' || body.status === 'ARCHIVED') {
      // Signed-in users lose access on their next request (access is resolved per request); end their sessions too.
      await this.prisma.root.authSession.updateMany({ where: { tenantId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    const verb = { ACTIVE: 'Activated', TRIAL: 'Moved to trial', SUSPENDED: 'Suspended', ARCHIVED: 'Archived' }[body.status];
    await this.audit.log({ tenantId: null, action: `platform.school_${body.status.toLowerCase()}`, entityType: 'Tenant', entityId: id, summary: `${verb} ${before.name}: ${body.reason}` });
    await this.audit.log({ tenantId: id, action: `platform.school_${body.status.toLowerCase()}`, summary: `${verb} by AI School OS: ${body.reason}` });
    return { status: body.status };
  }

  /** Moves a school to another plan, starting a subscription if it has none. */
  @Post('schools/:id/plan')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN', 'FINANCE_ADMIN')
  async changePlan(@Param('id') id: string, @Body(new ZodPipe(z.object({ planId: z.string().min(1) }))) body: { planId: string }) {
    const [t, plan] = await Promise.all([this.prisma.root.tenant.findUniqueOrThrow({ where: { id } }), this.prisma.root.plan.findUnique({ where: { id: body.planId } })]);
    if (!plan || !plan.isActive) throw new BadRequestException('Choose an active plan');
    await this.prisma.root.tenant.update({ where: { id }, data: { planId: plan.id } });
    const sub = await this.billing.current(id);
    if (sub && sub.status !== 'CANCELLED') {
      await this.prisma.root.subscription.update({ where: { id: sub.id }, data: { planId: plan.id } });
    } else {
      const start = new Date();
      await this.prisma.root.subscription.create({
        data: { tenantId: id, planId: plan.id, status: t.status === 'TRIAL' ? 'TRIALING' : 'ACTIVE', currentPeriodStart: start, currentPeriodEnd: t.status === 'TRIAL' && t.trialEndsAt ? t.trialEndsAt : new Date(start.getTime() + 30 * DAY) },
      });
    }
    this.features.invalidate(id);
    await this.audit.log({ tenantId: null, action: 'platform.plan_changed', entityType: 'Tenant', entityId: id, summary: `Moved ${t.name} to the ${plan.name} plan` });
    return { ok: true };
  }

  @Put('schools/:id/features/:key')
  @RequirePlatformRole('SUPER_ADMIN')
  async setFeature(@Param('id') id: string, @Param('key') key: string, @Body(new ZodPipe(tenantFeatureSchema)) body: z.infer<typeof tenantFeatureSchema>) {
    const [t, flag] = await Promise.all([this.prisma.root.tenant.findUniqueOrThrow({ where: { id } }), this.prisma.root.featureFlag.findUnique({ where: { key } })]);
    if (!flag) throw new NotFoundException('Unknown feature');
    if (body.enabled === null) {
      await this.prisma.root.tenantFeature.deleteMany({ where: { tenantId: id, flagKey: key } });
    } else {
      await this.prisma.root.tenantFeature.upsert({
        where: { tenantId_flagKey: { tenantId: id, flagKey: key } },
        update: { enabled: body.enabled, note: body.note },
        create: { tenantId: id, flagKey: key, enabled: body.enabled, note: body.note },
      });
    }
    this.features.invalidate(id);
    await this.audit.log({ tenantId: null, action: 'platform.feature_override', entityType: 'Tenant', entityId: id, summary: `${body.enabled === null ? 'Cleared the override for' : body.enabled ? 'Turned on' : 'Turned off'} ${flag.name} for ${t.name}${body.note ? ` (${body.note})` : ''}` });
    return this.features.states(id);
  }

  // ---------------------------------------------------------- branches

  @Get('branches')
  @RequirePlatformRole(...PLATFORM_AREAS.schools)
  async branches() {
    const [rows, students, staff] = await Promise.all([
      this.prisma.root.branch.findMany({ include: { tenant: { select: { id: true, name: true, slug: true, status: true } } }, orderBy: [{ tenant: { name: 'asc' } }, { isMain: 'desc' }, { name: 'asc' }] }),
      this.prisma.root.student.groupBy({ by: ['branchId'], where: { status: 'ACTIVE', branchId: { not: null } }, _count: { _all: true } }),
      this.prisma.root.classArm.groupBy({ by: ['branchId'], where: { branchId: { not: null } }, _count: { _all: true } }),
    ]);
    const s = new Map(students.map((r) => [r.branchId, r._count._all]));
    const c = new Map(staff.map((r) => [r.branchId, r._count._all]));
    return rows.map((b) => ({ id: b.id, name: b.name, code: b.code, isMain: b.isMain, address: b.address ?? null, tenant: b.tenant, students: s.get(b.id) ?? 0, classes: c.get(b.id) ?? 0, createdAt: b.createdAt.toISOString() }));
  }

  // ---------------------------------------------------------- plans

  @Get('plans')
  @RequirePlatformRole(...PLATFORM_AREAS.schools)
  async plans(): Promise<PlanRow[]> {
    const rows = await this.prisma.root.plan.findMany({
      include: { _count: { select: { tenants: true, subscriptions: { where: { status: { in: ['ACTIVE', 'PAST_DUE', 'TRIALING'] } } } } } },
      orderBy: [{ sortOrder: 'asc' }, { pricePerStudentKobo: 'asc' }],
    });
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      pricePerStudentKobo: p.pricePerStudentKobo,
      billingPeriod: p.billingPeriod,
      aiMonthlyBudgetUsd: p.aiMonthlyBudgetUsd !== null ? Number(p.aiMonthlyBudgetUsd) : null,
      maxStudents: p.maxStudents,
      features: p.features,
      isActive: p.isActive,
      isPublic: p.isPublic,
      sortOrder: p.sortOrder,
      schools: p._count.tenants,
      activeSubscriptions: p._count.subscriptions,
    }));
  }

  private planData(body: PlanInput) {
    const unknown = body.features.filter((f) => !(MODULE_FEATURE_KEYS as string[]).includes(f));
    if (unknown.length) throw new BadRequestException(`Unknown modules: ${unknown.join(', ')}`);
    return body;
  }

  @Post('plans')
  @RequirePlatformRole('SUPER_ADMIN', 'FINANCE_ADMIN')
  async createPlan(@Body(new ZodPipe(planSchema)) body: PlanInput) {
    if (await this.prisma.root.plan.findUnique({ where: { code: body.code } })) throw new ConflictException('A plan with that code exists');
    const p = await this.prisma.root.plan.create({ data: this.planData(body) });
    await this.audit.log({ tenantId: null, action: 'platform.plan_created', entityType: 'Plan', entityId: p.id, summary: `Created the ${p.name} plan` });
    return p;
  }

  @Put('plans/:id')
  @RequirePlatformRole('SUPER_ADMIN', 'FINANCE_ADMIN')
  async updatePlan(@Param('id') id: string, @Body(new ZodPipe(planSchema)) body: PlanInput) {
    const clash = await this.prisma.root.plan.findFirst({ where: { code: body.code, id: { not: id } } });
    if (clash) throw new ConflictException('A plan with that code exists');
    const p = await this.prisma.root.plan.update({ where: { id }, data: this.planData(body) });
    this.features.invalidate();
    await this.audit.log({ tenantId: null, action: 'platform.plan_updated', entityType: 'Plan', entityId: p.id, summary: `Updated the ${p.name} plan` });
    return p;
  }

  @Delete('plans/:id')
  @HttpCode(204)
  @RequirePlatformRole('SUPER_ADMIN')
  async deletePlan(@Param('id') id: string) {
    const p = await this.prisma.root.plan.findUniqueOrThrow({ where: { id }, include: { _count: { select: { tenants: true, subscriptions: true } } } });
    if (p._count.tenants || p._count.subscriptions) throw new BadRequestException('Schools use this plan; retire it (switch it off) instead');
    await this.prisma.root.plan.delete({ where: { id } });
    await this.audit.log({ tenantId: null, action: 'platform.plan_deleted', summary: `Deleted the ${p.name} plan` });
  }

  // ---------------------------------------------------------- the team

  @Get('team')
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN')
  async team() {
    const rows = await this.prisma.root.user.findMany({ where: { platformRole: { not: null } }, orderBy: [{ platformRole: 'asc' }, { firstName: 'asc' }] });
    return rows.map((u) => ({ id: u.id, name: fullName(u), email: u.email, platformRole: u.platformRole, status: u.status, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, isYou: u.id === currentUserId() }));
  }

}
