import { BadRequestException, ForbiddenException, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import {
  aiClassIntelligenceSchema,
  lessonPeriods,
  type AiClassIntelligence,
  type BellSchedule,
  type HomeworkRow,
  type LiveClassDetail,
  type LiveClassInput,
  type LiveClassRow,
  type LiveProvider,
  type LiveStatus,
  type SyncResult,
  type TranscriptSource,
} from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AiJobsService } from '../ai/ai-jobs.service';
import { AuditService } from '../audit/audit.service';
import { dateOnly, fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow, weekdayOf, datesBetween } from '../common/school-time';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { LiveProvidersService, stripCaptions } from './providers.service';
import { classIntelligencePrompt } from './prompts';

export const liveInclude = {
  classArm: { select: { id: true, name: true, classLevelId: true, classTeacherId: true, classLevel: { select: { name: true } } } },
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true, userId: true } },
  _count: { select: { recordings: true } },
} satisfies Prisma.LiveClassInclude;
export type LiveWithRefs = Prisma.LiveClassGetPayload<{ include: typeof liveInclude }>;

const armName = (a: { name: string; classLevel: { name: string } }) => `${a.classLevel.name} ${a.name}`;
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** UTC instant for a school-local date and HH:MM. */
export function localToUtc(date: string, time: string, timezone: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone: timezone }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()));
}

export function displayStatus(c: { status: string; startsAt: Date; endsAt: Date }, now = new Date()): LiveStatus {
  if (c.status === 'CANCELLED') return 'CANCELLED';
  // Open the room a few minutes early.
  if (now.getTime() < c.startsAt.getTime() - 10 * 60_000) return 'SCHEDULED';
  if (now <= c.endsAt) return 'LIVE';
  return 'ENDED';
}

interface Viewer {
  userId: string;
  staffId: string | null;
  manage: boolean;
  host: boolean;
  /** class-subject keys ("armId|subjectId") the viewer teaches, and arms they lead */
  teaches: Set<string>;
  leads: Set<string>;
}

