import { z } from 'zod';
import type { StudentAccess } from './learning';

/**
 * Phase 23: careers guidance. A platform-wide career library and course
 * list (console content), and per student: an interest quiz, saved careers,
 * a planned SS1 track and a target course. Admission requirements are only
 * ever shown when a person has checked them against the JAMB brochure.
 */

// ============================================================ tracks & interests

export const TRACKS = ['SCIENCE', 'ARTS', 'COMMERCIAL', 'TECHNICAL'] as const;
export type Track = (typeof TRACKS)[number];
export const TRACK_LABELS: Record<Track, string> = { SCIENCE: 'Science', ARTS: 'Arts', COMMERCIAL: 'Commercial', TECHNICAL: 'Technical' };
export const TRACK_BLURBS: Record<Track, string> = {
  SCIENCE: 'Physics, Chemistry, Biology and more maths: the road to medicine, engineering, computing and the sciences.',
  ARTS: 'Literature, Government, languages and religious studies: the road to law, media, teaching and the creative world.',
  COMMERCIAL: 'Economics, Accounting and Commerce: the road to business, banking, accountancy and marketing.',
  TECHNICAL: 'Technical Drawing, electrics and workshop subjects: the road to building, engineering trades and design.',
};
/**
 * The usual senior secondary subjects for each track (besides English
 * Language, Mathematics and Civic Education, which everyone takes). A
 * general guide only: each school sets its own combinations.
 */
export const TRACK_SUBJECTS: Record<Track, string[]> = {
  SCIENCE: ['Physics', 'Chemistry', 'Biology', 'Further Mathematics', 'Agricultural Science', 'Geography', 'Computer Studies'],
  ARTS: ['Literature in English', 'Government', 'Christian Religious Studies', 'Islamic Studies', 'History', 'Yoruba', 'Igbo', 'Hausa', 'French', 'Visual Arts', 'Music', 'Geography'],
  COMMERCIAL: ['Economics', 'Financial Accounting', 'Commerce', 'Office Practice', 'Marketing', 'Government', 'Geography'],
  TECHNICAL: ['Technical Drawing', 'Physics', 'Chemistry', 'Further Mathematics', 'Basic Electricity', 'Electronics', 'Metalwork', 'Woodwork', 'Building Construction', 'Auto Mechanics'],
};
export const CORE_SUBJECTS = ['English Language', 'Mathematics', 'Civic Education'];

export const RIASEC = ['R', 'I', 'A', 'S', 'E', 'C'] as const;
export type InterestType = (typeof RIASEC)[number];
export const INTEREST_TYPES: Record<InterestType, { name: string; formal: string; blurb: string }> = {
  R: { name: 'Doer', formal: 'Realistic', blurb: 'You like practical, hands-on work: building, fixing, growing and using tools or machines.' },
  I: { name: 'Thinker', formal: 'Investigative', blurb: 'You like asking why: experiments, puzzles, research and finding out how things work.' },
  A: { name: 'Creator', formal: 'Artistic', blurb: 'You like making something new: art, writing, music, design, drama and ideas.' },
  S: { name: 'Helper', formal: 'Social', blurb: 'You like working with people: teaching, caring, listening and helping others grow.' },
  E: { name: 'Persuader', formal: 'Enterprising', blurb: 'You like leading and convincing: business, selling, debating and getting things started.' },
  C: { name: 'Organiser', formal: 'Conventional', blurb: 'You like order and detail: records, numbers, planning and doing things exactly right.' },
};
/** Which interest types point to which track (strongest first). */
export const TRACK_INTERESTS: Record<Track, InterestType[]> = { SCIENCE: ['I', 'R'], ARTS: ['A', 'S'], COMMERCIAL: ['E', 'C'], TECHNICAL: ['R', 'I'] };

export const CAREER_FIELDS = [
  'Health',
  'Engineering',
  'Technology',
  'Science & Research',
  'Business & Finance',
  'Law & Public Service',
  'Education',
  'Creative, Media & Design',
  'Built Environment',
  'Agriculture & Environment',
  'Skilled Trades',
  'Hospitality & Tourism',
  'Transport & Logistics',
  'Security & Defence',
  'Social & Community',
  'Sports & Fitness',
] as const;

