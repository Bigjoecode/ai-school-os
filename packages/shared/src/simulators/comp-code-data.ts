import { z } from 'zod';
import { flowChartSchema, type FlowChart, type FlowKind, type FlowEdge } from './comp-code-flow';
import { labBetween, labPick, labRandom, roundDp } from './seeded';

/**
 * comp-code: the tasks, the attempt state and its schema, the seeded variant,
 * what the student records, and the model answers. The nine lessons:
 *
 * BASIC_IO, BASIC_LOOP, BASIC_ARRAY, BASIC_FUNC, BASIC_WHILE: write programs
 * in the editor, run them on the interpreter, record the output and desk-check
 * them. FLOW: three flowcharts built from the standard symbols and traced box
 * by box. HTML: a web page in the editor with a safe live preview, and the
 * parts of a URL. CRIMP: a straight-through T568B patch cable, tested on a
 * cable tester worked out from the wires. MAINT: cleaning, UPS and software
 * maintenance in the right order, with the UPS runtime.
 *
 * The hidden test cases are not here: they are in the API grader, so they
 * never reach the browser.
 */

export const COMP_TASKS = ['BASIC_IO', 'BASIC_LOOP', 'BASIC_ARRAY', 'BASIC_FUNC', 'BASIC_WHILE', 'FLOW', 'HTML', 'CRIMP', 'MAINT'] as const;
export type CompTask = (typeof COMP_TASKS)[number];
export type CompFamily = 'BASIC' | 'FLOW' | 'HTML' | 'BENCH';
export const compFamily = (t: CompTask): CompFamily => (t === 'FLOW' ? 'FLOW' : t === 'HTML' ? 'HTML' : t === 'CRIMP' || t === 'MAINT' ? 'BENCH' : 'BASIC');

export const COMP_PRACTICAL_TASKS: Record<string, CompTask> = {
  'pr-cst-basic-input-let-print': 'BASIC_IO',
  'pr-cst-basic-read-data-for-next': 'BASIC_LOOP',
  'pr-cst-basic-arrays-dim': 'BASIC_ARRAY',
  'pr-cst-basic-built-in-functions': 'BASIC_FUNC',
  'pr-cst-basic-while-wend-desk-check': 'BASIC_WHILE',
  'pr-cst-algorithm-and-flowchart': 'FLOW',
  'pr-cst-www-url-structure': 'HTML',
  'pr-cst-crimping-rj45-cable': 'CRIMP',
  'pr-dpr-computer-maintenance': 'MAINT',
};
export const COMP_TASK_TITLE: Record<CompTask, string> = {
  BASIC_IO: 'BASIC programs with INPUT, LET and PRINT',
  BASIC_LOOP: 'BASIC loops: READ/DATA and FOR-NEXT',
  BASIC_ARRAY: 'One-dimensional arrays in BASIC',
  BASIC_FUNC: 'BASIC built-in functions and a table of values',
  BASIC_WHILE: 'WHILE-WEND and desk checking',
  FLOW: 'Algorithms and flowcharts',
  HTML: 'A web page in HTML, and the parts of a URL',
  CRIMP: 'A straight-through network cable (T568B)',
  MAINT: 'Routine hardware and software maintenance',
};

// ------------------------------------------------------------------ state

export const COMP_MAX_EVENTS = 120;
export const COMP_SOURCE_MAX = 8000;
export const COMP_ACTS = ['CUT', 'BOOTS', 'STRIP', 'UNTWIST', 'ORDER', 'TRIM', 'INSERT', 'CRIMP', 'RECUT', 'TEST', 'SHUTDOWN', 'UNPLUG', 'WIPE', 'CASE', 'KEYTAP', 'KEYBRUSH', 'KEYCLEAN', 'BLOW', 'LENS', 'REPLUG', 'BOOT', 'UPSTEST', 'CLEANUP', 'UPDATES', 'BACKUP'] as const;
export type CompAct = (typeof COMP_ACTS)[number];
export interface CompEvent {
  a: CompAct;
  x: string;
  n: number;
}
export interface CompLog {
  t: number;
  a: string;
}
export interface CompCodeState {
  v: 1;
  task: CompTask | null;
  /** BASIC source by program id (A, B); the HTML page is `page`. */
  programs: Record<string, string>;
  /** The name each program was saved under. */
  names: Record<string, string>;
  charts: Record<string, FlowChart>;
  events: CompEvent[];
  readings: Record<string, string>;
  trace: Record<string, string[][]>;
  choices: Record<string, number[]>;
  written: { precautions: string; explain: string };
  log: CompLog[];
}
export const emptyCompCodeState = (): CompCodeState => ({ v: 1, task: null, programs: {}, names: {}, charts: {}, events: [], readings: {}, trace: {}, choices: {}, written: { precautions: '', explain: '' }, log: [] });

const key = z.string().regex(/^[A-Za-z0-9-]{1,16}$/);
const capped = <T extends z.ZodTypeAny>(schema: z.ZodRecord<z.ZodString, T>, max: number) => schema.refine((o) => Object.keys(o).length <= max, { message: 'too many entries' });
export const compCodeStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(COMP_TASKS).nullable(),
  programs: capped(z.record(key, z.string().max(COMP_SOURCE_MAX)), 4),
  names: capped(z.record(key, z.string().max(40)), 4),
  charts: capped(z.record(key, flowChartSchema), 4),
  events: z.array(z.object({ a: z.enum(COMP_ACTS), x: z.string().max(60), n: z.number().min(0).max(1000) })).max(COMP_MAX_EVENTS),
  readings: capped(z.record(key, z.string().max(60)), 30),
  trace: capped(z.record(key, z.array(z.array(z.string().max(24)).max(8)).max(30)), 4),
  choices: capped(z.record(key, z.array(z.number().int().min(0).max(9)).max(6)), 12),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(100) })).max(800),
}) satisfies z.ZodType<CompCodeState>;

// ------------------------------------------------------------------ variant

