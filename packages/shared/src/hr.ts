import { z } from 'zod';

/**
 * HR & payroll contracts: departments, employee records, leave, awards,
 * salary grades, pay profiles and monthly payroll. Amounts are integers in
 * kobo, like finance.
 */

// ------------------------------------------------------------ settings

export interface HrSettings {
  /** Deduct PAYE income tax on payslips. */
  payeEnabled: boolean;
  /** Employee pension contribution, % of basic + housing + transport (PRA 2014 minimum 8). */
  pensionEmployeePct: number;
  /** Employer pension contribution, % of basic + housing + transport (PRA 2014 minimum 10). */
  pensionEmployerPct: number;
  /** National Housing Fund, % of basic (2.5). */
  nhfPct: number;
  /** Printed at the foot of every payslip. */
  payslipNote: string | null;
}

export const DEFAULT_HR_SETTINGS: HrSettings = {
  payeEnabled: true,
  pensionEmployeePct: 8,
  pensionEmployerPct: 10,
  nhfPct: 2.5,
  payslipNote: null,
};

// ------------------------------------------------------------ tax

/**
 * Personal income tax bands under the Nigeria Tax Act 2025, in force from
 * 1 January 2026: [width of band in kobo, rate]. Annual amounts.
 */
export const PAYE_BANDS: ReadonlyArray<readonly [number, number]> = [
  [80_000_000, 0], // first ₦800,000
  [220_000_000, 0.15], // next ₦2,200,000
  [900_000_000, 0.18], // next ₦9,000,000
  [1_300_000_000, 0.21], // next ₦13,000,000
  [2_500_000_000, 0.23], // next ₦25,000,000
  [Number.POSITIVE_INFINITY, 0.25], // above ₦50,000,000
];
export const PAYE_RULES_LABEL = 'Nigeria Tax Act 2025 (from 1 January 2026)';

/** Rent relief: 20% of annual rent paid, at most ₦500,000. */
export const RENT_RELIEF_RATE = 0.2;
export const RENT_RELIEF_CAP_KOBO = 50_000_000;

/** Annual tax on annual taxable income (both in kobo, not rounded). */
export function annualPaye(taxableKobo: number): number {
  let left = Math.max(0, taxableKobo);
  let tax = 0;
  for (const [width, rate] of PAYE_BANDS) {
    const slice = Math.min(left, width);
    tax += slice * rate;
    left -= slice;
    if (left <= 0) break;
  }
  return tax;
}

export function rentRelief(annualRentKobo: number): number {
  return Math.min(Math.round(Math.max(0, annualRentKobo) * RENT_RELIEF_RATE), RENT_RELIEF_CAP_KOBO);
}

// ------------------------------------------------------------ payslip maths

export interface Allowance {
  label: string;
  amountKobo: number;
}

export const ADJUSTMENT_KINDS = ['EARNING', 'DEDUCTION'] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];
export interface PayAdjustment {
  kind: AdjustmentKind;
  label: string;
  amountKobo: number;
}

export interface PayInputs {
  basicKobo: number;
  housingKobo: number;
  transportKobo: number;
  otherAllowances: Allowance[];
  pensionEnabled: boolean;
  nhfEnabled: boolean;
  annualRentKobo: number;
  /** Approved unpaid leave days in the month. */
  unpaidLeaveDays: number;
  /** Working days (Mon–Fri) in the month. */
  workingDays: number;
  /** One-off bonuses (taxed) and deductions such as loan repayments (after tax). */
  adjustments: PayAdjustment[];
}

export interface PayLine {
  label: string;
  amountKobo: number;
}

export interface PayCalculation {
  earnings: PayLine[];
  deductions: PayLine[];
  grossKobo: number;
  payeKobo: number;
  pensionKobo: number;
  nhfKobo: number;
  otherDeductionsKobo: number;
  netKobo: number;
  employerPensionKobo: number;
  /** Annualised taxable income the PAYE was worked out on. */
  taxableAnnualKobo: number;
}

