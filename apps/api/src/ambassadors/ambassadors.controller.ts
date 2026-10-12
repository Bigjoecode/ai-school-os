import { Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  AMBASSADOR_STATUSES,
  COMMISSION_STATUSES,
  PLATFORM_AREAS,
  ambassadorApplySchema,
  ambassadorBankVerifySchema,
  ambassadorCodeSchema,
  ambassadorDeclineSchema,
  ambassadorSettingsSchema,
  ambassadorSuspendSchema,
  ambassadorVerifySchema,
  bankDetailsSchema,
  commissionReverseSchema,
  payoutMarkPaidSchema,
  referralAssignSchema,
  type AmbassadorApplyInput,
  type AmbassadorApplyResult,
  type AmbassadorDashboard,
  type AmbassadorOverview,
  type AmbassadorPublicConfig,
  type AmbassadorRow,
  type AmbassadorSettings,
  type AmbassadorStatus,
  type BankDetailsInput,
  type CommissionStatus,
  type ConsoleCommissionRow,
  type ConsolePayoutRow,
  type ConsoleReferralRow,
  type PayoutDueRow,
  type PayoutMarkPaidInput,
  type ReferralAssignInput,
  type ReferralCodeCheck,
} from '@aischool/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { AllowNoTenant, Public, RequirePlatformRole } from '../common/decorators';
import { currentContext, currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { siteOrigin } from '../finance/finance.controller';
import { AmbassadorsService } from './ambassadors.service';

/** The public side: the programme's terms (rate, hold, minimum), applying, confirming the email and checking a referral code. Rate-limited per IP. */
@Controller('ambassadors')
export class AmbassadorPublicController {
  constructor(private readonly ambassadors: AmbassadorsService) {}

  @Public()
  @Get('config')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  config(): Promise<AmbassadorPublicConfig> {
    return this.ambassadors.publicConfig();
  }

  @Public()
  @Get('ref/:code')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  check(@Param('code') code: string): Promise<ReferralCodeCheck> {
    return this.ambassadors.checkReferralCode(String(code).slice(0, 20));
  }

  @Public()
  @Post('apply')
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  apply(@Body(new ZodPipe(ambassadorApplySchema)) body: AmbassadorApplyInput, @Req() req: Request): Promise<AmbassadorApplyResult> {
    return this.ambassadors.apply(body, currentContext().ip ?? req.ip, siteOrigin(req));
  }

  @Public()
  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  verify(@Body(new ZodPipe(ambassadorVerifySchema)) body: { id: string; code: string }) {
    return this.ambassadors.verify(body.id, body.code);
  }

  @Public()
  @Post('resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 10 * 60_000 } })
  resend(@Body(new ZodPipe(z.object({ id: z.string().min(10).max(40) }))) body: { id: string }, @Req() req: Request): Promise<AmbassadorApplyResult> {
    return this.ambassadors.resend(body.id, siteOrigin(req));
  }
}

/**
 * The signed-in ambassador's own area. No school is needed (ambassadors have none); every
 * call is looked up by the signed-in user, so one ambassador can never see another's data.
 */
@Controller('ambassador')
export class AmbassadorSelfController {
  constructor(private readonly ambassadors: AmbassadorsService) {}

  @AllowNoTenant()
  @Get('me')
  me(): Promise<AmbassadorDashboard> {
    return this.ambassadors.dashboard(currentUserId());
  }

  @AllowNoTenant()
  @Post('notices/read')
  @HttpCode(200)
  read() {
    return this.ambassadors.markNoticesRead(currentUserId());
  }

  @AllowNoTenant()
  @Post('bank')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 10 * 60_000 } })
  bank(@Body(new ZodPipe(bankDetailsSchema)) body: BankDetailsInput, @Req() req: Request) {
    return this.ambassadors.startBankChange(currentUserId(), body, siteOrigin(req));
  }

  @AllowNoTenant()
  @Post('bank/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  bankVerify(@Body(new ZodPipe(ambassadorBankVerifySchema)) body: { code: string }) {
    return this.ambassadors.confirmBankChange(currentUserId(), body.code);
  }

  @AllowNoTenant()
  @Get('export')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async export() {
    const a = await this.ambassadors.byUser(currentUserId());
    return this.ambassadors.ownExport(a.id, false);
  }
}

/** The console: applications, ambassadors, referred schools, commissions, payouts and settings. */
@Controller('platform/ambassadors')
@RequirePlatformRole(...PLATFORM_AREAS.billing)
export class ConsoleAmbassadorsController {
  constructor(
    private readonly ambassadors: AmbassadorsService,
    private readonly audit: AuditService,
  ) {}

