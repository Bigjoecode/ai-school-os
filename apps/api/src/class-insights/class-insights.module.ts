import { Body, Controller, Get, HttpCode, Module, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  classInsightsQuerySchema,
  classInsightsTargetSchema,
  classStudentQuerySchema,
  classTopicQuerySchema,
  practiceDraftSchema,
  practiceHomeworkSchema,
  remedialLessonSchema,
  type ClassInsightsOptions,
  type ClassInsightsQuery,
  type ClassInsightsSummary,
  type ClassInsightsTarget,
  type ClassMastery,
  type ClassStudentMastery,
  type ClassTopicDetail,
  type MyClassInsights,
  type PracticeDraft,
  type PracticeDraftInput,
  type PracticeHomeworkInput,
  type RemedialLessonInput,
  type RemedialLessonResult,
} from '@aischool/shared';
import { z } from 'zod';
import { AcademicModule } from '../academic-engine/academic.module';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ClassInsightsService } from './class-insights.service';

/**
 * Class insights: topic mastery by class and subject for teachers (the classes
 * and subjects they teach) and academic managers (every class). Each route
 * checks academics.read or homework.manage, then the class and subject.
 */
@Controller('class-insights')
export class ClassInsightsController {
  constructor(private readonly insights: ClassInsightsService) {}

  @Get('options')
  options(): Promise<ClassInsightsOptions> {
    return this.insights.options();
  }

  @Get('mine')
  mine(): Promise<MyClassInsights> {
    return this.insights.mine();
  }

  @Get('mastery')
  mastery(@Query(new ZodPipe(classInsightsQuerySchema)) q: ClassInsightsQuery): Promise<ClassMastery> {
    return this.insights.mastery(q.classArmId, q.subjectId, q.allTopics);
  }

  @Get('topic')
  topic(@Query(new ZodPipe(classTopicQuerySchema)) q: z.infer<typeof classTopicQuerySchema>): Promise<ClassTopicDetail> {
    return this.insights.topic(q.classArmId, q.subjectId, q.topicId);
  }

  @Get('student')
  student(@Query(new ZodPipe(classStudentQuerySchema)) q: z.infer<typeof classStudentQuerySchema>): Promise<ClassStudentMastery> {
    return this.insights.student(q.classArmId, q.subjectId, q.studentId);
  }

  /** A short paragraph with suggestions (AI with ai.use when connected; otherwise rule-based). */
  @Post('summary')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  summary(@Body(new ZodPipe(classInsightsTargetSchema)) body: ClassInsightsTarget): Promise<ClassInsightsSummary> {
    return this.insights.summary(body.classArmId, body.subjectId);
  }

  /** Queues a DRAFT remedial lesson plan (NOT_SUBMITTED) with the lesson generator. */
  @Post('remedial-lesson')
  @HttpCode(202)
  @RequirePermissions('lessons.manage', 'ai.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  remedial(@Body(new ZodPipe(remedialLessonSchema)) body: RemedialLessonInput): Promise<RemedialLessonResult> {
    return this.insights.remedialLesson(body);
  }

  /** Five practice questions on the topic: AI draft when available, otherwise blanks for the teacher. */
  @Post('practice-draft')
  @HttpCode(200)
  @RequirePermissions('homework.manage')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  practiceDraft(@Body(new ZodPipe(practiceDraftSchema)) body: PracticeDraftInput): Promise<PracticeDraft> {
    return this.insights.practiceDraft(body.classArmId, body.subjectId, body.topicId);
  }

  /** Saves practice questions as DRAFT homework linked to the topic. */
  @Post('practice-homework')
  @RequirePermissions('homework.manage')
  practiceHomework(@Body(new ZodPipe(practiceHomeworkSchema)) body: PracticeHomeworkInput): Promise<{ id: string }> {
    return this.insights.practiceHomework(body);
  }
}

/** Phase 25: the teacher learning loop (class mastery heatmap, remedial lessons and practice). */
@Module({
  imports: [AiModule, AcademicModule, AssessmentModule],
  controllers: [ClassInsightsController],
  providers: [ClassInsightsService],
  exports: [ClassInsightsService],
})
export class ClassInsightsModule {}
