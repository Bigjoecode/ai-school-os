import {
  COMP_CODE,
  COMP_EXPLAIN_Q,
  COMP_MCQ,
  COMP_TASK_TITLE,
  CRIMP_STRIP,
  CRIMP_TRIM,
  FLOW_FORMS,
  IO_SHAPE,
  basicNumbersIn,
  compCodeVariant,
  compFamily,
  compFields,
  compModelChart,
  compModelSource,
  compModelState,
  compTraces,
  crimpPass,
  crimpRun,
  crimpStandard,
  endReaches,
  flowFacts,
  flowRole,
  flowTerms,
  htmlFacts,
  labBetween,
  labPick,
  labRandom,
  loopSum,
  maintRun,
  runBasic,
  runFlow,
  tableValue,
  whileRun,
  type CompCodeState,
  type CompCodeVariant,
  type CompField,
  type CompTask,
  type CriterionScore,
  type FlowChart,
} from '@aischool/shared';
import { parseNumber, score } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/** Far less than a browser run: a marked run only has to do what the question asks. */
export const GRADE_TICKS = 120_000;

/** One hidden test: what is typed at INPUT, the DATA used instead of the program's own, and the numbers the output must carry, in order. */
export interface HiddenTest {
  values: string[];
  data?: string[];
  expect: number[];
  /** Absolute tolerance for each value (default: 0.2%, at least 0.011). */
  tol?: number[];
  /** The output may carry no more numbers than these (a running total printed in the loop fails). */
  once?: boolean;
  /** The words the output must contain. */
  label?: string;
}

const crit = (id: string) => COMP_CODE.rubric.find((c) => c.id === id)!;
const halves = (m: number) => Math.floor(m * 2 + 1e-9) / 2;
const round = (x: number, dp = 4) => Math.round(x * 10 ** dp) / 10 ** dp;
const rng = (v: CompCodeVariant, pid: string) => labRandom(v.seed, `comp-code:hidden:${v.task}:${pid}`);
const ints = (r: () => number, n: number, a: number, b: number) => Array.from({ length: n }, () => Math.round(labBetween(r, a, b, 0)));
const strs = (xs: number[]) => xs.map(String);

