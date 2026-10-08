import { z } from 'zod';

/**
 * EduGames: short, free games for students that quietly practise the
 * curriculum (Quiz Rush, Maths Sprint, Word Builder, Match Up, True or False
 * Blitz and the class Daily Challenge), with XP, levels, streaks, badges and
 * weekly class and house leaderboards.
 *
 * Two kinds of round:
 *  - SERVER rounds (Quiz Rush, True or False Blitz, Daily Challenge): the
 *    server holds the questions and their answers; the student sees a
 *    question without its answer and each answer is marked by the server.
 *  - LOCAL rounds (Maths Sprint, Spelling Bee, Word Scramble, Match Up and
 *    offline True or False): played on the device, even offline, from the
 *    seeded generator and curated packs in this package; the score is sent
 *    afterwards and the server replays it (same seed, same packs) to mark it,
 *    with plausibility checks on the timings. The server alone awards XP.
 */

// ------------------------------------------------------------ the games

export const GAME_KINDS = [
  'QUIZ_RUSH',
  'MATHS_SPRINT',
  'SPELLING_BEE',
  'WORD_SCRAMBLE',
  'MATCH_UP',
  'TF_BLITZ',
  'DAILY',
  'COUNT_TAP',
  'SHAPES',
  'LETTER_SOUNDS',
  'TELL_TIME',
  'NAIRA_SHOP',
  'WORD_SEARCH',
  'CROSSWORD',
] as const;
export type GameKind = (typeof GAME_KINDS)[number];
export const GAME_LABELS: Record<GameKind, string> = {
  QUIZ_RUSH: 'Quiz Rush',
  MATHS_SPRINT: 'Maths Sprint',
  SPELLING_BEE: 'Spelling Bee',
  WORD_SCRAMBLE: 'Word Scramble',
  MATCH_UP: 'Match Up',
  TF_BLITZ: 'True or False Blitz',
  DAILY: 'Daily Challenge',
  COUNT_TAP: 'Count and Tap',
  SHAPES: 'Shapes',
  LETTER_SOUNDS: 'Letter Sounds',
  TELL_TIME: 'Tell the Time',
  NAIRA_SHOP: 'Naira Shop',
  WORD_SEARCH: 'Word Search',
  CROSSWORD: 'Crossword',
};
/** Every game a student can pick on the hub (the Daily Challenge has its own card); `gamesFor` narrows it to the student's age. */
export const PLAYABLE_GAMES: readonly GameKind[] = ['QUIZ_RUSH', 'MATHS_SPRINT', 'SPELLING_BEE', 'WORD_SCRAMBLE', 'MATCH_UP', 'TF_BLITZ', 'COUNT_TAP', 'SHAPES', 'LETTER_SOUNDS', 'TELL_TIME', 'NAIRA_SHOP', 'WORD_SEARCH', 'CROSSWORD'];
export const SERVER_GAMES: readonly GameKind[] = ['QUIZ_RUSH', 'TF_BLITZ', 'DAILY'];
export const LOCAL_GAMES = ['MATHS_SPRINT', 'SPELLING_BEE', 'WORD_SCRAMBLE', 'MATCH_UP', 'TF_BLITZ', 'COUNT_TAP', 'SHAPES', 'LETTER_SOUNDS', 'TELL_TIME', 'NAIRA_SHOP', 'WORD_SEARCH', 'CROSSWORD'] as const;
export type LocalGameKind = (typeof LOCAL_GAMES)[number];
/** Early-years games: generated questions with pictures, played on the device and marked by replay like Maths Sprint. */
export const EARLY_GAMES = ['COUNT_TAP', 'SHAPES', 'LETTER_SOUNDS', 'TELL_TIME', 'NAIRA_SHOP'] as const;
export type EarlyGameKind = (typeof EARLY_GAMES)[number];
export const isEarlyGame = (g: string): g is EarlyGameKind => (EARLY_GAMES as readonly string[]).includes(g);

export type GameLevel = 'PRIMARY' | 'JUNIOR' | 'SENIOR';
export const GAME_LEVEL_LABELS: Record<GameLevel, string> = { PRIMARY: 'Primary', JUNIOR: 'Junior secondary', SENIOR: 'Senior secondary' };

// ------------------------------------------------------------ the student's stage and year

/**
 * Where a student is, for games: the syllabus level, the school year within
 * it (1–6), whether the class is early years (nursery, KG, creche…: played
 * with Primary 1 content) and whether young mode is on (early years to
 * Primary 3: bigger buttons, read-aloud, no lives or countdowns, cheerful
 * feedback). Young mode follows the class: neither the student nor a teacher
 * can switch it off.
 */
export interface GameStage {
  level: GameLevel;
  year: number;
  early: boolean;
  young: boolean;
}

const EARLY_RE = /nursery|kindergarten|\bkg\s?\d*\b|cr[eè]che|pre-?school|play\s?group|reception|early\s?years|toddler|pre-?k\b|\bnur\s?\d/i;

/** From a class level's stage and name ("Nursery" / "Nursery 2", "Primary" / "Primary 4", "Junior Secondary" / "JSS 1"…). */
export function gameStageOf(stage: string | null | undefined, levelName: string | null | undefined): GameStage {
  const s = `${stage ?? ''} ${levelName ?? ''}`;
  const lower = s.toLowerCase();
  const level: GameLevel = lower.includes('senior') || /\bss\s?\d/.test(lower) ? 'SENIOR' : lower.includes('junior') || /\bjss\s?\d/.test(lower) ? 'JUNIOR' : 'PRIMARY';
  const early = level === 'PRIMARY' && EARLY_RE.test(s);
  const n = Number(/(\d+)/.exec(levelName ?? '')?.[1]);
  const year = early ? 1 : Math.min(6, Math.max(1, Number.isFinite(n) && n > 0 ? n : 1));
  return { level, year, early, young: level === 'PRIMARY' && (early || year <= 3) };
}

