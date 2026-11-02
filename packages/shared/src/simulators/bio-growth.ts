import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { bioDrawingPick, type BioDrawingStatement } from './bio-common';
import { labBetween, labRandom, roundDp } from './seeded';

/**
 * bio-growth: WAEC germination, seed respiration and plant responses. The one
 * source of truth for all four tasks: the web shows these readings and the
 * API marks against them.
 *
 * GERM (pr-bio-germination-conditions): four labelled tubes of ten cowpea
 * seeds — moist cotton wool at room temperature (the control), dry cotton
 * wool (no water), boiled and cooled water under a layer of oil (no oxygen),
 * moist cotton wool in a refrigerator (cold). Each seed has its own seeded
 * viability and germination time; seeds with water swell within a day but
 * only count as germinated once the radicle shows. Boiled water without the
 * oil (or unboiled water) lets some oxygen in, so a few seeds germinate late.
 * The student counts the germinated seeds each day for up to 7 days, works out
 * the percentage germination and names the missing condition in each tube.
 *
 * SEEDLING (pr-bio-epigeal-hypogeal): soaked cowpea (epigeal) and maize
 * (hypogeal) seeds in a box of moist sawdust and in a seed jar against
 * blotting paper. Shoot (plumule) length follows a seeded S-shaped (logistic)
 * curve; the medium dries if not watered for two days and growth then almost
 * stops. The cowpea hypocotyl arches up and pulls its cotyledons above the
 * soil, where they turn green; the maize coleoptile pushes up while the grain
 * stays below. The student measures both shoots daily with a ruler (from the
 * same point each day), plots length against time, draws at day 3 and 7,
 * works out the growth rate between day 4 and day 8 and compares the two.
 *
 * RESP (pr-bio-respiration-germinating-seeds): germinating seeds in thermos
 * flask A, boiled (killed) seeds in flask B, both rinsed in disinfectant, a
 * thermometer through a loose cotton-wool plug, the flasks inverted. Flask A
 * warms steadily (seeded rate, slowing a little); B stays at room temperature
 * — unless its seeds were not disinfected (microbes rot them and warm it), or
 * flask A was sealed with a bung (its oxygen runs out after about a day).
 * Readings to 0.5 °C at the start and daily for three days; a separate flask
 * of germinating seeds bubbles into lime water (milky) or hydrogencarbonate
 * indicator (red → yellow) beside a boiled-seed control.
 *
 * TROPISM (pr-bio-tropisms): a pot of seedlings in a light-proof box with a
 * slit facing the lamp bends towards the light (seeded angle, approaching a
 * maximum); the control pot on a rotating clinostat (or in uniform light)
 * grows straight. Gaps in the box or the slit facing away weaken the bend.
 * Ten soaked bean seedlings pinned to a moist cork with radicles pointing in
 * different directions all turn to grow downwards (a seeded one or two are
 * damaged and do not grow); a similar set on the rotating clinostat grows
 * straight on. The student measures the curvature with a protractor daily,
 * counts the radicles growing down and explains with auxin.
 */

export const GROWTH_TASKS = ['GERM', 'SEEDLING', 'RESP', 'TROPISM'] as const;
export type GrowthTask = (typeof GROWTH_TASKS)[number];
/** The lessons that open this lab, and the task each one sets. */
export const GROWTH_PRACTICAL_TASKS: Record<string, GrowthTask> = {
  'pr-bio-germination-conditions': 'GERM',
  'pr-bio-epigeal-hypogeal': 'SEEDLING',
  'pr-bio-respiration-germinating-seeds': 'RESP',
  'pr-bio-tropisms': 'TROPISM',
};
export const GROWTH_TASK_TITLE: Record<GrowthTask, string> = {
  GERM: 'Conditions for germination',
  SEEDLING: 'Epigeal and hypogeal germination',
  RESP: 'Respiration in germinating seeds',
  TROPISM: 'Phototropism and geotropism',
};

/** One observable fact and the keyword groups a written observation must contain (the shape the other biology labs use). */
export interface GrowthPart {
  text: string;
  kw: string[][];
  not?: string[];
}
const P = (text: string, ...kw: string[][]): GrowthPart => ({ text, kw });
const Pn = (text: string, not: string[], ...kw: string[][]): GrowthPart => ({ text, kw, not });
const norm = (r: () => number) => (r() + r() + r() + r() - 2) * 1.732;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// ================================================================== GERM

export const GERM_TUBES = ['A', 'B', 'C', 'D'] as const;
export const GERM_DAYS_MAX = 7;
/** The final count is taken after at least this many days. */
export const GERM_MIN_DAY = 4;
export const GERM_SOWN = 10;
export const GERM_MAX_SEEDS = 20;
export type GermKind = 'CONTROL' | 'DRY' | 'NOOXY' | 'COLD' | 'OTHER';
export const GERM_KIND_LABEL: Record<GermKind, string> = {
  CONTROL: 'Moist cotton wool, room temperature (the control)',
  DRY: 'Dry cotton wool (no water)',
  NOOXY: 'Boiled, cooled water under a layer of oil (no oxygen)',
  COLD: 'Moist cotton wool in the refrigerator (cold)',
  OTHER: 'Some other set-up',
};
export const GERM_MISSING = ['NONE', 'WATER', 'OXYGEN', 'WARMTH'] as const;
export type GermMissing = (typeof GERM_MISSING)[number];
export const GERM_MISSING_LABEL: Record<GermMissing, string> = { NONE: 'None (control)', WATER: 'Water', OXYGEN: 'Oxygen', WARMTH: 'Warmth' };
export const GERM_CLAIMS = ['WATER', 'OXYGEN', 'WARMTH', 'CONTROL', 'OIL', 'LIGHT', 'SWOLLEN', 'OIL_FOOD'] as const;
export type GermClaim = (typeof GERM_CLAIMS)[number];
export const GERM_CLAIM_LABEL: Record<GermClaim, string> = {
  WATER: 'Water is needed for germination',
  OXYGEN: 'Oxygen is needed for germination',
  WARMTH: 'A suitable (warm) temperature is needed for germination',
  CONTROL: 'Tube A, with water, oxygen and warmth, is the control',
  OIL: 'The oil layer stops oxygen from the air dissolving in the boiled water',
  LIGHT: 'Light is needed for germination',
  SWOLLEN: 'Seeds that have swollen have germinated',
  OIL_FOOD: 'The oil layer supplies food to the seeds',
};
export const GERM_WRONG: GermClaim[] = ['LIGHT', 'SWOLLEN', 'OIL_FOOD'];
/** The claim each experimental tube supports (with the condition it lacks). */
export const GERM_KIND_CLAIM: Partial<Record<GermKind, GermClaim>> = { DRY: 'WATER', NOOXY: 'OXYGEN', COLD: 'WARMTH' };
export const GERM_KIND_MISSING: Record<GermKind, GermMissing | null> = { CONTROL: 'NONE', DRY: 'WATER', NOOXY: 'OXYGEN', COLD: 'WARMTH', OTHER: null };