/** The hidden test cases for one program or chart. They exist only here, on the server. */
export function compHiddenTests(v: CompCodeVariant, pid: string): HiddenTest[] {
  const r = rng(v, pid);
  switch (v.task) {
    case 'BASIC_IO': {
      if (pid === 'A') {
        const s = IO_SHAPE[v.io.shape];
        const sets = [ints(r, s.vars.length, 3, 40), ints(r, s.vars.length, 50, 200), s.vars.map(() => labBetween(r, 1.5, 9.5, 1)), s.vars.map(() => 1)];
        return sets.map((x) => ({ values: strs(x), expect: [s.area(x)], tol: [Math.max(0.012, s.area(x) * 0.002)], label: 'AREA' }));
      }
      const sets = [ints(r, v.io.n, 10, 99), ints(r, v.io.n, 100, 900), Array.from({ length: v.io.n }, () => labBetween(r, -9, 9, 1)), v.io.nums.map((x) => x + 1)];
      return sets.map((x) => ({ values: strs(x), expect: [x.reduce((t, y) => t + y, 0) / v.io.n], label: 'AVERAGE' }));
    }
    case 'BASIC_LOOP': {
      if (pid === 'A') {
        const np = v.loop.pairs.length;
        return [0, 1, 2].map(() => {
          const pairs = Array.from({ length: np }, (): [number, number] => [labBetween(r, 2, 30, 0) + labPick(r, [0, 0.5, 0.25]), labBetween(r, 1, 20, 0)]);
          return { values: [], data: strs(pairs.flat()), expect: pairs.flatMap(([l, b]) => [l, b, l * b, 2 * (l + b)]) };
        });
      }
      const { start, step, power } = v.loop;
      const ms = [start + step * Math.round(labBetween(r, 8, 12, 0)), start + step * Math.round(labBetween(r, 13, 20, 0)) + 1, start + step * 6, start - 1];
      return ms.map((m) => ({ values: [String(m)], expect: [loopSum(start, m, step, power).sum], tol: [0.5], once: true, label: 'SUM' }));
    }
    case 'BASIC_ARRAY': {
      const n = v.arr.n;
      const sets = [ints(r, n, 1, 500), ints(r, n, -90, -2), Array.from({ length: n }, () => labBetween(r, -20, 20, 1))];
      return sets.map((x) => {
        const sum = x.reduce((t, y) => t + y, 0);
        return { values: [], data: strs(x), expect: [sum, sum / n, v.arr.stat === 'LARGEST' ? Math.max(...x) : Math.min(...x), ...[...x].reverse()], label: 'MEAN' };
      });
    }
    case 'BASIC_FUNC': {
      if (pid === 'A') {
        const sets = [[Math.round(labBetween(r, 2, 30, 0)) ** 2, labBetween(r, 1, 50, 1) + 0.05, -Math.round(labBetween(r, 2, 90, 0))], [labBetween(r, 2, 400, 0) + 0.5, labBetween(r, 0.1, 0.9, 1), Math.round(labBetween(r, 2, 90, 0))], [0, 12, 0]];
        return sets.map(([x, y, z]) => ({ values: strs([x!, y!, z!]), expect: [Math.sqrt(x!), Math.floor(y!), Math.floor(-y!), Math.abs(z!)], tol: [0.002, 0.002, 0.002, 0.002] }));
      }
      return [90, 60, 120].map((s) => {
        const expect: number[] = [];
        for (let d = 0; d <= 360; d += s) expect.push(d, tableValue(v.fn.func, d));
        return { values: [String(s)], expect, tol: expect.map((_, i) => (i % 2 ? 0.003 : 0.001)) };
      });
    }
    case 'BASIC_WHILE': {
      const sets: [number, number, number][] = [
        [Math.round(labBetween(r, 4, 30, 0)) * 100, labPick(r, [4, 6, 15]), Math.round(labBetween(r, 40, 90, 0)) * 100],
        [Math.round(labBetween(r, 10, 60, 0)) * 50, labPick(r, [7, 25, 30]), Math.round(labBetween(r, 100, 200, 0)) * 100],
        [5000, 10, 4000],
        [1000, 100, 2000],
      ];
      return sets.map(([m, rate, t]) => {
        const w = whileRun(m, rate, t);
        return { values: strs([m, rate, t]), expect: [w.years, w.amount], tol: [0.001, Math.max(0.05, w.amount * 0.001)], label: 'YEARS' };
      });
    }
    case 'FLOW': {
      if (pid === 'A') return [ints(r, v.flow.n, 2, 60), ints(r, v.flow.n, 100, 500), Array.from({ length: v.flow.n }, () => labBetween(r, -9, 9, 1))].map((x) => ({ values: strs(x), expect: [x.reduce((t, y) => t + y, 0) / v.flow.n] }));
      if (pid === 'B') {
        const form = FLOW_FORMS[v.flow.form];
        return [ints(r, 4, 1, 9), ints(r, 4, 2, 20), [1.5, 7, 3, 2]].map((x) => ({ values: strs(x), expect: [form.f(x[0]!, x[1]!, x[2]!, x[3]!)] }));
      }
      return [{ values: [], expect: flowTerms(v.flow.series, v.flow.count), once: true }];
    }
    default:
      return [];
  }
}

/** How much of `expect` the output carries, in order (0 to 1). */
export function matched(numbers: number[], t: HiddenTest): number {
  let at = 0;
  let got = 0;
  t.expect.forEach((want, i) => {
    const tol = t.tol?.[i] ?? Math.max(0.011, Math.abs(want) * 0.002);
    for (let k = at; k < numbers.length; k++)
      if (Math.abs(numbers[k]! - want) <= tol) {
        got++;
        at = k + 1;
        return;
      }
  });
  return t.expect.length ? got / t.expect.length : 0;
}

interface Tested {
  credit: number;
  first: string | null;
  labelled: boolean;
}

function testRuns(runs: { status: string; output: string; fault: string | null }[], tests: HiddenTest[]): Tested {
  let credit = 0;
  let first: string | null = null;
  let labelled = true;
  tests.forEach((t, i) => {
    const r = runs[i]!;
    const nums = basicNumbersIn(r.output);
    let c = r.status === 'done' ? matched(nums, t) : 0;
    let why: string | null = null;
    if (r.status === 'limit') why = 'it never finished: check that the loop can end';
    else if (r.status === 'no-input') why = 'it asked for more input than the question gives';
    else if (r.status === 'error') why = r.fault ?? 'it stopped with an error';
    else if (c < 1) why = `it should have printed ${t.expect.slice(0, 6).map((x) => round(x)).join(', ')}`;
    if (t.once && nums.length > t.expect.length + 2) {
      c = Math.min(c, 0.5);
      why = 'it printed more than the one result asked for: PRINT belongs after the loop';
    }
    if (t.label && r.status === 'done' && !r.output.toUpperCase().includes(t.label)) labelled = false;
    credit += c;
    if (c < 1 && !first && why) first = `With ${t.data ? 'other DATA' : t.values.length ? t.values.join(', ') : 'the run'}: ${why}.`;
  });
  return { credit: tests.length ? credit / tests.length : 0, first, labelled };
}

