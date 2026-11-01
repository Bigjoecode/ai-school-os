import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, phyToDeg, phyToRad, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom } from './seeded';

/**
 * phy-pins: the pin-method optics practicals on a drawing board, and the
 * spectrum. Four tasks, one per lesson:
 *  - MIRROR (laws of reflection): a plane mirror stands with its silvered
 *    surface on the line MM' (y = 0, the paper on y > 0). P₁, P₂ on the
 *    incident ray AO at i to the normal at O; looking into the mirror the
 *    student lines up P₃, P₄ with the images of P₁, P₂ (their mirror images
 *    through y = 0), removes the mirror, joins P₄P₃ to MM' and measures r.
 *    r against i is a straight line of slope 1.
 *  - PRISM (minimum deviation): an isosceles triangular prism, apex angle A
 *    (60° ± 0.6°, seeded), refractive index n (crown glass, seeded). Rays at
 *    i = 35° … 65° on the left face; exact (vector) Snell's law at both
 *    faces; D = i + e − A. D against i is U-shaped; Dₘ read from the curve and
 *    n = sin((A + Dₘ)/2)/sin(A/2).
 *  - DEPTH (real and apparent depth): a cross on the paper under a stack of 1–4
 *    identical-glass blocks (seeded thicknesses), viewed vertically from 25 cm
 *    above the top face. A search pin in a cork on a stand is moved up and
 *    down beside the stack (height read on a vertical rule from the bench)
 *    until it shows no parallax with the image of the cross as the eye moves
 *    sideways. The image is found by exact refraction for every eye
 *    position. n = real ÷ apparent = slope of real against apparent depth.
 *  - DISP (dispersion): a narrow beam from a ray box through a 60° prism on a
 *    turntable onto a screen with a degree scale (deviation). Cauchy
 *    dispersion n(λ) = n_D + B(1/λ² − 1/λ_D²); every colour's deviation is
 *    exact. A wide slit or a lit room spoils the spectrum; a filter passes one
 *    colour, not split further. The student records the order, which colour
 *    is deviated most, the filter test, D for red and violet at minimum
 *    deviation, the angular dispersion and n for red.
 * Units: cm and degrees.
 */

export const PINS_TASKS = ['MIRROR', 'PRISM', 'DEPTH', 'DISP'] as const;
export type PinsTask = (typeof PINS_TASKS)[number];
export const PINS_LESSON_TASK: Record<string, PinsTask> = {
  'pr-phy-plane-mirror-reflection': 'MIRROR',
  'pr-phy-prism-minimum-deviation': 'PRISM',
  'pr-phy-real-apparent-depth': 'DEPTH',
  'pr-phy-dispersion-prism': 'DISP',
};

/** The drawing sheet for each board task (cm, O at the origin). */
export const PINS_SHEET: Record<'MIRROR' | 'PRISM', { left: number; right: number; top: number; bottom: number }> = {
  MIRROR: { left: -16, right: 16, top: 20, bottom: -4 },
  PRISM: { left: -22, right: 22, top: 14, bottom: -12 },
};
/** Pins closer than this (cm) are "too close together". */
export const PINS_SPACING = 5;
/** P₃/P₄ count as on the true ray within this (cm). */
export const PINS_ALIGN_TOL = 0.15;
export const PINS_ANGLE: Record<'MIRROR' | 'PRISM', { min: number; max: number }> = { MIRROR: { min: 10, max: 75 }, PRISM: { min: 25, max: 80 } };
/** The prism's side (cm). */
export const PRISM_SIDE = 8;
/** The eye looks from this far (cm) from O (mirror) or the middle of the second face (prism). */
export const PINS_EYE_R = 24;

/** Depth: blocks available, the eye's height above the top face (cm), its sideways range (cm). */
export const DEPTH_BLOCKS = 4;
export const DEPTH_EYE_H = 25;
export const DEPTH_EYE_MAX = 4;
/** The search pin's height can be set between these (cm above the bench). */
export const DEPTH_PIN_MAX = 14;