/**
 * One month's pay. Regular pay is annualised for PAYE; a one-off bonus is
 * taxed at the margin (tax with it minus tax without it), all in that month.
 * Pension is on basic + housing + transport, NHF on basic. Unpaid leave
 * reduces pay pro rata to working days.
 */
export function computePayslip(p: PayInputs, s: HrSettings = DEFAULT_HR_SETTINGS): PayCalculation {
  const other = p.otherAllowances.reduce((n, a) => n + a.amountKobo, 0);
  const regular = p.basicKobo + p.housingKobo + p.transportKobo + other;
  const unpaidDays = Math.min(Math.max(0, p.unpaidLeaveDays), p.workingDays);
  const unpaid = p.workingDays > 0 ? Math.round((regular * unpaidDays) / p.workingDays) : 0;
  const bonuses = p.adjustments.filter((a) => a.kind === 'EARNING');
  const bonusTotal = bonuses.reduce((n, a) => n + a.amountKobo, 0);
  const otherDeductions = p.adjustments.filter((a) => a.kind === 'DEDUCTION');

  const earnings: PayLine[] = [
    { label: 'Basic salary', amountKobo: p.basicKobo },
    ...(p.housingKobo ? [{ label: 'Housing allowance', amountKobo: p.housingKobo }] : []),
    ...(p.transportKobo ? [{ label: 'Transport allowance', amountKobo: p.transportKobo }] : []),
    ...p.otherAllowances.filter((a) => a.amountKobo).map((a) => ({ label: a.label, amountKobo: a.amountKobo })),
    ...(unpaid ? [{ label: `Unpaid leave (${unpaidDays} day${unpaidDays === 1 ? '' : 's'})`, amountKobo: -unpaid }] : []),
    ...bonuses.map((a) => ({ label: a.label, amountKobo: a.amountKobo })),
  ];
  const gross = regular - unpaid + bonusTotal;

  const pensionBase = p.basicKobo + p.housingKobo + p.transportKobo;
  const pension = p.pensionEnabled ? Math.round((pensionBase * s.pensionEmployeePct) / 100) : 0;
  const employerPension = p.pensionEnabled ? Math.round((pensionBase * s.pensionEmployerPct) / 100) : 0;
  const nhf = p.nhfEnabled ? Math.round((p.basicKobo * s.nhfPct) / 100) : 0;

  const taxableAnnual = Math.max(0, (regular - unpaid - pension - nhf) * 12 - rentRelief(p.annualRentKobo));
  const paye = s.payeEnabled
    ? Math.round(annualPaye(taxableAnnual) / 12 + (annualPaye(taxableAnnual + bonusTotal) - annualPaye(taxableAnnual)))
    : 0;
  const otherTotal = otherDeductions.reduce((n, a) => n + a.amountKobo, 0);

  const deductions: PayLine[] = [
    ...(paye ? [{ label: 'PAYE income tax', amountKobo: paye }] : []),
    ...(pension ? [{ label: `Pension (${s.pensionEmployeePct}%)`, amountKobo: pension }] : []),
    ...(nhf ? [{ label: `National Housing Fund (${s.nhfPct}%)`, amountKobo: nhf }] : []),
    ...otherDeductions.map((a) => ({ label: a.label, amountKobo: a.amountKobo })),
  ];

  return {
    earnings,
    deductions,
    grossKobo: gross,
    payeKobo: paye,
    pensionKobo: pension,
    nhfKobo: nhf,
    otherDeductionsKobo: otherTotal,
    netKobo: gross - paye - pension - nhf - otherTotal,
    employerPensionKobo: employerPension,
    taxableAnnualKobo: taxableAnnual,
  };
}

// ------------------------------------------------------------ dates

const DAY = 86_400_000;

/** Mon–Fri days from start to end inclusive (YYYY-MM-DD). */
export function workingDaysBetween(start: string, end: string): number {
  let n = 0;
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += DAY) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

