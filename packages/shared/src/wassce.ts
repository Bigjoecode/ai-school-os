import { z } from 'zod';

/**
 * The full WASSCE mock: one subject sat the way WAEC sets it, paper by paper
 * (Paper 1 objective, Paper 2 theory, Paper 3 practical, orals or a second
 * theory paper), each on its own clock, with WAEC's real counts, times and
 * marks from the subject's syllabus ("scheme of examination"). Papers that
 * can only be done in person (studio, workshop, kitchen, performance) are
 * listed but not sat in the app; the mock grade then uses the in-app papers.
 */

export type WasscePaperKind = 'OBJECTIVE' | 'THEORY' | 'PRACTICAL' | 'NOT_IN_APP';
export interface WasscePaper {
  paper: 1 | 2 | 3;
  kind: WasscePaperKind;
  /** e.g. "Paper 1: Objective", "Paper 3: Alternative to Practical". */
  title: string;
  /** WAEC's time for the paper. */
  minutes: number;
  /** WAEC's marks for the paper. */
  marks: number;
  /** OBJECTIVE: number of items. */
  questions?: number;
  /** THEORY/PRACTICAL: questions shown. */
  offered?: number;
  /** THEORY/PRACTICAL: how many the candidate must answer ("answer any N"). */
  answer?: number;
  /** Restrict the pool to these syllabus topics (and their subtopics). */
  topics?: string[];
  excludeTopics?: string[];
  /** The rubric, WAEC style. */
  instructions: string;
  /** e.g. why a paper isn't sat in the app. */
  note?: string;
}

const obj = (questions: number, minutes: number, marks: number, extra: Partial<WasscePaper> = {}): WasscePaper => ({
  paper: 1,
  kind: 'OBJECTIVE',
  title: 'Paper 1: Objective',
  minutes,
  marks,
  questions,
  instructions: `Answer all ${questions} questions. Each question is followed by four options lettered A to D; choose the correct one.`,
  ...extra,
});
const essay = (offered: number, answer: number, minutes: number, marks: number, instructions: string, extra: Partial<WasscePaper> = {}): WasscePaper => ({
  paper: 2,
  kind: 'THEORY',
  title: 'Paper 2: Essay',
  minutes,
  marks,
  offered,
  answer,
  instructions,
  ...extra,
});
const atp = (offered: number, answer: number, minutes: number, marks: number, instructions: string): WasscePaper => ({
  paper: 3,
  kind: 'PRACTICAL',
  title: 'Paper 3: Alternative to Practical',
  minutes,
  marks,
  offered,
  answer,
  instructions,
});
const inPerson = (title: string, minutes: number, marks: number, note: string, paper: 1 | 2 | 3 = 3): WasscePaper => ({ paper, kind: 'NOT_IN_APP', title, minutes, marks, instructions: '', note });

const WORKSHOP = 'A practical test done in the school workshop under WAEC supervision, so it isn’t sat in the app.';
const STUDIO = 'A practical project executed over five days (six hours a day) with preparatory sketches; it is done in school, so it isn’t sat in the app.';
const LANGUAGE_P2 = (lang: string) => essay(13, 6, 120, 100, `Answer six questions in ${lang}: three from Section A (Language), two from Section B (Literature) and one from Section C (Culture).`);

const ORALS = ['Oral English: Test of Orals', 'Consonants', 'Vowels', 'Stress', 'Intonation'];
const LIT_P1 = ['General Knowledge of Literature', 'Unseen Prose', 'Unseen Poetry', 'Shakespearean Text'];
const GEO_PRACTICAL = ['Map work', 'The earth as a planet', 'Rocks', 'Tectonic processes', 'Denudational processes', 'Weather', 'Climate', 'The environment', 'Field work'];

