import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  DEFAULT_REPORT_TEMPLATE,
  REPORT_COLUMNS,
  REPORT_STUDENT_FIELDS,
  TRAIT_DOMAINS,
  reportTemplateConfigSchema,
  reportTemplateSchema,
  templateFromSampleSchema,
  traitRatingsSchema,
  type ReportTemplateConfig,
  type ReportTemplateRow,
  type TraitSheet,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import type { AiImage } from '../ai/providers/provider';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { FilesService } from '../files/files.service';
import { extractText } from '../knowledge/extract';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentSettingsService } from './assessment-settings.service';

/**
 * What the AI reads off a sample report card. Kept flat (no records or
 * defaults) so it works as strict structured output; it is then mapped onto
 * the template config and validated like any other save.
 */
const sampleSchema = z.object({
  title: z.string().describe('The heading of the report, e.g. "Continuous Assessment Report Sheet"'),
  accentColor: z.string().describe('The main colour of the card as #rrggbb; #1e3a8a if unclear'),
  showMotto: z.boolean(),
  showAddress: z.boolean(),
  extraLine: z.string().describe('Any other line under the school name (e.g. "Government approved"), or empty'),
  studentFields: z.array(z.enum(Object.keys(REPORT_STUDENT_FIELDS) as [string, ...string[]])).describe('The details shown about the student, in order'),
  columns: z.array(z.enum(Object.keys(REPORT_COLUMNS) as [string, ...string[]])).describe('The columns of the subjects table, in order'),
  columnLabels: z.array(z.object({ column: z.enum(Object.keys(REPORT_COLUMNS) as [string, ...string[]]), label: z.string() })).describe('Headings the card uses for those columns'),
  affectiveTitle: z.string().describe('Heading of the behaviour/affective ratings, or empty if the card has none'),
  affectiveTraits: z.array(z.string()),
  psychomotorTitle: z.string().describe('Heading of the skills/psychomotor ratings, or empty if the card has none'),
  psychomotorTraits: z.array(z.string()),
  ratingScale: z.array(z.object({ value: z.number().int(), label: z.string() })).describe('The rating key for the trait sections, highest first'),
  showGradingKey: z.boolean(),
  teacherCommentLabel: z.string(),
  principalCommentLabel: z.string(),
  signatures: z.array(z.string()).describe('Who signs the card, e.g. "Class teacher", "Principal", "Parent"'),
  footerNote: z.string().describe('Any note at the bottom, or empty'),
});

const traitQuery = z.object({ classArmId: z.string().min(1), termId: z.string().min(1), domain: z.enum(TRAIT_DOMAINS) });

