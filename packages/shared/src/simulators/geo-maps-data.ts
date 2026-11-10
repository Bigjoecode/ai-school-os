import { z } from 'zod';
import type { GeoSheet, P } from './geo-maps-sheet';
import { dist, nearestOnLine } from './geo-maps-sheet';

/** State, schema and the shared vocabulary of the geo-maps lab (map work and statistical diagrams for WAEC Geography Paper 3). */

export const GEO_TASKS = ['SCALE', 'DISTANCE', 'BEARING', 'GRIDAREA', 'REDUCE', 'RELIEF', 'GRADIENT', 'PROFILE', 'DRAINAGE', 'SETTLE', 'GIS', 'BARS', 'PIE', 'DOTS', 'FLOW', 'CLIMATE', 'CLIMTYPE', 'POPULATION', 'LONGTIME'] as const;
export type GeoTask = (typeof GEO_TASKS)[number];
export const GEO_PRACTICAL_TASKS: Record<string, GeoTask> = {
  'pr-geo-map-scale-conversion': 'SCALE',
  'pr-geo-measuring-distance': 'DISTANCE',
  'pr-geo-direction-bearing': 'BEARING',
  'pr-geo-grid-reference-area': 'GRIDAREA',
  'pr-geo-map-reduction-enlargement': 'REDUCE',
  'pr-geo-relief-features': 'RELIEF',
  'pr-geo-gradient': 'GRADIENT',
  'pr-geo-cross-profile': 'PROFILE',
  'pr-geo-drainage-patterns': 'DRAINAGE',
  'pr-geo-settlement-landuse': 'SETTLE',
  'pr-geo-gis-layers': 'GIS',
  'pr-geo-bar-line-graphs': 'BARS',
  'pr-geo-pie-proportional-circles': 'PIE',
  'pr-geo-dot-density-isopleth': 'DOTS',
  'pr-geo-flow-chart-map': 'FLOW',
  'pr-geo-climate-data': 'CLIMATE',
  'pr-geo-climate-classification': 'CLIMTYPE',
  'pr-geo-population-data': 'POPULATION',
  'pr-geo-longitude-time': 'LONGTIME',
};
export const GEO_TASK_TITLE: Record<GeoTask, string> = {
  SCALE: 'Map scales: types and conversion',
  DISTANCE: 'Straight and curved distances',
  BEARING: 'Direction and bearing',
  GRIDAREA: 'Grid references and area',
  REDUCE: 'Reducing or enlarging a map',
  RELIEF: 'Relief features from contours',
  GRADIENT: 'Calculating gradient',
  PROFILE: 'Cross profile and inter-visibility',
  DRAINAGE: 'Drainage pattern and density',
  SETTLE: 'Settlement and land use',
  GIS: 'GIS layers and raster area',
  BARS: 'Line graph and compound bars',
  PIE: 'Pie chart and proportional circles',
  DOTS: 'Dot, density and isopleth maps',
  FLOW: 'Flow map and flow chart',
  CLIMATE: 'Climograph and climatic statistics',
  CLIMTYPE: 'Identifying climate types',
  POPULATION: 'Population: density, growth and pyramid',
  LONGTIME: 'Latitude, longitude and time',
};

export const GEO_CRITERIA = ['construction', 'readings', 'calculation', 'interpretation'] as const;
export type GeoCrit = (typeof GEO_CRITERIA)[number];

