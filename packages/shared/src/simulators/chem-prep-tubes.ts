import { PREP_STAY, prepKeyOf, prepNotReady, prepP, prepPn, type ChemPrepVariant, type PrepEvent, type PrepItem, type PrepKey, type PrepPart, type PrepTask } from './chem-prep-data';

/**
 * The tube tasks. LECHAT: Fe³⁺ + SCN⁻ ⇌ FeSCN²⁺ (Kc ≈ 140 at 25 °C, ΔH ≈
 * −30 kJ mol⁻¹, so Kc ≈ 28 at 70 °C and ≈ 390 in ice) solved exactly for each
 * tube, with Cl⁻ from NH₄Cl tying up Fe³⁺ as FeCl²⁺; 2CrO₄²⁻ + 2H⁺ ⇌
 * Cr₂O₇²⁻ + H₂O follows the acid or alkali last in excess. HALOGEN: a
 * halogen displaces a halide below it in the group (Cl₂ > Br₂ > I₂); the free
 * halogen colours water and, more strongly, the hexane layer.
 */

export interface PrepTube {
  /** FESCN / CHROMATE (LECHAT); KCL / KBR / KI / WATER (HALOGEN: the halide in the tube). */
  sys: PrepItem;
  /** LECHAT: the stock the FeSCN tube was poured from (DILUTE / CONC). */
  stock: PrepItem;
  adds: PrepItem[];
  temp: 'ROOM' | 'HOT' | 'ICE';
  /** Seconds in the hot or iced water. */
  sec: number;
  shaken: boolean;
  /** HALOGEN: hexane added and shaken after it went in. */
  hexShaken: boolean;
  /** HALOGEN: the halogen water added. */
  hal: PrepItem | null;
}

export function prepTubes(task: PrepTask, events: PrepEvent[]): PrepTube[] {
  const out: PrepTube[] = [];
  let stock: PrepItem = '';
  for (const e of events) {
    if (e.a === 'STOCK') stock = e.x;
    else if (e.a === 'TUBE') out.push({ sys: e.x, stock: task === 'LECHAT' && e.x === 'FESCN' ? stock : '', adds: [], temp: 'ROOM', sec: 0, shaken: false, hexShaken: false, hal: null });
    else {
      const t = out[e.n];
      if (!t) continue;
      if (e.a === 'ADD' && t.adds.length < 8) {
        t.adds.push(e.x);
        if (['CL2', 'CL2OLD', 'BR2', 'I2'].includes(e.x) && !t.hal) t.hal = e.x;
        if (e.x === 'HEXANE') t.hexShaken = false;
      } else if (e.a === 'BATH' && (e.x === 'HOT' || e.x === 'ICE')) {
        if (t.temp !== e.x) t.sec = 0;
        t.temp = e.x;
        t.sec = Math.min(900, t.sec + 60);
      } else if (e.a === 'SHAKE') {
        t.shaken = true;
        if (t.adds.includes('HEXANE')) t.hexShaken = true;
      }
    }
  }
  return out;
}

export const prepMixHex = (a: string, b: string, f: number) => {
  const p = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const x = p(a);
  const y = p(b);
  const g = Math.max(0, Math.min(1, f));
  return `#${x.map((c, k) => Math.round(c + (y[k]! - c) * g).toString(16).padStart(2, '0')).join('')}`;
};

// ------------------------------------------------------------------ LECHAT

