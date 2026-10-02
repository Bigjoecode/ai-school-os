import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Logger, NotFoundException, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  ENTITLEMENT_KEYS,
  PLATFORM_AREAS,
  checkoutSchema,
  couponSchema,
  productSchema,
  refundSchema,
  sponsorshipSchema,
  type CheckoutInput,
  type CouponRow,
  type EntitlementKey,
  type FamilyOverview,
  type LedgerAccount,
  type LedgerRow,
  type LedgerSummary,
  type ProductInput,
  type RevenueDomain,
  type UnitEconomics,
} from '@aischool/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { Public, RequirePermissions, RequirePlatformRole } from '../common/decorators';
import { fullName } from '../common/format';
import { currentTenantId, currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { PlatformBillingService } from '../console/billing.service';
import { siteOrigin } from '../finance/finance.controller';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService } from '../student-ai/entitlements.service';
import { CommerceService } from './commerce.service';

const DAY = 86_400_000;

/** The parent's Family centre: children, their AI and exam access, subscriptions and payments. */
@Controller('family')
export class FamilyController {
  constructor(
    private readonly commerce: CommerceService,
    private readonly entitlements: EntitlementService,
  ) {}

  @Get()
  @RequirePermissions('family.manage')
  async overview(): Promise<FamilyOverview> {
    const userId = currentUserId();
    const children = await this.entitlements.myChildren(userId);
    const access = await Promise.all(children.map((c) => this.entitlements.access(c.id)));
    return {
      children: children.map((c, i) => {
        const { tenantId: _t, periodKey: _p, ...a } = access[i]!;
        return { id: c.id, name: fullName(c), school: { id: c.tenant.id, name: c.tenant.name, slug: c.tenant.slug }, classArm: c.classArm ? `${c.classArm.classLevel.name} ${c.classArm.name}` : null, access: a };
      }),
      subscriptions: await this.commerce.familySubscriptions(userId),
      orders: await this.commerce.familyOrders(userId),
      products: await this.commerce.products(true),
      onlinePayment: this.commerce.onlineEnabled(),
    };
  }

  @Post('quote')
  @HttpCode(200)
  @RequirePermissions('family.manage')
  quote(@Body(new ZodPipe(checkoutSchema)) body: CheckoutInput) {
    return this.commerce.quote(currentUserId(), body);
  }

  @Post('checkout')
  @HttpCode(200)
  @RequirePermissions('family.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(@Body(new ZodPipe(checkoutSchema)) body: CheckoutInput, @Req() req: Request) {
    return this.commerce.checkout(currentUserId(), body, `${siteOrigin(req)}/family?checkout=1`);
  }

  @Get('verify')
  @RequirePermissions('family.manage')
  verify(@Query(new ZodPipe(z.object({ reference: z.string().min(6).max(80) }))) q: { reference: string }) {
    return this.commerce.verify(q.reference, currentUserId());
  }

  @Put('subscriptions/:id')
  @RequirePermissions('family.manage')
  update(@Param('id') id: string, @Body(new ZodPipe(z.object({ cancelAtPeriodEnd: z.boolean().optional(), autoRenew: z.boolean().optional() }))) body: { cancelAtPeriodEnd?: boolean; autoRenew?: boolean }) {
    return this.commerce.updateSubscription(currentUserId(), id, body);
  }

  @Post('subscriptions/:id/renew')
  @HttpCode(200)
  @RequirePermissions('family.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  renew(@Param('id') id: string, @Req() req: Request) {
    return this.commerce.renewNow(currentUserId(), id, `${siteOrigin(req)}/family?checkout=1`);
  }
}

/** A school sponsoring AI or exam preparation for its classes. */
@Controller('sponsorships')
export class SponsorshipController {
  constructor(private readonly commerce: CommerceService) {}

  @Get()
  @RequirePermissions('sponsorship.manage')
  list() {
    return this.commerce.sponsorships(currentTenantId());
  }

  @Get('products')
  @RequirePermissions('sponsorship.manage')
  async products() {
    return (await this.commerce.products(false)).filter((p) => p.isActive && p.schoolPriceKobo !== null);
  }

