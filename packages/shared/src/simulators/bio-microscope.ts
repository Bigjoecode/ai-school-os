import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { bioDrawingPick, type BioDrawingStatement } from './bio-common';
import { labBetween, labPick, labRandom, roundDp } from './seeded';

/**
 * bio-microscope: the WAEC light-microscope practical. The student prepares
 * the slide the lesson uses (or picks one), places it on the stage, focuses at
 * low power with the coarse then the fine focus, sets the diaphragm and the
 * lamp, switches to high power, captures views, labels the structures, counts
 * or measures (field-of-view diameter or eyepiece graticule), works out the
 * total and the drawing magnification, judges biological drawing practice and
 * writes observations and precautions.
 *
 * Every attempt's seed gives a different eyepiece/field of view, focus
 * position, specimen geometry (cell sizes, organism, stem type, stomata) and
 * drawing size. World coordinates are micrometres, origin at the centre of the
 * field, x to the right, y downwards.
 */

export const MICRO_SLIDES = ['ONION', 'CHEEK', 'PLASMOLYSIS', 'POND', 'STEM', 'LEAF'] as const;
export type MicroSlide = (typeof MICRO_SLIDES)[number];
export const MICRO_MEDIA = ['WATER', 'NONE', 'IODINE', 'METHYLENE_BLUE', 'SALT', 'SAFRANIN'] as const;
export type MicroMedium = (typeof MICRO_MEDIA)[number];
export const MICRO_OBJECTIVES = [4, 10, 40] as const;
export type MicroObjective = (typeof MICRO_OBJECTIVES)[number];
export const MICRO_POND_ORGANISMS = ['AMOEBA', 'PARAMECIUM', 'EUGLENA', 'SPIROGYRA'] as const;
export type MicroPondOrganism = (typeof MICRO_POND_ORGANISMS)[number];
export type MicroMethod = 'COUNT' | 'GRATICULE' | 'STOMATA';

export const MICRO_MEDIUM_LABELS: Record<MicroMedium, string> = {
  WATER: 'A drop of water',
  NONE: 'Nothing (mount dry)',
  IODINE: 'Dilute iodine solution',
  METHYLENE_BLUE: 'Methylene blue',
  SALT: 'Concentrated salt (or sucrose) solution',
  SAFRANIN: 'Safranin stain',
};
const STAINS: MicroMedium[] = ['IODINE', 'METHYLENE_BLUE', 'SAFRANIN'];

/** The lessons that open this lab, and the slide each one uses. */
export const MICRO_PRACTICAL_SLIDES: Record<string, MicroSlide> = {
  'pr-bio-light-microscope-onion-cells': 'ONION',
  'pr-bio-cheek-cells': 'CHEEK',
  'pr-bio-unicellular-organisms': 'POND',
  'pr-bio-plasmolysis': 'PLASMOLYSIS',
  'pr-bio-stem-sections': 'STEM',
  'pr-bio-stomatal-density': 'LEAF',
};

export interface MicroSlideInfo {
  title: string;
  /** What the student is given and does to make the slide. */
  prepare: string;
  /** Mounting liquids accepted for this slide (first = the expected one). */
  media: MicroMedium[];
  method: MicroMethod;
  labelObjective: MicroObjective;
  measureObjective: MicroObjective;
  /** Coloured without a stain (no need to close the diaphragm for contrast). */
  coloured: boolean;
}

export const MICRO_SLIDE_INFO: Record<MicroSlide, MicroSlideInfo> = {
  ONION: { title: 'Onion epidermis (wet mount)', prepare: 'Peel the thin inner epidermis from a fleshy onion scale leaf with forceps, lay it flat in a drop of liquid on a slide and add a cover slip.', media: ['IODINE'], method: 'COUNT', labelObjective: 40, measureObjective: 10, coloured: false },
  CHEEK: { title: 'Human cheek cells (wet mount)', prepare: 'Gently scrape the inside of your cheek with a sterile cotton bud, smear it on a slide in a drop of liquid and add a cover slip. Put the bud in disinfectant.', media: ['METHYLENE_BLUE'], method: 'GRATICULE', labelObjective: 40, measureObjective: 40, coloured: false },
  PLASMOLYSIS: { title: 'Red onion / Rhoeo epidermis (plasmolysis)', prepare: 'Peel a strip of coloured epidermis, mount it in a drop of liquid, add a cover slip and leave it for 10 minutes.', media: ['SALT'], method: 'COUNT', labelObjective: 40, measureObjective: 10, coloured: true },
  POND: { title: 'Pond water (living organisms)', prepare: 'Put a drop of the pond water sample (with some green scum) on a cavity slide and add a cover slip.', media: ['WATER', 'NONE'], method: 'GRATICULE', labelObjective: 40, measureObjective: 40, coloured: false },
  STEM: { title: 'Transverse section of a young stem', prepare: 'Cut thin transverse sections of the stem with a wet razor blade, pick the thinnest with a brush, mount it in a drop of liquid and add a cover slip.', media: ['SAFRANIN', 'IODINE'], method: 'GRATICULE', labelObjective: 4, measureObjective: 4, coloured: false },
  LEAF: { title: 'Leaf epidermis (peel)', prepare: 'Fold the leaf and tear it so a thin, colourless strip of epidermis peels away (or lift it with clear tape), lay it flat on a slide in a drop of liquid and add a cover slip.', media: ['WATER', 'NONE'], method: 'STOMATA', labelObjective: 40, measureObjective: 40, coloured: false },
};