const T_ROOM = 301;
const TB = { HOT: 343, ICE: 275 } as const;
/** Kc of Fe³⁺ + SCN⁻ ⇌ FeSCN²⁺ at T (van 't Hoff, ΔH = −30 kJ mol⁻¹). */
export const fescnK = (T: number) => 140 * Math.exp(3608 * (1 / T - 1 / 298));
export const tubeKelvin = (t: Pick<PrepTube, 'temp' | 'sec'>) => (t.temp === 'ROOM' ? T_ROOM : TB[t.temp] + (T_ROOM - TB[t.temp]) * Math.exp(-t.sec / 45));
/** Equilibrium [FeSCN²⁺] and the colour intensity (0 pale … 1 blood-red). */
export function fescnEq(t: Pick<PrepTube, 'stock' | 'adds' | 'temp' | 'sec'>): { x: number; I: number } {
  const big = t.stock === 'CONC' ? 25 : 1;
  let F = 1.0e-3 * big;
  let S = 1.0e-3 * big;
  let cl = 3 * F;
  for (const a of t.adds) {
    if (a === 'FECL3') (F += 2.0e-3 * big), (cl += 6.0e-3 * big);
    else if (a === 'KSCN') S += 2.0e-3 * big;
    else if (a === 'NH4CL') cl += 0.5;
    else if (a === 'WATER') (F /= 2), (S /= 2), (cl /= 2);
  }
  const K = fescnK(tubeKelvin(t)) / (1 + 1.2 * cl);
  const b = K * (F + S) + 1;
  const x = (b - Math.sqrt(Math.max(0, b * b - 4 * K * K * F * S))) / (2 * K);
  return { x, I: 1 - Math.exp(-x / 2.2e-4) };
}
const FE_PALE = '#f1dfae';
const FE_RED = '#8a0f14';
const CHROMATE_YELLOW = '#f0cf2a';
const DICHROMATE_ORANGE = '#e8711a';

const isControl = (t: PrepTube) => t.sys === 'FESCN' && !t.adds.length && t.temp === 'ROOM';
/** LECHAT tube kinds the practical needs. */
export const LC_KINDS = ['CONTROL', 'FECL3', 'KSCN', 'NH4CL', 'HOT', 'ICE', 'CHROMATE'] as const;
export type LcKind = (typeof LC_KINDS)[number];
export const LC_KIND_LABEL: Record<LcKind, string> = { CONTROL: 'the control tube', FECL3: 'more FeCl₃', KSCN: 'more KSCN', NH4CL: 'solid NH₄Cl', HOT: 'the tube in hot water', ICE: 'the tube in iced water', CHROMATE: 'chromate with acid, then alkali' };
export function lcKind(t: PrepTube): LcKind | null {
  if (t.sys === 'CHROMATE') return t.adds.includes('HCL') && t.adds.lastIndexOf('NAOH') > t.adds.indexOf('HCL') ? 'CHROMATE' : null;
  if (t.sys !== 'FESCN') return null;
  if (!t.adds.length) return t.temp === 'ROOM' ? 'CONTROL' : t.temp;
  if (t.adds.length === 1 && t.temp === 'ROOM' && (t.adds[0] === 'FECL3' || t.adds[0] === 'KSCN' || t.adds[0] === 'NH4CL')) return t.adds[0];
  return null;
}
const chromateNet = (adds: PrepItem[]) => adds.reduce((u, a) => (a === 'HCL' ? Math.max(1, u + 1) : a === 'NAOH' ? Math.min(-1, u - 1) : u), 0);

function lcCompare(tubes: PrepTube[], i: number) {
  const t = tubes[i]!;
  const ctl = tubes.find((x) => isControl(x) && x.stock === t.stock) ?? { stock: t.stock, adds: [], temp: 'ROOM' as const, sec: 0 };
  const me = fescnEq(t);
  const c = fescnEq(ctl);
  const d = me.I - c.I;
  return { me, ctl: c, d, visible: Math.abs(d) > 0.05, hasControl: tubes.some((x) => isControl(x) && x.stock === t.stock) };
}

// ------------------------------------------------------------------ HALOGEN

