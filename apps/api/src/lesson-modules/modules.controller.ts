import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  checkInAiSchema,
  checkInSubmitSchema,
  cueAnswerSchema,
  joinCodeSchema,
  moduleAiDraftSchema,
  moduleBankQuerySchema,
  moduleCopySchema,
  moduleLibraryQuerySchema,
  moduleListQuerySchema,
  modulePublishSchema,
  moduleSchema,
  moduleStepsSchema,
  sessionDecisionSchema,
  sessionHandsSchema,
  sessionOpenSchema,
  sessionStartSchema,
  sessionUpdateSchema,
  workbookQuerySchema,
  type CheckInOutcome,
  type CheckInStart,
  type ChildModules,
  type ClassModulesSummary,
  type ClassroomEngagement,
  type ClassroomSessionView,
  type CueResult,
  type LiveJoin,
  type LiveStudentState,
  type MaterialStreamUrl,
  type ModuleDetail,
  type ModuleOptions,
  type ModuleResults,
  type ModuleSummary,
  type ModuleTopicOption,
  type MyModuleDetail,
  type MyModules,
  type SessionSummary,
  type Workbook,
} from '@aischool/shared';
import { z } from 'zod';
import { Public, RequirePermissions } from '../common/decorators';
import { currentTenantId, RequestContextStore } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { FilesController } from '../files/files.module';
import { FilesService } from '../files/files.service';
import { CheckInService } from './checkin.service';
import { ModulesService } from './modules.service';
import { WorkbookService } from './workbook.service';

type Out<T extends z.ZodType> = z.output<T>;

interface StreamToken {
  typ: 'module-file';
  tid: string;
  fid: string;
}
const STREAM_TTL_SECONDS = 4 * 60 * 60;

/** Lesson modules for teachers and academic leaders: authoring, library, AI drafts, results and the weekly workbook. */
@Controller('modules')
export class ModulesController {
  constructor(
    private readonly modules: ModulesService,
    private readonly workbook: WorkbookService,
    private readonly checkins: CheckInService,
    private readonly files: FilesService,
    private readonly jwt: JwtService,
  ) {}

  @Get('options')
  options(): Promise<ModuleOptions> {
    return this.modules.options();
  }

  @Get('topics')
  topics(@Query(new ZodPipe(z.object({ subjectId: z.string().min(1), classLevelId: z.string().min(1) }))) q: { subjectId: string; classLevelId: string }): Promise<ModuleTopicOption[]> {
    return this.modules.topics(q.subjectId, q.classLevelId);
  }

  @Get()
  list(@Query(new ZodPipe(moduleListQuerySchema)) q: Out<typeof moduleListQuerySchema>): Promise<ModuleSummary[]> {
    return this.modules.list(q);
  }

  @Get('library')
  library(@Query(new ZodPipe(moduleLibraryQuerySchema)) q: Out<typeof moduleLibraryQuerySchema>): Promise<ModuleSummary[]> {
    return this.modules.library(q);
  }

  @Get('workbook')
  week(@Query(new ZodPipe(workbookQuerySchema)) q: Out<typeof workbookQuerySchema>): Promise<Workbook> {
    return this.workbook.workbook(q);
  }

  @Get('class-summary')
  classSummary(@Query(new ZodPipe(z.object({ classArmId: z.string().min(1), subjectId: z.string().min(1) }))) q: { classArmId: string; subjectId: string }): Promise<ClassModulesSummary> {
    return this.modules.classSummary(q.classArmId, q.subjectId);
  }

  /** School leaders: classroom check-ins this week (success dashboard tile). */
  @Get('engagement')
  @RequirePermissions('school.read')
  async engagement(): Promise<ClassroomEngagement> {
    await this.modules.scope();
    return this.workbook.engagement();
  }

  @Get('bank')
  bank(@Query(new ZodPipe(moduleBankQuerySchema)) q: Out<typeof moduleBankQuerySchema>) {
    return this.modules.bank(q);
  }

  @Post('ai/checkin')
  @HttpCode(200)
  @RequirePermissions('ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  aiCheckIn(@Body(new ZodPipe(checkInAiSchema)) body: Out<typeof checkInAiSchema>) {
    return this.modules.aiCheckIn(body);
  }

  @Post('ai/draft')
  @RequirePermissions('ai.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  aiDraft(@Body(new ZodPipe(moduleAiDraftSchema)) body: Out<typeof moduleAiDraftSchema>): Promise<ModuleDetail> {
    return this.modules.aiDraft(body);
  }

