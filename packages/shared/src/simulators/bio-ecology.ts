import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { labBetween, labRandom, roundDp } from './seeded';

/**
 * bio-ecology: WAEC ecology field work — the one source of truth for the
 * web (what the field and the instruments show) and the API (what is marked).
 *
 * QUADRAT (pr-bio-quadrat-sampling): a 20 m × 20 m plot of grassland with
 * three counted herbs (Tridax, Sida, Euphorbia hirta) growing in clumps (a
 * Thomas cluster process seeded per attempt) and a grass sward. 1 m² quadrats
 * placed at coordinates from a random-number table (or by eye: biased); in
 * each the herbs are counted (plants on the frame: the two-sides rule) and the
 * grass cover estimated on the 10 × 10 string grid. Density, frequency and the
 * estimated population follow.
 *
 * CAPTURE (pr-bio-capture-recapture): grasshoppers in the same plot, a seeded
 * true population N. Each sweep catches each animal with p = 1 − e^(−q·t);
 * marked animals are lost (deaths, emigration, marks lost at moulting, more
 * for a bright or harmful mark) and stay over-represented near the release
 * point until they mix (k = 1 + A·e^(−t/τ)). Binomial sampling noise; Lincoln
 * index N = n₁ × n₂ ÷ m.
 *
 * FACTORS (pr-bio-ecological-factors): an open field and the shade of a tree
 * canopy over three days: air and soil temperature, wet- and dry-bulb
 * hygrometer (relative humidity from the psychrometric table), light, wind,
 * soil pH; the weather station's Six's thermometer and rain gauge each
 * morning, the wind vane, and the pond's Secchi disc. A thermometer read in
 * direct sun reads high.
 *
 * SOIL (pr-bio-soil-properties): sand, loam and clay — sedimentation in a
 * jar (the layers settle by particle size, clay last), drainage through
 * funnels plugged with cotton wool (V = Vmax(1 − e^(−t/τ))), air content by
 * displacement, and humus by heating to constant mass.
 */

export const ECO_TASKS = ['QUADRAT', 'CAPTURE', 'FACTORS', 'SOIL'] as const;
export type EcoTask = (typeof ECO_TASKS)[number];
/** The lessons that open this lab, and the task each one sets. */
export const ECO_PRACTICAL_TASKS: Record<string, EcoTask> = { 'pr-bio-quadrat-sampling': 'QUADRAT', 'pr-bio-capture-recapture': 'CAPTURE', 'pr-bio-ecological-factors': 'FACTORS', 'pr-bio-soil-properties': 'SOIL' };
export const ECO_TASK_TITLE: Record<EcoTask, string> = { QUADRAT: 'Quadrat sampling of plants', CAPTURE: 'Capture–recapture of grasshoppers', FACTORS: 'Measuring ecological factors', SOIL: 'Soil: sediments, water, air and humus' };

/** One observable fact and the keyword groups a written observation must contain. */
export interface EcoPart {
  text: string;
  kw: string[][];
  not?: string[];
}
const P = (text: string, ...kw: string[][]): EcoPart => ({ text, kw });
const Pn = (text: string, not: string[], ...kw: string[][]): EcoPart => ({ text, kw, not });

function normal(r: () => number) {
  return (r() + r() + r() + r() - 2) * 1.732;
}
/** A seeded binomial count (n small enough to draw one by one). */
function binom(r: () => number, n: number, p: number): number {
  let k = 0;
  const q = Math.max(0, Math.min(1, p));
  for (let i = 0; i < n; i++) if (r() < q) k++;
  return k;
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ================================================================== QUADRAT

/** The plot's side (m) and area (m²). */
export const QUAD_PLOT = 20;
export const QUAD_AREA = QUAD_PLOT * QUAD_PLOT;
export const QUAD_MIN = 10;
export const QUAD_MAX = 30;
/** The quadrat's string grid (squares per side) for estimating cover. */
export const QUAD_GRID = 10;
export const QUAD_HERBS = ['TRIDAX', 'SIDA', 'EUPH'] as const;
export type QuadHerb = (typeof QUAD_HERBS)[number];
export const QUAD_HERB_LABEL: Record<QuadHerb, string> = { TRIDAX: 'Tridax procumbens', SIDA: 'Sida acuta', EUPH: 'Euphorbia hirta' };
export const QUAD_HERB_COMMON: Record<QuadHerb, string> = { TRIDAX: 'coat buttons', SIDA: 'broom weed', EUPH: 'asthma weed' };
export type QuadHow = 'RANDOM' | 'CHOSEN';

export interface QuadPlant {
  x: number;
  y: number;
  /** Rosette radius (m). */
  r: number;
}
export interface QuadVariant {
  plants: Record<QuadHerb, QuadPlant[]>;
  /** The grass sward: base cover and bumps [x, y, spread (m), amplitude]. */
  grass: { base: number; bumps: [number, number, number, number][] };
  /** The random-number table: two-digit numbers 00–99. */
  table: number[];
}

function cluster(r: () => number, o: { parents: number; kids: number; sigma: number; bg: number; rmin: number; rmax: number }): QuadPlant[] {
  const out: QuadPlant[] = [];
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= QUAD_PLOT || y >= QUAD_PLOT) return;
    out.push({ x: roundDp(x, 3), y: roundDp(y, 3), r: labBetween(r, o.rmin, o.rmax, 3) });
  };
  for (let p = 0; p < o.parents; p++) {
    const px = r() * QUAD_PLOT;
    const py = r() * QUAD_PLOT;
    const n = Math.round(o.kids * (0.55 + 0.9 * r()));
    const s = o.sigma * (0.75 + 0.5 * r());
    for (let k = 0; k < n; k++) add(px + s * normal(r), py + s * normal(r));
  }
  for (let k = 0; k < o.bg; k++) add(r() * QUAD_PLOT, r() * QUAD_PLOT);
  return out;
}
function pickQuad(seed: number): QuadVariant {
  const r = labRandom(seed, 'bio-ecology-quadrat');
  const plants: Record<QuadHerb, QuadPlant[]> = {
    TRIDAX: cluster(r, { parents: Math.round(labBetween(r, 10, 14, 0)), kids: labBetween(r, 60, 85, 0), sigma: labBetween(r, 0.9, 1.4, 2), bg: Math.round(labBetween(r, 60, 120, 0)), rmin: 0.04, rmax: 0.08 }),
    SIDA: cluster(r, { parents: Math.round(labBetween(r, 4, 6, 0)), kids: labBetween(r, 55, 80, 0), sigma: labBetween(r, 0.5, 0.85, 2), bg: Math.round(labBetween(r, 10, 30, 0)), rmin: 0.05, rmax: 0.1 }),
    EUPH: cluster(r, { parents: Math.round(labBetween(r, 25, 35, 0)), kids: labBetween(r, 14, 22, 0), sigma: labBetween(r, 1.6, 2.4, 2), bg: Math.round(labBetween(r, 100, 150, 0)), rmin: 0.03, rmax: 0.06 }),
  };
  const bumps = Array.from({ length: 8 }, (): [number, number, number, number] => [labBetween(r, 0, QUAD_PLOT, 2), labBetween(r, 0, QUAD_PLOT, 2), labBetween(r, 1.5, 3.5, 2), labBetween(r, -0.4, 0.35, 2)]);
  const table = Array.from({ length: 600 }, () => Math.floor(r() * 100));
  return { plants, grass: { base: labBetween(r, 0.55, 0.7, 2), bumps }, table };
}

