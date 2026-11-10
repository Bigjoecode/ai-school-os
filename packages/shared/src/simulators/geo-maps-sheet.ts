import { labBetween, labPick, labRandom } from './seeded';

/**
 * The geo-maps topographical sheet: an original, fictional map worked out from
 * a seed, so the web lab and the grader agree on every height, river and road.
 *
 * All coordinates are PAPER centimetres on a 20 × 16 cm sheet (x east, y north,
 * origin at the south-west corner), which is what the student's ruler sees.
 * The land is a height function: a curved tilt from lowland to upland, placed
 * hills, a ridge, a spur and a flat plateau, gentle ripples, and valleys carved
 * along the stream network so contours really V upstream.
 */

export type P = [number, number];
export const SHEET_W = 20;
export const SHEET_H = 16;
/** The grid is ruled every 2 cm on the paper, whatever the scale. */
export const SQUARE_CM = 2;
export const SQUARES_E = SHEET_W / SQUARE_CM;
export const SQUARES_N = SHEET_H / SQUARE_CM;

export const DRAINAGE_PATTERNS = ['DENDRITIC', 'TRELLIS', 'RADIAL', 'PARALLEL'] as const;
export type DrainagePattern = (typeof DRAINAGE_PATTERNS)[number];

export interface GeoBump {
  x: number;
  y: number;
  /** Height added at the centre (m); when `flat` is set the land is levelled to that height instead. */
  a: number;
  sa: number;
  sb: number;
  rot: number;
  pow: number;
  flat?: number;
}
export interface GeoStream {
  pts: P[];
  /** Bed height at each point (m), falling from source to mouth. */
  bed: number[];
  order: 1 | 2 | 3;
  main: boolean;
  wid: number;
  box: [number, number, number, number];
}
export type RoadKind = 'MAIN' | 'MINOR' | 'TRACK' | 'RAIL';
export interface GeoRoad {
  id: string;
  kind: RoadKind;
  pts: P[];
}
export type SettlementKind = 'TOWN' | 'VILLAGE' | 'LINEAR' | 'HAMLET';
export interface GeoSettlement {
  id: string;
  name: string;
  kind: SettlementKind;
  p: P;
  /** Road direction at the settlement (LINEAR villages are drawn along it). */
  along?: number;
}
export type FeatureKind = 'SCHOOL' | 'CHURCH' | 'MOSQUE' | 'MARKET' | 'POST' | 'QUARRY' | 'TRIG' | 'SPOT' | 'FALLS' | 'BOREHOLE';
export interface GeoFeature {
  id: string;
  kind: FeatureKind;
  p: P;
  /** Printed height (m) for TRIG and SPOT. */
  h?: number;
}
export interface GeoSheet {
  seed: number;
  name: string;
  river: string;
  denom: number;
  /** Ground km represented by one paper cm. */
  kmPerCm: number;
  /** Ground km² in one 2 cm grid square. */
  squareKm2: number;
  interval: number;
  eastBase: number;
  northBase: number;
  pattern: DrainagePattern;
  uphill: P;
  tiltBase: number;
  tiltRise: number;
  centre: P;
  span: number;
  spanV: number;
  ripple: number[];
  bumps: GeoBump[];
  streams: GeoStream[];
  roads: GeoRoad[];
  settlements: GeoSettlement[];
  features: GeoFeature[];
  forest: P[];
  plantation: P[];
  swamp: P[];
  relief: Partial<Record<ReliefKind, P>>;
}
export type ReliefKind = 'CONICAL' | 'HILL' | 'SADDLE' | 'RIDGE' | 'SPUR' | 'VALLEY' | 'PLATEAU' | 'ESCARPMENT' | 'PLAIN';

// ------------------------------------------------------------------ geometry

export const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const polyLength = (pts: readonly P[]) => pts.reduce((t, p, i) => (i ? t + dist(pts[i - 1]!, p) : 0), 0);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const inSheet = (p: P, m = 0) => p[0] >= m && p[0] <= SHEET_W - m && p[1] >= m && p[1] <= SHEET_H - m;

