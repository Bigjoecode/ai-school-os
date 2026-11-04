import { PREP_STAY, prepEv, prepKeyOf, prepP, prepPn, prepR2, type ChemPrepVariant, type PrepAct, type PrepEvent, type PrepItem, type PrepKey, type PrepPart, type PrepTask } from './chem-prep-data';
import { prepTubes } from './chem-prep-tubes';

/**
 * The procedure tasks replayed from the event list: what the balance, the
 * flask, the dish, the thermometer and the gas jar show, and so what the
 * student should see, write and calculate.
 */

// ------------------------------------------------------------------ STANDARD

export const STD_M = 106;
export const STD_DROP = 0.05;
export const STD_TOL = 0.03;
export interface StdFlask {
  started: boolean;
  vol: number;
  mol: number;
  filled: boolean;
  drops: number;
  /** Checked at eye level after the last addition. */
  eye: boolean;
  mixed: number;
}
const flask0 = (): StdFlask => ({ started: false, vol: 0, mol: 0, filled: false, drops: 0, eye: false, mixed: 0 });
export interface StdRun {
  inBottle: number;
  m1: number | null;
  /** No solid added or removed since the bottle was weighed. */
  m1Fresh: boolean;
  m2: number | null;
  tipped: boolean;
  where: 'BEAKER' | 'FLASK' | null;
  transferred: number;
  water: boolean;
  dissolved: boolean;
  poured: boolean;
  rinses: number;
  left: number;
  f1: StdFlask;
  pip: 'NONE' | 'WATER' | 'SOL';
  mouth: boolean;
  pipetted: boolean;
  f2: StdFlask;
  balance: number | null;
}
export const stdC = (f: StdFlask) => (f.vol > 0 ? f.mol / (f.vol / 1000) : 0);
export const stdAtMark = (f: StdFlask) => Math.abs(f.vol - 250) <= STD_TOL;
export const stdOver = (f: StdFlask) => f.vol > 250 + STD_TOL;
/** Height of the meniscus above (+) or below (−) the mark, mm (neck 1.1 cm²). */
export const stdMeniscusMm = (f: StdFlask) => (f.vol - 250) / 0.11;

export function stdRun(v: ChemPrepVariant, events: PrepEvent[]): StdRun {
  const fresh = (): StdRun => ({ inBottle: 0, m1: null, m1Fresh: false, m2: null, tipped: false, where: null, transferred: 0, water: false, dissolved: false, poured: false, rinses: 0, left: 0, f1: flask0(), pip: 'NONE', mouth: false, pipetted: false, f2: flask0(), balance: null });
  let s = fresh();
  let bk = 0;
  let sk = 0;
  let uk = 0;
  for (const e of events) {
    const f = s.pipetted ? s.f2 : s.f1;
    switch (e.a) {
      case 'RESTART':
        if (e.x === 'DILUTE') Object.assign(s, { f2: flask0(), pipetted: false, pip: 'NONE', mouth: false });
        else s = fresh();
        break;
      case 'SCOOP':
        if (s.tipped) break;
        s.inBottle += e.x === 'SMALL' ? v.std.small[sk++ % 20]! : v.std.big[bk++ % v.std.big.length]!;
        s.m1Fresh = false;
        break;
      case 'UNSCOOP':
        if (s.tipped) break;
        s.inBottle = Math.max(0, s.inBottle - v.std.small[20 + (uk++ % 20)]!);
        s.m1Fresh = false;
        break;
      case 'WEIGH1':
        if (s.tipped || s.inBottle <= 0) break;
        s.m1 = prepR2(v.std.bottle + s.inBottle);
        s.m1Fresh = true;
        s.balance = s.m1;
        break;
      case 'TIP': {
        if (s.tipped || s.inBottle <= 0) break;
        const res = Math.min(s.inBottle, v.std.residue);
        s.transferred = s.inBottle - res;
        s.inBottle = res;
        s.tipped = true;
        s.where = e.x === 'FLASK' ? 'FLASK' : 'BEAKER';
        if (s.where === 'FLASK') Object.assign(s.f1, { started: true, mol: s.transferred / STD_M });
        break;
      }
      case 'WEIGH2':
        if (!s.tipped) break;
        s.m2 = prepR2(v.std.bottle + s.inBottle);
        s.balance = s.m2;
        break;
      case 'WATER100':
        if (!s.tipped || s.water) break;
        s.water = true;
        if (s.where === 'FLASK') s.f1.vol += 100;
        break;
      case 'STIR':
        if (s.water) s.dissolved = true;
        break;
      case 'POUR':
        if (s.where !== 'BEAKER' || !s.dissolved || s.poured) break;
        s.poured = true;
        s.left = s.transferred * 0.03;
        Object.assign(s.f1, { started: true, mol: (s.transferred * 0.97) / STD_M, vol: 100 });
        break;
      case 'RINSE':
        if (!s.poured || s.f1.filled || s.f1.vol > 230) break;
        {
          const rec = s.left * 0.85;
          s.left -= rec;
          s.f1.mol += rec / STD_M;
          s.f1.vol += 10;
          s.rinses++;
        }
        break;
      case 'FILL':
        if (!f.started) break;
        f.vol = f.vol < v.std.bulkTo ? v.std.bulkTo : f.vol + 2.5;
        f.filled = true;
        f.eye = false;
        break;
      case 'DROP':
        if (!f.filled) break;
        f.vol += STD_DROP * Math.max(1, e.n);
        f.drops += Math.max(1, e.n);
        f.eye = false;
        break;
      case 'EYE':
        if (f.filled) f.eye = true;
        break;
      case 'MIX':
        if (f.filled) f.mixed += Math.max(1, e.n);
        break;
      case 'PIP_RINSE':
        s.pip = e.x === 'SOL' ? 'SOL' : 'WATER';
        break;
      case 'PIPETTE': {
        if (s.pipetted || !s.f1.filled) break;
        s.pipetted = true;
        s.mouth = e.x === 'MOUTH';
        const uniform = s.f1.mixed >= 10 ? 1 : s.f1.mixed > 0 ? 0.97 : 0.85;
        const rinse = s.pip === 'SOL' ? 1 : s.pip === 'WATER' ? 0.985 : 0.995;
        s.f2 = { ...flask0(), started: true, vol: 25, mol: stdC(s.f1) * uniform * rinse * 0.025 };
        break;
      }
    }
  }
  return s;
}

