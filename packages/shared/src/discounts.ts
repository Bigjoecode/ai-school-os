import { z } from 'zod';

/**
 * Standing fee discounts: per-student awards (sibling, staff child,
 * scholarship, bursary) plus the school's automatic rules. Every discount
 * becomes a negative DISCOUNT line on the invoice. Amounts are in kobo.
 */

export const DISCOUNT_KINDS = ['SIBLING', 'STAFF_CHILD', 'SCHOLARSHIP', 'BURSARY', 'OTHER'] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];
export const DISCOUNT_KIND_LABELS: Record<DiscountKind, string> = {
  SIBLING: 'Sibling',
  STAFF_CHILD: 'Staff child',
  SCHOLARSHIP: 'Scholarship',
  BURSARY: 'Bursary',
  OTHER: 'Other',
};

/** TUITION = tuition items only; ALL = every compulsory item on the invoice. */
export const DISCOUNT_SCOPES = ['TUITION', 'ALL'] as const;
export type DiscountScope = (typeof DISCOUNT_SCOPES)[number];
export const DISCOUNT_SCOPE_LABELS: Record<DiscountScope, string> = { TUITION: 'Tuition only', ALL: 'All compulsory fees' };

/** BEST = only the largest discount applies; STACK = add them up (never more than the fees). */
export const DISCOUNT_COMBINE = ['BEST', 'STACK'] as const;
export type DiscountCombine = (typeof DISCOUNT_COMBINE)[number];

export interface DiscountRules {
  sibling: {
    enabled: boolean;
    /** Off the 2nd child's tuition (eldest pays in full). */
    secondChildPct: number;
    /** Off the tuition of the 3rd and every later child. */
    thirdChildPct: number;
  };
  staffChild: {
    enabled: boolean;
    percent: number;
    appliesTo: DiscountScope;
  };
  combine: DiscountCombine;
}

export const DEFAULT_DISCOUNT_RULES: DiscountRules = {
  sibling: { enabled: false, secondChildPct: 10, thirdChildPct: 15 },
  staffChild: { enabled: false, percent: 50, appliesTo: 'TUITION' },
  combine: 'BEST',
};

/** Fills gaps in rules saved by an older version (or never saved). */
export function normaliseDiscountRules(raw: unknown): DiscountRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<DiscountRules>;
  return {
    sibling: { ...DEFAULT_DISCOUNT_RULES.sibling, ...(r.sibling ?? {}) },
    staffChild: { ...DEFAULT_DISCOUNT_RULES.staffChild, ...(r.staffChild ?? {}) },
    combine: r.combine === 'STACK' ? 'STACK' : 'BEST',
  };
}

// ------------------------------------------------------------ schemas

const pct = z.number().min(0, '0–100%').max(100, '0–100%');

export const discountRulesSchema = z.object({
  sibling: z.object({ enabled: z.boolean(), secondChildPct: pct, thirdChildPct: pct }),
  staffChild: z.object({ enabled: z.boolean(), percent: pct, appliesTo: z.enum(DISCOUNT_SCOPES) }),
  combine: z.enum(DISCOUNT_COMBINE),
});

const optionalId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => v || null);

export const studentDiscountSchema = z
  .object({
    studentId: z.string().min(1, 'Choose a student'),
    kind: z.enum(DISCOUNT_KINDS),
    label: z.string().trim().min(2, 'Give it a short name').max(80),
    percent: pct.nullable().optional().transform((v) => v ?? null),
    amountKobo: z.number().int().min(100, 'At least ₦1').max(2_000_000_000).nullable().optional().transform((v) => v ?? null),
    appliesTo: z.enum(DISCOUNT_SCOPES).default('TUITION'),
    fromTermId: optionalId,
    untilTermId: optionalId,
    active: z.boolean().default(true),
    note: z
      .string()
      .trim()
      .max(300)
      .optional()
      .nullable()
      .transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.percent == null && v.amountKobo == null) ctx.addIssue({ code: 'custom', path: ['percent'], message: 'Enter a percentage or a fixed amount' });
    if (v.percent != null && v.amountKobo != null) ctx.addIssue({ code: 'custom', path: ['amountKobo'], message: 'Use a percentage or a fixed amount, not both' });
    if (v.percent === 0) ctx.addIssue({ code: 'custom', path: ['percent'], message: 'More than 0%' });
  });
export type StudentDiscountInput = z.infer<typeof studentDiscountSchema>;

/** Create the same discount for several students at once (e.g. a bursary scheme). */
export const bulkStudentDiscountSchema = z.object({ studentIds: z.array(z.string().min(1)).min(1, 'Choose at least one student').max(200) });

export const discountListQuerySchema = z.object({
  studentId: z.string().optional(),
  kind: z.enum(DISCOUNT_KINDS).optional(),
  active: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(100).optional(),
});