// ============================================================ the interest quiz

/** 0 = not for me, 1 = maybe, 2 = I'd enjoy it. */
export const QUIZ_SCALE = [
  { value: 0, label: 'Not for me' },
  { value: 1, label: 'Maybe' },
  { value: 2, label: 'I’d enjoy it' },
] as const;

export interface QuizStatement {
  id: string;
  type: InterestType;
  text: string;
}

const STATEMENTS: Record<InterestType, string[]> = {
  R: [
    'Fix a faulty phone charger, fan or generator',
    'Build or repair furniture, like a table or a shelf',
    'Grow crops or look after animals on a farm',
    'Drive or operate big machines, like a tractor or a crane',
    'Wire a house or fit solar panels on a roof',
    'Make useful things with my hands, like sewing a bag or cooking a meal',
  ],
  I: [
    'Do an experiment to find out why some plants grow faster than others',
    'Solve tricky maths puzzles just for fun',
    'Learn how the body fights diseases like malaria',
    'Study things closely with a microscope or a telescope',
    'Find out how an app or a computer program works inside',
    'Read about new discoveries in science and technology',
  ],
  A: [
    'Draw, paint or design posters and logos',
    'Write stories, poems or song lyrics',
    'Act in a drama or perform on stage',
    'Make music, sing or produce beats',
    'Design clothes or style outfits, like an Ankara collection',
    'Take photos or make videos and short films',
  ],
  S: [
    'Teach a younger pupil something they find hard',
    'Look after someone who is sick or injured',
    'Help friends settle a quarrel fairly',
    'Volunteer in my community, like a clean-up or a charity drive',
    'Listen to people’s problems and give helpful advice',
    'Work with children, older people or people with disabilities',
  ],
  E: [
    'Start a small business, like selling snacks or recharge cards',
    'Lead a team, a club or a group project',
    'Convince people to support my idea in a debate',
    'Organise an event, like inter-house sports or a class party',
    'Bargain for a good price at the market',
    'Stand for election as class captain or a prefect',
  ],
  C: [
    'Keep careful records, like a class register or a club’s accounts',
    'Arrange things neatly in order, like files or a library shelf',
    'Work with numbers in a spreadsheet or a cash book',
    'Follow clear steps to get a task exactly right',
    'Check work carefully for mistakes',
    'Plan a budget for my pocket money or for an event',
  ],
};

/** 36 statements, 6 per interest type, interleaved so the same type never comes twice in a row. */
export const INTEREST_QUIZ: QuizStatement[] = Array.from({ length: 6 }, (_, round) =>
  // Rotate the order each round so the pattern isn't obvious.
  RIASEC.map((_t, i) => RIASEC[(i + round) % RIASEC.length]!).map((t) => ({ id: `${t}${round + 1}`, type: t, text: STATEMENTS[t][round]! })),
).flat();

export const careerQuizSubmitSchema = z.object({
  answers: z.record(z.string().regex(/^[RIASEC][1-6]$/), z.number().int().min(0).max(2)),
});
export type CareerQuizSubmit = z.infer<typeof careerQuizSubmitSchema>;

// ============================================================ library content (console)

const list = (max: number, len = 120) => z.array(z.string().trim().min(1).max(len)).max(max).default([]);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const careerSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens'),
  name: z.string().trim().min(2).max(120),
  field: z.string().trim().min(2).max(60),
  summary: z.string().trim().min(10).max(400),
  description: optText(4000),
  dayToDay: optText(2000),
  skills: list(20),
  subjects: list(15),
  tracks: z.array(z.enum(TRACKS)).max(4).default([]),
  interests: z.array(z.enum(RIASEC)).max(3).default([]),
  courses: list(15, 160),
  otherRoutes: optText(2000),
  professionalBodies: list(10, 160),
  outlook: optText(1000),
  published: z.boolean().default(true),
});
export type CareerInput = z.input<typeof careerSchema>;

/** One UTME subject slot: any one of `subjects` (Use of English is always compulsory and never listed). */
export const utmeRuleSchema = z.object({
  subjects: z.array(z.string().trim().min(2).max(80)).min(1).max(12),
  note: optText(200),
});
export type UtmeRule = z.infer<typeof utmeRuleSchema>;