  @Post()
  create(@Body(new ZodPipe(moduleSchema)) body: Out<typeof moduleSchema>): Promise<ModuleDetail> {
    return this.modules.create(body);
  }

  /** A short-lived link `<video>` can stream from (it can't send the sign-in header). */
  @Get('stream/:token')
  @Public()
  async stream(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    let p: StreamToken;
    try {
      p = await this.jwt.verifyAsync<StreamToken>(token);
    } catch {
      throw new NotFoundException('This link has expired. Open the lesson again.');
    }
    if (p.typ !== 'module-file') throw new NotFoundException('File not found');
    const ctx = RequestContextStore.get();
    if (ctx) ctx.tenantId = p.tid;
    new FilesController(this.files).send(res, await this.files.read(p.fid, false), false, req);
  }

  @Get(':id')
  async one(@Param('id') id: string): Promise<ModuleDetail> {
    const { s, m } = await this.modules.mustView(id);
    return this.modules.detail(m, s);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body(new ZodPipe(moduleSchema)) body: Out<typeof moduleSchema>): Promise<ModuleDetail> {
    return this.modules.update(id, body);
  }

  @Put(':id/steps')
  steps(@Param('id') id: string, @Body(new ZodPipe(moduleStepsSchema)) body: Out<typeof moduleStepsSchema>): Promise<ModuleDetail> {
    return this.modules.saveSteps(id, body);
  }

  @Patch(':id/publish')
  publish(@Param('id') id: string, @Body(new ZodPipe(modulePublishSchema)) body: Out<typeof modulePublishSchema>): Promise<ModuleDetail> {
    return this.modules.publish(id, body.published, body.notify);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.modules.archive(id);
  }

  @Post(':id/copy')
  copy(@Param('id') id: string, @Body(new ZodPipe(moduleCopySchema)) body: Out<typeof moduleCopySchema>): Promise<ModuleDetail> {
    return this.modules.copy(id, body.classArmId);
  }

  @Post(':id/library')
  toLibrary(@Param('id') id: string): Promise<ModuleDetail> {
    return this.modules.toLibrary(id);
  }

  @Get(':id/results')
  results(@Param('id') id: string): Promise<ModuleResults> {
    return this.workbook.results(id);
  }

  @Get(':id/steps/:stepId/file')
  async file(@Param('id') id: string, @Param('stepId') stepId: string, @Req() req: Request, @Res() res: Response) {
    const { fileId } = await this.checkins.fileOf(id, stepId);
    new FilesController(this.files).send(res, await this.files.read(fileId, false), false, req);
  }

  @Post(':id/steps/:stepId/stream')
  @HttpCode(200)
  async streamUrl(@Param('id') id: string, @Param('stepId') stepId: string): Promise<MaterialStreamUrl> {
    const { fileId } = await this.checkins.fileOf(id, stepId);
    const token = await this.jwt.signAsync({ typ: 'module-file', tid: currentTenantId(), fid: fileId } satisfies StreamToken, { expiresIn: STREAM_TTL_SECONDS });
    return { url: `/api/modules/stream/${token}`, expiresAt: new Date(Date.now() + STREAM_TTL_SECONDS * 1000).toISOString() };
  }
}

/** The student's "My lessons" (self-paced), and a parent's view of a child's modules. */
@Controller('my-lessons')
export class MyLessonsController {
  constructor(private readonly checkins: CheckInService) {}

  @Get()
  @RequirePermissions('learning.use')
  list(): Promise<MyModules> {
    return this.checkins.myModules();
  }

  @Get('child/:studentId')
  child(@Param('studentId') studentId: string): Promise<ChildModules> {
    return this.checkins.child(studentId);
  }

  @Post('attempts/:attemptId/submit')
  @HttpCode(200)
  @RequirePermissions('learning.use')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  submit(@Param('attemptId') attemptId: string, @Body(new ZodPipe(checkInSubmitSchema)) body: Out<typeof checkInSubmitSchema>): Promise<CheckInOutcome> {
    return this.checkins.submit(attemptId, body.answers);
  }

  @Get(':id')
  @RequirePermissions('learning.use')
  one(@Param('id') id: string): Promise<MyModuleDetail> {
    return this.checkins.myModule(id);
  }

  @Post(':id/steps/:stepId/visit')
  @HttpCode(200)
  @RequirePermissions('learning.use')
  visit(@Param('id') id: string, @Param('stepId') stepId: string) {
    return this.checkins.visit(id, stepId);
  }

