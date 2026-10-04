import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  EXAMS,
  MEMORY_KINDS,
  PLATFORM_AREAS,
  aiQuizSchema,
  examDraftSchema,
  examQuestionSchema,
  flashcardRequestSchema,
  flashcardReviewSchema,
  practiceStartSchema,
  practiceSubmitSchema,
  studyPlanRequestSchema,
  syllabusImportSchema,
  syllabusSaveSchema,
  theoryAnswerSchema,
  theoryStartSchema,
  tutorChatSchema,
  type ExamBody,
  type ExamQuestionInput,
  type StudentAccess,
  type SyllabusTopicRow,
  type TutorChatInput,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions, RequirePlatformRole } from '../common/decorators';
import { currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService, type ResolvedAccess } from '../student-ai/entitlements.service';
import { ExamService } from './exam.service';
import { MasteryService, subjectKey } from './mastery.service';
import { StudyService } from './study.service';
import { SyllabusService } from './syllabus.service';
import { TutorService } from './tutor.service';

const visible = ({ tenantId: _t, periodKey: _p, ...a }: ResolvedAccess): StudentAccess => a;

/** The student's own learning companion and Exam Academy. Everything is scoped to the signed-in student. */
@Controller('learning')
@RequirePermissions('learning.use')
export class LearningController {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly tutor: TutorService,
    private readonly study: StudyService,
    private readonly mastery: MasteryService,
    private readonly exams: ExamService,
    private readonly files: FilesService,
  ) {}

  private async me() {
    const id = await this.entitlements.me();
    return { id, access: await this.entitlements.access(id) };
  }

  @Get('me')
  async home() {
    const { id, access } = await this.me();
    const [plans, decks, attempts, map] = await Promise.all([this.study.plans(id), this.study.decks(id), this.study.attempts(id, 10), this.mastery.map(id)]);
    return { access: visible(access), plans: plans.filter((p) => p.status === 'ACTIVE').slice(0, 3), dueCards: decks.reduce((t, d) => t + d.due, 0), recent: attempts, weakest: map.weakest, strongest: map.strongest };
  }

  @Post('tutor')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async chat(@Body(new ZodPipe(tutorChatSchema)) body: TutorChatInput) {
    return this.tutor.chat(await this.entitlements.me(), body);
  }

  @Get('conversations')
  async conversations() {
    return this.tutor.conversations(await this.entitlements.me());
  }

  @Get('conversations/:id')
  async conversation(@Param('id') id: string) {
    return this.tutor.conversation(await this.entitlements.me(), id);
  }

  /** A photo of a question (Plus/Pro), kept private to the student. */
  @Post('uploads')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: { buffer: Buffer; originalname: string; size: number; mimetype: string } | undefined) {
    const { access } = await this.me();
    if (!access.photos) throw new BadRequestException('Photo questions come with AI Student Plus');
    const saved = await this.files.save(file, false);
    if (!saved.mimeType.startsWith('image/')) throw new BadRequestException('Upload a photo (JPG, PNG or WebP)');
    return saved;
  }

  @Get('mastery')
  async masteryMap() {
    return this.mastery.map(await this.entitlements.me());
  }

  @Get('memories')
  async memories() {
    return this.tutor.memories(await this.entitlements.me());
  }

  @Post('memories')
  async addMemory(@Body(new ZodPipe(z.object({ kind: z.enum(MEMORY_KINDS), content: z.string().trim().min(3).max(200) }))) body: { kind: string; content: string }) {
    const { access } = await this.me();
    return this.tutor.addMemory(access, body, 'STUDENT');
  }

  @Delete('memories/:id')
  @HttpCode(200)
  async forget(@Param('id') id: string) {
    return this.tutor.forget(await this.entitlements.me(), id);
  }

  // ---------------------------------------------------------- quizzes & practice

  @Post('quiz')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async quiz(@Body(new ZodPipe(aiQuizSchema)) body: z.infer<typeof aiQuizSchema>) {
    const { access } = await this.me();
    return this.study.view(await this.study.aiQuiz(access, body));
  }

  @Get('attempts')
  async attempts() {
    return this.study.attempts(await this.entitlements.me());
  }

  @Get('attempts/:id')
  async attempt(@Param('id') id: string) {
    return this.study.view(await this.study.attempt(await this.entitlements.me(), id));
  }

  @Put('attempts/:id/progress')
  async progress(@Param('id') id: string, @Body(new ZodPipe(practiceSubmitSchema)) body: z.infer<typeof practiceSubmitSchema>) {
    return this.study.saveProgress(await this.entitlements.me(), id, body.answers);
  }

  @Post('attempts/:id/submit')
  @HttpCode(200)
  async submit(@Param('id') id: string, @Body(new ZodPipe(practiceSubmitSchema)) body: z.infer<typeof practiceSubmitSchema>) {
    const { id: studentId, access } = await this.me();
    const a = await this.study.submit(studentId, id, body.answers);
    // Exam practice gets a short AI review when allowance remains.
    return this.study.view(a.exam ? await this.exams.review(access, a.id) : a);
  }

  // ---------------------------------------------------------- study plans & flashcards (Plus)

  @Get('plans')
  async plans() {
    return this.study.plans(await this.entitlements.me());
  }

  @Post('plans')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async generatePlan(@Body(new ZodPipe(studyPlanRequestSchema)) body: z.infer<typeof studyPlanRequestSchema>) {
    const { access } = await this.me();
    return this.study.generatePlan(access, body);
  }

  @Put('plans/:id')
  async updatePlan(@Param('id') id: string, @Body(new ZodPipe(z.object({ itemIndex: z.number().int().min(0).optional(), done: z.boolean().optional(), status: z.enum(['ACTIVE', 'DONE', 'ARCHIVED']).optional() }))) body: { itemIndex?: number; done?: boolean; status?: 'ACTIVE' | 'DONE' | 'ARCHIVED' }) {
    return this.study.updatePlan(await this.entitlements.me(), id, body);
  }

  @Get('flashcards')
  async decks() {
    return this.study.decks(await this.entitlements.me());
  }

  @Post('flashcards')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async generateDeck(@Body(new ZodPipe(flashcardRequestSchema)) body: z.infer<typeof flashcardRequestSchema>) {
    const { access } = await this.me();
    return this.study.generateDeck(access, body);
  }

  @Post('flashcards/:id/review')
  @HttpCode(200)
  async review(@Param('id') id: string, @Body(new ZodPipe(flashcardReviewSchema)) body: z.infer<typeof flashcardReviewSchema>) {
    return this.study.review(await this.entitlements.me(), id, body.cardId, body.result);
  }

  // ---------------------------------------------------------- Exam Academy

  @Get('exams')
  async examCatalog() {
    const { access } = await this.me();
    return this.exams.catalog(access);
  }

  @Post('exams/start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async startExam(@Body(new ZodPipe(practiceStartSchema)) body: z.infer<typeof practiceStartSchema>) {
    const { access } = await this.me();
    return this.study.view(await this.exams.start(access, body));
  }

  /** Written (theory) practice, marked by AI against each question's marking guide. */
  @Post('exams/theory/start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async startTheory(@Body(new ZodPipe(theoryStartSchema)) body: z.infer<typeof theoryStartSchema>) {
    const { access } = await this.me();
    return this.study.view(await this.exams.startTheory(access, body));
  }

  @Post('attempts/:id/theory')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async markTheory(@Param('id') id: string, @Body(new ZodPipe(theoryAnswerSchema)) body: z.infer<typeof theoryAnswerSchema>) {
    const { access } = await this.me();
    return this.study.view(await this.exams.markTheory(access, id, body.answers));
  }
}