/** A short name for the student's year band ("Early years", "Primary 1–3", "Primary 4–6", "Junior secondary"…). */
export function yearBandOf(st: Pick<GameStage, 'level' | 'year' | 'early'>): string {
  if (st.level === 'JUNIOR') return 'Junior secondary';
  if (st.level === 'SENIOR') return 'Senior secondary';
  if (st.early) return 'Early years';
  return st.year <= 3 ? 'Primary 1–3' : 'Primary 4–6';
}

/** The games that suit a student, in hub order. */
export function gamesFor(st: Pick<GameStage, 'level' | 'year' | 'early'>): GameKind[] {
  const primary = st.level === 'PRIMARY';
  const out: GameKind[] = [];
  // The picture games first for the youngest: counting, shapes and letter sounds to Primary 2; time and money Primary 1–4.
  if (primary && (st.early || st.year <= 2)) out.push('COUNT_TAP', 'SHAPES', 'LETTER_SOUNDS');
  if (primary && !st.early && st.year <= 4) out.push('TELL_TIME', 'NAIRA_SHOP');
  out.push('QUIZ_RUSH', 'MATHS_SPRINT');
  // Spelling and the crossword need a reader: not for nursery classes.
  if (!st.early) out.push('SPELLING_BEE', 'WORD_SCRAMBLE');
  out.push('MATCH_UP', 'TF_BLITZ', 'WORD_SEARCH');
  if (!st.early) out.push('CROSSWORD');
  return out;
}

/** An item suits a year when it names no years, or names that one. */
export const suitsYear = (item: { years?: number[] }, year: number | null | undefined) => !year || !item.years?.length || item.years.includes(year);

/** How well an item fits a year: 0 written for it, 1 for the whole stage (no years), 2 for other years. */
export const yearTier = (item: { years?: number[] }, year: number | null | undefined) => (!year ? 1 : !item.years?.length ? 1 : item.years.includes(year) ? 0 : 2);

/**
 * Items for a year, best fit first: the ones written for that year (alone,
 * when there are at least `min`), then those for the whole stage (no years),
 * then (only to make up `min`) the rest of the stage, nearest years first, so
 * a thin year still gets a full round. The order is stable (no randomness),
 * so the device and the server agree.
 */
export function preferYear<T extends { years?: number[] }>(items: readonly T[], year: number | null | undefined, min: number): T[] {
  if (!year) return [...items];
  const exact = items.filter((x) => yearTier(x, year) === 0);
  if (exact.length >= min) return exact;
  const suited = [...exact, ...items.filter((x) => yearTier(x, year) === 1)];
  if (suited.length >= min) return suited;
  const dist = (x: T) => Math.min(...(x.years ?? [year]).map((y) => Math.abs(y - year)));
  const rest = items
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => !suitsYear(x, year))
    .sort((a, b) => dist(a.x) - dist(b.x) || a.i - b.i)
    .map(({ x }) => x);
  return [...suited, ...rest.slice(0, min - suited.length)];
}

/** Round rules (the server enforces them; the client shows them). */
export const QUIZ_RUSH = { questions: 15, lives: 3, secondsPerQuestion: 20 } as const;
export const TF_BLITZ = { statements: 20, secondsPerStatement: 8 } as const;
export const DAILY_CHALLENGE = { questions: 8, secondsPerQuestion: 45 } as const;
export const MATHS_SPRINT = { seconds: 60, maxQuestions: 60 } as const;
export const WORD_ROUND = { words: 8 } as const;
export const MATCH_ROUND = { pairs: 6 } as const;
/** Young mode (early years to Primary 3): shorter rounds, no lives, no clock. */
export const YOUNG_ROUND = { quizQuestions: 10, tfStatements: 12, mathsQuestions: 10 } as const;
/** Early-years picture games: questions a round. */
export const EARLY_ROUND = { questions: 10 } as const;
/** Word Search and Crossword have no clock. */
export const WORD_SEARCH_ROUND = { young: { size: 6, words: 5 }, primary: { size: 8, words: 7 }, secondary: { size: 10, words: 9 } } as const;
export const CROSSWORD_ROUND = { min: 5, max: 8 } as const;

/** XP a day can earn: plenty for a keen student, not a reason to play all night. */
export const DAILY_XP_CAP = 500;
/** Rounds a day that earn XP (more can be played, for fun). */
export const DAILY_XP_ROUNDS = 40;

// ------------------------------------------------------------ levels

const LEVEL_TITLES = ['Starter', 'Explorer', 'Learner', 'Thinker', 'Solver', 'Scholar', 'Achiever', 'Expert', 'Master', 'Champion', 'Legend'];

/** Total XP needed to reach a level (1 → 0, 2 → 100, 3 → 300, 4 → 600, 5 → 1,000…). */
export const xpForLevel = (level: number) => 50 * (level - 1) * level;

export function levelOf(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1]!, into: xp - from, span: to - from, next: to };
}

// ------------------------------------------------------------ badges

