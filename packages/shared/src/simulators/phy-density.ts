import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom } from './seeded';

/**
 * phy-density: measurement, density and flotation. Four tasks, each one WAEC
 * practical (picked from the lesson):
 *  - CAL (vernier calipers and micrometer screw gauge): close the jaws to find
 *    each instrument's zero error (with its sign), measure a wooden cylinder's
 *    diameter with the vernier (main scale in mm, ten vernier divisions over
 *    9 mm: 0.01 cm) at three places, and a ball bearing with the micrometer
 *    (sleeve in 0.5 mm, 50 thimble divisions: 0.01 mm) in three orientations,
 *    closing it with the ratchet. Mean − zero error; V = (4/3)πr³.
 *  - ARCH (Archimedes' principle): a stone on a thread from a spring balance
 *    (0–10 N, 0.1 N divisions; its zero checked first) weighed in air (W₁),
 *    fully immersed in a eureka can of water filled to the spout (W₂; the
 *    displaced water caught in a weighed beaker) and in salt solution (W₃).
 *    Upthrust W₁ − W₂ = weight of water displaced; RD = W₁/(W₁ − W₂); RD of the
 *    liquid = (W₁ − W₃)/(W₁ − W₂).
 *  - FLOAT (law of flotation): a flat-bottomed tube with a paper scale, loaded
 *    with 10 g scoops of lead shot, floats upright in a tall cylinder of water;
 *    the depth h is read at the flat water surface. ρAh = M + m, so h against m
 *    is a straight line of slope 1/(ρA) and intercept M/(ρA).
 *  - BOTTLE (density bottle): m₁ empty and dry, m₂ full of water, m₃ full of the
 *    liquid (kerosene or palm oil), each stoppered so the excess leaves through
 *    the capillary and wiped dry: RD = (m₃ − m₁)/(m₂ − m₁). Or solid grains
 *    (sand): m₂ with sand, m₃ sand topped up with water, m₄ full of water:
 *    RD = (m₂ − m₁)/((m₄ − m₁) − (m₃ − m₂)).
 *
 * Physics: water's density at the seeded room temperature (Tanaka's formula);
 * the stone, liquids, sand, tube, bottle and objects are seeded; a buoyant
 * force ρVg on the immersed volume; bubbles add upthrust; a solid resting on
 * the can is partly held up by it; a tube touching the cylinder's wall is held
 * by friction; water wets glass, so a meniscus climbs the tube; a bottle not
 * filled to the capillary holds less, a wet one carries a film of the last
 * liquid, one not wiped carries drops outside. The triple-beam balance reads
 * to 0.1 g. Units in the state: cm and mm as the instruments read, N, g.
 */

export const DENSITY_TASKS = ['CAL', 'ARCH', 'FLOAT', 'BOTTLE'] as const;
export type DensityTask = (typeof DENSITY_TASKS)[number];
/** g used by the physics (m s⁻²); students may take 9.8 or 10. */
export const DENSITY_G = 9.81;

/** The density of pure water (kg m⁻³) at t °C (Tanaka et al. 2001). */
export function densityWaterAt(t: number): number {
  return 999.97495 * (1 - ((t - 3.983035) ** 2 * (t + 301.797)) / (522528.9 * (t + 69.34881)));
}

// ------------------------------------------------------------------ CAL: vernier and micrometer

/** Objects to measure: wooden cylinder, glass marble (cm, vernier); ball bearing, copper wire (mm, micrometer); the flotation tube (cm). */
export const CAL_OBJECTS = ['cyl', 'marble', 'ball', 'wire', 'tube'] as const;
export type CalObj = (typeof CAL_OBJECTS)[number];
export const CAL_OBJECT_NAME: Record<CalObj, string> = { cyl: 'wooden cylinder', marble: 'glass marble', ball: 'ball bearing', wire: 'copper wire', tube: 'flotation test tube' };
/** Places / orientations an object can be turned through. */
export const CAL_PLACES = 6;
/** The micrometer opens to 25 mm. */
export const MICROMETER_MAX = 25;
/** The vernier reads to 0.01 cm, the micrometer to 0.01 mm; a micrometer forced with the thimble (not the ratchet) reads this much low (mm). */
export const FORCED_MM = 0.02;
export type CalTool = 'V' | 'M';

