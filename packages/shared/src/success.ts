import { z } from 'zod';

/**
 * School success dashboard: evidence of value for each school (adoption,
 * learning outcomes, parent engagement, teacher time saved, fees) and, for
 * the platform team, every school side by side with a health score and risk
 * flags. Everything is computed from existing records; nothing is stored.
 */

// ============================================================ teacher time saved (estimate)

/**
 * Minutes of teacher time each AI-assisted action is assumed to save. These
 * are estimates, shown on the page next to the result; change them here and
 * the API and page both follow.
 */
export const TIME_SAVED_ASSUMPTIONS = [
  { key: 'aiLessonPlans', label: 'AI-drafted lesson plans', minutes: 30, per: 'plan', basis: 'Writing a lesson note by hand takes about 45 minutes; reviewing and adjusting an AI draft about 15.' },
  { key: 'aiHomework', label: 'AI-drafted homework', minutes: 10, per: 'assignment', basis: 'Setting questions and a marking guide for one assignment.' },
  { key: 'aiReportRemarks', label: 'AI report-card remarks', minutes: 3, per: 'student remark', basis: 'Writing a personal end-of-term remark for one student.' },
  { key: 'autoMarkedCbt', label: 'Auto-marked online test answers', minutes: 0.5, per: 'objective answer', basis: 'Marking and recording one multiple-choice or true/false answer by hand.' },
  { key: 'aiHomeworkMarking', label: 'AI homework marking suggestions', minutes: 2, per: 'script', basis: 'Reading and marking one written homework script against the guide.' },
] as const;
export type TimeSavedKey = (typeof TIME_SAVED_ASSUMPTIONS)[number]['key'];

// ============================================================ health score

/** Days of activity the health score looks back over. */
export const HEALTH_WINDOW_DAYS = 14;
/** Learning-update opens are measured over this longer window (updates go out weekly). */
export const HEALTH_UPDATES_WINDOW_DAYS = 28;

/**
 * School health score, 0–100: the sum of these parts. Each part is a share
 * (0–1) times its weight, measured over the last 14 days (update opens over
 * 28 days). Weights add up to 100.
 */
export const HEALTH_WEIGHTS = {
  staffActive: 20,
  parentsActive: 15,
  studentsActive: 15,
  classesWithWork: 15,
  studentsLearning: 15,
  updatesOpened: 12,
  parentAccounts: 8,
} as const;
export type HealthPartKey = keyof typeof HEALTH_WEIGHTS;

export const HEALTH_PARTS: { key: HealthPartKey; group: 'Adoption' | 'Learning activity' | 'Parent engagement'; label: string; measure: string }[] = [
  { key: 'staffActive', group: 'Adoption', label: 'Staff active', measure: 'Share of staff with an account who signed in or used the app' },
  { key: 'parentsActive', group: 'Adoption', label: 'Parents active', measure: 'Share of parents and guardians who signed in to the portal' },
  { key: 'studentsActive', group: 'Adoption', label: 'Students active', measure: 'Share of students who signed in, practised, used the tutor, handed in homework or sat an online test' },
  { key: 'classesWithWork', group: 'Learning activity', label: 'Classes with work set', measure: 'Share of classes given homework or an online test' },
  { key: 'studentsLearning', group: 'Learning activity', label: 'Students with mastery evidence', measure: 'Share of students with new topic-mastery evidence (practice, tutor, homework, tests)' },
  { key: 'updatesOpened', group: 'Parent engagement', label: 'Learning updates opened', measure: 'Share of in-app weekly learning updates parents opened (last 28 days)' },
  { key: 'parentAccounts', group: 'Parent engagement', label: 'Parents with portal accounts', measure: 'Share of parents and guardians who have a portal account' },
];

export type HealthInputs = Record<HealthPartKey, number | null>;

export interface HealthPart {
  key: HealthPartKey;
  /** The share, 0–1 (null when there is nothing to measure, e.g. no updates sent). */
  share: number | null;
  weight: number;
  points: number;
}

export interface HealthResult {
  score: number;
  band: HealthBand;
  parts: HealthPart[];
}

export type HealthBand = 'STRONG' | 'STEADY' | 'AT_RISK';
export const HEALTH_BAND_LABELS: Record<HealthBand, string> = { STRONG: 'Strong', STEADY: 'Steady', AT_RISK: 'At risk' };
export const healthBand = (score: number): HealthBand => (score >= 65 ? 'STRONG' : score >= 40 ? 'STEADY' : 'AT_RISK');

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** The health score from its inputs. A missing share counts as 0 points. */
export function healthScore(inputs: HealthInputs): HealthResult {
  const parts = HEALTH_PARTS.map(({ key }) => {
    const share = inputs[key] === null ? null : clamp01(inputs[key]!);
    const weight = HEALTH_WEIGHTS[key];
    return { key, share, weight, points: Math.round((share ?? 0) * weight * 10) / 10 };
  });
  const score = Math.round(parts.reduce((t, p) => t + (p.share ?? 0) * p.weight, 0));
  return { score, band: healthBand(score), parts };
}

// ============================================================ school view

export const successQuerySchema = z.object({ termId: z.string().min(1).optional() });
export type SuccessQuery = z.infer<typeof successQuerySchema>;