const RANK: Partial<Record<PrepItem, number>> = { CL2: 3, CL2OLD: 3, BR2: 2, I2: 1, KCL: 3, KBR: 2, KI: 1, WATER: 0 };
export const HL_KINDS = ['CL2-KBR', 'CL2-KI', 'BR2-KCL', 'BR2-KI', 'I2-KCL', 'I2-KBR'] as const;
export type HlKind = (typeof HL_KINDS)[number];
export function hlKind(t: PrepTube): HlKind | null {
  if (!t.hal) return null;
  const k = `${t.hal === 'CL2OLD' ? 'CL2' : t.hal}-${t.sys}`;
  return (HL_KINDS as readonly string[]).includes(k) ? (k as HlKind) : null;
}
export function hlResult(t: PrepTube): { react: boolean; free: 'CL2' | 'BR2' | 'I2' | null; strength: number } {
  if (!t.hal) return { react: false, free: null, strength: 0 };
  const strength = t.hal === 'CL2OLD' ? 0.12 : 1;
  const react = t.sys !== 'WATER' && (RANK[t.hal] ?? 0) > (RANK[t.sys] ?? 9);
  const free = react ? (t.sys === 'KBR' ? 'BR2' : 'I2') : t.hal === 'CL2OLD' ? 'CL2' : (t.hal as 'CL2' | 'BR2' | 'I2');
  return { react, free, strength };
}
const AQ: Record<'CL2' | 'BR2' | 'I2', string> = { CL2: '#e9efc8', BR2: '#e39a35', I2: '#7d3f14' };
const ORG: Record<'CL2' | 'BR2' | 'I2', string> = { CL2: '#f1f3e2', BR2: '#d4471a', I2: '#7b2e8e' };
const WATERHEX = '#e8f0f6';
const HEXANE = '#f3f5f6';
const HAL_NAME: Record<string, string> = { CL2: 'chlorine water', CL2OLD: 'old chlorine water', BR2: 'bromine water', I2: 'iodine solution' };

// ------------------------------------------------------------------ shared outcome

export interface PrepTubeVisual {
  liquid: string;
  layer: string | null;
  label: string;
}

export function prepTubeVisual(task: PrepTask, events: PrepEvent[], i: number): PrepTubeVisual {
  const tubes = prepTubes(task, events);
  const t = tubes[i];
  if (!t) return { liquid: WATERHEX, layer: null, label: '' };
  if (task === 'LECHAT') {
    if (t.sys === 'CHROMATE') {
      const net = chromateNet(t.adds);
      return { liquid: net > 0 ? DICHROMATE_ORANGE : CHROMATE_YELLOW, layer: null, label: net > 0 ? 'orange' : 'yellow' };
    }
    const { I } = fescnEq(t);
    return { liquid: prepMixHex(FE_PALE, FE_RED, I), layer: null, label: I > 0.85 ? 'deep blood-red' : I > 0.45 ? 'red' : 'pale red' };
  }
  const r = hlResult(t);
  const hex = t.adds.includes('HEXANE');
  let liquid = r.free ? prepMixHex(WATERHEX, AQ[r.free], r.strength * (r.free === 'CL2' ? 1 : 0.85)) : WATERHEX;
  let layer: string | null = hex ? HEXANE : null;
  if (hex && t.hexShaken && r.free) {
    layer = prepMixHex(HEXANE, ORG[r.free], Math.min(1, r.strength * 1.4));
    liquid = prepMixHex(liquid, WATERHEX, 0.6);
  }
  if (t.adds.includes('STARCH') && r.free === 'I2') liquid = prepMixHex(WATERHEX, '#1c1d44', Math.min(1, 0.3 + r.strength));
  return { liquid, layer, label: '' };
}

