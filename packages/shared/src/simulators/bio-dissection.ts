import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { bioDrawingPick, type BioDrawingStatement } from './bio-common';
import { labBetween, labRandom, roundDp } from './seeded';

/**
 * bio-dissection: WAEC water transport in a stem, the rat's alimentary system
 * and growing microorganisms. The one source of truth for all three tasks:
 * the web shows these readings and the API marks against them.
 *
 * EOSIN (pr-bio-eosin-water-uptake): a young balsam plant, roots washed free
 * of soil, stands in eosin in a well-lit, airy place. The red front rises up
 * the translucent stem at a seeded rate after a short lag (the dye has to
 * cross the root); in a still, dark cupboard transpiration is slower and so
 * is the dye. Roots washed roughly are torn: the dye floods in at once and
 * also spreads sideways into the cortex. The student reads the height of the
 * front with a ruler at intervals (stopwatch), notes when the leaf veins turn
 * red, then cuts thin transverse sections at different heights (below the
 * front: red xylem in a ring of bundles; above it: nothing) and a
 * longitudinal section, examines them with the hand lens or microscope,
 * draws a section shading only the xylem, and works out the rate of rise.
 *
 * RAT (pr-bio-rat-dissection-alimentary): a rat killed humanely by the
 * teacher (or preserved), pinned ventral side up by its four limbs. The skin
 * is lifted with forceps and cut along the midline, pinned back; the body wall
 * is cut the same way. Cutting without lifting nicks the gut. The gut is
 * displaced to one side and unravelled with a seeker (pulling with forceps
 * tears the mesentery). Organs are identified and labelled on a drawing of
 * the dissection as displayed (the rat has no gall bladder). The body
 * (snout to anus) and the small and large intestines are measured (a damp
 * thread laid along the gut, then the thread on the ruler; pulling the gut
 * straight stretches it) and the gut : body ratio worked out. The models are
 * schematic and respectful: no blood or gore.
 *
 * MICROBE (pr-bio-microorganisms-culture): moist bread exposed to the air
 * and kept in a polythene bag in a warm, dark place grows Rhizopus (white
 * hyphae, black sporangia); dry bread or bread kept cold grows little. Four
 * nutrient agar plates labelled on the base: a control never opened, one
 * open to the air for 20 minutes, one touched with an unwashed finger and
 * one with the finger after washing with soap. Lids taped with two short
 * strips, the plates inverted and incubated at 25–30 °C for 2–3 days; the
 * colonies (seeded, each with its own time to appear) are counted without
 * opening the plates; the % reduction from washing is worked out.
 */

export const DISSECT_TASKS = ['EOSIN', 'RAT', 'MICROBE'] as const;
export type DissectTask = (typeof DISSECT_TASKS)[number];
/** The lessons that open this lab, and the task each one sets. */
export const DISSECT_PRACTICAL_TASKS: Record<string, DissectTask> = {
  'pr-bio-eosin-water-uptake': 'EOSIN',
  'pr-bio-rat-dissection-alimentary': 'RAT',
  'pr-bio-microorganisms-culture': 'MICROBE',
};
export const DISSECT_TASK_TITLE: Record<DissectTask, string> = {
  EOSIN: 'Path of water in a plant using a dye',
  RAT: 'Dissection of a rat: the alimentary system',
  MICROBE: 'Growing microorganisms: bread mould and bacteria',
};

