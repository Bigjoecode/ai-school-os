import { phyFit, phyLineSlope, type PhyGraphLine } from '@aischool/shared';

/**
 * Marking helpers shared by the physics labs: physics units as students write
 * them, and the graph (the best straight line the student drew, and slopes
 * read from their own data or line).
 */

const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };

/**
 * A physics unit → canonical text: 's2/m', 's2/cm', 'm/s2', 'cm/s2', 'ohm', 'ohm/m', 'ohm/cm', 'ohm.m', 'ohm.cm',
 * 'm2', 'mm2', 'cm2', 'cm-1', 'm-1', 's', 'cm', 'm', 'g', 'kg', 'A', 'V', 'none' (written "no unit"/"—"/"nil"), '' (blank) or 'other:<text>'.
 */
export function phyUnit(raw: string | null | undefined): string {
  let s = (raw ?? '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/g, (c) => SUP[c]!)
    .replace(/[−–—]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  if (/^(no unit|none|nil|n\/a|-+|no units|unitless|dimensionless|has no unit)$/.test(s)) return 'none';
  s = s
    .replace(/ω|Ω|ohms?/g, 'Ω')
    .replace(/\^/g, '')
    .replace(/[()]/g, '')
    .replace(/(metres?|meters?)/g, 'm')
    .replace(/(centim)/g, 'cm')
    .replace(/(seconds?|secs?)/g, 's')
    .replace(/squared/g, '2')
    .replace(/[·.*×x]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const c = s.replace(/\s+/g, '');
  const table: [RegExp, string][] = [
    [/^(s2\/m|s2m-1|s2per m|s2perm)$/, 's2/m'],
    [/^(s2\/cm|s2cm-1|s2percm)$/, 's2/cm'],
    [/^(m\/s2|ms-2|m\/s\/s|mpers2)$/, 'm/s2'],
    [/^(cm\/s2|cms-2|cm\/s\/s)$/, 'cm/s2'],
    [/^(Ω|v\/a|va-1)$/, 'ohm'],
    [/^(Ω\/m|Ωm-1|Ωperm)$/, 'ohm/m'],
    [/^(Ω\/cm|Ωcm-1|Ωpercm)$/, 'ohm/cm'],
    [/^(Ωm|Ω-m)$/, 'ohm.m'],
    [/^(Ωcm|Ω-cm)$/, 'ohm.cm'],
    [/^m2$/, 'm2'],
    [/^mm2$/, 'mm2'],
    [/^cm2$/, 'cm2'],
    [/^(cm-1|\/cm|1\/cm|percm)$/, 'cm-1'],
    [/^(m-1|\/m|1\/m|perm)$/, 'm-1'],
    [/^s$/, 's'],
    [/^cm$/, 'cm'],
    [/^m$/, 'm'],
    [/^(g|gm|gms|grams?|grammes?)$/, 'g'],
    [/^(kg|kilograms?|kilogrammes?)$/, 'kg'],
    [/^(a|amps?|amperes?)$/, 'A'],
    [/^(v|volts?)$/, 'V'],
  ];
  for (const [re, u] of table) if (re.test(c)) return u;
  return `other:${c}`;
}

export type XY = { x: number; y: number };

/** Graph marks: a line drawn across the points (1) that is a good best fit (1). */
export function gradeGraph(points: XY[], line: PhyGraphLine | null, axes: string): { marks: number; notes: string[]; fit: { slope: number; intercept: number } | null; lineOk: boolean } {
  const notes: string[] = [];
  const fit = phyFit(points);
  if (points.length < 3 || !fit) return { marks: 0, notes: [`Plot at least five points of ${axes} from your table before drawing the line.`], fit, lineOk: false };
  let marks = 0;
  const xs = points.map((p) => p.x);
  const span = Math.max(...xs) - Math.min(...xs);
  const ls = phyLineSlope(line);
  if (line && ls !== null && Math.abs(line.x2 - line.x1) >= span * 0.5) marks++;
  else {
    notes.push(line ? 'Draw the line right across your points (it should cover most of the plotted range).' : `Draw the best straight line through your points of ${axes}.`);
    return { marks, notes, fit, lineOk: false };
  }
  // Good fit: slope close to the least-squares slope, and passing near the centroid.
  const mx = xs.reduce((t, x) => t + x, 0) / xs.length;
  const my = points.reduce((t, p) => t + p.y, 0) / points.length;
  const ys = points.map((p) => p.y);
  const yspan = Math.max(...ys) - Math.min(...ys) || Math.abs(my) || 1;
  const atMx = line!.y1 + ls * (mx - line!.x1);
  const lineOk = Math.abs(ls - fit.slope) <= 0.06 * Math.abs(fit.slope) && Math.abs(atMx - my) <= 0.08 * yspan;
  if (lineOk) marks++;
  else notes.push('Your line is not the best fit: it should follow the trend with the points scattered evenly on both sides.');
  return { marks, notes, fit, lineOk };
}

/** The slope as written is acceptable: within 5 % of the best fit of the student's own points, or 3 % of their own (sensible) line. */
export function slopeAccepted(value: number | null, fitSlope: number | null, line: PhyGraphLine | null, lineOk: boolean): boolean {
  if (value === null || fitSlope === null) return false;
  if (Math.abs(value - fitSlope) <= 0.05 * Math.abs(fitSlope)) return true;
  const ls = phyLineSlope(line);
  return lineOk && ls !== null && Math.abs(value - ls) <= 0.03 * Math.abs(ls);
}
