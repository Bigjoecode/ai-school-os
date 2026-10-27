import type { PracticalLessonView } from '@aischool/shared';

/**
 * "What is this?" cards: what it is, what it is for, how to use it and the
 * usual mistake. A lab gives its table to `makeExplainer`; lines from the
 * practical's own lesson (safety, precautions, common mistakes) that mention
 * the object are added underneath, so the lab and the lesson say the same thing.
 */

export interface Explainer {
  name: string;
  purpose: string;
  how: string;
  mistake: string;
  /** Words that find this object's lines in the lesson. */
  keys: string[];
}

/**
 * The card for a selected object id. Cupboard copies (`cup:<id>`) share their
 * apparatus' card; `alias` maps other id prefixes (e.g. 'ind:' → 'indicator').
 */
export function makeExplainer(table: Record<string, Explainer>, alias: Record<string, string> = {}) {
  return (id: string): Explainer | null => {
    let key = id.startsWith('cup:') ? id.slice(4) : id;
    for (const [prefix, to] of Object.entries(alias)) if (key.startsWith(prefix)) key = to;
    return table[key] ?? null;
  };
}

/** Lesson lines (safety, precautions, common mistakes) that mention this object. */
export function lessonLines(lesson: Pick<PracticalLessonView, 'safety' | 'precautions' | 'commonMistakes'> | undefined, e: Explainer): string[] {
  if (!lesson || !e.keys.length) return [];
  const lines = [...(lesson.safety ?? []), ...(lesson.precautions ?? []), ...(lesson.commonMistakes ?? [])].filter((l): l is string => typeof l === 'string');
  return lines.filter((l) => e.keys.some((k) => l.toLowerCase().includes(k))).slice(0, 2);
}