const norm = (r: () => number) => (r() + r() + r() + r() - 2) * 1.732;
const shuffle = <T>(r: () => number, xs: readonly T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

// ================================================================== EOSIN

export const EOSIN_CLOCK_MAX = 180;
export const EOSIN_MAX_READS = 16;
export const EOSIN_MAX_SECTIONS = 8;
/** At least this many readings, spread over at least this long (min). */
export const EOSIN_MIN_READS = 4;
export const EOSIN_MIN_SPAN = 60;
export const EOSIN_PLACES = ['BRIGHT', 'DARK'] as const;
export type EosinPlace = (typeof EOSIN_PLACES)[number];
export const EOSIN_PLACE_LABEL: Record<EosinPlace, string> = { BRIGHT: 'A well-lit, airy place (by the window)', DARK: 'A still, dark cupboard' };
export const EOSIN_TISSUES = ['XYLEM', 'PHLOEM', 'PITH', 'CORTEX', 'EPIDERMIS'] as const;
export type EosinTissue = (typeof EOSIN_TISSUES)[number];
export const EOSIN_TISSUE_LABEL: Record<EosinTissue, string> = { XYLEM: 'Xylem', PHLOEM: 'Phloem', PITH: 'Pith', CORTEX: 'Cortex', EPIDERMIS: 'Epidermis' };
export const EOSIN_ARRANGE = ['RING', 'SCATTERED'] as const;
export type EosinArrange = (typeof EOSIN_ARRANGE)[number];
export const EOSIN_ARRANGE_LABEL: Record<EosinArrange, string> = { RING: 'In a ring (a dicot stem)', SCATTERED: 'Scattered all over (a monocot stem)' };
export const EOSIN_SEEN = ['XYLEM', 'NONE', 'ALL'] as const;
export type EosinSeen = (typeof EOSIN_SEEN)[number];
export const EOSIN_SEEN_LABEL: Record<EosinSeen, string> = { XYLEM: 'Red in the xylem only', NONE: 'No red stain', ALL: 'Red all over the section' };
export const EOSIN_SHADES = ['XYLEM', 'BUNDLES', 'WHOLE'] as const;
export type EosinShade = (typeof EOSIN_SHADES)[number];
export const EOSIN_SHADE_LABEL: Record<EosinShade, string> = { XYLEM: 'Shade only the xylem of each bundle', BUNDLES: 'Shade the whole of each vascular bundle', WHOLE: 'Shade the whole section red' };
export const EOSIN_CLAIMS = ['XYLEM_WATER', 'PULL', 'CONTINUOUS', 'PHLOEM', 'WHOLE', 'DOWN'] as const;
export type EosinClaim = (typeof EOSIN_CLAIMS)[number];
export const EOSIN_CLAIM_LABEL: Record<EosinClaim, string> = {
  XYLEM_WATER: 'Water and dissolved mineral salts move up the stem in the xylem',
  PULL: 'Transpiration pull (helped by root pressure and capillarity) draws the water up; it is faster in bright, airy conditions',
  CONTINUOUS: 'The xylem of the stem is continuous with the veins of the leaves',
  PHLOEM: 'The dye travels up in the phloem',
  WHOLE: 'Water moves up through all the tissues of the stem',
  DOWN: 'The dye moves down from the leaves to the roots',
};
export const EOSIN_NEED: EosinClaim[] = ['XYLEM_WATER', 'PULL'];
export const EOSIN_WRONG: EosinClaim[] = ['PHLOEM', 'WHOLE', 'DOWN'];
/** The labels of the drawing of a transverse section of the stem (in target order). */
export const EOSIN_LABELS = ['Epidermis', 'Cortex', 'Phloem', 'Xylem (stained red)', 'Cambium', 'Pith'] as const;
const EOSIN_DISTRACTORS = ['Root hair', 'Stoma'];
/** Label targets in the drawing's 0–200 × 0–200 box (same order as EOSIN_LABELS): a circle centred (100, 100), radius 86, bundles at radius 50–66 (xylem inside, phloem outside). */
export const EOSIN_DRAWING_TARGETS: { x: number; y: number }[] = [
  { x: 17, y: 92 },
  { x: 32, y: 118 },
  { x: 160, y: 80 },
  { x: 150, y: 116 },
  { x: 66, y: 147 },
  { x: 108, y: 96 },
];
/** The drawing's ten bundles (degrees, SVG y down) — targets sit on bundles at 342° (phloem), 18° (xylem) and 126° (cambium). */
export const EOSIN_DRAWING_BUNDLES = [18, 54, 90, 126, 162, 198, 234, 270, 306, 342];

export interface EosinVariant {
  /** Rate of rise of the front in a bright, airy place (cm/min). */
  rate: number;
  /** In a still, dark cupboard the rate is this fraction. */
  dark: number;
  /** Minutes before the dye shows at the base of the stem. */
  lag: number;
  /** Stem height above the dye surface (cm). */
  stemH: number;
  /** Height of the lowest leaves (cm): their veins redden this long after the front passes (min). */
  leafH: number;
  veinDelay: number;
  /** Vascular bundles in the ring. */
  bundles: number;
}
function pickEosin(seed: number): EosinVariant {
  const r = labRandom(seed, 'bio-dissection-eosin');
  return { rate: labBetween(r, 0.12, 0.18, 3), dark: labBetween(r, 0.33, 0.45, 2), lag: labBetween(r, 4, 9, 1), stemH: labBetween(r, 22, 28, 1), leafH: labBetween(r, 7.5, 10.5, 1), veinDelay: labBetween(r, 8, 14, 0), bundles: 8 + Math.floor(r() * 5) };
}
export interface EosinSection {
  kind: 'TS' | 'LS';
  /** Height above the dye surface (cm). */
  at: number;
  thin: boolean;
  /** Cut on a white tile, away from the fingers (else held in the hand). */
  tile: boolean;
}
export interface EosinView {
  n: number;
  tool: 'LENS' | 'MICRO';
}
export interface EosinWork {
  /** How the roots were washed free of soil. */
  wash: 'GENTLE' | 'ROUGH' | null;
  dye: boolean;
  place: EosinPlace | null;
  /** Minutes since the plant went into the dye. */
  clock: number;
  /** Times (min) the height of the front was read with the ruler. */
  reads: number[];
  /** The leaves looked at (clock), the latest look. */
  leafLook: number | null;
  sections: EosinSection[];
  views: EosinView[];
  rows: string[];
  /** What each section showed (one per section). */
  secRows: (EosinSeen | '')[];
  rate: string;
  rateH: string;
  veins: 'RED' | 'GREEN' | '';
  tissue: EosinTissue | '';
  arrange: EosinArrange | '';
  shade: EosinShade | null;
  labels: string[];
  drawing: string[];
  claims: EosinClaim[];
}
/** The stem is cut once a section is taken: no more rising. */
export const eosinCutAt = (w: Pick<EosinWork, 'sections' | 'clock'>) => (w.sections.length ? w.clock : null);
export function eosinRate(v: EosinVariant, w: Pick<EosinWork, 'place' | 'wash'>): number {
  return v.rate * (w.place === 'DARK' ? v.dark : 1) * (w.wash === 'ROUGH' ? 1.3 : 1);
}
/** True height of the red front above the dye surface at time t (cm). */
export function eosinFront(v: EosinVariant, w: Pick<EosinWork, 'place' | 'wash' | 'dye'>, t: number): number {
  if (!w.dye) return 0;
  const lag = w.wash === 'ROUGH' ? 0.5 : v.lag;
  return Math.max(0, Math.min(v.stemH, eosinRate(v, w) * (t - lag)));
}
/** When the veins of the lowest leaves turn red (min). */
export function eosinVeinsAt(v: EosinVariant, w: Pick<EosinWork, 'place' | 'wash'>): number {
  const lag = w.wash === 'ROUGH' ? 0.5 : v.lag;
  return lag + v.leafH / eosinRate(v, w) + v.veinDelay;
}
/** What the ruler showed for reading n (cm, to 0.1 cm; the front is a little fuzzy). */
export function eosinShown(v: EosinVariant, w: Pick<EosinWork, 'place' | 'wash' | 'dye' | 'reads'>, n: number, seed: number): number {
  const r = labRandom(seed, `bio-dissection-eosin-read-${n}`);
  const h = eosinFront(v, w, w.reads[n] ?? 0);
  if (h <= 0) return 0;
  return Math.max(0, roundDp(h + norm(r) * 0.12, 1));
}
/** What a section shows (cut at the clock of the first cut). */
export function eosinSectionSeen(v: EosinVariant, w: Pick<EosinWork, 'place' | 'wash' | 'dye' | 'sections' | 'clock'>, n: number): EosinSeen {
  const s = w.sections[n];
  const at = eosinCutAt(w);
  if (!s || at === null) return 'NONE';
  const h = eosinFront(v, w, at);
  if (s.at > h - 0.2) return 'NONE';
  return w.wash === 'ROUGH' && s.at < h * 0.6 ? 'ALL' : 'XYLEM';
}
export const eosinVeinsRed = (v: EosinVariant, w: Pick<EosinWork, 'place' | 'wash' | 'dye' | 'leafLook'>) => w.dye && w.leafLook !== null && w.leafLook >= eosinVeinsAt(v, w);

// ================================================================== RAT

export const RAT_PARTS = ['BODY', 'SI', 'LI'] as const;
export type RatPart = (typeof RAT_PARTS)[number];
export const RAT_PART_LABEL: Record<RatPart, string> = { BODY: 'Body length (snout to anus)', SI: 'Small intestine', LI: 'Large intestine' };
export const RAT_HOWS = ['THREAD', 'STRETCH'] as const;
export type RatHow = (typeof RAT_HOWS)[number];
export const RAT_HOW_LABEL: Record<RatHow, string> = { THREAD: 'Lay a damp thread along it, then measure the thread', STRETCH: 'Pull it straight along the ruler' };
export const RAT_MAX_MEASURES = 12;
/** The organs to label on the drawing of the dissection (in target order). */
export const RAT_LABELS = ['Oesophagus', 'Liver', 'Stomach', 'Duodenum', 'Pancreas', 'Ileum', 'Caecum', 'Colon', 'Rectum'] as const;
const RAT_DISTRACTORS = ['Gall bladder', 'Appendix'];
/** Label targets in the drawing's 0–200 × 0–240 box (same order as RAT_LABELS). The rat lies head up. */
export const RAT_DRAWING_TARGETS: { x: number; y: number }[] = [
  { x: 102, y: 26 },
  { x: 72, y: 66 },
  { x: 128, y: 74 },
  { x: 92, y: 96 },
  { x: 74, y: 108 },
  { x: 120, y: 140 },
  { x: 66, y: 160 },
  { x: 140, y: 182 },
  { x: 102, y: 214 },
];
export const RAT_STYLES = ['DISPLAYED', 'TEXTBOOK'] as const;
export type RatStyle = (typeof RAT_STYLES)[number];
export const RAT_STYLE_LABEL: Record<RatStyle, string> = { DISPLAYED: 'The dissection as I displayed it, organs in their places and proportions', TEXTBOOK: 'The neat textbook diagram of the gut' };
export const RAT_CLAIMS = ['CAECUM', 'PANCREAS', 'LIVER', 'OMNIVORE', 'GALL', 'SHORT_GUT', 'STOMACH_RIGHT'] as const;
export type RatClaim = (typeof RAT_CLAIMS)[number];
export const RAT_CLAIM_LABEL: Record<RatClaim, string> = {
  CAECUM: 'A large caecum lies at the junction of the small and large intestines',
  PANCREAS: 'The pancreas is a diffuse pinkish tissue in the loop of the duodenum',
  LIVER: 'The liver is dark red and lobed, just below the diaphragm',
  OMNIVORE: 'The long gut and large caecum suit an omnivore that digests some plant food',
  GALL: 'Bile is stored in the gall bladder beside the liver',
  SHORT_GUT: 'The gut is shorter than the body',
  STOMACH_RIGHT: 'The stomach lies on the right, below the diaphragm',
};
export const RAT_NEED: RatClaim[] = ['CAECUM', 'PANCREAS', 'LIVER', 'OMNIVORE'];
export const RAT_WRONG: RatClaim[] = ['GALL', 'SHORT_GUT', 'STOMACH_RIGHT'];

export interface RatVariant {
  /** True lengths (cm). */
  body: number;
  si: number;
  li: number;
  /** A pulled gut stretches by this fraction. */
  stretch: number;
  /** Lobes of the liver visible from the front. */
  lobes: number;
}
function pickRat(seed: number): RatVariant {
  const r = labRandom(seed, 'bio-dissection-rat');
  return { body: labBetween(r, 18, 23, 1), si: labBetween(r, 84, 110, 1), li: labBetween(r, 17, 24, 1), stretch: labBetween(r, 0.06, 0.11, 3), lobes: 4 + Math.floor(r() * 2) };
}
export interface RatMeasure {
  what: RatPart;
  how: RatHow;
}
export interface RatWork {
  gloves: boolean;
  pinned: 'VENTRAL' | 'DORSAL' | null;
  /** The skin: lifted with forceps and cut along the midline, or cut straight in. */
  skin: 'LIFTED' | 'DEEP' | null;
  skinPinned: boolean;
  wall: 'LIFTED' | 'DEEP' | null;
  /** The ribs cut either side of the sternum (the thorax opened). */
  ribs: boolean;
  /** Kept moist with water after opening. */
  moist: boolean;
  /** The gut displaced to one side: with a seeker, or pulled with forceps. */
  display: 'SEEKER' | 'FORCEPS' | null;
  unravelled: boolean;
  measures: RatMeasure[];
  /** Tools and board disinfected, specimen wrapped for disposal. */
  cleaned: boolean;
  body: string;
  si: string;
  li: string;
  ratio: string;
  gall: 'ABSENT' | 'PRESENT' | '';
  style: RatStyle | null;
  labels: string[];
  drawing: string[];
  claims: RatClaim[];
}
/** Organs damaged during the display (a cut too deep, the mesentery torn). */
export const ratTorn = (w: Pick<RatWork, 'wall' | 'display'>) => w.wall === 'DEEP' || w.display === 'FORCEPS';
/** What the ruler showed for measure n (cm, to 0.5 cm). */
export function ratShown(v: RatVariant, w: Pick<RatWork, 'measures'>, n: number, seed: number): number {
  const m = w.measures[n];
  if (!m) return 0;
  const r = labRandom(seed, `bio-dissection-rat-m-${n}`);
  const truth = m.what === 'BODY' ? v.body : m.what === 'SI' ? v.si : v.li;
  const x = m.what === 'BODY' ? truth + norm(r) * 0.15 : truth * (m.how === 'STRETCH' ? 1 + v.stretch : 1) + norm(r) * 0.35;
  return Math.round(x * 2) / 2;
}
/** The last reading of each part (null: not measured). */
export function ratLast(v: RatVariant, w: Pick<RatWork, 'measures'>, seed: number): Record<RatPart, number | null> {
  const out: Record<RatPart, number | null> = { BODY: null, SI: null, LI: null };
  w.measures.forEach((m, n) => (out[m.what] = ratShown(v, w, n, seed)));
  return out;
}

// ================================================================== MICROBE

export const PLATES = ['CONTROL', 'AIR', 'UNWASHED', 'WASHED'] as const;
export type PlateRole = (typeof PLATES)[number];
export const PLATE_LABEL: Record<PlateRole, string> = { CONTROL: 'Control', AIR: 'Air', UNWASHED: 'Unwashed finger', WASHED: 'Washed finger' };
export const MICRO_DAYS_MAX = 7;
/** Air plate: the lesson's 20 minutes. */
export const AIR_MIN = 20;
export const INC_TEMPS = [25, 30, 37] as const;
export type IncTemp = (typeof INC_TEMPS)[number];
export const SLICES = ['A', 'B', 'C'] as const;
export const COLONY_KINDS = ['BACTERIA', 'FUNGI', 'BOTH', 'NONE'] as const;
export type ColonyKind = (typeof COLONY_KINDS)[number];
export const COLONY_KIND_LABEL: Record<ColonyKind, string> = { BACTERIA: 'Shiny, creamy round colonies (bacteria)', FUNGI: 'Fluffy colonies (fungi)', BOTH: 'Both bacteria and fungi', NONE: 'No colonies' };
export const MOULD_GROWTH = ['NONE', 'LITTLE', 'MUCH'] as const;
export type MouldGrowth = (typeof MOULD_GROWTH)[number];
export const MOULD_GROWTH_LABEL: Record<MouldGrowth, string> = { NONE: 'No mould', LITTLE: 'A little mould', MUCH: 'Covered in mould' };
export const MICRO_CLAIMS = ['CONTROL', 'HYGIENE', 'AIR', 'CONDITIONS', 'FUNGUS', 'BACTERIUM', 'OPEN', 'HOT'] as const;
export type MicroClaim = (typeof MICRO_CLAIMS)[number];
export const MICRO_CLAIM_LABEL: Record<MicroClaim, string> = {
  CONTROL: 'The control plate grew nothing: the agar was sterile and the technique aseptic',
  HYGIENE: 'Washing the hands with soap removes most of the microorganisms on them',
  AIR: 'The air carries bacteria and fungal spores',
  CONDITIONS: 'Bread mould grows best where it is moist and warm',
  FUNGUS: 'Rhizopus is a fungus: white hyphae with black sporangia full of spores',
  BACTERIUM: 'Rhizopus is a bacterium',
  OPEN: 'Open the plates after incubation to look at the colonies closely',
  HOT: 'Incubate at 37 °C so the microorganisms grow fastest',
};
export const MICRO_NEED: MicroClaim[] = ['CONTROL', 'HYGIENE', 'AIR', 'CONDITIONS', 'FUNGUS'];
export const MICRO_WRONG: MicroClaim[] = ['BACTERIUM', 'OPEN', 'HOT'];
/** The labels of the drawing of Rhizopus (teacher’s slide; in target order). */
export const MOULD_LABELS = ['Sporangium', 'Spores', 'Sporangiophore', 'Hypha', 'Stolon', 'Rhizoids'] as const;
const MOULD_DISTRACTORS = ['Flagellum', 'Chloroplast'];
/** Label targets in the drawing's 0–200 × 0–160 box. */
export const MOULD_DRAWING_TARGETS: { x: number; y: number }[] = [
  { x: 58, y: 30 },
  { x: 146, y: 24 },
  { x: 62, y: 78 },
  { x: 160, y: 96 },
  { x: 108, y: 126 },
  { x: 40, y: 146 },
];

export interface MicroVariant {
  /** Colonies landing per minute the air plate is open. */
  airRate: number;
  /** Colonies from an unwashed fingertip, and the fraction left after washing with soap. */
  finger: number;
  washed: number;
  /** Fraction of air colonies that are fungi. */
  fungi: number;
  /** Bread mould: final cover (%) and days to half of it on moist bread in the warm. */
  mouldK: number;
  mouldT: number;
}
function pickMicro(seed: number): MicroVariant {
  const r = labRandom(seed, 'bio-dissection-micro');
  return { airRate: labBetween(r, 0.8, 1.6, 2), finger: labBetween(r, 45, 80, 0), washed: labBetween(r, 0.12, 0.28, 2), fungi: labBetween(r, 0.12, 0.22, 2), mouldK: labBetween(r, 80, 98, 0), mouldT: labBetween(r, 2.4, 3.2, 2) };
}
export interface Plate {
  label: 'BASE' | 'LID' | null;
  /** Minutes the lid was off (the air plate). */
  airMin: number;
  /** Touched with a finger: washed with soap first or not; the lid lifted slightly or wide. */
  touch: 'UNWASHED' | 'WASHED' | null;
  lid: 'SLIGHT' | 'WIDE' | null;
  tape: 'STRIPS' | 'SEALED' | null;
}
export interface BreadSlice {
  moist: boolean | null;
  place: 'WARM' | 'COLD' | null;
}
export interface MicroWork {
  /** The bench wiped with disinfectant before starting. */
  wiped: boolean;
  plates: Plate[];
  /** Hands washed with soap (since the last unwashed touch). */
  soaped: boolean;
  inverted: boolean;
  temp: IncTemp | null;
  /** Clock (days); plates went into the incubator, bread into its bag, on these days. */
  day: number;
  incAt: number | null;
  breadExposed: boolean;
  slices: BreadSlice[];
  bagged: boolean;
  breadAt: number | null;
  /** Day the colonies were counted (through the closed lids). */
  countAt: number | null;
  /** Day the bread was examined with the hand lens. */
  lensAt: number | null;
  slide: boolean;
  /** A plate opened after incubation (never!). */
  openedAfter: boolean;
  dispose: 'DISINFECT' | 'BIN' | null;
  counts: string[];
  kinds: (ColonyKind | '')[];
  bread: (MouldGrowth | '')[];
  reduction: string;
  labels: string[];
  drawing: string[];
  claims: MicroClaim[];
}
/** How many colonies land on each plate, and how many of them are fungi. */
export function plateColonies(v: MicroVariant, w: Pick<MicroWork, 'plates'>, k: number): { n: number; fungi: number } {
  const p = w.plates[k];
  if (!p) return { n: 0, fungi: 0 };
  const wide = p.lid === 'WIDE' ? 4 : 0;
  const air = Math.round(v.airRate * p.airMin + (p.airMin > 0 ? 0 : wide * v.airRate));
  const finger = p.touch === 'UNWASHED' ? Math.round(v.finger * (1 + (k - 2) * 0.04)) : p.touch === 'WASHED' ? Math.round(v.finger * v.washed) : 0;
  const n = air + finger;
  return { n, fungi: Math.round(air * v.fungi) };
}
export interface ColonyDot {
  x: number;
  y: number;
  r: number;
  fungus: boolean;
  /** Days of incubation before it can be seen. */
  t: number;
}
/** Where each colony grows on plate k (unit disc, |x,y| < 0.85) and when it shows. */
export function plateDots(v: MicroVariant, w: Pick<MicroWork, 'plates' | 'temp'>, k: number, seed: number): ColonyDot[] {
  const { n, fungi } = plateColonies(v, w, k);
  const r = labRandom(seed, `bio-dissection-plate-${k}`);
  const slow = w.temp === 25 ? 1.15 : w.temp === 37 ? 0.85 : w.temp === null ? 1.5 : 1;
  const dots: ColonyDot[] = [];
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    for (let g = 0; g < 30; g++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 0.82;
      x = d * Math.cos(a);
      y = d * Math.sin(a);
      if (dots.every((o) => Math.hypot(o.x - x, o.y - y) > 0.085)) break;
    }
    const fungus = i < fungi;
    dots.push({ x: roundDp(x, 3), y: roundDp(y, 3), r: fungus ? 0.05 + r() * 0.03 : 0.022 + r() * 0.02, fungus, t: roundDp((0.8 + r() * 1.3) * slow, 2) });
  }
  return dots;
}
/** Colonies visible on plate k after `days` of incubation. */
export const plateVisible = (v: MicroVariant, w: Pick<MicroWork, 'plates' | 'temp'>, k: number, days: number, seed: number) => plateDots(v, w, k, seed).filter((d) => d.t <= days + 1e-9);
/** What kind of colonies plate k shows after `days`. */
export function plateKind(v: MicroVariant, w: Pick<MicroWork, 'plates' | 'temp'>, k: number, days: number, seed: number): ColonyKind {
  const vis = plateVisible(v, w, k, days, seed);
  const f = vis.some((d) => d.fungus);
  const b = vis.some((d) => !d.fungus);
  return f && b ? 'BOTH' : f ? 'FUNGI' : b ? 'BACTERIA' : 'NONE';
}
/** Mould cover of slice s (%) on clock day d. */
export function mouldCover(v: MicroVariant, w: Pick<MicroWork, 'breadAt' | 'bagged' | 'breadExposed' | 'slices'>, s: number, d: number): number {
  const sl = w.slices[s];
  if (!sl || w.breadAt === null || sl.moist === null || sl.place === null) return 0;
  let t = d - w.breadAt - (w.breadExposed ? 0 : 1);
  if (t <= 0) return 0;
  // Unbagged bread dries out: growth almost stops after the first day.
  if (!w.bagged) t = Math.min(t, 1) + Math.max(0, t - 1) * 0.15;
  const speed = (sl.moist ? 1 : 0.05) * (sl.place === 'COLD' ? 0.18 : 1);
  const te = t * speed;
  const f = (x: number) => v.mouldK / (1 + Math.exp(-2.2 * (x - v.mouldT)));
  return Math.max(0, roundDp(f(te) - f(0), 1));
}
export const mouldGrowthOf = (cover: number): MouldGrowth => (cover < 3 ? 'NONE' : cover < 30 ? 'LITTLE' : 'MUCH');
export const microIncDays = (w: Pick<MicroWork, 'incAt' | 'countAt'>) => (w.incAt === null || w.countAt === null ? null : w.countAt - w.incAt);