/** The plants of a herb in quadrat (qx, qy): the two-sides rule (left and bottom edges count), and the range allowed for the edge plants. */
export function quadCount(v: QuadVariant, herb: QuadHerb, qx: number, qy: number): { exact: number; strict: number; loose: number } {
  let exact = 0;
  let strict = 0;
  let loose = 0;
  for (const p of v.plants[herb]) {
    if (p.x + p.r <= qx || p.x - p.r >= qx + 1 || p.y + p.r <= qy || p.y - p.r >= qy + 1) continue;
    loose++;
    if (p.x >= qx && p.x < qx + 1 && p.y >= qy && p.y < qy + 1) exact++;
    if (p.x - p.r >= qx && p.x + p.r <= qx + 1 && p.y - p.r >= qy && p.y + p.r <= qy + 1) strict++;
  }
  return { exact, strict, loose };
}
/** Whether each small square of the quadrat's grid is more than half covered by grass (row-major, y up). */
export function quadCoverCells(v: QuadVariant, qx: number, qy: number): boolean[] {
  const out: boolean[] = [];
  for (let j = 0; j < QUAD_GRID; j++)
    for (let i = 0; i < QUAD_GRID; i++) {
      const x = qx + (i + 0.5) / QUAD_GRID;
      const y = qy + (j + 0.5) / QUAD_GRID;
      let g = v.grass.base;
      for (const [bx, by, s, a] of v.grass.bumps) g += a * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (2 * s * s));
      const h = labRandom(Math.round(x * 1000) * 7919 + Math.round(y * 1000), 'grass')();
      out.push(g + 0.3 * (h - 0.5) > 0.5);
    }
  return out;
}
/** The true % grass cover of a quadrat (the squares more than half covered). */
export const quadCover = (v: QuadVariant, qx: number, qy: number) => quadCoverCells(v, qx, qy).filter(Boolean).length;
/** The next two usable numbers (00–19) from the random-number table at idx: the quadrat's coordinates. */
export function quadNextRandom(v: QuadVariant, idx: number): { x: number; y: number; next: number; used: number[] } | null {
  const got: number[] = [];
  const used: number[] = [];
  let i = idx;
  while (got.length < 2 && i < v.table.length) {
    const n = v.table[i]!;
    used.push(i);
    if (n < QUAD_PLOT) got.push(n);
    i++;
  }
  return got.length === 2 ? { x: got[0]!, y: got[1]!, next: i, used } : null;
}

export interface QuadPlaced {
  x: number;
  y: number;
  how: QuadHow;
}
export interface QuadRow {
  TRIDAX: string;
  SIDA: string;
  EUPH: string;
  grass: string;
}
export interface QuadResult {
  total: string;
  density: string;
  freq: string;
  pop: string;
}
export interface QuadWork {
  /** The plot marked out with pegs and tapes along two edges. */
  pegged: boolean;
  quads: QuadPlaced[];
  /** Where the next number is read in the random-number table. */
  randIdx: number;
  /** Quadrats examined close up (index). */
  looked: number[];
  rows: QuadRow[];
  res: Record<QuadHerb, QuadResult>;
  /** Mean grass cover (%). */
  cover: string;
  /** The bar chart of density (plants per m²) the student draws. */
  bars: Record<QuadHerb, number | null>;
  mostFreq: QuadHerb | null;
  mostDense: QuadHerb | null;
}
export const emptyQuadRow = (): QuadRow => ({ TRIDAX: '', SIDA: '', EUPH: '', grass: '' });
const emptyQuadResult = (): QuadResult => ({ total: '', density: '', freq: '', pop: '' });

// ================================================================== CAPTURE

export const CAP_EFFORTS = [5, 10, 15] as const;
export const CAP_MARKS = ['DOT', 'BRIGHT', 'CLIP'] as const;
export type CapMark = (typeof CAP_MARKS)[number];
export const CAP_MARK_LABEL: Record<CapMark, string> = { DOT: 'A small dot of non-toxic paint under the thorax', BRIGHT: 'A large patch of bright red gloss paint on the back', CLIP: 'Clip the tip of one wing' };
export const CAP_RELEASES = ['SCATTER', 'CORNER'] as const;
export type CapRelease = (typeof CAP_RELEASES)[number];
export const CAP_RELEASE_LABEL: Record<CapRelease, string> = { SCATTER: 'Release them gently all over the area where they were caught', CORNER: 'Tip them all out together at one corner of the plot' };
/** Waits offered between release and recapture (hours). */
export const CAP_WAITS = [1, 6, 24, 48, 168] as const;
export const CAP_CLOCK_MAX = 400;
export const CAP_MIN_WAIT = 24;
export const CAP_MAX_WAIT = 72;
export const CAP_FORMULAS = ['A', 'B', 'C', 'D'] as const;
export type CapFormula = (typeof CAP_FORMULAS)[number];
export const CAP_FORMULA_LABEL: Record<CapFormula, string> = { A: 'N = n₁ × n₂ ÷ m', B: 'N = n₁ × m ÷ n₂', C: 'N = n₂ × m ÷ n₁', D: 'N = n₁ + n₂ − m' };
export const CAP_ASSUME = ['CLOSED', 'NO_LOSS', 'MIX', 'HARMLESS', 'EASIER', 'GROWING', 'PLANTS'] as const;
export type CapAssume = (typeof CAP_ASSUME)[number];
export const CAP_ASSUME_RIGHT: CapAssume[] = ['CLOSED', 'NO_LOSS', 'MIX', 'HARMLESS'];
export const CAP_ASSUME_LABEL: Record<CapAssume, string> = {
  CLOSED: 'No births, deaths, immigration or emigration between the samples',
  NO_LOSS: 'The marks are not lost or rubbed off',
  MIX: 'The marked animals mix evenly with the rest of the population',
  HARMLESS: 'Marking does not affect survival, behaviour or the chance of being caught',
  EASIER: 'Marked animals are easier to catch the second time',
  GROWING: 'The population grows quickly between the samples',
  PLANTS: 'The method works as well for plants as for animals',
};
export const CAP_ERRORS = ['MOVE', 'RUBOFF', 'CATCH', 'EDGE', 'SUN'] as const;
export type CapError = (typeof CAP_ERRORS)[number];
export const CAP_ERROR_RIGHT: CapError[] = ['MOVE', 'RUBOFF', 'CATCH'];
export const CAP_ERROR_LABEL: Record<CapError, string> = {
  MOVE: 'Grasshoppers born, dying or moving in or out between the samples',
  RUBOFF: 'Marks rubbed off or lost when the grasshoppers moulted',
  CATCH: 'Marked grasshoppers easier or harder to catch than the others',
  EDGE: 'Plants on the edge of the quadrat not counted',
  SUN: 'The thermometer read in direct sunlight',
};
/** Marked animals lost per hour (deaths, emigration, marks lost at moulting), and the extra loss each mark causes. */
export const CAP_LOSS = 0.0022;
export const CAP_MARK_LOSS: Record<CapMark, number> = { DOT: 0, BRIGHT: 0.012, CLIP: 0.007 };

export interface CapVariant {
  seed: number;
  /** The true population in the plot. */
  N: number;
  /** Catch rate per minute of sweeping. */
  q: number;
  /** Mixing time of the released animals (h). */
  tauMix: number;
}
function pickCap(seed: number): CapVariant {
  const r = labRandom(seed, 'bio-ecology-capture');
  return { seed, N: Math.round(labBetween(r, 150, 350, 0)), q: labBetween(r, 0.028, 0.04, 4), tauMix: labBetween(r, 3, 5, 2) };
}
export const capP = (v: CapVariant, effort: number) => 1 - Math.exp(-v.q * effort);
/** The first sample (n₁): each grasshopper caught with probability p. */
export function capFirstCatch(v: CapVariant, effort: number): number {
  return binom(labRandom(v.seed, `cap1-${effort}`), v.N, capP(v, effort));
}
/** The second sample after `t` hours: the marked survivors (M), the catch (n₂) and the marked in it (m). */
export function capSecondCatch(v: CapVariant, o: { firstEffort: number; mark: CapMark; release: CapRelease; effort: number; t: number }): { n1: number; M: number; n2: number; m: number } {
  const n1 = capFirstCatch(v, o.firstEffort);
  const r = labRandom(v.seed, `cap2-${o.firstEffort}-${o.mark}-${o.release}-${o.effort}-${o.t}`);
  const M = binom(r, n1, Math.exp(-o.t * (CAP_LOSS + CAP_MARK_LOSS[o.mark])));
  const tau = v.tauMix * (o.release === 'CORNER' ? 2.5 : 1);
  let k = 1 + (o.release === 'CORNER' ? 3.2 : 1.8) * Math.exp(-o.t / tau);
  if (o.mark === 'CLIP') k *= 1.25;
  const p = capP(v, o.effort);
  const m = binom(r, M, Math.min(0.95, p * k));
  const u = binom(r, Math.max(0, v.N - M), p);
  return { n1, M, n2: m + u, m };
}
/** Where each grasshopper lies on the white tray (0–1), its size and which way it faces; `marked`: which ones carry a mark. */
export function capTray(seed: number, n: number, marked: number, salt: string): { x: number; y: number; a: number; s: number; marked: boolean }[] {
  const r = labRandom(seed, `tray-${salt}-${n}-${marked}`);
  const flags = Array.from({ length: n }, (_, i) => i < marked);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [flags[i], flags[j]] = [flags[j]!, flags[i]!];
  }
  const cols = Math.ceil(Math.sqrt(n * 1.5));
  const rows = Math.ceil(n / cols);
  return flags.map((m, i) => ({ x: roundDp(((i % cols) + 0.5 + (r() - 0.5) * 0.5) / cols, 3), y: roundDp((Math.floor(i / cols) + 0.5 + (r() - 0.5) * 0.4) / Math.max(rows, 1), 3), a: roundDp(r() * Math.PI * 2, 2), s: roundDp(0.8 + 0.4 * r(), 2), marked: m }));
}

