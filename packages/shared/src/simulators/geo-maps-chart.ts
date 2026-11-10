import { labPick, labRandom, roundDp } from './seeded';
import {
  GEO_TASK_TITLE,
  clock24,
  pinNear,
  pinsOf,
  type GeoBuild,
  type GeoChart,
  type GeoField,
  type GeoMapsState,
  type GeoSeriesDef,
  type GeoStep,
  type GeoTask,
  type GeoTaskDef,
} from './geo-maps-data';
import { ansStep, bld, checkStep, cho, fld, pinStep, recStep } from './geo-maps-map';
import { dist, inPolygon, nearestOnLine, smoothLine, type P } from './geo-maps-sheet';

/** The eight statistical-diagram tasks: data from the seed, the true answers, the mark scheme and the model way of doing each. */

export interface GeoTable {
  title: string;
  head: string[];
  rows: (string | number)[][];
}
export interface GeoRegion {
  id: string;
  name: string;
  poly: P[];
  pop: number;
  area: number;
  /** Uninhabited swamp or forest inside the region. */
  empty: P[];
}
export interface GeoOutline {
  regions: GeoRegion[];
  dotValue: number;
  dotRegions: string[];
  classes: { lo: number; hi: number; label: string }[];
  stations: { id: string; p: P; v: number }[];
  pairs: { a: string; b: string; value: number; at: P }[];
}
export interface GeoFlow {
  hub: P;
  hubName: string;
  routes: { id: string; name: string; pts: P[]; value: number; dir: 'IN' | 'OUT' }[];
  mmPer: number;
  process: { title: string; items: string[]; shuffled: string[] };
}
export interface GeoPie {
  items: { id: string; label: string; value: number; angle: number }[];
  placeA: { name: string; value: number };
  placeB: { name: string; value: number };
  radiusB: number;
  radiusA: number;
}
export interface GeoGlobe {
  places: { id: string; name: string; lat: number; lon: number }[];
}
export interface GeoChartExtras {
  charts: GeoChart[];
  tables: GeoTable[];
  pie: GeoPie | null;
  outline: GeoOutline | null;
  flow: GeoFlow | null;
  globe: GeoGlobe | null;
}
export const NO_CHART_EXTRAS: GeoChartExtras = { charts: [], tables: [], pie: null, outline: null, flow: null, globe: null };

// ------------------------------------------------------------------ plotting helpers