export interface GermTube {
  cotton: 'MOIST' | 'DRY' | null;
  /** Filled with water, the seeds under it (instead of cotton wool). */
  water: 'BOILED' | 'TAP' | null;
  oil: boolean;
  fridge: boolean;
  seeds: number;
  label: boolean;
}
export interface GermRow {
  /** The count of germinated seeds written for each day (index = day, 0…7). */
  c: string[];
  sown: string;
  germ: string;
  pct: string;
  missing: GermMissing | '';
}
export interface GermWork {
  /** The seeds chosen: sorted (same kind, size and age, undamaged) or a mixed handful. */
  batch: 'SORTED' | 'MIXED' | null;
  tubes: GermTube[];
  /** Time-lapse clock (days). */
  day: number;
  /** Days on which the tubes were inspected and counted. */
  looks: number[];
  rows: GermRow[];
  claims: GermClaim[];
}
export interface GermVariant {
  /** Median germination time of a viable seed with water, oxygen and warmth (days). */
  t50: number;
  /** Fraction of a sorted batch that is dead. */
  dead: number;
  /** Chance a viable seed germinates within the week in the refrigerator. */
  coldP: number;
  /** Room temperature (°C) and the refrigerator's. */
  room: number;
  fridgeT: number;
  /** The attempt's seed: each seed in each tube draws its own fate from it. */
  key: number;
}
function pickGerm(seed: number): GermVariant {
  const r = labRandom(seed, 'bio-growth-germ');
  return { t50: labBetween(r, 1.6, 2.4, 2), dead: labBetween(r, 0.03, 0.1, 3), coldP: labBetween(r, 0.04, 0.14, 3), room: labBetween(r, 26, 30, 1), fridgeT: labBetween(r, 4, 7, 1), key: seed };
}
export const emptyGermTube = (): GermTube => ({ cotton: null, water: null, oil: false, fridge: false, seeds: 0, label: false });
export const emptyGermRow = (): GermRow => ({ c: Array.from({ length: GERM_DAYS_MAX + 1 }, () => ''), sown: '', germ: '', pct: '', missing: '' });

/** What the seeds in a tube have: water, oxygen (0 … 1) and warmth. */
export function germConditions(t: GermTube): { water: boolean; oxygen: number; warm: boolean } {
  const water = t.cotton === 'MOIST' || t.water !== null;
  let oxygen = 1;
  if (t.water === 'BOILED') oxygen = t.oil ? 0 : 0.35;
  else if (t.water === 'TAP') oxygen = t.oil ? 0.3 : 0.5;
  return { water, oxygen, warm: !t.fridge };
}
export function germKind(t: GermTube): GermKind {
  if (t.seeds <= 0 || (!t.cotton && !t.water)) return 'OTHER';
  const c = germConditions(t);
  if (c.water && c.oxygen >= 1 && c.warm) return 'CONTROL';
  if (!c.water && c.oxygen >= 1 && c.warm) return 'DRY';
  if (c.water && c.oxygen <= 0 && c.warm) return 'NOOXY';
  if (c.water && c.oxygen >= 1 && !c.warm) return 'COLD';
  return 'OTHER';
}
/** Each seed in tube k: when it swells and when its radicle appears (days; null: never within the week). */
export function germSeeds(v: GermVariant, w: Pick<GermWork, 'batch'>, t: GermTube, k: number): { swell: number | null; tg: number | null }[] {
  const c = germConditions(t);
  const mixed = w.batch !== 'SORTED';
  return Array.from({ length: t.seeds }, (_, j) => {
    const rv = labRandom(v.key, `bio-growth-germ-seed-${k}-${j}`);
    const dead = rv() < v.dead + (mixed ? 0.16 : 0);
    const swell = c.water ? roundDp(0.4 + rv() * 0.6, 2) : null;
    const z = norm(rv);
    let tg: number | null = dead || !c.water ? null : v.t50 * Math.exp((mixed ? 0.36 : 0.2) * z);
    if (tg !== null && c.oxygen < 1) tg = rv() < c.oxygen * 0.9 ? tg / Math.max(0.2, c.oxygen) ** 0.7 + 1 : null;
    if (tg !== null && !c.warm) tg = rv() < v.coldP ? 4 + rv() * 3.5 : null;
    if (tg !== null && tg > GERM_DAYS_MAX + 0.5) tg = null;
    return { swell, tg: tg === null ? null : roundDp(tg, 2) };
  });
}
/** Germinated seeds (radicle visible) in tube k on day d. */
export const germCount = (v: GermVariant, w: Pick<GermWork, 'batch'>, t: GermTube, k: number, d: number) => germSeeds(v, w, t, k).filter((s) => s.tg !== null && s.tg <= d + 1e-9).length;
/** Seeds swollen but without a radicle yet (the trap). */
export const germSwollen = (v: GermVariant, w: Pick<GermWork, 'batch'>, t: GermTube, k: number, d: number) => germSeeds(v, w, t, k).filter((s) => s.swell !== null && s.swell <= d && !(s.tg !== null && s.tg <= d + 1e-9)).length;
/** The last inspection day (the final count). */
export const germFinalDay = (w: Pick<GermWork, 'looks'>) => (w.looks.length ? Math.max(...w.looks) : null);

// ================================================================== SEEDLING

export const SEED_KINDS = ['COWPEA', 'MAIZE'] as const;
export type SeedKind = (typeof SEED_KINDS)[number];
export const SEED_KIND_LABEL: Record<SeedKind, string> = { COWPEA: 'Cowpea', MAIZE: 'Maize' };
export const SEED_DAYS_MAX = 10;
/** Unwatered for more than this many days, the medium is dry and growth almost stops. */
export const SEED_DRY_AFTER = 2;
export const SEED_REFS = ['SEED', 'SOIL'] as const;
export type SeedRef = (typeof SEED_REFS)[number];
export const SEED_REF_LABEL: Record<SeedRef, string> = { SEED: 'From the seed (where the shoot leaves it)', SOIL: 'From the top of the sawdust' };
export const SEED_FIRSTS = ['RADICLE', 'PLUMULE', 'COTYLEDONS'] as const;
export type SeedFirst = (typeof SEED_FIRSTS)[number];
export const SEED_FIRST_LABEL: Record<SeedFirst, string> = { RADICLE: 'The radicle', PLUMULE: 'The plumule', COTYLEDONS: 'The cotyledons' };
/** The comparison table: each property and its choices. */
export const SEED_TABLE = {
  type: { label: 'Type of germination', options: ['EPIGEAL', 'HYPOGEAL'] },
  cot: { label: 'Where the cotyledons stay', options: ['ABOVE', 'BELOW'] },
  part: { label: 'The part that elongates', options: ['HYPOCOTYL', 'EPICOTYL'] },
} as const;
export type SeedTableKey = keyof typeof SEED_TABLE;
export const SEED_TABLE_OPTION_LABEL: Record<string, string> = { EPIGEAL: 'Epigeal', HYPOGEAL: 'Hypogeal', ABOVE: 'Above the soil', BELOW: 'Below the soil', HYPOCOTYL: 'Hypocotyl', EPICOTYL: 'Epicotyl' };
export const SEED_TABLE_TRUTH: Record<SeedKind, Record<SeedTableKey, string>> = { COWPEA: { type: 'EPIGEAL', cot: 'ABOVE', part: 'HYPOCOTYL' }, MAIZE: { type: 'HYPOGEAL', cot: 'BELOW', part: 'EPICOTYL' } };
export const SEED_CLAIMS = ['COT_GREEN', 'GRAIN_FOOD', 'S_CURVE', 'MAIZE_EPI', 'HYPO_MAIZE', 'LIGHT_GERM'] as const;
export type SeedClaim = (typeof SEED_CLAIMS)[number];
export const SEED_CLAIM_LABEL: Record<SeedClaim, string> = {
  COT_GREEN: 'Above the soil the cowpea cotyledons turn green and photosynthesise for a while',
  GRAIN_FOOD: 'The maize grain stays in the soil and feeds the seedling from its endosperm',
  S_CURVE: 'Growth is slow at first, then fast: over a longer time the curve is S-shaped',
  MAIZE_EPI: 'Maize shows epigeal germination',
  HYPO_MAIZE: 'In maize the hypocotyl elongates and lifts the grain',
  LIGHT_GERM: 'The seeds needed light to germinate',
};
export const SEED_NEED: SeedClaim[] = ['COT_GREEN', 'GRAIN_FOOD', 'S_CURVE'];
export const SEED_WRONG: SeedClaim[] = ['MAIZE_EPI', 'HYPO_MAIZE', 'LIGHT_GERM'];
/** The labels of the drawing of the two seedlings at day 7 (in target order). */
export const SEED_LABELS = ['Radicle', 'Hypocotyl', 'Cotyledon', 'Plumule (first leaves)', 'Coleoptile', 'Grain (endosperm)'] as const;
const SEED_DISTRACTORS = ['Root hair cap', 'Tendril'];
/** The label targets in the drawing's 0–240 × 0–150 box (same order as SEED_LABELS). */
export const SEED_DRAWING_TARGETS: { x: number; y: number }[] = [
  { x: 58, y: 128 },
  { x: 52, y: 74 },
  { x: 78, y: 44 },
  { x: 60, y: 20 },
  { x: 178, y: 46 },
  { x: 176, y: 104 },
];
export const SEED_CURVES = ['SMOOTH', 'DOT', 'STRAIGHT'] as const;
export type SeedCurve = (typeof SEED_CURVES)[number];
export const SEED_CURVE_LABEL: Record<SeedCurve, string> = { SMOOTH: 'A smooth curve through the points', DOT: 'Ruled lines from point to point', STRAIGHT: 'One straight line of best fit' };

