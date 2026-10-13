import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  isDemoSchoolSlug,
  PRICING_SETTINGS_KEY,
  pricingSettingsSchema,
  type AddonInput,
  type AddonOrderAction,
  type AddonOrderInput,
  type AddonOrderRow,
  type AddonOrderStatus,
  type AddonRow,
  type InvoiceLine,
  type PlanEnquiryInput,
  type PlanEnquiryRow,
  type PlanEnquiryStatus,
  type PricingConsole,
  type PricingSettings,
  type SchoolPricing,
  type SmsAllowance,
  type TenantSetupFeeInput,
} from '@aischool/shared';
import type { Addon, Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { registerTickTask } from '../common/tick-tasks';
import { platformSmsLine } from '../comms/channels.service';
import { env } from '../config/env';
import { addMonths, PlatformBillingService } from '../console/billing.service';
import { LedgerService, REVENUE_ACCOUNT } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingStateService, platformSender } from './billing-state.service';
import { readPricingSettings, setupFeeStatus } from './setup-fee';
import { SignupService } from './signup.service';

const DAY = 86_400_000;
const TICK_EVERY_MS = 30 * 60_000;
const SETTINGS_TTL = 15_000;
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');

/**
 * The price list beyond the per-student price: add-ons (bought at a fixed
 * price or requested for a quote, invoiced on the platform invoice), "Talk to
 * us" enquiries, the operator's setup-fee waivers and discounts, and the SMS
 * included per student per term (metered on the platform's SMS line, with
 * warnings at 80% and 100% and extra pages billed, blocked or only warned
 * about per the operator's setting).
 */