export interface MicroPoint {
  x: number;
  y: number;
}
/** A structure to label on the labelling view (world µm). */
export interface MicroTarget extends MicroPoint {
  label: string;
}
export interface MicroStoma extends MicroPoint {
  /** Radians: direction of the pore's long axis. */
  angle: number;
}
export interface MicroBundle extends MicroPoint {
  r: number;
}

export type MicroTaskId = 'reading' | 'size' | 'totalMag' | 'drawingMag';
export interface MicroTask {
  id: MicroTaskId;
  label: string;
  /** Expected unit: '' = a plain number (count, eyepiece units, magnification). */
  unit: '' | 'length' | 'per-mm2';
}

/** Relative positions (fx × L along the organism, fy × W across) of each organism's labelled parts. */
export const MICRO_ORGANISM_PARTS: Record<MicroPondOrganism, { name: string; aspect: number; parts: { label: string; fx: number; fy: number }[]; measured: string }> = {
  AMOEBA: { name: 'Amoeba', aspect: 0.62, measured: 'Amoeba (its longest length)', parts: [{ label: 'Pseudopodium', fx: 0.44, fy: -0.05 }, { label: 'Nucleus', fx: -0.06, fy: 0.05 }, { label: 'Food vacuole', fx: 0.16, fy: 0.16 }, { label: 'Contractile vacuole', fx: -0.3, fy: -0.14 }] },
  PARAMECIUM: { name: 'Paramecium', aspect: 0.34, measured: 'Paramecium (its length)', parts: [{ label: 'Cilia', fx: 0.12, fy: -0.56 }, { label: 'Macronucleus', fx: 0.0, fy: -0.02 }, { label: 'Contractile vacuole', fx: -0.3, fy: -0.18 }, { label: 'Oral groove', fx: 0.12, fy: 0.3 }] },
  EUGLENA: { name: 'Euglena', aspect: 0.26, measured: 'Euglena body (not counting the flagellum)', parts: [{ label: 'Flagellum', fx: 0.66, fy: -0.15 }, { label: 'Eyespot', fx: 0.34, fy: -0.12 }, { label: 'Chloroplast', fx: 0.12, fy: 0.2 }, { label: 'Nucleus', fx: -0.16, fy: 0 }] },
  SPIROGYRA: { name: 'Spirogyra', aspect: 0.5, measured: 'one Spirogyra cell (cross wall to cross wall)', parts: [{ label: 'Cross wall', fx: -0.5, fy: 0.3 }, { label: 'Spiral chloroplast', fx: -0.3375, fy: -0.25 }, { label: 'Nucleus', fx: 0, fy: 0 }, { label: 'Pyrenoid', fx: 0.445, fy: 0.2 }] },
};

const DISTRACTORS: Record<MicroSlide, string[]> = {
  ONION: ['Chloroplast', 'Centriole'],
  CHEEK: ['Cell wall', 'Chloroplast'],
  PLASMOLYSIS: ['Chloroplast', 'Centriole'],
  POND: ['Cell wall', 'Root hair'],
  STEM: ['Root hair', 'Stoma'],
  LEAF: ['Root hair', 'Vascular bundle'],
};

export interface BioMicroscopeVariant {
  seed: number;
  slide: MicroSlide;
  info: MicroSlideInfo;
  eyepiece: number;
  /** Field-of-view diameter (mm) at each objective, as given on the paper. */
  fov: Record<MicroObjective, number>;
  /** µm per eyepiece-graticule unit at each objective, as given on the paper. */
  calibration: Record<MicroObjective, number>;
  /** Stage height (coarse + fine) at which each objective is in focus. */
  focus: Record<MicroObjective, number>;
  organism: MicroPondOrganism | null;
  stemType: 'DICOT' | 'MONOCOT' | null;
  surface: 'LOWER' | 'UPPER' | null;
  /** COUNT slides: the cells of the central row (x boundaries, µm) and the row height. */
  row: number[];
  cellWidth: number;
  /** COUNT slides: nucleus of the central cell; PLASMOLYSIS: the protoplast inset (fractions of the cell). */
  nucleus: MicroPoint;
  inset: { l: number; r: number; t: number; b: number };
  /** GRATICULE slides: the measured object's left end (world µm), length, width and its start on the graticule (units). */
  object: { x0: number; length: number; width: number; startUnit: number };
  bundles: MicroBundle[];
  stomata: MicroStoma[];
  /** Stoma (guard-cell pair) length, µm. */
  stomaLength: number;
  /** The true reading (cells across, eyepiece units or stomata counted). */
  trueReading: number;
  /** The true size (µm) or, for STOMATA, the true density (per mm²). */
  trueSize: number;
  /** The drawing the paper describes (mm). */
  drawingLength: number;
  drawingOf: string;
  /** Actual size (µm) of what is drawn (for the drawing magnification). */
  drawnActual: number;
  targets: MicroTarget[];
  /** Label chips offered (the targets' labels and two distractors), seeded order. */
  labelOptions: string[];
  identity: { question: string; options: string[] };
  tasks: MicroTask[];
  drawing: BioDrawingStatement[];
  given: string[];
}