function testProgram(source: string, tests: HiddenTest[]): Tested {
  const runs = tests.map((t) => {
    const r = runBasic(source, t.values, { echo: false, ticks: GRADE_TICKS, data: t.data, rnd: 7 });
    return { status: r.status, output: r.output, fault: r.fault?.message ?? null };
  });
  return testRuns(runs, tests);
}
function testChart(chart: FlowChart, tests: HiddenTest[]): Tested {
  const runs = tests.map((t) => {
    const r = runFlow(chart, t.values, { ticks: GRADE_TICKS });
    return { status: r.status, output: r.output, fault: r.fault?.message ?? null };
  });
  return testRuns(runs, tests);
}

// ------------------------------------------------------------------ AI items

const SAFE = { kw: [['food', 'drink', 'spill', 'spilt'], ['wet', 'dry hands'], ['frayed', 'cable', 'socket'], ['eye level', 'posture', 'upright', 'rest your eyes', 'arm'], ['save'], ['back up', 'backup']], guide: 'no food or drink near the computer; dry hands near sockets; report frayed cables; sit upright with the screen at eye level; rest the eyes; save work often.' };
const PREC: Record<CompTask, { kw: string[][]; guide: string }> = {
  BASIC_IO: { kw: [...SAFE.kw, ['bracket', 'order of operation'], ['comma', 'separate'], ['test data', 'hand', 'check']], guide: `brackets used to control the order of operations; inputs separated by commas; results checked by hand; ${SAFE.guide}` },
  BASIC_LOOP: { kw: [...SAFE.kw, ['enough values', 'data list', 'out of data'], ['initialis', 'initializ', 'accumulator', 's = 0'], ['trace']], guide: `the DATA list has exactly enough values for every READ; accumulators set to 0 before the loop; the loop traced by hand first; ${SAFE.guide}` },
  BASIC_ARRAY: { kw: [...SAFE.kw, ['dim', 'declare'], ['subscript', 'range'], ['first element', 'n(1)']], guide: `the array declared with DIM before use; subscripts kept within the DIM size; BIG started at the first element; ${SAFE.guide}` },
  BASIC_FUNC: { kw: [...SAFE.kw, ['radian'], ['step', 'manageable'], ['round']], guide: `degrees converted to radians first; a sensible STEP; values rounded the same way; ${SAFE.guide}` },
  BASIC_WHILE: { kw: [...SAFE.kw, ['endless', 'infinite', 'become false', 'eventually', 'terminate'], ['desk check', 'trace'], ['initialis', 'initializ', 'y = 0'], ['document', 'rem']], guide: `the condition must eventually become false, to avoid an endless loop; desk checked before running; counters initialised; documented with REM; ${SAFE.guide}` },
  FLOW: { kw: [['arrow', 'direction'], ['label', 'yes', 'no'], ['one start', 'start and', 'one stop'], ['initialis', 'initializ', 'set to 0', 'to zero'], ['symbol', 'shape', 'template'], ['dry run', 'trace']], guide: 'arrows show the direction of flow; every decision has two labelled exits; exactly one Start and one Stop; counters and sums initialised; correct symbols used; dry-run with test data.' },
  HTML: { kw: [...SAFE.kw, ['extension', '.html', 'htm', 'txt'], ['close', 'closing', 'end tag', 'nest'], ['title', 'head']], guide: `saved with the .html extension, not .txt; every tag closed and correctly nested; the title inside the head; ${SAFE.guide}` },
  CRIMP: { kw: [['nick', 'not cut', 'inner wire', 'insulation'], ['order', 't568b', 'same order', 'colour'], ['boot', 'before crimp'], ['firm', 'fully', 'reach the end'], ['clip', 'facing'], ['test', 'tester'], ['untwist', 'short']], guide: 'the jacket stripped without nicking the inner wires; the wires kept in T568B order at both ends; boots on before crimping; wires pushed fully in and crimped firmly; the clip facing down; only about 1.3 cm untwisted; tested with a cable tester.' },
  MAINT: { kw: [['shut down', 'switch off', 'unplug', 'power off', 'switched off'], ['damp', 'not wet', 'liquid', 'spray'], ['hold', 'fan'], ['static', 'earth', 'antistatic'], ['back up', 'backup'], ['cool', 'dry before', 'allow to dry'], ['isopropyl', 'alcohol']], guide: 'shut down and switched off at the wall before cleaning; a damp, never wet, cloth and no liquid sprayed on the equipment; fans held still; static avoided; isopropyl alcohol on a cloth; work backed up to another drive.' },
};
const EXPLAIN_Q: Record<CompTask, { guide: string; kw: string[][]; need: number }> = {
  BASIC_IO: { guide: '2 marks: (1) division is done before addition, so only the last number is divided; brackets force the addition first; (1) REM is a comment the computer ignores, END stops the program.', kw: [['division', 'divide', 'before addition', 'order', 'precedence', 'bodmas'], ['bracket'], ['comment', 'remark', 'ignored', 'not executed'], ['end', 'stop', 'terminate']], need: 3 },
  BASIC_LOOP: { guide: '2 marks: (1) each READ takes the next values from the DATA list in order, keeping a pointer; (1) S is an accumulator, so it must start from a known value, 0, before anything is added.', kw: [['next value', 'in order', 'pointer', 'one after', 'takes'], ['data list', 'data statement', 'from data', 'data'], ['accumulator', 'running total', 'adds'], ['start', 'initial', 'zero', '0']], need: 3 },
  BASIC_ARRAY: { guide: '2 marks: (1) DIM reserves space for an array of ten elements named N(1) to N(10); (1) the subscript is the position of the element, the value is what is stored there.', kw: [['reserve', 'declare', 'space', 'memory'], ['element', 'array'], ['subscript', 'position', 'index'], ['value', 'stored', 'content']], need: 3 },
  BASIC_FUNC: { guide: '2 marks: (1) INT gives the next lower integer (rounds down towards minus infinity), and -8 is below -7.8; (1) PI is only approximate (3.14159), so the angle is not exactly 180 degrees and rounding leaves a tiny value.', kw: [['next lower', 'rounds down', 'lower integer', 'greatest integer', 'floor', 'less than'], ['-8', 'minus 8', 'below'], ['approx', '3.14159', 'not exact', 'value of pi'], ['round', 'tiny', 'small']], need: 3 },
  BASIC_WHILE: { guide: '2 marks: (1) working through the program by hand with test data in a trace table before running it, to find logic errors; (1) M would never change, the condition would never become false, and the loop would run for ever.', kw: [['by hand', 'trace', 'dry run', 'manually', 'paper'], ['error', 'bug', 'before running', 'before typing'], ['never change', 'stays', 'same', 'never become false', 'always true'], ['endless', 'infinite', 'for ever', 'forever', 'never stop', 'never end']], need: 3 },
  FLOW: { guide: '2 marks: (1) finite (it ends), definite or unambiguous, effective; (1) so the sum and count start from a known value and hold only the numbers read, not leftover values.', kw: [['finite', 'ends', 'terminate'], ['unambiguous', 'definite', 'precise', 'clear'], ['effective'], ['initial', 'known value', 'start from', 'starting value', 'leftover', 'garbage']], need: 3 },
  HTML: { guide: '2 marks: (1) the Internet is the worldwide network of computers; the WWW is the service of linked pages that runs on it; (1) a website address (URL) locates a page and has a protocol and path; an e-mail address names a mailbox and has the @ sign.', kw: [['network'], ['pages', 'service', 'hypertext', 'linked'], ['url', 'locates', 'protocol', 'web page'], ['@', 'at sign', 'mailbox', 'user']], need: 3 },
  CRIMP: { guide: '2 marks: (1) each pin must reach the same pin at the other end, so that the transmit and receive pairs match and stay twisted together; (1) the lights on the tester come on one by one in the same order, 1 to 8, on both units; an out-of-order or dark light shows a crossed or open wire.', kw: [['same pin', 'pin', 'match', 'straight'], ['pair', 'transmit', 'receive', 'signal'], ['light', 'led'], ['order', '1 to 8', 'one by one', 'sequence']], need: 3 },
  MAINT: { guide: '2 marks: (1) dust blocks vents and fans and insulates the parts, so they overheat and fail; (1) lead-acid batteries deliver less capacity at high current, and the inverter loses energy, so the runtime is shorter than the sum gives.', kw: [['dust'], ['overheat', 'heat', 'temperature', 'cooling'], ['high current', 'less capacity', 'high load', 'discharge'], ['inverter', 'efficiency', 'lost', 'losses']], need: 3 },
};
function aiItems(task: CompTask, s: CompCodeState): AiItem[] {
  const e = EXPLAIN_Q[task];
  return [
    { criterionId: 'precautions', question: 'State two precautions you took in this practical.', answer: s.written.precautions.trim(), guide: `2 marks: one for each correct precaution — ${PREC[task].guide} A vague statement (“be careful”) earns nothing.`, keywords: PREC[task].kw, need: 2 },
    { criterionId: 'explanation', question: COMP_EXPLAIN_Q[task], answer: s.written.explain.trim(), guide: e.guide, keywords: e.kw, need: e.need },
  ];
}