// ------------------------------------------------------------------ DISTIL

export const DS_ROOM = 28;
export interface DsRun {
  filtered: boolean;
  dishEmpty: number | null;
  measured: boolean;
  water: number;
  salt: number;
  sand: number;
  wet: number;
  /** Minutes the salt spat out of the dish (over the flame when nearly dry). */
  spat: number;
  hot: boolean;
  weighings: { m: number; hot: boolean }[];
  thermo: PrepItem;
  condenser: PrepItem;
  waterOn: boolean;
  chips: boolean;
  filled: boolean;
  receiver: PrepItem;
  liquidT: number;
  liquidVol: number;
  boilMin: number;
  heating: boolean;
  distillate: number;
  bumps: number;
  blown: boolean;
  boiledDry: boolean;
  /** The thermometer reading (°C, to 0.5) the last minute the liquid was boiling, and now. */
  distT: number | null;
  tests: PrepItem[];
  balance: number | null;
}
export const dsBpLiquid = (v: ChemPrepVariant, liquidVol: number) => v.ds.bpWater + (0.512 * 2 * ((v.ds.salt * 0.1) / 58.5)) / Math.max(0.01, liquidVol / 1000);
const half = (x: number) => Math.round(x * 2) / 2;
/** What the thermometer shows with its bulb where the student put it. */
export function dsThermometer(v: ChemPrepVariant, r: Pick<DsRun, 'filled' | 'liquidT' | 'liquidVol' | 'heating' | 'thermo'>): number {
  if (!r.filled) return DS_ROOM;
  const boiling = r.heating && r.liquidT >= dsBpLiquid(v, r.liquidVol) - 0.01;
  const o = v.ds.offset;
  if (r.thermo === 'LIQUID') return half(r.liquidT + o);
  if (r.thermo === 'TOP') return half(boiling ? v.ds.bpWater - 2.5 + o : Math.max(DS_ROOM, r.liquidT - 40));
  return half(boiling ? v.ds.bpWater + o : Math.max(DS_ROOM, r.liquidT - 25));
}

export function dsRun(v: ChemPrepVariant, events: PrepEvent[]): DsRun {
  const s: DsRun = { filtered: false, dishEmpty: null, measured: false, water: 0, salt: 0, sand: 0, wet: 0, spat: 0, hot: false, weighings: [], thermo: '', condenser: '', waterOn: false, chips: false, filled: false, receiver: '', liquidT: DS_ROOM, liquidVol: 0, boilMin: 0, heating: false, distillate: 0, bumps: 0, blown: false, boiledDry: false, distT: null, tests: [], balance: null };
  const reading = () => prepR2(v.ds.dish + s.salt + s.sand + s.water + s.wet - (s.hot ? 0.03 : 0));
  for (const e of events) {
    const mins = Math.max(1, Math.round(e.n / 60));
    switch (e.a) {
      case 'FILTER':
        s.filtered = true;
        break;
      case 'WEIGH_DISH':
        if (!s.measured) s.dishEmpty = s.balance = v.ds.dish;
        else s.weighings.push({ m: (s.balance = reading()), hot: s.hot });
        break;
      case 'MEASURE':
        if (s.dishEmpty === null || s.measured) break;
        Object.assign(s, { measured: true, water: 50, salt: (v.ds.salt * 50) / 1000, sand: s.filtered ? 0 : v.ds.sand });
        break;
      case 'HEAT_DISH':
        if (!s.measured) break;
        s.hot = true;
        for (let m = 0; m < mins; m++) {
          if (s.water > 4) {
            s.water = Math.max(0, s.water - 6);
            if (s.water === 0) s.wet = 0.1;
          } else {
            s.spat++;
            s.salt *= s.water > 0 ? 0.95 : 0.97;
            if (s.water > 0) (s.water = 0), (s.wet = 0.1);
            else s.wet *= 0.37;
          }
        }
        break;
      case 'BATH_DISH':
        if (!s.measured) break;
        s.hot = true;
        for (let m = 0; m < mins; m++) {
          if (s.water > 0) {
            s.water = Math.max(0, s.water - 2.5);
            if (s.water === 0) s.wet = 0.1;
          } else s.wet *= 0.55;
        }
        break;
      case 'COOL':
        s.hot = false;
        break;
      case 'THERMO':
        s.thermo = e.x;
        break;
      case 'CONDENSER':
        s.condenser = e.x;
        break;
      case 'WATER_ON':
        s.waterOn = e.x !== 'NONE';
        break;
      case 'CHIPS':
        s.chips = true;
        break;
      case 'FILL_FLASK':
        if (!s.filled) Object.assign(s, { filled: true, liquidVol: 100, liquidT: DS_ROOM });
        break;
      case 'RECEIVER':
        s.receiver = e.x;
        break;
      case 'HEAT':
        if (!s.filled || s.boiledDry) break;
        s.heating = true;
        for (let m = 0; m < mins && !s.boiledDry; m++) {
          const bp = dsBpLiquid(v, s.liquidVol);
          if (s.liquidT < bp - 0.01) {
            s.liquidT = Math.min(bp, s.liquidT + 20);
            continue;
          }
          s.liquidT = bp;
          s.boilMin++;
          if (!s.chips) s.bumps++;
          if (s.receiver === 'STOPPERED' && !s.blown) s.blown = true;
          s.liquidVol -= 3.2;
          s.distillate += 3.0 * (s.waterOn ? (s.condenser === 'BOTTOM' ? 1 : s.condenser === 'TOP' ? 0.5 : 0.1) : 0.1);
          s.liquidT = dsBpLiquid(v, s.liquidVol);
          s.distT = dsThermometer(v, s);
          if (s.liquidVol < 12) s.boiledDry = true;
        }
        break;
      case 'STOP':
        s.heating = false;
        break;
      case 'TEST_DIST':
        if (s.distillate >= 2 && !s.tests.includes(e.x)) s.tests.push(e.x);
        break;
    }
  }
  s.distillate = prepR2(s.distillate);
  return s;
}
/** The salt is dry: no water left and two weighings after drying agree (constant mass). */
export function dsConstant(r: DsRun): boolean {
  const cold = r.weighings.filter((w) => !w.hot);
  if (r.water > 0 || cold.length < 2) return false;
  return Math.abs(cold.at(-1)!.m - cold.at(-2)!.m) <= 0.011;
}