/** O'level (WASSCE/NECO) credit requirements. */
export const olevelSchema = z.object({
  /** Credit passes needed in total (usually 5), English Language included. */
  count: z.number().int().min(1).max(9).default(5),
  required: z.array(z.string().trim().min(2).max(80)).max(9).default([]),
  /** "Any 2 of Chemistry, Physics, Agricultural Science". */
  anyOf: z.array(z.object({ count: z.number().int().min(1).max(5), subjects: z.array(z.string().trim().min(2).max(80)).min(1).max(12) })).max(5).default([]),
  note: optText(300),
});
export type OlevelRequirements = z.infer<typeof olevelSchema>;

export const COURSE_SOURCES = ['JAMB_BROCHURE', 'MANUAL'] as const;
export type CourseSource = (typeof COURSE_SOURCES)[number];

export const courseSchema = z.object({
  name: z.string().trim().min(2).max(160),
  faculty: optText(120),
  utmeSubjects: z.array(utmeRuleSchema).max(3).default([]),
  olevelRequirements: olevelSchema.nullish().transform((v) => v ?? null),
  notes: optText(2000),
  source: z.enum(COURSE_SOURCES).default('MANUAL'),
  sourceEdition: optText(60),
  verified: z.boolean().default(false),
  published: z.boolean().default(true),
});
export type CourseInput = z.input<typeof courseSchema>;
export type CourseData = z.output<typeof courseSchema>;

export interface CareerRow {
  id: string;
  slug: string;
  name: string;
  field: string;
  summary: string;
  tracks: Track[];
  interests: InterestType[];
  subjects: string[];
  published: boolean;
}
export interface CareerFull extends CareerRow {
  description: string | null;
  dayToDay: string | null;
  skills: string[];
  courses: string[];
  otherRoutes: string | null;
  professionalBodies: string[];
  outlook: string | null;
  updatedAt: string;
}

export interface CourseRow {
  id: string;
  name: string;
  faculty: string | null;
  utmeSubjects: UtmeRule[];
  olevelRequirements: OlevelRequirements | null;
  notes: string | null;
  source: CourseSource;
  sourceEdition: string | null;
  verified: boolean;
  published: boolean;
  /** Careers in the library that list this course. */
  careers: number;
  updatedAt: string;
}

/** A course as students see it: requirements only once a person has verified them. */
export interface CourseView {
  name: string;
  faculty: string | null;
  /** In the course list at all (false: only named by a career). */
  known: boolean;
  verified: boolean;
  utmeSubjects: UtmeRule[] | null;
  olevelRequirements: OlevelRequirements | null;
  notes: string | null;
  sourceEdition: string | null;
}

/** A course row parsed from CSV or extracted by AI, for review before saving. */
export interface CourseImportRow {
  line: number | null;
  name: string;
  faculty: string | null;
  utmeSubjects: UtmeRule[];
  olevelRequirements: OlevelRequirements | null;
  notes: string | null;
  errors: string[];
  warnings: string[];
  /** A course with this name already exists (and whether it is verified). */
  existing: 'NONE' | 'UNVERIFIED' | 'VERIFIED';
}
export interface CourseImportPreview {
  rows: CourseImportRow[];
  provider?: string;
  model?: string;
}

export const courseCsvPreviewSchema = z.object({ csv: z.string().min(1).max(2_000_000) });
export const courseImportSaveSchema = z.object({
  rows: z.array(courseSchema.omit({ source: true, sourceEdition: true, verified: true, published: true })).min(1).max(3000),
  source: z.enum(COURSE_SOURCES),
  sourceEdition: optText(60),
  /** People typing from the brochure may mark rows checked; AI extraction never can. */
  verified: z.boolean().default(false),
  /** AI imports: leave courses a person has already verified alone. */
  skipVerified: z.boolean().default(true),
});
export const brochurePreviewSchema = z.object({
  text: z.string().trim().min(50).max(60_000),
  edition: optText(60),
});

// ============================================================ requirement text (CSV and editor)

const RULE_SPLIT = /\s*(?:;|\+|\n)\s*/;
const ALT_SPLIT = /\s*(?:\/|\bor\b|\|)\s*/i;

const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[-–•\d.)\s]+/, '').trim();
const isEnglishUse = (s: string) => /^use of english$/i.test(s.trim());

