import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BIRTHDAY_BONUS_XP,
  DEFAULT_COMMS_SETTINGS,
  dayMonthLabel,
  daysUntilBirthday,
  gameStageOf,
  gamesSettingsOf,
  isBirthdayOn,
  monthDayOf,
  studentGreetingText,
  type BirthdayRow,
  type ClassBirthdays,
  type ClassWishesInput,
  type ClassWishesResult,
  type CommsSettings,
  type MyBirthday,
  type UpcomingBirthdays,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { dateOnly } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { csvCell } from '../onboarding/csv';
import { awardBirthdayBonus } from '../games/birthday-bonus';
import { PrismaService } from '../prisma/prisma.service';

/** The demo school, where a "preview my birthday card" button is offered instead of changing anyone's date of birth. */
export const DEMO_SLUG = 'greenfield';

/** Saved messaging settings merged over the defaults (as SenderService.school does). */
export function birthdaySettingsOf(raw: unknown): CommsSettings['birthdays'] {
  const saved = (raw as Partial<CommsSettings> | null) ?? {};
  return { ...DEFAULT_COMMS_SETTINGS.birthdays, ...(saved.birthdays ?? {}) };
}

/** Whether the school greets students on their own account (the dashboard card and the morning note). */
export function greetsStudents(b: CommsSettings['birthdays']): boolean {
  return b.students.enabled && b.studentGreeting.enabled;
}

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
}

/**
 * One birthday row: day and month only. The year of birth never leaves the
 * server, so no list can be used to work out anyone's age.
 */
export function birthdayRow(kind: BirthdayRow['kind'], p: Person, today: string, detail: string | null, classArmId: string | null): BirthdayRow | null {
  const dob = dateOnly(p.dateOfBirth);
  if (!dob) return null;
  const day = monthDayOf(dob);
  return { id: p.id, kind, name: `${p.firstName} ${p.lastName}`.trim(), firstName: p.firstName, detail, classArmId, day, dayLabel: dayMonthLabel(day), inDays: daysUntilBirthday(day, today) };
}

/** Rows due within `days` (0 = today only), soonest first. */
export function upcoming(rows: (BirthdayRow | null)[], days: number): BirthdayRow[] {
  return rows.filter((r): r is BirthdayRow => !!r && r.inDays <= days).sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}

