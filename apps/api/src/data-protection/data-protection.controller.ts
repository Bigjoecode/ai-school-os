import { Body, Controller, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  DSR_SUBJECT_TYPES,
  consentAcceptSchema,
  consentWithdrawSchema,
  dataProtectionSettingsSchema,
  dpaAcceptSchema,
  dsrCloseSchema,
  dsrLogSchema,
  type ConsentAcceptInput,
  type ConsentWithdrawInput,
  type DataProtectionOverview,
  type DataProtectionSettings,
  type DataProtectionSettingsInput,
  type DpaAcceptInput,
  type DsrCloseInput,
  type DsrLogInput,
  type DsrRequestRow,
  type DsrSubjectHit,
  type DsrSubjectType,
  type MyConsentStatus,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { DataProtectionService } from './data-protection.service';
import { SubjectExportService } from './subject-export.service';

const exportParams = z.object({ type: z.enum(DSR_SUBJECT_TYPES), id: z.string().min(1).max(40) });

@Controller('data-protection')
export class DataProtectionController {
  constructor(
    private readonly dp: DataProtectionService,
    private readonly subjects: SubjectExportService,
  ) {}

  // ---------------------------------------------------------- the signed-in parent

  @Get('consent/me')
  myConsent(): Promise<MyConsentStatus> {
    return this.dp.myStatus();
  }

  @Post('consent')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  accept(@Body(new ZodPipe(consentAcceptSchema)) body: ConsentAcceptInput): Promise<MyConsentStatus> {
    return this.dp.accept(body.version);
  }

  @Post('consent/withdraw')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  withdraw(@Body(new ZodPipe(consentWithdrawSchema)) body: ConsentWithdrawInput): Promise<MyConsentStatus> {
    return this.dp.withdraw(body.reason);
  }

  // ---------------------------------------------------------- school admin

  @Get('overview')
  @RequirePermissions('school.read')
  overview(): Promise<DataProtectionOverview> {
    return this.dp.overview();
  }

  @Put('settings')
  @RequirePermissions('school.manage')
  setSettings(@Body(new ZodPipe(dataProtectionSettingsSchema)) body: DataProtectionSettingsInput): Promise<DataProtectionSettings> {
    return this.dp.setConsentRequired(body.consentRequired);
  }

  @Post('dpa/accept')
  @RequirePermissions('school.manage')
  acceptDpa(@Body(new ZodPipe(dpaAcceptSchema)) body: DpaAcceptInput): Promise<DataProtectionSettings> {
    return this.dp.acceptDpa(body);
  }

  @Get('consents.csv')
  @RequirePermissions('school.manage')
  async consents(@Query(new ZodPipe(z.object({ history: z.enum(['0', '1']).optional() }))) q: { history?: '0' | '1' }, @Res() res: Response): Promise<void> {
    const csv = await this.dp.consentsCsv(q.history === '1');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('subjects')
  @RequirePermissions('school.manage')
  search(@Query(new ZodPipe(z.object({ q: z.string().max(100).default('') }))) q: { q: string }): Promise<DsrSubjectHit[]> {
    return this.subjects.search(q.q);
  }

  @Get('subjects/:type/:id/export.json')
  @RequirePermissions('school.manage')
  @Throttle({ default: { limit: 20, ttl: 10 * 60_000 } })
  async exportJson(@Param(new ZodPipe(exportParams)) p: { type: DsrSubjectType; id: string }, @Res() res: Response): Promise<void> {
    const name = await this.subjects.fileName(p.type, p.id);
    const body = await this.subjects.json(p.type, p.id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.json"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Cache-Control', 'no-store');
    res.send(JSON.stringify(body, null, 2));
  }

  @Post('subjects/:type/:id/export.zip')
  @RequirePermissions('school.manage')
  @Throttle({ default: { limit: 20, ttl: 10 * 60_000 } })
  async exportZip(@Param(new ZodPipe(exportParams)) p: { type: DsrSubjectType; id: string }, @Res() res: Response): Promise<void> {
    const name = await this.subjects.fileName(p.type, p.id);
    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Cache-Control', 'no-store');
    await this.subjects.zip(p.type, p.id, res);
  }

  @Get('requests')
  @RequirePermissions('school.manage')
  requests(): Promise<DsrRequestRow[]> {
    return this.dp.requests();
  }

  @Post('requests')
  @RequirePermissions('school.manage')
  logRequest(@Body(new ZodPipe(dsrLogSchema)) body: DsrLogInput): Promise<DsrRequestRow[]> {
    return this.dp.logRequest(body);
  }

  @Post('requests/:id/close')
  @RequirePermissions('school.manage')
  closeRequest(@Param('id') id: string, @Body(new ZodPipe(dsrCloseSchema)) body: DsrCloseInput): Promise<DsrRequestRow[]> {
    return this.dp.closeRequest(id, body);
  }
}