/** What a tube shows (the observation the student should write). */
export function prepTubeParts(v: ChemPrepVariant, events: PrepEvent[], i: number): PrepPart[] {
  const task = v.task;
  const tubes = prepTubes(task, events);
  const t = tubes[i];
  if (!t) return [];
  if (task === 'LECHAT') {
    if (t.sys === 'CHROMATE') {
      const acid = t.adds.indexOf('HCL');
      const alk = t.adds.lastIndexOf('NAOH');
      if (acid < 0 && alk < 0) return [prepP('a yellow solution (chromate)', ['yellow'])];
      if (acid < 0) return [prepPn('the yellow solution stays yellow with alkali', ['orange'], ['yellow'])];
      const out = [prepPn('the yellow solution turns orange on adding acid', ['stays yellow', 'remains yellow'], ['orange'])];
      if (alk > acid) out.push(prepP('it turns yellow again on adding alkali', ['yellow']));
      return out;
    }
    if (t.sys !== 'FESCN') return [];
    if (t.temp !== 'ROOM' && t.sec < 60) return [prepP(`not yet at the temperature of the ${t.temp === 'HOT' ? 'hot' : 'iced'} water: leave it a minute`, ['not yet'])];
    if (isControl(t)) return [prepP(t.stock === 'CONC' ? 'a deep blood-red solution (the control)' : 'a pale red (orange-red) solution: the control', ['red', 'orange'])];
    const c = lcCompare(tubes, i);
    if (!c.visible) return [prepP(t.stock === 'CONC' ? 'no visible difference: both tubes are deep blood-red' : 'no visible change: the same red as the control', ['no visible', 'no change', 'same', 'unchanged', 'no difference', 'remain'])];
    return c.d > 0
      ? [prepPn('the red colour deepens (darker red than the control)', ['paler', 'lighter', 'fades'], ['deep', 'dark', 'intense', 'more red', 'redder', 'blood'])]
      : [prepPn('the red colour becomes paler (lighter) than the control', ['deeper', 'darker', 'more intense'], ['pale', 'light', 'fade', 'less red', 'less intense'])];
  }
  // HALOGEN
  if (!t.hal) return [prepP(`a colourless ${t.sys === 'WATER' ? 'water' : 'solution'}`, ['colourless', 'colorless'])];
  const r = hlResult(t);
  const out: PrepPart[] = [];
  if (t.sys === 'WATER') out.push(prepP(`the ${r.free === 'BR2' ? 'orange (yellow-brown)' : r.free === 'I2' ? 'brown' : 'very pale yellow-green'} colour of the ${HAL_NAME[t.hal]} (the control)`, r.free === 'BR2' ? ['orange', 'yellow'] : r.free === 'I2' ? ['brown'] : ['pale', 'green', 'yellow', 'colourless']));
  else if (r.react && r.strength < 0.5) out.push(prepPn('the solution turns only a very pale yellow (the old chlorine water is weak)', [], ['pale', 'faint', 'slight', 'little']));
  else if (r.react) out.push(r.free === 'BR2' ? prepPn('the colourless solution turns yellow-orange', PREP_STAY, ['yellow', 'orange']) : prepPn('the colourless solution turns brown', PREP_STAY, ['brown', 'dark']));
  else if (t.hal === 'CL2' || t.hal === 'CL2OLD') out.push(prepP('no change: it stays almost colourless', [...PREP_STAY, 'no reaction', 'colourless']));
  else out.push(prepPn(`the ${t.hal === 'BR2' ? 'orange (yellow)' : 'brown'} colour of the ${HAL_NAME[t.hal]} remains: no reaction`, ['turns brown', 'turned brown', 'turns violet'], t.hal === 'BR2' ? ['orange', 'yellow'] : ['brown', 'yellow'], [...PREP_STAY, 'no reaction', 'no displacement']));
  if (t.adds.includes('HEXANE') && t.hexShaken && r.free) {
    const LAYER = ['upper', 'top', 'hexane', 'organic', 'layer'];
    if (r.free === 'BR2') out.push(prepP('the upper (hexane) layer is orange-red', ['orange', 'red'], LAYER));
    else if (r.free === 'I2') out.push(prepP('the upper (hexane) layer is violet (purple)', ['violet', 'purple', 'pink', 'mauve'], LAYER));
    else out.push(prepP('the hexane layer stays almost colourless', ['colourless', 'colorless', 'pale']));
  }
  if (t.adds.includes('STARCH') && r.free === 'I2') out.push(prepP('starch gives a blue-black colour', ['blue']));
  return out;
}