/** Every WAEC subject with a syllabus, by the app's subject name. */
export const WASSCE_PAPERS: Record<string, WasscePaper[]> = {
  'Agricultural Science': [
    obj(50, 50, 50),
    essay(6, 5, 130, 90, 'Answer five of the six questions.'),
    atp(4, 4, 90, 60, 'Answer all four questions.'),
  ],
  'Animal Husbandry': [obj(40, 40, 40), essay(6, 4, 120, 80, 'Answer four of the six questions. Each carries 20 marks.'), inPerson('Paper 3: Practical', 90, 60, 'A practical paper on specimens and farm work, done in school, so it isn’t sat in the app.')],
  'Auto Body Repairs and Spray Painting': [obj(40, 60, 40), essay(5, 4, 90, 60, 'Answer any four of the five questions.'), inPerson('Paper 3: Practical', 190, 100, WORKSHOP)],
  'Auto Electrical Work': [obj(40, 45, 40), essay(6, 4, 60, 60, 'Answer any four of the six short-structured questions.'), inPerson('Paper 3: Practical', 120, 90, WORKSHOP)],
  'Auto Mechanics': [obj(40, 60, 40), essay(5, 4, 90, 60, 'Answer any four of the five questions.'), inPerson('Paper 3: Practical', 120, 100, WORKSHOP)],
  'Auto Parts Merchandising': [obj(40, 50, 40), essay(7, 5, 120, 100, 'Answer five questions: two from Section A (including the compulsory question) and three from Section B.')],
  'Basic Electricity': [obj(50, 60, 50), essay(7, 5, 60, 50, 'Answer five questions: three from Section A and two from Section C.'), inPerson('Paper 3: Practical', 180, 100, 'Two experiments carried out in the school laboratory, so it isn’t sat in the app.')],
  Basketry: [obj(40, 50, 40), essay(6, 4, 120, 60, 'Answer four of the six questions.'), inPerson('Paper 3: Practical project', 1800, 100, STUDIO)],
  Biology: [
    obj(50, 50, 50),
    essay(5, 3, 100, 70, 'Answer three questions: two from Section A and the compulsory short-structured questions in Section C.'),
    atp(3, 3, 120, 80, 'Answer all three questions: the two in Section A and the one in Section C.'),
  ],
  'Book Keeping': [obj(40, 50, 40), essay(9, 5, 120, 80, 'Answer five questions: two from Section A (Theory) and three from Section B (Practice).')],
  'Building Construction': [obj(40, 45, 40), essay(5, 4, 60, 60, 'Answer any four of the five questions.'), inPerson('Paper 3: Building Drawing', 150, 100, 'A drawing paper done on the drawing board in school, so it isn’t sat in the app.')],
  'Business Management': [obj(50, 60, 30), essay(8, 4, 120, 70, 'Answer four questions: the compulsory case study and any three others.')],
  'Catering Craft Practice': [obj(40, 40, 40), essay(6, 5, 50, 40, 'Answer five of the six questions.'), inPerson('Paper 3: Alternative to Practical', 40, 40, 'Short questions on kitchen practice, set with Papers 1 and 2; not in the app yet.')],
  Ceramics: [obj(40, 50, 40), essay(6, 4, 120, 60, 'Answer four of the six questions.'), inPerson('Paper 3: Practical project', 1800, 100, STUDIO)],
  Chemistry: [
    obj(50, 60, 50),
    essay(14, 13, 120, 100, 'Answer all ten short questions in Section A and any three questions from Section B.'),
    atp(3, 3, 90, 50, 'Answer all three questions: quantitative analysis, qualitative analysis and practical activities.'),
  ],
  'Christian Religious Studies': [obj(50, 60, 40), essay(9, 4, 120, 60, 'Answer four questions: at least one from each section, the fourth from Section A or B.')],
  'Civic Education': [obj(50, 60, 40), essay(9, 4, 120, 60, 'Answer four questions, choosing at least one from each section.')],
  'Clerical Office Duties': [obj(50, 50, 30), essay(7, 4, 130, 70, 'Answer four questions: the compulsory case study and any three others.')],
  Commerce: [obj(50, 50, 50), essay(8, 5, 120, 100, 'Answer any five of the eight questions.')],
  'Computer Studies': [
    obj(50, 60, 25),
    essay(5, 3, 60, 30, 'Answer any three of the five questions.'),
    atp(3, 3, 120, 45, 'Answer all three questions on practical work.'),
  ],
  'Data Processing': [obj(40, 60, 40), essay(6, 5, 120, 70, 'Answer five questions: any three from Section A and both questions in Section B.')],
  Economics: [obj(50, 60, 50), essay(8, 4, 120, 80, 'Answer four questions: one from Section A and any three from Section B.')],
  Edo: [obj(60, 60, 60), LANGUAGE_P2('Edo')],
  Efik: [obj(60, 60, 60), LANGUAGE_P2('Efik')],
  'English Language': [
    obj(80, 60, 40, { excludeTopics: ORALS, instructions: 'Answer all 80 questions on lexis and structure. Choose the option that best completes or answers each one.' }),
    essay(5, 3, 120, 100, 'Answer three questions: one essay from Section A, the comprehension (Section B) and the summary (Section C).', { topics: ['Essay Writing', 'Comprehension', 'Summary'] }),
    obj(60, 45, 30, { paper: 3, title: 'Paper 3: Test of Orals', topics: ORALS, instructions: 'Answer all 60 questions on vowels, consonants, stress and intonation.' }),
  ],
  'Financial Accounting': [obj(50, 60, 25), essay(9, 5, 150, 75, 'Answer five questions: two from Section A (Theory) and three from Section B (Practice).')],
  'Foods and Nutrition': [obj(60, 60, 60), essay(6, 4, 75, 40, 'Answer four of the six questions.'), inPerson('Paper 3: Practical', 180, 100, 'A cookery practical conducted in school by a visiting examiner, so it isn’t sat in the app.')],
  Forestry: [obj(50, 60, 50), essay(6, 4, 120, 80, 'Answer four of the six questions. Each carries 20 marks.'), inPerson('Paper 3: Practical', 120, 60, 'A practical paper on specimens and field work, done in school, so it isn’t sat in the app.')],
  French: [obj(40, 60, 40), essay(6, 2, 75, 40, 'Answer two questions in French (about 100 words each): one essay from Section A and one letter from Section B.'), inPerson('Paper 3: Oral', 40, 50, 'Listening comprehension, reading aloud and conversation with an examiner, so it isn’t sat in the app.')],
  'Further Mathematics': [obj(40, 90, 40), essay(15, 12, 150, 100, 'Answer all eight questions in Section A and any four from Section B, with at least one from each part.')],
  Geography: [
    obj(50, 60, 50),
    essay(9, 4, 120, 80, 'Answer four questions: two from Section A (Economic and Human Geography) and two from Section B (Regional Geography of Nigeria).', { excludeTopics: GEO_PRACTICAL }),
    essay(8, 4, 110, 70, 'Answer four questions. Question 1 (map reading and interpretation) is compulsory.', { paper: 3, title: 'Paper 3: Practical and Physical Geography', topics: GEO_PRACTICAL }),
  ],
  Government: [obj(50, 60, 40), essay(10, 4, 120, 60, 'Answer four questions: two from Section A and two from Section B.')],
  'GSM Phone Maintenance and Repairs': [obj(40, 45, 40), essay(14, 12, 105, 100, 'Answer any ten questions from Section A and both questions in Section B.')],
  Hausa: [obj(60, 60, 60), LANGUAGE_P2('Hausa')],
  'Health Education': [obj(50, 60, 50), essay(9, 8, 60, 70, 'Answer all six questions in Section A and two from Section B.'), inPerson('Paper 3: Practical', 105, 80, 'A practical test done in school, so it isn’t sat in the app.')],
  History: [obj(50, 60, 40), essay(9, 4, 120, 60, 'Answer four questions, at least one from each section.')],
  'Home Management': [obj(50, 60, 50), essay(6, 4, 75, 50, 'Answer four of the six questions.'), inPerson('Paper 3: Practical', 180, 100, 'A practical test conducted in school by a visiting examiner, so it isn’t sat in the app.')],
  Ibibio: [obj(60, 60, 60), LANGUAGE_P2('Ibibio')],
  Igbo: [obj(60, 60, 60), LANGUAGE_P2('Igbo')],
  'Information and Communication Technology': [obj(40, 45, 20), essay(10, 6, 120, 80, 'Answer the four compulsory practical-knowledge questions and any two others.')],
  Insurance: [obj(50, 50, 50), essay(7, 5, 120, 80, 'Answer five questions: the compulsory case study question and any four from Section B.')],
  'Islamic Religious Studies': [obj(50, 50, 50), essay(6, 4, 120, 100, 'Answer four questions: the compulsory question and any three others.')],
  'Literature in English': [
    obj(50, 60, 50, { topics: LIT_P1, instructions: 'Answer all 50 questions: general knowledge of literature, the unseen prose and poem, and the Shakespeare text.' }),
    essay(4, 2, 75, 50, 'Answer two questions: one from Section A (African prose) and one from Section B (non-African prose).', { title: 'Paper 2: Prose', topics: ['African Prose', 'Non-African Prose'] }),
    essay(8, 4, 150, 50, 'Answer four questions, one from each section: African drama, non-African drama, African poetry and non-African poetry.', {
      paper: 3,
      title: 'Paper 3: Drama and Poetry',
      topics: ['African Drama', 'Non-African Drama', 'African Poetry', 'Non-African Poetry'],
    }),
  ],
  Marketing: [obj(40, 50, 40), essay(6, 4, 120, 80, 'Answer any four of the six questions.')],
  Mathematics: [obj(50, 90, 50), essay(13, 10, 150, 100, 'Answer all five questions in Section A and any five from Section B.')],
  Mining: [obj(40, 40, 40), essay(15, 13, 125, 100, 'Answer all ten short questions in Section A and any three from Section B.')],
  Music: [obj(40, 60, 40), essay(5, 3, 120, 60, 'Answer three questions: Questions 1 (theory and composition) and 2 (set works) are compulsory, plus one other.'), inPerson('Paper 3: Aural and Performance', 75, 100, 'An aural test and a performance on an instrument or voice before an examiner, so it isn’t sat in the app.')],
  'Office Practice': [obj(50, 60, 50), essay(7, 5, 130, 100, 'Answer five questions: the case study and any four others.')],
  'Painting and Decorating': [obj(40, 60, 40), essay(6, 4, 120, 60, 'Answer four of the six questions.'), inPerson('Paper 3: Decorative Painting', 180, 100, 'A painting task executed in school under WAEC supervision, so it isn’t sat in the app.')],
  Physics: [
    obj(50, 75, 50),
    essay(12, 8, 90, 60, 'Answer eight questions: any five from Section A and any three from Section B.'),
    atp(3, 2, 165, 50, 'Answer any two of the three questions.'),
  ],
  'Radio, Television and Electronics Works': [obj(40, 45, 40), essay(6, 4, 60, 60, 'Answer any four of the six short-structured questions.'), inPerson('Paper 3: Practical', 120, 90, WORKSHOP)],
  'Refrigeration and Air Conditioning': [obj(40, 60, 40), essay(5, 4, 90, 60, 'Answer any four of the five questions.'), inPerson('Paper 3: Practical', 120, 100, WORKSHOP)],
  Shorthand: [inPerson('Dictation and transcription', 73, 100, 'Passages dictated at 80 words a minute and transcribed on the typewriter, so it isn’t sat in the app.', 1)],
  'Store Management': [obj(50, 60, 50), essay(7, 5, 120, 100, 'Answer any five of the seven questions.')],
  Textiles: [obj(40, 50, 40), essay(6, 4, 120, 60, 'Answer four of the six questions.'), inPerson('Paper 3: Practical project', 1800, 100, STUDIO)],
  Tourism: [obj(40, 40, 40), essay(15, 13, 110, 100, 'Answer all ten questions in Section A and any three from Section B.')],
  Typewriting: [inPerson('Speed and production tests', 165, 100, 'A speed test and production tasks on the typewriter, so it isn’t sat in the app.', 1)],
  'Visual Art': [obj(40, 50, 40), essay(8, 4, 120, 60, 'Answer four questions: one from Section A, two from Section B and one from Section C.'), inPerson('Paper 3: Practical', 360, 100, 'Drawing and creative design done in the studio, so it isn’t sat in the app.')],
  'Welding and Fabrication': [obj(40, 60, 40), essay(5, 4, 90, 60, 'Answer any four of the five questions.'), inPerson('Paper 3: Practical', 190, 100, WORKSHOP)],
  'West African Traditional Religion': [obj(50, 50, 40), essay(9, 4, 130, 60, 'Answer four questions, at least one from each section.')],
  Woodwork: [obj(40, 40, 40), essay(5, 4, 140, 40, 'Answer the short-structured questions in Section A and the design and drawing question in Section B: four in all.', { title: 'Paper 2: Theory and Design' }), inPerson('Paper 3: Practical', 180, 100, 'A test piece made from supplied drawings in the school workshop, so it isn’t sat in the app.')],
  Yoruba: [obj(60, 60, 60), LANGUAGE_P2('Yoruba')],
};

