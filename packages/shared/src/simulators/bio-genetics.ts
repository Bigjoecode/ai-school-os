import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { labBetween, labRandom, roundDp } from './seeded';

/**
 * bio-genetics: variation, inheritance and feeding relationships from data.
 * The one source of truth for all four tasks: the web shows these readings
 * and the API marks against them.
 *
 * HEIGHT (pr-bio-morphological-variation): a class of seeded classmates (one
 * or two politely decline to be measured). Height against the measuring board
 * — shoes off, a set square flat on the head, read at eye level, to the
 * nearest cm — and the hand span with a ruler (fingers spread, to 0.5 cm).
 * Shoes add their heel; an eyeballed head reading is out by 1–2 cm. The
 * heights are grouped into equal classes (150–154 …), a histogram without
 * gaps, the mean (from mid-points or the raw values), the modal class and the
 * range: continuous, roughly normal variation.
 *
 * DISCRETE (pr-bio-physiological-variation): tongue rolling (some rollers only
 * manage it at the second or third attempt, so everyone who fails gets three)
 * and ABO blood groups read from the school health cards (with consent — no
 * blood is taken in class), recorded anonymously by number; tallies,
 * percentages, pie-chart angles, a bar chart with gaps; distinct groups.
 *
 * CROSS (pr-bio-monohybrid-probability): two beakers, each with 50 red (T) and
 * 50 white (t) beads, the gametes of two Tt parents. A bead from each, without
 * looking, returned and shaken: seeded chance gives TT : Tt : tt near 1 : 2 : 1
 * and tall : short near 3 : 1. Looking favours red; not returning the beads
 * changes the probabilities. Seven other groups' results make the class total,
 * closer to 3 : 1.
 *
 * FOOD (pr-bio-food-chains-pyramids): seven field spots on the school field
 * (grass plot, sweep net, old wall, trees, gutter, the sky, the pasture), each
 * with counts in the study area and the feeding seen there. Food chains from
 * observed links, the food web, trophic levels, a pyramid of numbers for grass
 * → grasshopper → lizard → hawk and a pyramid of energy from the data card,
 * both to a stated scale, and the transfer efficiency.
 */

export const GEN_TASKS = ['HEIGHT', 'DISCRETE', 'CROSS', 'FOOD'] as const;
export type GenTask = (typeof GEN_TASKS)[number];
/** The lessons that open this lab, and the task each one sets. */
export const GEN_PRACTICAL_TASKS: Record<string, GenTask> = { 'pr-bio-morphological-variation': 'HEIGHT', 'pr-bio-physiological-variation': 'DISCRETE', 'pr-bio-monohybrid-probability': 'CROSS', 'pr-bio-food-chains-pyramids': 'FOOD' };
export const GEN_TASK_TITLE: Record<GenTask, string> = { HEIGHT: 'Continuous variation: height and hand span', DISCRETE: 'Discontinuous variation: tongue rolling and blood groups', CROSS: 'A model monohybrid cross with beads', FOOD: 'Food chains, food webs and ecological pyramids' };
/** Most classmates a class can have (rows in the record sheet). */
export const GEN_MAX_N = 48;

const norm = (r: () => number) => (r() + r() + r() + r() - 2) * 1.732;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** A classmate's stylised look (skin tone, hair, build) for the 3D figures. */
export interface ClassmateLook {
  tone: number;
  hair: number;
  girl: boolean;
}
function pickLooks(seed: number, n: number, salt: string): ClassmateLook[] {
  const r = labRandom(seed, salt);
  return Array.from({ length: n }, () => ({ tone: Math.floor(r() * 4), hair: Math.floor(r() * 3), girl: r() < 0.5 }));
}

// ================================================================== HEIGHT

export interface HeightPerson {
  /** True height (cm) and hand span (cm), the heel of the shoes (cm). */
  h: number;
  span: number;
  shoe: number;
  /** Would rather not be measured (respected). */
  declines: boolean;
}
export interface HeightVariant {
  n: number;
  people: HeightPerson[];
  looks: ClassmateLook[];
}
function pickHeight(seed: number): HeightVariant {
  const r = labRandom(seed, 'bio-genetics-height');
  const n = Math.floor(labBetween(r, 30, 34.99, 2));
  const m = labBetween(r, 158, 166, 1);
  const sd = labBetween(r, 5, 6.5, 2);
  const people: HeightPerson[] = Array.from({ length: n }, () => {
    const h = roundDp(clamp(m + norm(r) * sd, 149, 180), 1);
    return { h, span: roundDp(clamp(19.6 + (h - m) * 0.09 + norm(r) * 0.9, 16, 24), 1), shoe: labBetween(r, 2, 3.5, 1), declines: false };
  });
  const dec = r() < 0.5 ? 1 : 2;
  for (let k = 0; k < dec; k++) people[Math.min(n - 1, 3 + Math.floor(r() * (n - 4)))]!.declines = true;
  return { n, people, looks: pickLooks(seed, n, 'bio-genetics-height-looks') };
}

