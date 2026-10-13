import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_DATA_PROTECTION_SETTINGS,
  GATE_PASS_PREFIX,
  PRIVACY_NOTICE_VERSION,
  asLanguage,
  delegateCodeSms,
  gateAlertText,
  normaliseGateSettings,
  normalisePhone,
  smsInfo,
  smsSafe,
  type Audience,
  type AuthorisedPickupInput,
  type AuthorisedPickupRow,
  type CollectInput,
  type CollectResult,
  type GateAlertFacts,
  type GateAlertKind,
  type GateChild,
  type GateEventRow,
  type GateMethod,
  type GatePassBatch,
  type GateScanInput,
  type GateScanResult,
  type GateSettings,
  type GateSettingsView,
  type GateToday,
  type PickupNoticeInput,
  type PickupNoticeResult,
  type PickupNoticeRow,
  type PortalArrival,
} from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { ChannelsService } from '../comms/channels.service';
import { SenderService } from '../comms/sender.service';
import { decryptSecret, encryptSecret } from '../common/crypto-box';
import { dateOnly, fullName, parseDate } from '../common/format';
import { onRegisterSaved, type RegisterSaved } from '../common/register-hooks';
import { schoolNow, weekdayOf, type SchoolNow } from '../common/school-time';
import { registerTickTask } from '../common/tick-tasks';
import { env } from '../config/env';
import { armLabel } from '../operations/operations.service';
import { PrismaService } from '../prisma/prisma.service';
import { bellScheduleFor } from '../timetable/timetable-builder';

/** In "auto" mode a second scan this soon after arriving is a double scan, not a departure. */
const MIN_MINUTES_BEFORE_LEAVE = 30;
/** …and a scan this soon after leaving is a double scan too. */
const MIN_MINUTES_AFTER_LEAVE = 10;
/** Wrong pick-up code attempts before the code is locked (the parent can send a new one). */
const MAX_CODE_ATTEMPTS = 5;
/** Delegate notices (each may send an SMS) per child per day. */
const MAX_DELEGATES_PER_DAY = 3;
const PASS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const studentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
  status: true,
  classArmId: true,
  classArm: { select: { name: true, classLevel: { select: { name: true } } } },
} satisfies Prisma.StudentSelect;
type StudentLite = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;
type EventRow = Prisma.StudentGateEventGetPayload<object>;
type NoticeRow = Prisma.PickupNoticeGetPayload<object>;
type PersonRow = Prisma.AuthorisedPickupGetPayload<object>;

interface School {
  tenantId: string;
  name: string;
  shortName: string | null;
  timezone: string;
  currency: string;
  settings: GateSettings;
  now: SchoolNow;
  days: number[];
}