/** Dispersion: the seven colours (id, name, wavelength µm), red (least deviated) first. */
export const DISP_COLOURS = [
  { id: 'red', name: 'Red', lambda: 0.7, css: '#e3262b' },
  { id: 'orange', name: 'Orange', lambda: 0.61, css: '#f47b20' },
  { id: 'yellow', name: 'Yellow', lambda: 0.58, css: '#f7e017' },
  { id: 'green', name: 'Green', lambda: 0.53, css: '#2fb34a' },
  { id: 'blue', name: 'Blue', lambda: 0.47, css: '#2b6fd6' },
  { id: 'indigo', name: 'Indigo', lambda: 0.44, css: '#4b2fa6' },
  { id: 'violet', name: 'Violet', lambda: 0.41, css: '#8f3fd1' },
] as const;
export type DispColour = (typeof DISP_COLOURS)[number]['id'];
export const DISP_COLOUR_IDS = DISP_COLOURS.map((c) => c.id) as DispColour[];
export const DISP_FILTERS = ['none', 'red', 'green', 'blue'] as const;
export type DispFilter = (typeof DISP_FILTERS)[number];
export const DISP_FILTER_OBS = ['', 'one-colour', 'split', 'all', 'none'] as const;
export type DispFilterObs = (typeof DISP_FILTER_OBS)[number];
export const DISP_RAY = ['', 'violet-more', 'red-more', 'same'] as const;
export type DispRay = (typeof DISP_RAY)[number];
export const DISP_I = { min: 20, max: 80 };
export const DISP_DIST = { min: 20, max: 120 };
/** The beam's angular width (°) with each slit. */
export const DISP_SLIT_WIDTH = { narrow: 0.25, wide: 2.5 } as const;
const LAMBDA_D = 0.5893;

export interface PhyPinsVariant {
  seed: number;
  /** Refractive index of the glass (sodium D line). */
  n: number;
  /** Prism apex angle (°). */
  A: number;
  /** The dispersion prism's apex angle (°) and Cauchy B (µm²). */
  dispA: number;
  cauchyB: number;
  /** Thicknesses of the depth blocks (cm), in the order they are stacked. */
  blocks: number[];
}

export function phyPinsVariant(seed: number): PhyPinsVariant {
  const r = labRandom(seed, 'phy-pins');
  const n = labBetween(r, 1.5, 1.54, 3);
  const A = labBetween(r, 59.4, 60.6, 1);
  const dispA = labBetween(r, 59.6, 60.4, 1);
  const cauchyB = labBetween(r, 0.0040, 0.0046, 5);
  const blocks = Array.from({ length: DEPTH_BLOCKS }, () => labBetween(r, 2.4, 2.6, 2));
  return { seed, n, A, dispA, cauchyB, blocks };
}

// ------------------------------------------------------------------ geometry helpers

export interface PinsPoint {
  x: number;
  y: number;
}
const add = (a: PinsPoint, b: PinsPoint, k = 1): PinsPoint => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a: PinsPoint, b: PinsPoint): PinsPoint => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: PinsPoint, b: PinsPoint) => a.x * b.x + a.y * b.y;
const cross = (a: PinsPoint, b: PinsPoint) => a.x * b.y - a.y * b.x;
const len = (a: PinsPoint) => Math.hypot(a.x, a.y);
const unit = (a: PinsPoint): PinsPoint => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
/** Rotate counter-clockwise by `deg`. */
export const pinsRot = (a: PinsPoint, deg: number): PinsPoint => {
  const c = Math.cos(phyToRad(deg));
  const s = Math.sin(phyToRad(deg));
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};
export const pinsDist = (a: PinsPoint, b: PinsPoint) => len(sub(a, b));
/** Perpendicular distance of p from the line through a with direction d. */
export const pinsOffLine = (p: PinsPoint, a: PinsPoint, d: PinsPoint) => Math.abs(cross(sub(p, a), unit(d)));
/** Where the line p + t·d meets the line q + s·e (null if parallel). */
export function pinsMeet(p: PinsPoint, d: PinsPoint, q: PinsPoint, e: PinsPoint): { at: PinsPoint; t: number; s: number } | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const w = sub(q, p);
  const t = cross(w, e) / den;
  const s = cross(w, d) / den;
  return { at: add(p, d, t), t, s };
}
/** Vector refraction: d (unit, travelling), N (unit normal facing the incoming side), eta = n₁/n₂. Null on total internal reflection. */
export function pinsRefract(d: PinsPoint, N: PinsPoint, eta: number): PinsPoint | null {
  const cosi = -dot(N, d);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  return unit(add({ x: d.x * eta, y: d.y * eta }, N, eta * cosi - Math.sqrt(k)));
}
/** The signed angle (°) that turns a into b, counter-clockwise positive. */
export const pinsAngle = (a: PinsPoint, b: PinsPoint) => phyToDeg(Math.atan2(cross(a, b), dot(a, b)));
/** The point on the line from the eye E through I that is ρ from C (the one nearer the eye), or null. */
export function pinsInLine(E: PinsPoint, I: PinsPoint, C: PinsPoint, rho: number): PinsPoint | null {
  const d = sub(I, E);
  const f = sub(E, C);
  const a = dot(d, d);
  const b = 2 * dot(f, d);
  const c = dot(f, f) - rho * rho;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-12) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return add(E, d, t);
}