/** The school's own report card layout, and the behaviour and skills ratings it prints. */
@Controller('report-cards')
export class ReportTemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly settings: AssessmentSettingsService,
  ) {}

  @Get('templates')
  @RequirePermissions('results.read')
  async templates(): Promise<{ templates: ReportTemplateRow[]; standard: ReportTemplateConfig }> {
    const rows = await this.prisma.db.reportCardTemplate.findMany({ orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
    return { templates: rows.map(row), standard: DEFAULT_REPORT_TEMPLATE };
  }

  @Post('templates')
  @RequirePermissions('results.publish')
  async create(@Body(new ZodPipe(reportTemplateSchema)) body: z.infer<typeof reportTemplateSchema>): Promise<ReportTemplateRow> {
    return this.save(null, body, null);
  }

  @Put('templates/:id')
  @RequirePermissions('results.publish')
  async update(@Param('id') id: string, @Body(new ZodPipe(reportTemplateSchema)) body: z.infer<typeof reportTemplateSchema>): Promise<ReportTemplateRow> {
    await this.prisma.db.reportCardTemplate.findUniqueOrThrow({ where: { id } });
    return this.save(id, body, null);
  }

  @Delete('templates/:id')
  @HttpCode(204)
  @RequirePermissions('results.publish')
  async remove(@Param('id') id: string) {
    const t = await this.prisma.db.reportCardTemplate.delete({ where: { id } });
    await this.audit.log({ action: 'report_template.deleted', entityType: 'ReportCardTemplate', entityId: id, summary: `Deleted the report card layout "${t.name}"` });
  }

  /**
   * Reads a photo or PDF of the school's current report card and drafts a
   * matching layout. Saved as a new (not default) template to check and edit.
   */
  @Post('templates/from-sample')
  @RequirePermissions('results.publish', 'ai.use')
  async fromSample(@Body(new ZodPipe(templateFromSampleSchema)) body: z.infer<typeof templateFromSampleSchema>): Promise<ReportTemplateRow> {
    if (!this.gateway.configuredProviders().length) throw new BadRequestException("AI isn't connected yet — design the layout by hand instead");
    const f = await this.files.read(body.fileId, false);
    let content = 'The sample report card is the attached image.';
    const images: AiImage[] = [];
    if (f.mimeType.startsWith('image/')) {
      images.push({ mediaType: f.mimeType as AiImage['mediaType'], data: f.data.toString('base64') });
    } else {
      const text = await extractText(f.data, f.mimeType).catch(() => '');
      if (text.trim().length < 40) throw new BadRequestException('No text could be read from this file. Take a clear photo of the report card and upload that instead.');
      content = `The text of the sample report card (layout lost, read the headings and labels):\n${text.slice(0, 20_000)}`;
    }
    const { components } = await this.settings.get();
    const r = await this.gateway.generateJson(
      {
        tier: 'advanced',
        system: [
          "You read a Nigerian school's report card and describe its layout so the school's software can print cards that look the same.",
          `Map what you see onto the allowed fields only. Student fields: ${Object.entries(REPORT_STUDENT_FIELDS).map(([k, v]) => `${k} (${v})`).join(', ')}.`,
          `Subject table columns: ${Object.entries(REPORT_COLUMNS).map(([k, v]) => `${k} (${v})`).join(', ')}. Use "components" once for all the CA/test/exam score columns.`,
          components.length ? `The school's assessment components are: ${components.map((c) => c.name).join(', ')}.` : '',
          'Copy trait names (e.g. Punctuality, Neatness, Handwriting) and the rating key exactly as printed. Do not invent sections the card does not have.',
        ].filter(Boolean).join('\n'),
        messages: [{ role: 'user', content, ...(images.length ? { images } : {}) }],
        maxOutputTokens: 3000,
      },
      sampleSchema,
      'report-template-sample',
    );
    const d = r.data;
    const config = reportTemplateConfigSchema.safeParse({
      paper: 'A4',
      accentColor: /^#[0-9a-fA-F]{6}$/.test(d.accentColor) ? d.accentColor : DEFAULT_REPORT_TEMPLATE.accentColor,
      header: { showLogo: true, title: d.title.trim().slice(0, 80) || 'Report Sheet', showMotto: d.showMotto, showAddress: d.showAddress, extraLine: d.extraLine.trim().slice(0, 160) || null },
      studentFields: [...new Set(d.studentFields)].slice(0, 14),
      columns: d.columns.length ? [...new Set(d.columns)].slice(0, 11) : DEFAULT_REPORT_TEMPLATE.columns,
      columnLabels: Object.fromEntries(d.columnLabels.filter((l) => l.label.trim()).map((l) => [l.column, l.label.trim().slice(0, 30)])),
      affective: section(d.affectiveTitle, d.affectiveTraits, DEFAULT_REPORT_TEMPLATE.affective),
      psychomotor: section(d.psychomotorTitle, d.psychomotorTraits, DEFAULT_REPORT_TEMPLATE.psychomotor),
      ratingScale: d.ratingScale.length >= 2 ? d.ratingScale.slice(0, 10).map((s) => ({ value: Math.max(0, Math.min(10, s.value)), label: s.label.trim().slice(0, 30) || String(s.value) })) : DEFAULT_REPORT_TEMPLATE.ratingScale,
      showGradingKey: d.showGradingKey,
      comments: { teacherLabel: d.teacherCommentLabel.trim().slice(0, 60) || DEFAULT_REPORT_TEMPLATE.comments.teacherLabel, principalLabel: d.principalCommentLabel.trim().slice(0, 60) || DEFAULT_REPORT_TEMPLATE.comments.principalLabel },
      signatures: d.signatures.map((s) => s.trim().slice(0, 60)).filter((s) => s.length >= 2).slice(0, 4),
      footerNote: d.footerNote.trim().slice(0, 300) || null,
    });
    if (!config.success) throw new BadRequestException('The sample could not be read clearly. Try a sharper photo, or start from the standard layout.');
    return this.save(null, { name: body.name, isDefault: false, config: config.data }, body.fileId);
  }

  // ---------------------------------------------------------- trait ratings

  /** One rating sheet (behaviour or skills) for a class and term. */
  @Get('traits')
  @RequirePermissions('results.read')
  async traits(@Query(new ZodPipe(traitQuery)) q: z.infer<typeof traitQuery>): Promise<TraitSheet> {
    const db = this.prisma.db;
    const [template, students] = await Promise.all([this.defaultConfig(), db.student.findMany({ where: { classArmId: q.classArmId, status: 'ACTIVE' }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] })]);
    const ratings = await db.studentTraitRating.findMany({ where: { termId: q.termId, domain: q.domain, studentId: { in: students.map((s) => s.id) } } });
    const sectionCfg = q.domain === 'AFFECTIVE' ? template.affective : template.psychomotor;
    const by = new Map<string, Record<string, number | null>>();
    for (const r of ratings) (by.get(r.studentId) ?? by.set(r.studentId, {}).get(r.studentId)!)[r.trait] = r.rating;
    return {
      domain: q.domain,
      traits: sectionCfg.traits,
      scale: template.ratingScale,
      students: students.map((s) => ({ id: s.id, name: fullName(s), admissionNumber: s.admissionNumber, ratings: Object.fromEntries(sectionCfg.traits.map((t) => [t, by.get(s.id)?.[t] ?? null])) })),
    };
  }

  /** Saves ratings (null clears one). The class teacher, or anyone who publishes results. */
  @Put('traits')
  @RequirePermissions('results.read')
  async saveTraits(@Body(new ZodPipe(traitRatingsSchema.extend({ classArmId: z.string().min(1) }))) body: z.infer<typeof traitRatingsSchema> & { classArmId: string }) {
    const ctx = currentContext();
    const db = this.prisma.db;
    const arm = await db.classArm.findUniqueOrThrow({ where: { id: body.classArmId }, include: { classTeacher: { select: { userId: true } } } });
    if (!ctx.permissions.has('results.publish') && arm.classTeacher?.userId !== ctx.userId) throw new ForbiddenException("Only this class's teacher (or the principal) can rate its students");
    await db.term.findUniqueOrThrow({ where: { id: body.termId } });
    const ids = [...new Set(body.ratings.map((r) => r.studentId))];
    const inClass = await db.student.count({ where: { id: { in: ids }, classArmId: arm.id } });
    if (inClass !== ids.length) throw new BadRequestException('Some students are not in this class');
    const tenantId = currentTenantId();
    const ops: Prisma.PrismaPromise<unknown>[] = body.ratings.map((r) => {
      const where = { studentId_termId_domain_trait: { studentId: r.studentId, termId: body.termId, domain: r.domain, trait: r.trait } };
      return r.rating === null
        ? db.studentTraitRating.deleteMany({ where: { studentId: r.studentId, termId: body.termId, domain: r.domain, trait: r.trait } })
        : db.studentTraitRating.upsert({ where, update: { rating: r.rating }, create: { tenantId, studentId: r.studentId, termId: body.termId, domain: r.domain, trait: r.trait, rating: r.rating } });
    });
    for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
    return { saved: body.ratings.length };
  }

  // ---------------------------------------------------------- helpers

  private async defaultConfig(): Promise<ReportTemplateConfig> {
    return defaultTemplate(this.prisma);
  }

  private async save(id: string | null, body: z.infer<typeof reportTemplateSchema>, sampleFileId: string | null): Promise<ReportTemplateRow> {
    const db = this.prisma.db;
    const count = await db.reportCardTemplate.count();
    // The first layout a school saves becomes the one its cards use.
    const isDefault = body.isDefault || count === 0 || (id !== null && count === 1);
    const data = { name: body.name, isDefault, config: body.config as unknown as Prisma.InputJsonValue };
    const t = await db.$transaction(async (tx) => {
      if (isDefault) await tx.reportCardTemplate.updateMany({ where: { isDefault: true, ...(id ? { id: { not: id } } : {}) }, data: { isDefault: false } });
      return id ? tx.reportCardTemplate.update({ where: { id }, data }) : tx.reportCardTemplate.create({ data: { ...data, tenantId: currentTenantId(), sampleFileId } });
    });
    await this.audit.log({
      action: id ? 'report_template.updated' : 'report_template.created',
      entityType: 'ReportCardTemplate',
      entityId: t.id,
      summary: `${id ? 'Updated' : sampleFileId ? 'Read a sample card into' : 'Created'} the report card layout "${t.name}"${isDefault ? ' (in use)' : ''}`,
    });
    return row(t);
  }
}