// ------------------------------------------------------------------ records

const numOf = (raw: string | undefined) => parseNumber((raw ?? '').trim().replace(/\s*(wh|min|mins|minutes|mb|m|s|v|°|degrees?)$/i, ''));
function fieldRight(f: CompField, raw: string | undefined): boolean {
  if (f.tol !== null) {
    const n = numOf(raw);
    return n !== null && Math.abs(n - Number(f.answer)) <= f.tol + 1e-9;
  }
  const a = (raw ?? '').trim().toLowerCase();
  const want = f.answer.toLowerCase();
  if (f.id === 'path') return a.replace(/^\/|\/$/g, '') === want.replace(/^\/|\/$/g, '');
  return a === want || a === `${want}/` || (f.id === 'protocol' && (a === `${want}:` || a === `${want}://`));
}

function recordMarks(v: CompCodeVariant, s: CompCodeState) {
  const fields = compFields(v);
  const traces = compTraces(v);
  const notes: string[] = [];
  const blocked = (f: CompField) => {
    if (v.task !== 'MAINT') return false;
    const r = maintRun(s.events);
    return (f.id === 'volts' && !r.done.has('UPSTEST')) || (f.id === 'freed' && !r.done.has('CLEANUP'));
  };
  let rec = 0;
  let units = 0;
  for (const f of fields.filter((x) => x.crit === 'record')) {
    units++;
    if (fieldRight(f, s.readings[f.id]) && !blocked(f)) rec++;
    else notes.push(`${f.label}: ${f.answer}${f.unit ? ` ${f.unit}` : ''}.`);
  }
  for (const t of traces) {
    units += 2;
    const cells = t.rows.flatMap((row, i) => row.map((want, j) => {
      const got = numOf(s.trace[t.id]?.[i]?.[j]);
      return got !== null && Math.abs(got - Number(want)) <= t.tol + 1e-9;
    }));
    const right = cells.filter(Boolean).length;
    rec += (2 * right) / (cells.length || 1);
    if (right < cells.length) notes.push(`${t.title}: ${right} of ${cells.length} entries are right.`);
  }
  let q = 0;
  const qn: string[] = [];
  const qf = fields.filter((x) => x.crit === 'questions');
  for (const f of qf) {
    if (fieldRight(f, s.readings[f.id])) q++;
    else qn.push(`${f.label}: ${f.answer}${f.unit ? ` ${f.unit}` : ''}.`);
  }
  const mcq = COMP_MCQ[v.task];
  for (const m of mcq) {
    if (s.choices[m.id]?.length === 1 && s.choices[m.id]![0] === m.answer) q++;
    else qn.push(`${m.q} ${m.options[m.answer]}.`);
  }
  return { record: [units ? (rec / units) * 3 : 0, notes] as [number, string[]], questions: [((qf.length + mcq.length) ? q / (qf.length + mcq.length) : 0) * 2, qn] as [number, string[]] };
}