// ------------------------------------------------------------------ AMMONIA

export const AM_JAR = 0.25;
export interface AmRun {
  nh4: number | null;
  ca: number | null;
  mixed: boolean;
  loaded: boolean;
  clamp: PrepItem;
  dryer: PrepItem;
  collect: PrepItem;
  heatSec: number;
  cracked: boolean;
  produced: number;
  passed: number;
  /** Fraction of ammonia in the gas jar. */
  jar: number;
  litmus: PrepItem[];
  hcl: boolean;
  waft: boolean;
  fountain: number | null;
  balance: number | null;
  /** The jar's contents when each test was done. */
  testedAt: number;
}
export function amRun(v: ChemPrepVariant, events: PrepEvent[]): AmRun {
  const s: AmRun = { nh4: null, ca: null, mixed: false, loaded: false, clamp: '', dryer: '', collect: '', heatSec: 0, cracked: false, produced: 0, passed: 0, jar: 0, litmus: [], hcl: false, waft: false, fountain: null, balance: null, testedAt: 0 };
  const update = () => {
    const total = (s.nh4 ?? 0) / 53.5;
    s.produced = total * (1 - Math.exp(-s.heatSec / 300));
    s.passed = s.produced * (s.dryer === 'H2SO4' || s.dryer === 'CACL2' ? 0 : 0.9);
    const fill = 1 - Math.exp(-(s.passed * 24) / AM_JAR);
    s.jar = s.collect === 'UPWARD' ? 0.97 * fill : s.collect === 'DOWNWARD' ? 0.08 * fill : 0;
  };
  for (const e of events) {
    switch (e.a) {
      case 'WEIGH_NH4CL':
        s.nh4 = s.balance = v.am.nh4;
        break;
      case 'WEIGH_CAOH2':
        s.ca = s.balance = v.am.ca;
        break;
      case 'MIXSOLID':
        if (s.nh4 !== null && s.ca !== null) s.mixed = true;
        break;
      case 'LOAD':
        if (s.mixed) s.loaded = true;
        break;
      case 'CLAMP':
        if (!s.heatSec) s.clamp = e.x;
        break;
      case 'DRYER':
        if (!s.heatSec) s.dryer = e.x;
        break;
      case 'COLLECT':
        if (!s.heatSec) s.collect = e.x;
        break;
      case 'HEAT_GAS':
        if (!s.loaded || s.cracked) break;
        for (let m = 0; m < Math.max(1, Math.round(e.n / 60)) && !s.cracked; m++) {
          s.heatSec += 60;
          if (s.clamp === 'UP' && s.heatSec >= 60) s.cracked = true;
          update();
        }
        break;
      case 'LITMUS':
        if (!s.litmus.includes(e.x)) s.litmus.push(e.x);
        s.testedAt = s.jar;
        break;
      case 'HCL_ROD':
        s.hcl = true;
        s.testedAt = s.jar;
        break;
      case 'WAFT':
        s.waft = true;
        break;
      case 'FOUNTAIN':
        if (s.fountain === null && s.jar > 0) s.fountain = s.jar * (s.dryer === 'CAO' ? 1 : 0.7);
        break;
    }
  }
  return s;
}

// ------------------------------------------------------------------ rows

