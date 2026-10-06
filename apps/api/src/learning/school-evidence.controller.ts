import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { PLATFORM_AREAS, type ExamBody, type MasteryEvidenceRow, type SchoolEvidenceBackfill, type SyllabusTopicRow } from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions, RequirePlatformRole } from '../common/decorators';
import { currentTenantId, currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService } from '../student-ai/entitlements.service';
import { SchoolEvidenceService } from './school-evidence.service';

const evidenceQuery = z.object({ topicId: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).optional() });
type EvidenceQuery = z.infer<typeof evidenceQuery>;

/**
 * Where a student's topic mastery came from (school tests, homework,
 * practice, the tutor) for the student, their parents and school staff; the
 * homework topic picker; and the one-off replay of past school work.
 */
@Controller()
export class SchoolEvidenceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly evidence: SchoolEvidenceService,
  ) {}

  /** The signed-in student's own evidence (optionally for one topic). */
  @Get('learning/evidence')
  @RequirePermissions('learning.use')
  async mine(@Query(new ZodPipe(evidenceQuery)) q: EvidenceQuery): Promise<MasteryEvidenceRow[]> {
    return this.evidence.recent(await this.entitlements.me(), q.topicId, q.limit);
  }

  /** A parent's view of one child's evidence. */
  @Get('family/children/:id/evidence')
  @RequirePermissions('family.manage')
  async child(@Param('id') id: string, @Query(new ZodPipe(evidenceQuery)) q: EvidenceQuery): Promise<MasteryEvidenceRow[]> {
    await this.entitlements.assertParentOf(currentUserId(), [id]);
    return this.evidence.recent(id, q.topicId, q.limit);
  }

  /** Staff: a student of this school. */
  @Get('students/:id/mastery-evidence')
  @RequirePermissions('students.read')
  async student(@Param('id') id: string, @Query(new ZodPipe(evidenceQuery)) q: EvidenceQuery): Promise<MasteryEvidenceRow[]> {
    const s = await this.prisma.db.student.findUnique({ where: { id }, select: { id: true } });
    if (!s) throw new NotFoundException('Student not found');
    return this.evidence.recent(s.id, q.topicId, q.limit);
  }

  /** Syllabus topics for a homework's subject and class level. */
  @Get('homework/topics')
  @RequirePermissions('homework.manage')
  async homeworkTopics(@Query(new ZodPipe(z.object({ classArmId: z.string().min(1), subjectId: z.string().min(1) }))) q: { classArmId: string; subjectId: string }): Promise<SyllabusTopicRow[]> {
    const [arm, subject] = await Promise.all([
      this.prisma.db.classArm.findUnique({ where: { id: q.classArmId }, select: { classLevel: { select: { stage: true, name: true } } } }),
      this.prisma.db.subject.findUnique({ where: { id: q.subjectId }, select: { name: true } }),
    ]);
    if (!arm || !subject) throw new BadRequestException('Choose the class and subject first');
    const rows = await this.evidence.homeworkTopics(subject.name, arm.classLevel.stage, arm.classLevel.name);
    return rows.map((t) => ({ id: t.id, subject: t.subject, level: t.level as SyllabusTopicRow['level'], name: t.name, parentId: t.parentId, order: t.order, exams: t.exams as ExamBody[], objectives: t.objectives }));
  }

  /** School admins: replay this school's marked online exams and graded homework into mastery (safe to repeat). */
  @Post('learning/school-evidence/backfill')
  @HttpCode(200)
  @RequirePermissions('academics.manage')
  backfill(): Promise<SchoolEvidenceBackfill> {
    return this.evidence.backfill(currentTenantId());
  }

  /** Platform: the same for one school, or every school. */
  @Post('platform/learning/school-evidence/backfill')
  @HttpCode(200)
  @RequirePlatformRole(...PLATFORM_AREAS.content)
  backfillPlatform(@Body(new ZodPipe(z.object({ tenantId: z.string().min(1).optional() }))) body: { tenantId?: string }): Promise<SchoolEvidenceBackfill> {
    return this.evidence.backfill(body.tenantId ?? null);
  }
}
