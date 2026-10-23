import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, phyToDeg, phyToRad, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom } from './seeded';

/**
 * phy-glass-block: WAEC refraction through a rectangular glass block on a
 * drawing board. Face AB lies along y = 0 (incident side, y > 0), face CD
 * along y = −thickness; O, the point of incidence, is the origin. For each
 * angle of incidence i the student draws the normal at O, sticks P₁ and P₂ on
 * the incident ray, looks through CD (moving their eye) and sticks P₃ and P₄
 * in line with the images of P₁ and P₂, then removes the block, joins P₃P₄ to
 * CD at E and joins OE (the refracted ray) and measures r. Units: cm and
 * degrees; the hidden refractive index and thickness come from the seed.
 */

/** Block outline (cm): AB from x = BLOCK_LEFT to BLOCK_RIGHT along y = 0. */
export const GLASS_BLOCK_LEFT = -3.5;
export const GLASS_BLOCK_RIGHT = 7.5;
/** The drawing sheet (cm). */
export const GLASS_SHEET = { left: -10, right: 13, top: 11, bottom: -19 } as const;
/** Pins closer than this (cm) are "too close together". */
export const GLASS_PIN_SPACING = 5;
export const GLASS_ANGLE_MIN = 10;
export const GLASS_ANGLE_MAX = 80;

export interface PhyGlassVariant {
  seed: number;
  /** Refractive index of the glass. */
  n: number;
  /** Width of the block, AB to CD (cm). */
  thickness: number;
}

export function phyGlassVariant(seed: number): PhyGlassVariant {
  const r = labRandom(seed, 'phy-glass-block');
  return { seed, n: labBetween(r, 1.46, 1.58, 3), thickness: labBetween(r, 5.5, 7.0, 1) };
}

export interface GlassPoint {
  x: number;
  y: number;
}

/** True angle of refraction (degrees). */
export const glassRefraction = (v: PhyGlassVariant, i: number) => phyToDeg(Math.asin(Math.sin(phyToRad(i)) / v.n));

/** A point on the incident ray, `s` cm from O (towards the upper left). */
export const glassIncidentPoint = (i: number, s: number): GlassPoint => ({ x: -s * Math.sin(phyToRad(i)), y: s * Math.cos(phyToRad(i)) });

/** The true ray through the block: exit point E on CD, emergent direction (unit), lateral displacement (cm). */
export function glassRay(v: PhyGlassVariant, i: number): { r: number; exit: GlassPoint; dir: GlassPoint; lateral: number } {
  const r = glassRefraction(v, i);
  const exit = { x: v.thickness * Math.tan(phyToRad(r)), y: -v.thickness };
  const dir = { x: Math.sin(phyToRad(i)), y: -Math.cos(phyToRad(i)) };
  const lateral = (v.thickness * Math.sin(phyToRad(i - r))) / Math.cos(phyToRad(r));
  return { r, exit, dir, lateral };
}

/** Where a pin on the incident ray appears when seen through face CD: on the emergent line (shifted sideways by the block). */
export function glassImage(v: PhyGlassVariant, i: number, s: number): GlassPoint {
  const p = glassIncidentPoint(i, s);
  const shift = v.thickness * (Math.tan(phyToRad(glassRefraction(v, i))) - Math.tan(phyToRad(i)));
  return { x: p.x + shift, y: p.y };
}

/** Perpendicular distance (cm) of a point from the true emergent ray. */
export function glassOffEmergent(v: PhyGlassVariant, i: number, p: GlassPoint): number {
  const { exit, dir } = glassRay(v, i);
  return Math.abs((p.x - exit.x) * dir.y - (p.y - exit.y) * dir.x);
}

/** The student's construction: where line P₄P₃ meets CD, and the angle of refraction it gives (null if it cannot). */
export function glassConstruction(v: PhyGlassVariant, p3: GlassPoint | null, p4: GlassPoint | null): { exit: GlassPoint; r: number } | null {
  if (!p3 || !p4) return null;
  const dy = p3.y - p4.y;
  if (Math.abs(dy) < 1e-6) return null;
  const k = (-v.thickness - p4.y) / dy;
  const x = p4.x + k * (p3.x - p4.x);
  if (!Number.isFinite(x)) return null;
  return { exit: { x, y: -v.thickness }, r: phyToDeg(Math.atan2(x, v.thickness)) };
}