@Injectable()
export class LiveService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(LiveService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: LiveProvidersService,
    private readonly jobs: AiJobsService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- context

  async school(tenantId = currentTenantId()) {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, timezone: true } });
    return { ...t, today: schoolNow(t.timezone).date };
  }

  async viewer(): Promise<Viewer> {
    const ctx = currentContext();
    const staff = await this.prisma.db.staff.findFirst({ where: { userId: ctx.userId }, include: { classSubjects: { select: { classArmId: true, subjectId: true } }, classesLed: { select: { id: true } } } });
    return {
      userId: ctx.userId!,
      staffId: staff?.id ?? null,
      manage: ctx.permissions.has('live.manage'),
      host: ctx.permissions.has('live.host'),
      teaches: new Set(staff?.classSubjects.map((c) => `${c.classArmId}|${c.subjectId}`) ?? []),
      leads: new Set(staff?.classesLed.map((c) => c.id) ?? []),
    };
  }

  canHost(v: Viewer, c: { teacherId: string | null; classArmId: string; subjectId: string | null }): boolean {
    if (v.manage) return true;
    if (!v.host || !v.staffId) return false;
    return c.teacherId === v.staffId || (!!c.subjectId && v.teaches.has(`${c.classArmId}|${c.subjectId}`)) || v.leads.has(c.classArmId);
  }

  async mustHost(id: string) {
    const c = await this.prisma.db.liveClass.findUniqueOrThrow({ where: { id } });
    const v = await this.viewer();
    if (!this.canHost(v, c)) throw new ForbiddenException('Only the teacher of this class (or a manager) can do that');
    return { c, v };
  }

  // ---------------------------------------------------------- rows

  async rows(list: LiveWithRefs[], v: Viewer): Promise<LiveClassRow[]> {
    if (!list.length) return [];
    const db = this.prisma.db;
    const ids = list.map((c) => c.id);
    const [att, enrolled, jobs] = await Promise.all([
      db.liveAttendance.groupBy({ by: ['liveClassId', 'status'], where: { liveClassId: { in: ids } }, _count: { _all: true } }),
      db.student.groupBy({ by: ['classArmId'], where: { status: 'ACTIVE', classArmId: { in: [...new Set(list.map((c) => c.classArmId))] } }, _count: { _all: true } }),
      db.aiJob.findMany({ where: { id: { in: list.map((c) => c.intelligenceJobId).filter((x): x is string => !!x) } }, select: { id: true, state: true } }),
    ]);
    const jobState = new Map(jobs.map((j) => [j.id, j.state]));
    const size = new Map(enrolled.map((e) => [e.classArmId, e._count._all]));
    const now = new Date();
    return list.map((c) => {
      const n = (s: string) => att.find((a) => a.liveClassId === c.id && a.status === s)?._count._all ?? 0;
      const marked = n('PRESENT') + n('LATE') + n('ABSENT');
      const state = c.intelligence ? 'READY' : c.intelligenceJobId ? (jobState.get(c.intelligenceJobId) ?? 'FAILED') : 'NONE';
      return {
        id: c.id,
        title: c.title,
        provider: c.provider as LiveProvider,
        status: displayStatus(c, now),
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        classArm: { id: c.classArm.id, name: armName(c.classArm) },
        subject: c.subject,
        teacher: c.teacher ? { id: c.teacher.id, name: fullName(c.teacher) } : null,
        attendance: marked ? { present: n('PRESENT'), late: n('LATE'), absent: n('ABSENT'), expected: size.get(c.classArmId) ?? 0 } : null,
        recordings: c._count.recordings,
        hasTranscript: !!c.transcript || !!c.teacherNotes,
        intelligence: state === 'DONE' ? 'READY' : (state as LiveClassRow['intelligence']),
        canHost: this.canHost(v, c),
      };
    });
  }

  async detail(id: string): Promise<LiveClassDetail> {
    const db = this.prisma.db;
    const c = await db.liveClass.findUniqueOrThrow({ where: { id }, include: { ...liveInclude, lessonPlan: { select: { id: true, topic: true } }, recordings: { orderBy: { startedAt: 'asc' } } } });
    const v = await this.viewer();
    const [row] = await this.rows([c], v);
    const host = row!.canHost;
    const [students, marks, job] = await Promise.all([
      db.student.findMany({ where: { classArmId: c.classArmId, status: 'ACTIVE' }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true, admissionNumber: true } }),
      db.liveAttendance.findMany({ where: { liveClassId: id } }),
      c.intelligenceJobId ? db.aiJob.findUnique({ where: { id: c.intelligenceJobId }, select: { error: true } }) : null,
    ]);
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));
    const data = (c.providerData ?? {}) as Record<string, unknown>;
    const words = c.transcript ? c.transcript.split(/\s+/).length : c.teacherNotes ? c.teacherNotes.split(/\s+/).length : 0;
    return {
      ...row!,
      agenda: c.agenda,
      lessonPlan: c.lessonPlan,
      joinUrl: c.provider === 'BBB' ? null : c.joinUrl,
      providerInfo: { meetingCode: (data.meetingCode as string) ?? (c.provider === 'ZOOM' ? c.externalId : null), passcode: host ? ((data.passcode as string) ?? null) : null },
      syncedAt: c.syncedAt?.toISOString() ?? null,
      attendanceList: students.map((s) => {
        const m = byStudent.get(s.id);
        return {
          studentId: s.id,
          name: fullName(s),
          admissionNumber: s.admissionNumber,
          status: (m?.status as LiveClassDetail['attendanceList'][number]['status']) ?? null,
          joinedAt: m?.joinedAt?.toISOString() ?? null,
          leftAt: m?.leftAt?.toISOString() ?? null,
          minutes: m?.minutes ?? null,
          source: m?.source ?? null,
        };
      }),
      recordingList: c.recordings.map((r) => ({
        id: r.id,
        kind: r.kind as LiveClassDetail['recordingList'][number]['kind'],
        title: r.title,
        url: r.url,
        durationSeconds: r.durationSeconds,
        startedAt: r.startedAt?.toISOString() ?? null,
      })),
      transcript:
        c.transcript || c.teacherNotes
          ? { source: (c.transcriptSource as TranscriptSource) ?? 'NOTES', words, preview: (c.transcript ?? (host ? c.teacherNotes : '') ?? '').slice(0, 600) }
          : null,
      teacherNotes: host ? c.teacherNotes : null,
      intelligenceResult: (c.intelligence as unknown as AiClassIntelligence | null) ?? null,
      intelligenceJobId: c.intelligenceJobId,
      intelligenceError: job?.error ?? null,
      homeworkId: c.homeworkId,
      quizQuestionIds: c.quizQuestionIds,
      summarySharedAt: c.summarySharedAt?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------- scheduling

  private async resolveTeacher(classArmId: string, subjectId: string | null, explicit: string | null, v: Viewer): Promise<string | null> {
    if (explicit) {
      await this.prisma.db.staff.findUniqueOrThrow({ where: { id: explicit } });
      return explicit;
    }
    if (subjectId) {
      const cs = await this.prisma.db.classSubject.findFirst({ where: { classArmId, subjectId }, select: { teacherId: true } });
      if (cs?.teacherId) return cs.teacherId;
    }
    return v.staffId;
  }

  async create(input: LiveClassInput, extra: { timetable?: boolean } = {}): Promise<LiveWithRefs> {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const v = await this.viewer();
    const [arm, school] = await Promise.all([db.classArm.findUniqueOrThrow({ where: { id: input.classArmId }, include: { classLevel: true } }), this.school()]);
    if (input.subjectId) await db.subject.findUniqueOrThrow({ where: { id: input.subjectId } });
    if (input.lessonPlanId) await db.lessonPlan.findUniqueOrThrow({ where: { id: input.lessonPlanId } });
    // Teachers schedule only for classes they teach or lead, and only as themselves.
    if (!v.manage && (!this.canHost(v, { teacherId: null, classArmId: input.classArmId, subjectId: input.subjectId }) || (input.teacherId && input.teacherId !== v.staffId))) {
      throw new ForbiddenException('You can only schedule live classes for the classes you teach');
    }
    const teacherId = await this.resolveTeacher(input.classArmId, input.subjectId, input.teacherId, v);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
    if (endsAt.getTime() < Date.now()) throw new BadRequestException('That time has already passed');
    if (!(await this.providers.connected(tenantId, input.provider))) {
      throw new BadRequestException(`Connect ${input.provider === 'GOOGLE_MEET' ? 'Google Meet' : input.provider === 'ZOOM' ? 'Zoom' : 'BigBlueButton'} first (Live classes → Settings)`);
    }
    const clash = teacherId
      ? await db.liveClass.findFirst({ where: { teacherId, status: { not: 'CANCELLED' }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, include: { classArm: { include: { classLevel: true } } } })
      : null;
    if (clash) throw new BadRequestException(`The teacher already has a live class then (${armName(clash.classArm)}, ${clash.title})`);
    const meeting = await this.providers.create(tenantId, input.provider, {
      title: `${input.title} — ${armName(arm)}`,
      description: input.agenda,
      startsAt,
      endsAt,
      timezone: school.timezone,
    });
    const c = await db.liveClass.create({
      data: {
        tenantId,
        title: input.title,
        classArmId: input.classArmId,
        subjectId: input.subjectId,
        teacherId,
        lessonPlanId: input.lessonPlanId,
        provider: input.provider,
        startsAt,
        endsAt,
        agenda: input.agenda,
        joinUrl: input.provider === 'EXTERNAL' ? input.joinUrl : meeting.joinUrl,
        externalId: meeting.externalId || null,
        providerData: meeting.providerData as Prisma.InputJsonValue,
        createdById: v.userId,
      },
      include: liveInclude,
    });
    if (!extra.timetable) {
      await this.audit.log({ action: 'live.scheduled', entityType: 'LiveClass', entityId: c.id, summary: `Scheduled a ${input.provider.replace('_', ' ').toLowerCase()} class "${c.title}" for ${armName(arm)} at ${startsAt.toISOString()}` });
    }
    return c;
  }

  /** One session per timetabled lesson (double lessons as one) in the date range. */
  async fromTimetable(input: { classArmId: string; subjectId: string; from: string; to: string; provider: LiveProvider; joinUrl: string | null }) {
    const db = this.prisma.db;
    const school = await this.school();
    const term = await db.term.findFirst({ where: { isCurrent: true } });
    const tt = term ? await db.timetable.findFirst({ where: { termId: term.id, status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' } }) : null;
    if (!tt) throw new BadRequestException('There is no published timetable for this term');
    const subject = await db.subject.findUniqueOrThrow({ where: { id: input.subjectId } });
    const entries = await db.timetableEntry.findMany({ where: { timetableId: tt.id, classArmId: input.classArmId, subjectId: input.subjectId }, orderBy: [{ day: 'asc' }, { period: 'asc' }] });
    if (!entries.length) throw new BadRequestException(`${subject.name} isn't on this class's timetable`);
    const bell = tt.bellSchedule as unknown as BellSchedule;
    const lessons = new Set(lessonPeriods(bell));
    // Merge consecutive periods of a double lesson into one session.
    const slots: { day: number; start: string; end: string }[] = [];
    for (const e of entries) {
      if (!lessons.has(e.period)) continue;
      const p = bell.periods[e.period]!;
      const prev = slots[slots.length - 1];
      const prevEntry = entries[entries.indexOf(e) - 1];
      if (prev && prevEntry && prevEntry.day === e.day && e.doubleGroup && prevEntry.doubleGroup === e.doubleGroup) prev.end = p.end;
      else slots.push({ day: e.day, start: p.start, end: p.end });
    }
    const from = input.from < school.today ? school.today : input.from;
    const days = datesBetween(from, input.to);
    if (days.length > 70) throw new BadRequestException('Choose ten weeks or less at a time');
    const created: string[] = [];
    const skipped: string[] = [];
    const now = Date.now();
    for (const d of days) {
      for (const s of slots.filter((x) => x.day === weekdayOf(d))) {
        const startsAt = localToUtc(d, s.start, school.timezone);
        if (startsAt.getTime() < now) continue;
        const minutes = Math.round((localToUtc(d, s.end, school.timezone).getTime() - startsAt.getTime()) / 60_000);
        const exists = await db.liveClass.findFirst({ where: { classArmId: input.classArmId, subjectId: input.subjectId, startsAt, status: { not: 'CANCELLED' } } });
        if (exists) {
          skipped.push(`${d} ${s.start} (already scheduled)`);
          continue;
        }
        try {
          const c = await this.create(
            { title: subject.name, classArmId: input.classArmId, subjectId: input.subjectId, teacherId: null, lessonPlanId: null, provider: input.provider, startsAt: startsAt.toISOString(), durationMinutes: minutes, agenda: null, joinUrl: input.joinUrl },
            { timetable: true },
          );
          created.push(c.id);
        } catch (err) {
          skipped.push(`${d} ${s.start} (${(err as Error).message})`);
          if (err instanceof ForbiddenException) throw err;
        }
        if (created.length >= 60) break;
      }
    }
    const arm = await db.classArm.findUniqueOrThrow({ where: { id: input.classArmId }, include: { classLevel: true } });
    await this.audit.log({ action: 'live.from_timetable', summary: `Scheduled ${created.length} live ${subject.name} classes for ${armName(arm)} from the timetable (${from} to ${input.to})` });
    return { created: created.length, skipped };
  }

  async update(id: string, input: LiveClassInput) {
    const { c } = await this.mustHost(id);
    if (c.status === 'CANCELLED') throw new BadRequestException('This class was cancelled');
    if (c.provider !== input.provider) throw new BadRequestException("The meeting service can't be changed — cancel this class and schedule a new one");
    const school = await this.school();
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
    if (c.externalId && (startsAt.getTime() !== c.startsAt.getTime() || endsAt.getTime() !== c.endsAt.getTime() || input.title !== c.title)) {
      const arm = await this.prisma.db.classArm.findUniqueOrThrow({ where: { id: c.classArmId }, include: { classLevel: true } });
      await this.providers.reschedule(currentTenantId(), c.provider as LiveProvider, c.externalId, { title: `${input.title} — ${armName(arm)}`, description: input.agenda, startsAt, endsAt, timezone: school.timezone });
    }
    await this.prisma.db.liveClass.update({
      where: { id },
      data: { title: input.title, startsAt, endsAt, agenda: input.agenda, lessonPlanId: input.lessonPlanId, ...(c.provider === 'EXTERNAL' ? { joinUrl: input.joinUrl } : {}) },
    });
    return this.detail(id);
  }

  async cancel(id: string) {
    const { c } = await this.mustHost(id);
    const done = await this.prisma.db.liveClass.updateMany({ where: { id, status: { not: 'CANCELLED' } }, data: { status: 'CANCELLED' } });
    if (!done.count) throw new BadRequestException('Already cancelled');
    if (c.externalId) await this.providers.cancel(currentTenantId(), c.provider as LiveProvider, c.externalId);
    await this.audit.log({ action: 'live.cancelled', entityType: 'LiveClass', entityId: id, summary: `Cancelled the live class "${c.title}" (${c.startsAt.toISOString()})` });
    return this.detail(id);
  }

  // ---------------------------------------------------------- joining & attendance

  /**
   * The link for the signed-in person: the host link for the teacher, the
   * attendee link otherwise. A student joining through the portal is marked
   * present (or late) on the spot.
   */
  async join(id: string): Promise<{ url: string; role: 'HOST' | 'ATTENDEE' }> {
    const db = this.prisma.db;
    const c = await db.liveClass.findUniqueOrThrow({ where: { id } });
    const status = displayStatus(c);
    if (status === 'CANCELLED') throw new BadRequestException('This class was cancelled');
    if (status === 'SCHEDULED') throw new BadRequestException('The class opens ten minutes before it starts');
    const ctx = currentContext();
    const v = await this.viewer();
    const host = this.canHost(v, c);
    const student = await db.student.findFirst({ where: { userId: ctx.userId, classArmId: c.classArmId, status: 'ACTIVE' } });
    if (!host && !student && !v.staffId) throw new ForbiddenException('This class is for its students and teachers');
    const user = await this.prisma.root.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { firstName: true, lastName: true } });
    if (student) {
      const now = new Date();
      const late = now.getTime() > c.startsAt.getTime() + 10 * 60_000;
      await db.liveAttendance.upsert({
        where: { liveClassId_studentId: { liveClassId: id, studentId: student.id } },
        update: { joinedAt: now },
        create: { tenantId: currentTenantId(), liveClassId: id, studentId: student.id, status: late ? 'LATE' : 'PRESENT', joinedAt: now, source: 'PORTAL' },
      });
    }
    const data = (c.providerData ?? {}) as Record<string, unknown>;
    if (c.provider === 'BBB') {
      return { url: await this.providers.bbbJoin(currentTenantId(), c.externalId!, data, c.title, { name: fullName(user), userId: ctx.userId!, host }), role: host ? 'HOST' : 'ATTENDEE' };
    }
    if (c.provider === 'ZOOM' && host && data.startUrl) return { url: String(data.startUrl), role: 'HOST' };
    if (!c.joinUrl) throw new BadRequestException('This class has no meeting link');
    return { url: c.joinUrl, role: host ? 'HOST' : 'ATTENDEE' };
  }

  async mark(id: string, marks: { studentId: string; status: string }[]) {
    const { c } = await this.mustHost(id);
    const ids = new Set((await this.prisma.db.student.findMany({ where: { classArmId: c.classArmId }, select: { id: true } })).map((s) => s.id));
    const bad = marks.find((m) => !ids.has(m.studentId));
    if (bad) throw new BadRequestException('Some students are not in this class');
    const tenantId = currentTenantId();
    await this.prisma.db.$transaction(
      marks.map((m) =>
        this.prisma.db.liveAttendance.upsert({
          where: { liveClassId_studentId: { liveClassId: id, studentId: m.studentId } },
          update: { status: m.status, source: 'MANUAL' },
          create: { tenantId, liveClassId: id, studentId: m.studentId, status: m.status, source: 'MANUAL' },
        }),
      ),
    );
    return this.detail(id);
  }

  // ---------------------------------------------------------- after the class

  /** Pulls attendance, recordings and the transcript from the meeting service. Works without a request context. */
  async sync(tenantId: string, id: string): Promise<SyncResult> {
    const db = this.prisma.root;
    const c = await db.liveClass.findFirstOrThrow({ where: { id, tenantId } });
    if (c.provider === 'EXTERNAL') return { attendanceMatched: 0, attendanceUnmatched: [], recordings: 0, transcript: false, message: 'Meeting links have nothing to fetch — mark attendance and add notes by hand' };
    if (!c.externalId) return { attendanceMatched: 0, attendanceUnmatched: [], recordings: 0, transcript: false, message: 'Nothing to fetch yet' };
    const pulled = await this.providers.pull(tenantId, c.provider as LiveProvider, c.externalId, (c.providerData ?? {}) as Record<string, unknown>);

    let matched = 0;
    const unmatched: string[] = [];
    if (pulled.participants) {
      const students = await db.student.findMany({
        where: { tenantId, classArmId: c.classArmId, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } },
      });
      const byKey = new Map<string, string>();
      for (const s of students) {
        byKey.set(norm(`${s.firstName} ${s.lastName}`), s.id);
        byKey.set(norm(`${s.lastName} ${s.firstName}`), s.id);
        if (s.user?.email) byKey.set(s.user.email.toLowerCase(), s.id);
      }
      // A student who rejoins appears more than once: keep the earliest join and add up the time.
      const seen = new Map<string, { joinedAt: Date | null; leftAt: Date | null; seconds: number }>();
      for (const p of pulled.participants) {
        const sid = (p.email && byKey.get(p.email.toLowerCase())) || byKey.get(norm(p.name));
        if (!sid) {
          if (!unmatched.includes(p.name)) unmatched.push(p.name);
          continue;
        }
        const prev = seen.get(sid);
        seen.set(sid, {
          joinedAt: prev?.joinedAt && p.joinedAt ? (prev.joinedAt < p.joinedAt ? prev.joinedAt : p.joinedAt) : (prev?.joinedAt ?? p.joinedAt),
          leftAt: prev?.leftAt && p.leftAt ? (prev.leftAt > p.leftAt ? prev.leftAt : p.leftAt) : (prev?.leftAt ?? p.leftAt),
          seconds: (prev?.seconds ?? 0) + p.seconds,
        });
      }
      const existing = new Map((await db.liveAttendance.findMany({ where: { liveClassId: id } })).map((a) => [a.studentId, a]));
      for (const [studentId, p] of seen) {
        const late = !!p.joinedAt && p.joinedAt.getTime() > c.startsAt.getTime() + 10 * 60_000;
        const prior = existing.get(studentId);
        // A teacher's manual mark wins over the meeting service.
        if (prior?.source === 'MANUAL') continue;
        await db.liveAttendance.upsert({
          where: { liveClassId_studentId: { liveClassId: id, studentId } },
          update: { status: late ? 'LATE' : 'PRESENT', joinedAt: p.joinedAt, leftAt: p.leftAt, minutes: Math.round(p.seconds / 60), source: 'PROVIDER' },
          create: { tenantId, liveClassId: id, studentId, status: late ? 'LATE' : 'PRESENT', joinedAt: p.joinedAt, leftAt: p.leftAt, minutes: Math.round(p.seconds / 60), source: 'PROVIDER' },
        });
        matched++;
      }
      if (c.endsAt < new Date()) {
        // Everyone else in the class missed it (unless already marked).
        const absent = students.filter((s) => !seen.has(s.id) && !existing.has(s.id));
        if (absent.length) await db.liveAttendance.createMany({ data: absent.map((s) => ({ tenantId, liveClassId: id, studentId: s.id, status: 'ABSENT', source: 'PROVIDER' })), skipDuplicates: true });
      }
    }
    for (const r of pulled.recordings) {
      await db.liveRecording.upsert({
        where: { liveClassId_externalId: { liveClassId: id, externalId: r.externalId } },
        update: { url: r.url, title: r.title, durationSeconds: r.durationSeconds },
        create: { tenantId, liveClassId: id, kind: r.kind, title: r.title, url: r.url, durationSeconds: r.durationSeconds, startedAt: r.startedAt, externalId: r.externalId },
      });
    }
    const takeTranscript = !!pulled.transcript && c.transcriptSource !== 'UPLOAD';
    await db.liveClass.update({ where: { id }, data: { syncedAt: new Date(), ...(takeTranscript ? { transcript: pulled.transcript!.slice(0, 400_000), transcriptSource: 'PROVIDER' } : {}) } });
    const parts = [
      pulled.participants ? `${matched} student${matched === 1 ? '' : 's'} matched${unmatched.length ? `, ${unmatched.length} name${unmatched.length === 1 ? '' : 's'} not recognised` : ''}` : 'no attendance from this service',
      `${pulled.recordings.length} recording${pulled.recordings.length === 1 ? '' : 's'}`,
      pulled.transcript ? 'transcript found' : 'no transcript',
    ];
    return { attendanceMatched: matched, attendanceUnmatched: unmatched.slice(0, 30), recordings: pulled.recordings.length, transcript: takeTranscript, message: parts.join(' · ') };
  }

  async setTranscript(id: string, source: 'UPLOAD' | 'NOTES', text: string) {
    await this.mustHost(id);
    const clean = source === 'UPLOAD' && /-->/.test(text) ? stripCaptions(text) : text.trim();
    await this.prisma.db.liveClass.update({
      where: { id },
      data: source === 'UPLOAD' ? { transcript: clean.slice(0, 400_000), transcriptSource: 'UPLOAD' } : { teacherNotes: clean.slice(0, 20_000) },
    });
    return this.detail(id);
  }

  // ---------------------------------------------------------- AI class intelligence

  async runIntelligence(id: string) {
    const { c } = await this.mustHost(id);
    const db = this.prisma.db;
    const full = await db.liveClass.findUniqueOrThrow({
      where: { id },
      include: { ...liveInclude, lessonPlan: true },
    });
    if (displayStatus(c) === 'SCHEDULED') throw new BadRequestException("The class hasn't happened yet");
    if (!full.transcript && !full.teacherNotes && !full.lessonPlan) throw new BadRequestException('Add a transcript or your notes on the class first (or link a lesson plan)');
    const basis: 'TRANSCRIPT' | 'NOTES' | 'PLAN' = full.transcript ? 'TRANSCRIPT' : full.teacherNotes ? 'NOTES' : 'PLAN';
    const school = await this.school();
    const plan = full.lessonPlan;
    const facts = [
      `Class: ${armName(full.classArm)} (${full.classArm.classLevel.name}). Subject: ${full.subject?.name ?? 'not set'}. Title: ${full.title}.`,
      `Held: ${full.startsAt.toISOString()} for ${Math.round((full.endsAt.getTime() - full.startsAt.getTime()) / 60_000)} minutes${full.teacher ? `, taught by ${fullName(full.teacher)}` : ''}.`,
      full.agenda ? `Agenda: ${full.agenda}` : '',
      plan ? `LESSON PLAN — topic: ${plan.topic}. Objectives: ${plan.objectives.join('; ')}.${plan.homework ? ` Planned homework: ${plan.homework}` : ''}` : '',
      full.teacherNotes && basis === 'TRANSCRIPT' ? `TEACHER'S NOTES: ${full.teacherNotes}` : '',
      basis === 'TRANSCRIPT' ? `TRANSCRIPT:\n${full.transcript!.slice(0, 60_000)}` : basis === 'NOTES' ? `TEACHER'S NOTES:\n${full.teacherNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const { system, user } = classIntelligencePrompt(school.name, facts, basis);
    // Clear the previous summary before the new run, so a fast result isn't overwritten.
    // The old homework and quiz stay where they are, but no longer belong to this summary.
    await db.liveClass.update({ where: { id }, data: { intelligence: Prisma.DbNull, homeworkId: null, quizQuestionIds: [], summarySharedAt: null } });
    const job = await this.jobs.start('class-intelligence', { liveClassId: id, basis }, async () => {
      const r = await this.gateway.generateJson({ tier: 'advanced', system, messages: [{ role: 'user', content: user }] }, aiClassIntelligenceSchema, 'class-intelligence');
      const quiz = r.data.quiz.filter((q) => q.options.length === 4 && q.answerIndex >= 0 && q.answerIndex <= 3);
      const result: AiClassIntelligence = { ...r.data, quiz };
      await this.prisma.root.liveClass.update({ where: { id }, data: { intelligence: result as unknown as Prisma.InputJsonValue } });
      return { liveClassId: id, basis, provider: r.provider, model: r.model };
    });
    await db.liveClass.update({ where: { id }, data: { intelligenceJobId: job.id } });
    return job;
  }

  intelligenceOf(c: { intelligence: Prisma.JsonValue | null }): AiClassIntelligence {
    if (!c.intelligence) throw new BadRequestException('Generate the class summary first');
    return c.intelligence as unknown as AiClassIntelligence;
  }

  /** Saves the AI quiz into the question bank as draft questions for review. */
  async saveQuiz(id: string): Promise<string[]> {
    const { c } = await this.mustHost(id);
    if (!currentContext().permissions.has('assessment.manage')) throw new ForbiddenException('You need question-bank access to save the quiz');
    if (!c.subjectId) throw new BadRequestException('Set a subject on this class first');
    if (c.quizQuestionIds.length) throw new BadRequestException('This quiz is already in the question bank');
    const ai = this.intelligenceOf(c);
    const arm = await this.prisma.db.classArm.findUniqueOrThrow({ where: { id: c.classArmId } });
    const tenantId = currentTenantId();
    const created = await this.prisma.db.$transaction(
      ai.quiz.map((q) =>
        this.prisma.db.question.create({
          data: {
            tenantId,
            subjectId: c.subjectId!,
            classLevelId: arm.classLevelId,
            topic: ai.topic,
            type: 'MULTIPLE_CHOICE',
            difficulty: 'MEDIUM',
            stem: q.question,
            options: q.options,
            correctIndex: q.answerIndex,
            answer: q.explanation,
            marks: 1,
            status: 'DRAFT',
            source: 'AI',
            createdById: currentContext().userId,
          },
        }),
      ),
    );
    const ids = created.map((q) => q.id);
    await this.prisma.db.liveClass.update({ where: { id }, data: { quizQuestionIds: ids } });
    await this.audit.log({ action: 'live.quiz_saved', entityType: 'LiveClass', entityId: id, summary: `Saved ${ids.length} AI quiz questions on "${ai.topic}" to the question bank for review` });
    return ids;
  }

  // ---------------------------------------------------------- background sync

  onModuleInit() {
    if (env().NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.autoSync().catch((e: Error) => this.logger.warn(`Auto-sync: ${e.message}`)), 10 * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Fetches attendance and recordings 20 minutes after a class ends, and again two hours later for late recordings. */
  async autoSync(): Promise<number> {
    const now = Date.now();
    const due = await this.prisma.root.liveClass.findMany({
      where: {
        provider: { in: ['GOOGLE_MEET', 'ZOOM', 'BBB'] },
        status: { not: 'CANCELLED' },
        endsAt: { lt: new Date(now - 20 * 60_000), gt: new Date(now - 24 * 3_600_000) },
      },
      select: { id: true, tenantId: true, endsAt: true, syncedAt: true },
      take: 50,
    });
    let n = 0;
    for (const c of due) {
      const second = c.endsAt.getTime() + 2 * 3_600_000;
      const needs = !c.syncedAt || (c.syncedAt.getTime() < second && now > second);
      if (!needs) continue;
      try {
        await this.sync(c.tenantId, c.id);
        n++;
      } catch (err) {
        this.logger.warn(`Sync of ${c.id} failed: ${(err as Error).message}`);
        await this.prisma.root.liveClass.update({ where: { id: c.id }, data: { syncedAt: new Date() } });
      }
    }
    return n;
  }

  homeworkRow(h: Prisma.HomeworkGetPayload<{ include: { classArm: { include: { classLevel: true } }; subject: true; teacher: true } }>, today: string): HomeworkRow {
    const due = dateOnly(h.dueDate)!;
    return {
      id: h.id,
      title: h.title,
      instructions: h.instructions,
      questions: h.questions,
      classArm: { id: h.classArm.id, name: armName(h.classArm) },
      subject: h.subject ? { id: h.subject.id, name: h.subject.name } : null,
      teacher: h.teacher ? fullName(h.teacher) : null,
      dueDate: due,
      status: h.status as HomeworkRow['status'],
      source: h.source as HomeworkRow['source'],
      liveClassId: h.liveClassId,
      publishedAt: h.publishedAt?.toISOString() ?? null,
      overdue: h.status === 'PUBLISHED' && due < today,
      kind: h.kind as HomeworkRow['kind'],
      attachments: (h.attachments as unknown as HomeworkRow['attachments']) ?? [],
      submissionTypes: h.submissionTypes as HomeworkRow['submissionTypes'],
      maxScore: h.maxScore,
      allowLate: h.allowLate,
    };
  }
}