export interface SeedGrowth {
  /** Logistic shoot length L = Lmax / (1 + e^(−k(t − t0))) − L(0) (mm, t in effective days). */
  Lmax: number;
  k: number;
  t0: number;
  /** When the radicle appears (effective days). */
  tR: number;
}
export interface SeedlingVariant {
  grow: Record<SeedKind, SeedGrowth>;
  /** How deep the seeds lie in the sawdust (mm). */
  depth: number;
  /** Of the 10 sown of each kind in the box, how many come up. */
  up: Record<SeedKind, number>;
}
function pickSeedling(seed: number): SeedlingVariant {
  const r = labRandom(seed, 'bio-growth-seedling');
  return {
    grow: {
      COWPEA: { Lmax: labBetween(r, 125, 160, 1), k: labBetween(r, 0.5, 0.62, 3), t0: labBetween(r, 7, 8, 2), tR: labBetween(r, 0.8, 1.3, 2) },
      MAIZE: { Lmax: labBetween(r, 110, 145, 1), k: labBetween(r, 0.48, 0.6, 3), t0: labBetween(r, 7.3, 8.4, 2), tR: labBetween(r, 1.1, 1.7, 2) },
    },
    depth: labBetween(r, 15, 25, 0),
    up: { COWPEA: 7 + Math.floor(r() * 4), MAIZE: 7 + Math.floor(r() * 4) },
  };
}
export interface SeedMeasure {
  day: number;
  kind: SeedKind;
  ref: SeedRef;
}
export interface SeedRow {
  day: number;
  cow: string;
  maize: string;
}
export interface SeedlingWork {
  soaked: boolean;
  /** Sown in the box of moist sawdust; and against the blotting paper of the seed jar. */
  box: boolean;
  jar: boolean;
  day: number;
  /** Days on which the box and the jar were watered (planting counts as day 0). */
  waters: number[];
  measures: SeedMeasure[];
  /** Days on which the seedlings were drawn. */
  draws: number[];
  rows: SeedRow[];
  first: SeedFirst | null;
  table: Record<SeedKind, Record<SeedTableKey, string>>;
  rateCow: string;
  rateMaize: string;
  graph: boolean;
  curve: SeedCurve | null;
  labels: string[];
  drawing: string[];
  claims: SeedClaim[];
}
/** Days unwatered at the start of day i (the medium dries after SEED_DRY_AFTER). */
const lastWaterBefore = (w: Pick<SeedlingWork, 'waters'>, i: number) => Math.max(0, ...w.waters.filter((d) => d <= i + 1e-9));
/** Is the medium moist on day i? */
export const seedMoist = (w: Pick<SeedlingWork, 'waters'>, i: number) => i - lastWaterBefore(w, i) <= SEED_DRY_AFTER - 1e-9;
/** The seedlings' effective growing age on day d (days): soaking saves a day; dry days barely count. */
export function seedAge(w: Pick<SeedlingWork, 'waters' | 'soaked'>, d: number): number {
  let t = 0;
  for (let i = 0; i < Math.floor(d + 1e-9); i++) t += seedMoist(w, i) ? 1 : 0.15;
  const frac = d - Math.floor(d + 1e-9);
  if (frac > 1e-9) t += frac * (seedMoist(w, Math.floor(d)) ? 1 : 0.15);
  return Math.max(0, t - (w.soaked ? 0 : 1));
}
/** The true shoot length from the seed (mm) of the measured seedling of a kind at effective age t. */
export function seedLength(g: SeedGrowth, t: number): number {
  if (t <= g.tR) return 0;
  const f = (x: number) => g.Lmax / (1 + Math.exp(-g.k * (x - g.t0)));
  return Math.max(0, f(t) - f(g.tR));
}
export const seedTrueLen = (v: SeedlingVariant, w: Pick<SeedlingWork, 'waters' | 'soaked'>, kind: SeedKind, d: number) => seedLength(v.grow[kind], seedAge(w, d));
/** What the ruler showed for a measurement (mm, to 1 mm; curved shoots are hard to measure). */
export function seedMeasureShown(v: SeedlingVariant, w: Pick<SeedlingWork, 'waters' | 'soaked'>, m: SeedMeasure, n: number, seed: number): number {
  const r = labRandom(seed, `bio-growth-seed-m-${n}`);
  const L = seedTrueLen(v, w, m.kind, m.day);
  const hook = m.kind === 'COWPEA' && L > 8 && L < 45 ? 1.6 : 0.6;
  const x = L <= 0 ? 0 : L * (1 + 0.012 * norm(r)) + hook * norm(r);
  const shown = m.ref === 'SOIL' ? x - v.depth : x;
  return Math.max(0, Math.round(shown));
}
/** The stage a seedling has reached (what can be seen). */
export function seedStage(v: SeedlingVariant, w: Pick<SeedlingWork, 'waters' | 'soaked' | 'box' | 'jar'>, kind: SeedKind, d: number) {
  const g = v.grow[kind];
  const t = seedAge(w, d);
  const L = seedLength(g, t);
  const above = L - v.depth;
  return kind === 'COWPEA'
    ? { L, radicle: t > g.tR, hook: L > 6, emerged: above > 0, cotAbove: above > 12, green: above > 22, leaves: above > 38 }
    : { L, radicle: t > g.tR, hook: L > 3, emerged: above > 0, cotAbove: false, green: above > 4, leaves: above > 16 };
}
/** Seedlings that have come up in the box on day d. */
export function seedUp(v: SeedlingVariant, w: Pick<SeedlingWork, 'waters' | 'soaked'>, kind: SeedKind, d: number): number {
  const n = v.up[kind];
  const L = seedTrueLen(v, w, kind, d);
  const above = L - v.depth;
  if (above <= 0) return 0;
  return Math.min(n, Math.max(1, Math.round(n * clamp(above / 14, 0, 1))));
}
export const emptySeedTable = (): SeedlingWork['table'] => ({ COWPEA: { type: '', cot: '', part: '' }, MAIZE: { type: '', cot: '', part: '' } });

// ================================================================== RESP

