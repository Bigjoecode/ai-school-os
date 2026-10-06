import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  EXAMS,
  PLATFORM_AREAS,
  fillGapsSchema,
  pipelineSettingsSchema,
  reviewApproveSchema,
  reviewBulkApproveSchema,
  reviewRejectSchema,
  type ExamBody,
  type FillGapsInput,
  type PipelineSettingsInput,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePlatformRole } from '../common/decorators';
import { currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { QuestionPipelineService } from './question-pipeline.service';

/** The console's question-bank pipeline: coverage, AI gap filling and the review queue. */
@Controller('platform/content/pipeline')
@RequirePlatformRole(...PLATFORM_AREAS.content)
export class QuestionPipelineController {
  constructor(private readonly pipeline: QuestionPipelineService) {}

  @Get('settings')
  settings() {
    return this.pipeline.settings();
  }

  @Put('settings')
  saveSettings(@Body(new ZodPipe(pipelineSettingsSchema)) body: PipelineSettingsInput) {
    return this.pipeline.saveSettings(body, currentUserId());
  }

  /** Every subject of one exam: target, published, drafts, gap and coverage %. */
  @Get('coverage')
  examCoverage(@Query(new ZodPipe(z.object({ exam: z.enum(EXAMS) }))) q: { exam: ExamBody }) {
    return this.pipeline.examCoverage(q.exam);
  }

  /** One subject, topic by topic (subtopics nested). */
  @Get('coverage/subject')
  subjectCoverage(@Query(new ZodPipe(z.object({ exam: z.enum(EXAMS), subject: z.string().trim().min(2).max(60) }))) q: { exam: ExamBody; subject: string }) {
    return this.pipeline.subjectCoverage(q.exam, q.subject);
  }

  @Post('fill')
  @HttpCode(202)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  fill(@Body(new ZodPipe(fillGapsSchema)) body: FillGapsInput) {
    return this.pipeline.fill(body, currentUserId());
  }

  @Get('jobs')
  jobs() {
    return this.pipeline.jobs();
  }

  @Get('jobs/:id')
  job(@Param('id') id: string) {
    return this.pipeline.job(id);
  }

  @Post('jobs/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.pipeline.cancel(id);
  }

  @Get('review')
  review(
    @Query(
      new ZodPipe(
        z.object({
          exam: z.enum(EXAMS).optional(),
          subject: z.string().max(60).optional(),
          topicId: z.string().max(40).optional(),
          flagged: z.enum(['yes', 'no']).optional(),
          aiOnly: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      ),
    )
    q: { exam?: ExamBody; subject?: string; topicId?: string; flagged?: 'yes' | 'no'; aiOnly: boolean; limit: number; offset: number },
  ) {
    return this.pipeline.reviewQueue(q);
  }

  @Get('review/stats')
  stats() {
    return this.pipeline.stats();
  }

  @Post('review/bulk-approve')
  @HttpCode(200)
  bulkApprove(@Body(new ZodPipe(reviewBulkApproveSchema)) body: z.infer<typeof reviewBulkApproveSchema>) {
    return this.pipeline.bulkApprove(body.ids, currentUserId());
  }

  /** Approve (optionally with edits): PUBLISHED, with the reviewer and time recorded. */
  @Post('review/:id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Body(new ZodPipe(reviewApproveSchema)) body: z.infer<typeof reviewApproveSchema>) {
    return this.pipeline.approve(id, body.edits, currentUserId());
  }

  @Post('review/:id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @Body(new ZodPipe(reviewRejectSchema)) body: z.infer<typeof reviewRejectSchema>) {
    return this.pipeline.reject(id, body.mode, currentUserId());
  }
}
