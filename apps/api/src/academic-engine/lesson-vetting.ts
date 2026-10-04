import {
  mondayOf,
  type ComplianceItem,
  type ComplianceItemStatus,
  type ComplianceReport,
  type ComplianceTeacherRow,
  type LessonReviewInfo,
  type LessonReviewStatus,
  type LessonStep,
} from '@aischool/shared';
import { dateOnly, fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Lesson note vetting helpers: review fields for responses, the compliance
 * report and reviewer notifications. Kept apart from the controller so the
 * week maths and the "expected plans" rule live in one place.
 *
 * The edit rule (documented in @aischool/shared vetting.ts): changing the
 * content of a SUBMITTED or APPROVED plan takes it back to NOT_SUBMITTED;
 * a RETURNED plan stays RETURNED until it is resubmitted.
 */

type Db = PrismaService['db'];

const DAY = 86_400_000;

export interface ReviewRow {
  reviewStatus: string;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  reviewNote: string | null;
  date: Date | null;
  createdById: string | null;
  teacher: { userId: string | null } | null;
  schemeWeek?: { startsOn?: Date | null } | null;
}

/** The week a plan belongs to: its date, else its scheme week's start. */
export function lessonWeek(l: { date: Date | null; schemeWeek?: { startsOn?: Date | null } | null }): string | null {
  const d = dateOnly(l.date) ?? dateOnly(l.schemeWeek?.startsOn ?? null);
  return d ? mondayOf(d) : null;
}

/** Submitted after 00:00 UTC on the Monday of its week. */
export function isLate(submittedAt: Date | null, weekStart: string | null): boolean {
  return !!submittedAt && !!weekStart && submittedAt.getTime() >= new Date(`${weekStart}T00:00:00.000Z`).getTime();
}

export function isOwnLesson(l: { createdById: string | null; teacher: { userId: string | null } | null }): boolean {
  const userId = currentContext().userId;
  return !!userId && (l.createdById === userId || l.teacher?.userId === userId);
}

/** Whether a plan has enough in it to be vetted. */
export function lessonContentProblem(l: { objectives: string[]; steps: unknown; generation: string }): string | null {
  if (l.generation === 'QUEUED' || l.generation === 'RUNNING') return 'It is still being written by AI';
  if (!l.objectives.length) return 'Add learning objectives first';
  const steps = (Array.isArray(l.steps) ? l.steps : []) as LessonStep[];
  if (!steps.length) return 'Add the lesson steps first';
  return null;
}

/** Names of the reviewers on a set of plans, by user id. */
export async function reviewerNames(db: Db, rows: { reviewedById: string | null }[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.reviewedById).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(users.map((u) => [u.id, fullName(u)]));
}

export function reviewInfo(l: ReviewRow, names: Map<string, string>): LessonReviewInfo {
  const ctx = currentContext();
  const weekStart = lessonWeek(l);
  const mine = isOwnLesson(l);
  const status = l.reviewStatus as LessonReviewStatus;
  return {
    reviewStatus: status,
    submittedAt: l.submittedAt?.toISOString() ?? null,
    reviewedAt: l.reviewedAt?.toISOString() ?? null,
    reviewNote: l.reviewNote,
    reviewedBy: l.reviewedById ? { id: l.reviewedById, name: names.get(l.reviewedById) ?? 'A former reviewer' } : null,
    weekStart,
    late: isLate(l.submittedAt, weekStart),
    mine,
    canReview: status === 'SUBMITTED' && ctx.permissions.has('lessons.approve') && !mine,
  };
}

/** Tells a teacher their lesson note was approved or returned. Never fails the review. */
export async function notifyTeacher(
  db: Db,
  l: { id: string; topic: string; createdById: string | null; teacher: { userId: string | null } | null },
  decision: 'APPROVE' | 'RETURN',
  note: string | null | undefined,
) {
  try {
    const userId = l.teacher?.userId ?? l.createdById;
    if (!userId || userId === currentContext().userId) return;
    const title = (decision === 'APPROVE' ? `Lesson note approved: ${l.topic}` : `Lesson note returned for corrections: ${l.topic}`).slice(0, 200);
    const body = (note?.trim() || (decision === 'APPROVE' ? 'Your lesson note has been vetted and approved.' : 'Open it to see what needs correcting.')).slice(0, 300);
    await db.notification.create({ data: { tenantId: currentTenantId(), userId, title, body, link: `/lessons/${l.id}` } });
  } catch {
    // A failed notification never undoes the review.
  }
}

// ------------------------------------------------------------ compliance

const RANK: Record<ComplianceItemStatus, number> = { APPROVED: 5, SUBMITTED: 4, RETURNED: 3, NOT_SUBMITTED: 2, MISSING: 1 };

/**
 * For one week, per teacher: the class-subjects they are expected to plan
 * (one lesson note per class and subject per week — the published timetable
 * for the term if there is one, else the class-subject teacher assignments)
 * and how far each note has got through vetting.
 */
export async function complianceReport(db: Db, weekStart: string): Promise<ComplianceReport> {
  const monday = mondayOf(weekStart);
  const from = new Date(`${monday}T00:00:00.000Z`);
  const to = new Date(from.getTime() + 6 * DAY);
  const weekEnd = dateOnly(to)!;

  const term = await db.term.findFirst({ where: { startsOn: { lte: to }, endsOn: { gte: from } }, orderBy: { startsOn: 'desc' } });
  const timetable = term
    ? await db.timetable.findFirst({ where: { termId: term.id, status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' } })
    : null;

  type Slot = { teacherId: string; classArmId: string; subjectId: string; periods: number };
  const slots = new Map<string, Slot>();
  let basis: ComplianceReport['basis'] = 'ASSIGNMENTS';
  if (timetable) {
    const entries = await db.timetableEntry.findMany({
      where: { timetableId: timetable.id, teacherId: { not: null } },
      select: { teacherId: true, classArmId: true, subjectId: true },
    });
    if (entries.length) {
      basis = 'TIMETABLE';
      for (const e of entries) {
        const key = `${e.teacherId}|${e.classArmId}|${e.subjectId}`;
        const s = slots.get(key) ?? { teacherId: e.teacherId!, classArmId: e.classArmId, subjectId: e.subjectId, periods: 0 };
        s.periods++;
        slots.set(key, s);
      }
    }
  }
  if (basis === 'ASSIGNMENTS') {
    const assigned = await db.classSubject.findMany({
      where: { teacherId: { not: null } },
      select: { teacherId: true, classArmId: true, subjectId: true, periodsPerWeek: true },
    });
    for (const a of assigned) {
      slots.set(`${a.teacherId}|${a.classArmId}|${a.subjectId}`, { teacherId: a.teacherId!, classArmId: a.classArmId, subjectId: a.subjectId, periods: a.periodsPerWeek });
    }
  }

  const teacherIds = [...new Set([...slots.values()].map((s) => s.teacherId))];
  const [staff, arms, subjects, plans] = await Promise.all([
    db.staff.findMany({ where: { id: { in: teacherIds }, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true } }),
    db.classArm.findMany({ select: { id: true, name: true, classLevel: { select: { name: true } } } }),
    db.subject.findMany({ select: { id: true, name: true } }),
    db.lessonPlan.findMany({
      where: {
        OR: [
          { date: { gte: from, lte: to } },
          { date: null, schemeWeek: { startsOn: { gte: from, lte: to } } },
        ],
      },
      select: { id: true, classArmId: true, subjectId: true, reviewStatus: true, submittedAt: true },
    }),
  ]);
  const armName = new Map(arms.map((a) => [a.id, `${a.classLevel.name} ${a.name}`]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const plansBySlot = new Map<string, typeof plans>();
  for (const p of plans) {
    const key = `${p.classArmId}|${p.subjectId}`;
    plansBySlot.set(key, [...(plansBySlot.get(key) ?? []), p]);
  }

  const zero = () => ({ expected: 0, submitted: 0, pending: 0, approved: 0, returned: 0, missing: 0, late: 0 });
  const totals = zero();
  const rows: ComplianceTeacherRow[] = [];
  for (const t of staff) {
    const row: ComplianceTeacherRow = { teacher: { id: t.id, name: fullName(t) }, ...zero(), items: [] };
    for (const s of slots.values()) {
      if (s.teacherId !== t.id) continue;
      const found = plansBySlot.get(`${s.classArmId}|${s.subjectId}`) ?? [];
      let status: ComplianceItemStatus = 'MISSING';
      for (const p of found) if (RANK[p.reviewStatus as ComplianceItemStatus] > RANK[status]) status = p.reviewStatus as ComplianceItemStatus;
      const submittedTimes = found.map((p) => p.submittedAt).filter((d): d is Date => !!d && status !== 'NOT_SUBMITTED');
      const firstSubmitted = submittedTimes.length ? new Date(Math.min(...submittedTimes.map((d) => d.getTime()))) : null;
      const item: ComplianceItem = {
        classArm: { id: s.classArmId, name: armName.get(s.classArmId) ?? 'Unknown class' },
        subject: { id: s.subjectId, name: subjectName.get(s.subjectId) ?? 'Unknown subject' },
        periods: s.periods,
        status,
        lessonIds: found.map((p) => p.id),
        submittedAt: firstSubmitted?.toISOString() ?? null,
        late: isLate(firstSubmitted, monday),
      };
      row.items.push(item);
      row.expected++;
      if (status === 'SUBMITTED') row.pending++;
      else if (status === 'APPROVED') row.approved++;
      else if (status === 'RETURNED') row.returned++;
      else row.missing++;
      if (item.late) row.late++;
    }
    row.submitted = row.pending + row.approved + row.returned;
    row.items.sort((a, b) => a.classArm.name.localeCompare(b.classArm.name) || a.subject.name.localeCompare(b.subject.name));
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += row[k];
    rows.push(row);
  }
  rows.sort((a, b) => b.missing - a.missing || a.teacher.name.localeCompare(b.teacher.name));

  return { weekStart: monday, weekEnd, basis, termName: term?.name ?? null, teachers: rows, totals };
}

// ------------------------------------------------------------ AI check

export function lessonCheckPrompt(l: {
  topic: string;
  durationMinutes: number;
  objectives: string[];
  priorKnowledge: string | null;
  materials: string[];
  steps: LessonStep[];
  differentiation: { support: string; core: string; stretch: string } | null;
  assessment: string[];
  homework: string | null;
  subject: string;
  classLabel: string;
}) {
  const system = [
    'You are an experienced head of department in a Nigerian school vetting a teacher\'s lesson note before the week starts.',
    'Judge the plan against its own learning objectives: are they measurable, does every step serve them, do the timings add up,',
    'is there a real check for understanding of each objective, and is the lesson pitched right for the class?',
    'Be specific and practical, refer to the plan\'s actual steps, and use British English. Do not rewrite the whole plan.',
    'Give a one or two sentence summary, up to three strengths, and two to four improvements the reviewer could ask for.',
  ].join(' ');
  const total = l.steps.reduce((n, s) => n + (s.minutes || 0), 0);
  const user = [
    `Subject: ${l.subject}. Class: ${l.classLabel}. Topic: ${l.topic}. Planned length: ${l.durationMinutes} minutes (steps add up to ${total}).`,
    `Objectives:\n${l.objectives.map((o, i) => `${i + 1}. ${o}`).join('\n') || '(none)'}`,
    `Prior knowledge: ${l.priorKnowledge || '(none)'}`,
    `Materials: ${l.materials.join('; ') || '(none)'}`,
    `Steps:\n${l.steps.map((s, i) => `${i + 1}. ${s.title} (${s.minutes} min)\n   Teacher: ${s.teacherActivity}\n   Learners: ${s.learnerActivity}`).join('\n') || '(none)'}`,
    l.differentiation ? `Differentiation — support: ${l.differentiation.support}; core: ${l.differentiation.core}; stretch: ${l.differentiation.stretch}` : 'Differentiation: (none)',
    `Assessment: ${l.assessment.join('; ') || '(none)'}`,
    `Homework: ${l.homework || '(none)'}`,
  ].join('\n\n');
  return { system, user: user.slice(0, 20_000) };
}