// ------------------------------------------------------------------ ARCH

export type DensityMedium = 'air' | 'water' | 'salt';
/** How the stone hangs: half in, fully immersed and hanging free, or resting on / touching the can. */
export type DensityDepth = 'part' | 'full' | 'touch';
export const DENSITY_SB_MAX = 10;

// ------------------------------------------------------------------ FLOAT

/** The flotation tube's length (cm) and the scoops of lead shot (10 g nominal each) there are. */
export const FLOAT_TUBE_LEN = 20;
export const SHOT_STEP = 10;
export const SHOT_SCOOPS = 10;
/** Loads on the task card (scoops). */
export const FLOAT_CARD = [1, 2, 3, 4, 5];

// ------------------------------------------------------------------ BOTTLE

export type BottleFill = 'none' | 'water' | 'liquid';
export type BottleSample = 'liquid' | 'grains';
export const SAND_SCOOPS = 4;
/** The sand on the card (scoops of about 10 g). */
export const SAND_CARD = 3;

export interface PhyDensityVariant {
  seed: number;
  /** Room temperature (°C) and the density of water in it (kg m⁻³). */
  tempC: number;
  rhoW: number;
  /** Zero errors: the vernier (cm) and the micrometer (mm), multiples of 0.01, + when it reads above zero closed. */
  zv: number;
  zm: number;
  /** Sizes at each place/orientation: cylinder and marble (cm), ball bearing and wire (mm). */
  cyl: number[];
  marble: number[];
  ball: number[];
  wire: number[];
  /** ARCH: the stone's volume (cm³) and density (kg m⁻³); the salt solution's RD; the spring balance's zero error (N). */
  stoneV: number;
  stoneRho: number;
  saltRD: number;
  sbZero: number;
  /** Upthrust of the air bubbles clinging to a stone just lowered (N); fraction of its apparent weight the can takes when it rests on it. */
  bubbleN: number;
  touchFrac: number;
  /** The catch beaker (g); how far below the spout the can starts (cm³). */
  beakerG: number;
  deficit: number;
  /** FLOAT: the tube's external and internal diameters (cm) and mass (g); the true masses of the lead-shot scoops (g); the meniscus' climb (cm); friction's hold on a touching tube (cm). */
  tubeD: number;
  tubeDi: number;
  tubeM: number;
  shots: number[];
  meniscus: number;
  stick: number;
  /** BOTTLE: the bottle (g) and its volume (cm³); the liquid and its RD; the sand's RD and scoops (g). */
  bottleM: number;
  bottleV: number;
  liquid: 'kerosene' | 'palm oil';
  liquidRD: number;
  sandRD: number;
  sand: number[];
  /** A wet bottle's film (cm³); the capillary's volume when not filled (cm³); drops on the outside (g); a trapped bubble (cm³). */
  film: number;
  capGap: number;
  wetG: number;
  bubbleCm3: number;
}

