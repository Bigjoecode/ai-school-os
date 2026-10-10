import { TIME_SAVED_ASSUMPTIONS, type TimeSavedKey } from '@aischool/shared';
import { SALES_PLANS } from './config';

/**
 * The savings calculator's sums. Minutes saved per action come from the success dashboard's
 * TIME_SAVED_ASSUMPTIONS (packages/shared/src/success.ts) so the sales estimate and the in-app
 * "teacher time saved" use the same numbers. Everything is an estimate; every input can be changed.
 */
const minutes = (key: TimeSavedKey) => TIME_SAVED_ASSUMPTIONS.find((a) => a.key === key)!.minutes;
export const assumption = (key: TimeSavedKey) => TIME_SAVED_ASSUMPTIONS.find((a) => a.key === key)!;

export interface CalcInputs {
  plan: string;
  students: number;
  teachers: number;
  weeksPerTerm: number;
  /** Share of the work below that is done with the app, %. */
  adoptionPct: number;
  lessonNoteHours: number;
  markingHours: number;
  objectiveSharePct: number;
  homeworkScripts: number;
  remarksPerStudent: number;
  teacherSalary: number;
  teacherHoursPerMonth: number;
  printedExamCost: number;
  cbtSharePct: number;
  smsCost: number;
  smsReplacedPct: number;
  feePerStudent: number;
  collectionRatePct: number;
  collectionGainPts: number;
  // Assumptions (minutes), defaulting to the shared ones.
  lessonNoteManualMin: number;
  lessonNoteSavedMin: number;
  remarkSavedMin: number;
  homeworkSavedMin: number;
}

/** Example figures to start from — each school replaces them with its own. */
export const DEFAULT_INPUTS: CalcInputs = {
  plan: 'school-license',
  students: 400,
  teachers: 25,
  weeksPerTerm: 12,
  adoptionPct: 50,
  lessonNoteHours: 3,
  markingHours: 4,
  objectiveSharePct: 25,
  homeworkScripts: 20,
  remarksPerStudent: 1,
  teacherSalary: 0,
  teacherHoursPerMonth: 160,
  printedExamCost: 0,
  cbtSharePct: 50,
  smsCost: 0,
  smsReplacedPct: 50,
  feePerStudent: 0,
  collectionRatePct: 0,
  collectionGainPts: 0,
  // "Writing a lesson note by hand takes about 45 minutes; reviewing and adjusting an AI draft about 15." (success.ts)
  lessonNoteManualMin: 45,
  lessonNoteSavedMin: minutes('aiLessonPlans'),
  remarkSavedMin: minutes('aiReportRemarks'),
  homeworkSavedMin: minutes('aiHomeworkMarking'),
};

export const INPUT_KEYS = Object.keys(DEFAULT_INPUTS) as (keyof CalcInputs)[];

const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const pct = (n: number) => Math.min(100, pos(n)) / 100;

export interface CalcResult {
  hours: { lessonNotes: number; remarks: number; objectiveMarking: number; homeworkMarking: number; total: number; perTeacherPerWeek: number };
  currentHours: number;
  hourlyCost: number;
  timeValue: number;
  paperSaved: number;
  smsSaved: number;
  extraFees: number;
  cashBenefit: number;
  plan: (typeof SALES_PLANS)[number];
  planTooSmall: boolean;
  cost: number;
  pricePerStudent: number;
  cashBenefitPerStudent: number;
  totalBenefitPerStudent: number;
  /** Weeks of the term for the benefits to equal the cost (null when there is no benefit to count). */
  paybackWeeks: number | null;
}

export function calculate(i: CalcInputs): CalcResult {
  const adoption = pct(i.adoptionPct);
  const weeks = pos(i.weeksPerTerm);
  const teachers = pos(i.teachers);
  const students = pos(i.students);

  const lessonShare = i.lessonNoteManualMin > 0 ? Math.min(1, pos(i.lessonNoteSavedMin) / i.lessonNoteManualMin) : 0;
  const lessonNotes = teachers * pos(i.lessonNoteHours) * weeks * adoption * lessonShare;
  const remarks = (students * pos(i.remarksPerStudent) * pos(i.remarkSavedMin) * adoption) / 60;
  const markingTotal = teachers * pos(i.markingHours) * weeks;
  const objectiveMarking = markingTotal * pct(i.objectiveSharePct) * adoption;
  // Written homework sits in the rest of the marking time, so it can't save more than that.
  const homeworkMarking = Math.min((teachers * pos(i.homeworkScripts) * weeks * pos(i.homeworkSavedMin) * adoption) / 60, markingTotal * (1 - pct(i.objectiveSharePct)) * adoption);
  const total = lessonNotes + remarks + objectiveMarking + homeworkMarking;
  const currentHours = teachers * (pos(i.lessonNoteHours) + pos(i.markingHours)) * weeks;

  const hourlyCost = i.teacherHoursPerMonth > 0 ? pos(i.teacherSalary) / i.teacherHoursPerMonth : 0;
  const timeValue = total * hourlyCost;
  const paperSaved = pos(i.printedExamCost) * pct(i.cbtSharePct);
  const smsSaved = pos(i.smsCost) * pct(i.smsReplacedPct);
  const gain = Math.min(pos(i.collectionGainPts), Math.max(0, 100 - pos(i.collectionRatePct)));
  const extraFees = students * pos(i.feePerStudent) * (gain / 100);
  const cashBenefit = paperSaved + smsSaved + extraFees;

  const plan = SALES_PLANS.find((p) => p.code === i.plan) ?? SALES_PLANS[1]!;
  const cost = plan.price * students;
  const totalBenefit = cashBenefit + timeValue;
  const perWeek = weeks > 0 ? totalBenefit / weeks : 0;

  return {
    hours: { lessonNotes, remarks, objectiveMarking, homeworkMarking, total, perTeacherPerWeek: teachers > 0 && weeks > 0 ? total / teachers / weeks : 0 },
    currentHours,
    hourlyCost,
    timeValue,
    paperSaved,
    smsSaved,
    extraFees,
    cashBenefit,
    plan,
    planTooSmall: plan.maxStudents != null && students > plan.maxStudents,
    cost,
    pricePerStudent: plan.price,
    cashBenefitPerStudent: students > 0 ? cashBenefit / students : 0,
    totalBenefitPerStudent: students > 0 ? totalBenefit / students : 0,
    paybackWeeks: perWeek > 0 ? cost / perWeek : null,
  };
}

/** Inputs from a shared link (?students=400&…); unknown or bad values fall back to the defaults. */
export function inputsFromSearch(search: URLSearchParams): CalcInputs {
  const out: CalcInputs = { ...DEFAULT_INPUTS };
  for (const key of INPUT_KEYS) {
    const raw = search.get(key);
    if (raw == null) continue;
    if (key === 'plan') {
      if (SALES_PLANS.some((p) => p.code === raw)) out.plan = raw;
      continue;
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n < 1e12) (out as unknown as Record<string, number>)[key] = n;
  }
  return out;
}

/** Only the inputs that differ from the defaults, to keep shared links short. */
export function inputsToSearch(i: CalcInputs): URLSearchParams {
  const p = new URLSearchParams();
  for (const key of INPUT_KEYS) if (i[key] !== DEFAULT_INPUTS[key]) p.set(key, String(i[key]));
  return p;
}