/** Tolerance on |stage height − focus| for a sharp image at each objective (depth of field shrinks at high power). */
export const MICRO_FOCUS_TOL: Record<MicroObjective, number> = { 4: 0.8, 10: 0.4, 40: 0.15 };
/** Light reaching the eye: lamp and diaphragm are 0–100; high power is dimmer. */
export function microBrightness(lamp: number, diaphragm: number, objective: MicroObjective): number {
  const f = objective === 4 ? 1.15 : objective === 10 ? 1 : 0.7;
  return roundDp((lamp / 100) * (0.25 + 0.75 * (diaphragm / 100)) * f, 3);
}
export const MICRO_BRIGHT_RANGE = [0.3, 0.75] as const;
/** Unstained, colourless specimens need the diaphragm partly closed for contrast. */
export const MICRO_CONTRAST_DIAPHRAGM = 60;

const shuffle = <T>(r: () => number, xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/** The hidden truth of one attempt (same on the web and the API). */
export function bioMicroscopeVariant(seed: number, slide: MicroSlide): BioMicroscopeVariant {
  const r = labRandom(seed, `bio-microscope-${slide}`);
  const info = MICRO_SLIDE_INFO[slide];
  const eyepiece = r() < 0.75 ? 10 : 15;
  const fn = eyepiece === 10 ? labBetween(r, 16, 18, 1) : labBetween(r, 11, 12.4, 1);
  const fov: Record<MicroObjective, number> = { 4: roundDp(fn / 4, 2), 10: roundDp(fn / 10, 2), 40: roundDp(fn / 40, 3) };
  const calibration: Record<MicroObjective, number> = { 4: roundDp((0.8 * fov[4] * 1000) / 100, 2), 10: roundDp((0.8 * fov[10] * 1000) / 100, 2), 40: roundDp((0.8 * fov[40] * 1000) / 100, 2) };
  const base = labBetween(r, 38, 66, 2);
  const focus: Record<MicroObjective, number> = { 4: base, 10: roundDp(base + labBetween(r, -0.45, 0.45, 2), 2), 40: roundDp(base + labBetween(r, -0.35, 0.35, 2), 2) };
  const mo = info.measureObjective;
  const R = (fov[mo] * 1000) / 2;
  const R40 = (fov[40] * 1000) / 2;
  const drawing = bioDrawingPick(seed, 'bio-microscope');

  let organism: MicroPondOrganism | null = null;
  let stemType: 'DICOT' | 'MONOCOT' | null = null;
  let surface: 'LOWER' | 'UPPER' | null = null;
  let row: number[] = [];
  let cellWidth = 0;
  let nucleus: MicroPoint = { x: 0, y: 0 };
  let inset = { l: 0, r: 0, t: 0, b: 0 };
  let object = { x0: 0, length: 0, width: 0, startUnit: 0 };
  let bundles: MicroBundle[] = [];
  let stomata: MicroStoma[] = [];
  let stomaLength = 0;
  let trueReading = 0;
  let trueSize = 0;
  let drawingLength = 0;
  let drawingOf = '';
  let drawnActual = 0;
  let targets: MicroTarget[] = [];
  let identity: BioMicroscopeVariant['identity'];

  if (info.method === 'COUNT') {
    const onion = slide === 'ONION';
    const mean = onion ? labBetween(r, 180, 300, 0) : labBetween(r, 110, 190, 0);
    cellWidth = onion ? labBetween(r, 45, 70, 0) : labBetween(r, 55, 85, 0);
    // The central row: cells from beyond the left edge of the ×4 field to beyond the right; one cell straddles x = 0.
    let x = -labBetween(r, 0.3, 0.6, 2) * mean;
    const cells: number[] = [x];
    while (x < fov[4] * 600) {
      x += mean * labBetween(r, 0.88, 1.12, 3);
      cells.push(roundDp(x, 1));
    }
    x = cells[0]!;
    while (x > -fov[4] * 600) {
      x -= mean * labBetween(r, 0.88, 1.12, 3);
      cells.unshift(roundDp(x, 1));
    }
    row = cells;
    let across = 0;
    for (let i = 0; i + 1 < row.length; i++) {
      const a = row[i]!;
      const b = row[i + 1]!;
      across += Math.max(0, Math.min(b, R) - Math.max(a, -R)) / (b - a);
    }
    trueReading = roundDp(across, 2);
    trueSize = roundDp((2 * R) / across, 1);
    // The central cell (x0 < 0 < x1) and its nucleus.
    const ci = row.findIndex((b, i) => b <= 0 && (row[i + 1] ?? 0) > 0);
    const x0 = row[ci]!;
    const x1 = row[ci + 1]!;
    const lim = R40 * 0.62;
    const lo = Math.max(x0 + 18, -lim);
    const hi = Math.min(x1 - 18, lim);
    nucleus = { x: roundDp(labBetween(r, lo, hi, 1), 1), y: roundDp(labBetween(r, -cellWidth / 2 + 13, cellWidth / 2 - 13, 1), 1) };
    if (onion) {
      const clamp = (xx: number) => roundDp(Math.max(lo, Math.min(hi, xx)), 1);
      const dir = nucleus.x > (lo + hi) / 2 ? -1 : 1;
      const xw = clamp(nucleus.x + dir * 50);
      const xv = clamp(nucleus.x + dir * 95);
      targets = [
        { label: 'Cell wall', x: xw, y: -cellWidth / 2 },
        { label: 'Nucleus', x: nucleus.x, y: nucleus.y },
        { label: 'Vacuole', x: xv, y: roundDp(nucleus.y > 0 ? -cellWidth * 0.1 : cellWidth * 0.1, 1) },
        { label: 'Cytoplasm', x: xw, y: roundDp(cellWidth / 2 - 4.5, 1) },
      ];
      drawingLength = labBetween(r, 50, 80, 0);
      drawingOf = 'one cell';
      drawnActual = trueSize;
    } else {
      inset = { l: labBetween(r, 0.1, 0.22, 2), r: labBetween(r, 0.08, 0.2, 2), t: labBetween(r, 0.14, 0.24, 2), b: labBetween(r, 0.12, 0.22, 2) };
      const w = cellWidth;
      const L = x1 - x0;
      const px0 = x0 + inset.l * L;
      const px1 = x1 - inset.r * L;
      const pt = -w / 2 + inset.t * w;
      const pb = w / 2 - inset.b * w;
      // Keep the labelled parts inside the high-power field.
      const leftGap = Math.abs(x0) < Math.abs(x1) ? { x: (x0 + px0) / 2, side: -1 } : { x: (x1 + px1) / 2, side: 1 };
      const gx = Math.max(-lim, Math.min(lim, leftGap.x));
      const mid = Math.max(-lim, Math.min(lim, (px0 + px1) / 2));
      targets = [
        { label: 'Cell wall', x: roundDp(Math.max(-lim, Math.min(lim, mid + (leftGap.side > 0 ? -L * 0.18 : L * 0.18))), 1), y: -w / 2 },
        { label: 'Cell membrane', x: roundDp(mid, 1), y: roundDp(pb, 1) },
        { label: 'Vacuole (cell sap)', x: roundDp(mid + (leftGap.side > 0 ? L * 0.08 : -L * 0.08), 1), y: roundDp((pt + pb) / 2, 1) },
        { label: 'Space filled with outside solution', x: roundDp(gx, 1), y: 0 },
      ];
      nucleus = { x: roundDp(mid + (leftGap.side > 0 ? -L * 0.12 : L * 0.12), 1), y: roundDp(pt + 6, 1) };
      drawingLength = labBetween(r, 50, 80, 0);
      drawingOf = 'one cell';
      drawnActual = trueSize;
    }
  } else if (info.method === 'GRATICULE') {
    const cal = calibration[mo];
    let units = 0;
    let aspect = 1;
    if (slide === 'CHEEK') {
      units = labBetween(r, 15, 22, 1);
      aspect = 0.86;
    } else if (slide === 'POND') {
      organism = labPick(r, MICRO_POND_ORGANISMS);
      units = organism === 'AMOEBA' ? labBetween(r, 45, 68, 1) : organism === 'PARAMECIUM' ? labBetween(r, 44, 64, 1) : organism === 'EUGLENA' ? labBetween(r, 15, 22, 1) : labBetween(r, 20, 32, 1);
      aspect = MICRO_ORGANISM_PARTS[organism].aspect;
    } else {
      stemType = r() < 0.5 ? 'DICOT' : 'MONOCOT';
      units = labBetween(r, 58, 84, 1);
    }
    const startUnit = roundDp(labBetween(r, 4, Math.max(5, 94 - units - (organism === 'EUGLENA' ? 20 : 0)), 1), 1);
    const length = roundDp(units * cal, 1);
    const x0 = roundDp(-50 * cal + startUnit * cal, 1);
    object = { x0, length, width: roundDp(length * aspect, 1), startUnit };
    trueReading = units;
    trueSize = length;
    const cx = x0 + length / 2;
    if (slide === 'CHEEK') {
      const d = length;
      nucleus = { x: roundDp(cx + labBetween(r, -0.06, 0.06, 3) * d, 1), y: roundDp(labBetween(r, -0.05, 0.05, 3) * d, 1) };
      const a = labBetween(r, -2.4, -0.7, 2);
      targets = [
        { label: 'Nucleus', x: nucleus.x, y: nucleus.y },
        { label: 'Cell membrane', x: roundDp(cx + Math.cos(a) * (d / 2) * 0.99, 1), y: roundDp(Math.sin(a) * (object.width / 2) * 0.99, 1) },
        { label: 'Cytoplasm', x: roundDp(cx + Math.cos(a + 2.6) * d * 0.3, 1), y: roundDp(Math.sin(a + 2.6) * object.width * 0.3, 1) },
      ];
      drawingLength = labBetween(r, 40, 60, 0);
      drawingOf = 'one cell';
    } else if (organism) {
      const W = object.width;
      targets = MICRO_ORGANISM_PARTS[organism].parts.map((p) => ({ label: p.label, x: roundDp(cx + p.fx * length, 1), y: roundDp(p.fy * W, 1) }));
      drawingLength = organism === 'EUGLENA' || organism === 'SPIROGYRA' ? labBetween(r, 50, 70, 0) : labBetween(r, 70, 100, 0);
      drawingOf = organism === 'SPIROGYRA' ? 'one cell' : `the ${MICRO_ORGANISM_PARTS[organism].name}`;
    } else {
      // Stem section: centre (cx, 0), radius length/2.
      const Rs = length / 2;
      const rb = labRandom(seed, 'bio-microscope-bundles');
      if (stemType === 'DICOT') {
        const n = Math.floor(labBetween(rb, 8, 14.99, 2));
        const turn = labBetween(rb, 0, Math.PI * 2, 3);
        bundles = Array.from({ length: n }, (_, i) => {
          const a = turn + (i / n) * Math.PI * 2 + labBetween(rb, -0.08, 0.08, 3);
          const rr = Rs * labBetween(rb, 0.66, 0.72, 3);
          return { x: roundDp(cx + Math.cos(a) * rr, 1), y: roundDp(Math.sin(a) * rr, 1), r: roundDp(Rs * labBetween(rb, 0.09, 0.12, 3), 1) };
        });
      } else {
        const want = Math.floor(labBetween(rb, 38, 56, 2));
        for (let k = 0; k < 4000 && bundles.length < want; k++) {
          // Denser towards the outside, as in maize.
          const rr = Rs * Math.sqrt(labBetween(rb, 0.02, 0.8, 4));
          const a = rb() * Math.PI * 2;
          const p = { x: cx + Math.cos(a) * rr, y: Math.sin(a) * rr, r: Rs * labBetween(rb, 0.035, 0.05, 4) };
          if (bundles.every((b) => Math.hypot(b.x - p.x, b.y - p.y) > (b.r + p.r) * 1.7)) bundles.push({ x: roundDp(p.x, 1), y: roundDp(p.y, 1), r: roundDp(p.r, 1) });
        }
      }
      const pol = (f: number, a: number) => ({ x: roundDp(cx + Math.cos(a) * Rs * f, 1), y: roundDp(Math.sin(a) * Rs * f, 1) });
      // The labelled bundle: the one nearest the bottom of the section.
      const vb = [...bundles].sort((a, b) => b.y - a.y)[0]!;
      if (stemType === 'DICOT') {
        targets = [
          { label: 'Epidermis', ...pol(0.985, (215 * Math.PI) / 180) },
          { label: 'Cortex', ...pol(0.9, (320 * Math.PI) / 180) },
          { label: 'Vascular bundle', x: vb.x, y: vb.y },
          { label: 'Pith', ...pol(0.18, (40 * Math.PI) / 180) },
        ];
      } else {
        // Ground tissue: the point near the centre farthest from any bundle.
        let best = { x: cx, y: 0, d: -1 };
        for (let i = -6; i <= 6; i++)
          for (let j = -6; j <= 6; j++) {
            const p = { x: cx + (i / 6) * Rs * 0.5, y: (j / 6) * Rs * 0.5 };
            const d = Math.min(...bundles.map((b) => Math.hypot(b.x - p.x, b.y - p.y) - b.r));
            if (d > best.d) best = { ...p, d };
          }
        targets = [
          { label: 'Epidermis', ...pol(0.985, (215 * Math.PI) / 180) },
          { label: 'Sclerenchyma (hypodermis)', ...pol(0.945, (330 * Math.PI) / 180) },
          { label: 'Vascular bundle', x: vb.x, y: vb.y },
          { label: 'Ground tissue (parenchyma)', x: roundDp(best.x, 1), y: roundDp(best.y, 1) },
        ];
      }
      drawingLength = labBetween(r, 70, 100, 0);
      drawingOf = 'the whole section (its diameter)';
    }
    drawnActual = trueSize;
  } else {
    surface = r() < 0.65 ? 'LOWER' : 'UPPER';
    const density = surface === 'LOWER' ? labBetween(r, 150, 300, 0) : labBetween(r, 25, 80, 0);
    stomaLength = labBetween(r, 24, 34, 1);
    const area = Math.PI * (R40 / 1000) ** 2;
    const want = Math.max(2, Math.round(density * area * 1.56)); // over a disc 1.25 × the radius
    const rs = labRandom(seed, 'bio-microscope-stomata');
    for (let k = 0; k < 6000 && stomata.length < want; k++) {
      const rr = R40 * 1.25 * Math.sqrt(rs());
      const a = rs() * Math.PI * 2;
      const p = { x: roundDp(Math.cos(a) * rr, 1), y: roundDp(Math.sin(a) * rr, 1), angle: roundDp(labBetween(rs, -0.6, 0.6, 3) + (rs() < 0.5 ? 0 : Math.PI / 2), 3) };
      // No stoma sits right on the edge of the field (so the count is unambiguous).
      if (Math.abs(Math.hypot(p.x, p.y) - R40) < stomaLength * 0.45) continue;
      if (stomata.every((s) => Math.hypot(s.x - p.x, s.y - p.y) > stomaLength * 1.6)) stomata.push(p);
    }
    trueReading = stomata.filter((s) => Math.hypot(s.x, s.y) < R40).length;
    trueSize = roundDp(trueReading / (Math.PI * (fov[40] / 2) ** 2), 1);
    const s = [...stomata].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0]!;
    const u = { x: Math.cos(s.angle), y: Math.sin(s.angle) };
    const n = { x: -u.y, y: u.x };
    const g = stomaLength * 0.22;
    // An epidermal cell: the point near the centre farthest from any stoma.
    let best = { x: 0, y: 0, d: -1 };
    for (let i = -5; i <= 5; i++)
      for (let j = -5; j <= 5; j++) {
        const p = { x: (i / 5) * R40 * 0.55, y: (j / 5) * R40 * 0.55 };
        const d = Math.min(...stomata.map((t) => Math.hypot(t.x - p.x, t.y - p.y)));
        if (d > best.d) best = { ...p, d };
      }
    targets = [
      { label: 'Guard cell', x: roundDp(s.x - n.x * g, 1), y: roundDp(s.y - n.y * g, 1) },
      { label: 'Stoma (pore)', x: s.x, y: s.y },
      { label: 'Chloroplast', x: roundDp(s.x + n.x * g + u.x * stomaLength * 0.2, 1), y: roundDp(s.y + n.y * g + u.y * stomaLength * 0.2, 1) },
      { label: 'Epidermal cell', x: roundDp(best.x, 1), y: roundDp(best.y, 1) },
    ];
    drawingLength = labBetween(r, 70, 100, 0);
    drawingOf = 'the field of view (its diameter)';
    drawnActual = fov[40] * 1000;
  }

  const labelOptions = shuffle(r, [...targets.map((t) => t.label), ...DISTRACTORS[slide]]);
  identity = microIdentity(slide);
  const mo10 = info.measureObjective;
  const subject = slide === 'CHEEK' ? 'the cheek cell lying along the graticule (its length)' : organism ? MICRO_ORGANISM_PARTS[organism].measured : 'the stem section (its diameter)';
  const tasks: MicroTask[] =
    info.method === 'COUNT'
      ? [
          { id: 'reading', label: `Number of cells across the diameter of the field of view at ×${mo10} (central row)`, unit: '' },
          { id: 'size', label: 'Estimated length of one cell', unit: 'length' },
          { id: 'totalMag', label: `Total magnification of the microscope with the ×${info.labelObjective} objective`, unit: '' },
          { id: 'drawingMag', label: `Magnification of your drawing (${drawingOf} drawn ${drawingLength} mm long)`, unit: '' },
        ]
      : info.method === 'GRATICULE'
        ? [
            { id: 'reading', label: `Length of ${subject} in eyepiece units`, unit: '' },
            { id: 'size', label: `Actual length of ${subject.replace(/ \(.*\)$/, '')}`, unit: 'length' },
            { id: 'totalMag', label: `Total magnification of the microscope with the ×${info.labelObjective} objective`, unit: '' },
            { id: 'drawingMag', label: `Magnification of your drawing (${drawingOf} drawn ${drawingLength} mm ${slide === 'STEM' ? 'across' : 'long'})`, unit: '' },
          ]
        : [
            { id: 'reading', label: 'Number of stomata in the field of view at ×40 (count those whose centre is inside the circle)', unit: '' },
            { id: 'size', label: 'Stomatal density (number of stomata per mm²)', unit: 'per-mm2' },
            { id: 'totalMag', label: 'Total magnification of the microscope with the ×40 objective', unit: '' },
            { id: 'drawingMag', label: `Magnification of your drawing (${drawingOf} drawn ${drawingLength} mm across)`, unit: '' },
          ];
  const given = [
    `Eyepiece ×${eyepiece}. Objectives ×4, ×10 and ×40.`,
    `Diameter of the field of view: ${fov[4].toFixed(2)} mm at ×4, ${fov[10].toFixed(2)} mm at ×10 and ${fov[40].toFixed(3)} mm at ×40.`,
    ...(info.method === 'GRATICULE' ? [`The eyepiece graticule has 100 divisions. At ×${mo} one eyepiece unit = ${calibration[mo].toFixed(2)} µm.`] : []),
    `Your drawing of ${drawingOf} is ${drawingLength} mm ${info.method === 'COUNT' || (slide !== 'STEM' && info.method === 'GRATICULE') ? 'long' : 'across'}.`,
  ];
  return { seed, slide, info, eyepiece, fov, calibration, focus, organism, stemType, surface, row, cellWidth, nucleus, inset, object, bundles, stomata, stomaLength, trueReading, trueSize, drawingLength, drawingOf, drawnActual, targets, labelOptions, identity, tasks, drawing, given };
}