/** What a tube's inference must say. */
export function prepTubeKey(v: ChemPrepVariant, events: PrepEvent[], i: number): PrepKey | null {
  const tubes = prepTubes(v.task, events);
  const t = tubes[i];
  if (!t) return null;
  if (v.task === 'LECHAT') {
    if (t.sys === 'CHROMATE') {
      const acid = t.adds.indexOf('HCL');
      if (acid < 0) return prepNotReady('add dilute acid to the chromate first');
      return t.adds.lastIndexOf('NAOH') > acid ? prepKeyOf(['RIGHT', 'LEFT']) : prepKeyOf(['RIGHT']);
    }
    if (t.temp !== 'ROOM' && t.sec < 60) return prepNotReady('the tube had not reached the bath temperature');
    if (isControl(t)) return prepKeyOf(['NO_SHIFT']);
    const c = lcCompare(tubes, i);
    if (!c.visible) return t.stock === 'CONC' ? prepNotReady('the stock was too concentrated: no change can be seen, so nothing can be inferred') : prepKeyOf(['NO_SHIFT']);
    if (t.temp === 'HOT' && !t.adds.length) return prepKeyOf(['LEFT', 'EXOTHERMIC']);
    if (t.temp === 'ICE' && !t.adds.length) return prepKeyOf(['RIGHT'], ['EXOTHERMIC']);
    return prepKeyOf([c.d > 0 ? 'RIGHT' : 'LEFT']);
  }
  if (!t.hal) return prepNotReady('no halogen added');
  const r = hlResult(t);
  if (t.sys === 'WATER') return prepKeyOf([], ['NO_REACTION']);
  if (r.react) return prepKeyOf([r.free === 'BR2' ? 'BR2_FORMED' : 'I2_FORMED']);
  return prepKeyOf(['NO_REACTION']);
}

/** For each tube the practical needs, the tubes that are that kind. */
export function prepRequiredTubes(v: ChemPrepVariant, events: PrepEvent[]): { kind: string; label: string; tubes: number[] }[] {
  const tubes = prepTubes(v.task, events);
  if (v.task === 'LECHAT') return LC_KINDS.map((k) => ({ kind: k, label: LC_KIND_LABEL[k], tubes: tubes.map((t, i) => (lcKind(t) === k ? i : -1)).filter((i) => i >= 0) }));
  if (v.task === 'HALOGEN') return HL_KINDS.map((k) => ({ kind: k, label: k.replace('-', ' with ').replace('CL2', 'Cl₂').replace('BR2', 'Br₂').replace('I2', 'I₂').replace('KBR', 'KBr').replace('KCL', 'KCl'), tubes: tubes.map((t, i) => (hlKind(t) === k ? i : -1)).filter((i) => i >= 0) }));
  return [];
}

export function prepTubeText(task: PrepTask, t: PrepTube): string {
  const n: Record<string, string> = { FECL3: 'more FeCl₃', KSCN: 'more KSCN', NH4CL: 'solid NH₄Cl', WATER: 'water', HCL: 'dilute HCl', NAOH: 'dilute NaOH', CL2: 'chlorine water', CL2OLD: 'old chlorine water', BR2: 'bromine water', I2: 'iodine solution', HEXANE: 'hexane', STARCH: 'starch' };
  if (task === 'LECHAT') {
    const base = t.sys === 'CHROMATE' ? 'K₂CrO₄(aq)' : `Fe³⁺/SCN⁻ mixture${t.stock === 'CONC' ? ' (undiluted)' : ''}`;
    const adds = t.adds.map((a) => n[a] ?? a).join(', then ');
    const temp = t.temp === 'ROOM' ? '' : ` in ${t.temp === 'HOT' ? 'hot' : 'iced'} water ${Math.round(t.sec / 60)} min`;
    return `${base}${adds ? ` + ${adds}` : t.sys === 'FESCN' && t.temp === 'ROOM' ? ' (control)' : ''}${temp}`;
  }
  const salt = t.sys === 'WATER' ? 'water (control)' : t.sys === 'KCL' ? 'KCl(aq)' : t.sys === 'KBR' ? 'KBr(aq)' : 'KI(aq)';
  return `${salt}${t.adds.length ? ` + ${t.adds.map((a) => n[a] ?? a).join(', ')}` : ''}${t.adds.includes('HEXANE') ? (t.hexShaken ? ', shaken' : ' (not shaken)') : ''}`;
}
