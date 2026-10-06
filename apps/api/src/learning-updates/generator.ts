import { masteryBand, type LearningUpdateContent, type LearningUpdateTopic } from '@aischool/shared';
import { schoolNow } from '../common/school-time';

/**
 * The weekly learning update, as pure functions: which topics go where, the
 * one-line facts, the rules-based recommendation and the plain-text message.
 * Everything here works only from the facts passed in, so nothing is ever
 * invented.
 */

/** Strong: at least this score and this confidence (about three answers' worth of evidence). */
export const STRONG_SCORE = 70;
export const STRONG_CONFIDENCE = 0.5;
/** Improving: up by at least this many points this week (or into a higher band). */
export const IMPROVING_POINTS = 8;
/** Needs attention: below this score, or down by at least DROP_POINTS this week. */
export const ATTENTION_SCORE = 50;
export const DROP_POINTS = 10;
/** Topics listed per group in the app; the text message names fewer. */
const MAX_PER_GROUP = 3;
/** The SMS-friendly summary stays under this many characters (links are added per channel). */
export const TEXT_LIMIT = 600;

// ---------------------------------------------------------------- dates

/** Monday (YYYY-MM-DD) of the week containing `date`. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The instant a school-local day begins. */
export function localMidnight(date: string, timezone: string): Date {
  const guess = Date.parse(`${date}T00:00:00Z`);
  const seen = schoolNow(timezone, new Date(guess));
  const seenMs = Date.parse(`${seen.date}T${seen.time}:00Z`);
  return new Date(guess - (seenMs - guess));
}

export const shortDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
export const longDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ---------------------------------------------------------------- facts

export interface TopicFacts {
  topicId: string;
  topic: string;
  subject: string;
  /** Latest score this week. */
  score: number;
  /** Last score before this week, or null. */
  before: number | null;
  confidence: number;
}

export interface WeekFacts {
  firstName: string;
  weekStart: string;
  topics: TopicFacts[];
  /** Pieces of evidence this week, and questions answered (tutor observations excluded). */
  pieces: number;
  questions: number;
  homework: { set: number; handedIn: number } | null;
  attendance: { present: number; absent: number; late: number; excused: number; daysMarked: number } | null;
  /** "First Term" when a report card was published this week. */
  reportCard: string | null;
}

const BAND_RANK: Record<string, number> = { NOT_STARTED: 0, EMERGING: 1, DEVELOPING: 2, SECURE: 3, MASTERED: 4 };