export type IoShape = 'TRIANGLE' | 'TRAPEZIUM' | 'CIRCLE';
export const IO_SHAPE: Record<IoShape, { name: string; vars: string[]; words: string[]; expr: string; area: (x: number[]) => number; rem: string }> = {
  TRIANGLE: { name: 'triangle', vars: ['B', 'H'], words: ['BASE', 'HEIGHT'], expr: '0.5 * B * H', area: (x) => 0.5 * x[0]! * x[1]!, rem: 'AREA OF A TRIANGLE' },
  TRAPEZIUM: { name: 'trapezium', vars: ['A', 'B', 'H'], words: ['SIDE A', 'SIDE B', 'HEIGHT'], expr: '0.5 * (A + B) * H', area: (x) => 0.5 * (x[0]! + x[1]!) * x[2]!, rem: 'AREA OF A TRAPEZIUM' },
  CIRCLE: { name: 'circle', vars: ['R'], words: ['RADIUS'], expr: '3.14 * R * R', area: (x) => 3.14 * x[0]! * x[0]!, rem: 'AREA OF A CIRCLE' },
};
export const FLOW_FORMS = [
  { text: 'y = a(b − c)² / (d + 2)', expr: 'A * (B - C) ^ 2 / (D + 2)', f: (a: number, b: number, c: number, d: number) => (a * (b - c) ** 2) / (d + 2) },
  { text: 'y = a(b + c)² / (d + 1)', expr: 'A * (B + C) ^ 2 / (D + 1)', f: (a: number, b: number, c: number, d: number) => (a * (b + c) ** 2) / (d + 1) },
  { text: 'y = a(b − c)² / (2d + 1)', expr: 'A * (B - C) ^ 2 / (2 * D + 1)', f: (a: number, b: number, c: number, d: number) => (a * (b - c) ** 2) / (2 * d + 1) },
] as const;
export const FLOW_SERIES = { ODD: { word: 'odd numbers', first: 1, by: 2 }, EVEN: { word: 'even numbers', first: 2, by: 2 }, THREES: { word: 'multiples of 3', first: 3, by: 3 } } as const;
export type FlowSeries = keyof typeof FLOW_SERIES;

export const T568B = ['wo', 'o', 'wg', 'b', 'wb', 'g', 'wbr', 'br'] as const;
export const WIRE_NAME: Record<string, string> = { wo: 'white-orange', o: 'orange', wg: 'white-green', b: 'blue', wb: 'white-blue', g: 'green', wbr: 'white-brown', br: 'brown' };

export interface CompProgramDef {
  id: string;
  /** The usual file name. */
  file: string;
  title: string;
  brief: string[];
  /** The run the student records (values typed at the prompts). */
  sample: string[];
  /** DATA the program must carry for the recorded run. */
  sampleData: string[];
  /** Statements the question asks for (from the parser's list). */
  need: string[];
}

export interface CompCodeVariant {
  seed: number;
  task: CompTask;
  io: { shape: IoShape; dims: number[]; n: number; nums: number[] };
  loop: { pairs: [number, number][]; start: number; step: number; power: 1 | 2; limit: number; q: [number, number, number]; tri: number };
  arr: { n: number; values: number[]; stat: 'LARGEST' | 'SMALLEST' };
  fn: { x: number; y: number; z: number; func: 'SIN' | 'COS'; step: number };
  wh: { m: number; rate: number; target: number };
  flow: { n: number; nums: number[]; form: 0 | 1 | 2; abcd: [number, number, number, number]; series: FlowSeries; count: number };
  html: { title: string; heading: string; para: string; items: string[]; linkText: string; linkUrl: string; protocol: string; domain: string; path: string; file: string; mb: number; mbps: number };
  crimp: { pcs: number; dist: number; slack: number; box: number; run: number };
  maint: { volts: number; ah: number; sys: number; mon: number; eff: number; pass: boolean; age: number; reading: number; freed: number };
  programs: CompProgramDef[];
}

const SCHOOLS = ['example.edu.ng', 'greenfield.sch.ng', 'unity-college.edu.ng', 'lagoscity.gov.ng', 'nairaland-club.org.ng', 'kanoacademy.com.ng'];
const PAGES = [
  { title: 'My Page', heading: 'Welcome', para: 'SS3 Computer Club', items: ['Typing practice', 'BASIC programming', 'Web design', 'Computer maintenance'] },
  { title: 'Science Club', heading: 'Our Science Club', para: 'We meet every Thursday after school.', items: ['Chemistry quiz', 'Solar oven project', 'Field trip', 'Science fair'] },
  { title: 'School Library', heading: 'Welcome to the Library', para: 'Open from 8 a.m. to 3 p.m.', items: ['Reading room', 'Reference books', 'Past questions', 'Newspapers'] },
  { title: 'Sports Day', heading: 'Inter-house Sports', para: 'All houses meet on the main field.', items: ['100 metres', 'Relay race', 'High jump', 'Football final'] },
  { title: 'Debate Society', heading: 'Debate Society', para: 'Speak well and listen well.', items: ['Weekly debates', 'Public speaking', 'Quiz night', 'Essay writing'] },
];
const PATHS = ['admissions', 'news', 'library', 'results', 'clubs', 'calendar'];
const FILES = ['index.html', 'home.html', 'contact.html', 'page1.html'];
const pickSome = <T>(r: () => number, xs: readonly T[], n: number): T[] => {
  const pool = [...xs];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!);
  return out;
};
const whole = (r: () => number, a: number, b: number) => Math.round(labBetween(r, a, b, 0));
const IN_NAMES = ['V', 'W', 'X', 'Y', 'Z'];
export const ioVars = (n: number) => IN_NAMES.slice(5 - n);