function microIdentity(slide: MicroSlide): BioMicroscopeVariant['identity'] {
  switch (slide) {
    case 'ONION':
    case 'CHEEK':
      return { question: 'What kind of cells are these?', options: ['Plant cells', 'Animal cells', 'Bacterial cells'] };
    case 'PLASMOLYSIS':
      return { question: 'What state are most of the cells in?', options: ['Turgid', 'Plasmolysed', 'Burst (lysed)'] };
    case 'POND':
      return { question: 'Name the organism you measured.', options: ['Amoeba', 'Paramecium', 'Euglena', 'Chlamydomonas', 'Volvox', 'Spirogyra'] };
    case 'STEM':
      return { question: 'What kind of stem is this?', options: ['Dicotyledonous stem', 'Monocotyledonous stem', 'Dicotyledonous root'] };
    case 'LEAF':
      return { question: 'From your count, which surface of a dicot leaf is this peel most likely from?', options: ['Lower surface', 'Upper surface'] };
  }
}

/** The right answer to the identity question (plasmolysis depends on what the student mounted the cells in). */
export function microIdentityAnswer(v: BioMicroscopeVariant, medium: MicroMedium | null): string {
  switch (v.slide) {
    case 'ONION':
      return 'Plant cells';
    case 'CHEEK':
      return 'Animal cells';
    case 'PLASMOLYSIS':
      return medium === 'SALT' ? 'Plasmolysed' : 'Turgid';
    case 'POND':
      return MICRO_ORGANISM_PARTS[v.organism!].name;
    case 'STEM':
      return v.stemType === 'DICOT' ? 'Dicotyledonous stem' : 'Monocotyledonous stem';
    case 'LEAF':
      return v.surface === 'LOWER' ? 'Lower surface' : 'Upper surface';
  }
}