// ================================================================== variant, state, spec

export interface BioDissectionVariant {
  seed: number;
  task: DissectTask;
  eosin: EosinVariant;
  rat: RatVariant;
  micro: MicroVariant;
  drawing: BioDrawingStatement[];
  /** Label chips for each drawing (labels and distractors, seeded order). */
  eosinOptions: string[];
  ratOptions: string[];
  mouldOptions: string[];
}
/** The hidden truth of one attempt (same on the web and the API). */
export function bioDissectionVariant(seed: number, task: DissectTask): BioDissectionVariant {
  const r = labRandom(seed, 'bio-dissection-labels');
  return {
    seed,
    task,
    eosin: pickEosin(seed),
    rat: pickRat(seed),
    micro: pickMicro(seed),
    drawing: bioDrawingPick(seed, 'bio-dissection'),
    eosinOptions: shuffle(r, [...EOSIN_LABELS, ...EOSIN_DISTRACTORS]),
    ratOptions: shuffle(r, [...RAT_LABELS, ...RAT_DISTRACTORS]),
    mouldOptions: shuffle(r, [...MOULD_LABELS, ...MOULD_DISTRACTORS]),
  };
}

export interface BioDissectionState {
  v: 1;
  task: DissectTask | null;
  eosin: EosinWork;
  rat: RatWork;
  micro: MicroWork;
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}
export const emptyPlate = (): Plate => ({ label: null, airMin: 0, touch: null, lid: null, tape: null });
export function emptyBioDissectionState(): BioDissectionState {
  return {
    v: 1,
    task: null,
    eosin: { wash: null, dye: false, place: null, clock: 0, reads: [], leafLook: null, sections: [], views: [], rows: [], secRows: [], rate: '', rateH: '', veins: '', tissue: '', arrange: '', shade: null, labels: [], drawing: [], claims: [] },
    rat: { gloves: false, pinned: null, skin: null, skinPinned: false, wall: null, ribs: false, moist: false, display: null, unravelled: false, measures: [], cleaned: false, body: '', si: '', li: '', ratio: '', gall: '', style: null, labels: [], drawing: [], claims: [] },
    micro: {
      wiped: false,
      plates: PLATES.map(() => emptyPlate()),
      soaped: false,
      inverted: false,
      temp: null,
      day: 0,
      incAt: null,
      breadExposed: false,
      slices: SLICES.map(() => ({ moist: null, place: null })),
      bagged: false,
      breadAt: null,
      countAt: null,
      lensAt: null,
      slide: false,
      openedAfter: false,
      dispose: null,
      counts: PLATES.map(() => ''),
      kinds: PLATES.map(() => ''),
      bread: SLICES.map(() => ''),
      reduction: '',
      labels: [],
      drawing: [],
      claims: [],
    },
    written: { precautions: '', explain: '' },
    log: [],
  };
}