  @Get('overview')
  overview(): Promise<AmbassadorOverview> {
    return this.ambassadors.overview();
  }

  @Get()
  list(@Query(new ZodPipe(z.object({ status: z.enum(AMBASSADOR_STATUSES).optional() }))) q: { status?: AmbassadorStatus }): Promise<AmbassadorRow[]> {
    return this.ambassadors.list(q.status);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string) {
    return this.ambassadors.approve(id, currentUserId());
  }

  @Post(':id/decline')
  @HttpCode(200)
  async decline(@Param('id') id: string, @Body(new ZodPipe(ambassadorDeclineSchema)) body: { reason: string }) {
    await this.ambassadors.decline(id, body.reason, currentUserId());
    return { ok: true };
  }

  @Post(':id/suspend')
  @HttpCode(200)
  async suspend(@Param('id') id: string, @Body(new ZodPipe(ambassadorSuspendSchema)) body: { suspend: boolean; reason: string }) {
    await this.ambassadors.suspend(id, body.suspend, body.reason);
    return { ok: true };
  }

  @Put(':id/code')
  code(@Param('id') id: string, @Body(new ZodPipe(ambassadorCodeSchema)) body: { code: string }) {
    return this.ambassadors.setCode(id, body.code);
  }

  /** The ambassador's data-subject export, including the full account number. Super admin only, audit-logged. */
  @Get(':id/export')
  @RequirePlatformRole('SUPER_ADMIN')
  async export(@Param('id') id: string) {
    const out = await this.ambassadors.ownExport(id, true);
    await this.audit.log({ tenantId: null, action: 'ambassador.data_export', entityType: 'Ambassador', entityId: id, summary: `Exported all data held about ambassador ${out.profile.fullName} (data subject request)` });
    return out;
  }

  @Get('referrals/list')
  referrals(): Promise<ConsoleReferralRow[]> {
    return this.ambassadors.referrals();
  }

  @Get('referrals/schools')
  schools(@Query(new ZodPipe(z.object({ q: z.string().max(80).optional() }))) q: { q?: string }) {
    return this.ambassadors.schoolSearch(q.q?.trim() ?? '');
  }

  @Put('referrals/:tenantId')
  assign(@Param('tenantId') tenantId: string, @Body(new ZodPipe(referralAssignSchema)) body: ReferralAssignInput) {
    return this.ambassadors.assign(tenantId, body.ambassadorId, body.reason, currentUserId());
  }

  @Get('commissions/list')
  commissions(
    @Query(new ZodPipe(z.object({ status: z.enum(COMMISSION_STATUSES).optional(), ambassadorId: z.string().max(40).optional(), tenantId: z.string().max(40).optional() })))
    q: { status?: CommissionStatus; ambassadorId?: string; tenantId?: string },
  ): Promise<ConsoleCommissionRow[]> {
    return this.ambassadors.commissions(q);
  }

  @Post('commissions/:id/reverse')
  @HttpCode(200)
  async reverse(@Param('id') id: string, @Body(new ZodPipe(commissionReverseSchema)) body: { reason: string }) {
    await this.ambassadors.reverse(id, body.reason, currentUserId());
    return { ok: true };
  }

  @Get('payouts/due')
  due(): Promise<PayoutDueRow[]> {
    return this.ambassadors.payoutsDue();
  }

  @Get('payouts/history')
  history(): Promise<ConsolePayoutRow[]> {
    return this.ambassadors.payoutHistory();
  }

  /** The bank transfer list with full account numbers. Super admin only; every download is audit-logged. */
  @Get('payouts/export.csv')
  @RequirePlatformRole('SUPER_ADMIN')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('cache-control', 'no-store')
  csv() {
    return this.ambassadors.payoutCsv(currentUserId());
  }

  @Post('payouts')
  @HttpCode(200)
  markPaid(@Body(new ZodPipe(payoutMarkPaidSchema)) body: PayoutMarkPaidInput) {
    return this.ambassadors.markPaid(body, currentUserId());
  }

  @Get('settings')
  settings(): Promise<AmbassadorSettings> {
    return this.ambassadors.settings();
  }

  @Put('settings')
  @RequirePlatformRole('SUPER_ADMIN')
  saveSettings(@Body(new ZodPipe(ambassadorSettingsSchema)) body: AmbassadorSettings) {
    return this.ambassadors.saveSettings(body, currentUserId());
  }
}
