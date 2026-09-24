import { BadRequestException, ServiceUnavailableException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  OBJECTIVE_TYPES,
  aiQuestionSetSchema,
  bulkQuestionStatusSchema,
  questionBaseSchema,
  generateQuestionsSchema,
  questionListQuerySchema,
  questionSchema,
  type AiJobView,
  type GenerateQuestionsInput,
  type Paginated,
  type QuestionInput,
  type QuestionListQuery,
  type QuestionRow,
  type QuestionTopicCount,
} from '@aischool/shared';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AiJobsService } from '../ai/ai-jobs.service';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { paginate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { questionsPrompt } from './prompts';

export const questionInclude = {
  subject: { select: { id: true, name: true, code: true } },
  classLevel: { select: { id: true, name: true } },
  _count: { select: { paperItems: true } },
} satisfies Prisma.QuestionInclude;

export function questionRow(q: Prisma.QuestionGetPayload<{ include: typeof questionInclude }>): QuestionRow {
  return {
    id: q.id,
    subject: q.subject,
    classLevel: q.classLevel,
    topic: q.topic,
    type: q.type,
    difficulty: q.difficulty,
    stem: q.stem,
    options: q.options,
    correctIndex: q.correctIndex,
    answer: q.answer,
    markingGuide: q.markingGuide,
    marks: q.marks,
    status: q.status,
    source: q.source,
    usedInPapers: q._count.paperItems,
    updatedAt: q.updatedAt.toISOString(),
  };
}

const partialQuestion = questionBaseSchema.partial();

@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly jobs: AiJobsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('assessment.read')
  async list(@Query(new ZodPipe(questionListQuerySchema)) q: QuestionListQuery): Promise<Paginated<QuestionRow>> {
    const where: Prisma.QuestionWhereInput = {
      ...(q.subjectId ? { subjectId: q.subjectId } : {}),
      ...(q.classLevelId ? { classLevelId: q.classLevelId } : {}),
      ...(q.topic ? { topic: q.topic } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.difficulty ? { difficulty: q.difficulty } : {}),
      ...(q.status ? { status: q.status } : { status: { not: 'RETIRED' } }),
      ...(q.aiJobId ? { aiJobId: q.aiJobId } : {}),
      ...(q.q ? { stem: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.question.findMany({
        where,
        include: questionInclude,
        orderBy: [{ topic: 'asc' }, { createdAt: 'asc' }],
        ...paginate(q.page, q.pageSize),
      }),
      this.prisma.db.question.count({ where }),
    ]);
    return { items: rows.map(questionRow), total, page: q.page, pageSize: q.pageSize };
  }

  /** Topics in the bank for a subject and class, with how many questions each has. */
  @Get('topics')
  @RequirePermissions('assessment.read')
  async topics(
    @Query(new ZodPipe(z.object({ subjectId: z.string().min(1), classLevelId: z.string().min(1) })))
    q: { subjectId: string; classLevelId: string },
  ): Promise<QuestionTopicCount[]> {
    const rows = await this.prisma.db.question.groupBy({
      by: ['topic', 'status'],
      where: { subjectId: q.subjectId, classLevelId: q.classLevelId, status: { not: 'RETIRED' } },
      _count: { _all: true },
    });
    const byTopic = new Map<string, QuestionTopicCount>();
    for (const r of rows) {
      const t = byTopic.get(r.topic) ?? { topic: r.topic, total: 0, approved: 0 };
      t.total += r._count._all;
      if (r.status === 'APPROVED') t.approved += r._count._all;
      byTopic.set(r.topic, t);
    }
    return [...byTopic.values()].sort((a, b) => a.topic.localeCompare(b.topic));
  }

  @Get(':id')
  @RequirePermissions('assessment.read')
  async get(@Param('id') id: string): Promise<QuestionRow> {
    return questionRow(await this.prisma.db.question.findUniqueOrThrow({ where: { id }, include: questionInclude }));
  }

  @Post()
  @RequirePermissions('assessment.manage')
  async create(@Body(new ZodPipe(questionSchema)) body: QuestionInput): Promise<QuestionRow> {
    await this.checkRefs(body.subjectId, body.classLevelId);
    const q = await this.prisma.db.question.create({
      data: { ...normalise(body), tenantId: currentTenantId(), createdById: currentContext().userId },
      include: questionInclude,
    });
    await this.audit.log({ action: 'question.created', entityType: 'Question', entityId: q.id, summary: `Added a ${q.subject.name} question on ${q.topic}` });
    return questionRow(q);
  }

  @Patch(':id')
  @RequirePermissions('assessment.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(partialQuestion)) body: Partial<QuestionInput>): Promise<QuestionRow> {
    const existing = await this.prisma.db.question.findUniqueOrThrow({ where: { id } });
    // Re-check the whole question as it will be after the change.
    const merged = questionSchema.safeParse({
      ...existing,
      answer: existing.answer ?? undefined,
      markingGuide: existing.markingGuide ?? undefined,
      ...body,
    });
    if (!merged.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Please check the highlighted fields',
        errors: merged.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (body.subjectId || body.classLevelId) await this.checkRefs(merged.data.subjectId, merged.data.classLevelId);
    const q = await this.prisma.db.question.update({ where: { id }, data: normalise(merged.data), include: questionInclude });
    return questionRow(q);
  }

  @Post('status')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  async bulkStatus(@Body(new ZodPipe(bulkQuestionStatusSchema)) body: z.infer<typeof bulkQuestionStatusSchema>) {
    const { count } = await this.prisma.db.question.updateMany({ where: { id: { in: body.ids } }, data: { status: body.status } });
    await this.audit.log({
      action: 'question.status',
      entityType: 'Question',
      summary: `Marked ${count} question${count === 1 ? '' : 's'} as ${body.status.toLowerCase()}`,
    });
    return { updated: count };
  }

  /** Questions already on a paper are retired instead, so the paper stays intact. */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('assessment.manage')
  async remove(@Param('id') id: string) {
    const q = await this.prisma.db.question.findUniqueOrThrow({ where: { id }, include: { _count: { select: { paperItems: true } } } });
    if (q._count.paperItems) await this.prisma.db.question.update({ where: { id }, data: { status: 'RETIRED' } });
    else await this.prisma.db.question.delete({ where: { id } });
  }

  /**
   * Writes a batch of questions with AI. They arrive as drafts for a teacher
   * to review and approve; anything that fails our checks is dropped.
   */
  @Post('generate')
  @HttpCode(202)
  @RequirePermissions('assessment.manage', 'ai.use')
  async generate(@Body(new ZodPipe(generateQuestionsSchema)) body: GenerateQuestionsInput): Promise<AiJobView> {
    if (!this.gateway.configuredProviders().length) {
      throw new ServiceUnavailableException("AI isn't connected yet — add an AI provider API key to the server");
    }
    const [subject, level, tenant] = await Promise.all([
      this.prisma.db.subject.findUniqueOrThrow({ where: { id: body.subjectId } }),
      this.prisma.db.classLevel.findUniqueOrThrow({ where: { id: body.classLevelId } }),
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true, country: true } }),
    ]);

    const job = await this.jobs.start('questions', body as unknown as Prisma.InputJsonValue, async (job) => {
      const { system, user } = questionsPrompt(
        { schoolName: tenant.name, country: tenant.country, subject: subject.name, level: level.name, stage: level.stage },
        { topic: body.topic, counts: body.counts, difficulty: body.difficulty, guidance: body.guidance },
      );
      const result = await this.gateway.generateJson(
        { tier: 'advanced', system, messages: [{ role: 'user', content: user }] },
        aiQuestionSetSchema,
        'questions',
      );

      const valid: Prisma.QuestionCreateManyInput[] = [];
      let dropped = 0;
      for (const item of result.data.questions) {
        const candidate = questionSchema.safeParse({
          subjectId: subject.id,
          classLevelId: level.id,
          topic: body.topic,
          type: item.type,
          difficulty: item.difficulty,
          stem: item.stem,
          options: item.type === 'TRUE_FALSE' ? ['True', 'False'] : OBJECTIVE_TYPES.includes(item.type) ? item.options : [],
          correctIndex: OBJECTIVE_TYPES.includes(item.type) ? item.correctIndex : null,
          answer: item.answer,
          markingGuide: item.markingGuide,
          marks: Math.min(50, Math.max(1, item.marks || 1)),
          status: 'DRAFT',
        });
        if (!candidate.success) {
          dropped++;
          continue;
        }
        valid.push({
          ...normalise(candidate.data),
          tenantId: job.tenantId,
          source: 'AI',
          aiJobId: job.id,
          createdById: job.createdById,
        });
      }
      await this.prisma.db.question.createMany({ data: valid });
      await this.audit.log({
        action: 'question.generated',
        entityType: 'AiJob',
        entityId: job.id,
        summary: `AI wrote ${valid.length} ${subject.name} questions on ${body.topic} for ${level.name}`,
      });
      return { created: valid.length, dropped };
    });
    return job;
  }

  private async checkRefs(subjectId: string, classLevelId: string) {
    await Promise.all([
      this.prisma.db.subject.findUniqueOrThrow({ where: { id: subjectId } }),
      this.prisma.db.classLevel.findUniqueOrThrow({ where: { id: classLevelId } }),
    ]);
  }
}

/** Keeps objective and written questions in their own shape. */
function normalise(q: QuestionInput) {
  const objective = OBJECTIVE_TYPES.includes(q.type);
  return {
    subjectId: q.subjectId,
    classLevelId: q.classLevelId,
    topic: q.topic,
    type: q.type,
    difficulty: q.difficulty,
    stem: q.stem,
    options: objective ? q.options : [],
    correctIndex: objective ? (q.correctIndex ?? null) : null,
    answer: q.answer ?? null,
    markingGuide: q.markingGuide ?? null,
    marks: q.marks,
    status: q.status,
  };
}
