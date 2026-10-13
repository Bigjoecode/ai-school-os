import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  addonOrderActionSchema,
  addonOrderSchema,
  addonSchema,
  PLAN_ENQUIRY_STATUSES,
  PLATFORM_AREAS,
  planEnquirySchema,
  pricingSettingsSchema,
  tenantSetupFeeSchema,
  type AddonInput,
  type AddonOrderAction,
  type AddonOrderInput,
  type AddonOrderRow,
  type PlanEnquiryInput,
  type PlanEnquiryStatus,
  type PricingConsole,
  type SchoolPricing,
  type SmsAllowance,
  type TenantSetupFeeInput,
} from '@aischool/shared';
import { z } from 'zod';
import { Public, RequirePermissions, RequirePlatformRole } from '../common/decorators';
import { currentContext, currentTenantId, currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PricingService } from './pricing.service';

/** "Talk to us" from the pricing page (Ultimate, custom deals): no account needed, rate-limited per IP. */
@Controller('signup')
export class PricingPublicController {
  constructor(private readonly pricing: PricingService) {}

  @Public()
  @Post('enquiry')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  enquire(@Body(new ZodPipe(planEnquirySchema)) body: PlanEnquiryInput) {
    return this.pricing.enquire(body, currentContext().ip);
  }
}

/** A school's price list: its plan, setup fee, included SMS, add-ons (buy or ask for a quote). */
@Controller('billing')
export class SchoolPricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('pricing')
  @RequirePermissions('billing.manage')
  overview(): Promise<SchoolPricing> {
    return this.pricing.schoolPricing(currentTenantId());
  }

  /** The included SMS this term, for the Messages page. */
  @Get('sms-allowance')
  @RequirePermissions('comms.read')
  sms(): Promise<SmsAllowance> {
    return this.pricing.smsAllowance(currentTenantId());
  }

  @Post('addons')
  @HttpCode(200)
  @RequirePermissions('billing.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  order(@Body(new ZodPipe(addonOrderSchema)) body: AddonOrderInput): Promise<AddonOrderRow> {
    return this.pricing.order(currentTenantId(), currentUserId(), body);
  }

  @Post('addons/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('billing.manage')
  cancel(@Param('id') id: string) {
    return this.pricing.cancelOrder(currentTenantId(), id);
  }
}

/** The console: price list settings, the add-on catalogue, add-on requests, enquiries and per-school setup fees. */
@Controller('platform')
@RequirePlatformRole(...PLATFORM_AREAS.billing)
export class ConsolePricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('pricing')
  overview(): Promise<PricingConsole> {
    return this.pricing.consoleOverview();
  }

  @Put('pricing/settings')
  @RequirePlatformRole('SUPER_ADMIN', 'FINANCE_ADMIN')
  settings(@Body(new ZodPipe(pricingSettingsSchema.pick({ smsOverage: true, smsOverageKobo: true, notes: true }))) body: z.infer<typeof pricingSettingsSchema>) {
    return this.pricing.saveSettings(body, currentUserId());
  }

  @Post('addons')
  @RequirePlatformRole('SUPER_ADMIN', 'FINANCE_ADMIN')
  create(@Body(new ZodPipe(addonSchema)) body: AddonInput) {
    return this.pricing.createAddon(body);
  }

  @Put('addons/:id')
  @RequirePlatformRole('SUPER_ADMIN', 'FINANCE_ADMIN')
  update(@Param('id') id: string, @Body(new ZodPipe(addonSchema)) body: AddonInput) {
    return this.pricing.updateAddon(id, body);
  }

  @Delete('addons/:id')
  @HttpCode(204)
  @RequirePlatformRole('SUPER_ADMIN')
  remove(@Param('id') id: string) {
    return this.pricing.deleteAddon(id);
  }

  @Post('addon-orders/:id')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN', 'FINANCE_ADMIN')
  act(@Param('id') id: string, @Body(new ZodPipe(addonOrderActionSchema)) body: AddonOrderAction): Promise<AddonOrderRow> {
    return this.pricing.actOnOrder(id, body, currentUserId());
  }

  /** Runs the SMS allowance checks now (warnings, extra-page invoices); they otherwise run every 30 minutes. */
  @Post('pricing/run-sms')
  @HttpCode(200)
  async runSms() {
    return { done: await this.pricing.tick(true) };
  }

  @Put('plan-enquiries/:id')
  enquiryStatus(@Param('id') id: string, @Body(new ZodPipe(z.object({ status: z.enum(PLAN_ENQUIRY_STATUSES) }))) body: { status: PlanEnquiryStatus }) {
    return this.pricing.setEnquiryStatus(id, body.status);
  }

  @Put('tenants/:id/setup-fee')
  @RequirePlatformRole('SUPER_ADMIN', 'FINANCE_ADMIN')
  setupFee(@Param('id') id: string, @Body(new ZodPipe(tenantSetupFeeSchema)) body: TenantSetupFeeInput) {
    return this.pricing.setSetupFee(id, body, currentUserId());
  }
}
