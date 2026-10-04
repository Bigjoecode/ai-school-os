import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, HttpCode, Logger, Param, Post, Put, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  whatsappAssistantSettingsSchema,
  whatsappReplySchema,
  type WhatsappAssistantSettingsInput,
  type WhatsappAssistantStatus,
  type WhatsappThread,
  type WhatsappThreadRow,
} from '@aischool/shared';
import { Public, RequireFeature, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { siteOrigin } from '../finance/finance.controller';
import { WhatsappAssistantService } from './whatsapp-assistant.service';

const phoneParam = (raw: string) => {
  if (!/^\d{8,15}$/.test(raw)) throw new BadRequestException('Unknown phone number');
  return raw;
};

/** Where this API is reachable from outside, for links in replies and the webhook URL. */
function publicOrigin(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
  return `${proto}://${host}`;
}

/**
 * Meta → school. Public, but every message is trusted only after its
 * X-Hub-Signature-256 checks out against the receiving school's App Secret.
 * Answers 200 straight away and handles the messages afterwards, so Meta
 * doesn't time out and resend; re-sent messages are de-duplicated by id.
 */
@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(private readonly assistant: WhatsappAssistantService) {}

  @Public()
  @Get()
  @Header('content-type', 'text/plain')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async verify(@Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string): Promise<string> {
    const echo = await this.assistant.verifyHandshake(mode, token, challenge);
    if (echo === null) throw new ForbiddenException('Verify token not recognised');
    return echo;
  }

  @Public()
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async receive(@Req() req: Request & { rawBody?: Buffer }) {
    const batch = await this.assistant.accept(req.rawBody, req.headers['x-hub-signature-256'] as string | undefined, req.body, publicOrigin(req));
    if (!batch) throw new UnauthorizedException('Bad signature');
    if (batch.messages.length || batch.statuses.length) {
      // Fire and forget: process() captures its own errors.
      setImmediate(() => void this.assistant.process(batch).catch((err: Error) => this.logger.error(`WhatsApp processing failed: ${err.message}`)));
    }
    return { ok: true };
  }
}

/** Staff side: settings, the conversation inbox, replies and resolving. */
@Controller('comms/whatsapp-assistant')
@RequireFeature('messaging')
export class WhatsappAssistantController {
  constructor(private readonly assistant: WhatsappAssistantService) {}

  @Get()
  @RequirePermissions('comms.read')
  status(@Req() req: Request): Promise<WhatsappAssistantStatus> {
    return this.assistant.status(siteOrigin(req));
  }

  @Put()
  @RequirePermissions('comms.manage')
  save(@Body(new ZodPipe(whatsappAssistantSettingsSchema)) body: WhatsappAssistantSettingsInput, @Req() req: Request): Promise<WhatsappAssistantStatus> {
    return this.assistant.saveSettings(body, siteOrigin(req));
  }

  @Get('threads')
  @RequirePermissions('comms.read')
  threads(): Promise<WhatsappThreadRow[]> {
    return this.assistant.threads();
  }

  @Get('threads/:phone')
  @RequirePermissions('comms.read')
  thread(@Param('phone') phone: string): Promise<WhatsappThread> {
    return this.assistant.thread(phoneParam(phone));
  }

  @Post('threads/:phone/reply')
  @HttpCode(200)
  @RequirePermissions('comms.send')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  reply(@Param('phone') phone: string, @Body(new ZodPipe(whatsappReplySchema)) body: { text: string }): Promise<WhatsappThread> {
    return this.assistant.staffReply(phoneParam(phone), body.text);
  }

  @Post('threads/:phone/resolve')
  @HttpCode(200)
  @RequirePermissions('comms.send')
  resolve(@Param('phone') phone: string): Promise<WhatsappThread> {
    return this.assistant.resolve(phoneParam(phone));
  }
}