export const GAME_BADGES = [
  { key: 'FIRST_GAME', label: 'First game', description: 'Finish your first round.' },
  { key: 'DAILY_FIRST', label: 'Daily done', description: 'Finish a Daily Challenge.' },
  { key: 'DAILY_PERFECT', label: 'Perfect day', description: 'Get every Daily Challenge question right.' },
  { key: 'STREAK_3', label: 'On a roll', description: 'Play on 3 days in a row.' },
  { key: 'STREAK_7', label: 'Week warrior', description: 'Keep a 7-day streak.' },
  { key: 'STREAK_30', label: 'Unstoppable', description: 'Keep a 30-day streak.' },
  { key: 'CORRECT_100', label: 'Century', description: 'Answer 100 questions correctly.' },
  { key: 'CORRECT_500', label: 'Five hundred', description: 'Answer 500 questions correctly.' },
  { key: 'HOT_STREAK', label: 'Hot streak', description: 'Get 10 right in a row in Quiz Rush.' },
  { key: 'MATHS_WHIZ', label: 'Human calculator', description: 'Get 25 right in one Maths Sprint.' },
  { key: 'SPELLING_STAR', label: 'Spelling star', description: 'Spell every word right in a Spelling Bee.' },
  { key: 'SHARP_MEMORY', label: 'Sharp memory', description: 'Finish Match Up with at most 2 misses.' },
  { key: 'SUPER_STAR', label: 'Super star', description: 'Get every answer right in a picture game.' },
  { key: 'WORD_HUNTER', label: 'Word hunter', description: 'Find every word in a Word Search.' },
  { key: 'PUZZLE_SOLVER', label: 'Puzzle solver', description: 'Finish a Crossword with no hints.' },
  { key: 'SUBJECT_MASTER', label: 'Subject master', description: 'Answer 100 questions correctly in one subject.' },
  { key: 'ALL_ROUNDER', label: 'All-rounder', description: 'Play every game on your games page.' },
  { key: 'LEVEL_5', label: 'Level 5', description: 'Reach level 5.' },
  { key: 'LEVEL_10', label: 'Level 10', description: 'Reach level 10.' },
] as const;
export type GameBadgeKey = (typeof GAME_BADGES)[number]['key'];

// ------------------------------------------------------------ settings (Tenant.portalSettings.games)

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 08:00');

export const gamesSettingsSchema = z
  .object({
    /** Students can open Games at all. */
    enabled: z.boolean(),
    /** No games during lessons: closed on these days between these times (school time). */
    quietHours: z.object({
      enabled: z.boolean(),
      /** 1 = Monday … 7 = Sunday */
      days: z.array(z.number().int().min(1).max(7)).max(7),
      start: hhmm,
      end: hhmm,
    }),
    /** Weekly class and house leaderboards (first name and initial only). */
    leaderboards: z.boolean(),
    /** Each week the school's top players earn a few house points for their house. */
    housePoints: z.object({
      enabled: z.boolean(),
      topPlayers: z.number().int().min(1).max(10),
      points: z.number().int().min(1).max(20),
    }),
  })
  .superRefine((s, ctx) => {
    if (s.quietHours.enabled && s.quietHours.start >= s.quietHours.end) ctx.addIssue({ code: 'custom', path: ['quietHours', 'end'], message: 'The end time must be after the start time' });
  });
export type GamesSettings = z.infer<typeof gamesSettingsSchema>;
export const DEFAULT_GAMES_SETTINGS: GamesSettings = {
  enabled: true,
  quietHours: { enabled: false, days: [1, 2, 3, 4, 5], start: '08:00', end: '14:00' },
  leaderboards: true,
  housePoints: { enabled: false, topPlayers: 3, points: 5 },
};

/** Reads stored settings, tolerating old or partial JSON. */
export function gamesSettingsOf(raw: unknown): GamesSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<GamesSettings>;
  const d = DEFAULT_GAMES_SETTINGS;
  const q: Partial<GamesSettings['quietHours']> = r.quietHours ?? {};
  const h: Partial<GamesSettings['housePoints']> = r.housePoints ?? {};
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    quietHours: {
      enabled: typeof q.enabled === 'boolean' ? q.enabled : d.quietHours.enabled,
      days: Array.isArray(q.days) ? q.days.filter((x) => Number.isInteger(x) && x >= 1 && x <= 7) : d.quietHours.days,
      start: typeof q.start === 'string' ? q.start : d.quietHours.start,
      end: typeof q.end === 'string' ? q.end : d.quietHours.end,
    },
    leaderboards: typeof r.leaderboards === 'boolean' ? r.leaderboards : d.leaderboards,
    housePoints: {
      enabled: typeof h.enabled === 'boolean' ? h.enabled : d.housePoints.enabled,
      topPlayers: typeof h.topPlayers === 'number' ? h.topPlayers : d.housePoints.topPlayers,
      points: typeof h.points === 'number' ? h.points : d.housePoints.points,
    },
  };
}

/** Whether games are open at a school-local weekday (1–7) and HH:MM. */
export function gamesOpenAt(s: GamesSettings, weekday: number, time: string): { open: boolean; reason: 'OFF' | 'QUIET_HOURS' | null; reopensAt: string | null } {
  if (!s.enabled) return { open: false, reason: 'OFF', reopensAt: null };
  const q = s.quietHours;
  if (q.enabled && q.days.includes(weekday) && time >= q.start && time < q.end) return { open: false, reason: 'QUIET_HOURS', reopensAt: q.end };
  return { open: true, reason: null, reopensAt: null };
}

// ------------------------------------------------------------ requests

export const roundStartSchema = z.object({
  game: z.enum(['QUIZ_RUSH', 'TF_BLITZ', 'DAILY']),
  /** A subject key to practise ("Mathematics"); empty = all the student's subjects. */
  subject: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => v || null),
});
export type RoundStartInput = z.input<typeof roundStartSchema>;

export const roundAnswerSchema = z.object({
  /** The question's position in the round (answers go in order). */
  index: z.number().int().min(0).max(100),
  /** Option picked; null = ran out of time. */
  choice: z.number().int().min(0).max(9).nullable(),
});
export type RoundAnswerInput = z.infer<typeof roundAnswerSchema>;