/** Nearest distance from a point to a polyline, and how far along it that is (cm). */
export function nearestOnLine(p: P, pts: readonly P[]): { d: number; along: number } {
  let best = Infinity;
  let at = 0;
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1) : 0;
    const qx = a[0] + t * dx - p[0];
    const qy = a[1] + t * dy - p[1];
    const d = qx * qx + qy * qy;
    const len = Math.sqrt(len2);
    if (d < best) {
      best = d;
      at = run + t * len;
    }
    run += len;
  }
  return { d: Math.sqrt(best), along: at };
}
/** The part of a polyline between two distances along it. */
export function sliceLine(pts: readonly P[], from: number, to: number): P[] {
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  const out: P[] = [];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = dist(a, b);
    const at = (s: number): P => [a[0] + ((b[0] - a[0]) * (s - run)) / (len || 1), a[1] + ((b[1] - a[1]) * (s - run)) / (len || 1)];
    if (run + len >= lo && run <= hi) {
      if (!out.length) out.push(at(Math.max(lo, run)));
      out.push(at(Math.min(hi, run + len)));
    }
    run += len;
  }
  return out;
}
/** Catmull-Rom through the points, sampled about every `step` cm. */
export function smoothLine(pts: readonly P[], step = 0.25): P[] {
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);
  const out: P[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const n = Math.max(2, Math.ceil(dist(p1, p2) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([pts[pts.length - 1]![0], pts[pts.length - 1]![1]]);
  return out;
}
/** Shoelace area (cm²). */
export function polyArea(pts: readonly P[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}
export function inPolygon(p: P, poly: readonly P[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Which way a → b points: whole-circle bearing in degrees, clockwise from grid north. */
export const bearingOf = (a: P, b: P) => ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
export const COMPASS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;
export const compass16 = (deg: number) => COMPASS_16[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]!;
export const compass8 = (deg: number) => (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const)[Math.round(((deg % 360) + 360) % 360 / 45) % 8]!;

// ------------------------------------------------------------------ the land

function rawHeight(s: Pick<GeoSheet, 'uphill' | 'centre' | 'span' | 'tiltBase' | 'tiltRise' | 'ripple' | 'bumps'>, x: number, y: number): number {
  const t = clamp(((x - s.centre[0]) * s.uphill[0] + (y - s.centre[1]) * s.uphill[1]) / s.span + 0.5, 0, 1.15);
  let h = s.tiltBase + s.tiltRise * t ** 1.6;
  const r = s.ripple;
  h += r[0]! * Math.sin(x * 0.55 + r[1]!) * Math.cos(y * 0.47 + r[2]!) + r[3]! * Math.sin(x * 1.05 + y * 0.8 + r[4]!);
  for (const b of s.bumps) {
    if (b.flat !== undefined) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    const c = Math.cos(b.rot);
    const q = Math.sin(b.rot);
    const u = (dx * c + dy * q) / b.sa;
    const v = (-dx * q + dy * c) / b.sb;
    h += b.a * Math.exp(-((u * u + v * v) ** b.pow));
  }
  for (const b of s.bumps) {
    if (b.flat === undefined) continue;
    const u = (x - b.x) / b.sa;
    const v = (y - b.y) / b.sb;
    h += (b.flat - h) * Math.exp(-((u * u + v * v) ** b.pow));
  }
  return h;
}

/** How strongly a stream pulls this point towards its bed, and the bed height there. */
function pull(x: number, y: number, s: GeoStream): [number, number] {
  if (x < s.box[0] || x > s.box[2] || y < s.box[1] || y > s.box[3]) return [0, 0];
  let best = Infinity;
  let bed = 0;
  const pts = s.pts;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1e-9;
    const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / len2, 0, 1);
    const qx = a[0] + t * dx - x;
    const qy = a[1] + t * dy - y;
    const d = qx * qx + qy * qy;
    if (d < best) {
      best = d;
      bed = s.bed[i - 1]! + t * (s.bed[i]! - s.bed[i - 1]!);
    }
  }
  return [Math.exp(-((Math.sqrt(best) / s.wid) ** 1.3)), bed];
}

/** The height of the land (m) at a point on the paper: the nearest stream's bed dominates close to it. */
export function geoHeight(s: GeoSheet, x: number, y: number): number {
  const raw = rawHeight(s, x, y);
  let keep = 1;
  let sum = 0;
  let wt = 0;
  for (const st of s.streams) {
    const [w, bed] = pull(x, y, st);
    if (w < 1e-4) continue;
    keep *= 1 - w;
    const w6 = w ** 16;
    sum += w6 * bed;
    wt += w6;
  }
  return wt ? raw + (sum / wt - raw) * (1 - keep) : raw;
}

// ------------------------------------------------------------------ building a sheet

const SYL_A = ['Ad', 'Ay', 'Ob', 'Ok', 'Um', 'Ig', 'Ez', 'Bal', 'Kur', 'Tan', 'Dan', 'Zar', 'Eb', 'If', 'Ow', 'Nk', 'Sab', 'Gur', 'Mar', 'Lok'];
const SYL_B = ['ori', 'ebe', 'ama', 'una', 'ako', 'ela', 'uru', 'ofa', 'idu', 'anu', 'ewa', 'ilo', 'osa', 'ari'];
const fictional = (rng: () => number, used: Set<string>) => {
  for (;;) {
    const n = labPick(rng, SYL_A) + labPick(rng, SYL_B);
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
};

type Frame = { at: (t: number, c: number) => P; tOf: (p: P) => number; cOf: (p: P) => number };
function frameOf(uphill: P, centre: P, span: number, spanV: number): Frame {
  const v: P = [-uphill[1], uphill[0]];
  return {
    at: (t, c) => [centre[0] + uphill[0] * (t - 0.5) * span + v[0] * (c - 0.5) * spanV, centre[1] + uphill[1] * (t - 0.5) * span + v[1] * (c - 0.5) * spanV],
    tOf: (p) => ((p[0] - centre[0]) * uphill[0] + (p[1] - centre[1]) * uphill[1]) / span + 0.5,
    cOf: (p) => ((p[0] - centre[0]) * v[0] + (p[1] - centre[1]) * v[1]) / spanV + 0.5,
  };
}
/** The inside-the-sheet run of a line. */
const clipInside = (pts: P[]) => {
  let best: P[] = [];
  let cur: P[] = [];
  for (const p of pts) {
    if (inSheet(p, 0.02)) cur.push(p);
    else {
      if (cur.length > best.length) best = cur;
      cur = [];
    }
  }
  return cur.length > best.length ? cur : best;
};

type Draft = { pts: P[]; order: 1 | 2 | 3; main: boolean; into: number | null };

function draftStreams(rng: () => number, f: Frame, pattern: DrainagePattern, hub: P): Draft[] {
  const out: Draft[] = [];
  const wig = (a: number, n: number) => {
    const p1 = rng() * 6.28;
    const p2 = rng() * 6.28;
    return (k: number) => a * (Math.sin(k * n + p1) * 0.7 + Math.sin(k * n * 2.3 + p2) * 0.3);
  };
  const addCurve = (pts: P[], order: 1 | 2 | 3, main: boolean, into: number | null) => {
    const line = clipInside(smoothLine(pts, 0.25));
    if (line.length >= 6) out.push({ pts: line, order, main, into });
  };
  const trib = (mainIdx: number, tj: number, side: number, dt: number, dc: number, order: 1 | 2) => {
    const m = out[mainIdx]!.pts;
    const j = m.find((p) => f.tOf(p) <= tj) ?? m[Math.floor(m.length / 2)]!;
    const jt = f.tOf(j);
    const jc = f.cOf(j);
    const w = wig(0.018, 9);
    const pts: P[] = [];
    for (let k = 1; k >= 0; k -= 0.2) pts.push(k === 0 ? j : f.at(jt + dt * k, jc + side * dc * k + w(k) * (k > 0 ? 1 : 0)));
    pts[pts.length - 1] = j;
    addCurve(pts, order, false, mainIdx);
    return out.length - 1;
  };
  if (pattern === 'RADIAL') {
    const n = 7 + Math.floor(rng() * 2);
    const a0 = rng() * 6.28;
    const ts = Array.from({ length: n }, (_, k) => a0 + (k / n) * 6.283 + (rng() - 0.5) * 0.3);
    // Round to the sheet's edge from just below the summit.
    for (let k = 0; k < n; k++) {
      const a = ts[k]!;
      const curl = (rng() - 0.5) * 0.45;
      const pts: P[] = [];
      for (let r = 1.1; r < 16; r += 1.3) {
        const b = a + (curl * (r - 1.1)) / 8;
        pts.push([hub[0] + Math.cos(b) * r, hub[1] + Math.sin(b) * r]);
      }
      addCurve(pts, 2, false, null);
    }
    let bestI = 0;
    let bestT = 9;
    out.forEach((s, i) => {
      const t = f.tOf(s.pts[s.pts.length - 1]!) - polyLengthOf(s.pts) * 0.001;
      if (t < bestT) {
        bestT = t;
        bestI = i;
      }
    });
    out[bestI]!.main = true;
    out[bestI]!.order = 3;
    return out;
  }
  if (pattern === 'PARALLEL') {
    const cs = [0.16, 0.33, 0.5, 0.67, 0.84];
    cs.forEach((c0, i) => {
      const w = wig(0.012, 7);
      const c = c0 + (rng() - 0.5) * 0.03;
      const top = 0.98 - rng() * 0.12;
      const pts: P[] = [];
      for (let t = top; t >= -0.02; t -= 0.07) pts.push(f.at(t, c + w(t)));
      addCurve(pts, i === 2 ? 3 : 2, i === 2, null);
    });
    const m = out.findIndex((s) => s.main);
    if (m >= 0) {
      trib(m, 0.35, 1, 0.1, 0.05, 1);
      trib(m, 0.55, -1, 0.1, 0.05, 1);
    }
    return out;
  }
  // A main river down the slope.
  const c0 = 0.42 + rng() * 0.16;
  const w = wig(0.05, 5);
  const low = wig(0.018, 19);
  const pts: P[] = [];
  for (let t = 1.05; t >= -0.05; t -= 0.05) pts.push(f.at(t, c0 + w(t) + low(t) * (1 - clamp(t, 0, 1))));
  addCurve(pts, 3, true, null);
  if (!out.length) return out;
  if (pattern === 'TRELLIS') {
    const spacing = 0.16;
    for (let tj = 0.14; tj < 0.92; tj += spacing) {
      for (const side of [1, -1]) {
        const i = trib(0, tj + (rng() - 0.5) * 0.015, side, 0.015 + rng() * 0.012, 0.36 + rng() * 0.08, 2);
        if (i > 0 && out[i]) {
          const s = out[i]!.pts;
          const q = s[Math.floor(s.length * (0.3 + rng() * 0.3))];
          if (q) {
            const qt = f.tOf(q);
            const qc = f.cOf(q);
            addCurve([f.at(qt + 0.075, qc + 0.006), f.at(qt + 0.04, qc - 0.004), q], 1, false, i);
          }
        }
      }
    }
    return out;
  }
  // DENDRITIC: tributaries meet the main river at acute angles, and branch again.
  const n = 6 + Math.floor(rng() * 2);
  for (let k = 0; k < n; k++) {
    const tj = 0.12 + (k / n) * 0.62 + rng() * 0.03;
    const side = k % 2 ? 1 : -1;
    const i = trib(0, tj, side, 0.17 + rng() * 0.1, 0.22 + rng() * 0.12, 2);
    if (i > 0 && k % 2 === 0 && out[i]) {
      const s = out[i]!.pts;
      const q = s[Math.floor(s.length * 0.45)];
      if (q) {
        const qt = f.tOf(q);
        const qc = f.cOf(q);
        addCurve([f.at(qt + 0.12, qc - side * 0.09), f.at(qt + 0.05, qc - side * 0.03), q], 1, false, i);
      }
    }
  }
  return out;
}
const polyLengthOf = polyLength;

function buildStreams(s: Omit<GeoSheet, 'streams'>, drafts: Draft[]): GeoStream[] {
  const streams: GeoStream[] = [];
  const raw = (p: P) => rawHeight(s, p[0], p[1]);
  const box = (pts: P[], m: number): [number, number, number, number] => [Math.min(...pts.map((p) => p[0])) - m, Math.min(...pts.map((p) => p[1])) - m, Math.max(...pts.map((p) => p[0])) + m, Math.max(...pts.map((p) => p[1])) + m];
  const built: (GeoStream | null)[] = drafts.map(() => null);
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!;
    const bed = new Array<number>(d.pts.length).fill(0);
    if (d.into === null) {
      let run = raw(d.pts[0]!) - 10;
      for (let k = 0; k < d.pts.length; k++) {
        run = Math.min(run - 0.5, raw(d.pts[k]!) - 7);
        bed[k] = run;
      }
    } else {
      const r = built[d.into]!;
      const end = d.pts[d.pts.length - 1]!;
      const at = r.pts.reduce((b, p, k) => (dist(p, end) < dist(r.pts[b]!, end) ? k : b), 0);
      bed[d.pts.length - 1] = r.bed[at]!;
      for (let k = d.pts.length - 2; k >= 0; k--) bed[k] = Math.max(bed[k + 1]! + 0.5, raw(d.pts[k]!) - 7);
    }
    const wid = d.main ? 0.75 : d.order === 2 ? 0.6 : 0.48;
    const st: GeoStream = { pts: d.pts, bed, order: d.order, main: d.main, wid, box: box(d.pts, wid * 4) };
    built[i] = st;
    streams.push(st);
  }
  // Tributaries first, so the larger river's valley is carved last.
  return streams.sort((a, b) => a.order - b.order);
}

function blob(rng: () => number, c: P, r: number, wob = 0.22): P[] {
  const p1 = rng() * 6.28;
  const p2 = rng() * 6.28;
  const p3 = rng() * 6.28;
  const raw: P[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * 6.2832;
    const rr = r * (1 + wob * Math.sin(a * 2 + p1) + wob * 0.6 * Math.sin(a * 3 + p2) + wob * 0.35 * Math.sin(a * 5 + p3));
    raw.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
  }
  const line = smoothLine([...raw, raw[0]!, raw[1]!], 0.3);
  return line.slice(1, -Math.max(1, Math.ceil(dist(raw[0]!, raw[1]!) / 0.3)));
}

function attempt(seed: number, pattern: DrainagePattern, tryNo: number): GeoSheet | null {
  const rng = labRandom(seed, `geo-sheet-${pattern}-${tryNo}`);
  const fixed = labRandom(seed, 'geo-sheet-fixed');
  const names = new Set<string>();
  const denom = labPick(fixed, [50000, 50000, 50000, 25000, 100000]);
  const kmPerCm = denom / 100000;
  const interval = labPick(fixed, [20, 25, 25, 50]);
  const compass = labPick(rng, [0, 1, 2, 3, 4, 5, 6, 7]);
  const ang = (compass * Math.PI) / 4 + (rng() - 0.5) * 0.3;
  const uphill: P = [Math.sin(ang), Math.cos(ang)];
  const centre: P = [SHEET_W / 2, SHEET_H / 2];
  const span = Math.abs(uphill[0]) * SHEET_W + Math.abs(uphill[1]) * SHEET_H;
  const spanV = Math.abs(uphill[1]) * SHEET_W + Math.abs(uphill[0]) * SHEET_H;
  const f = frameOf(uphill, centre, span, spanV);
  const radial = pattern === 'RADIAL';
  const hub: P = radial ? [centre[0] + (rng() - 0.5) * 3, centre[1] + (rng() - 0.5) * 2] : centre;
  const base: Omit<GeoSheet, 'streams'> = {
    seed,
    name: '',
    river: '',
    denom,
    kmPerCm,
    squareKm2: (SQUARE_CM * kmPerCm) ** 2,
    interval,
    eastBase: 12 + Math.floor(fixed() * 60),
    northBase: 20 + Math.floor(fixed() * 60),
    pattern,
    uphill,
    tiltBase: labBetween(rng, 70, 110, 0),
    tiltRise: radial ? 70 : labBetween(rng, 210, 280, 0),
    centre,
    span,
    spanV,
    ripple: [labBetween(rng, 5, 9), rng() * 6.28, rng() * 6.28, labBetween(rng, 2, 4), rng() * 6.28],
    bumps: [],
    roads: [],
    settlements: [],
    features: [],
    forest: [],
    plantation: [],
    swamp: [],
    relief: {},
  };
  base.name = `${fictional(rng, names)} District`;
  base.river = `R. ${fictional(rng, names)}`;
  if (radial) base.bumps.push({ x: hub[0], y: hub[1], a: 300, sa: 6.2, sb: 6.2, rot: 0, pow: 0.72 });
  if (pattern === 'TRELLIS') {
    // Long ridges along the strike, with subsequent streams in the vales between them.
    const rot = Math.atan2(uphill[0], -uphill[1]);
    for (let t = 0.22; t < 0.95; t += 0.16) {
      for (const c of [0.2, 0.8]) {
        const p = f.at(t, c);
        base.bumps.push({ x: p[0], y: p[1], a: 90 + rng() * 25, sa: spanV * 0.3, sb: 0.85, rot, pow: 1.5 });
      }
    }
  }
  const drafts = draftStreams(rng, f, pattern, hub);
  if (!drafts.some((d) => d.main)) return null;
  const riverGap = (p: P) => drafts.reduce((m, d) => Math.min(m, nearestOnLine(p, d.pts).d), Infinity);
  const place = (test: (p: P) => boolean, t0: number, t1: number, m = 1.6): P | null => {
    for (let k = 0; k < 160; k++) {
      const p = f.at(t0 + rng() * (t1 - t0), 0.05 + rng() * 0.9);
      if (inSheet(p, m) && test(p)) return p;
    }
    return null;
  };

  // The upland's named landforms (the default sheet has them all).
  const hillRot = Math.atan2(uphill[0], -uphill[1]);
  const reliefAt: Partial<Record<ReliefKind, P>> = {};
  if (pattern === 'DENDRITIC') {
    const conical = place((p) => riverGap(p) > 1.5, 0.52, 0.92);
    if (!conical) return null;
    const a2 = rng() * 6.28;
    let hill: P | null = null;
    for (let k = 0; k < 24 && !hill; k++) {
      const r = 3.2 + rng() * 0.8;
      const q: P = [conical[0] + Math.cos(a2 + k * 0.8) * r, conical[1] + Math.sin(a2 + k * 0.8) * r];
      if (inSheet(q, 1.4) && f.tOf(q) > 0.46 && riverGap(q) > 1.4 && riverGap([(q[0] + conical[0]) / 2, (q[1] + conical[1]) / 2]) > 1.2) hill = q;
    }
    if (!hill) return null;
    const far = (ps: P[], r: number) => (p: P) => ps.every((q) => dist(p, q) > r);
    const plateau = place((p) => riverGap(p) > 1.9 && far([conical, hill], 4.8)(p), 0.5, 0.95, 2.2);
    if (!plateau) return null;
    const ridge = place((p) => riverGap(p) > 1.1 && far([conical, hill, plateau], 4.2)(p), 0.4, 0.95, 2);
    if (!ridge) return null;
    const spur = place((p) => riverGap(p) > 1.05 && far([conical, hill, plateau, ridge], 3)(p), 0.32, 0.6, 1.8);
    if (!spur) return null;
    base.bumps.push(
      { x: conical[0], y: conical[1], a: 190 + rng() * 50, sa: 1.15, sb: 1.15, rot: 0, pow: 0.8 },
      { x: hill[0], y: hill[1], a: 140 + rng() * 40, sa: 1.7, sb: 1.7, rot: 0, pow: 1 },
      { x: ridge[0], y: ridge[1], a: 95 + rng() * 25, sa: 3, sb: 0.72, rot: hillRot, pow: 1 },
      { x: spur[0], y: spur[1], a: 65 + rng() * 20, sa: 2.3, sb: 0.72, rot: hillRot + Math.PI / 2, pow: 1 },
    );
    const top = rawHeight(base, plateau[0], plateau[1]) + 75;
    base.bumps.push({ x: plateau[0], y: plateau[1], a: 0, sa: 2.3, sb: 2.0, rot: 0, pow: 2.6, flat: Math.round(top / 5) * 5 });
    reliefAt.CONICAL = conical;
    reliefAt.HILL = hill;
    reliefAt.RIDGE = ridge;
    reliefAt.PLATEAU = plateau;
    reliefAt.SPUR = [spur[0] - uphill[0] * 1.5, spur[1] - uphill[1] * 1.5];
    // The edge of the plateau facing the lowland, where the contours crowd.
    let e: P = plateau;
    let slope = 0;
    for (let r = 1.8; r < 3.4; r += 0.1) {
      const q: P = [plateau[0] - uphill[0] * r, plateau[1] - uphill[1] * r];
      const b: P = [q[0] - uphill[0] * 0.1, q[1] - uphill[1] * 0.1];
      const g = rawHeight(base, q[0], q[1]) - rawHeight(base, b[0], b[1]);
      if (g > slope) {
        slope = g;
        e = q;
      }
    }
    reliefAt.ESCARPMENT = e;
  } else if (!radial) {
    // A hill or two for the other drainage sheets.
    const h = place((p) => riverGap(p) > 1.3, 0.45, 0.95);
    if (h) base.bumps.push({ x: h[0], y: h[1], a: 110 + rng() * 40, sa: 1.5, sb: 1.5, rot: 0, pow: 1 });
    if (h) reliefAt.HILL = h;
  } else reliefAt.CONICAL = hub;

  const streams = buildStreams(base, drafts);
  const sheet: GeoSheet = { ...base, streams };
  const h = (p: P) => geoHeight(sheet, p[0], p[1]);
  // Streams close together share a little of each other's valley: settle the beds so water never runs uphill.
  for (let pass = 0; pass < 5; pass++) {
    for (const st of [...streams].reverse()) {
      let low = Infinity;
      st.pts.forEach((p, k) => {
        const z = h(p);
        if (z > low) st.bed[k] = Math.min(st.bed[k]!, low - 0.3);
        low = Math.min(low, Math.min(z, st.bed[k]!));
      });
    }
  }
  const climb = (p: P): P => {
    let q = p;
    let step = 0.3;
    for (let k = 0; k < 60; k++) {
      let best = q;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]] as const) {
        const c: P = [q[0] + dx * step, q[1] + dy * step];
        if (h(c) > h(best)) best = c;
      }
      if (best === q) step *= 0.5;
      q = best;
      if (step < 0.01) break;
    }
    return q;
  };
  // Reject the rare sheet where two streams still fight over one valley.
  for (const st of streams) {
    let low = Infinity;
    for (const p of st.pts) {
      const z = h(p);
      if (z > low + 5) return null;
      low = Math.min(low, z);
    }
  }
  if (reliefAt.CONICAL) reliefAt.CONICAL = climb(reliefAt.CONICAL);
  if (reliefAt.HILL) reliefAt.HILL = climb(reliefAt.HILL);
  if (pattern === 'DENDRITIC') {
    // The saddle: the highest point of the lowest pass between the two summits.
    const a = reliefAt.CONICAL!;
    const b = reliefAt.HILL!;
    let pass: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const nx = -(b[1] - a[1]) / dist(a, b);
    const ny = (b[0] - a[0]) / dist(a, b);
    let lowest = Infinity;
    for (let t = 0.25; t <= 0.75; t += 0.02) {
      const m: P = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      let top = -Infinity;
      let at = m;
      for (let o = -1.2; o <= 1.2; o += 0.05) {
        const q: P = [m[0] + nx * o, m[1] + ny * o];
        if (h(q) > top) {
          top = h(q);
          at = q;
        }
      }
      if (top < lowest) {
        lowest = top;
        pass = at;
      }
    }
    if (Math.min(h(a), h(b)) - h(pass) < interval * 1.2) return null;
    reliefAt.SADDLE = pass;
  }
  sheet.relief = reliefAt;
  const main = streams.find((s) => s.main)!;
  if (!pattern.startsWith('RAD')) {
    const up = main.pts.find((p) => f.tOf(p) < 0.72 && f.tOf(p) > 0.45 && inSheet(p, 1));
    if (up) reliefAt.VALLEY = up;
  }
  const flat = place((p) => riverGap(p) > 1 && h(p) < base.tiltBase + 70, 0.04, 0.25, 1);
  if (flat) reliefAt.PLAIN = flat;

  // The town, on the lower river.
  const t0 = main.pts.filter((p) => inSheet(p, 2.2));
  const low = t0.filter((p) => f.tOf(p) < 0.5);
  const site = low[Math.floor(low.length * (0.3 + rng() * 0.3))] ?? t0[Math.floor(t0.length / 2)];
  if (!site) return null;
  const vside = rng() < 0.5 ? 1 : -1;
  const townP: P = [site[0] + -uphill[1] * vside * 0.9, site[1] + uphill[0] * vside * 0.9];
  const town: GeoSettlement = { id: 'town', name: fictional(rng, names), kind: 'TOWN', p: townP };

  // The main road crosses the lowland through the town, with named villages on it.
  const cT = f.cOf(townP);
  const tT = f.tOf(townP);
  const pathStops = (cFrom: number, cTo: number, n: number) => {
    const ps: P[] = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      ps.push(f.at(tT + Math.sin(u * 3.1 + rng()) * 0.06 + (rng() - 0.5) * 0.05, cFrom + (cTo - cFrom) * u));
    }
    return ps;
  };
  const westStops = pathStops(-0.1, cT - 0.08, 4);
  const eastStops = pathStops(cT + 0.08, 1.1, 4).filter((p) => dist(p, townP) > 1);
  const mainRoad = clipInside(smoothLine([...westStops, townP, ...eastStops], 0.2));
  if (mainRoad.length < 40) return null;
  sheet.roads.push({ id: 'main', kind: 'MAIN', pts: mainRoad });
  const onRoad = (r: P[], u: number): { p: P; along: number } => {
    const i = clamp(Math.floor(r.length * u), 1, r.length - 2);
    const a = r[i - 1]!;
    const b = r[i + 1]!;
    return { p: r[i]!, along: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };
  const townU = nearestOnLine(townP, mainRoad).along / polyLength(mainRoad);
  const addSet = (kind: SettlementKind, p: P, along?: number): GeoSettlement => {
    const st: GeoSettlement = { id: `s${sheet.settlements.length}`, name: fictional(rng, names), kind, p, along };
    sheet.settlements.push(st);
    return st;
  };
  sheet.settlements.push(town);
  for (const u of [0.06, 0.22, 0.42, 0.62, 0.8, 0.95]) {
    if (Math.abs(u - townU) < 0.14) continue;
    const q = onRoad(mainRoad, u);
    if (inSheet(q.p, 0.9)) addSet(u > townU ? 'LINEAR' : 'VILLAGE', q.p, q.along);
  }
  // A minor road climbs towards the upland, and a track beyond it.
  const upTarget = place((p) => riverGap(p) > 0.8 && dist(p, townP) > 6, 0.58, 0.82, 1.2) ?? f.at(0.7, 0.3);
  const minorPts = clipInside(smoothLine([townP, [(townP[0] * 2 + upTarget[0]) / 3 + (rng() - 0.5) * 2.4, (townP[1] * 2 + upTarget[1]) / 3 + (rng() - 0.5) * 2.4], [(townP[0] + upTarget[0] * 2) / 3 + (rng() - 0.5) * 2.4, (townP[1] + upTarget[1] * 2) / 3 + (rng() - 0.5) * 2.4], upTarget], 0.2));
  if (minorPts.length > 8) sheet.roads.push({ id: 'minor', kind: 'MINOR', pts: minorPts });
  addSet('VILLAGE', upTarget);
  const trackEnd = place((p) => riverGap(p) > 0.6 && dist(p, upTarget) > 4, 0.6, 0.95, 1) ?? f.at(0.85, 0.7);
  const trackPts = clipInside(smoothLine([upTarget, [(upTarget[0] + trackEnd[0]) / 2 + (rng() - 0.5) * 2, (upTarget[1] + trackEnd[1]) / 2 + (rng() - 0.5) * 2], trackEnd], 0.2));
  if (trackPts.length > 6) sheet.roads.push({ id: 'track', kind: 'TRACK', pts: trackPts });
  addSet('HAMLET', trackEnd);
  const railT = Math.max(0.05, tT - 0.1);
  const rail = clipInside(smoothLine([f.at(railT + 0.03, -0.1), f.at(railT - 0.02, 0.3), f.at(railT + 0.02, 0.7), f.at(railT - 0.02, 1.1)], 0.3));
  if (rail.length > 10) sheet.roads.push({ id: 'rail', kind: 'RAIL', pts: rail });

  // Hamlets scattered square by square: many in the lowland, few in the upland, never astride a grid line.
  for (let e = 0; e < SQUARES_E; e++) {
    for (let n = 0; n < SQUARES_N; n++) {
      const p: P = [(e + 0.5) * SQUARE_CM + (rng() - 0.5) * 1.1, (n + 0.5) * SQUARE_CM + (rng() - 0.5) * 1.1];
      const t = f.tOf(p);
      const chance = t < 0.42 ? 0.42 : t > 0.58 ? 0.1 : 0.2;
      if (rng() > chance || riverGap(p) < 0.35 || dist(p, townP) < 1.5) continue;
      addSet('HAMLET', p);
    }
  }

  // The town's buildings and the other marked features.
  const fx = (kind: FeatureKind, p: P, id = `${kind.toLowerCase()}${sheet.features.length}`) => sheet.features.push({ id, kind, p });
  const near = (c: P, r: number): P => {
    const a = rng() * 6.28;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  };
  fx('MARKET', near(townP, 0.42), 'market');
  fx('POST', near(townP, 0.5), 'post');
  const others = sheet.settlements.filter((x) => x.kind === 'VILLAGE' || x.kind === 'LINEAR');
  const avoid = (p: P, m = 0.7) => (inSheet(p, m) ? p : townP);
  fx('SCHOOL', avoid(near(others[0]?.p ?? townP, 0.5)), 'school');
  fx('CHURCH', avoid(near(others[1]?.p ?? townP, 0.5)), 'church');
  fx('MOSQUE', avoid(near(others[2]?.p ?? townP, 0.5)), 'mosque');
  fx('BOREHOLE', avoid(near(others[3]?.p ?? townP, 0.6)), 'borehole');
  if (reliefAt.CONICAL) {
    sheet.features.push({ id: 'trig', kind: 'TRIG', p: reliefAt.CONICAL, h: Math.round(h(reliefAt.CONICAL)) });
    fx('QUARRY', avoid(near(reliefAt.CONICAL, 1.5)), 'quarry');
  }
  if (reliefAt.HILL) sheet.features.push({ id: 'spot-hill', kind: 'SPOT', p: reliefAt.HILL, h: Math.round(h(reliefAt.HILL)) });
  if (reliefAt.PLATEAU) sheet.features.push({ id: 'spot-plateau', kind: 'SPOT', p: reliefAt.PLATEAU, h: Math.round(h(reliefAt.PLATEAU)) });
  for (let k = 0; k < 6; k++) {
    const q = onRoad(mainRoad, 0.1 + k * 0.16).p;
    const p: P = [q[0] + 0.45, q[1] + 0.3];
    if (inSheet(p, 0.8)) sheet.features.push({ id: `spot${k}`, kind: 'SPOT', p, h: Math.round(h(p)) });
  }
  const falls = streams.find((s) => s.order === 2 && !s.main);
  if (falls) fx('FALLS', falls.pts[Math.floor(falls.pts.length * 0.35)]!, 'falls');

  // Forest reserve, plantation, swamp.
  const forestC = place((p) => dist(p, townP) > 6 && polyGapOK(p, sheet, 3.6), 0.3, 0.72, 4) ?? place((p) => dist(p, townP) > 5, 0.25, 0.8, 4);
  if (!forestC) return null;
  sheet.forest = blob(rng, forestC, 3.4 + rng() * 0.5);
  const plantC = place((p) => dist(p, forestC) > 6.5 && dist(p, townP) > 2.5, 0.08, 0.42, 2.2) ?? [townP[0], townP[1]];
  sheet.plantation = blob(rng, plantC, 1.8, 0.16);
  const wet = main.pts.filter((p) => f.tOf(p) < 0.2 && inSheet(p, 1.4));
  const swampC = wet[Math.floor(wet.length / 2)];
  if (swampC) sheet.swamp = blob(rng, swampC, 1.1, 0.25);
  sheet.settlements = sheet.settlements.filter((x) => x.kind !== 'HAMLET' || !inPolygon(x.p, sheet.forest));
  return sheet;
}
const polyGapOK = (p: P, s: GeoSheet, r: number) => s.roads.every((rd) => rd.kind === 'TRACK' || nearestOnLine(p, rd.pts).d > r * 0.75);