export const HEIGHT_SCHEMES = ['W5', 'W10', 'UNEQUAL'] as const;
export type HeightScheme = (typeof HEIGHT_SCHEMES)[number];
export const HEIGHT_SCHEME_LABEL: Record<HeightScheme, string> = { W5: 'Equal classes 5 cm wide (145–149, 150–154 …)', W10: 'Equal classes 10 cm wide (140–149, 150–159 …)', UNEQUAL: 'Classes 145–154, 155–159, 160–164, 165–169, 170–189' };
export function heightClasses(s: HeightScheme | null): [number, number][] {
  if (s === 'W5') return Array.from({ length: 9 }, (_, k) => [145 + 5 * k, 149 + 5 * k]);
  if (s === 'W10') return Array.from({ length: 5 }, (_, k) => [140 + 10 * k, 149 + 10 * k]);
  if (s === 'UNEQUAL') return [[145, 154], [155, 159], [160, 164], [165, 169], [170, 189]];
  return [];
}
export const classLabel = (c: [number, number]) => `${c[0]}–${c[1]}`;
export const classMid = (c: [number, number]) => (c[0] + c[1]) / 2;
export const HEIGHT_CHARTS = ['HISTOGRAM', 'BAR'] as const;
export type HeightChart = (typeof HEIGHT_CHARTS)[number];
export const HEIGHT_CHART_LABEL: Record<HeightChart, string> = { HISTOGRAM: 'A histogram: bars touching, no gaps', BAR: 'A bar chart with gaps between the bars' };
export const HEIGHT_CLAIMS = ['CONT', 'NORMAL', 'GENES_ENV', 'DISCONT', 'GAPS', 'ONE_GENE'] as const;
export type HeightClaim = (typeof HEIGHT_CLAIMS)[number];
export const HEIGHT_CLAIM_LABEL: Record<HeightClaim, string> = {
  CONT: 'Height shows continuous variation: a full range of values with intermediates',
  NORMAL: 'Most students are near the middle and fewer at the extremes: a bell-shaped (normal) distribution',
  GENES_ENV: 'Height is controlled by many genes and is also affected by the environment (diet, health)',
  DISCONT: 'Height shows discontinuous variation',
  GAPS: 'The histogram should have gaps between the bars',
  ONE_GENE: 'Height is controlled by a single gene with no effect of the environment',
};
export const HEIGHT_NEED: HeightClaim[] = ['CONT', 'NORMAL'];
export const HEIGHT_WRONG: HeightClaim[] = ['DISCONT', 'GAPS', 'ONE_GENE'];
export const HEIGHT_MAX_MEASURES = 150;

export interface HeightMeasure {
  who: number;
  /** H: height against the board; S: hand span with the ruler. */
  kind: 'H' | 'S';
  shoes: boolean;
  /** A set square flat on the head, read at eye level. */
  square: boolean;
  /** Fingers spread fully for the span. */
  spread: boolean;
}
export interface HeightRow {
  h: string;
  s: string;
}
export interface HeightWork {
  /** The classmate called up to the board. */
  at: number;
  /** How the measurer is working now (each measurement records them). */
  shoesOff: boolean;
  square: boolean;
  spread: boolean;
  measures: HeightMeasure[];
  /** One row per classmate (by number, anonymous). */
  rows: HeightRow[];
  scheme: HeightScheme | null;
  freq: string[];
  total: string;
  chart: HeightChart | null;
  mean: string;
  modal: number | null;
  range: string;
  spanMean: string;
  spanRange: string;
  claims: HeightClaim[];
}
/** What the board or the ruler showed for measurement n (cm; heights to 1 cm, spans to 0.5 cm). */
export function heightShown(v: HeightVariant, m: HeightMeasure, n: number, seed: number): number {
  const p = v.people[m.who]!;
  const r = labRandom(seed, `bio-genetics-h-${n}`);
  if (m.kind === 'H') {
    let x = p.h + (m.shoes ? p.shoe : 0);
    x += m.square ? (r() - 0.5) * 0.7 : (r() < 0.5 ? -1 : 1) * (0.9 + r() * 1.6);
    return Math.round(x);
  }
  const x = p.span + (r() - 0.5) * 0.5 - (m.spread ? 0 : 1 + r() * 1.2);
  return Math.round(x * 2) / 2;
}
export interface HeightSeen {
  who: number;
  h: number | null;
  hm: HeightMeasure | null;
  s: number | null;
  sm: HeightMeasure | null;
}
/** Each classmate's latest height and span readings. */
export function heightSeen(v: HeightVariant, w: Pick<HeightWork, 'measures'>, seed: number): HeightSeen[] {
  const out: HeightSeen[] = Array.from({ length: v.n }, (_, who) => ({ who, h: null, hm: null, s: null, sm: null }));
  w.measures.forEach((m, n) => {
    const e = out[m.who];
    if (!e) return;
    if (m.kind === 'H') [e.h, e.hm] = [heightShown(v, m, n, seed), m];
    else [e.s, e.sm] = [heightShown(v, m, n, seed), m];
  });
  return out;
}
/** Frequencies of a set of heights in a scheme's classes. */
export function heightFreq(hs: number[], s: HeightScheme | null): number[] {
  return heightClasses(s).map((c) => hs.filter((h) => h >= c[0] - 0.5 && h < c[1] + 0.5).length);
}
/** The mean from class mid-points. */
export function heightMidMean(freq: number[], s: HeightScheme | null): number | null {
  const cs = heightClasses(s);
  const n = freq.reduce((a, b) => a + b, 0);
  return n ? freq.reduce((a, f, k) => a + f * classMid(cs[k]!), 0) / n : null;
}

// ================================================================== DISCRETE

