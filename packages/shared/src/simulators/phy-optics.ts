import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom } from './seeded';

/**
 * phy-optics: the WAEC optical bench on a metre rule. Two tasks:
 *  - LENS: the illuminated object (a cross-wire in front of a lamp) stands at
 *    the 0 cm mark, the converging lens at u and a white screen beyond it. The
 *    student moves the screen until the image of the cross-wire is sharpest
 *    and reads v = screen − u.
 *  - MIRROR: the concave mirror stands at the 0 cm mark facing along the rule;
 *    the object at u and the screen (both slightly off the axis, side by side)
 *    are on the same side, so v is read straight off the rule at the screen.
 * Either way the student first finds a rough focal length by focusing a
 * distant window, takes five or more values of u, tabulates u, v, 1/u and
 * 1/v, plots 1/v against 1/u (a straight line of slope −1) and gets f from
 * the intercepts (each intercept = 1/f). Units: cm.
 *
 * The image is real only for u > f (v = uf / (u − f)). On a screen s from the
 * lens or mirror every point of the object becomes a blur disc of diameter
 * D·|s/v − 1| (D the aperture), so the image is sharp only near s = v and
 * blurs steadily either side of it. The best focus is shifted a little (under
 * 0.4 %) from the thin-lens value by aberrations (a seeded smooth function of
 * u), so it must be found by looking, not by formula.
 */

export const OPTICS_TASKS = ['LENS', 'MIRROR'] as const;
export type OpticsTask = (typeof OPTICS_TASKS)[number];

/** The metre rule (cm) and the apertures (cm) of the lens and the mirror. */
export const OPTICS_RULE = 100;
export const OPTICS_APERTURE = 5;
/** The cross-wire object: radius of the illuminated hole (cm). */
export const OPTICS_OBJECT_R = 1.2;
/** Limits for u (cm) and the screen (cm on the rule). */
export const OPTICS_U_MIN = 5;
export const OPTICS_U_MAX = 90;
/** LENS: the screen holder cannot come closer to the lens holder than this (cm). */
export const OPTICS_HOLDER_GAP = 2;
/** The rough focus: the hand-held screen's distance range from the lens or mirror (cm). */
export const OPTICS_ROUGH_MIN = 2;
export const OPTICS_ROUGH_MAX = 40;

export interface PhyOpticsVariant {
  seed: number;
  /** True focal lengths (cm) of the converging lens and of the concave mirror. */
  lensF: number;
  mirrorF: number;
  /** The window focused for the rough focal length (cm away). */
  window: number;
  /** Aberration: the best focus is v(1 + amp·sin(u·0.31 + phase)). */
  aberration: { amp: number; phase: number };
  /** How far (cm) the object's centre sits off the lens/mirror axis before the centres are lined up. */
  misalign: number;
}

export function phyOpticsVariant(seed: number): PhyOpticsVariant {
  const r = labRandom(seed, 'phy-optics');
  return {
    seed,
    lensF: labBetween(r, 10, 15, 2),
    mirrorF: labBetween(r, 8, 12, 2),
    window: labBetween(r, 600, 900, 0),
    aberration: { amp: labBetween(r, 0.0015, 0.004, 4), phase: labBetween(r, 0, 6.28, 2) },
    misalign: labBetween(r, 1.2, 1.8, 2),
  };
}

export const opticsF = (v: PhyOpticsVariant, task: OpticsTask) => (task === 'MIRROR' ? v.mirrorF : v.lensF);

/** Distance of the screen from the lens or mirror (cm) for the bench as set. */
export const opticsV = (task: OpticsTask, u: number, screen: number) => (task === 'MIRROR' ? screen : screen - u);
/** The screen position on the rule (cm) for a screen distance s. */
export const opticsScreenAt = (task: OpticsTask, u: number, s: number) => (task === 'MIRROR' ? s : u + s);

/** The real image for an object at u: where it is sharpest (cm from the lens or mirror), or null when u ≤ f (no real image). */
export function opticsImage(v: PhyOpticsVariant, task: OpticsTask, u: number): number | null {
  const f = opticsF(v, task);
  if (u <= f + 0.05) return null;
  const thin = (u * f) / (u - f);
  return thin * (1 + v.aberration.amp * Math.sin(u * 0.31 + v.aberration.phase));
}

/** Diameter (cm) of the blur disc each object point makes on a screen s from the lens or mirror. */
export function opticsBlur(v: PhyOpticsVariant, task: OpticsTask, u: number, s: number): number {
  const img = opticsImage(v, task, u);
  const k = img ? 1 / img : 1 / opticsF(v, task) - 1 / u;
  return OPTICS_APERTURE * Math.abs(s * k - 1);
}

/** How far (cm) the screen may be from the best focus and still count as "at the sharpest image". */
export const opticsFocusTol = (vBest: number) => Math.max(0.3, 0.02 * vBest);

/** The rough focus: where the distant window's image is sharp (cm from the lens or mirror) and the blur on a screen at s. */
export const opticsWindowImage = (v: PhyOpticsVariant, task: OpticsTask) => 1 / (1 / opticsF(v, task) - 1 / v.window);
export const opticsWindowBlur = (v: PhyOpticsVariant, task: OpticsTask, s: number) => OPTICS_APERTURE * Math.abs(s * (1 / opticsF(v, task) - 1 / v.window) - 1);
export const opticsRoughTol = (v: PhyOpticsVariant, task: OpticsTask) => Math.max(0.5, 0.04 * opticsWindowImage(v, task));

