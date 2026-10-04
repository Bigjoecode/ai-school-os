import { Injectable, Logger } from '@nestjs/common';
import {
  WELFARE_NOTIFY_CHANNELS,
  type Audience,
  type BehaviourKind,
  type BehaviourRow,
  type BehaviourSeverity,
  type BehaviourStatus,
  type BehaviourTally,
  type Channel,
  type SickBayOutcome,
  type SickBayRow,
  type WelfareStudentRef,
  type WelfareTermRef,
} from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { SenderService } from '../comms/sender.service';
import { dateOnly } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { PrismaService } from '../prisma/prisma.service';

export const studentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  admissionNumber: true,
  classArmId: true,
  classArm: { select: { name: true, classLevel: { select: { name: true } } } },
} satisfies Prisma.StudentSelect;
export type StudentPick = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

export const behaviourInclude = { student: { select: studentSelect } } satisfies Prisma.BehaviourRecordInclude;
export type BehaviourWithStudent = Prisma.BehaviourRecordGetPayload<{ include: typeof behaviourInclude }>;
export const visitInclude = { student: { select: studentSelect } } satisfies Prisma.SickBayVisitInclude;
export type VisitWithStudent = Prisma.SickBayVisitGetPayload<{ include: typeof visitInclude }>;

export function studentRef(s: StudentPick): WelfareStudentRef {
  return {
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    admissionNumber: s.admissionNumber,
    className: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}`.trim() : null,
    classArmId: s.classArmId,
  };
}

export function emptyTally(): BehaviourTally {
  return { merits: 0, demerits: 0, incidents: 0, points: 0, open: 0 };
}

export function addToTally(t: BehaviourTally, r: { kind: string; points: number; status: string }): BehaviourTally {
  if (r.kind === 'MERIT') t.merits++;
  else if (r.kind === 'DEMERIT') t.demerits++;
  else t.incidents++;
  t.points += r.points;
  if (r.kind !== 'MERIT' && r.status === 'OPEN') t.open++;
  return t;
}

export function tally(rows: { kind: string; points: number; status: string }[]): BehaviourTally {
  return rows.reduce(addToTally, emptyTally());
}

/** Merits count up, demerits and incidents count down, whatever sign was typed. */
export function signedPoints(kind: BehaviourKind, points: number): number {
  const n = Math.abs(Math.trunc(points));
  return kind === 'MERIT' ? n : -n;
}

/** Offset of a time zone from UTC at an instant, in milliseconds. */
function tzOffsetMs(timezone: string, at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant a school-local day (YYYY-MM-DD) begins. */
export function localDayStart(timezone: string, date: string): Date {
  const noon = new Date(`${date}T12:00:00.000Z`);
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - tzOffsetMs(timezone, noon));
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const FREE: Channel[] = ['IN_APP', 'PUSH'];

/** Shared by the behaviour log, the sick bay and the family portal. */
@Injectable()
export class WelfareService {
  private readonly logger = new Logger(WelfareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: SenderService,
  ) {}

  async school(): Promise<{ name: string; timezone: string }> {
    return this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true, timezone: true } });
  }

  async today(): Promise<string> {
    return schoolNow((await this.school()).timezone).date;
  }

  async currentTerm(): Promise<WelfareTermRef | null> {
    const db = this.prisma.db;
    const t =
      (await db.term.findFirst({ where: { isCurrent: true }, include: { session: { select: { name: true } } } })) ??
      (await db.term.findFirst({ orderBy: { startsOn: 'desc' }, include: { session: { select: { name: true } } } }));
    return t ? { id: t.id, name: t.name, sessionName: t.session.name, startsOn: dateOnly(t.startsOn)!, endsOn: dateOnly(t.endsOn)! } : null;
  }

  async termById(id: string): Promise<WelfareTermRef> {
    const t = await this.prisma.db.term.findUniqueOrThrow({ where: { id }, include: { session: { select: { name: true } } } });
    return { id: t.id, name: t.name, sessionName: t.session.name, startsOn: dateOnly(t.startsOn)!, endsOn: dateOnly(t.endsOn)! };
  }

  /** Senior staff (principal, VP, admin) may change anyone's record; teachers only their own. */
  isSenior(): boolean {
    const p = currentContext().permissions;
    return p.has('behaviour.manage') && p.has('students.manage');
  }

  canEdit(r: { reportedById: string | null }): boolean {
    const ctx = currentContext();
    if (!ctx.permissions.has('behaviour.manage')) return false;
    return this.isSenior() || (!!r.reportedById && r.reportedById === ctx.userId);
  }

  /** Names of the staff who recorded things, by user id. */
  async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map();
    const users = await this.prisma.root.user.findMany({ where: { id: { in: uniq } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  }

  async behaviourRows(rows: BehaviourWithStudent[]): Promise<BehaviourRow[]> {
    const names = await this.userNames(rows.map((r) => r.reportedById));
    return rows.map((r) => ({
      id: r.id,
      student: studentRef(r.student),
      date: dateOnly(r.date)!,
      kind: r.kind as BehaviourKind,
      category: r.category,
      title: r.title,
      description: r.description,
      points: r.points,
      severity: r.severity as BehaviourSeverity,
      actionTaken: r.actionTaken,
      status: r.status as BehaviourStatus,
      visibleToParents: r.visibleToParents,
      parentNotifiedAt: r.parentNotifiedAt?.toISOString() ?? null,
      reportedBy: r.reportedById ? { id: r.reportedById, name: names.get(r.reportedById) ?? 'Former staff' } : null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      canEdit: this.canEdit(r),
    }));
  }

  async visitRows(rows: VisitWithStudent[]): Promise<SickBayRow[]> {
    const names = await this.userNames(rows.map((r) => r.recordedById));
    return rows.map((v) => ({
      id: v.id,
      student: studentRef(v.student),
      visitedAt: v.visitedAt.toISOString(),
      complaint: v.complaint,
      temperature: v.temperature,
      assessment: v.assessment,
      treatment: v.treatment,
      medication: v.medication,
      outcome: v.outcome as SickBayOutcome,
      followUp: v.followUp,
      parentNotifiedAt: v.parentNotifiedAt?.toISOString() ?? null,
      recordedBy: v.recordedById ? { id: v.recordedById, name: names.get(v.recordedById) ?? 'Former staff' } : null,
      createdAt: v.createdAt.toISOString(),
    }));
  }

  /**
   * Messages a student's parents and guardians through the school's
   * messaging (in-app and push always; SMS and email for staff allowed to
   * send them). Never throws: the record is saved whatever happens here.
   */
  async notifyParents(
    studentId: string,
    requested: Channel[],
    m: { title: string; subject: string; body: string; sms: string },
  ): Promise<{ notified: number; notice: string | null }> {
    const allowed = requested.filter((c) => (WELFARE_NOTIFY_CHANNELS as readonly Channel[]).includes(c));
    const canPaid = currentContext().permissions.has('comms.send');
    const channels = canPaid ? allowed : allowed.filter((c) => FREE.includes(c));
    const notes: string[] = [];
    if (channels.length < allowed.length) notes.push('SMS and email need messaging permission, so parents were told in the app only');
    if (!channels.length) channels.push('IN_APP', 'PUSH');
    try {
      const links = await this.prisma.db.studentGuardian.findMany({ where: { studentId }, select: { guardianId: true } });
      if (!links.length) return { notified: 0, notice: 'No parent or guardian is on record for this student' };
      const tenantId = currentTenantId();
      const audience: Audience = { type: 'PEOPLE', guardianIds: links.map((l) => l.guardianId), staffIds: [] };
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
          // Written by a member of staff about one child.
          source: 'WELFARE',
          link: `/school/welfare/${studentId}`,
          createdById: currentContext().userId,
        },
      });
      await this.sender.start(tenantId, b.id);
      return { notified: links.length, notice: notes.join('. ') || null };
    } catch (err) {
      this.logger.warn(`Could not notify parents of ${studentId}: ${(err as Error).message}`);
      return { notified: 0, notice: `Saved, but parents could not be notified: ${(err as Error).message}` };
    }
  }

  /** "Monday 6 October" in the school's own calendar. */
  longDate(date: string): string {
    return new Date(`${date}T12:00:00.000Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }

  localTime(timezone: string, at: Date): string {
    return at.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }).replace(' ', ' ');
  }
}
