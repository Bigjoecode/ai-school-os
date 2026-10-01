import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import {
  announcementSchema,
  eventListQuerySchema,
  eventSchema,
  type AnnouncementAudience,
  type AnnouncementInput,
  type AnnouncementRow,
  type Audience,
  type EventCategory,
  type EventInput,
  type EventRow,
  type NoticeboardResponse,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { Public, RequirePermissions } from '../common/decorators';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { SenderService } from './sender.service';

export function eventRow(e: Prisma.SchoolEventGetPayload<object>, arms: Map<string, string>): EventRow {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    category: e.category as EventCategory,
    allDay: e.allDay,
    startDate: dateOnly(e.startDate)!,
    startTime: e.startTime,
    endDate: dateOnly(e.endDate),
    endTime: e.endTime,
    location: e.location,
    audience: e.audience as AnnouncementAudience,
    classes: e.classArmIds.map((id) => arms.get(id) ?? '').filter(Boolean),
    classArmIds: e.classArmIds,
    remindDaysBefore: e.remindDaysBefore,
    reminderSentAt: e.reminderSentAt?.toISOString() ?? null,
  };
}

/** What a viewer may see: their audiences, and their children's / own classes (null = every class). */
interface Viewer {
  audiences: AnnouncementAudience[];
  classArmIds: Set<string> | null;
}

interface IcalToken {
  typ: 'ical';
  tid: string;
  aud: AnnouncementAudience[];
  cls: string[] | null;
}

/** UTC instant for a school-local date and time. */
function localToUtc(date: string, time: string, timezone: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone: timezone }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()));
}

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Fold long lines at 75 octets, as RFC 5545 asks. */
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
};