const answerMs = z.number().int().min(0).max(120_000);

/** A round played on the device: sent when it ends (or later, from the offline queue). */
export const localScoreSchema = z.discriminatedUnion('game', [
  z.object({
    game: z.literal('MATHS_SPRINT'),
    clientId: z.string().min(8).max(64),
    playedAt: z.iso.datetime(),
    durationMs: z.number().int().min(0).max(10 * 60_000),
    seed: z.number().int().min(0).max(0xffffffff),
    level: z.enum(['PRIMARY', 'JUNIOR', 'SENIOR']),
    year: z.number().int().min(1).max(6),
    /** Young mode: ten questions with no clock. */
    young: z.boolean().optional(),
    answers: z.array(z.object({ choice: z.number().int().min(0).max(3), ms: answerMs })).max(MATHS_SPRINT.maxQuestions),
  }),
  z.object({
    game: z.enum(EARLY_GAMES),
    clientId: z.string().min(8).max(64),
    playedAt: z.iso.datetime(),
    durationMs: z.number().int().min(0).max(10 * 60_000),
    seed: z.number().int().min(0).max(0xffffffff),
    year: z.number().int().min(1).max(6),
    /** A nursery class: only the simplest kinds of question. */
    early: z.boolean().optional(),
    /** The first tap on each question (a second try after a wrong one is for learning, not marks). */
    answers: z.array(z.object({ choice: z.number().int().min(0).max(3), ms: answerMs })).max(EARLY_ROUND.questions),
  }),
  z.object({
    game: z.literal('WORD_SEARCH'),
    clientId: z.string().min(8).max(64),
    playedAt: z.iso.datetime(),
    durationMs: z.number().int().min(0).max(10 * 60_000),
    seed: z.number().int().min(0).max(0xffffffff),
    level: z.enum(['PRIMARY', 'JUNIOR', 'SENIOR']),
    year: z.number().int().min(1).max(6),
    young: z.boolean(),
    /** Each word found: the first and last cells of the line the student drew. */
    found: z.array(z.object({ r0: z.number().int().min(0).max(15), c0: z.number().int().min(0).max(15), r1: z.number().int().min(0).max(15), c1: z.number().int().min(0).max(15), ms: answerMs })).max(12),
  }),
  z.object({
    game: z.literal('CROSSWORD'),
    clientId: z.string().min(8).max(64),
    playedAt: z.iso.datetime(),
    durationMs: z.number().int().min(0).max(10 * 60_000),
    seed: z.number().int().min(0).max(0xffffffff),
    level: z.enum(['PRIMARY', 'JUNIOR', 'SENIOR']),
    year: z.number().int().min(1).max(6),
    young: z.boolean(),
    /** What is in each entry's cells when the student finished (in the puzzle's entry order). */
    entries: z.array(z.string().max(20)).min(1).max(CROSSWORD_ROUND.max),
    /** Letters revealed as hints (each costs points). */
    hints: z.number().int().min(0).max(200),
  }),
  z.object({
    game: z.enum(['SPELLING_BEE', 'WORD_SCRAMBLE']),
    clientId: z.string().min(8).max(64),
    playedAt: z.iso.datetime(),
    durationMs: z.number().int().min(0).max(10 * 60_000),
    words: z.array(z.object({ id: z.string().min(1).max(60), typed: z.string().max(60), ms: answerMs })).min(1).max(20),
  }),
  z.object({
    game: z.literal('MATCH_UP'),
    clientId: z.string().min(8).max(64),
    playedAt: z.iso.datetime(),
    durationMs: z.number().int().min(0).max(10 * 60_000),
    /** A curated pack id, or "syl:<parentTopicId>><childTopicId>,…" for a pack built from the syllabus. */
    packId: z.string().min(1).max(2000),
    /** The pairs played, as indexes into the pack (curated) or their position (syllabus). */
    pairs: z.array(z.number().int().min(0).max(200)).min(2).max(12),
    matched: z.number().int().min(0).max(12),
    /** Two cards turned that weren't a pair. */
    misses: z.number().int().min(0).max(500),
  }),
  z.object({
    game: z.literal('TF_BLITZ'),
    clientId: z.string().min(8).max(64),
    playedAt: z.iso.datetime(),
    durationMs: z.number().int().min(0).max(10 * 60_000),
    items: z.array(z.object({ id: z.string().min(1).max(40), answer: z.boolean().nullable(), ms: answerMs })).min(1).max(40),
  }),
]);
export type LocalScoreInput = z.infer<typeof localScoreSchema>;

export const gamesPrivacySchema = z.object({ hidden: z.boolean() });
export const leaderboardQuerySchema = z.object({ scope: z.enum(['class', 'house']).default('class') });

// ------------------------------------------------------------ responses

export interface GameQuestionView {
  index: number;
  prompt: string;
  options: string[];
  subject: string | null;
  topic: string | null;
}

export interface GameAnswerFeedback {
  index: number;
  correct: boolean;
  /** Revealed only once the question has been answered. */
  correctIndex: number;
  explanation: string | null;
  points: number;
  score: number;
  run: number;
  livesLeft: number | null;
  done: boolean;
  /** Answered too fast to be a real read of the question (no points). */
  tooFast?: boolean;
}

export interface GameRoundView {
  id: string;
  game: GameKind;
  subject: string | null;
  questions: GameQuestionView[];
  /** Answers already given (resuming a round after a refresh). */
  answered: GameAnswerFeedback[];
  lives: number | null;
  secondsPerQuestion: number;
  startedAt: string;
  done: boolean;
}