export function phyDensityVariant(seed: number): PhyDensityVariant {
  const r = labRandom(seed, 'phy-density');
  const tempC = labBetween(r, 24, 33, 1);
  const zero = () => {
    const k = Math.floor(r() * 8) - 4; // −4 … +3
    return (k === 0 ? 2 : k) / 100;
  };
  const zv = zero();
  const zm = zero();
  const around = (base: number, spread: number, dp: number) => Array.from({ length: CAL_PLACES }, () => base + labBetween(r, -spread, spread, dp));
  const cyl = around(labBetween(r, 2.0, 3.0, 3), 0.012, 4);
  const marble = around(labBetween(r, 1.45, 1.75, 3), 0.008, 4);
  const ball = around(labBetween(r, 5.5, 9.5, 3), 0.002, 4);
  const wire = around(labBetween(r, 0.6, 1.2, 3), 0.004, 4);
  const stoneV = labBetween(r, 180, 260, 1);
  const stoneRho = labBetween(r, 2550, 2850, 0);
  const saltRD = labBetween(r, 1.08, 1.18, 3);
  const sbZero = (r() < 0.5 ? -1 : 1) * labBetween(r, 0.06, 0.15, 2);
  const bubbleN = labBetween(r, 0.04, 0.07, 3);
  const touchFrac = labBetween(r, 0.15, 0.35, 2);
  const beakerG = labBetween(r, 48, 62, 1);
  const deficit = labBetween(r, 8, 16, 1);
  const tubeD = labBetween(r, 2.2, 2.6, 3);
  const tubeDi = tubeD - 2 * labBetween(r, 0.09, 0.12, 3);
  const tubeM = labBetween(r, 14, 22, 2);
  const shots = Array.from({ length: SHOT_SCOOPS }, () => labBetween(r, 9.94, 10.06, 3));
  const meniscus = labBetween(r, 0.2, 0.3, 2);
  const stick = labBetween(r, 0.25, 0.5, 2);
  const bottleM = labBetween(r, 24, 30, 2);
  const bottleV = labBetween(r, 49.7, 50.3, 2);
  const liquid = r() < 0.5 ? 'kerosene' : 'palm oil';
  const liquidRD = liquid === 'kerosene' ? labBetween(r, 0.78, 0.82, 3) : labBetween(r, 0.89, 0.92, 3);
  const sandRD = labBetween(r, 2.55, 2.7, 3);
  const sand = Array.from({ length: SAND_SCOOPS }, () => labBetween(r, 9.5, 10.5, 2));
  const film = labBetween(r, 0.3, 0.5, 2);
  const capGap = labBetween(r, 0.3, 0.8, 2);
  const wetG = labBetween(r, 0.15, 0.4, 2);
  const bubbleCm3 = labBetween(r, 0.2, 0.5, 2);
  return {
    seed, tempC, rhoW: densityWaterAt(tempC), zv, zm, cyl, marble, ball, wire,
    stoneV, stoneRho, saltRD, sbZero, bubbleN, touchFrac, beakerG, deficit,
    tubeD, tubeDi, tubeM, shots, meniscus, stick,
    bottleM, bottleV, liquid, liquidRD, sandRD, sand, film, capGap, wetG, bubbleCm3,
  };
}

const mean = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / (xs.length || 1);

// ------------------------------------------------------------------ CAL physics

/** The object's unit: cm for what the vernier measures, mm for the micrometer's. */
export const calUnit = (tool: CalTool) => (tool === 'V' ? 'cm' : 'mm');
/** The true size of an object at a place, in mm. `inside`: the tube's internal diameter. */
export function calSizeMm(v: PhyDensityVariant, obj: CalObj, pos: number, inside = false): number {
  const p = ((pos % CAL_PLACES) + CAL_PLACES) % CAL_PLACES;
  switch (obj) {
    case 'cyl':
      return v.cyl[p]! * 10;
    case 'marble':
      return v.marble[p]! * 10;
    case 'ball':
      return v.ball[p]!;
    case 'wire':
      return v.wire[p]!;
    case 'tube':
      return (inside ? v.tubeDi : v.tubeD) * 10;
  }
}
/** The tool fits round the object (the micrometer opens to 25 mm; the inside jaws go only into the tube). */
export const calFits = (v: PhyDensityVariant, tool: CalTool, obj: CalObj, inside = false) => (tool === 'M' ? !inside && calSizeMm(v, obj, 0) <= MICROMETER_MAX : !inside || obj === 'tube');
/**
 * What the instrument indicates (vernier in cm, micrometer in mm): the object's
 * size at this place (0 with the jaws closed on nothing) plus the zero error;
 * a micrometer screwed hard with the thimble squeezes and reads low.
 */