/** One week (Monday to Sunday, school time) of activity. */
export interface SuccessWeek {
  /** Monday, YYYY-MM-DD. */
  week: string;
  staffActive: number;
  teachersActive: number;
  parentsActive: number;
  studentsActive: number;
  registers: number;
  homeworkSet: number;
  homeworkHandedIn: number;
  homeworkGraded: number;
  testsRun: number;
  testsSat: number;
  lessonPlans: number;
  lessonPlansVetted: number;
  messagesSent: number;
  reportCardsPublished: number;
  evidence: number;
  tutorConversations: number;
  practiceAttempts: number;
  /** Average Exam Academy practice score that week, % (null when none). */
  practiceAverage: number | null;
  updatesSent: number;
  updatesOpened: number;
  onlinePayments: number;
  /** Null without finance.read. */
  onlinePaymentsKobo: number | null;
}

export interface SuccessTermOption {
  id: string;
  label: string;
  isCurrent: boolean;
}

export interface SuccessSummary {
  school: { id: string; name: string; logoUrl: string | null };
  currency: string;
  term: { id: string; label: string; startsOn: string; endsOn: string; isCurrent: boolean } | null;
  terms: SuccessTermOption[];
  /** The period the term figures cover (term start to today, or term end). */
  range: { from: string; to: string };
  generatedAt: string;

  health: HealthResult & { previous: number | null; windowDays: number };

  population: {
    staff: number;
    staffWithAccounts: number;
    teachers: number;
    students: number;
    studentsWithAccounts: number;
    guardians: number;
    guardianAccounts: number;
    classes: number;
  };

  /** The last 7 days, for the headline tiles. */
  lastWeek: { staffActive: number; parentsActive: number; studentsActive: number; studentsLearning: number };

  /** Totals over the term (active counts are distinct people over the term). */
  adoption: {
    staffActive: number;
    teachersActive: number;
    parentsActive: number;
    studentsActive: number;
    registers: number;
    homeworkSet: number;
    homeworkHandedIn: number;
    homeworkGraded: number;
    testsRun: number;
    testsSat: number;
    lessonPlans: number;
    lessonPlansVetted: number;
    messagesSent: number;
    reportCardsPublished: number;
    tutorConversations: number;
  };

  outcomes: {
    evidenceTotal: number;
    evidenceBySource: { source: string; label: string; count: number }[];
    /** Student–topic pairs with two or more pieces of evidence this term. */
    trackedPairs: number;
    trackedStudents: number;
    /** Mean of (latest − first) mastery score over tracked pairs, in points. */
    averageGain: number | null;
    /** Tracked pairs that started below 50. */
    startedBelow: number;
    /** …and are now at 50 or above. */
    recovered: number;
    recoveredShare: number | null;
    bySubject: { subject: string; pairs: number; averageGain: number; recovered: number }[];
    practice: {
      attempts: number;
      averageScore: number | null;
      /** Average of the first and second halves of the term's practice, % (shows the trend). */
      firstHalfAverage: number | null;
      secondHalfAverage: number | null;
    };
  };

  parents: {
    updatesSent: number;
    /** In-app learning updates delivered to parents, and how many were opened. */
    inAppDelivered: number;
    opened: number;
    openRate: number | null;
    optedOut: number;
    guardians: number;
    /** Portal sign-ins by parents this term (each sign-in, not each page view). */
    signIns: number;
    onlinePayments: number;
    /** Null without finance.read. */
    onlinePaymentsKobo: number | null;
  };

  timeSaved: {
    items: { key: TimeSavedKey; label: string; count: number; minutesEach: number; per: string; basis: string; minutes: number }[];
    totalMinutes: number;
    totalHours: number;
  };

  /** Only for people who can see finance. */
  finance: {
    billedKobo: number;
    collectedKobo: number;
    collectionRate: number | null;
    onlineKobo: number;
    offlineKobo: number;
    onlineShare: number | null;
    onlineCount: number;
  } | null;
}

export interface SuccessTrends {
  weeks: SuccessWeek[];
  generatedAt: string;
}

// ============================================================ platform view

export type SuccessRiskCode = 'NO_STAFF_LOGINS' | 'NO_HOMEWORK_TESTS' | 'PARENTS_INACTIVE' | 'LOW_HEALTH';
export const SUCCESS_RISK_LABELS: Record<SuccessRiskCode, string> = {
  NO_STAFF_LOGINS: 'No staff sign-ins in 7 days',
  NO_HOMEWORK_TESTS: 'No homework or online tests in 14 days',
  PARENTS_INACTIVE: 'Parents inactive (under 5% signed in, 14 days)',
  LOW_HEALTH: 'Health score under 40',
};

export interface PlatformSuccessRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  students: number;
  health: number;
  band: HealthBand;
  /** Health a week ago, for the trend arrow. */
  previous: number;
  trend: 'UP' | 'DOWN' | 'FLAT';
  staffActivePct: number | null;
  parentsActivePct: number | null;
  studentsActivePct: number | null;
  /** Homework set and online tests run in the last 14 days. */
  homework14d: number;
  tests14d: number;
  lastActivityAt: string | null;
  lastStaffActivityAt: string | null;
  risks: SuccessRiskCode[];
}

export interface PlatformSuccess {
  generatedAt: string;
  averageHealth: number | null;
  atRisk: number;
  schools: PlatformSuccessRow[];
}