@Injectable()
export class BirthdaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async school() {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: currentTenantId() },
      select: { id: true, name: true, slug: true, timezone: true, commsSettings: true, portalSettings: true },
    });
    return { ...t, today: schoolNow(t.timezone).date, birthdays: birthdaySettingsOf(t.commsSettings) };
  }

  private async arms(ids?: string[]) {
    const arms = await this.prisma.db.classArm.findMany({
      where: ids ? { id: { in: ids } } : {},
      include: { classLevel: true },
      orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }],
    });
    return arms.map((a) => ({ id: a.id, label: `${a.classLevel.name} ${a.name}`.trim(), stage: a.classLevel.stage, levelName: a.classLevel.name }));
  }

  // ---------------------------------------------------------- the student's own card

  /** The signed-in student's birthday card. `preview` works in the demo school only and gives no bonus. */
  async mine(preview: boolean): Promise<MyBirthday> {
    const ctx = currentContext();
    const s = await this.prisma.db.student.findFirst({
      where: { userId: ctx.userId, status: 'ACTIVE' },
      select: { id: true, firstName: true, dateOfBirth: true, classArm: { select: { classLevel: { select: { stage: true, name: true } } } } },
    });
    if (!s) throw new ForbiddenException('Your account isn’t linked to a student record');
    const t = await this.school();
    const demo = t.slug === DEMO_SLUG;
    const real = greetsStudents(t.birthdays) && isBirthdayOn(dateOnly(s.dateOfBirth), t.today);
    const today = real || (preview && demo);
    let bonusXp: number | null = null;
    if (real && gamesSettingsOf((t.portalSettings as { games?: unknown } | null)?.games).enabled) {
      await awardBirthdayBonus(this.prisma.root, t.id, s.id, t.today);
      bonusXp = BIRTHDAY_BONUS_XP;
    }
    return {
      today,
      firstName: s.firstName,
      message: studentGreetingText(t.birthdays.studentGreeting.message, s.firstName, t.name),
      school: t.name,
      young: gameStageOf(s.classArm?.classLevel.stage, s.classArm?.classLevel.name).young,
      bonusXp,
      demoPreview: demo && !real,
    };
  }

  // ---------------------------------------------------------- class teachers

  /** The classes the signed-in member of staff leads (class teacher) or teaches. */
  private async myArms(): Promise<{ id: string; lead: boolean }[]> {
    const staff = await this.prisma.db.staff.findFirst({
      where: { userId: currentContext().userId },
      select: { classesLed: { select: { id: true } }, classSubjects: { select: { classArmId: true } } },
    });
    if (!staff) return [];
    const lead = new Set(staff.classesLed.map((c) => c.id));
    const all = new Set([...lead, ...staff.classSubjects.map((c) => c.classArmId)]);
    return [...all].map((id) => ({ id, lead: lead.has(id) }));
  }

  async myClasses(): Promise<ClassBirthdays> {
    const t = await this.school();
    const mine = await this.myArms();
    if (!mine.length) return { today: t.today, classes: [], birthdays: [], wishesSent: [] };
    const ids = mine.map((m) => m.id);
    const [arms, students, sent] = await Promise.all([
      this.arms(ids),
      this.prisma.db.student.findMany({ where: { classArmId: { in: ids }, status: 'ACTIVE', dateOfBirth: { not: null } }, select: { id: true, firstName: true, lastName: true, dateOfBirth: true, classArmId: true } }),
      this.prisma.db.automationRun.findMany({ where: { kind: 'BIRTHDAY_CLASS_WISHES', subjectKey: { in: ids }, runDate: new Date(`${t.today}T00:00:00Z`) }, select: { subjectKey: true } }),
    ]);
    const label = new Map(arms.map((a) => [a.id, a.label]));
    const lead = new Set(mine.filter((m) => m.lead).map((m) => m.id));
    return {
      today: t.today,
      classes: arms.map((a) => ({ classArmId: a.id, label: a.label, lead: lead.has(a.id) })).sort((a, b) => Number(b.lead) - Number(a.lead)),
      birthdays: upcoming(students.map((s) => birthdayRow('STUDENT', s, t.today, label.get(s.classArmId!) ?? null, s.classArmId)), 7),
      wishesSent: sent.map((r) => r.subjectKey),
    };
  }

  /**
   * "Send class wishes": a class announcement (the noticeboard, for the
   * class's students and parents) naming today's birthday children by first
   * name. Teacher-initiated, once per class per day; never says an age.
   */
  async classWishes(body: ClassWishesInput): Promise<ClassWishesResult> {
    const ctx = currentContext();
    const mine = await this.myArms();
    if (!mine.some((m) => m.id === body.classArmId) && !ctx.permissions.has('announcements.manage')) {
      throw new ForbiddenException('You can only send wishes to the classes you lead or teach');
    }
    const t = await this.school();
    const [arm] = await this.arms([body.classArmId]);
    if (!arm) throw new NotFoundException('Class not found');
    const kids = (
      await this.prisma.db.student.findMany({ where: { classArmId: arm.id, status: 'ACTIVE', dateOfBirth: { not: null } }, select: { firstName: true, dateOfBirth: true }, orderBy: { firstName: 'asc' } })
    ).filter((k) => isBirthdayOn(dateOnly(k.dateOfBirth), t.today));
    if (!kids.length) throw new BadRequestException(`No one in ${arm.label} has a birthday today`);
    const claimed = await this.prisma.root.automationRun.createMany({
      data: [{ tenantId: t.id, kind: 'BIRTHDAY_CLASS_WISHES', subjectKey: arm.id, runDate: new Date(`${t.today}T00:00:00Z`) }],
      skipDuplicates: true,
    });
    if (!claimed.count) throw new BadRequestException(`Wishes for ${arm.label} have already been posted today`);
    const names = kids.map((k) => k.firstName);
    const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    const me = await this.prisma.root.user.findUnique({ where: { id: ctx.userId }, select: { firstName: true, lastName: true } });
    const title = `Happy birthday, ${list}! 🎉`.slice(0, 160);
    const text = [
      `Today ${arm.label} is celebrating ${names.length === 1 ? `${list}’s birthday` : `the birthdays of ${list}`}. Everyone in the class wishes ${names.length === 1 ? 'you' : 'you all'} a wonderful day!`,
      body.note,
      me ? `— ${me.firstName} ${me.lastName}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');
    // The end of the school day after tomorrow, so it is gone once the celebration is over.
    const expiresAt = new Date(Date.parse(`${t.today}T00:00:00Z`) + 2 * 86_400_000);
    const a = await this.prisma.db.announcement.create({
      data: { tenantId: t.id, title, body: text, audience: 'EVERYONE', classArmIds: [arm.id], pinned: false, publishAt: new Date(), expiresAt, createdById: ctx.userId },
    });
    await this.prisma.root.automationRun.updateMany({ where: { tenantId: t.id, kind: 'BIRTHDAY_CLASS_WISHES', subjectKey: arm.id, runDate: new Date(`${t.today}T00:00:00Z`) }, data: { broadcastId: a.id } });
    await this.audit.log({ action: 'comms.announcement', entityType: 'Announcement', entityId: a.id, summary: `Posted birthday wishes to ${arm.label} (${names.length} birthday${names.length === 1 ? '' : 's'})` });
    return { announcementId: a.id, title, names };
  }

  // ---------------------------------------------------------- admin

  async upcoming(days: number, classArmId?: string): Promise<UpcomingBirthdays> {
    const t = await this.school();
    const db = this.prisma.db;
    const [arms, students, staff, missingStudents, missingStaff, studentSample, staffSample] = await Promise.all([
      this.arms(),
      db.student.findMany({ where: { status: 'ACTIVE', dateOfBirth: { not: null }, ...(classArmId ? { classArmId } : {}) }, select: { id: true, firstName: true, lastName: true, dateOfBirth: true, classArmId: true } }),
      classArmId ? [] : db.staff.findMany({ where: { status: { not: 'EXITED' }, dateOfBirth: { not: null } }, select: { id: true, firstName: true, lastName: true, dateOfBirth: true, jobTitle: true } }),
      db.student.count({ where: { status: 'ACTIVE', dateOfBirth: null, ...(classArmId ? { classArmId } : {}) } }),
      db.staff.count({ where: { status: { not: 'EXITED' }, dateOfBirth: null } }),
      db.student.findMany({ where: { status: 'ACTIVE', dateOfBirth: null, ...(classArmId ? { classArmId } : {}) }, select: { id: true, firstName: true, lastName: true, admissionNumber: true, classArmId: true }, orderBy: [{ lastName: 'asc' }], take: 12 }),
      db.staff.findMany({ where: { status: { not: 'EXITED' }, dateOfBirth: null }, select: { id: true, firstName: true, lastName: true, jobTitle: true }, orderBy: [{ lastName: 'asc' }], take: 12 }),
    ]);
    const label = new Map(arms.map((a) => [a.id, a.label]));
    const armOf = (id: string | null) => (id ? (label.get(id) ?? null) : null);
    return {
      today: t.today,
      days,
      students: upcoming(students.map((s) => birthdayRow('STUDENT', s, t.today, armOf(s.classArmId), s.classArmId)), days),
      staff: upcoming(staff.map((s) => birthdayRow('STAFF', s, t.today, s.jobTitle, null)), days),
      classes: arms.map((a) => ({ id: a.id, label: a.label })),
      missing: {
        students: missingStudents,
        staff: missingStaff,
        studentSample: studentSample.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, detail: armOf(s.classArmId), admissionNumber: s.admissionNumber })),
        staffSample: staffSample.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, detail: s.jobTitle })),
      },
      settings: { students: t.birthdays.students.enabled, staff: t.birthdays.staff.enabled, greetStudent: greetsStudents(t.birthdays), sendAt: t.birthdays.sendAt, greetingTemplate: t.birthdays.studentGreeting.message },
      school: t.name,
    };
  }

  /** The upcoming list as CSV (day and month only). Audit-logged: it is a list of personal data. */
  async upcomingCsv(days: number, classArmId?: string): Promise<string> {
    const u = await this.upcoming(days, classArmId);
    const rows = [...u.students, ...u.staff].sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
    const head = ['Name', 'Student or staff', 'Class or role', 'Birthday (day and month)', 'Days away'];
    const lines = rows.map((r) => [r.name, r.kind === 'STUDENT' ? 'Student' : 'Staff', r.detail ?? '', r.dayLabel, r.inDays === 0 ? 'Today' : r.inDays].map(csvCell).join(','));
    await this.audit.log({ action: 'birthdays.exported', summary: `Exported ${rows.length} upcoming birthday(s) (next ${days} days${classArmId ? ', one class' : ''}) to CSV` });
    return [head.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n';
  }
}
