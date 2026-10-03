import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import {
  type CheckoutInput,
  type CheckoutQuote,
  type FamilyOrderRow,
  type FamilySubscriptionRow,
  type ProductPeriod,
  type ProductRow,
  type RevenueDomain,
  type SponsorshipRow,
} from '@aischool/shared';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { decryptSecret, encryptSecret } from '../common/crypto-box';
import { dateOnly, fullName } from '../common/format';
import { env } from '../config/env';
import { PlatformBillingService, addMonths } from '../console/billing.service';
import { PaystackService, type PaystackTransaction } from '../finance/paystack.service';
import { LedgerService, REVENUE_ACCOUNT } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService } from '../student-ai/entitlements.service';

type ProductRec = Prisma.ProductGetPayload<object>;
const DAY = 86_400_000;
const CYCLE_MS = 60 * 60_000;
const MAX_RENEWAL_ATTEMPTS = 3;
const GRACE_DAYS = 7;
export const domainOf = (p: { kind: string }): RevenueDomain => (p.kind === 'EXAM' ? 'EXAM' : 'STUDENT_AI');
const money = (k: number) => `₦${(k / 100).toLocaleString('en-NG')}`;

/**
 * Parent-paid products and school sponsorships. Parents pay the platform's
 * own Paystack account; a reusable card authorization renews a subscription
 * at the end of each period. Every settled order grants entitlements for its
 * period and posts to the ledger; refunds reverse both.
 */