const LAYERLESS: PrepPart[] = [];
export function prepRowParts(v: ChemPrepVariant, events: PrepEvent[], row: string): PrepPart[] {
  if (v.task === 'STANDARD') {
    const r = stdRun(v, events);
    if (row === 'DISSOLVE') return r.dissolved ? [prepP('the white solid dissolves completely on stirring', ['dissolve']), prepP('a clear, colourless solution', ['colourless', 'colorless', 'clear'])] : r.water ? [prepP('some white solid stays undissolved until it is stirred', ['undissolved', 'white'])] : LAYERLESS;
    const f = row === 'FLASK' ? r.f1 : r.f2;
    if (!f.filled) return LAYERLESS;
    const at = stdAtMark(f) ? prepPn('the bottom of the meniscus is on the mark', ['above', 'below', 'over'], ['mark', 'meniscus']) : stdOver(f) ? prepP('the meniscus is above the mark (overshot)', ['above', 'over']) : prepP('the meniscus is still below the mark', ['below']);
    return row === 'FLASK' ? [prepP('a clear, colourless solution', ['colourless', 'colorless', 'clear']), at] : [prepP('the diluted solution is clear and colourless, looking just like the first', ['colourless', 'colorless', 'clear', 'identical', 'same']), at];
  }
  if (v.task === 'DISTIL') {
    const r = dsRun(v, events);
    if (row === 'EVAP') {
      if (!r.measured || r.water > 0) return LAYERLESS;
      const out = [prepP('white crystals (solid salt) remain in the dish', ['white']), prepP('the crystals are left once the water has evaporated', ['crystal', 'solid', 'salt', 'residue'])];
      if (r.spat) out.push(prepP('near dryness the salt spits (crackles) out of the dish', ['spit', 'crackl', 'jump', 'spatter']));
      return out;
    }
    if (row === 'DISTIL') {
      if (!r.boilMin) return LAYERLESS;
      const out = [prepP('the salty water boils', ['boil', 'bubbl'])];
      if (r.distillate > 0.5) out.push(prepP('vapour condenses in the condenser and a colourless liquid drips into the receiver', ['condens', 'drip', 'collect', 'droplet', 'distillate']));
      out.push(prepP(`the thermometer reading stays steady at about ${r.distT ?? 100} °C`, ['steady', 'constant', 'stays', 'remain', String(Math.floor(r.distT ?? 100)), '100']));
      if (r.bumps) out.push(prepP('without granules the liquid bumps (boils violently)', ['bump', 'violent', 'jerk']));
      return out;
    }
    if (row === 'TEST') {
      const out: PrepPart[] = [];
      if (r.tests.includes('EVAP')) out.push(prepP('a few drops evaporated on a watch glass leave no residue', ['no residue', 'nothing', 'no solid', 'no white', 'no salt']));
      if (r.tests.includes('BP')) out.push(prepP(`the distillate boils at ${half(v.ds.bpWater + v.ds.offset)} °C (about 100 °C)`, ['100', String(Math.floor(v.ds.bpWater + v.ds.offset))]));
      if (r.tests.includes('AGNO3')) out.push(prepP('silver nitrate gives no white precipitate', ['no precipitate', 'no white', 'no ppt', 'clear', 'no cloud']));
      return out;
    }
  }
  if (v.task === 'AMMONIA') {
    const r = amRun(v, events);
    if (row === 'GAS') {
      if (r.jar < 0.3 && !r.waft) return LAYERLESS;
      const out = [prepP('a colourless gas', ['colourless', 'colorless'])];
      if (r.waft && r.passed > 0) out.push(prepP('with a pungent (choking) smell', ['pungent', 'choking', 'irritating', 'sharp', 'strong']));
      return out;
    }
    if (row === 'LITMUS') {
      if (!r.litmus.length) return LAYERLESS;
      const out: PrepPart[] = [];
      if (r.litmus.includes('DAMP')) out.push(r.testedAt >= 0.3 ? prepP('damp red litmus paper turns blue', ['blue']) : prepPn('damp red litmus stays red', ['blue'], ['red', ...PREP_STAY]));
      if (r.litmus.includes('DRY')) out.push(prepP('dry red litmus does not change', ['dry'], ['no change', 'remain', 'stays', 'unchanged', 'does not', 'not change', 'still red']));
      return out;
    }
    if (row === 'HCL') return !r.hcl ? LAYERLESS : r.testedAt >= 0.3 ? [prepP('dense white fumes form', ['white'], ['fume', 'smoke', 'cloud'])] : [prepP('no fumes', ['no fume', 'no white', 'nothing', 'no smoke'])];
    if (row === 'FOUNTAIN') return r.fountain === null ? LAYERLESS : r.fountain >= 0.6 ? [prepP('water rushes up the jet into the flask as a fountain', ['fountain', 'rush', 'spurt', 'jet', 'forced', 'shoot']), prepP('the water turns pink', ['pink'])] : [prepP('water rises only slowly into the flask', ['slow', 'little', 'rises'])];
  }
  return LAYERLESS;
}

export function prepRowKey(v: ChemPrepVariant, events: PrepEvent[], row: string): PrepKey | null {
  if (!prepRowParts(v, events, row).length) return null;
  if (v.task === 'DISTIL') return row === 'EVAP' ? prepKeyOf(['NONVOLATILE']) : row === 'DISTIL' ? prepKeyOf(['CONDENSED'], ['PURE_WATER']) : row === 'TEST' ? prepKeyOf(['PURE_WATER']) : null;
  if (v.task === 'AMMONIA') {
    const r = amRun(v, events);
    if (row === 'LITMUS') return r.litmus.includes('DAMP') && r.testedAt >= 0.3 ? prepKeyOf(['ALKALINE'], ['NH3']) : null;
    if (row === 'HCL') return r.testedAt >= 0.3 ? prepKeyOf(['NH3'], ['ALKALINE']) : null;
    if (row === 'FOUNTAIN') return (r.fountain ?? 0) >= 0.6 ? prepKeyOf(['SOLUBLE'], ['ALKALINE']) : null;
  }
  return null;
}

// ------------------------------------------------------------------ answers

const f2 = (x: number | null | undefined) => (x === null || x === undefined ? '' : x.toFixed(2));
const s3 = (x: number) => (Number.isFinite(x) && x !== 0 ? x.toPrecision(3) : "0");
/** The right entry for every reading and answer box (from this attempt's own readings where there are any). */
export function prepCalcAnswer(v: ChemPrepVariant, events: PrepEvent[]): Record<string, string> {
  switch (v.task) {
    case 'STANDARD': {
      const r = stdRun(v, events);
      const mass = r.m1 !== null && r.m2 !== null ? prepR2(r.m1 - r.m2) : 0;
      const c1 = mass / STD_M / 0.25;
      const q = v.std.q;
      return { mneed: '2.65', m1: f2(r.m1), m2: f2(r.m2), mass: mass.toFixed(2), c1: s3(c1), c2: s3(c1 / 10), v1: ((q.ct * q.vt) / q.cs).toFixed(1) };
    }
    case 'LECHAT':
      return { kc: s3(v.lc.cx / (v.lc.fe * v.lc.scn)), kcunit: 'dm³ mol⁻¹' };
    case 'DISTIL': {
      const r = dsRun(v, events);
      const last = r.weighings.filter((w) => !w.hot).at(-1)?.m ?? null;
      const salt = last !== null && r.dishEmpty !== null ? prepR2(last - r.dishEmpty) : 0;
      return { dish: f2(r.dishEmpty), dishsalt: f2(last), salt: salt.toFixed(2), conc: s3((salt * 1000) / 50), bp: r.distT === null ? '' : r.distT.toFixed(1) };
    }
    case 'HALOGEN': {
      const mol = (v.hl.c * v.hl.vol) / 1000;
      return { mol: s3(mol), mass: s3(mol * 254) };
    }
    case 'AMMONIA': {
      const r = amRun(v, events);
      const mol = (r.nh4 ?? v.am.nh4) / 53.5;
      return { nh4: f2(r.nh4), ca: f2(r.ca), mol: s3(mol), vol: s3(mol * 24), need: s3((mol / 2) * 74) };
    }
  }
}
/** The task-card question for the calculation. */
export function prepCalcQuestion(v: ChemPrepVariant): string {
  switch (v.task) {
    case 'STANDARD':
      return `Calculate the mass of Na₂CO₃ needed, the concentration of your solution from the mass you transferred, the concentration after dilution (C₁V₁ = C₂V₂), and the volume of ${v.std.q.cs.toFixed(2)} mol dm⁻³ ${v.std.q.acid} needed to make ${v.std.q.vt} cm³ of ${v.std.q.ct.toFixed(3)} mol dm⁻³ ${v.std.q.acid}.`;
    case 'LECHAT':
      return `At equilibrium [Fe³⁺] = ${(v.lc.fe * 1e3).toFixed(1)} × 10⁻³, [SCN⁻] = ${(v.lc.scn * 1e4).toFixed(1)} × 10⁻⁴ and [FeSCN²⁺] = ${(v.lc.cx * 1e5).toFixed(1)} × 10⁻⁵ mol dm⁻³. Calculate Kc and give its unit.`;
    case 'DISTIL':
      return 'From your weighings, calculate the mass of salt in 50.0 cm³ of sea water and its concentration in g dm⁻³.';
    case 'HALOGEN':
      return `Cl₂ + 2KI → 2KCl + I₂. ${v.hl.vol.toFixed(1)} cm³ of ${v.hl.c.toFixed(3)} mol dm⁻³ chlorine water reacts with excess KI. Calculate the moles and the mass of iodine formed.`;
    case 'AMMONIA':
      return '2NH₄Cl + Ca(OH)₂ → CaCl₂ + 2H₂O + 2NH₃. From the mass of NH₄Cl you used, calculate its moles, the volume of ammonia at r.t.p. and the mass of Ca(OH)₂ needed to react with it.';
  }
}