export const DISC_GROUPS = ['A', 'B', 'AB', 'O'] as const;
export type DiscGroup = (typeof DISC_GROUPS)[number];
/** Attempts every classmate who cannot roll at first should be given. */
export const DISC_TRIES = 3;
export const DISC_MAX_TRIES = 5;
export interface DiscPerson {
  roller: boolean;
  /** The attempt at which a roller first manages it. */
  needs: number;
  group: DiscGroup;
}
export interface DiscVariant {
  n: number;
  people: DiscPerson[];
  looks: ClassmateLook[];
}
function pickDisc(seed: number): DiscVariant {
  const r = labRandom(seed, 'bio-genetics-disc');
  const n = Math.floor(labBetween(r, 36, 44.99, 2));
  const pr = labBetween(r, 0.55, 0.75, 2);
  const pO = labBetween(r, 0.44, 0.56, 2);
  const pA = labBetween(r, 0.18, 0.25, 2);
  const pB = labBetween(r, 0.18, 0.25, 2);
  const pAB = labBetween(r, 0.03, 0.07, 3);
  const k0 = (1 - pAB) / (pO + pA + pB);
  const people = Array.from({ length: n }, (): DiscPerson => {
    const roller = r() < pr;
    const k = r();
    const g = r();
    return { roller, needs: k < 0.72 ? 1 : k < 0.92 ? 2 : 3, group: g < pO * k0 ? 'O' : g < (pO + pA) * k0 ? 'A' : g < (pO + pA + pB) * k0 ? 'B' : 'AB' };
  });
  // At least one roller who needs more than one attempt, and at least one AB (it happens in most classes).
  if (!people.some((p) => p.roller && p.needs > 1)) {
    const k = people.findIndex((p) => p.roller);
    if (k >= 0) people[k]!.needs = 2;
  }
  if (!people.some((p) => p.group === 'AB')) people[n - 2]!.group = 'AB';
  return { n, people, looks: pickLooks(seed, n, 'bio-genetics-disc-looks') };
}
export const DISC_CHARTS = ['PIE', 'BAR', 'HISTOGRAM'] as const;
export type DiscChart = (typeof DISC_CHARTS)[number];
export const DISC_CHART_LABEL: Record<DiscChart, string> = { PIE: 'A pie chart', BAR: 'A bar chart with gaps between the bars', HISTOGRAM: 'A histogram with no gaps' };
export const DISC_RECORD = ['NUMBER', 'NAME'] as const;
export type DiscRecord = (typeof DISC_RECORD)[number];
export const DISC_RECORD_LABEL: Record<DiscRecord, string> = { NUMBER: 'By number only (anonymous)', NAME: 'By name' };
export const DISC_CLAIMS = ['GROUPS', 'FEW_GENES', 'CONTRAST', 'CONT_BLOOD', 'CHANGE', 'HIST'] as const;
export type DiscClaim = (typeof DISC_CLAIMS)[number];
export const DISC_CLAIM_LABEL: Record<DiscClaim, string> = {
  GROUPS: 'Each character falls into distinct groups with no intermediates: discontinuous variation',
  FEW_GENES: 'They are controlled by one or a few genes and are little affected by the environment',
  CONTRAST: 'Unlike height, they cannot be measured on a continuous scale',
  CONT_BLOOD: 'Blood group shows continuous variation',
  CHANGE: 'A non-roller can become a roller by eating a better diet',
  HIST: 'Discontinuous data should be drawn as a histogram without gaps',
};
export const DISC_NEED: DiscClaim[] = ['GROUPS', 'FEW_GENES', 'CONTRAST'];
export const DISC_WRONG: DiscClaim[] = ['CONT_BLOOD', 'CHANGE', 'HIST'];
export interface DiscRow {
  roll: '' | 'R' | 'N';
  group: '' | DiscGroup;
}
export interface DiscTotals {
  r: string;
  n: string;
  pr: string;
  pn: string;
  ar: string;
  an: string;
}
export interface DiscWork {
  at: number;
  /** Tongue-rolling attempts per classmate. */
  tries: number[];
  /** Health cards read (per classmate). */
  cards: boolean[];
  recordBy: DiscRecord | null;
  rows: DiscRow[];
  tot: DiscTotals;
  grp: Record<DiscGroup, string>;
  gpct: Record<DiscGroup, string>;
  chartT: DiscChart | null;
  chartB: DiscChart | null;
  most: DiscGroup | null;
  claims: DiscClaim[];
}
/** What attempt k (1-based) of classmate i showed. */
export const discAttempt = (v: DiscVariant, i: number, k: number) => !!v.people[i]?.roller && v.people[i]!.needs <= k;
/** Classmate i's tongue rolling as seen after their attempts (null: not asked). */
export function discRoll(v: DiscVariant, w: Pick<DiscWork, 'tries'>, i: number): 'R' | 'N' | null {
  const t = w.tries[i] ?? 0;
  if (!t) return null;
  return discAttempt(v, i, t) ? 'R' : 'N';
}

// ================================================================== CROSS

export const CROSS_N = 100;
export const CROSS_BATCH = 10;
export const CROSS_MAX = 200;
export const CROSS_GROUPS = 7;
/** How much looking favours the red beads. */
export const CROSS_PEEK = 1.7;
export const CROSS_FILLS = ['EQUAL', 'SEPARATE', 'TEST'] as const;
export type CrossFill = (typeof CROSS_FILLS)[number];
export const CROSS_FILL_LABEL: Record<CrossFill, string> = { EQUAL: '50 red and 50 white beads in each beaker (two Tt parents)', SEPARATE: '100 red beads in one beaker and 100 white in the other', TEST: '50 red + 50 white in one beaker, 100 white in the other (Tt × tt)' };
export type BeadGenotype = 'TT' | 'Tt' | 'tt';
export const BEAD_GENOTYPES: BeadGenotype[] = ['TT', 'Tt', 'tt'];
export const CROSS_CLAIMS = ['CHANCE', 'LARGER', 'REPLACE', 'GENO31', 'EXACT', 'GAMETE2'] as const;
export type CrossClaim = (typeof CROSS_CLAIMS)[number];
export const CROSS_CLAIM_LABEL: Record<CrossClaim, string> = {
  CHANCE: 'My ratio is not exactly 3 : 1 because which beads are drawn is a matter of chance',
  LARGER: 'The larger class sample is closer to the expected 3 : 1',
  REPLACE: 'Returning the beads keeps the chance of drawing T or t at 1/2 each time',
  GENO31: 'The genotypes TT : Tt : tt are in the ratio 3 : 1',
  EXACT: 'A careful experiment always gives exactly 3 : 1',
  GAMETE2: 'Each bead (gamete) carries two alleles',
};
export const CROSS_NEED: CrossClaim[] = ['CHANCE', 'LARGER', 'REPLACE'];
export const CROSS_WRONG: CrossClaim[] = ['GENO31', 'EXACT', 'GAMETE2'];
export const CROSS_CLOSER = ['OWN', 'CLASS'] as const;
export type CrossCloser = (typeof CROSS_CLOSER)[number];
export interface CrossVariant {
  /** The seven other groups' results (100 draws each). */
  groups: Record<BeadGenotype, number>[];
}
function pickCross(seed: number): CrossVariant {
  const r = labRandom(seed, 'bio-genetics-cross');
  return {
    groups: Array.from({ length: CROSS_GROUPS }, () => {
      const g: Record<BeadGenotype, number> = { TT: 0, Tt: 0, tt: 0 };
      for (let k = 0; k < CROSS_N; k++) {
        const a = r() < 0.5;
        const b = r() < 0.5;
        g[a && b ? 'TT' : a || b ? 'Tt' : 'tt']++;
      }
      return g;
    }),
  };
}
export interface CrossDraw {
  /** Without looking. */
  blind: boolean;
  /** Both beads returned and the beakers shaken. */
  back: boolean;
}
export interface CrossRow {
  TT: string;
  Tt: string;
  tt: string;
}
export interface CrossWork {
  fill: CrossFill | null;
  /** How the next draws are made. */
  blind: boolean;
  back: boolean;
  draws: CrossDraw[];
  /** One tally row per 10 draws. */
  rows: CrossRow[];
  tot: CrossRow;
  dom: string;
  rec: string;
  ratio: string;
  expDom: string;
  expRec: string;
  ptt: string;
  clsDom: string;
  clsRec: string;
  clsRatio: string;
  closer: CrossCloser | null;
  claims: CrossClaim[];
}
/** The beads of each draw (true: red, T) — the beakers emptied as the beads are kept out. */
export function crossPairs(w: Pick<CrossWork, 'fill' | 'draws'>, seed: number): { a: boolean; b: boolean; g: BeadGenotype }[] {
  if (!w.fill) return [];
  const bk = w.fill === 'EQUAL' ? [{ R: 50, W: 50 }, { R: 50, W: 50 }] : w.fill === 'SEPARATE' ? [{ R: 100, W: 0 }, { R: 0, W: 100 }] : [{ R: 50, W: 50 }, { R: 0, W: 100 }];
  const out: { a: boolean; b: boolean; g: BeadGenotype }[] = [];
  w.draws.forEach((d, n) => {
    const r = labRandom(seed, `bio-genetics-x-${n}`);
    const pick = (x: { R: number; W: number }) => {
      if (x.R + x.W <= 0) return null;
      let p = x.R / (x.R + x.W);
      if (!d.blind && p > 0 && p < 1) p = (p * CROSS_PEEK) / (p * CROSS_PEEK + 1 - p);
      const red = r() < p;
      if (!d.back) red ? x.R-- : x.W--;
      return red;
    };
    const a = pick(bk[0]!);
    const b = pick(bk[1]!);
    if (a === null || b === null) return;
    out.push({ a, b, g: a && b ? 'TT' : a || b ? 'Tt' : 'tt' });
  });
  return out;
}
/** The counts of each batch of 10 draws. */
export function crossBatches(pairs: { g: BeadGenotype }[]): Record<BeadGenotype, number>[] {
  const out: Record<BeadGenotype, number>[] = [];
  pairs.forEach((p, n) => {
    const k = Math.floor(n / CROSS_BATCH);
    out[k] ??= { TT: 0, Tt: 0, tt: 0 };
    out[k]![p.g]++;
  });
  return out;
}