const short = z.string().max(40);
const labelList = (n: number) => z.array(z.string().max(40)).max(n);
const drawingList = z.array(z.string().max(20)).max(20);
export const bioDissectionStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(DISSECT_TASKS).nullable(),
  eosin: z.object({
    wash: z.enum(['GENTLE', 'ROUGH']).nullable(),
    dye: z.boolean(),
    place: z.enum(EOSIN_PLACES).nullable(),
    clock: z.number().min(0).max(EOSIN_CLOCK_MAX),
    reads: z.array(z.number().min(0).max(EOSIN_CLOCK_MAX)).max(EOSIN_MAX_READS),
    leafLook: z.number().min(0).max(EOSIN_CLOCK_MAX).nullable(),
    sections: z.array(z.object({ kind: z.enum(['TS', 'LS']), at: z.number().min(0).max(40), thin: z.boolean(), tile: z.boolean() })).max(EOSIN_MAX_SECTIONS),
    views: z.array(z.object({ n: z.number().int().min(0).max(EOSIN_MAX_SECTIONS - 1), tool: z.enum(['LENS', 'MICRO']) })).max(EOSIN_MAX_SECTIONS * 2),
    rows: z.array(short).max(EOSIN_MAX_READS),
    secRows: z.array(z.union([z.enum(EOSIN_SEEN), z.literal('')])).max(EOSIN_MAX_SECTIONS),
    rate: short,
    rateH: short,
    veins: z.enum(['RED', 'GREEN', '']),
    tissue: z.union([z.enum(EOSIN_TISSUES), z.literal('')]),
    arrange: z.union([z.enum(EOSIN_ARRANGE), z.literal('')]),
    shade: z.enum(EOSIN_SHADES).nullable(),
    labels: labelList(EOSIN_LABELS.length),
    drawing: drawingList,
    claims: z.array(z.enum(EOSIN_CLAIMS)).max(EOSIN_CLAIMS.length),
  }),
  rat: z.object({
    gloves: z.boolean(),
    pinned: z.enum(['VENTRAL', 'DORSAL']).nullable(),
    skin: z.enum(['LIFTED', 'DEEP']).nullable(),
    skinPinned: z.boolean(),
    wall: z.enum(['LIFTED', 'DEEP']).nullable(),
    ribs: z.boolean(),
    moist: z.boolean(),
    display: z.enum(['SEEKER', 'FORCEPS']).nullable(),
    unravelled: z.boolean(),
    measures: z.array(z.object({ what: z.enum(RAT_PARTS), how: z.enum(RAT_HOWS) })).max(RAT_MAX_MEASURES),
    cleaned: z.boolean(),
    body: short,
    si: short,
    li: short,
    ratio: short,
    gall: z.enum(['ABSENT', 'PRESENT', '']),
    style: z.enum(RAT_STYLES).nullable(),
    labels: labelList(RAT_LABELS.length),
    drawing: drawingList,
    claims: z.array(z.enum(RAT_CLAIMS)).max(RAT_CLAIMS.length),
  }),
  micro: z.object({
    wiped: z.boolean(),
    plates: z.array(z.object({ label: z.enum(['BASE', 'LID']).nullable(), airMin: z.number().int().min(0).max(120), touch: z.enum(['UNWASHED', 'WASHED']).nullable(), lid: z.enum(['SLIGHT', 'WIDE']).nullable(), tape: z.enum(['STRIPS', 'SEALED']).nullable() })).length(PLATES.length),
    soaped: z.boolean(),
    inverted: z.boolean(),
    temp: z.union([z.literal(25), z.literal(30), z.literal(37)]).nullable(),
    day: z.number().min(0).max(MICRO_DAYS_MAX),
    incAt: z.number().min(0).max(MICRO_DAYS_MAX).nullable(),
    breadExposed: z.boolean(),
    slices: z.array(z.object({ moist: z.boolean().nullable(), place: z.enum(['WARM', 'COLD']).nullable() })).length(SLICES.length),
    bagged: z.boolean(),
    breadAt: z.number().min(0).max(MICRO_DAYS_MAX).nullable(),
    countAt: z.number().min(0).max(MICRO_DAYS_MAX).nullable(),
    lensAt: z.number().min(0).max(MICRO_DAYS_MAX).nullable(),
    slide: z.boolean(),
    openedAfter: z.boolean(),
    dispose: z.enum(['DISINFECT', 'BIN']).nullable(),
    counts: z.array(short).length(PLATES.length),
    kinds: z.array(z.union([z.enum(COLONY_KINDS), z.literal('')])).length(PLATES.length),
    bread: z.array(z.union([z.enum(MOULD_GROWTH), z.literal('')])).length(SLICES.length),
    reduction: short,
    labels: labelList(MOULD_LABELS.length),
    drawing: drawingList,
    claims: z.array(z.enum(MICRO_CLAIMS)).max(MICRO_CLAIMS.length),
  }),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<BioDissectionState>;