/**
 * "Biology; Chemistry; Physics or Mathematics" → three UTME rules (Use of
 * English is dropped: it is always compulsory). Alternatives with "or" or "/".
 */
export function parseUtmeText(text: string): { rules: UtmeRule[]; errors: string[] } {
  const errors: string[] = [];
  const rules: UtmeRule[] = [];
  const alt = /\s*(?:\/|\bor\b|\|)\s*/i;
  for (const part of text.split(RULE_SPLIT).map(tidy).filter(Boolean)) {
    if (isEnglishUse(part)) continue;
    // "any one of Physics, Chemistry, Biology" is one slot; otherwise commas and "and" separate slots.
    const any = /^any\s+(?:one|1)\s+(?:of\s+)?(.*)$/i.exec(part);
    const slots = any ? [any[1]!.replace(/\s*,\s*/g, ' or ')] : part.split(/\s*,\s*|\s+and\s+/i);
    for (const slot of slots) {
      const subjects = slot.split(alt).map(tidy).filter((s) => s && !isEnglishUse(s));
      if (subjects.length) rules.push({ subjects, note: null });
    }
  }
  if (rules.length > 3) errors.push(`UTME has 4 subjects: Use of English plus 3 more; found ${rules.length} besides English. Separate subjects with ";" or "," and alternatives with "or".`);
  return { rules: rules.slice(0, 3), errors };
}

export function formatUtme(rules: UtmeRule[]): string {
  return ['Use of English', ...rules.map((r) => r.subjects.join(' or '))].join('; ');
}

/**
 * "5 credits: English Language, Mathematics, Biology; any 2 of Chemistry/Physics/Agricultural Science"
 * → { count: 5, required: [...], anyOf: [{ count: 2, subjects: [...] }] }.
 */