export const RESP_HOURS_MAX = 96;
export const RESP_MAX_READS = 16;
export const RESP_FILLS = ['FULL', 'HALF'] as const;
export type RespFill = (typeof RESP_FILLS)[number];
export const RESP_INDICATORS = ['LIME', 'BICARB'] as const;
export type RespIndicator = (typeof RESP_INDICATORS)[number];
export const RESP_INDICATOR_LABEL: Record<RespIndicator, string> = { LIME: 'Lime water', BICARB: 'Hydrogencarbonate indicator' };
export const RESP_CLAIMS = ['HEAT', 'CO2', 'CONTROL', 'DISINFECT', 'SUN', 'PHOTO', 'BOILED_RESPIRE'] as const;
export type RespClaim = (typeof RESP_CLAIMS)[number];
export const RESP_CLAIM_LABEL: Record<RespClaim, string> = {
  HEAT: 'Germinating seeds release heat energy in respiration',
  CO2: 'Germinating seeds give off carbon dioxide',
  CONTROL: 'Flask B (killed seeds) is the control: the change in A is due to living seeds',
  DISINFECT: 'The seeds were disinfected so that microorganisms could not respire and give off heat',
  SUN: 'The heat in flask A comes from the sun',
  PHOTO: 'The seeds give off carbon dioxide because they photosynthesise',
  BOILED_RESPIRE: 'The boiled seeds respire faster than the living ones',
};
export const RESP_NEED: RespClaim[] = ['HEAT', 'CO2', 'CONTROL', 'DISINFECT'];
export const RESP_WRONG: RespClaim[] = ['SUN', 'PHOTO', 'BOILED_RESPIRE'];
export const RESP_EQUATIONS = [
  { id: 'AEROBIC', text: 'glucose + oxygen → carbon dioxide + water + energy' },
  { id: 'PHOTO', text: 'carbon dioxide + water → glucose + oxygen' },
  { id: 'ANAEROBIC', text: 'glucose → ethanol + carbon dioxide + a little energy' },
  { id: 'STARCH', text: 'glucose + oxygen → starch + water' },
] as const;
export type RespEquation = (typeof RESP_EQUATIONS)[number]['id'];

export interface RespVariant {
  /** Mean room temperature (°C), its daily swing and phase. */
  T0: number;
  amp: number;
  ph: number;
  /** Rise of a full flask of germinating seeds (°C per day at first), and how it slows. */
  rA: number;
  decel: number;
  /** Microbes on undisinfected seeds: warming (°C/day) after a lag (h). */
  mic: number;
  lag: number;
  /** A bunged flask runs out of oxygen after this many hours. */
  o2Out: number;
  /** Lime water / indicator change time constant (h). */
  co2Tau: number;
  /** Each thermometer's small error (°C). */
  offA: number;
  offB: number;
}
function pickResp(seed: number): RespVariant {
  const r = labRandom(seed, 'bio-growth-resp');
  return { T0: labBetween(r, 26, 28.5, 1), amp: labBetween(r, 0.3, 0.6, 2), ph: labBetween(r, 0, 6.28, 2), rA: labBetween(r, 1.7, 2.3, 2), decel: labBetween(r, 0.02, 0.05, 3), mic: labBetween(r, 0.6, 1, 2), lag: labBetween(r, 20, 30, 1), o2Out: labBetween(r, 16, 28, 1), co2Tau: labBetween(r, 0.35, 0.9, 2), offA: labBetween(r, -0.15, 0.15, 2), offB: labBetween(r, -0.15, 0.15, 2) };
}
export interface RespFlask {
  /** What is in it: germinating seeds, boiled seeds, or nothing yet. */
  seeds: 'LIVE' | 'BOILED' | null;
  fill: RespFill | null;
  thermo: boolean;
  plug: 'COTTON' | 'BUNG' | null;
  inverted: boolean;
}
export interface RespRow {
  a: string;
  b: string;
}
export interface RespWork {
  soaked: boolean;
  /** Half the seeds boiled for 10 minutes and cooled. */
  boiled: boolean;
  /** Rinsed in dilute disinfectant: the germinating batch, the boiled batch. */
  disLive: boolean;
  disBoiled: boolean;
  A: RespFlask;
  B: RespFlask;
  /** Time-lapse clock (h); the flasks start when both are set up. */
  clock: number;
  /** When both flasks were set up (h). */
  startAt: number | null;
  /** Times both thermometers were read (h). */
  reads: number[];
  rows: RespRow[];
  co2: { ind: RespIndicator | null; ctrl: boolean; at: number | null; look: number | null };
  obsLive: string;
  obsCtrl: string;
  riseA: string;
  riseB: string;
  perDay: string;
  diff: string;
  eq: RespEquation | null;
  claims: RespClaim[];
}
export const emptyRespFlask = (): RespFlask => ({ seeds: null, fill: null, thermo: false, plug: null, inverted: false });
export const respRoom = (v: RespVariant, t: number) => v.T0 + v.amp * Math.sin((2 * Math.PI * t) / 24 + v.ph);
/** Seeds in the flask still alive (germinating); a flask of unboiled seeds is alive. */
const living = (f: RespFlask) => f.seeds === 'LIVE';
/** A flask's true temperature (°C) at clock t (h). The insulated flask follows the room's daily swing only a little. */
export function respFlaskT(v: RespVariant, w: Pick<RespWork, 'disLive' | 'disBoiled' | 'startAt'>, f: RespFlask, t: number): number {
  const base = v.T0 + 0.25 * v.amp * Math.sin((2 * Math.PI * t) / 24 + v.ph - 0.6);
  if (w.startAt === null || !f.seeds || t <= w.startAt) return base;
  const h = t - w.startAt;
  const q = f.fill === 'HALF' ? 0.55 : 1;
  let rise = 0;
  if (living(f)) {
    const aero = (x: number) => v.rA * (x / 24) * (1 - v.decel * (x / 24));
    if (f.plug === 'BUNG' && h > v.o2Out) rise = aero(v.o2Out) + 0.12 * v.rA * ((h - v.o2Out) / 24) - 0.25 * ((h - v.o2Out) / 24);
    else rise = aero(h);
    rise *= q;
    if (!w.disLive) rise += 0.6 * v.mic * Math.max(0, h - v.lag) / 24;
  } else if (!w.disBoiled) rise = 1.2 * v.mic * q * Math.max(0, h - 0.8 * v.lag) / 24;
  if (!f.inverted) rise *= 0.85;
  return base + Math.max(0, rise);
}
/** What a thermometer showed for reading n (°C, to 0.5 °C). */
export function respShown(v: RespVariant, w: Pick<RespWork, 'disLive' | 'disBoiled' | 'startAt'>, which: 'A' | 'B', f: RespFlask, at: number, n: number, seed: number): number {
  const r = labRandom(seed, `bio-growth-resp-read-${which}-${n}`);
  const T = respFlaskT(v, w, f, at) + (which === 'A' ? v.offA : v.offB) + 0.08 * norm(r);
  return Math.round(T * 2) / 2;
}
/** How far the CO₂ test has changed at t (0 none … 1 fully milky / yellow): the germinating flask and the control. */
export function respCo2(v: RespVariant, w: Pick<RespWork, 'co2' | 'disBoiled'>, t: number): { live: number; ctrl: number } | null {
  if (w.co2.at === null || !w.co2.ind) return null;
  const h = Math.max(0, t - w.co2.at);
  return { live: 1 - Math.exp(-h / v.co2Tau), ctrl: w.co2.ctrl ? (w.disBoiled ? 0 : clamp((h - 20) / 30, 0, 0.5)) : 0 };
}
/** The observation parts of the CO₂ test when last looked at. */
export function respCo2Parts(v: RespVariant, w: Pick<RespWork, 'co2' | 'disBoiled'>): { live: GrowthPart[]; ctrl: GrowthPart[] } | null {
  if (w.co2.look === null || !w.co2.ind) return null;
  const c = respCo2(v, w, w.co2.look);
  if (!c) return null;
  const lime = w.co2.ind === 'LIME';
  const changed = (x: number): GrowthPart =>
    lime
      ? x >= 0.55
        ? Pn('the lime water turns milky (cloudy)', ['stays clear', 'remains clear', 'no change', 'not milky'], ['milky', 'cloudy', 'chalky', 'white', 'turbid', 'precipitate'])
        : x >= 0.2
          ? P('the lime water is just turning cloudy', ['cloud', 'slight', 'faint', 'little', 'milky'])
          : Pn('the lime water stays clear', ['milky', 'turns cloudy', 'became cloudy'], ['clear', 'no change', 'colourless', 'unchanged', 'not milky', 'remain'])
      : x >= 0.55
        ? Pn('the indicator changes from red to yellow', ['stays red', 'remains red', 'no change'], ['yellow', 'orange'])
        : x >= 0.2
          ? P('the indicator is turning orange', ['orange', 'slight', 'little'])
          : Pn('the indicator stays red', ['yellow', 'turns orange'], ['red', 'no change', 'unchanged', 'remain']);
  return { live: [changed(c.live)], ctrl: w.co2.ctrl ? [changed(c.ctrl)] : [] };
}

