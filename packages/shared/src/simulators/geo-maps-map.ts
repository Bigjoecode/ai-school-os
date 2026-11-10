import { labPick, labRandom, roundDp } from './seeded';
import {
  GEO_TASK_TITLE,
  clock24,
  fmtDp,
  lineMatch,
  pinNear,
  pinsOf,
  protractorOn,
  rulerOn,
  runCover,
  type GeoBuild,
  type GeoChoice,
  type GeoCrit,
  type GeoField,
  type GeoMapsState,
  type GeoRect,
  type GeoStep,
  type GeoTask,
  type GeoTaskDef,
} from './geo-maps-data';
import {
  DRAINAGE_PATTERNS,
  SHEET_H,
  SHEET_W,
  SQUARES_E,
  SQUARES_N,
  SQUARE_CM,
  bearingOf,
  compass16,
  compass8,
  contourCrossings,
  dist,
  geoHeight,
  geoSheet,
  gridRef4,
  gridRef6,
  inPolygon,
  nearestOnLine,
  polyLength,
  sliceLine,
  type DrainagePattern,
  type GeoFeature,
  type GeoSettlement,
  type GeoSheet,
  type P,
  type ReliefKind,
} from './geo-maps-sheet';

/** The eleven map-sheet tasks: what is asked, the true answers from the sheet, the mark scheme and the model way of doing it, step by step. */

export interface GeoMapExtras {
  /** Lettered points printed on the sheet. */
  marks: Record<string, P>;
  rects: GeoRect[];
  section: [P, P] | null;
  /** SCALE: the sheet's margin gives only the statement. */
  marginScale: 'STATEMENT' | 'ALL';
  /** REDUCE: the framed part of the sheet and the river in the copy's own centimetres. */
  copy: { frame: GeoRect; k: number; want: P[]; src: P[] } | null;
  pinKinds: { k: string; label: string; colour: string }[];
  pencilKinds: { id: string; label: string; closed: boolean }[];
  /** GIS raster data. */
  raster: { cells: number; size: number } | null;
}
export const NO_EXTRAS: GeoMapExtras = { marks: {}, rects: [], section: null, marginScale: 'ALL', copy: null, pinKinds: [], pencilKinds: [], raster: null };

// ------------------------------------------------------------------ builders

type FieldOpts = Partial<Pick<GeoField, 'unit' | 'group' | 'kind' | 'text' | 'rel' | 'own' | 'dp' | 'note'>>;
export const fld = (id: string, label: string, crit: GeoCrit, marks: number, truth: number, tol: number, o: FieldOpts = {}): GeoField => ({ id, label, crit, marks, truth, tol, kind: 'num', dp: 1, note: `${label}: ${truth}${o.unit ? ` ${o.unit}` : ''}.`, ...o });
export const cho = (id: string, label: string, crit: GeoCrit, marks: number, truth: string, options: (string | [string, string])[], note: string): GeoChoice => ({ id, label, crit, marks, truth, note, options: options.map((o) => (typeof o === 'string' ? { id: o, label: o } : { id: o[0], label: o[1] })) });
export const bld = (id: string, marks: number, test: GeoBuild['test'], note: string, crit: GeoCrit = 'construction'): GeoBuild => ({ id, crit, marks, test, note });
export function modelText(f: GeoField): string {
  switch (f.kind) {
    case 'ref4':
    case 'ref6':
      return f.text ?? '';
    case 'bearing':
      return String(Math.round(f.truth)).padStart(3, '0');
    case 'rf':
      return `1:${f.truth}`;
    case 'oneIn':
      return `1 in ${fmtDp(f.truth, f.dp)}`;
    case 'time':
      return clock24(f.truth);
    default:
      return fmtDp(f.truth, f.dp);
  }
}
export const recStep = (id: string, label: string, why: string, say: string, fields: GeoField[]): GeoStep => ({
  id,
  label,
  why,
  say,
  done: (s) => fields.every((f) => (s.entries[f.id] ?? '').trim() !== ''),
  apply: (s) => {
    for (const f of fields) s.entries[f.id] = modelText(f);
  },
});
export const ansStep = (id: string, label: string, why: string, say: string, choices: GeoChoice[]): GeoStep => ({
  id,
  label,
  why,
  say,
  done: (s) => choices.every((c) => !!s.choices[c.id]),
  apply: (s) => {
    for (const c of choices) s.choices[c.id] = c.truth;
  },
});
export const checkStep = (id: string, label: string, why: string, say: string, ids: string[], panel?: GeoStep['panel']): GeoStep => ({
  id,
  label,
  why,
  say,
  panel,
  done: (s) => ids.every((c) => s.checks.includes(c)),
  apply: (s) => {
    s.checks = [...new Set([...s.checks, ...ids])];
  },
});
const rulerStep = (id: string, label: string, why: string, say: string, a: P, b: P): GeoStep => ({ id, label, why, say, panel: 'map', tool: 'ruler', done: (s) => rulerOn(s, a, b), apply: (s) => void s.rulers.push({ a, b }) });
export const pinStep = (id: string, label: string, why: string, say: string, k: string, pts: P[], tol: number, panel: GeoStep['panel'] = 'map', tool: GeoStep['tool'] = 'pin'): GeoStep => ({
  id,
  label,
  why,
  say,
  panel,
  tool,
  done: (s) => pts.every((p) => pinNear(s, k, p, tol)),
  apply: (s) => {
    for (const p of pts) s.pins.push({ k, p });
  },
});
const mapElements = [
  { id: 'title', label: 'Title' },
  { id: 'north', label: 'North arrow' },
  { id: 'key', label: 'Key' },
  { id: 'scale', label: 'Scale (RF and linear)' },
];