@Injectable()
export class CommerceService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(CommerceService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly entitlements: EntitlementService,
    private readonly billing: PlatformBillingService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (env().NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.renewalCycle().catch((e: Error) => this.logger.error(`Renewal cycle failed: ${e.message}`)), CYCLE_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private secret() {
    const s = env().PLATFORM_PAYSTACK_SECRET_KEY;
    if (!s) throw new BadRequestException('Online payment is not set up yet. Please try again later.');
    return s;
  }

  onlineEnabled() {
    return Boolean(env().PLATFORM_PAYSTACK_SECRET_KEY);
  }

  // ---------------------------------------------------------- catalogue

  async products(publicOnly: boolean): Promise<ProductRow[]> {
    const rows = await this.prisma.root.product.findMany({ where: publicOnly ? { isActive: true, isPublic: true } : {}, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] });
    const now = new Date();
    const [subs, sponsored] = await Promise.all([
      this.prisma.root.consumerSubscription.groupBy({ by: ['productId'], where: { status: { in: ['ACTIVE', 'PAST_DUE'] } }, _count: { _all: true } }),
      this.prisma.root.studentEntitlement.groupBy({ by: ['productId'], where: { source: 'SCHOOL', status: 'ACTIVE', endsAt: { gt: now } }, _count: { _all: true } }),
    ]);
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      kind: p.kind as 'AI' | 'EXAM',
      entitlements: p.entitlements as ProductRow['entitlements'],
      priceKobo: p.priceKobo,
      schoolPriceKobo: p.schoolPriceKobo,
      period: p.period as ProductPeriod,
      periodMonths: p.periodMonths,
      maxChildren: p.maxChildren,
      aiSessions: p.aiSessions,
      features: p.features,
      isActive: p.isActive,
      isPublic: p.isPublic,
      sortOrder: p.sortOrder,
      activeSubscriptions: subs.find((x) => x.productId === p.id)?._count._all ?? 0,
      sponsoredStudents: sponsored.find((x) => x.productId === p.id)?._count._all ?? 0,
    }));
  }

  private async product(code: string, forSale = true) {
    const p = await this.prisma.root.product.findUnique({ where: { code } });
    if (!p || (forSale && (!p.isActive || !p.isPublic))) throw new NotFoundException('That product is not available');
    return p;
  }

  private async coupon(code: string | null, product: ProductRec) {
    if (!code) return null;
    const c = await this.prisma.root.coupon.findUnique({ where: { code } });
    const now = new Date();
    if (!c || !c.active || (c.expiresAt && c.expiresAt < now) || (c.maxRedemptions !== null && c.redemptions >= c.maxRedemptions) || (c.productCodes.length && !c.productCodes.includes(product.code))) {
      throw new BadRequestException({ statusCode: 400, message: 'That code is not valid for this product', errors: [{ path: 'couponCode', message: 'Not valid' }] });
    }
    return c;
  }

  // ---------------------------------------------------------- checkout

  async quote(userId: string, input: CheckoutInput): Promise<CheckoutQuote> {
    const product = await this.product(input.productCode);
    const ids = [...new Set(input.studentIds)];
    if (ids.length > product.maxChildren) throw new BadRequestException(`${product.name} covers up to ${product.maxChildren} ${product.maxChildren === 1 ? 'child' : 'children'}`);
    const children = await this.entitlements.myChildren(userId);
    const chosen = ids.map((id) => children.find((c) => c.id === id));
    if (chosen.some((c) => !c)) throw new BadRequestException('You can only buy for your own children');
    const now = new Date();
    // A higher AI tier covers a lower one: Pro covers Plus, but Plus doesn't cover Pro (that's an upgrade).
    const covering = [...new Set(product.entitlements.flatMap((k) => (k === 'STUDENT_AI_PLUS' ? ['STUDENT_AI_PLUS', 'STUDENT_AI_PRO'] : [k])))];
    const covered = await this.prisma.root.studentEntitlement.findMany({
      where: { studentId: { in: ids }, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now }, key: { in: covering } },
      include: { student: { select: { firstName: true, lastName: true } } },
    });
    const coupon = await this.coupon(input.couponCode, product);
    const discount = coupon ? Math.min(product.priceKobo, coupon.percentOff ? Math.round((product.priceKobo * coupon.percentOff) / 100) : (coupon.amountOffKobo ?? 0)) : 0;
    return {
      product: { code: product.code, name: product.name, period: product.period as ProductPeriod, periodMonths: product.periodMonths },
      students: chosen.map((c) => ({ id: c!.id, name: fullName(c!) })),
      priceKobo: product.priceKobo,
      discountKobo: discount,
      totalKobo: product.priceKobo - discount,
      coupon: coupon ? { code: coupon.code, description: coupon.description } : null,
      alreadyCovered: [...new Map(covered.map((e) => [e.studentId, { id: e.studentId, name: fullName(e.student), until: e.endsAt.toISOString() }])).values()],
    };
  }

  async checkout(userId: string, input: CheckoutInput, callbackUrl: string) {
    const q = await this.quote(userId, input);
    if (q.alreadyCovered.length) throw new ConflictException(`${q.alreadyCovered.map((c) => c.name).join(', ')} already ${q.alreadyCovered.length === 1 ? 'has' : 'have'} this until ${q.alreadyCovered[0]!.until.slice(0, 10)}`);
    const product = await this.product(input.productCode);
    const account = await this.prisma.root.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const user = { email: input.email ?? account.email };
    const children = await this.entitlements.myChildren(userId);
    const reference = `FAM-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`.toUpperCase();
    if (q.totalKobo === 0) {
      // A 100% coupon: no payment step.
      const sub = await this.createSubscription(userId, product, q, user.email, children, false);
      const order = await this.prisma.root.consumerOrder.create({
        data: { reference, userId, productId: product.id, subscriptionId: sub.id, studentIds: q.students.map((s) => s.id), amountKobo: 0, discountKobo: q.discountKobo, couponCode: q.coupon?.code, status: 'PENDING' },
      });
      await this.settleOrder(order.id, { paidAt: new Date(), fees: 0 });
      return { authorizationUrl: null, reference };
    }
    const secret = this.secret();
    const sub = await this.createSubscription(userId, product, q, user.email, children, input.autoRenew);
    await this.prisma.root.consumerOrder.create({
      data: { reference, userId, productId: product.id, subscriptionId: sub.id, studentIds: q.students.map((s) => s.id), amountKobo: q.totalKobo, discountKobo: q.discountKobo, couponCode: q.coupon?.code, status: 'PENDING' },
    });
    const res = await this.paystack.call<{ authorization_url: string; reference: string }>(secret, 'POST', '/transaction/initialize', {
      email: user.email,
      amount: q.totalKobo,
      currency: 'NGN',
      reference,
      callback_url: callbackUrl,
      metadata: { kind: 'family', product: product.code, students: q.students.map((s) => s.name).join(', ') },
    });
    return { authorizationUrl: res.authorization_url, reference };
  }

  private async createSubscription(userId: string, product: ProductRec, q: CheckoutQuote, email: string, children: { id: string; tenantId: string }[], autoRenew: boolean) {
    return this.prisma.root.consumerSubscription.create({
      data: {
        userId,
        productId: product.id,
        status: 'PENDING',
        priceKobo: q.priceKobo,
        email,
        autoRenew: autoRenew && product.period !== 'ONE_OFF',
        couponCode: q.coupon?.code,
        students: { create: q.students.map((s) => ({ studentId: s.id, tenantId: children.find((c) => c.id === s.id)!.tenantId })) },
      },
    });
  }

  /** Checks a reference with Paystack and settles it. Safe to repeat (return trip and webhook both call it). */
  async verify(reference: string, userId?: string) {
    const order = await this.prisma.root.consumerOrder.findUnique({ where: { reference } });
    if (!order || (userId && order.userId !== userId)) throw new NotFoundException('Payment not found');
    if (order.status !== 'PENDING') return { status: order.status };
    const tx = await this.paystack.call<PaystackTransaction>(this.secret(), 'GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    if (tx.status === 'success') {
      if (tx.amount !== order.amountKobo) {
        this.logger.warn(`Family order ${reference}: paid ${tx.amount}, expected ${order.amountKobo}`);
        await this.prisma.root.consumerOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } });
        return { status: 'FAILED' };
      }
      await this.settleOrder(order.id, { paidAt: tx.paid_at ? new Date(tx.paid_at) : new Date(), fees: tx.fees ?? 0, authorization: tx.authorization });
      return { status: 'PAID' };
    }
    if (['failed', 'abandoned', 'reversed'].includes(tx.status)) {
      await this.prisma.root.consumerOrder.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      await this.prisma.root.consumerSubscription.updateMany({ where: { id: order.subscriptionId ?? '', status: 'PENDING' }, data: { status: 'EXPIRED' } });
      return { status: 'FAILED' };
    }
    return { status: 'PENDING' };
  }

  /**
   * Exactly once per order (a conditional status flip): starts or extends the
   * subscription period, grants that period's entitlements, saves a reusable
   * card for renewals, redeems the coupon and posts the money to the ledger.
   */
  async settleOrder(orderId: string, paid: { paidAt: Date; fees: number; authorization?: PaystackTransaction['authorization'] }) {
    const flipped = await this.prisma.root.consumerOrder.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'PAID', paidAt: paid.paidAt, feeKobo: paid.fees } });
    if (!flipped.count) return false;
    const order = await this.prisma.root.consumerOrder.findUniqueOrThrow({ where: { id: orderId }, include: { product: true, subscription: { include: { students: true } } } });
    const sub = order.subscription;
    const product = order.product;
    if (sub) {
      const start = order.kind === 'RENEWAL' && sub.currentPeriodEnd ? sub.currentPeriodEnd : paid.paidAt;
      const end = addMonths(start, product.periodMonths);
      const auth = paid.authorization;
      await this.prisma.root.consumerSubscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          currentPeriodStart: start,
          currentPeriodEnd: end,
          renewalAttempts: 0,
          ...(auth?.reusable && auth.authorization_code && env().APP_ENCRYPTION_KEY
            ? { authorizationEnc: encryptSecret(auth.authorization_code), cardHint: [auth.brand ?? auth.card_type, auth.last4 ? `•••• ${auth.last4}` : null].filter(Boolean).join(' ') || null }
            : {}),
        },
      });
      await this.entitlements.grant(
        sub.students.map((s) => ({ tenantId: s.tenantId, studentId: s.studentId })),
        product.entitlements,
        { source: 'PARENT', startsAt: start, endsAt: end, aiSessions: product.aiSessions, productId: product.id, consumerSubscriptionId: sub.id },
      );
    }
    // Upgrading to Pro: a single-child Plus subscription for the same child stops renewing (access runs to its end).
    if (sub && order.kind === 'NEW' && product.entitlements.includes('STUDENT_AI_PRO')) {
      const ids = sub.students.map((s) => s.studentId);
      const older = await this.prisma.root.consumerSubscription.findMany({
        where: { id: { not: sub.id }, userId: order.userId, status: { in: ['ACTIVE', 'PAST_DUE'] }, product: { entitlements: { has: 'STUDENT_AI_PLUS' }, maxChildren: 1 }, students: { some: { studentId: { in: ids } } } },
        select: { id: true },
      });
      if (older.length) await this.prisma.root.consumerSubscription.updateMany({ where: { id: { in: older.map((o) => o.id) } }, data: { autoRenew: false, cancelAtPeriodEnd: true } });
    }
    if (order.couponCode && order.kind === 'NEW') await this.prisma.root.coupon.updateMany({ where: { code: order.couponCode }, data: { redemptions: { increment: 1 } } });
    const domain = domainOf(product);
    if (order.amountKobo > 0) {
      await this.ledger.safePost(
        { event: 'order', domain, sourceType: 'CONSUMER_ORDER', sourceId: order.id, userId: order.userId, memo: `${product.name} ${order.kind === 'RENEWAL' ? 'renewal' : 'purchase'} ${order.reference}`, at: paid.paidAt },
        [
          { account: 'CASH_PAYSTACK', debitKobo: order.amountKobo },
          { account: REVENUE_ACCOUNT[domain], creditKobo: order.amountKobo },
        ],
      );
      if (paid.fees > 0) {
        await this.ledger.safePost(
          { event: 'fee', domain, sourceType: 'CONSUMER_ORDER', sourceId: order.id, userId: order.userId, memo: `Paystack fee on ${order.reference}` },
          [
            { account: 'PAYMENT_FEES', debitKobo: paid.fees },
            { account: 'CASH_PAYSTACK', creditKobo: paid.fees },
          ],
        );
      }
    }
    await this.notifyParent(order.userId, sub?.students ?? [], `${product.name} is active`, `Thank you! ${product.name} is now active${sub?.students.length ? ` for ${(await this.names(sub.students.map((s) => s.studentId))).join(', ')}` : ''}.`);
    await this.audit.log({ tenantId: null, actorUserId: order.userId, action: 'commerce.order_paid', entityType: 'ConsumerOrder', entityId: order.id, summary: `${product.name} ${order.kind === 'RENEWAL' ? 'renewed' : 'bought'} for ${money(order.amountKobo)} (${order.reference})` });
    return true;
  }

  private async names(studentIds: string[]) {
    const rows = await this.prisma.root.student.findMany({ where: { id: { in: studentIds } }, select: { firstName: true } });
    return rows.map((r) => r.firstName);
  }

  /** In-app notice to the parent in each school their covered children attend. */
  private async notifyParent(userId: string, students: { tenantId: string }[], title: string, body: string) {
    const tenants = [...new Set(students.map((s) => s.tenantId))];
    for (const tenantId of tenants) {
      await this.prisma.root.notification.create({ data: { tenantId, userId, title, body, link: '/family' } }).catch(() => undefined);
    }
  }

  // ---------------------------------------------------------- the parent's view

  async familySubscriptions(userId: string): Promise<FamilySubscriptionRow[]> {
    const rows = await this.prisma.root.consumerSubscription.findMany({
      where: { userId, status: { not: 'PENDING' } },
      include: { product: true, students: { include: { student: { select: { id: true, firstName: true, lastName: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      product: { code: s.product.code, name: s.product.name, kind: s.product.kind, period: s.product.period as ProductPeriod },
      status: s.status as FamilySubscriptionRow['status'],
      students: s.students.map((x) => ({ id: x.student.id, name: fullName(x.student) })),
      priceKobo: s.priceKobo,
      currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      autoRenew: s.autoRenew,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      card: s.cardHint,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async familyOrders(userId: string): Promise<FamilyOrderRow[]> {
    const rows = await this.prisma.root.consumerOrder.findMany({ where: { userId, status: { not: 'PENDING' } }, include: { product: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((o) => ({
      id: o.id,
      reference: o.reference,
      product: o.product.name,
      kind: o.kind as 'NEW' | 'RENEWAL',
      amountKobo: o.amountKobo,
      discountKobo: o.discountKobo,
      status: o.status,
      refundedKobo: o.refundedKobo,
      paidAt: o.paidAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async updateSubscription(userId: string, id: string, change: { cancelAtPeriodEnd?: boolean; autoRenew?: boolean }) {
    const s = await this.prisma.root.consumerSubscription.findFirst({ where: { id, userId }, include: { product: true } });
    if (!s) throw new NotFoundException('Subscription not found');
    if (!['ACTIVE', 'PAST_DUE'].includes(s.status)) throw new BadRequestException('This subscription has ended');
    if (change.autoRenew && s.product.period === 'ONE_OFF') throw new BadRequestException('One-off purchases do not renew');
    await this.prisma.root.consumerSubscription.update({ where: { id }, data: change });
    await this.audit.log({
      tenantId: null,
      actorUserId: userId,
      action: 'commerce.subscription_changed',
      entityType: 'ConsumerSubscription',
      entityId: id,
      summary: `${s.product.name}: ${change.cancelAtPeriodEnd === true ? 'set to end at the period end' : change.cancelAtPeriodEnd === false ? 'resumed' : change.autoRenew ? 'automatic renewal on' : 'automatic renewal off'}`,
    });
    return { ok: true };
  }

  /** Manual renewal (no saved card, or the card failed): a fresh checkout for the next period. */
  async renewNow(userId: string, id: string, callbackUrl: string) {
    const s = await this.prisma.root.consumerSubscription.findFirst({ where: { id, userId }, include: { product: true } });
    if (!s) throw new NotFoundException('Subscription not found');
    if (!['ACTIVE', 'PAST_DUE', 'EXPIRED'].includes(s.status)) throw new BadRequestException('This subscription cannot be renewed');
    const reference = `FAM-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`.toUpperCase();
    if (s.status === 'EXPIRED') await this.prisma.root.consumerSubscription.update({ where: { id }, data: { currentPeriodEnd: new Date() } });
    const studentIds = (await this.prisma.root.consumerSubscriptionStudent.findMany({ where: { subscriptionId: id } })).map((x) => x.studentId);
    await this.prisma.root.consumerOrder.create({ data: { reference, userId, productId: s.productId, subscriptionId: id, kind: 'RENEWAL', studentIds, amountKobo: s.priceKobo, status: 'PENDING' } });
    const res = await this.paystack.call<{ authorization_url: string }>(this.secret(), 'POST', '/transaction/initialize', {
      email: s.email,
      amount: s.priceKobo,
      currency: 'NGN',
      reference,
      callback_url: callbackUrl,
      metadata: { kind: 'family-renewal', product: s.product.code },
    });
    return { authorizationUrl: res.authorization_url, reference };
  }

  // ---------------------------------------------------------- renewals

  /**
   * Hourly. Subscriptions reaching their period end renew with the saved
   * card (up to three daily attempts), end if cancelled, or lapse after a
   * week's grace. Entitlements are per period, so access simply stops at the
   * end of what was paid for.
   */
  async renewalCycle() {
    if (this.running) return { renewed: 0, failed: 0, ended: 0, reminded: 0 };
    this.running = true;
    const result = { renewed: 0, failed: 0, ended: 0, reminded: 0 };
    try {
      const now = new Date();
      const due = await this.prisma.root.consumerSubscription.findMany({
        where: { status: { in: ['ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { lte: new Date(now.getTime() + DAY) } },
        include: { product: true, students: true },
      });
      for (const s of due) {
        const end = s.currentPeriodEnd!;
        const stop = s.cancelAtPeriodEnd || !s.autoRenew || s.product.period === 'ONE_OFF' || !s.product.isActive;
        if (stop) {
          if (end <= now) {
            await this.prisma.root.consumerSubscription.update({ where: { id: s.id }, data: { status: s.cancelAtPeriodEnd ? 'CANCELLED' : 'EXPIRED' } });
            result.ended++;
          } else if (!s.cancelAtPeriodEnd && s.product.period !== 'ONE_OFF' && s.renewalAttempts === 0) {
            await this.prisma.root.consumerSubscription.update({ where: { id: s.id }, data: { renewalAttempts: 1 } });
            await this.notifyParent(s.userId, s.students, `${s.product.name} ends soon`, `${s.product.name} ends on ${dateOnly(end)}. Renew from the Family page to keep learning without a break.`);
            result.reminded++;
          }
          continue;
        }
        if (end < new Date(now.getTime() - GRACE_DAYS * DAY)) {
          await this.prisma.root.consumerSubscription.update({ where: { id: s.id }, data: { status: 'EXPIRED' } });
          result.ended++;
          continue;
        }
        const attemptedToday = s.lastRenewalAttempt && now.getTime() - s.lastRenewalAttempt.getTime() < DAY;
        if (attemptedToday || s.renewalAttempts >= MAX_RENEWAL_ATTEMPTS || !s.authorizationEnc || !env().PLATFORM_PAYSTACK_SECRET_KEY) {
          if (!s.authorizationEnc && s.status === 'ACTIVE' && end <= now) {
            await this.prisma.root.consumerSubscription.update({ where: { id: s.id }, data: { status: 'PAST_DUE' } });
            await this.notifyParent(s.userId, s.students, `Renew ${s.product.name}`, `${s.product.name} has reached the end of its period. Renew from the Family page within ${GRACE_DAYS} days to keep access.`);
          }
          continue;
        }
        if (await this.chargeRenewal(s)) result.renewed++;
        else result.failed++;
      }
    } finally {
      this.running = false;
    }
    return result;
  }

  private async chargeRenewal(s: Prisma.ConsumerSubscriptionGetPayload<{ include: { product: true; students: true } }>) {
    const reference = `FAM-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`.toUpperCase();
    await this.prisma.root.consumerSubscription.update({ where: { id: s.id }, data: { renewalAttempts: { increment: 1 }, lastRenewalAttempt: new Date() } });
    const order = await this.prisma.root.consumerOrder.create({
      data: { reference, userId: s.userId, productId: s.productId, subscriptionId: s.id, kind: 'RENEWAL', studentIds: s.students.map((x) => x.studentId), amountKobo: s.priceKobo, status: 'PENDING' },
    });
    try {
      const tx = await this.paystack.call<PaystackTransaction>(this.secret(), 'POST', '/transaction/charge_authorization', {
        authorization_code: decryptSecret(s.authorizationEnc!),
        email: s.email,
        amount: s.priceKobo,
        reference,
      });
      if (tx.status === 'success') {
        await this.settleOrder(order.id, { paidAt: tx.paid_at ? new Date(tx.paid_at) : new Date(), fees: tx.fees ?? 0, authorization: tx.authorization });
        return true;
      }
      throw new Error(`charge ${tx.status}`);
    } catch (err) {
      await this.prisma.root.consumerOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      await this.prisma.root.consumerSubscription.update({ where: { id: s.id }, data: { status: 'PAST_DUE' } });
      await this.notifyParent(s.userId, s.students, `We couldn't renew ${s.product.name}`, `The card payment for ${s.product.name} didn't go through. Renew from the Family page to keep access.`);
      this.logger.warn(`Renewal ${reference} failed: ${(err as Error).message}`);
      return false;
    }
  }

  // ---------------------------------------------------------- refunds

  /**
   * Refunds part or all of a parent's order through Paystack (or a school
   * payment by transfer, recorded as processed). The ledger reverses the
   * money now; a failed Paystack refund is reversed back by the webhook.
   */
  async refund(input: { sourceType: 'CONSUMER_ORDER' | 'PLATFORM_PAYMENT'; sourceId: string; amountKobo: number; reason: string; revokeAccess: boolean }, userId: string) {
    if (input.sourceType === 'CONSUMER_ORDER') {
      const o = await this.prisma.root.consumerOrder.findUniqueOrThrow({ where: { id: input.sourceId }, include: { product: true } });
      if (!['PAID', 'PARTIALLY_REFUNDED'].includes(o.status)) throw new BadRequestException('Only paid orders can be refunded');
      if (input.amountKobo > o.amountKobo - o.refundedKobo) throw new BadRequestException('That is more than is left to refund');
      const refund = await this.prisma.root.refund.create({ data: { sourceType: 'CONSUMER_ORDER', sourceId: o.id, amountKobo: input.amountKobo, reason: input.reason, createdById: userId } });
      const refunded = o.refundedKobo + input.amountKobo;
      await this.prisma.root.consumerOrder.update({ where: { id: o.id }, data: { refundedKobo: refunded, status: refunded >= o.amountKobo ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
      const domain = domainOf(o.product);
      await this.ledger.safePost(
        { event: `refund:${refund.id}`, domain, sourceType: 'CONSUMER_ORDER', sourceId: o.id, userId: o.userId, memo: `Refund on ${o.reference}: ${input.reason}` },
        [
          { account: 'REFUNDS', debitKobo: input.amountKobo },
          { account: 'CASH_PAYSTACK', creditKobo: input.amountKobo },
        ],
      );
      if (input.revokeAccess && o.subscriptionId) {
        await this.entitlements.revoke({ consumerSubscriptionId: o.subscriptionId }, `Refunded: ${input.reason}`);
        await this.prisma.root.consumerSubscription.update({ where: { id: o.subscriptionId }, data: { status: 'CANCELLED', autoRenew: false } });
      }
      try {
        const r = await this.paystack.call<{ id?: number; status?: string }>(this.secret(), 'POST', '/refund', { transaction: o.reference, amount: input.amountKobo, merchant_note: input.reason });
        await this.prisma.root.refund.update({ where: { id: refund.id }, data: { providerRef: r.id ? String(r.id) : null } });
      } catch (err) {
        await this.failRefund(refund.id, (err as Error).message);
        throw err;
      }
      await this.audit.log({ tenantId: null, action: 'commerce.refund', entityType: 'Refund', entityId: refund.id, summary: `Refunded ${money(input.amountKobo)} on ${o.reference} (${o.product.name}): ${input.reason}` });
      return refund;
    }
    // A school's payment (usually a transfer): refunded outside Paystack, recorded here.
    const p = await this.prisma.root.platformPayment.findUniqueOrThrow({ where: { id: input.sourceId }, include: { invoice: true, tenant: true } });
    if (p.status !== 'SUCCESS') throw new BadRequestException('Only settled payments can be refunded');
    const already = await this.prisma.root.refund.aggregate({ where: { sourceType: 'PLATFORM_PAYMENT', sourceId: p.id, status: { not: 'FAILED' } }, _sum: { amountKobo: true } });
    if (input.amountKobo > p.amountKobo - (already._sum.amountKobo ?? 0)) throw new BadRequestException('That is more than is left to refund');
    const refund = await this.prisma.root.refund.create({ data: { sourceType: 'PLATFORM_PAYMENT', sourceId: p.id, amountKobo: input.amountKobo, reason: input.reason, createdById: userId, status: 'PROCESSED', processedAt: new Date() } });
    const paidKobo = Math.max(0, p.invoice.paidKobo - input.amountKobo);
    await this.prisma.root.platformInvoice.update({ where: { id: p.invoiceId }, data: { paidKobo, ...(p.invoice.status === 'PAID' && paidKobo < p.invoice.amountKobo ? { status: 'OPEN', paidAt: null } : {}) } });
    await this.ledger.safePost(
      { event: `refund:${refund.id}`, domain: p.invoice.domain as RevenueDomain, sourceType: 'PLATFORM_PAYMENT', sourceId: p.id, tenantId: p.tenantId, memo: `Refund to ${p.tenant.name} on ${p.invoice.number}: ${input.reason}` },
      [
        { account: 'RECEIVABLE_SCHOOLS', debitKobo: input.amountKobo },
        { account: p.method === 'PAYSTACK' ? 'CASH_PAYSTACK' : 'CASH_BANK', creditKobo: input.amountKobo },
      ],
    );
    await this.audit.log({ tenantId: null, action: 'commerce.refund', entityType: 'Refund', entityId: refund.id, summary: `Refunded ${money(input.amountKobo)} to ${p.tenant.name} on ${p.invoice.number}: ${input.reason}` });
    return refund;
  }

  private async failRefund(refundId: string, why: string) {
    const r = await this.prisma.root.refund.update({ where: { id: refundId }, data: { status: 'FAILED' } });
    const o = await this.prisma.root.consumerOrder.findUnique({ where: { id: r.sourceId }, include: { product: true } });
    if (!o) return;
    const refunded = Math.max(0, o.refundedKobo - r.amountKobo);
    await this.prisma.root.consumerOrder.update({ where: { id: o.id }, data: { refundedKobo: refunded, status: refunded === 0 ? 'PAID' : 'PARTIALLY_REFUNDED' } });
    await this.ledger.safePost(
      { event: `refund-failed:${r.id}`, domain: domainOf(o.product), sourceType: 'CONSUMER_ORDER', sourceId: o.id, userId: o.userId, memo: `Refund failed on ${o.reference}: ${why}` },
      [
        { account: 'CASH_PAYSTACK', debitKobo: r.amountKobo },
        { account: 'REFUNDS', creditKobo: r.amountKobo },
      ],
    );
  }

  /** Paystack refund events, matched by transaction reference. */
  async refundEvent(event: string, data: { transaction_reference?: string; transaction?: { reference?: string }; id?: number }) {
    const reference = data.transaction_reference ?? data.transaction?.reference;
    if (!reference) return;
    const o = await this.prisma.root.consumerOrder.findUnique({ where: { reference } });
    if (!o) return;
    const r = await this.prisma.root.refund.findFirst({ where: { sourceType: 'CONSUMER_ORDER', sourceId: o.id, status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
    if (!r) return;
    if (event === 'refund.processed') await this.prisma.root.refund.update({ where: { id: r.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
    else if (event === 'refund.failed') await this.failRefund(r.id, 'Paystack could not process the refund');
  }

  // ---------------------------------------------------------- sponsorships

  async sponsorships(tenantId?: string): Promise<SponsorshipRow[]> {
    const rows = await this.prisma.root.sponsorship.findMany({ where: tenantId ? { tenantId } : {}, include: { product: true, tenant: { select: { name: true, slug: true } } }, orderBy: { createdAt: 'desc' } });
    const arms = await this.prisma.root.classArm.findMany({ where: { id: { in: rows.flatMap((r) => r.classArmIds) } }, include: { classLevel: true } });
    const invoices = await this.prisma.root.platformInvoice.findMany({ where: { id: { in: rows.map((r) => r.platformInvoiceId).filter((x): x is string => !!x) } }, select: { id: true, number: true } });
    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      school: r.tenant,
      product: { code: r.product.code, name: r.product.name },
      classes: r.classArmIds.map((id) => arms.find((a) => a.id === id)).filter(Boolean).map((a) => `${a!.classLevel.name} ${a!.name}`),
      students: r.seats,
      unitKobo: r.unitKobo,
      totalKobo: r.totalKobo,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: (r.status === 'ACTIVE' && r.endsAt < now ? 'EXPIRED' : r.status) as SponsorshipRow['status'],
      invoiceNumber: invoices.find((i) => i.id === r.platformInvoiceId)?.number ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * A school pays for a product for whole classes: entitlements start now
   * and the school is invoiced per student, as part of its B2B account.
   */
  async sponsor(tenantId: string, userId: string, input: { productCode: string; classArmIds: string[]; title: string; startsOn: string; months: number }) {
    const product = await this.product(input.productCode, false);
    if (!product.isActive || product.schoolPriceKobo === null) throw new BadRequestException(`${product.name} isn't offered to schools`);
    const students = await this.prisma.root.student.findMany({ where: { tenantId, classArmId: { in: input.classArmIds }, status: 'ACTIVE' }, select: { id: true } });
    if (!students.length) throw new BadRequestException('There are no active students in those classes');
    const periods = Math.max(1, Math.ceil(input.months / product.periodMonths));
    const unit = product.schoolPriceKobo * periods;
    const total = unit * students.length;
    const startsAt = new Date(`${input.startsOn}T00:00:00Z`);
    const endsAt = addMonths(startsAt, input.months);
    const sp = await this.prisma.root.sponsorship.create({
      data: { tenantId, productId: product.id, title: input.title, classArmIds: input.classArmIds, seats: students.length, unitKobo: unit, totalKobo: total, startsAt, endsAt, createdById: userId },
    });
    await this.entitlements.grant(
      students.map((s) => ({ tenantId, studentId: s.id })),
      product.entitlements,
      { source: 'SCHOOL', startsAt, endsAt, aiSessions: product.aiSessions !== null ? product.aiSessions * periods : null, productId: product.id, sponsorshipId: sp.id, note: input.title },
    );
    const due = new Date(Date.now() + env().PLATFORM_INVOICE_DUE_DAYS * DAY).toISOString().slice(0, 10);
    const invoice = await this.billing.manualInvoice({
      tenantId,
      description: `${product.name} sponsorship: ${input.title} (${students.length} students × ${money(unit)})`,
      amountKobo: total,
      dueDate: due,
      notes: null,
      domain: domainOf(product),
      seats: students.length,
      unitKobo: unit,
    });
    await this.prisma.root.sponsorship.update({ where: { id: sp.id }, data: { platformInvoiceId: invoice.id } });
    await this.audit.log({ tenantId, action: 'sponsorship.created', entityType: 'Sponsorship', entityId: sp.id, summary: `Sponsored ${product.name} for ${students.length} students (${input.title}), invoiced ${money(total)}` });
    return (await this.sponsorships(tenantId)).find((r) => r.id === sp.id)!;
  }

  async cancelSponsorship(tenantId: string, id: string, reason: string) {
    const sp = await this.prisma.root.sponsorship.findFirst({ where: { id, tenantId } });
    if (!sp) throw new NotFoundException('Sponsorship not found');
    if (sp.status !== 'ACTIVE') throw new BadRequestException('This sponsorship has already ended');
    await this.prisma.root.sponsorship.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.entitlements.revoke({ sponsorshipId: id }, `Sponsorship cancelled: ${reason}`);
    if (sp.platformInvoiceId) {
      const inv = await this.prisma.root.platformInvoice.findUnique({ where: { id: sp.platformInvoiceId } });
      if (inv && inv.status === 'OPEN' && inv.paidKobo === 0) await this.billing.voidInvoice(inv.id, `Sponsorship cancelled: ${reason}`);
    }
    await this.audit.log({ tenantId, action: 'sponsorship.cancelled', entityType: 'Sponsorship', entityId: id, summary: `Cancelled sponsorship "${sp.title}": ${reason}` });
    return { ok: true };
  }
}