export const BIO_DISSECTION: SimulatorSpec = {
  id: 'bio-dissection',
  subject: 'Biology',
  title: 'Water transport, dissection and microorganisms',
  topicNames: ['Uptake and movement of water and mineral salts in plants', 'Alimentary system', 'Microorganisms in action', 'Transport in plants', 'Digestive system', 'Microorganisms'],
  minutes: 45,
  rubric: [
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide:
        'Dye: the roots washed gently and stood in eosin (1); a well-lit, airy place and at least four heights read over an hour or more (1); thin transverse sections cut on a tile at two or more heights (1); a section examined with the hand lens or microscope, and a longitudinal section (1). Rat: gloves on, pinned ventral side up by the four limbs (1); the skin lifted with forceps and cut along the midline, then pinned back (1); the body wall cut the same way without damaging the organs, the specimen kept moist (1); the gut displaced and unravelled with a seeker, the tools and board disinfected (1). Microorganisms: the plates labelled on the base, the control never opened (1); the air plate open 20 minutes, fingers touched with the lid lifted slightly, before and after washing with soap (1); two short strips of tape, inverted, 25–30 °C (1); the bread moist, exposed, bagged and warm beside a comparison slice, the plates counted after 2–3 days unopened and soaked in disinfectant (1).',
    },
    { id: 'readings', label: 'Readings', marks: 4, how: 'AUTO', guide: 'Dye: each height as the ruler showed it, to 0.1 cm (3), and what each section showed (1). Rat: the body length (1) and the small (1.5) and large intestine (1.5) as measured, to 0.5 cm. Microorganisms: the colonies on each plate as counted through the lid (3), the kind of colonies (0.5) and the mould on each slice after 3 days or more (0.5).' },
    { id: 'presentation', label: 'Calculation and drawing', marks: 3, how: 'AUTO', guide: 'Dye: the rate of rise from your own first and last readings in cm/min and cm/h (1); the section drawing labelled (1), only the xylem shaded (0.5) and the drawing rules (0.5). Rat: the drawing labelled (2) as displayed (0.5) and the drawing rules (0.5). Microorganisms: % reduction = (unwashed − washed) ÷ unwashed × 100 from your own counts (1); the drawing of Rhizopus labelled (1.5) and the drawing rules (0.5).' },
    { id: 'results', label: 'Results and conclusions', marks: 5, how: 'AUTO', guide: 'Dye: the stained tissue (1), the arrangement of the bundles (1), the leaf veins as seen (1) and the conclusions (2). Rat: the gut : body ratio from your own lengths (1), the gall bladder (1) and the conclusions about the caecum, pancreas, liver and diet (3). Microorganisms: the control, hygiene, air, conditions for mould and Rhizopus as a fungus (5). Each wrong statement loses half a mark.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each). Dye: wash the roots gently; a translucent-stemmed plant; thin sections; cut away from the fingers on a tile; read the height at eye level from the same point. Rat: do not cut too deeply (lift the skin with forceps); keep the specimen moist; do not remove organs; use a seeker not forceps to unravel the gut; wear gloves and disinfect tools. Microorganisms: aseptic technique (lids opened slightly and briefly, flamed loop); label the base not the lid; incubate upside down; tape with two short strips; never open plates after incubation; incubate at no more than 30 °C.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'Dye: the xylem vessels form continuous tubes from the root through the stem to the leaf veins; water evaporating from the leaves (transpiration) pulls the water column up, helped by root pressure and capillarity, so the dye rises in the xylem only. Rat: the long small intestine gives a large surface for digestion and absorption; the large caecum holds bacteria that help digest cellulose in plant food; the rat is an omnivore. Microorganisms: microorganisms are everywhere — in the air and on the skin; soap removes most of them; the agar provides food, the incubator warmth; mould needs moisture and warmth, which is why food is kept dry or cold.' },
  ],
};

