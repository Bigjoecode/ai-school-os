import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  LIVE_PROVIDERS,
  bbbSettingsSchema,
  fromTimetableSchema,
  homeworkListQuerySchema,
  homeworkSchema,
  liveAttendanceSchema,
  liveClassSchema,
  liveListQuerySchema,
  publishHomeworkSchema,
  transcriptSchema,
  zoomSettingsSchema,
  type Audience,
  type Channel,
  type HomeworkInput,
  type HomeworkRow,
  type LiveClassDetail,
  type LiveClassInput,
  type LiveClassRow,
  type LiveOverview,
  type LiveProvider,
  type MyLearning,
  type SyncResult,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { SenderService } from '../comms/sender.service';
import { Public, RequireFeature, RequirePermissions } from '../common/decorators';
import { dateOnly, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { siteOrigin } from '../finance/finance.controller';
import { PrismaService } from '../prisma/prisma.service';
import { LiveProvidersService } from './providers.service';
import { LiveService, displayStatus, liveInclude } from './live.service';

interface OAuthState {
  typ: 'google-connect';
  tid: string;
  uid: string;
  origin: string;
}

const homeworkInclude = { classArm: { include: { classLevel: true } }, subject: true, teacher: true } satisfies Prisma.HomeworkInclude;
const FREE: Channel[] = ['IN_APP', 'PUSH'];

@Controller()
@RequireFeature('live_classes')
export class LiveController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly live: LiveService,
    private readonly providers: LiveProvidersService,
    private readonly sender: SenderService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /** Paid channels (SMS, email, WhatsApp) need messaging permission. Checked before anything is saved. */
  private checkChannels(channels: Channel[]) {
    if (channels.some((c) => !FREE.includes(c)) && !currentContext().permissions.has('comms.send')) {
      throw new ForbiddenException('Only in-app and push notifications are available to you — SMS, email and WhatsApp need messaging permission');
    }
  }

  /** Tells the class's parents. */
  private async notifyParents(classArmId: string, channels: Channel[], m: { title: string; subject: string; body: string; sms: string; link: string; source: 'HOMEWORK' | 'CLASS_SUMMARY' }) {
    if (!channels.length) return null;
    this.checkChannels(channels);
    const tenantId = currentTenantId();
    const audience: Audience = { type: 'CLASS_PARENTS', classArmIds: [classArmId], classLevelIds: [], primaryOnly: false };
    const { summary } = await this.sender.contactsFor(tenantId, audience, false);
    const b = await this.prisma.db.broadcast.create({
      data: {
        tenantId,
        title: m.title,
        channels,
        audience: audience as unknown as Prisma.InputJsonValue,
        audienceSummary: summary,
        subject: m.subject,
        body: m.body,
        smsBody: m.sms,
        source: m.source,
        link: m.link,
        createdById: currentContext().userId,
      },
    });
    await this.sender.start(tenantId, b.id);
    return b.id;
  }

  // ---------------------------------------------------------- overview & integrations

  @Get('live/overview')
  @RequirePermissions('live.read')
  async overview(): Promise<LiveOverview> {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const school = await this.live.school();
    const v = await this.live.viewer();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
    const mineOnly = !v.manage && v.staffId ? { teacherId: v.staffId } : {};
    const [integrations, upcoming, recent, week] = await Promise.all([
      this.providers.status(tenantId),
      db.liveClass.findMany({ where: { ...mineOnly, status: { not: 'CANCELLED' }, endsAt: { gte: now }, startsAt: { lte: weekAhead } }, include: liveInclude, orderBy: { startsAt: 'asc' }, take: 20 }),
      db.liveClass.findMany({ where: { ...mineOnly, status: { not: 'CANCELLED' }, endsAt: { lt: now, gte: weekAgo } }, include: liveInclude, orderBy: { startsAt: 'desc' }, take: 20 }),
      db.liveClass.findMany({ where: { status: { not: 'CANCELLED' }, startsAt: { gte: weekAgo, lte: weekAhead } }, select: { id: true, endsAt: true, intelligence: true, classArmId: true } }),
    ]);
    const held = week.filter((c) => c.endsAt < now);
    const att = held.length ? await db.liveAttendance.groupBy({ by: ['status'], where: { liveClassId: { in: held.map((c) => c.id) } }, _count: { _all: true } }) : [];
    const n = (s: string) => att.find((a) => a.status === s)?._count._all ?? 0;
    const marked = n('PRESENT') + n('LATE') + n('ABSENT');
    return {
      today: school.today,
      integrations,
      upcoming: await this.live.rows(upcoming, v),
      recent: await this.live.rows(recent, v),
      thisWeek: {
        scheduled: week.filter((c) => c.endsAt >= now).length,
        held: held.length,
        averageAttendance: marked ? Math.round(((n('PRESENT') + n('LATE')) / marked) * 1000) / 10 : null,
        summariesReady: held.filter((c) => c.intelligence).length,
      },
    };
  }

  @Get('live/integrations')
  @RequirePermissions('live.read')
  integrations() {
    return this.providers.status(currentTenantId());
  }

  @Put('live/integrations/zoom')
  @RequirePermissions('live.manage')
  async zoom(@Body(new ZodPipe(zoomSettingsSchema)) body: z.infer<typeof zoomSettingsSchema>) {
    await this.providers.zoomConnect(currentTenantId(), body);
    await this.audit.log({ action: 'live.zoom_connected', summary: `Connected Zoom (account ${body.accountId})` });
    return this.providers.status(currentTenantId());
  }

  @Put('live/integrations/bbb')
  @RequirePermissions('live.manage')
  async bbb(@Body(new ZodPipe(bbbSettingsSchema)) body: z.infer<typeof bbbSettingsSchema>) {
    await this.providers.bbbConnect(currentTenantId(), body);
    await this.audit.log({ action: 'live.bbb_connected', summary: `Connected BigBlueButton (${body.url})` });
    return this.providers.status(currentTenantId());
  }

  @Delete('live/integrations/:provider')
  @HttpCode(204)
  @RequirePermissions('live.manage')
  async disconnect(@Param('provider') provider: string) {
    if (!(LIVE_PROVIDERS as readonly string[]).includes(provider)) throw new BadRequestException('Unknown provider');
    await this.providers.disconnect(currentTenantId(), provider as LiveProvider);
    await this.audit.log({ action: 'live.disconnected', summary: `Disconnected ${provider.replace('_', ' ').toLowerCase()}` });
  }

  /** Starts Google sign-in; the school's Google Workspace account owns the Meet events. */
  @Get('live/google/connect')
  @RequirePermissions('live.manage')
  async googleConnect(@Req() req: Request): Promise<{ url: string }> {
    const origin = siteOrigin(req);
    const state = await this.jwt.signAsync({ typ: 'google-connect', tid: currentTenantId(), uid: currentContext().userId!, origin } satisfies OAuthState, { expiresIn: '10m' });
    return { url: this.providers.googleAuthUrl(state, `${origin}/api/live/google/callback`) };
  }

  @Get('live/google/callback')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleCallback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Query('error') error: string | undefined, @Res() res: Response) {
    let s: OAuthState;
    try {
      s = await this.jwt.verifyAsync<OAuthState>(state ?? '');
      if (s.typ !== 'google-connect') throw new Error('wrong token');
    } catch {
      res.status(400).send('This sign-in link has expired. Please start again from Live classes → Settings.');
      return;
    }
    const back = (q: string) => res.redirect(302, `${s.origin}/live/settings?${q}`);
    if (error || !code) return back(`google=${encodeURIComponent(error ?? 'cancelled')}`);
    try {
      const email = await this.providers.googleConnect(s.tid, code, `${s.origin}/api/live/google/callback`);
      await this.audit.log({ tenantId: s.tid, actorUserId: s.uid, action: 'live.google_connected', summary: `Connected Google Meet (${email})` });
      return back('google=connected');
    } catch (err) {
      return back(`google=error&message=${encodeURIComponent((err as Error).message.slice(0, 200))}`);
    }
  }

  // ---------------------------------------------------------- classes

  @Get('live/classes')
  @RequirePermissions('live.read')
  async classes(@Query(new ZodPipe(liveListQuerySchema)) q: z.infer<typeof liveListQuerySchema>): Promise<LiveClassRow[]> {
    const v = await this.live.viewer();
    const rows = await this.prisma.db.liveClass.findMany({
      where: {
        ...(q.from ? { endsAt: { gte: parseDate(q.from) } } : {}),
        ...(q.to ? { startsAt: { lt: new Date(parseDate(q.to).getTime() + 86_400_000) } } : {}),
        ...(q.classArmId ? { classArmId: q.classArmId } : {}),
        ...(q.teacherId ? { teacherId: q.teacherId } : q.mine && v.staffId ? { teacherId: v.staffId } : {}),
        ...(q.status === 'CANCELLED' ? { status: 'CANCELLED' } : q.status ? { status: { not: 'CANCELLED' } } : {}),
      },
      include: liveInclude,
      orderBy: { startsAt: 'asc' },
      take: 500,
    });
    const now = new Date();
    const filtered = q.status && q.status !== 'CANCELLED' ? rows.filter((r) => displayStatus(r, now) === q.status) : rows;
    return this.live.rows(filtered, v);
  }

  @Get('live/classes/:id')
  @RequirePermissions('live.read')
  detail(@Param('id') id: string): Promise<LiveClassDetail> {
    return this.live.detail(id);
  }

  @Post('live/classes')
  @RequirePermissions('live.read')
  async create(@Body(new ZodPipe(liveClassSchema)) body: LiveClassInput): Promise<LiveClassDetail> {
    const c = await this.live.create(body);
    return this.live.detail(c.id);
  }

  @Post('live/classes/from-timetable')
  @RequirePermissions('live.read')
  fromTimetable(@Body(new ZodPipe(fromTimetableSchema)) body: z.infer<typeof fromTimetableSchema>) {
    return this.live.fromTimetable(body);
  }

  @Put('live/classes/:id')
  @RequirePermissions('live.read')
  update(@Param('id') id: string, @Body(new ZodPipe(liveClassSchema)) body: LiveClassInput): Promise<LiveClassDetail> {
    return this.live.update(id, body);
  }

  @Post('live/classes/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('live.read')
  cancel(@Param('id') id: string): Promise<LiveClassDetail> {
    return this.live.cancel(id);
  }

  /** Any member of the school; the service decides (students of the class, staff, the host). */
  @Post('live/classes/:id/join')
  @HttpCode(200)
  join(@Param('id') id: string) {
    return this.live.join(id);
  }

  @Put('live/classes/:id/attendance')
  @RequirePermissions('live.read')
  attendance(@Param('id') id: string, @Body(new ZodPipe(liveAttendanceSchema)) body: z.infer<typeof liveAttendanceSchema>): Promise<LiveClassDetail> {
    return this.live.mark(id, body.marks);
  }

  @Post('live/classes/:id/sync')
  @HttpCode(200)
  @RequirePermissions('live.read')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async sync(@Param('id') id: string): Promise<SyncResult> {
    await this.live.mustHost(id);
    return this.live.sync(currentTenantId(), id);
  }

  @Put('live/classes/:id/transcript')
  @RequirePermissions('live.read')
  transcript(@Param('id') id: string, @Body(new ZodPipe(transcriptSchema)) body: z.infer<typeof transcriptSchema>): Promise<LiveClassDetail> {
    return this.live.setTranscript(id, body.source, body.text);
  }

  @Post('live/classes/:id/intelligence')
  @HttpCode(200)
  @RequirePermissions('live.read', 'ai.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  intelligence(@Param('id') id: string) {
    return this.live.runIntelligence(id);
  }

  @Post('live/classes/:id/quiz')
  @HttpCode(200)
  @RequirePermissions('live.read')
  async quiz(@Param('id') id: string) {
    return { questionIds: await this.live.saveQuiz(id) };
  }

  /** Publishes the AI homework to the class (and tells parents, if asked). */
  @Post('live/classes/:id/homework')
  @RequirePermissions('live.read', 'homework.manage')
  async homeworkFromClass(@Param('id') id: string, @Body(new ZodPipe(publishHomeworkSchema)) body: z.infer<typeof publishHomeworkSchema>): Promise<HomeworkRow> {
    const { c } = await this.live.mustHost(id);
    this.checkChannels(body.notifyParents as Channel[]);
    if (c.homeworkId) throw new BadRequestException('Homework from this class has already been set');
    const ai = this.live.intelligenceOf(c);
    const school = await this.live.school();
    if (body.dueDate < school.today) throw new BadRequestException('The due date has passed');
    const h = await this.prisma.db.homework.create({
      data: {
        tenantId: currentTenantId(),
        classArmId: c.classArmId,
        subjectId: c.subjectId,
        teacherId: c.teacherId,
        liveClassId: c.id,
        title: ai.homework.title,
        instructions: ai.homework.instructions,
        questions: ai.homework.questions,
        dueDate: parseDate(body.dueDate),
        status: 'PUBLISHED',
        source: 'AI',
        publishedAt: new Date(),
        createdById: currentContext().userId,
      },
      include: homeworkInclude,
    });
    await this.prisma.db.liveClass.update({ where: { id }, data: { homeworkId: h.id } });
    await this.notifyParents(c.classArmId, body.notifyParents as Channel[], this.homeworkMessage(h.title, h.subject?.name ?? null, body.dueDate, h.instructions));
    await this.audit.log({ action: 'live.homework', entityType: 'Homework', entityId: h.id, summary: `Set homework "${h.title}" for ${h.classArm.classLevel.name} ${h.classArm.name}, due ${body.dueDate}` });
    return this.live.homeworkRow(h, school.today);
  }

  /** Shares the AI class summary with the class's students and parents. */
  @Post('live/classes/:id/share')
  @HttpCode(200)
  @RequirePermissions('live.read')
  async share(@Param('id') id: string, @Body(new ZodPipe(z.object({ notifyParents: z.array(z.enum(['IN_APP', 'SMS', 'EMAIL', 'WHATSAPP', 'PUSH'])).default([]) }))) body: { notifyParents: Channel[] }) {
    const { c } = await this.live.mustHost(id);
    this.checkChannels(body.notifyParents);
    const ai = this.live.intelligenceOf(c);
    await this.prisma.db.liveClass.update({ where: { id }, data: { summarySharedAt: new Date() } });
    await this.notifyParents(c.classArmId, body.notifyParents, {
      title: `Class summary: ${ai.topic}`,
      subject: `What {{children}} learnt today: ${ai.topic}`,
      body: `Dear {{first_name}},\n\nIn today's live ${c.title} class, {{children}} learnt about ${ai.topic}.\n\n${ai.summary}\n\nKey ideas: ${ai.keyConcepts.join('; ')}.\n\nThe full revision notes are on the school portal.`,
      sms: `{{school}}: today's ${c.title} class covered ${ai.topic}. Revision notes are on the school portal.`,
      link: '/learning',
      source: 'CLASS_SUMMARY',
    });
    await this.audit.log({ action: 'live.summary_shared', entityType: 'LiveClass', entityId: id, summary: `Shared the class summary "${ai.topic}" with students and parents` });
    return this.live.detail(id);
  }

  private homeworkMessage(title: string, subject: string | null, due: string, instructions: string) {
    const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${due}T00:00:00Z`));
    return {
      title: `Homework: ${title}`,
      subject: `${subject ? `${subject} homework` : 'Homework'} for {{children}}, due ${date}`,
      body: `Dear {{first_name}},\n\n{{children}} has new ${subject ? `${subject} ` : ''}homework: ${title}, due ${date}.\n\n${instructions}\n\nThe questions are on the school portal.`,
      sms: `{{school}}: new ${subject ? `${subject} ` : ''}homework for {{children}} - ${title}. Due ${date}. Details on the school portal.`,
      link: '/learning',
      source: 'HOMEWORK' as const,
    };
  }

  // ---------------------------------------------------------- homework

  @Get('homework')
  @RequirePermissions('homework.manage')
  async homework(@Query(new ZodPipe(homeworkListQuerySchema)) q: z.infer<typeof homeworkListQuerySchema>): Promise<HomeworkRow[]> {
    const school = await this.live.school();
    const today = parseDate(school.today);
    const v = await this.live.viewer();
    // Teachers see homework for their own classes; managers see everything.
    const scope: Prisma.HomeworkWhereInput = v.manage
      ? {}
      : { OR: [{ createdById: v.userId }, ...(v.staffId ? [{ teacherId: v.staffId }] : []), { classArmId: { in: [...v.leads] } }, ...[...v.teaches].map((k) => ({ classArmId: k.split('|')[0], subjectId: k.split('|')[1] }))] };
    const rows = await this.prisma.db.homework.findMany({
      where: {
        ...scope,
        ...(q.classArmId ? { classArmId: q.classArmId } : {}),
        ...(q.subjectId ? { subjectId: q.subjectId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.due === 'UPCOMING' ? { dueDate: { gte: today } } : q.due === 'PAST' ? { dueDate: { lt: today } } : {}),
      },
      include: homeworkInclude,
      orderBy: [{ dueDate: q.due === 'PAST' ? 'desc' : 'asc' }],
      take: 300,
    });
    return rows.map((h) => this.live.homeworkRow(h, school.today));
  }

  private async checkTeaches(classArmId: string, subjectId: string | null) {
    const v = await this.live.viewer();
    if (v.manage) return v;
    if (!this.live.canHost(v, { teacherId: null, classArmId, subjectId })) throw new ForbiddenException('You can only set homework for the classes you teach');
    return v;
  }

  @Post('homework')
  @RequirePermissions('homework.manage')
  async createHomework(@Body(new ZodPipe(homeworkSchema)) body: HomeworkInput): Promise<HomeworkRow> {
    const v = await this.checkTeaches(body.classArmId, body.subjectId);
    if (body.publish) this.checkChannels(body.notifyParents as Channel[]);
    const school = await this.live.school();
    if (body.dueDate < school.today) throw new BadRequestException('The due date has passed');
    const h = await this.prisma.db.homework.create({
      data: {
        tenantId: currentTenantId(),
        classArmId: body.classArmId,
        subjectId: body.subjectId,
        teacherId: v.staffId,
        title: body.title,
        instructions: body.instructions,
        questions: body.questions,
        dueDate: parseDate(body.dueDate),
        status: body.publish ? 'PUBLISHED' : 'DRAFT',
        publishedAt: body.publish ? new Date() : null,
        createdById: v.userId,
      },
      include: homeworkInclude,
    });
    if (body.publish) await this.notifyParents(h.classArmId, body.notifyParents as Channel[], this.homeworkMessage(h.title, h.subject?.name ?? null, body.dueDate, h.instructions));
    await this.audit.log({ action: 'homework.created', entityType: 'Homework', entityId: h.id, summary: `${body.publish ? 'Set' : 'Drafted'} homework "${h.title}" for ${h.classArm.classLevel.name} ${h.classArm.name}` });
    return this.live.homeworkRow(h, school.today);
  }

  @Put('homework/:id')
  @RequirePermissions('homework.manage')
  async updateHomework(@Param('id') id: string, @Body(new ZodPipe(homeworkSchema)) body: HomeworkInput): Promise<HomeworkRow> {
    const before = await this.prisma.db.homework.findUniqueOrThrow({ where: { id } });
    await this.checkTeaches(before.classArmId, before.subjectId);
    const school = await this.live.school();
    const publishing = body.publish && before.status === 'DRAFT';
    if (publishing) this.checkChannels(body.notifyParents as Channel[]);
    const h = await this.prisma.db.homework.update({
      where: { id },
      data: {
        title: body.title,
        instructions: body.instructions,
        questions: body.questions,
        dueDate: parseDate(body.dueDate),
        subjectId: body.subjectId,
        ...(publishing ? { status: 'PUBLISHED', publishedAt: new Date() } : {}),
      },
      include: homeworkInclude,
    });
    if (publishing) await this.notifyParents(h.classArmId, body.notifyParents as Channel[], this.homeworkMessage(h.title, h.subject?.name ?? null, body.dueDate, h.instructions));
    return this.live.homeworkRow(h, school.today);
  }

  @Delete('homework/:id')
  @HttpCode(204)
  @RequirePermissions('homework.manage')
  async deleteHomework(@Param('id') id: string) {
    const h = await this.prisma.db.homework.findUniqueOrThrow({ where: { id } });
    await this.checkTeaches(h.classArmId, h.subjectId);
    await this.prisma.db.homework.delete({ where: { id } });
    if (h.liveClassId) await this.prisma.db.liveClass.updateMany({ where: { id: h.liveClassId, homeworkId: id }, data: { homeworkId: null } });
    await this.audit.log({ action: 'homework.deleted', entityType: 'Homework', entityId: id, summary: `Removed homework "${h.title}"` });
  }

  // ---------------------------------------------------------- students and parents

  /** Upcoming live classes, homework and shared summaries for the signed-in student or parent's children. */
  @Get('learning/mine')
  async mine(): Promise<MyLearning> {
    const db = this.prisma.db;
    const userId = currentContext().userId!;
    const [me, guardians] = await Promise.all([
      db.student.findFirst({ where: { userId, status: 'ACTIVE' }, select: { id: true, firstName: true, classArmId: true } }),
      db.guardian.findMany({ where: { userId }, select: { students: { select: { student: { select: { firstName: true, classArmId: true, status: true } } } } } }),
    ]);
    const childrenByArm = new Map<string, string[]>();
    for (const g of guardians) {
      for (const { student: s } of g.students) {
        if (s.status !== 'ACTIVE' || !s.classArmId) continue;
        childrenByArm.set(s.classArmId, [...(childrenByArm.get(s.classArmId) ?? []), s.firstName]);
      }
    }
    if (me?.classArmId) childrenByArm.set(me.classArmId, [...(childrenByArm.get(me.classArmId) ?? [])]);
    const arms = [...childrenByArm.keys()];
    if (!arms.length) return { liveClasses: [], homework: [], summaries: [] };
    const school = await this.live.school();
    const now = new Date();
    const v = await this.live.viewer();
    const [classes, homework, summaries] = await Promise.all([
      db.liveClass.findMany({
        where: { classArmId: { in: arms }, status: { not: 'CANCELLED' }, endsAt: { gte: now }, startsAt: { lte: new Date(now.getTime() + 14 * 86_400_000) } },
        include: liveInclude,
        orderBy: { startsAt: 'asc' },
        take: 40,
      }),
      db.homework.findMany({
        where: { classArmId: { in: arms }, status: 'PUBLISHED', dueDate: { gte: new Date(Date.parse(`${school.today}T00:00:00Z`) - 7 * 86_400_000) } },
        include: homeworkInclude,
        orderBy: { dueDate: 'asc' },
        take: 60,
      }),
      db.liveClass.findMany({
        where: { classArmId: { in: arms }, summarySharedAt: { not: null }, startsAt: { gte: new Date(now.getTime() - 21 * 86_400_000) } },
        include: { classArm: { include: { classLevel: true } }, subject: true },
        orderBy: { startsAt: 'desc' },
        take: 20,
      }),
    ]);
    const rows = await this.live.rows(classes, v);
    return {
      liveClasses: rows.map((r) => ({ ...r, canHost: false, canJoin: !!me && me.classArmId === r.classArm.id && r.status === 'LIVE', children: childrenByArm.get(r.classArm.id) ?? [] })),
      homework: homework.map((h) => ({ ...this.live.homeworkRow(h, school.today), children: childrenByArm.get(h.classArmId) ?? [] })),
      summaries: summaries
        .filter((c) => c.intelligence)
        .map((c) => {
          const ai = c.intelligence as unknown as { summary: string; keyConcepts: string[]; revisionNotes: string; topic: string };
          return {
            liveClassId: c.id,
            title: `${c.title}: ${ai.topic}`,
            date: dateOnly(c.startsAt)!,
            classArm: `${c.classArm.classLevel.name} ${c.classArm.name}`,
            subject: c.subject?.name ?? null,
            summary: ai.summary,
            keyConcepts: ai.keyConcepts,
            revisionNotes: ai.revisionNotes,
          };
        }),
    };
  }
}