@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);
  private cache: { at: number; value: PricingSettings } | null = null;
  private lastTick = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: PlatformBillingService,
    private readonly state: BillingStateService,
    private readonly signups: SignupService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  onModuleInit() {
    platformSmsLine.resolve = (tenantId) => this.lendSmsLine(tenantId);
    registerTickTask('smsAllowance', () => this.tick());
  }

  // ---------------------------------------------------------------- settings

  async settings(): Promise<PricingSettings> {
    if (this.cache && Date.now() - this.cache.at < SETTINGS_TTL) return this.cache.value;
    const value = await readPricingSettings(this.prisma.root);
    this.cache = { at: Date.now(), value };
    return value;
  }

  async saveSettings(body: Pick<PricingSettings, 'smsOverage' | 'smsOverageKobo' | 'notes'>, userId: string) {
    const current = await readPricingSettings(this.prisma.root);
    const value = pricingSettingsSchema.parse({ ...current, smsOverage: body.smsOverage, smsOverageKobo: body.smsOverageKobo, notes: body.notes });
    await this.prisma.root.platformSetting.upsert({ where: { key: PRICING_SETTINGS_KEY }, update: { value, updatedBy: userId }, create: { key: PRICING_SETTINGS_KEY, value, updatedBy: userId } });
    this.cache = null;
    await this.audit.log({ tenantId: null, action: 'billing.pricing_settings', summary: `Updated price list settings: SMS past the allowance ${value.smsOverage.toLowerCase()} at ${naira(value.smsOverageKobo)} a page; ${value.notes.length} notes` });
    return value;
  }

  // ---------------------------------------------------------------- add-on catalogue

  private addonRow(a: Addon): AddonRow {
    return { id: a.id, code: a.code, name: a.name, description: a.description, pricing: a.pricing as AddonRow['pricing'], priceKobo: a.priceKobo, unitLabel: a.unitLabel, isActive: a.isActive, sortOrder: a.sortOrder };
  }

  async addons(all = false): Promise<AddonRow[]> {
    const rows = await this.prisma.root.addon.findMany({ where: all ? {} : { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((a) => this.addonRow(a));
  }

  private checkAddon(body: AddonInput) {
    if (body.pricing === 'FIXED' && !body.priceKobo) throw new BadRequestException('A fixed-price add-on needs a price');
    return { ...body, priceKobo: body.pricing === 'FIXED' ? body.priceKobo : null };
  }

  async createAddon(body: AddonInput) {
    if (await this.prisma.root.addon.findUnique({ where: { code: body.code } })) throw new ConflictException('An add-on with that code exists');
    const a = await this.prisma.root.addon.create({ data: this.checkAddon(body) });
    await this.audit.log({ tenantId: null, action: 'billing.addon_created', entityType: 'Addon', entityId: a.id, summary: `Created the add-on ${a.name}` });
    return this.addonRow(a);
  }

  async updateAddon(id: string, body: AddonInput) {
    const clash = await this.prisma.root.addon.findFirst({ where: { code: body.code, id: { not: id } } });
    if (clash) throw new ConflictException('An add-on with that code exists');
    const a = await this.prisma.root.addon.update({ where: { id }, data: this.checkAddon(body) });
    await this.audit.log({ tenantId: null, action: 'billing.addon_updated', entityType: 'Addon', entityId: a.id, summary: `Updated the add-on ${a.name}` });
    return this.addonRow(a);
  }

  async deleteAddon(id: string) {
    const a = await this.prisma.root.addon.findUniqueOrThrow({ where: { id }, include: { _count: { select: { orders: true } } } });
    if (a._count.orders) throw new BadRequestException('Schools have ordered this add-on; switch it off instead');
    await this.prisma.root.addon.delete({ where: { id } });
    await this.audit.log({ tenantId: null, action: 'billing.addon_deleted', summary: `Deleted the add-on ${a.name}` });
  }

  // ---------------------------------------------------------------- add-on orders

  private async orderRows(where: Prisma.AddonOrderWhereInput, take = 200): Promise<AddonOrderRow[]> {
    const rows = await this.prisma.root.addonOrder.findMany({ where, include: { addon: true, tenant: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: 'desc' }, take });
    const invoiceIds = rows.map((r) => r.invoiceId).filter((x): x is string => !!x);
    const userIds = rows.map((r) => r.requestedById).filter((x): x is string => !!x);
    const [invoices, users] = await Promise.all([
      this.prisma.root.platformInvoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, number: true, status: true } }),
      this.prisma.root.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const inv = new Map(invoices.map((i) => [i.id, i]));
    const who = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    return rows.map((r) => ({
      id: r.id,
      tenant: r.tenant,
      addon: { id: r.addon.id, name: r.addon.name, pricing: r.addon.pricing as AddonOrderRow['addon']['pricing'], unitLabel: r.addon.unitLabel },
      quantity: r.quantity,
      status: r.status as AddonOrderStatus,
      note: r.note,
      operatorNote: r.operatorNote,
      amountKobo: r.amountKobo,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoiceId ? (inv.get(r.invoiceId)?.number ?? null) : null,
      invoiceStatus: r.invoiceId ? (inv.get(r.invoiceId)?.status ?? null) : null,
      requestedBy: r.requestedById ? (who.get(r.requestedById) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private async invoiceAddon(tenantId: string, addonName: string, quantity: number, unitKobo: number, amountKobo: number, unitLabel: string | null) {
    const rules = await this.state.settings();
    const description = `Add-on: ${addonName}${quantity > 1 || unitLabel ? ` × ${quantity}${unitLabel ? ` (${unitLabel.replace(/^per /, '')}${quantity > 1 ? 's' : ''})` : ''}` : ''}`;
    const lines: InvoiceLine[] = [{ kind: 'ADDON', description, quantity, unitKobo, discountKobo: Math.max(0, unitKobo * quantity - amountKobo), amountKobo }];
    return this.billing.manualInvoice({ tenantId, description, amountKobo, dueDate: new Date(today().getTime() + rules.invoiceDueDays * DAY).toISOString().slice(0, 10), notes: null, seats: quantity, unitKobo, lines });
  }

  /** A school buys a fixed-price add-on (invoiced at once) or asks for a quote (a request in the console's queue). */
  async order(tenantId: string, userId: string, input: AddonOrderInput): Promise<AddonOrderRow> {
    const addon = await this.prisma.root.addon.findFirst({ where: { id: input.addonId, isActive: true } });
    if (!addon) throw new BadRequestException('Choose one of the add-ons shown');
    const open = await this.prisma.root.addonOrder.count({ where: { tenantId, status: 'REQUESTED' } });
    if (open >= 10) throw new BadRequestException('You have 10 requests waiting for a reply already. We will be in touch soon.');
    let order = await this.prisma.root.addonOrder.create({ data: { tenantId, addonId: addon.id, quantity: input.quantity, note: input.note, requestedById: userId } });
    if (addon.pricing === 'FIXED' && addon.priceKobo) {
      const amount = addon.priceKobo * input.quantity;
      const inv = await this.invoiceAddon(tenantId, addon.name, input.quantity, addon.priceKobo, amount, addon.unitLabel);
      order = await this.prisma.root.addonOrder.update({ where: { id: order.id }, data: { status: 'INVOICED', amountKobo: amount, invoiceId: inv.id } });
      await this.audit.log({ tenantId, action: 'billing.addon_bought', entityType: 'AddonOrder', entityId: order.id, summary: `Bought ${addon.name} × ${input.quantity}: ${naira(amount)} (invoice ${inv.number})` });
    } else {
      await this.audit.log({ tenantId, action: 'billing.addon_requested', entityType: 'AddonOrder', entityId: order.id, summary: `Asked for a quote: ${addon.name}${input.note ? ` (${input.note.slice(0, 120)})` : ''}` });
      await this.tellOperator(`Add-on request: ${addon.name}`, `A school asked for ${addon.name}. Answer it in the console → Subscriptions → Price list.`);
    }
    return (await this.orderRows({ id: order.id }))[0]!;
  }

  async cancelOrder(tenantId: string, id: string) {
    const r = await this.prisma.root.addonOrder.updateMany({ where: { id, tenantId, status: 'REQUESTED' }, data: { status: 'CANCELLED' } });
    if (!r.count) throw new BadRequestException('Only requests still waiting for a quote can be cancelled');
    await this.audit.log({ tenantId, action: 'billing.addon_cancelled', entityType: 'AddonOrder', entityId: id, summary: 'Cancelled an add-on request' });
    return { ok: true };
  }

  /** Console: invoice a quoted request, or decline it. */
  async actOnOrder(id: string, body: AddonOrderAction, userId: string): Promise<AddonOrderRow> {
    const o = await this.prisma.root.addonOrder.findUnique({ where: { id }, include: { addon: true, tenant: true } });
    if (!o) throw new NotFoundException('Request not found');
    if (o.status !== 'REQUESTED') throw new BadRequestException('This request has already been answered');
    if (body.action === 'INVOICE') {
      const inv = await this.invoiceAddon(o.tenantId, o.addon.name, o.quantity, Math.round(body.amountKobo / o.quantity), body.amountKobo, o.addon.unitLabel);
      await this.prisma.root.addonOrder.update({ where: { id }, data: { status: 'INVOICED', amountKobo: body.amountKobo, invoiceId: inv.id, operatorNote: body.note ?? null, handledById: userId } });
      await this.audit.log({ tenantId: o.tenantId, action: 'billing.addon_quoted', entityType: 'AddonOrder', entityId: id, summary: `Invoiced ${o.tenant.name} ${naira(body.amountKobo)} for ${o.addon.name} (invoice ${inv.number})` });
      await this.notifyAdmins(o.tenantId, `Your quote for ${o.addon.name}`, `We have priced your request at ${naira(body.amountKobo)}${body.note ? `: ${body.note}` : ''}. The invoice is in Settings → Billing.`);
    } else {
      await this.prisma.root.addonOrder.update({ where: { id }, data: { status: 'DECLINED', operatorNote: body.note, handledById: userId } });
      await this.audit.log({ tenantId: o.tenantId, action: 'billing.addon_declined', entityType: 'AddonOrder', entityId: id, summary: `Declined ${o.tenant.name}'s request for ${o.addon.name}: ${body.note}` });
      await this.notifyAdmins(o.tenantId, `About your request for ${o.addon.name}`, body.note);
    }
    return (await this.orderRows({ id }))[0]!;
  }

  // ---------------------------------------------------------------- "Talk to us"

  async enquire(input: PlanEnquiryInput & { website?: string }, ip: string | undefined) {
    if (input.website) return { ok: true };
    const parsed = input as Required<Pick<PlanEnquiryInput, 'schoolName' | 'contactName' | 'email'>> & { phone: string; students: number; branches: number; message: string | null; planId?: string | null };
    if (ip) {
      const recent = await this.prisma.root.planEnquiry.count({ where: { ip, createdAt: { gte: new Date(Date.now() - DAY) } } });
      if (recent >= 5) return { ok: true };
    }
    const plan = parsed.planId ? await this.prisma.root.plan.findUnique({ where: { id: parsed.planId }, select: { id: true, name: true } }) : null;
    const e = await this.prisma.root.planEnquiry.create({
      data: { planId: plan?.id ?? null, schoolName: parsed.schoolName, contactName: parsed.contactName, email: parsed.email, phone: parsed.phone, students: parsed.students, branches: parsed.branches, message: parsed.message, ip: ip ?? null },
    });
    await this.audit.log({ tenantId: null, action: 'billing.plan_enquiry', entityType: 'PlanEnquiry', entityId: e.id, summary: `${plan?.name ?? 'Pricing'} enquiry from ${parsed.schoolName} (${parsed.students} students)` });
    await this.tellOperator(`${plan?.name ?? 'Pricing'} enquiry: ${parsed.schoolName}`, `${parsed.contactName} (${parsed.email}, ${parsed.phone}) asked about ${plan?.name ?? 'pricing'} for ${parsed.schoolName}: about ${parsed.students} students, ${parsed.branches} branch(es).\n\n${parsed.message ?? ''}\n\nSee the console → Subscriptions → Price list.`);
    return { ok: true };
  }

  private enquiryRows(rows: Prisma.PlanEnquiryGetPayload<object>[], plans: Map<string, string>): PlanEnquiryRow[] {
    return rows.map((e) => ({ id: e.id, plan: e.planId ? (plans.get(e.planId) ?? null) : null, schoolName: e.schoolName, contactName: e.contactName, email: e.email, phone: e.phone, students: e.students, branches: e.branches, message: e.message, status: e.status as PlanEnquiryStatus, createdAt: e.createdAt.toISOString() }));
  }

  async setEnquiryStatus(id: string, status: PlanEnquiryStatus) {
    await this.prisma.root.planEnquiry.update({ where: { id }, data: { status } });
    return { ok: true };
  }

  async consoleOverview(): Promise<PricingConsole> {
    const [settings, addons, orders, enquiries, plans] = await Promise.all([
      this.settings(),
      this.addons(true),
      this.orderRows({}, 200),
      this.prisma.root.planEnquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.root.plan.findMany({ select: { id: true, name: true } }),
    ]);
    return { settings, addons, orders, enquiries: this.enquiryRows(enquiries, new Map(plans.map((p) => [p.id, p.name]))) };
  }

  // ---------------------------------------------------------------- setup fee (console)

  /** Waive, discount or reset a school's setup fee; an unpaid invoice that carries it is corrected. */
  async setSetupFee(tenantId: string, body: TenantSetupFeeInput, userId: string) {
    const tenant = await this.prisma.root.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!tenant) throw new NotFoundException('School not found');
    if (body.action === 'SET' && body.amountKobo == null) throw new BadRequestException('Enter the amount to charge');
    const mode = body.action === 'RESET' ? null : body.action === 'WAIVE' ? 'WAIVED' : 'SET';
    const amount = body.action === 'SET' ? body.amountKobo! : null;
    const before = await setupFeeStatus(this.prisma.root, tenantId);
    if (before.state === 'PAID') throw new BadRequestException('This school has already paid its setup fee; record a credit instead');
    // An open invoice already carrying the fee: change that line (and the ledger) to the new amount.
    if (before.state === 'INVOICED' && before.invoiceId) {
      const inv = await this.prisma.root.platformInvoice.findUniqueOrThrow({ where: { id: before.invoiceId } });
      const lines = (inv.lines as unknown as InvoiceLine[]) ?? [];
      const line = lines.find((l) => l.kind === 'SETUP_FEE');
      if (line) {
        const target = mode === 'WAIVED' ? 0 : mode === 'SET' ? amount! : before.planFeeKobo;
        const delta = line.amountKobo - target;
        if (delta !== 0) {
          if (inv.amountKobo - delta < inv.paidKobo) throw new BadRequestException('More has been paid on this invoice than the new total; record a credit instead');
          const nextLines = target === 0 ? lines.filter((l) => l !== line) : lines.map((l) => (l === line ? { ...l, amountKobo: target, discountKobo: Math.max(0, l.unitKobo - target) } : l));
          await this.prisma.root.platformPayment.updateMany({ where: { invoiceId: inv.id, status: 'PENDING' }, data: { status: 'FAILED', note: 'Invoice amount changed (setup fee)' } });
          await this.prisma.root.platformInvoice.update({
            where: { id: inv.id },
            data: {
              amountKobo: inv.amountKobo - delta,
              lines: nextLines as unknown as Prisma.InputJsonValue,
              description: target === 0 ? inv.description.replace(/; plus the one-off setup fee.*$/, '') : inv.description,
              notes: [inv.notes, target === 0 ? 'Setup fee waived' : `Setup fee changed to ${naira(target)}`].filter(Boolean).join('\n'),
            },
          });
          const domain = inv.domain as 'SCHOOL' | 'STUDENT_AI' | 'EXAM';
          const lines2 = delta > 0
            ? [{ account: REVENUE_ACCOUNT[domain], debitKobo: delta }, { account: 'RECEIVABLE_SCHOOLS' as const, creditKobo: delta }]
            : [{ account: 'RECEIVABLE_SCHOOLS' as const, debitKobo: -delta }, { account: REVENUE_ACCOUNT[domain], creditKobo: -delta }];
          await this.ledger.safePost({ event: `setup-fee-${Date.now()}`, domain, sourceType: 'PLATFORM_INVOICE', sourceId: inv.id, tenantId, memo: `Setup fee on ${inv.number} changed by ${naira(-delta)}` }, lines2);
          if (inv.amountKobo - delta <= inv.paidKobo && inv.amountKobo - delta >= 0) {
            await this.prisma.root.platformInvoice.update({ where: { id: inv.id }, data: { status: 'PAID', paidAt: new Date() } });
          }
        }
      }
    }
    await this.prisma.root.tenantBilling.upsert({
      where: { tenantId },
      update: { setupFeeMode: mode, setupFeeKobo: amount, setupFeeNote: body.note },
      create: { tenantId, setupFeeMode: mode, setupFeeKobo: amount, setupFeeNote: body.note },
    });
    this.state.invalidate(tenantId);
    await this.audit.log({
      tenantId,
      action: 'billing.setup_fee',
      entityType: 'Tenant',
      entityId: tenantId,
      actorUserId: userId,
      summary: `${tenant.name}: setup fee ${mode === 'WAIVED' ? 'waived' : mode === 'SET' ? `set to ${naira(amount!)}` : 'back to the plan’s fee'}${body.note ? ` (${body.note})` : ''}`,
    });
    return setupFeeStatus(this.prisma.root, tenantId);
  }

  // ---------------------------------------------------------------- SMS allowance

  private platformLineConfigured() {
    const e = env();
    return !!(e.PLATFORM_TERMII_API_KEY && e.PLATFORM_TERMII_SENDER_ID);
  }

  /** The current four-month allowance window: from the subscription's period start (or the school's start), in terms. */
  private window(anchor: Date, now = new Date()) {
    let start = new Date(anchor);
    if (start > now) {
      while (start > now) start = addMonths(start, -4);
    } else {
      while (addMonths(start, 4) <= now) start = addMonths(start, 4);
    }
    return { start, end: addMonths(start, 4) };
  }

  async smsAllowance(tenantId: string, at = new Date()): Promise<SmsAllowance> {
    const [tenant, sub, own, settings, rules, active] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { createdAt: true, plan: { select: { smsUnitsPerStudent: true, minStudents: true } } } }),
      this.billing.current(tenantId),
      this.prisma.root.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'termii' } }, select: { tenantId: true } }),
      this.settings(),
      this.state.settings(),
      this.prisma.root.student.count({ where: { tenantId, status: 'ACTIVE' } }),
    ]);
    const plan = sub?.plan ?? tenant.plan;
    const per = plan?.smsUnitsPerStudent ?? 0;
    const w = this.window(sub && sub.status !== 'TRIALING' ? sub.currentPeriodStart : tenant.createdAt, at);
    const billed = Math.max(active, plan?.minStudents ?? rules.minBilledStudents);
    const used = (
      await this.prisma.root.delivery.aggregate({ where: { tenantId, channel: 'SMS', status: 'SENT', createdAt: { gte: w.start, lt: w.end } }, _sum: { units: true } })
    )._sum.units ?? 0;
    const line: SmsAllowance['line'] = own ? 'OWN' : this.platformLineConfigured() && per > 0 ? 'PLATFORM' : 'NONE';
    const allowance = per * billed;
    const pct = allowance ? Math.round((used / allowance) * 100) : 0;
    const overUnits = line === 'PLATFORM' ? Math.max(0, used - allowance) : 0;
    return {
      included: per > 0,
      line,
      unitsPerStudent: per,
      billedStudents: billed,
      allowance,
      used,
      left: Math.max(0, allowance - used),
      pct,
      windowStart: w.start.toISOString().slice(0, 10),
      windowEnd: w.end.toISOString().slice(0, 10),
      overage: settings.smsOverage,
      overageKobo: settings.smsOverageKobo,
      overUnits,
      overCostKobo: settings.smsOverage === 'BILL' ? overUnits * settings.smsOverageKobo : 0,
      warning: per > 0 && line !== 'OWN' ? (pct >= 100 ? 'USED_UP' : pct >= 80 ? 'NEAR' : null) : null,
    };
  }

  /** The platform's Termii account for a school without its own, while its plan includes SMS (and, under BLOCK, it has some left). */
  private async lendSmsLine(tenantId: string) {
    if (!this.platformLineConfigured()) return null;
    const a = await this.smsAllowance(tenantId);
    if (!a.included || a.line !== 'PLATFORM') return null;
    if (a.overage === 'BLOCK' && a.used >= a.allowance) return null;
    const e = env();
    return { senderId: e.PLATFORM_TERMII_SENDER_ID!, dnd: e.PLATFORM_TERMII_DND, apiKey: e.PLATFORM_TERMII_API_KEY! };
  }

  /**
   * Every 30 minutes: warn schools at 80% and 100% of their included SMS, and
   * after a term's window closes bill the extra pages sent on the platform line
   * (BILL), once per window.
   */
  async tick(force = false): Promise<number> {
    if (!force && Date.now() - this.lastTick < TICK_EVERY_MS) return 0;
    this.lastTick = Date.now();
    const tenants = await this.prisma.root.tenant.findMany({
      where: { status: { in: ['TRIAL', 'ACTIVE'] }, plan: { smsUnitsPerStudent: { gt: 0 } } },
      select: { id: true, slug: true, name: true, billing: { select: { smsFlags: true } } },
    });
    let n = 0;
    for (const t of tenants) {
      if (isDemoSchoolSlug(t.slug)) continue;
      const flags = new Set(t.billing?.smsFlags ?? []);
      const a = await this.smsAllowance(t.id);
      const add: string[] = [];
      if (a.warning && a.line === 'PLATFORM') {
        const key = `sms${a.warning === 'USED_UP' ? 100 : 80}:${a.windowStart}`;
        if (!flags.has(key)) {
          add.push(key);
          const what = a.overage === 'BLOCK' ? 'SMS on the AI School OS line stop until the next term (email, push and in-app messages still go out).' : a.overage === 'BILL' ? `Extra pages are billed at ${naira(a.overageKobo)} a page on your next invoice.` : 'You can keep sending.';
          await this.notifyAdmins(
            t.id,
            a.warning === 'USED_UP' ? 'Your included SMS for this term are used up' : `You have used ${a.pct}% of this term’s included SMS`,
            `${t.name} has sent ${a.used.toLocaleString('en-NG')} of ${a.allowance.toLocaleString('en-NG')} SMS pages included this term (to ${a.windowEnd}). ${a.warning === 'USED_UP' ? what : 'Unused SMS do not roll over.'}`,
            '/messages',
          );
          n++;
        }
      }
      // The previous window: bill extra pages once it has closed.
      const prev = await this.smsAllowance(t.id, new Date(Date.parse(a.windowStart) - DAY));
      const billKey = `smsbill:${prev.windowStart}`;
      if (prev.overUnits > 0 && prev.overage === 'BILL' && prev.overageKobo > 0 && !flags.has(billKey)) {
        add.push(billKey);
        const amount = prev.overUnits * prev.overageKobo;
        const description = `SMS past the included allowance, ${prev.windowStart} – ${prev.windowEnd}: ${prev.overUnits.toLocaleString('en-NG')} pages × ${naira(prev.overageKobo)}`;
        const rules = await this.state.settings();
        await this.billing.manualInvoice({
          tenantId: t.id,
          description,
          amountKobo: amount,
          dueDate: new Date(today().getTime() + rules.invoiceDueDays * DAY).toISOString().slice(0, 10),
          notes: `Included: ${prev.allowance.toLocaleString('en-NG')} pages (${prev.unitsPerStudent} per student × ${prev.billedStudents} students); sent: ${prev.used.toLocaleString('en-NG')}.`,
          seats: prev.overUnits,
          unitKobo: prev.overageKobo,
          lines: [{ kind: 'SMS', description, quantity: prev.overUnits, unitKobo: prev.overageKobo, discountKobo: 0, amountKobo: amount }],
        });
        n++;
      }
      if (add.length) await this.prisma.root.tenantBilling.upsert({ where: { tenantId: t.id }, update: { smsFlags: { push: add } }, create: { tenantId: t.id, smsFlags: add } });
    }
    return n;
  }

  // ---------------------------------------------------------------- a school's view

  async schoolPricing(tenantId: string): Promise<SchoolPricing> {
    const [tenant, sub, rules, settings, addons, orders, setupFee, sms] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { plan: true } }),
      this.billing.current(tenantId),
      this.state.settings(),
      this.settings(),
      this.addons(),
      this.orderRows({ tenantId }, 50),
      setupFeeStatus(this.prisma.root, tenantId),
      this.smsAllowance(tenantId),
    ]);
    const plan = sub?.plan ?? tenant.plan;
    return {
      plan: plan ? this.signups.toPublicPlan(plan, rules.minBilledStudents) : null,
      setupFee,
      sms,
      addons,
      orders,
      notes: settings.notes,
      sessionDiscountPct: rules.sessionDiscountPct,
    };
  }

  // ---------------------------------------------------------------- messages

  private async notifyAdmins(tenantId: string, title: string, body: string, link = '/settings/billing') {
    const admins = await this.prisma.root.membership.findMany({
      where: { tenantId, status: 'ACTIVE', user: { status: 'ACTIVE' }, roles: { some: { role: { key: 'school_admin' } } } },
      select: { userId: true, user: { select: { email: true, firstName: true } } },
    });
    if (!admins.length) return;
    await this.prisma.root.notification.createMany({ data: admins.map((a) => ({ tenantId, userId: a.userId, title, body, link })) });
    const mail = platformSender();
    if (!mail) return;
    const origin = env().CORS_ORIGINS[0] ?? '';
    for (const a of admins) {
      await mail.send(a.user.email, `[AI School OS] ${title}`, `Dear ${a.user.firstName},\n\n${body}\n\n${origin}${link}\n\nAI School OS`).catch((e: Error) => this.logger.warn(`Pricing email to ${a.user.email} failed: ${e.message}`));
    }
  }

  /** The operator's billing inbox (ALERT_EMAIL), when email is set up. */
  private async tellOperator(subject: string, text: string) {
    const to = env().ALERT_EMAIL;
    const mail = platformSender();
    if (!to || !mail) return;
    await mail.send(to, `[AI School OS] ${subject}`, text).catch((e: Error) => this.logger.warn(`Operator email failed: ${e.message}`));
  }
}