// ================================================================== model answers (the worked solution, the demo and the tests)

const fx = (x: number, dp: number) => String(roundDp(x, dp));
const good = (v: BioDissectionVariant) => v.drawing.filter((d) => d.good).map((d) => d.id);

/** Ideal dye records: the heights as read, each section as seen, the rates, the observations and the drawing. */
export function eosinIdealRecords(v: BioDissectionVariant, s: BioDissectionState): EosinWork {
  const w = s.eosin;
  const rows = w.reads.map((_, n) => eosinShown(v.eosin, w, n, v.seed).toFixed(1));
  const secRows = w.sections.map((_, n) => eosinSectionSeen(v.eosin, w, n));
  const n = rows.length;
  const rate = n >= 2 && w.reads[n - 1]! > w.reads[0]! ? (Number(rows[n - 1]) - Number(rows[0])) / (w.reads[n - 1]! - w.reads[0]!) : null;
  return {
    ...w,
    rows,
    secRows,
    rate: rate === null ? '' : fx(rate, 3),
    rateH: rate === null ? '' : fx(rate * 60, 1),
    veins: w.leafLook === null ? '' : eosinVeinsRed(v.eosin, w) ? 'RED' : 'GREEN',
    tissue: 'XYLEM',
    arrange: 'RING',
    shade: 'XYLEM',
    labels: [...EOSIN_LABELS],
    drawing: good(v),
    claims: [...EOSIN_NEED, 'CONTINUOUS'],
  };
}
/** A model dye run: gentle wash, bright place, read every 20 minutes to 100 minutes, the leaves looked at, three sections examined. */
export function eosinModelState(v: BioDissectionVariant, reads = [20, 40, 60, 80, 100]): BioDissectionState {
  const s = emptyBioDissectionState();
  s.task = 'EOSIN';
  const w = s.eosin;
  Object.assign(w, { wash: 'GENTLE', dye: true, place: 'BRIGHT' });
  w.reads = [...reads];
  w.clock = reads[reads.length - 1]!;
  w.leafLook = w.clock;
  const front = eosinFront(v.eosin, w, w.clock);
  w.sections = [
    { kind: 'TS', at: roundDp(Math.max(1, front * 0.3), 1), thin: true, tile: true },
    { kind: 'TS', at: roundDp(Math.min(v.eosin.stemH - 1, front + 4), 1), thin: true, tile: true },
    { kind: 'LS', at: roundDp(Math.max(1, front * 0.3), 1), thin: true, tile: true },
  ];
  w.views = [
    { n: 0, tool: 'MICRO' },
    { n: 1, tool: 'LENS' },
    { n: 2, tool: 'MICRO' },
  ];
  s.eosin = eosinIdealRecords(v, s);
  return s;
}

