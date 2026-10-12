import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  PLATFORM_AREAS,
  pilotActionSchema,
  pilotAddSchema,
  pilotApproveSchema,
  pilotSettingsSchema,
  planChangeSchema,
  schoolSlugSchema,
  selfServeSettingsSchema,
  SIGNUP_STATUSES,
  signupReviewSchema,
  signupSchema,
  signupVerifySchema,
  subscriptionCheckoutSchema,
  tenantBillingUpdateSchema,
  type BillingDocument,
  type BillingStatus,
  type PilotActionInput,
  type PilotAddInput,
  type PilotApproveInput,
  type PilotCandidate,
  type PilotOverview,
  type PilotPublic,
  type PilotSettings,
  type PlanChangeResult,
  type SelfServeSettings,
  type SignupConfig,
  type SignupInput,
  type SignupResult,
  type SignupRow,
  type SignupStatus,
  type SignupVerifyResult,
  type SubscriptionCheckoutInput,
  type SubscriptionCheckoutOptions,
  type SubscriptionCheckoutResult,
  type SubscriptionsSummary,
  type TenantBillingUpdate,
} from '@aischool/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { Public, RequirePermissions, RequirePlatformRole } from '../common/decorators';
import { currentContext, currentTenantId, currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { siteOrigin } from '../finance/finance.controller';
import { PrismaService } from '../prisma/prisma.service';
import { BillingStateService } from './billing-state.service';
import { PilotService } from './pilot.service';
import { SignupService } from './signup.service';
import { SubscriptionService } from './subscription.service';

/** The public sign-up: no account needed. Each route is rate-limited per IP; sign-ups also per email (SignupService). */
@Controller('signup')
export class SignupController {
  constructor(private readonly signups: SignupService) {}

  @Public()
  @Get('config')
  config(): Promise<SignupConfig> {
    return this.signups.config();
  }

  /** The free pilot offer for the public site (brochure, deck, boards page): open or not, places left, one line of terms. */
  @Public()
  @Get('pilot')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async pilotOffer(): Promise<PilotPublic> {
    return (await this.signups.config()).pilot;
  }

  @Public()
  @Get('slug')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async slug(@Query(new ZodPipe(z.object({ slug: z.string().max(60) }))) q: { slug: string }) {
    const parsed = schoolSlugSchema.safeParse(q.slug);
    if (!parsed.success) return { slug: q.slug, available: false, message: parsed.error.issues[0]?.message ?? 'Not a valid address' };
    const available = await this.signups.slugAvailable(parsed.data);
    return { slug: parsed.data, available, message: available ? 'Available' : 'Already taken' };
  }

  @Public()
  @Post()
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  start(@Body(new ZodPipe(signupSchema)) body: SignupInput, @Req() req: Request): Promise<SignupResult> {
    return this.signups.start(body, currentContext().ip ?? req.ip, siteOrigin(req));
  }

  @Public()
  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  verify(@Body(new ZodPipe(signupVerifySchema)) body: { id: string; code: string }): Promise<SignupVerifyResult> {
    return this.signups.verify(body.id, body.code);
  }

  @Public()
  @Post('resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 10 * 60_000 } })
  resend(@Body(new ZodPipe(z.object({ id: z.string().min(10).max(40) }))) body: { id: string }, @Req() req: Request): Promise<SignupResult> {
    return this.signups.resend(body.id, siteOrigin(req));
  }
}

/** A school's subscription: its billing state (everyone, for the banner), choosing a plan, paying, plan changes and printable invoices. */
@Controller('billing')
export class SubscriptionController {
  constructor(
    private readonly state: BillingStateService,
    private readonly subs: SubscriptionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  status(): Promise<BillingStatus> {
    return this.state.status(currentTenantId());
  }

  @Get('options')
  @RequirePermissions('billing.manage')
  options(): Promise<SubscriptionCheckoutOptions> {
    return this.subs.options(currentTenantId());
  }

  @Post('checkout')
  @HttpCode(200)
  @RequirePermissions('billing.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async checkout(@Body(new ZodPipe(subscriptionCheckoutSchema)) body: SubscriptionCheckoutInput, @Req() req: Request): Promise<SubscriptionCheckoutResult> {
    const user = await this.prisma.root.user.findUniqueOrThrow({ where: { id: currentUserId() }, select: { email: true } });
    return this.subs.checkout(currentTenantId(), body, body.email || user.email, `${siteOrigin(req)}/settings/billing?paid=1`);
  }

  @Post('plan')
  @HttpCode(200)
  @RequirePermissions('billing.manage')
  changePlan(@Body(new ZodPipe(planChangeSchema)) body: { planId: string }): Promise<PlanChangeResult> {
    return this.subs.changePlan(currentTenantId(), body.planId);
  }

  @Get('invoices/:id/document')
  @RequirePermissions('billing.manage')
  document(@Param('id') id: string): Promise<BillingDocument> {
    return this.subs.document(currentTenantId(), id);
  }
}

/** The console: sign-up review queue, self-serve settings, subscriptions overview and per-school billing rules. */
@Controller('platform')
@RequirePlatformRole(...PLATFORM_AREAS.billing)
export class ConsoleSubscriptionsController {
  constructor(
    private readonly signups: SignupService,
    private readonly subs: SubscriptionService,
    private readonly state: BillingStateService,
    private readonly audit: AuditService,
  ) {}

  @Get('signups')
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN')
  signupList(@Query(new ZodPipe(z.object({ status: z.enum(SIGNUP_STATUSES).optional() }))) q: { status?: SignupStatus }): Promise<SignupRow[]> {
    return this.signups.list(q.status);
  }

  @Post('signups/:id/approve')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN')
  async approve(@Param('id') id: string, @Body(new ZodPipe(pilotApproveSchema)) body: PilotApproveInput) {
    const t = await this.signups.createSchool(id, currentUserId(), body.as);
    return { tenantId: t.id, slug: t.slug, pilot: t.pilot, pilotError: t.pilotError };
  }

  @Post('signups/:id/reject')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN')
  async reject(@Param('id') id: string, @Body(new ZodPipe(signupReviewSchema)) body: { reason: string }) {
    await this.signups.reject(id, body.reason, currentUserId());
    return { ok: true };
  }

  @Get('self-serve')
  settings(): Promise<SelfServeSettings> {
    return this.state.settings();
  }

  @Put('self-serve')
  @RequirePlatformRole('SUPER_ADMIN')
  async saveSettings(@Body(new ZodPipe(selfServeSettingsSchema)) body: SelfServeSettings) {
    const before = await this.state.settings();
    await this.state.saveSettings(body, currentUserId());
    const changed = (Object.keys(body) as (keyof SelfServeSettings)[]).filter((k) => JSON.stringify(body[k]) !== JSON.stringify(before[k]));
    await this.audit.log({ tenantId: null, action: 'billing.self_serve_settings', summary: `Updated self-serve settings: ${changed.join(', ') || 'no changes'}`, metadata: { enabled: body.enabled, autoApprove: body.autoApprove, enforceAll: body.enforceAll, trialDays: body.trialDays, graceDays: body.graceDays } });
    return this.state.settings();
  }

  @Get('subscriptions/summary')
  summary(): Promise<SubscriptionsSummary> {
    return this.subs.summary();
  }

  @Put('tenants/:id/billing')
  updateTenant(@Param('id') id: string, @Body(new ZodPipe(tenantBillingUpdateSchema)) body: TenantBillingUpdate) {
    return this.subs.updateTenant(id, body);
  }

  @Get('invoices/:id/document')
  document(@Param('id') id: string): Promise<BillingDocument> {
    return this.subs.document(null, id);
  }

  /** Sends due reminders now (they otherwise go every 30 minutes). */
  @Post('subscriptions/run-reminders')
  @HttpCode(200)
  async remind() {
    return { sent: await this.subs.tick(true) };
  }
}

/** The console: the free pilot programme (places, pilot schools and their dates, adding existing schools). */
@Controller('platform/pilot')
@RequirePlatformRole(...PLATFORM_AREAS.overview)
export class ConsolePilotController {
  constructor(private readonly pilot: PilotService) {}

  @Get()
  overview(): Promise<PilotOverview> {
    return this.pilot.overview();
  }

  @Get('candidates')
  candidates(): Promise<PilotCandidate[]> {
    return this.pilot.candidates();
  }

  @Put('settings')
  @RequirePlatformRole('SUPER_ADMIN')
  saveSettings(@Body(new ZodPipe(pilotSettingsSchema)) body: PilotSettings): Promise<PilotSettings> {
    return this.pilot.saveSettings(body, currentUserId());
  }

  /** Adds an existing school (e.g. one created in the console) to the pilot, using a place. */
  @Post('schools')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN')
  add(@Body(new ZodPipe(pilotAddSchema)) body: PilotAddInput) {
    return this.pilot.enrol(body.tenantId, currentUserId(), { endsOn: body.endsOn, source: 'CONSOLE' });
  }

  /** Change the end date (extend), end now, convert to paid (issues the next term's invoice) or remove (frees the place). */
  @Post('schools/:tenantId')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN')
  act(@Param('tenantId') tenantId: string, @Body(new ZodPipe(pilotActionSchema)) body: PilotActionInput) {
    return this.pilot.act(tenantId, body, currentUserId());
  }
}