// ================================================================== TROPISM

export const TROP_DAYS_MAX = 5;
export const TROP_N = 10;
export const TROP_SLITS = ['LAMP', 'AWAY'] as const;
export const TROP_CTRLS = ['KLINO', 'UNIFORM'] as const;
export type TropCtrl = (typeof TROP_CTRLS)[number];
export const TROP_CTRL_LABEL: Record<TropCtrl, string> = { KLINO: 'On the rotating clinostat, in the one-sided light', UNIFORM: 'In uniform light (no box, light from all round)' };
export const TROP_SKETCHES = ['DOWN', 'STRAIGHT', 'UP'] as const;
export type TropSketch = (typeof TROP_SKETCHES)[number];
export const TROP_SKETCH_LABEL: Record<TropSketch, string> = { DOWN: 'Every radicle has turned to grow downwards', STRAIGHT: 'Each radicle grew straight on in the direction it was pinned', UP: 'Every radicle has turned to grow upwards' };
export const TROP_CLAIMS = ['POS_PHOTO', 'POS_GEO', 'KLINO', 'AUXIN', 'CTRL_STRAIGHT', 'NEG_PHOTO', 'HYDRO', 'AUXIN_LIT'] as const;
export type TropClaim = (typeof TROP_CLAIMS)[number];
export const TROP_CLAIM_LABEL: Record<TropClaim, string> = {
  POS_PHOTO: 'Shoots grow towards one-sided light: positive phototropism',
  POS_GEO: 'Radicles grow downwards, towards gravity: positive geotropism',
  KLINO: 'The clinostat’s slow rotation cancels the one-sided effect of the stimulus',
  AUXIN: 'Auxin collects on the shaded (or lower) side of the shoot and makes those cells elongate more',
  CTRL_STRAIGHT: 'The control shoots and radicles grew straight',
  NEG_PHOTO: 'Shoots bending towards the light show negative phototropism',
  HYDRO: 'The radicles grew down because they grow towards water',
  AUXIN_LIT: 'Auxin makes the cells on the lit side divide faster',
};
export const TROP_NEED: TropClaim[] = ['POS_PHOTO', 'POS_GEO', 'KLINO', 'AUXIN', 'CTRL_STRAIGHT'];
export const TROP_WRONG: TropClaim[] = ['NEG_PHOTO', 'HYDRO', 'AUXIN_LIT'];

export interface TropVariant {
  /** Shoot bend towards the light: θ = θmax (1 − e^(−(t − lag)/τ)) (degrees). */
  thMax: number;
  tau: number;
  lag: number;
  /** The control shoot's small wobble (degrees). */
  ctrlWobble: number;
  /** Radicles: time to turn down (days), the damaged ones (indices) and the initial directions (degrees from straight down). */
  geoT: number;
  damaged: number[];
  dirs: number[];
}
function pickTrop(seed: number): TropVariant {
  const r = labRandom(seed, 'bio-growth-trop');
  const nd = r() < 0.35 ? 0 : r() < 0.75 ? 1 : 2;
  const damaged: number[] = [];
  while (damaged.length < nd) {
    const i = Math.floor(r() * TROP_N);
    if (!damaged.includes(i)) damaged.push(i);
  }
  const off = Math.floor(r() * 36);
  return { thMax: labBetween(r, 62, 80, 1), tau: labBetween(r, 2.7, 3.6, 2), lag: labBetween(r, 0.25, 0.5, 2), ctrlWobble: labBetween(r, 0.5, 3, 1), geoT: labBetween(r, 0.5, 0.9, 2), damaged: damaged.sort((a, b) => a - b), dirs: Array.from({ length: TROP_N }, (_, i) => (i * 36 + off) % 360) };
}
export interface TropRow {
  day: number;
  test: string;
  ctrl: string;
}
export interface TropWork {
  /** Phototropism: the test pot in the light-proof box, the slit's direction, the gaps taped; the lamp on; where the control pot is. */
  box: boolean;
  slit: 'LAMP' | 'AWAY' | null;
  taped: boolean;
  lamp: boolean;
  ctrl: TropCtrl | null;
  /** Geotropism: seedlings pinned in different directions to the cork; the jar's cotton wool moist; a similar set on the clinostat. */
  pinned: boolean;
  moist: boolean;
  klinoSet: boolean;
  /** The clinostat's motor. */
  klinoOn: boolean;
  day: number;
  /** Days on which the pots and the cork were watered (day 0: set up moist). */
  waters: number[];
  /** Protractor readings: the test shoot or the control shoot, on a day. */
  measures: { day: number; pot: 'TEST' | 'CTRL' }[];
  rows: TropRow[];
  /** The day the radicles were looked at and counted (null: not yet). */
  countAt: number | null;
  down: string;
  total: string;
  pct: string;
  rate: string;
  sketchCork: TropSketch | null;
  sketchKlino: TropSketch | null;
  claims: TropClaim[];
}
const tropLastWater = (w: Pick<TropWork, 'waters'>, i: number) => Math.max(0, ...w.waters.filter((d) => d <= i + 1e-9));
export const tropMoist = (w: Pick<TropWork, 'waters'>, i: number) => i - tropLastWater(w, i) <= SEED_DRY_AFTER - 1e-9;
/** Effective growing time on day d (dry days barely count). */
export function tropAge(w: Pick<TropWork, 'waters'>, d: number): number {
  let t = 0;
  for (let i = 0; i < Math.floor(d + 1e-9); i++) t += tropMoist(w, i) ? 1 : 0.3;
  const frac = d - Math.floor(d + 1e-9);
  if (frac > 1e-9) t += frac * (tropMoist(w, Math.floor(d)) ? 1 : 0.3);
  return t;
}
/** How strongly the test pot's light is one-sided (1: a sealed box with the slit to the lamp). */
export function tropLightFactor(w: Pick<TropWork, 'box' | 'slit' | 'taped' | 'lamp'>): number {
  if (!w.box || !w.slit) return 0;
  const lamp = w.lamp ? 1 : 0.5;
  return (w.slit === 'LAMP' ? (w.taped ? 1 : 0.55) : 0.35) * lamp;
}
/** The true angle of the test shoot's bend towards the slit (degrees). */
export function tropTestAngle(v: TropVariant, w: Pick<TropWork, 'box' | 'slit' | 'taped' | 'lamp' | 'waters'>, d: number): number {
  const t = Math.max(0, tropAge(w, d) - v.lag);
  return v.thMax * tropLightFactor(w) * (1 - Math.exp(-t / v.tau));
}
/** The control shoot's angle: straight on a turning clinostat or in uniform light; a stopped clinostat in one-sided light bends it. */
export function tropCtrlAngle(v: TropVariant, w: Pick<TropWork, 'ctrl' | 'klinoOn' | 'lamp' | 'waters'>, d: number): number {
  if (!w.ctrl) return 0;
  const t = Math.max(0, tropAge(w, d) - v.lag);
  if (w.ctrl === 'KLINO' && !w.klinoOn) return v.thMax * (w.lamp ? 0.75 : 0.3) * (1 - Math.exp(-t / v.tau));
  return v.ctrlWobble * Math.min(1, t / 2);
}
/** What the protractor showed (degrees, to 1°). */
export function tropShown(v: TropVariant, w: TropWork, m: { day: number; pot: 'TEST' | 'CTRL' }, n: number, seed: number): number {
  const r = labRandom(seed, `bio-growth-trop-m-${n}`);
  const th = m.pot === 'TEST' ? tropTestAngle(v, w, m.day) : tropCtrlAngle(v, w, m.day);
  return Math.max(0, Math.round(th + 1.1 * norm(r)));
}
/** Radicles on the stationary cork growing downwards on day d (the damaged ones do not grow). */
export function tropDown(v: TropVariant, w: Pick<TropWork, 'pinned' | 'waters' | 'moist'>, d: number): number {
  if (!w.pinned) return 0;
  const t = tropAge(w, d) * (w.moist ? 1 : 0.35);
  return v.dirs.filter((_, i) => !v.damaged.includes(i) && t >= v.geoT).length;
}
/** Radicles on the clinostat set growing downwards (none while it turns; all the healthy ones if it is stopped). */
export function tropKlinoDown(v: TropVariant, w: Pick<TropWork, 'klinoSet' | 'klinoOn' | 'waters' | 'moist'>, d: number): number {
  if (!w.klinoSet || w.klinoOn) return 0;
  const t = tropAge(w, d) * (w.moist ? 1 : 0.35);
  return v.dirs.filter((_, i) => !v.damaged.includes(i) && t >= v.geoT).length;
}
/** How far (0 … 1) each pinned radicle has turned towards straight down on day d (the drawing). */
export function tropTurn(v: TropVariant, w: Pick<TropWork, 'waters' | 'moist'>, d: number): number {
  const t = tropAge(w, d) * (w.moist ? 1 : 0.35);
  return clamp(t / (v.geoT * 2.2), 0, 1);
}

