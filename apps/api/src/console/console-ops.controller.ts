import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { promises as dns } from 'node:dns';
import {
  PLATFORM_AREAS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  auditQuerySchema,
  domainSchema,
  featureFlagSchema,
  ticketReplySchema,
  ticketUpdateSchema,
  type ApiUsageReport,
  type DomainRow,
  type FeatureFlagRow,
  type FlagKind,
  type HealthCheck,
  type PlatformAiUsageReport,
  type PlatformAuditRow,
  type StudentUsageReport,
  type SystemHealth,
  type TenantStatusKey,
  type TicketAssist,
  type TicketDetail,
  type TicketPriority,
  type TicketRow,
  type TicketStatus,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AlertService, sendAlertNow } from '../alerts/alerts.service';
import { AuditService } from '../audit/audit.service';
import { RequirePlatformRole } from '../common/decorators';
import { dateOnly, fullName } from '../common/format';
import { currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { FeatureService, rolloutBucket } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupportService } from './support.service';

const DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const tenantRef = (t: { id: string; name: string; slug: string } | null) => (t ? { id: t.id, name: t.name, slug: t.slug } : null);
const monthBounds = (month?: string) => {
  const now = new Date();
  const [y, m] = month ? month.split('-').map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = new Date(Date.UTC(y!, m! - 1, 1));
  return { start, end: new Date(Date.UTC(y!, m!, 1)), key: start.toISOString().slice(0, 7) };
};

