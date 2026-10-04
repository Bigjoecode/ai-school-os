import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Req, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  applicationFormSchema,
  applicationStatusCheckSchema,
  assistantRequestSchema,
  contactFormSchema,
  formatMoney,
  resultCheckSchema,
  type DownloadCategory,
  type PublicAlbum,
  type PublicApplicationStatus,
  type PublicDownload,
  type PublicEvent,
  type PublicFees,
  type PublicPhoto,
  type PublicPost,
  type PublicResult,
  type PublicSite,
  type PublicTeacher,
} from '@aischool/shared';
import { z } from 'zod';
import { AdmissionsService } from '../admissions/admissions.service';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { Public } from '../common/decorators';
import { dateOnly, fullName, parseDate } from '../common/format';
import { ZodPipe } from '../common/zod.pipe';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenantId } from '../common/request-context';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { assistantPrompt } from './prompts';
import { WebsiteService, eventView, postView } from './website.service';

interface PreviewToken {
  typ: 'site-preview';
  tid: string;
}

/** The public website every school gets. No sign-in; visitors see only what the school publishes. */
@Controller('public')
export class PublicSiteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly site: WebsiteService,
    private readonly files: FilesService,
    private readonly gateway: AiGatewayService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly kb: KnowledgeService,
    private readonly admissions: AdmissionsService,
  ) {}

  private async previewTenant(token?: string): Promise<string | null> {
    if (!token) return null;
    try {
      const p = await this.jwt.verifyAsync<PreviewToken>(token);
      return p.typ === 'site-preview' ? p.tid : null;
    } catch {
      return null;
    }
  }

  /** For a school's own domain: which site lives at this hostname. */
  @Get('site-by-host')
  @Public()
  async byHost(@Query('host') host?: string) {
    const hostname = host?.split(':')[0]?.toLowerCase();
    const d = hostname ? await this.prisma.root.tenantDomain.findUnique({ where: { hostname }, include: { tenant: { select: { slug: true } } } }) : null;
    if (!d || d.kind !== 'WEBSITE') throw new NotFoundException('No school website at this address');
    return { slug: d.tenant.slug };
  }

  @Get('sites/:slug')
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async home(@Param('slug') slug: string, @Query('preview') preview?: string): Promise<PublicSite> {
    return this.site.publicSite(slug, await this.previewTenant(preview));
  }

  @Get('sites/:slug/news')
  @Public()
  async news(@Param('slug') slug: string, @Query('preview') preview?: string, @Query('page') page = '1'): Promise<{ items: PublicPost[]; total: number }> {
    await this.site.siteTenant(slug, await this.previewTenant(preview));
    const p = Math.max(1, Number(page) || 1);
    const where = { status: 'PUBLISHED' };
    const [rows, total] = await Promise.all([this.prisma.db.websitePost.findMany({ where, orderBy: { publishedAt: 'desc' }, skip: (p - 1) * 12, take: 12 }), this.prisma.db.websitePost.count({ where })]);
    return { items: rows.map((r) => postView(r)), total };
  }

  @Get('sites/:slug/news/:post')
  @Public()
  async post(@Param('slug') slug: string, @Param('post') postSlug: string, @Query('preview') preview?: string): Promise<PublicPost> {
    const previewTid = await this.previewTenant(preview);
    await this.site.siteTenant(slug, previewTid);
    const p = await this.prisma.db.websitePost.findFirst({ where: { slug: postSlug, ...(previewTid ? {} : { status: 'PUBLISHED' }) } });
    if (!p) throw new NotFoundException('That news post does not exist');
    return postView(p, true);
  }

  @Get('sites/:slug/events')
  @Public()
  async events(@Param('slug') slug: string, @Query('preview') preview?: string): Promise<PublicEvent[]> {
    const t = await this.site.siteTenant(slug, await this.previewTenant(preview));
    const since = new Date(Date.parse(`${t.today}T00:00:00Z`) - 60 * 86_400_000);
    const rows = await this.prisma.db.schoolEvent.findMany({ where: { showOnWebsite: true, startDate: { gte: since } }, orderBy: { startDate: 'asc' }, take: 100 });
    return rows.map(eventView);
  }

  @Get('sites/:slug/gallery')
  @Public()
  async gallery(@Param('slug') slug: string, @Query('preview') preview?: string): Promise<PublicAlbum[]> {
    await this.site.siteTenant(slug, await this.previewTenant(preview));
    const albums = await this.prisma.db.websiteAlbum.findMany({ where: { published: true }, include: { photos: { orderBy: { sortOrder: 'asc' }, take: 1 }, _count: { select: { photos: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    return albums.map((a) => ({ id: a.id, title: a.title, description: a.description, date: dateOnly(a.date), coverUrl: a.photos[0]?.url ?? null, photos: a._count.photos }));
  }

  @Get('sites/:slug/gallery/:id')
  @Public()
  async album(@Param('slug') slug: string, @Param('id') id: string, @Query('preview') preview?: string): Promise<PublicAlbum & { items: PublicPhoto[] }> {
    await this.site.siteTenant(slug, await this.previewTenant(preview));
    const a = await this.prisma.db.websiteAlbum.findFirst({ where: { id, published: true }, include: { photos: { orderBy: { sortOrder: 'asc' } } } });
    if (!a) throw new NotFoundException('That album does not exist');
    return { id: a.id, title: a.title, description: a.description, date: dateOnly(a.date), coverUrl: a.photos[0]?.url ?? null, photos: a.photos.length, items: a.photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption })) };
  }

  @Get('sites/:slug/teachers')
  @Public()
  async teachers(@Param('slug') slug: string, @Query('preview') preview?: string): Promise<PublicTeacher[]> {
    const t = await this.site.siteTenant(slug, await this.previewTenant(preview));
    if (!t.settings.sections.teachers) return [];
    const rows = await this.prisma.db.staff.findMany({
      where: { showOnWebsite: true, status: { not: 'EXITED' } },
      include: { department: true, classSubjects: { select: { subject: { select: { name: true } } } } },
      orderBy: [{ type: 'asc' }, { lastName: 'asc' }],
    });
    return rows.map((s) => ({
      id: s.id,
      name: fullName(s),
      jobTitle: s.jobTitle,
      department: s.department?.name ?? null,
      bio: s.websiteBio,
      photoUrl: s.photoUrl,
      subjects: [...new Set(s.classSubjects.map((c) => c.subject.name))].sort(),
    }));
  }

  @Get('sites/:slug/downloads')
  @Public()
  async downloads(@Param('slug') slug: string, @Query('preview') preview?: string): Promise<PublicDownload[]> {
    await this.site.siteTenant(slug, await this.previewTenant(preview));
    const rows = await this.prisma.db.websiteDownload.findMany({ where: { published: true, audience: 'PUBLIC' }, orderBy: [{ category: 'asc' }, { title: 'asc' }] });
    return Promise.all(rows.map(async (d) => ({ id: d.id, title: d.title, description: d.description, category: d.category as DownloadCategory, fileUrl: d.fileUrl, sizeBytes: await this.files.sizeOf(d.fileUrl) })));
  }

  @Get('sites/:slug/fees')
  @Public()
  async fees(@Param('slug') slug: string, @Query('preview') preview?: string): Promise<PublicFees> {
    const t = await this.site.siteTenant(slug, await this.previewTenant(preview));
    if (!t.settings.sections.fees) throw new NotFoundException('Fees are not published on this website');
    const db = this.prisma.db;
    const term = await db.term.findFirst({ where: { isCurrent: true } });
    if (!term) throw new NotFoundException('No fee schedule has been published yet');
    const [levels, items] = await Promise.all([db.classLevel.findMany({ orderBy: { order: 'asc' } }), db.feeItem.findMany({ where: { termId: term.id }, orderBy: [{ optional: 'asc' }, { name: 'asc' }] })]);
    return {
      term: term.name,
      currency: t.currency,
      levels: levels.map((l) => {
        const mine = items.filter((f) => !f.classLevelIds.length || f.classLevelIds.includes(l.id));
        return { level: l.name, items: mine.map((f) => ({ name: f.name, amountKobo: f.amountKobo, optional: f.optional })), totalKobo: mine.filter((f) => !f.optional).reduce((n, f) => n + f.amountKobo, 0) };
      }),
    };
  }

  @Post('sites/:slug/contact')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async contact(@Param('slug') slug: string, @Body(new ZodPipe(contactFormSchema)) body: z.infer<typeof contactFormSchema>, @Req() req: Request) {
    const t = await this.site.siteTenant(slug);
    if (!body.email && !body.phone) throw new BadRequestException('Leave an email address or phone number so the school can reply');
    await this.prisma.db.websiteMessage.create({
      data: { tenantId: t.id, name: body.name, email: body.email, phone: body.phone, subject: body.subject, message: body.message, ip: req.ip?.slice(0, 64) },
    });
    return { ok: true, message: 'Thank you — your message has been sent to the school.' };
  }

  /**
   * An online application: becomes an admissions application (source
   * WEBSITE), plus a linked enquiry so the front desk's follow-up list still
   * shows it.
   */
  @Post('sites/:slug/apply')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async apply(@Param('slug') slug: string, @Body(new ZodPipe(applicationFormSchema)) body: z.infer<typeof applicationFormSchema>) {
    const t = await this.site.siteTenant(slug);
    if (!t.settings.admissions.open) throw new BadRequestException('Admissions are closed at the moment — please contact the school');
    const app = await this.admissions.createFromWebsite(body, t.today);
    await this.audit.log({ tenantId: t.id, actorUserId: null, action: 'website.application', entityType: 'AdmissionApplication', entityId: app.id, summary: `Online application ${app.number} from ${body.parentName} for ${body.childName} (${body.classOfInterest})` });
    const fee = app.applicationFeeKobo ? ` An application fee of ${formatMoney(app.applicationFeeKobo, t.currency)} is payable at the school.` : '';
    return {
      ok: true,
      number: app.number,
      message: `Thank you, ${body.parentName.split(' ')[0]}. Your application for ${body.childName} has been received — your application number is ${app.number}. Keep it to check your application's progress on this website; the admissions office will contact you shortly.${fee}`,
    };
  }

  /** "Where is my application?" — the number and the parent's phone must both match. */
  @Post('sites/:slug/application-status')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async applicationStatus(@Param('slug') slug: string, @Body(new ZodPipe(applicationStatusCheckSchema)) body: z.infer<typeof applicationStatusCheckSchema>): Promise<PublicApplicationStatus> {
    await this.site.siteTenant(slug);
    return this.admissions.publicStatus(body.number, body.phone);
  }

  @Post('sites/:slug/results')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  results(@Param('slug') slug: string, @Body(new ZodPipe(resultCheckSchema)) body: z.infer<typeof resultCheckSchema>): Promise<PublicResult> {
    return this.site.checkResult(slug, body.admissionNumber, body.code);
  }

  /** The AI website assistant: answers visitors from the site's own published facts. */
  @Post('sites/:slug/assistant')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async assistant(@Param('slug') slug: string, @Body(new ZodPipe(assistantRequestSchema)) body: z.infer<typeof assistantRequestSchema>) {
    const site = await this.site.publicSite(slug);
    if (!site.settings.sections.assistant) throw new NotFoundException('The assistant is not available on this website');
    if (!this.gateway.configuredProviders().length) throw new ServiceUnavailableException('The assistant is not available right now — please use the contact page');
    const s = site.settings;
    const db = this.prisma.db;
    const fees = s.sections.fees ? await this.fees(slug).catch(() => null) : null;
    const facts = [
      `School: ${site.school.name}${site.school.motto ? ` — motto "${site.school.motto}"` : ''}.`,
      s.about.story ? `About: ${s.about.story.slice(0, 1500)}` : '',
      s.about.mission ? `Mission: ${s.about.mission}` : '',
      s.about.leaderName ? `${s.about.leaderTitle ?? 'Head'}: ${s.about.leaderName}.` : '',
      `Classes offered: ${site.classes.map((c) => c.level).join(', ')}. Subjects: ${site.subjects.join(', ')}.`,
      s.academics.intro ? `Academics: ${s.academics.intro.slice(0, 1000)}` : '',
      `Admissions are ${s.admissions.open ? 'open' : 'closed'}. ${s.admissions.intro.slice(0, 800)}`,
      s.admissions.steps.length ? `How to apply: ${s.admissions.steps.map((x, i) => `${i + 1}. ${x.title} — ${x.description}`).join(' ')}` : '',
      s.admissions.requirements.length ? `Requirements: ${s.admissions.requirements.join('; ')}.` : '',
      s.admissions.entryTerms.length ? `Entry points: ${s.admissions.entryTerms.join(', ')}.` : '',
      site.term ? `Current term: ${site.term.name}, ${site.term.startsOn} to ${site.term.endsOn}.` : '',
      site.events.length ? `Upcoming events: ${site.events.map((e) => `${e.title} on ${e.startDate}${e.time ? ` ${e.time}` : ''}`).join('; ')}.` : '',
      fees ? `Fees for ${fees.term} (per term): ${fees.levels.map((l) => `${l.level} ${formatMoney(l.totalKobo, fees.currency)}`).join('; ')}; optional items: ${[...new Set(fees.levels.flatMap((l) => l.items.filter((i) => i.optional).map((i) => `${i.name} ${formatMoney(i.amountKobo, fees.currency)}`)))].join(', ') || 'none'}.` : 'Fees are not published on the website — refer fee questions to the school.',
      [s.contact.address && `Address: ${s.contact.address}`, s.contact.phone && `Phone: ${s.contact.phone}`, s.contact.whatsapp && `WhatsApp: ${s.contact.whatsapp}`, s.contact.email && `Email: ${s.contact.email}`, s.contact.hours && `Office hours: ${s.contact.hours}`].filter(Boolean).join('. '),
      s.faq.length ? `FAQ:\n${s.faq.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n')}` : '',
      `Website pages: Admissions, Fees${s.sections.fees ? '' : ' (not published)'}, Events, News, Gallery, Teachers, Results checker, Downloads, Contact.`,
      `Teaching staff: ${await db.staff.count({ where: { status: { not: 'EXITED' }, type: 'TEACHING' } })}.`,
    ]
      .filter(Boolean)
      .join('\n');
    // Public documents (prospectus, fee policy…) the school has put in its knowledge base.
    const question = body.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const hits = question ? await this.kb.search(currentTenantId(), question, ['PUBLIC'], 4) : [];
    const withDocs = hits.length ? `${facts}\n\nFROM THE SCHOOL'S PUBLIC DOCUMENTS:\n${KnowledgeService.asContext(hits)}` : facts;
    const r = await this.gateway.generate({ tier: 'standard', system: assistantPrompt(site.school.name, withDocs), messages: body.messages, maxOutputTokens: 600 }, 'website-assistant');
    return { reply: r.text || "Sorry, I couldn't answer that just now — please use the contact page." };
  }
}