/** Each Mon–Fri date from start to end inclusive. */
export function workingDates(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += DAY) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** "2026-09" → first and last day of the month. */
export function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${period}-01`, end: `${period}-${String(last).padStart(2, '0')}` };
}

/** "2026-09" → "September 2026". */
export function periodLabel(period: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period}-01T00:00:00Z`));
}

// ------------------------------------------------------------ enums & labels

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_APPLIES_TO = ['ALL', 'FEMALE', 'MALE'] as const;
export type LeaveAppliesTo = (typeof LEAVE_APPLIES_TO)[number];

/** Offered to every school the first time leave is opened; schools can edit them. */
export const DEFAULT_LEAVE_TYPES: { name: string; daysPerYear: number; paid: boolean; appliesTo: LeaveAppliesTo }[] = [
  { name: 'Annual leave', daysPerYear: 20, paid: true, appliesTo: 'ALL' },
  { name: 'Sick leave', daysPerYear: 10, paid: true, appliesTo: 'ALL' },
  { name: 'Maternity leave', daysPerYear: 60, paid: true, appliesTo: 'FEMALE' },
  { name: 'Paternity leave', daysPerYear: 10, paid: true, appliesTo: 'MALE' },
  { name: 'Compassionate leave', daysPerYear: 5, paid: true, appliesTo: 'ALL' },
  { name: 'Unpaid leave', daysPerYear: 30, paid: false, appliesTo: 'ALL' },
];

export const PAYROLL_STATUSES = ['DRAFT', 'APPROVED', 'PAID'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const AWARD_CATEGORIES = ['EXCELLENCE', 'TEACHER_OF_TERM', 'PUNCTUALITY', 'LONG_SERVICE', 'INNOVATION', 'SERVICE', 'OTHER'] as const;
export type AwardCategory = (typeof AWARD_CATEGORIES)[number];
export const AWARD_CATEGORY_LABELS: Record<AwardCategory, string> = {
  EXCELLENCE: 'Excellence',
  TEACHER_OF_TERM: 'Teacher of the term',
  PUNCTUALITY: 'Punctuality',
  LONG_SERVICE: 'Long service',
  INNOVATION: 'Innovation',
  SERVICE: 'Outstanding service',
  OTHER: 'Other',
};

export const STAFF_STATUSES = ['ACTIVE', 'ON_LEAVE', 'EXITED'] as const;

// ------------------------------------------------------------ schemas

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const kobo = z.number().int();
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const allowanceSchema = z.object({ label: z.string().trim().min(2).max(60), amountKobo: kobo.min(0).max(1_000_000_000) });

export const hrSettingsSchema = z.object({
  payeEnabled: z.boolean(),
  pensionEmployeePct: z.number().min(0).max(30),
  pensionEmployerPct: z.number().min(0).max(30),
  nhfPct: z.number().min(0).max(10),
  payslipNote: z.string().trim().max(300).nullable(),
});

export const departmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: nullableText(300),
  headStaffId: z.string().min(1).nullish().transform((v) => v ?? null),
});
export type DepartmentInput = z.infer<typeof departmentSchema>;

/** Full edit of an employee's record (create stays on /staff). */
export const employeeSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  gender: z.enum(['MALE', 'FEMALE']),
  email: z
    .union([z.email('Enter a valid email'), z.literal('')])
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
  phone: nullableText(20),
  jobTitle: z.string().trim().min(1).max(80),
  type: z.enum(['TEACHING', 'NON_TEACHING']),
  status: z.enum(STAFF_STATUSES),
  departmentId: z.string().min(1).nullish().transform((v) => v ?? null),
  employedOn: isoDate.nullish().transform((v) => v ?? null),
  dateOfBirth: isoDate.nullish().transform((v) => v ?? null),
  address: nullableText(300),
  qualification: nullableText(120),
  nextOfKinName: nullableText(120),
  nextOfKinPhone: nullableText(20),
  exitedOn: isoDate.nullish().transform((v) => v ?? null),
  exitReason: nullableText(300),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const employeeListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  departmentId: z.string().optional(),
  status: z.enum(STAFF_STATUSES).optional(),
  type: z.enum(['TEACHING', 'NON_TEACHING']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

export const salaryGradeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  basicKobo: kobo.min(0).max(1_000_000_000),
  housingKobo: kobo.min(0).max(1_000_000_000),
  transportKobo: kobo.min(0).max(1_000_000_000),
  otherAllowances: z.array(allowanceSchema).max(10).default([]),
});
export type SalaryGradeInput = z.infer<typeof salaryGradeSchema>;