export interface GeoSeg {
  a: P;
  b: P;
}
export interface GeoRun {
  tool: 'STRING' | 'DIVIDERS';
  pts: P[];
}
export interface GeoProtractor {
  c: P;
  t: P;
}
export interface GeoPin {
  k: string;
  p: P;
}
export interface GeoTick {
  d: number;
  h: number;
}
export type GeoSet = number | string | boolean;
export interface GeoMapsState {
  v: 1;
  task: GeoTask | null;
  /** The notebook: every typed reading and answer, by field id. */
  entries: Record<string, string>;
  /** One-of answers by choice id. */
  choices: Record<string, string>;
  /** Ticked items (map elements present). */
  checks: string[];
  /** The ruler's positions the student kept (paper cm). */
  rulers: GeoSeg[];
  /** Thread or dividers laid along a route. */
  runs: GeoRun[];
  protractors: GeoProtractor[];
  /** Grid-square counts: "e,n" → F (complete) or P (part). */
  squares: Record<string, 'F' | 'P'>;
  /** Pins and dots: k says what the pin marks. */
  pins: GeoPin[];
  /** Paper-strip ticks along the section line: distance from the start (cm) and the contour's value (m). */
  ticks: GeoTick[];
  /** Drawn polylines by id (the copied river, GIS line and polygon layers). */
  lines: Record<string, P[]>;
  /** Plotted values by series id. */
  series: Record<string, number[]>;
  /** Builder settings (scale-bar parts, axis ranges, shading class, widths…). */
  sets: Record<string, GeoSet>;
  /** An ordering (pie sectors, flow-chart boxes). */
  seq: Record<string, string[]>;
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}

export const GEO_LIMIT = { rulers: 16, runs: 16, protractors: 12, pins: 160, ticks: 60, linePts: 120, series: 40, sets: 80 };

export function emptyGeoMapsState(): GeoMapsState {
  return { v: 1, task: null, entries: {}, choices: {}, checks: [], rulers: [], runs: [], protractors: [], squares: {}, pins: [], ticks: [], lines: {}, series: {}, sets: {}, seq: {}, written: { precautions: '', explain: '' }, log: [] };
}

const key = z.string().min(1).max(40);
const capped = <T extends z.ZodTypeAny>(s: T, n: number) => s.refine((x: unknown) => Object.keys(x as object).length <= n, { message: 'too many entries' });
const coord = z.number().min(-200).max(200);
const pt = z.tuple([coord, coord]);
export const geoMapsStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(GEO_TASKS).nullable(),
  entries: capped(z.record(key, z.string().max(60)), 80),
  choices: capped(z.record(key, z.string().max(40)), 40),
  checks: z.array(key).max(24),
  rulers: z.array(z.object({ a: pt, b: pt })).max(GEO_LIMIT.rulers),
  runs: z.array(z.object({ tool: z.enum(['STRING', 'DIVIDERS']), pts: z.array(pt).max(400) })).max(GEO_LIMIT.runs),
  protractors: z.array(z.object({ c: pt, t: pt })).max(GEO_LIMIT.protractors),
  squares: capped(z.record(key, z.enum(['F', 'P'])), 80),
  pins: z.array(z.object({ k: key, p: pt })).max(GEO_LIMIT.pins),
  ticks: z.array(z.object({ d: z.number().min(0).max(60), h: z.number().min(-100).max(6000) })).max(GEO_LIMIT.ticks),
  lines: capped(z.record(key, z.array(pt).max(GEO_LIMIT.linePts)), 12),
  series: capped(z.record(key, z.array(z.number().min(-1e7).max(1e8)).max(16)), GEO_LIMIT.series),
  sets: capped(z.record(key, z.union([z.number().min(-1e8).max(1e8), z.string().max(40), z.boolean()])), GEO_LIMIT.sets),
  seq: capped(z.record(key, z.array(key).max(12)), 8),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<GeoMapsState>;

// ------------------------------------------------------------------ the task definition

