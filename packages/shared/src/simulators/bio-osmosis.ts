import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { bioDrawingPick, type BioDrawingStatement } from './bio-common';
import { phyGraphLineSchema, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom, roundDp } from './seeded';

/**
 * bio-osmosis: WAEC osmosis, plasmolysis and diffusion. The one source of
 * truth for all three: the web shows these readings and the API marks against
 * them.
 *
 * POTATO (pr-bio-osmosis-potato): cylinders bored from one potato, trimmed to
 * 50 mm, blotted, measured (ruler, to 1 mm) and weighed (balance, 0.01 g),
 * soaked 30–60 min (time-lapse) in a sucrose series with a distilled-water
 * control, then blotted, measured and weighed again. Water moves by osmosis:
 * the equilibrium change in mass is proportional to ψ_cell − ψ_solution, i.e.
 * to (isotonic concentration − c), with tissue variability per cylinder; the
 * change approaches equilibrium as 1 − e^(−t/τ). The student tabulates % change,
 * plots % change in mass against concentration and reads the isotonic
 * concentration where the line crosses 0 %.
 *
 * PLASMOLYSIS (pr-bio-plasmolysis): a strip of coloured epidermis mounted in
 * water under the microscope, then irrigated with a strong solution (a drop
 * at one edge drawn under with filter paper at the other), then with water
 * again. The solution under the cover slip mixes in over minutes; each cell's
 * protoplast shrinks once the outside concentration passes its own incipient
 * concentration (to 1 − c_cell/C of its volume) and swells back in water. The
 * student records the views, counts the plasmolysed cells and labels a
 * plasmolysed cell.
 *
 * AGAR (pr-bio-diffusion-agar-cubes): cubes of pink phenolphthalein–alkali
 * agar in dilute HCl. The acid front moves in from every face to a depth
 * d = k√t, so a cube of half-side a is colourless at t = (a/k)². The student
 * measures each cube, works out its surface area, volume and SA : V, times
 * each cube until it is colourless, cuts a spare cube open to measure the
 * depth of the colourless zone, and concludes.
 */

export const OSMO_TASKS = ['POTATO', 'PLASMOLYSIS', 'AGAR'] as const;
export type OsmoTask = (typeof OSMO_TASKS)[number];
/** The lessons that open this lab, and the task each one sets. */
export const OSMO_PRACTICAL_TASKS: Record<string, OsmoTask> = { 'pr-bio-osmosis-potato': 'POTATO', 'pr-bio-plasmolysis': 'PLASMOLYSIS', 'pr-bio-diffusion-agar-cubes': 'AGAR' };
export const OSMO_TASK_TITLE: Record<OsmoTask, string> = { POTATO: 'Osmosis in potato cylinders', PLASMOLYSIS: 'Plasmolysis in epidermal cells', AGAR: 'Diffusion into agar cubes' };

/** One observable fact and the keyword groups a written observation must contain (the same shape as the other biology labs' parts). */
export interface OsmoPart {
  text: string;
  kw: string[][];
  not?: string[];
}
const P = (text: string, ...kw: string[][]): OsmoPart => ({ text, kw });
const Pn = (text: string, not: string[], ...kw: string[][]): OsmoPart => ({ text, kw, not });

/** The x where a drawn line crosses y = 0 (null when it is level or missing). */
export function lineXIntercept(line: PhyGraphLine | null): number | null {
  if (!line) return null;
  const dy = line.y2 - line.y1;
  if (Math.abs(dy) < 1e-12) return null;
  return line.x1 - (line.y1 * (line.x2 - line.x1)) / dy;
}

// ================================================================== POTATO

/** The sucrose solutions on the bench (mol/dm³); 0 is distilled water (the control). */
export const POTATO_CONCS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0] as const;
export const POTATO_MAX_CYL = 8;
/** The soak clock stops here (min). */
export const POTATO_CLOCK_MAX = 180;
/** Cylinders soak at least this long for full marks (min). */
export const POTATO_MIN_SOAK = 30;
export const POTATO_TRIM_MM = 50;
/** The ruler reads to the nearest millimetre. */
export const RULER_MM = 1;
export type PotatoPhase = 'B' | 'A';
export const FIRMNESS = ['FIRM', 'FLACCID', 'SAME'] as const;
export type Firmness = (typeof FIRMNESS)[number];
export const FIRMNESS_LABEL: Record<Firmness, string> = { FIRM: 'Firm (turgid)', FLACCID: 'Soft and bendy (flaccid)', SAME: 'About the same' };
/** A change smaller than this (± % mass) is not felt. */
export const FIRM_THRESHOLD = 1.5;

export interface PotatoCylinderTruth {
  /** Length straight from the borer, before trimming (mm). */
  untrimmed: number;
  /** Length after trimming to 50 mm with the scalpel (mm: the cut is never exact). */
  trimmed: number;
  /** Tissue variability: this cylinder's response relative to the mean. */
  s: number;
  /** This cylinder's isotonic concentration relative to the tuber's (mol/dm³). */
  isoShift: number;
  /** % change in length ÷ % change in mass for this cylinder. */
  lambda: number;
  /** Surface liquid left on it if not blotted (g): fresh-cut sap before, solution after. */
  wet0: number;
  wet1: number;
}
export interface PotatoVariant {
  /** The tuber's isotonic sucrose concentration (mol/dm³): ψ_cell = ψ_solution there. */
  iso: number;
  /** Equilibrium % change in mass per mol/dm³ away from isotonic. */
  slope: number;
  /** Time constant of the water movement (min). */
  tau: number;
  /** Cork-borer bore (mm). */
  diameter: number;
  /** Potato tissue density (g/cm³). */
  density: number;
  cyl: PotatoCylinderTruth[];
}