export interface CapWork {
  /** The first sweep (at the start). */
  first: { effort: number } | null;
  /** First catch tipped onto the tray and counted. */
  counted1: boolean;
  mark: CapMark | null;
  release: CapRelease | null;
  /** Hours since the release. */
  clock: number;
  second: { effort: number; at: number } | null;
  /** The second catch looked over, one by one, for marks. */
  examined: boolean;
  /** The second catch released where it was caught. */
  freed: boolean;
  n1: string;
  n2: string;
  m: string;
  formula: CapFormula | null;
  N: string;
  pct: string;
  density: string;
  assume: CapAssume[];
  errors: CapError[];
}

// ================================================================== FACTORS

export const FAC_SITES = ['OPEN', 'SHADE'] as const;
export type FacSite = (typeof FAC_SITES)[number];
export const FAC_SITE_LABEL: Record<FacSite, string> = { OPEN: 'Open field', SHADE: 'Under the tree canopy' };
export const FAC_PLACES = ['STATION', 'OPEN', 'SHADE', 'POND'] as const;
export type FacPlace = (typeof FAC_PLACES)[number];
export const FAC_PLACE_LABEL: Record<FacPlace, string> = { STATION: 'The weather station', OPEN: 'The open field', SHADE: 'Under the tree canopy', POND: 'The pond edge' };
export const FAC_INSTS = ['AIR', 'SOIL', 'HYGRO', 'LIGHT', 'WIND', 'PH'] as const;
export type FacInst = (typeof FAC_INSTS)[number];
export const FAC_INST_LABEL: Record<FacInst, string> = { AIR: 'Thermometer (air, 1 m up)', SOIL: 'Soil thermometer (10 cm deep)', HYGRO: 'Wet-and-dry bulb hygrometer', LIGHT: 'Light meter (at ground level)', WIND: 'Anemometer', PH: 'Soil pH (universal indicator)' };
export const FAC_STATION_INSTS = ['SIX', 'RAIN', 'VANE'] as const;
export type FacStationInst = (typeof FAC_STATION_INSTS)[number];
export const FAC_DAYS = 4;
/** Site readings on at least this many days. */
export const FAC_MIN_DAYS = 3;
export const FAC_DAY_START = 9;
export const FAC_DAY_END = 17;
export const FAC_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export const FAC_CLAIMS = ['GRASS_OPEN', 'MOSS_SHADE', 'SNAIL_SHADE', 'MOSS_OPEN', 'WIND_SHADE', 'ACID_OPEN'] as const;
export type FacClaim = (typeof FAC_CLAIMS)[number];
export const FAC_CLAIM_RIGHT: FacClaim[] = ['GRASS_OPEN', 'MOSS_SHADE', 'SNAIL_SHADE'];
export const FAC_CLAIM_LABEL: Record<FacClaim, string> = {
  GRASS_OPEN: 'Grasses and sun-loving weeds grow in the bright open field',
  MOSS_SHADE: 'Mosses, ferns and shade plants grow under the canopy, where it is cooler and damper',
  SNAIL_SHADE: 'Snails, millipedes and woodlice shelter under the canopy, where the air is more humid',
  MOSS_OPEN: 'Mosses grow best in the hot, dry open field',
  WIND_SHADE: 'It is windier under the canopy than in the open',
  ACID_OPEN: 'The open-field soil is more acidic because of the leaf litter',
};

export interface FacDay {
  /** Extremes of the 24 h ending at 9 am that day (°C): what the Six's thermometer shows that morning. */
  tmax: number;
  tmin: number;
  /** Cloud cover (0 clear – 1 overcast) during that day. */
  cloud: number;
  /** Rain in the 24 h ending at 9 am that day (mm). */
  rain: number;
  /** Wind speed in the open (m/s) and its direction (index into FAC_DIRS). */
  wind: number;
  dir: number;
  /** Relative humidity at dawn (%). */
  rh0: number;
}
export interface FacVariant {
  /** Days 1–5: day d's afternoon maximum is days[d].tmax (read on the morning of d + 1). */
  days: FacDay[];
  shadeCool: number;
  shadeHum: number;
  shadeLight: number;
  sunBias: number;
  lightMax: number;
  ph: Record<FacSite, number>;
  secchi: number;
}
function pickFac(seed: number): FacVariant {
  const r = labRandom(seed, 'bio-ecology-factors');
  const days = Array.from({ length: FAC_DAYS + 1 }, (): FacDay => {
    const tmin = labBetween(r, 21, 24.5, 1);
    return { tmin, tmax: roundDp(tmin + labBetween(r, 7, 11, 1), 1), cloud: labBetween(r, 0, 0.7, 2), rain: r() < 0.35 ? 0 : roundDp(Math.round(labBetween(r, 2, 30, 1) * 2) / 2, 1), wind: labBetween(r, 1.6, 4.2, 1), dir: Math.floor(r() * 8), rh0: labBetween(r, 86, 95, 0) };
  });
  return {
    days,
    shadeCool: labBetween(r, 1.8, 3.2, 1),
    shadeHum: labBetween(r, 9, 15, 0),
    shadeLight: labBetween(r, 0.05, 0.11, 3),
    sunBias: labBetween(r, 3.5, 5.5, 1),
    lightMax: labBetween(r, 85000, 100000, 0),
    ph: { OPEN: labBetween(r, 6.6, 7.4, 1), SHADE: labBetween(r, 5.3, 6.2, 1) },
    secchi: Math.round(labBetween(r, 28, 65, 0)),
  };
}