@Controller()
export class CommunityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: SenderService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  private async viewer(): Promise<Viewer> {
    const ctx = currentContext();
    if (ctx.permissions.has('school.read')) return { audiences: ['EVERYONE', 'STAFF', 'PARENTS', 'STUDENTS'], classArmIds: null };
    const db = this.prisma.db;
    const [guardians, students] = await Promise.all([
      db.guardian.findMany({ where: { userId: ctx.userId }, select: { students: { select: { student: { select: { classArmId: true } } } } } }),
      db.student.findMany({ where: { userId: ctx.userId }, select: { classArmId: true } }),
    ]);
    const audiences: AnnouncementAudience[] = ['EVERYONE'];
    if (guardians.length) audiences.push('PARENTS');
    if (students.length) audiences.push('STUDENTS');
    const classes = new Set(
      [...guardians.flatMap((g) => g.students.map((s) => s.student.classArmId)), ...students.map((s) => s.classArmId)].filter((x): x is string => !!x),
    );
    return { audiences, classArmIds: classes };
  }

  private visible(v: Viewer, item: { audience: string; classArmIds: string[] }) {
    if (!v.audiences.includes(item.audience as AnnouncementAudience)) return false;
    if (!v.classArmIds || !item.classArmIds.length) return true;
    return item.classArmIds.some((c) => v.classArmIds!.has(c));
  }

  private async arms(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const arms = await this.prisma.root.classArm.findMany({ where: { id: { in: [...new Set(ids)] } }, include: { classLevel: true } });
    return new Map(arms.map((a) => [a.id, `${a.classLevel.name} ${a.name}`]));
  }

  private async announcementRows(rows: Prisma.AnnouncementGetPayload<object>[]): Promise<AnnouncementRow[]> {
    const now = new Date();
    const [arms, users] = await Promise.all([
      this.arms(rows.flatMap((r) => r.classArmIds)),
      this.prisma.root.user.findMany({ where: { id: { in: rows.map((r) => r.createdById).filter((x): x is string => !!x) } }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const names = new Map(users.map((u) => [u.id, fullName(u)]));
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      audience: a.audience as AnnouncementAudience,
      classes: a.classArmIds.map((id) => arms.get(id) ?? '').filter(Boolean),
      classArmIds: a.classArmIds,
      pinned: a.pinned,
      publishAt: a.publishAt.toISOString(),
      expiresAt: a.expiresAt?.toISOString() ?? null,
      author: a.createdById ? (names.get(a.createdById) ?? null) : null,
      createdAt: a.createdAt.toISOString(),
      state: a.publishAt > now ? 'SCHEDULED' : a.expiresAt && a.expiresAt < now ? 'EXPIRED' : 'LIVE',
      broadcastId: a.broadcastId,
    }));
  }

  // ---------------------------------------------------------- noticeboard (everyone in the school)

  @Get('noticeboard')
  async noticeboard(): Promise<NoticeboardResponse> {
    const v = await this.viewer();
    const db = this.prisma.db;
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { timezone: true } });
    const today = schoolNow(t.timezone).date;
    const now = new Date();
    const [ann, events] = await Promise.all([
      db.announcement.findMany({ where: { publishAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: [{ pinned: 'desc' }, { publishAt: 'desc' }], take: 50 }),
      db.schoolEvent.findMany({
        where: { OR: [{ startDate: { gte: parseDate(today) } }, { endDate: { gte: parseDate(today) } }], startDate: { lte: parseDate(new Date(Date.parse(`${today}T00:00:00Z`) + 45 * 86_400_000).toISOString().slice(0, 10)) } },
        orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
        take: 50,
      }),
    ]);
    const arms = await this.arms(events.flatMap((e) => e.classArmIds));
    return {
      announcements: (await this.announcementRows(ann.filter((a) => this.visible(v, a)))).slice(0, 20),
      events: events.filter((e) => this.visible(v, e)).map((e) => eventRow(e, arms)).slice(0, 15),
    };
  }

  // ---------------------------------------------------------- announcements

  @Get('announcements')
  @RequirePermissions('announcements.manage')
  async announcements(): Promise<AnnouncementRow[]> {
    const rows = await this.prisma.db.announcement.findMany({ orderBy: [{ pinned: 'desc' }, { publishAt: 'desc' }], take: 300 });
    return this.announcementRows(rows);
  }

  /** Sends an announcement as a message too, to the matching parents and/or staff. */
  private async notify(a: { id: string; title: string; body: string; audience: string; classArmIds: string[] }, channels: AnnouncementInput['notify']) {
    if (!channels.length) return null;
    if (!currentContext().permissions.has('comms.send')) throw new BadRequestException("You can post announcements but not send messages — leave 'Also notify' empty");
    if (a.audience === 'STUDENTS' && !a.classArmIds.length) {
      // Students are reached through their parents.
    }
    const parents: Audience = a.classArmIds.length ? { type: 'CLASS_PARENTS', classArmIds: a.classArmIds, classLevelIds: [], primaryOnly: true } : { type: 'ALL_PARENTS', primaryOnly: true };
    const targets: Audience[] = a.audience === 'STAFF' ? [{ type: 'ALL_STAFF' }] : a.audience === 'EVERYONE' ? [parents, { type: 'ALL_STAFF' }] : [parents];
    const tenantId = currentTenantId();
    let first: string | null = null;
    for (const audience of targets) {
      const { summary } = await this.sender.contactsFor(tenantId, audience, false);
      const b = await this.prisma.db.broadcast.create({
        data: {
          tenantId,
          title: a.title,
          channels,
          audience: audience as unknown as Prisma.InputJsonValue,
          audienceSummary: summary,
          subject: a.title,
          body: a.body,
          smsBody: `${a.title}: ${a.body}`.slice(0, 300),
          source: 'ANNOUNCEMENT',
          link: '/noticeboard',
          createdById: currentContext().userId,
        },
      });
      try {
        await this.sender.start(tenantId, b.id);
      } catch (err) {
        await this.prisma.db.broadcast.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
        throw err;
      }
      first ??= b.id;
    }
    return first;
  }

  @Post('announcements')
  @RequirePermissions('announcements.manage')
  async createAnnouncement(@Body(new ZodPipe(announcementSchema)) body: AnnouncementInput): Promise<AnnouncementRow> {
    const { notify, ...data } = body;
    const publishAt = data.publishAt ? new Date(data.publishAt) : new Date();
    if (notify.length && publishAt.getTime() > Date.now() + 60_000) throw new BadRequestException('Notifications go out straight away — post it now, or notify people when it goes live');
    const a = await this.prisma.db.announcement.create({
      data: { ...data, publishAt, expiresAt: data.expiresAt ? new Date(data.expiresAt) : null, tenantId: currentTenantId(), createdById: currentContext().userId },
    });
    const broadcastId = await this.notify(a, notify);
    if (broadcastId) await this.prisma.db.announcement.update({ where: { id: a.id }, data: { broadcastId } });
    await this.audit.log({ action: 'comms.announcement', entityType: 'Announcement', entityId: a.id, summary: `Posted announcement "${a.title}" for ${a.audience.toLowerCase()}${notify.length ? ` and notified by ${notify.join(', ').toLowerCase()}` : ''}` });
    return (await this.announcementRows([await this.prisma.db.announcement.findUniqueOrThrow({ where: { id: a.id } })]))[0]!;
  }

  @Put('announcements/:id')
  @RequirePermissions('announcements.manage')
  async updateAnnouncement(@Param('id') id: string, @Body(new ZodPipe(announcementSchema)) body: AnnouncementInput): Promise<AnnouncementRow> {
    const { notify: _notify, ...data } = body;
    const a = await this.prisma.db.announcement.update({
      where: { id },
      data: { ...data, publishAt: data.publishAt ? new Date(data.publishAt) : undefined, expiresAt: data.expiresAt ? new Date(data.expiresAt) : null },
    });
    return (await this.announcementRows([a]))[0]!;
  }

  @Delete('announcements/:id')
  @HttpCode(204)
  @RequirePermissions('announcements.manage')
  async deleteAnnouncement(@Param('id') id: string) {
    const a = await this.prisma.db.announcement.findUniqueOrThrow({ where: { id } });
    await this.prisma.db.announcement.delete({ where: { id } });
    await this.audit.log({ action: 'comms.announcement_deleted', entityType: 'Announcement', entityId: id, summary: `Removed announcement "${a.title}"` });
  }

  // ---------------------------------------------------------- events

  @Get('events')
  async events(@Query(new ZodPipe(eventListQuerySchema)) q: z.infer<typeof eventListQuerySchema>): Promise<EventRow[]> {
    const v = await this.viewer();
    const rows = await this.prisma.db.schoolEvent.findMany({
      where: {
        ...(q.to ? { startDate: { lte: parseDate(q.to) } } : {}),
        ...(q.from ? { OR: [{ startDate: { gte: parseDate(q.from) } }, { endDate: { gte: parseDate(q.from) } }] } : {}),
      },
      orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
      take: 500,
    });
    const arms = await this.arms(rows.flatMap((e) => e.classArmIds));
    return rows.filter((e) => this.visible(v, e)).map((e) => eventRow(e, arms));
  }

  private eventData(body: EventInput) {
    return {
      ...body,
      startDate: parseDate(body.startDate),
      endDate: body.endDate ? parseDate(body.endDate) : null,
      startTime: body.allDay ? null : body.startTime,
      endTime: body.allDay ? null : body.endTime,
    };
  }

  @Post('events')
  @RequirePermissions('events.manage')
  async createEvent(@Body(new ZodPipe(eventSchema)) body: EventInput): Promise<EventRow> {
    const e = await this.prisma.db.schoolEvent.create({ data: { ...this.eventData(body), tenantId: currentTenantId(), createdById: currentContext().userId } });
    await this.audit.log({ action: 'comms.event', entityType: 'SchoolEvent', entityId: e.id, summary: `Added "${e.title}" to the calendar (${body.startDate})` });
    return eventRow(e, await this.arms(e.classArmIds));
  }

  @Put('events/:id')
  @RequirePermissions('events.manage')
  async updateEvent(@Param('id') id: string, @Body(new ZodPipe(eventSchema)) body: EventInput): Promise<EventRow> {
    const before = await this.prisma.db.schoolEvent.findUniqueOrThrow({ where: { id } });
    // Moving the date or the reminder means the reminder should go again.
    const reset = dateOnly(before.startDate) !== body.startDate || before.remindDaysBefore !== body.remindDaysBefore;
    const e = await this.prisma.db.schoolEvent.update({ where: { id }, data: { ...this.eventData(body), ...(reset ? { reminderSentAt: null } : {}) } });
    return eventRow(e, await this.arms(e.classArmIds));
  }

  @Delete('events/:id')
  @HttpCode(204)
  @RequirePermissions('events.manage')
  async deleteEvent(@Param('id') id: string) {
    const e = await this.prisma.db.schoolEvent.findUniqueOrThrow({ where: { id } });
    await this.prisma.db.schoolEvent.delete({ where: { id } });
    await this.audit.log({ action: 'comms.event_deleted', entityType: 'SchoolEvent', entityId: id, summary: `Removed "${e.title}" from the calendar` });
  }

  /** A private link to subscribe to the school calendar from a phone or Google Calendar. */
  @Get('events/feed-link')
  async feedLink(): Promise<{ path: string }> {
    const v = await this.viewer();
    const token = await this.jwt.signAsync({ typ: 'ical', tid: currentTenantId(), aud: v.audiences, cls: v.classArmIds ? [...v.classArmIds] : null } satisfies IcalToken);
    return { path: `/api/calendar/${token}.ics` };
  }

  @Get('calendar/:token.ics')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('content-type', 'text/calendar; charset=utf-8')
  @Header('cache-control', 'private, max-age=900')
  async ics(@Param('token') token: string): Promise<string> {
    let p: IcalToken;
    try {
      p = await this.jwt.verifyAsync<IcalToken>(token);
    } catch {
      throw new NotFoundException('Calendar not found');
    }
    if (p.typ !== 'ical') throw new NotFoundException('Calendar not found');
    const tenant = await this.prisma.root.tenant.findUnique({ where: { id: p.tid }, select: { name: true, timezone: true, slug: true } });
    if (!tenant) throw new NotFoundException('Calendar not found');
    const since = new Date(Date.now() - 60 * 86_400_000);
    const rows = await this.prisma.root.schoolEvent.findMany({ where: { tenantId: p.tid, startDate: { gte: since } }, orderBy: { startDate: 'asc' }, take: 1000 });
    const v: Viewer = { audiences: p.aud, classArmIds: p.cls ? new Set(p.cls) : null };
    const stamp = icsStamp(new Date());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AI School OS//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(tenant.name)}`];
    for (const e of rows.filter((x) => this.visible(v, x))) {
      const start = dateOnly(e.startDate)!;
      const end = dateOnly(e.endDate) ?? start;
      lines.push('BEGIN:VEVENT', `UID:${e.id}@${tenant.slug}.aischool`, `DTSTAMP:${stamp}`);
      if (e.allDay || !e.startTime) {
        const next = new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
        lines.push(`DTSTART;VALUE=DATE:${start.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${next.replace(/-/g, '')}`);
      } else {
        const s = localToUtc(start, e.startTime, tenant.timezone);
        const f = e.endTime ? localToUtc(end, e.endTime, tenant.timezone) : new Date(s.getTime() + 3_600_000);
        lines.push(`DTSTART:${icsStamp(s)}`, `DTEND:${icsStamp(f > s ? f : new Date(s.getTime() + 3_600_000))}`);
      }
      lines.push(`SUMMARY:${icsText(e.title)}`);
      if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
      if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
      lines.push(`CATEGORIES:${e.category}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
}
