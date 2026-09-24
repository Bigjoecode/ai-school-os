import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  OBJECTIVE_TYPES,
  buildPaperSchema,
  updatePaperSchema,
  type BuildPaperInput,
  type BuildPaperResult,
  type Difficulty,
  type PaperDetail,
  type PaperSummary,
  type QuestionCounts,
  type QuestionType,
  type UpdatePaperInput,
} from '@aischool/shared';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentSettingsService } from './assessment-settings.service';
import { questionInclude, questionRow } from './questions.controller';

const COUNT_TYPES: [keyof QuestionCounts, QuestionType][] = [
  ['multipleChoice', 'MULTIPLE_CHOICE'],
  ['trueFalse', 'TRUE_FALSE'],
  ['shortAnswer', 'SHORT_ANSWER'],
  ['theory', 'THEORY'],
];
/** Target spread for a "mixed" paper. */
const MIX: [Difficulty, number][] = [
  ['EASY', 0.3],
  ['MEDIUM', 0.5],
  ['HARD', 0.2],
];

const paperInclude = {
  subject: { select: { id: true, name: true, code: true } },
  classLevel: { select: { id: true, name: true } },
  term: { select: { id: true, name: true, session: { select: { name: true } } } },
  items: { orderBy: { order: 'asc' }, include: { question: { include: questionInclude } } },
} satisfies Prisma.ExamPaperInclude;
type PaperRow = Prisma.ExamPaperGetPayload<{ include: typeof paperInclude }>;

const listQuery = z.object({
  termId: z.string().optional(),
  subjectId: z.string().optional(),
  classLevelId: z.string().optional(),
});

@Controller('papers')
export class PapersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AssessmentSettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('assessment.read')
  async list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>): Promise<PaperSummary[]> {
    const [rows, { components }] = await Promise.all([
      this.prisma.db.examPaper.findMany({
        where: { ...(q.termId ? { termId: q.termId } : {}), ...(q.subjectId ? { subjectId: q.subjectId } : {}), ...(q.classLevelId ? { classLevelId: q.classLevelId } : {}) },
        include: paperInclude,
        orderBy: { updatedAt: 'desc' },
      }),
      this.settings.get(),
    ]);
    return rows.map((p) => summary(p, components));
  }

  @Get(':id')
  @RequirePermissions('assessment.read')
  detail(@Param('id') id: string): Promise<PaperDetail> {
    return this.paperDetail(id);
  }

  /**
   * Assembles a paper from approved questions in the bank: the requested
   * number of each type, from the chosen topics, spread across difficulty.
   * Reports any shortfall so the teacher can generate or approve more.
   */
  @Post('build')
  @RequirePermissions('assessment.manage')
  async build(@Body(new ZodPipe(buildPaperSchema)) body: BuildPaperInput): Promise<BuildPaperResult> {
    const db = this.prisma.db;
    const [subject, level, term, { components }] = await Promise.all([
      db.subject.findUniqueOrThrow({ where: { id: body.subjectId } }),
      db.classLevel.findUniqueOrThrow({ where: { id: body.classLevelId } }),
      db.term.findUniqueOrThrow({ where: { id: body.termId } }),
      this.settings.get(),
    ]);
    const component = components.find((c) => c.key === body.componentKey);
    if (!component) throw new BadRequestException({ statusCode: 400, message: 'Unknown assessment', errors: [{ path: 'componentKey', message: 'Unknown assessment' }] });

    const pool = await db.question.findMany({
      where: {
        subjectId: subject.id,
        classLevelId: level.id,
        status: 'APPROVED',
        ...(body.topics.length ? { topic: { in: body.topics } } : {}),
      },
      select: { id: true, type: true, difficulty: true },
    });

    const chosen: string[] = [];
    const shortfall: Partial<Record<keyof QuestionCounts, number>> = {};
    for (const [key, type] of COUNT_TYPES) {
      const wanted = body.counts[key];
      if (!wanted) continue;
      const ofType = pool.filter((q) => q.type === type);
      const picked = pickByDifficulty(ofType, wanted, body.difficulty);
      chosen.push(...picked);
      if (picked.length < wanted) shortfall[key] = wanted - picked.length;
    }
    if (!chosen.length) {
      throw new BadRequestException(
        'No approved questions match. Generate or approve questions for this subject and class in the Question Bank first.',
      );
    }

    // Objective questions first (section A), then written ones (section B).
    const byId = new Map(pool.map((q) => [q.id, q]));
    const ordered = [...chosen].sort(
      (a, b) => Number(!OBJECTIVE_TYPES.includes(byId.get(a)!.type)) - Number(!OBJECTIVE_TYPES.includes(byId.get(b)!.type)),
    );

    const paper = await db.$transaction(async (tx) => {
      const p = await tx.examPaper.create({
        data: {
          tenantId: currentTenantId(),
          subjectId: subject.id,
          classLevelId: level.id,
          termId: term.id,
          componentKey: component.key,
          title: body.title ?? `${subject.name} — ${level.name} ${component.name}, ${term.name}`,
          instructions: body.instructions ?? defaultInstructions(ordered.some((id) => !OBJECTIVE_TYPES.includes(byId.get(id)!.type))),
          durationMinutes: body.durationMinutes,
          createdById: currentContext().userId,
        },
      });
      await tx.examPaperItem.createMany({
        data: ordered.map((questionId, i) => ({
          tenantId: p.tenantId,
          paperId: p.id,
          questionId,
          order: i + 1,
          section: OBJECTIVE_TYPES.includes(byId.get(questionId)!.type) ? 'A' : 'B',
        })),
      });
      return p;
    });
    await this.audit.log({ action: 'paper.built', entityType: 'ExamPaper', entityId: paper.id, summary: `Built ${paper.title} (${ordered.length} questions)` });
    return { paper: await this.paperDetail(paper.id), shortfall };
  }

  @Patch(':id')
  @RequirePermissions('assessment.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(updatePaperSchema)) body: UpdatePaperInput): Promise<PaperDetail> {
    const paper = await this.prisma.db.examPaper.findUniqueOrThrow({ where: { id } });
    const { questionIds, ...fields } = body;
    await this.prisma.db.$transaction(async (tx) => {
      if (questionIds) {
        const questions = await tx.question.findMany({
          where: { id: { in: questionIds }, subjectId: paper.subjectId, classLevelId: paper.classLevelId },
          select: { id: true, type: true },
        });
        if (questions.length !== new Set(questionIds).size) {
          throw new BadRequestException('Some questions are not in this subject and class');
        }
        const types = new Map(questions.map((q) => [q.id, q.type]));
        const objectiveFirst = [...new Set(questionIds)].sort(
          (a, b) => Number(!OBJECTIVE_TYPES.includes(types.get(a)!)) - Number(!OBJECTIVE_TYPES.includes(types.get(b)!)),
        );
        await tx.examPaperItem.deleteMany({ where: { paperId: id } });
        await tx.examPaperItem.createMany({
          data: objectiveFirst.map((questionId, i) => ({
            tenantId: paper.tenantId,
            paperId: id,
            questionId,
            order: i + 1,
            section: OBJECTIVE_TYPES.includes(types.get(questionId)!) ? 'A' : 'B',
          })),
        });
      }
      await tx.examPaper.update({ where: { id }, data: fields });
    });
    return this.paperDetail(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('assessment.manage')
  async remove(@Param('id') id: string) {
    const paper = await this.prisma.db.examPaper.findUniqueOrThrow({ where: { id } });
    await this.prisma.db.examPaper.delete({ where: { id } });
    await this.audit.log({ action: 'paper.deleted', entityType: 'ExamPaper', entityId: id, summary: `Deleted ${paper.title}` });
  }

  private async paperDetail(id: string): Promise<PaperDetail> {
    const [p, { components }, tenant] = await Promise.all([
      this.prisma.db.examPaper.findUniqueOrThrow({ where: { id }, include: paperInclude }),
      this.settings.get(),
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true } }),
    ]);
    let number = 0;
    const sections = (['A', 'B'] as const)
      .map((key) => ({
        key,
        title: key === 'A' ? 'Section A — Objective questions' : 'Section B — Written questions',
        questions: p.items.filter((i) => i.section === key).map((i) => ({ ...questionRow(i.question), number: ++number })),
      }))
      .filter((s) => s.questions.length);
    return { ...summary(p, components), instructions: p.instructions, sections, schoolName: tenant.name };
  }
}