export const payProfileSchema = z.object({
  gradeId: z.string().min(1).nullish().transform((v) => v ?? null),
  basicKobo: kobo.min(0).max(1_000_000_000),
  housingKobo: kobo.min(0).max(1_000_000_000),
  transportKobo: kobo.min(0).max(1_000_000_000),
  otherAllowances: z.array(allowanceSchema).max(10).default([]),
  pensionEnabled: z.boolean(),
  nhfEnabled: z.boolean(),
  annualRentKobo: kobo.min(0).max(100_000_000_000).default(0),
  bankName: nullableText(80),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'A NUBAN account number is 10 digits')
    .nullish()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  accountName: nullableText(120),
  pfaName: nullableText(80),
  pensionPin: nullableText(30),
  taxId: nullableText(30),
});
export type PayProfileInput = z.infer<typeof payProfileSchema>;

export const createPayrollRunSchema = z.object({ period, note: nullableText(300) });

export const payslipAdjustmentsSchema = z.object({
  adjustments: z
    .array(z.object({ kind: z.enum(ADJUSTMENT_KINDS), label: z.string().trim().min(2).max(60), amountKobo: kobo.min(1).max(1_000_000_000) }))
    .max(10),
});

export const markPayrollPaidSchema = z.object({
  paidOn: isoDate,
  method: z.string().trim().min(2).max(40).default('BANK_TRANSFER'),
  reference: nullableText(80),
});

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  daysPerYear: z.number().int().min(0).max(365),
  paid: z.boolean(),
  appliesTo: z.enum(LEAVE_APPLIES_TO).default('ALL'),
  active: z.boolean().default(true),
});
export type LeaveTypeInput = z.infer<typeof leaveTypeSchema>;

export const leaveRequestSchema = z
  .object({
    /** Managers may file on someone's behalf; staff omit it for themselves. */
    staffId: z.string().min(1).optional(),
    leaveTypeId: z.string().min(1),
    startDate: isoDate,
    endDate: isoDate,
    reason: nullableText(500),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'The last day must be on or after the first', path: ['endDate'] })
  .refine((v) => v.startDate.slice(0, 4) === v.endDate.slice(0, 4), { message: 'Split leave that crosses into a new year into two requests', path: ['endDate'] });
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const leaveDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'DECLINE']),
  note: nullableText(300),
});

