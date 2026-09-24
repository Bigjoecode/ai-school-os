import { BadRequestException, ConflictException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  academicListQuerySchema,
  generateSchemeSchema,
  schemeWeekSchema,
  updateSchemeSchema,
  type AcademicListQuery,
  type GenerateSchemeInput,
  type SchemeDetail,
  type SchemeSummary,
  type SchemeWeekInput,
  type UpdateSchemeInput,
} from '@aischool/shared';
import type { ContentStatus } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicEngineService, schemeInclude } from './academic-engine.service';

const regenerateSchema = z.object({ guidance: z.string().trim().max(1500).optional() });

@Controller('schemes')
export class SchemesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AcademicEngineService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('curriculum.read')
  async list(@Query(new ZodPipe(academicListQuerySchema)) q: AcademicListQuery): Promise<SchemeSummary[]> {
    const rows = await this.prisma.db.schemeOfWork.findMany({
      where: {
        ...(q.subjectId ? { subjectId: q.subjectId } : {}),
        ...(q.classLevelId ? { classLevelId: q.classLevelId } : {}),
        ...(q.termId ? { termId: q.termId } : {}),
        ...(q.status ? { status: q.status as ContentStatus } : { status: { not: 'ARCHIVED' } }),
      },
      include: schemeInclude,
      orderBy: [{ term: { startsOn: 'desc' } }, { classLevel: { order: 'asc' } }, { subject: { name: 'asc' } }],
    });
    return rows.map((r) => this.engine.schemeSummary(r));
  }

  @Get(':id')
  @RequirePermissions('curriculum.read')
  detail(@Param('id') id: string): Promise<SchemeDetail> {
    return this.engine.schemeDetail(id);
  }

  /**
   * Writes the scheme for one subject, class and term. Built from the
   * published curriculum when there is one (else the latest draft), laid out
   * on the term's real calendar.
   */
  @Post('generate')
  @HttpCode(202)
  @RequirePermissions('curriculum.manage', 'ai.use')
  async generate(@Body(new ZodPipe(generateSchemeSchema)) body: GenerateSchemeInput): Promise<SchemeSummary> {
    this.engine.assertAiAvailable();
    const db = this.prisma.db;
    const [subject, level, term] = await Promise.all([
      db.subject.findUniqueOrThrow({ where: { id: body.subjectId } }),
      db.classLevel.findUniqueOrThrow({ where: { id: body.classLevelId } }),
      db.term.findUniqueOrThrow({ where: { id: body.termId } }),
    ]);

    const existing = await db.schemeOfWork.findFirst({
      where: { subjectId: subject.id, classLevelId: level.id, termId: term.id },
    });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: 'A scheme of work already exists for this subject, class and term. Open it, or delete it to start again.',
        errors: [{ path: 'termId', message: 'Already has a scheme' }],
      });
    }

    const curriculum =
      (await db.curriculum.findFirst({ where: { subjectId: subject.id, classLevelId: level.id, status: 'PUBLISHED' } })) ??
      (await db.curriculum.findFirst({
        where: { subjectId: subject.id, classLevelId: level.id, status: 'DRAFT', generation: { in: ['NONE', 'DONE'] } },
        orderBy: { version: 'desc' },
      }));

    const scheme = await db.schemeOfWork.create({
      data: {
        tenantId: currentTenantId(),
        subjectId: subject.id,
        classLevelId: level.id,
        termId: term.id,
        curriculumId: curriculum?.id,
        title: `${subject.name} — ${level.name}, ${term.name}`,
        source: 'AI',
        generation: 'QUEUED',
        guidance: body.guidance,
        createdById: currentContext().userId,
      },
      include: schemeInclude,
    });
    this.engine.queueScheme(scheme.id);
    await this.audit.log({
      action: 'scheme.generation_started',
      entityType: 'SchemeOfWork',
      entityId: scheme.id,
      summary: `Asked AI to write the scheme of work for ${scheme.title}`,
    });
    return this.engine.schemeSummary(scheme);
  }

  @Post(':id/regenerate')
  @HttpCode(202)
  @RequirePermissions('curriculum.manage', 'ai.use')
  async regenerate(
    @Param('id') id: string,
    @Body(new ZodPipe(regenerateSchema)) body: { guidance?: string },
  ): Promise<SchemeSummary> {
    this.engine.assertAiAvailable();
    const existing = await this.prisma.db.schemeOfWork.findUniqueOrThrow({ where: { id } });
    if (existing.status !== 'DRAFT') throw new BadRequestException('Only drafts can be regenerated');
    if (existing.generation === 'QUEUED' || existing.generation === 'RUNNING') {
      throw new BadRequestException('This scheme is already being generated');
    }
    const lessons = await this.prisma.db.lessonPlan.count({ where: { schemeWeek: { schemeId: id } } });
    if (lessons) throw new BadRequestException(`${lessons} lesson plans are linked to this scheme; regenerating would unlink them`);
    const scheme = await this.prisma.db.schemeOfWork.update({
      where: { id },
      data: { generation: 'QUEUED', generationError: null, guidance: body.guidance ?? existing.guidance },
      include: schemeInclude,
    });
    this.engine.queueScheme(id);
    return this.engine.schemeSummary(scheme);
  }

  @Patch(':id')
  @RequirePermissions('curriculum.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(updateSchemeSchema)) body: UpdateSchemeInput): Promise<SchemeDetail> {
    const existing = await this.prisma.db.schemeOfWork.findUniqueOrThrow({ where: { id } });
    if (body.status === 'PUBLISHED' && existing.generation !== 'NONE' && existing.generation !== 'DONE') {
      throw new BadRequestException('Wait for generation to finish before publishing');
    }
    await this.prisma.db.schemeOfWork.update({ where: { id }, data: body });
    await this.audit.log({
      action: body.status === 'PUBLISHED' ? 'scheme.published' : 'scheme.updated',
      entityType: 'SchemeOfWork',
      entityId: id,
      summary: body.status === 'PUBLISHED' ? `Published ${existing.title}` : `Updated ${existing.title}`,
    });
    return this.engine.schemeDetail(id);
  }

  @Put(':id/weeks/:weekId')
  @RequirePermissions('curriculum.manage')
  async updateWeek(
    @Param('id') id: string,
    @Param('weekId') weekId: string,
    @Body(new ZodPipe(schemeWeekSchema)) body: SchemeWeekInput,
  ): Promise<SchemeDetail> {
    const scheme = await this.prisma.db.schemeOfWork.findUniqueOrThrow({ where: { id } });
    if (scheme.generation === 'QUEUED' || scheme.generation === 'RUNNING') {
      throw new BadRequestException('Wait for generation to finish before editing');
    }
    await this.prisma.db.schemeWeek.update({ where: { id: weekId, schemeId: id }, data: body });
    return this.engine.schemeDetail(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('curriculum.manage')
  async remove(@Param('id') id: string) {
    const scheme = await this.prisma.db.schemeOfWork.findUniqueOrThrow({ where: { id } });
    if (scheme.status === 'PUBLISHED') throw new BadRequestException('Archive a published scheme instead of deleting it');
    await this.prisma.db.schemeOfWork.delete({ where: { id } });
    await this.audit.log({ action: 'scheme.deleted', entityType: 'SchemeOfWork', entityId: id, summary: `Deleted ${scheme.title}` });
  }
}