export interface GameRoundResult {
  id: string;
  game: GameKind;
  correct: number;
  total: number;
  score: number;
  xp: number;
  /** Why no XP (or less): the day's limit, a round too fast to be real… */
  xpNote: string | null;
  newBadges: { key: string; label: string; description: string }[];
  profile: GameProfileView;
  /** Each question with the right answer (server rounds), for the review screen. */
  review: { prompt: string; yourAnswer: string | null; correctAnswer: string; correct: boolean; explanation: string | null }[];
  leveledUp: boolean;
  duplicate?: boolean;
}

export interface GameProfileView {
  xp: number;
  level: number;
  levelTitle: string;
  levelInto: number;
  levelSpan: number;
  streak: number;
  bestStreak: number;
  playedToday: boolean;
  /** The week's one streak freeze is still unused (a missed day won't break the streak). */
  freezeAvailable: boolean;
  correct: number;
  answered: number;
  rounds: number;
  hidden: boolean;
  xpToday: number;
}

export interface GamesHub {
  student: {
    firstName: string;
    className: string | null;
    level: GameLevel;
    year: number;
    /** Nursery, KG, creche…: Primary 1 content. */
    early: boolean;
    /** Young mode (early years to Primary 3), set by the class. */
    young: boolean;
    /** "Primary 1–3", "Junior secondary"… */
    band: string;
    /** The games that suit this student, in hub order. */
    games: GameKind[];
    house: { name: string; colour: string } | null;
  };
  access: { open: boolean; reason: 'OFF' | 'QUIET_HOURS' | null; message: string | null };
  profile: GameProfileView;
  badges: { key: string; label: string; description: string; earnedAt: string | null }[];
  daily: { available: boolean; done: boolean; inProgress: boolean; result: { correct: number; total: number; xp: number } | null; questions: number; classDone: number; date: string };
  /** Subjects the student takes, with how many quiz questions each has (school bank, practice and curated). */
  subjects: { subject: string; questions: number }[];
  /** Monday to Sunday of this week: played or not. */
  week: { days: boolean[]; xp: number; rounds: number };
  recent: { game: GameKind; correct: number; total: number; xp: number; at: string }[];
  leaderboards: boolean;
  today: string;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  xp: number;
  me: boolean;
  house: { name: string; colour: string } | null;
}
export interface GamesLeaderboard {
  scope: 'class' | 'house';
  title: string;
  weekStart: string;
  rows: LeaderboardRow[];
  me: { rank: number | null; xp: number; hidden: boolean };
  houses: { id: string; name: string; colour: string; xp: number; players: number; mine: boolean; top: string[] }[];
  housePoints: { enabled: boolean; topPlayers: number; points: number };
}

export interface SyllabusMatchPack {
  id: string;
  title: string;
  subject: string;
  leftLabel: string;
  rightLabel: string;
  pairs: [string, string][];
}

export interface ClassGamesActivity {
  classArmId: string;
  label: string;
  weekStart: string;
  students: number;
  players: number;
  rounds: number;
  minutes: number;
  questions: number;
  percentCorrect: number | null;
  dailyToday: number;
  topics: { topic: string; subject: string; answered: number; percentCorrect: number }[];
  byGame: { game: GameKind; rounds: number }[];
  rows: { studentId: string; name: string; rounds: number; minutes: number; days: number; lastPlayed: string | null }[];
}

export interface ChildGamesSummary {
  studentId: string;
  firstName: string;
  daysThisWeek: number;
  questionsThisWeek: number;
  correctThisWeek: number;
  rounds: number;
  streak: number;
  minutes: number;
  /** The game played most this week (named on the parent's line). */
  topGame: GameKind | null;
}

export interface GamesAdminStatus {
  settings: GamesSettings;
  week: { players: number; rounds: number; minutes: number; students: number };
}

// ------------------------------------------------------------ deterministic randomness

/** FNV-1a: a stable 32-bit seed from text ("2026-10-08|classArmId"). */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: small, fast and the same on every device and the server. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ------------------------------------------------------------ Maths Sprint (generated, same on device and server)

export interface MathsQuestion {
  prompt: string;
  options: string[];
  answer: number;
  /** Area of maths ("Fractions", "Indices"…). */
  skill: string;
}

const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
/** Numbers as printed: a proper minus sign and thousands separators. */
export const fmtNum = (n: number) => (n < 0 ? `−${Math.abs(n).toLocaleString('en-GB')}` : (n === 0 ? 0 : n).toLocaleString('en-GB'));
const naira = (n: number) => `₦${n.toLocaleString('en-GB')}`;
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
const sup = (n: number) => String(n).replace(/./g, (c) => SUP[c] ?? c);
const sub = (n: number) => String(n).replace(/./g, (c) => SUB[c] ?? c);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const frac = (n: number, d: number) => {
  const g = gcd(n, d) || 1;
  const [nn, dd] = [n / g, d / g];
  return dd === 1 ? fmtNum(nn) : `${nn < 0 ? '−' : ''}${Math.abs(nn)}/${dd}`;
};
/** "x² − 5x + 6" */
function poly(a: number, b: number, c: number) {
  const term = (coef: number, v: string, first: boolean) => {
    if (coef === 0) return '';
    const sign = coef < 0 ? (first ? '−' : ' − ') : first ? '' : ' + ';
    const k = Math.abs(coef);
    return `${sign}${k === 1 && v ? '' : k}${v}`;
  };
  return `${term(a, 'x²', true)}${term(b, 'x', !a)}${term(c, '', !a && !b)}` || '0';
}
/** "−7" in brackets when negative: (−7) + 4 */
const br = (n: number) => (n < 0 ? `(${fmtNum(n)})` : fmtNum(n));