  @Post(':id/steps/:stepId/complete')
  @HttpCode(200)
  @RequirePermissions('learning.use')
  complete(@Param('id') id: string, @Param('stepId') stepId: string) {
    return this.checkins.completeStep(id, stepId);
  }

  @Post(':id/steps/:stepId/checkin')
  @HttpCode(200)
  @RequirePermissions('learning.use')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  start(@Param('id') id: string, @Param('stepId') stepId: string): Promise<CheckInStart> {
    return this.checkins.startCheckIn(id, stepId);
  }

  @Post(':id/steps/:stepId/cue')
  @HttpCode(200)
  @RequirePermissions('learning.use')
  cue(@Param('id') id: string, @Param('stepId') stepId: string, @Body(new ZodPipe(cueAnswerSchema)) body: Out<typeof cueAnswerSchema>): Promise<CueResult> {
    return this.checkins.cue(id, stepId, body.questionId, body.answer);
  }
}

/** Classroom mode: the teacher's live lesson (join code, live tally, show of hands) and the students' answers. */
@Controller('classroom')
export class ClassroomController {
  constructor(private readonly checkins: CheckInService) {}

  // ---------------------------------------------------------- students

  @Post('join')
  @HttpCode(200)
  @RequirePermissions('learning.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  join(@Body(new ZodPipe(joinCodeSchema)) body: Out<typeof joinCodeSchema>): Promise<LiveJoin> {
    return this.checkins.join(body.code);
  }

  @Get('live/:sessionId')
  @RequirePermissions('learning.use')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  live(@Param('sessionId') sessionId: string): Promise<LiveStudentState> {
    return this.checkins.liveState(sessionId);
  }

  @Post('live/:sessionId/answer')
  @HttpCode(200)
  @RequirePermissions('learning.use')
  answer(@Param('sessionId') sessionId: string, @Body(new ZodPipe(checkInSubmitSchema.extend({ attemptId: z.string().min(1) }))) body: { attemptId: string; answers: Record<string, number | string> }): Promise<CheckInOutcome> {
    return this.checkins.liveAnswer(sessionId, body.attemptId, body.answers);
  }

  // ---------------------------------------------------------- teacher

  @Post('modules/:moduleId/sessions')
  start(@Param('moduleId') moduleId: string, @Body(new ZodPipe(sessionStartSchema)) body: Out<typeof sessionStartSchema>): Promise<{ id: string }> {
    return this.checkins.startSession(moduleId, body.present);
  }

  @Get('sessions')
  sessions(@Query(new ZodPipe(z.object({ moduleId: z.string().optional() }))) q: { moduleId?: string }): Promise<SessionSummary[]> {
    return this.checkins.sessions(q.moduleId);
  }

  /** Polled every couple of seconds by the present view while a check-in is open. */
  @Get('sessions/:id')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  view(@Param('id') id: string): Promise<ClassroomSessionView> {
    return this.checkins.view(id);
  }

  @Patch('sessions/:id')
  update(@Param('id') id: string, @Body(new ZodPipe(sessionUpdateSchema)) body: Out<typeof sessionUpdateSchema>): Promise<ClassroomSessionView> {
    return this.checkins.update(id, body);
  }

  @Post('sessions/:id/open')
  @HttpCode(200)
  open(@Param('id') id: string, @Body(new ZodPipe(sessionOpenSchema)) body: Out<typeof sessionOpenSchema>): Promise<ClassroomSessionView> {
    return this.checkins.open(id, body.stepId);
  }

  @Post('sessions/:id/close')
  @HttpCode(200)
  close(@Param('id') id: string): Promise<ClassroomSessionView> {
    return this.checkins.close(id);
  }

  @Post('sessions/:id/hands')
  @HttpCode(200)
  hands(@Param('id') id: string, @Body(new ZodPipe(sessionHandsSchema)) body: Out<typeof sessionHandsSchema>): Promise<ClassroomSessionView> {
    return this.checkins.hands(id, body);
  }

  @Post('sessions/:id/decision')
  @HttpCode(200)
  decide(@Param('id') id: string, @Body(new ZodPipe(sessionDecisionSchema)) body: Out<typeof sessionDecisionSchema>): Promise<ClassroomSessionView> {
    return this.checkins.decide(id, body.stepId, body.decision);
  }

  @Post('sessions/:id/end')
  @HttpCode(200)
  end(@Param('id') id: string): Promise<ClassroomSessionView> {
    return this.checkins.end(id);
  }
}