/** "07:42" → "7:42" */
const clock = (t: string) => t.replace(/^0(\d)/, '$1');
const minutesBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60_000;
const shortDate = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const longDate = (d: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const FILE_URL = /^\/api\/files\/([a-z0-9]+)$/;

/**
 * Students' arrivals and departures, parent alerts and secure pick-up.
 * Works with explicit tenant ids (prisma.root) because the absence check
 * runs on the scheduler's tick, outside any request.
 */
@Injectable()
export class GateService implements OnModuleInit {
  private readonly logger = new Logger(GateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: SenderService,
    private readonly channels: ChannelsService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
  ) {}

  onModuleInit() {
    registerTickTask('gateAbsenceAlerts', () => this.absenceSweep());
    onRegisterSaved('gate', (e) => this.fromRegister(e));
  }

  // ---------------------------------------------------------------- context

  async school(tenantId: string): Promise<School> {
    const [t, bell] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, shortName: true, timezone: true, currency: true, gateSettings: true } }),
      bellScheduleFor(this.prisma.root, tenantId),
    ]);
    return { tenantId, name: t.name, shortName: t.shortName, timezone: t.timezone, currency: t.currency, settings: normaliseGateSettings(t.gateSettings), now: schoolNow(t.timezone), days: bell.days };
  }

  private localTime(s: School, at: Date) {
    return clock(schoolNow(s.timezone, at).time);
  }

  async settingsView(tenantId: string): Promise<GateSettingsView> {
    const s = await this.school(tenantId);
    const db = this.prisma.root;
    const [comms, statuses, guardians] = await Promise.all([
      this.sender.school(tenantId),
      this.channels.status(tenantId),
      db.guardian.findMany({ where: { tenantId, smsOptOutAt: null, students: { some: { student: { status: 'ACTIVE' } } } }, select: { phone: true } }),
    ]);
    const on = (c: string) => statuses.find((x) => x.channel === c)?.configured ?? false;
    const parentsWithPhone = guardians.filter((g) => !!normalisePhone(g.phone)).length;
    // Per parent per school day: arrival and departure every day; lateness and absence now and then (rough guesses).
    const perDay = (['ARRIVE', 'LEAVE', 'LATE', 'ABSENT'] as const).reduce(
      (n, k) => n + (s.settings.alerts[k].enabled && s.settings.alerts[k].channels.includes('SMS') ? ({ ARRIVE: 1, LEAVE: 1, LATE: 0.1, ABSENT: 0.05 } as const)[k] : 0),
      0,
    );
    const smsPerMonth = Math.round(parentsWithPhone * perDay * 20);
    return {
      settings: s.settings,
      channels: { sms: on('SMS'), whatsapp: on('WHATSAPP'), push: on('PUSH') },
      smsPricePerUnitKobo: comms.settings.smsPricePerUnitKobo,
      currency: s.currency,
      estimate: { parentsWithPhone, smsPerMonth, monthlyKobo: smsPerMonth * comms.settings.smsPricePerUnitKobo },
    };
  }

  async saveSettings(tenantId: string, settings: GateSettings): Promise<GateSettingsView> {
    await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { gateSettings: settings as unknown as Prisma.InputJsonValue } });
    const on = (Object.keys(settings.alerts) as GateAlertKind[]).filter((k) => settings.alerts[k].enabled);
    const sms = on.filter((k) => settings.alerts[k].channels.includes('SMS'));
    await this.audit.log({
      action: 'gate.settings',
      entityType: 'Tenant',
      entityId: tenantId,
      summary: `Gate & pick-up settings: late after ${settings.studentLateAfter}, home time ${settings.homeTime}; parent alerts ${on.length ? on.join(', ').toLowerCase() : 'off'}${sms.length ? ` (SMS for ${sms.join(', ').toLowerCase()})` : ''}`,
    });
    return this.settingsView(tenantId);
  }

  // ---------------------------------------------------------------- rows

  private async names(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map();
    const users = await this.prisma.root.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, fullName(u)]));
  }

  private studentRef(st: StudentLite) {
    return { id: st.id, name: fullName(st), firstName: st.firstName, classArm: armLabel(st.classArm), photoUrl: st.photoUrl };
  }

  private async eventRows(tenantId: string, events: EventRow[]): Promise<GateEventRow[]> {
    if (!events.length) return [];
    const db = this.prisma.root;
    const [students, names, pickups] = await Promise.all([
      db.student.findMany({ where: { tenantId, id: { in: [...new Set(events.map((e) => e.studentId))] } }, select: studentSelect }),
      this.names(events.map((e) => e.recordedById)),
      db.studentPickup.findMany({ where: { tenantId, id: { in: events.map((e) => e.pickupId).filter((x): x is string => !!x) } }, select: { id: true, collectedBy: true, relationship: true } }),
    ]);
    const byId = new Map(students.map((s) => [s.id, s]));
    const pick = new Map(pickups.map((p) => [p.id, `${p.collectedBy} (${p.relationship})`]));
    return events
      .filter((e) => byId.has(e.studentId))
      .map((e) => ({
        id: e.id,
        student: this.studentRef(byId.get(e.studentId)!),
        type: e.type as GateEventRow['type'],
        method: e.method as GateMethod,
        at: e.at.toISOString(),
        late: e.late,
        gate: e.gate,
        recordedBy: e.recordedById ? (names.get(e.recordedById) ?? null) : null,
        undone: !!e.undoneAt,
        collectedBy: e.pickupId ? (pick.get(e.pickupId) ?? null) : null,
      }));
  }

  personRow(p: PersonRow, today: string): AuthorisedPickupRow {
    const validUntil = dateOnly(p.validUntil);
    return {
      id: p.id,
      studentId: p.studentId,
      name: p.name,
      relationship: p.relationship,
      phone: p.phone,
      hasPhoto: !!p.photoUrl,
      validUntil,
      active: p.active,
      expired: !p.active || (!!validUntil && validUntil < today),
      addedBy: p.addedBy === 'PARENT' ? 'PARENT' : 'STAFF',
    };
  }

  private noticeRow(n: NoticeRow, names: Map<string, string>, forParent: boolean): PickupNoticeRow {
    let code: string | null = null;
    if (forParent && n.codeSecret && !n.codeUsedAt && !n.cancelledAt) {
      try {
        code = decryptSecret(n.codeSecret);
      } catch {
        code = null;
      }
    }
    return {
      id: n.id,
      studentId: n.studentId,
      kind: n.kind as PickupNoticeRow['kind'],
      eta: n.eta,
      note: n.note,
      delegate:
        n.kind === 'DELEGATE' && n.delegateName
          ? { name: n.delegateName, relationship: n.delegateRelationship ?? '', phone: n.delegatePhone, hasPhoto: !!n.delegatePhotoUrl, authorisedPickupId: n.authorisedPickupId }
          : null,
      needsCode: !!n.codeHash,
      code,
      codeUsed: !!n.codeUsedAt,
      codeSms: n.codeSms,
      createdAt: n.createdAt.toISOString(),
      createdBy: n.createdById ? (names.get(n.createdById) ?? null) : null,
      cancelled: !!n.cancelledAt,
    };
  }

  // ---------------------------------------------------------------- day state

  private async eventsToday(tenantId: string, date: string, studentIds?: string[]) {
    return this.prisma.root.studentGateEvent.findMany({
      where: { tenantId, date: parseDate(date), undoneAt: null, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
      orderBy: { at: 'asc' },
    });
  }

  /** Arrival, lateness and departure per child from the day's (not undone) events. */
  private dayState(events: EventRow[]) {
    const out = new Map<string, { arrive: EventRow | null; last: EventRow }>();
    for (const e of events) {
      const cur = out.get(e.studentId);
      out.set(e.studentId, { arrive: cur?.arrive ?? (e.type === 'ARRIVE' ? e : null), last: e });
    }
    return out;
  }

  // ---------------------------------------------------------------- scanning

  /** The child a scanned code belongs to: a gate pass, or an ID card's verify link (both from this school). */
  private async resolveCode(tenantId: string, raw: string): Promise<string> {
    const code = raw.trim();
    const pass = code.toUpperCase().startsWith(GATE_PASS_PREFIX) ? code.slice(GATE_PASS_PREFIX.length).trim().toUpperCase() : /^[A-Z0-9]{12,20}$/i.test(code) ? code.toUpperCase() : null;
    if (pass) {
      const s = await this.prisma.root.student.findFirst({ where: { tenantId, gateToken: pass }, select: { id: true } });
      if (s) return s.id;
    }
    const idToken = /\/verify\/id\/([A-Za-z0-9_\-.]+)/.exec(code)?.[1];
    if (idToken) {
      try {
        const p = await this.jwt.verifyAsync<{ typ: string; tid: string; k: string; id: string }>(idToken);
        if (p.typ === 'idcard' && p.tid === tenantId && p.k === 'S') return p.id;
        if (p.typ === 'idcard' && p.k === 'T') throw new BadRequestException('That is a staff ID card. Staff use the check-in kiosk.');
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
      }
    }
    throw new NotFoundException('This pass is not recognised. Search for the child by name instead.');
  }

  async scan(tenantId: string, userId: string, input: GateScanInput): Promise<GateScanResult> {
    const s = await this.school(tenantId);
    const db = this.prisma.root;
    const studentId = input.code ? await this.resolveCode(tenantId, input.code) : input.studentId!;
    const student = await db.student.findFirst({ where: { tenantId, id: studentId }, select: studentSelect });
    if (!student) throw new NotFoundException('Student not found');
    if (student.status !== 'ACTIVE') throw new BadRequestException(`${fullName(student)} is not an active student`);
    const today = s.now.date;
    const events = await this.eventsToday(tenantId, today, [student.id]);
    const last = events.at(-1) ?? null;
    const now = new Date();
    const notices = await this.noticesFor(tenantId, today, [student.id], false);
    const dup = (message: string): GateScanResult => ({ outcome: 'DUPLICATE', message, event: null, notices });

    let type = input.type;
    if (!type) {
      if (!last || last.type === 'LEAVE') {
        if (last && minutesBetween(now, last.at) < MIN_MINUTES_AFTER_LEAVE) return dup(`${student.firstName} already left at ${this.localTime(s, last.at)}.`);
        type = 'ARRIVE';
      } else {
        if (last.method === 'REGISTER' && s.now.time < s.settings.homeTime) return dup(`${student.firstName} is already marked present on the class register. Choose “Leaving” to sign them out.`);
        if (minutesBetween(now, last.at) < MIN_MINUTES_BEFORE_LEAVE) return dup(`${student.firstName} already arrived at ${this.localTime(s, last.at)}.`);
        type = 'LEAVE';
      }
    }
    const firstArrival = type === 'ARRIVE' && !events.some((e) => e.type === 'ARRIVE');
    const late = firstArrival && s.now.time > s.settings.studentLateAfter;
    const e = await db.studentGateEvent.create({
      data: { tenantId, studentId: student.id, type, date: parseDate(today), at: now, method: input.code ? 'SCAN' : 'MANUAL', gate: input.gate ?? null, late, recordedById: userId },
    });
    if (!input.code) {
      await this.audit.log({ action: type === 'ARRIVE' ? 'gate.arrive_manual' : 'gate.leave_manual', entityType: 'Student', entityId: student.id, summary: `${fullName(student)} ${type === 'ARRIVE' ? 'signed in' : 'signed out'} at the gate by hand` });
    }
    const time = this.localTime(s, now);
    if (firstArrival) await this.alert(s, student.id, { kind: late ? 'LATE' : 'ARRIVE', time }, student.id, late ? 'ARRIVE' : null);
    if (type === 'LEAVE') await this.alert(s, student.id, { kind: 'LEAVE', time }, student.id);
    const [row] = await this.eventRows(tenantId, [e]);
    return {
      outcome: type === 'ARRIVE' ? 'ARRIVED' : 'LEFT',
      message: type === 'ARRIVE' ? `${student.firstName} arrived at ${time}${late ? ' — late' : ''}` : `${student.firstName} left at ${time}`,
      event: row!,
      notices,
    };
  }

  async undo(tenantId: string, userId: string, eventId: string): Promise<GateEventRow> {
    const s = await this.school(tenantId);
    const e = await this.prisma.root.studentGateEvent.findFirst({ where: { tenantId, id: eventId } });
    if (!e) throw new NotFoundException('Event not found');
    if (e.undoneAt) throw new BadRequestException('This has already been undone');
    if (dateOnly(e.date) !== s.now.date) throw new BadRequestException('Only today’s arrivals and departures can be undone');
    if (e.pickupId) throw new BadRequestException('This departure is a recorded pick-up and stays in the pick-up log');
    const done = await this.prisma.root.studentGateEvent.update({ where: { id: e.id }, data: { undoneAt: new Date(), undoneById: userId } });
    const st = await this.prisma.root.student.findFirstOrThrow({ where: { tenantId, id: e.studentId }, select: { firstName: true, lastName: true } });
    await this.audit.log({ action: 'gate.undo', entityType: 'Student', entityId: e.studentId, summary: `Undid ${fullName(st)}’s ${e.type === 'ARRIVE' ? 'arrival' : 'departure'} at ${this.localTime(s, e.at)} (any alert already sent to parents stays sent)` });
    return (await this.eventRows(tenantId, [done]))[0]!;
  }

  /** The class register: "present" or "late" counts as arriving when the child wasn't scanned. */
  async fromRegister(e: RegisterSaved): Promise<void> {
    const s = await this.school(e.tenantId);
    if (e.date !== s.now.date) return;
    const db = this.prisma.root;
    const ids = e.marks.map((m) => m.studentId);
    const events = await this.eventsToday(e.tenantId, e.date, ids);
    const state = this.dayState(events);
    const now = new Date();
    const time = this.localTime(s, now);
    for (const m of e.marks) {
      const st = state.get(m.studentId);
      if (m.status === 'ABSENT') {
        // The teacher corrected a mark: a register-made arrival goes.
        const fromRegister = events.filter((x) => x.studentId === m.studentId && x.method === 'REGISTER');
        if (fromRegister.length) await db.studentGateEvent.updateMany({ where: { id: { in: fromRegister.map((x) => x.id) } }, data: { undoneAt: now } });
        continue;
      }
      if (m.status !== 'PRESENT' && m.status !== 'LATE') continue;
      if (st?.arrive) continue;
      if (!s.settings.registerCountsAsArrival) continue;
      await db.studentGateEvent.create({
        data: { tenantId: e.tenantId, studentId: m.studentId, type: 'ARRIVE', date: parseDate(e.date), at: now, method: 'REGISTER', late: m.status === 'LATE', recordedById: null },
      });
      await this.alert(s, m.studentId, { kind: m.status === 'LATE' ? 'LATE' : 'ARRIVE', time, viaRegister: true }, m.studentId, m.status === 'LATE' ? 'ARRIVE' : null);
    }
  }

  // ---------------------------------------------------------------- today (gate screen)

  async today(tenantId: string): Promise<GateToday> {
    const s = await this.school(tenantId);
    const db = this.prisma.root;
    const date = s.now.date;
    const [events, recentRaw, active, notices] = await Promise.all([
      this.eventsToday(tenantId, date),
      db.studentGateEvent.findMany({ where: { tenantId, date: parseDate(date) }, orderBy: { at: 'desc' }, take: 30 }),
      db.student.count({ where: { tenantId, status: 'ACTIVE' } }),
      db.pickupNotice.findMany({ where: { tenantId, date: parseDate(date), cancelledAt: null }, orderBy: { createdAt: 'desc' } }),
    ]);
    const state = this.dayState(events);
    let arrived = 0;
    let late = 0;
    let left = 0;
    const inSchool: string[] = [];
    for (const [id, st] of state) {
      if (st.arrive) arrived++;
      if (st.arrive?.late) late++;
      if (st.last.type === 'LEAVE') left++;
      else inSchool.push(id);
    }
    const noticeIds = [...new Set(notices.map((n) => n.studentId))];
    const dueIds = [...new Set([...noticeIds.filter((id) => state.get(id)?.last.type !== 'LEAVE'), ...inSchool])].slice(0, 300);
    const due = await this.children(s, dueIds, events, notices);
    const names = await this.names(notices.map((n) => n.createdById));
    const students = new Map((await db.student.findMany({ where: { tenantId, id: { in: noticeIds } }, select: studentSelect })).map((x) => [x.id, x]));
    return {
      date,
      time: s.now.time,
      schoolDay: s.days.includes(weekdayOf(date)),
      settings: { studentLateAfter: s.settings.studentLateAfter, homeTime: s.settings.homeTime, gates: s.settings.gates, registerCountsAsArrival: s.settings.registerCountsAsArrival },
      counts: { arrived, late, left, inSchool: inSchool.length, active },
      recent: await this.eventRows(tenantId, recentRaw),
      notices: notices
        .filter((n) => students.has(n.studentId))
        .map((n) => {
          const st = students.get(n.studentId)!;
          return { ...this.noticeRow(n, names, false), student: { id: st.id, name: fullName(st), classArm: armLabel(st.classArm) } };
        }),
      due: due.sort((a, b) => Number(b.notices.length > 0) - Number(a.notices.length > 0) || (a.classArm ?? '').localeCompare(b.classArm ?? '') || a.name.localeCompare(b.name)),
    };
  }

  async search(tenantId: string, q: string): Promise<GateChild[]> {
    const s = await this.school(tenantId);
    const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 3);
    if (!words.length) return [];
    const rows = await this.prisma.root.student.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: 'insensitive' as const } }, { lastName: { contains: w, mode: 'insensitive' as const } }, { admissionNumber: { contains: w, mode: 'insensitive' as const } }] })),
      },
      select: { id: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 15,
    });
    return this.children(s, rows.map((r) => r.id));
  }

  async child(tenantId: string, studentId: string): Promise<GateChild> {
    const s = await this.school(tenantId);
    const [c] = await this.children(s, [studentId]);
    if (!c) throw new NotFoundException('Student not found');
    return c;
  }

  private async children(s: School, ids: string[], dayEvents?: EventRow[], dayNotices?: NoticeRow[]): Promise<GateChild[]> {
    if (!ids.length) return [];
    const db = this.prisma.root;
    const tenantId = s.tenantId;
    const date = s.now.date;
    const [students, events, people, notices] = await Promise.all([
      db.student.findMany({
        where: { tenantId, id: { in: ids } },
        select: { ...studentSelect, guardians: { orderBy: { isPrimary: 'desc' }, select: { guardian: { select: { id: true, firstName: true, lastName: true, relationship: true, phone: true } } } } },
      }),
      dayEvents ? Promise.resolve(dayEvents.filter((e) => ids.includes(e.studentId))) : this.eventsToday(tenantId, date, ids),
      db.authorisedPickup.findMany({ where: { tenantId, studentId: { in: ids } }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      dayNotices ? Promise.resolve(dayNotices.filter((n) => ids.includes(n.studentId))) : db.pickupNotice.findMany({ where: { tenantId, studentId: { in: ids }, date: parseDate(date), cancelledAt: null }, orderBy: { createdAt: 'desc' } }),
    ]);
    const state = this.dayState(events);
    const pickups = await db.studentPickup.findMany({ where: { tenantId, id: { in: events.map((e) => e.pickupId).filter((x): x is string => !!x) } }, select: { id: true, collectedBy: true, relationship: true } });
    const pick = new Map(pickups.map((p) => [p.id, `${p.collectedBy} (${p.relationship})`]));
    const names = await this.names(notices.map((n) => n.createdById));
    return students.map((st) => {
      const d = state.get(st.id);
      const leave = d && d.last.type === 'LEAVE' ? d.last : null;
      return {
        ...this.studentRef(st),
        arrivedAt: d?.arrive?.at.toISOString() ?? null,
        arrivedVia: (d?.arrive?.method as GateMethod | undefined) ?? null,
        late: d?.arrive?.late ?? false,
        leftAt: leave?.at.toISOString() ?? null,
        collectedBy: leave?.pickupId ? (pick.get(leave.pickupId) ?? null) : null,
        guardians: st.guardians.map(({ guardian: g }) => ({ id: g.id, name: fullName(g), relationship: g.relationship, phone: g.phone })),
        authorised: people.filter((p) => p.studentId === st.id).map((p) => this.personRow(p, date)),
        notices: notices.filter((n) => n.studentId === st.id).map((n) => this.noticeRow(n, names, false)),
      };
    });
  }

  private async noticesFor(tenantId: string, date: string, studentIds: string[], forParent: boolean): Promise<PickupNoticeRow[]> {
    const rows = await this.prisma.root.pickupNotice.findMany({ where: { tenantId, studentId: { in: studentIds }, date: parseDate(date), cancelledAt: null }, orderBy: { createdAt: 'desc' } });
    const names = await this.names(rows.map((r) => r.createdById));
    return rows.map((r) => this.noticeRow(r, names, forParent));
  }

  // ---------------------------------------------------------------- collection

  /** Records a child being collected (home time or early), checked against the guardians, the authorised list or a one-time code. */
  async collect(tenantId: string, userId: string, input: CollectInput): Promise<CollectResult> {
    const s = await this.school(tenantId);
    const db = this.prisma.root;
    const today = s.now.date;
    const student = await db.student.findFirst({
      where: { tenantId, id: input.studentId },
      select: { ...studentSelect, guardians: { select: { guardian: { select: { id: true, firstName: true, lastName: true, relationship: true, phone: true } } } } },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (student.status !== 'ACTIVE') throw new BadRequestException(`${fullName(student)} is not an active student`);
    if (input.kind === 'EARLY' && !input.reason) throw new BadRequestException('Give a reason for the early pick-up');

    let who: { name: string; relationship: string; phone: string | null };
    let verification: CollectResult['verification'];
    const extra: { guardianId?: string; authorisedPickupId?: string; noticeId?: string; overrideReason?: string } = {};
    const by = input.by;
    if (by.type === 'GUARDIAN') {
      const g = student.guardians.find((x) => x.guardian.id === by.guardianId)?.guardian;
      if (!g) throw new BadRequestException('That person is not one of this child’s parents or guardians');
      who = { name: fullName(g), relationship: g.relationship, phone: g.phone };
      verification = 'GUARDIAN';
      extra.guardianId = g.id;
    } else if (by.type === 'AUTHORISED') {
      const p = await db.authorisedPickup.findFirst({ where: { tenantId, id: by.authorisedPickupId, studentId: student.id } });
      if (!p) throw new BadRequestException('That person is not on this child’s pick-up list');
      if (this.personRow(p, today).expired) throw new BadRequestException(`${p.name} is no longer authorised${p.validUntil ? ` (valid until ${dateOnly(p.validUntil)})` : ''}. Record an override with a reason if you release the child.`);
      who = { name: p.name, relationship: p.relationship, phone: p.phone };
      verification = 'AUTHORISED';
      extra.authorisedPickupId = p.id;
    } else if (by.type === 'CODE') {
      const n = await db.pickupNotice.findFirst({ where: { tenantId, id: by.noticeId, studentId: student.id, kind: 'DELEGATE' } });
      if (!n || !n.codeHash || n.cancelledAt) throw new BadRequestException('There is no pick-up code for this child today');
      if (dateOnly(n.date) !== today) throw new BadRequestException('This pick-up code was for another day');
      if (n.codeUsedAt) throw new BadRequestException('This pick-up code has already been used');
      if (n.codeAttempts >= MAX_CODE_ATTEMPTS) throw new BadRequestException('Too many wrong codes. Ask the parent to send a new one, or call them.');
      if (!this.codeMatches(n, by.code)) {
        await db.pickupNotice.update({ where: { id: n.id }, data: { codeAttempts: { increment: 1 } } });
        const left = MAX_CODE_ATTEMPTS - n.codeAttempts - 1;
        await this.audit.log({ action: 'gate.pickup_code_wrong', entityType: 'Student', entityId: student.id, summary: `Wrong pick-up code entered for ${fullName(student)} (${left} tries left)` });
        throw new BadRequestException(left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That code is not right, and the code is now locked. Call the parent.');
      }
      const claimed = await db.pickupNotice.updateMany({ where: { id: n.id, codeUsedAt: null }, data: { codeUsedAt: new Date() } });
      if (!claimed.count) throw new BadRequestException('This pick-up code has already been used');
      who = { name: n.delegateName ?? 'Delegate', relationship: n.delegateRelationship ?? 'Delegate', phone: n.delegatePhone };
      verification = 'CODE';
      extra.noticeId = n.id;
      if (n.authorisedPickupId) extra.authorisedPickupId = n.authorisedPickupId;
    } else {
      who = { name: by.name, relationship: by.relationship, phone: by.phone };
      verification = 'OVERRIDE';
      extra.overrideReason = by.overrideReason;
    }

    const p = await db.studentPickup.create({
      data: {
        tenantId,
        studentId: student.id,
        collectedBy: who.name,
        relationship: who.relationship,
        phone: who.phone,
        reason: input.kind === 'EARLY' ? input.reason! : (input.reason ?? 'End of the school day'),
        onRecord: verification !== 'OVERRIDE',
        kind: input.kind,
        verification,
        recordedById: userId,
        ...extra,
      },
    });
    await this.audit.log({
      action: verification === 'OVERRIDE' ? 'gate.pickup_override' : 'reception.pickup',
      entityType: 'Student',
      entityId: student.id,
      summary:
        verification === 'OVERRIDE'
          ? `${fullName(student)} released to ${who.name} (${who.relationship}), who is NOT on the pick-up list — reason: ${extra.overrideReason}`
          : `${fullName(student)} collected ${input.kind === 'EARLY' ? 'early ' : ''}by ${who.name} (${who.relationship}; checked: ${verification === 'CODE' ? 'one-time code' : verification === 'GUARDIAN' ? 'parent/guardian' : 'authorised list'})`,
      metadata: { pickupId: p.id, verification },
    });
    const event = await this.leaveForPickup(s, p.id, student.id, `${who.name} (${who.relationship})`, userId);
    return {
      message: `${student.firstName} collected by ${who.name} at ${this.localTime(s, p.at)}`,
      event,
      verification,
    };
  }

  /** The reception desk's free-text early pick-up log also signs the child out and tells the parents. */
  async afterReceptionPickup(tenantId: string, pickupId: string): Promise<void> {
    const s = await this.school(tenantId);
    const p = await this.prisma.root.studentPickup.findFirstOrThrow({ where: { tenantId, id: pickupId } });
    if (!p.verification) await this.prisma.root.studentPickup.update({ where: { id: p.id }, data: { verification: 'UNVERIFIED' } });
    await this.leaveForPickup(s, p.id, p.studentId, `${p.collectedBy} (${p.relationship})`, p.recordedById);
  }

  private async leaveForPickup(s: School, pickupId: string, studentId: string, collectedBy: string, userId: string | null): Promise<GateEventRow> {
    const now = new Date();
    const e = await this.prisma.root.studentGateEvent.create({
      data: { tenantId: s.tenantId, studentId, type: 'LEAVE', date: parseDate(s.now.date), at: now, method: 'PICKUP', pickupId, recordedById: userId },
    });
    // Every collection is reported (it says who); it also stands in for the day's plain "left school" alert.
    await this.alert(s, studentId, { kind: 'LEAVE', time: this.localTime(s, now), collectedBy }, `pickup:${pickupId}`);
    await this.once(s.tenantId, 'GATE_LEAVE', studentId, s.now.date);
    return (await this.eventRows(s.tenantId, [e]))[0]!;
  }

  private codeHash(tenantId: string, studentId: string, date: string, code: string) {
    return createHmac('sha256', env().JWT_SECRET).update(`pickup:${tenantId}:${studentId}:${date}:${code}`).digest('hex');
  }

  private codeMatches(n: NoticeRow, code: string): boolean {
    const want = Buffer.from(n.codeHash!, 'hex');
    const got = Buffer.from(this.codeHash(n.tenantId, n.studentId, dateOnly(n.date)!, code), 'hex');
    return want.length === got.length && timingSafeEqual(want, got);
  }

  // ---------------------------------------------------------------- authorised people

  async people(tenantId: string, studentId: string): Promise<AuthorisedPickupRow[]> {
    const s = await this.school(tenantId);
    const rows = await this.prisma.root.authorisedPickup.findMany({ where: { tenantId, studentId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    return rows.map((r) => this.personRow(r, s.now.date));
  }

  /** A photo the caller uploaded (parents) or any image in the school (staff), as /api/files/<id>. */
  private async photoUrl(tenantId: string, fileId: string | null | undefined, uploaderOnly: string | null): Promise<string | null | undefined> {
    if (fileId === undefined) return undefined;
    if (fileId === null) return null;
    const f = await this.prisma.root.fileObject.findFirst({ where: { tenantId, id: fileId }, select: { id: true, mimeType: true, uploadedById: true } });
    if (!f || !f.mimeType.startsWith('image/') || (uploaderOnly && f.uploadedById !== uploaderOnly)) throw new BadRequestException('Upload a photo (JPG, PNG or WebP) first');
    return `/api/files/${f.id}`;
  }

  async savePerson(tenantId: string, studentId: string, input: AuthorisedPickupInput, by: { userId: string; role: 'PARENT' | 'STAFF' }, id?: string): Promise<AuthorisedPickupRow> {
    const s = await this.school(tenantId);
    const db = this.prisma.root;
    const student = await db.student.findFirst({ where: { tenantId, id: studentId }, select: { firstName: true, lastName: true } });
    if (!student) throw new NotFoundException('Student not found');
    if (input.phone && !normalisePhone(input.phone)) throw new BadRequestException('Enter a valid phone number, e.g. 0803 123 4567');
    const photoUrl = await this.photoUrl(tenantId, input.photoFileId, by.role === 'PARENT' ? by.userId : null);
    const data = {
      name: input.name,
      relationship: input.relationship,
      phone: input.phone || null,
      validUntil: input.validUntil ? parseDate(input.validUntil) : null,
      active: input.active,
      ...(photoUrl !== undefined ? { photoUrl } : {}),
    };
    let row: PersonRow;
    if (id) {
      const existing = await db.authorisedPickup.findFirst({ where: { tenantId, id, studentId } });
      if (!existing) throw new NotFoundException('Not found');
      row = await db.authorisedPickup.update({ where: { id }, data });
    } else {
      const count = await db.authorisedPickup.count({ where: { tenantId, studentId, active: true } });
      if (count >= 15) throw new BadRequestException('A child can have up to 15 people on the pick-up list');
      row = await db.authorisedPickup.create({ data: { ...data, tenantId, studentId, addedBy: by.role, addedById: by.userId } });
    }
    await this.audit.log({
      action: id ? 'gate.pickup_person_updated' : 'gate.pickup_person_added',
      entityType: 'Student',
      entityId: studentId,
      summary: `${by.role === 'PARENT' ? 'Parent' : 'Staff'} ${id ? 'updated' : 'added'} ${input.name} (${input.relationship}) ${input.active ? 'on' : 'as inactive on'} ${fullName(student)}’s pick-up list`,
    });
    return this.personRow(row, s.now.date);
  }

  async removePerson(tenantId: string, studentId: string, id: string, by: { role: 'PARENT' | 'STAFF' }): Promise<void> {
    const p = await this.prisma.root.authorisedPickup.findFirst({ where: { tenantId, id, studentId } });
    if (!p) throw new NotFoundException('Not found');
    // Kept (inactive) so the pick-up log still makes sense; parents' and staff's removals are audited.
    await this.prisma.root.authorisedPickup.update({ where: { id }, data: { active: false } });
    await this.audit.log({ action: 'gate.pickup_person_removed', entityType: 'Student', entityId: studentId, summary: `${by.role === 'PARENT' ? 'Parent' : 'Staff'} removed ${p.name} (${p.relationship}) from the pick-up list` });
  }

  /** The stored photo of an authorised person or a delegate (only for callers already checked). */
  async photoFile(tenantId: string, kind: 'person' | 'notice', id: string): Promise<{ fileId: string; studentId: string }> {
    const db = this.prisma.root;
    const row =
      kind === 'person'
        ? await db.authorisedPickup.findFirst({ where: { tenantId, id }, select: { photoUrl: true, studentId: true } })
        : await db.pickupNotice.findFirst({ where: { tenantId, id }, select: { delegatePhotoUrl: true, studentId: true } }).then((n) => (n ? { photoUrl: n.delegatePhotoUrl, studentId: n.studentId } : null));
    const fileId = row?.photoUrl ? FILE_URL.exec(row.photoUrl)?.[1] : null;
    if (!row || !fileId) throw new NotFoundException('No photo');
    return { fileId, studentId: row.studentId };
  }

  // ---------------------------------------------------------------- parent notices

  async createNotice(tenantId: string, studentId: string, input: PickupNoticeInput, parent: { userId: string; guardianId: string; name: string }): Promise<PickupNoticeResult> {
    const s = await this.school(tenantId);
    const db = this.prisma.root;
    const today = s.now.date;
    const student = await db.student.findFirst({ where: { tenantId, id: studentId }, select: { ...studentSelect, classArm: { select: { name: true, classLevel: { select: { name: true } }, classTeacher: { select: { userId: true } } } } } });
    if (!student) throw new NotFoundException('Student not found');
    const base = { tenantId, studentId, date: parseDate(today), kind: input.kind, guardianId: parent.guardianId, createdById: parent.userId, note: input.note ?? null, eta: input.eta ?? null };
    let message: string;
    let notice: NoticeRow;
    if (input.kind !== 'DELEGATE') {
      notice = await db.pickupNotice.create({ data: base });
      message = input.kind === 'RUNNING_LATE' ? `The school knows you’re running late (about ${input.eta}).` : `The school knows you’ll collect ${student.firstName} at ${input.eta} today.`;
    } else {
      if (!!input.authorisedPickupId === !!input.delegate) throw new BadRequestException('Choose someone from the list, or add a new person');
      const already = await db.pickupNotice.count({ where: { tenantId, studentId, date: parseDate(today), kind: 'DELEGATE' } });
      if (already >= MAX_DELEGATES_PER_DAY) throw new BadRequestException(`You can name up to ${MAX_DELEGATES_PER_DAY} people a day. Please call the school.`);
      let who: { name: string; relationship: string; phone: string | null; photoUrl: string | null; authorisedPickupId: string | null };
      if (input.authorisedPickupId) {
        const p = await db.authorisedPickup.findFirst({ where: { tenantId, id: input.authorisedPickupId, studentId } });
        if (!p || this.personRow(p, today).expired) throw new BadRequestException('That person is not on the pick-up list (or is no longer authorised)');
        who = { name: p.name, relationship: p.relationship, phone: p.phone, photoUrl: p.photoUrl, authorisedPickupId: p.id };
      } else {
        const d = input.delegate!;
        if (!normalisePhone(d.phone)) throw new BadRequestException('Enter their phone number, e.g. 0803 123 4567, so we can text them the code');
        who = { name: d.name, relationship: d.relationship, phone: d.phone, photoUrl: (await this.photoUrl(tenantId, d.photoFileId ?? null, parent.userId)) ?? null, authorisedPickupId: null };
      }
      // One person collects: an earlier unused delegate for today is replaced.
      await db.pickupNotice.updateMany({ where: { tenantId, studentId, date: parseDate(today), kind: 'DELEGATE', cancelledAt: null, codeUsedAt: null }, data: { cancelledAt: new Date() } });
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      notice = await db.pickupNotice.create({
        data: {
          ...base,
          authorisedPickupId: who.authorisedPickupId,
          delegateName: who.name,
          delegateRelationship: who.relationship,
          delegatePhone: who.phone,
          delegatePhotoUrl: who.photoUrl,
          codeHash: this.codeHash(tenantId, studentId, today, code),
          codeSecret: encryptSecret(code),
        },
      });
      const sms = await this.sendDelegateCode(s, notice, { childName: student.firstName, parentName: parent.name, code });
      notice = await db.pickupNotice.update({ where: { id: notice.id }, data: { codeSms: sms } });
      message = sms === 'QUEUED' || sms === 'SENT' ? `We’ve texted ${who.name} a one-time pick-up code. It works today only, once.` : `Give ${who.name} this one-time code yourself (${sms.replace(/^SKIPPED: /, '')}). It works today only, once.`;
    }
    await this.audit.log({
      action: 'gate.pickup_notice',
      entityType: 'Student',
      entityId: studentId,
      summary:
        input.kind === 'DELEGATE'
          ? `Parent ${parent.name}: ${notice.delegateName} (${notice.delegateRelationship}) will collect ${fullName(student)} today`
          : input.kind === 'RUNNING_LATE'
            ? `Parent ${parent.name} is running late for ${fullName(student)} (ETA ${input.eta})`
            : `Parent ${parent.name} changed today’s pick-up time for ${fullName(student)} to ${input.eta}`,
    });
    // The class teacher hears in the app; the gate screen shows it too.
    const teacher = student.classArm?.classTeacher?.userId;
    if (teacher) {
      const what =
        input.kind === 'RUNNING_LATE'
          ? `${parent.name} is running late to collect ${student.firstName} (about ${input.eta}).`
          : input.kind === 'PICKUP_TIME'
            ? `${parent.name} will collect ${student.firstName} at ${input.eta} today.`
            : `${notice.delegateName} (${notice.delegateRelationship}) will collect ${student.firstName} today${notice.codeHash ? ' with a one-time code' : ''}.`;
      await db.notification.create({ data: { tenantId, userId: teacher, title: `Pick-up: ${student.firstName}`, body: `${what}${input.note ? ` Note: ${input.note}` : ''}`, link: '/gate' } });
    }
    return { notice: this.noticeRow(notice, await this.names([notice.createdById]), true), message };
  }

  async cancelNotice(tenantId: string, studentId: string, noticeId: string, userId: string): Promise<void> {
    const n = await this.prisma.root.pickupNotice.findFirst({ where: { tenantId, id: noticeId, studentId } });
    if (!n) throw new NotFoundException('Not found');
    if (n.codeUsedAt) throw new BadRequestException('This code has already been used');
    await this.prisma.root.pickupNotice.update({ where: { id: n.id }, data: { cancelledAt: new Date() } });
    await this.audit.log({ action: 'gate.pickup_notice_cancelled', entityType: 'Student', entityId: studentId, actorUserId: userId, summary: `Parent cancelled today’s ${n.kind === 'DELEGATE' ? `pick-up by ${n.delegateName}` : n.kind === 'RUNNING_LATE' ? 'running-late notice' : 'pick-up time change'}` });
  }

  private async sendDelegateCode(s: School, n: NoticeRow, o: { childName: string; parentName: string; code: string }): Promise<string> {
    if (!s.settings.delegateCodeSms) return 'SKIPPED: the school doesn’t text pick-up codes';
    const phone = normalisePhone(n.delegatePhone);
    if (!phone) return 'SKIPPED: no valid phone number';
    const ch = await this.channels.load(s.tenantId);
    this.channels.close(ch);
    if (!this.channels.configured(ch, 'SMS')) return 'SKIPPED: the school’s SMS is not set up';
    const text = smsSafe(delegateCodeSms({ delegateName: n.delegateName ?? '', childName: o.childName, school: s.shortName ?? s.name, parentName: o.parentName, code: o.code, date: shortDate(s.now.date) }));
    const broadcastId = await this.dayBroadcast(s);
    await this.prisma.root.delivery.create({
      data: { tenantId: s.tenantId, broadcastId, channel: 'SMS', recipientName: `${n.delegateName} (pick-up delegate)`, address: phone, subject: 'Pick-up code', text, status: 'QUEUED', units: smsInfo(text).segments },
    });
    await this.kick(s.tenantId, broadcastId, true);
    return 'QUEUED';
  }

  // ---------------------------------------------------------------- the parent's view

  async portal(tenantId: string, studentId: string): Promise<PortalArrival> {
    const s = await this.school(tenantId);
    const db = this.prisma.root;
    const today = s.now.date;
    const [c] = await this.children(s, [studentId]);
    if (!c) throw new NotFoundException('Student not found');
    const [mark, notices] = await Promise.all([
      db.studentAttendance.findFirst({ where: { tenantId, studentId, date: parseDate(today) }, select: { status: true } }),
      this.noticesFor(tenantId, today, [studentId], true),
    ]);
    return {
      date: today,
      schoolDay: s.days.includes(weekdayOf(today)),
      homeTime: s.settings.homeTime,
      arrivedAt: c.arrivedAt,
      arrivedVia: c.arrivedVia,
      late: c.late,
      leftAt: c.leftAt,
      collectedBy: c.collectedBy,
      absent: mark?.status === 'ABSENT' && !c.arrivedAt,
      guardians: c.guardians.map((g) => ({ name: g.name, relationship: g.relationship })),
      authorised: c.authorised,
      notices,
    };
  }

  // ---------------------------------------------------------------- gate passes

  async passes(tenantId: string, q: { classArmId?: string; ids?: string[] }): Promise<GatePassBatch> {
    const db = this.prisma.root;
    const [t, arms] = await Promise.all([
      db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, shortName: true, logoUrl: true, primaryColor: true } }),
      db.classArm.findMany({ where: { tenantId }, select: { id: true, name: true, classLevel: { select: { name: true } } }, orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }] }),
    ]);
    const classes = arms.map((a) => ({ id: a.id, label: armLabel(a)! }));
    if (!q.classArmId && !q.ids?.length) return { school: t, cards: [], classes };
    const rows = await db.student.findMany({
      where: { tenantId, status: 'ACTIVE', ...(q.ids?.length ? { id: { in: q.ids } } : { classArmId: q.classArmId }) },
      select: { ...studentSelect, admissionNumber: true, gateToken: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 300,
    });
    const out: GatePassBatch['cards'] = [];
    for (const r of rows) {
      let token = r.gateToken;
      for (let i = 0; !token && i < 5; i++) {
        const t = [...randomBytes(14)].map((b) => PASS_ALPHABET[b % PASS_ALPHABET.length]).join('');
        const done = await db.student.updateMany({ where: { id: r.id, gateToken: null }, data: { gateToken: t } }).catch(() => ({ count: 0 }));
        if (done.count) token = t;
        else token = (await db.student.findUnique({ where: { id: r.id }, select: { gateToken: true } }))?.gateToken ?? null;
      }
      if (!token) continue;
      out.push({ studentId: r.id, name: fullName(r), classArm: armLabel(r.classArm), admissionNumber: r.admissionNumber, photoUrl: r.photoUrl, qr: `${GATE_PASS_PREFIX}${token}` });
    }
    return { school: t, cards: out, classes };
  }

  /** A lost pass: a new code, so the old card stops working. */
  async reissuePass(tenantId: string, studentId: string): Promise<void> {
    const st = await this.prisma.root.student.findFirst({ where: { tenantId, id: studentId }, select: { id: true, firstName: true, lastName: true } });
    if (!st) throw new NotFoundException('Student not found');
    await this.prisma.root.student.update({ where: { id: st.id }, data: { gateToken: null } });
    await this.audit.log({ action: 'gate.pass_reissued', entityType: 'Student', entityId: st.id, summary: `Cancelled ${fullName(st)}’s gate pass (a new one prints next time)` });
  }

  // ---------------------------------------------------------------- alerts

  private async once(tenantId: string, kind: string, subjectKey: string, date: string): Promise<boolean> {
    try {
      await this.prisma.root.automationRun.create({ data: { tenantId, kind, subjectKey, runDate: parseDate(date) } });
      return true;
    } catch {
      return false;
    }
  }

  /** One "Arrival & pick-up alerts" message per school per day holds the push/SMS/WhatsApp deliveries, so they show in Messages with costs and retries. */
  private async dayBroadcast(s: School): Promise<string> {
    const db = this.prisma.root;
    const title = `Arrival & pick-up alerts — ${longDate(s.now.date)}`;
    const found = await db.broadcast.findFirst({ where: { tenantId: s.tenantId, source: 'GATE', title }, select: { id: true } });
    if (found) return found.id;
    const audience: Audience = { type: 'PEOPLE', guardianIds: [], staffIds: [] };
    const b = await db.broadcast.create({
      data: {
        tenantId: s.tenantId,
        title,
        channels: [],
        audience: audience as unknown as Prisma.InputJsonValue,
        audienceSummary: 'Parents (each about their own child) and pick-up delegates',
        subject: title,
        body: 'Arrival, lateness, absence and pick-up alerts sent to parents today, and one-time pick-up codes. See the deliveries for what was sent.',
        status: 'SENDING',
        source: 'GATE',
        link: null,
        sentAt: new Date(),
      },
    });
    return b.id;
  }

  private async kick(tenantId: string, broadcastId: string, queued: boolean) {
    const channels = await this.prisma.root.delivery.findMany({ where: { broadcastId }, distinct: ['channel'], select: { channel: true } });
    await this.prisma.root.broadcast.update({ where: { id: broadcastId }, data: { channels: channels.map((c) => c.channel), ...(queued ? { status: 'SENDING' } : {}) } });
    if (queued) void this.sender.dispatch(tenantId, broadcastId);
    else await this.sender.finishIfDone(broadcastId);
  }

  /**
   * Tells a child's parents, once per kind per day (dedupeKey), on the
   * school's chosen channels, in each parent's language. Parents held at the
   * consent step get nothing; SMS respects STOP.
   */
  async alert(s: School, studentId: string, f: Omit<GateAlertFacts, 'firstName'>, dedupeKey: string, alsoClaim: GateAlertKind | null = null): Promise<number> {
    const cfg = s.settings.alerts[f.kind];
    const tenantId = s.tenantId;
    // A late arrival stands in for the plain arrival alert.
    if (alsoClaim) await this.once(tenantId, `GATE_${alsoClaim}`, dedupeKey, s.now.date);
    if (!cfg.enabled || !cfg.channels.length) {
      // Late alerts off: fall back to the arrival alert.
      if (f.kind === 'LATE' && alsoClaim === 'ARRIVE') {
        await this.prisma.root.automationRun.deleteMany({ where: { tenantId, kind: 'GATE_ARRIVE', subjectKey: dedupeKey, runDate: parseDate(s.now.date) } });
        return this.alert(s, studentId, { ...f, kind: 'ARRIVE' }, dedupeKey);
      }
      return 0;
    }
    if (!(await this.once(tenantId, `GATE_${f.kind}`, dedupeKey, s.now.date))) return 0;
    const db = this.prisma.root;
    const [student, links, tenant, comms] = await Promise.all([
      db.student.findFirstOrThrow({ where: { tenantId, id: studentId }, select: { firstName: true } }),
      db.studentGuardian.findMany({
        where: { tenantId, studentId },
        select: { guardian: { select: { id: true, firstName: true, lastName: true, phone: true, userId: true, preferredLanguage: true, smsOptOutAt: true, dataConsentVersion: true } } },
      }),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { portalSettings: true } }),
      this.sender.school(tenantId),
    ]);
    if (!links.length) return 0;
    const consentFlag = (tenant.portalSettings as { dataProtection?: { consentRequired?: unknown } } | null)?.dataProtection?.consentRequired;
    const consentRequired = typeof consentFlag === 'boolean' ? consentFlag : DEFAULT_DATA_PROTECTION_SETTINGS.consentRequired;
    const schoolLanguage = asLanguage(comms.settings.parentLanguage) ?? 'EN';
    const wants = new Set(cfg.channels);
    const ch = wants.has('SMS') || wants.has('WHATSAPP') ? await this.channels.load(tenantId) : null;
    if (ch) this.channels.close(ch);
    const userIds = links.map((l) => l.guardian.userId).filter((x): x is string => !!x);
    const pushUsers = new Set(wants.has('PUSH') && this.channels.pushEnabled() ? (await db.pushSubscription.findMany({ where: { userId: { in: userIds } }, select: { userId: true } })).map((p) => p.userId) : []);
    const deliveries: Omit<Prisma.DeliveryCreateManyInput, 'broadcastId'>[] = [];
    const notifications: Prisma.NotificationCreateManyInput[] = [];
    let reached = 0;
    const prefix = s.shortName ?? s.name;
    for (const { guardian: g } of links) {
      const name = fullName(g);
      const language = asLanguage(g.preferredLanguage) ?? schoolLanguage;
      const { title, body } = gateAlertText({ ...f, firstName: student.firstName }, language);
      const row = (channel: string, address: string | null, text: string, status: string, error: string | null = null): Omit<Prisma.DeliveryCreateManyInput, 'broadcastId'> => ({
        tenantId,
        channel,
        recipientName: name,
        address,
        guardianId: g.id,
        userId: g.userId,
        subject: title,
        text,
        status,
        error,
        units: channel === 'SMS' && status !== 'SKIPPED' ? smsInfo(text).segments : 0,
        sentAt: status === 'SENT' ? new Date() : null,
      });
      if (consentRequired && g.dataConsentVersion !== PRIVACY_NOTICE_VERSION) {
        deliveries.push(row(cfg.channels[0]!, null, body, 'SKIPPED', 'Parent has not accepted the school’s privacy notice'));
        continue;
      }
      let ok = false;
      if (wants.has('IN_APP') && g.userId) {
        notifications.push({ tenantId, userId: g.userId, title, body, link: `/school/${studentId}` });
        deliveries.push(row('IN_APP', g.userId, body, 'SENT'));
        ok = true;
      }
      if (wants.has('PUSH') && g.userId && pushUsers.has(g.userId)) {
        deliveries.push(row('PUSH', g.userId, body, 'QUEUED'));
        ok = true;
      }
      const phone = normalisePhone(g.phone);
      if (wants.has('SMS')) {
        const text = smsSafe(`${prefix}: ${body}`);
        const missing = !phone ? 'No valid phone number on record' : !ch?.termii ? 'SMS is not set up' : g.smsOptOutAt ? 'Parent texted STOP to the SMS line' : null;
        deliveries.push(row('SMS', phone, text, missing ? 'SKIPPED' : 'QUEUED', missing));
        if (!missing) ok = true;
      }
      // WhatsApp only when the school has connected it (otherwise quietly not used).
      if (wants.has('WHATSAPP') && ch?.whatsapp && phone) {
        deliveries.push(row('WHATSAPP', phone, body, 'QUEUED'));
        ok = true;
      }
      if (ok) reached++;
    }
    if (!deliveries.length && !notifications.length) return 0;
    const broadcastId = await this.dayBroadcast(s);
    await db.$transaction([db.delivery.createMany({ data: deliveries.map((d) => ({ ...d, broadcastId })) }), db.notification.createMany({ data: notifications })]);
    await this.kick(tenantId, broadcastId, deliveries.some((d) => d.status === 'QUEUED'));
    return reached;
  }

  // ---------------------------------------------------------------- absence check (scheduler tick)

  /**
   * Once a day, at or after the school's absence-alert time: parents of
   * children marked ABSENT on today's register who were not seen at the
   * gate, before home time. A class whose register hasn't been taken sends
   * nothing (no false alarms), nor do holidays or non-school days.
   */
  async absenceSweep(): Promise<number> {
    const tenants = await this.prisma.root.tenant.findMany({ where: { status: { in: ['TRIAL', 'ACTIVE'] } }, select: { id: true } });
    let sent = 0;
    for (const t of tenants) {
      try {
        sent += await this.absenceFor(t.id);
      } catch (err) {
        this.logger.error(`Absence alerts for ${t.id} failed: ${(err as Error).message}`);
      }
    }
    return sent;
  }

  async absenceFor(tenantId: string): Promise<number> {
    const s = await this.school(tenantId);
    if (!s.settings.alerts.ABSENT.enabled || !s.settings.alerts.ABSENT.channels.length) return 0;
    const today = s.now.date;
    // From the alert time until home time: after that an "absent today" alert is stale.
    if (s.now.time < s.settings.absentAlertAt || s.now.time >= s.settings.homeTime) return 0;
    if (!s.days.includes(weekdayOf(today))) return 0;
    const db = this.prisma.root;
    const term = await db.term.findFirst({ where: { tenantId, startsOn: { lte: parseDate(today) }, endsOn: { gte: parseDate(today) } }, select: { id: true } });
    if (!term) return 0;
    const absent = await db.studentAttendance.findMany({ where: { tenantId, date: parseDate(today), status: 'ABSENT', student: { status: 'ACTIVE' } }, select: { studentId: true } });
    if (!absent.length) return 0;
    const ids = absent.map((a) => a.studentId);
    const [arrived, done] = await Promise.all([
      db.studentGateEvent.findMany({ where: { tenantId, date: parseDate(today), type: 'ARRIVE', undoneAt: null, studentId: { in: ids } }, select: { studentId: true } }),
      db.automationRun.findMany({ where: { tenantId, kind: 'GATE_ABSENT', runDate: parseDate(today), subjectKey: { in: ids } }, select: { subjectKey: true } }),
    ]);
    const skip = new Set([...arrived.map((a) => a.studentId), ...done.map((d) => d.subjectKey)]);
    let n = 0;
    for (const id of ids) {
      if (skip.has(id)) continue;
      await this.alert(s, id, { kind: 'ABSENT', time: null }, id);
      n++;
    }
    return n;
  }

  // ---------------------------------------------------------------- access helpers

  /** The signed-in parent's guardian record for this child (403 otherwise). */
  async guardianFor(tenantId: string, userId: string, studentId: string): Promise<{ guardianId: string; name: string }> {
    const link = await this.prisma.root.studentGuardian.findFirst({
      where: { tenantId, studentId, guardian: { userId }, student: { status: 'ACTIVE' } },
      select: { guardian: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!link) throw new ForbiddenException('You can only manage pick-up for your own children');
    return { guardianId: link.guardian.id, name: fullName(link.guardian) };
  }
}