/** Ideal rat records: the lengths as measured, the ratio, the labels and the conclusions. */
export function ratIdealRecords(v: BioDissectionVariant, s: BioDissectionState): RatWork {
  const w = s.rat;
  const last = ratLast(v.rat, w, v.seed);
  const str = (x: number | null) => (x === null ? '' : x.toFixed(1));
  const ratio = last.BODY && last.SI !== null && last.LI !== null ? fx((last.SI + last.LI) / last.BODY, 2) : '';
  return { ...w, body: str(last.BODY), si: str(last.SI), li: str(last.LI), ratio, gall: 'ABSENT', style: 'DISPLAYED', labels: [...RAT_LABELS], drawing: good(v), claims: [...RAT_NEED] };
}
export function ratModelState(v: BioDissectionVariant): BioDissectionState {
  const s = emptyBioDissectionState();
  s.task = 'RAT';
  Object.assign(s.rat, { gloves: true, pinned: 'VENTRAL', skin: 'LIFTED', skinPinned: true, wall: 'LIFTED', moist: true, display: 'SEEKER', unravelled: true, cleaned: true });
  s.rat.measures = [
    { what: 'BODY', how: 'THREAD' },
    { what: 'SI', how: 'THREAD' },
    { what: 'LI', how: 'THREAD' },
  ];
  s.rat = ratIdealRecords(v, s);
  return s;
}