  @Post()
  @RequirePermissions('sponsorship.manage')
  create(@Body(new ZodPipe(sponsorshipSchema)) body: z.infer<typeof sponsorshipSchema>) {
    return this.commerce.sponsor(currentTenantId(), currentUserId(), body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('sponsorship.manage')
  cancel(@Param('id') id: string, @Body(new ZodPipe(z.object({ reason: z.string().trim().min(3).max(300) }))) body: { reason: string }) {
    return this.commerce.cancelSponsorship(currentTenantId(), id, body.reason);
  }
}

/** Paystack → the platform's own account: school invoices, parent orders and refunds. */
@Controller('billing/paystack')
export class PlatformWebhookController {
  private readonly logger = new Logger(PlatformWebhookController.name);

  constructor(
    private readonly billing: PlatformBillingService,
    private readonly commerce: CommerceService,
  ) {}

  /** Always 200 so Paystack stops retrying; only a valid signature is acted on. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request & { rawBody?: Buffer }) {
    if (!req.rawBody || !this.billing.webhookSignatureValid(req.rawBody, req.headers['x-paystack-signature'] as string | undefined)) return { ok: true };
    const event = req.body as { event?: string; data?: { reference?: string; transaction_reference?: string; transaction?: { reference?: string } } };
    try {
      if (event.event === 'charge.success' && event.data?.reference) {
        const ref = event.data.reference;
        if (ref.startsWith('FAM-')) await this.commerce.verify(ref);
        else await this.billing.verifyOnline(ref);
      } else if (event.event?.startsWith('refund.') && event.data) {
        await this.commerce.refundEvent(event.event, event.data);
      }
    } catch (err) {
      this.logger.warn(`Webhook ${event.event}: ${(err as Error).message}`);
    }
    return { ok: true };
  }
}

/** The console's side of Phase 15: products, coupons, parent subscriptions, refunds, the ledger and unit economics. */
@Controller('platform')
@RequirePlatformRole(...PLATFORM_AREAS.commerce)
export class ConsoleCommerceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commerce: CommerceService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- products & coupons

  @Get('products')
  products() {
    return this.commerce.products(false);
  }

  @Post('products')
  async createProduct(@Body(new ZodPipe(productSchema)) body: ProductInput) {
    const p = await this.prisma.root.product.create({ data: body });
    await this.audit.log({ tenantId: null, action: 'commerce.product_created', entityType: 'Product', entityId: p.id, summary: `Created product ${p.name} (${p.code})` });
    return p;
  }

  @Put('products/:id')
  async updateProduct(@Param('id') id: string, @Body(new ZodPipe(productSchema)) body: ProductInput) {
    const p = await this.prisma.root.product.update({ where: { id }, data: body });
    await this.audit.log({ tenantId: null, action: 'commerce.product_updated', entityType: 'Product', entityId: p.id, summary: `Updated product ${p.name}: ₦${(p.priceKobo / 100).toLocaleString('en-NG')} ${p.period.toLowerCase().replace('_', '-')}` });
    return p;
  }

  @Get('coupons')
  async coupons(): Promise<CouponRow[]> {
    const rows = await this.prisma.root.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((c) => ({ ...c, expiresAt: c.expiresAt?.toISOString().slice(0, 10) ?? null, createdAt: c.createdAt.toISOString() }));
  }

  @Post('coupons')
  async createCoupon(@Body(new ZodPipe(couponSchema)) body: z.infer<typeof couponSchema>) {
    if (!body.percentOff === !body.amountOffKobo) throw new BadRequestException('Give either a percentage or an amount off');
    const c = await this.prisma.root.coupon.create({ data: { ...body, expiresAt: body.expiresAt ? new Date(`${body.expiresAt}T23:59:59Z`) : null } });
    await this.audit.log({ tenantId: null, action: 'commerce.coupon_created', entityType: 'Coupon', entityId: c.id, summary: `Created coupon ${c.code}` });
    return c;
  }

  @Put('coupons/:id')
  async updateCoupon(@Param('id') id: string, @Body(new ZodPipe(couponSchema)) body: z.infer<typeof couponSchema>) {
    if (!body.percentOff === !body.amountOffKobo) throw new BadRequestException('Give either a percentage or an amount off');
    return this.prisma.root.coupon.update({ where: { id }, data: { ...body, expiresAt: body.expiresAt ? new Date(`${body.expiresAt}T23:59:59Z`) : null } });
  }

  @Delete('coupons/:id')
  @HttpCode(204)
  async deleteCoupon(@Param('id') id: string) {
    const c = await this.prisma.root.coupon.findUniqueOrThrow({ where: { id } });
    if (c.redemptions) await this.prisma.root.coupon.update({ where: { id }, data: { active: false } });
    else await this.prisma.root.coupon.delete({ where: { id } });
  }

  // ---------------------------------------------------------- parent subscriptions & orders

  @Get('family-subscriptions')
  async familySubscriptions(@Query(new ZodPipe(z.object({ status: z.string().optional() }))) q: { status?: string }) {
    const rows = await this.prisma.root.consumerSubscription.findMany({
      where: { status: q.status ? q.status : { not: 'PENDING' } },
      include: { product: true, user: { select: { id: true, firstName: true, lastName: true, email: true } }, students: { include: { student: { select: { firstName: true, lastName: true } }, tenant: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((s) => ({
      id: s.id,
      parent: { id: s.user.id, name: fullName(s.user), email: s.user.email },
      product: { code: s.product.code, name: s.product.name, kind: s.product.kind },
      status: s.status,
      students: s.students.map((x) => ({ name: fullName(x.student), school: x.tenant.name })),
      priceKobo: s.priceKobo,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      autoRenew: s.autoRenew,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      card: s.cardHint,
      renewalAttempts: s.renewalAttempts,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  @Get('orders')
  async orders() {
    const rows = await this.prisma.root.consumerOrder.findMany({ where: { status: { not: 'PENDING' } }, include: { product: true, user: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
    return rows.map((o) => ({
      id: o.id,
      reference: o.reference,
      parent: { name: fullName(o.user), email: o.user.email },
      product: o.product.name,
      kind: o.kind,
      amountKobo: o.amountKobo,
      discountKobo: o.discountKobo,
      feeKobo: o.feeKobo,
      couponCode: o.couponCode,
      status: o.status,
      refundedKobo: o.refundedKobo,
      paidAt: o.paidAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  @Post('renewals/run')
  @HttpCode(200)
  async runRenewals() {
    const r = await this.commerce.renewalCycle();
    await this.audit.log({ tenantId: null, action: 'commerce.renewals_run', summary: `Ran parent renewals: ${r.renewed} renewed, ${r.failed} failed, ${r.ended} ended, ${r.reminded} reminded` });
    return r;
  }

  // ---------------------------------------------------------- refunds

  @Get('refunds')
  async refunds() {
    const rows = await this.prisma.root.refund.findMany({ orderBy: { createdAt: 'desc' }, take: 300 });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), processedAt: r.processedAt?.toISOString() ?? null }));
  }

  @Post('orders/:id/refund')
  @HttpCode(200)
  refundOrder(@Param('id') id: string, @Body(new ZodPipe(refundSchema)) body: z.infer<typeof refundSchema>) {
    return this.commerce.refund({ sourceType: 'CONSUMER_ORDER', sourceId: id, ...body }, currentUserId());
  }

  @Post('payments/:id/refund')
  @HttpCode(200)
  refundPayment(@Param('id') id: string, @Body(new ZodPipe(refundSchema)) body: z.infer<typeof refundSchema>) {
    return this.commerce.refund({ sourceType: 'PLATFORM_PAYMENT', sourceId: id, ...body, revokeAccess: false }, currentUserId());
  }

  // ---------------------------------------------------------- entitlement grants

  /** A platform grant (a pilot, a scholarship, a goodwill gesture) to named students. */
  @Post('entitlements/grant')
  async grant(
    @Body(new ZodPipe(z.object({ studentIds: z.array(z.string()).min(1).max(500), key: z.enum(ENTITLEMENT_KEYS as [EntitlementKey, ...EntitlementKey[]]), months: z.number().int().min(1).max(24), aiSessions: z.number().int().min(0).max(100_000).nullable(), note: z.string().trim().min(3).max(200) })))
    body: { studentIds: string[]; key: EntitlementKey; months: number; aiSessions: number | null; note: string },
  ) {
    const students = await this.prisma.root.student.findMany({ where: { id: { in: body.studentIds } }, select: { id: true, tenantId: true } });
    const start = new Date();
    await this.entitlements.grant(students.map((s) => ({ tenantId: s.tenantId, studentId: s.id })), [body.key], { source: 'PLATFORM', startsAt: start, endsAt: new Date(start.getTime() + body.months * 30 * DAY), aiSessions: body.aiSessions, note: body.note });
    await this.audit.log({ tenantId: null, action: 'commerce.entitlement_granted', summary: `Granted ${body.key} to ${students.length} students for ${body.months} months: ${body.note}` });
    return { granted: students.length };
  }

  @Get('sponsorships')
  sponsorships() {
    return this.commerce.sponsorships();
  }

  // ---------------------------------------------------------- ledger & economics

  private range(q: { from?: string; to?: string }) {
    const to = q.to ? new Date(`${q.to}T23:59:59Z`) : new Date();
    const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
    return { from, to };
  }

  @Get('ledger')
  async ledger(@Query(new ZodPipe(z.object({ account: z.string().optional(), domain: z.string().optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(10).max(200).default(100) }))) q: { account?: string; domain?: string; cursor?: string; limit: number }): Promise<{ rows: LedgerRow[]; nextCursor: string | null }> {
    const rows = await this.prisma.root.ledgerEntry.findMany({
      where: { ...(q.account ? { account: q.account } : {}), ...(q.domain ? { domain: q.domain } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const tenants = new Map((await this.prisma.root.tenant.findMany({ where: { id: { in: rows.map((r) => r.tenantId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
    const page = rows.slice(0, q.limit);
    return {
      rows: page.map((r) => ({ id: r.id, txnId: r.txnId, account: r.account as LedgerAccount, debitKobo: r.debitKobo, creditKobo: r.creditKobo, domain: r.domain, memo: r.memo.replace(/^\[[^\]]+\]\s*/, ''), source: { type: r.sourceType, id: r.sourceId }, tenant: r.tenantId ? (tenants.get(r.tenantId) ?? null) : null, createdAt: r.createdAt.toISOString() })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }

  @Get('ledger/summary')
  async ledgerSummary(@Query(new ZodPipe(z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }))) q: { from?: string; to?: string }): Promise<LedgerSummary> {
    const { from, to } = this.range(q);
    const rows = await this.prisma.root.ledgerEntry.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { account: true, debitKobo: true, creditKobo: true, domain: true, createdAt: true } });
    const accounts = new Map<string, { d: number; c: number }>();
    for (const r of rows) {
      const a = accounts.get(r.account) ?? { d: 0, c: 0 };
      a.d += r.debitKobo;
      a.c += r.creditKobo;
      accounts.set(r.account, a);
    }
    const revenueAcc: Record<RevenueDomain, string> = { SCHOOL: 'REVENUE_SCHOOL', STUDENT_AI: 'REVENUE_STUDENT_AI', EXAM: 'REVENUE_EXAM' };
    const byDomain = (domain: RevenueDomain) => {
      const rev = rows.filter((r) => r.account === revenueAcc[domain]);
      const gross = rev.reduce((t, r) => t + r.creditKobo - r.debitKobo, 0);
      const refunds = rows.filter((r) => r.account === 'REFUNDS' && r.domain === domain).reduce((t, r) => t + r.debitKobo - r.creditKobo, 0);
      return { domain, grossKobo: gross, refundsKobo: refunds, netKobo: gross - refunds };
    };
    const months: string[] = [];
    for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(d.toISOString().slice(0, 7));
    const monthRev = (m: string, acc: string) => rows.filter((r) => r.account === acc && r.createdAt.toISOString().slice(0, 7) === m).reduce((t, r) => t + r.creditKobo - r.debitKobo, 0);
    const totalD = rows.reduce((t, r) => t + r.debitKobo, 0);
    const totalC = rows.reduce((t, r) => t + r.creditKobo, 0);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      balances: [...accounts.entries()].map(([account, v]) => ({ account: account as LedgerAccount, debitKobo: v.d, creditKobo: v.c, balanceKobo: v.d - v.c })),
      revenueByDomain: (['SCHOOL', 'STUDENT_AI', 'EXAM'] as RevenueDomain[]).map(byDomain),
      monthly: months.map((m) => ({ month: m, school: monthRev(m, 'REVENUE_SCHOOL'), studentAi: monthRev(m, 'REVENUE_STUDENT_AI'), exam: monthRev(m, 'REVENUE_EXAM') })),
      balanced: totalD === totalC,
    };
  }

  /**
   * What each paid product earns per student after its AI cost and payment
   * fees, from the ledger and the AI meter. The figure to watch: contribution per paid student.
   */
  @Get('unit-economics')
  async unitEconomics(@Query(new ZodPipe(z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }))) q: { from?: string; to?: string }): Promise<UnitEconomics> {
    const { from, to } = this.range(q);
    const rate = env().NAIRA_PER_USD;
    const root = this.prisma.root;
    const [products, orders, ents, aiByTier, students] = await Promise.all([
      root.product.findMany({ orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] }),
      root.consumerOrder.findMany({ where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, paidAt: { gte: from, lte: to } }, select: { productId: true, amountKobo: true, refundedKobo: true, feeKobo: true, subscriptionId: true, studentIds: true } }),
      root.studentEntitlement.findMany({ where: { status: { not: 'REVOKED' }, startsAt: { lte: to }, endsAt: { gte: from }, productId: { not: null } }, select: { productId: true, studentId: true, source: true } }),
      root.aiUsage.groupBy({ by: ['studentId', 'aiTier'], where: { createdAt: { gte: from, lte: to }, studentId: { not: null } }, _sum: { costUsd: true } }),
      root.student.count({ where: { status: 'ACTIVE' } }),
    ]);
    const sponsorInvoices = await root.platformInvoice.findMany({ where: { domain: { in: ['STUDENT_AI', 'EXAM'] }, issuedAt: { gte: from, lte: to }, status: { not: 'VOID' } }, select: { id: true, amountKobo: true } });
    const sponsorships = await root.sponsorship.findMany({ where: { platformInvoiceId: { in: sponsorInvoices.map((i) => i.id) } }, select: { productId: true, platformInvoiceId: true } });
    const costOf = new Map<string, number>();
    for (const r of aiByTier) if (r.studentId && r.aiTier && r.aiTier !== 'BASIC') costOf.set(r.studentId, (costOf.get(r.studentId) ?? 0) + Number(r._sum.costUsd ?? 0));
    const rows = products.map((p) => {
      const po = orders.filter((o) => o.productId === p.id);
      const sponsorRevenue = sponsorships.filter((s) => s.productId === p.id).reduce((t, s) => t + (sponsorInvoices.find((i) => i.id === s.platformInvoiceId)?.amountKobo ?? 0), 0);
      const revenue = po.reduce((t, o) => t + o.amountKobo - o.refundedKobo, 0) + sponsorRevenue;
      const fees = po.reduce((t, o) => t + (o.feeKobo ?? 0), 0);
      const covered = new Set(ents.filter((e) => e.productId === p.id).map((e) => e.studentId));
      const aiUsd = p.kind === 'AI' ? [...covered].reduce((t, id) => t + (costOf.get(id) ?? 0), 0) : 0;
      const aiKobo = Math.round(aiUsd * rate * 100);
      const contribution = revenue - aiKobo - fees;
      const n = covered.size || 1;
      return {
        product: { code: p.code, name: p.name, kind: p.kind },
        subscribers: new Set(po.map((o) => o.subscriptionId).filter(Boolean)).size,
        students: covered.size,
        revenueKobo: revenue,
        aiCostUsd: Math.round(aiUsd * 100) / 100,
        aiCostKobo: aiKobo,
        feesKobo: fees,
        contributionKobo: contribution,
        perStudent: { revenueKobo: Math.round(revenue / n), aiCostKobo: Math.round(aiKobo / n), feesKobo: Math.round(fees / n), contributionKobo: Math.round(contribution / n) },
        marginPct: revenue ? Math.round((contribution / revenue) * 1000) / 10 : null,
      };
    });
    const basicUsd = aiByTier.filter((r) => r.aiTier === 'BASIC').reduce((t, r) => t + Number(r._sum.costUsd ?? 0), 0);
    const basicStudents = new Set(aiByTier.filter((r) => r.aiTier === 'BASIC').map((r) => r.studentId)).size;
    const paying = new Set(ents.filter((e) => e.source === 'PARENT').map((e) => e.studentId)).size;
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      nairaPerUsd: rate,
      rows,
      basic: { students: basicStudents, aiCostKobo: Math.round(basicUsd * rate * 100), perStudentKobo: basicStudents ? Math.round((basicUsd * rate * 100) / basicStudents) : 0 },
      conversion: { eligibleStudents: students, paying, ratePct: students ? Math.round((paying / students) * 1000) / 10 : 0 },
    };
  }
}
