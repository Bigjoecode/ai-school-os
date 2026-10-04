import { z } from 'zod';

/**
 * Phase 15: the parent-paid layer. Three ways to pay (school SaaS, parent
 * subscriptions, school sponsorships) all end in entitlements on a student;
 * features check entitlements, never subscriptions.
 */

// ============================================================ entitlements

export const ENTITLEMENTS = {
  STUDENT_AI_BASIC: { label: 'AI Basic', description: 'Included with the school: homework help, explanations and short quizzes.' },
  STUDENT_AI_PLUS: { label: 'AI Plus', description: 'Personal tutor, study plans, flashcards, mastery tracking, photo questions and deeper explanations.' },
  STUDENT_AI_PRO: { label: 'AI Pro', description: 'Everything in Plus with the highest allowance and deep reasoning by default.' },
  EXAM_BECE: { label: 'BECE Prep', description: 'BECE practice, timed mock exams and revision plans.' },
  EXAM_WAEC: { label: 'WAEC Prep', description: 'WAEC (SSCE) practice, timed mock exams and revision plans.' },
  EXAM_NECO: { label: 'NECO Prep', description: 'NECO practice, timed mock exams and revision plans.' },
  EXAM_JAMB: { label: 'JAMB Prep', description: 'JAMB UTME practice, timed CBT mocks and revision plans.' },
} as const;
export type EntitlementKey = keyof typeof ENTITLEMENTS;
export const ENTITLEMENT_KEYS = Object.keys(ENTITLEMENTS) as EntitlementKey[];

export const EXAMS = ['BECE', 'WAEC', 'NECO', 'JAMB'] as const;
export type ExamBody = (typeof EXAMS)[number];
export const EXAM_LABELS: Record<ExamBody, string> = { BECE: 'BECE', WAEC: 'WAEC (SSCE)', NECO: 'NECO', JAMB: 'JAMB UTME' };
export const examEntitlement = (exam: ExamBody) => `EXAM_${exam}` as EntitlementKey;

export const AI_TIERS = ['BASIC', 'PLUS', 'PRO'] as const;
export type StudentAiTier = (typeof AI_TIERS)[number];

/**
 * Fair use behind each tier. Parents see "learning access", never tokens. A
 * session is one question to the tutor; deep answers (the stronger model)
 * count as several. The included Basic allowance comes from the school's plan.
 */
export const TIER_POLICY: Record<StudentAiTier, { dailyCap: number; deepAllowed: boolean; deepCost: number; deepByDefault: boolean; photos: boolean; studyTools: boolean }> = {
  BASIC: { dailyCap: 8, deepAllowed: false, deepCost: 3, deepByDefault: false, photos: false, studyTools: false },
  PLUS: { dailyCap: 60, deepAllowed: true, deepCost: 3, deepByDefault: false, photos: true, studyTools: true },
  PRO: { dailyCap: 150, deepAllowed: true, deepCost: 2, deepByDefault: true, photos: true, studyTools: true },
};

export interface StudentAccess {
  studentId: string;
  name: string;
  tier: StudentAiTier;
  tierLabel: string;
  /** Sessions in the current allowance window. */
  allowance: number;
  used: number;
  remaining: number;
  /** 0–100, what the UI shows ("82% remaining"). */
  remainingPct: number;
  usedToday: number;
  dailyCap: number;
  windowStart: string;
  windowEnd: string;
  deepAllowed: boolean;
  deepCost: number;
  photos: boolean;
  studyTools: boolean;
  exams: ExamBody[];
  entitlements: { key: EntitlementKey; label: string; source: 'INCLUDED' | 'PARENT' | 'SCHOOL' | 'PLATFORM'; endsAt: string | null }[];
}

// ============================================================ products & commerce

export const PRODUCT_KINDS = ['AI', 'EXAM'] as const;
export const PRODUCT_PERIODS = ['TERM', 'MONTH', 'YEAR', 'ONE_OFF'] as const;
export type ProductPeriod = (typeof PRODUCT_PERIODS)[number];
export const PRODUCT_PERIOD_LABELS: Record<ProductPeriod, string> = { TERM: 'per term', MONTH: 'per month', YEAR: 'per year', ONE_OFF: 'one-off' };