/** A parent's view of one child's learning: access, mastery, plans, practice and what the tutor has learned. */
@Controller('family/children')
@RequirePermissions('family.manage')
export class ChildProgressController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly mastery: MasteryService,
    private readonly study: StudyService,
    private readonly tutor: TutorService,
  ) {}

  @Get(':id/progress')
  async progress(@Param('id') id: string) {
    await this.entitlements.assertParentOf(currentUserId(), [id]);
    const access = await this.entitlements.access(id);
    const since = new Date(access.windowStart);
    const [map, plans, attempts, memories, sessions] = await Promise.all([
      this.mastery.map(id),
      this.study.plans(id),
      this.study.attempts(id, 20),
      this.tutor.memories(id),
      this.prisma.root.aiConversation.count({ where: { studentId: id, agent: 'tutor', updatedAt: { gte: since } } }),
    ]);
    return { access: visible(access), mastery: map, plans, attempts, memories, tutorConversations: sessions };
  }

  /** Parents can tell the tutor something useful ("she learns best with diagrams"). */
  @Post(':id/memories')
  async note(@Param('id') id: string, @Body(new ZodPipe(z.object({ kind: z.enum(MEMORY_KINDS), content: z.string().trim().min(3).max(200) }))) body: { kind: string; content: string }) {
    await this.entitlements.assertParentOf(currentUserId(), [id]);
    const s = await this.prisma.root.student.findUniqueOrThrow({ where: { id }, select: { tenantId: true } });
    return this.tutor.addMemory({ tenantId: s.tenantId, studentId: id }, body, 'PARENT');
  }
}

