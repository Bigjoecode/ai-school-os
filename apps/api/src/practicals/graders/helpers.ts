import type { CriterionScore, RubricCriterion } from '@aischool/shared';

/**
 * Exact-marking helpers shared by the simulator graders: numbers as students
 * write them, units and their accepted equivalents, tolerances, decimal places,
 * significant figures and concordant readings.
 */

const SUPERSCRIPT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
const plain = (s: string) => s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/g, (c) => SUPERSCRIPT[c]!).replace(/[−–—]/g, '-');

/** "23.40", "0.0955", "9.55 x 10^-2", "9.55×10⁻²", "9.55e-2", "1,250.5" → number; anything else → null. */
export function parseNumber(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const s = plain(raw).trim().replace(/,(?=\d{3}\b)/g, '').replace(/\s+/g, '');
  if (!s) return null;
  const sci = /^([+-]?\d*\.?\d+)(?:[x×*]10\^?([+-]?\d+))$/i.exec(s);
  if (sci) return Number(`${sci[1]}e${sci[2]}`);
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Digits after the decimal point as written ("23.40" → 2, "23.4" → 1, "23" → 0). */
export function decimalPlaces(raw: string): number {
  const m = /\.(\d+)$/.exec(raw.trim());
  return m ? m[1]!.length : 0;
}

/** Significant figures as written (plain decimals only; null for scientific notation). */
export function sigFigs(raw: string): number | null {
  const s = raw.trim().replace(/^[+-]/, '');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const digits = s.replace('.', '').replace(/^0+/, '');
  if (!s.includes('.')) return digits.replace(/0+$/, '').length || 1;
  return digits.length || 1;
}

/**
 * A unit as written → its canonical form. Accepted equivalents: cm³ = cm3 = cm^3 = ml;
 * mol dm⁻³ = mol/dm3 = moldm-3 = M (capital) = mol/L = mol l-1; g dm⁻³ = g/dm3 = g/L; % = percent.
 * '' when blank, 'other:<text>' when not recognised.
 */
export function normaliseUnit(raw: string | null | undefined): string {
  const s = plain(raw ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\^/g, '')
    .replace(/[()]/g, '');
  if (!s) return '';
  // Capital M is molar; lower-case m is the metre.
  if ((raw ?? '').trim() === 'M') return 'mol/dm3';
  if (/^(cm3|ml|cc|cubiccentimet(re|er)s?)$/.test(s)) return 'cm3';
  if (/^(dm3|l|litres?|liters?)$/.test(s)) return 'dm3';
  if (/^(mol\/dm3|moldm-3|mol\.dm-3|mol\/l|moll-1|molar|mol\/litre|mol\/liter|moldm3)$/.test(s)) return 'mol/dm3';
  if (/^(g\/dm3|gdm-3|g\.dm-3|g\/l|gl-1|gdm3|g\/litre|g\/liter)$/.test(s)) return 'g/dm3';
  if (/^(%|percent|per cent|percentage)$/.test(s)) return '%';
  if (/^(mol|moles?)$/.test(s)) return 'mol';
  if (/^(g|grams?|gram)$/.test(s)) return 'g';
  if (/^(s|secs?|seconds?)$/.test(s)) return 's';
  if (/^(cm|centimet(re|er)s?)$/.test(s)) return 'cm';
  if (/^(m|met(re|er)s?)$/.test(s)) return 'm';
  if (/^(v|volts?)$/.test(s)) return 'V';
  if (/^(a|amps?|amperes?)$/.test(s)) return 'A';
  if (/^(ω|ohms?|Ω)$/i.test(s)) return 'ohm';
  return `other:${s}`;
}

/** Relative closeness (|x − target| ≤ rel × |target|), with a tiny absolute floor for zero targets. */
export const withinRel = (x: number | null, target: number, rel: number) => x !== null && Math.abs(x - target) <= Math.max(rel * Math.abs(target), 1e-9);
export const withinAbs = (x: number | null, target: number, tol: number) => x !== null && Math.abs(x - target) <= tol + 1e-9;

/** Every subset (size ≥ 2) of the values whose spread is within `tol`, by index; largest first. */
export function concordantSets(values: number[], tol: number): number[][] {
  const out: number[][] = [];
  const n = Math.min(values.length, 10);
  for (let mask = 1; mask < 1 << n; mask++) {
    const idx = [...Array(n).keys()].filter((i) => mask & (1 << i));
    if (idx.length < 2) continue;
    const vs = idx.map((i) => values[i]!);
    if (Math.max(...vs) - Math.min(...vs) <= tol + 1e-9) out.push(idx);
  }
  return out.sort((a, b) => b.length - a.length);
}

export const mean = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / (xs.length || 1);

/** A number to `n` significant figures, as text (e.g. 0.09553 → "0.0955"). */
export function sf(x: number, n = 3): string {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  return Number(x.toPrecision(n)).toString();
}

/** A criterion's score, clamped to its marks and rounded to half marks. */
export function score(c: RubricCriterion, awarded: number, notes: string[]): CriterionScore {
  return { id: c.id, label: c.label, awarded: Math.max(0, Math.min(c.marks, Math.round(awarded * 2) / 2)), max: c.marks, how: c.how, note: notes.filter(Boolean).join(' ') || 'Full marks.' };
}

/** The deterministic stand-in for an AI criterion: one point per keyword group found; `need` points for full marks. */
export function keywordMarks(answer: string, keywords: string[][], need: number, marks: number): { awarded: number; found: number } {
  const a = ` ${answer.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
  const found = keywords.filter((g) => g.some((w) => a.includes(` ${w.toLowerCase()}`))).length;
  const awarded = need <= 0 ? 0 : Math.min(marks, Math.floor((Math.min(found, need) / need) * marks * 2) / 2);
  return { awarded, found };
}