function pickPotato(seed: number): PotatoVariant {
  const r = labRandom(seed, 'bio-osmosis-potato');
  const iso = labBetween(r, 0.25, 0.35, 3);
  const slope = labBetween(r, 38, 52, 1);
  const tau = labBetween(r, 20, 30, 1);
  const diameter = r() < 0.5 ? 8 : 10;
  const density = labBetween(r, 1.06, 1.09, 3);
  const lam = labBetween(r, 0.45, 0.55, 2);
  const cyl = Array.from({ length: POTATO_MAX_CYL }, () => ({
    untrimmed: labBetween(r, 56, 74, 1),
    trimmed: labBetween(r, 49.6, 50.4, 2),
    s: labBetween(r, 0.94, 1.06, 3),
    isoShift: labBetween(r, -0.012, 0.012, 3),
    lambda: roundDp(lam * labBetween(r, 0.92, 1.08, 3), 3),
    wet0: labBetween(r, 0.02, 0.05, 2),
    wet1: labBetween(r, 0.06, 0.14, 2),
  }));
  return { iso, slope, tau, diameter, density, cyl };
}

/** The equilibrium % change in mass of cylinder i in a solution of c mol/dm³ (∝ ψ_cell − ψ_solution; gains are limited by the wall, losses by the protoplasts' shrinking). */
export function potatoEqPct(v: PotatoVariant, i: number, c: number): number {
  const t = v.cyl[i] ?? v.cyl[0]!;
  const d = v.iso + t.isoShift - c;
  const curv = d > 0 ? 1 - 0.5 * d : 1 + 0.25 * d;
  return v.slope * t.s * d * curv;
}

export interface PotatoCyl {
  /** The solution it soaks in (mol/dm³ sucrose). */
  conc: number;
  /** Trimmed to 50 mm on the tile. */
  trimmed: boolean;
  /** Soak clock when it went into its solution (min); null: not yet. */
  placedAt: number | null;
  /** Soak clock when it was taken out; null: still in (or not yet in). */
  removedAt: number | null;
  /** Blotted dry with filter paper in this phase (before soaking / after). */
  blotB: boolean;
  blotA: boolean;
}
export interface PotatoRow {
  l0: string;
  l1: string;
  m0: string;
  m1: string;
  /** % change in length and in mass. */
  pl: string;
  pm: string;
  firm: Firmness | null;
}
export interface PotatoWork {
  cyl: PotatoCyl[];
  /** The soak clock (min). */
  clock: number;
  /** Every weighing made (what the balance showed depends on the blotting at that moment). */
  weighs: { cyl: number; phase: PotatoPhase; blotted: boolean }[];
  /** Every ruler measurement made. */
  measures: { cyl: number; phase: PotatoPhase }[];
  /** Same order as `cyl`. */
  rows: PotatoRow[];
  line: PhyGraphLine | null;
  /** The isotonic concentration read from the graph (mol/dm³). */
  iso: string;
}

export const potatoSoaked = (c: PotatoCyl, clock: number) => (c.placedAt === null ? 0 : Math.max(0, (c.removedAt ?? clock) - c.placedAt));
/** The phase a cylinder is in: before soaking, soaking, or after. */
export const potatoPhase = (c: PotatoCyl): PotatoPhase | 'SOAK' => (c.placedAt === null ? 'B' : c.removedAt === null ? 'SOAK' : 'A');

export interface PotatoTruth {
  L0: number;
  m0: number;
  L: number;
  m: number;
  /** True % change in mass and length so far. */
  pm: number;
  pl: number;
}
export function potatoTruth(v: PotatoVariant, i: number, c: PotatoCyl, clock: number): PotatoTruth {
  const t = v.cyl[i] ?? v.cyl[0]!;
  const L0 = c.trimmed ? t.trimmed : t.untrimmed;
  const m0 = v.density * Math.PI * (v.diameter / 20) ** 2 * (L0 / 10);
  const f = 1 - Math.exp(-potatoSoaked(c, clock) / v.tau);
  const pm = potatoEqPct(v, i, c.conc) * f;
  const pl = pm * t.lambda;
  return { L0, m0, L: L0 * (1 + pl / 100), m: m0 * (1 + pm / 100), pm, pl };
}
/** What the ruler (to 1 mm) and the balance (to 0.01 g) show for a cylinder in a phase, blotted or not. */
export function potatoReading(v: PotatoVariant, i: number, c: PotatoCyl, clock: number, phase: PotatoPhase, blotted: boolean): { length: number; mass: number } {
  const t = potatoTruth(v, i, c, clock);
  const cy = v.cyl[i] ?? v.cyl[0]!;
  const L = phase === 'B' ? t.L0 : t.L;
  const m = (phase === 'B' ? t.m0 : t.m) + (blotted ? 0 : phase === 'B' ? cy.wet0 : cy.wet1);
  return { length: Math.round(L / RULER_MM) * RULER_MM, mass: roundDp(m, 2) };
}
export function potatoFirmness(pm: number): Firmness {
  return pm > FIRM_THRESHOLD ? 'FIRM' : pm < -FIRM_THRESHOLD ? 'FLACCID' : 'SAME';
}
export const emptyPotatoRow = (): PotatoRow => ({ l0: '', l1: '', m0: '', m1: '', pl: '', pm: '', firm: null });

// ================================================================== PLASMOLYSIS