/** The console's content tools: the Exam Academy bank and the syllabus graph. */
@Controller('platform/content')
@RequirePlatformRole(...PLATFORM_AREAS.content)
export class ContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exams: ExamService,
    private readonly syllabus: SyllabusService,
  ) {}

  @Get('questions')
  questions(@Query(new ZodPipe(z.object({ exam: z.enum(EXAMS).optional(), subject: z.string().optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']).optional(), q: z.string().max(100).optional(), type: z.enum(['OBJECTIVE', 'THEORY']).optional() }))) q: { exam?: ExamBody; subject?: string; status?: string; q?: string; type?: string }) {
    return this.exams.bank(q);
  }

  @Post('questions')
  create(@Body(new ZodPipe(examQuestionSchema)) body: ExamQuestionInput) {
    return this.exams.create(body, currentUserId());
  }

  @Put('questions/:id')
  update(@Param('id') id: string, @Body(new ZodPipe(examQuestionSchema)) body: ExamQuestionInput) {
    return this.exams.update(id, body, currentUserId());
  }

  @Delete('questions/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.exams.remove(id);
  }

  @Post('questions/status')
  @HttpCode(200)
  status(@Body(new ZodPipe(z.object({ ids: z.array(z.string()).min(1).max(500), status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']) }))) body: { ids: string[]; status: 'DRAFT' | 'PUBLISHED' | 'RETIRED' }) {
    return this.exams.setStatus(body.ids, body.status, currentUserId());
  }

  @Post('questions/import')
  @HttpCode(200)
  import(@Body(new ZodPipe(z.object({ questions: z.array(examQuestionSchema).min(1).max(2000) }))) body: { questions: ExamQuestionInput[] }) {
    return this.exams.import(body.questions, currentUserId());
  }

  @Post('questions/draft')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  draft(@Body(new ZodPipe(examDraftSchema)) body: z.infer<typeof examDraftSchema>) {
    return this.exams.draft(body, currentUserId());
  }

  @Get('topics')
  async topics(@Query(new ZodPipe(z.object({ subject: z.string().optional(), level: z.enum(['PRIMARY', 'JUNIOR', 'SENIOR']).optional() }))) q: { subject?: string; level?: string }): Promise<SyllabusTopicRow[]> {
    const rows = await this.prisma.root.syllabusTopic.findMany({ where: { ...(q.subject ? { subject: subjectKey(q.subject) } : {}), ...(q.level ? { level: q.level } : {}) }, orderBy: [{ subject: 'asc' }, { level: 'asc' }, { order: 'asc' }, { name: 'asc' }] });
    return rows.map((t) => ({ id: t.id, subject: t.subject, level: t.level as SyllabusTopicRow['level'], name: t.name, parentId: t.parentId, order: t.order, exams: t.exams as ExamBody[], objectives: t.objectives }));
  }

  // ---------------------------------------------------------- syllabus import (WAEC, NECO, JAMB, BECE)

  /** Reads the text out of an uploaded syllabus PDF or Word file (nothing is stored). */
  @Post('syllabus/extract')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  extractSyllabus(@UploadedFile() file: { buffer: Buffer; originalname: string; size: number; mimetype: string } | undefined) {
    return this.syllabus.extract(file);
  }

  /** AI lays the syllabus out as topics, subtopics and objectives, for review. */
  @Post('syllabus/preview')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  previewSyllabus(@Body(new ZodPipe(syllabusImportSchema)) body: z.infer<typeof syllabusImportSchema>) {
    return this.syllabus.preview(body);
  }

  @Post('syllabus')
  @HttpCode(200)
  saveSyllabus(@Body(new ZodPipe(syllabusSaveSchema)) body: z.infer<typeof syllabusSaveSchema>) {
    return this.syllabus.save(body, currentUserId());
  }

  @Post('topics')
  async addTopic(@Body(new ZodPipe(z.object({ subject: z.string().trim().min(2), level: z.enum(['PRIMARY', 'JUNIOR', 'SENIOR']), name: z.string().trim().min(2).max(120), parentId: z.string().nullish(), order: z.number().int().default(0) }))) body: { subject: string; level: string; name: string; parentId?: string | null; order: number }) {
    return this.prisma.root.syllabusTopic.create({ data: { ...body, subject: subjectKey(body.subject), parentId: body.parentId ?? null } });
  }
}