/** Three different wrong answers near the right one. */
function numericOptions(r: () => number, answer: number, nearby: number[], show: (n: number) => string = fmtNum) {
  const wrong = new Set<string>();
  const right = show(answer);
  for (const n of nearby) if (Number.isFinite(n) && show(n) !== right) wrong.add(show(n));
  let step = 1;
  while (wrong.size < 3) {
    const n = answer + (r() < 0.5 ? -step : step) * int(r, 1, 3);
    if (show(n) !== right) wrong.add(show(n));
    step++;
  }
  return [right, ...seededShuffle([...wrong], r).slice(0, 3)];
}

/** The right answer first, then three different wrong ones (from the candidates, then from `more(1)`, `more(2)`…). */
function fillOptions(right: string, candidates: string[], more: (k: number) => string) {
  const out = [right];
  for (const c of candidates) if (!out.includes(c)) out.push(c);
  for (let k = 1; out.length < 4 && k < 50; k++) {
    const c = more(k);
    if (!out.includes(c)) out.push(c);
  }
  return out.slice(0, 4);
}

type Gen = (r: () => number, tier: number) => { prompt: string; options: string[]; skill: string };

const GENERATORS: Record<GameLevel, { year: [number, number]; gens: Gen[] }[]> = {
  PRIMARY: [
    {
      year: [1, 2],
      gens: [
        (r, t) => {
          const a = int(r, 1, 10 + t * 5);
          const b = int(r, 1, 10 + t * 5);
          return { prompt: `${a} + ${b}`, options: numericOptions(r, a + b, [a + b + 1, a + b - 1, a + b + 10]), skill: 'Addition' };
        },
        (r, t) => {
          const a = int(r, 5, 15 + t * 5);
          const b = int(r, 1, a);
          return { prompt: `${a} − ${b}`, options: numericOptions(r, a - b, [a - b + 1, a - b - 1, a + b]), skill: 'Subtraction' };
        },
        (r) => {
          const a = int(r, 2, 5);
          const b = int(r, 1, 5);
          return { prompt: `${a} × ${b}`, options: numericOptions(r, a * b, [a + b, a * b + a, a * b - b]), skill: 'Multiplication' };
        },
      ],
    },
    {
      year: [3, 4],
      gens: [
        (r, t) => {
          const a = int(r, 10, 99 + t * 200);
          const b = int(r, 10, 99 + t * 200);
          return { prompt: `${fmtNum(a)} + ${fmtNum(b)}`, options: numericOptions(r, a + b, [a + b + 10, a + b - 10, a + b + 1]), skill: 'Addition' };
        },
        (r, t) => {
          const a = int(r, 50, 200 + t * 300);
          const b = int(r, 10, a);
          return { prompt: `${fmtNum(a)} − ${fmtNum(b)}`, options: numericOptions(r, a - b, [a - b + 10, a - b - 10, a - b + 1]), skill: 'Subtraction' };
        },
        (r, t) => {
          const a = int(r, 2, 6 + t * 2);
          const b = int(r, 2, 10);
          return { prompt: `${a} × ${b}`, options: numericOptions(r, a * b, [a * b + a, a * b - b, a + b]), skill: 'Times tables' };
        },
        (r, t) => {
          const b = int(r, 2, 6 + t * 2);
          const q = int(r, 2, 10);
          return { prompt: `${b * q} ÷ ${b}`, options: numericOptions(r, q, [q + 1, q - 1, b]), skill: 'Division' };
        },
      ],
    },
    {
      year: [5, 6],
      gens: [
        (r, t) => {
          const a = int(r, 3, 12);
          const b = int(r, 3, 12 + t);
          return { prompt: `${a} × ${b}`, options: numericOptions(r, a * b, [a * b + a, a * b - b, a * (b + 1)]), skill: 'Times tables' };
        },
        (r) => {
          const b = int(r, 3, 12);
          const q = int(r, 3, 12);
          return { prompt: `${b * q} ÷ ${b}`, options: numericOptions(r, q, [q + 1, q - 1, q + 2]), skill: 'Division' };
        },
        (r) => {
          const d = pick(r, [2, 3, 4, 5, 10]);
          const n = int(r, 1, d - 1) || 1;
          const whole = d * int(r, 2, 12);
          const ans = (whole / d) * n;
          return { prompt: `${frac(n, d)} of ${whole}`, options: numericOptions(r, ans, [whole / d, ans + n, whole - ans]), skill: 'Fractions' };
        },
        (r) => {
          const names = ['Tola', 'Musa', 'Ada', 'Ngozi', 'Femi', 'Zainab', 'Chidi', 'Amaka'];
          const items = [
            ['pens', 50, 200],
            ['exercise books', 150, 400],
            ['bottles of water', 100, 300],
            ['loaves of bread', 500, 1200],
          ] as const;
          const [what, lo, hi] = pick(r, items);
          const price = Math.round(int(r, lo, hi) / 10) * 10;
          const n = int(r, 2, 6);
          return { prompt: `${pick(r, names)} buys ${n} ${what} at ${naira(price)} each. How much altogether?`, options: numericOptions(r, price * n, [price * (n + 1), price * n + 10, price + n], naira), skill: 'Money' };
        },
      ],
    },
  ],
  JUNIOR: [
    {
      year: [1, 3],
      gens: [
        (r, t) => {
          const a = int(r, -15 - t * 10, 15);
          const b = int(r, -15 - t * 10, 15);
          return { prompt: `${br(a)} + ${br(b)}`, options: numericOptions(r, a + b, [a - b, -(a + b), Math.abs(a) + Math.abs(b)]), skill: 'Directed numbers' };
        },
        (r) => {
          const a = int(r, -12, 12) || 3;
          const b = int(r, -9, 9) || -4;
          return { prompt: `${br(a)} × ${br(b)}`, options: numericOptions(r, a * b, [-(a * b), a + b, a * b + (a < 0 ? -1 : 1)]), skill: 'Directed numbers' };
        },
        (r) => {
          const a = int(r, -20, 20);
          const b = int(r, -20, 20);
          return { prompt: `${br(a)} − ${br(b)}`, options: numericOptions(r, a - b, [a + b, b - a, a - b + 2]), skill: 'Directed numbers' };
        },
        (r, t) => {
          const d1 = pick(r, [2, 3, 4, 5, 6, 8]);
          const d2 = t ? pick(r, [2, 3, 4, 6, 8, 10]) : d1;
          const n1 = int(r, 1, d1 - 1);
          const n2 = int(r, 1, d2 - 1);
          const n = n1 * d2 + n2 * d1;
          const d = d1 * d2;
          const right = frac(n, d);
          const opts = fillOptions(right, [frac(n1 + n2, d1 + d2), frac(n + d2, d), frac(n1 * n2, d)], (k) => frac(n + k, d));
          return { prompt: `${frac(n1, d1)} + ${frac(n2, d2)}`, options: opts, skill: 'Fractions' };
        },
        (r) => {
          const p = pick(r, [10, 20, 25, 50, 75, 5, 15, 40]);
          const whole = pick(r, [20, 40, 60, 80, 100, 120, 200, 400, 500, 1000]);
          const ans = (p * whole) / 100;
          if (!Number.isInteger(ans)) return { prompt: `50% of ${whole}`, options: numericOptions(r, whole / 2, [whole / 4, whole * 2, whole / 2 + 10]), skill: 'Percentages' };
          return { prompt: `${p}% of ${fmtNum(whole)}`, options: numericOptions(r, ans, [p, ans * 2, whole - ans]), skill: 'Percentages' };
        },
        (r, t) => {
          const a = int(r, 2, 5 + t * 2);
          const x = int(r, -3 * t, 12);
          const b = int(r, -10, 15);
          const c = a * x + b;
          const lhs = `${a}x ${b < 0 ? '−' : '+'} ${Math.abs(b)}`;
          return { prompt: `Solve ${b === 0 ? `${a}x` : lhs} = ${fmtNum(c)}`, options: numericOptions(r, x, [x + 1, -x || x + 2, Math.round((c + b) / a)], (n) => `x = ${fmtNum(n)}`), skill: 'Simple equations' };
        },
        (r) => {
          const n = int(r, 2, 15);
          return r() < 0.5
            ? { prompt: `${n}²`, options: numericOptions(r, n * n, [n * 2, n * n + n, (n - 1) * (n - 1)]), skill: 'Squares' }
            : { prompt: `√${n * n}`, options: numericOptions(r, n, [n + 1, n - 1, n * 2]), skill: 'Square roots' };
        },
        (r) => {
          const cost = int(r, 20, 90) * 500;
          const gain = int(r, 2, 30) * 100;
          const sell = cost + gain;
          return { prompt: `A trader buys a bag of rice for ${naira(cost)} and sells it for ${naira(sell)}. Profit?`, options: numericOptions(r, gain, [gain + 1000, gain * 2, sell], naira), skill: 'Profit and loss' };
        },
      ],
    },
  ],
  SENIOR: [
    {
      year: [1, 3],
      gens: [
        (r) => {
          const b = pick(r, [2, 3, 5]);
          const k = b === 2 ? int(r, 3, 8) : int(r, 2, 4);
          return { prompt: `${b}${sup(k)}`, options: numericOptions(r, b ** k, [b * k, b ** (k - 1), b ** k + b]), skill: 'Indices' };
        },
        (r) => {
          const m = int(r, 2, 9);
          const n = int(r, 2, 9);
          const op = r() < 0.5;
          return op
            ? { prompt: `a${sup(m)} × a${sup(n)} = aⁿ. Find n`, options: numericOptions(r, m + n, [m * n, Math.abs(m - n), m + n + 1]), skill: 'Indices' }
            : { prompt: `(x${sup(m)})${sup(n)} = xⁿ. Find n`, options: numericOptions(r, m * n, [m + n, m * n + m, m ** n > 99 ? m * n - 1 : m ** n]), skill: 'Indices' };
        },
        (r) => {
          const b = pick(r, [2, 3, 4, 5]);
          const k = int(r, 1, 3);
          return { prompt: `${b}${sup(-k)}`, options: [`1/${b ** k}`, fmtNum(-(b ** k)), `−1/${b ** k}`, fmtNum(b ** k)], skill: 'Indices' };
        },
        (r) => {
          const b = pick(r, [2, 3, 5, 10]);
          const k = b === 10 ? int(r, -2, 4) : int(r, 1, b === 2 ? 6 : 4);
          const value = b === 10 && k < 0 ? (k === -1 ? '0.1' : '0.01') : fmtNum(b ** k);
          return { prompt: `log${sub(b)} ${value}`, options: numericOptions(r, k, [k + 1, k - 1, -k || k + 2]), skill: 'Logarithms' };
        },
        (r) => {
          let r1 = int(r, -7, 7) || 2;
          let r2 = int(r, -7, 7) || -3;
          if (Math.abs(r1) === Math.abs(r2)) r2 = r1 > 0 ? -(Math.abs(r1) + 1) : Math.abs(r1) + 1;
          if (r1 > r2) [r1, r2] = [r2, r1];
          const show = (a: number, b: number) => {
            const [x, y] = a <= b ? [a, b] : [b, a];
            return `x = ${fmtNum(x)} or x = ${fmtNum(y)}`;
          };
          const right = show(r1, r2);
          const wrong = [show(-r1, -r2), show(r1, -r2), show(-r1, r2)].filter((w) => w !== right);
          return { prompt: `Solve ${poly(1, -(r1 + r2), r1 * r2)} = 0`, options: fillOptions(right, wrong, (k) => show(r1 + k, r2 + k)), skill: 'Quadratic equations' };
        },
        (r) => {
          const x = int(r, -4, 5);
          const a = int(r, 1, 4);
          const b = int(r, -6, 6);
          const v = a * x * x + b * x;
          return { prompt: `If x = ${fmtNum(x)}, find ${poly(a, b, 0)}`, options: numericOptions(r, v, [a * x * x - b * x, a * 2 * x + b * x, -v]), skill: 'Substitution' };
        },
        (r) => {
          const a = int(r, 2, 9);
          const b = int(r, -9, 9) || 4;
          const right = poly(0, a, a * b);
          const wrong = [poly(0, a, b), poly(0, a, a + b), poly(0, a + b, a * b)];
          return { prompt: `Expand ${a}(x ${b < 0 ? '−' : '+'} ${Math.abs(b)})`, options: fillOptions(right, wrong, (k) => poly(0, a, a * b + k)), skill: 'Algebra' };
        },
        (r) => {
          const p = int(r, 4, 40) * 5000;
          const rate = pick(r, [2, 4, 5, 8, 10, 12, 15]);
          const t = int(r, 1, 5);
          const si = (p * rate * t) / 100;
          return { prompt: `Simple interest on ${naira(p)} at ${rate}% a year for ${t} year${t === 1 ? '' : 's'}`, options: numericOptions(r, si, [(p * rate) / 100, si * 2, p + si], naira), skill: 'Simple interest' };
        },
      ],
    },
  ],
};