// ------------------------------------------------------------------ the plane mirror

export const mirrorIncidentPoint = (i: number, s: number): PinsPoint => ({ x: -s * Math.sin(phyToRad(i)), y: s * Math.cos(phyToRad(i)) });
/** The image of a point in the mirror (silvered surface on y = 0). */
export const mirrorImage = (p: PinsPoint): PinsPoint => ({ x: p.x, y: -p.y });
/** The true reflected ray: from O at r = i to the normal, to the right. */
export const mirrorReflected = (i: number) => ({ from: { x: 0, y: 0 }, dir: { x: Math.sin(phyToRad(i)), y: Math.cos(phyToRad(i)) } });
/** The eye at angle φ (° from the normal, to the right) on a circle about O. */
export const mirrorEye = (phi: number): PinsPoint => ({ x: PINS_EYE_R * Math.sin(phyToRad(phi)), y: PINS_EYE_R * Math.cos(phyToRad(phi)) });

// ------------------------------------------------------------------ the prism

export interface PrismShape {
  A: number;
  /** Corners: base left, base right, apex. */
  B: PinsPoint;
  C: PinsPoint;
  T: PinsPoint;
  /** O: the point of incidence, the middle of face BT. */
  O: PinsPoint;
  /** The middle of face TC (the eye looks at it). */
  M2: PinsPoint;
  /** Outward normals of the faces BT and TC. */
  n1: PinsPoint;
  n2: PinsPoint;
}
export function prismShape(A: number, side = PRISM_SIDE): PrismShape {
  const a = phyToRad(A / 2);
  const B = { x: -side * Math.sin(a), y: -side * Math.cos(a) / 2 };
  const C = { x: side * Math.sin(a), y: -side * Math.cos(a) / 2 };
  const T = { x: 0, y: side * Math.cos(a) / 2 };
  return { A, B, C, T, O: { x: (B.x + T.x) / 2, y: (B.y + T.y) / 2 }, M2: { x: (C.x + T.x) / 2, y: (C.y + T.y) / 2 }, n1: { x: -Math.cos(a), y: Math.sin(a) }, n2: { x: Math.cos(a), y: Math.sin(a) } };
}
/** The incident ray's direction for angle of incidence i (it travels up to the right, towards the apex side of the inward normal). */
export const prismInDir = (sh: PrismShape, i: number): PinsPoint => pinsRot({ x: -sh.n1.x, y: -sh.n1.y }, i);
export const prismIncidentPoint = (sh: PrismShape, i: number, s: number): PinsPoint => add(sh.O, prismInDir(sh, i), -s);