// ================================================================== FOOD

export const FOOD_ORGS = ['GRASS', 'GRASSHOPPER', 'CATERPILLAR', 'GOAT', 'LIZARD', 'BIRD', 'TOAD', 'HAWK', 'MAN'] as const;
export type FoodOrg = (typeof FOOD_ORGS)[number];
export const FOOD_ORG_LABEL: Record<FoodOrg, string> = { GRASS: 'Grass', GRASSHOPPER: 'Grasshopper', CATERPILLAR: 'Caterpillar', GOAT: 'Goat', LIZARD: 'Lizard (agama)', BIRD: 'Weaver bird', TOAD: 'Toad', HAWK: 'Hawk', MAN: 'Man' };
export const FOOD_LEVELS = ['P', 'C1', 'C2', 'C3'] as const;
export type FoodLevel = (typeof FOOD_LEVELS)[number];
export const FOOD_LEVEL_LABEL: Record<FoodLevel, string> = { P: 'Producer', C1: 'Primary consumer', C2: 'Secondary consumer', C3: 'Tertiary consumer' };
export const FOOD_TRUE_LEVEL: Record<FoodOrg, FoodLevel> = { GRASS: 'P', GRASSHOPPER: 'C1', CATERPILLAR: 'C1', GOAT: 'C1', LIZARD: 'C2', BIRD: 'C2', TOAD: 'C2', MAN: 'C2', HAWK: 'C3' };
/** Feeding relationships "food>feeder" (the arrow points from the eaten to the eater). */
export const FOOD_LINKS = ['GRASS>GRASSHOPPER', 'GRASS>CATERPILLAR', 'GRASS>GOAT', 'GRASSHOPPER>LIZARD', 'GRASSHOPPER>BIRD', 'GRASSHOPPER>TOAD', 'CATERPILLAR>BIRD', 'CATERPILLAR>TOAD', 'LIZARD>HAWK', 'BIRD>HAWK', 'TOAD>HAWK', 'GOAT>MAN'] as const;
export const foodLink = (food: FoodOrg, feeder: FoodOrg) => `${food}>${feeder}`;
export const FOOD_SPOTS = ['PLOT', 'SWEEP', 'WALL', 'TREES', 'GUTTER', 'SKY', 'PASTURE'] as const;
export type FoodSpot = (typeof FOOD_SPOTS)[number];
export const FOOD_SPOT_LABEL: Record<FoodSpot, string> = { PLOT: 'Grass plot (quadrats)', SWEEP: 'Sweep-net catches', WALL: 'Old wall and rocks', TREES: 'Trees by the fence', GUTTER: 'Gutter and pond edge', SKY: 'Over the field', PASTURE: 'Pasture behind the school' };
/** What each spot shows: the organisms counted and the feeding seen. */
export const FOOD_SPOT_SHOWS: Record<FoodSpot, { count: FoodOrg[]; links: string[]; notes: string[] }> = {
  PLOT: { count: ['GRASS'], links: ['GRASS>GRASSHOPPER', 'GRASS>CATERPILLAR'], notes: ['Grasshoppers chewing grass blades.', 'Caterpillars eating grass leaves.'] },
  SWEEP: { count: ['GRASSHOPPER', 'CATERPILLAR'], links: ['GRASS>GRASSHOPPER'], notes: ['A grasshopper in the net still chewing a grass blade.'] },
  WALL: { count: ['LIZARD'], links: ['GRASSHOPPER>LIZARD'], notes: ['An agama lizard darts out and catches a grasshopper.'] },
  TREES: { count: ['BIRD'], links: ['CATERPILLAR>BIRD', 'GRASSHOPPER>BIRD'], notes: ['Weaver birds feeding caterpillars to their young.', 'A weaver bird pecking a grasshopper.'] },
  GUTTER: { count: ['TOAD'], links: ['GRASSHOPPER>TOAD', 'CATERPILLAR>TOAD'], notes: ['A toad flicks its tongue at a grasshopper.', 'A toad swallowing a caterpillar.'] },
  SKY: { count: ['HAWK'], links: ['LIZARD>HAWK', 'BIRD>HAWK', 'TOAD>HAWK'], notes: ['A hawk swoops on a lizard on the wall.', 'The hawk takes a weaver bird; later it seizes a toad by the gutter.'] },
  PASTURE: { count: ['GOAT', 'MAN'], links: ['GRASS>GOAT', 'GOAT>MAN'], notes: ['Goats grazing on the grass.', 'The herder’s family eats goat meat (they told us).'] },
};
export const FOOD_CHAIN_MAIN: FoodOrg[] = ['GRASS', 'GRASSHOPPER', 'LIZARD', 'HAWK'];
export const FOOD_MIN_CHAINS = 3;
export const FOOD_MAX_CHAINS = 6;
export const FOOD_ARROWS = ['EATEN_EATER', 'EATER_EATEN'] as const;
export type FoodArrow = (typeof FOOD_ARROWS)[number];
export const FOOD_ARROW_LABEL: Record<FoodArrow, string> = { EATEN_EATER: 'From the eaten to the eater (grass → grasshopper)', EATER_EATEN: 'From the eater to the eaten (grasshopper → grass)' };
export const FOOD_INVERT = ['NUMBERS', 'ENERGY'] as const;
export type FoodInvert = (typeof FOOD_INVERT)[number];
export const FOOD_INVERT_LABEL: Record<FoodInvert, string> = { NUMBERS: 'The pyramid of numbers (e.g. one mango tree feeding thousands of insects)', ENERGY: 'The pyramid of energy' };
export const FOOD_CLAIMS = ['FLOW', 'DECREASE', 'LOSS', 'SUN', 'PREDPREY', 'ENERGY_INV'] as const;
export type FoodClaim = (typeof FOOD_CLAIMS)[number];
export const FOOD_CLAIM_LABEL: Record<FoodClaim, string> = {
  FLOW: 'The arrows show energy flowing from the eaten to the eater',
  DECREASE: 'The numbers and the energy decrease at each higher trophic level',
  LOSS: 'Energy is lost at each level in respiration (heat), excretion and uneaten parts',
  SUN: 'A food chain starts with the sun',
  PREDPREY: 'The arrows point from the predator to its prey',
  ENERGY_INV: 'A pyramid of energy can be inverted',
};
export const FOOD_NEED: FoodClaim[] = ['FLOW', 'DECREASE', 'LOSS'];
export const FOOD_WRONG: FoodClaim[] = ['SUN', 'PREDPREY', 'ENERGY_INV'];
export interface FoodVariant {
  /** Counts in the study area. */
  counts: Record<FoodOrg, number>;
  /** The data card: energy at each trophic level (kJ/m²/year). */
  energy: Record<FoodLevel, number>;
}
function pickFood(seed: number): FoodVariant {
  const r = labRandom(seed, 'bio-genetics-food');
  const P = Math.round(labBetween(r, 15, 25, 2)) * 1000;
  const C1 = Math.round((P * labBetween(r, 0.08, 0.12, 3)) / 100) * 100;
  const C2 = Math.round((C1 * labBetween(r, 0.08, 0.12, 3)) / 10) * 10;
  const C3 = Math.max(1, Math.round(C2 * labBetween(r, 0.08, 0.12, 3)));
  return {
    counts: { GRASS: Math.round(labBetween(r, 24, 48, 1)) * 50, GRASSHOPPER: Math.round(labBetween(r, 80, 160, 1)), CATERPILLAR: Math.round(labBetween(r, 30, 80, 1)), GOAT: Math.round(labBetween(r, 3, 6, 1)), LIZARD: Math.round(labBetween(r, 4, 9, 1)), BIRD: Math.round(labBetween(r, 3, 8, 1)), TOAD: Math.round(labBetween(r, 3, 7, 1)), HAWK: 1, MAN: 1 },
    energy: { P, C1, C2, C3 },
  };
}
export type FoodWidths = Record<FoodLevel, string>;
export interface FoodWork {
  /** Covered shoes and gloves on before collecting. */
  gloves: boolean;
  /** Spots surveyed, in order; `glovedAt`: how many spots were surveyed before the gloves went on. */
  visited: FoodSpot[];
  glovedAt: number;
  counts: Record<FoodOrg, string>;
  /** The food web: links drawn "food>feeder". */
  links: string[];
  arrow: FoodArrow | null;
  chains: FoodOrg[][];
  levels: Record<FoodOrg, '' | FoodLevel>;
  scaleN: string;
  widthN: FoodWidths;
  scaleE: string;
  widthE: FoodWidths;
  eff: string;
  invert: FoodInvert | null;
  claims: FoodClaim[];
}
/** The links the student has seen (from the spots surveyed). */
export const foodSeenLinks = (w: Pick<FoodWork, 'visited'>) => [...new Set(w.visited.flatMap((s) => FOOD_SPOT_SHOWS[s].links))];
export const foodSeenOrgs = (w: Pick<FoodWork, 'visited'>) => FOOD_ORGS.filter((o) => w.visited.some((s) => FOOD_SPOT_SHOWS[s].count.includes(o)));
/** A chain is valid when it starts with the producer, has at least three organisms and every link is a feeding relationship you saw. */
export function foodChainOk(chain: FoodOrg[], seen: string[]): boolean {
  if (chain.length < 3 || chain[0] !== 'GRASS') return false;
  for (let k = 1; k < chain.length; k++) if (!seen.includes(foodLink(chain[k - 1]!, chain[k]!))) return false;
  return new Set(chain).size === chain.length;
}