export const discountPreviewSchema = z.object({
  termId: z.string().min(1),
  classLevelIds: z.array(z.string()).max(50).default([]),
  /** A one-off sibling % for this run (replaces the sibling rule). */
  siblingDiscountPct: z.number().min(0).max(100).optional(),
});
export type DiscountPreviewInput = z.infer<typeof discountPreviewSchema>;

export const reapplyDiscountsSchema = z.object({
  termId: z.string().min(1),
  /** true = show what would change without saving. */
  dryRun: z.boolean().default(true),
});

export const discountReportQuerySchema = z.object({ termId: z.string().optional() });

// ------------------------------------------------------------ engine (shared by API and the live examples)

export interface DiscountBaseItem {
  category: string;
  amountKobo: number;
}

export interface DiscountCandidate {
  kind: DiscountKind;
  label: string;
  percent: number | null;
  amountKobo: number | null;
  appliesTo: DiscountScope;
  source: 'RULE' | 'MANUAL';
  discountId: string | null;
}

export interface AppliedDiscount {
  kind: DiscountKind;
  source: 'RULE' | 'MANUAL';
  discountId: string | null;
  /** Invoice line text, e.g. "Staff child discount (50% of tuition)". */
  description: string;
  /** Positive; the invoice line is the negative of this. */
  amountKobo: number;
  /** Reduced so the invoice doesn't go below zero (or tuition below zero). */
  capped: boolean;
}

const ordinalOf = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** The automatic-rule candidates for one student. */
export function ruleCandidates(
  rules: DiscountRules,
  who: { siblingPosition: number | null; isStaffChild: boolean },
  opts: { siblingOverridePct?: number | null } = {},
): DiscountCandidate[] {
  const out: DiscountCandidate[] = [];
  const pos = who.siblingPosition ?? 1;
  if (pos >= 2) {
    if (opts.siblingOverridePct != null && opts.siblingOverridePct > 0) {
      out.push({ kind: 'SIBLING', label: 'Sibling discount', percent: opts.siblingOverridePct, amountKobo: null, appliesTo: 'TUITION', source: 'RULE', discountId: null });
    } else if (opts.siblingOverridePct == null && rules.sibling.enabled) {
      const p = pos === 2 ? rules.sibling.secondChildPct : rules.sibling.thirdChildPct;
      if (p > 0) out.push({ kind: 'SIBLING', label: `Sibling discount — ${ordinalOf(pos)} child`, percent: p, amountKobo: null, appliesTo: 'TUITION', source: 'RULE', discountId: null });
    }
  }
  if (who.isStaffChild && rules.staffChild.enabled && rules.staffChild.percent > 0) {
    out.push({ kind: 'STAFF_CHILD', label: 'Staff child discount', percent: rules.staffChild.percent, amountKobo: null, appliesTo: rules.staffChild.appliesTo, source: 'RULE', discountId: null });
  }
  return out;
}

const fmtPct = (p: number) => `${Math.round(p * 100) / 100}%`;

/**
 * Works out the discount lines for one invoice. `items` are the compulsory fee
 * lines; `alreadyDiscountedKobo` is any one-off discount already on the
 * invoice (kept, and counted against the cap). A manual discount of a kind
 * replaces the automatic rule of the same kind. The result never takes the
 * invoice below zero.
 */
export function resolveDiscounts(
  items: DiscountBaseItem[],
  candidates: DiscountCandidate[],
  combine: DiscountCombine,
  opts: { alreadyDiscountedKobo?: number; money?: (kobo: number) => string } = {},
): AppliedDiscount[] {
  const tuitionBase = items.filter((i) => i.category === 'TUITION').reduce((n, i) => n + i.amountKobo, 0);
  const allBase = items.reduce((n, i) => n + i.amountKobo, 0);
  const manualKinds = new Set(candidates.filter((c) => c.source === 'MANUAL').map((c) => c.kind));
  const usable = candidates.filter((c) => c.source === 'MANUAL' || !manualKinds.has(c.kind));

  const priced = usable
    .map((c) => {
      const base = c.appliesTo === 'TUITION' ? tuitionBase : allBase;
      const raw = c.percent != null ? Math.round((base * c.percent) / 100) : Math.min(c.amountKobo ?? 0, base);
      const what = c.appliesTo === 'TUITION' ? 'tuition' : 'fees';
      const description = c.percent != null ? `${c.label} (${fmtPct(c.percent)} of ${what})` : c.label;
      return { c, raw, description, cappedByBase: c.percent == null && (c.amountKobo ?? 0) > base };
    })
    .filter((p) => p.raw > 0)
    // Largest first; manual awards win ties.
    .sort((a, b) => b.raw - a.raw || (a.c.source === 'MANUAL' ? -1 : 1) - (b.c.source === 'MANUAL' ? -1 : 1));

  const chosen = combine === 'BEST' ? priced.slice(0, 1) : priced;
  let totalLeft = Math.max(0, allBase - (opts.alreadyDiscountedKobo ?? 0));
  let tuitionLeft = Math.min(tuitionBase, totalLeft);
  const out: AppliedDiscount[] = [];
  for (const p of chosen) {
    const room = p.c.appliesTo === 'TUITION' ? Math.min(tuitionLeft, totalLeft) : totalLeft;
    const amount = Math.min(p.raw, room);
    if (amount <= 0) continue;
    totalLeft -= amount;
    if (p.c.appliesTo === 'TUITION') tuitionLeft -= amount;
    tuitionLeft = Math.min(tuitionLeft, totalLeft);
    const capped = amount < p.raw || p.cappedByBase;
    out.push({
      kind: p.c.kind,
      source: p.c.source,
      discountId: p.c.discountId,
      description: capped && opts.money ? `${p.description} — limited to ${opts.money(amount)}` : p.description,
      amountKobo: amount,
      capped,
    });
  }
  return out;
}