export const productSchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,40}$/, 'Capitals, numbers and underscores'),
  name: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(140).nullish().transform((v) => v || null),
  description: z.string().trim().max(600).nullish().transform((v) => v || null),
  kind: z.enum(PRODUCT_KINDS),
  entitlements: z.array(z.enum(ENTITLEMENT_KEYS as [EntitlementKey, ...EntitlementKey[]])).min(1),
  priceKobo: z.number().int().min(0).max(100_000_000),
  /** What a school pays per student to sponsor it; null = not offered to schools. */
  schoolPriceKobo: z.number().int().min(0).max(100_000_000).nullable(),
  period: z.enum(PRODUCT_PERIODS),
  /** How long access lasts: a term is four months; a one-off exam pack usually twelve. */
  periodMonths: z.number().int().min(1).max(24),
  maxChildren: z.number().int().min(1).max(10),
  aiSessions: z.number().int().min(0).max(100_000).nullable(),
  features: z.array(z.string().trim().min(2).max(120)).max(12),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type ProductInput = z.infer<typeof productSchema>;
export interface ProductRow extends ProductInput {
  id: string;
  activeSubscriptions: number;
  sponsoredStudents: number;
}

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/, 'Letters, numbers and dashes'),
  description: z.string().trim().max(200).nullish().transform((v) => v || null),
  percentOff: z.number().int().min(1).max(100).nullable(),
  amountOffKobo: z.number().int().min(100).max(100_000_000).nullable(),
  productCodes: z.array(z.string()).max(20),
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable(),
  expiresAt: z.iso.date().nullable(),
  active: z.boolean(),
});
export interface CouponRow extends z.infer<typeof couponSchema> {
  id: string;
  redemptions: number;
  createdAt: string;
}