export function calIndicated(v: PhyDensityVariant, tool: CalTool, obj: CalObj | null, pos: number, forced = false, inside = false): number {
  const mm = obj ? calSizeMm(v, obj, pos, inside) : 0;
  if (tool === 'V') return mm / 10 + v.zv;
  return mm + v.zm - (forced ? FORCED_MM : 0);
}
/** The reading a careful student writes: vernier to 0.01 cm, micrometer to 0.01 mm. */
export const calRead = (x: number) => Math.round(x * 100 + 1e-9) / 100;
/** The true mean size (cm or mm, the tool's unit) over the places measured. */
export const calTrueMean = (v: PhyDensityVariant, tool: CalTool, obj: CalObj, places: number[], inside = false) => mean(places.map((p) => calSizeMm(v, obj, p, inside))) / (tool === 'V' ? 10 : 1);
/** The ball bearing's true volume (cm³) from its mean diameter over the orientations measured. */
export const ballVolume = (dMm: number) => (4 / 3) * Math.PI * (dMm / 20) ** 3;

// ------------------------------------------------------------------ ARCH physics

/** The stone's true weight (N). */
export const stoneWeight = (v: PhyDensityVariant) => ((v.stoneV * v.stoneRho) / 1e6) * DENSITY_G;
/** The density of a medium (kg m⁻³). */
export const densityOfMedium = (v: PhyDensityVariant, m: DensityMedium) => (m === 'water' ? v.rhoW : m === 'salt' ? v.saltRD * v.rhoW : 1.2);
/** Upthrust (N) on the stone fully immersed in a medium. */
export const densityUpthrust = (v: PhyDensityVariant, m: DensityMedium) => (m === 'air' ? 0 : densityOfMedium(v, m) * v.stoneV * 1e-6 * DENSITY_G);
/** The spring balance's set-up when read. */
export interface SbSetup {
  where: DensityMedium;
  depth: DensityDepth;
  bubbles: boolean;
  zeroed: boolean;
}
/** The spring balance's reading (N): weight − upthrust on the part immersed − bubbles, less what the can holds up, plus its zero error if not adjusted. */
export function sbReading(v: PhyDensityVariant, s: SbSetup): number {
  let F = stoneWeight(v);
  if (s.where !== 'air') {
    F -= densityUpthrust(v, s.where) * (s.depth === 'part' ? 0.5 : 1) + (s.bubbles ? v.bubbleN : 0);
    if (s.depth === 'touch') F *= 1 - v.touchFrac;
  }
  return F + (s.zeroed ? 0 : v.sbZero);
}
/** The true relative densities: the stone, and the salt solution. */
export const stoneRD = (v: PhyDensityVariant) => v.stoneRho / v.rhoW;

// ------------------------------------------------------------------ FLOAT physics

export const tubeArea = (v: PhyDensityVariant) => (Math.PI * v.tubeD ** 2) / 4;
/** The mass floating (g): the tube and the first `load` scoops. */
export const floatMass = (v: PhyDensityVariant, load: number) => v.tubeM + v.shots.slice(0, Math.max(0, Math.min(SHOT_SCOOPS, load))).reduce((t, x) => t + x, 0);
/** The loads of lead shot (g, true) in the tube. */
export const shotMass = (v: PhyDensityVariant, load: number) => floatMass(v, load) - v.tubeM;
/** The true depth immersed (cm): ρAh = M. */
export const floatDepth = (v: PhyDensityVariant, load: number) => floatMass(v, load) / ((v.rhoW / 1000) * tubeArea(v));
/** What the scale shows at the flat water surface (cm): a tube touching the wall is held up by friction. */
export const floatReading = (v: PhyDensityVariant, load: number, touching: boolean) => floatDepth(v, load) - (touching ? v.stick : 0);
/** With no lead shot the tube will not float upright; overloaded it sinks. */
export const floatUpright = (load: number) => load >= 1;
export const floatSinks = (v: PhyDensityVariant, load: number) => floatDepth(v, load) > FLOAT_TUBE_LEN - 0.4;
/** True slope (cm g⁻¹) and intercept (cm) of h against the added mass m. */
export const floatLine = (v: PhyDensityVariant) => {
  const k = 1 / ((v.rhoW / 1000) * tubeArea(v));
  return { slope: k, intercept: v.tubeM * k };
};