export interface PrismRay {
  dIn: PinsPoint;
  dGlass: PinsPoint;
  /** Where the ray leaves face TC, and its direction (null: totally reflected inside). */
  Q: PinsPoint | null;
  dOut: PinsPoint | null;
  r1: number;
  r2: number;
  e: number | null;
  /** Deviation (°), clockwise positive. */
  D: number | null;
}
/** The exact ray through the prism for angle of incidence i and index n. */
export function prismRay(sh: PrismShape, n: number, i: number): PrismRay {
  const dIn = prismInDir(sh, i);
  const dGlass = pinsRefract(dIn, sh.n1, 1 / n)!;
  const r1 = Math.abs(pinsAngle({ x: -sh.n1.x, y: -sh.n1.y }, dGlass));
  const hit = pinsMeet(sh.O, dGlass, sh.T, sub(sh.C, sh.T));
  const Q = hit && hit.s >= 0 && hit.s <= 1 ? hit.at : null;
  const r2 = Math.abs(pinsAngle(sh.n2, dGlass));
  const dOut = Q ? pinsRefract(dGlass, { x: -sh.n2.x, y: -sh.n2.y }, n) : null;
  const e = dOut ? Math.abs(pinsAngle(sh.n2, dOut)) : null;
  const D = dOut ? -pinsAngle(dIn, dOut) : null;
  return { dIn, dGlass, Q: dOut ? Q : null, dOut, r1, r2, e, D };
}
/** The prism of this variant. */
export const pinsPrism = (v: PhyPinsVariant) => prismShape(v.A);
/** Minimum deviation (°) for index n and apex A: from n = sin((A + D)/2)/sin(A/2). */
export const prismDmin = (n: number, A: number) => 2 * phyToDeg(Math.asin(Math.min(1, n * Math.sin(phyToRad(A / 2))))) - A;
/** The eye at angle φ (° from the outward normal of face TC, turning towards the base) on a circle about its middle. */
export const prismEye = (sh: PrismShape, phi: number): PinsPoint => add(sh.M2, pinsRot(sh.n2, -phi), PINS_EYE_R);
/** Where a pin on the incident ray, s cm from O, appears seen through face TC: on the emergent line, behind Q. */
export function prismImage(sh: PrismShape, n: number, i: number, s: number): PinsPoint | null {
  const ray = prismRay(sh, n, i);
  if (!ray.Q || !ray.dOut) return null;
  return add(ray.Q, ray.dOut, -(pinsDist(ray.Q, sh.O) / n + s));
}
/** Does the line from the eye to q cross face TC (so q is seen through it)? */
export function prismSeen(sh: PrismShape, E: PinsPoint, q: PinsPoint): boolean {
  const m = pinsMeet(E, sub(q, E), sh.T, sub(sh.C, sh.T));
  return !!m && m.t > 0 && m.t < 1 && m.s >= 0 && m.s <= 1;
}

// ------------------------------------------------------------------ the student's pin construction

export interface PinsTrace {
  /** Angle of incidence (whole degrees, from the normal). */
  i: number;
  normal: boolean;
  /** P₁, P₂: distances from O along the incident ray (cm). */
  p1: number | null;
  p2: number | null;
  p3: PinsPoint | null;
  p4: PinsPoint | null;
  /** Mirror/prism removed and P₄P₃ joined. */
  joined: boolean;
}