// ================================================================== variant, state, spec

export interface BioGrowthVariant {
  seed: number;
  task: GrowthTask;
  germ: GermVariant;
  seedling: SeedlingVariant;
  resp: RespVariant;
  trop: TropVariant;
  drawing: BioDrawingStatement[];
  /** Label chips for the seedling drawing (the labels and two distractors), seeded order. */
  labelOptions: string[];
}

/** The hidden truth of one attempt (same on the web and the API). */
export function bioGrowthVariant(seed: number, task: GrowthTask): BioGrowthVariant {
  const r = labRandom(seed, 'bio-growth-labels');
  const opts = [...SEED_LABELS, ...SEED_DISTRACTORS];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [opts[i], opts[j]] = [opts[j]!, opts[i]!];
  }
  return { seed, task, germ: pickGerm(seed), seedling: pickSeedling(seed), resp: pickResp(seed), trop: pickTrop(seed), drawing: bioDrawingPick(seed, 'bio-growth'), labelOptions: opts };
}

export interface BioGrowthState {
  v: 1;
  task: GrowthTask | null;
  germ: GermWork;
  seedling: SeedlingWork;
  resp: RespWork;
  trop: TropWork;
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}

export function emptyBioGrowthState(): BioGrowthState {
  return {
    v: 1,
    task: null,
    germ: { batch: null, tubes: GERM_TUBES.map(() => emptyGermTube()), day: 0, looks: [], rows: GERM_TUBES.map(() => emptyGermRow()), claims: [] },
    seedling: { soaked: false, box: false, jar: false, day: 0, waters: [], measures: [], draws: [], rows: [], first: null, table: emptySeedTable(), rateCow: '', rateMaize: '', graph: false, curve: null, labels: [], drawing: [], claims: [] },
    resp: { soaked: false, boiled: false, disLive: false, disBoiled: false, A: emptyRespFlask(), B: emptyRespFlask(), clock: 0, startAt: null, reads: [], rows: [], co2: { ind: null, ctrl: false, at: null, look: null }, obsLive: '', obsCtrl: '', riseA: '', riseB: '', perDay: '', diff: '', eq: null, claims: [] },
    trop: { box: false, slit: null, taped: false, lamp: false, ctrl: null, pinned: false, moist: false, klinoSet: false, klinoOn: false, day: 0, waters: [], measures: [], rows: [], countAt: null, down: '', total: '', pct: '', rate: '', sketchCork: null, sketchKlino: null, claims: [] },
    written: { precautions: '', explain: '' },
    log: [],
  };
}

const short = z.string().max(40);
const clockN = (max: number) => z.number().min(0).max(max);
const flask = z.object({ seeds: z.enum(['LIVE', 'BOILED']).nullable(), fill: z.enum(RESP_FILLS).nullable(), thermo: z.boolean(), plug: z.enum(['COTTON', 'BUNG']).nullable(), inverted: z.boolean() });
const tableKind = z.object({ type: short, cot: short, part: short });
export const bioGrowthStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(GROWTH_TASKS).nullable(),
  germ: z.object({
    batch: z.enum(['SORTED', 'MIXED']).nullable(),
    tubes: z.array(z.object({ cotton: z.enum(['MOIST', 'DRY']).nullable(), water: z.enum(['BOILED', 'TAP']).nullable(), oil: z.boolean(), fridge: z.boolean(), seeds: z.number().int().min(0).max(GERM_MAX_SEEDS), label: z.boolean() })).length(GERM_TUBES.length),
    day: clockN(GERM_DAYS_MAX),
    looks: z.array(z.number().int().min(0).max(GERM_DAYS_MAX)).max(GERM_DAYS_MAX + 1),
    rows: z.array(z.object({ c: z.array(short).length(GERM_DAYS_MAX + 1), sown: short, germ: short, pct: short, missing: z.union([z.enum(GERM_MISSING), z.literal('')]) })).length(GERM_TUBES.length),
    claims: z.array(z.enum(GERM_CLAIMS)).max(GERM_CLAIMS.length),
  }),
  seedling: z.object({
    soaked: z.boolean(),
    box: z.boolean(),
    jar: z.boolean(),
    day: clockN(SEED_DAYS_MAX),
    waters: z.array(clockN(SEED_DAYS_MAX)).max(30),
    measures: z.array(z.object({ day: z.number().int().min(0).max(SEED_DAYS_MAX), kind: z.enum(SEED_KINDS), ref: z.enum(SEED_REFS) })).max(60),
    draws: z.array(z.number().int().min(0).max(SEED_DAYS_MAX)).max(12),
    rows: z.array(z.object({ day: z.number().int().min(0).max(SEED_DAYS_MAX), cow: short, maize: short })).max(SEED_DAYS_MAX + 1),
    first: z.enum(SEED_FIRSTS).nullable(),
    table: z.object({ COWPEA: tableKind, MAIZE: tableKind }),
    rateCow: short,
    rateMaize: short,
    graph: z.boolean(),
    curve: z.enum(SEED_CURVES).nullable(),
    labels: z.array(z.string().max(40)).max(SEED_LABELS.length),
    drawing: z.array(z.string().max(20)).max(20),
    claims: z.array(z.enum(SEED_CLAIMS)).max(SEED_CLAIMS.length),
  }),
  resp: z.object({
    soaked: z.boolean(),
    boiled: z.boolean(),
    disLive: z.boolean(),
    disBoiled: z.boolean(),
    A: flask,
    B: flask,
    clock: clockN(RESP_HOURS_MAX),
    startAt: clockN(RESP_HOURS_MAX).nullable(),
    reads: z.array(clockN(RESP_HOURS_MAX)).max(RESP_MAX_READS),
    rows: z.array(z.object({ a: short, b: short })).max(RESP_MAX_READS),
    co2: z.object({ ind: z.enum(RESP_INDICATORS).nullable(), ctrl: z.boolean(), at: clockN(RESP_HOURS_MAX).nullable(), look: clockN(RESP_HOURS_MAX).nullable() }),
    obsLive: z.string().max(600),
    obsCtrl: z.string().max(600),
    riseA: short,
    riseB: short,
    perDay: short,
    diff: short,
    eq: z.enum(RESP_EQUATIONS.map((e) => e.id) as [RespEquation, ...RespEquation[]]).nullable(),
    claims: z.array(z.enum(RESP_CLAIMS)).max(RESP_CLAIMS.length),
  }),
  trop: z.object({
    box: z.boolean(),
    slit: z.enum(TROP_SLITS).nullable(),
    taped: z.boolean(),
    lamp: z.boolean(),
    ctrl: z.enum(TROP_CTRLS).nullable(),
    pinned: z.boolean(),
    moist: z.boolean(),
    klinoSet: z.boolean(),
    klinoOn: z.boolean(),
    day: clockN(TROP_DAYS_MAX),
    waters: z.array(clockN(TROP_DAYS_MAX)).max(20),
    measures: z.array(z.object({ day: z.number().int().min(0).max(TROP_DAYS_MAX), pot: z.enum(['TEST', 'CTRL']) })).max(40),
    rows: z.array(z.object({ day: z.number().int().min(0).max(TROP_DAYS_MAX), test: short, ctrl: short })).max(TROP_DAYS_MAX + 1),
    countAt: clockN(TROP_DAYS_MAX).nullable(),
    down: short,
    total: short,
    pct: short,
    rate: short,
    sketchCork: z.enum(TROP_SKETCHES).nullable(),
    sketchKlino: z.enum(TROP_SKETCHES).nullable(),
    claims: z.array(z.enum(TROP_CLAIMS)).max(TROP_CLAIMS.length),
  }),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<BioGrowthState>;

