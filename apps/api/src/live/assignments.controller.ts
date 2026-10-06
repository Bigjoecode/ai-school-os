import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Put, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  gradeSubmissionSchema,
  submitHomeworkSchema,
  type HomeworkKind,
  type SubmissionBoard,
  type SubmissionFile,
  type SubmissionRow,
} from '@aischool/shared';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import type { AiImage } from '../ai/providers/provider';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { FilesController } from '../files/files.module';
import { FilesService } from '../files/files.service';
import { SchoolEvidenceService } from '../learning/school-evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { LiveService } from './live.service';

type Sub = Prisma.HomeworkSubmissionGetPayload<{ include: { student: true } }>;

const aiMarkSchema = z.object({
  score: z.number().describe('Marks awarded, from 0 to the maximum'),
  reasons: z.array(z.string()).describe('2–5 short points: what earned marks and what was missing, tied to the marking guide'),
  feedback: z.string().describe('Two or three encouraging sentences to the student on how to improve'),
});

/**
 * Hand-ins for assignments: students submit text, files (photos, videos,
 * audio, documents) and links; teachers see who has and hasn't handed in,
 * mark or return work, and can ask AI for a suggested mark on written
 * answers (including photos of handwritten work), which they confirm.
 * Files are only served to the student, their parents and the class's
 * teachers.
 */