export const PLAS_MEDIA = ['WATER', 'SUCROSE', 'SALT'] as const;
export type PlasMedium = (typeof PLAS_MEDIA)[number];
export const PLAS_MEDIUM_LABEL: Record<PlasMedium, string> = { WATER: 'Distilled water', SUCROSE: '1.0 mol/dm³ sucrose solution', SALT: 'Concentrated salt (NaCl) solution' };
export const PLAS_MEDIUM_SHORT: Record<PlasMedium, string> = { WATER: 'water', SUCROSE: '1.0 M sucrose', SALT: 'strong salt' };
/** The osmotic strength of each liquid as a sucrose concentration (mol/dm³). */
export const PLAS_MEDIUM_CONC: Record<PlasMedium, number> = { WATER: 0, SUCROSE: 1.0, SALT: 1.6 };
export const PLAS_OBJECTIVES = [10, 40] as const;
export type PlasObjective = (typeof PLAS_OBJECTIVES)[number];
/** Field radius (µm) at each objective (×10 eyepiece, field number 18). */
export const PLAS_FIELD_R: Record<PlasObjective, number> = { 10: 900, 40: 225 };
export const PLAS_CLOCK_MAX = 60;
/** A protoplast this far shrunk (volume fraction lost) is visibly pulled away from the wall. */
export const PLAS_VISIBLE = 0.05;
/** Wait at least this long after irrigating before recording (min). */
export const PLAS_MIN_WAIT = 5;
export const PLAS_STAGES = ['WATER', 'STRONG', 'BACK'] as const;
export type PlasStage = (typeof PLAS_STAGES)[number];
export const PLAS_STAGE_LABEL: Record<PlasStage, string> = { WATER: 'Mounted in water', STRONG: 'In the strong solution', BACK: 'Back in water' };

export const PLAS_CLAIMS = ['TURGID', 'PLASMOLYSED', 'DEPLASMOLYSED', 'WALL_SHRANK', 'SALT_ENTERED', 'BURST'] as const;
export type PlasClaim = (typeof PLAS_CLAIMS)[number];
export const PLAS_CLAIM_LABEL: Record<PlasClaim, string> = {
  TURGID: 'Cells turgid',
  PLASMOLYSED: 'Water lost by osmosis: cells plasmolysed',
  DEPLASMOLYSED: 'Water re-entered: deplasmolysis',
  WALL_SHRANK: 'The cell wall shrank',
  SALT_ENTERED: 'Salt entered and shrank the cells',
  BURST: 'The cells burst',
};

/** The labels of the plasmolysed-cell drawing (in target order). */
export const PLAS_LABELS = ['Cell wall', 'Cell membrane', 'Vacuole (cell sap)', 'Cytoplasm', 'Nucleus', 'External solution'] as const;
const PLAS_DISTRACTORS = ['Chloroplast', 'Air space'];

export interface PlasCell {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Incipient-plasmolysis concentration (mol/dm³ sucrose): the cell sap's strength. */
  c: number;
  /** Protoplast response time (min). */
  tau: number;
  /** Recovery is this many times slower. */
  rec: number;
  /** Damaged when the strip was peeled: no colour, never plasmolyses. */
  dead: boolean;
  /** Killed by a long time in strong salt (stays plasmolysed). */
  saltKill: boolean;
  /** Drawing: how the protoplast pulls away (0–1 per side) and the nucleus's place. */
  shape: [number, number, number, number, number, number];
}
export interface PlasVariant {
  cells: PlasCell[];
  /** Mean incipient concentration (mol/dm³ sucrose). */
  meanC: number;
  /** Mixing time of a liquid drawn under the cover slip (min). */
  tauMix: number;
  /** The cells counted at ×40: centre inside the field. */
  countIdx: number[];
}