function programs(v: Omit<CompCodeVariant, 'programs'>): CompProgramDef[] {
  const later = 'Your program must work for any values, not only these: it is also run on numbers you cannot see.';
  switch (v.task) {
    case 'BASIC_IO': {
      const s = IO_SHAPE[v.io.shape];
      return [
        { id: 'A', file: `${v.io.shape}.BAS`, title: `Area of a ${s.name}`, brief: [`Write a program that uses INPUT to read the ${s.words.join(', then the ').toLowerCase()} of a ${s.name}, works out its area with LET and prints it after the words AREA =.`, v.io.shape === 'CIRCLE' ? 'Take π as 3.14.' : '', `Run it with ${s.words.map((w, i) => `${w.toLowerCase()} ${v.io.dims[i]}`).join(', ')}.`, later].filter(Boolean), sample: v.io.dims.map(String), sampleData: [], need: ['INPUT', 'LET', 'PRINT'] },
        { id: 'B', file: 'AVERAGE.BAS', title: `Average of ${v.io.n} numbers`, brief: [`Write a program that uses INPUT to read ${v.io.n} numbers and prints their average after the word AVERAGE =.`, `Run it with ${v.io.nums.join(', ')}.`, later], sample: v.io.nums.map(String), sampleData: [], need: ['INPUT', 'LET', 'PRINT'] },
      ];
    }
    case 'BASIC_LOOP':
      return [
        { id: 'A', file: 'RECTS.BAS', title: 'Area and perimeter with READ and DATA', brief: [`Use a FOR-NEXT loop that runs ${v.loop.pairs.length} times. On each pass READ the length L and breadth B of a rectangle, work out its area A and perimeter P and PRINT L, B, A and P on one line.`, `Put these pairs in a DATA statement: ${v.loop.pairs.map((p) => p.join(', ')).join('; ')}.`, 'It is also run on other DATA you cannot see, so the loop must do the working out.'], sample: [], sampleData: v.loop.pairs.flat().map(String), need: ['FOR', 'NEXT', 'READ', 'DATA'] },
        { id: 'B', file: 'SUMLOOP.BAS', title: `Sum with STEP ${v.loop.step}`, brief: [`Use INPUT to read an upper limit M. With FOR K = ${v.loop.start} TO M STEP ${v.loop.step}, add up ${v.loop.power === 2 ? 'K × K' : 'K'} into S, then print S after the words SUM =. Print only the total, once, after the loop.`, `Run it with M = ${v.loop.limit}.`, later], sample: [String(v.loop.limit)], sampleData: [], need: ['FOR', 'NEXT', 'INPUT'] },
      ];
    case 'BASIC_ARRAY':
      return [{ id: 'A', file: 'ARRAY.BAS', title: `An array of ${v.arr.n} numbers`, brief: [`Use DIM to make an array N of ${v.arr.n} elements. READ the ${v.arr.n} numbers from DATA into the array with a FOR-NEXT loop.`, `Print the sum, the mean and the ${v.arr.stat.toLowerCase()} value after the words SUM =, MEAN = and ${v.arr.stat} =. Then print the elements in reverse order with FOR I = ${v.arr.n} TO 1 STEP -1.`, `DATA ${v.arr.values.join(', ')}`, 'It is also run on other DATA you cannot see, including all-negative numbers.'], sample: [], sampleData: v.arr.values.map(String), need: ['DIM', 'READ', 'DATA', 'FOR', 'NEXT'] }];
    case 'BASIC_FUNC':
      return [
        { id: 'A', file: 'FUNCS.BAS', title: 'SQR, INT and ABS', brief: ['Use INPUT to read X, Y and Z, then print on one line SQR(X), INT(Y), INT(-Y) and ABS(Z).', `Run it with X = ${v.fn.x}, Y = ${v.fn.y}, Z = ${v.fn.z}.`, later], sample: [String(v.fn.x), String(v.fn.y), String(v.fn.z)], sampleData: [], need: ['INPUT', 'PRINT'] },
        { id: 'B', file: 'TABLE.BAS', title: `A table of ${v.fn.func} x`, brief: [`Use INPUT to read a step S. With LET PI = 3.14159 and FOR D = 0 TO 360 STEP S, change D to radians and print D and ${v.fn.func}(R) on one line for each angle.`, `Run it with S = ${v.fn.step}.`, later], sample: [String(v.fn.step)], sampleData: [], need: ['INPUT', 'FOR', 'NEXT', 'LET'] },
      ];
    case 'BASIC_WHILE':
      return [{ id: 'A', file: 'SAVINGS.BAS', title: 'Years to reach a target', brief: [`Savings of M naira earn R% compound interest a year. Use INPUT to read M, then R, then a target T. With WHILE M <= T, grow M by R% and count the years Y. After WEND print Y and M after the words YEARS = and AMOUNT =.`, `Run it with M = ${v.wh.m}, R = ${v.wh.rate}, T = ${v.wh.target}.`, 'Add a REM line saying what the program does. It is also run on other values you cannot see, including money that already passes the target.'], sample: [String(v.wh.m), String(v.wh.rate), String(v.wh.target)], sampleData: [], need: ['WHILE', 'WEND', 'INPUT', 'REM'] }];
    case 'FLOW': {
      const form = FLOW_FORMS[v.flow.form];
      const se = FLOW_SERIES[v.flow.series];
      return [
        { id: 'A', file: '', title: `Average of ${v.flow.n} numbers`, brief: [`Input ${v.flow.n} numbers one at a time with a counter, add them up, and output their average. Use a decision box such as COUNT = ${v.flow.n}?`, `Trace it with ${v.flow.nums.join(', ')}.`, 'It is also run on numbers you cannot see.'], sample: v.flow.nums.map(String), sampleData: [], need: [] },
        { id: 'B', file: '', title: form.text, brief: [`Input a, b, c and d (in that order, as A, B, C, D) and output ${form.text}.`, `Trace it with a = ${v.flow.abcd[0]}, b = ${v.flow.abcd[1]}, c = ${v.flow.abcd[2]}, d = ${v.flow.abcd[3]}.`, 'It is also run on numbers you cannot see.'], sample: v.flow.abcd.map(String), sampleData: [], need: [] },
        { id: 'C', file: '', title: `First ${v.flow.count} ${se.word}`, brief: [`Output the first ${v.flow.count} ${se.word} one after another, starting from ${se.first} and adding ${se.by} each time, using a loop that stops after ${v.flow.count} numbers.`], sample: [], sampleData: [], need: [] },
      ];
    }
    case 'HTML':
      return [{ id: 'page', file: 'mypage.html', title: 'A web page', brief: [`Write a complete HTML page: the html, head, title and body tags in the right places.`, `The title (it shows on the browser tab) is exactly: ${v.html.title}`, `A main heading (h1): ${v.html.heading}`, `A paragraph: ${v.html.para}`, `A bulleted list of: ${v.html.items.join('; ')}`, `A hyperlink saying “${v.html.linkText}” to ${v.html.linkUrl}`, 'Save it with the .html extension.'], sample: [], sampleData: [], need: [] }];
    default:
      return [];
  }
}