/** Sorts this week's topics into strong, improving and needing attention (each topic in one group at most). */
export function classify(topics: TopicFacts[]): { strong: LearningUpdateTopic[]; improving: LearningUpdateTopic[]; attention: LearningUpdateTopic[] } {
  const strong: LearningUpdateTopic[] = [];
  const improving: LearningUpdateTopic[] = [];
  const attention: LearningUpdateTopic[] = [];
  for (const t of topics) {
    const change = t.before === null ? null : t.score - t.before;
    const line: LearningUpdateTopic = { topicId: t.topicId, topic: t.topic, subject: t.subject, score: t.score, before: t.before, change };
    const dropped = change !== null && change <= -DROP_POINTS;
    const rose = change !== null && change > 0 && (change >= IMPROVING_POINTS || BAND_RANK[masteryBand(t.score)]! > BAND_RANK[masteryBand(t.before)]!);
    if (t.score < ATTENTION_SCORE || dropped) attention.push(line);
    else if (rose) improving.push(line);
    else if (t.score >= STRONG_SCORE && t.confidence >= STRONG_CONFIDENCE) strong.push(line);
  }
  strong.sort((a, b) => b.score - a.score);
  improving.sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  // Biggest drops first, then the lowest scores.
  attention.sort((a, b) => (a.change ?? 0) - (b.change ?? 0) || a.score - b.score);
  return { strong: strong.slice(0, MAX_PER_GROUP), improving: improving.slice(0, MAX_PER_GROUP), attention: attention.slice(0, MAX_PER_GROUP) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function homeworkLine(h: WeekFacts['homework']): string | null {
  if (!h || h.set === 0) return null;
  if (h.handedIn >= h.set) return h.set === 1 ? 'Handed in the 1 homework set' : `Handed in all ${h.set} homework`;
  return `Handed in ${h.handedIn} of ${h.set} homework`;
}

export function attendanceLine(a: WeekFacts['attendance']): string | null {
  if (!a || a.daysMarked === 0) return null;
  const inSchool = a.present + a.late;
  const late = a.late ? ` (late ${a.late === 1 ? 'once' : `${a.late} times`})` : '';
  return `In school ${inSchool} of ${a.daysMarked} days${late}`;
}

export function highlights(f: WeekFacts): string[] {
  const out: string[] = [];
  const hw = homeworkLine(f.homework);
  if (hw) out.push(hw);
  const at = attendanceLine(f.attendance);
  if (at) out.push(at);
  if (f.questions > 0) out.push(`Answered ${plural(f.questions, 'practice question')} across ${plural(f.topics.length, 'topic')}`);
  else if (f.topics.length) out.push(`Worked on ${plural(f.topics.length, 'topic')}`);
  if (f.reportCard) out.push(`${f.reportCard} report card published`);
  return out;
}

// ---------------------------------------------------------------- recommendation

export interface Recommendation {
  text: string;
  topicId: string | null;
  subject: string | null;
  topic: string | null;
}

const SUBJECT_SHORT: Record<string, string> = {
  Mathematics: 'Maths',
  'Further Mathematics': 'Further Maths',
  'English Language': 'English',
  'Literature in English': 'Literature',
  'Information and Communication Technology': 'ICT',
  'Christian Religious Studies': 'CRS',
  'Islamic Religious Studies': 'IRS',
};
export const shortSubject = (s: string) => SUBJECT_SHORT[s] ?? s;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const named = (t: LearningUpdateTopic, n = 40) => `${clip(t.topic, n)} (${shortSubject(t.subject)})`;

/** The topic the recommendation should point at: the one needing most attention, else the one improving most. */
export function focusTopic(g: ReturnType<typeof classify>): LearningUpdateTopic | null {
  return g.attention[0] ?? g.improving[0] ?? null;
}

/** One practical step for the parent, from the facts alone. */
export function rulesRecommendation(f: WeekFacts, g: ReturnType<typeof classify>): Recommendation {
  const name = f.firstName;
  const focus = focusTopic(g);
  const missed = f.homework && f.homework.set > f.homework.handedIn ? f.homework.set - f.homework.handedIn : 0;
  const absent = f.attendance?.absent ?? 0;
  const at = (t: LearningUpdateTopic | null) => ({ topicId: t?.topicId ?? null, subject: t?.subject ?? null, topic: t?.topic ?? null });
  if (g.attention[0]) {
    const t = g.attention[0];
    return { text: `Ask ${name} to spend 15 minutes on ${named(t)} in Exam Academy, two or three times before next week.`, ...at(t) };
  }
  if (missed > 0) {
    return { text: `Please check with ${name} about the ${missed === 1 ? 'homework that was' : `${missed} homework that were`} not handed in this week, and help set a regular homework time.`, ...at(null) };
  }
  if (absent >= 2) {
    return { text: `${name} missed ${absent} days this week. Please check what was taught and help ${name} catch up.`, ...at(null) };
  }
  if (focus) {
    return { text: `Well done to ${name} on ${clip(focus.topic, 40)}. Another 15 minutes of practice on it in Exam Academy will keep it going.`, ...at(focus) };
  }
  if (g.strong[0]) {
    const t = g.strong[0];
    return { text: `Praise ${name} for ${clip(t.topic, 40)}. Next, try a harder past question on it in Exam Academy.`, ...at(t) };
  }
  if (f.topics.length === 0) {
    return { text: `Encourage ${name} to do 15 minutes of practice in Exam Academy this weekend. A little often works best.`, ...at(null) };
  }
  return { text: `Ask ${name} to show you one topic practised this week and explain it to you. Teaching it back helps it stick.`, ...at(null) };
}

/**
 * Checks an AI-worded recommendation: short, plain, and with no numbers
 * other than practice minutes (so no invented scores or counts).
 */
export function acceptableAiText(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim().replace(/^["“]|["”]$/g, '');
  if (t.length < 20 || t.length > 240) return null;
  if (/[%*#[\]{}<>]|https?:/i.test(t)) return null;
  if (/placeholder/i.test(t)) return null;
  for (const n of t.match(/\d+/g) ?? []) if (!['5', '10', '15', '20', '30'].includes(n)) return null;
  return t;
}

// ---------------------------------------------------------------- text

/** The parent's message (no links; each channel adds its own). Kept under TEXT_LIMIT characters. */
export function parentText(c: Omit<LearningUpdateContent, 'studentText'>): string {
  const head = `How ${c.firstName} is learning (week of ${shortDate(c.weekStart)})`;
  const facts = [homeworkLine(c.homework), attendanceLine(c.attendance)].filter(Boolean).join('. ');
  const build = (n: number, nameLen: number) => {
    const lines = [head];
    if (c.quiet) {
      lines.push(`No practice or quizzes on the app this week.`);
    } else {
      if (c.strong.length) lines.push(`Doing well: ${c.strong.slice(0, n).map((t) => named(t, nameLen)).join(', ')}.`);
      if (c.improving.length) lines.push(`Getting better: ${c.improving.slice(0, n).map((t) => `${named(t, nameLen)}${t.change ? `, up ${t.change} points` : ''}`).join('; ')}.`);
      if (c.attention.length) lines.push(`Needs attention: ${c.attention.slice(0, n).map((t) => named(t, nameLen)).join(', ')}.`);
      if (!c.strong.length && !c.improving.length && !c.attention.length) lines.push(`Practised ${plural(c.activity.topics, 'topic')} this week.`);
    }
    if (facts) lines.push(`${facts}.`);
    lines.push(`Our suggestion: ${c.recommendation.text}`);
    return lines.join('\n');
  };
  for (const [n, len] of [[2, 40], [1, 40], [1, 28]] as const) {
    const t = build(n, len);
    if (t.length <= TEXT_LIMIT) return t;
  }
  return clip(build(1, 24), TEXT_LIMIT);
}

/** The student's own version: second person and encouraging. */
export function studentText(c: Omit<LearningUpdateContent, 'studentText'>): string {
  const parts: string[] = [];
  if (c.quiet) {
    parts.push('A quiet week on the app.');
  } else {
    if (c.strong.length) parts.push(`Great work on ${c.strong.slice(0, 2).map((t) => clip(t.topic, 40)).join(' and ')}!`);
    if (c.improving.length) parts.push(`You're getting better at ${clip(c.improving[0]!.topic, 40)}${c.improving[0]!.change ? ` (up ${c.improving[0]!.change} points)` : ''}.`);
    if (c.attention.length) parts.push(`Next up: ${clip(c.attention[0]!.topic, 40)}. You can do this.`);
    if (!parts.length) parts.push(`You practised ${plural(c.activity.topics, 'topic')} this week. Keep going!`);
  }
  const t = c.recommendation.topic ? clip(c.recommendation.topic, 40) : null;
  parts.push(t ? `Try 15 minutes on ${t} in Exam Academy this week.` : 'Try 15 minutes of practice in Exam Academy this week. A little often works best.');
  return parts.join(' ');
}

/** Builds the whole update from the facts and a recommendation (rules or AI). */
export function buildContent(f: WeekFacts, rec: Recommendation): LearningUpdateContent {
  const g = classify(f.topics);
  const base: Omit<LearningUpdateContent, 'studentText'> = {
    version: 1,
    firstName: f.firstName,
    weekStart: f.weekStart,
    weekEnd: addDays(f.weekStart, 6),
    ...g,
    highlights: highlights(f),
    homework: f.homework && f.homework.set > 0 ? f.homework : null,
    attendance: f.attendance && f.attendance.daysMarked > 0 ? f.attendance : null,
    activity: { pieces: f.pieces, questions: f.questions, topics: f.topics.length },
    recommendation: rec,
    quiet: f.pieces === 0,
  };
  return { ...base, studentText: studentText(base) };
}

/** Nothing at all to say this week: no learning, no homework set, no register marked. */
export const nothingToSay = (f: WeekFacts) => f.pieces === 0 && !(f.homework && f.homework.set > 0) && !(f.attendance && f.attendance.daysMarked > 0) && !f.reportCard;