const cache = new Map<string, GeoSheet>();
/** The sheet for a seed (always the same one). `pattern`: the DRAINAGE lesson asks for a chosen drainage pattern. */
export function geoSheet(seed: number, pattern: DrainagePattern = 'DENDRITIC'): GeoSheet {
  const key = `${seed}|${pattern}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let made: GeoSheet | null = null;
  for (let k = 0; k < 60 && !made; k++) made = attempt(seed, pattern, k);
  if (!made) throw new Error(`no sheet for seed ${seed}`);
  if (cache.size > 24) cache.delete(cache.keys().next().value as string);
  cache.set(key, made);
  return made;
}

// ------------------------------------------------------------------ grid references

/** Easting and northing of a point as decimal grid numbers. */
export const gridOf = (s: GeoSheet, p: P): P => [s.eastBase + p[0] / SQUARE_CM, s.northBase + p[1] / SQUARE_CM];
const two = (n: number) => String(Math.floor(n) % 100).padStart(2, '0');
export const gridRef4 = (s: GeoSheet, p: P) => {
  const [e, n] = gridOf(s, p);
  return `${two(e)}${two(n)}`;
};
export const gridRef6 = (s: GeoSheet, p: P) => {
  const [e, n] = gridOf(s, p);
  return `${two(e)}${Math.floor((e - Math.floor(e)) * 10)}${two(n)}${Math.floor((n - Math.floor(n)) * 10)}`;
};
/** A six-figure reference back to tenths of a grid square (e, n) — null if it isn't six digits. */
export const parseRef6 = (raw: string): P | null => {
  const m = /^(\d{3})\s*(\d{3})$/.exec(raw.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
};

// ------------------------------------------------------------------ contours

export interface ContourLine {
  level: number;
  index: boolean;
  paths: P[][];
}
export interface ContourLabel {
  p: P;
  angle: number;
  level: number;
}

const contourCache = new Map<string, { lines: ContourLine[]; labels: ContourLabel[]; min: number; max: number }>();
/** Contours from the height function by marching squares (polylines in paper cm), with labels sitting on the lines. */
export function geoContours(s: GeoSheet, cell = 0.1) {
  const key = `${s.seed}|${s.pattern}|${cell}`;
  const hit = contourCache.get(key);
  if (hit) return hit;
  const nx = Math.round(SHEET_W / cell);
  const ny = Math.round(SHEET_H / cell);
  const w = nx + 1;
  const hs = new Float32Array(w * (ny + 1));
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const v = geoHeight(s, i * cell, j * cell);
      hs[j * w + i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const lines: ContourLine[] = [];
  const labels: ContourLabel[] = [];
  const I = s.interval;
  const major = I * 5 > 150 ? I * 2 : I * 5;
  for (let level = Math.ceil(min / I) * I; level <= max; level += I) {
    const pos = new Map<number, P>();
    const link = new Map<number, number[]>();
    const edgeP = (id: number, ax: number, ay: number, av: number, bx: number, by: number, bv: number) => {
      if (!pos.has(id)) {
        const t = (level - av) / (bv - av || 1e-9);
        pos.set(id, [(ax + (bx - ax) * t) * cell, (ay + (by - ay) * t) * cell]);
      }
      return id;
    };
    const join = (a: number, b: number) => {
      (link.get(a) ?? (link.set(a, []), link.get(a)!)).push(b);
      (link.get(b) ?? (link.set(b, []), link.get(b)!)).push(a);
    };
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = hs[j * w + i]!;
        const b = hs[j * w + i + 1]!;
        const c = hs[(j + 1) * w + i + 1]!;
        const d = hs[(j + 1) * w + i]!;
        const code = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
        if (code === 0 || code === 15) continue;
        const bottom = () => edgeP(2 * (j * w + i), i, j, a, i + 1, j, b);
        const top = () => edgeP(2 * ((j + 1) * w + i), i, j + 1, d, i + 1, j + 1, c);
        const left = () => edgeP(2 * (j * w + i) + 1, i, j, a, i, j + 1, d);
        const right = () => edgeP(2 * (j * w + i + 1) + 1, i + 1, j, b, i + 1, j + 1, c);
        switch (code) {
          case 1: case 14: join(bottom(), left()); break;
          case 2: case 13: join(bottom(), right()); break;
          case 4: case 11: join(top(), right()); break;
          case 8: case 7: join(top(), left()); break;
          case 3: case 12: join(left(), right()); break;
          case 6: case 9: join(top(), bottom()); break;
          case 5: join(bottom(), left()); join(top(), right()); break;
          case 10: join(bottom(), right()); join(top(), left()); break;
        }
      }
    }
    const used = new Set<number>();
    const paths: P[][] = [];
    const walk = (start: number) => {
      const out: P[] = [pos.get(start)!];
      used.add(start);
      let cur = start;
      for (;;) {
        const next = (link.get(cur) ?? []).find((n) => !used.has(n));
        if (next === undefined) break;
        used.add(next);
        out.push(pos.get(next)!);
        cur = next;
      }
      return out;
    };
    for (const [id, l] of link) if (l.length === 1 && !used.has(id)) paths.push(walk(id));
    for (const id of link.keys()) {
      if (used.has(id)) continue;
      const p = walk(id);
      p.push(p[0]!);
      paths.push(p);
    }
    const index = level % major === 0;
    lines.push({ level, index, paths });
    for (const path of paths) {
      const len = polyLength(path);
      if (len < (index ? 2.5 : 4)) continue;
      const count = index ? Math.min(3, Math.max(1, Math.floor(len / 9))) : 1;
      for (let k = 0; k < count; k++) {
        if (!index && labels.length % 3 !== 0 && I < 50) continue;
        const i = Math.floor(((k + 0.5) / count) * (path.length - 1));
        const p = path[i]!;
        if (!inSheet(p, 0.6)) continue;
        const a = path[Math.max(0, i - 3)]!;
        const b = path[Math.min(path.length - 1, i + 3)]!;
        let angle = (Math.atan2(a[1] - b[1], b[0] - a[0]) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        labels.push({ p, angle, level });
      }
    }
  }
  const out = { lines, labels, min, max };
  if (contourCache.size > 8) contourCache.delete(contourCache.keys().next().value as string);
  contourCache.set(key, out);
  return out;
}

/** Where a straight line a → b crosses each contour: distance from a (cm) and the contour's value. */
export function contourCrossings(s: GeoSheet, a: P, b: P): { d: number; h: number }[] {
  const L = dist(a, b);
  const n = Math.ceil(L / 0.02);
  const out: { d: number; h: number }[] = [];
  const at = (t: number) => geoHeight(s, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
  let prev = at(0);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const h = at(t);
    const lo = Math.min(prev, h);
    const hi = Math.max(prev, h);
    for (let level = Math.ceil(lo / s.interval) * s.interval; level <= hi; level += s.interval) {
      if (level === prev) continue;
      out.push({ d: L * (t - ((h - level) / (h - prev || 1)) / n), h: level });
    }
    prev = h;
  }
  return out;
}