export function compCodeVariant(seed: number, task: CompTask): CompCodeVariant {
  const r = labRandom(seed, `comp-code:${task}`);
  const shape = labPick(r, ['TRIANGLE', 'TRAPEZIUM', 'CIRCLE'] as const);
  const dims = IO_SHAPE[shape].vars.map(() => whole(r, 4, 24));
  const n = labPick(r, [3, 4, 5]);
  const nums = Array.from({ length: n }, () => whole(r, 20, 95));
  const np = labPick(r, [3, 4]);
  const pairs = Array.from({ length: np }, (): [number, number] => [labBetween(r, 4, 12, 0) + labPick(r, [0, 0.5]), whole(r, 2, 9)]);
  const lstart = labPick(r, [1, 2, 3]);
  const lstep = labPick(r, [2, 3]);
  const limit = lstart + lstep * whole(r, 4, 7);
  const qs = labPick(r, [2, 3, 5]);
  const qa = whole(r, 1, 6);
  const an = whole(r, 8, 12);
  const values = Array.from({ length: an }, () => whole(r, 3, 60));
  const root = whole(r, 6, 19);
  const wm = whole(r, 5, 20) * 100;
  const rate = labPick(r, [5, 8, 10, 12, 20]);
  const fn = labPick(r, [3, 4, 5, 6]);
  const page = labPick(r, PAGES);
  const domain = `www.${labPick(r, SCHOOLS)}`;
  const path = labPick(r, PATHS);
  const file = labPick(r, FILES);
  const pcs = whole(r, 8, 24);
  const dist = labPick(r, [4, 5, 6, 7, 8]);
  const slack = labPick(r, [0.5, 1]);
  const pass = r() > 0.4;
  const base: Omit<CompCodeVariant, 'programs'> = {
    seed,
    task,
    io: { shape, dims, n, nums },
    loop: { pairs, start: lstart, step: lstep, power: labPick(r, [1, 2] as const), limit, q: [qa, qa + qs * whole(r, 3, 9), qs], tri: labPick(r, [40, 50, 60, 80, 100]) },
    arr: { n: an, values, stat: labPick(r, ['LARGEST', 'SMALLEST'] as const) },
    fn: { x: root * root, y: labBetween(r, 2, 9, 0) + labPick(r, [0.2, 0.3, 0.6, 0.8]), z: -whole(r, 3, 40), func: labPick(r, ['SIN', 'COS'] as const), step: labPick(r, [30, 45]) },
    wh: { m: wm, rate, target: Math.round(wm * labPick(r, [1.5, 1.8, 2, 2.5])) },
    flow: { n: fn, nums: Array.from({ length: fn }, () => whole(r, 6, 30)), form: labPick(r, [0, 1, 2] as const), abcd: [whole(r, 2, 6), whole(r, 5, 9), whole(r, 1, 4), whole(r, 1, 6)], series: labPick(r, ['ODD', 'EVEN', 'THREES'] as const), count: whole(r, 7, 12) },
    html: { title: page.title, heading: page.heading, para: page.para, items: pickSome(r, page.items, 3), linkText: labPick(r, ['Visit the school site', 'School website', 'More information']), linkUrl: `https://${domain}/`, protocol: 'https', domain, path: `/${path}/`, file, mb: labPick(r, [1.5, 2.5, 3, 4, 5]), mbps: labPick(r, [2, 4, 5, 8, 10]) },
    crimp: { pcs, dist, slack, box: 305, run: dist + slack },
    maint: { volts: 12, ah: labPick(r, [7, 9, 12]), sys: labPick(r, [120, 150, 180, 200]), mon: labPick(r, [25, 30, 40]), eff: labPick(r, [0.8, 0.85, 0.9]), pass, age: pass ? labPick(r, [1, 2]) : labPick(r, [3, 4, 5]), reading: pass ? labBetween(r, 12.4, 13.1, 1) : labBetween(r, 10.6, 11.6, 1), freed: whole(r, 180, 2400) },
  };
  return { ...base, programs: programs(base) };
}

// ------------------------------------------------------------------ what is recorded

export interface CompField {
  id: string;
  label: string;
  crit: 'record' | 'questions';
  answer: string;
  /** Numeric: within this absolute tolerance. Null: compared as text, ignoring case and spaces. */
  tol: number | null;
  unit?: string;
  placeholder?: string;
}
export interface CompTraceTable {
  id: string;
  title: string;
  cols: string[];
  rows: string[][];
  tol: number;
}
export interface CompMcq {
  id: string;
  q: string;
  options: string[];
  answer: number;
}

const f = (x: number, dp = 4) => String(roundDp(x, dp));
const nf = (id: string, label: string, crit: CompField['crit'], x: number, tol: number, unit?: string): CompField => ({ id, label, crit, answer: f(x), tol, unit });

export const whileRun = (m0: number, rate: number, target: number) => {
  let m = m0;
  let y = 0;
  const rows: [number, number][] = [];
  while (m <= target && y < 400) {
    m *= 1 + rate / 100;
    y++;
    rows.push([y, m]);
  }
  return { years: y, amount: m, rows };
};
export const loopSum = (start: number, limit: number, step: number, power: 1 | 2) => {
  let s = 0;
  const rows: [number, number][] = [];
  for (let k = start; k <= limit; k += step) {
    s += power === 2 ? k * k : k;
    rows.push([k, s]);
  }
  return { sum: s, rows };
};
export const tableValue = (func: 'SIN' | 'COS', d: number) => (func === 'SIN' ? Math.sin : Math.cos)((d * 3.14159) / 180);
export const noBrackets = (nums: number[]) => nums.slice(0, -1).reduce((t, x) => t + x, 0) + nums.at(-1)! / nums.length;
export const flowTerms = (series: FlowSeries, count: number) => Array.from({ length: count }, (_, i) => FLOW_SERIES[series].first + i * FLOW_SERIES[series].by);
export const domainLevels = (d: string) => d.split('.').length;
export const upsWh = (m: CompCodeVariant['maint']) => m.volts * m.ah;
export const upsMinutes = (m: CompCodeVariant['maint']) => ((upsWh(m) * m.eff) / (m.sys + m.mon)) * 60;
export const upsReplace = (m: CompCodeVariant['maint']) => !m.pass || m.age >= 3;