const named = (s: GeoSheet) => s.settlements.filter((x) => x.kind !== 'HAMLET');
const shuffle = <T>(r: () => number, xs: readonly T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
const feature = (s: GeoSheet, id: string): GeoFeature => s.features.find((f) => f.id === id)!;
const pair = (r: () => number, xs: GeoSettlement[], lo: number, hi: number): [GeoSettlement, GeoSettlement] => {
  const all: [GeoSettlement, GeoSettlement][] = [];
  for (const a of xs) for (const b of xs) if (a !== b && dist(a.p, b.p) >= lo && dist(a.p, b.p) <= hi) all.push([a, b]);
  return all.length ? labPick(r, all) : [xs[0]!, xs[xs.length - 1]!];
};
const scaleWords = (s: GeoSheet) => (s.denom === 50000 ? '2 cm to 1 km' : s.denom === 25000 ? '4 cm to 1 km' : '1 cm to 1 km');
const shortRf = (s: GeoSheet) => `1:${s.denom.toLocaleString('en-GB').replace(/,/g, ' ')}`;

// ------------------------------------------------------------------ SCALE

function taskScale(seed: number, s: GeoSheet) {
  const r = labRandom(seed, 'geo-scale');
  const [a, b] = pair(r, named(s), 6, 15);
  const A = a.p;
  const B = b.p;
  const d = dist(A, B);
  const k = s.kmPerCm;
  const r2 = labPick(r, [250000, 500000, 200000, 1000000]);
  const km3 = labPick(r, [2.5, 5, 0.25, 10]);
  const kmcm = fld('kmcm', '1 cm on this map represents', 'readings', 2, k, 0.001, { unit: 'km', dp: 2, note: `The margin gives ${scaleWords(s)}, so 1 cm = ${k} km.` });
  const ab = fld('ab_cm', 'A to B on the map', 'readings', 2, d, 0.15, { unit: 'cm', note: `A–B is ${d.toFixed(1)} cm on the map.` });
  const rf = fld('rf', 'Representative fraction of this map', 'calculation', 1, s.denom, 0, { kind: 'rf', dp: 0, note: `1 km = 100 000 cm, so the RF is ${shortRf(s)}.` });
  const abKm = fld('ab_km', 'A to B on the ground', 'calculation', 1, d * k, 0.02, { unit: 'km', dp: 2, own: (g) => (g('ab_cm') === null || g('kmcm') === null ? null : g('ab_cm')! * g('kmcm')!), note: 'Ground distance = map distance × km per cm (in km, not cm).' });
  const conv2 = fld('r2_km', `RF 1:${r2.toLocaleString('en-GB').replace(/,/g, ' ')}: 1 cm represents`, 'calculation', 1, r2 / 100000, 0.001, { unit: 'km', dp: 2, note: `Divide the denominator by 100 000: ${r2 / 100000} km.` });
  const conv3 = fld('s3_rf', `Statement “1 cm to ${km3} km” as an RF`, 'calculation', 1, km3 * 100000, 0, { kind: 'rf', dp: 0, note: `${km3} km = ${km3 * 100000} cm: RF 1:${km3 * 100000}.` });
  const opts: [string, string][] = [
    ['1', '1:1 000 000'],
    ['2', '1:250 000'],
    ['3', '1:10 000'],
    ['4', '1:50 000'],
  ];
  const largest = cho('largest', 'Which is the largest scale?', 'interpretation', 1, '3', opts, 'The smaller the denominator, the larger the scale.');
  const kind = cho('kind', 'Compared with 1:1 000 000, this sheet shows', 'interpretation', 1, 'detail', [['detail', 'a smaller area in more detail (larger scale)'], ['area', 'a larger area in less detail (smaller scale)'], ['same', 'the same area, only printed bigger']], 'A large-scale map shows a small area in great detail.');
  const rfUnits = cho('rfunits', 'How is an RF written?', 'interpretation', 1, 'plain', [['plain', '1:50 000, with no units'], ['cm', '1 cm : 50 000 cm'], ['km', '1 : 50 km']], 'An RF has no units: both sides are in the same unit.');
  const bar = (x: GeoMapsState) => ({ len: Number(x.sets.bar_len ?? 0), n: Number(x.sets.bar_primary ?? 0), g: Number(x.sets.bar_ground ?? 0), sec: Number(x.sets.bar_secondary ?? 0) });
  const trueBar = (x: GeoMapsState) => {
    const { len, n, g } = bar(x);
    return len >= 6 && len <= 20 && n >= 3 && g > 0 && Math.abs((len / n) * k - g) <= 0.02 * g;
  };
  const primary = k >= 1 ? 1 : 0.5;
  const primaries = Math.max(3, Math.round(10 / (primary / k)));
  const builds: GeoBuild[] = [
    bld('ruler', 1, (x) => (rulerOn(x, A, B) ? 1 : 0), 'Lay the ruler from A to B and read it.'),
    bld('bar', 2, (x) => (trueBar(x) ? 1 : 0), 'Each primary division of the linear scale must really equal the ground distance written on it (at least 6 cm long).'),
    bld('zero', 1, (x) => (x.sets.bar_zero === 'JUNCTION' && bar(x).sec >= 2 ? 1 : 0), 'Put 0 at the junction of the primary and secondary divisions, with the left-hand division subdivided.'),
    bld('labels', 1, (x) => (x.sets.bar_unit === 'km' && x.sets.bar_rf === true ? 1 : 0), 'Label the linear scale with its unit and the RF.'),
  ];
  const fields = [kmcm, ab, rf, abKm, conv2, conv3];
  const choices = [largest, kind, rfUnits];
  const steps: GeoStep[] = [
    recStep('margin', 'Read the scale in the margin', 'The margin here gives a statement only: you must work out the rest.', `The margin says ${scaleWords(s)}: so one centimetre is ${k} kilometres. Both sides in the same unit gives the RF.`, [kmcm, rf]),
    rulerStep('ruler', 'Lay the ruler from A to B', 'Read to the nearest millimetre at the centres of the points.', 'I lay the ruler with zero on A and read it at B, to the millimetre.', A, B),
    recStep('ab', 'Record A to B and convert to ground distance', 'Map distance × km per cm.', 'Map distance times kilometres per centimetre gives the ground distance, in kilometres.', [ab, abKm]),
    recStep('convert', 'Convert the two other scales', 'Divide or multiply by 100 000.', 'One kilometre is one hundred thousand centimetres: that is the only fact I need.', [conv2, conv3]),
    {
      id: 'bar',
      label: 'Build the linear scale',
      why: 'Choose a round ground value for each primary division, and work out its length on the paper.',
      say: `Each primary division will show ${primary} kilometre, so it is ${(primary / k).toFixed(1)} centimetres long. Zero goes at the junction, with the left-hand division cut into smaller parts.`,
      panel: 'scalebar',
      done: (x) => trueBar(x) && x.sets.bar_zero === 'JUNCTION' && bar(x).sec >= 2 && x.sets.bar_unit === 'km' && x.sets.bar_rf === true,
      apply: (x) => {
        Object.assign(x.sets, { bar_len: roundDp((primaries * primary) / k, 2), bar_primary: primaries, bar_ground: primary, bar_secondary: 5, bar_zero: 'JUNCTION', bar_unit: 'km', bar_rf: true });
      },
    },
    ansStep('ideas', 'Answer the questions on scale', 'Large scale means small denominator.', 'The smaller the denominator, the larger the scale, and the more detail it shows.', choices),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.SCALE,
    brief: [
      `This extract of ${s.name} shows its scale only as a statement in the margin: ${scaleWords(s)}.`,
      'Work out its RF and how many km one centimetre represents, measure A–B with the ruler and find the ground distance.',
      `Convert the RF 1:${r2.toLocaleString('en-GB').replace(/,/g, ' ')} to a statement, and the statement “1 cm to ${km3} km” to an RF.`,
      'Build a labelled linear scale for this map, about 10 cm long, on the Linear scale sheet.',
    ],
    panels: ['map', 'scalebar'],
    tools: ['hand', 'ruler'],
    fields,
    choices,
    checks: [],
    builds,
    steps,
    solution: [`Scale ${scaleWords(s)}: 1 cm = ${k} km, RF ${shortRf(s)}.`, `A–B = ${d.toFixed(1)} cm → ${(d * k).toFixed(2)} km.`, `1:${r2} → 1 cm to ${r2 / 100000} km; 1 cm to ${km3} km → 1:${km3 * 100000}.`, `Linear scale: primary divisions of ${primary} km are ${(primary / k).toFixed(1)} cm long, 0 at the junction.`],
  };
  return { def, ex: { ...NO_EXTRAS, marks: { A, B }, marginScale: 'STATEMENT' as const } };
}

// ------------------------------------------------------------------ DISTANCE

function taskDistance(seed: number, s: GeoSheet) {
  const r = labRandom(seed, 'geo-distance');
  const road = s.roads.find((x) => x.id === 'main')!.pts;
  const on = s.settlements.filter((x) => nearestOnLine(x.p, road).d < 0.03);
  const opts: { a: P; b: P; len: number; st: number }[] = [];
  for (const a of on) {
    for (const b of on) {
      const u = nearestOnLine(a.p, road).along;
      const w = nearestOnLine(b.p, road).along;
      if (w <= u) continue;
      const len = w - u;
      const st = dist(a.p, b.p);
      if (len >= 6.5 && len <= 19 && len / st >= 1.04) opts.push({ a: a.p, b: b.p, len, st });
    }
  }
  const chosen = opts.length ? labPick(r, opts) : { a: road[8]!, b: road[road.length - 9]!, len: 0, st: 0 };
  const A = chosen.a;
  const B = chosen.b;
  const part = sliceLine(road, nearestOnLine(A, road).along, nearestOnLine(B, road).along);
  const L = polyLength(part);
  const D = dist(A, B);
  const k = s.kmPerCm;
  const f1 = fld('st_cm', 'Straight distance A–B on the map', 'readings', 2, D, 0.15, { unit: 'cm', note: `Straight A–B is ${D.toFixed(1)} cm.` });
  const f2 = fld('rd_cm', 'Road distance A–B on the map', 'readings', 2, L, 0.04, { unit: 'cm', rel: true, note: `Along the road it is ${L.toFixed(1)} cm.` });
  const f3 = fld('st_km', 'Straight distance on the ground', 'calculation', 1, D * k, 0.02, { unit: 'km', dp: 2, own: (g) => (g('st_cm') === null ? null : g('st_cm')! * k), note: 'Map cm × km per cm, in km.' });
  const f4 = fld('rd_km', 'Road distance on the ground', 'calculation', 1, L * k, 0.02, { unit: 'km', dp: 2, own: (g) => (g('rd_cm') === null ? null : g('rd_cm')! * k), note: 'Map cm × km per cm, in km.' });
  const f5 = fld('sin', 'Sinuosity (road ÷ straight)', 'calculation', 1, L / D, 0.03, { dp: 2, own: (g) => (g('rd_cm') && g('st_cm') ? g('rd_cm')! / g('st_cm')! : null), note: 'Sinuosity = road distance ÷ straight distance.' });
  const f6 = fld('pct', 'The road is longer than the direct line by', 'calculation', 1, (L / D - 1) * 100, 2, { unit: '%', dp: 0, own: (g) => (g('rd_cm') && g('st_cm') ? (g('rd_cm')! / g('st_cm')! - 1) * 100 : null), note: 'Percentage longer = (road − straight) ÷ straight × 100.' });
  const c1 = cho('fromwhere', 'Where do you measure from?', 'interpretation', 1.5, 'point', [['point', 'The exact point stated (here the centre mark)'], ['edge', 'The nearest edge of the settlement'], ['grid', 'The nearest grid line']], 'Measure from the point stated, not the edge of the settlement.');
  const c2 = cho('why', 'A sinuosity above 1 means the route', 'interpretation', 1.5, 'bends', [['bends', 'bends, so travel is longer than the direct distance'], ['steep', 'must be steeper than the direct line'], ['short', 'is shorter than the direct line']], 'A sinuosity above 1 means the route is longer than the direct line.');
  const builds: GeoBuild[] = [
    bld('ruler', 2, (x) => (rulerOn(x, A, B) ? 1 : 0), 'Lay the ruler from A to B.'),
    bld('thread', 3, (x) => Math.min(1, runCover(x.runs, part) / 0.9), 'Lay the thread (or walk the dividers) along the whole road from A to B, following its bends.'),
  ];
  const stringPts = part.filter((_, i) => i % 2 === 0).concat([part[part.length - 1]!]);
  const steps: GeoStep[] = [
    rulerStep('ruler', 'Measure the straight line A–B', 'As the crow flies.', 'For the straight distance I lay the ruler from A to B, from the marks and not the settlement edges.', A, B),
    recStep('st', 'Record it and convert', 'In km.', 'Map centimetres times kilometres per centimetre.', [f1, f3]),
    { id: 'thread', label: 'Lay the thread along the road from A to B', why: 'Follow every bend, then straighten it against the ruler.', say: 'For the curved route I lay the thread along the road, pressing it into each bend, then straighten it against the ruler.', panel: 'map', tool: 'string', done: (x) => runCover(x.runs, part) >= 0.9, apply: (x) => void x.runs.push({ tool: 'STRING', pts: stringPts }) },
    recStep('rd', 'Read the thread and convert', 'Measure the straightened thread.', 'I read the straightened thread and convert it the same way.', [f2, f4]),
    recStep('sin', 'Work out the sinuosity', 'Road ÷ straight.', 'Road divided by straight gives the sinuosity: how many times longer the road is.', [f5, f6]),
    ansStep('ideas', 'Answer the questions', 'Think about what you did.', 'Always the point stated, and sinuosity above one means the route bends.', [c1, c2]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.DISTANCE,
    brief: [`On this ${shortRf(s)} sheet of ${s.name}, find the straight-line and the road distance between the marks A and B.`, 'Use the ruler for the straight distance and the thread or dividers for the road, then convert both to kilometres.', 'Calculate the sinuosity and how much longer the road is than the direct line.'],
    panels: ['map'],
    tools: ['hand', 'ruler', 'string', 'dividers'],
    fields: [f1, f2, f3, f4, f5, f6],
    choices: [c1, c2],
    checks: [],
    builds,
    steps,
    solution: [`Straight A–B = ${D.toFixed(1)} cm → ${(D * k).toFixed(2)} km.`, `Road A–B = ${L.toFixed(1)} cm → ${(L * k).toFixed(2)} km.`, `Sinuosity = ${(L / D).toFixed(2)}, so the road is about ${((L / D - 1) * 100).toFixed(0)}% longer.`],
  };
  return { def, ex: { ...NO_EXTRAS, marks: { A, B } } };
}

// ------------------------------------------------------------------ BEARING

function taskBearing(seed: number, s: GeoSheet) {
  const r = labRandom(seed, 'geo-bearing');
  const town = s.settlements.find((x) => x.kind === 'TOWN')!;
  const A = town.p;
  const far = s.settlements.filter((x) => dist(x.p, A) >= 4 && dist(x.p, A) <= 12);
  const b = labPick(r, far);
  const apart = far.filter((x) => {
    const d = Math.abs(bearingOf(A, x.p) - bearingOf(A, b.p));
    return Math.min(d, 360 - d) > 50;
  });
  const c = apart.length ? labPick(r, apart) : far[(far.indexOf(b) + 1) % far.length]!;
  const B = b.p;
  const C = c.p;
  const ab = bearingOf(A, B);
  const ac = bearingOf(A, C);
  const back = (x: number) => (x + 180) % 360;
  const three = (x: number) => String(Math.round(x) % 360).padStart(3, '0');
  const f1 = fld('ab', 'Bearing of B from A', 'readings', 2, ab, 2, { kind: 'bearing', unit: '°', dp: 0, note: `Bearing of B from A = ${three(ab)}° (three figures, clockwise from grid north).` });
  const f2 = fld('ac', 'Bearing of C from A', 'readings', 2, ac, 2, { kind: 'bearing', unit: '°', dp: 0, note: `Bearing of C from A = ${three(ac)}°.` });
  const fromOwn = (id: string) => (g: (x: string) => number | null) => (g(id) === null ? null : (g(id)! + 180) % 360);
  const f3 = fld('back_ab', 'Back bearing: A from B', 'calculation', 2, back(ab), 2, { kind: 'num', unit: '°', dp: 0, own: fromOwn('ab'), note: 'Back bearing = bearing ± 180°.' });
  const f4 = fld('back_ac', 'Back bearing: A from C', 'calculation', 2, back(ac), 2, { kind: 'num', unit: '°', dp: 0, own: fromOwn('ac'), note: 'Back bearing = bearing ± 180°.' });
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const c1 = cho('dir_ab', 'Direction of B from A (16 points)', 'interpretation', 1, compass16(ab), pts, `B lies ${compass16(ab)} of A.`);
  const c2 = cho('dir_ac', 'Direction of C from A (16 points)', 'interpretation', 1, compass16(ac), pts, `C lies ${compass16(ac)} of A.`);
  const c3 = cho('rule', 'A bearing is measured', 'interpretation', 1, 'cw', [['cw', 'clockwise from north, in three figures'], ['acw', 'anticlockwise from north'], ['east', 'clockwise from east']], 'Whole-circle bearings run clockwise from north in three figures (065°, not 65°).');
  const builds: GeoBuild[] = [bld('ab', 2.5, (x) => (protractorOn(x, A, B) ? 1 : 0), 'Set the protractor on A with 0° on grid north and draw the line through B.'), bld('ac', 2.5, (x) => (protractorOn(x, A, C) ? 1 : 0), 'Set the protractor on A and draw the line through C.')];
  const prot = (id: string, label: string, say: string, b0: P): GeoStep => ({ id, label, why: 'Centre on the point you are measuring FROM, 0° on grid north.', say, panel: 'map', tool: 'protractor', done: (x) => protractorOn(x, A, b0), apply: (x) => void x.protractors.push({ c: A, t: b0 }) });
  const steps: GeoStep[] = [
    prot('pb', 'Protractor on A, line to B', 'The north line runs parallel to the eastings. The centre goes on A, the point I measure from, and I join A to B.', B),
    recStep('rb', 'Read the bearing of B and its back bearing', 'Clockwise from north, three figures.', 'I read clockwise from north to the line and write it in three figures. Add or subtract 180 for the back bearing.', [f1, f3]),
    prot('pc', 'Protractor on A, line to C', 'Now the same from A to C.', C),
    recStep('rc', 'Read the bearing of C and its back bearing', 'Clockwise from north, three figures.', 'Bigger than 180? Then I subtract 180 to get the back bearing.', [f2, f4]),
    ansStep('dirs', 'Give each direction on the 16-point compass', 'Each point of the compass is 22.5° wide.', 'Each of the sixteen points is 22.5 degrees wide.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.BEARING,
    brief: ['Using the protractor on the sheet, find the whole-circle bearing of B from A and of C from A.', 'Calculate the back bearings of A from B and of A from C.', 'State each direction on the 16 points of the compass. Grid north is parallel to the eastings.'],
    panels: ['map'],
    tools: ['hand', 'protractor'],
    fields: [f1, f2, f3, f4],
    choices: [c1, c2, c3],
    checks: [],
    builds,
    steps,
    solution: [`B from A = ${three(ab)}° (${compass16(ab)}); A from B = ${three(back(ab))}°.`, `C from A = ${three(ac)}° (${compass16(ac)}); A from C = ${three(back(ac))}°.`],
  };
  return { def, ex: { ...NO_EXTRAS, marks: { A, B, C } } };
}

// ------------------------------------------------------------------ GRIDAREA

export const squareKey = (e: number, n: number) => `${e},${n}`;
/** How much of each 2 cm square lies inside a polygon (0–1). */
export function squareCover(poly: readonly P[]): Record<string, number> {
  const out: Record<string, number> = {};
  const N = 14;
  for (let e = 0; e < SQUARES_E; e++) {
    for (let n = 0; n < SQUARES_N; n++) {
      let hit = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (inPolygon([(e + (i + 0.5) / N) * SQUARE_CM, (n + (j + 0.5) / N) * SQUARE_CM], poly)) hit++;
      if (hit) out[squareKey(e, n)] = hit / (N * N);
    }
  }
  return out;
}
function taskGridArea(seed: number, s: GeoSheet) {
  const r = labRandom(seed, 'geo-gridarea');
  const f1 = feature(s, 'school');
  const f2 = feature(s, 'church');
  const f3 = feature(s, 'mosque');
  const pick = labPick(r, ['market', 'post', 'borehole'] as const);
  const q = feature(s, pick);
  const cover = squareCover(s.forest);
  const keys = Object.keys(cover);
  const full = keys.filter((k) => cover[k]! >= 0.985);
  const part = keys.filter((k) => cover[k]! < 0.985);
  const squares = full.length + part.length / 2;
  const trueArea = keys.reduce((t, k) => t + cover[k]!, 0) * s.squareKm2;
  const name: Record<string, string> = { market: 'Market', post: 'Post office', borehole: 'Borehole', school: 'School', church: 'Church', mosque: 'Mosque' };
  const g4 = fld('g4', 'Four-figure reference of the school', 'readings', 1, 0, 0, { kind: 'ref4', text: gridRef4(s, f1.p), dp: 0, note: `School: ${gridRef4(s, f1.p)} (eastings first, the line to the left, then the line below).` });
  const g6a = fld('g6a', 'Six-figure reference of the church', 'readings', 1.5, 0, 1, { kind: 'ref6', text: gridRef6(s, f2.p), dp: 0, note: `Church: about ${gridRef6(s, f2.p)}.` });
  const g6b = fld('g6b', 'Six-figure reference of the mosque', 'readings', 1.5, 0, 1, { kind: 'ref6', text: gridRef6(s, f3.p), dp: 0, note: `Mosque: about ${gridRef6(s, f3.p)}.` });
  const cf = fld('full', 'Complete squares in the forest reserve', 'calculation', 1, full.length, 2, { dp: 0, note: `About ${full.length} complete squares.` });
  const cp = fld('part', 'Part squares', 'calculation', 1, part.length, 4, { dp: 0, note: `About ${part.length} part squares.` });
  const cs = fld('sq', 'Total squares (complete + part ÷ 2)', 'calculation', 1, squares, 0.05, { own: (g) => (g('full') === null || g('part') === null ? null : g('full')! + g('part')! / 2), note: 'Total = complete + part ÷ 2.' });
  const ca = fld('area', 'Area of the forest reserve', 'calculation', 1, squares * s.squareKm2, 0.02, { unit: 'km²', dp: 2, own: (g) => (g('sq') === null ? null : g('sq')! * s.squareKm2), note: `Each grid square covers ${s.squareKm2} km².` });
  const c1 = cho('what', `What stands at ${gridRef6(s, q.p)}?`, 'interpretation', 1, name[pick]!, Object.values(name), `${gridRef6(s, q.p)} is the ${name[pick]!.toLowerCase()}.`);
  const c2 = cho('order', 'Which number comes first in a grid reference?', 'interpretation', 1, 'east', [['east', 'The easting (along the corridor), then the northing'], ['north', 'The northing, then the easting'], ['either', 'Either, if you say which']], 'Along the corridor, then up the stairs.');
  const c3 = cho('line', 'Which lines do you read for a feature?', 'interpretation', 1, 'lb', [['lb', 'The line to the left of it and the line below it'], ['rt', 'The line to the right and the line above'], ['near', 'Whichever lines are nearest']], 'Always the line to the left and the line below.');
  const romerNear = (x: GeoMapsState, p: P) => pinsOf(x, 'romer').some((m) => dist(m.p, p) <= 0.5);
  const squaresRight = (x: GeoMapsState) => {
    let ok = 0;
    for (const k of keys) if (x.squares[k] === (cover[k]! >= 0.985 ? 'F' : 'P')) ok++;
    const extra = Object.keys(x.squares).filter((k) => !cover[k]).length;
    return Math.max(0, ok - extra) / keys.length;
  };
  const builds: GeoBuild[] = [
    bld('romer', 2, (x) => [f2.p, f3.p].filter((p) => romerNear(x, p)).length / 2, 'Set the tenths square on each feature to read its six-figure reference.'),
    bld('squares', 3, (x) => Math.min(1, squaresRight(x) / 0.85), 'Mark every square of the forest reserve: complete squares and part squares.'),
  ];
  const steps: GeoStep[] = [
    recStep('g4', 'Find the school’s four-figure reference', 'Line to the left, then line below.', 'Along the corridor, then up the stairs: the line to the left of the school, then the line below it.', [g4]),
    pinStep('romer', 'Set the tenths square on the church and the mosque', 'Estimate tenths of a square in each direction.', 'Six figures means tenths of a square: I lay the tenths square on each feature and read east, then north.', 'romer', [f2.p, f3.p], 0.5, 'map', 'romer'),
    recStep('g6', 'Record both six-figure references', 'Three digits east, three north.', 'Two figures from the line, one for the tenths: east first, then north.', [g6a, g6b]),
    {
      id: 'squares',
      label: 'Mark the complete and part squares of the forest',
      why: 'Tap a square once for complete, twice for part.',
      say: 'Now the forest reserve. I go through the grid: complete squares first, then every square the forest only partly fills.',
      panel: 'map',
      tool: 'squares',
      done: (x) => squaresRight(x) >= 0.85,
      apply: (x) => {
        for (const k of keys) x.squares[k] = cover[k]! >= 0.985 ? 'F' : 'P';
      },
    },
    recStep('count', 'Count the squares and find the area', 'Complete + part ÷ 2, then × the area of one square.', `Complete squares plus half the part squares, times ${s.squareKm2} square kilometres for each square.`, [cf, cp, cs, ca]),
    ansStep('ideas', 'Answer the questions', 'Use the grid.', 'Eastings first, the line to the left, the line below.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.GRIDAREA,
    brief: [`On this ${shortRf(s)} sheet of ${s.name}, give the four-figure reference of the school and six-figure references of the church and the mosque.`, `Say what stands at ${gridRef6(s, q.p)}.`, 'Estimate the area of the forest reserve by counting complete and part grid squares.'],
    panels: ['map'],
    tools: ['hand', 'romer', 'squares'],
    fields: [g4, g6a, g6b, cf, cp, cs, ca],
    choices: [c1, c2, c3],
    checks: [],
    builds,
    steps,
    solution: [`School ${gridRef4(s, f1.p)}; church ${gridRef6(s, f2.p)}; mosque ${gridRef6(s, f3.p)}; ${gridRef6(s, q.p)} is the ${name[pick]!.toLowerCase()}.`, `Forest: ${full.length} complete + ${part.length} part ÷ 2 = ${squares} squares × ${s.squareKm2} km² ≈ ${(squares * s.squareKm2).toFixed(2)} km² (measured exactly: ${trueArea.toFixed(2)} km²).`],
  };
  return { def, ex: { ...NO_EXTRAS } };
}

// ------------------------------------------------------------------ REDUCE

function bestRect(wSq: number, hSq: number, score: (r: GeoRect) => number, id: string, label: string): GeoRect {
  let best: GeoRect | null = null;
  let bs = -Infinity;
  for (let e = 0; e + wSq <= SQUARES_E; e++) {
    for (let n = 0; n + hSq <= SQUARES_N; n++) {
      const r: GeoRect = { id, label, x: e * SQUARE_CM, y: n * SQUARE_CM, w: wSq * SQUARE_CM, h: hSq * SQUARE_CM };
      const v = score(r);
      if (v > bs) {
        bs = v;
        best = r;
      }
    }
  }
  return best!;
}
export const inRect = (p: P, r: GeoRect, m = 0) => p[0] >= r.x + m && p[0] <= r.x + r.w - m && p[1] >= r.y + m && p[1] <= r.y + r.h - m;
/** The runs of a polyline inside a rectangle. */
export function clipRuns(pts: readonly P[], r: GeoRect): P[][] {
  const out: P[][] = [];
  let cur: P[] = [];
  for (const p of pts) {
    if (inRect(p, r)) cur.push(p);
    else {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

function taskReduce(seed: number, s: GeoSheet) {
  const r = labRandom(seed, 'geo-reduce');
  const k = labPick(r, [0.5, 0.5, 2]);
  const wSq = k < 1 ? 6 : 3;
  const hSq = k < 1 ? 4 : 2;
  const main = s.streams.find((x) => x.main)!.pts;
  const frame = bestRect(wSq, hSq, (q) => Math.max(0, ...clipRuns(main, q).map(polyLength)), 'frame', 'Frame');
  const src = clipRuns(main, frame).sort((a, b) => polyLength(b) - polyLength(a))[0] ?? [];
  const want = src.map((p): P => [(p[0] - frame.x) * k, (p[1] - frame.y) * k]);
  const newW = frame.w * k;
  const newH = frame.h * k;
  const nd = s.denom / k;
  const f1 = fld('old_w', 'Width of the frame on the map', 'readings', 1, frame.w, 0.1, { unit: 'cm', note: `The frame is ${frame.w} cm wide.` });
  const f2 = fld('old_h', 'Height of the frame on the map', 'readings', 1, frame.h, 0.1, { unit: 'cm', note: `The frame is ${frame.h} cm high.` });
  const f3 = fld('new_w', 'Width of the new frame', 'readings', 1, newW, 0.05, { unit: 'cm', own: (g) => (g('old_w') === null ? null : g('old_w')! * k), note: 'Multiply each LENGTH by the factor.' });
  const f4 = fld('new_h', 'Height of the new frame', 'readings', 1, newH, 0.05, { unit: 'cm', own: (g) => (g('old_h') === null ? null : g('old_h')! * k), note: 'Multiply each LENGTH by the factor.' });
  const f5 = fld('new_rf', 'New RF', 'calculation', 2, nd, 0, { kind: 'rf', dp: 0, note: `New RF = 1:(${s.denom} ÷ ${k}) = 1:${nd}.` });
  const f6 = fld('old_area', 'Area of the frame on the paper', 'calculation', 1, frame.w * frame.h, 0.5, { unit: 'cm²', dp: 0, note: 'Width × height.' });
  const f7 = fld('new_area', 'Area of the new frame on the paper', 'calculation', 1, newW * newH, 0.5, { unit: 'cm²', dp: 0, note: `The paper area changes by (${k})² = ${k * k}.` });
  const c1 = cho('areaby', `A linear factor of ${k} changes the area on paper by`, 'interpretation', 1.5, String(k * k), [['0.25', '¼ of the original'], ['0.5', '½ of the original'], ['2', '2 times'], ['4', '4 times']], `Area changes by the factor squared: ${k * k}.`);
  const c2 = cho('kind', 'The new map has', 'interpretation', 1.5, k < 1 ? 'smaller' : 'larger', [['smaller', 'a smaller scale than the original'], ['larger', 'a larger scale than the original'], ['same', 'the same scale']], 'Reducing a map makes the scale smaller; the denominator grows.');
  const tol = k < 1 ? 0.2 : 0.4;
  const lineScore = (x: GeoMapsState) => {
    const m = lineMatch(x.lines.copy, want, tol * 1.5);
    return m.dev <= tol ? Math.min(1, m.cover / 0.75) : m.dev <= tol * 2 ? 0.5 * Math.min(1, m.cover / 0.75) : 0;
  };
  const builds: GeoBuild[] = [bld('line', 3, lineScore, `Copy the river square by square: note where it crosses each square’s edges, then join those points.`), bld('elements', 2, (x) => ['title', 'north', 'key', 'scale'].filter((c) => x.checks.includes(c)).length / 4, 'Finish the copy with a title, north arrow, key and the new scale.')];
  const copyPts = want.filter((_, i) => i % 3 === 0).concat(want.length ? [want[want.length - 1]!] : []).slice(0, 110);
  const steps: GeoStep[] = [
    recStep('frame', 'Measure the frame and work out the new one', 'Multiply each LENGTH by the factor: never the area.', `The frame is ${frame.w} by ${frame.h} centimetres. Every length is multiplied by ${k}, so the new frame is ${newW} by ${newH}, with squares of ${SQUARE_CM * k} centimetres.`, [f1, f2, f3, f4]),
    { id: 'copy', label: 'Copy the river square by square', why: 'Note where it crosses the edges of each square, then join the points.', say: 'I copy one square at a time: where the river crosses each edge, I mark the same place in the new square, and then join the marks.', panel: 'copy', tool: 'pencil', done: (x) => lineScore(x) >= 1, apply: (x) => void (x.lines.copy = copyPts) },
    checkStep('elems', 'Add title, north arrow, key and scale', 'A map without them is unfinished.', 'A title, a north arrow, a key and the new scale: without them it is only a sketch.', ['title', 'north', 'key', 'scale'], 'copy'),
    recStep('rf', 'Work out the new RF and the areas', `New RF = 1:(old denominator ÷ ${k}).`, 'The new RF changes in the same proportion as the lengths. The paper area changes by the square of the factor.', [f5, f6, f7]),
    ansStep('ideas', 'Answer the questions', 'Length, not area.', 'Halve the lengths and the area falls to a quarter.', [c1, c2]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.REDUCE,
    brief: [`The dashed frame on this ${shortRf(s)} sheet covers the ${s.river}.`, `${k < 1 ? 'Reduce' : 'Enlarge'} the framed part to ${k < 1 ? 'half' : 'twice'} its length by the square method: same number of squares, each ${SQUARE_CM * k} cm wide.`, 'Copy the river into the new grid, add the map elements, and give the new RF and paper areas.'],
    panels: ['map', 'copy'],
    tools: ['hand', 'ruler', 'pencil'],
    fields: [f1, f2, f3, f4, f5, f6, f7],
    choices: [c1, c2],
    checks: mapElements,
    builds,
    steps,
    solution: [`Frame ${frame.w} × ${frame.h} cm → ${newW} × ${newH} cm with ${SQUARE_CM * k} cm squares.`, `New RF 1:${nd}. Paper area ${frame.w * frame.h} cm² → ${newW * newH} cm² (× ${k * k}).`],
  };
  return { def, ex: { ...NO_EXTRAS, rects: [frame], copy: { frame, k, want, src } } };
}

// ------------------------------------------------------------------ RELIEF

const RELIEF_LABEL: Record<ReliefKind, string> = { CONICAL: 'Conical hill', HILL: 'Rounded hill', SADDLE: 'Saddle', RIDGE: 'Ridge', SPUR: 'Spur', VALLEY: 'Valley', PLATEAU: 'Plateau', ESCARPMENT: 'Escarpment', PLAIN: 'Plain' };
export const RELIEF_EXPLAIN: Record<ReliefKind, string> = {
  CONICAL: 'closed rings, evenly and closely spaced',
  HILL: 'closed rings',
  SADDLE: 'a low point between two hills: contours hourglass in',
  RIDGE: 'long, narrow closed contours',
  SPUR: 'a V pointing downhill',
  VALLEY: 'a V pointing uphill, with a stream',
  PLATEAU: 'high and flat: few contours on top, crowded at the edges',
  ESCARPMENT: 'contours crowded together along a steep edge',
  PLAIN: 'low and flat: contours few and far apart',
};
function taskRelief(seed: number, s: GeoSheet) {
  const r = labRandom(seed, 'geo-relief');
  const rel = s.relief;
  const extra = shuffle(r, (['CONICAL', 'SADDLE', 'PLATEAU', 'ESCARPMENT', 'RIDGE', 'PLAIN'] as ReliefKind[]).filter((k) => rel[k]));
  const kinds = shuffle(r, [...(['VALLEY', 'SPUR'] as ReliefKind[]).filter((k) => rel[k]), ...extra]).slice(0, 5);
  const letters = ['P', 'Q', 'R', 'S', 'T'];
  const marks: Record<string, P> = {};
  kinds.forEach((k, i) => (marks[letters[i]!] = rel[k]!));
  const trig = feature(s, 'trig');
  const hAt = (p: P) => geoHeight(s, p[0], p[1]);
  // A point on the hill's flank that does not sit on a contour.
  let X: P = [trig.p[0] + 1, trig.p[1]];
  for (let a = 0; a < 6.3; a += 0.3) {
    const q: P = [trig.p[0] + Math.cos(a) * 1.4, trig.p[1] + Math.sin(a) * 1.4];
    const f = (hAt(q) % s.interval) / s.interval;
    if (f > 0.3 && f < 0.7 && q[0] > 1 && q[1] > 1 && q[0] < SHEET_W - 1 && q[1] < SHEET_H - 1 && Object.values(marks).every((m) => dist(m, q) > 0.8)) {
      X = q;
      break;
    }
  }
  marks.X = X;
  const hx = hAt(X);
  const f1 = fld('interval', 'Contour interval', 'readings', 1, s.interval, 0, { unit: 'm', dp: 0, note: `Contours are drawn every ${s.interval} m: divide the difference between two labelled contours by the intervals between them.` });
  const f2 = fld('top', 'Height of the trigonometrical point', 'readings', 1, trig.h!, 1, { unit: 'm', dp: 0, note: `The triangle is marked ${trig.h} m.` });
  const f3 = fld('hx', 'Height of point X', 'readings', 2, hx, s.interval * 0.6, { unit: 'm', dp: 0, note: `X lies between contours, at about ${Math.round(hx)} m.` });
  const a = kinds[0]!;
  const b = kinds[1]!;
  const fa = fld('ref_a', `Six-figure reference of point ${letters[0]}`, 'calculation', 1, 0, 2, { kind: 'ref6', text: gridRef6(s, rel[a]!), dp: 0, note: `${letters[0]} is at about ${gridRef6(s, rel[a]!)}.` });
  const fb = fld('ref_b', `Six-figure reference of point ${letters[1]}`, 'calculation', 1, 0, 2, { kind: 'ref6', text: gridRef6(s, rel[b]!), dp: 0, note: `${letters[1]} is at about ${gridRef6(s, rel[b]!)}.` });
  const fr = fld('rise', 'Height of the trigonometrical point above X', 'calculation', 2, trig.h! - hx, s.interval * 0.7, { unit: 'm', dp: 0, own: (g) => (g('top') === null || g('hx') === null ? null : g('top')! - g('hx')!), note: 'Subtract the two heights.' });
  const options = (Object.keys(RELIEF_LABEL) as ReliefKind[]).map((k): [string, string] => [k, RELIEF_LABEL[k]]);
  const relCh = kinds.map((k, i) => cho(`rel_${letters[i]}`, `Point ${letters[i]} is`, 'interpretation', 0.5, k, options, `${letters[i]}: ${RELIEF_LABEL[k].toLowerCase()} — ${RELIEF_EXPLAIN[k]}.`));
  const down = compass8(bearingOf([0, 0], [-s.uphill[0], -s.uphill[1]]));
  const c6 = cho('slope', 'The land as a whole slopes down towards the', 'interpretation', 3 - relCh.length * 0.5, down, ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], `Contour values fall towards the ${down}.`);
  const builds: GeoBuild[] = [
    bld('top', 1, (x) => (pinNear(x, 'top', trig.p, 0.4) ? 1 : 0), 'Pin the highest point of the sheet.'),
    bld('romer', 2, (x) => [rel[a]!, rel[b]!].filter((p) => pinsOf(x, 'romer').some((m) => dist(m.p, p) <= 0.5)).length / 2, 'Set the tenths square on the two points you are locating.'),
    bld('valley', 1, (x) => (x.sets.sk_valley === 'UP' ? 1 : 0), 'In a valley the V of the contours points uphill.'),
    bld('spur', 1, (x) => (x.sets.sk_spur === 'DOWN' ? 1 : 0), 'On a spur the V of the contours points downhill.'),
  ];
  const steps: GeoStep[] = [
    recStep('ci', 'Find the contour interval', 'Difference of two labelled contours ÷ the intervals between them.', 'Two labelled contours: I divide their difference by the number of intervals between them, not lines.', [f1]),
    pinStep('top', 'Pin the highest point', 'Rising contour values lead you to it.', 'The values rise to the triangle: that is the trigonometrical point.', 'top', [trig.p], 0.4),
    recStep('heights', 'Read the height of the top and of X', 'X lies between two contours: estimate its fraction of the way.', 'X lies part way between two contours, so I estimate the fraction and add it to the lower one.', [f2, f3, fr]),
    pinStep('romer', `Set the tenths square on ${letters[0]} and ${letters[1]}`, 'Tenths east, then tenths north.', 'Features must be located: name it and give its six-figure reference.', 'romer', [rel[a]!, rel[b]!], 0.5, 'map', 'romer'),
    recStep('refs', 'Record both references', 'East first.', 'Eastings first, then northings.', [fa, fb]),
    { id: 'sketch', label: 'Sketch the valley and the spur', why: 'V pointing uphill: valley. V pointing downhill: spur.', say: 'A V pointing uphill is a valley. A V pointing downhill is a spur. Look at the contour values, not at the shape alone.', panel: 'sketch', done: (x) => x.sets.sk_valley === 'UP' && x.sets.sk_spur === 'DOWN', apply: (x) => Object.assign(x.sets, { sk_valley: 'UP', sk_spur: 'DOWN' }) },
    ansStep('name', 'Name each lettered feature', 'Look at the pattern and at the values.', 'Now each lettered feature: I name it from the pattern and the values together.', [...relCh, c6]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.RELIEF,
    brief: [`Study the contours on this sheet of ${s.name}.`, 'Find the contour interval, pin the highest point, and read the heights of the trigonometrical point and of X.', `Name the relief feature at each of ${letters.slice(0, kinds.length).join(', ')}, and give six-figure references for ${letters[0]} and ${letters[1]}.`, 'Sketch how contours show a valley and a spur.'],
    panels: ['map', 'sketch'],
    tools: ['hand', 'pin', 'romer', 'ruler'],
    fields: [f1, f2, f3, fa, fb, fr],
    choices: [...relCh, c6],
    checks: [],
    builds,
    steps,
    solution: [`Contour interval ${s.interval} m; top ${trig.h} m; X ≈ ${Math.round(hx)} m.`, ...kinds.map((k, i) => `${letters[i]}: ${RELIEF_LABEL[k]} (${RELIEF_EXPLAIN[k]}).`)],
  };
  return { def, ex: { ...NO_EXTRAS, marks, pinKinds: [{ k: 'top', label: 'Highest point', colour: '#c62828' }] } };
}

// ------------------------------------------------------------------ GRADIENT

function taskGradient(seed: number, s: GeoSheet) {
  const r = labRandom(seed, 'geo-gradient');
  const X = feature(s, 'trig');
  const spots = s.features.filter((f) => f.kind === 'SPOT' && f.id.startsWith('spot') && f.id !== 'spot-hill' && f.id !== 'spot-plateau' && dist(f.p, X.p) >= 3.5 && X.h! - f.h! >= s.interval * 3);
  const pool = shuffle(r, spots.length >= 2 ? spots : s.features.filter((f) => f.kind === 'SPOT' && f.id !== 'spot-hill' && dist(f.p, X.p) >= 2.5));
  const Y = pool[0]!;
  const Z = pool.find((f) => {
    const gy = (X.h! - Y.h!) / dist(X.p, Y.p);
    const gz = (X.h! - f.h!) / dist(X.p, f.p);
    return f !== Y && Math.abs(gy - gz) / gy > 0.06;
  }) ?? pool[1] ?? Y;
  const d = dist(X.p, Y.p);
  const dz = dist(X.p, Z.p);
  const he = d * s.kmPerCm * 1000;
  const vi = X.h! - Y.h!;
  const heE = (g: (x: string) => number | null) => (g('d_cm') === null ? null : g('d_cm')! * s.kmPerCm * 1000);
  const f1 = fld('hx', 'Height of X', 'readings', 1, X.h!, 0.5, { unit: 'm', dp: 0, note: `X is printed ${X.h} m.` });
  const f2 = fld('hy', 'Height of Y', 'readings', 1, Y.h!, 0.5, { unit: 'm', dp: 0, note: `Y is printed ${Y.h} m.` });
  const f3 = fld('d_cm', 'Map distance X–Y', 'readings', 2, d, 0.15, { unit: 'cm', note: `X–Y is ${d.toFixed(1)} cm on the map.` });
  const f4 = fld('vi', 'Vertical interval (VI)', 'calculation', 1, vi, 0.5, { unit: 'm', dp: 0, own: (g) => (g('hx') === null || g('hy') === null ? null : Math.abs(g('hx')! - g('hy')!)), note: 'VI = the difference in height (not the contour interval).' });
  const f5 = fld('he', 'Horizontal equivalent (HE)', 'calculation', 1, he, 0.015, { unit: 'm', rel: true, dp: 0, own: heE, note: 'HE in METRES: map cm × km per cm × 1000.' });
  const f6 = fld('one_in', 'Gradient, 1 in', 'calculation', 1, he / vi, 0.035, { kind: 'oneIn', rel: true, own: (g) => (g('he') && g('vi') ? g('he')! / g('vi')! : null), note: 'Gradient = VI ÷ HE, written as 1 in (HE ÷ VI).' });
  const f7 = fld('angle', 'Angle of slope', 'calculation', 1, (Math.atan(vi / he) * 180) / Math.PI, 0.25, { unit: '°', own: (g) => (g('he') && g('vi') ? (Math.atan(g('vi')! / g('he')!) * 180) / Math.PI : null), note: 'Angle = tan⁻¹(VI ÷ HE).' });
  const steeper = (X.h! - Y.h!) / d >= (X.h! - Z.h!) / dz ? 'XY' : 'XZ';
  const c1 = cho('steeper', 'Which is the steeper line of ascent on average?', 'interpretation', 1.5, steeper, [['XY', 'Y to X'], ['XZ', 'Z to X']], 'Work out both gradients: the smaller the “1 in n”, the steeper.');
  const c2 = cho('meaning', `A gradient of 1 in 10 means`, 'interpretation', 1.5, 'rise', [['rise', 'a rise of 1 m for every 10 m along the ground'], ['fall', 'a rise of 10 m for every 1 m along the ground'], ['pct', 'a slope of 1 degree in every 10 degrees']], 'One metre up for every ten metres along.');
  const builds: GeoBuild[] = [bld('xy', 3, (x) => (rulerOn(x, X.p, Y.p) ? 1 : 0), 'Lay the ruler from X to Y.'), bld('xz', 2, (x) => (rulerOn(x, X.p, Z.p) ? 1 : 0), 'Lay the ruler from X to Z as well, to compare the slopes.')];
  const steps: GeoStep[] = [
    recStep('h', 'Read the heights of X and Y', 'Printed beside each point.', 'Each point has a spot height printed beside it. The difference is the vertical interval: never the contour interval.', [f1, f2, f4]),
    rulerStep('xy', 'Measure X to Y', 'Point to point.', 'I measure the map distance and turn it into metres: the horizontal equivalent must be in the same unit as the height.', X.p, Y.p),
    recStep('he', 'Record the distance and the HE', 'HE in metres.', 'Map centimetres times kilometres per centimetre times one thousand.', [f3, f5]),
    recStep('grad', 'Express the gradient and the angle', '1 in (HE ÷ VI).', 'VI over HE, written as one in something; and the angle is the inverse tangent of the same fraction.', [f6, f7]),
    rulerStep('xz', 'Measure X to Z', 'To compare.', 'Now X to Z the same way, to see which slope is steeper.', X.p, Z.p),
    ansStep('ideas', 'Compare the slopes', 'The smaller n in “1 in n”, the steeper.', 'The smaller the number after one in, the steeper the slope.', [c1, c2]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.GRADIENT,
    brief: [`Scale ${shortRf(s)}. Find the average gradient from Y up to the trigonometrical point X. Give it as “1 in n” and as an angle.`, 'Then find whether the slope from Z or from Y is steeper on average. Heights are printed beside the points.'],
    panels: ['map'],
    tools: ['hand', 'ruler'],
    fields: [f1, f2, f4, f3, f5, f6, f7],
    choices: [c1, c2],
    checks: [],
    builds,
    steps,
    solution: [`VI = ${X.h} − ${Y.h} = ${vi} m. HE = ${d.toFixed(1)} cm × ${s.kmPerCm * 1000} m = ${he.toFixed(0)} m.`, `Gradient 1 in ${(he / vi).toFixed(1)}; angle ${((Math.atan(vi / he) * 180) / Math.PI).toFixed(1)}°.`],
  };
  return { def, ex: { ...NO_EXTRAS, marks: { X: X.p, Y: Y.p, Z: Z.p } } };
}

// ------------------------------------------------------------------ PROFILE

function taskProfile(seed: number, s: GeoSheet) {
  const r = labRandom(seed, 'geo-profile');
  const hill = s.relief.CONICAL ?? s.relief.HILL!;
  let A: P = [3, 3];
  let B: P = [15, 12];
  let best = -1;
  // Most sheets offer a good line within 70 tries; keep looking on the rare sheet that does not.
  for (let k = 0; k < 800 && (k < 70 || best < 0); k++) {
    const a = r() * Math.PI;
    const len = 9 + r() * 6;
    const u = 0.25 + r() * 0.5;
    const off = (r() - 0.5) * 2.6;
    const c: P = [hill[0] + Math.sin(a) * off, hill[1] - Math.cos(a) * off];
    const p: P = [c[0] - Math.cos(a) * len * u, c[1] - Math.sin(a) * len * u];
    const q: P = [c[0] + Math.cos(a) * len * (1 - u), c[1] + Math.sin(a) * len * (1 - u)];
    if (p[0] < 1 || p[1] < 1 || q[0] < 1 || q[1] < 1 || p[0] > SHEET_W - 1 || q[0] > SHEET_W - 1 || p[1] > SHEET_H - 1 || q[1] > SHEET_H - 1) continue;
    const crossed = contourCrossings(s, p, q);
    const n = crossed.length;
    if (n < 6 || n > 24 || new Set(crossed.map((c) => c.h)).size < 3) continue;
    const m = maxOver(s, p, q);
    if (Math.abs(m.over) < s.interval * 0.5) continue;
    const score = 24 - Math.abs(n - 12) + (k % 2 ? (m.over > 0 ? 1 : 0) : m.over < 0 ? 2 : 0) + r();
    if (score > best) {
      best = score;
      A = p;
      B = q;
    }
  }
  const crossings = contourCrossings(s, A, B);
  const L = dist(A, B);
  const hA = geoHeight(s, A[0], A[1]);
  const hB = geoHeight(s, B[0], B[1]);
  const m = maxOver(s, A, B);
  const hs = crossings.map((c) => c.h);
  const range = Math.max(...hs, hA, hB) - Math.min(...hs, hA, hB);
  const niceV = [10, 20, 25, 50, 100].find((x) => range / x <= 8) ?? 100;
  const ve = s.denom / (niceV * 100);
  const f1 = fld('ha', 'Height of A', 'readings', 1, hA, s.interval * 0.7, { unit: 'm', dp: 0, note: `A is at about ${Math.round(hA)} m.` });
  const f2 = fld('hb', 'Height of B', 'readings', 1, hB, s.interval * 0.7, { unit: 'm', dp: 0, note: `B is at about ${Math.round(hB)} m.` });
  const f3 = fld('hmax', 'Highest ground on the section', 'readings', 2, m.top, s.interval, { unit: 'm', dp: 0, note: `The section rises to about ${Math.round(m.top)} m.` });
  const f4: GeoField = { ...fld('ve', 'Vertical exaggeration', 'calculation', 2, ve, 0.05, { rel: true, dp: 1, note: 'VE = horizontal scale denominator ÷ vertical scale denominator.' }) };
  const f5 = fld('sight', 'Height of the line of sight above that highest ground point', 'calculation', 2, m.sight, s.interval, { unit: 'm', dp: 0, own: (g) => (g('ha') === null || g('hb') === null ? null : g('ha')! + ((g('hb')! - g('ha')!) * m.at) / L), note: 'Line-of-sight height = height of A ± the rise or fall in proportion to the distance along.' });
  const vis = m.over > 0 ? 'NO' : 'YES';
  const c1 = cho('vis', 'Are A and B inter-visible?', 'interpretation', 2, vis, [['YES', 'Yes: the line of sight stays above the ground'], ['NO', 'No: higher ground blocks the line of sight']], vis === 'NO' ? 'Higher ground rises above the straight line from A to B, so they are not inter-visible.' : 'The straight line from A to B clears the ground, so they are inter-visible.');
  const c2 = cho('curve', 'How should the points be joined?', 'interpretation', 1, 'smooth', [['smooth', 'With a smooth freehand curve'], ['ruler', 'With straight ruled lines'], ['flat', 'Flat across hilltops at the top contour']], 'A smooth freehand curve; hilltops are rounded, not flat-topped.');
  const tickScore = (x: GeoMapsState) => {
    if (!crossings.length) return 0;
    const used = new Set<number>();
    let hit = 0;
    for (const c of crossings) {
      const i = x.ticks.findIndex((t, k) => !used.has(k) && Math.abs(t.d - c.d) <= 0.3 && t.h === c.h);
      if (i >= 0) {
        hit++;
        used.add(i);
      }
    }
    return hit / crossings.length;
  };
  const vOk = (x: GeoMapsState) => {
    const V = Number(x.sets.vscale ?? 0);
    return V > 0 && range / V >= 1 && range / V <= 12;
  };
  const builds: GeoBuild[] = [
    bld('ticks', 2.5, (x) => Math.min(1, tickScore(x) / 0.85), 'Mark every contour the section crosses on the paper strip, with its value.'),
    bld('scale', 0.5, (x) => (vOk(x) ? 1 : 0), 'Choose a vertical scale that fits the height range on the graph paper.'),
    bld('smooth', 0.5, (x) => (x.sets.smooth === true ? 1 : 0), 'Join the points with a smooth curve.'),
    bld('sightline', 0.5, (x) => (x.sets.sight === true ? 1 : 0), 'Draw the straight line from A to B on the section.'),
    bld('labels', 1, (x) => ['title', 'hscale', 'vscale', 've'].filter((c) => x.checks.includes(c)).length / 4, 'Give the section a title, both scales and the vertical exaggeration.'),
  ];
  f4.own = (_g, x) => (x && Number(x.sets.vscale) > 0 ? s.denom / (Number(x.sets.vscale) * 100) : null);
  const steps: GeoStep[] = [
    {
      id: 'strip',
      label: 'Mark the contours along A–B on the paper strip',
      why: 'One tick, with its value, at every contour the line crosses.',
      say: 'I lay the straight edge of the paper strip from A to B and tick every contour it crosses, writing the value beside each tick.',
      panel: 'map',
      tool: 'strip',
      done: (x) => tickScore(x) >= 0.85,
      apply: (x) => {
        x.ticks = crossings.map((c) => ({ d: Math.round(c.d * 100) / 100, h: c.h }));
      },
    },
    recStep('ends', 'Read the heights of A, B and the highest ground', 'Between contours, estimate.', 'I estimate the heights at each end, and find the highest ground on the line.', [f1, f2, f3]),
    { id: 'graph', label: 'Set the vertical scale and draw the section', why: 'The base line is the strip’s length; plot each tick at its height.', say: `A vertical scale of one centimetre to ${niceV} metres fits the paper. Each tick is plotted at its height and I join them with a smooth curve.`, panel: 'section', done: (x) => vOk(x) && x.sets.smooth === true, apply: (x) => Object.assign(x.sets, { vscale: niceV, smooth: true }) },
    recStep('ve', 'Work out the vertical exaggeration', 'Horizontal denominator ÷ vertical denominator.', `The vertical scale is 1 to ${niceV * 100}, so the exaggeration is ${s.denom} divided by ${niceV * 100}.`, [f4]),
    { id: 'sight', label: 'Draw the line of sight from A to B', why: 'A straight line between the two ends of the section.', say: 'A ruled line from A to B on the section tests whether the two points can see each other.', panel: 'section', done: (x) => x.sets.sight === true, apply: (x) => void (x.sets.sight = true) },
    recStep('sightv', 'Work out the line of sight above the highest ground', 'Height in proportion to the distance along.', 'The height of the line at that distance is found in proportion along it.', [f5]),
    checkStep('labels', 'Add the title, scales and vertical exaggeration', 'They carry marks.', 'A title, both scales and the vertical exaggeration.', ['title', 'hscale', 'vscale', 've'], 'section'),
    ansStep('ideas', 'Decide on inter-visibility', 'Does the ground rise above the line?', 'Wherever the ground rises above the line, the view is blocked.', [c1, c2]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.PROFILE,
    brief: [`Draw a cross profile along the line A–B on this ${shortRf(s)} sheet (contour interval ${s.interval} m).`, 'Mark the contours on the paper strip, plot them on the section graph and join them smoothly.', 'Calculate the vertical exaggeration and test whether A and B are inter-visible.'],
    panels: ['map', 'section'],
    tools: ['hand', 'strip', 'ruler'],
    fields: [f1, f2, f3, f4, f5],
    choices: [c1, c2],
    checks: [
      { id: 'title', label: 'Title' },
      { id: 'hscale', label: 'Horizontal scale' },
      { id: 'vscale', label: 'Vertical scale' },
      { id: 've', label: 'Vertical exaggeration' },
    ],
    builds,
    steps,
    solution: [`${crossings.length} contours are crossed in ${L.toFixed(1)} cm. Heights from ${Math.round(Math.min(hA, hB))} m to about ${Math.round(m.top)} m.`, `With 1 cm to ${niceV} m the VE is ${s.denom} ÷ ${niceV * 100} = ${ve.toFixed(1)}.`, vis === 'NO' ? `The ground reaches ${Math.round(m.top)} m where the line of sight is about ${Math.round(m.sight)} m: not inter-visible.` : `The line of sight clears the ground everywhere: inter-visible.`],
  };
  return { def, ex: { ...NO_EXTRAS, marks: { A, B }, section: [A, B] as [P, P] } };
}
/** How far the ground stands above the line of sight (m, negative when it clears everywhere), and the highest ground. */
export function maxOver(s: GeoSheet, a: P, b: P) {
  const L = dist(a, b);
  const ha = geoHeight(s, a[0], a[1]);
  const hb = geoHeight(s, b[0], b[1]);
  let top = -Infinity;
  let at = 0;
  let over = -Infinity;
  for (let i = 4; i <= 196; i++) {
    const t = i / 200;
    const h = geoHeight(s, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    if (h > top) {
      top = h;
      at = t * L;
    }
    over = Math.max(over, h - (ha + (hb - ha) * t));
  }
  return { top, at, over, sight: ha + ((hb - ha) * at) / L };
}

// ------------------------------------------------------------------ DRAINAGE

function taskDrainage(seed: number) {
  const r = labRandom(seed, 'geo-drainage');
  const pattern = labPick(r, DRAINAGE_PATTERNS) as DrainagePattern;
  const s = geoSheet(seed, pattern);
  const k = s.kmPerCm;
  const rect = bestRect(3, 3, (q) => s.streams.reduce((t, x) => t + clipRuns(x.pts, q).reduce((u, l) => u + polyLength(l), 0), 0), 'basin', 'Sample area');
  const runs = s.streams.flatMap((x) => clipRuns(x.pts, rect));
  const L = runs.reduce((t, l) => t + polyLength(l), 0);
  const route = runs.flat();
  const area = (rect.w * k) * (rect.h * k);
  const main = s.streams.find((x) => x.main)!;
  const flowDeg = bearingOf(main.pts[0]!, main.pts[main.pts.length - 1]!);
  const flow = pattern === 'RADIAL' ? 'OUTWARD' : compass8(flowDeg);
  const junctions = s.streams.filter((x) => !x.main || x.order < 3).map((x) => x.pts[x.pts.length - 1]!).filter((p) => inRect(p, rect, 0.2) && s.streams.some((y) => nearestOnLine(p, y.pts).d < 0.08 && y.pts[y.pts.length - 1] !== p));
  const target = junctions[0] ?? s.relief.CONICAL ?? route[Math.floor(route.length / 2)]!;
  const conflu = junctions.length > 0;
  const f1 = fld('side', 'Side of the sample area', 'readings', 1, rect.w, 0.1, { unit: 'cm', note: `The sample area is ${rect.w} cm square.` });
  const f2 = fld('len_cm', 'Total length of streams in the area', 'readings', 3, L, 0.12, { unit: 'cm', rel: true, note: `The streams total about ${L.toFixed(0)} cm on the map.` });
  const f3 = fld('len_km', 'Length on the ground', 'calculation', 1, L * k, 0.02, { unit: 'km', dp: 2, own: (g) => (g('len_cm') === null ? null : g('len_cm')! * k), note: 'Map cm × km per cm.' });
  const f4 = fld('a_km2', 'Area of the sample', 'calculation', 1, area, 0.02, { unit: 'km²', dp: 2, own: (g) => (g('side') === null ? null : (g('side')! * k) ** 2), note: 'Ground width × ground height (in km).' });
  const f5 = fld('dd', 'Drainage density', 'calculation', 2, (L * k) / area, 0.03, { unit: 'km per km²', dp: 2, rel: true, own: (g) => (g('len_km') && g('a_km2') ? g('len_km')! / g('a_km2')! : null), note: 'Drainage density = stream length ÷ area.' });
  const c1 = cho('pattern', 'The drainage pattern is', 'interpretation', 1.5, pattern, [['DENDRITIC', 'Dendritic: tree-like, tributaries join at acute angles'], ['TRELLIS', 'Trellis: tributaries join at right angles'], ['RADIAL', 'Radial: streams flow out from a central high point'], ['PARALLEL', 'Parallel: streams run side by side']], `The pattern is ${pattern.toLowerCase()}.`);
  const c2 = cho('flow', 'The main river flows', 'interpretation', 1, flow, [...['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((d): [string, string] => [d, `Towards the ${d}`]), ['OUTWARD', 'Outward in all directions']], pattern === 'RADIAL' ? 'Streams flow outward from the hill.' : `The contours fall to the ${flow}.`);
  const c3 = cho('how', 'How do you know which way a river flows?', 'interpretation', 0.5, 'contours', [['contours', 'Contour Vs point upstream: rivers flow from high ground to low'], ['north', 'Rivers flow north because north is at the top'], ['width', 'The thicker end is always the source']], 'Use contour values, not the top of the map.');
  const cov = (x: GeoMapsState) => runCover(x.runs, route, 0.35);
  const builds: GeoBuild[] = [bld('thread', 4, (x) => Math.min(1, cov(x) / 0.85), 'Lay thread along every stream inside the sample area.'), bld('pin', 1, (x) => (pinNear(x, 'conf', target, 0.5) ? 1 : 0), conflu ? 'Pin a confluence inside the sample area.' : 'Pin the central hill the streams radiate from.')];
  const threadRuns = runs.map((l) => l.filter((_, i) => i % 3 === 0).concat([l[l.length - 1]!])).slice(0, 14);
  const steps: GeoStep[] = [
    recStep('side', 'Measure the sample area', 'Use the grid.', 'The sample square is drawn on the grid.', [f1]),
    { id: 'thread', label: 'Lay thread along every stream in the area', why: 'One run for each stream: stop at the frame.', say: 'I follow the streams one at a time, from high to low, and stop at the frame. Then I straighten all the thread and read it.', panel: 'map', tool: 'string', done: (x) => cov(x) >= 0.85, apply: (x) => void x.runs.push(...threadRuns.map((pts) => ({ tool: 'STRING' as const, pts }))) },
    recStep('len', 'Record the total stream length', 'Add all the runs.', 'All the runs together give the total length.', [f2]),
    pinStep('conf', conflu ? 'Pin a confluence' : 'Pin the hill the streams radiate from', 'Features need locating.', conflu ? 'Where two streams meet is a confluence.' : 'All the streams leave this hill.', 'conf', [target], 0.5),
    recStep('dd', 'Work out the drainage density', 'Length ÷ area, in km and km².', 'Ground length divided by ground area.', [f3, f4, f5]),
    ansStep('ideas', 'Describe the drainage', 'Use the map as evidence.', 'The arrangement of the tributaries gives the pattern, and the contours give the direction of flow.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.DRAINAGE,
    brief: [`Study the drainage of this sheet of ${s.name} (${s.river}).`, 'Measure the total length of streams inside the framed sample area with the thread and calculate the drainage density.', 'Identify the drainage pattern and the direction of flow, using the contours as evidence.'],
    panels: ['map'],
    tools: ['hand', 'string', 'dividers', 'pin', 'ruler'],
    fields: [f1, f2, f3, f4, f5],
    choices: [c1, c2, c3],
    checks: [],
    builds,
    steps,
    solution: [`Total stream length ≈ ${L.toFixed(0)} cm × ${k} = ${(L * k).toFixed(1)} km in ${area} km².`, `Drainage density ≈ ${((L * k) / area).toFixed(2)} km per km². Pattern: ${pattern.toLowerCase()}.`],
  };
  return { sheet: s, def, ex: { ...NO_EXTRAS, rects: [rect], pinKinds: [{ k: 'conf', label: conflu ? 'Confluence' : 'Central hill', colour: '#1565c0' }] } };
}

// ------------------------------------------------------------------ SETTLE

function taskSettle(s: GeoSheet) {
  const mean = (q: GeoRect) => {
    let t = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) t += geoHeight(s, q.x + ((i + 0.5) / 4) * q.w, q.y + ((j + 0.5) / 4) * q.h);
    return t / 16;
  };
  const inside = (q: GeoRect) => s.settlements.filter((x) => inRect(x.p, q, 0.02));
  const low = bestRect(4, 3, (q) => inside(q).length * 40 - mean(q), 'low', 'Lowland block');
  const high = bestRect(4, 3, (q) => (Math.abs(q.x - low.x) < low.w && Math.abs(q.y - low.y) < low.h ? -1e9 : mean(q) - (inside(q).length ? 0 : 1e5)), 'up', 'Upland block');
  const nLow = inside(low).length;
  const nUp = Math.max(1, inside(high).length);
  const a = low.w * s.kmPerCm * low.h * s.kmPerCm;
  const dLow = nLow / a;
  const dUp = nUp / a;
  const f1 = fld('n_low', 'Settlements in the lowland block', 'readings', 1.5, nLow, 1, { dp: 0, note: `About ${nLow} settlements.` });
  const f2 = fld('n_up', 'Settlements in the upland block', 'readings', 1.5, nUp, 0.5, { dp: 0, note: `About ${nUp} settlements.` });
  const f3 = fld('a', 'Area of each block', 'readings', 1, a, 0.02, { unit: 'km²', dp: 2, note: `Each block is ${low.w} × ${low.h} cm: ${a} km².` });
  const f4 = fld('d_low', 'Density in the lowland', 'calculation', 1, dLow, 0.04, { unit: 'per km²', rel: true, dp: 3, own: (g) => (g('n_low') !== null && g('a') ? g('n_low')! / g('a')! : null), note: 'Density = settlements ÷ area.' });
  const f5 = fld('d_up', 'Density in the upland', 'calculation', 1, dUp, 0.04, { unit: 'per km²', rel: true, dp: 3, own: (g) => (g('n_up') !== null && g('a') ? g('n_up')! / g('a')! : null), note: 'Density = settlements ÷ area.' });
  const f6 = fld('ratio', 'Lowland density ÷ upland density', 'calculation', 2, dLow / dUp, 0.05, { rel: true, dp: 1, own: (g) => (g('d_low') && g('d_up') ? g('d_low')! / g('d_up')! : null), note: 'Divide the two densities.' });
  const town = s.settlements.find((x) => x.kind === 'TOWN')!;
  const lin = s.settlements.find((x) => x.kind === 'LINEAR') ?? s.settlements.find((x) => x.kind === 'VILLAGE')!;
  const pat: [string, string][] = [['NUCLEATED', 'Nucleated'], ['LINEAR', 'Linear'], ['DISPERSED', 'Dispersed']];
  const c1 = cho('town', `The pattern of ${town.name} is`, 'interpretation', 0.5, 'NUCLEATED', pat, `${town.name} is tightly clustered: nucleated.`);
  const c2 = cho('lin', `The pattern of ${lin.name} is`, 'interpretation', 0.5, 'LINEAR', pat, `${lin.name} is strung along the road: linear.`);
  const c3 = cho('up', 'Settlement in the upland block is', 'interpretation', 0.5, 'DISPERSED', pat, 'Scattered single hamlets: dispersed.');
  const c4 = cho('site', `The site of ${town.name} is best described as`, 'interpretation', 0.5, 'river', [['river', 'On gentle lowland beside the river'], ['hill', 'On a hilltop'], ['forest', 'Inside the forest reserve']], 'A site is the land it stands on: gentle lowland by water.');
  const c5 = cho('road', 'The main road', 'interpretation', 0.5, 'low', [['low', 'keeps to the lowland, linking the settlements'], ['ridge', 'climbs straight over the highest ground'], ['river', 'follows the river to its source']], 'The main road avoids the steep ground.');
  const c6 = cho('use', 'The land shaded green with trees is used for', 'interpretation', 0.5, 'forest', [['forest', 'A forest reserve'], ['farm', 'Cultivation of food crops'], ['quarry', 'Quarrying']], 'The key shows a forest reserve.');
  const lows = inside(low).map((x) => x.p);
  const ups = inside(high).map((x) => x.p);
  const pinScore = (x: GeoMapsState, k: string, pts: P[]) => (pts.length ? pts.filter((p) => pinNear(x, k, p, 0.5)).length / pts.length : 1);
  const builds: GeoBuild[] = [bld('low', 3, (x) => Math.min(1, pinScore(x, 'low', lows) / 0.8), 'Pin each settlement inside the lowland block as you count it.'), bld('up', 2, (x) => Math.min(1, pinScore(x, 'up', ups) / 0.8), 'Pin each settlement inside the upland block as you count it.')];
  const steps: GeoStep[] = [
    pinStep('low', 'Pin the settlements in the lowland block', 'Count each settlement once; a pin keeps your place.', 'A pin for each settlement inside the lowland block, so I count each one once.', 'low', lows, 0.5),
    pinStep('up', 'Pin the settlements in the upland block', 'The same block size, so densities compare fairly.', 'And the upland block: far fewer.', 'up', ups, 0.5),
    recStep('n', 'Record the counts and the block area', 'From the pins and the grid.', 'Each block is four by three squares: I work out its ground area.', [f1, f2, f3]),
    recStep('d', 'Work out the densities and their ratio', 'Number ÷ area.', 'Number divided by area for each block, then one density divided by the other.', [f4, f5, f6]),
    ansStep('ideas', 'Describe the patterns and sites', 'Pattern is shape; site is location.', 'Pattern is the shape of a settlement; site is the land it stands on.', [c1, c2, c3, c4, c5, c6]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.SETTLE,
    brief: [`Scale ${shortRf(s)}. Compare the framed lowland and upland blocks of ${s.name}.`, 'Pin and count the settlements in each block, calculate each density and compare them.', 'Describe the settlement patterns, the site of the town and the main land uses.'],
    panels: ['map'],
    tools: ['hand', 'pin', 'ruler'],
    fields: [f1, f2, f3, f4, f5, f6],
    choices: [c1, c2, c3, c4, c5, c6],
    checks: [],
    builds,
    steps,
    solution: [`Lowland ${nLow} ÷ ${a} km² = ${dLow.toFixed(2)} per km²; upland ${nUp} ÷ ${a} km² = ${dUp.toFixed(2)} per km².`, `Lowland density is about ${(dLow / dUp).toFixed(1)} times that of the upland.`],
  };
  return { def, ex: { ...NO_EXTRAS, rects: [low, high], pinKinds: [{ k: 'low', label: 'Lowland count', colour: '#c62828' }, { k: 'up', label: 'Upland count', colour: '#6a1b9a' }] } };
}

// ------------------------------------------------------------------ GIS

function taskGis(seed: number, s: GeoSheet) {
  const r = labRandom(seed, 'geo-gis');
  const road = s.roads.find((x) => x.id === 'main')!.pts;
  const len = polyLength(road);
  const mid = len * (0.3 + r() * 0.2);
  const part = sliceLine(road, mid, Math.min(len, mid + 7 + r() * 3));
  const pts = [feature(s, 'school'), feature(s, 'market'), feature(s, 'borehole')];
  const P_LABEL: Record<string, string> = { school: 'School', market: 'Market', borehole: 'Borehole' };
  const size = labPick(r, [10, 20, 30]);
  const cells = 400 + Math.round(r() * 80) * 25;
  const cell = size * size;
  const total = cell * cells;
  const trueKm = polyLength(part) * s.kmPerCm;
  const trueKm2 = Object.values(squareCover(s.forest)).reduce((t, x) => t + x, 0) * s.squareKm2;
  const f1 = fld('road_km', 'Length of the line layer (from the measuring tool)', 'readings', 2, trueKm, 0.08, { unit: 'km', rel: true, dp: 2, note: `The road digitised is about ${trueKm.toFixed(2)} km long.` });
  const f2 = fld('forest_km2', 'Area of the polygon layer (from the measuring tool)', 'readings', 2, trueKm2, 0.12, { unit: 'km²', rel: true, dp: 2, note: `The forest polygon covers about ${trueKm2.toFixed(2)} km².` });
  const f3 = fld('cell', 'Area of one raster cell', 'calculation', 1, cell, 0.5, { unit: 'm²', dp: 0, note: `${size} × ${size} = ${cell} m².` });
  const f4 = fld('total', 'Area of the land-use class', 'calculation', 1, total, 1, { unit: 'm²', dp: 0, own: (g) => (g('cell') === null ? null : g('cell')! * cells), note: 'Cells × area of one cell.' });
  const f5 = fld('ha', 'In hectares', 'calculation', 1, total / 10000, 0.02, { unit: 'ha', dp: 2, own: (g) => (g('total') === null ? null : g('total')! / 10000), note: '1 ha = 10 000 m².' });
  const f6 = fld('km2', 'In square kilometres', 'calculation', 1, total / 1e6, 0.002, { unit: 'km²', dp: 3, own: (g) => (g('total') === null ? null : g('total')! / 1e6), note: '1 km² = 1 000 000 m².' });
  const c1 = cho('scan', 'The scanned map used as a base layer is', 'interpretation', 1, 'raster', [['raster', 'Raster data (cells)'], ['vector', 'Vector data (points, lines, polygons)']], 'A scan is a grid of cells: raster.');
  const c2 = cho('roadtype', 'The digitised road is', 'interpretation', 1, 'line', [['point', 'A vector point'], ['line', 'A vector line'], ['poly', 'A vector polygon'], ['raster', 'A raster cell']], 'A road is a vector line.');
  const c3 = cho('notgis', 'Which is NOT one of the five components of GIS?', 'interpretation', 1, 'weather', [['weather', 'Weather'], ['people', 'People'], ['data', 'Data'], ['procedures', 'Procedures']], 'Hardware, software, data, procedures and people.');
  const pointOk = (x: GeoMapsState) => pts.filter((f) => pinNear(x, `pt:${f.id}`, f.p, 0.4)).length / pts.length;
  const lineOk = (x: GeoMapsState) => {
    const m = lineMatch(x.lines.road, part, 0.45);
    return m.dev <= 0.3 ? Math.min(1, m.cover / 0.85) : 0;
  };
  const polyOk = (x: GeoMapsState) => {
    const m = lineMatch(x.lines.forest, s.forest, 0.6);
    return m.dev <= 0.5 ? Math.min(1, m.cover / 0.8) : 0;
  };
  const builds: GeoBuild[] = [
    bld('pts', 1.5, pointOk, 'Add a point for each building in the point layer.'),
    bld('line', 1.5, lineOk, 'Digitise the marked stretch of road as a line.'),
    bld('poly', 1, polyOk, 'Digitise the forest reserve as a polygon.'),
    bld('export', 1, (x) => ['title', 'north', 'key', 'scale'].filter((c) => x.checks.includes(c)).length / 4, 'Export the map with a title, key, scale and north arrow.'),
  ];
  const marks = { A: part[0]!, B: part[part.length - 1]! };
  const roadPts = part.filter((_, i) => i % 3 === 0).concat([part[part.length - 1]!]);
  const forestPts = s.forest.filter((_, i) => i % 3 === 0);
  const steps: GeoStep[] = [
    pinStep('pts', 'Add the school to the point layer', 'A point has a location and a row in the attribute table.', 'Point layer first: each building is a point, with a row in the attribute table.', 'pt:school', [pts[0]!.p], 0.4),
    { id: 'pts2', label: 'Add the market and the borehole too', why: 'Choose the layer row, then tap.', say: 'The market and the borehole go in the same layer.', panel: 'map', tool: 'pin', done: (x) => pointOk(x) >= 1, apply: (x) => void x.pins.push({ k: 'pt:market', p: pts[1]!.p }, { k: 'pt:borehole', p: pts[2]!.p }) },
    { id: 'line', label: 'Digitise the road from A to B as a line', why: 'Tap along it: each tap adds a vertex.', say: 'Vector lines are vertices joined up. I tap along the road from A to B, closer together on the bends.', panel: 'map', tool: 'pencil', done: (x) => lineOk(x) >= 1, apply: (x) => void (x.lines.road = roadPts) },
    { id: 'poly', label: 'Digitise the forest reserve as a polygon', why: 'Tap round the edge, and the layer closes itself.', say: 'A polygon is a closed line. I go round the forest edge.', panel: 'map', tool: 'pencil', done: (x) => polyOk(x) >= 1, apply: (x) => void (x.lines.forest = forestPts) },
    recStep('measure', 'Record the length and the area', 'The measuring tool works them out from your vertices.', 'The software measures my vertices: it can only be as good as my digitising.', [f1, f2]),
    recStep('raster', 'Work out the raster area', 'Cells × cell area.', `${cells} cells, each ${size} metres square. Cell area times the number of cells, then into hectares and square kilometres.`, [f3, f4, f5, f6]),
    checkStep('export', 'Set the title, key, scale and north arrow', 'Forgetting these loses marks on any map.', 'A GIS map still needs its title, key, scale and north arrow.', ['title', 'north', 'key', 'scale'], 'gis'),
    ansStep('ideas', 'Answer the questions on GIS', 'Raster: cells. Vector: points, lines, polygons.', 'Raster is cells; vector is points, lines and polygons.', [c1, c2, c3]),
  ];
  const def: GeoTaskDef = {
    title: GEO_TASK_TITLE.GIS,
    brief: ['The sheet is your scanned base layer in a GIS. Add the school, market and borehole to a point layer, digitise the road from A to B as a line and the forest reserve as a polygon.', 'Use the measuring tool for the length and area, and record them.', `A raster land-use class covers ${cells} cells of ${size} m × ${size} m. Find its area in m², hectares and km².`],
    panels: ['map', 'gis'],
    tools: ['hand', 'pin', 'pencil'],
    fields: [f1, f2, f3, f4, f5, f6],
    choices: [c1, c2, c3],
    checks: mapElements,
    builds,
    steps,
    solution: [`One cell ${cell} m² × ${cells} = ${total} m² = ${total / 10000} ha = ${total / 1e6} km².`, `Road about ${trueKm.toFixed(2)} km, forest about ${trueKm2.toFixed(2)} km².`],
  };
  return {
    def,
    ex: {
      ...NO_EXTRAS,
      marks,
      raster: { cells, size },
      pinKinds: pts.map((f) => ({ k: `pt:${f.id}`, label: P_LABEL[f.id]!, colour: '#6a1b9a' })),
      pencilKinds: [
        { id: 'road', label: 'Road (line layer)', closed: false },
        { id: 'forest', label: 'Forest reserve (polygon layer)', closed: true },
      ],
    },
  };
}

export function mapTask(seed: number, task: GeoTask): { sheet: GeoSheet; def: GeoTaskDef; ex: GeoMapExtras } {
  const s = geoSheet(seed);
  switch (task) {
    case 'SCALE':
      return { sheet: s, ...taskScale(seed, s) };
    case 'DISTANCE':
      return { sheet: s, ...taskDistance(seed, s) };
    case 'BEARING':
      return { sheet: s, ...taskBearing(seed, s) };
    case 'GRIDAREA':
      return { sheet: s, ...taskGridArea(seed, s) };
    case 'REDUCE':
      return { sheet: s, ...taskReduce(seed, s) };
    case 'RELIEF':
      return { sheet: s, ...taskRelief(seed, s) };
    case 'GRADIENT':
      return { sheet: s, ...taskGradient(seed, s) };
    case 'PROFILE':
      return { sheet: s, ...taskProfile(seed, s) };
    case 'DRAINAGE':
      return taskDrainage(seed);
    case 'SETTLE':
      return { sheet: s, ...taskSettle(s) };
    default:
      return { sheet: s, ...taskGis(seed, s) };
  }
}