export function parseOlevelText(text: string): { value: OlevelRequirements | null; errors: string[] } {
  const errors: string[] = [];
  let rest = text.trim();
  if (!rest) return { value: null, errors };
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  const num = (w: string) => (/\d/.test(w) ? Number(w) : words[w.toLowerCase()]!);
  const alts = (s: string) => s.split(/\s*,\s*|\s*(?:\/|\bor\b|\|)\s*/i).map(tidy).filter(Boolean);
  let count = 5;
  const head = /^(\d|four|five|six|seven|eight|nine)\s*(?:o'?\s*level\s*)?credits?(?:\s*pass(?:es)?)?(?:\s*(?:in|including|at))?\s*[:\-–]?\s*/i.exec(rest);
  if (head) {
    count = num(head[1]!);
    rest = rest.slice(head[0].length);
  }
  const required: string[] = [];
  const anyOf: { count: number; subjects: string[] }[] = [];
  const group = /(?:^|,\s*)(?:any\s+)?(\d|one|two|three|four)\s+(?:other\s+)?(?:subjects?\s+)?(?:of|from)\s*:?\s*/i;
  for (const chunk of rest.split(/\s*[;\n]\s*/).filter((c) => c.trim())) {
    const m = group.exec(chunk);
    const plain = m ? chunk.slice(0, m.index) : chunk;
    for (const item of plain.split(/\s*,\s*/).map(tidy).filter(Boolean)) {
      if (ALT_SPLIT.test(item)) anyOf.push({ count: 1, subjects: alts(item) });
      else required.push(item);
    }
    if (m) anyOf.push({ count: num(m[1]!), subjects: alts(chunk.slice(m.index + m[0].length)) });
  }
  const needed = required.length + anyOf.reduce((n, g) => n + g.count, 0);
  if (needed > count) errors.push(`O'level lists ${needed} subjects but only ${count} credits.`);
  for (const g of anyOf) if (g.subjects.length < g.count) errors.push(`"any ${g.count} of" needs at least ${g.count} subjects.`);
  return { value: { count, required, anyOf, note: null }, errors };
}

export function formatOlevel(o: OlevelRequirements | null): string {
  if (!o) return '';
  const parts = [...o.required, ...o.anyOf.map((g) => (g.count === 1 ? g.subjects.join(' or ') : `any ${g.count} of ${g.subjects.join('/')}`))];
  return `${o.count} credits: ${parts.join('; ')}`;
}

// ============================================================ student views

export interface InterestResult {
  /** Percent (0–100) per type. */
  scores: Record<InterestType, number>;
  top: InterestType[];
  completedAt: string;
}

export interface CareerMatch extends CareerRow {
  /** 0–100. */
  match: number;
  reasons: string[];
}

export interface CareerPlanState {
  savedCareers: string[];
  targetCourse: string | null;
  plannedTrack: Track | null;
}

export interface SubjectStrength {
  subject: string;
  /** The school's official term percentage, if any. */
  official: number | null;
  /** Practice mastery average, if any. */
  practice: number | null;
}

export interface CareerHome {
  student: { firstName: string; className: string | null; stage: 'JUNIOR' | 'SENIOR' | 'PRIMARY' };
  interests: InterestResult | null;
  plan: CareerPlanState;
  saved: CareerRow[];
  suggestions: CareerMatch[];
  fields: { field: string; count: number }[];
  total: number;
}

export interface CareerDetail extends CareerFull {
  courseViews: CourseView[];
  saved: boolean;
  related: CareerRow[];
  /** Why this suits (or may not suit) the student, in plain words. */
  fitNotes: string[];
}

export interface QuizResult {
  interests: InterestResult;
  matches: CareerMatch[];
}

export type FitStatus = 'FITS' | 'GAPS' | 'NOT_LOADED' | 'NO_SUBJECTS';
export interface FitCheck {
  kind: 'CAREER' | 'COURSE';
  name: string;
  slug: string | null;
  status: FitStatus;
  notes: string[];
}

export interface TrackRecommendation {
  track: Track;
  /** 0–100, for ordering and a bar; not a grade. */
  score: number;
  reasons: string[];
}

export interface TrackAdvice {
  /** The advisor is aimed at JSS3 and SS1. */
  relevant: boolean;
  stageNote: string | null;
  plannedTrack: Track | null;
  recommendations: TrackRecommendation[];
  strengths: SubjectStrength[];
  /** The subjects the fit checks used, and where they came from. */
  subjects: { list: string[]; basis: string } | null;
  fits: FitCheck[];
  interests: InterestResult | null;
}

export interface MyCareerPlan {
  plan: CareerPlanState;
  interests: InterestResult | null;
  saved: CareerRow[];
  target: CourseView | null;
  fits: FitCheck[];
  nextSteps: string[];
}

export const careerPlanSchema = z.object({
  plannedTrack: z.enum(TRACKS).nullish(),
  targetCourse: z.string().trim().max(160).nullish(),
});

export const counsellorChatSchema = z.object({
  conversationId: z.string().nullish(),
  message: z.string().trim().min(1).max(4000),
  voice: z.boolean().default(false),
});
export interface CounsellorReply {
  conversationId: string;
  reply: string;
  savedCareers: string[];
  access: StudentAccess;
}

// ============================================================ parents & staff

export interface ParentCareerView {
  interests: InterestResult | null;
  plan: CareerPlanState;
  saved: CareerRow[];
  target: CourseView | null;
  fits: FitCheck[];
  updatedAt: string | null;
}

export interface StaffCareerRow {
  studentId: string;
  name: string;
  admissionNumber: string;
  className: string | null;
  top: InterestType[];
  plannedTrack: Track | null;
  savedCareers: string[];
  targetCourse: string | null;
  quizCompletedAt: string | null;
  hasNotes: boolean;
}
export interface StaffCareerOverview {
  classes: { id: string; label: string }[];
  rows: StaffCareerRow[];
  totals: { students: number; quizDone: number; withTrack: number; byType: Record<InterestType, number>; byTrack: Record<Track, number>; topCareers: { slug: string; name: string; count: number }[] };
}
export interface StaffStudentCareer {
  student: { id: string; name: string; admissionNumber: string; className: string | null };
  interests: InterestResult | null;
  plan: CareerPlanState;
  saved: CareerRow[];
  target: CourseView | null;
  advice: TrackAdvice;
  /** Null when the viewer may not see counsellor notes. */
  counsellorNotes: string | null;
  canEditNotes: boolean;
  updatedAt: string | null;
}
export const counsellorNotesSchema = z.object({ notes: z.string().trim().max(5000).nullish().transform((v) => v || null) });
