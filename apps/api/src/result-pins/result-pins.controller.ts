import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  buyPinSchema,
  createPinBatchSchema,
  extendPinBatchSchema,
  pinCheckSchema,
  sellPinsSchema,
  voidPinSchema,
  type BuyPinInput,
  type CreatePinBatchInput,
  type PinBatchRow,
  type PinCardDetail,
  type PinChallenge,
  type PinCheckInput,
  type PinCheckResult,
  type PinExport,
  type PinOverview,
  type PinPurchaseResult,
  type PinPurchaseStart,
  type PinSaleRow,
  type PinUseRow,
  type PublicPinInfo,
} from '@aischool/shared';
import { z } from 'zod';
import { Public, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { siteOrigin } from '../finance/finance.controller';
import { ResultPinsService } from './result-pins.service';

const reasonSchema = z.object({ reason: z.string().trim().min(2).max(200) });

/** Result-checker cards for the bursar: generate, print once, sell, void, and see how they are used. */
@Controller('result-pins')
export class ResultPinsController {
  constructor(private readonly pins: ResultPinsService) {}

  @Get()
  @RequirePermissions('finance.read')
  overview(): Promise<PinOverview> {
    return this.pins.overview();
  }

  @Post('batches')
  @RequirePermissions('finance.manage')
  generate(@Body(new ZodPipe(createPinBatchSchema)) body: CreatePinBatchInput): Promise<PinBatchRow> {
    return this.pins.generate(body);
  }

  /** One time only: the PINs for printing and the CSV. */
  @Post('batches/:id/export')
  @HttpCode(200)
  @RequirePermissions('finance.manage')
  export(@Param('id') id: string, @Req() req: Request): Promise<PinExport> {
    return this.pins.export(id, siteOrigin(req));
  }

  @Patch('batches/:id/expiry')
  @RequirePermissions('finance.manage')
  extend(@Param('id') id: string, @Body(new ZodPipe(extendPinBatchSchema)) body: { expiresOn: string }): Promise<PinBatchRow> {
    return this.pins.extend(id, body.expiresOn);
  }

  @Post('batches/:id/void')
  @HttpCode(200)
  @RequirePermissions('finance.manage')
  voidBatch(@Param('id') id: string, @Body(new ZodPipe(reasonSchema)) body: { reason: string }): Promise<PinBatchRow> {
    return this.pins.voidBatch(id, body.reason);
  }

  @Post('sell')
  @HttpCode(200)
  @RequirePermissions('finance.manage')
  sell(@Body(new ZodPipe(sellPinsSchema)) body: z.infer<typeof sellPinsSchema>) {
    return this.pins.sell(body.fromSerial, body.toSerial, body.soldTo);
  }

  @Get('cards/:serial')
  @RequirePermissions('finance.read')
  card(@Param('serial') serial: string): Promise<PinCardDetail> {
    return this.pins.card(serial.replace(/[\s-]/g, ''));
  }

  @Get('find')
  @RequirePermissions('finance.read')
  find(@Query('last4') last4?: string) {
    if (!last4 || !/^\d{4}$/.test(last4)) throw new BadRequestException('Enter the last four digits of the PIN');
    return this.pins.findByLast4(last4);
  }

  @Post('cards/void')
  @HttpCode(200)
  @RequirePermissions('finance.manage')
  voidCard(@Body(new ZodPipe(voidPinSchema)) body: z.infer<typeof voidPinSchema>): Promise<PinCardDetail> {
    return this.pins.voidCard(body.serial.replace(/[\s-]/g, ''), body.reason);
  }

  @Post('cards/:serial/unlock')
  @HttpCode(200)
  @RequirePermissions('finance.manage')
  unlock(@Param('serial') serial: string): Promise<PinCardDetail> {
    return this.pins.unlockCard(serial);
  }

  @Get('uses')
  @RequirePermissions('finance.read')
  uses(@Query('batchId') batchId?: string): Promise<PinUseRow[]> {
    return this.pins.uses({ batchId: batchId || undefined });
  }

  @Get('sales')
  @RequirePermissions('finance.read')
  sales(): Promise<PinSaleRow[]> {
    return this.pins.sales();
  }
}

/** The public checker and online card shop: no sign-in, rate-limited. */
@Controller('public/result-pins')
export class PublicResultPinsController {
  constructor(private readonly pins: ResultPinsService) {}

  @Get(':slug')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  info(@Param('slug') slug: string): Promise<PublicPinInfo> {
    return this.pins.publicInfo(slug);
  }

  @Get(':slug/challenge')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async challenge(@Param('slug') slug: string): Promise<PinChallenge> {
    await this.pins.publicTenant(slug);
    return this.pins.challenge();
  }

  @Post(':slug/check')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async check(@Param('slug') slug: string, @Body(new ZodPipe(pinCheckSchema)) body: PinCheckInput): Promise<PinCheckResult> {
    await this.pins.publicTenant(slug);
    return this.pins.check({ serial: body.serial, pin: body.pin, termId: body.termId, who: { admissionNumber: body.admissionNumber, surname: body.surname }, channel: 'WEB', challenge: body.challenge });
  }

  @Post(':slug/buy')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  buy(@Param('slug') slug: string, @Body(new ZodPipe(buyPinSchema)) body: BuyPinInput, @Req() req: Request): Promise<PinPurchaseStart> {
    return this.pins.startPurchase(slug, body, siteOrigin(req));
  }

  @Get(':slug/purchase/:reference')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  purchase(@Param('slug') slug: string, @Param('reference') reference: string, @Query('claim') claim = ''): Promise<PinPurchaseResult> {
    if (!/^[0-9a-f]{32}$/.test(claim)) throw new BadRequestException('This link is incomplete');
    return this.pins.purchase(slug, reference, claim);
  }
}