export type GeoPanel = 'map' | 'scalebar' | 'copy' | 'sketch' | 'section' | 'gis' | 'chart' | 'pie' | 'outline' | 'flow' | 'flowchart' | 'globe';
export const GEO_PANEL_LABEL: Record<GeoPanel, string> = {
  map: 'Map sheet',
  scalebar: 'Linear scale',
  copy: 'Copy grid',
  sketch: 'Contour sketch',
  section: 'Section graph',
  gis: 'GIS layers',
  chart: 'Graph paper',
  pie: 'Compasses and protractor',
  outline: 'Outline map',
  flow: 'Flow map',
  flowchart: 'Flow chart',
  globe: 'Earth grid',
};
export type GeoTool = 'hand' | 'ruler' | 'string' | 'dividers' | 'protractor' | 'romer' | 'squares' | 'pin' | 'strip' | 'pencil';
export const GEO_TOOL_LABEL: Record<GeoTool, string> = {
  hand: 'Move map',
  ruler: 'Ruler',
  string: 'Thread',
  dividers: 'Dividers',
  protractor: 'Protractor',
  romer: 'Tenths square',
  squares: 'Count squares',
  pin: 'Pin',
  strip: 'Paper strip',
  pencil: 'Pencil',
};
export type GeoFieldKind = 'num' | 'rf' | 'oneIn' | 'bearing' | 'ref4' | 'ref6' | 'time';
export interface GeoField {
  id: string;
  label: string;
  unit?: string;
  group?: string;
  kind: GeoFieldKind;
  crit: GeoCrit;
  marks: number;
  truth: number;
  /** ref4/ref6: the printed answer. */
  text?: string;
  tol: number;
  /** tol is a fraction of the answer. */
  rel?: boolean;
  dp: number;
  /** The right answer from the student's own readings (`read` gives their numbers). */
  own?: (read: (id: string) => number | null, s?: GeoMapsState) => number | null;
  note: string;
}
export interface GeoChoice {
  id: string;
  label: string;
  options: { id: string; label: string }[];
  truth: string;
  crit: GeoCrit;
  marks: number;
  note: string;
}
export interface GeoBuild {
  id: string;
  crit: GeoCrit;
  marks: number;
  /** 0–1 of the marks. */
  test: (s: GeoMapsState) => number;
  note: string;
}
export interface GeoStep {
  id: string;
  label: string;
  why: string;
  /** What the demonstrator says while doing it. */
  say: string;
  panel?: GeoPanel;
  tool?: GeoTool;
  done: (s: GeoMapsState) => boolean;
  /** The model way of doing this step (changes the state it is given). */
  apply: (s: GeoMapsState) => void;
}
export interface GeoSeriesDef {
  id: string;
  label: string;
  colour: string;
  target: number[];
  /** Which value axis it uses. */
  axis: 'a' | 'b';
  mark: 'bar' | 'line' | 'stack' | 'left' | 'right';
}
export interface GeoChart {
  id: string;
  title: string;
  cats: string[];
  series: GeoSeriesDef[];
  axisA: { label: string; max: number; step: number };
  axisB?: { label: string; max: number; step: number };
  horizontal?: boolean;
}
export interface GeoRect {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface GeoTaskDef {
  title: string;
  brief: string[];
  panels: GeoPanel[];
  tools: GeoTool[];
  fields: GeoField[];
  choices: GeoChoice[];
  checks: { id: string; label: string }[];
  builds: GeoBuild[];
  steps: GeoStep[];
  solution: string[];
}

// ------------------------------------------------------------------ reading what the student typed

/** A number as written, with any trailing unit dropped ("3.7 km", "1,250", "12 mm"). */
export function geoNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /^\s*([+-]?\d[\d,\s]*(?:\.\d+)?|[+-]?\.\d+)\s*[a-zA-Z°%²/ ]*\d?[a-zA-Z°%²/ ]*$/.exec(raw.replace(/[−–]/g, '-'));
  if (!m) return null;
  const n = Number(m[1]!.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}
/** "1:50 000", "1 : 50000", "1/50000", "50000" → 50000. */
export function geoRf(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /^\s*(?:1\s*[:/]\s*)?(\d[\d,\s]*)\s*$/.exec(raw);
  return m ? Number(m[1]!.replace(/[,\s]/g, '')) : null;
}
/** "1 in 10", "1:10", "10" → 10. Written upside down ("10 in 1") is read as null. */
export function geoOneIn(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /^\s*(?:1\s*(?:in|:|\/)\s*)?(\d+(?:\.\d+)?)\s*$/i.exec(raw);
  return m ? Number(m[1]) : null;
}
/** "14:48", "14.48", "2:48 pm", "2.48 p.m." → minutes after midnight. */
export function geoTime(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*(a\.?m\.?|p\.?m\.?)?\s*$/i.exec(raw);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24) return null;
  const pm = m[3]?.toLowerCase().startsWith('p');
  const am = m[3]?.toLowerCase().startsWith('a');
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return h * 60 + min;
}
export const clock24 = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Is this field's answer right? Marked from the student's own readings where the field says so. */
export function geoFieldOk(f: GeoField, s: GeoMapsState, all: GeoField[]): boolean {
  const raw = s.entries[f.id];
  switch (f.kind) {
    case 'ref4':
      return (raw ?? '').replace(/\s/g, '') === f.text;
    case 'ref6': {
      const m = /^(\d{3})(\d{3})$/.exec((raw ?? '').replace(/\s/g, ''));
      const want = /^(\d{3})(\d{3})$/.exec(f.text ?? '');
      if (!m || !want) return false;
      const near = (a: string, b: string) => {
        const d = Math.abs(Number(a) - Number(b));
        return Math.min(d, 1000 - d) <= f.tol;
      };
      return near(m[1]!, want[1]!) && near(m[2]!, want[2]!);
    }
    case 'bearing': {
      const r = (raw ?? '').trim().replace(/°$/, '');
      if (!/^\d{3}$/.test(r)) return false;
      const d = Math.abs(Number(r) - f.truth) % 360;
      return Math.min(d, 360 - d) <= f.tol + 1e-9;
    }
    case 'time': {
      const m = geoTime(raw);
      return m !== null && Math.abs(m - f.truth) <= f.tol;
    }
    default: {
      const n = f.kind === 'rf' ? geoRf(raw) : f.kind === 'oneIn' ? geoOneIn(raw) : geoNum(raw);
      if (n === null) return false;
      const read = (id: string) => {
        const o = all.find((x) => x.id === id);
        return o?.kind === 'rf' ? geoRf(s.entries[id]) : o?.kind === 'oneIn' ? geoOneIn(s.entries[id]) : geoNum(s.entries[id]);
      };
      const own = f.own?.(read, s) ?? null;
      const near = (want: number) => Math.abs(n - want) <= Math.max(f.rel ? Math.abs(want) * f.tol : f.tol, 1e-9);
      return near(f.truth) || (own !== null && Number.isFinite(own) && near(own));
    }
  }
}