// ------------------------------------------------------------------ model events

export function prepModelEvents(v: ChemPrepVariant): PrepEvent[] {
  const e: PrepEvent[] = [];
  const E = (a: PrepAct, x: PrepItem = '', n = 0) => e.push(prepEv(a, x, n));
  switch (v.task) {
    case 'STANDARD': {
      for (let k = 0; k < 40 && stdRun(v, e).inBottle < 2.62; k++) E('SCOOP', stdRun(v, e).inBottle < 2.2 ? 'BIG' : 'SMALL');
      for (let k = 0; k < 10 && stdRun(v, e).inBottle > 2.72; k++) E('UNSCOOP');
      E('WEIGH1');
      E('TIP', 'BEAKER');
      E('WEIGH2');
      E('WATER100');
      E('STIR');
      E('POUR');
      for (let k = 0; k < 3; k++) E('RINSE');
      const makeUp = () => {
        E('FILL');
        const f = () => (stdRun(v, e).pipetted ? stdRun(v, e).f2 : stdRun(v, e).f1);
        const need = Math.round((250 - f().vol) / STD_DROP);
        for (let k = 0; k < Math.floor(need / 5); k++) E('DROP', '', 5);
        for (let k = 0; k < need % 5; k++) E('DROP', '', 1);
        E('EYE');
        E('MIX', '', 10);
      };
      makeUp();
      E('PIP_RINSE', 'WATER');
      E('PIP_RINSE', 'SOL');
      E('PIPETTE', 'FILLER');
      makeUp();
      break;
    }
    case 'LECHAT':
      E('STOCK', 'DILUTE');
      for (let k = 0; k < 6; k++) E('TUBE', 'FESCN');
      E('ADD', 'FECL3', 1);
      E('ADD', 'KSCN', 2);
      E('ADD', 'NH4CL', 3);
      E('BATH', 'HOT', 4);
      E('BATH', 'ICE', 5);
      E('TUBE', 'CHROMATE');
      E('ADD', 'HCL', 6);
      E('ADD', 'NAOH', 6);
      break;
    case 'DISTIL':
      E('FILTER');
      E('WEIGH_DISH');
      E('MEASURE');
      for (let k = 0; k < 8; k++) E('HEAT_DISH', '', 60);
      for (let k = 0; k < 6; k++) E('BATH_DISH', '', 60);
      E('COOL');
      E('WEIGH_DISH');
      E('BATH_DISH', '', 60);
      E('COOL');
      E('WEIGH_DISH');
      E('FILL_FLASK');
      E('CHIPS');
      E('THERMO', 'SIDEARM');
      E('CONDENSER', 'BOTTOM');
      E('WATER_ON');
      E('RECEIVER', 'OPEN');
      for (let k = 0; k < 10; k++) E('HEAT', '', 60);
      E('STOP');
      E('TEST_DIST', 'EVAP');
      E('TEST_DIST', 'BP');
      break;
    case 'HALOGEN': {
      const pairs: [PrepItem, PrepItem][] = [['KBR', 'CL2'], ['KI', 'CL2'], ['KCL', 'BR2'], ['KI', 'BR2'], ['KCL', 'I2'], ['KBR', 'I2'], ['WATER', 'BR2'], ['WATER', 'I2']];
      pairs.forEach(([salt, hal], i) => {
        E('TUBE', salt);
        E('ADD', hal, i);
        E('SHAKE', '', i);
        E('ADD', 'HEXANE', i);
        E('SHAKE', '', i);
      });
      E('TUBE', 'KI');
      E('ADD', 'CL2', 8);
      E('SHAKE', '', 8);
      E('ADD', 'STARCH', 8);
      break;
    }
    case 'AMMONIA':
      E('WEIGH_NH4CL');
      E('WEIGH_CAOH2');
      E('MIXSOLID');
      E('LOAD');
      E('CLAMP', 'DOWN');
      E('DRYER', 'CAO');
      E('COLLECT', 'UPWARD');
      for (let k = 0; k < 3; k++) E('HEAT_GAS', '', 60);
      E('WAFT');
      E('LITMUS', 'DAMP');
      E('HCL_ROD');
      E('FOUNTAIN');
      break;
  }
  return e;
}

// ------------------------------------------------------------------ the bench's actions (2D and 3D)