/**
 * Siblings: students linked through any shared guardian form a family. The
 * eldest (by date of birth when everyone has one, otherwise by admission
 * date) is 1st. Returns each student's position in their family.
 */
export function siblingPositions(
  students: { id: string; guardianIds: string[]; dateOfBirth: string | null; admittedOn: string; admissionNumber: string }[],
): Map<string, { position: number; familySize: number }> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  for (const s of students) parent.set(s.id, s.id);
  const byGuardian = new Map<string, string>();
  for (const s of students) {
    for (const g of s.guardianIds) {
      const other = byGuardian.get(g);
      if (other) parent.set(find(s.id), find(other));
      else byGuardian.set(g, s.id);
    }
  }
  const families = new Map<string, typeof students>();
  for (const s of students) {
    const r = find(s.id);
    families.set(r, [...(families.get(r) ?? []), s]);
  }
  const out = new Map<string, { position: number; familySize: number }>();
  for (const fam of families.values()) {
    const allDob = fam.every((s) => s.dateOfBirth);
    const sorted = [...fam].sort((a, b) =>
      allDob
        ? a.dateOfBirth!.localeCompare(b.dateOfBirth!) || a.admittedOn.localeCompare(b.admittedOn) || a.admissionNumber.localeCompare(b.admissionNumber)
        : a.admittedOn.localeCompare(b.admittedOn) || a.admissionNumber.localeCompare(b.admissionNumber),
    );
    sorted.forEach((s, i) => out.set(s.id, { position: i + 1, familySize: fam.length }));
  }
  return out;
}

// ------------------------------------------------------------ responses

export interface StudentDiscountRow {
  id: string;
  student: { id: string; name: string; admissionNumber: string; classArm: string | null; status: string };
  kind: DiscountKind;
  label: string;
  percent: number | null;
  amountKobo: number | null;
  appliesTo: DiscountScope;
  fromTerm: { id: string; name: string } | null;
  untilTerm: { id: string; name: string } | null;
  active: boolean;
  note: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What applies to one student automatically right now (for the student sheet). */
export interface StudentDiscountSummary {
  discounts: StudentDiscountRow[];
  sibling: { position: number; familySize: number; rulePct: number | null } | null;
  staffChild: { matched: boolean; staffName: string | null; rulePct: number | null };
  rules: DiscountRules;
}

export interface DiscountPreview {
  term: { id: string; name: string };
  /** Learners who would get a new invoice. */
  learners: number;
  alreadyInvoiced: number;
  grossKobo: number;
  discountKobo: number;
  byKind: { kind: DiscountKind; count: number; totalKobo: number }[];
  /** A few named examples, largest first. */
  examples: { student: string; classArm: string | null; description: string; amountKobo: number }[];
  combine: DiscountCombine;
  usingOverride: boolean;
}

export interface ReapplyChange {
  invoiceId: string;
  number: string;
  student: { id: string; name: string; classArm: string | null };
  beforeKobo: number;
  afterKobo: number;
  removed: string[];
  added: { description: string; amountKobo: number }[];
}

export interface ReapplyResult {
  dryRun: boolean;
  term: { id: string; name: string };
  changed: ReapplyChange[];
  unchanged: number;
  locked: { invoiceId: string; number: string; student: string; reason: string }[];
}

export interface DiscountReport {
  term: { id: string; name: string };
  currency: string;
  totalKobo: number;
  /** Total billed before discounts, for context. */
  grossKobo: number;
  students: number;
  byKind: { kind: DiscountKind | 'ONE_OFF'; label: string; count: number; totalKobo: number }[];
  rows: {
    invoiceId: string;
    invoiceNumber: string;
    student: { id: string; name: string; admissionNumber: string; classArm: string | null };
    lines: { kind: DiscountKind | 'ONE_OFF'; description: string; amountKobo: number }[];
    totalKobo: number;
    status: string;
  }[];
}