export const BIO_GROWTH: SimulatorSpec = {
  id: 'bio-growth',
  subject: 'Biology',
  title: 'Germination, seed respiration and plant responses',
  topicNames: ['Germination of seeds', 'Cellular respiration', 'Irritability as a Basic Characteristic of Protoplasm', 'Plant growth', 'Tropisms'],
  minutes: 45,
  rubric: [
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide:
        'Germination: the control, dry, boiled-water-and-oil and refrigerator tubes (2); sorted seeds, the same number (10) in every tube (1); the tubes labelled and the final count after at least 4 days (1). Seedlings: soaked seeds in both the sawdust and the seed jar; the medium kept moist; both shoots measured on at least five days from day 2 or earlier to day 8 or later, from the same point each time; drawings at day 3 and day 7. Respiration: both batches rinsed in disinfectant; flask B of boiled seeds, the same amount as A; loose cotton-wool plugs and the flasks inverted; readings at the start and daily for three days. Tropisms: the box light-proof with its slit to the lamp; a control pot on the turning clinostat or in uniform light; seedlings pinned in different directions on a moist cork; a similar set on the turning clinostat.',
    },
    { id: 'readings', label: 'Readings', marks: 4, how: 'AUTO', guide: 'Germination: each day’s count of seeds with a radicle (3) and the number sown (1). Seedlings: each shoot length as the ruler showed it, to 1 mm (3), and that the radicle appeared first (1). Respiration: each thermometer reading as shown, to 0.5 °C (3), and the CO₂ test and its control as seen (1). Tropisms: each angle as the protractor showed it (3) and the radicles growing down (1).' },
    { id: 'presentation', label: 'Table, graph or drawing', marks: 3, how: 'AUTO', guide: 'Germination: % germination = germinated ÷ sown × 100 for each tube (2) and the condition missing from each (1). Seedlings: at least five points of length against time (1) joined by a smooth curve (0.5), the drawing labelled (1) and the drawing rules (0.5). Respiration: the rise in A (1) and in B (0.5), the mean rise per day (1) and the difference due to respiration (0.5). Tropisms: the mean rate of curvature (1), the % of radicles growing down (1) and the sketches of both sets (1).' },
    { id: 'results', label: 'Results and conclusions', marks: 5, how: 'AUTO', guide: 'Germination: what each experimental tube shows (water, oxygen, warmth) (3), the control (1) and the oil layer (1). Seedlings: the growth rates between day 4 and day 8 (1), the comparison table (3) and the conclusions (1). Respiration: heat, CO₂, the control and the disinfectant (4) and the word equation (1). Tropisms: positive phototropism, positive geotropism, the clinostat, auxin and the straight controls (5). Each wrong statement loses half a mark.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each). Germination: seeds of the same kind, size and age; the same number in each tube; all tubes but D at the same temperature; label the tubes; count only seeds with a radicle. Seedlings: keep the medium moist but not waterlogged; measure from the same point each day; handle seedlings gently. Respiration: disinfect both batches; equal quantities; loose cotton wool (not airtight); invert the flasks; read the thermometers at eye level. Tropisms: keep the seedlings moist; make the box light-proof except for the slit; a control in each experiment; pin the seedlings gently.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'Germination: water activates the enzymes and softens the testa; oxygen is needed for aerobic respiration to release energy; warmth for enzyme activity. Seedlings: in epigeal germination the hypocotyl elongates and lifts the cotyledons above the soil; in hypogeal germination the epicotyl elongates and the cotyledon/grain stays below. Respiration: living seeds respire aerobically, glucose + oxygen → carbon dioxide + water + energy, some energy being released as heat; boiled seeds are dead and do not respire. Tropisms: auxin collects on the shaded side of the shoot (the lower side of a horizontal root inhibits growth), so unequal growth bends it; the clinostat removes the one-sided stimulus.' },
  ],
};

// ================================================================== model answers (the worked solution, the demo and the tests)

/** Ideal germination records: each inspection day's count, sown, final, %, missing condition and the conclusions. */
export function germIdealRecords(v: BioGrowthVariant, s: BioGrowthState): BioGrowthState['germ'] {
  const w = s.germ;
  const fin = germFinalDay(w);
  const rows = w.tubes.map((t, k) => {
    const row = emptyGermRow();
    for (const d of w.looks) row.c[d] = String(germCount(v.germ, w, t, k, d));
    if (t.seeds) row.sown = String(t.seeds);
    if (fin !== null && t.seeds) {
      const g = germCount(v.germ, w, t, k, fin);
      row.germ = String(g);
      row.pct = String(roundDp((g / t.seeds) * 100, 1));
    }
    row.missing = GERM_KIND_MISSING[germKind(t)] ?? '';
    return row;
  });
  const kinds = w.tubes.map(germKind);
  const claims: GermClaim[] = [...(['DRY', 'NOOXY', 'COLD'] as GermKind[]).filter((k) => kinds.includes(k)).map((k) => GERM_KIND_CLAIM[k]!), ...(kinds.includes('CONTROL') ? (['CONTROL'] as GermClaim[]) : []), ...(w.tubes.some((t) => t.oil) ? (['OIL'] as GermClaim[]) : [])];
  return { ...w, rows, claims };
}
/** A model germination test: sorted seeds, the four tubes, 10 seeds each, labelled; counted every day to day 5. */
export function germModelState(v: BioGrowthVariant, days = 5): BioGrowthState {
  const s = emptyBioGrowthState();
  s.task = 'GERM';
  const w = s.germ;
  w.batch = 'SORTED';
  w.tubes = [
    { cotton: 'MOIST', water: null, oil: false, fridge: false, seeds: GERM_SOWN, label: true },
    { cotton: 'DRY', water: null, oil: false, fridge: false, seeds: GERM_SOWN, label: true },
    { cotton: null, water: 'BOILED', oil: true, fridge: false, seeds: GERM_SOWN, label: true },
    { cotton: 'MOIST', water: null, oil: false, fridge: true, seeds: GERM_SOWN, label: true },
  ];
  for (let d = 1; d <= days; d++) w.looks.push(d);
  w.day = days;
  s.germ = germIdealRecords(v, s);
  return s;
}