/** The papers sat in the app (objective, theory and practical). */
export const inAppPapers = (papers: WasscePaper[]) => papers.filter((p) => p.kind !== 'NOT_IN_APP');

export const WAEC_GRADES = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'] as const;
export type WaecGrade = (typeof WAEC_GRADES)[number];

/** WAEC's nine-point grade for a percentage (A1–C6 are credits). */
export function waecGrade(percent: number): { grade: WaecGrade; remark: string } {
  const p = Math.round(percent);
  if (p >= 75) return { grade: 'A1', remark: 'Excellent' };
  if (p >= 70) return { grade: 'B2', remark: 'Very good' };
  if (p >= 65) return { grade: 'B3', remark: 'Good' };
  if (p >= 60) return { grade: 'C4', remark: 'Credit' };
  if (p >= 55) return { grade: 'C5', remark: 'Credit' };
  if (p >= 50) return { grade: 'C6', remark: 'Credit' };
  if (p >= 45) return { grade: 'D7', remark: 'Pass' };
  if (p >= 40) return { grade: 'E8', remark: 'Pass' };
  return { grade: 'F9', remark: 'Fail' };
}

// ============================================================ sittings

export const sittingStartSchema = z.object({ exam: z.literal('WAEC'), subject: z.string().trim().min(2).max(60) });
/** Written answers saved as the student writes (theory and practical papers). */
export const theoryDraftSaveSchema = z.object({ answers: z.array(z.string().max(10_000)).max(20) });