/** The emergent (or reflected) line the student draws: the pin nearer the mirror/face first. */
function drawnLine(near: PinsPoint, far: PinsPoint) {
  return { from: near, dir: unit(sub(far, near)) };
}
export function pinsOrdered(t: PinsTrace, toward: PinsPoint): [PinsPoint, PinsPoint] | null {
  if (!t.p3 || !t.p4) return null;
  return pinsDist(t.p3, toward) <= pinsDist(t.p4, toward) ? [t.p3, t.p4] : [t.p4, t.p3];
}
/** Mirror: where P₄P₃ meets MM' and the angle of reflection it gives (°, from the normal). */
export function mirrorConstruction(t: PinsTrace): { at: PinsPoint; r: number } | null {
  const o = pinsOrdered(t, { x: 0, y: 0 });
  if (!o) return null;
  const l = drawnLine(o[0], o[1]);
  const m = pinsMeet(l.from, l.dir, { x: 0, y: 0 }, { x: 1, y: 0 });
  if (!m || Math.abs(l.dir.y) < 1e-6) return null;
  return { at: m.at, r: phyToDeg(Math.atan2(l.dir.x, l.dir.y)) };
}
/** Prism: where P₄P₃ meets face TC and the deviation it gives (°). */
export function prismConstruction(sh: PrismShape, t: PinsTrace): { at: PinsPoint; D: number; dir: PinsPoint } | null {
  const o = pinsOrdered(t, sh.M2);
  if (!o) return null;
  const l = drawnLine(o[0], o[1]);
  const m = pinsMeet(l.from, l.dir, sh.T, sub(sh.C, sh.T));
  if (!m) return null;
  return { at: m.at, D: -pinsAngle(prismInDir(sh, t.i), l.dir), dir: l.dir };
}
/** How far P₃/P₄ lie from the true reflected/emergent ray (cm, the worse of the two). */
export function pinsOff(v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', t: PinsTrace): number | null {
  if (!t.p3 || !t.p4) return null;
  if (task === 'MIRROR') {
    const r = mirrorReflected(t.i);
    return Math.max(pinsOffLine(t.p3, r.from, r.dir), pinsOffLine(t.p4, r.from, r.dir));
  }
  const ray = prismRay(pinsPrism(v), v.n, t.i);
  if (!ray.Q || !ray.dOut) return null;
  return Math.max(pinsOffLine(t.p3, ray.Q, ray.dOut), pinsOffLine(t.p4, ray.Q, ray.dOut));
}
/** A pin on the incident ray, s cm from O. */
export const pinsIncident = (v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', i: number, s: number) => (task === 'MIRROR' ? mirrorIncidentPoint(i, s) : prismIncidentPoint(pinsPrism(v), i, s));
/** Where the image of the pin s cm from O is seen (null: no ray emerges). */
export const pinsImage = (v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', i: number, s: number) => (task === 'MIRROR' ? mirrorImage(mirrorIncidentPoint(i, s)) : prismImage(pinsPrism(v), v.n, i, s));
/** The eye for angle φ. */
export const pinsEye = (v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', phi: number) => (task === 'MIRROR' ? mirrorEye(phi) : prismEye(pinsPrism(v), phi));
/** The eye angle φ that puts the eye on the true reflected/emergent ray (null: none). */
export function pinsAlignedPhi(v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', i: number): number | null {
  if (task === 'MIRROR') return i;
  const sh = pinsPrism(v);
  const ray = prismRay(sh, v.n, i);
  if (!ray.Q || !ray.dOut) return null;
  // Solve: the eye circle about M2 meets the emergent ray.
  const Q = ray.Q;
  const d = ray.dOut;
  const f = sub(Q, sh.M2);
  const b = 2 * dot(f, d);
  const c = dot(f, f) - PINS_EYE_R * PINS_EYE_R;
  const t = (-b + Math.sqrt(b * b - 4 * c)) / 2;
  const E = add(Q, d, t);
  return -pinsAngle(sh.n2, sub(E, sh.M2));
}

// ------------------------------------------------------------------ real and apparent depth

/** Height (cm) of the top face of a stack of `b` blocks (the real depth of the cross). */
export const depthStack = (v: PhyPinsVariant, b: number) => v.blocks.slice(0, Math.max(0, Math.min(DEPTH_BLOCKS, b))).reduce((t, x) => t + x, 0);
/** Paraxial apparent depth (cm below the top face) = real ÷ n. */
export const depthApparent = (v: PhyPinsVariant, b: number) => depthStack(v, b) / v.n;
/**
 * The image of the cross as seen from the eye x_e cm sideways, DEPTH_EYE_H above
 * the top face (exact refraction): the angle (rad, from the vertical) at which
 * it is seen and the depth (cm below the top) where the ray traced back meets
 * the vertical through the cross.
 */
export function depthImage(v: PhyPinsVariant, b: number, xe: number): { angle: number; depth: number } {
  const T = depthStack(v, b);
  if (T <= 0) return { angle: Math.atan2(-xe, DEPTH_EYE_H), depth: 0 };
  if (Math.abs(xe) < 1e-6) return { angle: 0, depth: T / v.n };
  // Find the exit point xs between 0 and xe: sin θ_air = n sin r.
  let lo = 0;
  let hi = xe;
  const f = (xs: number) => {
    const sinr = xs / Math.hypot(xs, T);
    const sina = (xe - xs) / Math.hypot(xe - xs, DEPTH_EYE_H);
    return v.n * sinr - sina;
  };
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) * f(lo) <= 0) hi = mid;
    else lo = mid;
  }
  const xs = (lo + hi) / 2;
  const angle = Math.atan2(xs - xe, DEPTH_EYE_H);
  const depth = Math.abs(xs) < 1e-9 ? T / v.n : (xs * DEPTH_EYE_H) / (xe - xs);
  return { angle, depth };
}
/** The angle (rad) at which the search pin's tip (height h above the bench, over the cross) is seen. */
export const depthPinAngle = (v: PhyPinsVariant, b: number, h: number, xe: number) => Math.atan2(-xe, DEPTH_EYE_H + depthStack(v, b) - h);
/** The parallax (rad) between the image and the pin tip across the eye's whole sideways range: 0 when they move together. */
export function depthParallax(v: PhyPinsVariant, b: number, h: number): number {
  const s = (xe: number) => depthImage(v, b, xe).angle - depthPinAngle(v, b, h, xe);
  return s(DEPTH_EYE_MAX) - s(-DEPTH_EYE_MAX);
}