export function compFields(v: CompCodeVariant): CompField[] {
  switch (v.task) {
    case 'BASIC_IO':
      return [
        nf('outA', 'Program A: the area printed', 'record', IO_SHAPE[v.io.shape].area(v.io.dims), 0.02),
        nf('outB', 'Program B: the average printed', 'record', v.io.nums.reduce((t, x) => t + x, 0) / v.io.n, 0.02),
        nf('wrong', `Without brackets, ${ioVars(v.io.n).join(' + ')} / ${v.io.n} with your numbers gives`, 'questions', noBrackets(v.io.nums), 0.02),
      ];
    case 'BASIC_LOOP': {
      const [a, b, c] = v.loop.q;
      return [
        nf('sum', 'Program B: the sum printed', 'record', loopSum(v.loop.start, v.loop.limit, v.loop.step, v.loop.power).sum, 0.01),
        nf('count', `FOR K = ${a} TO ${b} STEP ${c} runs this many times`, 'questions', Math.floor((b - a) / c) + 1, 0.001),
        nf('tri', `Sum of the first ${v.loop.tri} whole numbers (change your program to find it)`, 'questions', (v.loop.tri * (v.loop.tri + 1)) / 2, 0.01),
      ];
    }
    case 'BASIC_ARRAY': {
      const a = v.arr.values;
      const sum = a.reduce((t, x) => t + x, 0);
      const pick = v.arr.stat === 'LARGEST' ? Math.max(...a) : Math.min(...a);
      return [
        nf('sum', 'Sum printed', 'record', sum, 0.01),
        nf('mean', 'Mean printed', 'record', sum / v.arr.n, 0.01),
        nf('stat', `${v.arr.stat === 'LARGEST' ? 'Largest' : 'Smallest'} value printed`, 'record', pick, 0.01),
        nf('first', 'First number printed by the reverse loop', 'record', a.at(-1)!, 0.01),
        nf('pos', `Subscript of the ${v.arr.stat.toLowerCase()} value`, 'questions', a.indexOf(pick) + 1, 0.001),
      ];
    }
    case 'BASIC_FUNC': {
      const { x, y, z } = v.fn;
      return [nf('sqr', `SQR(${x})`, 'record', Math.sqrt(x), 0.001), nf('intp', `INT(${y})`, 'record', Math.floor(y), 0.001), nf('intn', `INT(${-y})`, 'record', Math.floor(-y), 0.001), nf('abs', `ABS(${z})`, 'record', Math.abs(z), 0.001), nf('maxd', `The angle from 0 to 180 degrees where ${v.fn.func} x is largest`, 'questions', v.fn.func === 'SIN' ? 90 : 0, 0.5, '°')];
    }
    case 'BASIC_WHILE': {
      const r = whileRun(v.wh.m, v.wh.rate, v.wh.target);
      return [nf('years', 'YEARS printed', 'record', r.years, 0.001), nf('amount', 'AMOUNT printed', 'record', r.amount, Math.max(0.05, r.amount * 0.0005)), nf('passes', 'How many times the loop body ran', 'questions', r.years, 0.001)];
    }
    case 'FLOW': {
      const form = FLOW_FORMS[v.flow.form];
      const [a, b, c, d] = v.flow.abcd;
      return [nf('avg', 'Chart A: the average output', 'record', v.flow.nums.reduce((t, x) => t + x, 0) / v.flow.n, 0.02), nf('y', 'Chart B: y', 'record', form.f(a, b, c, d), 0.02), nf('last', 'Chart C: the last number output', 'questions', flowTerms(v.flow.series, v.flow.count).at(-1)!, 0.001)];
    }
    case 'HTML':
      return [
        { id: 'protocol', label: `In https://${v.html.domain}${v.html.path}${v.html.file}: the protocol`, crit: 'record', answer: v.html.protocol, tol: null },
        { id: 'domain', label: 'The domain name', crit: 'record', answer: v.html.domain, tol: null },
        { id: 'path', label: 'The path', crit: 'record', answer: v.html.path, tol: null },
        { id: 'file', label: 'The file name', crit: 'record', answer: v.html.file, tol: null },
        nf('levels', `Parts (levels) in the domain ${v.html.domain}`, 'record', domainLevels(v.html.domain), 0.001),
        nf('time', `A ${v.html.mb} MB page on a ${v.html.mbps} Mbps link takes`, 'questions', (v.html.mb * 8) / v.html.mbps, 0.02, 's'),
      ];
    case 'CRIMP': {
      const c = v.crimp;
      const cable = c.pcs * c.run;
      return [nf('cable', `Cable for ${c.pcs} computers, each ${c.dist} m from the switch plus ${c.slack} m slack`, 'record', cable, 0.06, 'm'), nf('plugs', 'RJ45 plugs to buy (2 per cable, plus 10% for mistakes, rounded up)', 'record', Math.ceil(c.pcs * 2 * 1.1 - 1e-9), 0.001), nf('left', `Cable left in a ${c.box} m box`, 'record', c.box - cable, 0.06, 'm')];
    }
    case 'MAINT': {
      const m = v.maint;
      return [
        nf('wh', 'Energy stored in the battery', 'record', upsWh(m), 0.5, 'Wh'),
        nf('mins', 'UPS runtime', 'record', upsMinutes(m), 0.6, 'min'),
        { id: 'volts', label: 'Battery voltage in the self-test', crit: 'record', answer: m.reading.toFixed(1), tol: 0.051, unit: 'V' },
        nf('freed', 'Space freed by Disk Cleanup', 'record', m.freed, 0.6, 'MB'),
        { id: 'replace', label: 'Should the UPS battery be replaced now? (YES or NO)', crit: 'questions', answer: upsReplace(m) ? 'YES' : 'NO', tol: null },
      ];
    }
  }
}

export function compTraces(v: CompCodeVariant): CompTraceTable[] {
  const n = (x: number, dp = 2) => String(roundDp(x, dp));
  switch (v.task) {
    case 'BASIC_LOOP':
      return [
        { id: 'T1', title: 'Program A: one row for each pass', cols: ['I', 'L', 'B', 'A', 'P'], tol: 0.01, rows: v.loop.pairs.map(([l, b], i) => [i + 1, l, b, l * b, 2 * (l + b)].map((x) => n(x))) },
        { id: 'T2', title: `Program B with M = ${v.loop.limit}`, cols: ['K', 'S'], tol: 0.01, rows: loopSum(v.loop.start, v.loop.limit, v.loop.step, v.loop.power).rows.map((r) => r.map((x) => n(x))) },
      ];
    case 'BASIC_FUNC': {
      const rows: string[][] = [];
      for (let d = 0; d <= 360; d += v.fn.step) rows.push([String(d), n(tableValue(v.fn.func, d), 3)]);
      return [{ id: 'T1', title: `Program B: ${v.fn.func} to 3 decimal places`, cols: ['D', `${v.fn.func}(R)`], tol: 0.002, rows }];
    }
    case 'BASIC_WHILE':
      return [{ id: 'T1', title: 'Desk check: one row for each year', cols: ['Year', 'Amount'], tol: 0.02, rows: whileRun(v.wh.m, v.wh.rate, v.wh.target).rows.map(([y, a]) => [String(y), n(a)]) }];
    case 'BASIC_ARRAY':
      return [];
    case 'FLOW': {
      let sum = 0;
      return [{ id: 'T1', title: 'Chart A: trace table', cols: ['COUNT', 'X', 'SUM'], tol: 0.01, rows: v.flow.nums.map((x, i) => [String(i + 1), String(x), String((sum += x))]) }];
    }
    default:
      return [];
  }
}

export const COMP_MCQ: Record<CompTask, CompMcq[]> = {
  BASIC_IO: [{ id: 'q1', q: 'Which is the correct BASIC form of ½bh?', options: ['1/2BH', '0.5 * B * H', '0.5BH', '1/2 x B x H'], answer: 1 }],
  BASIC_LOOP: [{ id: 'q1', q: 'What happens when READ runs out of values?', options: ['It uses 0', 'The loop stops quietly', '“Out of DATA” error', 'It starts the DATA again'], answer: 2 }],
  BASIC_ARRAY: [{ id: 'q1', q: 'Why start BIG (or SMALL) at N(1), not at 0?', options: ['Arrays start at 1', 'A value of 0 may be beyond every element, for example if all are negative', 'It runs faster', 'BASIC needs it'], answer: 1 }],
  BASIC_FUNC: [{ id: 'q1', q: 'Why multiply degrees by PI / 180 before calling SIN or COS?', options: ['To round the answer', 'They expect the angle in radians', 'To make it an integer', 'To convert to grads'], answer: 1 }],
  BASIC_WHILE: [{ id: 'q1', q: 'Which order of program development is correct?', options: ['Coding, analysis, flowcharting, testing', 'Problem definition, analysis, flowcharting, desk checking, coding, testing, documentation', 'Analysis, problem definition, coding, documentation', 'Flowcharting, coding, problem definition, testing'], answer: 1 }],
  FLOW: [
    { id: 'q1', q: 'Which symbol is used for input and output?', options: ['Rectangle', 'Oval', 'Parallelogram', 'Diamond'], answer: 2 },
    { id: 'q2', q: 'How many exits does a decision box have?', options: ['One', 'Two, labelled Yes and No', 'Three', 'As many as needed'], answer: 1 },
  ],
  HTML: [{ id: 'q1', q: 'HTTP and HTML are', options: ['the same thing', 'HTTP transfers pages; HTML describes them', 'HTML transfers pages; HTTP describes them', 'two web browsers'], answer: 1 }],
  CRIMP: [
    { id: 'q1', q: 'Which connector does a UTP network cable use?', options: ['RJ11', 'BNC', 'RJ45', 'VGA'], answer: 2 },
    { id: 'q2', q: 'A straight-through cable has', options: ['T568A at one end, T568B at the other', 'the same wire order at both ends', 'pins 1 and 2 crossed', 'four wires only'], answer: 1 },
  ],
  MAINT: [{ id: 'q1', q: 'Why hold the fan still while blowing it clean?', options: ['A spun fan can generate a voltage and damage its bearings', 'To cool it', 'To save electricity', 'To stop the noise'], answer: 0 }],
};