// ================================================================== variant, state, spec

export interface BioGeneticsVariant {
  seed: number;
  task: GenTask;
  height: HeightVariant;
  disc: DiscVariant;
  cross: CrossVariant;
  food: FoodVariant;
}
/** The hidden truth of one attempt (same on the web and the API). */
export function bioGeneticsVariant(seed: number, task: GenTask): BioGeneticsVariant {
  return { seed, task, height: pickHeight(seed), disc: pickDisc(seed), cross: pickCross(seed), food: pickFood(seed) };
}

export interface BioGeneticsState {
  v: 1;
  task: GenTask | null;
  height: HeightWork;
  disc: DiscWork;
  cross: CrossWork;
  food: FoodWork;
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}
const blankGroups = (): Record<DiscGroup, string> => ({ A: '', B: '', AB: '', O: '' });
const blankWidths = (): FoodWidths => ({ P: '', C1: '', C2: '', C3: '' });
export const emptyCrossRow = (): CrossRow => ({ TT: '', Tt: '', tt: '' });
export function emptyBioGeneticsState(): BioGeneticsState {
  return {
    v: 1,
    task: null,
    height: { at: 0, shoesOff: false, square: false, spread: false, measures: [], rows: [], scheme: null, freq: [], total: '', chart: null, mean: '', modal: null, range: '', spanMean: '', spanRange: '', claims: [] },
    disc: { at: 0, tries: [], cards: [], recordBy: null, rows: [], tot: { r: '', n: '', pr: '', pn: '', ar: '', an: '' }, grp: blankGroups(), gpct: blankGroups(), chartT: null, chartB: null, most: null, claims: [] },
    cross: { fill: null, blind: false, back: false, draws: [], rows: [], tot: emptyCrossRow(), dom: '', rec: '', ratio: '', expDom: '', expRec: '', ptt: '', clsDom: '', clsRec: '', clsRatio: '', closer: null, claims: [] },
    food: { gloves: false, visited: [], glovedAt: 0, counts: Object.fromEntries(FOOD_ORGS.map((o) => [o, ''])) as Record<FoodOrg, string>, links: [], arrow: null, chains: [], levels: Object.fromEntries(FOOD_ORGS.map((o) => [o, ''])) as Record<FoodOrg, ''>, scaleN: '', widthN: blankWidths(), scaleE: '', widthE: blankWidths(), eff: '', invert: null, claims: [] },
    written: { precautions: '', explain: '' },
    log: [],
  };
}