// ------------------------------------------------------------------ the student's work

export interface GlassTrace {
  /** Angle of incidence (whole degrees). */
  i: number;
  normal: boolean;
  /** Distances of P₁ and P₂ from O along the incident ray (cm). */
  p1: number | null;
  p2: number | null;
  p3: GlassPoint | null;
  p4: GlassPoint | null;
  /** Block removed and P₃P₄ joined to CD and O. */
  joined: boolean;
}
export interface GlassRow {
  i: string;
  r: string;
  sini: string;
  sinr: string;
}
export type GlassTaskId = 'slope' | 'n';
export interface PhyGlassState {
  v: 1;
  traces: GlassTrace[];
  /** Same order as `traces`. */
  table: GlassRow[];
  line: PhyGraphLine | null;
  answers: Record<GlassTaskId, PhyAnswer>;
  written: { precautions: string };
  log: { t: number; a: string }[];
}

export function emptyPhyGlassState(): PhyGlassState {
  return { v: 1, traces: [], table: [], line: null, answers: { slope: { value: '', unit: '' }, n: { value: '', unit: '' } }, written: { precautions: '' }, log: [] };
}

const short = z.string().max(40);
const point = z.object({ x: z.number().min(-40).max(40), y: z.number().min(-40).max(40) });
export const phyGlassStateSchema = z.object({
  v: z.literal(1),
  traces: z
    .array(z.object({ i: z.number().int().min(GLASS_ANGLE_MIN).max(GLASS_ANGLE_MAX), normal: z.boolean(), p1: z.number().min(0).max(30).nullable(), p2: z.number().min(0).max(30).nullable(), p3: point.nullable(), p4: point.nullable(), joined: z.boolean() }))
    .max(10),
  table: z.array(z.object({ i: short, r: short, sini: short, sinr: short })).max(10),
  line: phyGraphLineSchema.nullable(),
  answers: z.object({ slope: phyAnswerSchema, n: phyAnswerSchema }),
  written: z.object({ precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyGlassState>;

export const PHY_GLASS_BLOCK: SimulatorSpec = {
  id: 'phy-glass-block',
  subject: 'Physics',
  title: 'Refractive index of a glass block',
  topicNames: ['Refraction of light at plane surfaces', 'Refraction of light', "Snell's law"],
  minutes: 45,
  rubric: [
    { id: 'procedure', label: 'Procedure', marks: 4, how: 'AUTO', guide: 'At least five angles of incidence spread over at least 30° (e.g. 20°–70°) (1); P₁ and P₂ at least 5 cm apart (1); P₃ and P₄ at least 5 cm apart (1); the normal drawn at the point of incidence each time (1).' },
    { id: 'tracing', label: 'Ray tracing', marks: 3, how: 'AUTO', guide: 'P₃ and P₄ in line with the images of P₁ and P₂, so they lie on the true emergent ray (within 0.15 cm) — marks in proportion to the traces done well.' },
    { id: 'readings', label: 'Table of readings', marks: 4, how: 'AUTO', guide: 'Angles r that match your own construction within ±1° (2); sin i and sin r correct to 3 decimal places (±0.005) (1); your constructed r within 1.5° of the true angle of refraction every time (1).' },
    { id: 'graph', label: 'Graph', marks: 2, how: 'AUTO', guide: 'sin i against sin r plotted with a straight line drawn across the points (1); the line is a good best fit (slope within 6 % of the points’ best fit) (1).' },
    { id: 'calculations', label: 'Slope and refractive index', marks: 4, how: 'AUTO', guide: 'Slope of sin i against sin r from your own data or line (2); n stated from the slope (1); n within 3 % of the true refractive index (1).' },
    { id: 'figures', label: 'Significant figures and units', marks: 1, how: 'AUTO', guide: 'n given to 2 or 3 significant figures with no unit (it is a ratio).' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each), e.g. pins upright (vertical); pins far apart (at least 5 cm); look at the bases of the pins (images) when lining them up; the block not moved during an observation / outline traced accurately; sharp pencil and thin lines; avoid parallax when reading the protractor.' },
  ],
};