/** Saturation vapour pressure (kPa). */
const es = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
/** Relative humidity (%) from dry- and wet-bulb readings (a ventilated psychrometer at sea level): the humidity table. */
export function facRH(dry: number, wet: number): number {
  const e = es(wet) - 0.0671 * (dry - wet);
  return clamp((e / es(dry)) * 100, 0, 100);
}
/** The wet-bulb temperature for air at t °C and rh %. */
function wetBulb(t: number, rh: number): number {
  let lo = t - 25;
  let hi = t;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (facRH(t, mid) < rh) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
const dayShape = (h: number) => Math.max(0, Math.sin((Math.PI * (h - 6)) / 16));
const lightShape = (h: number) => Math.max(0.05, Math.sin((Math.PI * (h - 6)) / 12));
const halfRound = (x: number) => Math.round(x * 2) / 2;

/** The true air temperature at a site (°C), day 1–4, hour 9–17. */
export function facAirTrue(v: FacVariant, site: FacSite, day: number, h: number): number {
  const d = v.days[day - 1]!;
  const next = v.days[day]!;
  const t = d.tmin + (next.tmax - d.tmin) * dayShape(h);
  return site === 'OPEN' ? t : t - v.shadeCool * (0.4 + 0.6 * dayShape(h));
}
export function facRHTrue(v: FacVariant, site: FacSite, day: number, h: number): number {
  const d = v.days[day - 1]!;
  const open = clamp(d.rh0 - 2.6 * (facAirTrue(v, 'OPEN', day, h) - d.tmin), 38, 97);
  return site === 'OPEN' ? open : Math.min(98, open + v.shadeHum);
}

export interface FacRead {
  day: number;
  h: number;
  site: FacSite;
  inst: FacInst;
  /** The thermometer (or hygrometer) was shaded from direct sun (by a card or the body). */
  shaded: boolean;
}
/** What an instrument showed for reading k (the readings fluctuate a little, as real ones do). */
export function facShown(v: FacVariant, read: FacRead, k: number): { value: number; dry?: number; wet?: number } {
  const r = labRandom(v.ph.OPEN * 1000 + k, `fac-${read.day}-${read.site}-${read.inst}-${Math.round(read.h * 100)}`);
  const d = v.days[read.day - 1]!;
  const sun = read.shaded ? 0 : read.site === 'OPEN' ? v.sunBias * (1 - 0.8 * d.cloud) * (0.5 + 0.5 * dayShape(read.h)) : 0.4;
  const t = facAirTrue(v, read.site, read.day, read.h);
  switch (read.inst) {
    case 'AIR':
      return { value: halfRound(t + sun + (r() - 0.5) * 0.3) };
    case 'SOIL': {
      const mean = (d.tmin + v.days[read.day]!.tmax) / 2;
      const open = facAirTrue(v, 'OPEN', read.day, read.h);
      const ts = read.site === 'OPEN' ? mean + 1 + 0.45 * (open - mean) : mean - 0.8 + 0.2 * (open - mean);
      return { value: halfRound(ts + (r() - 0.5) * 0.3) };
    }
    case 'HYGRO': {
      const rh = facRHTrue(v, read.site, read.day, read.h);
      const wet = wetBulb(t, rh);
      const dry = halfRound(t + sun + (r() - 0.5) * 0.2);
      const wetShown = halfRound(wet + 0.6 * sun + (r() - 0.5) * 0.2);
      return { value: dry, dry, wet: Math.min(wetShown, dry) };
    }
    case 'LIGHT': {
      const l = v.lightMax * lightShape(read.h) * (1 - 0.7 * d.cloud) * (read.site === 'OPEN' ? 1 : v.shadeLight) * (0.96 + 0.08 * r());
      const p = 10 ** (Math.floor(Math.log10(l)) - 2);
      return { value: Math.round(l / p) * p };
    }
    case 'WIND':
      return { value: roundDp(d.wind * (read.site === 'OPEN' ? 1 : 0.35) * (0.75 + 0.5 * r()), 1) };
    case 'PH':
      return { value: Math.round(v.ph[read.site]) };
  }
}
/** The Six's thermometer on the morning of `day`: the extremes since it was last reset (the teacher reset it the morning before day 1). */
export function facSix(v: FacVariant, day: number, resets: number[]): { max: number; min: number } {
  const last = Math.max(0, ...resets.filter((d) => d < day));
  const ds = v.days.slice(last, day);
  return { max: halfRound(Math.max(...ds.map((d) => d.tmax))), min: halfRound(Math.min(...ds.map((d) => d.tmin))) };
}
/** The rain gauge on the morning of `day`: everything since it was last emptied. */
export function facRain(v: FacVariant, day: number, empties: number[]): number {
  const last = Math.max(0, ...empties.filter((d) => d < day));
  return halfRound(v.days.slice(last, day).reduce((t, d) => t + d.rain, 0));
}

export interface FacRow {
  air: string;
  soil: string;
  dry: string;
  wet: string;
  rh: string;
  light: string;
  wind: string;
}
export interface FacMean {
  air: string;
  soil: string;
  rh: string;
  light: string;
  wind: string;
}
export interface FacSixRow {
  max: string;
  min: string;
  mean: string;
  range: string;
}
export interface FacWork {
  day: number;
  /** The clock (hours, 9–17). */
  h: number;
  at: FacPlace;
  reads: FacRead[];
  station: { day: number; inst: FacStationInst }[];
  /** Days the Six's thermometer was reset (after reading) and the rain gauge emptied. */
  resets: number[];
  empties: number[];
  secchiRead: boolean;
  /** Per site, per day (index day − 1). */
  rows: Record<FacSite, FacRow[]>;
  ph: Record<FacSite, string>;
  means: Record<FacSite, FacMean>;
  six: FacSixRow[];
  rain: string[];
  rainTotal: string;
  rainMean: string;
  dir: string[];
  secchi: string;
  obs: string;
  claims: FacClaim[];
}
export const emptyFacRow = (): FacRow => ({ air: '', soil: '', dry: '', wet: '', rh: '', light: '', wind: '' });
const emptyFacMean = (): FacMean => ({ air: '', soil: '', rh: '', light: '', wind: '' });

/** What the comparison of the two sites should say (from the true conditions). */
export function facParts(): EcoPart[] {
  return [
    Pn('the open field was brighter (higher light intensity)', ['shade was brighter', 'tree was brighter'], ['bright', 'more light', 'higher light', 'light intensity', 'sunny', 'lux']),
    Pn('the open field was warmer', ['open was cooler', 'open field was cooler'], ['warm', 'hot', 'higher temperature', 'cool']),
    Pn('the open field was windier', ['shade was windier'], ['wind']),
    Pn('the shade was more humid (damper)', ['open was more humid'], ['humid', 'damp', 'moist', 'humidity']),
  ];
}

// ================================================================== SOIL

export const SOIL_TYPES = ['SAND', 'LOAM', 'CLAY'] as const;
export type SoilType = (typeof SOIL_TYPES)[number];
export const SOIL_LABEL: Record<SoilType, string> = { SAND: 'Sandy soil', LOAM: 'Loamy soil', CLAY: 'Clay soil' };
/** The layers in a sedimentation jar, from the bottom up. */
export const SOIL_LAYERS = ['GRAVEL', 'SAND', 'SILT', 'CLAY'] as const;
export type SoilLayer = (typeof SOIL_LAYERS)[number];
export const SOIL_LAYER_LABEL: Record<SoilLayer, string> = { GRAVEL: 'Gravel and coarse sand', SAND: 'Fine sand', SILT: 'Silt', CLAY: 'Clay' };
/** Settling times of each size of particle (h). */
const SOIL_SETTLE: Record<SoilLayer, number> = { GRAVEL: 0.003, SAND: 0.03, SILT: 0.8, CLAY: 8 };
export const SOIL_MIN_SETTLE = 24;
export const SOIL_CLOCK_MAX = 96;
export const SOIL_DRAIN_TIMES = [1, 2, 5, 10, 20, 30] as const;
export const SOIL_DRAIN_MAX = 40;
export const SOIL_WATER = 100;
export const SOIL_MASSES = [50, 100] as const;
export const SOIL_AIR_SOIL = 50;
export const SOIL_HEAT_MIN = 20;
export const SOIL_MAX_HEATS = 5;
/** The jar drawing's labels (from the top). */
export const SOIL_JAR_LABELS = ['Floating humus', 'Water', 'Clay', 'Silt', 'Fine sand', 'Gravel and coarse sand'] as const;
const SOIL_JAR_DISTRACTORS = ['Air', 'Bedrock'];
/** The jar drawing's label targets (in its 0–200 × 0–160 box; same order as SOIL_JAR_LABELS). */
export const SOIL_JAR_TARGETS: { x: number; y: number }[] = [
  { x: 112, y: 24 },
  { x: 84, y: 58 },
  { x: 118, y: 92 },
  { x: 82, y: 106 },
  { x: 118, y: 121 },
  { x: 82, y: 138 },
];
export const SOIL_CLAIMS = ['CLAY_HOLDS', 'SAND_FAST', 'LOAM_HUMUS', 'SAND_HOLDS', 'CLAY_AIR', 'CLAY_FAST'] as const;
export type SoilClaim = (typeof SOIL_CLAIMS)[number];
export const SOIL_CLAIM_RIGHT: SoilClaim[] = ['CLAY_HOLDS', 'SAND_FAST', 'LOAM_HUMUS'];
export const SOIL_CLAIM_LABEL: Record<SoilClaim, string> = {
  CLAY_HOLDS: 'Clay soil retains the most water (its tiny pores hold it)',
  SAND_FAST: 'Water drains fastest through sandy soil (large pores)',
  LOAM_HUMUS: 'Loamy soil has the most humus',
  SAND_HOLDS: 'Sandy soil retains the most water',
  CLAY_AIR: 'Clay soil has the most air',
  CLAY_FAST: 'Water drains fastest through clay soil',
};

export interface SoilTypeTruth {
  /** Fractions of gravel, sand, silt and clay (sum 1). */
  comp: Record<SoilLayer, number>;
  /** Height of the settled soil in the jar (mm). */
  height: number;
  /** Water held by 100 g of dry soil (cm³). */
  retain: number;
  /** Drainage time constant (min). */
  tau: number;
  /** Air (% of the soil's volume). */
  air: number;
  /** Fraction of the air released without stirring. */
  airUnstirred: number;
  /** Organic matter (% of dry mass). */
  humus: number;
  /** Water in the fresh (undried) soil (% of its mass). */
  moist: number;
  /** Combined water driven off minerals by strong heating (% of dry mass). */
  mineral: number;
}
export interface SoilVariant {
  types: Record<SoilType, SoilTypeTruth>;
  /** Water held by the cotton-wool plug (cm³). */
  cotton: number;
  /** Mass of each crucible (g) and of the soil put in it (g), by crucible slot. */
  crucible: number[];
  sample: number[];
  /** A hot crucible weighs this much less (convection currents) (g). */
  hot: number;
}
function pickSoil(seed: number): SoilVariant {
  const r = labRandom(seed, 'bio-ecology-soil');
  const comp = (g: [number, number], s: [number, number], si: [number, number]): Record<SoilLayer, number> => {
    const a = labBetween(r, g[0], g[1], 3);
    const b = labBetween(r, s[0], s[1], 3);
    const c = labBetween(r, si[0], si[1], 3);
    return { GRAVEL: a, SAND: b, SILT: c, CLAY: roundDp(1 - a - b - c, 3) };
  };
  const types: Record<SoilType, SoilTypeTruth> = {
    SAND: { comp: comp([0.12, 0.2], [0.62, 0.7], [0.05, 0.09]), height: labBetween(r, 46, 54, 1), retain: labBetween(r, 24, 32, 1), tau: labBetween(r, 1.4, 2.6, 2), air: labBetween(r, 32, 40, 1), airUnstirred: labBetween(r, 0.9, 0.96, 2), humus: labBetween(r, 1.0, 2.4, 2), moist: labBetween(r, 4, 7, 1), mineral: labBetween(r, 0.1, 0.25, 2) },
    LOAM: { comp: comp([0.05, 0.1], [0.35, 0.45], [0.25, 0.33]), height: labBetween(r, 44, 52, 1), retain: labBetween(r, 42, 50, 1), tau: labBetween(r, 4.5, 7.5, 2), air: labBetween(r, 24, 32, 1), airUnstirred: labBetween(r, 0.75, 0.85, 2), humus: labBetween(r, 5.0, 8.5, 2), moist: labBetween(r, 10, 16, 1), mineral: labBetween(r, 0.2, 0.4, 2) },
    CLAY: { comp: comp([0.0, 0.03], [0.15, 0.24], [0.25, 0.33]), height: labBetween(r, 40, 48, 1), retain: labBetween(r, 56, 64, 1), tau: labBetween(r, 11, 18, 2), air: labBetween(r, 14, 22, 1), airUnstirred: labBetween(r, 0.45, 0.6, 2), humus: labBetween(r, 2.8, 4.6, 2), moist: labBetween(r, 16, 24, 1), mineral: labBetween(r, 0.4, 0.7, 2) },
  };
  return { types, cotton: labBetween(r, 2, 4, 1), crucible: [labBetween(r, 18, 24, 2), labBetween(r, 18, 24, 2), labBetween(r, 18, 24, 2)], sample: [labBetween(r, 9.6, 10.4, 2), labBetween(r, 9.6, 10.4, 2), labBetween(r, 9.6, 10.4, 2)], hot: labBetween(r, 0.03, 0.06, 2) };
}

export interface SoilJar {
  soil: SoilType;
  /** Jar clock when it was shaken (h); null: not yet. */
  shakenAt: number | null;
}
/** Each layer's settled height in a jar now (mm, true), and how cloudy the water still is (0 clear – 1 muddy). */
export function soilJarNow(v: SoilVariant, j: SoilJar, hours: number): { layers: Record<SoilLayer, number>; cloudy: number } {
  const t = v.types[j.soil];
  const dt = j.shakenAt === null ? 0 : Math.max(0, hours - j.shakenAt);
  const layers = {} as Record<SoilLayer, number>;
  for (const l of SOIL_LAYERS) layers[l] = j.shakenAt === null ? 0 : t.height * t.comp[l] * (1 - Math.exp(-dt / SOIL_SETTLE[l]));
  return { layers, cloudy: j.shakenAt === null ? 0 : t.comp.CLAY > 0 ? Math.exp(-dt / SOIL_SETTLE.CLAY) : 0 };
}
/** A layer's thickness as read on the ruler (to the nearest mm). */
export const soilJarReading = (v: SoilVariant, j: SoilJar, hours: number) => {
  const { layers } = soilJarNow(v, j, hours);
  return Object.fromEntries(SOIL_LAYERS.map((l) => [l, Math.round(layers[l])])) as Record<SoilLayer, number>;
};

export interface SoilFunnel {
  soil: SoilType;
  /** Dry soil put in (g). */
  mass: number;
  /** Plugged with cotton wool. */
  cotton: boolean;
}
/** Water collected below a funnel t minutes after the water was poured (cm³, true). */
export function soilDrained(v: SoilVariant, f: SoilFunnel, t: number): number {
  const s = v.types[f.soil];
  const vmax = SOIL_WATER - (s.retain * f.mass) / 100 - (f.cotton ? v.cotton : 0) + (f.cotton ? 0 : 3);
  return Math.max(0, vmax * (1 - Math.exp(-Math.max(0, t) / (f.cotton ? s.tau : s.tau * 0.7))));
}
/** The measuring cylinder read to the nearest cm³. */
export const soilDrainReading = (v: SoilVariant, f: SoilFunnel, t: number) => Math.round(soilDrained(v, f, t));
export interface SoilAir {
  soil: SoilType;
  stirred: boolean;
  /** The soil has been added to the water. */
  added: boolean;
}
/** The final volume of 50 cm³ of water + 50 cm³ of soil after the air escapes (cm³, to the nearest cm³). */
export function soilAirFinal(v: SoilVariant, a: SoilAir): number {
  const t = v.types[a.soil];
  return Math.round(SOIL_WATER - ((t.air / 100) * SOIL_AIR_SOIL) * (a.stirred ? 1 : t.airUnstirred));
}
export interface SoilCrucible {
  soil: SoilType;
  /** Oven-dried soil (false: damp soil straight from the pit). */
  dried: boolean;
  soilIn: boolean;
  /** Times heated strongly for 20 minutes. */
  heats: number;
  /** Still hot (not cooled in the desiccator since the last heating). */
  hot: boolean;
}
export interface SoilWeigh {
  c: number;
  /** Heatings before this weighing. */
  k: number;
  soilIn: boolean;
  hot: boolean;
}
/** The balance reading (0.01 g) for a weighing of crucible slot c. */
export function soilCrucibleMass(v: SoilVariant, c: number, cr: SoilCrucible, w: Pick<SoilWeigh, 'k' | 'soilIn' | 'hot'>): number {
  const empty = v.crucible[c] ?? 20;
  if (!w.soilIn) return roundDp(empty, 2);
  const t = v.types[cr.soil];
  const m = v.sample[c] ?? 10;
  const dry = cr.dried ? m : m * (1 - t.moist / 100);
  const water = m - dry;
  const k = w.k;
  const organic = (dry * t.humus) / 100;
  const lost = (k > 0 ? water : 0) + organic * (1 - 0.1 ** k) + ((dry * t.mineral) / 100) * (k === 0 ? 0 : k === 1 ? 0.7 : 1);
  return roundDp(empty + m - lost - (w.hot && k > 0 ? v.hot : 0), 2);
}
export interface SoilJarRow {
  GRAVEL: string;
  SAND: string;
  SILT: string;
  CLAY: string;
}
export interface SoilAirRow {
  final: string;
  air: string;
  pct: string;
}
export interface SoilHumusRow {
  empty: string;
  full: string;
  /** After each heating. */
  after: string[];
  loss: string;
  pct: string;
}
export interface SoilWork {
  /** The jar clock (hours). */
  hours: number;
  jars: SoilJar[];
  jarReads: { jar: number; at: number }[];
  jarRows: SoilJarRow[];
  jarPct: SoilJarRow[];
  labels: string[];
  obs: string;
  funnels: SoilFunnel[];
  /** The drainage clock (min since the water was poured; null: not poured). */
  pouredAt: number | null;
  dclock: number;
  dReads: { f: number; t: number }[];
  /** Per funnel, per time column (SOIL_DRAIN_TIMES). */
  dRows: string[][];
  plotted: boolean;
  retained: string[];
  airs: SoilAir[];
  airReads: number[];
  airRows: SoilAirRow[];
  crucibles: SoilCrucible[];
  weighs: SoilWeigh[];
  hRows: SoilHumusRow[];
  claims: SoilClaim[];
}
export const emptySoilJarRow = (): SoilJarRow => ({ GRAVEL: '', SAND: '', SILT: '', CLAY: '' });
export const emptySoilHumusRow = (): SoilHumusRow => ({ empty: '', full: '', after: [], loss: '', pct: '' });
export const emptySoilAirRow = (): SoilAirRow => ({ final: '', air: '', pct: '' });
/** Weighings of crucible c before which its last two cooled masses agreed to 0.01 g (constant mass). */
export function soilConstant(v: SoilVariant, s: Pick<SoilWork, 'crucibles' | 'weighs'>, c: number): boolean {
  const cr = s.crucibles[c];
  if (!cr) return false;
  const cool = s.weighs.filter((x) => x.c === c && x.soilIn && x.k > 0 && !x.hot);
  const byK = new Map<number, number>();
  for (const x of cool) byK.set(x.k, soilCrucibleMass(v, c, cr, x));
  const ks = [...byK.keys()].sort((a, b) => a - b);
  for (let i = 1; i < ks.length; i++) if (ks[i] === ks[i - 1]! + 1 && Math.abs(byK.get(ks[i]!)! - byK.get(ks[i - 1]!)!) <= 0.0100001) return true;
  return false;
}

/** What the jar shows when it is measured (from the truth at that time). */
export function soilJarParts(v: SoilVariant, j: SoilJar, hours: number): EcoPart[] {
  const { cloudy } = soilJarNow(v, j, hours);
  return [
    Pn('the heaviest, coarsest particles (gravel and coarse sand) settled first, at the bottom', ['at the top'], ['bottom', 'first', 'lowest', 'base'], ['gravel', 'coarse', 'heav', 'large', 'big', 'sand', 'stone']),
    P('the finer particles (silt, then clay) settled in layers above them', ['silt', 'clay', 'fine', 'small', 'light']),
    P('humus floated on the water', ['float', 'surface', 'top']),
    cloudy > 0.12 ? P('the water above was still cloudy (fine clay in suspension)', ['cloud', 'muddy', 'turbid', 'suspen', 'murky', 'brown']) : P('the water above had cleared', ['clear', 'clean', 'transparent']),
  ];
}

// ================================================================== variant, state, spec

export interface BioEcologyVariant {
  seed: number;
  task: EcoTask;
  quad: QuadVariant;
  cap: CapVariant;
  fac: FacVariant;
  soil: SoilVariant;
  /** Label chips offered for the jar drawing (the labels and two distractors), seeded order. */
  jarOptions: string[];
}

/** The hidden truth of one attempt (same on the web and the API). */
export function bioEcologyVariant(seed: number, task: EcoTask): BioEcologyVariant {
  const r = labRandom(seed, 'bio-ecology-labels');
  const opts = [...SOIL_JAR_LABELS, ...SOIL_JAR_DISTRACTORS];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [opts[i], opts[j]] = [opts[j]!, opts[i]!];
  }
  return { seed, task, quad: pickQuad(seed), cap: pickCap(seed), fac: pickFac(seed), soil: pickSoil(seed), jarOptions: opts };
}