const short = z.string().max(40);
const idx = z.number().int().min(0).max(GEN_MAX_N - 1);
const grpSchema = z.object({ A: short, B: short, AB: short, O: short });
const widthSchema = z.object({ P: short, C1: short, C2: short, C3: short });
const orgRecord = <T extends z.ZodTypeAny>(t: T) => z.object(Object.fromEntries(FOOD_ORGS.map((o) => [o, t])) as Record<FoodOrg, T>);
const crossRow = z.object({ TT: short, Tt: short, tt: short });
export const bioGeneticsStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(GEN_TASKS).nullable(),
  height: z.object({
    at: idx,
    shoesOff: z.boolean(),
    square: z.boolean(),
    spread: z.boolean(),
    measures: z.array(z.object({ who: idx, kind: z.enum(['H', 'S']), shoes: z.boolean(), square: z.boolean(), spread: z.boolean() })).max(HEIGHT_MAX_MEASURES),
    rows: z.array(z.object({ h: short, s: short })).max(GEN_MAX_N),
    scheme: z.enum(HEIGHT_SCHEMES).nullable(),
    freq: z.array(short).max(12),
    total: short,
    chart: z.enum(HEIGHT_CHARTS).nullable(),
    mean: short,
    modal: z.number().int().min(0).max(11).nullable(),
    range: short,
    spanMean: short,
    spanRange: short,
    claims: z.array(z.enum(HEIGHT_CLAIMS)).max(HEIGHT_CLAIMS.length),
  }),
  disc: z.object({
    at: idx,
    tries: z.array(z.number().int().min(0).max(DISC_MAX_TRIES)).max(GEN_MAX_N),
    cards: z.array(z.boolean()).max(GEN_MAX_N),
    recordBy: z.enum(DISC_RECORD).nullable(),
    rows: z.array(z.object({ roll: z.enum(['', 'R', 'N']), group: z.enum(['', ...DISC_GROUPS] as const) })).max(GEN_MAX_N),
    tot: z.object({ r: short, n: short, pr: short, pn: short, ar: short, an: short }),
    grp: grpSchema,
    gpct: grpSchema,
    chartT: z.enum(DISC_CHARTS).nullable(),
    chartB: z.enum(DISC_CHARTS).nullable(),
    most: z.enum(DISC_GROUPS).nullable(),
    claims: z.array(z.enum(DISC_CLAIMS)).max(DISC_CLAIMS.length),
  }),
  cross: z.object({
    fill: z.enum(CROSS_FILLS).nullable(),
    blind: z.boolean(),
    back: z.boolean(),
    draws: z.array(z.object({ blind: z.boolean(), back: z.boolean() })).max(CROSS_MAX),
    rows: z.array(crossRow).max(CROSS_MAX / CROSS_BATCH),
    tot: crossRow,
    dom: short,
    rec: short,
    ratio: short,
    expDom: short,
    expRec: short,
    ptt: short,
    clsDom: short,
    clsRec: short,
    clsRatio: short,
    closer: z.enum(CROSS_CLOSER).nullable(),
    claims: z.array(z.enum(CROSS_CLAIMS)).max(CROSS_CLAIMS.length),
  }),
  food: z.object({
    gloves: z.boolean(),
    visited: z.array(z.enum(FOOD_SPOTS)).max(FOOD_SPOTS.length),
    glovedAt: z.number().int().min(0).max(FOOD_SPOTS.length),
    counts: orgRecord(short),
    links: z.array(z.string().max(30)).max(40),
    arrow: z.enum(FOOD_ARROWS).nullable(),
    chains: z.array(z.array(z.enum(FOOD_ORGS)).max(FOOD_ORGS.length)).max(FOOD_MAX_CHAINS),
    levels: orgRecord(z.enum(['', ...FOOD_LEVELS] as const)),
    scaleN: short,
    widthN: widthSchema,
    scaleE: short,
    widthE: widthSchema,
    eff: short,
    invert: z.enum(FOOD_INVERT).nullable(),
    claims: z.array(z.enum(FOOD_CLAIMS)).max(FOOD_CLAIMS.length),
  }),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<BioGeneticsState>;

