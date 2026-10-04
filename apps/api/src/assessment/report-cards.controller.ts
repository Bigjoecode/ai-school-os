import { BadRequestException, ServiceUnavailableException, Body, Controller, ForbiddenException, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import {
  aiRemarksSchema,
  classTermQuerySchema,
  gradeFor,
  ordinal,
  publishReportsSchema,
  updateReportCardSchema,
  type AiJobView,
  type ClassTermQuery,
  type GenerateRemarksInput,
  type PublishReportsInput,
  type ReportCardRow,
  type ReportCardView,
  type UpdateReportCardInput,
  generateRemarksSchema,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AiJobsService } from '../ai/ai-jobs.service';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { remarksPrompt } from './prompts';
import { ReportCardService } from './report-card.service';
import { mean, ResultsService, type ClassResults } from './results.service';

const studentTermQuery = z.object({ studentId: z.string().min(1), termId: z.string().min(1) });
type StudentTermQuery = z.infer<typeof studentTermQuery>;
const REMARK_BATCH = 20;

@Controller('report-cards')
export class ReportCardsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
    private readonly gateway: AiGatewayService,
    private readonly jobs: AiJobsService,
    private readonly audit: AuditService,
    private readonly attendance: AttendanceService,
    private readonly cards: ReportCardService,
  ) {}

  /** Every student in a class for a term, with where their report stands. */
  @Get()
  @RequirePermissions('results.read')
  async list(@Query(new ZodPipe(classTermQuerySchema)) q: ClassTermQuery): Promise<ReportCardRow[]> {
    const [r, cards] = await Promise.all([
      this.results.classResults(q.classArmId, q.termId),
      this.prisma.db.reportCard.findMany({ where: { termId: q.termId, classArmId: q.classArmId } }),
    ]);
    const byStudent = new Map(cards.map((c) => [c.studentId, c]));
    return r.students
      .map((s) => {
        const card = byStudent.get(s.id);
        return {
          studentId: s.id,
          name: s.name,
          admissionNumber: s.admissionNumber,
          subjectsTaken: r.results.get(s.id)?.size ?? 0,
          average: r.averages.get(s.id) ?? null,
          position: r.positions.get(s.id) ?? null,
          hasTeacherRemark: Boolean(card?.teacherRemark),
          hasPrincipalRemark: Boolean(card?.principalRemark),
          status: card?.status ?? ('DRAFT' as const),
        };
      })
      .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || a.name.localeCompare(b.name));
  }

  @Get('view')
  @RequirePermissions('results.read')
  async view(@Query(new ZodPipe(studentTermQuery)) q: StudentTermQuery): Promise<ReportCardView> {
    return this.cards.view(q);
  }

  /**
   * The class teacher writes the teacher's remark; the principal's remark
   * needs results.publish (which can also write either).
   */
  @Patch('remarks')
  @RequirePermissions('results.read')
  async updateRemarks(
    @Query(new ZodPipe(studentTermQuery)) q: StudentTermQuery,
    @Body(new ZodPipe(updateReportCardSchema)) body: UpdateReportCardInput,
  ): Promise<ReportCardView> {
    const ctx = currentContext();
    const classArmId = await this.armFor(q.studentId, q.termId);
    const canPublish = ctx.permissions.has('results.publish');
    if (body.principalRemark !== undefined && !canPublish) {
      throw new ForbiddenException("Only the principal or results managers can write the principal's remark");
    }
    if (body.teacherRemark !== undefined && !canPublish && !(await this.isClassTeacher(classArmId))) {
      throw new ForbiddenException("Only this class's teacher can write the teacher's remark");
    }
    await this.prisma.db.reportCard.upsert({
      where: { studentId_termId: { studentId: q.studentId, termId: q.termId } },
      update: { ...body, ...(body.teacherRemark !== undefined ? { remarkSource: 'MANUAL' as const } : {}) },
      create: { tenantId: currentTenantId(), studentId: q.studentId, termId: q.termId, classArmId, ...body },
    });
    return this.view(q);
  }

  /** Drafts teacher's remarks for a whole class from each learner's results. */
  @Post('remarks/generate')
  @HttpCode(202)
  @RequirePermissions('results.read', 'ai.use')
  async generateRemarks(@Body(new ZodPipe(generateRemarksSchema)) body: GenerateRemarksInput): Promise<AiJobView> {
    if (!currentContext().permissions.has('results.publish') && !(await this.isClassTeacher(body.classArmId))) {
      throw new ForbiddenException("Only this class's teacher can draft its remarks");
    }
    if (!this.gateway.configuredProviders().length) {
      throw new ServiceUnavailableException("AI isn't connected yet — add an AI provider API key to the server");
    }
    const r = await this.results.classResults(body.classArmId, body.termId);
    const existing = await this.prisma.db.reportCard.findMany({ where: { classArmId: body.classArmId, termId: body.termId } });
    const written = new Set(existing.filter((c) => c.teacherRemark).map((c) => c.studentId));
    const targets = r.students.filter((s) => (r.results.get(s.id)?.size ?? 0) > 0 && (body.overwrite || !written.has(s.id)));
    if (!targets.length) {
      throw new BadRequestException(written.size ? 'Every student with results already has a remark' : 'No marks have been entered for this class yet');
    }

    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true } });
    return this.jobs.start('report-remarks', body as unknown as Prisma.InputJsonValue, async (job) => {
      let written = 0;
      for (let i = 0; i < targets.length; i += REMARK_BATCH) {
        const batch = targets.slice(i, i + REMARK_BATCH).map((s, j) => ({ ...s, ref: `S${i + j + 1}` }));
        const { system, user } = remarksPrompt(
          { schoolName: tenant.name, className: `${r.classArm.levelName} ${r.classArm.name}`, termName: `${r.term.name} ${r.term.sessionName}` },
          batch.map((s) => ({ ref: s.ref, firstName: s.firstName, gender: s.gender, summary: resultSummary(r, s.id) })),
        );
        const result = await this.gateway.generateJson(
          { tier: 'standard', system, messages: [{ role: 'user', content: user }] },
          aiRemarksSchema,
          'report-remarks',
        );
        const byRef = new Map(result.data.remarks.map((x) => [x.studentRef.trim(), x.remark.trim()]));
        for (const s of batch) {
          const remark = byRef.get(s.ref);
          if (!remark) continue;
          await this.prisma.db.reportCard.upsert({
            where: { studentId_termId: { studentId: s.id, termId: body.termId } },
            update: { teacherRemark: remark.slice(0, 1000), remarkSource: 'AI' },
            create: {
              tenantId: job.tenantId,
              studentId: s.id,
              termId: body.termId,
              classArmId: body.classArmId,
              teacherRemark: remark.slice(0, 1000),
              remarkSource: 'AI',
            },
          });
          written++;
        }
      }
      await this.audit.log({
        action: 'report.remarks_generated',
        entityType: 'AiJob',
        entityId: job.id,
        summary: `AI drafted ${written} report-card remarks for ${r.classArm.levelName} ${r.classArm.name}`,
      });
      return { written, requested: targets.length };
    });
  }

  /** Releases (or withdraws) a class's report cards. */
  @Post('publish')
  @HttpCode(200)
  @RequirePermissions('results.publish')
  async publish(@Body(new ZodPipe(publishReportsSchema)) body: PublishReportsInput) {
    const r = await this.results.classResults(body.classArmId, body.termId);
    const withResults = r.students.filter((s) => (r.results.get(s.id)?.size ?? 0) > 0);
    if (body.publish && !withResults.length) throw new BadRequestException('No marks have been entered for this class yet');
    const now = new Date();
    await this.prisma.db.$transaction(
      withResults.map((s) =>
        this.prisma.db.reportCard.upsert({
          where: { studentId_termId: { studentId: s.id, termId: body.termId } },
          update: { status: body.publish ? 'PUBLISHED' : 'DRAFT', publishedAt: body.publish ? now : null },
          create: {
            tenantId: currentTenantId(),
            studentId: s.id,
            termId: body.termId,
            classArmId: body.classArmId,
            status: body.publish ? 'PUBLISHED' : 'DRAFT',
            publishedAt: body.publish ? now : null,
          },
        }),
      ),
    );
    await this.audit.log({
      action: body.publish ? 'report.published' : 'report.unpublished',
      summary: `${body.publish ? 'Published' : 'Withdrew'} ${withResults.length} report cards for ${r.classArm.levelName} ${r.classArm.name}, ${r.term.name}`,
    });
    return { updated: withResults.length };
  }

  private armFor(studentId: string, termId: string): Promise<string> {
    return this.cards.armFor(studentId, termId);
  }

  private async isClassTeacher(classArmId: string): Promise<boolean> {
    const userId = currentContext().userId;
    return (await this.prisma.db.classArm.count({ where: { id: classArmId, classTeacher: { userId } } })) > 0;
  }
}


/** One line per learner for the remark writer: average, position and subject spread. */
function resultSummary(r: ClassResults, studentId: string): string {
  const res = r.results.get(studentId)!;
  const subjects = r.subjects
    .map((s) => ({ name: s.name, total: res.get(s.id)?.percent ?? null }))
    .filter((x): x is { name: string; total: number } => x.total !== null)
    .sort((a, b) => b.total - a.total);
  const band = (t: number) => gradeFor(t, r.gradingScale).remark.toLowerCase();
  const avg = r.averages.get(studentId);
  const pos = r.positions.get(studentId);
  const incomplete = [...res.values()].some((x) => !x.complete);
  return [
    `average ${avg}% (${avg != null ? band(avg) : 'n/a'}), ${pos ? ordinal(pos) : '–'} of ${r.students.length}`,
    `strongest: ${subjects.slice(0, 2).map((s) => `${s.name} ${s.total}%`).join(', ')}`,
    `weakest: ${subjects.slice(-2).reverse().map((s) => `${s.name} ${s.total}%`).join(', ')}`,
    incomplete ? 'some assessments not yet marked' : '',
  ]
    .filter(Boolean)
    .join('; ');
}