// ------------------------------------------------------------------ was the instrument really used?

export const rulerOn = (s: GeoMapsState, a: P, b: P, tol = 0.3) => s.rulers.some((r) => (dist(r.a, a) <= tol && dist(r.b, b) <= tol) || (dist(r.a, b) <= tol && dist(r.b, a) <= tol));
/** The share of a route the laid thread follows (within `tol` cm). */
export function runCover(runs: GeoRun[], route: readonly P[], tol = 0.35): number {
  if (!route.length || !runs.length) return 0;
  let hit = 0;
  for (const p of route) if (runs.some((r) => r.pts.length > 1 && nearestOnLine(p, r.pts).d <= tol)) hit++;
  return hit / route.length;
}
export const protractorOn = (s: GeoMapsState, a: P, b: P, tol = 0.3, deg = 4) =>
  s.protractors.some((q) => {
    if (dist(q.c, a) > tol) return false;
    const u = (Math.atan2(q.t[0] - q.c[0], q.t[1] - q.c[1]) * 180) / Math.PI;
    const w = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
    const d = Math.abs(((u - w + 540) % 360) - 180);
    return d <= deg;
  });
export const pinsOf = (s: GeoMapsState, k: string) => s.pins.filter((x) => x.k === k);
export const pinNear = (s: GeoMapsState, k: string, p: P, tol: number) => s.pins.some((x) => x.k === k && dist(x.p, p) <= tol);
export const fmtDp = (x: number, dp: number) => x.toFixed(dp);
/** Mean distance between a drawn line and the true one, and how much of the true one it covers. */
export function lineMatch(drawn: readonly P[] | undefined, want: readonly P[], tol: number): { dev: number; cover: number } {
  if (!drawn || drawn.length < 2) return { dev: Infinity, cover: 0 };
  const dev = drawn.reduce((t, p) => t + nearestOnLine(p, want).d, 0) / drawn.length;
  const cover = want.filter((p) => nearestOnLine(p, drawn).d <= tol).length / (want.length || 1);
  return { dev, cover };
}
export type { GeoSheet, P };