/** The written question on each task card. */
export const COMP_EXPLAIN_Q: Record<CompTask, string> = {
  BASIC_IO: 'Explain why X + Y + Z / 3 gives the wrong average, and what REM and END do in a program.',
  BASIC_LOOP: 'Explain how READ and DATA work together in the loop, and why S must be set to 0 before the loop.',
  BASIC_ARRAY: 'Explain what DIM N(10) does, and how the subscript and the value of an element differ.',
  BASIC_FUNC: 'Explain why INT(-7.8) gives -8, and why SIN(180°) may print a tiny number instead of 0 in your table.',
  BASIC_WHILE: 'Explain what desk checking is and why it is done, and what would happen if line 70 (the line that changes M) were left out.',
  FLOW: 'State the characteristics of a good algorithm, and explain why SUM and COUNT are set to 0 at the start.',
  HTML: 'Explain the difference between the Internet and the World Wide Web, and between a website address and an e-mail address.',
  CRIMP: 'Explain why the same wire order must be kept at both ends, and how a cable tester shows a good cable.',
  MAINT: 'Explain why dust and heat harm a computer, and why a battery stores less than its label says when the load is high.',
};

// ------------------------------------------------------------------ bench: cable

export const CRIMP_STRIP = [20, 30] as const;
export const CRIMP_TRIM = [12, 14] as const;
export interface CrimpEnd {
  stripped: number | null;
  untwisted: boolean;
  order: string[] | null;
  trim: number | null;
  clip: 'DOWN' | 'UP' | null;
  crimped: boolean;
  /** Boots were on the cable when it was crimped. */
  boot: boolean;
}
const newEnd = (): CrimpEnd => ({ stripped: null, untwisted: false, order: null, trim: null, clip: null, crimped: false, boot: false });
export interface CrimpRun {
  cut: number | null;
  boots: boolean;
  ends: Record<'A' | 'B', CrimpEnd>;
  tested: number;
  /** Remote pin each near pin reaches: 0 is open. Null before the cable has two plugs. */
  pins: number[] | null;
  recuts: number;
}
/** The wires in plug order, from pin 1, looking at the plug with the clip down. */
export function endPins(e: CrimpEnd): string[] | null {
  if (!e.order || !e.crimped) return null;
  return e.clip === 'UP' ? [...e.order].reverse() : e.order;
}
/** True when the wires reach the pins: trimmed too short, they never touch the contacts. */
export const endReaches = (e: CrimpEnd) => e.trim !== null && e.trim >= 11;

export function crimpRun(ev: CompEvent[]): CrimpRun {
  const r: CrimpRun = { cut: null, boots: false, ends: { A: newEnd(), B: newEnd() }, tested: 0, pins: null, recuts: 0 };
  for (const e of ev) {
    const end = e.x[0] === 'B' ? r.ends.B : r.ends.A;
    switch (e.a) {
      case 'CUT':
        r.cut = e.n / 10;
        break;
      case 'BOOTS':
        r.boots = true;
        break;
      case 'STRIP':
        end.stripped = e.n;
        break;
      case 'UNTWIST':
        end.untwisted = true;
        break;
      case 'ORDER':
        end.order = e.x.slice(2).split(',').filter(Boolean);
        break;
      case 'TRIM':
        end.trim = e.n;
        break;
      case 'INSERT':
        end.clip = e.x.endsWith('UP') ? 'UP' : 'DOWN';
        break;
      case 'CRIMP':
        end.crimped = true;
        end.boot = r.boots;
        break;
      case 'RECUT':
        r.ends[e.x[0] === 'B' ? 'B' : 'A'] = newEnd();
        r.recuts++;
        r.tested = 0;
        break;
      case 'TEST':
        r.tested++;
        break;
      default:
        break;
    }
  }
  const a = endPins(r.ends.A);
  const b = endPins(r.ends.B);
  if (a && b) {
    const ok = endReaches(r.ends.A) && endReaches(r.ends.B);
    r.pins = a.map((w) => (ok ? b.indexOf(w) + 1 : 0));
  }
  return r;
}
export const crimpPass = (r: CrimpRun) => !!r.pins && r.pins.every((p, i) => p === i + 1);
export const crimpStandard = (e: CrimpEnd) => {
  const p = endPins(e);
  return !!p && p.length === 8 && p.every((w, i) => w === T568B[i]);
};
/** Why a step can't be done yet (undefined: it can). */
export function crimpBlocked(ev: CompEvent[], a: CompAct, x: string): string | undefined {
  const r = crimpRun(ev);
  const end = x[0] === 'B' ? r.ends.B : r.ends.A;
  if (a === 'CUT') return r.cut !== null ? 'The cable is already cut.' : undefined;
  if (r.cut === null) return 'Measure and cut the cable first.';
  if (a === 'BOOTS') return r.boots ? 'The boots are on.' : undefined;
  if (a === 'TEST') return r.pins ? undefined : 'Crimp a plug on both ends first.';
  if (a === 'RECUT') return end.stripped === null ? 'This end has not been started.' : undefined;
  if (end.crimped) return 'This end is crimped. Cut it off to redo it.';
  if (a === 'STRIP') return undefined;
  if (end.stripped === null) return 'Strip the outer jacket first.';
  if (a === 'UNTWIST') return undefined;
  if (!end.untwisted) return 'Untwist the pairs first.';
  if (a === 'ORDER') return undefined;
  if (!end.order) return 'Arrange the eight wires first.';
  if (a === 'TRIM') return undefined;
  if (end.trim === null) return 'Trim the wires straight first.';
  if (a === 'INSERT') return undefined;
  return end.clip ? undefined : 'Push the wires into the plug first.';
}
export function crimpModelEvents(v: CompCodeVariant): CompEvent[] {
  const end = (e: 'A' | 'B'): CompEvent[] => [
    { a: 'STRIP', x: e, n: 25 },
    { a: 'UNTWIST', x: e, n: 0 },
    { a: 'ORDER', x: `${e}:${T568B.join(',')}`, n: 0 },
    { a: 'TRIM', x: e, n: 13 },
    { a: 'INSERT', x: `${e}:DOWN`, n: 0 },
    { a: 'CRIMP', x: e, n: 0 },
  ];
  return [{ a: 'CUT', x: '', n: Math.round(v.crimp.run * 10) }, { a: 'BOOTS', x: '', n: 0 }, ...end('A'), ...end('B'), { a: 'TEST', x: '', n: 0 }];
}