export const microIsStained = (slide: MicroSlide, medium: MicroMedium | null) => MICRO_SLIDE_INFO[slide].coloured || (!!medium && STAINS.includes(medium));

/** How a captured view looks: sharp, well lit, enough contrast. */
export function microViewQuality(v: BioMicroscopeVariant, s: MicroScope, medium: MicroMedium | null) {
  const dz = s.coarse + s.fine - v.focus[s.objective];
  const brightness = microBrightness(s.lamp, s.diaphragm, s.objective);
  const sharp = Math.abs(dz) <= MICRO_FOCUS_TOL[s.objective] + 1e-9;
  const lit = brightness >= MICRO_BRIGHT_RANGE[0] && brightness <= MICRO_BRIGHT_RANGE[1];
  const contrast = microIsStained(v.slide, medium) || s.diaphragm <= MICRO_CONTRAST_DIAPHRAGM;
  return { dz, brightness, sharp, lit, contrast };
}

/** True answers for the calculation tasks (size in µm; density per mm²). */
export function bioMicroscopeAnswers(v: BioMicroscopeVariant): Record<MicroTaskId, number> {
  return { reading: v.trueReading, size: v.trueSize, totalMag: v.eyepiece * v.info.labelObjective, drawingMag: (v.drawingLength * 1000) / v.drawnActual };
}

