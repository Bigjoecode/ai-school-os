import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  asLanguage,
  EXAMS,
  parentLanguageSchema,
  tutorLanguageSchema,
  type LanguageCode,
  type ParentLanguageInfo,
  MEMORY_KINDS,
  PLATFORM_AREAS,
  aiQuizSchema,
  examDraftSchema,
  examQuestionSchema,
  flashcardRequestSchema,
  flashcardReviewSchema,
  practiceStartSchema,
  practiceSubmitSchema,
  sittingStartSchema,
  studyPlanRequestSchema,
  syllabusImportSchema,
  syllabusSaveSchema,
  theoryAnswerSchema,
  theoryDraftSaveSchema,
  theoryStartSchema,
  tutorChatSchema,
  tutorSpeakSchema,
  utmeStartSchema,
  type TutorVoiceInfo,
  type ExamBody,
  type ExamQuestionInput,
  type StudentAccess,
  type SyllabusTopicRow,
  type TutorChatInput,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions, RequirePlatformRole } from '../common/decorators';
import { parentChoice, schoolParentLanguage, studentLanguage } from '../common/language';
import { currentTenantId, currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService, type ResolvedAccess } from '../student-ai/entitlements.service';
import { ExamService } from './exam.service';
import { MasteryService, subjectKey } from './mastery.service';
import { SittingService } from './sitting.service';
import { StudyService } from './study.service';
import { SyllabusService } from './syllabus.service';
import { MAX_SPEAK_CHARS, VoiceService } from '../ai/voice.service';
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
    private readonly sittings: SittingService,
    private readonly files: FilesService,
    private readonly voice: VoiceService,
    private readonly prisma: PrismaService,
  ) {}

  private async me() {
    const id = await this.entitlements.me();
    return { id, access: await this.entitlements.access(id) };
  }

  @Get('me')
  async home() {
    const { id, access } = await this.me();
    const [plans, decks, attempts, map] = await Promise.all([this.study.plans(id), this.study.decks(id), this.study.attempts(id, 10), this.mastery.map(id)]);
    const tutorLanguage = await studentLanguage(this.prisma, id);
    return { access: visible(access), plans: plans.filter((p) => p.status === 'ACTIVE').slice(0, 3), dueCards: decks.reduce((t, d) => t + d.due, 0), recent: attempts, weakest: map.weakest, strongest: map.strongest, tutorLanguage };
  }

  /** The language the tutor and careers counsellor reply in (the student's own choice). */
  @Put('language')
  async setLanguage(@Body(new ZodPipe(tutorLanguageSchema)) body: { language: LanguageCode | null }) {
    const id = await this.entitlements.me();
    await this.prisma.root.student.update({ where: { id }, data: { tutorLanguage: body.language && body.language !== 'EN' ? body.language : null } });
    return { tutorLanguage: await studentLanguage(this.prisma, id) };
  }

  // ---------------------------------------------------------- tutor voice

  @Get('tutor/voice')
  voiceInfo(): TutorVoiceInfo {
    return { server: this.voice.available(), maxSpeakChars: MAX_SPEAK_CHARS };
  }

  /** What the student said, as text (then sent to the tutor like a typed message). */
  @Post('tutor/transcribe')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 12 * 1024 * 1024, files: 1 } }))
  async transcribe(@UploadedFile() audio: { buffer: Buffer; mimetype: string; originalname: string } | undefined, @Body() body: { subject?: string; language?: string }) {
    const { id, access } = await this.me();
    this.entitlements.attribute(access);
    const language = asLanguage(body?.language) ?? (await studentLanguage(this.prisma, id));
    return { text: await this.voice.transcribe(audio!, typeof body?.subject === 'string' ? body.subject.slice(0, 60) : null, language) };
  }

  /** Part of a tutor reply read aloud (MP3). */
  @Post('tutor/speak')
  @HttpCode(200)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async speak(@Body(new ZodPipe(tutorSpeakSchema)) body: { text: string }, @Res() res: Response) {
    const { id, access } = await this.me();
    this.entitlements.attribute(access);
    const audio = await this.voice.speak(body.text, await studentLanguage(this.prisma, id));
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
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
    const { id: studentId, access } = await this.me();
    // A timed written paper left past its time is marked from its saved draft.
    return this.study.present(await this.exams.settle(access, await this.study.attempt(studentId, id)));
  }

  /** Written answers saved as the student writes (theory and practical papers). */
  @Put('attempts/:id/draft')
  async draft(@Param('id') id: string, @Body(new ZodPipe(theoryDraftSaveSchema)) body: z.infer<typeof theoryDraftSaveSchema>) {
    return this.study.saveDraft(await this.entitlements.me(), id, body.answers);
  }

  @Put('attempts/:id/progress')
  async progress(@Param('id') id: string, @Body(new ZodPipe(practiceSubmitSchema)) body: z.infer<typeof practiceSubmitSchema>) {
    return this.study.saveProgress(await this.entitlements.me(), id, body.answers);
  }

  @Post('attempts/:id/submit')
  @HttpCode(200)
  async submit(@Param('id') id: string, @Body(new ZodPipe(practiceSubmitSchema)) body: z.infer<typeof practiceSubmitSchema>) {
    const { id: studentId, access } = await this.me();
    const a = await this.study.submit(studentId, id, body.answers, body.flags);
    // A paper of a full mock: the sitting's result is worked out once every paper is in.
    if (a.sittingId) await this.sittings.view(access, a.sittingId);
    // Exam practice gets a short AI review when allowance remains.
    return this.study.present(a.exam ? await this.exams.review(access, a.id) : a);
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

  /** A full JAMB UTME CBT mock: Use of English + 3 subjects, 180 questions, one 120-minute timer (needs JAMB Prep). */
  @Post('exams/utme/start')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async startUtme(@Body(new ZodPipe(utmeStartSchema)) body: z.infer<typeof utmeStartSchema>) {
    const { access } = await this.me();
    return this.study.present(await this.exams.startUtme(access, body));
  }

  /** Approved questions per topic in one exam subject (practice by topic). */
  @Get('exams/topics')
  async examTopics(@Query(new ZodPipe(z.object({ exam: z.enum(EXAMS), subject: z.string().trim().min(2).max(60) }))) q: { exam: ExamBody; subject: string }) {
    await this.entitlements.me();
    return this.exams.topics(q.exam, q.subject);
  }

  /** Written (theory) practice, marked by AI against each question's marking guide. */
  @Post('exams/theory/start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async startTheory(@Body(new ZodPipe(theoryStartSchema)) body: z.infer<typeof theoryStartSchema>) {
    const { access } = await this.me();
    return this.study.view(await this.exams.startTheory(access, body));
  }

  // ---------------------------------------------------------- full WASSCE and BECE mocks (WAEC or BECE Prep)

  @Get('exams/sittings')
  async sittingList() {
    return this.sittings.list(await this.entitlements.me());
  }

  /** A full WASSCE or BECE mock in one subject: every paper as the exam sets it, each on its own clock. */
  @Post('exams/sittings')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async startSitting(@Body(new ZodPipe(sittingStartSchema)) body: z.infer<typeof sittingStartSchema>) {
    const { access } = await this.me();
    return this.sittings.create(access, body);
  }

  @Get('exams/sittings/:id')
  async sitting(@Param('id') id: string) {
    const { access } = await this.me();
    return this.sittings.view(access, id);
  }

  @Post('exams/sittings/:id/papers/:paper/start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async startPaper(@Param('id') id: string, @Param('paper') paper: string) {
    const n = Number(paper);
    if (![1, 2, 3, 4].includes(n)) throw new BadRequestException('Paper must be 1, 2, 3 or 4');
    const { access } = await this.me();
    return this.study.present(await this.sittings.startPaper(access, id, n));
  }

  @Post('attempts/:id/theory')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async markTheory(@Param('id') id: string, @Body(new ZodPipe(theoryAnswerSchema)) body: z.infer<typeof theoryAnswerSchema>) {
    const { access } = await this.me();
    const a = await this.exams.markTheory(access, id, body.answers);
    if (a.sittingId) await this.sittings.view(access, a.sittingId);
    return this.study.present(a);
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
    return { access: visible(access), mastery: map, plans, attempts, memories, tutorConversations: sessions, tutorLanguage: await studentLanguage(this.prisma, id) };
  }

  /** Parents may also choose the language their child's tutor explains in. */
  @Put(':id/tutor-language')
  async setTutorLanguage(@Param('id') id: string, @Body(new ZodPipe(tutorLanguageSchema)) body: { language: LanguageCode | null }) {
    await this.entitlements.assertParentOf(currentUserId(), [id]);
    await this.prisma.root.student.update({ where: { id }, data: { tutorLanguage: body.language && body.language !== 'EN' ? body.language : null } });
    return { tutorLanguage: await studentLanguage(this.prisma, id) };
  }

  /** Parents can tell the tutor something useful ("she learns best with diagrams"). */
  @Post(':id/memories')
  async note(@Param('id') id: string, @Body(new ZodPipe(z.object({ kind: z.enum(MEMORY_KINDS), content: z.string().trim().min(3).max(200) }))) body: { kind: string; content: string }) {
    await this.entitlements.assertParentOf(currentUserId(), [id]);
    const s = await this.prisma.root.student.findUniqueOrThrow({ where: { id }, select: { tenantId: true } });
    return this.tutor.addMemory({ tenantId: s.tenantId, studentId: id }, body, 'PARENT');
  }
}

/** A parent's own language: weekly learning updates, the Parent AI and WhatsApp assistant reply in it. */
@Controller('family/language')
@RequirePermissions('family.manage')
export class FamilyLanguageController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(): Promise<ParentLanguageInfo> {
    const tenantId = currentTenantId();
    return { language: await parentChoice(this.prisma, tenantId, currentUserId()), schoolDefault: await schoolParentLanguage(this.prisma, tenantId) };
  }

  /** Saved on every guardian record this parent has, in every school (it's a personal preference). Null: use the school's default. */
  @Put()
  async set(@Body(new ZodPipe(parentLanguageSchema)) body: { language: LanguageCode | null }): Promise<ParentLanguageInfo> {
    await this.prisma.root.guardian.updateMany({ where: { userId: currentUserId() }, data: { preferredLanguage: asLanguage(body.language) } });
    return this.get();
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
  questions(@Query(new ZodPipe(z.object({ exam: z.enum(EXAMS).optional(), subject: z.string().optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']).optional(), q: z.string().max(100).optional(), type: z.enum(['OBJECTIVE', 'THEORY', 'PRACTICAL']).optional() }))) q: { exam?: ExamBody; subject?: string; status?: string; q?: string; type?: string }) {
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