function summary(p: PaperRow, components: { key: string; name: string; maxScore: number }[]): PaperSummary {
  return {
    id: p.id,
    title: p.title,
    subject: p.subject,
    classLevel: p.classLevel,
    term: { id: p.term.id, name: p.term.name, sessionName: p.term.session.name },
    component: components.find((c) => c.key === p.componentKey) ?? null,
    durationMinutes: p.durationMinutes,
    status: p.status,
    questionCount: p.items.length,
    totalMarks: p.items.reduce((n, i) => n + i.question.marks, 0),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Random pick honouring a difficulty target, topping up from any difficulty. */
function pickByDifficulty(pool: { id: string; difficulty: Difficulty }[], wanted: number, difficulty: string): string[] {
  const remaining = shuffle([...pool]);
  const take = (d: Difficulty | null, n: number) => {
    const out: string[] = [];
    for (let i = 0; i < remaining.length && out.length < n; ) {
      if (d === null || remaining[i]!.difficulty === d) out.push(remaining.splice(i, 1)[0]!.id);
      else i++;
    }
    return out;
  };
  const picked: string[] = [];
  if (difficulty === 'MIXED') {
    for (const [d, share] of MIX) picked.push(...take(d, Math.round(wanted * share)));
  } else {
    picked.push(...take(difficulty as Difficulty, wanted));
  }
  picked.push(...take(null, wanted - picked.length));
  return picked.slice(0, wanted);
}

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
}

function defaultInstructions(hasWritten: boolean) {
  return hasWritten
    ? 'Answer ALL questions in Section A. Answer the questions in Section B as instructed. Write your name and class on your answer sheet.'
    : 'Answer ALL questions. Choose the correct option for each question. Write your name and class on your answer sheet.';
}