function normal(r: () => number) {
  return (r() + r() + r() + r() - 2) * 1.732;
}
function pickPlas(seed: number): PlasVariant {
  const r = labRandom(seed, 'bio-osmosis-plasmolysis');
  const meanC = labBetween(r, 0.38, 0.48, 3);
  const tauMix = labBetween(r, 2.6, 3.8, 2);
  const RF = PLAS_FIELD_R[10] * 1.04;
  const cells: PlasCell[] = [];
  let y = -RF - labBetween(r, 0, 40, 1);
  while (y < RF) {
    const h = labBetween(r, 46, 60, 1);
    let x = -RF - labBetween(r, 0, 100, 1);
    while (x < RF) {
      const w = labBetween(r, 78, 120, 1);
      cells.push({
        x0: roundDp(x, 1),
        x1: roundDp(x + w, 1),
        y0: roundDp(y, 1),
        y1: roundDp(y + h, 1),
        c: roundDp(Math.max(0.2, Math.min(0.85, meanC + 0.1 * normal(r))), 3),
        tau: labBetween(r, 0.8, 3, 2),
        rec: labBetween(r, 1.1, 1.8, 2),
        dead: r() < 0.06,
        saltKill: r() < 0.12,
        shape: [r(), r(), r(), r(), r(), r()].map((x) => roundDp(x, 3)) as PlasCell['shape'],
      });
      x += w;
    }
    y += h;
  }
  const R40 = PLAS_FIELD_R[40];
  const countIdx = cells.map((c, i) => ({ c, i })).filter(({ c }) => Math.hypot((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2) <= R40).map(({ i }) => i);
  return { cells, meanC, tauMix, countIdx };
}

export interface PlasIrrigation {
  to: PlasMedium;
  /** Clock (min). */
  at: number;
  /** Drawn under the cover slip with filter paper at the opposite edge (otherwise just a drop beside it). */
  drawn: boolean;
}
export interface PlasCapture {
  at: number;
  objective: PlasObjective;
}
export interface PlasRow {
  observation: string;
  claims: PlasClaim[];
}
export interface PlasWork {
  peeled: boolean;
  /** The liquid the strip was mounted in (null: not mounted). */
  mount: PlasMedium | null;
  coverslip: boolean;
  onStage: boolean;
  objective: PlasObjective;
  /** Minutes since mounting. */
  clock: number;
  irrigations: PlasIrrigation[];
  /** Views recorded in the notebook. */
  captures: PlasCapture[];
  /** WATER, STRONG, BACK. */
  rows: PlasRow[];
  count: { total: string; plasmolysed: string; pct: string };
  labels: string[];
  drawing: string[];
}

/** The concentration under the cover slip at time t (sucrose mol/dm³). */
export function plasConc(v: PlasVariant, w: Pick<PlasWork, 'mount' | 'irrigations'>, t: number): number {
  if (!w.mount) return 0;
  let c = PLAS_MEDIUM_CONC[w.mount];
  const irr = [...w.irrigations].sort((a, b) => a.at - b.at);
  for (let k = 0; k < irr.length; k++) {
    const it = irr[k]!;
    if (t <= it.at) break;
    const end = Math.min(t, irr[k + 1]?.at ?? Infinity);
    const target = it.drawn ? PLAS_MEDIUM_CONC[it.to] : c + (PLAS_MEDIUM_CONC[it.to] - c) * 0.35;
    const tm = it.drawn ? v.tauMix : v.tauMix * 2;
    c = c + (target - c) * (1 - Math.exp(-(end - it.at) / tm));
  }
  return c;
}

/** Each cell's protoplast shrinkage (volume fraction lost) at time t; `which`: only these cells. */
export function plasShrink(v: PlasVariant, w: Pick<PlasWork, 'mount' | 'irrigations'>, t: number, which?: number[]): { g: number[]; killed: boolean[] } {
  const idx = which ?? v.cells.map((_, i) => i);
  const g = idx.map(() => 0);
  const salty = idx.map(() => 0);
  const killed = idx.map(() => false);
  if (!w.mount || t <= 0) return { g, killed };
  const dt = 0.2;
  for (let x = 0; x < t - 1e-9; x += dt) {
    const step = Math.min(dt, t - x);
    const C = plasConc(v, w, x + step / 2);
    idx.forEach((ci, k) => {
      const cell = v.cells[ci]!;
      if (cell.dead || killed[k]) return;
      if (C >= 1.3) salty[k] += step;
      const target = C > cell.c ? 1 - cell.c / C : 0;
      const rate = target > g[k]! ? 1 / cell.tau : 1 / (cell.tau * cell.rec);
      g[k] = g[k]! + (target - g[k]!) * (1 - Math.exp(-step * rate));
      if (cell.saltKill && salty[k]! > 5) killed[k] = true;
    });
  }
  return { g, killed };
}

/** The stage a capture belongs to: before any strong solution, in it, or back in water after it. */
export function plasStageAt(w: Pick<PlasWork, 'mount' | 'irrigations'>, t: number): PlasStage {
  if (!w.mount) return 'WATER';
  let strong = PLAS_MEDIUM_CONC[w.mount] > 0.3;
  let back = false;
  for (const it of [...w.irrigations].sort((a, b) => a.at - b.at)) {
    if (it.at >= t) break;
    if (PLAS_MEDIUM_CONC[it.to] > 0.3) {
      strong = true;
      back = false;
    } else if (strong) back = true;
  }
  return back ? 'BACK' : strong ? 'STRONG' : 'WATER';
}
/** The latest capture of a stage (index), optionally at one objective. */
export function plasCaptureOf(w: PlasWork, stage: PlasStage, objective?: PlasObjective): number {
  let best = -1;
  w.captures.forEach((c, i) => {
    if (plasStageAt(w, c.at) === stage && (!objective || c.objective === objective) && (best < 0 || c.at >= w.captures[best]!.at)) best = i;
  });
  return best;
}
/** The true count in the ×40 field at time t: cells with their centre inside, and those visibly plasmolysed. */
export function plasCount(v: PlasVariant, w: Pick<PlasWork, 'mount' | 'irrigations'>, t: number): { total: number; plasmolysed: number; alive: number } {
  const { g } = plasShrink(v, w, t, v.countIdx);
  const plasmolysed = g.filter((x) => x >= PLAS_VISIBLE).length;
  const alive = v.countIdx.filter((i) => !v.cells[i]!.dead).length;
  return { total: v.countIdx.length, plasmolysed, alive };
}
/** The irrigation that brought the stage's liquid (the latest strong one, or the water after it). */
export function plasStageIrrigation(w: Pick<PlasWork, 'irrigations'>, stage: PlasStage, before: number): PlasIrrigation | null {
  const irr = [...w.irrigations].filter((x) => x.at < before).sort((a, b) => a.at - b.at);
  const want = (x: PlasIrrigation) => (stage === 'STRONG' ? PLAS_MEDIUM_CONC[x.to] > 0.3 : stage === 'BACK' ? PLAS_MEDIUM_CONC[x.to] <= 0.3 : false);
  return irr.filter(want).at(-1) ?? null;
}

/** What a stage's view showed, as observation parts (from the cells at the capture's time). */
export function plasParts(v: PlasVariant, w: PlasWork, stage: PlasStage, at: number): OsmoPart[] {
  const n = plasCount(v, w, at);
  const frac = n.alive ? n.plasmolysed / n.alive : 0;
  if (stage === 'WATER')
    return [
      Pn('the coloured cell sap fills each cell: the cytoplasm is pressed against the cell wall', ['pulled away', 'shrank', 'shrunk'], ['fill', 'filled', 'pressed', 'against', 'whole', 'entire', 'turgid', 'touch', 'no gap', 'no space']),
      P('the large vacuole is coloured (red-purple)', ['purple', 'red', 'pink', 'violet', 'colour', 'color', 'magenta']),
    ];
  if (stage === 'STRONG') {
    if (frac >= 0.5)
      return [
        Pn('the coloured vacuole shrinks and its colour becomes darker', ['swell', 'expand', 'burst'], ['shrink', 'shrank', 'shrunk', 'smaller', 'contract', 'reduc', 'darker', 'deeper', 'decreas']),
        Pn('the cytoplasm and cell membrane pull away from the cell wall', ['wall shrink', 'wall shrank', 'wall shrunk', 'wall became smaller'], ['away', 'pull', 'separat', 'detach', 'gap', 'space', 'come off', 'came off', 'withdr', 'leave the wall', 'left the wall']),
      ];
    if (frac >= PLAS_VISIBLE) return [P(`only some cells (${n.plasmolysed} of ${n.total}) have the cytoplasm pulled away from the wall`, ['some', 'few', 'only', 'part', 'begin', 'start', 'a number', 'several'])];
    return [P('no visible change yet: the cells still look turgid', ['no change', 'no visible', 'still', 'remain', 'unchanged', 'turgid', 'same'])];
  }
  if (frac < 0.3) return [P('the vacuole swells again and the cytoplasm presses against the wall again (deplasmolysis)', ['swell', 'expand', 'larger', 'bigger', 'regain', 'refill', 'fill', 'back', 'again', 'turgid', 'recover', 'normal', 'increas'])];
  return [P(`many cells (${n.plasmolysed} of ${n.total}) are still plasmolysed: the vacuoles have swelled only a little`, ['still', 'remain', 'partly', 'some', 'slow', 'not yet', 'little'])];
}
export interface PlasInferenceKey {
  need: PlasClaim[];
  allow: PlasClaim[];
}
export function plasInferenceKey(v: PlasVariant, w: PlasWork, stage: PlasStage, at: number): PlasInferenceKey {
  if (stage === 'WATER') return { need: ['TURGID'], allow: ['TURGID'] };
  const n = plasCount(v, w, at);
  const frac = n.alive ? n.plasmolysed / n.alive : 0;
  if (stage === 'STRONG') return frac >= PLAS_VISIBLE ? { need: ['PLASMOLYSED'], allow: ['PLASMOLYSED'] } : { need: ['TURGID'], allow: ['TURGID'] };
  return frac < 0.3 ? { need: ['DEPLASMOLYSED'], allow: ['DEPLASMOLYSED', 'TURGID'] } : { need: ['PLASMOLYSED'], allow: ['PLASMOLYSED', 'DEPLASMOLYSED'] };
}

/** The plasmolysed-cell drawing's label targets (in the drawing's 0–200 × 0–140 box; same order as PLAS_LABELS). */
export const PLAS_DRAWING_TARGETS: { x: number; y: number }[] = [
  { x: 12, y: 24 },
  { x: 60, y: 44 },
  { x: 118, y: 73 },
  { x: 165, y: 72 },
  { x: 62, y: 72 },
  { x: 178, y: 118 },
];

// ================================================================== AGAR

export const AGAR_SIZES = [0.5, 1, 1.5, 2, 3] as const;
export type AgarSize = (typeof AGAR_SIZES)[number];
export const AGAR_MAX_CUBES = 6;
export const AGAR_CLOCK_MAX = 180;
/** Watching the beaker, the cubes are looked at this often (min). */
export const AGAR_LOOK = 0.5;
export const AGAR_ACID = ['FULL', 'SHALLOW'] as const;
export type AgarAcid = (typeof AGAR_ACID)[number];
export const AGAR_ACID_LABEL: Record<AgarAcid, string> = { FULL: '250 cm³ — enough to cover every cube', SHALLOW: '100 cm³ — a shallow layer' };
/** The shallow acid covers cubes up to this side (cm). */
export const AGAR_SHALLOW_COVERS = 1.5;
export const AGAR_CLAIMS = ['RATIO_FASTER', 'SAME_DEPTH', 'LARGE_FIRST', 'LARGE_RATIO', 'OSMOSIS'] as const;
export type AgarClaim = (typeof AGAR_CLAIMS)[number];
export const AGAR_CLAIM_LABEL: Record<AgarClaim, string> = {
  RATIO_FASTER: 'The larger the SA : V ratio, the sooner the whole cube is reached',
  SAME_DEPTH: 'The acid reached the same depth into every cube in the same time',
  LARGE_FIRST: 'The largest cube became colourless first',
  LARGE_RATIO: 'The largest cube has the largest SA : V ratio',
  OSMOSIS: 'The acid entered by osmosis through a membrane',
};

export interface AgarVariant {
  /** Depth of the acid front per √minute (mm). */
  k: number;
  /** Per cube slot: the cut's error on the side (mm) and the agar's own diffusion factor. */
  cubes: { err: number; kf: number }[];
}
function pickAgar(seed: number): AgarVariant {
  const r = labRandom(seed, 'bio-osmosis-agar');
  const k = labBetween(r, 1.5, 2.0, 3);
  const cubes = Array.from({ length: AGAR_MAX_CUBES }, () => ({ err: labBetween(r, -0.6, 0.6, 2), kf: labBetween(r, 0.97, 1.03, 3) }));
  return { k, cubes };
}

export interface AgarCube {
  /** Side cut for (cm). */
  size: AgarSize;
  placedAt: number | null;
  /** Taken out and cut open (min). */
  cutAt: number | null;
}
export interface AgarRow {
  side: string;
  sa: string;
  vol: string;
  ratio: string;
  time: string;
}
export interface AgarWork {
  acid: AgarAcid | null;
  cubes: AgarCube[];
  clock: number;
  /** Intervals the beaker was left unwatched [from, to] (min). */
  away: [number, number][];
  /** Cubes whose side was measured with the ruler; cubes whose cut face was measured. */
  measured: number[];
  depthMeasured: number[];
  /** Same order as `cubes`. */
  rows: AgarRow[];
  depth: { cube: number | null; depth: string; time: string; rate: string; pct: string };
  /** The cube (index) that became colourless first. */
  first: number | null;
  claims: AgarClaim[];
}

export const agarCovered = (w: Pick<AgarWork, 'acid'>, c: AgarCube) => w.acid === 'FULL' || c.size <= AGAR_SHALLOW_COVERS;
/** True side of cube i (mm). */
export const agarSide = (v: AgarVariant, i: number, c: AgarCube) => c.size * 10 + (v.cubes[i]?.err ?? 0);
/** Depth of the colourless zone of cube i at time t (mm, at most half the side). */
export function agarDepth(v: AgarVariant, i: number, c: AgarCube, t: number): number {
  if (c.placedAt === null) return 0;
  const end = c.cutAt ?? t;
  const d = v.k * (v.cubes[i]?.kf ?? 1) * Math.sqrt(Math.max(0, Math.min(t, end) - c.placedAt));
  return Math.min(agarSide(v, i, c) / 2, d);
}
/** The time in the acid (min) for cube i to become completely colourless (an uncovered top slows the last of it). */
export function agarClearTime(v: AgarVariant, i: number, c: AgarCube, w: Pick<AgarWork, 'acid'>): number {
  const a = agarSide(v, i, c) / 2;
  const t = (a / (v.k * (v.cubes[i]?.kf ?? 1))) ** 2;
  return agarCovered(w, c) ? t : t * 1.8;
}
/** The pink core's half-side fraction now (0: colourless). */
export function agarCore(v: AgarVariant, i: number, c: AgarCube, w: Pick<AgarWork, 'acid'>, t: number): number {
  if (c.placedAt === null) return 1;
  const tt = Math.min(t, c.cutAt ?? t) - c.placedAt;
  const T = agarClearTime(v, i, c, w);
  if (tt >= T) return 0;
  return Math.max(0.02, 1 - Math.sqrt(tt / T));
}
/** When the student saw cube i become colourless (min on the clock), or null (not yet, or unwatched). */
export function agarSeenClear(v: AgarVariant, i: number, w: AgarWork): number | null {
  const c = w.cubes[i];
  if (!c || c.placedAt === null) return null;
  const at = c.placedAt + agarClearTime(v, i, c, w);
  const stop = Math.min(w.clock, c.cutAt ?? Infinity);
  if (at > stop + 1e-9) return null;
  // The next look on the half-minute after it cleared, unless the bench was left: then the first look after coming back.
  let t = Math.ceil((at - 1e-9) / AGAR_LOOK) * AGAR_LOOK;
  for (const [a, b] of w.away) if (t > a + 1e-9 && t < b - 1e-9) t = b;
  return t <= stop + 1e-9 ? roundDp(t, 2) : null;
}
export const emptyAgarRow = (): AgarRow => ({ side: '', sa: '', vol: '', ratio: '', time: '' });

/** "3:1", "3 : 1", "3" → 3; "1:3" → 0.333. */
export function parseRatio(raw: string): number | null {
  const s = raw.replace(/[−–]/g, '-').trim();
  if (!s) return null;
  const m = /^(\d*\.?\d+)\s*(?::|to|\/)\s*(\d*\.?\d+)$/.exec(s);
  if (m) return Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ================================================================== variant, state, spec

export interface BioOsmosisVariant {
  seed: number;
  task: OsmoTask;
  potato: PotatoVariant;
  plas: PlasVariant;
  agar: AgarVariant;
  drawing: BioDrawingStatement[];
  /** Label chips offered for the drawing (the labels and two distractors), seeded order. */
  labelOptions: string[];
}

/** The hidden truth of one attempt (same on the web and the API). */
export function bioOsmosisVariant(seed: number, task: OsmoTask): BioOsmosisVariant {
  const r = labRandom(seed, 'bio-osmosis-labels');
  const opts = [...PLAS_LABELS, ...PLAS_DISTRACTORS];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [opts[i], opts[j]] = [opts[j]!, opts[i]!];
  }
  return { seed, task, potato: pickPotato(seed), plas: pickPlas(seed), agar: pickAgar(seed), drawing: bioDrawingPick(seed, 'bio-osmosis'), labelOptions: opts };
}

export interface BioOsmosisState {
  v: 1;
  task: OsmoTask | null;
  potato: PotatoWork;
  plas: PlasWork;
  agar: AgarWork;
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}

export function emptyBioOsmosisState(): BioOsmosisState {
  return {
    v: 1,
    task: null,
    potato: { cyl: [], clock: 0, weighs: [], measures: [], rows: [], line: null, iso: '' },
    plas: { peeled: false, mount: null, coverslip: false, onStage: false, objective: 10, clock: 0, irrigations: [], captures: [], rows: PLAS_STAGES.map(() => ({ observation: '', claims: [] })), count: { total: '', plasmolysed: '', pct: '' }, labels: [], drawing: [] },
    agar: { acid: null, cubes: [], clock: 0, away: [], measured: [], depthMeasured: [], rows: [], depth: { cube: null, depth: '', time: '', rate: '', pct: '' }, first: null, claims: [] },
    written: { precautions: '', explain: '' },
    log: [],
  };
}

const short = z.string().max(40);
const clockN = (max: number) => z.number().min(0).max(max);
const conc = z.number().refine((x) => (POTATO_CONCS as readonly number[]).includes(x), 'not a solution on the bench');
const size = z.number().refine((x) => (AGAR_SIZES as readonly number[]).includes(x), 'not a cube size') as unknown as z.ZodType<AgarSize>;
export const bioOsmosisStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(OSMO_TASKS).nullable(),
  potato: z.object({
    cyl: z.array(z.object({ conc, trimmed: z.boolean(), placedAt: clockN(POTATO_CLOCK_MAX).nullable(), removedAt: clockN(POTATO_CLOCK_MAX).nullable(), blotB: z.boolean(), blotA: z.boolean() })).max(POTATO_MAX_CYL),
    clock: clockN(POTATO_CLOCK_MAX),
    weighs: z.array(z.object({ cyl: z.number().int().min(0).max(POTATO_MAX_CYL - 1), phase: z.enum(['B', 'A']), blotted: z.boolean() })).max(120),
    measures: z.array(z.object({ cyl: z.number().int().min(0).max(POTATO_MAX_CYL - 1), phase: z.enum(['B', 'A']) })).max(120),
    rows: z.array(z.object({ l0: short, l1: short, m0: short, m1: short, pl: short, pm: short, firm: z.enum(FIRMNESS).nullable() })).max(POTATO_MAX_CYL),
    line: phyGraphLineSchema.nullable(),
    iso: short,
  }),
  plas: z.object({
    peeled: z.boolean(),
    mount: z.enum(PLAS_MEDIA).nullable(),
    coverslip: z.boolean(),
    onStage: z.boolean(),
    objective: z.union([z.literal(10), z.literal(40)]),
    clock: clockN(PLAS_CLOCK_MAX),
    irrigations: z.array(z.object({ to: z.enum(PLAS_MEDIA), at: clockN(PLAS_CLOCK_MAX), drawn: z.boolean() })).max(12),
    captures: z.array(z.object({ at: clockN(PLAS_CLOCK_MAX), objective: z.union([z.literal(10), z.literal(40)]) })).max(40),
    rows: z.array(z.object({ observation: z.string().max(600), claims: z.array(z.enum(PLAS_CLAIMS)).max(6) })).length(PLAS_STAGES.length),
    count: z.object({ total: short, plasmolysed: short, pct: short }),
    labels: z.array(z.string().max(40)).max(PLAS_LABELS.length),
    drawing: z.array(z.string().max(20)).max(20),
  }),
  agar: z.object({
    acid: z.enum(AGAR_ACID).nullable(),
    cubes: z.array(z.object({ size, placedAt: clockN(AGAR_CLOCK_MAX).nullable(), cutAt: clockN(AGAR_CLOCK_MAX).nullable() })).max(AGAR_MAX_CUBES),
    clock: clockN(AGAR_CLOCK_MAX),
    away: z.array(z.tuple([clockN(AGAR_CLOCK_MAX), clockN(AGAR_CLOCK_MAX)])).max(60),
    measured: z.array(z.number().int().min(0).max(AGAR_MAX_CUBES - 1)).max(AGAR_MAX_CUBES * 4),
    depthMeasured: z.array(z.number().int().min(0).max(AGAR_MAX_CUBES - 1)).max(AGAR_MAX_CUBES * 4),
    rows: z.array(z.object({ side: short, sa: short, vol: short, ratio: short, time: short })).max(AGAR_MAX_CUBES),
    depth: z.object({ cube: z.number().int().min(0).max(AGAR_MAX_CUBES - 1).nullable(), depth: short, time: short, rate: short, pct: short }),
    first: z.number().int().min(0).max(AGAR_MAX_CUBES - 1).nullable(),
    claims: z.array(z.enum(AGAR_CLAIMS)).max(AGAR_CLAIMS.length),
  }),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<BioOsmosisState>;

export const BIO_OSMOSIS: SimulatorSpec = {
  id: 'bio-osmosis',
  subject: 'Biology',
  title: 'Osmosis, plasmolysis and diffusion',
  topicNames: ['The Cell and its Environment', 'Osmosis', 'Diffusion', 'Plasmolysis', 'Movement of substances into and out of cells'],
  minutes: 45,
  rubric: [
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide:
        'Potato: every cylinder trimmed to the same length before measuring; at least five solutions including distilled water (the control), on both sides of the isotonic point; every cylinder blotted dry before every weighing; all put in at the same time and soaked at least 30 minutes; each measured and weighed before and after. Plasmolysis: mounted in water under a cover slip; looked at under low power before high power; the strong solution drawn under the cover slip with filter paper; at least 5 minutes before recording; then water drawn under and the cells looked at again after at least 5 minutes. Agar: at least three sizes of cube; all put in the acid at the same time; enough acid to cover them; a spare cube cut open and the depth of its colourless zone measured.',
    },
    { id: 'readings', label: 'Readings', marks: 4, how: 'AUTO', guide: 'Potato: lengths read on the ruler to the nearest millimetre (2) and masses as the balance showed them, to 0.01 g (2). Plasmolysis: the cells counted in the field at high power (1.5), those plasmolysed (1.5) and the percentage worked out (1). Agar: each cube’s side (1), the time each became colourless from your own watching (2) and the depth of the colourless zone (1).' },
    { id: 'presentation', label: 'Graph, drawing or table', marks: 3, how: 'AUTO', guide: 'Potato: % change in mass plotted against concentration (at least five points, gains and losses) with a straight best-fit line drawn across them (3). Plasmolysis: the drawing of a plasmolysed cell labelled — cell wall, cell membrane, vacuole, cytoplasm, nucleus and the external solution in the space (2); and the drawing rules (1). Agar: surface area (cm²), volume (cm³) and SA : V worked out from your own measured sides (1 each).' },
    { id: 'results', label: 'Results and conclusions', marks: 5, how: 'AUTO', guide: 'Potato: % change = (final − initial) ÷ initial × 100, with its sign, for mass (1.5) and length (1); firm (turgid) or soft (flaccid) for each cylinder (1); the isotonic concentration where your line crosses 0 % (1) and close to the true value (0.5). Plasmolysis: what you saw in water, in the strong solution and back in water (3), and the inference for each (2). Agar: the rate of diffusion = depth ÷ time (1); the percentage of the cut cube that was colourless (1); which cube went colourless first (1); the conclusion about SA : V (2).' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each). Potato: cylinders from the same tuber with the same borer; blotted the same way before each weighing; fully covered by equal volumes; the same soaking time. Plasmolysis: a thin, single layer of epidermis; the solution drawn right under the cover slip; enough time before observing; avoid drying out under the lamp. Agar: cubes cut accurately; all into the acid at the same moment; the same acid and temperature; fully covered; handle with forceps, eye protection.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'Potato: in dilute solutions water enters the cells by osmosis (higher water potential outside), they become turgid and the cylinder longer and heavier; in strong solutions water leaves, the cells become flaccid; at the isotonic concentration there is no net movement. Plasmolysis: water leaves the vacuole by osmosis through the partially permeable membrane into the stronger solution, the protoplast shrinks from the wall, the fully permeable wall lets the solution fill the space; in water it re-enters (deplasmolysis), and the wall stops the cell bursting. Agar: smaller cubes have a larger surface area for their volume and a shorter distance to the centre, so diffusion reaches all of them sooner — why large organisms need transport and gas-exchange systems.' },
  ],
};

