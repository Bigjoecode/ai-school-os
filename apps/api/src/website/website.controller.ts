import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import {
  MESSAGE_STATUSES,
  albumSchema,
  downloadSchema,
  photoSchema,
  postSchema,
  resultCodesSchema,
  websiteDraftRequestSchema,
  websiteSettingsSchema,
  websiteTeacherSchema,
  type AiText,
  type PostCategory,
  type PostInput,
  type ResultCodeRow,
  type WebsiteMessageRow,
  type WebsiteMessageStatus,
  type WebsiteOverview,
  type WebsitePostRow,
  type WebsiteSettings,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { draftPrompt, draftSchemas } from './prompts';
import { WebsiteService, eventView, resultCode, slugify } from './website.service';

/** The website builder: content, news, gallery, downloads, teachers, events, inbox and result codes. */
@Controller('website')
export class WebsiteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly site: WebsiteService,
    private readonly gateway: AiGatewayService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  private async tenant() {
    return this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { slug: true, name: true, websiteSettings: true, domains: { select: { hostname: true, kind: true } } } });
  }

  // ---------------------------------------------------------- overview & settings

  @Get()
  @RequirePermissions('website.manage')
  async overview(): Promise<WebsiteOverview> {
    const db = this.prisma.db;
    const t = await this.tenant();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [posts, published, albums, photos, downloads, teachers, events, messages, applications] = await Promise.all([
      db.websitePost.count(),
      db.websitePost.count({ where: { status: 'PUBLISHED' } }),
      db.websiteAlbum.count(),
      db.websitePhoto.count(),
      db.websiteDownload.count(),
      db.staff.count({ where: { showOnWebsite: true, status: { not: 'EXITED' } } }),
      db.schoolEvent.count({ where: { showOnWebsite: true } }),
      db.websiteMessage.count({ where: { status: 'NEW' } }),
      db.enquiry.count({ where: { source: 'WEBSITE', createdAt: { gte: monthStart } } }),
    ]);
    return {
      slug: t.slug,
      publicUrl: `/s/${t.slug}`,
      settings: this.site.settingsOf(t.websiteSettings),
      counts: { posts, published, albums, photos, downloads, teachersShown: teachers, eventsShown: events, newMessages: messages, applicationsThisMonth: applications },
      domains: t.domains,
    };
  }

  @Put('settings')
  @RequirePermissions('website.manage')
  async settings(@Body(new ZodPipe(websiteSettingsSchema)) body: WebsiteSettings): Promise<WebsiteSettings> {
    const before = this.site.settingsOf((await this.tenant()).websiteSettings);
    await this.prisma.root.tenant.update({ where: { id: currentTenantId() }, data: { websiteSettings: body as unknown as Prisma.InputJsonValue } });
    await this.audit.log({
      action: before.published !== body.published ? (body.published ? 'website.published' : 'website.unpublished') : 'website.updated',
      summary: before.published !== body.published ? (body.published ? 'Published the school website' : 'Took the school website offline') : 'Updated the school website',
    });
    return body;
  }

  /** A short-lived link to see the site before it is published. */
  @Get('preview-link')
  @RequirePermissions('website.manage')
  async preview(): Promise<{ path: string }> {
    const t = await this.tenant();
    const token = await this.jwt.signAsync({ typ: 'site-preview', tid: currentTenantId() }, { expiresIn: '2h' });
    return { path: `/s/${t.slug}?preview=${token}` };
  }

  // ---------------------------------------------------------- news

  private postRow(p: Prisma.WebsitePostGetPayload<object>): WebsitePostRow {
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      category: p.category as PostCategory,
      coverUrl: p.coverUrl,
      publishedAt: (p.publishedAt ?? p.createdAt).toISOString(),
      status: p.status as WebsitePostRow['status'],
      body: p.body,
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private async uniqueSlug(title: string, exceptId?: string) {
    const base = slugify(title);
    for (let i = 1; ; i++) {
      const slug = i === 1 ? base : `${base}-${i}`;
      const clash = await this.prisma.db.websitePost.findFirst({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
      if (!clash) return slug;
    }
  }

  @Get('posts')
  @RequirePermissions('website.manage')
  async posts(): Promise<WebsitePostRow[]> {
    return (await this.prisma.db.websitePost.findMany({ orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }], take: 300 })).map((p) => this.postRow(p));
  }

  private postData(body: PostInput) {
    return {
      title: body.title,
      excerpt: body.excerpt,
      body: body.body,
      category: body.category,
      coverUrl: body.coverUrl,
      status: body.status,
      publishedAt: body.status === 'PUBLISHED' ? (body.publishedAt ? parseDate(body.publishedAt) : new Date()) : body.publishedAt ? parseDate(body.publishedAt) : null,
    };
  }

  @Post('posts')
  @RequirePermissions('website.manage')
  async createPost(@Body(new ZodPipe(postSchema)) body: PostInput): Promise<WebsitePostRow> {
    const p = await this.prisma.db.websitePost.create({ data: { ...this.postData(body), slug: await this.uniqueSlug(body.title), tenantId: currentTenantId(), createdById: currentContext().userId } });
    await this.audit.log({ action: 'website.post', entityType: 'WebsitePost', entityId: p.id, summary: `${p.status === 'PUBLISHED' ? 'Published' : 'Drafted'} the news post "${p.title}"` });
    return this.postRow(p);
  }

  @Put('posts/:id')
  @RequirePermissions('website.manage')
  async updatePost(@Param('id') id: string, @Body(new ZodPipe(postSchema)) body: PostInput): Promise<WebsitePostRow> {
    const before = await this.prisma.db.websitePost.findUniqueOrThrow({ where: { id } });
    // Keep a published post's address stable; drafts follow their title.
    const slug = before.status === 'PUBLISHED' ? before.slug : await this.uniqueSlug(body.title, id);
    const data = this.postData(body);
    if (before.status === 'PUBLISHED' && body.status === 'PUBLISHED' && !body.publishedAt) data.publishedAt = before.publishedAt;
    const p = await this.prisma.db.websitePost.update({ where: { id }, data: { ...data, slug } });
    return this.postRow(p);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  @RequirePermissions('website.manage')
  async deletePost(@Param('id') id: string) {
    const p = await this.prisma.db.websitePost.findUniqueOrThrow({ where: { id } });
    await this.prisma.db.websitePost.delete({ where: { id } });
    await this.audit.log({ action: 'website.post_deleted', entityType: 'WebsitePost', entityId: id, summary: `Deleted the news post "${p.title}"` });
  }

  // ---------------------------------------------------------- gallery

  @Get('albums')
  @RequirePermissions('website.manage')
  async albums() {
    const rows = await this.prisma.db.websiteAlbum.findMany({ include: { photos: { orderBy: { sortOrder: 'asc' } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    return rows.map((a) => ({ id: a.id, title: a.title, description: a.description, date: dateOnly(a.date), published: a.published, photos: a.photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption })) }));
  }

  @Post('albums')
  @RequirePermissions('website.manage')
  async createAlbum(@Body(new ZodPipe(albumSchema)) body: z.infer<typeof albumSchema>) {
    return this.prisma.db.websiteAlbum.create({ data: { ...body, date: body.date ? parseDate(body.date) : null, tenantId: currentTenantId() } });
  }

  @Put('albums/:id')
  @RequirePermissions('website.manage')
  async updateAlbum(@Param('id') id: string, @Body(new ZodPipe(albumSchema)) body: z.infer<typeof albumSchema>) {
    return this.prisma.db.websiteAlbum.update({ where: { id }, data: { ...body, date: body.date ? parseDate(body.date) : null } });
  }

  @Delete('albums/:id')
  @HttpCode(204)
  @RequirePermissions('website.manage')
  async deleteAlbum(@Param('id') id: string) {
    await this.prisma.db.websiteAlbum.delete({ where: { id } });
  }

  @Post('albums/:id/photos')
  @RequirePermissions('website.manage')
  async addPhoto(@Param('id') albumId: string, @Body(new ZodPipe(photoSchema)) body: z.infer<typeof photoSchema>) {
    await this.prisma.db.websiteAlbum.findUniqueOrThrow({ where: { id: albumId } });
    const last = await this.prisma.db.websitePhoto.findFirst({ where: { albumId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    return this.prisma.db.websitePhoto.create({ data: { albumId, url: body.url!, caption: body.caption, sortOrder: (last?.sortOrder ?? 0) + 1, tenantId: currentTenantId() } });
  }

  @Put('photos/:id')
  @RequirePermissions('website.manage')
  async updatePhoto(@Param('id') id: string, @Body(new ZodPipe(z.object({ caption: z.string().trim().max(200).nullable(), sortOrder: z.number().int().optional() }))) body: { caption: string | null; sortOrder?: number }) {
    return this.prisma.db.websitePhoto.update({ where: { id }, data: body });
  }

  @Delete('photos/:id')
  @HttpCode(204)
  @RequirePermissions('website.manage')
  async deletePhoto(@Param('id') id: string) {
    await this.prisma.db.websitePhoto.delete({ where: { id } });
  }

  // ---------------------------------------------------------- downloads

  @Get('downloads')
  @RequirePermissions('website.manage')
  downloads() {
    return this.prisma.db.websiteDownload.findMany({ orderBy: [{ category: 'asc' }, { title: 'asc' }] });
  }

  @Post('downloads')
  @RequirePermissions('website.manage')
  createDownload(@Body(new ZodPipe(downloadSchema)) body: z.infer<typeof downloadSchema>) {
    return this.prisma.db.websiteDownload.create({ data: { ...body, fileUrl: body.fileUrl!, tenantId: currentTenantId() } });
  }

  @Put('downloads/:id')
  @RequirePermissions('website.manage')
  updateDownload(@Param('id') id: string, @Body(new ZodPipe(downloadSchema)) body: z.infer<typeof downloadSchema>) {
    return this.prisma.db.websiteDownload.update({ where: { id }, data: { ...body, fileUrl: body.fileUrl! } });
  }

  @Delete('downloads/:id')
  @HttpCode(204)
  @RequirePermissions('website.manage')
  async deleteDownload(@Param('id') id: string) {
    await this.prisma.db.websiteDownload.delete({ where: { id } });
  }

  // ---------------------------------------------------------- teachers & events shown on the site

  @Get('teachers')
  @RequirePermissions('website.manage')
  async teachers() {
    const rows = await this.prisma.db.staff.findMany({ where: { status: { not: 'EXITED' } }, include: { department: true }, orderBy: [{ type: 'asc' }, { lastName: 'asc' }] });
    return rows.map((s) => ({ id: s.id, name: fullName(s), jobTitle: s.jobTitle, type: s.type, department: s.department?.name ?? null, showOnWebsite: s.showOnWebsite, websiteBio: s.websiteBio, photoUrl: s.photoUrl }));
  }

  @Put('teachers/:id')
  @RequirePermissions('website.manage')
  async updateTeacher(@Param('id') id: string, @Body(new ZodPipe(websiteTeacherSchema)) body: z.infer<typeof websiteTeacherSchema>) {
    const s = await this.prisma.db.staff.update({ where: { id }, data: body });
    return { id: s.id, showOnWebsite: s.showOnWebsite, websiteBio: s.websiteBio, photoUrl: s.photoUrl };
  }

  @Get('events')
  @RequirePermissions('website.manage')
  async events() {
    const since = new Date(Date.now() - 60 * 86_400_000);
    const rows = await this.prisma.db.schoolEvent.findMany({ where: { startDate: { gte: since }, audience: { not: 'STAFF' } }, orderBy: { startDate: 'asc' } });
    return rows.map((e) => ({ id: e.id, showOnWebsite: e.showOnWebsite, audience: e.audience, classSpecific: e.classArmIds.length > 0, ...eventView(e) }));
  }

  @Put('events/:id')
  @RequirePermissions('website.manage')
  async toggleEvent(@Param('id') id: string, @Body(new ZodPipe(z.object({ showOnWebsite: z.boolean() }))) body: { showOnWebsite: boolean }) {
    const e = await this.prisma.db.schoolEvent.findUniqueOrThrow({ where: { id } });
    if (body.showOnWebsite && e.audience === 'STAFF') throw new BadRequestException('Staff-only events stay off the website');
    return this.prisma.db.schoolEvent.update({ where: { id }, data: { showOnWebsite: body.showOnWebsite }, select: { id: true, showOnWebsite: true } });
  }

  // ---------------------------------------------------------- inbox

  @Get('messages')
  @RequirePermissions('website.manage')
  async messages(@Query(new ZodPipe(z.object({ status: z.enum(MESSAGE_STATUSES).optional() }))) q: { status?: WebsiteMessageStatus }): Promise<WebsiteMessageRow[]> {
    const rows = await this.prisma.db.websiteMessage.findMany({ where: q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'desc' }, take: 300 });
    return rows.map((m) => ({ id: m.id, name: m.name, email: m.email, phone: m.phone, subject: m.subject, message: m.message, status: m.status as WebsiteMessageStatus, createdAt: m.createdAt.toISOString() }));
  }

  @Put('messages/:id')
  @RequirePermissions('website.manage')
  async messageStatus(@Param('id') id: string, @Body(new ZodPipe(z.object({ status: z.enum(MESSAGE_STATUSES) }))) body: { status: WebsiteMessageStatus }) {
    return this.prisma.db.websiteMessage.update({ where: { id }, data: { status: body.status }, select: { id: true, status: true } });
  }

  // ---------------------------------------------------------- result codes

  @Get('result-codes')
  @RequirePermissions('website.manage')
  async codes(@Query(new ZodPipe(z.object({ classArmId: z.string().min(1), termId: z.string().min(1) }))) q: { classArmId: string; termId: string }): Promise<ResultCodeRow[]> {
    const students = await this.prisma.db.student.findMany({
      where: { classArmId: q.classArmId, status: 'ACTIVE' },
      include: { resultCodes: { where: { termId: q.termId } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return students.map((s) => ({ studentId: s.id, name: fullName(s), admissionNumber: s.admissionNumber, code: s.resultCodes[0]?.code ?? null, uses: s.resultCodes[0]?.uses ?? 0, maxUses: s.resultCodes[0]?.maxUses ?? 0 }));
  }

  @Post('result-codes')
  @RequirePermissions('website.manage', 'results.read')
  async issueCodes(@Body(new ZodPipe(resultCodesSchema)) body: z.infer<typeof resultCodesSchema>) {
    const created = await this.site.issueCodes(body.classArmId, body.termId, body.maxUses);
    const arm = await this.prisma.db.classArm.findUniqueOrThrow({ where: { id: body.classArmId }, include: { classLevel: true } });
    if (created) await this.audit.log({ action: 'website.result_codes', summary: `Issued ${created} result-checker codes for ${arm.classLevel.name} ${arm.name}` });
    return { created, rows: await this.codes({ classArmId: body.classArmId, termId: body.termId }) };
  }

  /** Replaces one student's code (e.g. a slip was lost); the old code stops working. */
  @Post('result-codes/:studentId/reset')
  @HttpCode(200)
  @RequirePermissions('website.manage')
  async resetCode(@Param('studentId') studentId: string, @Body(new ZodPipe(z.object({ termId: z.string().min(1) }))) body: { termId: string }) {
    const row = await this.prisma.db.resultAccessCode.update({ where: { studentId_termId: { studentId, termId: body.termId } }, data: { code: resultCode(), uses: 0 } });
    return { code: row.code };
  }

  // ---------------------------------------------------------- AI drafts

  @Post('ai/draft')
  @HttpCode(200)
  @RequirePermissions('website.manage', 'ai.use')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async draft(@Body(new ZodPipe(websiteDraftRequestSchema)) body: z.infer<typeof websiteDraftRequestSchema>): Promise<Record<string, unknown> & AiText> {
    const db = this.prisma.db;
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true, motto: true, address: true, websiteSettings: true } });
    const s = this.site.settingsOf(t.websiteSettings);
    const [levels, subjects, students, teachers] = await Promise.all([
      db.classLevel.findMany({ orderBy: { order: 'asc' }, select: { name: true } }),
      db.subject.findMany({ select: { name: true } }),
      db.student.count({ where: { status: 'ACTIVE' } }),
      db.staff.count({ where: { type: 'TEACHING', status: { not: 'EXITED' } } }),
    ]);
    const facts = [
      `Name: ${t.name}${t.motto ? `; motto "${t.motto}"` : ''}${t.address ? `; address ${t.address}` : ''}.`,
      `Classes: ${levels.map((l) => l.name).join(', ')}. Subjects: ${subjects.map((x) => x.name).join(', ')}. About ${students} students and ${teachers} teachers.`,
      s.about.story ? `Current About text: ${s.about.story.slice(0, 1200)}` : '',
      s.about.founded ? `Founded: ${s.about.founded}.` : '',
      `Admissions ${s.admissions.open ? 'open' : 'closed'}.`,
      `BRIEF FROM THE SCHOOL: ${body.brief}`,
    ]
      .filter(Boolean)
      .join('\n');
    const r = await this.gateway.generateJson({ tier: 'standard', system: draftPrompt(body.kind, t.name, facts), messages: [{ role: 'user', content: body.brief }] }, draftSchemas[body.kind] as z.ZodType<Record<string, unknown>>, 'website-draft');
    return { ...(r.data as Record<string, unknown>), text: '', provider: r.provider, model: r.model };
  }
}