export interface PrepActionDef {
  a: PrepAct;
  x?: PrepItem;
  n?: number;
  /** The object it is done with (3D id; the 2D lab groups by it). */
  obj: string;
  label: string;
  tone?: 'brand' | 'danger';
  /** Acts on the tube in use (n = its index). */
  tube?: boolean;
}
const A = (obj: string, a: PrepAct, label: string, x: PrepItem = '', n = 0, tone?: 'brand' | 'danger', tube = false): PrepActionDef => ({ obj, a, label, x, n, tone, tube });
export const PREP_ACTIONS: Record<PrepTask, PrepActionDef[]> = {
  STANDARD: [
    A('bottle', 'SCOOP', 'Add a spatula of Na₂CO₃ to the weighing bottle (≈0.6 g)', 'BIG', 0, 'brand'),
    A('bottle', 'SCOOP', 'Add a little more (≈0.1 g)', 'SMALL'),
    A('bottle', 'UNSCOOP', 'Take a little out (≈0.1 g)'),
    A('balance', 'WEIGH1', 'Weigh the bottle + Na₂CO₃', '', 0, 'brand'),
    A('bottle', 'TIP', 'Tip the solid into the beaker', 'BEAKER', 0, 'brand'),
    A('bottle', 'TIP', 'Tip the solid straight into the volumetric flask', 'FLASK', 0, 'danger'),
    A('balance', 'WEIGH2', 'Reweigh the bottle (by difference)', '', 0, 'brand'),
    A('beaker', 'WATER100', 'Add about 100 cm³ of distilled water', '', 0, 'brand'),
    A('beaker', 'STIR', 'Stir with the glass rod until it dissolves'),
    A('beaker', 'POUR', 'Pour the solution through the funnel into the flask', '', 0, 'brand'),
    A('beaker', 'RINSE', 'Rinse beaker, rod and funnel into the flask (wash bottle)'),
    A('flask', 'FILL', 'Add distilled water until close to the mark', '', 0, 'brand'),
    A('flask', 'DROP', 'Add 5 drops with the dropper', '', 5),
    A('flask', 'DROP', 'Add 1 drop', '', 1),
    A('flask', 'EYE', 'Check the meniscus at eye level'),
    A('flask', 'MIX', 'Stopper and invert 10 times', '', 10),
    A('flask', 'RESTART', 'Overshot? Pour it away and start again', 'ALL', 0, 'danger'),
    A('pipette', 'PIP_RINSE', 'Rinse the pipette with distilled water', 'WATER'),
    A('pipette', 'PIP_RINSE', 'Rinse the pipette with the standard solution', 'SOL'),
    A('pipette', 'PIPETTE', 'Pipette 25.0 cm³ (with the filler) into the second flask', 'FILLER', 0, 'brand'),
    A('pipette', 'PIPETTE', 'Suck the solution up by mouth', 'MOUTH', 0, 'danger'),
    A('flask2', 'FILL', 'Add distilled water until close to the mark', '', 0, 'brand'),
    A('flask2', 'DROP', 'Add 5 drops with the dropper', '', 5),
    A('flask2', 'DROP', 'Add 1 drop', '', 1),
    A('flask2', 'EYE', 'Check the meniscus at eye level'),
    A('flask2', 'MIX', 'Stopper and invert 10 times', '', 10),
    A('flask2', 'RESTART', 'Overshot? Wash out the second flask and start the dilution again', 'DILUTE', 0, 'danger'),
  ],
  LECHAT: [
    A('stock', 'STOCK', 'Mix a few drops of FeCl₃ and KSCN with 20 cm³ of water (pale red)', 'DILUTE', 0, 'brand'),
    A('stock', 'STOCK', 'Mix FeCl₃ and KSCN without water', 'CONC', 0, 'danger'),
    A('rack', 'TUBE', 'Pour some of the Fe³⁺/SCN⁻ mixture into a clean tube', 'FESCN', 0, 'brand'),
    A('rack', 'TUBE', 'Pour 2 cm³ of potassium chromate(VI) into a clean tube', 'CHROMATE'),
    A('reagent:FECL3', 'ADD', 'Add a few drops of FeCl₃ (tube in use)', 'FECL3', 0, 'brand', true),
    A('reagent:KSCN', 'ADD', 'Add a few drops of KSCN (tube in use)', 'KSCN', 0, 'brand', true),
    A('reagent:NH4CL', 'ADD', 'Add a spatula of solid NH₄Cl (tube in use)', 'NH4CL', 0, 'brand', true),
    A('reagent:HCL', 'ADD', 'Add dilute HCl (tube in use)', 'HCL', 0, 'brand', true),
    A('reagent:NAOH', 'ADD', 'Add dilute NaOH (tube in use)', 'NAOH', 0, 'brand', true),
    A('reagent:WATER', 'ADD', 'Add an equal volume of water (tube in use)', 'WATER', 0, undefined, true),
    A('hot', 'BATH', 'Stand the tube in use in the hot water for 1 minute', 'HOT', 0, 'brand', true),
    A('ice', 'BATH', 'Stand the tube in use in the iced water for 1 minute', 'ICE', 0, 'brand', true),
    A('tube', 'SHAKE', 'Shake gently to mix', '', 0, undefined, true),
  ],
  DISTIL: [
    A('funnel', 'FILTER', 'Filter the sea water to remove sand', '', 0, 'brand'),
    A('balance', 'WEIGH_DISH', 'Weigh the evaporating dish', '', 0, 'brand'),
    A('dish', 'MEASURE', 'Pipette 50.0 cm³ of the filtrate into the dish', '', 0, 'brand'),
    A('dish', 'HEAT_DISH', 'Heat over the flame 1 min', '', 60, 'brand'),
    A('dish', 'HEAT_DISH', 'Heat over the flame 5 min', '', 300),
    A('dish', 'BATH_DISH', 'Finish on the water bath 1 min', '', 60, 'brand'),
    A('dish', 'BATH_DISH', 'On the water bath 5 min', '', 300),
    A('dish', 'COOL', 'Let the dish cool'),
    A('dflask', 'FILL_FLASK', 'Half fill the flask with sea water (100 cm³)', '', 0, 'brand'),
    A('dflask', 'CHIPS', 'Add anti-bumping granules'),
    A('thermometer', 'THERMO', 'Bulb level with the side arm', 'SIDEARM', 0, 'brand'),
    A('thermometer', 'THERMO', 'Bulb in the boiling liquid', 'LIQUID', 0, 'danger'),
    A('thermometer', 'THERMO', 'Bulb high in the neck, above the side arm', 'TOP', 0, 'danger'),
    A('condenser', 'CONDENSER', 'Water in at the bottom, out at the top', 'BOTTOM', 0, 'brand'),
    A('condenser', 'CONDENSER', 'Water in at the top, out at the bottom', 'TOP', 0, 'danger'),
    A('condenser', 'WATER_ON', 'Turn on the condenser water'),
    A('receiver', 'RECEIVER', 'Leave the receiver open to the air', 'OPEN', 0, 'brand'),
    A('receiver', 'RECEIVER', 'Fit a bung tightly in the receiver', 'STOPPERED', 0, 'danger'),
    A('dflask', 'HEAT', 'Heat gently 1 min', '', 60, 'brand'),
    A('dflask', 'STOP', 'Turn off the heat'),
    A('receiver', 'TEST_DIST', 'Evaporate a few drops of distillate on a watch glass', 'EVAP', 0, 'brand'),
    A('receiver', 'TEST_DIST', 'Find the boiling point of the distillate', 'BP'),
    A('receiver', 'TEST_DIST', 'Add silver nitrate solution to some distillate', 'AGNO3'),
  ],
  HALOGEN: [
    A('halide:KCL', 'TUBE', '2 cm³ of KCl solution into a clean tube', 'KCL', 0, 'brand'),
    A('halide:KBR', 'TUBE', '2 cm³ of KBr solution into a clean tube', 'KBR', 0, 'brand'),
    A('halide:KI', 'TUBE', '2 cm³ of KI solution into a clean tube', 'KI', 0, 'brand'),
    A('halide:WATER', 'TUBE', '2 cm³ of distilled water (a control)', 'WATER'),
    A('reagent:CL2', 'ADD', 'Add a few drops of fresh chlorine water (tube in use)', 'CL2', 0, 'brand', true),
    A('reagent:CL2OLD', 'ADD', 'Add a few drops of the old chlorine water (tube in use)', 'CL2OLD', 0, 'danger', true),
    A('reagent:BR2', 'ADD', 'Add a few drops of bromine water (tube in use)', 'BR2', 0, 'brand', true),
    A('reagent:I2', 'ADD', 'Add a few drops of iodine solution (tube in use)', 'I2', 0, 'brand', true),
    A('reagent:HEXANE', 'ADD', 'Add 1 cm³ of hexane (tube in use)', 'HEXANE', 0, 'brand', true),
    A('reagent:STARCH', 'ADD', 'Add 2 drops of starch solution (tube in use)', 'STARCH', 0, undefined, true),
    A('tube', 'SHAKE', 'Stopper with your thumb-stall and shake', '', 0, 'brand', true),
  ],
  AMMONIA: [
    A('balance', 'WEIGH_NH4CL', 'Weigh about 5 g of NH₄Cl', '', 0, 'brand'),
    A('balance', 'WEIGH_CAOH2', 'Weigh about 4 g of Ca(OH)₂', '', 0, 'brand'),
    A('mortar', 'MIXSOLID', 'Mix the two solids well', '', 0, 'brand'),
    A('gtube', 'LOAD', 'Put the mixture into the hard-glass tube', '', 0, 'brand'),
    A('gtube', 'CLAMP', 'Clamp it with the mouth sloping slightly down', 'DOWN', 0, 'brand'),
    A('gtube', 'CLAMP', 'Clamp it with the mouth pointing up', 'UP', 0, 'danger'),
    A('dryer', 'DRYER', 'Drying tower of quicklime (CaO)', 'CAO', 0, 'brand'),
    A('dryer', 'DRYER', 'Wash bottle of conc. H₂SO₄', 'H2SO4', 0, 'danger'),
    A('dryer', 'DRYER', 'U-tube of anhydrous CaCl₂', 'CACL2', 0, 'danger'),
    A('jar', 'COLLECT', 'Inverted dry gas jar: upward delivery', 'UPWARD', 0, 'brand'),
    A('jar', 'COLLECT', 'Upright gas jar: downward delivery', 'DOWNWARD', 0, 'danger'),
    A('jar', 'COLLECT', 'Collect over water in a trough', 'WATER', 0, 'danger'),
    A('gtube', 'HEAT_GAS', 'Heat the mixture gently 1 min', '', 60, 'brand'),
    A('jar', 'WAFT', 'Waft the gas towards your nose'),
    A('jar', 'LITMUS', 'Hold damp red litmus paper at the mouth of the jar', 'DAMP', 0, 'brand'),
    A('jar', 'LITMUS', 'Hold dry red litmus paper at the mouth', 'DRY'),
    A('jar', 'HCL_ROD', 'Hold a rod dipped in conc. HCl at the mouth', '', 0, 'brand'),
    A('trough', 'FOUNTAIN', 'Fountain: invert the flask of dry ammonia over water with phenolphthalein, squeeze in a drop', '', 0, 'brand'),
  ],
};

