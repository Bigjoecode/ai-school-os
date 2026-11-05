import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  cbtSendScoresSchema,
  createPracticalAssessmentSchema,
  practicalAssessmentStartSchema,
  updatePracticalAssessmentSchema,
  type PracticalAssessmentStartInput,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PracticalAssessmentsService } from './practical-assessments.service';

/** Practical tests for staff: schedule a virtual lab as a timed class test or exam, follow it, release results and copy marks to the score sheet. */
@Controller('practical-assessments')
export class PracticalAssessmentsController {
  constructor(private readonly assessments: PracticalAssessmentsService) {}

  @Get('options')
  @RequirePermissions('assessment.manage')
  options() {
    return this.assessments.options();
  }

  @Get('practicals')
  @RequirePermissions('assessment.manage')
  picks(@Query(new ZodPipe(z.object({ subjectId: z.string().min(1).max(60) }))) q: { subjectId: string }) {
    return this.assessments.picks(q.subjectId);
  }

  @Get()
  @RequirePermissions('assessment.read')
  list() {
    return this.assessments.list();
  }

  @Post()
  @RequirePermissions('assessment.manage')
  create(@Body(new ZodPipe(createPracticalAssessmentSchema)) body: z.output<typeof createPracticalAssessmentSchema>) {
    return this.assessments.create(body);
  }

  @Patch(':id')
  @RequirePermissions('assessment.manage')
  update(@Param('id') id: string, @Body(new ZodPipe(updatePracticalAssessmentSchema)) body: z.output<typeof updatePracticalAssessmentSchema>) {
    return this.assessments.update(id, body);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  publish(@Param('id') id: string) {
    return this.assessments.publish(id);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  unpublish(@Param('id') id: string) {
    return this.assessments.unpublish(id);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  close(@Param('id') id: string) {
    return this.assessments.close(id);
  }

  @Post(':id/release')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  release(@Param('id') id: string, @Body(new ZodPipe(z.object({ released: z.boolean() }))) body: { released: boolean }) {
    return this.assessments.release(id, body.released);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('assessment.manage')
  async remove(@Param('id') id: string) {
    await this.assessments.remove(id);
  }

  @Get(':id/results')
  @RequirePermissions('assessment.read')
  results(@Param('id') id: string) {
    return this.assessments.results(id);
  }

  @Get(':id/results.csv')
  @RequirePermissions('assessment.read')
  @Header('content-type', 'text/csv; charset=utf-8')
  csv(@Param('id') id: string) {
    return this.assessments.csv(id);
  }

  /** What sending to the score sheet would do: new marks, unchanged ones and conflicts with marks already there. */
  @Get(':id/scores/preview')
  @RequirePermissions('assessment.manage')
  scoresPreview(@Param('id') id: string) {
    return this.assessments.scoresPreview(id);
  }

  @Post(':id/scores')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sendScores(@Param('id') id: string, @Body(new ZodPipe(cbtSendScoresSchema)) body: z.output<typeof cbtSendScoresSchema>) {
    return this.assessments.sendScores(id, body.overwriteStudentIds);
  }
}

/** Practical tests for the signed-in student: the list, and starting (or returning to) their one sitting in the virtual lab. */
@Controller('learning/practical-tests')
@RequirePermissions('learning.use')
export class MyPracticalTestsController {
  constructor(private readonly assessments: PracticalAssessmentsService) {}

  @Get()
  mine() {
    return this.assessments.mine();
  }

  @Post(':id/start')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  start(@Param('id') id: string, @Body(new ZodPipe(practicalAssessmentStartSchema)) body: PracticalAssessmentStartInput) {
    return this.assessments.start(id, body.accessCode);
  }
}