// ------------------------------------------------------------------ the student's work

export interface MicroScope {
  objective: MicroObjective;
  /** Stage height: coarse focus 0–100 (steps of 0.5), fine focus −2…2 (steps of 0.02). */
  coarse: number;
  fine: number;
  /** 0 (closed) – 100 (fully open). */
  diaphragm: number;
  /** 0 – 100. */
  lamp: number;
}
export interface MicroCapture extends MicroScope {
  t: number;
}
export interface MicroAnswer {
  value: string;
  unit: string;
}
export interface BioMicroscopeState {
  v: 1;
  /** The slide (set from the lesson, or chosen by the student). */
  slide: MicroSlide | null;
  prep: { medium: MicroMedium | null; coverslip: 'ANGLE' | 'DROP' | null; placed: boolean; clipped: boolean };
  scope: MicroScope;
  flags: {
    /** An image was brought into focus at ×4 or ×10. */
    focusedLow: boolean;
    /** The ×40 objective was used before any low-power focus. */
    highBeforeLow: boolean;
    /** Coarse-focus moves made with the ×40 objective in place. */
    coarseAtHigh: number;
    /** The objective was driven into the cover slip. */
    crashed: boolean;
    /** The lamp or diaphragm was adjusted. */
    lightAdjusted: boolean;
  };
  /** Snapshots of the view (at most one per objective: the latest). */
  captures: MicroCapture[];
  /** Label chosen for each target (same order as the variant's targets). */
  labels: string[];
  identity: string;
  answers: Record<MicroTaskId, MicroAnswer>;
  /** Drawing statements the student ticked as good practice. */
  drawing: string[];
  written: { observations: string; precautions: string };
  log: { t: number; a: string }[];
}

