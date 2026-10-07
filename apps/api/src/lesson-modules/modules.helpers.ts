import { randomBytes, randomInt } from 'node:crypto';
import { markShortAnswer, type CheckInQuestion, type StudentQuestion } from '@aischool/shared';

/** A short id for a question inside a step's JSON. */
export const questionId = () => `q${randomBytes(5).toString('hex')}`;

/** A join code students can read off the board: no 0/O or 1/I. */
export function joinCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
}

export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Stored questions, tolerating old or hand-edited JSON. */
export function questionsOf(json: unknown): CheckInQuestion[] {
  if (!Array.isArray(json)) return [];
  return json.filter((q): q is CheckInQuestion => !!q && typeof q === 'object' && typeof (q as CheckInQuestion).id === 'string' && typeof (q as CheckInQuestion).prompt === 'string');
}

/** What a student sees: no answers; multiple-choice options in a fresh order (each keeps its original index). */
export function forStudent(q: CheckInQuestion, mix = true): StudentQuestion {
  const options = q.options.map((text, key) => ({ key, text }));
  return { id: q.id, type: q.type, prompt: q.prompt, options: mix && q.type === 'MCQ' ? shuffle(options) : options, at: q.at ?? null };
}

export type Answer = number | string | undefined | null;

export function isRight(q: CheckInQuestion, a: Answer): boolean {
  if (a === undefined || a === null) return false;
  if (q.type === 'SHORT') return typeof a === 'string' && markShortAnswer(a, q.answers);
  return typeof a === 'number' && a === q.correctIndex;
}

export function answerText(q: CheckInQuestion, a: Answer): string | null {
  if (a === undefined || a === null || a === '') return null;
  if (q.type === 'SHORT') return String(a);
  return typeof a === 'number' ? (q.options[a] ?? null) : null;
}

export function correctText(q: CheckInQuestion): string {
  if (q.type === 'SHORT') return q.answers[0] ?? '';
  return q.correctIndex !== null && q.correctIndex !== undefined ? (q.options[q.correctIndex] ?? '') : '';
}

/** Marks answers to a set of questions. */
export function markAll(questions: CheckInQuestion[], answers: Record<string, Answer>) {
  const review = questions.map((q) => {
    const a = answers[q.id];
    const correct = isRight(q, a);
    return { questionId: q.id, prompt: q.prompt, yourAnswer: answerText(q, a), correctAnswer: correctText(q), correct, explanation: q.explanation ?? null };
  });
  const correct = review.filter((r) => r.correct).length;
  const total = questions.length;
  return { review, correct, total, percent: total ? Math.round((100 * correct) / total) : 0 };
}

/** Class year inside a stage ("JSS 2" → 2, "SS 3" → 3, "Primary 4" → 4), or 1. */
export function yearOf(levelName: string): number {
  const n = Number(/(\d+)/.exec(levelName)?.[1]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export const WEEKS_PER_TERM = 12;