export interface BioEcologyState {
  v: 1;
  task: EcoTask | null;
  quad: QuadWork;
  cap: CapWork;
  fac: FacWork;
  soil: SoilWork;
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}

export function emptyBioEcologyState(): BioEcologyState {
  return {
    v: 1,
    task: null,
    quad: { pegged: false, quads: [], randIdx: 0, looked: [], rows: [], res: { TRIDAX: emptyQuadResult(), SIDA: emptyQuadResult(), EUPH: emptyQuadResult() }, cover: '', bars: { TRIDAX: null, SIDA: null, EUPH: null }, mostFreq: null, mostDense: null },
    cap: { first: null, counted1: false, mark: null, release: null, clock: 0, second: null, examined: false, freed: false, n1: '', n2: '', m: '', formula: null, N: '', pct: '', density: '', assume: [], errors: [] },
    fac: {
      day: 1,
      h: FAC_DAY_START,
      at: 'STATION',
      reads: [],
      station: [],
      resets: [],
      empties: [],
      secchiRead: false,
      rows: { OPEN: Array.from({ length: FAC_DAYS }, emptyFacRow), SHADE: Array.from({ length: FAC_DAYS }, emptyFacRow) },
      ph: { OPEN: '', SHADE: '' },
      means: { OPEN: emptyFacMean(), SHADE: emptyFacMean() },
      six: Array.from({ length: FAC_DAYS }, () => ({ max: '', min: '', mean: '', range: '' })),
      rain: Array.from({ length: FAC_DAYS }, () => ''),
      rainTotal: '',
      rainMean: '',
      dir: Array.from({ length: FAC_DAYS }, () => ''),
      secchi: '',
      obs: '',
      claims: [],
    },
    soil: { hours: 0, jars: [], jarReads: [], jarRows: [], jarPct: [], labels: [], obs: '', funnels: [], pouredAt: null, dclock: 0, dReads: [], dRows: [], plotted: false, retained: [], airs: [], airReads: [], airRows: [], crucibles: [], weighs: [], hRows: [], claims: [] },
    written: { precautions: '', explain: '' },
    log: [],
  };
}