export const BIO_GENETICS: SimulatorSpec = {
  id: 'bio-genetics',
  subject: 'Biology',
  title: 'Variation, inheritance and feeding relationships',
  topicNames: ['Morphological variations', 'Physiological variations', 'Probability in genetics', 'Food Webs and Trophic Levels', 'Variation', 'Genetics', 'Ecology'],
  minutes: 45,
  rubric: [
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide:
        'Height: everyone who agreed measured and anyone who declined left alone (1); shoes off for every height (1); a set square on the head, read at eye level (1); hand spans with the fingers spread (½) and equal class widths (½). Discontinuous: every classmate asked to roll the tongue (1); three attempts for everyone who could not at first (1); every health card read (1); recorded anonymously by number (1). Cross: 50 red and 50 white beads in each beaker (1); drawn without looking (1); beads returned and shaken after every draw (1); 100 draws (1). Food: covered shoes and gloves before collecting (1); every field spot surveyed (1½); arrows from the eaten to the eater (½); a stated scale for both pyramids (1).',
    },
    { id: 'readings', label: 'Readings', marks: 4, how: 'AUTO', guide: 'Height: each height as the board showed it (3) and each hand span (1). Discontinuous: each roller / non-roller as seen (2) and each blood group as on the card (2). Cross: the counts of TT, Tt and tt in each batch of ten draws, as drawn. Food: the count of each organism from the field spots.' },
    { id: 'presentation', label: 'Table and graph', marks: 3, how: 'AUTO', guide: 'Height: the frequency of each class from your own readings (1½); the total (½); a histogram with no gaps (1). Discontinuous: the tallies from your own records (1); a pie chart for tongue rolling (1) and a bar chart with gaps for blood groups (1). Cross: the totals (1); dominant = TT + Tt, recessive = tt (1); the ratio as x : 1 (1). Food: three food chains from what you saw (1); the food web (1); both pyramids drawn to your scale (1).' },
    { id: 'results', label: 'Results and conclusions', marks: 5, how: 'AUTO', guide: 'Height: the mean (1), the modal class (1), the range (½) and the hand-span mean and range (½) from your own data; the conclusions (2). Discontinuous: % rollers (½), the pie angles (1), the blood-group % (1), the most common group (½); the conclusions (2). Cross: the expected numbers (1) and P(tt) (½); the class totals and ratio (1); which is closer to 3 : 1 (½); the conclusions (2). Food: the trophic levels (1½), the efficiency (1), which pyramid can be inverted (½); the conclusions (2).' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each). Height: shoes off; set square flat on the head; read at eye level; measure everyone the same way; equal class widths; respect anyone who declines. Discontinuous: several attempts at rolling; anonymous records; health records with consent (no blood taken); check the percentages add to 100 and the angles to 360°. Cross: draw without looking; return the beads and shake; equal numbers of each colour; many draws. Food: arrows from eaten to eater; a stated scale; observe rather than assume; gloves and covered shoes.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'Height: many genes plus the environment give a continuous range, most near the mean — continuous variation. Discontinuous: one or a few genes give distinct groups with no intermediates, little affected by the environment. Cross: each parent’s gametes carry T or t with probability ½; P(tt) = ½ × ½ = ¼, so 3 : 1; chance makes small samples deviate. Food: energy flows from producer to consumers; about 90 % is lost at each level (respiration, heat, excretion, uneaten parts), so numbers and energy fall and chains are short.' },
  ],
};

// ================================================================== model answers (the worked solution, the demo and the tests)

const fx = (x: number, dp: number) => String(roundDp(x, dp));

/** Ideal height records: every reading as shown, the frequency table, histogram, statistics and conclusions. */
export function heightIdealRecords(v: BioGeneticsVariant, s: BioGeneticsState): HeightWork {
  const w = s.height;
  const seen = heightSeen(v.height, w, v.seed);
  const rows = seen.map((x) => ({ h: x.h === null ? '' : String(x.h), s: x.s === null ? '' : x.s.toFixed(1) }));
  const hs = seen.map((x) => x.h).filter((x): x is number => x !== null);
  const ss = seen.map((x) => x.s).filter((x): x is number => x !== null);
  const scheme: HeightScheme = w.scheme ?? 'W5';
  const freq = heightFreq(hs, scheme);
  const top = Math.max(...freq);
  return {
    ...w,
    rows,
    scheme,
    freq: freq.map(String),
    total: String(hs.length),
    chart: 'HISTOGRAM',
    mean: hs.length ? fx(mean(hs), 1) : '',
    modal: hs.length ? freq.indexOf(top) : null,
    range: hs.length ? String(Math.max(...hs) - Math.min(...hs)) : '',
    spanMean: ss.length ? fx(mean(ss), 1) : '',
    spanRange: ss.length ? fx(Math.max(...ss) - Math.min(...ss), 1) : '',
    claims: [...HEIGHT_NEED, 'GENES_ENV'],
  };
}
export function heightModelState(v: BioGeneticsVariant): BioGeneticsState {
  const s = emptyBioGeneticsState();
  s.task = 'HEIGHT';
  const w = s.height;
  Object.assign(w, { shoesOff: true, square: true, spread: true, scheme: 'W5' });
  v.height.people.forEach((p, who) => {
    if (p.declines) return;
    w.measures.push({ who, kind: 'H', shoes: false, square: true, spread: true }, { who, kind: 'S', shoes: false, square: true, spread: true });
  });
  w.at = v.height.n - 1;
  s.height = heightIdealRecords(v, s);
  return s;
}

