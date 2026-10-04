import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  admissionDecisionSchema,
  admissionDocumentSchema,
  admissionMoveSchema,
  admissionsSettingsSchema,
  applicationFeeSchema,
  applicationListQuerySchema,
  applicationSchema,
  enrolApplicantSchema,
  examScoreSchema,
  makeOfferSchema,
  scheduleAssessmentSchema,
  type AdmissionDecisionInput,
  type AdmissionDetail,
  type AdmissionDocument,
  type AdmissionList,
  type AdmissionMoveInput,
  type AdmissionsMeta,
  type AdmissionsSettings,
  type AdmissionsStats,
  type ApplicationFeeInput,
  type ApplicationInput,
  type ApplicationListQuery,
  type EnrolApplicantInput,
  type EnrolPreview,
  type EnrolResult,
  type ExamScoreInput,
  type MakeOfferInput,
  type OfferLetter,
  type ScheduleAssessmentInput,
} from '@aischool/shared';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { FilesService } from '../files/files.service';
import { AdmissionsService } from './admissions.service';

@Controller('admissions')
export class AdmissionsController {
  constructor(
    private readonly admissions: AdmissionsService,
    private readonly files: FilesService,
  ) {}

  // ---------------------------------------------------------- school-wide

  @Get('meta')
  @RequirePermissions('admissions.read')
  meta(): Promise<AdmissionsMeta> {
    return this.admissions.meta();
  }

  @Put('settings')
  @RequirePermissions('admissions.manage')
  setSettings(@Body(new ZodPipe(admissionsSettingsSchema)) body: AdmissionsSettings): Promise<AdmissionsSettings> {
    return this.admissions.setSettings(body);
  }

  @Get('stats')
  @RequirePermissions('admissions.read')
  stats(): Promise<AdmissionsStats> {
    return this.admissions.stats();
  }

  @Get('enquiries/:enquiryId/prefill')
  @RequirePermissions('admissions.manage')
  prefill(@Param('enquiryId') enquiryId: string) {
    return this.admissions.enquiryPrefill(enquiryId);
  }

  // ---------------------------------------------------------- applications

  @Get()
  @RequirePermissions('admissions.read')
  list(@Query(new ZodPipe(applicationListQuerySchema)) q: ApplicationListQuery): Promise<AdmissionList> {
    return this.admissions.list(q);
  }

  @Post()
  @RequirePermissions('admissions.manage')
  async create(@Body(new ZodPipe(applicationSchema)) body: ApplicationInput): Promise<AdmissionDetail> {
    const a = await this.admissions.create(body.source === 'WEBSITE' ? { ...body, source: 'FRONT_DESK' } : body);
    return this.admissions.detail(a.id);
  }

  @Get(':id')
  @RequirePermissions('admissions.read')
  get(@Param('id') id: string): Promise<AdmissionDetail> {
    return this.admissions.detail(id);
  }

  @Put(':id')
  @RequirePermissions('admissions.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(applicationSchema)) body: ApplicationInput): Promise<AdmissionDetail> {
    await this.admissions.update(id, body);
    return this.admissions.detail(id);
  }

  @Post(':id/move')
  @HttpCode(200)
  @RequirePermissions('admissions.manage')
  async move(@Param('id') id: string, @Body(new ZodPipe(admissionMoveSchema)) body: AdmissionMoveInput): Promise<AdmissionDetail> {
    await this.admissions.move(id, body.status, body.note);
    return this.admissions.detail(id);
  }

  @Post(':id/schedule')
  @HttpCode(200)
  @RequirePermissions('admissions.manage')
  async schedule(@Param('id') id: string, @Body(new ZodPipe(scheduleAssessmentSchema)) body: ScheduleAssessmentInput): Promise<AdmissionDetail> {
    await this.admissions.schedule(id, body);
    return this.admissions.detail(id);
  }

  @Post(':id/score')
  @HttpCode(200)
  @RequirePermissions('admissions.manage')
  async score(@Param('id') id: string, @Body(new ZodPipe(examScoreSchema)) body: ExamScoreInput): Promise<AdmissionDetail> {
    await this.admissions.score(id, body);
    return this.admissions.detail(id);
  }

  @Post(':id/offer')
  @HttpCode(200)
  @RequirePermissions('admissions.manage')
  async offer(@Param('id') id: string, @Body(new ZodPipe(makeOfferSchema)) body: MakeOfferInput): Promise<AdmissionDetail> {
    await this.admissions.offer(id, body);
    return this.admissions.detail(id);
  }

  @Post(':id/decision')
  @HttpCode(200)
  @RequirePermissions('admissions.manage')
  async decide(@Param('id') id: string, @Body(new ZodPipe(admissionDecisionSchema)) body: AdmissionDecisionInput): Promise<AdmissionDetail> {
    await this.admissions.decide(id, body);
    return this.admissions.detail(id);
  }

  @Post(':id/fee')
  @HttpCode(200)
  @RequirePermissions('admissions.manage')
  async fee(@Param('id') id: string, @Body(new ZodPipe(applicationFeeSchema)) body: ApplicationFeeInput): Promise<AdmissionDetail> {
    await this.admissions.recordFee(id, body);
    return this.admissions.detail(id);
  }

  // ---------------------------------------------------------- documents

  /** Attach a file already uploaded through POST /files/private. */
  @Post(':id/documents')
  @HttpCode(200)
  @RequirePermissions('admissions.manage')
  async addDocument(@Param('id') id: string, @Body(new ZodPipe(admissionDocumentSchema)) body: AdmissionDocument): Promise<AdmissionDetail> {
    await this.admissions.addDocument(id, body);
    return this.admissions.detail(id);
  }

  @Delete(':id/documents/:fileId')
  @RequirePermissions('admissions.manage')
  async removeDocument(@Param('id') id: string, @Param('fileId') fileId: string): Promise<AdmissionDetail> {
    await this.admissions.removeDocument(id, fileId);
    return this.admissions.detail(id);
  }

  @Get(':id/documents/:fileId')
  @RequirePermissions('admissions.read')
  async document(@Param('id') id: string, @Param('fileId') fileId: string, @Res() res: Response) {
    const f = await this.files.read(await this.admissions.documentFileId(id, fileId), false);
    res.setHeader('content-type', f.mimeType);
    res.setHeader('content-length', String(f.data.length));
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('content-security-policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('cache-control', 'private, max-age=300');
    res.setHeader('content-disposition', `${f.inline ? 'inline' : 'attachment'}; filename="${f.filename.replace(/"/g, '')}"`);
    res.end(f.data);
  }

  // ---------------------------------------------------------- enrolment & letters

  @Get(':id/enrol-preview')
  @RequirePermissions('admissions.manage')
  enrolPreview(@Param('id') id: string): Promise<EnrolPreview> {
    return this.admissions.enrolPreview(id);
  }

  @Post(':id/enrol')
  @HttpCode(200)
  @RequirePermissions('admissions.manage')
  enrol(@Param('id') id: string, @Body(new ZodPipe(enrolApplicantSchema)) body: EnrolApplicantInput): Promise<EnrolResult> {
    return this.admissions.enrol(id, body);
  }

  @Get(':id/offer-letter')
  @RequirePermissions('admissions.read')
  offerLetter(@Param('id') id: string): Promise<OfferLetter> {
    return this.admissions.offerLetter(id);
  }
}