/** The layout a school's cards print with: its default template, else the standard Nigerian one. */
export async function defaultTemplate(prisma: PrismaService): Promise<ReportTemplateConfig> {
  const t = await prisma.db.reportCardTemplate.findFirst({ where: { isDefault: true } });
  const parsed = t ? reportTemplateConfigSchema.safeParse(t.config) : null;
  return parsed?.success ? parsed.data : DEFAULT_REPORT_TEMPLATE;
}

function row(t: Prisma.ReportCardTemplateGetPayload<object>): ReportTemplateRow {
  const parsed = reportTemplateConfigSchema.safeParse(t.config);
  return { id: t.id, name: t.name, isDefault: t.isDefault, config: parsed.success ? parsed.data : DEFAULT_REPORT_TEMPLATE, sampleFileId: t.sampleFileId, updatedAt: t.updatedAt.toISOString() };
}

function section(title: string, traits: string[], fallback: ReportTemplateConfig['affective']): ReportTemplateConfig['affective'] {
  const clean = [...new Set(traits.map((t) => t.trim().slice(0, 60)).filter((t) => t.length >= 2))].slice(0, 20);
  if (!title.trim() && !clean.length) return { ...fallback, enabled: false };
  return { enabled: true, title: title.trim().slice(0, 60) || fallback.title, traits: clean.length ? clean : fallback.traits };
}

