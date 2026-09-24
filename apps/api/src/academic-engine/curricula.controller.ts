import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  academicListQuerySchema,
  createCurriculumSchema,
  curriculumUnitSchema,
  generateCurriculumSchema,
  updateCurriculumSchema,
  type AcademicListQuery,
  type CreateCurriculumInput,
  type CurriculumDetail,
  type CurriculumSummary,
  type CurriculumUnitInput,
  type GenerateCurriculumInput,
  type UpdateCurriculumInput,
} from '@aischool/shared';
import type { ContentStatus } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicEngineService, curriculumInclude } from './academic-engine.service';

const addUnitSchema = curriculumUnitSchema.extend({
  termOrder: z.number().int().min(1).max(3),
  week: z.number().int().min(1).max(14),
});

@Controller('curricula')
export class CurriculaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AcademicEngineService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('curriculum.read')
  async list(@Query(new ZodPipe(academicListQuerySchema)) q: AcademicListQuery): Promise<CurriculumSummary[]> {
    const rows = await this.prisma.db.curriculum.findMany({
      where: {
        ...(q.subjectId ? { subjectId: q.subjectId } : {}),
        ...(q.classLevelId ? { classLevelId: q.classLevelId } : {}),
        ...(q.status ? { status: q.status as ContentStatus } : { status: { not: 'ARCHIVED' } }),
      },
      include: curriculumInclude,
      orderBy: [{ classLevel: { order: 'asc' } }, { subject: { name: 'asc' } }, { version: 'desc' }],
    });
    return rows.map((r) => this.engine.curriculumSummary(r));
  }

  @Get(':id')
  @RequirePermissions('curriculum.read')
  detail(@Param('id') id: string): Promise<CurriculumDetail> {
    return this.engine.curriculumDetail(id);
  }

  /** An empty curriculum to fill in by hand. */
  @Post()
  @RequirePermissions('curriculum.manage')
  async create(@Body(new ZodPipe(createCurriculumSchema)) body: CreateCurriculumInput): Promise<CurriculumDetail> {
    const cur = await this.newVersion(body.subjectId, body.classLevelId, body.weeksPerTerm, 'MANUAL', body.title);
    return this.engine.curriculumDetail(cur.id);
  }

  /** Creates a new draft version and fills it with AI in the background. */
  @Post('generate')
  @HttpCode(202)
  @RequirePermissions('curriculum.manage', 'ai.use')
  async generate(@Body(new ZodPipe(generateCurriculumSchema)) body: GenerateCurriculumInput): Promise<CurriculumSummary> {
    this.engine.assertAiAvailable();
    const cur = await this.newVersion(body.subjectId, body.classLevelId, body.weeksPerTerm, 'AI', undefined, body.guidance);
    this.engine.queueCurriculum(cur.id);
    return this.engine.curriculumSummary(cur);
  }

  /** Re-runs generation for an AI draft (after a failure, or with new guidance). */
  @Post(':id/regenerate')
  @HttpCode(202)
  @RequirePermissions('curriculum.manage', 'ai.use')
  async regenerate(
    @Param('id') id: string,
    @Body(new ZodPipe(z.object({ guidance: z.string().trim().max(1500).optional() }))) body: { guidance?: string },
  ): Promise<CurriculumSummary> {
    this.engine.assertAiAvailable();
    const existing = await this.prisma.db.curriculum.findUniqueOrThrow({ where: { id } });
    if (existing.status !== 'DRAFT') throw new BadRequestException('Only drafts can be regenerated; create a new version instead');
    if (existing.generation === 'QUEUED' || existing.generation === 'RUNNING') {
      throw new BadRequestException('This curriculum is already being generated');
    }
    const cur = await this.prisma.db.curriculum.update({
      where: { id },
      data: { generation: 'QUEUED', generationError: null, source: 'AI', guidance: body.guidance ?? existing.guidance },
      include: curriculumInclude,
    });
    this.engine.queueCurriculum(id);
    return this.engine.curriculumSummary(cur);
  }

  @Patch(':id')
  @RequirePermissions('curriculum.manage')
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(updateCurriculumSchema)) body: UpdateCurriculumInput,
  ): Promise<CurriculumDetail> {
    const existing = await this.prisma.db.curriculum.findUniqueOrThrow({ where: { id } });
    const publishing = body.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';
    if (publishing && existing.generation !== 'NONE' && existing.generation !== 'DONE') {
      throw new BadRequestException('Wait for generation to finish before publishing');
    }

    await this.prisma.db.$transaction(async (tx) => {
      // One published version per subject and class: publishing archives the old one.
      if (publishing) {
        await tx.curriculum.updateMany({
          where: { subjectId: existing.subjectId, classLevelId: existing.classLevelId, status: 'PUBLISHED', id: { not: id } },
          data: { status: 'ARCHIVED' },
        });
      }
      await tx.curriculum.update({
        where: { id },
        data: { ...body, ...(publishing ? { publishedAt: new Date() } : {}) },
      });
    });
    await this.audit.log({
      action: publishing ? 'curriculum.published' : 'curriculum.updated',
      entityType: 'Curriculum',
      entityId: id,
      summary: publishing
        ? `Published ${existing.title} (v${existing.version})`
        : `Updated ${existing.title} (${Object.keys(body).join(', ')})`,
    });
    return this.engine.curriculumDetail(id);
  }

  @Post(':id/units')
  @RequirePermissions('curriculum.manage')
  async addUnit(@Param('id') id: string, @Body(new ZodPipe(addUnitSchema)) body: z.infer<typeof addUnitSchema>) {
    await this.editable(id);
    await this.prisma.db.curriculumUnit.create({ data: { ...body, tenantId: currentTenantId(), curriculumId: id } });
    return this.engine.curriculumDetail(id);
  }

  @Put(':id/units/:unitId')
  @RequirePermissions('curriculum.manage')
  async updateUnit(
    @Param('id') id: string,
    @Param('unitId') unitId: string,
    @Body(new ZodPipe(curriculumUnitSchema)) body: CurriculumUnitInput,
  ) {
    await this.editable(id);
    await this.prisma.db.curriculumUnit.update({ where: { id: unitId, curriculumId: id }, data: body });
    return this.engine.curriculumDetail(id);
  }

  @Delete(':id/units/:unitId')
  @RequirePermissions('curriculum.manage')
  async deleteUnit(@Param('id') id: string, @Param('unitId') unitId: string) {
    await this.editable(id);
    await this.prisma.db.curriculumUnit.delete({ where: { id: unitId, curriculumId: id } });
    return this.engine.curriculumDetail(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('curriculum.manage')
  async remove(@Param('id') id: string) {
    const cur = await this.prisma.db.curriculum.findUniqueOrThrow({ where: { id } });
    if (cur.status === 'PUBLISHED') throw new BadRequestException('Archive a published curriculum instead of deleting it');
    await this.prisma.db.curriculum.delete({ where: { id } });
    await this.audit.log({ action: 'curriculum.deleted', entityType: 'Curriculum', entityId: id, summary: `Deleted ${cur.title} (v${cur.version})` });
  }

  private async editable(id: string) {
    const cur = await this.prisma.db.curriculum.findUniqueOrThrow({ where: { id } });
    if (cur.generation === 'QUEUED' || cur.generation === 'RUNNING') {
      throw new BadRequestException('Wait for generation to finish before editing');
    }
    if (cur.status === 'ARCHIVED') throw new BadRequestException('Archived curricula are read-only');
    return cur;
  }

  private async newVersion(
    subjectId: string,
    classLevelId: string,
    weeksPerTerm: number,
    source: 'MANUAL' | 'AI',
    title?: string,
    guidance?: string,
  ) {
    const db = this.prisma.db;
    // Scoped lookups: another school's subject or class is a 404.
    const [subject, level] = await Promise.all([
      db.subject.findUniqueOrThrow({ where: { id: subjectId } }),
      db.classLevel.findUniqueOrThrow({ where: { id: classLevelId } }),
    ]);
    const last = await db.curriculum.findFirst({
      where: { subjectId, classLevelId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    const cur = await db.curriculum.create({
      data: {
        tenantId: currentTenantId(),
        subjectId,
        classLevelId,
        version,
        weeksPerTerm,
        title: title ?? `${subject.name} — ${level.name}`,
        source,
        guidance,
        generation: source === 'AI' ? 'QUEUED' : 'NONE',
        createdById: currentContext().userId,
      },
      include: curriculumInclude,
    });
    await this.audit.log({
      action: source === 'AI' ? 'curriculum.generation_started' : 'curriculum.created',
      entityType: 'Curriculum',
      entityId: cur.id,
      summary: `${source === 'AI' ? 'Asked AI to write' : 'Started'} ${cur.title} curriculum (v${version})`,
    });
    return cur;
  }
}
