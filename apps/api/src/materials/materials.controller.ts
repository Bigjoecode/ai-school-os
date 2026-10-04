import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  materialListQuerySchema,
  materialPublishSchema,
  materialSchema,
  youtubeId,
  type MaterialAiDraft,
  type MaterialKind,
  type MaterialLibrary,
  type MaterialOptions,
  type MaterialRow,
  type MaterialStreamUrl,
  type Permission,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma, StudyMaterial } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { Public, RequirePermissions } from '../common/decorators';
import { fullName } from '../common/format';
import { currentContext, currentTenantId, RequestContextStore } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { FilesController } from '../files/files.module';
import { FilesService } from '../files/files.service';
import { extractText } from '../knowledge/extract';
import { PrismaService } from '../prisma/prisma.service';

type Input = z.infer<typeof materialSchema>;
type ListQuery = z.infer<typeof materialListQuerySchema>;

/** Who is editing: managers share with any class; teachers only with the classes and subjects they teach. */
interface Editor {
  userId: string;
  staffId: string | null;
  manageAll: boolean;
  wholeSchool: boolean;
  teaches: Set<string>;
  leads: Set<string>;
}

interface StreamToken {
  typ: 'material-file';
  tid: string;
  mid: string;
  staff: boolean;
}

const STREAM_TTL_SECONDS = 4 * 60 * 60;
const OFFICE_OR_PDF = /^application\/(pdf|vnd\.openxmlformats-officedocument\.)/;

const summarySchema = z.object({
  title: z.string().describe('A short title for the revision notes, e.g. "Photosynthesis: revision notes"'),
  notes: z.string().describe('The revision notes in simple markdown: ## headings, bullet points, **key terms** in bold, a short "Remember" list at the end'),
});

const questionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().describe('The question, answerable from the material alone'),
        options: z.array(z.string()).describe('Exactly four answer options, without letters'),
        answer: z.string().describe('The correct option, copied exactly from the options'),
        explanation: z.string().describe('One or two sentences on why it is right'),
      }),
    )
    .describe('Exactly five multiple-choice questions'),
});

/**
 * Study materials: teachers share notes, documents, slides, videos, audio,
 * pictures and links with the classes they teach (managers with any class
 * or the whole school). Students see their class's materials and parents
 * their children's; files are only served after that check.
 */