// ------------------------------------------------------------------ BOTTLE physics

/** What is in and on the density bottle when it is weighed. */
export interface BottleSnap {
  /** Scoops of sand in it. */
  sand: number;
  fill: BottleFill;
  /** Stoppered with the liquid right up the capillary. */
  toCap: boolean;
  /** Drops on the outside (not wiped). */
  outsideWet: boolean;
  /** A film of the last liquid inside (not dried). */
  film: BottleFill;
  /** An air bubble trapped inside. */
  bubble: boolean;
}
export const emptyBottle = (): BottleSnap => ({ sand: 0, fill: 'none', toCap: false, outsideWet: false, film: 'none', bubble: false });
export const sandMass = (v: PhyDensityVariant, n: number) => v.sand.slice(0, Math.max(0, Math.min(SAND_SCOOPS, n))).reduce((t, x) => t + x, 0);
/** A liquid's density (g cm⁻³). */
export const fillDensity = (v: PhyDensityVariant, f: BottleFill) => (f === 'water' ? v.rhoW / 1000 : f === 'liquid' ? (v.liquidRD * v.rhoW) / 1000 : 0);
/** The bottle's true mass (g) as it stands. */
export function bottleMass(v: PhyDensityVariant, b: BottleSnap): number {
  const sandG = sandMass(v, b.sand);
  let m = v.bottleM + sandG;
  if (b.fill === 'none') return m + (b.film !== 'none' ? v.film * fillDensity(v, b.film) : 0);
  const vol = v.bottleV - sandG / ((v.sandRD * v.rhoW) / 1000) - (b.toCap ? 0 : v.capGap) - (b.bubble ? v.bubbleCm3 : 0);
  m += b.film !== 'none' && b.film !== b.fill ? v.film * fillDensity(v, b.film) + (vol - v.film) * fillDensity(v, b.fill) : vol * fillDensity(v, b.fill);
  return m + (b.outsideWet ? v.wetG : 0);
}
export const bottleTrueRD = (v: PhyDensityVariant, sample: BottleSample) => (sample === 'grains' ? v.sandRD : v.liquidRD);

// ------------------------------------------------------------------ the triple-beam balance

/** Its riders: hundreds (0–5), tens (0–9) and the front rider (0–10 g in 0.1 g): up to 610 g. */
export interface DensityRiders {
  h: number;
  t: number;
  f: number;
}
export const densityRidersSum = (r: DensityRiders) => Math.round((r.h * 100 + r.t * 10 + r.f) * 10) / 10;
/** The pointer: −1 (riders side heavy) … +1 (pan heavy); 0 balanced. */
export const densityBeamTilt = (massG: number, r: DensityRiders) => Math.max(-1, Math.min(1, (massG - densityRidersSum(r)) / 0.6));
/** Balanced: the pointer on zero to within this (g). */
export const DENSITY_BALANCED_G = 0.1;

// ------------------------------------------------------------------ the student's work