// ------------------------------------------------------------------ dispersion

export const dispIndex = (v: PhyPinsVariant, lambda: number) => v.n + v.cauchyB * (1 / (lambda * lambda) - 1 / (LAMBDA_D * LAMBDA_D));
export const dispColour = (id: DispColour) => DISP_COLOURS.find((c) => c.id === id)!;
/** Deviation (°) of a colour at angle of incidence i on the dispersion prism (null: it does not emerge). */
export function dispDeviation(v: PhyPinsVariant, colour: DispColour, i: number): number | null {
  return prismRay(prismShape(v.dispA, 6), dispIndex(v, dispColour(colour).lambda), i).D;
}
export const dispDmin = (v: PhyPinsVariant, colour: DispColour) => prismDmin(dispIndex(v, dispColour(colour).lambda), v.dispA);
/** The angle of incidence (°) for minimum deviation of a colour: sin i = n sin(A/2). */
export const dispIMin = (v: PhyPinsVariant, colour: DispColour) => phyToDeg(Math.asin(Math.min(1, dispIndex(v, dispColour(colour).lambda) * Math.sin(phyToRad(v.dispA / 2)))));
/** Which colours reach the screen through a filter. */
export const dispPasses = (f: DispFilter, c: DispColour) => f === 'none' || (f === 'red' ? c === 'red' : f === 'green' ? c === 'green' : c === 'blue' || c === 'indigo');

// ------------------------------------------------------------------ the state

export interface PinsRow {
  /** Angle of incidence (°). */
  i: string;
  /** Mirror: r; prism: D (°). */
  a: string;
}
export interface DepthReading {
  blocks: number;
  /** Search pin height above the bench (cm). */
  h: number;
  /** The eye was moved sideways (at least 4 cm range) since the pin was last moved: parallax checked. */
  checked: boolean;
}
export interface DepthRow {
  real: string;
  app: string;
}
export interface DispLook {
  i: number;
  slit: 'narrow' | 'wide';
  dark: boolean;
  filter: DispFilter;
  dist: number;
}
export interface DispState {
  dark: boolean;
  slit: 'narrow' | 'wide';
  /** Angle of incidence set on the turntable (°). */
  i: number;
  /** Screen distance from the prism (cm). */
  dist: number;
  filter: DispFilter;
  /** Each time the student looked at the screen. */
  looks: DispLook[];
  /** The colours as the student lists them, from least deviated. */
  order: DispColour[];
  most: DispColour | '';
  least: DispColour | '';
  filterObs: DispFilterObs;
  ray: DispRay;
}
export type PinsAnswerId = 'slope' | 'n' | 'dmin' | 'dred' | 'dviol' | 'disp';
export const PINS_ANSWER_IDS: PinsAnswerId[] = ['slope', 'n', 'dmin', 'dred', 'dviol', 'disp'];
export interface PhyPinsState {
  v: 1;
  task: PinsTask | null;
  traces: PinsTrace[];
  /** Same order as `traces`. */
  table: PinsRow[];
  depth: { blocks: number; h: number; eyeX: number; readings: DepthReading[]; rows: DepthRow[] };
  disp: DispState;
  line: PhyGraphLine | null;
  /** Prism: a smooth curve drawn through the points. */
  curve: boolean;
  answers: Record<PinsAnswerId, PhyAnswer>;
  written: { precautions: string; conclusion: string };
  log: { t: number; a: string }[];
}

export const emptyDispState = (): DispState => ({ dark: false, slit: 'wide', i: 30, dist: 40, filter: 'none', looks: [], order: [], most: '', least: '', filterObs: '', ray: '' });
export function emptyPhyPinsState(): PhyPinsState {
  const blank = () => ({ value: '', unit: '' });
  return {
    v: 1,
    task: null,
    traces: [],
    table: [],
    depth: { blocks: 0, h: 0.5, eyeX: 0, readings: [], rows: [] },
    disp: emptyDispState(),
    line: null,
    curve: false,
    answers: { slope: blank(), n: blank(), dmin: blank(), dred: blank(), dviol: blank(), disp: blank() },
    written: { precautions: '', conclusion: '' },
    log: [],
  };
}