export const seriesKey = (c: GeoChart, ser: GeoSeriesDef) => `${c.id}.${ser.id}`;
export const axisKey = (c: GeoChart, a: 'a' | 'b', end: 'max' | 'min') => `ax:${c.id}:${a}:${end}`;
const axisDef = (c: GeoChart, a: 'a' | 'b') => (a === 'a' ? c.axisA : c.axisB!);
const dataMax = (c: GeoChart, a: 'a' | 'b') => {
  const ss = c.series.filter((x) => x.axis === a);
  if (ss.some((x) => x.mark === 'stack')) return Math.max(...c.cats.map((_, i) => ss.reduce((t, x) => t + x.target[i]!, 0)));
  return Math.max(...ss.flatMap((x) => x.target));
};
/** A value axis is good when it starts at zero, reaches the data and uses most of the paper. */
export function axisOk(s: GeoMapsState, c: GeoChart, a: 'a' | 'b') {
  const max = Number(s.sets[axisKey(c, a, 'max')] ?? 0);
  const min = Number(s.sets[axisKey(c, a, 'min')] ?? -1);
  const m = dataMax(c, a);
  return min === 0 && max >= m && max <= m * 2.2;
}
export function seriesScore(s: GeoMapsState, c: GeoChart, ser: GeoSeriesDef) {
  const got = s.series[seriesKey(c, ser)] ?? [];
  const tol = axisDef(c, ser.axis).max / 40;
  return ser.target.filter((t, i) => got[i] !== undefined && Math.abs(got[i]! - t) <= tol).length / ser.target.length;
}
export const chartScore = (s: GeoMapsState, c: GeoChart, ids?: string[]) => {
  const ss = c.series.filter((x) => !ids || ids.includes(x.id));
  return ss.reduce((t, x) => t + seriesScore(s, c, x), 0) / ss.length;
};
function plotStep(c: GeoChart, id: string, label: string, why: string, say: string, ids?: string[]): GeoStep {
  const ss = c.series.filter((x) => !ids || ids.includes(x.id));
  const axes = [...new Set(ss.map((x) => x.axis))];
  return {
    id,
    label,
    why,
    say,
    panel: 'chart',
    done: (s) => axes.every((a) => axisOk(s, c, a)) && chartScore(s, c, ids) >= 0.99,
    apply: (s) => {
      for (const a of axes) {
        s.sets[axisKey(c, a, 'max')] = axisDef(c, a).max;
        s.sets[axisKey(c, a, 'min')] = 0;
      }
      for (const x of ss) s.series[seriesKey(c, x)] = [...x.target];
    },
  };
}
const niceMax = (m: number) => {
  const p = 10 ** Math.floor(Math.log10(m));
  for (const k of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= m * 1.02) return k * p;
  return 10 * p;
};
const thing = (id: string, label: string) => ({ id, label });
const shuffle = <T>(r: () => number, xs: readonly T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
const n0 = (x: number) => Math.round(x).toLocaleString('en-GB');
const STATE_NAMES = ['Ikarun', 'Tandari', 'Oyeba', 'Sabola', 'Gurama', 'Lokoja-Ewa', 'Marela', 'Umuoke', 'Zarani', 'Dagona'];
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ------------------------------------------------------------------ BARS

function taskBars(seed: number) {
  const r = labRandom(seed, 'geo-bars');
  const crop = labPick(r, ['Cocoa', 'Groundnut', 'Palm oil', 'Rubber']);
  const state = labPick(r, STATE_NAMES);
  const y0 = 2017 + Math.floor(r() * 3);
  const base = 200 + Math.round(r() * 8) * 10;
  const vals = Array.from({ length: 5 }, () => base + Math.round(r() * 10) * 10);
  const years = vals.map((_, i) => String(y0 + i));
  const sum = vals.reduce((t, x) => t + x, 0);
  const mean = sum / vals.length;
  const pct = ((vals[4]! - vals[0]!) / vals[0]!) * 100;
  const parts = ['Maize', 'Yam', 'Cassava'];
  const places = shuffle(r, STATE_NAMES).slice(0, 3);
  const comp = places.map(() => parts.map(() => 40 + Math.round(r() * 10) * 20));
  const line: GeoChart = { id: 'line', title: `${crop} output in ${state}`, cats: years, series: [{ id: 'out', label: `${crop} output`, colour: '#00695c', target: vals, axis: 'a', mark: 'line' }], axisA: { label: 'Output (thousand tonnes)', max: niceMax(Math.max(...vals)), step: 50 } };
  const stackTop = Math.max(...comp.map((c) => c.reduce((t, x) => t + x, 0)));
  const colours = ['#c9a227', '#2e7d32', '#6d4c41'];
  const bars: GeoChart = { id: 'comp', title: 'Food crops by state (thousand tonnes)', cats: places, series: parts.map((p, i) => ({ id: p.toLowerCase(), label: p, colour: colours[i]!, target: comp.map((c) => c[i]!), axis: 'a' as const, mark: 'stack' as const })), axisA: { label: 'Output (thousand tonnes)', max: niceMax(stackTop), step: 100 } };
  const compTotal = comp[0]!.reduce((t, x) => t + x, 0);
  const f1 = fld('sum', `Total ${crop.toLowerCase()} output over the ${vals.length} years`, 'readings', 2, sum, 0, { unit: 'thousand t', dp: 0, note: `Total = ${sum}.` });
  const f2 = fld('maxv', 'Highest output in one year', 'readings', 1, Math.max(...vals), 0, { unit: 'thousand t', dp: 0, note: `Highest = ${Math.max(...vals)}.` });
  const f3 = fld('comp0', `Total height of the ${places[0]} bar`, 'readings', 1, compTotal, 0, { unit: 'thousand t', dp: 0, note: `${comp[0]!.join(' + ')} = ${compTotal}.` });
  const f4 = fld('mean', 'Mean annual output', 'calculation', 2, mean, 0.15, { unit: 'thousand t', own: (g) => (g('sum') === null ? null : g('sum')! / vals.length), note: `Mean = total ÷ ${vals.length}.` });
  const f5 = fld('pct', `Percentage change ${years[0]} to ${years[4]}`, 'calculation', 2, pct, 0.3, { unit: '%', dp: 1, note: '(last − first) ÷ first × 100.' });
  const c1 = cho('form', 'Output year after year is a continuous series. It is best shown by', 'interpretation', 1, 'line', [['line', 'A line graph'], ['pie', 'A pie chart'], ['dot', 'A dot map']], 'Continuous time series: a line graph.');
  const c2 = cho('zero', 'The value axis of a bar graph must', 'interpretation', 1, 'zero', [['zero', 'start at zero'], ['low', 'start just below the smallest value'], ['any', 'start wherever fits best']], 'Bars above a false zero exaggerate differences.');
  const c3 = cho('compound', 'In a compound bar, each bar is', 'interpretation', 1, 'order', [['order', 'divided into the same parts, in the same order, with a key'], ['side', 'split into separate bars side by side'], ['joined', 'joined to the next one by a line']], 'Same parts, same order, with a key.');
  const builds: GeoBuild[] = [
    bld('axis', 1, (s) => (axisOk(s, line, 'a') && axisOk(s, bars, 'a') ? 1 : axisOk(s, line, 'a') || axisOk(s, bars, 'a') ? 0.5 : 0), 'Value axes start at zero and use most of the paper.'),
    bld('line', 1.5, (s) => chartScore(s, line), 'Plot each year at its value.'),
    bld('comp', 1.5, (s) => chartScore(s, bars), 'Divide each bar into its parts in the same order.'),
    bld('labels', 1, (s) => ['title', 'axes', 'units', 'key'].filter((c) => s.checks.includes(c)).length / 4, 'Give the graphs a title, labelled axes, units and a key.'),
  ];
  const steps: GeoStep[] = [
    recStep('sum', 'Study the data and total it', 'Plan the scale from the biggest value.', 'First I study the data. The biggest value tells me what scale will use most of the paper.', [f1, f2, f3]),
    plotStep(line, 'line', 'Plot the line graph', 'Scale from zero; plot each year.', 'A continuous series, so a line graph. I set the scale from zero and plot each year, then join the points.'),
    plotStep(bars, 'comp', 'Build the compound bars', 'Same parts in the same order.', 'A compound bar: each bar is divided into the same parts in the same order.'),
    checkStep('labels', 'Add title, axis labels, units and key', 'Every graph needs them.', 'A title, labelled axes with units, and a key.', ['title', 'axes', 'units', 'key'], 'chart'),
    recStep('calc', 'Work out the mean and the percentage change', 'Show each step.', 'The mean is the total divided by the number of years. Percentage change is the change divided by the first value.', [f4, f5]),
    ansStep('ideas', 'Answer the questions', 'Think of the data type.', 'Continuous time series take a line; discrete categories take bars starting at zero.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.BARS,
    brief: [`Draw a line graph of ${crop.toLowerCase()} output in ${state}, and a compound bar graph of food crops in three states.`, 'Choose scales that use most of the paper and start the value axes at zero.', 'Calculate the mean output and the percentage change.'],
    panels: ['chart'],
    tools: [],
    fields: [f1, f2, f3, f4, f5],
    choices: [c1, c2, c3],
    checks: [thing('title', 'Title'), thing('axes', 'Both axes labelled'), thing('units', 'Units'), thing('key', 'Key')],
    builds,
    steps,
    solution: [`Total ${sum}, mean ${mean} thousand tonnes.`, `Percentage change (${vals[4]} − ${vals[0]}) ÷ ${vals[0]} × 100 = ${pct.toFixed(1)}%.`],
  };
  return {
    def,
    ex: {
      ...NO_CHART_EXTRAS,
      charts: [line, bars],
      tables: [
        { title: `${crop} output, ${state} (thousand tonnes)`, head: ['Year', ...years], rows: [['Output', ...vals]] },
        { title: 'Food crops (thousand tonnes)', head: ['State', ...parts], rows: places.map((p, i) => [p, ...comp[i]!]) },
      ],
    },
  };
}

// ------------------------------------------------------------------ PIE

function taskPie(seed: number) {
  const r = labRandom(seed, 'geo-pie');
  const total = labPick(r, [900, 1200, 1800, 2400]);
  const labels = shuffle(r, ['Farmland', 'Forest', 'Settlement', 'Grazing', 'Water', 'Quarry']).slice(0, 4);
  // Shares in steps of 5%, all different.
  const shares = shuffle(r, [[50, 25, 15, 10], [45, 30, 15, 10], [40, 30, 20, 10], [40, 35, 15, 10], [55, 25, 15, 5], [35, 30, 25, 10]])[0]!;
  const items = labels.map((label, i) => ({ id: `s${i}`, label, value: (total * shares[i]!) / 100, angle: (shares[i]! * 360) / 100 }));
  const table = shuffle(r, items);
  const [nA, nB] = shuffle(r, STATE_NAMES);
  const popB = (10 + Math.round(r() * 15)) * 10000;
  const mult = labPick(r, [4, 2.25, 6.25, 9]);
  const popA = popB * mult;
  const radiusB = labPick(r, [1, 1.2, 1.5]);
  const rootA = Math.sqrt(popA);
  const rootB = Math.sqrt(popB);
  const radiusA = (rootA / rootB) * radiusB;
  const fT = fld('total', 'Total area', 'readings', 1, total, 0, { unit: 'ha', dp: 0, note: `Total = ${total} ha.` });
  const fA = table.map((x, i) => fld(`ang${i}`, `Sector angle: ${x.label}`, 'readings', 0.75, x.angle, 0.5, { unit: '°', dp: 0, own: (g) => (g('total') ? (x.value / g('total')!) * 360 : null), note: 'Angle = value ÷ total × 360°.' }));
  const fRa = fld('root_a', `√ of ${nA}’s population`, 'calculation', 1, rootA, 1, { dp: 1, note: 'Take the square root of each total.' });
  const fRb = fld('root_b', `√ of ${nB}’s population`, 'calculation', 1, rootB, 1, { dp: 1, note: 'Take the square root of each total.' });
  const fR = fld('rad_a', `Radius of ${nA}’s circle (${nB} = ${radiusB} cm)`, 'calculation', 2, radiusA, 0.05, { unit: 'cm', dp: 2, own: (g) => (g('root_a') && g('root_b') ? (g('root_a')! / g('root_b')!) * radiusB : null), note: 'Radius ∝ √value: not the value itself.' });
  const c1 = cho('order', 'Sectors are drawn', 'interpretation', 1, 'big', [['big', 'from 12 o’clock, clockwise, largest to smallest'], ['table', 'in any order from 3 o’clock'], ['small', 'anticlockwise, smallest first']], 'From 12 o’clock, clockwise, largest first.');
  const c2 = cho('why', 'Proportional circles use the square root because', 'interpretation', 1, 'area', [['area', 'the AREA of the circle should show the value'], ['easy', 'it makes the numbers smaller'], ['radius', 'the radius should equal the value']], 'Area ∝ value, so radius ∝ √value; a radius equal to the value exaggerates large values.');
  const biggest = items[0]!;
  const c3 = cho('share', `What percentage is ${biggest.label}?`, 'interpretation', 1, String(shares[0]), [...new Set([String(shares[0]), String(shares[1]), String(shares[2]), String(shares[0]! + 5)])], `${biggest.value} ÷ ${total} × 100 = ${shares[0]}%.`);
  const pieOk = (s: GeoMapsState) => {
    const order = s.seq.pie ?? [];
    const got = s.series.pie ?? [];
    return items.filter((x, i) => order[i] === x.id && got[i] !== undefined && Math.abs(got[i]! - x.angle) <= 4).length / items.length;
  };
  const radOk = (s: GeoMapsState) => Math.abs(Number(s.sets.r_a ?? 0) - radiusA) <= 0.12 && Math.abs(Number(s.sets.r_b ?? 0) - radiusB) <= 0.08;
  const builds: GeoBuild[] = [
    bld('pie', 3, pieOk, 'Draw the sectors clockwise from 12 o’clock, largest to smallest, at the right angles.'),
    bld('circles', 1, (s) => (radOk(s) ? 1 : 0), 'Draw both circles with radius in proportion to the square root.'),
    bld('labels', 1, (s) => ['title', 'key', 'pct'].filter((c) => s.checks.includes(c)).length / 3, 'Add a title, key and percentages.'),
  ];
  const steps: GeoStep[] = [
    recStep('total', 'Total the data', 'Everything is a share of the total.', 'First the total: every sector is a share of it.', [fT]),
    recStep('angles', 'Calculate each sector angle', 'Value ÷ total × 360°.', 'Value over total, times 360. The angles must add up to 360.', fA),
    {
      id: 'pie',
      label: 'Draw the sectors, largest first',
      why: 'Radius at 12 o’clock; then clockwise, largest to smallest.',
      say: 'I draw a radius at twelve o’clock, then measure each sector clockwise with the protractor, largest to smallest.',
      panel: 'pie',
      done: (s) => pieOk(s) >= 1,
      apply: (s) => {
        s.seq.pie = items.map((x) => x.id);
        s.series.pie = items.map((x) => x.angle);
      },
    },
    recStep('roots', 'Find the square roots and the radius', 'Radius ∝ √value.', 'For proportional circles the area shows the value, so the radius goes with the square root.', [fRa, fRb, fR]),
    { id: 'circles', label: 'Draw the two proportional circles', why: 'Set the compasses to each radius.', say: 'I set the compasses to each radius and draw both circles.', panel: 'pie', done: radOk, apply: (s) => Object.assign(s.sets, { r_a: roundDp(radiusA, 2), r_b: radiusB }) },
    checkStep('labels', 'Add title, key and percentages', 'A pie needs them.', 'A title, a key and the percentages.', ['title', 'key', 'pct'], 'pie'),
    ansStep('ideas', 'Answer the questions', 'Think of area, not radius.', 'The area shows the value, not the radius.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.PIE,
    brief: ['Draw a pie chart of the land use in the table, in order from largest to smallest.', `Then draw proportional circles for ${nA} and ${nB}. ${nB}’s circle has a radius of ${radiusB} cm.`],
    panels: ['pie'],
    tools: [],
    fields: [fT, ...fA, fRa, fRb, fR],
    choices: [c1, c2, c3],
    checks: [thing('title', 'Title'), thing('key', 'Key'), thing('pct', 'Percentages')],
    builds,
    steps,
    solution: [...items.map((x) => `${x.label}: ${x.value} ÷ ${total} × 360 = ${x.angle}°.`), `√${popA} ≈ ${rootA.toFixed(1)}, √${popB} ≈ ${rootB.toFixed(1)}: radius ${radiusA.toFixed(2)} cm.`],
  };
  const tables: GeoTable[] = [
    { title: 'Land use (hectares)', head: ['Use', 'Area (ha)'], rows: table.map((x) => [x.label, x.value]) },
    { title: 'Town populations', head: ['Town', 'Population'], rows: [[nA!, n0(popA)], [nB!, n0(popB)]] },
  ];
  return { def, ex: { ...NO_CHART_EXTRAS, tables, pie: { items, placeA: { name: nA!, value: popA }, placeB: { name: nB!, value: popB }, radiusB, radiusA } } };
}

// ------------------------------------------------------------------ DOTS

const blobAt = (r: () => number, c: P, rad: number): P[] => {
  const raw: P[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * 6.2832;
    const q = rad * (0.85 + r() * 0.3);
    raw.push([c[0] + Math.cos(a) * q, c[1] + Math.sin(a) * q]);
  }
  return raw;
};
function taskDots(seed: number) {
  const r = labRandom(seed, 'geo-dots');
  const j = (x: number) => x + (r() - 0.5) * 1.6;
  const mid: P = [j(10), j(8)];
  const n: P = [j(10), 15.4];
  const s: P = [j(10), 0.6];
  const w: P = [0.6, j(8)];
  const e: P = [19.4, j(8)];
  const quads: P[][] = [
    [[0.6, 0.6], s, mid, w],
    [s, [19.4, 0.6], e, mid],
    [w, mid, n, [0.6, 15.4]],
    [mid, e, [19.4, 15.4], n],
  ];
  const wig = (q: P[]) => smoothLine([...q, q[0]!], 2).map((p, i, a): P => (i === a.length - 1 ? a[0]! : p));
  const names = shuffle(r, STATE_NAMES).slice(0, 4);
  const dotValue = labPick(r, [2000, 5000, 10000]);
  const areaBase = [120, 150, 180, 240, 300];
  const regions: GeoRegion[] = quads.map((q, i) => {
    const area = labPick(r, areaBase);
    const dots = 7 + Math.floor(r() * 9);
    const pop = dots * dotValue;
    const c: P = [q.reduce((t, p) => t + p[0], 0) / 4, q.reduce((t, p) => t + p[1], 0) / 4];
    return { id: `r${i}`, name: names[i]!, poly: wig(q), pop, area: area * Math.max(1, Math.round(pop / (area * labPick(r, [40, 80, 150, 300])))) , empty: blobAt(r, [c[0] + (r() - 0.5), c[1] + (r() - 0.5)], 1.5) };
  });
  const density = (x: GeoRegion) => x.pop / x.area;
  const ds = regions.map(density);
  const top = Math.max(...ds);
  const step = Math.max(1, niceMax(top / 4));
  const classes = [0, 1, 2, 3].map((k) => ({ lo: k * step, hi: (k + 1) * step, label: `${n0(k * step)}–${n0((k + 1) * step - 1)}` }));
  const classOf = (d: number) => Math.min(3, Math.floor(d / step));
  const dotRegions = [regions[0]!.id, regions[3]!.id];
  // Rainfall stations and where the isohyet crosses between them.
  const stations = Array.from({ length: 4 }, (_, i) => {
    const p: P = [[3, 7, 12, 17][i]! + (r() - 0.5), [3, 12, 4, 13][i]! + (r() - 0.5) * 1.5];
    return { id: `st${i}`, p, v: 1000 + (i % 2 ? 400 + Math.round(r() * 3) * 50 : Math.round(r() * 3) * 40) };
  });
  const value = 1300;
  const between = (a: number, b: number) => {
    const A = stations[a]!;
    const B = stations[b]!;
    const t = (value - A.v) / (B.v - A.v);
    return { a: A.id, b: B.id, value, at: [A.p[0] + (B.p[0] - A.p[0]) * t, A.p[1] + (B.p[1] - A.p[1]) * t] as P, t, km: dist(A.p, B.p) * 10 * t };
  };
  const pairs = [between(0, 1), between(1, 2), between(2, 3)];
  const f1 = fld('n_a', `Dots for ${regions[0]!.name}`, 'readings', 2, regions[0]!.pop / dotValue, 0, { dp: 0, note: `${n0(regions[0]!.pop)} ÷ ${n0(dotValue)}.` });
  const f2 = fld('n_b', `Dots for ${regions[3]!.name}`, 'readings', 2, regions[3]!.pop / dotValue, 0, { dp: 0, note: `${n0(regions[3]!.pop)} ÷ ${n0(dotValue)}.` });
  const fD = regions.map((x, i) => fld(`den${i}`, `Density of ${x.name}`, 'calculation', 0.5, density(x), 0.6, { unit: 'per km²', dp: 1, note: 'Density = population ÷ area.' }));
  const fI = fld('iso', `Distance of the ${value} mm isohyet from ${'station A'}, on the line A to B, 10 km to the cm`, 'calculation', 2, pairs[0]!.km, 0.5, { unit: 'km', dp: 1, note: 'Interpolate in proportion: (value − A) ÷ (B − A) × distance.' });
  const c1 = cho('shade', 'A density map’s shading should', 'interpretation', 1, 'grade', [['grade', 'go from light (low) to dark (high)'], ['random', 'use any bright colours'], ['same', 'be the same for every class']], 'Graded shading: light for low, dark for high.');
  const c2 = cho('dots', 'On a dot map the dots go', 'interpretation', 1, 'where', [['where', 'where the people actually live'], ['even', 'evenly across the whole region'], ['middle', 'all together in the middle']], 'Dots follow the real distribution: not into swamps or forests.');
  const c3 = cho('iso', 'Isopleths', 'interpretation', 1, 'never', [['never', 'join places of equal value and never cross'], ['cross', 'cross where values are highest'], ['border', 'follow the region borders']], 'Lines of equal value can never cross.');
  const dotsIn = (s: GeoMapsState, x: GeoRegion) => pinsOf(s, `dot:${x.id}`).filter((p) => inPolygon(p.p, x.poly));
  const dotScore = (s: GeoMapsState) => dotRegions.filter((id) => {
    const x = regions.find((y) => y.id === id)!;
    return dotsIn(s, x).length === x.pop / dotValue;
  }).length / dotRegions.length;
  const dotClear = (s: GeoMapsState) => {
    const all = dotRegions.flatMap((id) => dotsIn(s, regions.find((y) => y.id === id)!));
    const out = dotRegions.flatMap((id) => {
      const x = regions.find((y) => y.id === id)!;
      return dotsIn(s, x).filter((p) => !inPolygon(p.p, x.empty));
    });
    return all.length ? (out.length === all.length ? 1 : 0) : 0;
  };
  const shadeScore = (s: GeoMapsState) => regions.filter((x) => s.sets[`shade:${x.id}`] === classOf(density(x))).length / regions.length;
  const isoScore = (s: GeoMapsState) => pairs.filter((q) => pinNear(s, 'iso', q.at, 0.6)).length / pairs.length;
  const builds: GeoBuild[] = [
    bld('dots', 1.5, dotScore, 'Place the right number of dots in each region.'),
    bld('where', 0.5, dotClear, 'Keep the dots out of the uninhabited swamp and forest.'),
    bld('shade', 1.5, shadeScore, 'Shade each region in the class its density falls in.'),
    bld('iso', 1, isoScore, 'Mark where the isohyet crosses between each pair of stations.'),
    bld('key', 0.5, (s) => (s.checks.includes('key') ? 1 : 0), 'Add a key.'),
  ];
  const dotPts = (x: GeoRegion): P[] => {
    const out: P[] = [];
    const want = x.pop / dotValue;
    const rng = labRandom(seed, `dots-${x.id}`);
    for (let k = 0; k < 4000 && out.length < want; k++) {
      const p: P = [1 + rng() * 18, 1 + rng() * 14];
      if (inPolygon(p, x.poly) && !inPolygon(p, x.empty) && nearestOnLine(p, x.poly).d > 0.3 && nearestOnLine(p, [...x.empty, x.empty[0]!]).d > 0.3 && out.every((q) => dist(p, q) > 0.5)) out.push(p);
    }
    return out;
  };
  const steps: GeoStep[] = [
    recStep('dotn', 'Work out the number of dots for each region', 'Value ÷ dot value.', `One dot stands for ${n0(dotValue)} people, so the number of dots is the population divided by that.`, [f1, f2]),
    {
      id: 'dots',
      label: 'Place the dots where people live',
      why: 'Choose the region, then tap. Keep out of the hatched swamp.',
      say: 'I place the dots where people actually live: never in the hatched swamp and forest.',
      panel: 'outline',
      done: (s) => dotScore(s) >= 1 && dotClear(s) >= 1,
      apply: (s) => {
        for (const id of dotRegions) {
          const x = regions.find((y) => y.id === id)!;
          for (const p of dotPts(x)) s.pins.push({ k: `dot:${x.id}`, p });
        }
      },
    },
    recStep('den', 'Calculate each region’s density', 'Population ÷ area.', 'Density is population divided by area, for each region.', fD),
    {
      id: 'shade',
      label: 'Shade each region by its class',
      why: 'Light for low, dark for high.',
      say: 'I put each density into its class and shade from light for low to dark for high.',
      panel: 'outline',
      done: (s) => shadeScore(s) >= 1,
      apply: (s) => {
        for (const x of regions) s.sets[`shade:${x.id}`] = classOf(density(x));
      },
    },
    pinStep('iso', `Mark where the ${value} mm isohyet crosses each pair`, 'Interpolate in proportion to the values.', 'Between two stations I interpolate in proportion to the values, then draw a smooth line through the marks.', 'iso', pairs.map((q) => q.at), 0.6, 'outline'),
    recStep('isod', 'Work out the distance to the isohyet', '(Value − A) ÷ (B − A) × distance.', 'The fraction of the way along is the fraction of the rainfall difference.', [fI]),
    checkStep('key', 'Add a key', 'A key names the classes and the dot value.', 'A key for the classes and the dot value.', ['key'], 'outline'),
    ansStep('ideas', 'Answer the questions', 'Think of the reader.', 'Shading is graded, dots follow the people, and isopleths never cross.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.DOTS,
    brief: [`On the outline map, draw a dot map for ${regions[0]!.name} and ${regions[3]!.name} (1 dot = ${n0(dotValue)} people).`, 'Calculate the density of all four regions and shade a density map from the classes given.', `Mark where the ${value} mm isohyet crosses between each pair of rainfall stations (the map is 10 km to the cm).`],
    panels: ['outline'],
    tools: ['pin'],
    fields: [f1, f2, ...fD, fI],
    choices: [c1, c2, c3],
    checks: [thing('key', 'Key')],
    builds,
    steps,
    solution: [...regions.map((x) => `${x.name}: ${n0(x.pop)} ÷ ${x.area} = ${density(x).toFixed(1)} per km² (class ${classes[classOf(density(x))]!.label}).`), `The isohyet is ${pairs[0]!.km.toFixed(1)} km from A along A–B.`],
  };
  const outline: GeoOutline = { regions, dotValue, dotRegions, classes, stations, pairs: pairs.map((q) => ({ a: q.a, b: q.b, value: q.value, at: q.at })) };
  return { def, ex: { ...NO_CHART_EXTRAS, tables: [{ title: 'Regions', head: ['Region', 'Population', 'Area (km²)'], rows: regions.map((x) => [x.name, n0(x.pop), x.area]) }, { title: 'Density classes (per km²)', head: ['Class', 'Density'], rows: classes.map((c, i) => [i + 1, c.label]) }], outline } };
}

// ------------------------------------------------------------------ FLOW

function taskFlow(seed: number) {
  const r = labRandom(seed, 'geo-flow');
  const hub: P = [10 + (r() - 0.5) * 2, 8 + (r() - 0.5) * 2];
  const names = shuffle(r, STATE_NAMES);
  const mmPer = labPick(r, [1000, 500, 2000]);
  const ends: P[] = [[1.5, 3], [18.5, 2.5], [17.5, 14], [2.5, 13.5]];
  const routes = ends.map((e, i) => {
    const mid: P = [(e[0] + hub[0]) / 2 + (r() - 0.5) * 3, (e[1] + hub[1]) / 2 + (r() - 0.5) * 3];
    const value = (2 + Math.floor(r() * 12)) * mmPer + (i === 3 ? mmPer / 2 : 0);
    return { id: `f${i}`, name: names[i + 1]!, pts: smoothLine([e, mid, hub], 0.4), value, dir: (r() < 0.5 ? 'IN' : 'OUT') as 'IN' | 'OUT' };
  });
  routes.sort((a, b) => b.value - a.value);
  const total = routes.reduce((t, x) => t + x.value, 0);
  const process = labPick(r, [
    { title: 'From cocoa farm to export', items: ['Harvest the pods', 'Ferment the beans', 'Dry in the sun', 'Bag and grade', 'Haul to the port', 'Ship overseas'] },
    { title: 'From groundnut farm to market', items: ['Harvest the nuts', 'Shell the nuts', 'Crush at the mill', 'Bottle the oil', 'Truck to town', 'Sell at market'] },
    { title: 'From limestone to cement', items: ['Quarry the limestone', 'Crush the rock', 'Heat in the kiln', 'Grind with gypsum', 'Bag the cement', 'Deliver to builders'] },
  ]);
  const shuffled = shuffle(r, process.items);
  const fW = routes.map((x, i) => fld(`w${i}`, `Line width: ${x.name}`, 'readings', 0.75, x.value / mmPer, 0.05, { unit: 'mm', dp: 1, note: `${n0(x.value)} ÷ ${n0(mmPer)} per mm.` }));
  const fT = fld('total', 'Total vehicles a day', 'readings', 1, total, 0, { dp: 0, note: `Total = ${n0(total)}.` });
  const fP = fld('pct', `${routes[0]!.name} route as a percentage of the total`, 'calculation', 2, (routes[0]!.value / total) * 100, 0.2, { unit: '%', dp: 1, own: (g) => (g('total') ? (routes[0]!.value / g('total')!) * 100 : null), note: 'Route ÷ total × 100.' });
  const fX = fld('ratio', `${routes[0]!.name} route ÷ ${routes[3]!.name} route`, 'calculation', 2, routes[0]!.value / routes[3]!.value, 0.05, { dp: 2, note: 'Divide one flow by the other.' });
  const c1 = cho('prop', 'The width of a flow line shows', 'interpretation', 1, 'qty', [['qty', 'the quantity moved'], ['speed', 'the speed of the traffic'], ['dist', 'the length of the road']], 'Width is proportional to quantity.');
  const c2 = cho('route', 'Flow lines are drawn', 'interpretation', 1, 'actual', [['actual', 'along the actual routes, with arrows for direction'], ['straight', 'always as straight lines'], ['north', 'always pointing north']], 'Along the actual routes, with arrows.');
  const c3 = cho('flowchart', 'A flow chart shows', 'interpretation', 1, 'stages', [['stages', 'the stages of a process, joined by arrows'], ['tonnes', 'tonnes moved on a map'], ['places', 'where places are']], 'Boxes for stages, joined by arrows.');
  const widthScore = (s: GeoMapsState) => routes.filter((x) => Math.abs(Number(s.sets[`width:${x.id}`] ?? 0) - x.value / mmPer) <= 0.3).length / routes.length;
  const arrowScore = (s: GeoMapsState) => routes.filter((x) => s.sets[`arrow:${x.id}`] === x.dir).length / routes.length;
  const orderScore = (s: GeoMapsState) => {
    const o = s.seq.process ?? [];
    return process.items.filter((x, i) => o[i] === x).length / process.items.length;
  };
  const builds: GeoBuild[] = [
    bld('widths', 2, widthScore, 'Draw each line at its calculated width.'),
    bld('arrows', 1, arrowScore, 'Arrows show which way each flow goes.'),
    bld('key', 0.5, (s) => (s.checks.includes('key') ? 1 : 0), 'Add a key showing the width scale.'),
    bld('order', 1.5, orderScore, 'Put the stages of the process in order.'),
  ];
  const steps: GeoStep[] = [
    recStep('w', 'Calculate each line’s width', 'Value ÷ scale.', `One millimetre stands for ${n0(mmPer)} vehicles, so I divide each flow by that.`, [...fW, fT]),
    {
      id: 'flow',
      label: 'Draw each flow line and its arrow',
      why: 'Along the actual route, at the right width.',
      say: 'I draw each line along the actual route at its width, with an arrow for direction.',
      panel: 'flow',
      done: (s) => widthScore(s) >= 1 && arrowScore(s) >= 1,
      apply: (s) => {
        for (const x of routes) Object.assign(s.sets, { [`width:${x.id}`]: x.value / mmPer, [`arrow:${x.id}`]: x.dir });
      },
    },
    checkStep('key', 'Add the width key', 'A scale for widths.', 'The key shows what one millimetre stands for.', ['key'], 'flow'),
    { id: 'order', label: `Arrange the flow chart: ${process.title.toLowerCase()}`, why: 'First stage at the top.', say: 'Now the flow chart: each stage in a box, in order, with arrows.', panel: 'flowchart', done: (s) => orderScore(s) >= 1, apply: (s) => void (s.seq.process = [...process.items]) },
    recStep('p', 'Work out the percentage and the ratio', 'Route ÷ total × 100.', 'One route divided by the total, as a percentage.', [fP, fX]),
    ansStep('ideas', 'Answer the questions', 'Width means quantity.', 'Width shows quantity; arrows show direction.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.FLOW,
    brief: [`Vehicles a day between ${names[0]} and four towns are in the table. Scale: 1 mm = ${n0(mmPer)} vehicles a day.`, 'Calculate each flow line’s width and draw it along its route with an arrow.', `Then arrange the flow chart: ${process.title.toLowerCase()}.`],
    panels: ['flow', 'flowchart'],
    tools: [],
    fields: [...fW, fT, fP, fX],
    choices: [c1, c2, c3],
    checks: [thing('key', 'Width key')],
    builds,
    steps,
    solution: [...routes.map((x) => `${x.name}: ${n0(x.value)} → ${(x.value / mmPer).toFixed(1)} mm.`), `Largest share ${((routes[0]!.value / total) * 100).toFixed(1)}%.`, process.items.join(' → ')],
  };
  const flow: GeoFlow = { hub, hubName: names[0]!, routes, mmPer, process: { ...process, shuffled } };
  return { def, ex: { ...NO_CHART_EXTRAS, tables: [{ title: 'Traffic (vehicles a day)', head: ['Route', 'Vehicles', 'Direction'], rows: routes.map((x) => [x.name, n0(x.value), x.dir === 'IN' ? `Into ${names[0]}` : `Out of ${names[0]}`]) }], flow } };
}

// ------------------------------------------------------------------ CLIMATE

type Clim = { name: string; kind: string; temp: number[]; rain: number[] };
const bump = (m: number, c: number, w: number) => {
  const d = Math.min(Math.abs(m - c), 12 - Math.abs(m - c));
  return Math.exp(-((d / w) ** 2));
};
function climate(r: () => number, kind: 'EQUATORIAL' | 'SAVANNA' | 'DESERT' | 'MEDITERRANEAN' | 'GUINEA', south: boolean, name: string): Clim {
  const shift = south ? 6 : 0;
  const temp: number[] = [];
  const rain: number[] = [];
  for (let k = 0; k < 12; k++) {
    const m = (k + shift) % 12;
    if (kind === 'EQUATORIAL') {
      temp.push(26 + Math.round(bump(m, 3, 2) + bump(m, 9, 2)) + (k % 5 === 0 ? 1 : 0));
      rain.push(Math.round(120 + 160 * bump(m, 3.5, 1.6) + 170 * bump(m, 9.5, 1.6) + r() * 25));
    } else if (kind === 'GUINEA') {
      temp.push(Math.round(25 + 3 * bump(m, 2.5, 2) + (m < 5 ? 0 : 0)));
      rain.push(Math.round(15 + r() * 20 + 380 * bump(m, 5.5, 1.3) + 170 * bump(m, 9, 1.1)));
    } else if (kind === 'SAVANNA') {
      temp.push(Math.round(23 + 10 * bump(m, 3.8, 2) + 3 * bump(m, 9.5, 1.5)));
      rain.push(Math.round(Math.max(0, 230 * bump(m, 7, 1.6) - 6 + r() * 3)));
    } else if (kind === 'DESERT') {
      temp.push(Math.round(19 + 16 * bump(m, 6, 3.2)));
      rain.push(Math.round(r() * 8 + 12 * bump(m, 7, 1)));
    } else {
      temp.push(Math.round(11 + 14 * bump(m, 6.7, 3.2)));
      rain.push(Math.round(5 + r() * 6 + 95 * bump(m, 0.5, 2.6)));
    }
  }
  return { name, kind, temp, rain };
}
const stats = (c: Clim) => {
  const total = c.rain.reduce((t, x) => t + x, 0);
  const mean = c.temp.reduce((t, x) => t + x, 0) / 12;
  const range = Math.max(...c.temp) - Math.min(...c.temp);
  return { total, mean, range, dry: c.rain.filter((x) => x < 50).length, over100: c.rain.filter((x) => x > 100).length };
};
const climChart = (id: string, title: string, c: Clim): GeoChart => ({
  id,
  title,
  cats: MONTHS,
  series: [
    { id: 'rain', label: 'Rainfall (mm)', colour: '#1565c0', target: c.rain, axis: 'a', mark: 'bar' },
    { id: 'temp', label: 'Temperature (°C)', colour: '#c62828', target: c.temp, axis: 'b', mark: 'line' },
  ],
  axisA: { label: 'Rainfall (mm)', max: niceMax(Math.max(...c.rain)), step: 50 },
  axisB: { label: 'Temperature (°C)', max: 40, step: 5 },
});
const climTable = (c: Clim, title: string): GeoTable => ({ title, head: ['', ...MONTHS], rows: [['°C', ...c.temp], ['mm', ...c.rain]] });

function taskClimate(seed: number) {
  const r = labRandom(seed, 'geo-climate');
  const name = `${labPick(r, STATE_NAMES)} station`;
  const c = climate(r, 'GUINEA', false, name);
  const st = stats(c);
  const wettest = c.rain.indexOf(Math.max(...c.rain));
  const chart = climChart('climo', `Climograph for ${name}`, c);
  const f1 = fld('hot', 'Highest monthly temperature', 'readings', 1, Math.max(...c.temp), 0, { unit: '°C', dp: 0, note: `Highest ${Math.max(...c.temp)} °C.` });
  const f2 = fld('cold', 'Lowest monthly temperature', 'readings', 1, Math.min(...c.temp), 0, { unit: '°C', dp: 0, note: `Lowest ${Math.min(...c.temp)} °C.` });
  const f3 = fld('wet', 'Rainfall of the wettest month', 'readings', 2, c.rain[wettest]!, 0, { unit: 'mm', dp: 0, note: `${MONTHS_LONG[wettest]}: ${c.rain[wettest]} mm.` });
  const f4 = fld('total', 'Annual total rainfall', 'calculation', 1, st.total, 0, { unit: 'mm', dp: 0, note: 'Add the twelve months.' });
  const f5 = fld('mean', 'Annual mean temperature', 'calculation', 1, st.mean, 0.1, { unit: '°C', note: 'Sum ÷ 12.' });
  const f6 = fld('range', 'Annual range of temperature', 'calculation', 1, st.range, 0, { unit: '°C', dp: 0, own: (g) => (g('hot') === null || g('cold') === null ? null : g('hot')! - g('cold')!), note: 'Highest − lowest TEMPERATURE.' });
  const f7 = fld('months', 'Months with more than 100 mm', 'calculation', 1, st.over100, 0, { dp: 0, note: `${st.over100} months exceed 100 mm.` });
  const c1 = cho('marks', 'On a climograph', 'interpretation', 1, 'barline', [['barline', 'rainfall is bars and temperature a line'], ['barbar', 'both are bars'], ['linebar', 'rainfall is a line and temperature bars']], 'Rainfall bars, temperature line.');
  const c2 = cho('wet', 'Which month is wettest?', 'interpretation', 1, MONTHS_LONG[wettest]!, MONTHS_LONG, `${MONTHS_LONG[wettest]}.`);
  const c3 = cho('season', 'The rainfall pattern shows', 'interpretation', 1, 'double', [['double', 'two rainfall peaks with a short break between them'], ['all', 'heavy rain every month'], ['none', 'almost no rain at all']], 'Two peaks: the double maximum of southern West Africa.');
  const builds: GeoBuild[] = [
    bld('axes', 1, (s) => (axisOk(s, chart, 'a') && axisOk(s, chart, 'b') ? 1 : 0), 'Two value axes, from zero, that use the paper.'),
    bld('rain', 2, (s) => chartScore(s, chart, ['rain']), 'Draw a rainfall bar for each month.'),
    bld('temp', 1.5, (s) => chartScore(s, chart, ['temp']), 'Plot temperature at mid-month and join it with a line.'),
    bld('labels', 0.5, (s) => ['title', 'axes', 'key'].filter((x) => s.checks.includes(x)).length / 3, 'Add a title, axis labels and a key.'),
  ];
  const steps: GeoStep[] = [
    plotStep(chart, 'rain', 'Draw the rainfall bars', 'Left axis, one bar a month.', 'Twelve months along the bottom, rainfall on the left-hand axis, one bar for each month.', ['rain']),
    plotStep(chart, 'temp', 'Plot temperature as a line', 'Right axis, at mid-month.', 'Temperature on the right-hand axis, plotted at mid-month and joined with a line.', ['temp']),
    checkStep('labels', 'Add title, axis labels and key', 'They carry marks.', 'A title, labelled axes and a key.', ['title', 'axes', 'key'], 'chart'),
    recStep('read', 'Read the extremes', 'From your graph.', 'From the graph I read the hottest and coolest months and the wettest month.', [f1, f2, f3]),
    recStep('calc', 'Calculate the annual figures', 'Total, mean and range.', 'Add the rainfall for the total; divide the temperatures by twelve for the mean; the range is the hottest minus the coolest.', [f4, f5, f6, f7]),
    ansStep('ideas', 'Describe the climate', 'Look at your bars.', 'Two peaks in the rainfall bars: a double maximum.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.CLIMATE,
    brief: [`Draw a climograph for ${name} from the table: rainfall as bars, temperature as a line.`, 'Calculate the annual total rainfall, annual mean temperature and annual range of temperature.', 'Describe the pattern of the seasons.'],
    panels: ['chart'],
    tools: [],
    fields: [f1, f2, f3, f4, f5, f6, f7],
    choices: [c1, c2, c3],
    checks: [thing('title', 'Title'), thing('axes', 'Both axes labelled'), thing('key', 'Key')],
    builds,
    steps,
    solution: [`Total ${st.total} mm; mean ${st.mean.toFixed(1)} °C; range ${st.range} °C; ${st.over100} months above 100 mm.`],
  };
  return { def, ex: { ...NO_CHART_EXTRAS, charts: [chart], tables: [climTable(c, name)] } };
}

const CLIM_LABEL: [string, string][] = [
  ['EQUATORIAL', 'Equatorial'],
  ['SAVANNA', 'Tropical continental (savanna)'],
  ['DESERT', 'Hot desert'],
  ['MEDITERRANEAN', 'Mediterranean'],
];
function taskClimType(seed: number) {
  const r = labRandom(seed, 'geo-climtype');
  const kinds = shuffle(r, ['EQUATORIAL', 'SAVANNA', 'DESERT', 'MEDITERRANEAN'] as const).slice(0, 2);
  const xSouth = kinds[0] === 'EQUATORIAL' ? false : r() < 0.5;
  const x = climate(r, kinds[0]!, xSouth, 'Station X');
  const y = climate(r, kinds[1]!, kinds[1] === 'EQUATORIAL' ? false : r() < 0.3, 'Station Y');
  const sx = stats(x);
  const sy = stats(y);
  const chart = climChart('climx', 'Climograph for Station X', x);
  const f = (id: string, label: string, crit: 'readings' | 'calculation', truth: number, tol: number, unit: string | undefined, dp: number, note: string) => fld(id, label, crit, 1, truth, tol, { unit, dp, note });
  const fs = [
    f('x_mean', 'X: annual mean temperature', 'readings', sx.mean, 0.1, '°C', 1, 'Sum ÷ 12.'),
    f('x_range', 'X: annual range', 'readings', sx.range, 0, '°C', 0, 'Highest − lowest temperature.'),
    f('y_mean', 'Y: annual mean temperature', 'readings', sy.mean, 0.1, '°C', 1, 'Sum ÷ 12.'),
    f('y_range', 'Y: annual range', 'readings', sy.range, 0, '°C', 0, 'Highest − lowest temperature.'),
    f('x_total', 'X: total rainfall', 'calculation', sx.total, 0, 'mm', 0, 'Add the twelve months.'),
    f('y_total', 'Y: total rainfall', 'calculation', sy.total, 0, 'mm', 0, 'Add the twelve months.'),
    f('x_dry', 'X: dry months (under 50 mm)', 'calculation', sx.dry, 0, undefined, 0, 'Count the months under 50 mm.'),
    f('y_dry', 'Y: dry months (under 50 mm)', 'calculation', sy.dry, 0, undefined, 0, 'Count the months under 50 mm.'),
  ];
  const hemi = (c: Clim, south: boolean) => (c.kind === 'EQUATORIAL' ? 'EITHER' : south ? 'S' : 'N');
  const hemiOpts: [string, string][] = [['N', 'Northern Hemisphere'], ['S', 'Southern Hemisphere'], ['EITHER', 'Near the equator: not shown by the figures']];
  const c1 = cho('x_type', 'Station X’s climate is', 'interpretation', 1, x.kind, CLIM_LABEL, `Temperature, rainfall total and season together show ${x.kind.toLowerCase()}.`);
  const c2 = cho('y_type', 'Station Y’s climate is', 'interpretation', 1, y.kind, CLIM_LABEL, `Temperature, rainfall total and season together show ${y.kind.toLowerCase()}.`);
  const c3 = cho('x_hemi', 'Station X is in the', 'interpretation', 1, hemi(x, xSouth), hemiOpts, 'The hottest months and rainy season show the hemisphere.');
  const builds: GeoBuild[] = [bld('axes', 0.5, (s) => (axisOk(s, chart, 'a') && axisOk(s, chart, 'b') ? 1 : 0), 'Two value axes from zero, using the paper.'), bld('rain', 2.5, (s) => chartScore(s, chart, ['rain']), 'Rainfall bars for each month.'), bld('temp', 2, (s) => chartScore(s, chart, ['temp']), 'Temperature as a line.')];
  const steps: GeoStep[] = [
    plotStep(chart, 'rain', 'Draw X’s rainfall bars', 'One bar a month.', 'I plot station X first: rainfall bars.', ['rain']),
    plotStep(chart, 'temp', 'Plot X’s temperature line', 'Mid-month, joined.', 'Then the temperature line: its peak shows the hot season.', ['temp']),
    recStep('t', 'Calculate mean temperature and range', 'For both stations.', 'Mean and range, for both stations.', fs.slice(0, 4)),
    recStep('r', 'Total the rainfall and count the dry months', 'Under 50 mm is a dry month.', 'Total rainfall, and the length of the dry season.', fs.slice(4)),
    ansStep('ideas', 'Name the climates and the hemisphere', 'Use temperature AND rainfall.', 'Never from temperature alone. The hottest months give the hemisphere: January hot means south of the equator.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.CLIMTYPE,
    brief: ['Plot Station X’s climograph.', 'Calculate the annual mean temperature, range, total rainfall and the number of dry months for both stations.', 'Identify each climate, and state the hemisphere of Station X, giving evidence from the figures.'],
    panels: ['chart'],
    tools: [],
    fields: fs,
    choices: [c1, c2, c3],
    checks: [],
    builds,
    steps,
    solution: [`X: mean ${sx.mean.toFixed(1)} °C, range ${sx.range} °C, ${sx.total} mm, ${sx.dry} dry months → ${x.kind.toLowerCase()}.`, `Y: mean ${sy.mean.toFixed(1)} °C, range ${sy.range} °C, ${sy.total} mm, ${sy.dry} dry months → ${y.kind.toLowerCase()}.`],
  };
  return { def, ex: { ...NO_CHART_EXTRAS, charts: [chart], tables: [climTable(x, 'Station X'), climTable(y, 'Station Y')] } };
}

// ------------------------------------------------------------------ POPULATION

function taskPopulation(seed: number) {
  const r = labRandom(seed, 'geo-pop');
  const name = labPick(r, STATE_NAMES);
  const area = (5 + Math.round(r() * 15)) * 1000;
  const dens = (5 + Math.round(r() * 30)) * 10;
  const pop = area * dens;
  const birth = 28 + Math.floor(r() * 16);
  const death = 8 + Math.floor(r() * 8);
  const groups = ['65+', '45–64', '30–44', '15–29', '0–14'];
  const youth = labPick(r, [40, 42, 44, 46]);
  const old = labPick(r, [2, 3, 4]);
  const a3 = 16 + Math.floor(r() * 4) * 1;
  const a2 = 12 + Math.floor(r() * 3);
  const a1 = 100 - youth - old - a3 - a2;
  const both = [old, a2, a3, a1, youth];
  const male = both.map((x) => Math.round(x * 5.2) / 10);
  const female = both.map((x, i) => roundDp(x - male[i]!, 1));
  const work = 100 - youth - old;
  const ni = (birth - death) / 10;
  const f1 = fld('density', 'Population density', 'readings', 1, pop / area, 0.5, { unit: 'per km²', dp: 0, note: 'Population ÷ area.' });
  const f2 = fld('young', 'Percentage aged 0–14', 'readings', 1, youth, 0.05, { unit: '%', dp: 1, note: 'Add males and females.' });
  const f3 = fld('old', 'Percentage aged 65+', 'readings', 1, old, 0.05, { unit: '%', dp: 1, note: 'Add males and females.' });
  const f4 = fld('work', 'Percentage aged 15–64', 'readings', 1, work, 0.05, { unit: '%', dp: 1, own: (g) => (g('young') === null || g('old') === null ? null : 100 - g('young')! - g('old')!), note: 'The rest of the population.' });
  const f5 = fld('ni', 'Rate of natural increase', 'calculation', 1, ni, 0.01, { unit: '%', dp: 1, note: '(Birth rate − death rate) ÷ 10.' });
  const f6 = fld('dbl', 'Doubling time', 'calculation', 1, 70 / ni, 0.6, { unit: 'years', dp: 0, own: (g) => (g('ni') ? 70 / g('ni')! : null), note: 'Doubling time ≈ 70 ÷ growth rate.' });
  const f7 = fld('dep', 'Dependency ratio', 'calculation', 2, ((youth + old) / work) * 100, 0.3, { unit: 'per 100', dp: 1, own: (g) => (g('young') !== null && g('old') !== null && g('work') ? ((g('young')! + g('old')!) / g('work')!) * 100 : null), note: '(Young + old) ÷ working age × 100.' });
  const c1 = cho('shape', 'The shape of the pyramid is', 'interpretation', 1, 'expand', [['expand', 'Wide base, narrow top: a young, growing population'], ['even', 'Nearly straight sides: a stable population'], ['narrow', 'Narrow base: a shrinking population']], 'A wide base shows high birth rates.');
  const c2 = cho('side', 'On an age–sex pyramid, males go', 'interpretation', 1, 'left', [['left', 'on the left'], ['right', 'on the right'], ['top', 'at the top']], 'Males left, females right.');
  const c3 = cho('migr', 'Natural increase leaves out', 'interpretation', 1, 'migr', [['migr', 'migration'], ['birth', 'births'], ['death', 'deaths']], 'Natural increase counts only births and deaths.');
  const chart: GeoChart = {
    id: 'pyr',
    title: `Age–sex pyramid for ${name}`,
    cats: groups,
    horizontal: true,
    series: [
      { id: 'm', label: 'Males (%)', colour: '#1565c0', target: male, axis: 'a', mark: 'left' },
      { id: 'f', label: 'Females (%)', colour: '#ad1457', target: female, axis: 'a', mark: 'right' },
    ],
    axisA: { label: 'Percentage of total population', max: niceMax(Math.max(...male, ...female)), step: 5 },
  };
  const builds: GeoBuild[] = [
    bld('axis', 1, (s) => (axisOk(s, chart, 'a') ? 1 : 0), 'The same percentage scale on both sides, from zero.'),
    bld('m', 1.5, (s) => chartScore(s, chart, ['m']), 'Draw each age group for males.'),
    bld('f', 1.5, (s) => chartScore(s, chart, ['f']), 'Draw each age group for females.'),
    bld('labels', 1, (s) => ['title', 'ages', 'scale'].filter((c) => s.checks.includes(c)).length / 3, 'Add a title, the age groups and the percentage scale.'),
  ];
  const steps: GeoStep[] = [
    recStep('den', 'Calculate density', 'Population ÷ area.', 'Density is population divided by area.', [f1]),
    plotStep(chart, 'pyr', 'Draw the age–sex pyramid', 'Males left, females right.', 'Horizontal bars for each age group: males on the left, females on the right, the same scale on both sides.'),
    checkStep('labels', 'Add title, age groups and scale', 'They carry marks.', 'A title, the age groups and the scale.', ['title', 'ages', 'scale'], 'chart'),
    recStep('share', 'Add up the age groups', 'Young, working and old.', 'Males and females together give each share.', [f2, f3, f4]),
    recStep('rates', 'Work out the growth and dependency', 'Per 1000 → %.', 'Births minus deaths per thousand, divided by ten, gives a percentage. Seventy divided by that is the doubling time.', [f5, f6, f7]),
    ansStep('ideas', 'Interpret the pyramid', 'Shape tells the story.', 'A wide base means many children: a young, fast-growing population.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.POPULATION,
    brief: [`${name} has ${n0(pop)} people in ${n0(area)} km², a birth rate of ${birth} and a death rate of ${death} per 1000.`, 'Calculate its density, rate of natural increase, doubling time and dependency ratio.', 'Draw its age–sex pyramid from the table and interpret the shape.'],
    panels: ['chart'],
    tools: [],
    fields: [f1, f2, f3, f4, f5, f6, f7],
    choices: [c1, c2, c3],
    checks: [thing('title', 'Title'), thing('ages', 'Age groups labelled'), thing('scale', 'Percentage scale')],
    builds,
    steps,
    solution: [`Density ${pop / area} per km². Natural increase (${birth} − ${death}) ÷ 10 = ${ni}%; doubling ≈ ${(70 / ni).toFixed(0)} years.`, `Dependency (${youth} + ${old}) ÷ ${work} × 100 = ${(((youth + old) / work) * 100).toFixed(1)}.`],
  };
  return { def, ex: { ...NO_CHART_EXTRAS, charts: [chart], tables: [{ title: `Population of ${name} (% of total)`, head: ['Age', 'Males', 'Females'], rows: groups.map((g, i) => [g, male[i]!, female[i]!]) }] } };
}

// ------------------------------------------------------------------ LONGTIME

const PLACES = [
  { name: 'Lagos', lat: 6.5, lon: 3 },
  { name: 'Kano', lat: 12, lon: 8.5 },
  { name: 'Accra', lat: 5.5, lon: 0 },
  { name: 'Dakar', lat: 14.5, lon: -17.5 },
  { name: 'Nairobi', lat: -1.5, lon: 37 },
  { name: 'Cape Town', lat: -34, lon: 18.5 },
  { name: 'Kinshasa', lat: -4.5, lon: 15.5 },
  { name: 'Cairo', lat: 30, lon: 31 },
  { name: 'Rio de Janeiro', lat: -23, lon: -43 },
  { name: 'London', lat: 51.5, lon: 0 },
  { name: 'Mumbai', lat: 19, lon: 73 },
];
const fmtDeg = (x: number, pos: string, neg: string) => `${Math.abs(x)}°${x >= 0 ? pos : neg}`;
function taskLongTime(seed: number) {
  const r = labRandom(seed, 'geo-long');
  const list = shuffle(r, PLACES);
  const A = list[0]!;
  const B = list.find((p) => p.lat !== A.lat && Math.abs(p.lat - A.lat) >= 4)!;
  const C = list.find((p) => p !== B && p !== A && Math.abs(p.lon - A.lon) >= 12)!;
  const dlat = Math.abs(A.lat - B.lat);
  const dlon = Math.abs(A.lon - C.lon);
  const t0 = labPick(r, [9, 10, 12, 15]) * 60;
  const mins = dlon * 4;
  const east = C.lon > A.lon;
  const tc = ((t0 + (east ? mins : -mins)) % 1440 + 1440) % 1440;
  const f1 = fld('dlat', `Difference in latitude, ${A.name} to ${B.name}`, 'readings', 2, dlat, 0.05, { unit: '°', note: A.lat * B.lat < 0 ? 'On opposite sides of the equator: add.' : 'On the same side of the equator: subtract.' });
  const f2 = fld('dlon', `Difference in longitude, ${A.name} to ${C.name}`, 'readings', 2, dlon, 0.05, { unit: '°', note: A.lon * C.lon < 0 ? 'On opposite sides of Greenwich: add.' : 'On the same side of Greenwich: subtract.' });
  const f3 = fld('ns', 'North–south distance', 'calculation', 1, dlat * 111, 1, { unit: 'km', dp: 0, own: (g) => (g('dlat') === null ? null : g('dlat')! * 111), note: 'Degrees × 111 km.' });
  const f4 = fld('mins', 'Time difference', 'calculation', 1, mins, 0.5, { unit: 'minutes', dp: 0, own: (g) => (g('dlon') === null ? null : g('dlon')! * 4), note: '1° = 4 minutes.' });
  const f5 = fld('time', `Local time at ${C.name} when it is ${clock24(t0)} at ${A.name}`, 'calculation', 2, tc, 1, { kind: 'time', unit: '24-hour', dp: 0, note: `${C.name} is ${east ? 'east' : 'west'} of ${A.name}: ${east ? 'add' : 'subtract'} time.` });
  const c1 = cho('east', 'Places to the east have', 'interpretation', 1, 'ahead', [['ahead', 'a later local time: add'], ['behind', 'an earlier local time: subtract'], ['same', 'the same local time']], 'The sun reaches the east first.');
  const c2 = cho('opp', 'If two places are on opposite sides of Greenwich, their longitudes are', 'interpretation', 1, 'add', [['add', 'added'], ['sub', 'subtracted'], ['mean', 'averaged']], 'Opposite sides: add.');
  const c3 = cho('rate', 'The earth turns through 15° of longitude in', 'interpretation', 1, 'hour', [['hour', '1 hour'], ['min', '4 minutes'], ['day', '1 day']], '15° = 1 hour; 1° = 4 minutes.');
  const places = [{ id: 'A', ...A }, { id: 'B', ...B }, { id: 'C', ...C }];
  const pinScore = (s: GeoMapsState) => places.filter((p) => pinNear(s, `place:${p.id}`, [p.lon, p.lat], 4)).length / 3;
  const builds: GeoBuild[] = [bld('places', 3, pinScore, 'Mark each place at its latitude and longitude on the earth grid.'), bld('labels', 2, (s) => ['equator', 'greenwich', 'arrow'].filter((c) => s.checks.includes(c)).length / 3, 'Label the equator and the Greenwich meridian, and show the direction the earth turns.')];
  const steps: GeoStep[] = [
    { id: 'places', label: 'Mark the three places on the earth grid', why: 'Across for longitude, up for latitude.', say: 'I find each place on the grid: longitude along the equator, latitude up the meridian.', panel: 'globe', done: (s) => pinScore(s) >= 1, apply: (s) => void s.pins.push(...places.map((p) => ({ k: `place:${p.id}`, p: [p.lon, p.lat] as P }))) },
    checkStep('labels', 'Label the equator, Greenwich and the earth’s turning', 'A diagram must be labelled.', 'The equator, the Greenwich meridian, and an arrow: the earth turns from west to east.', ['equator', 'greenwich', 'arrow'], 'globe'),
    recStep('lat', 'Find the latitude difference and distance', 'Same side subtract, opposite sides add.', 'Same side of the equator, subtract; opposite sides, add. One degree is about 111 kilometres.', [f1, f3]),
    recStep('lon', 'Find the longitude difference and the time', '1° = 4 minutes.', 'Four minutes for every degree. East of me is later, so I add; west is earlier, so I subtract.', [f2, f4, f5]),
    ansStep('ideas', 'Answer the questions', 'The sun rises in the east.', 'The sun reaches the east first: east is ahead.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.LONGTIME,
    brief: [`${A.name} (${fmtDeg(A.lat, 'N', 'S')}, ${fmtDeg(A.lon, 'E', 'W')}), ${B.name} (${fmtDeg(B.lat, 'N', 'S')}, ${fmtDeg(B.lon, 'E', 'W')}) and ${C.name} (${fmtDeg(C.lat, 'N', 'S')}, ${fmtDeg(C.lon, 'E', 'W')}).`, 'Mark them on the earth grid and label it.', `Find the north–south distance from ${A.name} to ${B.name}, and the local time at ${C.name} when it is ${clock24(t0)} at ${A.name}.`],
    panels: ['globe'],
    tools: [],
    fields: [f1, f2, f3, f4, f5],
    choices: [c1, c2, c3],
    checks: [thing('equator', 'Equator labelled'), thing('greenwich', 'Greenwich meridian labelled'), thing('arrow', 'Direction the earth turns')],
    builds,
    steps,
    solution: [`Latitude difference ${dlat}° × 111 = ${(dlat * 111).toFixed(0)} km.`, `Longitude difference ${dlon}° × 4 = ${mins} min → ${clock24(tc)} at ${C.name}.`],
  };
  return { def, ex: { ...NO_CHART_EXTRAS, globe: { places } } };
}

export function chartTask(seed: number, task: GeoTask): { def: GeoTaskDef; ex: GeoChartExtras } {
  switch (task) {
    case 'BARS':
      return taskBars(seed);
    case 'PIE':
      return taskPie(seed);
    case 'DOTS':
      return taskDots(seed);
    case 'FLOW':
      return taskFlow(seed);
    case 'CLIMATE':
      return taskClimate(seed);
    case 'CLIMTYPE':
      return taskClimType(seed);
    case 'POPULATION':
      return taskPopulation(seed);
    default:
      return taskLongTime(seed);
  }
}
export const GEO_FIELD_TOTAL = (fields: GeoField[]) => fields.reduce((t, f) => t + f.marks, 0);
