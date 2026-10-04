import { type DiscountCandidate, type DiscountKind, type DiscountRules, type DiscountScope, ruleCandidates, siblingPositions } from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { dateOnly, fullName } from '../common/format';

/**
 * Loads what's needed to work out a student's standing discounts for a term:
 * families (siblings through a shared guardian), staff children, and the
 * per-student discounts whose term window covers the term.
 */
export interface DiscountContext {
  rules: DiscountRules;
  candidatesFor(studentId: string): DiscountCandidate[];
  sibling(studentId: string): { position: number; familySize: number } | null;
  staffParent(studentId: string): string | null;
}

/** "08031234567", "+234 803 123 4567" and "2348031234567" all → "8031234567". */
export function normalisePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, '');
  if (d.length < 7) return null;
  return d.replace(/^234/, '').replace(/^0/, '');
}

export async function loadDiscountContext(
  client: unknown,
  tenantId: string,
  termId: string | null,
  rules: DiscountRules,
  opts: { siblingOverridePct?: number | null; includeStudentIds?: string[] } = {},
): Promise<DiscountContext> {
  const tx = client as Prisma.TransactionClient;
  const include = opts.includeStudentIds ?? [];

  const [students, staff, discounts, term] = await Promise.all([
    tx.student.findMany({
      where: { tenantId, OR: [{ status: 'ACTIVE' }, ...(include.length ? [{ id: { in: include } }] : [])] },
      select: {
        id: true,
        admissionNumber: true,
        dateOfBirth: true,
        admittedOn: true,
        guardians: { select: { guardianId: true, guardian: { select: { userId: true, phone: true, email: true } } } },
      },
    }),
    tx.staff.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { userId: true, phone: true, email: true, firstName: true, lastName: true } }),
    termId ? tx.studentDiscount.findMany({ where: { tenantId, active: true } }) : Promise.resolve([]),
    termId ? tx.term.findUnique({ where: { id: termId }, select: { startsOn: true } }) : Promise.resolve(null),
  ]);

  // Term windows compare by start date.
  const windowIds = [...new Set(discounts.flatMap((d) => [d.fromTermId, d.untilTermId]).filter((x): x is string => !!x))];
  const windowTerms = windowIds.length ? await tx.term.findMany({ where: { tenantId, id: { in: windowIds } }, select: { id: true, startsOn: true } }) : [];
  const starts = new Map(windowTerms.map((t) => [t.id, dateOnly(t.startsOn)!]));
  const termStart = term ? dateOnly(term.startsOn)! : null;
  const inWindow = (d: { fromTermId: string | null; untilTermId: string | null }) => {
    if (!termStart) return false;
    if (d.fromTermId) {
      const from = starts.get(d.fromTermId);
      if (!from || termStart < from) return false;
    }
    if (d.untilTermId) {
      const until = starts.get(d.untilTermId);
      if (!until || termStart > until) return false;
    }
    return true;
  };
  const manual = new Map<string, DiscountCandidate[]>();
  for (const d of discounts) {
    if (!inWindow(d)) continue;
    manual.set(d.studentId, [
      ...(manual.get(d.studentId) ?? []),
      {
        kind: d.kind as DiscountKind,
        label: d.label,
        percent: d.percent,
        amountKobo: d.amountKobo,
        appliesTo: (d.appliesTo === 'ALL' ? 'ALL' : 'TUITION') as DiscountScope,
        source: 'MANUAL',
        discountId: d.id,
      },
    ]);
  }

  const positions = siblingPositions(
    students.map((s) => ({
      id: s.id,
      guardianIds: s.guardians.map((g) => g.guardianId),
      dateOfBirth: dateOnly(s.dateOfBirth),
      admittedOn: dateOnly(s.admittedOn)!,
      admissionNumber: s.admissionNumber,
    })),
  );

  // Staff children: a guardian who is also active staff (same login, phone or email).
  const byUser = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const s of staff) {
    const name = fullName(s);
    if (s.userId) byUser.set(s.userId, name);
    const ph = normalisePhone(s.phone);
    if (ph) byPhone.set(ph, name);
    if (s.email) byEmail.set(s.email.trim().toLowerCase(), name);
  }
  const staffParent = new Map<string, string>();
  for (const st of students) {
    for (const { guardian: g } of st.guardians) {
      const ph = normalisePhone(g.phone);
      const hit = (g.userId && byUser.get(g.userId)) || (ph && byPhone.get(ph)) || (g.email && byEmail.get(g.email.trim().toLowerCase())) || null;
      if (hit) {
        staffParent.set(st.id, hit);
        break;
      }
    }
  }

  const override = opts.siblingOverridePct != null && opts.siblingOverridePct > 0 ? opts.siblingOverridePct : null;
  return {
    rules,
    sibling: (id) => positions.get(id) ?? null,
    staffParent: (id) => staffParent.get(id) ?? null,
    candidatesFor: (id) => [
      ...(manual.get(id) ?? []),
      ...ruleCandidates(rules, { siblingPosition: positions.get(id)?.position ?? null, isStaffChild: staffParent.has(id) }, { siblingOverridePct: override }),
    ],
  };
}

/**
 * Which DISCOUNT lines on an invoice came from standing discounts (and so can
 * be recalculated), and what kind they are. Anything else is a one-off line
 * a bursar added by hand, which is left alone.
 */
export function classifyDiscountLine(description: string, labels: { label: string; kind: string }[]): { kind: DiscountKind | 'ONE_OFF'; standing: boolean } {
  if (description.startsWith('Sibling discount')) return { kind: 'SIBLING', standing: true };
  if (description.startsWith('Staff child discount')) return { kind: 'STAFF_CHILD', standing: true };
  const hit = [...labels].sort((a, b) => b.label.length - a.label.length).find((l) => description === l.label || description.startsWith(`${l.label} (`) || description.startsWith(`${l.label} —`));
  if (hit) return { kind: hit.kind as DiscountKind, standing: true };
  return { kind: 'ONE_OFF', standing: false };
}