const short = z.string().max(40);
const point = z.object({ x: z.number().min(-60).max(60), y: z.number().min(-60).max(60) });
const colour = z.enum(DISP_COLOUR_IDS as [DispColour, ...DispColour[]]);
const slit = z.enum(['narrow', 'wide']);
const filter = z.enum(DISP_FILTERS);
export const phyPinsStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(PINS_TASKS).nullable(),
  traces: z
    .array(z.object({ i: z.number().int().min(0).max(90), normal: z.boolean(), p1: z.number().min(0).max(40).nullable(), p2: z.number().min(0).max(40).nullable(), p3: point.nullable(), p4: point.nullable(), joined: z.boolean() }))
    .max(12),
  table: z.array(z.object({ i: short, a: short })).max(12),
  depth: z.object({
    blocks: z.number().int().min(0).max(DEPTH_BLOCKS),
    h: z.number().min(0).max(DEPTH_PIN_MAX),
    eyeX: z.number().min(-DEPTH_EYE_MAX).max(DEPTH_EYE_MAX),
    readings: z.array(z.object({ blocks: z.number().int().min(0).max(DEPTH_BLOCKS), h: z.number().min(0).max(DEPTH_PIN_MAX), checked: z.boolean() })).max(12),
    rows: z.array(z.object({ real: short, app: short })).max(12),
  }),
  disp: z.object({
    dark: z.boolean(),
    slit,
    i: z.number().min(DISP_I.min).max(DISP_I.max),
    dist: z.number().min(DISP_DIST.min).max(DISP_DIST.max),
    filter,
    looks: z.array(z.object({ i: z.number().min(DISP_I.min).max(DISP_I.max), slit, dark: z.boolean(), filter, dist: z.number().min(DISP_DIST.min).max(DISP_DIST.max) })).max(60),
    order: z.array(colour).max(7),
    most: z.union([colour, z.literal('')]),
    least: z.union([colour, z.literal('')]),
    filterObs: z.enum(DISP_FILTER_OBS),
    ray: z.enum(DISP_RAY),
  }),
  line: phyGraphLineSchema.nullable(),
  curve: z.boolean(),
  answers: z.object({ slope: phyAnswerSchema, n: phyAnswerSchema, dmin: phyAnswerSchema, dred: phyAnswerSchema, dviol: phyAnswerSchema, disp: phyAnswerSchema }),
  written: z.object({ precautions: z.string().max(2000), conclusion: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyPinsState>;

export const PHY_PINS: SimulatorSpec = {
  id: 'phy-pins',
  subject: 'Physics',
  title: 'Light: plane mirror, prism, real and apparent depth, dispersion',
  topicNames: ['Reflection of light at plane surfaces', 'Refraction of light at plane surfaces', 'Dispersion of white light by a triangular glass prism', 'Refraction of light'],
  minutes: 45,
  rubric: [
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide:
        'Mirror: at least five angles of incidence spread over 30° or more (1); P₁ and P₂ at least 5 cm apart (1); P₃ and P₄ at least 5 cm apart (1); the normal drawn each time (1). Prism: at least six angles from 40° or less to 60° or more, so the minimum lies inside (1); P₁P₂ (1) and P₃P₄ (1) at least 5 cm apart; the normal drawn each time (1). Depth: at least four depths (1) using 1 to 4 blocks (1); parallax checked by moving the eye sideways for every reading (1); the real depth measured on the rule each time (1). Dispersion: the room darkened (1); a narrow slit (1); the prism rotated until the spectrum was clearest (near minimum deviation) and caught on the screen (1); the filter test done (1).',
    },
    {
      id: 'tracing',
      label: 'Ray tracing / no parallax',
      marks: 3,
      how: 'AUTO',
      guide:
        'Mirror and prism: P₃ and P₄ in line with the images of P₁ and P₂, so they lie on the true ray (within 0.15 cm) — in proportion to the traces done well. Depth: the search pin at the no-parallax position (within 0.2 cm of the image) — in proportion. Dispersion: the spectrum looked at with the room dark and a narrow slit (1), the screen far enough for the colours to spread (1), the order recorded after looking (1).',
    },
    {
      id: 'readings',
      label: 'Table of readings',
      marks: 4,
      how: 'AUTO',
      guide:
        'Mirror and prism: angles that match your own construction within ±1° (2), measured from the normal, not the surface; i as drawn (1); your constructed angle within 1.5° of the true one every time (1). Depth: real depths that match the rule (±0.1 cm) (1); apparent depths measured from the top face down to the pin (±0.15 cm) (2); to 0.1 cm (1). Dispersion: the colours in order, red to violet (2); violet deviated most (1) and red least (1).',
    },
    {
      id: 'graph',
      label: 'Graph / diagram',
      marks: 2,
      how: 'AUTO',
      guide:
        'Mirror: r against i plotted with a straight line across the points (1) that is a good best fit (1). Prism: D against i plotted with a smooth curve (not a straight line) (1) and the minimum marked by a horizontal line at its lowest point (1). Depth: real against apparent depth with a straight line (1), a good best fit (1). Dispersion: the ray diagram with violet deviated more than red (1); the filter observation (one colour, not split further) (1).',
    },
    {
      id: 'calculations',
      label: 'Calculations and conclusion',
      marks: 4,
      how: 'AUTO',
      guide:
        'Mirror: the slope from your own line or points (2); within 4 % of 1 (1); the conclusion r = i (1). Prism: Dₘ read from your curve (1) and within 1° of the true value (1); n = sin((A + Dₘ)/2)/sin(A/2) from your Dₘ (1); within 2 % of the true index (1). Depth: the slope of real against apparent (2); n from it (1); within 3 % of the true index (1). Dispersion: D for red (1) and violet (1) read at minimum deviation (±0.4°); angular dispersion D_violet − D_red from your values (1); n for red from your D with the formula (1).',
    },
    { id: 'figures', label: 'Significant figures and units', marks: 1, how: 'AUTO', guide: 'Slope and n with no unit (they are ratios), to 2 or 3 significant figures; angles in degrees.' },
    {
      id: 'precautions',
      label: 'Precautions / explanation',
      marks: 2,
      how: 'AI',
      guide:
        'Mirror, prism, depth: two correct precautions (1 each), e.g. pins upright and well apart; looked at the bases of the pins/images; line drawn along the silvered surface; prism/mirror not moved; sharp pencil; viewed vertically; no-parallax judged carefully; readings repeated. Dispersion: dispersion explained — each colour has a different refractive index (speed) in glass, so it is refracted by a different amount; violet most (1); one precaution — darkened room, narrow slit, screen at a suitable distance, never look at the Sun through the prism (1).',
    },
  ],
};

/** The search-pin height (cm above the bench) with no parallax for a stack of b blocks (exact, across the eye's range). */
export function depthNoParallaxH(v: PhyPinsVariant, b: number): number {
  const T = depthStack(v, b);
  let lo = 0;
  let hi = T;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (depthParallax(v, b, mid) * depthParallax(v, b, lo) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** The vertex of a least-squares parabola through the lowest points of a U-shaped set (null when it cannot be found). */
export function pinsCurveMinimum(points: { x: number; y: number }[]): { x: number; y: number } | null {
  if (points.length < 3) return null;
  const sorted = [...points].sort((a, b) => a.y - b.y).slice(0, Math.min(points.length, 5));
  const n = sorted.length;
  const sx = [0, 0, 0, 0, 0];
  const sy = [0, 0, 0];
  for (const p of sorted) {
    for (let k = 0; k < 5; k++) sx[k]! += p.x ** k;
    for (let k = 0; k < 3; k++) sy[k]! += p.y * p.x ** k;
  }
  // Normal equations for y = c + b x + a x².
  const M = [
    [n, sx[1]!, sx[2]!],
    [sx[1]!, sx[2]!, sx[3]!],
    [sx[2]!, sx[3]!, sx[4]!],
  ];
  const det = (m: number[][]) => m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const d = det(M);
  const lowest = sorted[0]!;
  if (Math.abs(d) < 1e-9) return lowest;
  const col = (k: number) => M.map((row, r) => row.map((x, c) => (c === k ? sy[r]! : x)));
  const c = det(col(0)) / d;
  const b = det(col(1)) / d;
  const a = det(col(2)) / d;
  if (a <= 1e-9) return lowest;
  const x = -b / (2 * a);
  const xs = sorted.map((p) => p.x);
  if (x < Math.min(...xs) - 5 || x > Math.max(...xs) + 5) return lowest;
  return { x, y: c + b * x + a * x * x };
}