// ------------------------------------------------------------------ bench: maintenance

export interface MaintAction {
  obj: 'sysunit' | 'monitor' | 'keyboard' | 'dvd' | 'ups' | 'screen';
  a: CompAct;
  x: string;
  label: string;
  tone?: 'brand' | 'danger';
}
export const MAINT_ACTIONS: MaintAction[] = [
  { obj: 'screen', a: 'SHUTDOWN', x: '', label: 'Start > Power > Shut down' },
  { obj: 'sysunit', a: 'UNPLUG', x: '', label: 'Switch off at the wall socket' },
  { obj: 'monitor', a: 'WIPE', x: 'DAMP', label: 'Wipe the screen with a slightly damp microfibre cloth' },
  { obj: 'monitor', a: 'WIPE', x: 'WET', label: 'Spray water straight on the screen', tone: 'danger' },
  { obj: 'sysunit', a: 'CASE', x: '', label: 'Clean the casing and the mouse' },
  { obj: 'keyboard', a: 'KEYTAP', x: '', label: 'Turn the keyboard over and tap it' },
  { obj: 'keyboard', a: 'KEYBRUSH', x: '', label: 'Brush between the keys' },
  { obj: 'keyboard', a: 'KEYCLEAN', x: 'ALCOHOL', label: 'Clean the keys with isopropyl alcohol on a cloth' },
  { obj: 'keyboard', a: 'KEYCLEAN', x: 'WATER', label: 'Wash the keyboard under the tap', tone: 'danger' },
  { obj: 'sysunit', a: 'BLOW', x: 'HOLD', label: 'Blow out the vents, holding the fans still' },
  { obj: 'sysunit', a: 'BLOW', x: 'FREE', label: 'Blow the fans so that they spin', tone: 'danger' },
  { obj: 'dvd', a: 'LENS', x: '', label: 'Run the lens-cleaning disc' },
  { obj: 'sysunit', a: 'REPLUG', x: '', label: 'Switch on at the wall' },
  { obj: 'ups', a: 'UPSTEST', x: '', label: 'Press the UPS self-test button' },
  { obj: 'sysunit', a: 'BOOT', x: '', label: 'Press the power button' },
  { obj: 'screen', a: 'CLEANUP', x: '', label: 'Run Disk Cleanup' },
  { obj: 'screen', a: 'UPDATES', x: '', label: 'Check for updates (Windows and antivirus)' },
  { obj: 'screen', a: 'BACKUP', x: 'USB', label: 'Back up to an external drive' },
  { obj: 'screen', a: 'BACKUP', x: 'SAME', label: 'Back up to a folder on the same disk', tone: 'danger' },
];
export interface MaintRun {
  on: boolean;
  plugged: boolean;
  /** Cleaning jobs done with the computer live. */
  live: string[];
  done: Set<string>;
  wet: boolean;
  spun: boolean;
  badBackup: boolean;
  rebootedBeforeSoftware: boolean;
}
const CLEANING = new Set<CompAct>(['WIPE', 'CASE', 'KEYTAP', 'KEYBRUSH', 'KEYCLEAN', 'BLOW', 'LENS']);
const key2 = (e: CompEvent) => (e.x && e.a !== 'BACKUP' ? `${e.a}:${e.x}` : e.a);
export function maintRun(ev: CompEvent[]): MaintRun {
  const r: MaintRun = { on: true, plugged: true, live: [], done: new Set(), wet: false, spun: false, badBackup: false, rebootedBeforeSoftware: true };
  for (const e of ev) {
    r.done.add(key2(e));
    if (e.a === 'SHUTDOWN') r.on = false;
    else if (e.a === 'UNPLUG') r.plugged = false;
    else if (e.a === 'REPLUG') r.plugged = true;
    else if (e.a === 'BOOT') r.on = true;
    if (CLEANING.has(e.a) && (r.on || r.plugged)) r.live.push(e.a);
    if (e.a === 'WIPE' && e.x === 'WET') r.wet = true;
    if (e.a === 'KEYCLEAN' && e.x === 'WATER') r.wet = true;
    if (e.a === 'BLOW' && e.x === 'FREE') r.spun = true;
    if (e.a === 'BACKUP' && e.x === 'SAME') r.badBackup = true;
  }
  return r;
}
export function maintBlocked(ev: CompEvent[], a: CompAct): string | undefined {
  const r = maintRun(ev);
  if (a === 'SHUTDOWN') return r.on ? undefined : 'It is already off.';
  if (a === 'UNPLUG') return r.on ? 'Shut down properly first: pulling the power on a running computer can corrupt files.' : !r.plugged ? 'It is already off at the wall.' : undefined;
  if (a === 'REPLUG') return r.plugged ? 'It is already on at the wall.' : undefined;
  if (a === 'BOOT') return r.on ? 'It is already on.' : !r.plugged ? 'Switch on at the wall first.' : undefined;
  if (a === 'UPSTEST') return r.plugged ? undefined : 'The UPS needs mains power for its self-test.';
  if ((a === 'CLEANUP' || a === 'UPDATES' || a === 'BACKUP') && !r.on) return 'The computer is off.';
  return undefined;
}
export const MAINT_MODEL: [CompAct, string][] = [
  ['SHUTDOWN', ''], ['UNPLUG', ''], ['WIPE', 'DAMP'], ['CASE', ''], ['KEYTAP', ''], ['KEYBRUSH', ''], ['KEYCLEAN', 'ALCOHOL'], ['BLOW', 'HOLD'], ['LENS', ''], ['REPLUG', ''], ['UPSTEST', ''], ['BOOT', ''], ['CLEANUP', ''], ['UPDATES', ''], ['BACKUP', 'USB'],
];

// ------------------------------------------------------------------ model answers

const numbered = (lines: string[]) => lines.map((l, i) => `${(i + 1) * 10} ${l}`).join('\n');

