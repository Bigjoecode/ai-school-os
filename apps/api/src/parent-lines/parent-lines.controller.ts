import { Body, Controller, Delete, Get, Header, HttpCode, Logger, NotFoundException, Param, Post, Put, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  normalisePhone,
  parentLineOverrideSchema,
  parentLinePlatformSchema,
  parentLineSettingsSchema,
  parentLineSimulateSchema,
  type ParentLineOverrideInput,
  type ParentLinePlatformInput,
  type ParentLinePlatformView,
  type ParentLineSettings,
  type ParentLineSimulateInput,
  type ParentLineSimulateResult,
  type ParentLineStatus,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { Public, RequireFeature, RequirePermissions, RequirePlatformRole } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ParentLinesAdminService } from './parent-lines-admin.service';
import { maskPhone, ParentLinesService } from './parent-lines.service';

/** Where this API is reachable from outside (for the callback URLs shown to staff). */
function publicOrigin(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
  return `${proto}://${host}`;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Provider → platform. Public; each callback is trusted only when its URL
 * carries the line's long random secret (Africa's Talking does not sign
 * callbacks; the secret is stored hashed and encrypted). Unknown secrets get
 * a plain 404. The caller's number comes from the mobile network.
 */
@Controller('parent-lines')
export class ParentLinesWebhookController {
  private readonly logger = new Logger(ParentLinesWebhookController.name);

  constructor(
    private readonly admin: ParentLinesAdminService,
    private readonly lines: ParentLinesService,
  ) {}

  /** Africa's Talking USSD: form fields sessionId, serviceCode, phoneNumber, text. Answers "CON …" or "END …" as text/plain. */
  @Public()
  @Post('at/:secret/ussd')
  @HttpCode(200)
  @Header('content-type', 'text/plain; charset=utf-8')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async ussd(@Param('secret') secret: string, @Body() body: Record<string, unknown>): Promise<string> {
    const route = await this.admin.route(secret);
    if (!route) throw new NotFoundException();
    const phone = normalisePhone(str(body?.phoneNumber, 20));
    if (!phone) return 'END Sorry, we could not read your phone number.';
    try {
      const r = await this.lines.ussd({ channel: 'USSD', provider: 'africastalking', simulated: false, phone, sessionId: str(body?.sessionId, 100) || null, scope: route.scope, account: route.account }, str(body?.text, 160));
      return `${r.end ? 'END' : 'CON'} ${r.reply}`;
    } catch (err) {
      this.logger.error(`USSD request from ${maskPhone(phone)} failed: ${(err as Error).stack ?? (err as Error).message}`);
      return 'END Sorry, something went wrong. Please try again later.';
    }
  }

  /** Africa's Talking incoming SMS: form fields from, to, text, date, id, linkId. The reply is sent through the SMS API. */
  @Public()
  @Post('at/:secret/sms')
  @HttpCode(200)
  @Header('content-type', 'text/plain; charset=utf-8')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async atSms(@Param('secret') secret: string, @Body() body: Record<string, unknown>): Promise<string> {
    const route = await this.admin.route(secret);
    if (!route) throw new NotFoundException();
    const phone = normalisePhone(str(body?.from, 20));
    if (!phone) return 'OK';
    // Answer the provider at once; replying can take a few seconds.
    setImmediate(() => {
      void this.lines
        .sms({ channel: 'SMS', provider: 'africastalking', simulated: false, phone, sessionId: str(body?.id, 100) || null, scope: route.scope, account: route.account }, str(body?.text, 160))
        .catch((err: Error) => this.logger.error(`SMS from ${maskPhone(phone)} failed: ${err.stack ?? err.message}`));
    });
    return 'OK';
  }

  /**
   * Any other aggregator that can forward incoming SMS: JSON or form with
   * from (or msisdn/phone) and text (or message). The reply comes back as
   * { reply } for the aggregator to send; empty when the line stays silent.
   */
  @Public()
  @Post('generic/:secret/sms')
  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async genericSms(@Param('secret') secret: string, @Body() body: Record<string, unknown>): Promise<{ reply: string }> {
    const route = await this.admin.route(secret);
    if (!route) throw new NotFoundException();
    const phone = normalisePhone(str(body?.from ?? body?.msisdn ?? body?.phone, 20));
    if (!phone) return { reply: '' };
    const r = await this.lines.sms({ channel: 'SMS', provider: 'generic', simulated: false, phone, sessionId: str(body?.id, 100) || null, scope: route.scope, account: null }, str(body?.text ?? body?.message, 160));
    return { reply: r.silent ? '' : r.reply };
  }
}

/** Staff: Messages → SMS & USSD. */
@Controller('comms/parent-lines')
@RequireFeature('messaging')
export class ParentLinesController {
  constructor(
    private readonly admin: ParentLinesAdminService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('comms.read')
  status(@Req() req: Request): Promise<ParentLineStatus> {
    return this.admin.status(publicOrigin(req));
  }

  @Put()
  @RequirePermissions('comms.manage')
  save(@Body(new ZodPipe(parentLineSettingsSchema)) body: ParentLineSettings, @Req() req: Request): Promise<ParentLineStatus> {
    return this.admin.saveSettings(body, publicOrigin(req));
  }

  @Put('own-code')
  @RequirePermissions('comms.manage')
  saveOwn(@Body(new ZodPipe(parentLineOverrideSchema)) body: ParentLineOverrideInput, @Req() req: Request): Promise<ParentLineStatus> {
    return this.admin.saveOverride(body, publicOrigin(req));
  }

  @Delete('own-code')
  @RequirePermissions('comms.manage')
  removeOwn(@Req() req: Request): Promise<ParentLineStatus> {
    return this.admin.removeOverride(publicOrigin(req));
  }

  /** Shows a parent's replies, so only staff who manage messaging may use it; each use is audited. */
  @Post('simulate')
  @HttpCode(200)
  @RequirePermissions('comms.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async simulate(@Body(new ZodPipe(parentLineSimulateSchema)) body: ParentLineSimulateInput): Promise<ParentLineSimulateResult> {
    const r = await this.admin.simulate(body);
    // One audit line per USSD session start or SMS, not per screen.
    if (body.channel === 'SMS' || body.text.trim() === '') {
      await this.audit.log({ action: 'comms.parent_line_simulated', summary: `Tested the parent ${body.channel} line as ${maskPhone(normalisePhone(body.phone) ?? body.phone)}` });
    }
    return r;
  }
}

/** Platform console: the shared USSD code and short code for every school. */
@Controller('platform/parent-lines')
@RequirePlatformRole('SUPER_ADMIN')
export class ParentLinesPlatformController {
  constructor(private readonly admin: ParentLinesAdminService) {}

  @Get()
  view(@Req() req: Request): Promise<ParentLinePlatformView> {
    return this.admin.platformView(publicOrigin(req));
  }

  @Put()
  save(@Body(new ZodPipe(parentLinePlatformSchema)) body: ParentLinePlatformInput, @Req() req: Request): Promise<ParentLinePlatformView> {
    return this.admin.savePlatform(body, publicOrigin(req));
  }
}