/** Generators for a class year (JSS and SS use one band; primary has three). */
function generatorsFor(level: GameLevel, year: number): Gen[] {
  const bands = GENERATORS[level];
  return (bands.find((b) => year >= b.year[0] && year <= b.year[1]) ?? bands[bands.length - 1]!).gens;
}

/**
 * The questions of a Maths Sprint round: the same seed, level and year give
 * the same questions and options on every device and on the server (which
 * marks the round by replaying it). Questions get harder as the round goes on.
 */
export function mathsRound(seed: number, level: GameLevel, year: number, count: number): MathsQuestion[] {
  const r = seededRandom(seed);
  const gens = generatorsFor(level, year);
  const out: MathsQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const tier = i < 8 ? 0 : i < 20 ? 1 : 2;
    const q = pick(r, gens)(r, tier);
    // Option 0 is the right answer as generated: mix them, remembering where it went.
    const order = seededShuffle(
      q.options.map((_, k) => k),
      r,
    );
    out.push({ prompt: q.prompt, options: order.map((k) => q.options[k]!), answer: order.indexOf(0), skill: q.skill });
  }
  return out;
}

// ------------------------------------------------------------ marking local rounds (device and server agree)

export const normaliseWord = (w: string) =>
  w
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ');

/** Shortest believable time (ms) to read and answer one item, by game. */
export const MIN_ANSWER_MS: Record<LocalGameKind | 'QUIZ_RUSH' | 'DAILY', number> = {
  MATHS_SPRINT: 350,
  SPELLING_BEE: 900,
  WORD_SCRAMBLE: 900,
  MATCH_UP: 500,
  TF_BLITZ: 300,
  QUIZ_RUSH: 400,
  DAILY: 400,
  // Picture games: only impossibly fast taps are refused; a slow young child never is (there is no upper limit per question).
  COUNT_TAP: 450,
  SHAPES: 400,
  LETTER_SOUNDS: 450,
  TELL_TIME: 500,
  NAIRA_SHOP: 600,
  // Per word: spot it and draw the line / type it.
  WORD_SEARCH: 700,
  CROSSWORD: 1200,
};

