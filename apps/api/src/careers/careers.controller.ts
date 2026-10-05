import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  PLATFORM_AREAS,
  RIASEC,
  TRACKS,
  brochurePreviewSchema,
  careerPlanSchema,
  careerQuizSubmitSchema,
  careerSchema,
  counsellorChatSchema,
  counsellorNotesSchema,
  courseCsvPreviewSchema,
  courseImportSaveSchema,
  courseSchema,
  type CareerPlanState,
  type ParentCareerView,
  type StaffCareerOverview,
  type StaffStudentCareer,
  type Track,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions, RequirePlatformRole } from '../common/decorators';
import { currentContext, currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService } from '../student-ai/entitlements.service';
import { CareerContentService } from './career-content.service';
import { CareersService } from './careers.service';
import { CounsellorService } from './counsellor.service';

const libraryQuery = z.object({
  field: z.string().max(60).optional(),
  track: z.enum(TRACKS).optional(),
  subject: z.string().max(80).optional(),
  search: z.string().max(100).optional(),
  interest: z.enum(RIASEC).optional(),
});

/** The student's own careers area. Everything is scoped to the signed-in student. */
@Controller('careers')
@RequirePermissions('learning.use')
export class CareersController {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly careers: CareersService,
    private readonly counsellor: CounsellorService,
  ) {}

  private me() {
    return this.entitlements.me();
  }

  @Get('home')
  async home() {
    return this.careers.home(await this.me());
  }

  @Get('library')
  async library(@Query(new ZodPipe(libraryQuery)) q: z.infer<typeof libraryQuery>) {
    await this.me();
    return this.careers.library(q);
  }

  @Get('library/:slug')
  async career(@Param('slug') slug: string) {
    return this.careers.detail(await this.me(), slug);
  }

  /** Courses for the target-course picker. */
  @Get('courses')
  async courses(@Query(new ZodPipe(z.object({ search: z.string().max(100).optional() }))) q: { search?: string }) {
    await this.me();
    return this.careers.courseNames(q.search);
  }

  @Get('quiz')
  async quiz() {
    await this.me();
    return this.careers.quiz();
  }

  @Post('quiz')
  @HttpCode(200)
  async submitQuiz(@Body(new ZodPipe(careerQuizSubmitSchema)) body: z.infer<typeof careerQuizSubmitSchema>) {
    return this.careers.submitQuiz(await this.me(), body.answers);
  }

  /** The latest quiz results with matched careers; null before the quiz. */
  @Get('results')
  async results() {
    return { result: await this.careers.quizResults(await this.me()) };
  }

  @Put('saved/:slug')
  async save(@Param('slug') slug: string): Promise<CareerPlanState> {
    return this.careers.setSaved(await this.me(), slug, true);
  }

  @Delete('saved/:slug')
  @HttpCode(200)
  async unsave(@Param('slug') slug: string): Promise<CareerPlanState> {
    return this.careers.setSaved(await this.me(), slug, false);
  }

  @Get('plan')
  async plan() {
    return this.careers.myPlan(await this.me());
  }

  @Put('plan')
  async setPlan(@Body(new ZodPipe(careerPlanSchema)) body: { plannedTrack?: Track | null; targetCourse?: string | null }) {
    return this.careers.setPlan(await this.me(), body);
  }

  @Get('advice')
  async advice() {
    return this.careers.advice(await this.me());
  }

  // ---------------------------------------------------------- AI counsellor

  @Post('counsellor')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async chat(@Body(new ZodPipe(counsellorChatSchema)) body: z.infer<typeof counsellorChatSchema>) {
    return this.counsellor.chat(await this.me(), body);
  }

  @Get('counsellor/conversations')
  async conversations() {
    return this.counsellor.conversations(await this.me());
  }

  @Get('counsellor/conversations/:id')
  async conversation(@Param('id') id: string) {
    return this.counsellor.conversation(await this.me(), id);
  }
}

/** The family portal's Careers tab: a parent's read-only view of a child's careers plan. */
@Controller('portal/students')
export class CareersPortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly careers: CareersService,
  ) {}

  @Get(':id/careers')
  async view(@Param('id') id: string): Promise<ParentCareerView> {
    const ctx = currentContext();
    const db = this.prisma.db;
    let allowed = false;
    if (ctx.permissions.has('family.manage')) {
      allowed = !!(await db.studentGuardian.findFirst({ where: { studentId: id, guardian: { userId: ctx.userId }, student: { status: 'ACTIVE' } }, select: { studentId: true } }));
      if (!allowed) throw new ForbiddenException('You can only see your own children');
    } else if (ctx.permissions.has('learning.use')) {
      allowed = !!(await db.student.findFirst({ where: { id, userId: ctx.userId, status: 'ACTIVE' }, select: { id: true } }));
      if (!allowed) throw new ForbiddenException('You can only see your own records');
    } else {
      throw new ForbiddenException('The portal is for parents and students');
    }
    return this.careers.parentView(id);
  }
}

