import { BadRequestException, Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import {
  assessmentSettingsSchema,
  classTermQuerySchema,
  gradeFor,
  saveScoresSchema,
  scoreSheetQuerySchema,
  type AnalysisInsight,
  type AssessmentSettings,
  type Broadsheet,
  type ClassAnalysis,
  type ClassTermQuery,
  type SaveScoresInput,
  type ScoreSheet,
  type ScoreSheetQuery,
} from '@aischool/shared';
import { Throttle } from '@nestjs/throttler';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentSettingsService } from './assessment-settings.service';
import { analysisPrompt } from './prompts';
import { ResultsService } from './results.service';

@Controller()
export class ResultsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
    private readonly settings: AssessmentSettingsService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- settings

  /** Harmless school configuration: readable by anyone in the school. */
  @Get('assessment/settings')
  getSettings() {
    return this.settings.get();
  }

  @Put('assessment/settings')
  @RequirePermissions('results.publish')
  async setSettings(@Body(new ZodPipe(assessmentSettingsSchema)) body: AssessmentSettings) {
    const saved = await this.settings.set(body);
    await this.audit.log({
      action: 'assessment.settings',
      summary: `Set assessment to ${body.components.map((c) => `${c.name} (${c.maxScore})`).join(' + ')} with a ${body.gradingScale.length}-band grading scale`,
    });
    return saved;
  }

  // ---------------------------------------------------------- score sheet

  /** One subject's marks for one class and term, ready for entry. */
  @Get('results/sheet')
  @RequirePermissions('results.read')
  async sheet(@Query(new ZodPipe(scoreSheetQuerySchema)) q: ScoreSheetQuery): Promise<ScoreSheet> {
    const [r, subject, canEdit] = await Promise.all([
      this.results.classResults(q.classArmId, q.termId),
      this.prisma.db.subject.findUniqueOrThrow({ where: { id: q.subjectId }, select: { id: true, name: true, code: true } }),
      this.results.canEnterScores(q.classArmId, q.subjectId),
    ]);
    const positions = r.subjectPositions.get(subject.id);
    return {
      classArm: { id: r.classArm.id, name: r.classArm.name, levelName: r.classArm.levelName },
      subject,
      term: { id: r.term.id, name: r.term.name, sessionName: r.term.sessionName },
      components: r.components,
      gradingScale: r.gradingScale,
      canEdit,
      students: r.students.map((s) => {
        const res = r.results.get(s.id)?.get(subject.id);
        return {
          id: s.id,
          name: s.name,
          admissionNumber: s.admissionNumber,
          scores: res?.scores ?? Object.fromEntries(r.components.map((c) => [c.key, null])),
          total: res?.total ?? null,
          outOf: res?.outOf ?? 0,
          percent: res?.percent ?? null,
          grade: res?.percent != null ? gradeFor(res.percent, r.gradingScale).grade : null,
          position: positions?.get(s.id) ?? null,
        };
      }),
    };
  }

  @Put('results/sheet')
  @RequirePermissions('results.enter')
  async saveSheet(@Body(new ZodPipe(saveScoresSchema)) body: SaveScoresInput): Promise<ScoreSheet> {
    await this.results.assertCanEnterScores(body.classArmId, body.subjectId);
    const [{ components }, arm, term, subject] = await Promise.all([
      this.settings.get(),
      this.prisma.db.classArm.findUniqueOrThrow({ where: { id: body.classArmId }, include: { classLevel: true } }),
      this.prisma.db.term.findUniqueOrThrow({ where: { id: body.termId } }),
      this.prisma.db.subject.findUniqueOrThrow({ where: { id: body.subjectId } }),
    ]);

    const byKey = new Map(components.map((c) => [c.key, c]));
    const errors: { path: string; message: string }[] = [];
    body.entries.forEach((e, i) => {
      const c = byKey.get(e.componentKey);
      if (!c) errors.push({ path: `entries.${i}.componentKey`, message: 'Unknown assessment' });
      else if (e.score !== null && e.score > c.maxScore) {
        errors.push({ path: `entries.${i}.score`, message: `${c.name} is out of ${c.maxScore}` });
      }
    });
    if (errors.length) throw new BadRequestException({ statusCode: 400, message: 'Some marks are out of range', errors });

    // Only students in this class (now, or marked here this term) can be marked here.
    const studentIds = [...new Set(body.entries.map((e) => e.studentId))];
    const allowed = await this.prisma.db.student.findMany({
      where: {
        id: { in: studentIds },
        OR: [{ classArmId: arm.id }, { scores: { some: { classArmId: arm.id, termId: term.id } } }],
      },
      select: { id: true },
    });
    if (allowed.length !== studentIds.length) throw new BadRequestException('Some students are not in this class');

    const userId = currentContext().userId;
    const tenantId = currentTenantId();
    await this.prisma.db.$transaction(
      body.entries.map((e) => {
        const where = {
          studentId_subjectId_termId_componentKey: {
            studentId: e.studentId,
            subjectId: subject.id,
            termId: term.id,
            componentKey: e.componentKey,
          },
        };
        return e.score === null
          ? this.prisma.db.score.deleteMany({ where: { studentId: e.studentId, subjectId: subject.id, termId: term.id, componentKey: e.componentKey } })
          : this.prisma.db.score.upsert({
              where,
              update: { score: e.score, classArmId: arm.id, enteredById: userId },
              create: {
                tenantId,
                studentId: e.studentId,
                subjectId: subject.id,
                termId: term.id,
                classArmId: arm.id,
                componentKey: e.componentKey,
                score: e.score,
                enteredById: userId,
              },
            });
      }),
    );

    const names = [...new Set(body.entries.map((e) => byKey.get(e.componentKey)!.name))].join(', ');
    await this.audit.log({
      action: 'results.entered',
      entityType: 'Score',
      summary: `Saved ${body.entries.length} ${subject.name} mark${body.entries.length === 1 ? '' : 's'} for ${arm.classLevel.name} ${arm.name} (${names}, ${term.name})`,
    });
    return this.sheet({ classArmId: arm.id, subjectId: subject.id, termId: term.id });
  }

  // ---------------------------------------------------------- class views

  @Get('results/broadsheet')
  @RequirePermissions('results.read')
  async broadsheet(@Query(new ZodPipe(classTermQuerySchema)) q: ClassTermQuery): Promise<Broadsheet> {
    return this.results.broadsheet(await this.results.classResults(q.classArmId, q.termId));
  }

  @Get('results/analysis')
  @RequirePermissions('results.read')
  async analysis(@Query(new ZodPipe(classTermQuerySchema)) q: ClassTermQuery): Promise<ClassAnalysis> {
    return this.results.analysis(await this.results.classResults(q.classArmId, q.termId));
  }

  /** A short written briefing on the class's results, from the computed analysis. */
  @Post('results/analysis/insight')
  @HttpCode(200)
  @RequirePermissions('results.read', 'ai.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async insight(@Body(new ZodPipe(classTermQuerySchema)) q: ClassTermQuery): Promise<AnalysisInsight> {
    const a = this.results.analysis(await this.results.classResults(q.classArmId, q.termId));
    if (!a.subjects.length) throw new BadRequestException('No marks have been entered for this class and term yet');
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true } });
    const data = [
      `Class: ${a.classArm.levelName} ${a.classArm.name}, ${a.term.name} ${a.term.sessionName}. Students: ${a.students}.`,
      `Marks entered: ${a.overall.completeness}% of all expected marks. Overall mean ${a.overall.mean ?? 'n/a'}%, pass rate ${a.overall.passRate ?? 'n/a'}%.`,
      'Subjects (mean, pass rate, highest, lowest, students marked):',
      ...a.subjects.map((s) => `- ${s.subject.name}: mean ${s.mean}, pass ${s.passRate}%, high ${s.highest}, low ${s.lowest}, marked ${s.entered}`),
      `Top learners: ${a.topStudents.map((t) => `${t.name} (${t.average})`).join(', ') || 'none yet'}.`,
      `Learners needing support: ${a.atRisk.map((t) => `${t.name} (avg ${t.average ?? 'n/a'}; failing ${t.failedSubjects.join(', ') || 'none'})`).join('; ') || 'none'}.`,
    ].join('\n');
    const { system, user } = analysisPrompt(tenant.name, data);
    const result = await this.gateway.generate({ tier: 'advanced', system, messages: [{ role: 'user', content: user }] }, 'results-insight');
    return { text: result.text, provider: result.provider, model: result.model };
  }
}
