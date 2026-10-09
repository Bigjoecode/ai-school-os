import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { smsSafe, type Audience, type Channel } from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { dateOnly } from '../common/format';
import { schoolNow } from '../common/school-time';
import { env } from '../config/env';
import { runTickTasks } from '../common/tick-tasks';
import { raiseAlert } from '../alerts/alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { SenderService } from './sender.service';

const TICK_MS = 60_000;

export interface TickResult {
  scheduledStarted: number;
  resumed: number;
  birthdays: number;
  eventReminders: number;
  /** Other modules' housekeeping (e.g. online exams auto-submitted when time ran out). */
  tasks?: Record<string, number>;
}

const longDate = (d: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

/**
 * Runs every minute in-process, and on demand from a cron job (POST
 * /api/cron/tick), since shared hosting may put an idle app to sleep:
 * starts scheduled broadcasts that are due, resumes interrupted sends, and
 * runs each school's automations. Every step is idempotent, so overlapping
 * ticks from several processes are harmless.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: SenderService,
  ) {}

  onModuleInit() {
    if (env().NODE_ENV === 'test') return;
    this.timer = setInterval(
      () =>
        void this.tick().catch((e: Error) => {
          this.logger.error(`Tick failed: ${e.message}`);
          raiseAlert('job', 'tick', 'Scheduled messages and automations failed', e.message.slice(0, 1000));
        }),
      TICK_MS,
    );
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<TickResult> {
    const result: TickResult = { scheduledStarted: 0, resumed: 0, birthdays: 0, eventReminders: 0 };
    if (this.ticking) return result;
    this.ticking = true;
    try {
      const db = this.prisma.root;
      const now = new Date();

      for (const b of await db.broadcast.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: now } }, select: { id: true, tenantId: true } })) {
        try {
          await this.sender.start(b.tenantId, b.id);
          result.scheduledStarted++;
        } catch (err) {
          this.logger.warn(`Scheduled message ${b.id} didn't start: ${(err as Error).message}`);
          await db.broadcast.updateMany({ where: { id: b.id, status: 'DRAFT' }, data: { scheduledAt: null } });
        }
      }

      // Sends interrupted by a restart: queued deliveries untouched for two minutes.
      const stale = await db.delivery.findMany({
        where: { status: 'QUEUED', createdAt: { lt: new Date(now.getTime() - 120_000) } },
        distinct: ['broadcastId'],
        select: { broadcastId: true, tenantId: true },
      });
      for (const s of stale) {
        void this.sender.dispatch(s.tenantId, s.broadcastId);
        result.resumed++;
      }
      for (const b of await db.broadcast.findMany({ where: { status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - 120_000) } }, select: { id: true } })) {
        await this.sender.finishIfDone(b.id);
      }

      const tenants = await db.tenant.findMany({ where: { status: { in: ['TRIAL', 'ACTIVE'] } }, select: { id: true, timezone: true } });
      for (const t of tenants) {
        try {
          const r = await this.automations(t.id, t.timezone);
          result.birthdays += r.birthdays;
          result.eventReminders += r.eventReminders;
        } catch (err) {
          this.logger.error(`Automations for ${t.id} failed: ${(err as Error).message}`);
          raiseAlert('job', `automations:${(err as Error).message.slice(0, 60)}`, 'School automations failed', `Birthday / event-reminder automations failed for school ${t.id}: ${(err as Error).message}`.slice(0, 1000));
        }
      }
      result.tasks = await runTickTasks();
      return result;
    } finally {
      this.ticking = false;
    }
  }

  /** Records that an automation ran for this subject today; false if it already had. */
  private async once(tenantId: string, kind: string, subjectKey: string, date: string): Promise<boolean> {
    try {
      await this.prisma.root.automationRun.create({ data: { tenantId, kind, subjectKey, runDate: new Date(`${date}T00:00:00Z`) } });
      return true;
    } catch {
      return false;
    }
  }

  private async broadcast(tenantId: string, data: { title: string; channels: Channel[]; audience: Audience; summary: string; subject: string; body: string; smsBody: string | null; source: string; link: string | null }) {
    const b = await this.prisma.root.broadcast.create({
      data: {
        tenantId,
        title: data.title,
        channels: data.channels,
        audience: data.audience as unknown as Prisma.InputJsonValue,
        audienceSummary: data.summary,
        subject: data.subject,
        body: data.body,
        smsBody: data.smsBody,
        source: data.source,
        link: data.link,
      },
    });
    try {
      await this.sender.start(tenantId, b.id);
    } catch (err) {
      // e.g. a parent with no contact details: keep the draft so it shows up, but don't retry forever.
      await this.prisma.root.broadcast.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
      this.logger.warn(`Automation "${data.title}" not sent: ${(err as Error).message}`);
    }
    return b.id;
  }

  private async automations(tenantId: string, timezone: string): Promise<{ birthdays: number; eventReminders: number }> {
    const db = this.prisma.root;
    const school = await this.sender.school(tenantId);
    const s = school.settings;
    const now = schoolNow(timezone);
    const out = { birthdays: 0, eventReminders: 0 };
    if (now.time < s.birthdays.sendAt) return out;
    const today = now.date;
    const md = today.slice(5);

    // ---- birthdays
    if (s.birthdays.students.enabled && s.birthdays.students.channels.length) {
      const kids = await db.$queryRaw<{ id: string; firstName: string }[]>`
        SELECT id, "firstName" FROM students
        WHERE "tenantId" = ${tenantId} AND status = 'ACTIVE' AND "dateOfBirth" IS NOT NULL AND to_char("dateOfBirth", 'MM-DD') = ${md}`;
      for (const k of kids) {
        if (!(await this.once(tenantId, 'BIRTHDAY_STUDENT', k.id, today))) continue;
        const link = await db.studentGuardian.findFirst({ where: { tenantId, studentId: k.id }, orderBy: { isPrimary: 'desc' }, select: { guardianId: true } });
        if (!link) continue;
        const body = s.birthdays.students.template.replace(/\{\{\s*children\s*\}\}/g, k.firstName);
        await this.broadcast(tenantId, {
          title: `Birthday wishes — ${k.firstName}`,
          channels: s.birthdays.students.channels,
          audience: { type: 'PEOPLE', guardianIds: [link.guardianId], staffIds: [] },
          summary: `Parents of ${k.firstName}`,
          subject: `Happy birthday, ${k.firstName}!`,
          body,
          smsBody: smsSafe(body),
          source: 'BIRTHDAY',
          link: null,
        });
        out.birthdays++;
      }
    }
    if (s.birthdays.staff.enabled && s.birthdays.staff.channels.length) {
      const staff = await db.$queryRaw<{ id: string; firstName: string }[]>`
        SELECT id, "firstName" FROM staff
        WHERE "tenantId" = ${tenantId} AND status <> 'EXITED' AND "dateOfBirth" IS NOT NULL AND to_char("dateOfBirth", 'MM-DD') = ${md}`;
      for (const st of staff) {
        if (!(await this.once(tenantId, 'BIRTHDAY_STAFF', st.id, today))) continue;
        await this.broadcast(tenantId, {
          title: `Birthday wishes — ${st.firstName}`,
          channels: s.birthdays.staff.channels,
          audience: { type: 'PEOPLE', guardianIds: [], staffIds: [st.id] },
          summary: st.firstName,
          subject: `Happy birthday, ${st.firstName}!`,
          body: s.birthdays.staff.template,
          smsBody: smsSafe(s.birthdays.staff.template),
          source: 'BIRTHDAY',
          link: null,
        });
        out.birthdays++;
      }
    }

    // ---- event reminders: once, on the day that is `remindDaysBefore` ahead (or later if missed)
    if (s.eventReminders.enabled && s.eventReminders.channels.length) {
      const events = await db.schoolEvent.findMany({
        where: { tenantId, remindDaysBefore: { not: null }, reminderSentAt: null, startDate: { gte: new Date(`${today}T00:00:00Z`) } },
      });
      for (const e of events) {
        const start = dateOnly(e.startDate)!;
        const remindOn = new Date(Date.parse(`${start}T00:00:00Z`) - e.remindDaysBefore! * 86_400_000).toISOString().slice(0, 10);
        if (today < remindOn) continue;
        const claim = await db.schoolEvent.updateMany({ where: { id: e.id, reminderSentAt: null }, data: { reminderSentAt: new Date() } });
        if (!claim.count) continue;
        const when = `${start === today ? 'today' : longDate(start)}${e.allDay || !e.startTime ? '' : ` at ${e.startTime}`}`;
        const body = [
          `Dear {{first_name}},`,
          `A reminder from {{school}}: ${e.title} is ${when}${e.location ? `, at ${e.location}` : ''}.`,
          e.description ? e.description.slice(0, 600) : '',
          'Thank you.',
        ]
          .filter(Boolean)
          .join('\n\n');
        const sms = smsSafe(`Reminder from {{school}}: ${e.title} is ${when}${e.location ? ` at ${e.location}` : ''}.`);
        const parents: Audience = e.classArmIds.length
          ? { type: 'CLASS_PARENTS', classArmIds: e.classArmIds, classLevelIds: [], primaryOnly: true }
          : { type: 'ALL_PARENTS', primaryOnly: true };
        const targets: { audience: Audience; summary: string }[] = [];
        if (e.audience !== 'STAFF') targets.push({ audience: parents, summary: e.classArmIds.length ? 'Parents of the classes invited' : 'All parents' });
        if (e.audience === 'STAFF' || e.audience === 'EVERYONE') targets.push({ audience: { type: 'ALL_STAFF' }, summary: 'All staff' });
        for (const t of targets) {
          await this.broadcast(tenantId, {
            title: `Reminder: ${e.title}`,
            channels: s.eventReminders.channels,
            audience: t.audience,
            summary: t.summary,
            subject: `Reminder: ${e.title} — ${when}`,
            body,
            smsBody: sms,
            source: 'EVENT_REMINDER',
            link: '/calendar',
          });
        }
        out.eventReminders++;
      }
    }
    return out;
  }
}