/**
 * Careers guidance for school staff. Anyone who can read student records
 * (students.read) sees the class overview and each student's careers
 * profile. Counsellor notes are pastoral: they are shown to, and edited by,
 * staff who also hold welfare.read (teachers, guidance counsellors and
 * school leaders by default).
 */
@Controller('careers/staff')
@RequirePermissions('students.read')
export class CareersStaffController {
  constructor(private readonly careers: CareersService) {}

  @Get('overview')
  overview(@Query(new ZodPipe(z.object({ classArmId: z.string().optional() }))) q: { classArmId?: string }): Promise<StaffCareerOverview> {
    return this.careers.staffOverview(q.classArmId);
  }

  @Get('students/:id')
  student(@Param('id') id: string): Promise<StaffStudentCareer> {
    return this.careers.staffStudent(id, currentContext().permissions.has('welfare.read'));
  }

  @Put('students/:id/notes')
  @RequirePermissions('students.read', 'welfare.read')
  notes(@Param('id') id: string, @Body(new ZodPipe(counsellorNotesSchema)) body: { notes: string | null }) {
    return this.careers.setNotes(id, body.notes);
  }
}

/** The console's careers content: the career library, courses and their admission requirements. */
@Controller('platform/careers')
@RequirePlatformRole(...PLATFORM_AREAS.content)
export class CareersContentController {
  constructor(private readonly content: CareerContentService) {}

  @Get('careers')
  careers() {
    return this.content.listCareers();
  }

  @Post('careers')
  createCareer(@Body(new ZodPipe(careerSchema)) body: z.infer<typeof careerSchema>) {
    return this.content.createCareer(body, currentUserId());
  }

  @Put('careers/:id')
  updateCareer(@Param('id') id: string, @Body(new ZodPipe(careerSchema)) body: z.infer<typeof careerSchema>) {
    return this.content.updateCareer(id, body, currentUserId());
  }

  @Delete('careers/:id')
  @HttpCode(204)
  async deleteCareer(@Param('id') id: string) {
    await this.content.deleteCareer(id, currentUserId());
  }

  @Get('courses')
  courses() {
    return this.content.listCourses();
  }

  @Post('courses')
  createCourse(@Body(new ZodPipe(courseSchema)) body: z.infer<typeof courseSchema>) {
    return this.content.createCourse(body, currentUserId());
  }

  @Put('courses/:id')
  updateCourse(@Param('id') id: string, @Body(new ZodPipe(courseSchema)) body: z.infer<typeof courseSchema>) {
    return this.content.updateCourse(id, body, currentUserId());
  }

  @Delete('courses/:id')
  @HttpCode(204)
  async deleteCourse(@Param('id') id: string) {
    await this.content.deleteCourse(id, currentUserId());
  }

  /** CSV of course requirements → rows to review (nothing is saved). */
  @Post('courses/import/preview')
  @HttpCode(200)
  csvPreview(@Body(new ZodPipe(courseCsvPreviewSchema)) body: { csv: string }) {
    return this.content.csvPreview(body.csv);
  }

  /** Saves reviewed CSV rows. */
  @Post('courses/import')
  @HttpCode(200)
  importCourses(@Body(new ZodPipe(courseImportSaveSchema)) body: z.infer<typeof courseImportSaveSchema>) {
    return this.content.importSave(body, currentUserId(), false);
  }

  /** The text of a page range of the JAMB brochure PDF (nothing is stored). */
  @Post('brochure/extract')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 60 * 1024 * 1024, files: 1 } }))
  extract(@UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string } | undefined, @Body() body: { from?: string; to?: string }) {
    const n = (v: unknown) => (typeof v === 'string' && /^\d{1,5}$/.test(v) ? Number(v) : undefined);
    return this.content.brochureExtract(file, { from: n(body?.from), to: n(body?.to) });
  }

  /** AI reads one part of the brochure text into course rows for review. */
  @Post('brochure/preview')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  brochurePreview(@Body(new ZodPipe(brochurePreviewSchema)) body: z.infer<typeof brochurePreviewSchema>) {
    return this.content.brochurePreview(body);
  }

  /** Saves AI-read rows, always unverified, never over a course a person has verified. */
  @Post('brochure/save')
  @HttpCode(200)
  brochureSave(@Body(new ZodPipe(courseImportSaveSchema)) body: z.infer<typeof courseImportSaveSchema>) {
    return this.content.importSave({ ...body, source: 'JAMB_BROCHURE', verified: false, skipVerified: true }, currentUserId(), true);
  }
}