export interface CalReading {
  tool: CalTool;
  /** null: the jaws closed on nothing (the zero error). */
  obj: CalObj | null;
  pos: number;
  /** Micrometer screwed with the thimble, not the ratchet. */
  forced: boolean;
  /** The eye square on to the scale (no parallax). */
  eyeOk: boolean;
  /** Vernier inside jaws. */
  inside: boolean;
}
export interface SbRead extends SbSetup {
  eyeOk: boolean;
  /** The stone still wet from the water when it went into the salt solution. */
  wet: boolean;
}
export type DensityWeighItem = 'beaker' | 'tube' | 'bottle';
export interface DensityWeighing {
  item: DensityWeighItem;
  /** The riders when recorded (g). */
  riders: number;
  /** The beaker: the water caught in it (cm³). */
  water: number;
  /** The bottle as weighed. */
  bottle: BottleSnap | null;
}
export interface DepthRead {
  load: number;
  touching: boolean;
  eyeOk: boolean;
}
export interface FloatTableRow {
  m: string;
  h: string;
}
export type DensityAnswerId = 'dcyl' | 'dball' | 'vol' | 'up' | 'wdisp' | 'rds' | 'rdl' | 'area' | 'slope' | 'rho' | 'mtube' | 'mw' | 'ml' | 'rd';
export const DENSITY_ANSWER_IDS: DensityAnswerId[] = ['dcyl', 'dball', 'vol', 'up', 'wdisp', 'rds', 'rdl', 'area', 'slope', 'rho', 'mtube', 'mw', 'ml', 'rd'];
/** The table's fixed cells, by task. */
export const DENSITY_CELLS: Record<DensityTask, string[]> = {
  CAL: ['zv', 'c1', 'c2', 'c3', 'cm', 'zm', 'b1', 'b2', 'b3', 'bm'],
  ARCH: ['w1', 'w2', 'w3', 'mb', 'mbw'],
  FLOAT: ['D', 'mt'],
  BOTTLE: ['m1', 'm2', 'm3', 'm4', 'T'],
};

export interface PhyDensityState {
  v: 1;
  task: DensityTask | null;
  // ---- vernier / micrometer (CAL; the vernier in FLOAT)
  tool: CalTool | null;
  /** What is between the jaws (null: nothing). */
  held: CalObj | null;
  /** The place / orientation it is measured at. */
  pos: number;
  /** The jaws closed on it (the micrometer by the ratchet unless forced). */
  closed: boolean;
  forced: boolean;
  inside: boolean;
  cal: CalReading[];
  // ---- Archimedes
  zeroed: boolean;
  /** The stone hangs from the balance; where it is and how deep. */
  hung: boolean;
  where: DensityMedium;
  depth: DensityDepth;
  bubbles: boolean;
  wet: boolean;
  /** The eureka can: cm³ below its spout; the catch beaker under the spout; water caught (cm³); water spilt on the bench. */
  deficit: number;
  catchUnder: boolean;
  caught: number;
  spill: boolean;
  sb: SbRead[];
  // ---- flotation
  load: number;
  floating: boolean;
  touching: boolean;
  sunk: boolean;
  depths: DepthRead[];
  /** The load (scoops) of each table row. */
  rows: number[];
  float: FloatTableRow[];
  // ---- density bottle
  sample: BottleSample;
  bottle: BottleSnap;
  /** Filled right to the brim (topped up with the dropper); the stopper in. */
  brim: boolean;
  stoppered: boolean;
  tempRead: boolean;
  // ---- the balance and the notebook
  weighs: DensityWeighing[];
  cells: Record<string, string>;
  line: PhyGraphLine | null;
  answers: Record<DensityAnswerId, PhyAnswer>;
  written: { precautions: string };
  log: { t: number; a: string }[];
}

export function emptyPhyDensityState(): PhyDensityState {
  const answers = Object.fromEntries(DENSITY_ANSWER_IDS.map((id) => [id, { value: '', unit: '' }])) as Record<DensityAnswerId, PhyAnswer>;
  return {
    v: 1,
    task: null,
    tool: null,
    held: null,
    pos: 0,
    closed: false,
    forced: false,
    inside: false,
    cal: [],
    zeroed: false,
    hung: false,
    where: 'air',
    depth: 'full',
    bubbles: false,
    wet: false,
    deficit: -1,
    catchUnder: false,
    caught: 0,
    spill: false,
    sb: [],
    load: 0,
    floating: false,
    touching: false,
    sunk: false,
    depths: [],
    rows: [],
    float: [],
    sample: 'liquid',
    bottle: emptyBottle(),
    brim: false,
    stoppered: false,
    tempRead: false,
    weighs: [],
    cells: {},
    line: null,
    answers,
    written: { precautions: '' },
    log: [],
  };
}