@Controller()
export class AssignmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly live: LiveService,
    private readonly files: FilesService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
    private readonly evidence: SchoolEvidenceService,
  ) {}

  private filesOf(s: { files: Prisma.JsonValue; homeworkId: string }): SubmissionFile[] {
    return ((s.files as unknown as Omit<SubmissionFile, 'url'>[]) ?? []).map((f) => ({ ...f, url: `/api/homework/${s.homeworkId}/files/${f.fileId}` }));
  }

  private row(s: Sub): SubmissionRow {
    return {
      id: s.id,
      student: { id: s.student.id, name: fullName(s.student), admissionNumber: s.student.admissionNumber },
      text: s.text,
      files: this.filesOf(s),
      links: s.links,
      status: s.status as SubmissionRow['status'],
      late: s.late,
      submittedAt: s.submittedAt.toISOString(),
      score: s.score,
      feedback: s.feedback,
      gradedAt: s.gradedAt?.toISOString() ?? null,
      aiSuggestion: s.aiSuggestion as SubmissionRow['aiSuggestion'],
    };
  }

  /** The class's teacher (or a manager) for this assignment. */
  private async mustTeach(homeworkId: string) {
    const h = await this.prisma.db.homework.findUniqueOrThrow({ where: { id: homeworkId } });
    const v = await this.live.viewer();
    const ok = currentContext().permissions.has('homework.manage') && (v.manage || h.createdById === v.userId || h.teacherId === v.staffId || this.live.canHost(v, { teacherId: h.teacherId, classArmId: h.classArmId, subjectId: h.subjectId }));
    if (!ok) throw new ForbiddenException('Only the teacher of this class can see these hand-ins');
    return h;
  }

  /** The signed-in student, if any. */
  private async meStudent() {
    return this.prisma.db.student.findFirst({ where: { userId: currentContext().userId, status: 'ACTIVE' } });
  }

  /** Students the signed-in parent may see. */
  private async myChildIds() {
    const links = await this.prisma.db.studentGuardian.findMany({ where: { guardian: { userId: currentContext().userId } }, select: { studentId: true } });
    return new Set(links.map((l) => l.studentId));
  }

  // ---------------------------------------------------------- teachers

  @Get('homework/:id/submissions')
  @RequirePermissions('homework.manage')
  async board(@Param('id') id: string): Promise<SubmissionBoard> {
    const h = await this.mustTeach(id);
    const [subs, students] = await Promise.all([
      this.prisma.db.homeworkSubmission.findMany({ where: { homeworkId: id }, include: { student: true }, orderBy: { submittedAt: 'asc' } }),
      this.prisma.db.student.findMany({ where: { classArmId: h.classArmId, status: 'ACTIVE' }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    ]);
    const handed = new Set(subs.map((s) => s.studentId));
    return {
      homework: { id: h.id, title: h.title, kind: h.kind as HomeworkKind, maxScore: h.maxScore, dueDate: dateOnly(h.dueDate)!, markingGuide: h.markingGuide },
      submissions: subs.map((s) => this.row(s)),
      missing: students.filter((s) => !handed.has(s.id)).map((s) => ({ id: s.id, name: fullName(s), admissionNumber: s.admissionNumber })),
    };
  }

  @Put('homework/submissions/:id')
  @RequirePermissions('homework.manage')
  async grade(@Param('id') id: string, @Body(new ZodPipe(gradeSubmissionSchema)) body: z.infer<typeof gradeSubmissionSchema>): Promise<SubmissionRow> {
    const sub = await this.prisma.db.homeworkSubmission.findUniqueOrThrow({ where: { id } });
    const h = await this.mustTeach(sub.homeworkId);
    if (body.score !== null && h.maxScore !== null && body.score > h.maxScore) throw new BadRequestException(`The maximum is ${h.maxScore}`);
    const s = await this.prisma.db.homeworkSubmission.update({
      where: { id },
      data: { score: body.score, feedback: body.feedback, status: body.status, gradedById: currentContext().userId, gradedAt: new Date() },
      include: { student: true },
    });
    // Marked work counts towards the homework's topic; re-grading replaces the earlier evidence.
    await this.evidence.syncHomeworkSubmission(s.id);
    // Tell the student and their parents.
    const guardians = await this.prisma.db.studentGuardian.findMany({ where: { studentId: s.studentId }, select: { guardian: { select: { userId: true } } } });
    const userIds = [s.student.userId, ...guardians.map((g) => g.guardian.userId)].filter((x): x is string => !!x);
    const title = body.status === 'RETURNED' ? `"${h.title}" was returned for changes` : `"${h.title}" has been marked`;
    const text = body.status === 'RETURNED' ? (body.feedback ?? 'Please look at it again and hand it in.') : `${body.score !== null ? `Score: ${body.score}${h.maxScore ? `/${h.maxScore}` : ''}. ` : ''}${body.feedback ?? ''}`.trim();
    if (userIds.length) await this.prisma.db.notification.createMany({ data: userIds.map((userId) => ({ tenantId: currentTenantId(), userId, title, body: text.slice(0, 300), link: '/learning' })) });
    return this.row(s);
  }

  /** A suggested mark against the marking guide; the teacher reviews and confirms it. */
  @Post('homework/submissions/:id/ai-mark')
  @HttpCode(200)
  @RequirePermissions('homework.manage', 'ai.use')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async aiMark(@Param('id') id: string): Promise<SubmissionRow> {
    const sub = await this.prisma.db.homeworkSubmission.findUniqueOrThrow({ where: { id }, include: { student: true } });
    const h = await this.mustTeach(sub.homeworkId);
    const outOf = h.maxScore ?? 10;
    const files = this.filesOf(sub);
    const images: AiImage[] = [];
    for (const f of files.filter((x) => x.mimeType.startsWith('image/')).slice(0, 3)) {
      const data = await this.files.read(f.fileId, false);
      images.push({ mediaType: data.mimeType as AiImage['mediaType'], data: data.data.toString('base64') });
    }
    if (!sub.text && !images.length) throw new BadRequestException('There is no written answer or photo to mark. Videos, audio and documents need a person to mark them.');
    const subject = h.subjectId ? (await this.prisma.db.subject.findUnique({ where: { id: h.subjectId } }))?.name : null;
    const r = await this.gateway.generateJson(
      {
        tier: 'standard',
        system: [
          `You help a Nigerian school teacher mark a student's ${subject ?? ''} assignment out of ${outOf}. Mark strictly against the marking guide when one is given; otherwise judge accuracy, completeness and reasoning for the student's level.`,
          'Read handwriting in photos carefully; if part is illegible, say so and don\'t give marks for it. Never invent what the student wrote. The teacher will review your suggestion.',
          `ASSIGNMENT: ${h.title}\nINSTRUCTIONS: ${h.instructions}${h.questions.length ? `\nQUESTIONS:\n${h.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}`,
          h.markingGuide ? `MARKING GUIDE:\n${h.markingGuide}` : 'No marking guide was given.',
        ].join('\n\n'),
        messages: [{ role: 'user', content: `STUDENT'S ANSWER:\n${sub.text ?? '(see the attached photos)'}`, ...(images.length ? { images } : {}) }],
        maxOutputTokens: 800,
      },
      aiMarkSchema,
      'homework-mark',
    );
    const score = Math.max(0, Math.min(outOf, Math.round(r.data.score * 2) / 2));
    const s = await this.prisma.db.homeworkSubmission.update({
      where: { id },
      data: { aiSuggestion: { score, outOf, reasons: r.data.reasons.slice(0, 6), feedback: r.data.feedback } },
      include: { student: true },
    });
    return this.row(s);
  }

  // ---------------------------------------------------------- students

  @Get('learning/homework/:id')
  async myHomework(@Param('id') id: string) {
    const me = await this.meStudent();
    if (!me) throw new ForbiddenException('Only students hand in assignments');
    const h = await this.prisma.db.homework.findFirst({ where: { id, classArmId: me.classArmId ?? '', status: 'PUBLISHED' }, include: { classArm: { include: { classLevel: true } }, subject: true, teacher: true } });
    if (!h) throw new NotFoundException('Assignment not found');
    const school = await this.live.school();
    const sub = await this.prisma.db.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId: id, studentId: me.id } }, include: { student: true } });
    return { homework: { ...this.live.homeworkRow(h, school.today), attachments: this.attachmentsFor(h) }, submission: sub ? this.row(sub) : null };
  }

  private attachmentsFor(h: { id: string; attachments: Prisma.JsonValue }) {
    return ((h.attachments as unknown as { type: 'FILE' | 'LINK'; fileId: string | null; url: string; name: string; mimeType: string | null }[]) ?? []).map((a) => (a.type === 'FILE' && a.fileId ? { ...a, url: `/api/homework/${h.id}/files/${a.fileId}` } : a));
  }

  @Post('learning/homework/:id/submit')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async submit(@Param('id') id: string, @Body(new ZodPipe(submitHomeworkSchema)) body: z.infer<typeof submitHomeworkSchema>): Promise<SubmissionRow> {
    const me = await this.meStudent();
    if (!me) throw new ForbiddenException('Only students hand in assignments');
    const h = await this.prisma.db.homework.findFirst({ where: { id, classArmId: me.classArmId ?? '', status: 'PUBLISHED' } });
    if (!h) throw new NotFoundException('Assignment not found');
    const school = await this.live.school();
    const late = school.today > dateOnly(h.dueDate)!;
    if (late && !h.allowLate) throw new BadRequestException('The deadline has passed and this assignment doesn’t accept late work');
    const existing = await this.prisma.db.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId: id, studentId: me.id } } });
    if (existing?.status === 'GRADED') throw new BadRequestException('This has already been marked');
    if (!body.text && !body.fileIds.length && !body.links.length) throw new BadRequestException('Add your answer, a file or a link');
    // Only the student's own uploads, of the kinds the teacher accepts.
    const fileRows = body.fileIds.length ? await this.prisma.db.fileObject.findMany({ where: { id: { in: body.fileIds }, uploadedById: currentContext().userId } }) : [];
    if (fileRows.length !== body.fileIds.length) throw new BadRequestException('Upload your files again: one was not found');
    const allowed = new Set(h.submissionTypes);
    const kindOf = (m: string) => (m.startsWith('image/') ? 'IMAGE' : m.startsWith('video/') ? 'VIDEO' : m.startsWith('audio/') ? 'AUDIO' : 'DOCUMENT');
    if (allowed.size) {
      const bad = fileRows.find((f) => !allowed.has(kindOf(f.mimeType)));
      if (bad) throw new BadRequestException(`This assignment doesn't take ${kindOf(bad.mimeType).toLowerCase()} files`);
      if (body.links.length && !allowed.has('LINK')) throw new BadRequestException("This assignment doesn't take links");
      if (body.text && !allowed.has('TEXT') && h.kind !== 'QUESTIONS') throw new BadRequestException("This assignment doesn't take a typed answer");
    }
    const files = fileRows.map((f) => ({ fileId: f.id, name: f.filename, mimeType: f.mimeType, sizeBytes: f.sizeBytes }));
    const data = { text: body.text, files: files as unknown as Prisma.InputJsonValue, links: body.links, status: 'SUBMITTED', late, submittedAt: new Date() };
    // A resubmission clears the old suggestion and mark.
    const s = existing
      ? await this.prisma.db.homeworkSubmission.update({ where: { id: existing.id }, data: { ...data, aiSuggestion: Prisma.DbNull, score: null }, include: { student: true } })
      : await this.prisma.db.homeworkSubmission.create({ data: { ...data, tenantId: currentTenantId(), homeworkId: id, studentId: me.id }, include: { student: true } });
    // Handing in again (after it was returned) takes back any mark it counted with.
    if (existing) await this.evidence.syncHomeworkSubmission(s.id);
    return this.row(s);
  }

  // ---------------------------------------------------------- parents

  @Get('family/children/:id/homework')
  @RequirePermissions('family.manage')
  async childHomework(@Param('id') studentId: string) {
    if (!(await this.myChildIds()).has(studentId)) throw new ForbiddenException('You can only see your own children');
    const st = await this.prisma.root.student.findUniqueOrThrow({ where: { id: studentId } });
    const ctx = currentContext();
    const before = ctx.tenantId;
    ctx.tenantId = st.tenantId;
    try {
      const school = await this.live.school();
      const rows = await this.prisma.db.homework.findMany({
        where: { classArmId: st.classArmId ?? '', status: 'PUBLISHED' },
        include: { classArm: { include: { classLevel: true } }, subject: true, teacher: true, submissions: { where: { studentId } } },
        orderBy: { dueDate: 'desc' },
        take: 40,
      });
      return rows.map((h) => {
        const s = h.submissions[0];
        return { ...this.live.homeworkRow(h, school.today), mine: s ? { id: s.id, status: s.status, late: s.late, score: s.score, feedback: s.feedback, submittedAt: s.submittedAt.toISOString(), text: s.text, files: this.filesOf(s), links: s.links } : null };
      });
    } finally {
      ctx.tenantId = before;
    }
  }

  // ---------------------------------------------------------- files

  /**
   * An assignment's files: the teacher's attachments go to the class, its
   * parents and staff; a hand-in's files to that student, their parents and
   * the class's teachers.
   */
  @Get('homework/:id/files/:fileId')
  async file(@Param('id') id: string, @Param('fileId') fileId: string, @Req() req: Request, @Res() res: Response) {
    const h = await this.prisma.db.homework.findUniqueOrThrow({ where: { id } });
    const ctx = currentContext();
    const attachment = ((h.attachments as unknown as { fileId: string | null }[]) ?? []).some((a) => a.fileId === fileId);
    const sub = attachment ? null : await this.prisma.db.homeworkSubmission.findFirst({ where: { homeworkId: id, files: { array_contains: [{ fileId }] } } });
    if (!attachment && !sub) throw new NotFoundException('File not found');
    const staff = ctx.permissions.has('homework.manage') || ctx.permissions.has('school.read');
    let allowed = staff;
    if (!allowed) {
      const me = await this.meStudent();
      const kids = await this.myChildIds();
      if (attachment) {
        allowed = me?.classArmId === h.classArmId || (await this.prisma.db.student.count({ where: { id: { in: [...kids] }, classArmId: h.classArmId } })) > 0;
      } else {
        allowed = me?.id === sub!.studentId || kids.has(sub!.studentId);
      }
    }
    if (!allowed) throw new NotFoundException('File not found');
    new FilesController(this.files).send(res, await this.files.read(fileId, false), false, req);
  }
}