/** Ideal seedling records: the lengths as measured, the rates, the table, the graph, labels, drawing rules and claims. */
export function seedIdealRecords(v: BioGrowthVariant, s: BioGrowthState): BioGrowthState['seedling'] {
  const w = s.seedling;
  const days = [...new Set(w.measures.map((m) => m.day))].sort((a, b) => a - b);
  const shownAt = (kind: SeedKind, d: number) => {
    const n = w.measures.findIndex((m) => m.day === d && m.kind === kind);
    return n < 0 ? '' : String(seedMeasureShown(v.seedling, w, w.measures[n]!, n, v.seed));
  };
  const rows = days.map((d) => ({ day: d, cow: shownAt('COWPEA', d), maize: shownAt('MAIZE', d) }));
  const rate = (k: 'cow' | 'maize') => {
    const a = rows.find((r) => r.day === 4)?.[k];
    const b = rows.find((r) => r.day === 8)?.[k];
    return a && b ? String(roundDp((Number(b) - Number(a)) / 4, 2)) : '';
  };
  return { ...w, rows, rateCow: rate('cow'), rateMaize: rate('maize'), first: 'RADICLE', table: { COWPEA: { ...SEED_TABLE_TRUTH.COWPEA }, MAIZE: { ...SEED_TABLE_TRUTH.MAIZE } }, graph: true, curve: 'SMOOTH', labels: [...SEED_LABELS], drawing: v.drawing.filter((d) => d.good).map((d) => d.id), claims: [...SEED_NEED] };
}
/** A model seedling run: soaked, box and jar, watered and measured (both kinds, from the seed) every day to day 9, drawn at 3 and 7. */
export function seedModelState(v: BioGrowthVariant, last = 9): BioGrowthState {
  const s = emptyBioGrowthState();
  s.task = 'SEEDLING';
  const w = s.seedling;
  Object.assign(w, { soaked: true, box: true, jar: true, day: last });
  w.waters = Array.from({ length: last + 1 }, (_, d) => d);
  for (let d = 1; d <= last; d++) for (const kind of SEED_KINDS) w.measures.push({ day: d, kind, ref: 'SEED' });
  w.draws = [3, 7];
  s.seedling = seedIdealRecords(v, s);
  return s;
}

/** Ideal respiration records: both thermometers at each read, rises, the mean rise per day, the difference, the CO₂ observations and conclusions. */
export function respIdealRecords(v: BioGrowthVariant, s: BioGrowthState): BioGrowthState['resp'] {
  const w = s.resp;
  const rows = w.reads.map((at, n) => ({ a: respShown(v.resp, w, 'A', w.A, at, n, v.seed).toFixed(1), b: respShown(v.resp, w, 'B', w.B, at, n, v.seed).toFixed(1) }));
  const first = rows[0];
  const last = rows.at(-1);
  const days = w.reads.length > 1 ? (w.reads.at(-1)! - w.reads[0]!) / 24 : 0;
  const rA = first && last ? Number(last.a) - Number(first.a) : null;
  const rB = first && last ? Number(last.b) - Number(first.b) : null;
  const parts = respCo2Parts(v.resp, w);
  return {
    ...w,
    rows,
    riseA: rA === null ? '' : rA.toFixed(1),
    riseB: rB === null ? '' : rB.toFixed(1),
    perDay: rA !== null && days > 0 ? String(roundDp(rA / Math.round(days), 2)) : '',
    diff: rA !== null && rB !== null ? (rA - rB).toFixed(1) : '',
    obsLive: parts ? parts.live.map((p) => p.text).join('; ') : '',
    obsCtrl: parts ? parts.ctrl.map((p) => p.text).join('; ') : '',
    eq: 'AEROBIC',
    claims: [...RESP_NEED],
  };
}
/** A model respiration run: soaked, half boiled, both disinfected, full flasks, thermometers, cotton plugs, inverted; read at 0, 24, 48, 72 h; lime water with a control. */
export function respModelState(v: BioGrowthVariant, reads = [0, 24, 48, 72]): BioGrowthState {
  const s = emptyBioGrowthState();
  s.task = 'RESP';
  const w = s.resp;
  Object.assign(w, { soaked: true, boiled: true, disLive: true, disBoiled: true, startAt: 0 });
  w.A = { seeds: 'LIVE', fill: 'FULL', thermo: true, plug: 'COTTON', inverted: true };
  w.B = { seeds: 'BOILED', fill: 'FULL', thermo: true, plug: 'COTTON', inverted: true };
  w.co2 = { ind: 'LIME', ctrl: true, at: 0, look: 2 };
  w.reads = [...reads];
  w.clock = reads.at(-1) ?? 0;
  s.resp = respIdealRecords(v, s);
  return s;
}

/** Ideal tropism records: the angles as read, the rate, the radicle count and %, the sketches and conclusions. */
export function tropIdealRecords(v: BioGrowthVariant, s: BioGrowthState): BioGrowthState['trop'] {
  const w = s.trop;
  const days = [...new Set(w.measures.map((m) => m.day))].sort((a, b) => a - b);
  const shownAt = (pot: 'TEST' | 'CTRL', d: number) => {
    const n = w.measures.findIndex((m) => m.day === d && m.pot === pot);
    return n < 0 ? '' : String(tropShown(v.trop, w, w.measures[n]!, n, v.seed));
  };
  const rows = days.map((d) => ({ day: d, test: shownAt('TEST', d), ctrl: shownAt('CTRL', d) }));
  const lastT = [...rows].reverse().find((r) => r.test !== '' && r.day > 0);
  const down = w.countAt === null ? null : tropDown(v.trop, w, w.countAt);
  return {
    ...w,
    rows,
    rate: lastT ? String(roundDp(Number(lastT.test) / lastT.day, 1)) : '',
    down: down === null ? '' : String(down),
    total: w.pinned ? String(TROP_N) : '',
    pct: down === null ? '' : String(roundDp((down / TROP_N) * 100, 1)),
    sketchCork: 'DOWN',
    sketchKlino: w.klinoSet && w.klinoOn ? 'STRAIGHT' : 'DOWN',
    claims: [...TROP_NEED],
  };
}
/** A model tropism run: the sealed box with its slit to the lamp, the control on the turning clinostat, seedlings pinned on a moist cork and on the clinostat; measured daily to day 3; radicles counted on day 3. */
export function tropModelState(v: BioGrowthVariant, last = 3): BioGrowthState {
  const s = emptyBioGrowthState();
  s.task = 'TROPISM';
  const w = s.trop;
  Object.assign(w, { box: true, slit: 'LAMP', taped: true, lamp: true, ctrl: 'KLINO', pinned: true, moist: true, klinoSet: true, klinoOn: true, day: last, countAt: last });
  w.waters = Array.from({ length: last + 1 }, (_, d) => d);
  for (let d = 1; d <= last; d++) w.measures.push({ day: d, pot: 'TEST' }, { day: d, pot: 'CTRL' });
  s.trop = tropIdealRecords(v, s);
  return s;
}