/** Ideal microorganism records: the counts as seen, the kinds, the bread, the reduction, labels and claims. */
export function microIdealRecords(v: BioDissectionVariant, s: BioDissectionState): MicroWork {
  const w = s.micro;
  const days = microIncDays(w);
  const counts = PLATES.map((_, k) => (days === null ? '' : String(plateVisible(v.micro, w, k, days, v.seed).length)));
  const kinds = PLATES.map((_, k) => (days === null ? '' : plateKind(v.micro, w, k, days, v.seed)));
  const bread = SLICES.map((_, k) => (w.lensAt === null ? '' : mouldGrowthOf(mouldCover(v.micro, w, k, w.lensAt))));
  const u = Number(counts[2]);
  const red = days !== null && u > 0 ? fx(((u - Number(counts[3])) / u) * 100, 1) : '';
  return { ...w, counts, kinds, bread, reduction: red, labels: [...MOULD_LABELS], drawing: good(v), claims: [...MICRO_NEED] };
}
/** A model run: bench wiped, four plates labelled on the base, air 20 min, fingers before and after soap, taped, inverted, 30 °C; bread A moist warm, B dry warm, C moist cold; counted and examined after 3 days. */
export function microModelState(v: BioDissectionVariant, days = 3): BioDissectionState {
  const s = emptyBioDissectionState();
  s.task = 'MICROBE';
  const w = s.micro;
  w.wiped = true;
  w.plates = [
    { label: 'BASE', airMin: 0, touch: null, lid: null, tape: 'STRIPS' },
    { label: 'BASE', airMin: AIR_MIN, touch: null, lid: null, tape: 'STRIPS' },
    { label: 'BASE', airMin: 0, touch: 'UNWASHED', lid: 'SLIGHT', tape: 'STRIPS' },
    { label: 'BASE', airMin: 0, touch: 'WASHED', lid: 'SLIGHT', tape: 'STRIPS' },
  ];
  Object.assign(w, { soaped: true, inverted: true, temp: 30, incAt: 0, breadExposed: true, bagged: true, breadAt: 0, day: days, countAt: days, lensAt: days, slide: true, dispose: 'DISINFECT' });
  w.slices = [
    { moist: true, place: 'WARM' },
    { moist: false, place: 'WARM' },
    { moist: true, place: 'COLD' },
  ];
  s.micro = microIdealRecords(v, s);
  return s;
}