// ================================================================== model answers (the worked solution, the demo and the tests)

/** A model potato run: six solutions, trimmed, blotted, measured and weighed, soaked 60 min together, recorded, graphed. */
export function potatoModelState(v: BioOsmosisVariant, concs: number[] = [0, 0.2, 0.3, 0.4, 0.6, 0.8], soak = 60): BioOsmosisState {
  const s = emptyBioOsmosisState();
  s.task = 'POTATO';
  const w = s.potato;
  w.cyl = concs.map((c) => ({ conc: c, trimmed: true, placedAt: 0, removedAt: soak, blotB: true, blotA: true }));
  w.clock = soak;
  w.cyl.forEach((_, i) => {
    w.measures.push({ cyl: i, phase: 'B' }, { cyl: i, phase: 'A' });
    w.weighs.push({ cyl: i, phase: 'B', blotted: true }, { cyl: i, phase: 'A', blotted: true });
  });
  w.rows = w.cyl.map((c, i) => {
    const b = potatoReading(v.potato, i, c, w.clock, 'B', true);
    const a = potatoReading(v.potato, i, c, w.clock, 'A', true);
    const pl = ((a.length - b.length) / b.length) * 100;
    const pm = ((a.mass - b.mass) / b.mass) * 100;
    return { l0: String(b.length), l1: String(a.length), m0: b.mass.toFixed(2), m1: a.mass.toFixed(2), pl: pl.toFixed(1), pm: pm.toFixed(1), firm: potatoFirmness(potatoTruth(v.potato, i, c, w.clock).pm) };
  });
  const pts = w.cyl.map((c, i) => ({ x: c.conc, y: Number(w.rows[i]!.pm) }));
  const fit = lsq(pts);
  const x1 = Math.min(...pts.map((p) => p.x));
  const x2 = Math.max(...pts.map((p) => p.x));
  w.line = { x1, y1: roundDp(fit.a + fit.b * x1, 3), x2, y2: roundDp(fit.a + fit.b * x2, 3) };
  w.iso = String(roundDp(lineXIntercept(w.line) ?? 0, 2));
  return s;
}
function lsq(pts: { x: number; y: number }[]) {
  const n = pts.length;
  const mx = pts.reduce((t, p) => t + p.x, 0) / n;
  const my = pts.reduce((t, p) => t + p.y, 0) / n;
  const sxx = pts.reduce((t, p) => t + (p.x - mx) ** 2, 0) || 1;
  const b = pts.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0) / sxx;
  return { a: my - b * mx, b };
}