export type SittingPaperStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'NOT_IN_APP';
export interface SittingPaperView extends WasscePaper {
  status: SittingPaperStatus;
  attemptId: string | null;
  /** Items or questions actually set (fewer than WAEC's when the bank is short). */
  set: number | null;
  /** Minutes on this paper's clock (scaled when fewer items are set). */
  clockMinutes: number;
  endsAt: string | null;
  /** WAEC marks earned on this paper, once marked. */
  earned: number | null;
  percent: number | null;
}
export interface SittingResult {
  /** Marks earned over marks available, in-app papers only. */
  earned: number;
  outOf: number;
  percent: number;
  grade: WaecGrade;
  remark: string;
  papers: { paper: number; title: string; earned: number; marks: number; percent: number }[];
  /** Topics with the most missed objective questions, weakest first. */
  topicsMissed: { topic: string; correct: number; total: number }[];
  summary: string;
  /** Papers listed but not sat in the app (the grade leaves them out). */
  leftOut: string[];
}
export interface ExamSittingView {
  id: string;
  exam: 'WAEC';
  subject: string;
  startedAt: string;
  finishedAt: string | null;
  papers: SittingPaperView[];
  result: SittingResult | null;
  notes: string[];
}
export interface ExamSittingRow {
  id: string;
  exam: 'WAEC';
  subject: string;
  startedAt: string;
  finishedAt: string | null;
  papersDone: number;
  papersInApp: number;
  percent: number | null;
  grade: WaecGrade | null;
}