@Controller('materials')
export class MaterialsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
  ) {}

  // ---------------------------------------------------------- who

  private has(...perms: Permission[]) {
    const p = currentContext().permissions;
    return perms.some((x) => p.has(x));
  }

  /** Staff who can share materials; throws for everyone else. */
  private async editor(): Promise<Editor> {
    const ctx = currentContext();
    const manageAll = this.has('academics.manage', 'curriculum.manage');
    if (!manageAll && !this.has('homework.manage')) throw new ForbiddenException('Only teachers and academic staff can share study materials');
    const staff = await this.prisma.db.staff.findFirst({ where: { userId: ctx.userId }, include: { classSubjects: { select: { classArmId: true, subjectId: true } }, classesLed: { select: { id: true } } } });
    return {
      userId: ctx.userId!,
      staffId: staff?.id ?? null,
      manageAll,
      wholeSchool: this.has('academics.manage'),
      teaches: new Set(staff?.classSubjects.map((c) => `${c.classArmId}|${c.subjectId}`) ?? []),
      leads: new Set(staff?.classesLed.map((c) => c.id) ?? []),
    };
  }

  private isStaff() {
    return this.has('school.read', 'homework.manage', 'curriculum.manage', 'academics.manage');
  }

  private canEdit(e: Editor, m: StudyMaterial) {
    return e.manageAll || m.createdById === e.userId;
  }

  private teachesArm(e: Editor, armId: string, subjectId: string | null) {
    return e.leads.has(armId) || (!!subjectId && e.teaches.has(`${armId}|${subjectId}`));
  }

  /** The children (parents) or the student themself, who may open family materials. */
  private async familyIds(): Promise<{ role: 'PARENT' | 'STUDENT'; ids: string[] } | null> {
    const ctx = currentContext();
    if (ctx.permissions.has('family.manage')) {
      const links = await this.prisma.db.studentGuardian.findMany({ where: { guardian: { userId: ctx.userId }, student: { status: 'ACTIVE' } }, select: { studentId: true } });
      return { role: 'PARENT', ids: links.map((l) => l.studentId) };
    }
    if (ctx.permissions.has('learning.use')) {
      const me = await this.prisma.db.student.findFirst({ where: { userId: ctx.userId, status: 'ACTIVE' }, select: { id: true } });
      if (me) return { role: 'STUDENT', ids: [me.id] };
    }
    return null;
  }

  /** Materials a student's class can see: theirs, their level's, or the whole school's. */
  private reachFilter(arm: { id: string; classLevelId: string } | null): Prisma.StudyMaterialWhereInput {
    return {
      OR: [
        { classArmIds: { isEmpty: true }, classLevelIds: { isEmpty: true } },
        ...(arm ? [{ classArmIds: { has: arm.id } }, { classLevelIds: { has: arm.classLevelId } }] : []),
      ],
    };
  }

  /** Staff of the school, or the student / a parent of a student the (published) material reaches. */
  private async mustSee(id: string): Promise<{ m: StudyMaterial; staff: boolean }> {
    const m = await this.prisma.db.studyMaterial.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Material not found');
    if (this.isStaff()) {
      if (!m.published && !this.has('academics.manage', 'curriculum.manage') && m.createdById !== currentContext().userId) throw new NotFoundException('Material not found');
      return { m, staff: true };
    }
    const fam = await this.familyIds();
    if (!m.published || !fam?.ids.length) throw new NotFoundException('Material not found');
    const students = await this.prisma.db.student.findMany({ where: { id: { in: fam.ids } }, select: { classArm: { select: { id: true, classLevelId: true } } } });
    const whole = !m.classArmIds.length && !m.classLevelIds.length;
    const ok = whole || students.some((s) => s.classArm && (m.classArmIds.includes(s.classArm.id) || m.classLevelIds.includes(s.classArm.classLevelId)));
    if (!ok) throw new NotFoundException('Material not found');
    return { m, staff: false };
  }

  // ---------------------------------------------------------- rows

  private async rows(list: StudyMaterial[], e: Editor | null): Promise<MaterialRow[]> {
    const db = this.prisma.db;
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const [subjects, levels, arms, terms, files, users] = await Promise.all([
      db.subject.findMany({ where: { id: { in: uniq(list.map((m) => m.subjectId)) } }, select: { id: true, name: true } }),
      db.classLevel.findMany({ where: { id: { in: uniq(list.flatMap((m) => m.classLevelIds)) } }, select: { id: true, name: true, order: true } }),
      db.classArm.findMany({ where: { id: { in: uniq(list.flatMap((m) => m.classArmIds)) } }, select: { id: true, name: true, classLevel: { select: { name: true, order: true } } } }),
      db.term.findMany({ where: { id: { in: uniq(list.map((m) => m.termId)) } }, select: { id: true, name: true, session: { select: { name: true } } } }),
      db.fileObject.findMany({ where: { id: { in: uniq(list.map((m) => m.fileId)) } }, select: { id: true, filename: true, mimeType: true, sizeBytes: true } }),
      this.prisma.root.user.findMany({ where: { id: { in: uniq(list.map((m) => m.createdById)) } }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const by = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const [S, L, A, T, F, U] = [by(subjects), by(levels), by(arms), by(terms), by(files), by(users)];
    return list.map((m) => {
      const f = m.fileId ? F.get(m.fileId) : null;
      const t = m.termId ? T.get(m.termId) : null;
      const u = m.createdById ? U.get(m.createdById) : null;
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        kind: m.kind as MaterialKind,
        subject: (m.subjectId && S.get(m.subjectId)) || null,
        classLevels: m.classLevelIds
          .map((id) => L.get(id))
          .filter((x) => !!x)
          .sort((a, b) => a.order - b.order)
          .map((l) => ({ id: l.id, name: l.name })),
        classArms: m.classArmIds
          .map((id) => A.get(id))
          .filter((x) => !!x)
          .sort((a, b) => a.classLevel.order - b.classLevel.order || a.name.localeCompare(b.name))
          .map((a) => ({ id: a.id, name: `${a.classLevel.name} ${a.name}`.trim() })),
        wholeSchool: !m.classArmIds.length && !m.classLevelIds.length,
        term: t ? { id: t.id, name: `${t.name}, ${t.session.name}` } : null,
        topic: m.topic,
        file: f ? { id: f.id, name: f.filename, mimeType: f.mimeType, sizeBytes: f.sizeBytes } : null,
        url: m.url,
        youtubeId: youtubeId(m.url),
        body: m.body,
        published: m.published,
        views: m.views,
        createdBy: u ? fullName(u) : null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
        canEdit: e ? this.canEdit(e, m) : false,
      };
    });
  }

  // ---------------------------------------------------------- staff

  @Get('options')
  async options(): Promise<MaterialOptions> {
    const e = await this.editor();
    const db = this.prisma.db;
    const [levels, subjects, sessions] = await Promise.all([
      db.classLevel.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true, arms: { orderBy: { name: 'asc' }, select: { id: true, name: true } } } }),
      db.subject.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      db.academicSession.findMany({ orderBy: { startsOn: 'desc' }, take: 3, select: { name: true, terms: { orderBy: { order: 'asc' }, select: { id: true, name: true, isCurrent: true } } } }),
    ]);
    return {
      manageAll: e.manageAll,
      wholeSchool: e.wholeSchool,
      aiEnabled: this.has('ai.use'),
      levels,
      subjects,
      terms: sessions.flatMap((s) => s.terms.map((t) => ({ ...t, sessionName: s.name }))),
      teaches: [...e.teaches].map((k) => ({ classArmId: k.split('|')[0]!, subjectId: k.split('|')[1]! })),
      leads: [...e.leads],
    };
  }

  @Get()
  async list(@Query(new ZodPipe(materialListQuerySchema)) q: ListQuery): Promise<MaterialRow[]> {
    const e = await this.editor();
    const and: Prisma.StudyMaterialWhereInput[] = [];
    // Drafts are private to whoever is writing them (and managers).
    if (!e.manageAll) and.push({ OR: [{ published: true }, { createdById: e.userId }] });
    if (q.mine) and.push({ createdById: e.userId });
    if (q.subjectId) and.push({ subjectId: q.subjectId });
    if (q.kind) and.push({ kind: q.kind });
    if (q.termId) and.push({ termId: q.termId });
    if (q.classArmId) {
      const arm = await this.prisma.db.classArm.findUnique({ where: { id: q.classArmId }, select: { id: true, classLevelId: true } });
      and.push(this.reachFilter(arm));
    } else if (q.classLevelId) {
      const arms = await this.prisma.db.classArm.findMany({ where: { classLevelId: q.classLevelId }, select: { id: true } });
      and.push({ OR: [{ classLevelIds: { has: q.classLevelId } }, { classArmIds: { hasSome: arms.map((a) => a.id) } }, { classArmIds: { isEmpty: true }, classLevelIds: { isEmpty: true } }] });
    }
    if (q.q) and.push({ OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }, { topic: { contains: q.q, mode: 'insensitive' } }] });
    const list = await this.prisma.db.studyMaterial.findMany({ where: { AND: and }, orderBy: { updatedAt: 'desc' }, take: 500 });
    return this.rows(list, e);
  }

  /** Checks the targets, subject, term and file, and returns the data to save. */
  private async prepare(e: Editor, body: Input, before?: StudyMaterial) {
    const db = this.prisma.db;
    const levelIds = [...new Set(body.classLevelIds)];
    const armIds = [...new Set(body.classArmIds)];
    const [levels, arms] = await Promise.all([
      levelIds.length ? db.classLevel.findMany({ where: { id: { in: levelIds } }, select: { id: true, name: true, arms: { select: { id: true } } } }) : [],
      armIds.length ? db.classArm.findMany({ where: { id: { in: armIds } }, select: { id: true } }) : [],
    ]);
    if (levels.length !== levelIds.length || arms.length !== armIds.length) throw new BadRequestException('One of the classes was not found');
    if (body.subjectId && !(await db.subject.findUnique({ where: { id: body.subjectId } }))) throw new BadRequestException('Subject not found');
    if (body.termId && !(await db.term.findUnique({ where: { id: body.termId } }))) throw new BadRequestException('Term not found');

    if (!levelIds.length && !armIds.length && !e.wholeSchool) throw new ForbiddenException('Choose the classes to share it with. Only academic managers can share with the whole school.');
    if (!e.manageAll) {
      if (!e.staffId) throw new ForbiddenException('Your account isn’t linked to a staff record, so it has no classes');
      const notArm = armIds.find((a) => !this.teachesArm(e, a, body.subjectId));
      if (notArm) throw new ForbiddenException(body.subjectId ? 'You can only share materials with classes you teach this subject in' : 'Choose the subject: you can only share materials for subjects you teach (or with the class you lead)');
      const notLevel = levels.find((l) => !l.arms.length || l.arms.some((a) => !this.teachesArm(e, a.id, body.subjectId)));
      if (notLevel) throw new ForbiddenException(`You don’t teach every ${notLevel.name} class${body.subjectId ? ' this subject' : ''}; choose the classes you teach instead`);
    }

    // The file: one already uploaded to this school, by this person or by staff.
    let file: { id: string; mimeType: string; sizeBytes: number } | null = null;
    const usesFile = !['NOTE', 'LINK'].includes(body.kind);
    if (usesFile && body.fileId) {
      const f = await db.fileObject.findUnique({ where: { id: body.fileId } });
      if (!f) throw new BadRequestException('Upload the file again: it was not found');
      if (body.fileId !== before?.fileId && f.uploadedById !== e.userId) {
        const family = f.uploadedById ? (await db.student.count({ where: { userId: f.uploadedById } })) + (await db.guardian.count({ where: { userId: f.uploadedById } })) : 1;
        if (family) throw new BadRequestException('Upload the file yourself to share it');
      }
      const m = f.mimeType;
      const fits =
        body.kind === 'VIDEO' ? m.startsWith('video/') : body.kind === 'AUDIO' ? m.startsWith('audio/') : body.kind === 'IMAGE' ? m.startsWith('image/') : OFFICE_OR_PDF.test(m);
      if (!fits) throw new BadRequestException(`That file isn’t ${body.kind === 'IMAGE' ? 'a picture' : body.kind === 'DOCUMENT' || body.kind === 'SLIDES' ? 'a PDF, Word, Excel or PowerPoint file' : `${body.kind === 'AUDIO' ? 'an audio' : 'a video'} file`}`);
      file = { id: f.id, mimeType: f.mimeType, sizeBytes: f.sizeBytes };
    }
    const url = body.kind === 'NOTE' ? null : file ? null : body.url;
    if (usesFile && !file && !url) throw new BadRequestException(body.kind === 'VIDEO' ? 'Upload a video or paste a YouTube link' : 'Upload the file');

    return {
      title: body.title,
      description: body.description,
      kind: body.kind,
      subjectId: body.subjectId,
      classLevelIds: levelIds,
      classArmIds: armIds,
      termId: body.termId,
      topic: body.topic,
      fileId: file?.id ?? null,
      mimeType: file?.mimeType ?? null,
      sizeBytes: file?.sizeBytes ?? null,
      url,
      body: body.body,
      published: body.published,
    };
  }

  @Post()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async create(@Body(new ZodPipe(materialSchema)) body: Input): Promise<MaterialRow> {
    const e = await this.editor();
    const data = await this.prepare(e, body);
    const m = await this.prisma.db.studyMaterial.create({ data: { ...data, tenantId: currentTenantId(), createdById: e.userId } });
    if (m.published && body.notify) await this.notify(m);
    await this.audit.log({ action: 'materials.created', entityType: 'StudyMaterial', entityId: m.id, summary: `${m.published ? 'Shared' : 'Drafted'} the study material "${m.title}"` });
    return (await this.rows([m], e))[0]!;
  }

  @Get('library')
  async library(@Query(new ZodPipe(z.object({ studentId: z.string().optional() }))) q: { studentId?: string }): Promise<MaterialLibrary> {
    const fam = await this.familyIds();
    if (!fam) throw new ForbiddenException('The library is for students and parents');
    const studentId = q.studentId ?? fam.ids[0];
    if (!studentId || !fam.ids.includes(studentId)) throw new ForbiddenException(fam.role === 'PARENT' ? 'You can only see your own children' : 'You can only see your own materials');
    const s = await this.prisma.db.student.findUniqueOrThrow({ where: { id: studentId }, include: { classArm: { include: { classLevel: true } } } });
    const list = await this.prisma.db.studyMaterial.findMany({
      where: { published: true, ...this.reachFilter(s.classArm ? { id: s.classArm.id, classLevelId: s.classArm.classLevelId } : null) },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const rows = await this.rows(list, null);
    const groups = new Map<string, MaterialLibrary['sections'][number]>();
    for (const r of rows) {
      const key = r.subject?.id ?? '';
      if (!groups.has(key)) groups.set(key, { subject: r.subject, materials: [] });
      groups.get(key)!.materials.push(r);
    }
    const sections = [...groups.values()].sort((a, b) => (!a.subject ? 1 : !b.subject ? -1 : a.subject.name.localeCompare(b.subject.name)));
    for (const sec of sections) sec.materials.sort((a, b) => (a.topic ?? '￿').localeCompare(b.topic ?? '￿') || b.createdAt.localeCompare(a.createdAt));
    return {
      student: { id: s.id, name: fullName(s), firstName: s.firstName, className: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}`.trim() : null },
      sections,
      total: rows.length,
    };
  }

  /** A public link for `<video>` / `<audio>` (they can't send the sign-in header), valid for a few hours. */
  @Get('stream/:token')
  @Public()
  async stream(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    let p: StreamToken;
    try {
      p = await this.jwt.verifyAsync<StreamToken>(token);
    } catch {
      throw new NotFoundException('This link has expired. Open the material again.');
    }
    if (p.typ !== 'material-file') throw new NotFoundException('File not found');
    const m = await this.prisma.root.studyMaterial.findFirst({ where: { id: p.mid, tenantId: p.tid } });
    if (!m?.fileId || (!p.staff && !m.published)) throw new NotFoundException('File not found');
    const ctx = RequestContextStore.get();
    if (ctx) ctx.tenantId = p.tid;
    new FilesController(this.files).send(res, await this.files.read(m.fileId, false), false, req);
  }

  @Get(':id')
  async one(@Param('id') id: string): Promise<MaterialRow> {
    const { m, staff } = await this.mustSee(id);
    return (await this.rows([m], staff && this.has('homework.manage', 'academics.manage', 'curriculum.manage') ? await this.editor() : null))[0]!;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body(new ZodPipe(materialSchema)) body: Input): Promise<MaterialRow> {
    const e = await this.editor();
    const before = await this.prisma.db.studyMaterial.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Material not found');
    if (!this.canEdit(e, before)) throw new ForbiddenException('Only the teacher who shared it (or an academic manager) can change it');
    const data = await this.prepare(e, body, before);
    const m = await this.prisma.db.studyMaterial.update({ where: { id }, data });
    if (m.published && !before.published && body.notify) await this.notify(m);
    await this.audit.log({ action: 'materials.updated', entityType: 'StudyMaterial', entityId: id, summary: `Updated the study material "${m.title}"` });
    return (await this.rows([m], e))[0]!;
  }

  @Patch(':id/publish')
  async publish(@Param('id') id: string, @Body(new ZodPipe(materialPublishSchema)) body: z.infer<typeof materialPublishSchema>): Promise<MaterialRow> {
    const e = await this.editor();
    const before = await this.prisma.db.studyMaterial.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Material not found');
    if (!this.canEdit(e, before)) throw new ForbiddenException('Only the teacher who shared it (or an academic manager) can change it');
    const m = await this.prisma.db.studyMaterial.update({ where: { id }, data: { published: body.published } });
    if (m.published && !before.published && body.notify) await this.notify(m);
    await this.audit.log({ action: body.published ? 'materials.published' : 'materials.unpublished', entityType: 'StudyMaterial', entityId: id, summary: `${body.published ? 'Published' : 'Hid'} the study material "${m.title}"` });
    return (await this.rows([m], e))[0]!;
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    const e = await this.editor();
    const m = await this.prisma.db.studyMaterial.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Material not found');
    if (!this.canEdit(e, m)) throw new ForbiddenException('Only the teacher who shared it (or an academic manager) can delete it');
    await this.prisma.db.studyMaterial.delete({ where: { id } });
    await this.audit.log({ action: 'materials.deleted', entityType: 'StudyMaterial', entityId: id, summary: `Deleted the study material "${m.title}"` });
  }

  // ---------------------------------------------------------- opening

  /** Counts an opening by a student or parent (staff previews don't count). */
  @Post(':id/view')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async view(@Param('id') id: string): Promise<{ views: number }> {
    const { m, staff } = await this.mustSee(id);
    if (staff) return { views: m.views };
    const r = await this.prisma.db.studyMaterial.update({ where: { id }, data: { views: { increment: 1 } }, select: { views: true } });
    return r;
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { m } = await this.mustSee(id);
    if (!m.fileId) throw new NotFoundException('This material has no file');
    new FilesController(this.files).send(res, await this.files.read(m.fileId, false), false, req);
  }

  @Post(':id/stream')
  @HttpCode(200)
  async streamUrl(@Param('id') id: string): Promise<MaterialStreamUrl> {
    const { m, staff } = await this.mustSee(id);
    if (!m.fileId) throw new NotFoundException('This material has no file');
    const token = await this.jwt.signAsync({ typ: 'material-file', tid: currentTenantId(), mid: m.id, staff } satisfies StreamToken, { expiresIn: STREAM_TTL_SECONDS });
    return { url: `/api/materials/stream/${token}`, expiresAt: new Date(Date.now() + STREAM_TTL_SECONDS * 1000).toISOString() };
  }

  // ---------------------------------------------------------- AI

  /** The words of a note, PDF or Word document, for the AI to work from. */
  private async textOf(m: StudyMaterial): Promise<string> {
    let text = '';
    if (m.kind === 'NOTE') text = m.body ?? '';
    else if ((m.kind === 'DOCUMENT' || m.kind === 'SLIDES') && m.fileId) {
      const f = await this.files.read(m.fileId, false);
      if (f.mimeType !== 'application/pdf' && !f.mimeType.includes('wordprocessingml')) throw new BadRequestException('The AI can read written notes, PDFs and Word documents. Save slides as a PDF to use this.');
      text = await extractText(f.data, f.mimeType).catch(() => '');
    } else throw new BadRequestException('The AI can read written notes, PDFs and Word documents');
    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < (m.kind === 'NOTE' ? 60 : 150)) throw new BadRequestException(m.kind === 'NOTE' ? 'The note is too short to work from' : 'There isn’t enough text to work from. Scanned pages have no text the AI can read.');
    return text.slice(0, 40_000);
  }

  private async aiContext(id: string) {
    await this.editor();
    const { m } = await this.mustSee(id);
    const [text, subject, levels] = await Promise.all([
      this.textOf(m),
      m.subjectId ? this.prisma.db.subject.findUnique({ where: { id: m.subjectId }, select: { name: true } }) : null,
      this.prisma.db.classLevel.findMany({ where: { id: { in: m.classLevelIds } }, select: { name: true } }),
    ]);
    const arms = await this.prisma.db.classArm.findMany({ where: { id: { in: m.classArmIds } }, select: { classLevel: { select: { name: true } } } });
    const forWho = [...new Set([...levels.map((l) => l.name), ...arms.map((a) => a.classLevel.name)])].join(', ');
    const about = `${subject ? `${subject.name} ` : ''}material "${m.title}"${m.topic ? ` on ${m.topic}` : ''}${forWho ? ` for ${forWho} students` : ''} in a Nigerian school`;
    return { m, text, about };
  }

  @Post(':id/ai/summary')
  @HttpCode(200)
  @RequirePermissions('ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async aiSummary(@Param('id') id: string): Promise<MaterialAiDraft> {
    const { m, text, about } = await this.aiContext(id);
    const r = await this.gateway.generateJson(
      {
        tier: 'standard',
        system: [
          `You turn a teacher's ${about} into clear revision notes for the students. Use British English and simple sentences suited to the students' level.`,
          'Only use what the material says; do not add facts that are not in it. Keep definitions, formulas, dates and worked examples accurate. Aim for one or two screens on a phone.',
        ].join('\n\n'),
        messages: [{ role: 'user', content: `MATERIAL:\n${text}` }],
        maxOutputTokens: 2500,
      },
      summarySchema,
      'materials-summary',
    );
    return { title: r.data.title.slice(0, 160) || `${m.title}: revision notes`, markdown: r.data.notes.trim() };
  }

  @Post(':id/ai/questions')
  @HttpCode(200)
  @RequirePermissions('ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async aiQuestions(@Param('id') id: string): Promise<MaterialAiDraft> {
    const { m, text, about } = await this.aiContext(id);
    const r = await this.gateway.generateJson(
      {
        tier: 'standard',
        system: [
          `You write five multiple-choice practice questions from a teacher's ${about}. Use British English.`,
          'Every question must be answerable from the material alone. Mix recall and understanding. Give four plausible options with exactly one correct answer, and copy the correct option exactly into "answer".',
        ].join('\n\n'),
        messages: [{ role: 'user', content: `MATERIAL:\n${text}` }],
        maxOutputTokens: 2000,
      },
      questionsSchema,
      'materials-questions',
    );
    const questions = r.data.questions
      .slice(0, 5)
      .map((q) => ({ ...q, options: q.options.slice(0, 4) }))
      .filter((q) => q.options.length >= 2);
    const letters = 'ABCD';
    const markdown = [
      ...questions.map((q, i) => `**${i + 1}. ${q.question}**\n\n${q.options.map((o, j) => `- ${letters[j]}. ${o}`).join('\n')}`),
      '## Answers',
      ...questions.map((q, i) => {
        const j = q.options.findIndex((o) => o.trim().toLowerCase() === q.answer.trim().toLowerCase());
        return `${i + 1}. ${j >= 0 ? `${letters[j]}. ` : ''}${q.answer} — ${q.explanation}`;
      }),
    ].join('\n\n');
    return { title: `${m.title}: practice questions`.slice(0, 160), markdown, questions };
  }

  // ---------------------------------------------------------- notifications

  /** Tells the students the material reaches, and their parents, in the app. */
  private async notify(m: StudyMaterial) {
    try {
      const db = this.prisma.db;
      const whole = !m.classArmIds.length && !m.classLevelIds.length;
      const students = await db.student.findMany({
        where: { status: 'ACTIVE', ...(whole ? {} : { OR: [{ classArmId: { in: m.classArmIds } }, { classArm: { classLevelId: { in: m.classLevelIds } } }] }) },
        select: { id: true, userId: true, guardians: { select: { guardian: { select: { userId: true } } } } },
        take: 5000,
      });
      const subject = m.subjectId ? (await db.subject.findUnique({ where: { id: m.subjectId }, select: { name: true } }))?.name : null;
      const title = `New ${subject ? `${subject} ` : ''}study material: ${m.title}`.slice(0, 200);
      const body = (m.description ?? (m.topic ? `Topic: ${m.topic}` : 'Open it in Study materials.')).slice(0, 300);
      const userIds = new Set<string>();
      for (const s of students) {
        if (s.userId) userIds.add(s.userId);
        for (const g of s.guardians) if (g.guardian.userId) userIds.add(g.guardian.userId);
      }
      userIds.delete(currentContext().userId!);
      if (userIds.size) await db.notification.createMany({ data: [...userIds].map((userId) => ({ tenantId: currentTenantId(), userId, title, body, link: '/learning/materials' })) });
    } catch {
      // A failed notification never stops the material being shared.
    }
  }
}