const short = z.string().max(40);
const herbRec = <T extends z.ZodTypeAny>(t: T) => z.object({ TRIDAX: t, SIDA: t, EUPH: t });
const siteRec = <T extends z.ZodTypeAny>(t: T) => z.object({ OPEN: t, SHADE: t });
const layerRow = z.object({ GRAVEL: short, SAND: short, SILT: short, CLAY: short });
const coord = z.number().int().min(0).max(QUAD_PLOT - 1);
const facRow = z.object({ air: short, soil: short, dry: short, wet: short, rh: short, light: short, wind: short });
const dayN = z.number().int().min(1).max(FAC_DAYS);
export const bioEcologyStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(ECO_TASKS).nullable(),
  quad: z.object({
    pegged: z.boolean(),
    quads: z.array(z.object({ x: coord, y: coord, how: z.enum(['RANDOM', 'CHOSEN']) })).max(QUAD_MAX),
    randIdx: z.number().int().min(0).max(600),
    looked: z.array(z.number().int().min(0).max(QUAD_MAX - 1)).max(QUAD_MAX * 3),
    rows: z.array(z.object({ TRIDAX: short, SIDA: short, EUPH: short, grass: short })).max(QUAD_MAX),
    res: herbRec(z.object({ total: short, density: short, freq: short, pop: short })),
    cover: short,
    bars: herbRec(z.number().min(0).max(100).nullable()),
    mostFreq: z.enum(QUAD_HERBS).nullable(),
    mostDense: z.enum(QUAD_HERBS).nullable(),
  }),
  cap: z.object({
    first: z.object({ effort: z.number().refine((x) => (CAP_EFFORTS as readonly number[]).includes(x), 'not a sweep time') }).nullable(),
    counted1: z.boolean(),
    mark: z.enum(CAP_MARKS).nullable(),
    release: z.enum(CAP_RELEASES).nullable(),
    clock: z.number().min(0).max(CAP_CLOCK_MAX),
    second: z.object({ effort: z.number().refine((x) => (CAP_EFFORTS as readonly number[]).includes(x), 'not a sweep time'), at: z.number().min(0).max(CAP_CLOCK_MAX) }).nullable(),
    examined: z.boolean(),
    freed: z.boolean(),
    n1: short,
    n2: short,
    m: short,
    formula: z.enum(CAP_FORMULAS).nullable(),
    N: short,
    pct: short,
    density: short,
    assume: z.array(z.enum(CAP_ASSUME)).max(CAP_ASSUME.length),
    errors: z.array(z.enum(CAP_ERRORS)).max(CAP_ERRORS.length),
  }),
  fac: z.object({
    day: dayN,
    h: z.number().min(FAC_DAY_START).max(FAC_DAY_END),
    at: z.enum(FAC_PLACES),
    reads: z.array(z.object({ day: dayN, h: z.number().min(FAC_DAY_START).max(FAC_DAY_END), site: z.enum(FAC_SITES), inst: z.enum(FAC_INSTS), shaded: z.boolean() })).max(240),
    station: z.array(z.object({ day: dayN, inst: z.enum(FAC_STATION_INSTS) })).max(60),
    resets: z.array(dayN).max(FAC_DAYS * 3),
    empties: z.array(dayN).max(FAC_DAYS * 3),
    secchiRead: z.boolean(),
    rows: siteRec(z.array(facRow).length(FAC_DAYS)),
    ph: siteRec(short),
    means: siteRec(z.object({ air: short, soil: short, rh: short, light: short, wind: short })),
    six: z.array(z.object({ max: short, min: short, mean: short, range: short })).length(FAC_DAYS),
    rain: z.array(short).length(FAC_DAYS),
    rainTotal: short,
    rainMean: short,
    dir: z.array(short).length(FAC_DAYS),
    secchi: short,
    obs: z.string().max(800),
    claims: z.array(z.enum(FAC_CLAIMS)).max(FAC_CLAIMS.length),
  }),
  soil: z.object({
    hours: z.number().min(0).max(SOIL_CLOCK_MAX),
    jars: z.array(z.object({ soil: z.enum(SOIL_TYPES), shakenAt: z.number().min(0).max(SOIL_CLOCK_MAX).nullable() })).max(3),
    jarReads: z.array(z.object({ jar: z.number().int().min(0).max(2), at: z.number().min(0).max(SOIL_CLOCK_MAX) })).max(40),
    jarRows: z.array(layerRow).max(3),
    jarPct: z.array(layerRow).max(3),
    labels: z.array(z.string().max(40)).max(SOIL_JAR_LABELS.length),
    obs: z.string().max(800),
    funnels: z.array(z.object({ soil: z.enum(SOIL_TYPES), mass: z.number().refine((x) => (SOIL_MASSES as readonly number[]).includes(x), 'not a mass on offer'), cotton: z.boolean() })).max(3),
    pouredAt: z.number().min(0).max(SOIL_DRAIN_MAX).nullable(),
    dclock: z.number().min(0).max(SOIL_DRAIN_MAX),
    dReads: z.array(z.object({ f: z.number().int().min(0).max(2), t: z.number().min(0).max(SOIL_DRAIN_MAX) })).max(80),
    dRows: z.array(z.array(short).length(SOIL_DRAIN_TIMES.length)).max(3),
    plotted: z.boolean(),
    retained: z.array(short).max(3),
    airs: z.array(z.object({ soil: z.enum(SOIL_TYPES), stirred: z.boolean(), added: z.boolean() })).max(3),
    airReads: z.array(z.number().int().min(0).max(2)).max(30),
    airRows: z.array(z.object({ final: short, air: short, pct: short })).max(3),
    crucibles: z.array(z.object({ soil: z.enum(SOIL_TYPES), dried: z.boolean(), soilIn: z.boolean(), heats: z.number().int().min(0).max(SOIL_MAX_HEATS), hot: z.boolean() })).max(3),
    weighs: z.array(z.object({ c: z.number().int().min(0).max(2), k: z.number().int().min(0).max(SOIL_MAX_HEATS), soilIn: z.boolean(), hot: z.boolean() })).max(60),
    hRows: z.array(z.object({ empty: short, full: short, after: z.array(short).max(SOIL_MAX_HEATS), loss: short, pct: short })).max(3),
    claims: z.array(z.enum(SOIL_CLAIMS)).max(SOIL_CLAIMS.length),
  }),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<BioEcologyState>;