// ------------------------------------------------------------------ per family

type Part = [number, string[]];
interface Marks {
  work: Part;
  method: Part;
  facts: string[];
}

function gradeBasic(v: CompCodeVariant, s: CompCodeState): Marks {
  const share = 8 / v.programs.length;
  let work = 0;
  const wn: string[] = [];
  const mn: string[] = [];
  const facts: string[] = [];
  const parts = { numbered: 0, rem: 0, end: 0, need: 0, saved: 0 };
  for (const p of v.programs) {
    const src = s.programs[p.id] ?? '';
    const t = testProgram(src, compHiddenTests(v, p.id));
    const parsed = runBasic(src, [], { ticks: 1 });
    let got = t.credit * share;
    if (src.trim() && !parsed.facts && parsed.fault) wn.push(`Program ${p.id}: ${parsed.fault.message}${parsed.fault.no === null ? ` (line ${parsed.fault.line})` : ''}.`);
    else if (t.first) wn.push(`Program ${p.id}: ${t.first}`);
    if (!src.trim()) wn.push(`Program ${p.id} was not written.`);
    if (!t.labelled && t.credit > 0) {
      got = Math.max(0, got - 0.5);
      wn.push(`Program ${p.id}: print the words asked for beside the answer.`);
    }
    work += got;
    facts.push(`Program ${p.id}: ${Math.round(t.credit * 100)}% of the hidden tests; ${src.split('\n').filter((l) => l.trim()).length} lines.`);
    const f = parsed.facts;
    const each = 1 / v.programs.length;
    if (f?.numbered) parts.numbered += each;
    if (f?.statements.includes('REM')) parts.rem += each;
    if (f?.endLast) parts.end += each;
    const has = (x: string) => !!f && (f.statements.includes(x) || (x === 'LET' && f.statements.includes('ASSIGN')));
    const missing = p.need.filter((x) => !has(x));
    parts.need += each * (p.need.length ? (p.need.length - missing.length) / p.need.length : 1);
    if (f && missing.length) mn.push(`Program ${p.id} should use ${missing.join(', ')}.`);
    if ((s.names[p.id] ?? '').trim().toUpperCase().endsWith('.BAS')) parts.saved += each;
  }
  if (parts.numbered < 1) mn.push('Number every line (10, 20, 30…).');
  if (parts.rem < 1) mn.push('Start each program with a REM line saying what it does.');
  if (parts.end < 1) mn.push('Finish each program with END.');
  if (parts.saved < 1) mn.push('Save each program with the .BAS extension.');
  return { work: [work, wn], method: [(parts.numbered + parts.rem + parts.end + parts.saved) * 0.5 + parts.need, mn], facts };
}