export const checkoutSchema = z.object({
  productCode: z.string().min(2),
  studentIds: z.array(z.string().min(1)).min(1).max(10),
  couponCode: z.string().trim().toUpperCase().max(30).nullish().transform((v) => v || null),
  autoRenew: z.boolean().default(true),
  /** Where Paystack sends the receipt (defaults to the account's email). */
  email: z.email().trim().toLowerCase().max(160).nullish().transform((v) => v || null),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export interface CheckoutQuote {
  product: { code: string; name: string; period: ProductPeriod; periodMonths: number };
  students: { id: string; name: string }[];
  priceKobo: number;
  discountKobo: number;
  totalKobo: number;
  coupon: { code: string; description: string | null } | null;
  /** Children already covered by this kind of product (the checkout refuses them). */
  alreadyCovered: { id: string; name: string; until: string }[];
}

export const SUBSCRIPTION_STATES = ['PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'] as const;
export type ConsumerSubscriptionStatus = (typeof SUBSCRIPTION_STATES)[number];

export interface FamilyChild {
  id: string;
  name: string;
  school: { id: string; name: string; slug: string };
  classArm: string | null;
  access: StudentAccess;
}
export interface FamilySubscriptionRow {
  id: string;
  product: { code: string; name: string; kind: string; period: ProductPeriod };
  status: ConsumerSubscriptionStatus;
  students: { id: string; name: string }[];
  priceKobo: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  card: string | null;
  createdAt: string;
}
export interface FamilyOrderRow {
  id: string;
  reference: string;
  product: string;
  kind: 'NEW' | 'RENEWAL';
  amountKobo: number;
  discountKobo: number;
  status: string;
  refundedKobo: number;
  paidAt: string | null;
  createdAt: string;
}
export interface FamilyOverview {
  children: FamilyChild[];
  subscriptions: FamilySubscriptionRow[];
  orders: FamilyOrderRow[];
  products: ProductRow[];
  onlinePayment: boolean;
}

export const sponsorshipSchema = z.object({
  productCode: z.string().min(2),
  classArmIds: z.array(z.string().min(1)).min(1).max(100),
  title: z.string().trim().min(3).max(120),
  startsOn: z.iso.date(),
  months: z.number().int().min(1).max(12),
});
export interface SponsorshipRow {
  id: string;
  title: string;
  school: { name: string; slug: string };
  product: { code: string; name: string };
  classes: string[];
  students: number;
  unitKobo: number;
  totalKobo: number;
  startsAt: string;
  endsAt: string;
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
  invoiceNumber: string | null;
  createdAt: string;
}

export const refundSchema = z.object({
  amountKobo: z.number().int().min(100),
  reason: z.string().trim().min(3).max(300),
  /** Also end the access the payment bought. */
  revokeAccess: z.boolean().default(false),
});

export const LEDGER_ACCOUNTS = ['CASH_PAYSTACK', 'CASH_BANK', 'RECEIVABLE_SCHOOLS', 'REVENUE_SCHOOL', 'REVENUE_STUDENT_AI', 'REVENUE_EXAM', 'REFUNDS', 'PAYMENT_FEES'] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];
export const LEDGER_ACCOUNT_LABELS: Record<LedgerAccount, string> = {
  CASH_PAYSTACK: 'Cash — Paystack',
  CASH_BANK: 'Cash — bank',
  RECEIVABLE_SCHOOLS: 'Receivable — schools',
  REVENUE_SCHOOL: 'Revenue — School OS',
  REVENUE_STUDENT_AI: 'Revenue — Student AI',
  REVENUE_EXAM: 'Revenue — Exam Academy',
  REFUNDS: 'Refunds',
  PAYMENT_FEES: 'Payment fees',
};
export const REVENUE_DOMAINS = ['SCHOOL', 'STUDENT_AI', 'EXAM'] as const;
export type RevenueDomain = (typeof REVENUE_DOMAINS)[number];

export interface LedgerRow {
  id: string;
  txnId: string;
  account: LedgerAccount;
  debitKobo: number;
  creditKobo: number;
  domain: string;
  memo: string;
  source: { type: string; id: string };
  tenant: string | null;
  createdAt: string;
}
export interface LedgerSummary {
  from: string;
  to: string;
  balances: { account: LedgerAccount; debitKobo: number; creditKobo: number; balanceKobo: number }[];
  revenueByDomain: { domain: RevenueDomain; grossKobo: number; refundsKobo: number; netKobo: number }[];
  monthly: { month: string; school: number; studentAi: number; exam: number }[];
  balanced: boolean;
}

export interface UnitEconomicsRow {
  product: { code: string; name: string; kind: string };
  subscribers: number;
  students: number;
  revenueKobo: number;
  aiCostUsd: number;
  aiCostKobo: number;
  feesKobo: number;
  contributionKobo: number;
  perStudent: { revenueKobo: number; aiCostKobo: number; feesKobo: number; contributionKobo: number };
  marginPct: number | null;
}
export interface UnitEconomics {
  from: string;
  to: string;
  nairaPerUsd: number;
  rows: UnitEconomicsRow[];
  basic: { students: number; aiCostKobo: number; perStudentKobo: number };
  conversion: { eligibleStudents: number; paying: number; ratePct: number };
}

// ============================================================ learning companion

export const tutorChatSchema = z.object({
  conversationId: z.string().nullish(),
  message: z.string().trim().min(1).max(4000),
  /** Use the stronger model; costs more of the allowance. */
  deep: z.boolean().default(false),
  /** Uploaded image ids (Plus/Pro): a photo of the question. */
  imageFileIds: z.array(z.string()).max(3).default([]),
  subject: z.string().trim().max(60).nullish(),
  /** The student is talking by voice and will hear the reply read aloud. */
  voice: z.boolean().default(false),
});
export const tutorSpeakSchema = z.object({ text: z.string().trim().min(1).max(1500) });
export interface TutorVoiceInfo {
  /** Server speech (OpenAI) is connected; otherwise use the browser's speech features. */
  server: boolean;
  maxSpeakChars: number;
}
export type TutorChatInput = z.infer<typeof tutorChatSchema>;
export interface TutorReply {
  conversationId: string;
  reply: string;
  deep: boolean;
  access: StudentAccess;
  savedItems: { kind: 'MEMORY' | 'MASTERY' | 'STUDY_PLAN' | 'FLASHCARDS' | 'QUIZ'; id?: string; label: string }[];
  provider: string;
  model: string;
}

/** What the tutor reports when the allowance is used up (HTTP 402). */
export interface AllowanceExhausted {
  code: 'AI_ALLOWANCE_EXHAUSTED' | 'AI_DAILY_LIMIT' | 'AI_FEATURE_NOT_INCLUDED';
  message: string;
  access: StudentAccess;
  upgrade: { productCode: string; name: string; priceKobo: number; period: ProductPeriod } | null;
}

export const MEMORY_KINDS = ['STRENGTH', 'STRUGGLE', 'PREFERENCE', 'GOAL', 'NOTE'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export interface StudentMemoryRow {
  id: string;
  kind: MemoryKind;
  content: string;
  confidence: number;
  source: 'AI' | 'TEACHER' | 'STUDENT' | 'PARENT';
  evidence: string | null;
  createdAt: string;
}

export interface MasteryTopic {
  topicId: string;
  topic: string;
  parent: string | null;
  score: number | null;
  confidence: number;
  attempts: number;
  lastEvidenceAt: string | null;
  band: 'NOT_STARTED' | 'EMERGING' | 'DEVELOPING' | 'SECURE' | 'MASTERED';
}
export interface MasteryMap {
  subjects: { subject: string; average: number | null; officialPercent: number | null; topics: MasteryTopic[] }[];
  weakest: MasteryTopic[];
  strongest: MasteryTopic[];
}
export const masteryBand = (score: number | null): MasteryTopic['band'] =>
  score === null ? 'NOT_STARTED' : score >= 85 ? 'MASTERED' : score >= 70 ? 'SECURE' : score >= 50 ? 'DEVELOPING' : 'EMERGING';

export const studyPlanItemSchema = z.object({
  date: z.iso.date(),
  subject: z.string().trim().min(2).max(60),
  topic: z.string().trim().min(2).max(120),
  activity: z.string().trim().min(2).max(300),
  minutes: z.number().int().min(5).max(180),
  done: z.boolean().default(false),
});
export const studyPlanRequestSchema = z.object({
  goal: z.string().trim().min(3).max(300),
  days: z.number().int().min(3).max(42).default(14),
  minutesPerDay: z.number().int().min(10).max(180).default(45),
  subjects: z.array(z.string().trim().min(2)).max(8).default([]),
});
export interface StudyPlanRow {
  id: string;
  title: string;
  goal: string;
  startsOn: string;
  endsOn: string;
  items: z.infer<typeof studyPlanItemSchema>[];
  status: 'ACTIVE' | 'DONE' | 'ARCHIVED';
  progressPct: number;
  createdAt: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  /** Leitner box 1–5; due when dueAt <= today. */
  box: number;
  dueAt: string;
}
export interface FlashcardDeckRow {
  id: string;
  title: string;
  subject: string;
  topic: string | null;
  cards: Flashcard[];
  due: number;
  createdAt: string;
}
export const flashcardRequestSchema = z.object({ subject: z.string().trim().min(2).max(60), topic: z.string().trim().min(2).max(120), count: z.number().int().min(4).max(30).default(12) });
export const flashcardReviewSchema = z.object({ cardId: z.string(), result: z.enum(['AGAIN', 'GOOD', 'EASY']) });

// ============================================================ practice & Exam Academy

export const QUESTION_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export interface PracticeQuestion {
  index: number;
  stem: string;
  options: string[];
  topic: string | null;
  /** Only after submission. */
  answer?: number;
  explanation?: string | null;
  chosen?: number | null;
  correct?: boolean;
  /** Theory questions: marks available, the student's written answer and, after marking, the guide and the AI's marking. */
  marks?: number;
  written?: string | null;
  markingGuide?: string | null;
  marking?: { score: number; outOf: number; strengths: string[]; missing: string[]; feedback: string } | null;
}
export interface PracticeAttemptView {
  id: string;
  mode: 'PRACTICE' | 'MOCK' | 'AI_QUIZ' | 'THEORY';
  exam: ExamBody | null;
  title: string;
  subject: string | null;
  questions: PracticeQuestion[];
  durationMinutes: number | null;
  startedAt: string;
  submittedAt: string | null;
  /** Server-side deadline for timed mocks. */
  endsAt: string | null;
  score: number | null;
  total: number;
  percent: number | null;
  perTopic: { topic: string; correct: number; total: number }[] | null;
  review: string | null;
}
export interface PracticeAttemptRow {
  id: string;
  mode: PracticeAttemptView['mode'];
  exam: ExamBody | null;
  title: string;
  subject: string | null;
  score: number | null;
  total: number;
  percent: number | null;
  startedAt: string;
  submittedAt: string | null;
}

export const practiceStartSchema = z.object({
  mode: z.enum(['PRACTICE', 'MOCK']),
  exam: z.enum(EXAMS),
  subjects: z.array(z.string().trim().min(2)).min(1).max(4),
  topicId: z.string().nullish(),
  questions: z.number().int().min(5).max(100).default(20),
});
export const aiQuizSchema = z.object({ subject: z.string().trim().min(2).max(60), topic: z.string().trim().min(2).max(120), questions: z.number().int().min(3).max(15).default(5) });
export const practiceSubmitSchema = z.object({ answers: z.array(z.number().int().min(-1).max(5).nullable()).max(200) });

export interface ExamCatalog {
  exams: { exam: ExamBody; label: string; entitled: boolean; subjects: { subject: string; questions: number }[] }[];
  freePractice: { setsPerTerm: number; questionsPerSet: number; used: number };
}

export const examQuestionSchema = z.object({
  exam: z.enum(EXAMS),
  /** OBJECTIVE (options + answer) | THEORY (written answer marked against the guide). */
  type: z.enum(['OBJECTIVE', 'THEORY']).default('OBJECTIVE'),
  marks: z.number().int().min(1).max(100).default(1),
  markingGuide: z.string().trim().max(5000).nullish().transform((v) => v || null),
  subject: z.string().trim().min(2).max(60),
  topicId: z.string().nullish().transform((v) => v || null),
  year: z.number().int().min(1980).max(2100).nullish().transform((v) => v ?? null),
  stem: z.string().trim().min(5).max(3000),
  options: z.array(z.string().trim().min(1).max(600)).max(5).default([]),
  answer: z.number().int().min(0).max(4).default(0),
  explanation: z.string().trim().max(3000).nullish().transform((v) => v || null),
  difficulty: z.enum(QUESTION_DIFFICULTIES).default('MEDIUM'),
  source: z.enum(['LICENSED', 'AUTHORED', 'AI_REVIEWED']).default('AUTHORED'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']).default('DRAFT'),
});
export type ExamQuestionInput = z.infer<typeof examQuestionSchema>;
export interface ExamQuestionRow extends ExamQuestionInput {
  id: string;
  topic: string | null;
  updatedAt: string;
}
export const examDraftSchema = z.object({ exam: z.enum(EXAMS), subject: z.string().trim().min(2).max(60), topicId: z.string().nullish(), count: z.number().int().min(1).max(20).default(5), difficulty: z.enum(QUESTION_DIFFICULTIES).default('MEDIUM'), type: z.enum(['OBJECTIVE', 'THEORY']).default('OBJECTIVE') });

export interface SyllabusTopicRow {
  id: string;
  /** Exam syllabi that list this topic; empty for school-only topics. */
  exams?: ExamBody[];
  objectives?: string[];
  subject: string;
  level: 'PRIMARY' | 'JUNIOR' | 'SENIOR';
  name: string;
  parentId: string | null;
  order: number;
}

// ============================================================ knowledge base

export const KB_AUDIENCES = ['PUBLIC', 'PARENTS', 'STAFF'] as const;
export type KbAudience = (typeof KB_AUDIENCES)[number];
export const KB_AUDIENCE_LABELS: Record<KbAudience, string> = { PUBLIC: 'Everyone (website too)', PARENTS: 'Parents, students & staff', STAFF: 'Staff only' };
export const kbDocumentSchema = z.object({
  title: z.string().trim().min(2).max(160),
  audience: z.enum(KB_AUDIENCES),
  fileId: z.string().nullish(),
  /** Paste text instead of uploading a file. */
  text: z.string().trim().max(400_000).nullish(),
});
export interface KbDocumentRow {
  id: string;
  title: string;
  audience: KbAudience;
  filename: string | null;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  error: string | null;
  chunks: number;
  chars: number;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export const kbAskSchema = z.object({ question: z.string().trim().min(3).max(500) });
export interface KbAnswer {
  answer: string;
  sources: { documentId: string; title: string; excerpt: string }[];
  provider: string | null;
  model: string | null;
}