/** Ideal discontinuous records: each classmate as seen, tallies, percentages, angles and charts. */
export function discIdealRecords(v: BioGeneticsVariant, s: BioGeneticsState): DiscWork {
  const w = s.disc;
  const rows: DiscRow[] = Array.from({ length: v.disc.n }, (_, i) => ({ roll: discRoll(v.disc, w, i) ?? '', group: w.cards[i] ? v.disc.people[i]!.group : '' }));
  const R = rows.filter((x) => x.roll === 'R').length;
  const N = rows.filter((x) => x.roll === 'N').length;
  const T = R + N;
  const g = Object.fromEntries(DISC_GROUPS.map((k) => [k, rows.filter((x) => x.group === k).length])) as Record<DiscGroup, number>;
  const G = DISC_GROUPS.reduce((a, k) => a + g[k], 0);
  const most = G ? DISC_GROUPS.reduce((a, k) => (g[k] > g[a] ? k : a), 'O' as DiscGroup) : null;
  return {
    ...w,
    rows,
    tot: T ? { r: String(R), n: String(N), pr: fx((R / T) * 100, 1), pn: fx((N / T) * 100, 1), ar: fx((R / T) * 360, 1), an: fx((N / T) * 360, 1) } : w.tot,
    grp: Object.fromEntries(DISC_GROUPS.map((k) => [k, G ? String(g[k]) : ''])) as Record<DiscGroup, string>,
    gpct: Object.fromEntries(DISC_GROUPS.map((k) => [k, G ? fx((g[k] / G) * 100, 1) : ''])) as Record<DiscGroup, string>,
    chartT: 'PIE',
    chartB: 'BAR',
    most,
    claims: [...DISC_NEED],
  };
}
export function discModelState(v: BioGeneticsVariant): BioGeneticsState {
  const s = emptyBioGeneticsState();
  s.task = 'DISCRETE';
  const w = s.disc;
  w.recordBy = 'NUMBER';
  for (let i = 0; i < v.disc.n; i++) {
    let k = 1;
    while (k < DISC_TRIES && !discAttempt(v.disc, i, k)) k++;
    w.tries.push(k);
    w.cards.push(true);
  }
  w.at = v.disc.n - 1;
  s.disc = discIdealRecords(v, s);
  return s;
}

/** Ideal cross records: each batch as drawn, totals, ratio, expected, class totals and conclusions. */
export function crossIdealRecords(v: BioGeneticsVariant, s: BioGeneticsState): CrossWork {
  const w = s.cross;
  const pairs = crossPairs(w, v.seed);
  const rows = crossBatches(pairs).map((b) => ({ TT: String(b.TT), Tt: String(b.Tt), tt: String(b.tt) }));
  const t = { TT: pairs.filter((p) => p.g === 'TT').length, Tt: pairs.filter((p) => p.g === 'Tt').length, tt: pairs.filter((p) => p.g === 'tt').length };
  const dom = t.TT + t.Tt;
  const n = pairs.length;
  const cd = dom + v.cross.groups.reduce((a, g) => a + g.TT + g.Tt, 0);
  const cr = t.tt + v.cross.groups.reduce((a, g) => a + g.tt, 0);
  const own = t.tt ? dom / t.tt : null;
  const cls = cr ? cd / cr : null;
  return {
    ...w,
    rows,
    tot: { TT: String(t.TT), Tt: String(t.Tt), tt: String(t.tt) },
    dom: String(dom),
    rec: String(t.tt),
    ratio: own === null ? '' : fx(own, 2),
    expDom: fx(n * 0.75, 1),
    expRec: fx(n * 0.25, 1),
    ptt: '0.25',
    clsDom: String(cd),
    clsRec: String(cr),
    clsRatio: cls === null ? '' : fx(cls, 2),
    closer: own !== null && cls !== null ? (Math.abs(roundDp(own, 2) - 3) < Math.abs(roundDp(cls, 2) - 3) ? 'OWN' : 'CLASS') : null,
    claims: [...CROSS_NEED],
  };
}
export function crossModelState(v: BioGeneticsVariant): BioGeneticsState {
  const s = emptyBioGeneticsState();
  s.task = 'CROSS';
  const w = s.cross;
  Object.assign(w, { fill: 'EQUAL', blind: true, back: true });
  for (let k = 0; k < CROSS_N; k++) w.draws.push({ blind: true, back: true });
  s.cross = crossIdealRecords(v, s);
  return s;
}

/** Ideal food records: counts, the web of every link seen, chains, levels, both pyramids and the efficiency. */
export function foodIdealRecords(v: BioGeneticsVariant, s: BioGeneticsState): FoodWork {
  const w = s.food;
  const seenOrgs = foodSeenOrgs(w);
  const seen = foodSeenLinks(w);
  const counts = Object.fromEntries(FOOD_ORGS.map((o) => [o, seenOrgs.includes(o) ? String(v.food.counts[o]) : ''])) as Record<FoodOrg, string>;
  const cands: FoodOrg[][] = [FOOD_CHAIN_MAIN, ['GRASS', 'CATERPILLAR', 'BIRD', 'HAWK'], ['GRASS', 'GOAT', 'MAN'], ['GRASS', 'GRASSHOPPER', 'TOAD', 'HAWK'], ['GRASS', 'CATERPILLAR', 'TOAD', 'HAWK']];
  const chains = cands.filter((c) => foodChainOk(c, seen)).slice(0, 4);
  const inWeb = new Set(seen.flatMap((l) => l.split('>')));
  const levels = Object.fromEntries(FOOD_ORGS.map((o) => [o, inWeb.has(o) || seenOrgs.includes(o) ? FOOD_TRUE_LEVEL[o] : ''])) as Record<FoodOrg, '' | FoodLevel>;
  const nums: Record<FoodLevel, number> = { P: v.food.counts.GRASS, C1: v.food.counts.GRASSHOPPER, C2: v.food.counts.LIZARD, C3: v.food.counts.HAWK };
  const sN = 10;
  const sE = 100;
  const wd = (x: number, sc: number) => fx(x / sc, 2);
  return {
    ...w,
    counts,
    links: [...seen],
    arrow: 'EATEN_EATER',
    chains,
    levels,
    scaleN: String(sN),
    widthN: { P: wd(nums.P, sN), C1: wd(nums.C1, sN), C2: wd(nums.C2, sN), C3: wd(nums.C3, sN) },
    scaleE: String(sE),
    widthE: { P: wd(v.food.energy.P, sE), C1: wd(v.food.energy.C1, sE), C2: wd(v.food.energy.C2, sE), C3: wd(v.food.energy.C3, sE) },
    eff: fx((v.food.energy.C1 / v.food.energy.P) * 100, 1),
    invert: 'NUMBERS',
    claims: [...FOOD_NEED],
  };
}
export function foodModelState(v: BioGeneticsVariant): BioGeneticsState {
  const s = emptyBioGeneticsState();
  s.task = 'FOOD';
  s.food.gloves = true;
  s.food.glovedAt = 0;
  s.food.visited = [...FOOD_SPOTS];
  s.food = foodIdealRecords(v, s);
  return s;
}
