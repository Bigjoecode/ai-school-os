import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { practicalAskSchema, practicalCheckSchema, practicalDraftSchema, practicalLabStartSchema, practicalOverrideSchema, practicalPracticeSchema, type PracticalAskInput, type PracticalExam } from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ExamService } from '../learning/exam.service';
import { StudyService } from '../learning/study.service';
import { EntitlementService } from '../student-ai/entitlements.service';
import { PracticalsTeacherService } from './practicals-teacher.service';
import { PracticalsService } from './practicals.service';

/** The student's WAEC Practical Academy: lessons, quick checks, practical-question practice and virtual labs. */
@Controller('learning/practicals')
@RequirePermissions('learning.use')
export class PracticalsController {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly practicals: PracticalsService,
    private readonly exams: ExamService,
    private readonly study: StudyService,
  ) {}

  private async access() {
    return this.entitlements.access(await this.entitlements.me());
  }

  @Get()
  async subjects() {
    return this.practicals.subjects(await this.access());
  }

  @Get('subjects/:subject')
  async subject(@Param('subject') subject: string) {
    return this.practicals.subject(await this.access(), subject);
  }

  @Get('lessons/:id')
  async lesson(@Param('id') id: string) {
    return this.practicals.lessonView(await this.access(), id);
  }

  @Post('lessons/:id/check')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async check(@Param('id') id: string, @Body(new ZodPipe(practicalCheckSchema)) body: z.infer<typeof practicalCheckSchema>) {
    return this.practicals.check(await this.access(), id, body.answers, body.questions);
  }

  /** "Ask Mrs Ada" in the 3D lab: a short answer from the practical's lesson, on the student's AI allowance (refused in timed practicals). */
  @Post('lessons/:id/ask')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async ask(@Param('id') id: string, @Body(new ZodPipe(practicalAskSchema)) body: PracticalAskInput) {
    return this.practicals.ask(await this.access(), id, body);
  }

  /** WAEC practical (alternative-to-practical) questions on the lesson's topic, AI-marked through the theory flow (needs WAEC Prep). */
  @Post('lessons/:id/practice')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async practice(@Param('id') id: string, @Body(new ZodPipe(practicalPracticeSchema)) body: z.infer<typeof practicalPracticeSchema>) {
    const access = await this.access();
    const l = await this.practicals.lesson(id);
    return this.study.view(await this.exams.startTheory(access, { exam: l.exam as PracticalExam, subject: l.subject, questions: body.questions, type: 'PRACTICAL', topicId: l.topicId }));
  }

  @Post('labs')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async start(@Body(new ZodPipe(practicalLabStartSchema)) body: z.infer<typeof practicalLabStartSchema>) {
    return this.practicals.startLab(await this.access(), body);
  }

  @Get('labs/:id')
  async lab(@Param('id') id: string) {
    return this.practicals.attempt(await this.access(), id);
  }

  /** Autosave of the lab's state while the student works. */
  @Put('labs/:id/draft')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async draft(@Param('id') id: string, @Body(new ZodPipe(practicalDraftSchema)) body: z.infer<typeof practicalDraftSchema>) {
    return this.practicals.saveDraft(await this.access(), id, body.state);
  }

  @Post('labs/:id/submit')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async submit(@Param('id') id: string, @Body(new ZodPipe(practicalDraftSchema)) body: z.infer<typeof practicalDraftSchema>) {
    return this.practicals.submit(await this.access(), id, body.state);
  }
}

/** Teachers' view of their classes' practical work, with review and override of lab marks. Like Class insights, each route checks academics.read or homework.manage, then the class and subject. */
@Controller('practicals-teaching')
export class PracticalsTeachingController {
  constructor(private readonly teaching: PracticalsTeacherService) {}

  @Get('class')
  classView(@Query(new ZodPipe(z.object({ classArmId: z.string().optional(), subject: z.string().max(80).optional() }))) q: { classArmId?: string; subject?: string }) {
    return this.teaching.classView(q.classArmId, q.subject);
  }

  /** Practicals to set as homework (the homework form's picker). */
  @Get('lessons')
  @RequirePermissions('homework.manage')
  lessons(@Query(new ZodPipe(z.object({ subjectId: z.string().max(60).optional(), q: z.string().max(80).optional() }))) q: { subjectId?: string; q?: string }) {
    return this.teaching.pickList(q.subjectId, q.q);
  }

  @Get('attempts/:id')
  attempt(@Param('id') id: string) {
    return this.teaching.attempt(id);
  }

  @Post('attempts/:id/override')
  @HttpCode(200)
  override(@Param('id') id: string, @Body(new ZodPipe(practicalOverrideSchema)) body: z.infer<typeof practicalOverrideSchema>) {
    return this.teaching.override(id, body);
  }
}