/** A correct program for a program id, as a careful student would write it. */
export function compModelSource(v: CompCodeVariant, id: string, data?: string[]): string {
  const d = (x: string[]) => `DATA ${(data ?? x).join(', ')}`;
  switch (v.task) {
    case 'BASIC_IO': {
      if (id === 'A') {
        const s = IO_SHAPE[v.io.shape];
        return numbered([`REM ${s.rem}`, ...s.vars.map((x, i) => `INPUT "${s.words[i]}"; ${x}`), `LET AREA = ${s.expr}`, 'PRINT "AREA ="; AREA', 'END']);
      }
      const names = ioVars(v.io.n);
      return numbered([`REM AVERAGE OF ${v.io.n} NUMBERS`, `INPUT ${names.join(', ')}`, `LET M = (${names.join(' + ')}) / ${v.io.n}`, 'PRINT "AVERAGE ="; M', 'END']);
    }
    case 'BASIC_LOOP':
      if (id === 'A') return numbered(['REM AREA AND PERIMETER', `FOR I = 1 TO ${v.loop.pairs.length}`, 'READ L, B', 'LET A = L * B', 'LET P = 2 * (L + B)', 'PRINT L, B, A, P', 'NEXT I', d(v.loop.pairs.flat().map(String)), 'END']);
      return numbered(['REM SUM IN A LOOP', 'INPUT "UPPER LIMIT"; M', 'LET S = 0', `FOR K = ${v.loop.start} TO M STEP ${v.loop.step}`, `LET S = S + ${v.loop.power === 2 ? 'K * K' : 'K'}`, 'NEXT K', 'PRINT "SUM ="; S', 'END']);
    case 'BASIC_ARRAY': {
      const n = v.arr.n;
      const big = v.arr.stat === 'LARGEST';
      return numbered(['REM SUM, MEAN AND EXTREME VALUE', `DIM N(${n})`, 'LET S = 0', `FOR I = 1 TO ${n}`, 'READ N(I)', 'LET S = S + N(I)', 'NEXT I', 'LET BIG = N(1)', `FOR I = 2 TO ${n}`, `IF N(I) ${big ? '>' : '<'} BIG THEN BIG = N(I)`, 'NEXT I', `PRINT "SUM ="; S; "MEAN ="; S / ${n}; "${v.arr.stat} ="; BIG`, `FOR I = ${n} TO 1 STEP -1`, 'PRINT N(I)', 'NEXT I', d(v.arr.values.map(String)), 'END']);
    }
    case 'BASIC_FUNC':
      if (id === 'A') return numbered(['REM BUILT-IN FUNCTIONS', 'INPUT X, Y, Z', 'PRINT SQR(X), INT(Y), INT(-Y), ABS(Z)', 'END']);
      return numbered([`REM TABLE OF ${v.fn.func}`, 'LET PI = 3.14159', 'INPUT "STEP"; S', 'FOR D = 0 TO 360 STEP S', 'LET R = D * PI / 180', `PRINT D, ${v.fn.func}(R)`, 'NEXT D', 'END']);
    case 'BASIC_WHILE':
      return numbered(['REM YEARS FOR SAVINGS TO PASS A TARGET', 'INPUT "AMOUNT"; M', 'INPUT "RATE"; R', 'INPUT "TARGET"; T', 'LET Y = 0', 'WHILE M <= T', 'LET M = M * (1 + R / 100)', 'LET Y = Y + 1', 'WEND', 'PRINT "YEARS ="; Y; "AMOUNT ="; M', 'END']);
    case 'HTML': {
      const h = v.html;
      return `<html>\n<head>\n<title>${h.title}</title>\n</head>\n<body>\n<h1>${h.heading}</h1>\n<p>${h.para}</p>\n<ul>\n${h.items.map((x) => `<li>${x}</li>`).join('\n')}\n</ul>\n<a href="${h.linkUrl}">${h.linkText}</a>\n</body>\n</html>\n`;
    }
    default:
      return '';
  }
}

type Box = [id: string, kind: FlowKind, text: string];
function chart(boxes: Box[], edges: [string, string, FlowEdge['label']?][]): FlowChart {
  return { nodes: boxes.map(([id, kind, text], i) => ({ id, kind, text, x: 150, y: 40 + i * 92 })), edges: edges.map(([from, to, label]) => ({ from, to, label: label ?? '' })) };
}
const line = (ids: string[]): [string, string][] => ids.slice(1).map((x, i) => [ids[i]!, x]);

/** A correct flowchart for a chart id. */
export function compModelChart(v: CompCodeVariant, id: string): FlowChart {
  if (id === 'A') {
    const n = v.flow.n;
    return chart(
      [['s', 'TERMINAL', 'START'], ['i', 'PROCESS', 'SUM = 0, COUNT = 0'], ['x', 'IO', 'INPUT X'], ['a', 'PROCESS', 'SUM = SUM + X'], ['c', 'PROCESS', 'COUNT = COUNT + 1'], ['d', 'DECISION', `COUNT = ${n}?`], ['m', 'PROCESS', `AVERAGE = SUM / ${n}`], ['p', 'IO', 'PRINT AVERAGE'], ['e', 'TERMINAL', 'STOP']],
      [...line(['s', 'i', 'x', 'a', 'c', 'd']), ['d', 'm', 'YES'], ['d', 'x', 'NO'], ...line(['m', 'p', 'e'])],
    );
  }
  if (id === 'B')
    return chart([['s', 'TERMINAL', 'START'], ['i', 'IO', 'INPUT A, B, C, D'], ['y', 'PROCESS', `Y = ${FLOW_FORMS[v.flow.form].expr}`], ['p', 'IO', 'PRINT Y'], ['e', 'TERMINAL', 'STOP']], line(['s', 'i', 'y', 'p', 'e']));
  const se = FLOW_SERIES[v.flow.series];
  return chart(
    [['s', 'TERMINAL', 'START'], ['i', 'PROCESS', `N = ${se.first}, COUNT = 0`], ['p', 'IO', 'PRINT N'], ['a', 'PROCESS', `N = N + ${se.by}`], ['c', 'PROCESS', 'COUNT = COUNT + 1'], ['d', 'DECISION', `COUNT = ${v.flow.count}?`], ['e', 'TERMINAL', 'STOP']],
    [...line(['s', 'i', 'p', 'a', 'c', 'd']), ['d', 'e', 'YES'], ['d', 'p', 'NO']],
  );
}

/** What the program ids are for a task. */
export const compProgramIds = (v: CompCodeVariant) => v.programs.map((p) => p.id);

/** A complete answer, for the tests and the demonstration's closing state. */
export function compModelState(v: CompCodeVariant): CompCodeState {
  const s = emptyCompCodeState();
  s.task = v.task;
  const fam = compFamily(v.task);
  for (const p of v.programs) {
    if (fam === 'FLOW') s.charts[p.id] = compModelChart(v, p.id);
    else {
      s.programs[p.id] = compModelSource(v, p.id);
      s.names[p.id] = p.file;
    }
  }
  if (v.task === 'CRIMP') s.events = crimpModelEvents(v);
  if (v.task === 'MAINT') s.events = MAINT_MODEL.map(([a, x]) => ({ a, x, n: 0 }));
  for (const f2 of compFields(v)) s.readings[f2.id] = f2.answer;
  for (const t of compTraces(v)) s.trace[t.id] = t.rows.map((r) => [...r]);
  for (const q of COMP_MCQ[v.task]) s.choices[q.id] = [q.answer];
  return s;
}