const short = z.string().max(40);
const fill = z.enum(['none', 'water', 'liquid']);
const medium = z.enum(['air', 'water', 'salt']);
const depth = z.enum(['part', 'full', 'touch']);
const tool = z.enum(['V', 'M']);
const obj = z.enum(CAL_OBJECTS);
const pos = z.number().int().min(0).max(CAL_PLACES - 1);
const load = z.number().int().min(0).max(SHOT_SCOOPS);
const bottleSnap = z.object({ sand: z.number().int().min(0).max(SAND_SCOOPS), fill, toCap: z.boolean(), outsideWet: z.boolean(), film: fill, bubble: z.boolean() });
const answerShape = Object.fromEntries(DENSITY_ANSWER_IDS.map((id) => [id, phyAnswerSchema])) as Record<DensityAnswerId, typeof phyAnswerSchema>;
export const phyDensityStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(DENSITY_TASKS).nullable(),
  tool: tool.nullable(),
  held: obj.nullable(),
  pos,
  closed: z.boolean(),
  forced: z.boolean(),
  inside: z.boolean(),
  cal: z.array(z.object({ tool, obj: obj.nullable(), pos, forced: z.boolean(), eyeOk: z.boolean(), inside: z.boolean() })).max(60),
  zeroed: z.boolean(),
  hung: z.boolean(),
  where: medium,
  depth,
  bubbles: z.boolean(),
  wet: z.boolean(),
  deficit: z.number().min(-1).max(400),
  catchUnder: z.boolean(),
  caught: z.number().min(0).max(400),
  spill: z.boolean(),
  sb: z.array(z.object({ where: medium, depth, bubbles: z.boolean(), zeroed: z.boolean(), eyeOk: z.boolean(), wet: z.boolean() })).max(40),
  load,
  floating: z.boolean(),
  touching: z.boolean(),
  sunk: z.boolean(),
  depths: z.array(z.object({ load, touching: z.boolean(), eyeOk: z.boolean() })).max(40),
  rows: z.array(load).max(10),
  float: z.array(z.object({ m: short, h: short })).max(10),
  sample: z.enum(['liquid', 'grains']),
  bottle: bottleSnap,
  brim: z.boolean(),
  stoppered: z.boolean(),
  tempRead: z.boolean(),
  weighs: z.array(z.object({ item: z.enum(['beaker', 'tube', 'bottle']), riders: z.number().min(0).max(620), water: z.number().min(0).max(400), bottle: bottleSnap.nullable() })).max(40),
  cells: z.record(z.string().regex(/^[a-zA-Z0-9]{1,4}$/), short).refine((c) => Object.keys(c).length <= 24, 'too many cells'),
  line: phyGraphLineSchema.nullable(),
  answers: z.object(answerShape),
  written: z.object({ precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyDensityState>;

export const PHY_DENSITY: SimulatorSpec = {
  id: 'phy-density',
  subject: 'Physics',
  title: 'Measurement, density and flotation',
  topicNames: ['Measurement of distance', 'Measurement', "Archimedes' principle", 'Law of flotation', 'Volume, density and relative density', 'Density', 'Upthrust', 'Relative density'],
  minutes: 45,
  rubric: [
    { id: 'care', label: 'Care and technique', marks: 2, how: 'AUTO', guide: 'Calipers: the micrometer closed with the ratchet every time, never forced with the thimble (1); every scale read with the eye square on to it, no parallax (1). Archimedes: the stone fully immersed without touching the can or beaker, its air bubbles shaken off (1); dried before the salt solution, and the balance read at eye level (1). Flotation: the tube floating upright and free of the wall for every reading, never overloaded so it sinks (1); h read with the eye level with the water surface (1). Density bottle: dry inside before each filling (or rinsed with the liquid) (1); filled to the capillary, free of air bubbles and wiped dry outside for every full weighing (1).' },
    { id: 'procedure', label: 'Procedure', marks: 4, how: 'AUTO', guide: 'Calipers: the vernier’s zero checked with the jaws closed (1); the cylinder measured at three or more places (1); the micrometer’s zero checked (1); the ball bearing measured in three or more orientations (1). Archimedes: the balance’s zero checked and adjusted (1); W₁ in air, W₂ fully immersed in water and W₃ in salt solution all taken (1); the eureka can filled to the spout before the stone went in (1); the displaced water caught and weighed, with the beaker weighed empty (1). Flotation: the external diameter measured with the vernier (1); the empty tube weighed (1); at least five loads (1) from 10 g to at least 50 g (1). Density bottle: m₁ with the bottle empty and dry (1); m₂ full of water (1); m₃ full of the liquid (grains: with sand, sand + water and full of water) (1); the room temperature read (1).' },
    { id: 'readings', label: 'Table of readings', marks: 5, how: 'AUTO', guide: 'Readings that match the instruments: vernier ±0.01 cm, micrometer ±0.01 mm, spring balance ±0.05 N, balance ±0.1 g with the beam balanced, depth ±0.15 cm (3); recorded to the instrument’s precision — 0.01 cm, 0.01 mm, 0.05 N, 0.1 g, 0.1 cm (1); zero errors recorded with their sign (calipers), or the derived columns worked out (1).' },
    { id: 'analysis', label: 'Graph or working', marks: 2, how: 'AUTO', guide: 'Calipers: the mean of each set (1) and the zero error subtracted with its sign (1). Archimedes: the upthrust W₁ − W₂ (1) agreeing with the weight of water displaced (within 3 %, or 0.05 N) (1). Flotation: h against m plotted with a straight line across the points (1) that is a good best fit (1). Density bottle: the masses of water and of the liquid (or grains) from your own readings (1), and the formula with the empty bottle subtracted (1).' },
    { id: 'calculations', label: 'Results', marks: 4, how: 'AUTO', guide: 'Calipers: corrected diameters within 0.02 cm and 0.01 mm of the truth (2); V = (4/3)πr³ from your diameter (1), within 2 % (1). Archimedes: RD of the stone W₁/(W₁ − W₂) from your values (1), within 4 % (1); RD of the liquid (W₁ − W₃)/(W₁ − W₂) (1), within 4 % (1). Flotation: A = πD²/4 from the external diameter (1); ρ = 1/(A × slope) (1) within 5 % of water’s density at the room temperature (1); the tube’s mass ρA × intercept within 10 % (1). Density bottle: RD from your masses (1) within 1.5 % (grains 3 %) (1); density = RD × density of water (1) within 2 % (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Diameters in cm or mm and V in cm³ (mm³); weights and upthrust in N, relative density with no unit; A in cm², the slope in cm g⁻¹, ρ in g cm⁻³ or kg m⁻³, the tube’s mass in g; masses in g and density in kg m⁻³ (or g cm⁻³).' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each), e.g. zero error checked and corrected; the ratchet used so the object is not squeezed; readings at several places and averaged; eye perpendicular to the scale (no parallax); the stone fully immersed and not touching the container; the eureka can filled to the spout and allowed to stop dripping; the stone dried before the second liquid; air bubbles removed; the tube floating upright, not touching the sides; h read at the bottom of the meniscus; the load spread evenly at the bottom; the bottle dried before each filling; filled to the capillary with no air bubbles; the outside wiped dry before weighing; the same temperature for both liquids.' },
  ],
};