function gradeFlow(v: CompCodeVariant, s: CompCodeState): Marks {
  let work = 0;
  const wn: string[] = [];
  const facts: string[] = [];
  const mn: string[] = [];
  let shape = 0;
  let ends = 0;
  let exits = 0;
  let joined = 0;
  let loops = 0;
  for (const p of v.programs) {
    const c = s.charts[p.id];
    if (!c?.nodes.length) {
      wn.push(`Chart ${p.id} was not drawn.`);
      continue;
    }
    const t = testChart(c, compHiddenTests(v, p.id));
    const f = flowFacts(c);
    const needsLoop = p.id !== 'B';
    work += (8 / 3) * t.credit * (needsLoop && !f.loop ? 0.5 : 1);
    if (t.first) wn.push(`Chart ${p.id}: ${t.first}`);
    if (needsLoop && !f.loop) wn.push(`Chart ${p.id} needs a loop back to an earlier box.`);
    facts.push(`Chart ${p.id}: ${c.nodes.length} boxes, ${Math.round(t.credit * 100)}% of the hidden tests.`);
    const bad = new Set(f.wrongShape);
    const shapeOk = c.nodes.filter((n) => flowRole(n) !== 'UNKNOWN' && !bad.has(n.text)).length;
    shape += shapeOk / (c.nodes.length || 1);
    if (f.wrongShape.length) mn.push(`Chart ${p.id}, wrong symbol for: ${f.wrongShape.slice(0, 3).join('; ')}.`);
    if (f.starts === 1 && f.stops === 1) ends++;
    else mn.push(`Chart ${p.id} must have exactly one START and one STOP.`);
    if (!f.badDecisions.length) exits++;
    else mn.push(`Chart ${p.id}: every decision needs two arrows labelled YES and NO.`);
    if (!f.unreachable.length && !f.deadEnds.length) joined++;
    else mn.push(`Chart ${p.id}: every box must be joined up.`);
    if (!needsLoop || f.loop) loops++;
  }
  return { work: [work, wn], method: [(shape / 3) * 1 + (ends / 3) * 0.5 + (exits / 3) * 0.5 + (joined / 3) * 0.5 + (loops / 3) * 0.5, mn], facts };
}