/** A model plasmolysis run: mounted in water (×10 then ×40 recorded), strong salt or sucrose drawn under, 10 min, recorded and counted, water drawn under, 10 min, recorded. */
export function plasModelState(v: BioOsmosisVariant, medium: PlasMedium = 'SUCROSE'): BioOsmosisState {
  const s = emptyBioOsmosisState();
  s.task = 'PLASMOLYSIS';
  const w = s.plas;
  Object.assign(w, { peeled: true, mount: 'WATER', coverslip: true, onStage: true, objective: 40 });
  w.captures = [
    { at: 1, objective: 10 },
    { at: 2, objective: 40 },
  ];
  w.irrigations = [{ to: medium, at: 3, drawn: true }];
  w.captures.push({ at: 13, objective: 40 });
  w.irrigations.push({ to: 'WATER', at: 14, drawn: true });
  w.captures.push({ at: 26, objective: 40 });
  w.clock = 26;
  w.rows = PLAS_STAGES.map((st) => {
    const ci = plasCaptureOf(w, st);
    const at = w.captures[ci]!.at;
    return { observation: plasParts(v.plas, w, st, at).map((p) => p.text).join('; '), claims: [...plasInferenceKey(v.plas, w, st, at).need] };
  });
  const n = plasCount(v.plas, w, 13);
  w.count = { total: String(n.total), plasmolysed: String(n.plasmolysed), pct: String(roundDp((n.plasmolysed / n.total) * 100, 1)) };
  w.labels = [...PLAS_LABELS];
  w.drawing = v.drawing.filter((d) => d.good).map((d) => d.id);
  return s;
}