/** The values of u on each task's card (cm). */
export const OPTICS_CARD_U: Record<OpticsTask, number[]> = { LENS: [20, 25, 30, 40, 50], MIRROR: [15, 20, 25, 30, 35] };
/** The spread of u a good set of readings covers (cm). */
export const OPTICS_U_SPREAD: Record<OpticsTask, number> = { LENS: 20, MIRROR: 15 };

// ------------------------------------------------------------------ the student's work

/** The bench at the moment the student recorded a reading. */
export interface OpticsReading {
  u: number;
  screen: number;
  aligned: boolean;
}
/** A row of the table as written: u, v (cm), 1/u and 1/v (cm⁻¹). */
export interface OpticsRow {
  u: string;
  v: string;
  iu: string;
  iv: string;
}
export type OpticsAnswerId = 'rough' | 'xint' | 'yint' | 'f';
export interface PhyOpticsState {
  v: 1;
  task: OpticsTask | null;
  /** The centres of the object, lens/mirror and screen are lined up on one axis. */
  aligned: boolean;
  /** Object distance u (cm): the lens's mark on the rule (LENS) or the object's (MIRROR). */
  u: number;
  /** The screen's mark on the rule (cm). */
  screen: number;
  /** The rough focus: the lens/mirror-to-screen distance (cm) at which the student saw the window sharpest (null: not done). */
  rough: number | null;
  readings: OpticsReading[];
  table: OpticsRow[];
  line: PhyGraphLine | null;
  answers: Record<OpticsAnswerId, PhyAnswer>;
  written: { precautions: string };
  log: { t: number; a: string }[];
}

/** Where a fresh bench starts for each task. */
export const OPTICS_START: Record<OpticsTask, { u: number; screen: number }> = { LENS: { u: 30, screen: 70 }, MIRROR: { u: 30, screen: 50 } };

export function emptyPhyOpticsState(): PhyOpticsState {
  const blank = () => ({ value: '', unit: '' });
  return {
    v: 1,
    task: null,
    aligned: false,
    u: OPTICS_START.LENS.u,
    screen: OPTICS_START.LENS.screen,
    rough: null,
    readings: [],
    table: [],
    line: null,
    answers: { rough: blank(), xint: blank(), yint: blank(), f: blank() },
    written: { precautions: '' },
    log: [],
  };
}

const short = z.string().max(40);
const pos = z.number().min(0).max(OPTICS_RULE);
export const phyOpticsStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(OPTICS_TASKS).nullable(),
  aligned: z.boolean(),
  u: pos,
  screen: pos,
  rough: z.number().min(0).max(OPTICS_ROUGH_MAX).nullable(),
  readings: z.array(z.object({ u: pos, screen: pos, aligned: z.boolean() })).max(12),
  table: z.array(z.object({ u: short, v: short, iu: short, iv: short })).max(12),
  line: phyGraphLineSchema.nullable(),
  answers: z.object({ rough: phyAnswerSchema, xint: phyAnswerSchema, yint: phyAnswerSchema, f: phyAnswerSchema }),
  written: z.object({ precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyOpticsState>;

export const PHY_OPTICS: SimulatorSpec = {
  id: 'phy-optics',
  subject: 'Physics',
  title: 'Focal length on the optical bench',
  topicNames: ['Refraction of light at curved surfaces', 'Reflection of light at curved surfaces', 'Lenses', 'Curved mirrors'],
  minutes: 45,
  rubric: [
    { id: 'procedure', label: 'Procedure', marks: 4, how: 'AUTO', guide: 'A rough focal length found first by focusing a distant window, and recorded (1); at least five different values of u, each giving a real image (u > f) (1); the values of u well spread (over at least 20 cm for the lens, 15 cm for the mirror) (1); the centres of the object, lens/mirror and screen lined up on the same axis for every reading (1).' },
    { id: 'focusing', label: 'Locating the image', marks: 3, how: 'AUTO', guide: 'The screen at the sharpest image for each reading (within 2 % of v, or 0.3 cm) — marks in proportion to the readings focused well.' },
    { id: 'readings', label: 'Table of readings', marks: 4, how: 'AUTO', guide: 'u and v that match the bench (±0.2 cm) (2); u and v recorded to 1 decimal place in cm (1); 1/u and 1/v worked out correctly (to 3 significant figures) (1).' },
    { id: 'graph', label: 'Graph', marks: 2, how: 'AUTO', guide: '1/v against 1/u plotted with a straight line drawn across the points (1); the line is a good best fit (slope within 6 % of the points’ best fit) (1).' },
    { id: 'calculations', label: 'Intercepts and focal length', marks: 4, how: 'AUTO', guide: 'The intercept on the 1/u axis (1) and on the 1/v axis (1) read from your own line or points (within 3 %); f = 1/intercept worked out from your intercepts (1); f within 4 % of the true focal length (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Intercepts in cm⁻¹ (or m⁻¹) and the focal length in cm (or m), every answer with its unit.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each), e.g. the centres of the object, lens/mirror and screen on the same horizontal axis; the image located at the sharpest focus (moving the screen to and fro); a rough focal length found first; distances measured from the optical centre of the lens / pole of the mirror; the lens/mirror clean; readings taken at eye level to avoid parallax; stray light kept out (darkened room); readings repeated.' },
  ],
};