export const BIO_ECOLOGY: SimulatorSpec = {
  id: 'bio-ecology',
  subject: 'Biology',
  title: 'Ecology field work: sampling, factors and soil',
  topicNames: ['Population Studies by Sampling', 'Simple measurement of ecological factors', 'Terrestrial habitat', 'Ecology', 'Soil'],
  minutes: 50,
  rubric: [
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide:
        'Quadrats: the plot pegged out; every quadrat placed at coordinates from the random-number table (not where the plants are); at least ten quadrats; each examined before it is recorded. Capture–recapture: the same sweeping time for both samples; a small, harmless, hidden mark; released where they were caught; at least a day (24–48 h) before the recapture; the second catch examined for marks and released. Factors: two contrasting sites read at the same time of day; thermometers shaded from direct sun; readings on three days; the Six’s thermometer reset and the rain gauge emptied after each reading. Soil: the same mass of soil in every funnel, plugged with cotton wool, drained 30 minutes; the soil stirred to release the air; oven-dried soil heated to constant mass, cooled before each weighing; the jar left a day to settle.',
    },
    { id: 'readings', label: 'Readings', marks: 4, how: 'AUTO', guide: 'Quadrats: each herb counted in every quadrat (plants on the frame by the two-sides rule) (3) and the grass cover from the grid (1). Capture: n₁ (1.5), n₂ (1.5) and the marked in the second catch, m (1). Factors: temperatures, hygrometer, light, wind, pH, Secchi depth, the Six’s maximum and minimum and the rain gauge as the instruments showed them (1 each group). Soil: drainage volumes (1.5), final volumes for air (1), crucible masses (1), the jar’s layers (0.5).' },
    { id: 'presentation', label: 'Table, chart or drawing', marks: 3, how: 'AUTO', guide: 'Quadrats: the column totals (1) and a bar chart of density for each herb (2). Capture: the Lincoln formula (1), N worked from your own n₁, n₂ and m (1.5), as a whole number (0.5). Factors: the mean of each factor at each site (1.5) and the relative humidity looked up from your wet- and dry-bulb readings (1.5). Soil: the sedimentation jar labelled (1.5), the drainage graph plotted (0.5), the % of each layer from your heights (1).' },
    { id: 'results', label: 'Results and conclusions', marks: 5, how: 'AUTO', guide: 'Quadrats: density = total ÷ total area sampled (1.5), frequency = quadrats with the species ÷ all quadrats × 100 (1.5), population = density × 400 m² (0.5), the mean grass cover (0.5), the most frequent and the most dense herb (1). Capture: % marked in the second catch (1), density per m² (1), the assumptions (2), sources of error (1). Factors: the Six’s daily mean (1) and range (0.5), the rain total (0.5) and mean (0.5), the comparison of the sites (1) and the organisms that live in each (1.5). Soil: water retained (1), % air (1), % humus (1), what the jar showed (1) and the conclusions (1).' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each), e.g. quadrats placed at random; an edge rule; enough quadrats; a harmless hidden mark; time to mix; the same effort; the same time of day; thermometers shaded; read at eye level; the same mass of soil; oven-dried soil; heat to constant mass; tongs for hot crucibles.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'Quadrats: random sampling gives a representative, unbiased sample, and more quadrats a more reliable estimate. Capture: the proportion marked in the second sample equals the proportion marked in the whole population, so N = n₁n₂ ÷ m — if the assumptions hold. Factors: how light, temperature, humidity and wind decide which organisms live in each site. Soil: particle size decides pore size — water drains through large pores (sand) and is held in tiny ones (clay); humus holds water and nutrients.' },
  ],
};

// ================================================================== model answers (the worked solution, the demo and the tests)

const r1 = (x: number) => String(roundDp(x, 1));
const r2 = (x: number) => String(roundDp(x, 2));

/** A model quadrat survey: pegged out, `n` quadrats from the random-number table, each examined, counted and worked out. */
export function quadModelState(v: BioEcologyVariant, n = 12): BioEcologyState {
  const s = emptyBioEcologyState();
  s.task = 'QUADRAT';
  const w = s.quad;
  w.pegged = true;
  for (let k = 0; k < n; k++) {
    const nx = quadNextRandom(v.quad, w.randIdx);
    if (!nx) break;
    w.quads.push({ x: nx.x, y: nx.y, how: 'RANDOM' });
    w.randIdx = nx.next;
    w.looked.push(w.quads.length - 1);
  }
  w.rows = w.quads.map((q) => ({ TRIDAX: String(quadCount(v.quad, 'TRIDAX', q.x, q.y).exact), SIDA: String(quadCount(v.quad, 'SIDA', q.x, q.y).exact), EUPH: String(quadCount(v.quad, 'EUPH', q.x, q.y).exact), grass: String(quadCover(v.quad, q.x, q.y)) }));
  const nq = w.quads.length;
  for (const h of QUAD_HERBS) {
    const counts = w.rows.map((r) => Number(r[h]));
    const total = counts.reduce((a, b) => a + b, 0);
    const density = total / nq;
    w.res[h] = { total: String(total), density: r2(density), freq: r1((counts.filter((c) => c > 0).length / nq) * 100), pop: String(Math.round(roundDp(density, 2) * QUAD_AREA)) };
    w.bars[h] = roundDp(density, 2);
  }
  w.cover = r1(w.rows.reduce((t, r) => t + Number(r.grass), 0) / nq);
  const best = (k: 'freq' | 'density') => QUAD_HERBS.reduce((a, b) => (Number(w.res[b][k]) > Number(w.res[a][k]) ? b : a));
  w.mostFreq = best('freq');
  w.mostDense = best('density');
  return s;
}