/** A model agar run: cubes of 1, 2 and 3 cm and a spare 2 cm cube, covered, all in together, the spare cut at 5 min, watched until all are colourless. */
export function agarModelState(v: BioOsmosisVariant, sizes: AgarSize[] = [1, 2, 3, 2], cutAt = 5): BioOsmosisState {
  const s = emptyBioOsmosisState();
  s.task = 'AGAR';
  const w = s.agar;
  w.acid = 'FULL';
  w.cubes = sizes.map((size) => ({ size, placedAt: 0, cutAt: null }));
  const spare = sizes.length - 1;
  w.cubes[spare]!.cutAt = cutAt;
  const last = Math.max(...w.cubes.map((c, i) => (i === spare ? 0 : agarClearTime(v.agar, i, c, w))));
  w.clock = Math.min(AGAR_CLOCK_MAX, Math.ceil(last + 1));
  w.measured = w.cubes.map((_, i) => i);
  w.depthMeasured = [spare];
  w.rows = w.cubes.map((c, i) => {
    const side = Math.round(agarSide(v.agar, i, c)) / 10;
    const seen = i === spare ? null : agarSeenClear(v.agar, i, w);
    return { side: side.toFixed(1), sa: roundDp(6 * side * side, 2).toString(), vol: roundDp(side ** 3, 3).toString(), ratio: `${roundDp(6 / side, 2)} : 1`, time: seen === null ? '' : String(seen) };
  });
  const d = Math.round(agarDepth(v.agar, spare, w.cubes[spare]!, cutAt));
  const sMm = Math.round(agarSide(v.agar, spare, w.cubes[spare]!));
  w.depth = { cube: spare, depth: String(d), time: String(cutAt), rate: String(roundDp(d / cutAt, 2)), pct: String(roundDp((1 - ((sMm - 2 * d) / sMm) ** 3) * 100, 1)) };
  const timed = w.cubes.map((c, i) => ({ i, t: i === spare ? Infinity : agarClearTime(v.agar, i, c, w) }));
  w.first = timed.reduce((a, b) => (b.t < a.t ? b : a)).i;
  w.claims = ['RATIO_FASTER', 'SAME_DEPTH'];
  return s;
}