/** Why an action cannot be done now (undefined: it can). Mistakes are allowed; only impossible steps are blocked. */
export function prepBlocked(v: ChemPrepVariant, events: PrepEvent[], d: PrepActionDef, tube = -1): string | undefined {
  const task = v.task;
  if (task === 'STANDARD') {
    const r = stdRun(v, events);
    const flask = d.obj === 'flask2' ? r.f2 : r.f1;
    switch (d.a) {
      case 'SCOOP':
      case 'UNSCOOP':
        return r.tipped ? 'The solid is already tipped out.' : d.a === 'UNSCOOP' && r.inBottle <= 0 ? 'The bottle is empty.' : undefined;
      case 'WEIGH1':
        return r.tipped ? 'Already tipped out: reweigh the bottle instead.' : r.inBottle <= 0 ? 'Put some Na₂CO₃ in the weighing bottle first.' : undefined;
      case 'TIP':
        return r.tipped ? 'Done.' : r.inBottle <= 0 ? 'The bottle is empty.' : r.m1 === null ? 'Weigh the bottle and solid first.' : undefined;
      case 'WEIGH2':
        return !r.tipped ? 'Tip the solid out first.' : undefined;
      case 'WATER100':
        return !r.tipped ? 'Tip the solid in first.' : r.water ? 'Done.' : undefined;
      case 'STIR':
        return !r.water ? 'Add the water first.' : r.dissolved ? 'It has dissolved.' : undefined;
      case 'POUR':
        return r.where !== 'BEAKER' ? 'The solid is not in the beaker.' : !r.dissolved ? 'Stir until all the solid dissolves.' : r.poured ? 'Done.' : undefined;
      case 'RINSE':
        return !r.poured ? 'Pour the solution into the flask first.' : r.f1.filled ? 'The flask is being made up now.' : r.f1.vol > 230 ? 'The flask is nearly full.' : undefined;
      case 'FILL':
      case 'DROP':
      case 'EYE':
      case 'MIX':
        if (d.obj === 'flask' && r.pipetted) return 'The first flask is finished.';
        if (d.obj === 'flask2' && !r.pipetted) return 'Pipette 25.0 cm³ into this flask first.';
        if (!flask.started) return 'The flask is empty.';
        if (d.a !== 'FILL' && !flask.filled) return 'Fill it close to the mark with the wash bottle first.';
        return undefined;
      case 'RESTART':
        return d.x === 'DILUTE' ? (!r.pipetted ? 'Nothing to start again.' : undefined) : undefined;
      case 'PIP_RINSE':
        return r.pipetted ? 'Done.' : undefined;
      case 'PIPETTE':
        return r.pipetted ? 'Done.' : !r.f1.filled ? 'Make up the standard solution first.' : undefined;
    }
    return undefined;
  }
  if (task === 'LECHAT' || task === 'HALOGEN') {
    const tubes = prepTubes(task, events);
    const t = tubes[tube];
    if (d.a === 'STOCK') return undefined;
    if (d.a === 'TUBE') return tubes.length >= 20 ? 'The rack is full.' : task === 'LECHAT' && d.x === 'FESCN' && !events.some((e) => e.a === 'STOCK') ? 'Make the pale-red Fe³⁺/SCN⁻ mixture first.' : undefined;
    if (!t) return 'Take a clean tube first.';
    if (task === 'LECHAT') {
      if (d.a === 'ADD') {
        const forFe = ['FECL3', 'KSCN', 'NH4CL', 'WATER'].includes(d.x ?? '');
        if (t.sys === 'FESCN' && !forFe) return 'That reagent is for the chromate tube.';
        if (t.sys === 'CHROMATE' && forFe && d.x !== 'WATER') return 'That reagent is for the Fe³⁺/SCN⁻ tubes.';
        return t.adds.length >= 8 ? 'The tube is full.' : undefined;
      }
      if (d.a === 'BATH') return t.sys !== 'FESCN' ? 'Use an Fe³⁺/SCN⁻ tube for the temperature test.' : undefined;
      return undefined;
    }
    if (d.a === 'ADD') {
      const hal = ['CL2', 'CL2OLD', 'BR2', 'I2'].includes(d.x ?? '');
      if (hal && t.hal) return 'This tube already has its halogen: use a clean tube.';
      if (d.x === 'HEXANE' && t.adds.includes('HEXANE')) return 'Done.';
      if (d.x === 'HEXANE' && !t.hal) return 'Add the halogen water first.';
      return t.adds.length >= 8 ? 'The tube is full.' : undefined;
    }
    return undefined;
  }
  if (task === 'DISTIL') {
    const r = dsRun(v, events);
    switch (d.a) {
      case 'FILTER':
        return r.filtered ? 'Done.' : undefined;
      case 'WEIGH_DISH':
        return r.measured && r.hot ? undefined : undefined;
      case 'MEASURE':
        return r.dishEmpty === null ? 'Weigh the empty dish first.' : r.measured ? 'Done.' : undefined;
      case 'HEAT_DISH':
      case 'BATH_DISH':
      case 'COOL':
        return !r.measured ? 'Put the sea water in the dish first.' : undefined;
      case 'FILL_FLASK':
        return r.filled ? 'Done.' : undefined;
      case 'HEAT':
        return !r.filled ? 'Put the sea water in the flask first.' : r.boiledDry ? 'The flask has nearly boiled dry.' : !r.thermo || !r.condenser ? 'Fit the thermometer and connect the condenser first.' : undefined;
      case 'STOP':
        return !r.heating ? 'The heat is off.' : undefined;
      case 'TEST_DIST':
        return r.distillate < 2 ? 'Collect some distillate first.' : r.tests.includes(d.x ?? '') ? 'Done.' : undefined;
    }
    return undefined;
  }
  const r = amRun(v, events);
  switch (d.a) {
    case 'WEIGH_NH4CL':
      return r.nh4 !== null ? 'Done.' : undefined;
    case 'WEIGH_CAOH2':
      return r.ca !== null ? 'Done.' : undefined;
    case 'MIXSOLID':
      return r.nh4 === null || r.ca === null ? 'Weigh both solids first.' : r.mixed ? 'Done.' : undefined;
    case 'LOAD':
      return !r.mixed ? 'Mix the solids first.' : r.loaded ? 'Done.' : undefined;
    case 'CLAMP':
    case 'DRYER':
    case 'COLLECT':
      return r.heatSec ? 'The apparatus is already set up and heating.' : undefined;
    case 'HEAT_GAS':
      return !r.loaded ? 'Put the mixture in the tube first.' : !r.clamp ? 'Clamp the tube first.' : !r.collect ? 'Set up the gas jar first.' : r.cracked ? 'The tube has cracked.' : undefined;
    case 'FOUNTAIN':
      return r.fountain !== null ? 'Done.' : r.jar <= 0 ? 'Collect the ammonia first.' : undefined;
  }
  return undefined;
}