/** A model capture–recapture: 10 min sweeps, a small dot under the thorax, released where caught, recaptured after 24 h, examined and freed. */
export function capModelState(v: BioEcologyVariant, o: { effort?: number; mark?: CapMark; release?: CapRelease; wait?: number } = {}): BioEcologyState {
  const s = emptyBioEcologyState();
  s.task = 'CAPTURE';
  const w = s.cap;
  const effort = o.effort ?? 10;
  const wait = o.wait ?? 24;
  w.first = { effort };
  w.counted1 = true;
  w.mark = o.mark ?? 'DOT';
  w.release = o.release ?? 'SCATTER';
  w.clock = wait;
  w.second = { effort, at: wait };
  w.examined = true;
  w.freed = true;
  const c = capSecondCatch(v.cap, { firstEffort: effort, mark: w.mark, release: w.release, effort, t: wait });
  w.n1 = String(c.n1);
  w.n2 = String(c.n2);
  w.m = String(c.m);
  w.formula = 'A';
  const N = c.m > 0 ? (c.n1 * c.n2) / c.m : 0;
  w.N = String(Math.round(N));
  w.pct = r1(c.n2 ? (c.m / c.n2) * 100 : 0);
  w.density = r2(Math.round(N) / QUAD_AREA);
  w.assume = [...CAP_ASSUME_RIGHT];
  w.errors = [...CAP_ERROR_RIGHT];
  return s;
}

/** A model factors survey: days 1–4 at the weather station (read, reset, empty), both sites at about 10 am on days 1–3 with the thermometers shaded, the pond's Secchi disc on day 1. */
export function facModelState(v: BioEcologyVariant): BioEcologyState {
  const s = emptyBioEcologyState();
  s.task = 'FACTORS';
  const w = s.fac;
  const fv = v.fac;
  for (let day = 1; day <= FAC_DAYS; day++) {
    w.day = day;
    w.h = FAC_DAY_START;
    w.at = 'STATION';
    for (const inst of FAC_STATION_INSTS) w.station.push({ day, inst });
    const six = facSix(fv, day, w.resets);
    const rain = facRain(fv, day, w.empties);
    w.resets.push(day);
    w.empties.push(day);
    w.six[day - 1] = { max: String(six.max), min: String(six.min), mean: String(roundDp((six.max + six.min) / 2, 2)), range: String(roundDp(six.max - six.min, 1)) };
    w.rain[day - 1] = String(rain);
    w.dir[day - 1] = FAC_DIRS[fv.days[day - 1]!.dir]!;
    if (day > FAC_MIN_DAYS) continue;
    w.h = 10;
    for (const site of FAC_SITES) {
      w.at = site;
      w.h = roundDp(w.h + 0.2, 2);
      for (const inst of FAC_INSTS) {
        if (inst === 'PH' && day > 1) continue;
        w.reads.push({ day, h: w.h, site, inst, shaded: true });
        w.h = roundDp(w.h + 0.05, 2);
      }
    }
    if (day === 1) {
      w.at = 'POND';
      w.h = roundDp(w.h + 0.2, 2);
      w.secchiRead = true;
      w.secchi = String(fv.secchi);
    }
  }
  w.reads.forEach((rd, k) => {
    const row = w.rows[rd.site][rd.day - 1]!;
    const shown = facShown(fv, rd, k);
    if (rd.inst === 'AIR') row.air = String(shown.value);
    else if (rd.inst === 'SOIL') row.soil = String(shown.value);
    else if (rd.inst === 'HYGRO') {
      row.dry = String(shown.dry);
      row.wet = String(shown.wet);
      row.rh = String(Math.round(facRH(shown.dry!, shown.wet!)));
    } else if (rd.inst === 'LIGHT') row.light = String(shown.value);
    else if (rd.inst === 'WIND') row.wind = String(shown.value);
    else w.ph[rd.site] = String(shown.value);
  });
  for (const site of FAC_SITES) {
    const rows = w.rows[site].slice(0, FAC_MIN_DAYS);
    const mean = (k: keyof FacMean) => roundDp(rows.reduce((t, r) => t + Number(r[k]), 0) / rows.length, 1);
    w.means[site] = { air: String(mean('air')), soil: String(mean('soil')), rh: String(mean('rh')), light: String(Math.round(rows.reduce((t, r) => t + Number(r.light), 0) / rows.length)), wind: String(mean('wind')) };
  }
  const total = w.rain.reduce((t, x) => t + Number(x), 0);
  w.rainTotal = String(roundDp(total, 1));
  w.rainMean = String(roundDp(total / FAC_DAYS, 2));
  w.obs = 'The open field was brighter, warmer and windier; under the canopy it was cooler and more humid, and the soil was more acidic.';
  w.claims = [...FAC_CLAIM_RIGHT];
  w.h = FAC_DAY_START;
  return s;
}

/** A model soil practical: a loam jar left 24 h; 100 g of each soil with cotton wool, read at every time; stirred air tests; oven-dried soil heated to constant mass. */
export function soilModelState(v: BioEcologyVariant): BioEcologyState {
  const s = emptyBioEcologyState();
  s.task = 'SOIL';
  const w = s.soil;
  const sv = v.soil;
  w.jars = [{ soil: 'LOAM', shakenAt: 0 }];
  w.hours = 24;
  w.jarReads = [{ jar: 0, at: 24 }];
  const jr = soilJarReading(sv, w.jars[0]!, 24);
  w.jarRows = [{ GRAVEL: String(jr.GRAVEL), SAND: String(jr.SAND), SILT: String(jr.SILT), CLAY: String(jr.CLAY) }];
  const tot = SOIL_LAYERS.reduce((t, l) => t + jr[l], 0);
  w.jarPct = [Object.fromEntries(SOIL_LAYERS.map((l) => [l, r1((jr[l] / tot) * 100)])) as unknown as SoilJarRow];
  w.labels = [...SOIL_JAR_LABELS];
  w.obs = soilJarParts(sv, w.jars[0]!, 24).map((p) => p.text).join('; ');
  w.funnels = SOIL_TYPES.map((soil) => ({ soil, mass: 100, cotton: true }));
  w.pouredAt = 0;
  w.dclock = 30;
  w.funnels.forEach((_, f) => SOIL_DRAIN_TIMES.forEach((t) => w.dReads.push({ f, t })));
  w.dRows = w.funnels.map((f) => SOIL_DRAIN_TIMES.map((t) => String(soilDrainReading(sv, f, t))));
  w.plotted = true;
  w.retained = w.funnels.map((f) => String(SOIL_WATER - soilDrainReading(sv, f, 30)));
  w.airs = SOIL_TYPES.map((soil) => ({ soil, stirred: true, added: true }));
  w.airReads = [0, 1, 2];
  w.airRows = w.airs.map((a) => {
    const fin = soilAirFinal(sv, a);
    const air = SOIL_WATER - fin;
    return { final: String(fin), air: String(air), pct: r1((air / SOIL_AIR_SOIL) * 100) };
  });
  w.crucibles = SOIL_TYPES.map((soil) => ({ soil, dried: true, soilIn: true, heats: 0, hot: false }));
  w.hRows = w.crucibles.map((cr, c) => {
    w.weighs.push({ c, k: 0, soilIn: false, hot: false }, { c, k: 0, soilIn: true, hot: false });
    const empty = soilCrucibleMass(sv, c, cr, { k: 0, soilIn: false, hot: false });
    const full = soilCrucibleMass(sv, c, cr, { k: 0, soilIn: true, hot: false });
    const after: string[] = [];
    let k = 0;
    while (k < SOIL_MAX_HEATS) {
      k++;
      w.weighs.push({ c, k, soilIn: true, hot: false });
      after.push(soilCrucibleMass(sv, c, cr, { k, soilIn: true, hot: false }).toFixed(2));
      if (after.length >= 2 && Math.abs(Number(after.at(-1)) - Number(after.at(-2))) <= 0.0100001) break;
    }
    cr.heats = k;
    const loss = roundDp(full - Number(after.at(-1)), 2);
    return { empty: empty.toFixed(2), full: full.toFixed(2), after, loss: loss.toFixed(2), pct: r1((loss / (full - empty)) * 100) };
  });
  w.claims = [...SOIL_CLAIM_RIGHT];
  return s;
}