export function emptyBioMicroscopeState(): BioMicroscopeState {
  const blank = { value: '', unit: '' };
  return {
    v: 1,
    slide: null,
    prep: { medium: null, coverslip: null, placed: false, clipped: false },
    scope: { objective: 4, coarse: 10, fine: 0, diaphragm: 100, lamp: 15 },
    flags: { focusedLow: false, highBeforeLow: false, coarseAtHigh: 0, crashed: false, lightAdjusted: false },
    captures: [],
    labels: [],
    identity: '',
    answers: { reading: { ...blank }, size: { ...blank }, totalMag: { ...blank }, drawingMag: { ...blank } },
    drawing: [],
    written: { observations: '', precautions: '' },
    log: [],
  };
}

const short = z.string().max(40);
const answer = z.object({ value: short, unit: short });
const objective = z.union([z.literal(4), z.literal(10), z.literal(40)]);
const scope = z.object({ objective, coarse: z.number().min(0).max(100), fine: z.number().min(-2).max(2), diaphragm: z.number().min(0).max(100), lamp: z.number().min(0).max(100) });
export const bioMicroscopeStateSchema = z.object({
  v: z.literal(1),
  slide: z.enum(MICRO_SLIDES).nullable(),
  prep: z.object({ medium: z.enum(MICRO_MEDIA).nullable(), coverslip: z.enum(['ANGLE', 'DROP']).nullable(), placed: z.boolean(), clipped: z.boolean() }),
  scope,
  flags: z.object({ focusedLow: z.boolean(), highBeforeLow: z.boolean(), coarseAtHigh: z.number().int().min(0).max(100_000), crashed: z.boolean(), lightAdjusted: z.boolean() }),
  captures: z.array(scope.extend({ t: z.number().min(0) })).max(3),
  labels: z.array(z.string().max(60)).max(8),
  identity: z.string().max(60),
  answers: z.object({ reading: answer, size: answer, totalMag: answer, drawingMag: answer }),
  drawing: z.array(z.string().max(20)).max(20),
  written: z.object({ observations: z.string().max(2000), precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<BioMicroscopeState>;

export const BIO_MICROSCOPE: SimulatorSpec = {
  id: 'bio-microscope',
  subject: 'Biology',
  title: 'Light microscope',
  topicNames: ['Cell Structure and Functions', 'Forms in which Living Cells Exist', 'The Cell and its Environment', 'Supporting tissues in plants', 'Transpiration'],
  minutes: 40,
  rubric: [
    { id: 'procedure', label: 'Preparing the slide and using the microscope', marks: 4, how: 'AUTO', guide: 'The right mounting liquid or stain (iodine for onion, methylene blue for cheek cells, concentrated salt/sucrose for plasmolysis, safranin or iodine for stem sections, water or nothing for pond water and leaf impressions); the cover slip lowered at an angle with a mounted needle (no air bubbles); focused at low power first; never the coarse focus with the ×40 objective (no crushed cover slip).' },
    { id: 'image', label: 'Focus and illumination', marks: 3, how: 'AUTO', guide: 'A sharp captured view at the objective used for labelling (1) and at the one used for measuring (1); the views well lit, with the diaphragm partly closed for unstained, colourless specimens (1).' },
    { id: 'labels', label: 'Identification and labelling', marks: 4, how: 'AUTO', guide: 'The identity question answered from what is seen (1); each structure labelled correctly (3, shared between the targets).' },
    { id: 'measurement', label: 'Measurement', marks: 4, how: 'AUTO', guide: 'The count or graticule reading within tolerance of the specimen (2: cells ±1, eyepiece units ±1.5, stomata ±1; half marks within twice that); the size or density worked out correctly from your own reading and the field of view or calibration (1); the result within 15 % of the true value (1).' },
    { id: 'magnification', label: 'Magnification', marks: 3, how: 'AUTO', guide: 'Total magnification = eyepiece × objective (1). Drawing magnification = drawing size ÷ actual size, in the same units, from your own size (2; 1 for a unit-conversion slip).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'The size with a length unit (µm or mm) or the density per mm²; magnifications written as a number or with ×, never with a unit.' },
    { id: 'drawing', label: 'Biological drawing practice', marks: 2, how: 'AUTO', guide: 'Every statement about drawing practice judged correctly (2; 1 with one slip): title, magnification, clean continuous lines, ruled label lines that do not cross and have no arrowheads, labels to the side, no shading.' },
    { id: 'observations', label: 'Observations', marks: 3, how: 'AI', guide: 'Three correct observations of what this slide shows (shape and arrangement of the cells or organism, the structures visible, colours from the stain or sap, and what is absent, e.g. no chloroplasts in onion epidermis, no cell wall in cheek cells).' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions for this practical, e.g. lower the cover slip at an angle to avoid air bubbles; focus at low power first; use only the fine focus at high power; do not let the specimen dry out; use a thin, single layer of tissue; clean the lenses with lens tissue; dispose of cheek swabs in disinfectant.' },
  ],
};