function gradeHtml(v: CompCodeVariant, s: CompCodeState): Marks {
  const src = s.programs.page ?? '';
  const f = htmlFacts(src);
  const h = v.html;
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const wn: string[] = [];
  let w = 0;
  const award = (ok: boolean, m: number, say: string) => {
    if (ok) w += m;
    else wn.push(say);
  };
  award(same(f.title, h.title), 1.5, `The title should be exactly: ${h.title}.`);
  award(f.headings.some((x) => same(x, h.heading)), 1, `An h1 heading: ${h.heading}.`);
  award(f.paragraphs.some((x) => same(x, h.para)), 1, `A paragraph (p): ${h.para}.`);
  const itemsRight = h.items.filter((i) => f.listItems.some((x) => same(x, i))).length;
  w += (2 * itemsRight) / h.items.length;
  if (itemsRight < h.items.length || !f.listTag) wn.push(`A list (ul with li) of: ${h.items.join('; ')}.`);
  const norm = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase();
  const link = f.links.find((l) => norm(l.href) === norm(h.linkUrl));
  award(!!link && same(link.text, h.linkText), 1.5, `A hyperlink saying “${h.linkText}”: <a href="${h.linkUrl}">…</a>.`);
  award(!!src.trim() && !f.problems.length, 1, f.problems[0] ? `Tags: ${f.problems.slice(0, 2).join(' ')}` : 'Close every tag.');
  const mn: string[] = [];
  let m = 0;
  if (f.html && f.head && f.body) m += 1;
  else mn.push('A page needs html, head and body tags.');
  if (f.headBeforeBody && f.titleInHead) m += 1;
  else mn.push('The head comes before the body, and the title goes in the head.');
  const name = (s.names.page ?? '').trim().toLowerCase();
  if (/\.html?$/.test(name)) m += 1;
  else mn.push('Save the page with the .html extension, not .txt.');
  return { work: [w, wn], method: [m, mn], facts: [`Page: ${src.length} characters, title “${f.title}”, ${f.listItems.length} list items, ${f.links.length} links, ${f.problems.length} tag problems.`] };
}

function gradeCrimp(v: CompCodeVariant, s: CompCodeState): Marks {
  const r = crimpRun(s.events);
  const wn: string[] = [];
  let w = 0;
  for (const k of ['A', 'B'] as const) {
    const e = r.ends[k];
    if (!e.crimped) wn.push(`End ${k} has no plug.`);
    else if (!endReaches(e)) wn.push(`End ${k}: the wires were trimmed too short to reach the pins.`);
    else if (crimpStandard(e)) w += 2.5;
    else wn.push(`End ${k} is not wired to T568B with the clip down.`);
  }
  if (crimpPass(r)) w += 2;
  else if (r.pins) wn.push('The tester does not show pins 1 to 8 straight through.');
  if (r.tested > 0) w += 1;
  else wn.push('Test the finished cable with the cable tester.');
  const mn: string[] = [];
  let m = 0;
  if (r.cut !== null && Math.abs(r.cut - v.crimp.run) <= 0.2) m += 1;
  else mn.push(`Cut the cable to ${v.crimp.run} m (${v.crimp.dist} m + ${v.crimp.slack} m slack).`);
  const both = (f: (e: (typeof r.ends)['A']) => boolean) => (f(r.ends.A) ? 0.25 : 0) + (f(r.ends.B) ? 0.25 : 0);
  const b = both((e) => e.crimped && e.boot);
  const st = both((e) => e.stripped !== null && e.stripped >= CRIMP_STRIP[0] && e.stripped <= CRIMP_STRIP[1]);
  const tr = both((e) => e.trim !== null && e.trim >= CRIMP_TRIM[0] && e.trim <= CRIMP_TRIM[1]);
  const cl = both((e) => e.clip === 'DOWN');
  m += b + st + tr + cl;
  if (b < 0.5) mn.push('Slide the boots on before crimping.');
  if (st < 0.5) mn.push('Strip about 2.5 cm of the jacket.');
  if (tr < 0.5) mn.push('Trim the wires straight to about 1.3 cm.');
  if (cl < 0.5) mn.push('Push the wires in with the clip facing down.');
  return { work: [w, wn], method: [m, mn], facts: [`Cable ${r.cut ?? '—'} m; tester ${r.pins ? r.pins.join(' ') : 'not reached'}; ${r.recuts} ends redone.`] };
}