/** Usage, domains, feature flags, audit, system health and the support queue. */
@Controller('platform')
export class ConsoleOpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureService,
    private readonly gateway: AiGatewayService,
    private readonly support: SupportService,
    private readonly audit: AuditService,
    private readonly alerts: AlertService,
  ) {}

  /** Sends a test alert so the operator can confirm the mail settings. */
  @Post('alerts/test')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN')
  async testAlert() {
    if (!this.alerts.enabled()) throw new BadRequestException('Email alerts are not set up: add ALERT_EMAIL and SMTP_HOST, SMTP_USER and SMTP_PASSWORD to the server settings');
    try {
      await sendAlertNow('Test alert', `This is a test from ${env().PLATFORM_DOMAIN_TARGET ?? 'AI School OS'}. Alerts are working.`);
    } catch (err) {
      throw new BadRequestException(`The mail server refused: ${(err as Error).message}`);
    }
    return { sent: true, to: env().ALERT_EMAIL };
  }

  // ---------------------------------------------------------- usage

  @Get('usage/ai')
  @RequirePlatformRole(...PLATFORM_AREAS.usage)
  async aiUsage(@Query(new ZodPipe(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }))) q: { month?: string }): Promise<PlatformAiUsageReport> {
    const { start, end, key } = monthBounds(q.month);
    const root = this.prisma.root;
    const where = { createdAt: { gte: start, lt: end } };
    const [totals, failures, byTenant, byModel, byAgent, daily, tenants] = await Promise.all([
      root.aiUsage.aggregate({ where, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: { _all: true } }),
      root.aiUsage.count({ where: { ...where, success: false } }),
      root.aiUsage.groupBy({ by: ['tenantId'], where, _sum: { costUsd: true }, _count: { _all: true } }),
      root.aiUsage.groupBy({ by: ['provider', 'model'], where, _sum: { costUsd: true }, _count: { _all: true } }),
      root.aiUsage.groupBy({ by: ['agent'], where, _sum: { costUsd: true }, _count: { _all: true } }),
      root.$queryRaw<{ day: Date; usd: number }[]>`SELECT date_trunc('day', "createdAt") AS day, COALESCE(SUM("costUsd"), 0)::float AS usd FROM "ai_usage" WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1 ORDER BY 1`,
      root.tenant.findMany({ select: { id: true, name: true, slug: true, aiMonthlyBudgetUsd: true } }),
    ]);
    const byId = new Map(tenants.map((t) => [t.id, t]));
    const days: { day: string; value: number }[] = [];
    for (let d = new Date(start); d < end && d <= new Date(); d = new Date(d.getTime() + DAY)) {
      const k = d.toISOString().slice(0, 10);
      days.push({ day: k, value: round2(Number(daily.find((x) => x.day.toISOString().slice(0, 10) === k)?.usd ?? 0)) });
    }
    return {
      month: key,
      totalUsd: round2(Number(totals._sum.costUsd ?? 0)),
      calls: totals._count._all,
      failures,
      inputTokens: totals._sum.inputTokens ?? 0,
      outputTokens: totals._sum.outputTokens ?? 0,
      daily: days,
      byTenant: byTenant
        .map((r) => {
          const t = r.tenantId ? byId.get(r.tenantId) : null;
          const budget = t ? (t.aiMonthlyBudgetUsd !== null ? Number(t.aiMonthlyBudgetUsd) : env().AI_DEFAULT_MONTHLY_BUDGET_USD) : null;
          const usd = round2(Number(r._sum.costUsd ?? 0));
          return { tenant: t ? tenantRef(t) : null, usd, calls: r._count._all, budgetUsd: budget && budget > 0 ? budget : null, budgetUsedPct: budget && budget > 0 ? Math.round((usd / budget) * 100) : null };
        })
        .sort((a, b) => b.usd - a.usd),
      byModel: byModel.map((r) => ({ provider: r.provider, model: r.model, usd: round2(Number(r._sum.costUsd ?? 0)), calls: r._count._all })).sort((a, b) => b.usd - a.usd),
      byAgent: byAgent.map((r) => ({ agent: r.agent, usd: round2(Number(r._sum.costUsd ?? 0)), calls: r._count._all })).sort((a, b) => b.usd - a.usd),
    };
  }

  @Get('usage/api')
  @RequirePlatformRole(...PLATFORM_AREAS.usage)
  async apiUsage(@Query(new ZodPipe(z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }))) q: { days: number }): Promise<ApiUsageReport> {
    const since = new Date(new Date(Date.now() - (q.days - 1) * DAY).toISOString().slice(0, 10));
    const rows = await this.prisma.root.apiUsageDaily.findMany({ where: { day: { gte: since } } });
    const tenants = new Map((await this.prisma.root.tenant.findMany({ select: { id: true, name: true, slug: true } })).map((t) => [t.id, t]));
    const sum = (rs: typeof rows, f: (r: (typeof rows)[number]) => number) => rs.reduce((t, r) => t + f(r), 0);
    const requests = sum(rows, (r) => r.requests);
    const totalMs = sum(rows, (r) => Number(r.totalMs));
    const byScope = new Map<string, typeof rows>();
    for (const r of rows) byScope.set(r.scope, [...(byScope.get(r.scope) ?? []), r]);
    const daily: ApiUsageReport['daily'] = [];
    for (let d = new Date(since); d <= new Date(); d = new Date(d.getTime() + DAY)) {
      const k = d.toISOString().slice(0, 10);
      const day = rows.filter((r) => dateOnly(r.day) === k);
      daily.push({ day: k, requests: sum(day, (r) => r.requests), serverErrors: sum(day, (r) => r.serverErrors) });
    }
    return {
      days: q.days,
      requests,
      clientErrors: sum(rows, (r) => r.clientErrors),
      serverErrors: sum(rows, (r) => r.serverErrors),
      avgMs: requests ? Math.round(totalMs / requests) : 0,
      daily,
      byTenant: [...byScope.entries()]
        .map(([scope, rs]) => {
          const n = sum(rs, (r) => r.requests);
          return { tenant: tenantRef(tenants.get(scope) ?? null), requests: n, clientErrors: sum(rs, (r) => r.clientErrors), serverErrors: sum(rs, (r) => r.serverErrors), avgMs: n ? Math.round(sum(rs, (r) => Number(r.totalMs)) / n) : 0, maxMs: Math.max(...rs.map((r) => r.maxMs)) };
        })
        .sort((a, b) => b.requests - a.requests),
    };
  }

  @Get('usage/students')
  @RequirePlatformRole(...PLATFORM_AREAS.usage)
  async studentUsage(): Promise<StudentUsageReport> {
    const root = this.prisma.root;
    const since30 = new Date(Date.now() - 30 * DAY);
    const yearAgo = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1));
    const [tenants, active, added, left, admitted] = await Promise.all([
      root.tenant.findMany({ include: { plan: true, subscriptions: { where: { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { name: 'asc' } }),
      root.student.groupBy({ by: ['tenantId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
      root.student.groupBy({ by: ['tenantId'], where: { createdAt: { gte: since30 } }, _count: { _all: true } }),
      root.student.groupBy({ by: ['tenantId'], where: { status: { not: 'ACTIVE' }, updatedAt: { gte: since30 } }, _count: { _all: true } }),
      root.$queryRaw<{ month: string; n: number }[]>`SELECT to_char("createdAt", 'YYYY-MM') AS month, COUNT(*)::int AS n FROM "students" WHERE "createdAt" >= ${yearAgo} GROUP BY 1 ORDER BY 1`,
    ]);
    const m = (rows: { tenantId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.tenantId, r._count._all]));
    const a = m(active);
    const ad = m(added);
    const l = m(left);
    const rows = tenants.map((t) => {
      const n = a.get(t.id) ?? 0;
      const seats = t.subscriptions[0]?.studentSeats ?? 0;
      return {
        tenant: { id: t.id, name: t.name, slug: t.slug, status: t.status as TenantStatusKey },
        plan: t.plan?.name ?? null,
        active: n,
        seats,
        billable: Math.max(n, seats),
        maxStudents: t.plan?.maxStudents ?? null,
        overLimit: !!t.plan?.maxStudents && n > t.plan.maxStudents,
        addedLast30d: ad.get(t.id) ?? 0,
        leftLast30d: l.get(t.id) ?? 0,
      };
    });
    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(yearAgo.getUTCFullYear(), yearAgo.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
    return {
      totalActive: rows.reduce((t, r) => t + r.active, 0),
      totalSeats: rows.reduce((t, r) => t + r.billable, 0),
      rows: rows.sort((x, y) => y.active - x.active),
      growth: months.map((mo) => ({ month: mo, admitted: admitted.find((x) => x.month === mo)?.n ?? 0 })),
    };
  }

  // ---------------------------------------------------------- domains

  private domainTarget(req: Request) {
    return (env().PLATFORM_DOMAIN_TARGET ?? (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? '').split(':')[0]!.toLowerCase();
  }

  @Get('domains')
  @RequirePlatformRole(...PLATFORM_AREAS.domains)
  async domains(@Req() req: Request): Promise<{ target: string; rows: DomainRow[] }> {
    const rows = await this.prisma.root.tenantDomain.findMany({ include: { tenant: { select: { id: true, name: true, slug: true } } }, orderBy: [{ tenant: { name: 'asc' } }, { hostname: 'asc' }] });
    return {
      target: this.domainTarget(req),
      rows: rows.map((d) => ({ id: d.id, hostname: d.hostname, kind: d.kind as DomainRow['kind'], isPrimary: d.isPrimary, verifiedAt: d.verifiedAt?.toISOString() ?? null, tenant: d.tenant, createdAt: d.createdAt.toISOString() })),
    };
  }

  @Post('domains')
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN')
  async addDomain(@Body(new ZodPipe(domainSchema)) body: z.infer<typeof domainSchema>) {
    const t = await this.prisma.root.tenant.findUnique({ where: { id: body.tenantId } });
    if (!t) throw new NotFoundException('School not found');
    if (await this.prisma.root.tenantDomain.findUnique({ where: { hostname: body.hostname } })) throw new ConflictException('That hostname is already connected to a school');
    const d = await this.prisma.root.$transaction(async (tx) => {
      if (body.isPrimary) await tx.tenantDomain.updateMany({ where: { tenantId: t.id, kind: body.kind }, data: { isPrimary: false } });
      return tx.tenantDomain.create({ data: body });
    });
    await this.audit.log({ tenantId: null, action: 'platform.domain_added', entityType: 'TenantDomain', entityId: d.id, summary: `Connected ${d.hostname} to ${t.name} (${d.kind.toLowerCase()})` });
    return d;
  }

  @Delete('domains/:id')
  @HttpCode(204)
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN')
  async removeDomain(@Param('id') id: string) {
    const d = await this.prisma.root.tenantDomain.findUniqueOrThrow({ where: { id }, include: { tenant: true } });
    await this.prisma.root.tenantDomain.delete({ where: { id } });
    await this.audit.log({ tenantId: null, action: 'platform.domain_removed', entityType: 'TenantDomain', entityId: id, summary: `Disconnected ${d.hostname} from ${d.tenant.name}` });
  }

  /** Checks DNS: the hostname must CNAME to the platform host or share one of its addresses. */
  @Post('domains/:id/verify')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async verifyDomain(@Param('id') id: string, @Req() req: Request) {
    const d = await this.prisma.root.tenantDomain.findUniqueOrThrow({ where: { id } });
    const target = this.domainTarget(req);
    const safe = async <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
    const [cnames, mine, theirs] = await Promise.all([safe(dns.resolveCname(d.hostname), [] as string[]), safe(dns.resolve4(target), [] as string[]), safe(dns.resolve4(d.hostname), [] as string[])]);
    const viaCname = cnames.some((c) => c.toLowerCase().replace(/\.$/, '') === target);
    const viaA = theirs.some((ip) => mine.includes(ip));
    const ok = viaCname || viaA;
    const detail = ok
      ? viaCname
        ? `${d.hostname} is a CNAME for ${target}`
        : `${d.hostname} points to ${theirs.join(', ')}, the same server as ${target}`
      : theirs.length || cnames.length
        ? `${d.hostname} points to ${[...cnames, ...theirs].join(', ')}, not to ${target}${mine.length ? ` (${mine.join(', ')})` : ''}`
        : `No DNS records found for ${d.hostname} yet. DNS changes can take a few hours.`;
    if (ok && !d.verifiedAt) await this.prisma.root.tenantDomain.update({ where: { id }, data: { verifiedAt: new Date() } });
    if (!ok && d.verifiedAt) await this.prisma.root.tenantDomain.update({ where: { id }, data: { verifiedAt: null } });
    return { verified: ok, detail, target };
  }

  // ---------------------------------------------------------- feature flags

  @Get('flags')
  @RequirePlatformRole(...PLATFORM_AREAS.flags)
  async flags(): Promise<FeatureFlagRow[]> {
    const [flags, tenants] = await Promise.all([
      this.prisma.root.featureFlag.findMany({ include: { overrides: { include: { tenant: { select: { name: true } } } } }, orderBy: [{ kind: 'asc' }, { key: 'asc' }] }),
      this.prisma.root.tenant.findMany({ where: { status: { in: ['TRIAL', 'ACTIVE'] } }, select: { id: true } }),
    ]);
    const enabledFor = new Map<string, number>();
    for (const t of tenants) for (const s of await this.features.states(t.id)) if (s.enabled) enabledFor.set(s.key, (enabledFor.get(s.key) ?? 0) + 1);
    return flags.map((f) => ({
      key: f.key,
      name: f.name,
      description: f.description,
      kind: f.kind as FlagKind,
      enabled: f.enabled,
      rolloutPercent: f.rolloutPercent,
      enabledFor: enabledFor.get(f.key) ?? 0,
      overrides: f.overrides.map((o) => ({ tenantId: o.tenantId, tenantName: o.tenant.name, enabled: o.enabled, note: o.note })),
      updatedAt: f.updatedAt.toISOString(),
    }));
  }

  @Post('flags')
  @RequirePlatformRole('SUPER_ADMIN')
  async createFlag(@Body(new ZodPipe(featureFlagSchema)) body: z.infer<typeof featureFlagSchema>) {
    if (await this.prisma.root.featureFlag.findUnique({ where: { key: body.key } })) throw new ConflictException('A flag with that key exists');
    const f = await this.prisma.root.featureFlag.create({ data: { ...body, kind: 'BETA' } });
    this.features.invalidate();
    await this.audit.log({ tenantId: null, action: 'platform.flag_created', entityType: 'FeatureFlag', entityId: f.id, summary: `Created feature flag ${f.key} (${f.rolloutPercent}% rollout)` });
    return f;
  }

  @Put('flags/:key')
  @RequirePlatformRole('SUPER_ADMIN')
  async updateFlag(@Param('key') key: string, @Body(new ZodPipe(featureFlagSchema.omit({ key: true }))) body: Omit<z.infer<typeof featureFlagSchema>, 'key'>) {
    const before = await this.prisma.root.featureFlag.findUniqueOrThrow({ where: { key } });
    const f = await this.prisma.root.featureFlag.update({ where: { key }, data: { ...body, rolloutPercent: before.kind === 'MODULE' ? 0 : body.rolloutPercent } });
    this.features.invalidate();
    const changes = [before.enabled !== f.enabled ? (f.enabled ? 'switched on' : 'switched OFF for every school') : null, before.rolloutPercent !== f.rolloutPercent ? `rollout ${before.rolloutPercent}% → ${f.rolloutPercent}%` : null].filter(Boolean);
    await this.audit.log({ tenantId: null, action: 'platform.flag_updated', entityType: 'FeatureFlag', entityId: f.id, summary: `Feature ${f.key}: ${changes.join(', ') || 'details updated'}` });
    return f;
  }

  @Delete('flags/:key')
  @HttpCode(204)
  @RequirePlatformRole('SUPER_ADMIN')
  async deleteFlag(@Param('key') key: string) {
    const f = await this.prisma.root.featureFlag.findUniqueOrThrow({ where: { key } });
    if (f.kind === 'MODULE') throw new BadRequestException('Module flags can be switched off but not deleted');
    await this.prisma.root.featureFlag.delete({ where: { key } });
    this.features.invalidate();
    await this.audit.log({ tenantId: null, action: 'platform.flag_deleted', summary: `Deleted feature flag ${key}` });
  }

  /** Which schools a rollout percentage would reach, before saving it. */
  @Get('flags/:key/preview')
  @RequirePlatformRole('SUPER_ADMIN')
  async rolloutPreview(@Param('key') key: string, @Query(new ZodPipe(z.object({ percent: z.coerce.number().int().min(0).max(100) }))) q: { percent: number }) {
    const tenants = await this.prisma.root.tenant.findMany({ where: { status: { in: ['TRIAL', 'ACTIVE'] } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    return tenants.map((t) => ({ id: t.id, name: t.name, included: rolloutBucket(t.id, key) < q.percent }));
  }

  // ---------------------------------------------------------- audit

  @Get('audit')
  @RequirePlatformRole(...PLATFORM_AREAS.audit)
  async auditLog(@Query(new ZodPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>): Promise<{ rows: PlatformAuditRow[]; nextCursor: string | null }> {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.scope === 'platform' ? { tenantId: null } : q.scope === 'schools' ? { tenantId: { not: null } } : {}),
      ...(q.tenantId ? { tenantId: q.tenantId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.actor ? { actor: { OR: [{ email: { contains: q.actor, mode: 'insensitive' } }, { firstName: { contains: q.actor, mode: 'insensitive' } }, { lastName: { contains: q.actor, mode: 'insensitive' } }] } } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + DAY) } : {}) } } : {}),
    };
    const rows = await this.prisma.root.auditLog.findMany({
      where,
      include: { tenant: { select: { id: true, name: true, slug: true } }, actor: { select: { id: true, firstName: true, lastName: true, email: true, platformRole: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return {
      rows: page.map((a) => ({
        id: a.id,
        action: a.action,
        summary: a.summary,
        tenant: a.tenant,
        actor: a.actor ? { id: a.actor.id, name: fullName(a.actor), email: a.actor.email, platformRole: a.actor.platformRole } : null,
        entityType: a.entityType,
        entityId: a.entityId,
        ip: a.ip,
        createdAt: a.createdAt.toISOString(),
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }

  // ---------------------------------------------------------- health

  @Get('health')
  @RequirePlatformRole(...PLATFORM_AREAS.health)
  async health(): Promise<SystemHealth> {
    try {
      return await this.healthReport();
    } catch (err) {
      // The database itself is down: still answer, with a failing report.
      const mem = process.memoryUsage();
      return {
        status: 'fail',
        checkedAt: new Date().toISOString(),
        version: process.env.APP_VERSION ?? 'development',
        node: process.version,
        environment: env().NODE_ENV,
        uptimeSeconds: Math.round(process.uptime()),
        memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576), heapTotalMb: Math.round(mem.heapTotal / 1048576) },
        db: { latencyMs: -1, sizeMb: null, migrations: 0, lastMigration: null },
        uploads: { files: 0, sizeMb: 0 },
        queues: { aiJobsPending: 0, aiJobsFailed24h: 0, deliveriesQueued: 0, deliveriesFailed24h: 0, scheduledBroadcasts: 0, lastAutomationRunAt: null },
        errors: { serverErrors24h: 0, requests24h: 0, aiFailures24h: 0 },
        checks: [{ key: 'db', label: 'Database', status: 'fail', detail: `The database is not responding: ${(err as Error).message.slice(0, 200)}` }],
      };
    }
  }

  private async healthReport(): Promise<SystemHealth> {
    const root = this.prisma.root;
    const since24h = new Date(Date.now() - DAY);
    const started = Date.now();
    await root.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - started;
    const [size, migrations, files, aiPending, aiFailed, queued, failed, scheduled, lastRun, api, aiFailures] = await Promise.all([
      root.$queryRaw<{ mb: number }[]>`SELECT (pg_database_size(current_database()) / 1048576.0)::float AS mb`.catch(() => [{ mb: null as unknown as number }]),
      root.$queryRaw<{ n: number; last: string | null }[]>`SELECT COUNT(*)::int AS n, MAX("migration_name") AS last FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`.catch(() => [{ n: 0, last: null }]),
      root.fileObject.aggregate({ _sum: { sizeBytes: true }, _count: { _all: true } }),
      root.aiJob.count({ where: { state: { in: ['QUEUED', 'RUNNING'] } } }),
      root.aiJob.count({ where: { state: 'FAILED', createdAt: { gte: since24h } } }),
      root.delivery.count({ where: { status: 'QUEUED' } }),
      root.delivery.count({ where: { status: 'FAILED', createdAt: { gte: since24h } } }),
      root.broadcast.count({ where: { status: 'SCHEDULED' } }),
      root.automationRun.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      root.apiUsageDaily.findMany({ where: { day: { gte: new Date(since24h.toISOString().slice(0, 10)) } } }),
      root.aiUsage.count({ where: { success: false, createdAt: { gte: since24h } } }),
    ]);
    const requests = api.reduce((t, r) => t + r.requests, 0);
    const serverErrors = api.reduce((t, r) => t + r.serverErrors, 0);
    const e = env();
    const providers = this.gateway.configuredProviders();
    const mem = process.memoryUsage();
    const stuck = await root.aiJob.count({ where: { state: { in: ['QUEUED', 'RUNNING'] }, createdAt: { lt: new Date(Date.now() - 30 * 60_000) } } });
    const checks: HealthCheck[] = [
      { key: 'db', label: 'Database', status: dbLatency < 200 ? 'ok' : dbLatency < 1000 ? 'warn' : 'fail', detail: `Responded in ${dbLatency} ms` },
      {
        key: 'ai',
        label: 'AI providers',
        status: providers.filter((p) => p !== 'fake').length ? 'ok' : e.NODE_ENV === 'production' ? 'fail' : 'warn',
        detail: providers.length ? `Connected: ${providers.join(', ')}` : 'No AI provider key is set',
      },
      { key: 'encryption', label: 'Secret encryption key', status: e.APP_ENCRYPTION_KEY ? 'ok' : 'warn', detail: e.APP_ENCRYPTION_KEY ? 'APP_ENCRYPTION_KEY is set' : 'Set APP_ENCRYPTION_KEY before schools connect Paystack, SMS or Zoom' },
      { key: 'cron', label: 'Cron wake-up', status: e.CRON_SECRET ? 'ok' : 'warn', detail: e.CRON_SECRET ? 'CRON_SECRET is set' : 'Set CRON_SECRET and add the cron job so scheduled messages run while the app sleeps' },
      { key: 'billing', label: 'Subscription payments', status: e.PLATFORM_PAYSTACK_SECRET_KEY ? 'ok' : 'warn', detail: e.PLATFORM_PAYSTACK_SECRET_KEY ? 'Schools can pay online' : 'PLATFORM_PAYSTACK_SECRET_KEY not set: schools pay by bank transfer only' },
      { key: 'errors', label: 'Server errors (24h)', status: !requests || serverErrors / requests < 0.01 ? 'ok' : serverErrors / requests < 0.05 ? 'warn' : 'fail', detail: `${serverErrors} of ${requests} requests` },
      { key: 'queues', label: 'Background work', status: stuck ? 'warn' : 'ok', detail: stuck ? `${stuck} AI jobs waiting over 30 minutes` : `${aiPending} AI jobs, ${queued} messages in the queue` },
      { key: 'alerts', label: 'Email alerts', status: this.alerts.enabled() ? 'ok' : 'warn', detail: this.alerts.enabled() ? `Problems are emailed to ${e.ALERT_EMAIL}` : 'Set ALERT_EMAIL and SMTP_HOST/USER/PASSWORD to be emailed when something breaks' },
      { key: 'memory', label: 'Memory', status: mem.rss < 900 * 1048576 ? 'ok' : 'warn', detail: `${Math.round(mem.rss / 1048576)} MB in use` },
    ];
    const worst = checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warn') ? 'warn' : 'ok';
    return {
      status: worst,
      checkedAt: new Date().toISOString(),
      version: process.env.APP_VERSION ?? 'development',
      node: process.version,
      environment: e.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576), heapTotalMb: Math.round(mem.heapTotal / 1048576) },
      db: { latencyMs: dbLatency, sizeMb: size[0]?.mb !== null && size[0]?.mb !== undefined ? round2(size[0].mb) : null, migrations: migrations[0]?.n ?? 0, lastMigration: migrations[0]?.last ?? null },
      uploads: { files: files._count._all, sizeMb: round2((files._sum.sizeBytes ?? 0) / 1048576) },
      queues: { aiJobsPending: aiPending, aiJobsFailed24h: aiFailed, deliveriesQueued: queued, deliveriesFailed24h: failed, scheduledBroadcasts: scheduled, lastAutomationRunAt: lastRun?.createdAt.toISOString() ?? null },
      errors: { serverErrors24h: serverErrors, requests24h: requests, aiFailures24h: aiFailures },
      checks,
    };
  }

  // ---------------------------------------------------------- support queue

  @Get('support/tickets')
  @RequirePlatformRole(...PLATFORM_AREAS.support)
  tickets(
    @Query(new ZodPipe(z.object({ status: z.enum([...TICKET_STATUSES, 'ACTIVE']).optional(), priority: z.enum(TICKET_PRIORITIES).optional(), tenantId: z.string().optional(), mine: z.enum(['true', 'false']).transform((v) => v === 'true').optional() })))
    q: { status?: TicketStatus | 'ACTIVE'; priority?: TicketPriority; tenantId?: string; mine?: boolean },
  ): Promise<TicketRow[]> {
    return this.support.list(
      {
        ...(q.status === 'ACTIVE' || !q.status ? { status: { in: ['OPEN', 'PENDING'] } } : { status: q.status }),
        ...(q.priority ? { priority: q.priority } : {}),
        ...(q.tenantId ? { tenantId: q.tenantId } : {}),
        ...(q.mine ? { assignedToId: currentUserId() } : {}),
      },
      false,
    );
  }

  @Get('support/tickets/:id')
  @RequirePlatformRole(...PLATFORM_AREAS.support)
  ticket(@Param('id') id: string): Promise<TicketDetail> {
    return this.support.detail(id, { scoped: false });
  }

  @Post('support/tickets/:id/reply')
  @HttpCode(200)
  @RequirePlatformRole(...PLATFORM_AREAS.support)
  reply(@Param('id') id: string, @Body(new ZodPipe(ticketReplySchema)) body: z.infer<typeof ticketReplySchema>): Promise<TicketDetail> {
    return this.support.platformReply(id, currentUserId(), body);
  }

  @Put('support/tickets/:id')
  @RequirePlatformRole(...PLATFORM_AREAS.support)
  updateTicket(@Param('id') id: string, @Body(new ZodPipe(ticketUpdateSchema)) body: z.infer<typeof ticketUpdateSchema>): Promise<TicketDetail> {
    return this.support.update(id, body);
  }

  @Post('support/tickets/:id/assist')
  @HttpCode(200)
  @RequirePlatformRole(...PLATFORM_AREAS.support)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  assist(@Param('id') id: string): Promise<TicketAssist> {
    return this.support.assist(id);
  }
}