/** XP for a round, before the day's limit (the server works it out; the client only shows it). */
export function xpFor(game: GameKind, correct: number, total: number, extra: { finished?: boolean; perfect?: boolean; misses?: number; pairs?: number; hints?: number } = {}): number {
  switch (game) {
    case 'QUIZ_RUSH':
      return correct * 5 + (extra.finished ? 10 : 0);
    case 'DAILY':
      return correct * 10 + (total > 0 ? 20 : 0) + (extra.perfect ? 20 : 0);
    case 'TF_BLITZ':
      return correct * 2 + (total >= 10 ? 5 : 0);
    case 'MATHS_SPRINT':
      return correct * 2 + (total >= 5 ? 5 : 0);
    case 'SPELLING_BEE':
      return correct * 4 + (extra.perfect && total >= 5 ? 10 : 0);
    case 'WORD_SCRAMBLE':
      return correct * 3 + (extra.perfect && total >= 5 ? 5 : 0);
    case 'MATCH_UP': {
      const pairs = extra.pairs ?? correct;
      return correct * 3 + (correct === pairs && (extra.misses ?? 99) <= pairs ? 10 : 0);
    }
    case 'COUNT_TAP':
    case 'SHAPES':
    case 'LETTER_SOUNDS':
    case 'TELL_TIME':
    case 'NAIRA_SHOP':
      return correct * 3 + (total >= 5 ? 5 : 0) + (extra.perfect && total >= 5 ? 5 : 0);
    case 'WORD_SEARCH':
      return correct * 3 + (extra.perfect && total >= 5 ? 10 : 0);
    case 'CROSSWORD':
      return Math.max(0, correct * 5 + (extra.perfect && total >= 5 ? 10 : 0) - (extra.hints ?? 0) * 2);
  }
}