export const leaveListQuerySchema = z.object({
  status: z.enum(LEAVE_STATUSES).optional(),
  staffId: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const awardSchema = z.object({
  staffId: z.string().min(1),
  title: z.string().trim().min(2).max(120),
  category: z.enum(AWARD_CATEGORIES),
  citation: nullableText(2000),
  prize: nullableText(120),
  awardedOn: isoDate,
});
export type AwardInput = z.infer<typeof awardSchema>;

export const awardCitationRequestSchema = z.object({
  staffId: z.string().min(1),
  title: z.string().trim().min(2).max(120),
  category: z.enum(AWARD_CATEGORIES),
  notes: z.string().trim().max(600).optional(),
});

/** What the model must return for a citation. */
export const aiCitationSchema = z.object({
  citation: z.string().describe('The citation read out at the presentation, 90–140 words'),
  shortVersion: z.string().describe('One sentence for the certificate, at most 30 words'),
});
export type AiCitation = z.infer<typeof aiCitationSchema>;

// ------------------------------------------------------------ responses

export interface StaffRef {
  id: string;
  name: string;
  jobTitle: string;
}

export interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
  head: StaffRef | null;
  headcount: number;
}

export interface EmployeeRow {
  id: string;
  staffNumber: string;
  firstName: string;
  lastName: string;
  name: string;
  gender: 'MALE' | 'FEMALE';
  email: string | null;
  phone: string | null;
  jobTitle: string;
  type: 'TEACHING' | 'NON_TEACHING';
  status: (typeof STAFF_STATUSES)[number];
  department: { id: string; name: string } | null;
  employedOn: string | null;
  yearsOfService: number | null;
  /** Last day of approved leave covering today, if any. */
  onLeaveUntil: string | null;
  /** null when the viewer can't see pay. */
  hasPayProfile: boolean | null;
}

export interface LeaveBalance {
  leaveTypeId: string;
  name: string;
  paid: boolean;
  entitled: number;
  taken: number;
  pending: number;
  remaining: number;
}

export interface LeaveTypeRow {
  id: string;
  name: string;
  daysPerYear: number;
  paid: boolean;
  appliesTo: LeaveAppliesTo;
  active: boolean;
}

export interface LeaveRequestRow {
  id: string;
  staff: StaffRef & { department: string | null };
  leaveType: { id: string; name: string; paid: boolean };
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Others in the same department on approved or pending leave on overlapping days. */
  overlaps: string[];
  /** Days left of this leave type for the year, before this request. */
  remainingBefore: number | null;
}

export interface AwardRow {
  id: string;
  staff: StaffRef;
  title: string;
  category: AwardCategory;
  citation: string | null;
  prize: string | null;
  awardedOn: string;
}

export interface RecognitionSuggestion {
  kind: 'PUNCTUALITY' | 'PERFECT_ATTENDANCE' | 'LONG_SERVICE';
  staff: StaffRef;
  detail: string;
}

export interface StaffAttendanceSummary {
  month: string;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  /** Present on time ÷ days attended, %. */
  onTimeRate: number | null;
  /** Average check-in time (school time), HH:MM. */
  avgCheckIn: string | null;
}

export interface PayProfileView extends Omit<PayProfileInput, 'gradeId'> {
  gradeId: string | null;
  gradeName: string | null;
  /** This month's pay worked out from the profile (no adjustments or leave). */
  preview: PayCalculation;
}

export interface EmployeeDetail extends EmployeeRow {
  dateOfBirth: string | null;
  address: string | null;
  qualification: string | null;
  nextOfKinName: string | null;
  nextOfKinPhone: string | null;
  exitedOn: string | null;
  exitReason: string | null;
  hasLogin: boolean;
  classesLed: string[];
  subjectsTaught: string[];
  leaveBalances: LeaveBalance[];
  leave: LeaveRequestRow[];
  attendance: StaffAttendanceSummary;
  awards: AwardRow[];
  canSeePay: boolean;
  payProfile: PayProfileView | null;
  currency: string;
}

/** One line of the salaries table: an active employee and their monthly pay. */
export interface PayProfileRow {
  staff: StaffRef & { staffNumber: string; department: string | null; type: 'TEACHING' | 'NON_TEACHING' };
  gradeName: string | null;
  /** null when no pay details are set yet. */
  grossKobo: number | null;
  payeKobo: number | null;
  netKobo: number | null;
  /** What's still missing for payroll: "bank account", "pension PIN"… */
  missing: string[];
}

export interface SalaryGradeRow {
  id: string;
  name: string;
  basicKobo: number;
  housingKobo: number;
  transportKobo: number;
  otherAllowances: Allowance[];
  grossKobo: number;
  staffCount: number;
}

export interface PayrollTotals {
  staffCount: number;
  grossKobo: number;
  payeKobo: number;
  pensionKobo: number;
  employerPensionKobo: number;
  nhfKobo: number;
  otherDeductionsKobo: number;
  netKobo: number;
  /** What the school pays out in total: gross + employer pension. */
  costKobo: number;
}

export interface PayrollRunRow extends PayrollTotals {
  id: string;
  period: string;
  label: string;
  status: PayrollStatus;
  preparedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  paidOn: string | null;
}

export interface PayslipRow {
  id: string;
  staffId: string;
  staffName: string;
  staffNumber: string;
  jobTitle: string;
  department: string | null;
  grossKobo: number;
  payeKobo: number;
  pensionKobo: number;
  nhfKobo: number;
  otherDeductionsKobo: number;
  netKobo: number;
  employerPensionKobo: number;
  unpaidLeaveDays: number;
  adjustments: PayAdjustment[];
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  /** Net pay on the previous month's run, for comparison. */
  previousNetKobo: number | null;
}

export interface PayrollCheck {
  level: 'warning' | 'info';
  message: string;
  staffId?: string;
}

export interface PayrollRunDetail extends PayrollRunRow {
  workingDays: number;
  payMethod: string | null;
  payReference: string | null;
  note: string | null;
  payslips: PayslipRow[];
  checks: PayrollCheck[];
  /** Active staff not on this run (no pay details yet). */
  missing: StaffRef[];
  previous: (PayrollTotals & { period: string; label: string }) | null;
  /** Statutory remittances due for the month. */
  remittances: { payeKobo: number; pensionKobo: number; nhfKobo: number; byPfa: { pfa: string; staff: number; amountKobo: number }[] };
  currency: string;
  taxRules: string;
}

export interface PayslipView {
  id: string;
  runId: string;
  period: string;
  label: string;
  status: PayrollStatus;
  paidOn: string | null;
  school: { name: string; address: string | null; logoUrl: string | null };
  staff: { id: string; name: string; staffNumber: string; jobTitle: string; department: string | null };
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  pfaName: string | null;
  pensionPin: string | null;
  taxId: string | null;
  earnings: PayLine[];
  deductions: PayLine[];
  grossKobo: number;
  netKobo: number;
  employerPensionKobo: number;
  unpaidLeaveDays: number;
  /** Year to date, from approved and paid runs in the same year up to this one. */
  ytd: { grossKobo: number; payeKobo: number; pensionKobo: number; netKobo: number };
  note: string | null;
  currency: string;
  taxRules: string;
}

export interface HrOverview {
  today: string;
  currency: string;
  headcount: {
    active: number;
    teaching: number;
    nonTeaching: number;
    onLeaveToday: number;
    joinersThisYear: number;
    leaversThisYear: number;
  };
  byDepartment: { id: string | null; name: string; count: number }[];
  leave: {
    pending: number;
    onLeaveToday: { staff: StaffRef; leaveType: string; until: string }[];
    upcoming: { staff: StaffRef; leaveType: string; startDate: string; endDate: string; days: number }[];
  };
  attendance: StaffAttendanceSummary & { mostLate: { staff: StaffRef; late: number }[] };
  /** null when the viewer can't see payroll. */
  payroll: { latest: PayrollRunRow | null; trend: { period: string; label: string; grossKobo: number; netKobo: number; staffCount: number }[] } | null;
  birthdays: { staff: StaffRef; date: string }[];
  anniversaries: { staff: StaffRef; years: number; date: string }[];
  awardsThisYear: number;
  recognition: RecognitionSuggestion[];
}

export interface MyHr {
  staff: (StaffRef & { staffNumber: string; department: string | null }) | null;
  leaveTypes: LeaveTypeRow[];
  leaveBalances: LeaveBalance[];
  leave: LeaveRequestRow[];
  payslips: { id: string; period: string; label: string; netKobo: number; status: PayrollStatus; paidOn: string | null }[];
  awards: AwardRow[];
  currency: string;
}

export interface AiText {
  text: string;
  provider: string;
  model: string;
}