function gradeMaint(_v: CompCodeVariant, s: CompCodeState): Marks {
  const r = maintRun(s.events);
  const d = r.done;
  const wn: string[] = [];
  let w = 0;
  const award = (ok: boolean, m: number, say: string) => {
    if (ok) w += m;
    else wn.push(say);
  };
  award(d.has('SHUTDOWN') && d.has('UNPLUG'), 2, 'Shut down properly and switch off at the wall.');
  award(d.has('WIPE:DAMP') && !d.has('WIPE:WET'), 1, 'Wipe the screen with a slightly damp cloth: nothing sprayed.');
  const keys = [d.has('KEYTAP'), d.has('KEYBRUSH'), d.has('KEYCLEAN:ALCOHOL') && !d.has('KEYCLEAN:WATER')].filter(Boolean).length;
  w += keys * 0.5;
  if (keys < 3) wn.push('Keyboard: tap out the crumbs, brush between the keys, clean with isopropyl alcohol on a cloth.');
  award(d.has('BLOW:HOLD'), 1, 'Blow out the vents and fans, holding the fans still.');
  award(d.has('LENS'), 0.5, 'Run the lens-cleaning disc.');
  award(d.has('UPSTEST'), 0.5, 'Press the UPS self-test button and note the battery.');
  award(d.has('CLEANUP'), 0.5, 'Run Disk Cleanup.');
  award(d.has('UPDATES'), 0.5, 'Check for updates.');
  award(d.has('BACKUP') && !r.badBackup, 0.5, 'Back up to an external drive: a copy on the same disk dies with the disk.');
  const mn: string[] = [];
  let m = 0;
  const cleaned = ['WIPE:DAMP', 'WIPE:WET', 'KEYTAP', 'KEYBRUSH', 'KEYCLEAN:ALCOHOL', 'KEYCLEAN:WATER', 'BLOW:HOLD', 'BLOW:FREE', 'LENS', 'CASE'].some((x) => d.has(x));
  if (cleaned && !r.live.length) m += 1.5;
  else mn.push(r.live.length ? 'You cleaned parts while the computer was on: shut down and switch off at the wall first.' : 'Clean the computer.');
  if (d.has('BOOT') && d.has('CLEANUP')) m += 1;
  else mn.push('Restart the computer and run the software jobs last.');
  if (cleaned && !r.wet && !r.spun) m += 0.5;
  else mn.push('No water near the electronics, and never let the fans spin freely.');
  return { work: [w, wn], method: [m, mn], facts: [`Jobs done: ${[...d].join(', ') || 'none'}.`] };
}

/**
 * Marks the comp-code lab. A program or chart is only ever run by the shared
 * interpreter, on test cases that exist only on the server, with a step budget
 * and output limit, so a student's infinite loop costs a few milliseconds and
 * nothing but BASIC is ever executed. A web page is parsed, never rendered.
 */
export const compCodeGrader: SimulatorGrader<'comp-code'> = {
  id: 'comp-code',
  grade(state: CompCodeState, seed: number): GraderOutput {
    const task: CompTask = state.task ?? 'BASIC_IO';
    const v = compCodeVariant(seed, task);
    const fam = compFamily(task);
    const m = fam === 'BASIC' ? gradeBasic(v, state) : fam === 'FLOW' ? gradeFlow(v, state) : fam === 'HTML' ? gradeHtml(v, state) : task === 'CRIMP' ? gradeCrimp(v, state) : gradeMaint(v, state);
    const r = recordMarks(v, state);
    const parts: Record<'work' | 'method' | 'record' | 'questions', Part> = { work: m.work, method: m.method, record: r.record, questions: r.questions };
    const auto: CriterionScore[] = (['work', 'method', 'record', 'questions'] as const).map((id) => score(crit(id), halves(Math.min(crit(id).marks, parts[id][0])), parts[id][1]));
    const solution: string[] = [];
    if (fam === 'BASIC' || fam === 'HTML') for (const p of v.programs) solution.push(`${p.title}:\n${compModelSource(v, p.id)}`);
    if (fam === 'FLOW') for (const p of v.programs) solution.push(`${p.title}: ${compModelChart(v, p.id).nodes.map((n) => n.text).join(' → ')}`);
    solution.push(...compFields(v).map((f) => `${f.label}: ${f.answer}${f.unit ? ` ${f.unit}` : ''}.`));
    solution.push(...COMP_MCQ[task].map((q) => `${q.q} ${q.options[q.answer]}.`));
    if (solution.length < 3) solution.push(COMP_TASK_TITLE[task]);
    return { auto, ai: aiItems(task, state), solution, facts: m.facts };
  },
};
export { compModelState };
