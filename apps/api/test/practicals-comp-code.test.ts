// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-comp-code.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  BASIC_LIMITS,
  COMP_CODE,
  COMP_PRACTICAL_TASKS,
  COMP_TASKS,
  T568B,
  basicNumberText,
  compCodeStateSchema,
  compCodeVariant,
  compFamily,
  compModelChart,
  compModelSource,
  compModelState,
  crimpModelEvents,
  crimpPass,
  crimpRun,
  emptyCompCodeState,
  flowFacts,
  htmlFacts,
  htmlPreviewDoc,
  rubricTotal,
  runBasic,
  runFlow,
  type CompCodeState,
  type CompTask,
} from '@aischool/shared';
import { GRADERS } from '../src/practicals/graders';
import { GRADE_TICKS, compCodeGrader, compHiddenTests } from '../src/practicals/graders/comp-code';

type Out = ReturnType<typeof compCodeGrader.grade>;
const by = (o: Out, id: string) => o.auto.find((c) => c.id === id)!;
const autoTotal = (o: Out) => o.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = COMP_CODE.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const grade = (s: CompCodeState, seed: number) => compCodeGrader.grade(s, seed);
const perfect = (seed: number, task: CompTask) => compModelState(compCodeVariant(seed, task));
const output = (src: string, values: string[] = []) => runBasic(src, values, { echo: false }).output;

test('the rubric is 20 marks, registered, every lesson mapped, and the variant is fixed by the seed', () => {
  assert.equal(rubricTotal(COMP_CODE.rubric), 20);
  assert.equal(GRADERS['comp-code'], compCodeGrader);
  assert.deepEqual([...new Set(Object.values(COMP_PRACTICAL_TASKS))].sort(), [...COMP_TASKS].sort());
  for (const t of COMP_TASKS) assert.equal(JSON.stringify(compCodeVariant(99, t)), JSON.stringify(compCodeVariant(99, t)));
  assert.ok(new Set(Array.from({ length: 30 }, (_, i) => compCodeVariant(i + 1, 'BASIC_IO').io.nums.join())).size >= 20, 'numbers differ per attempt');
  const dir = join(__dirname, '../prisma/practicals/waec');
  const files = ['computer-studies', 'data-processing'].map((f) => JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8')) as { practicals: { id: string; simulator: string | null }[] });
  const lessons = files.flatMap((f) => f.practicals);
  for (const id of Object.keys(COMP_PRACTICAL_TASKS)) assert.equal(lessons.find((l) => l.id === id)?.simulator, 'comp-code', id);
});

for (const task of COMP_TASKS)
  test(`${task}: the model answer gets full auto marks across 40 seeds`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = perfect(seed, task);
      const out = grade(s, seed);
      assert.equal(autoTotal(out), AUTO_MAX, `seed ${seed}: ${JSON.stringify(out.auto.filter((c) => c.awarded < c.max))}`);
      assert.equal(out.ai.length, 2);
      assert.ok(out.solution.length >= 3);
      assert.ok(compCodeStateSchema.safeParse(s).success, JSON.stringify(compCodeStateSchema.safeParse(s).error?.issues?.slice(0, 2)));
    }
  });

test('an empty lab scores nothing, and marking is deterministic', () => {
  for (const task of COMP_TASKS) {
    const s = emptyCompCodeState();
    s.task = task;
    assert.equal(autoTotal(grade(s, 5)), 0, task);
    const m = perfect(5, task);
    assert.deepEqual(grade(m, 5).auto, grade(clone(m), 5).auto);
  }
});

// ------------------------------------------------------------------ the interpreter

test('interpreter: the lesson programs print what the lesson says', () => {
  assert.equal(output('10 REM AREA\n20 INPUT "BASE"; B\n30 INPUT "HEIGHT"; H\n40 LET A = 0.5 * B * H\n50 PRINT "AREA ="; A\n60 END', ['10', '7']).trim().split('\n').at(-1), 'AREA = 35');
  assert.match(output('10 INPUT X, Y, Z\n30 LET M = (X + Y + Z) / 3\n40 PRINT "AVERAGE ="; M\n50 END', ['45', '60', '72']), /AVERAGE = 59/);
  assert.match(output('10 LET S = 0\n20 FOR K = 1 TO 9 STEP 2\n30 LET S = S + K * K\n40 NEXT K\n50 PRINT "SUM ="; S\n60 END'), /SUM = 165/);
  assert.match(output('10 LET S = 0\n20 FOR K = 1 TO 100\n30 LET S = S + K\n40 NEXT K\n50 PRINT S\n60 END'), /5050/);
  const rect = output('10 FOR I = 1 TO 3\n30 READ L, B\n40 LET A = L * B\n50 LET P = 2 * (L + B)\n60 PRINT L, B, A, P\n70 NEXT I\n80 DATA 8, 5, 6.5, 4, 9, 9\n90 END');
  assert.deepEqual(rect.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number)), [[8, 5, 40, 26], [6.5, 4, 26, 21], [9, 9, 81, 36]]);
  const arr = '10 DIM N(10)\n20 LET S = 0\n30 FOR I = 1 TO 10\n40 READ N(I)\n50 LET S = S + N(I)\n60 NEXT I\n70 LET BIG = N(1)\n80 FOR I = 2 TO 10\n90 IF N(I) > BIG THEN BIG = N(I)\n100 NEXT I\n110 PRINT "SUM ="; S; "MEAN ="; S / 10; "LARGEST ="; BIG\n120 DATA 12, 7, 15, 9, 20, 11, 8, 14, 6, 18\n130 END';
  assert.match(output(arr), /SUM = 120 MEAN = 12 LARGEST = 20/);
  assert.match(output('10 PRINT SQR(144), INT(7.8), INT(-7.8), ABS(-5)'), /12\s+7\s+-8\s+5/);
  assert.match(output('10 LET M = 1000\n20 LET Y = 0\n30 WHILE M <= 2000\n40 LET M = M * 1.1\n50 LET Y = Y + 1\n60 WEND\n70 PRINT "YEARS ="; Y; "AMOUNT ="; M\n80 END'), /YEARS = 8 AMOUNT = 2143\.589/);
  assert.match(output('10 LET P = 4 + 6 / 2\n20 PRINT P'), /7/);
  assert.match(output('10 LET M = 500\n20 WHILE M < 1000: M = M * 2: WEND\n30 PRINT M'), / 1000 /);
});

test('interpreter: numbers print as BASIC prints them', () => {
  assert.deepEqual([0.5, -0.5, 100, 12.5, 1e7, 12345678, 2.65359e-6, 1e-5, 1234567.8, 0.1 + 0.2].map(basicNumberText), ['.5', '-.5', '100', '12.5', '1E+07', '1.234568E+07', '2.65359E-06', '.00001', '1234568', '.3']);
  assert.equal(output('PRINT 5'), ' 5 \n');
  assert.equal(output('PRINT -5'), '-5 \n');
  assert.equal(output('PRINT "A";\nPRINT "B"'), 'AB\n');
  assert.equal(output('PRINT 1,2').indexOf('2'), 15, 'comma moves to the next 14-column zone');
  assert.equal(output('PRINT TAB(5);"X"'), '    X\n');
});

test('interpreter: precedence, statements and the rest of the dialect', () => {
  const v = (e: string) => Number(output(`PRINT ${e}`).trim());
  assert.equal(v('2 + 3 * 4'), 14);
  assert.equal(v('-2 ^ 2'), -4);
  assert.equal(v('2 ^ 3 ^ 2'), 64);
  assert.equal(v('7 MOD 3'), 1);
  assert.equal(v('7 \\ 2'), 3);
  assert.equal(v('1 = 1'), -1);
  assert.equal(v('NOT 0'), -1);
  assert.equal(v('INT(-3.2)'), -4);
  assert.equal(v('FIX(-3.2)'), -3);
  assert.equal(v('(1 + 2) * 3 - 4 / 2'), 7);
  assert.equal(output('PRINT LEFT$("HELLO", 2); MID$("HELLO", 2, 3); RIGHT$("HELLO", 1); LEN("ABC"); UCASE$("x")').replace(/\s/g, ''), 'HEELLO3X');
  assert.match(output('10 GOSUB 100\n20 PRINT "BACK"\n30 END\n100 PRINT "SUB"\n110 RETURN'), /SUB\nBACK/);
  assert.match(output('10 LET I = 1\n20 IF I > 3 THEN 60\n30 PRINT I;\n40 LET I = I + 1\n50 GOTO 20\n60 END'), /1\s+2\s+3/);
  assert.match(output('10 IF 1 > 2 THEN PRINT "A" ELSE PRINT "B"'), /B/);
  assert.match(output('X = 2\nIF X = 2 THEN\nPRINT "TWO"\nELSE\nPRINT "OTHER"\nEND IF'), /TWO/);
  assert.match(output('I = 0\nDO\nI = I + 1\nLOOP UNTIL I = 3\nPRINT I'), / 3 /);
  assert.match(output('10 FOR I = 3 TO 1 STEP -1: PRINT I;: NEXT I'), /3\s+2\s+1/);
  assert.equal(output('10 FOR I = 5 TO 1\n20 PRINT "NEVER"\n30 NEXT I'), '', 'a FOR that cannot start skips its body');
  assert.match(output('10 DEF FNA(X) = X * X\n20 PRINT FNA(4)'), / 16 /);
  assert.match(output('10 READ A$, B\n20 PRINT A$; B\n30 DATA "KANO", 12'), /KANO 12/);
  assert.match(output('20 PRINT "TWO"\n10 PRINT "ONE"'), /ONE\nTWO/, 'numbered lines run in number order');
  assert.match(output('10 ON 2 GOTO 20, 30\n20 PRINT "A": END\n30 PRINT "B"'), /B/);
  assert.equal(output("10 REM NOTHING\n20 ' A COMMENT\n30 END"), '');
  assert.match(output('10 print "lower"\n20 let a=2\n30 print A'), /lower\n 2/);
  assert.match(output('A = 3\nB = 4\nSWAP A, B\nPRINT A; B'), / 4\s+3 /);
  assert.match(output('FOR I = 1 TO 5\nIF I = 3 THEN EXIT FOR\nNEXT I\nPRINT I'), / 3 /);
});

test('interpreter: errors read as BASIC errors, with the line', () => {
  const fault = (src: string, values: string[] = []) => runBasic(src, values).fault;
  assert.deepEqual(fault('10 PRINT 1\n40 LET A = 1/2BH'), { message: 'Syntax error', line: 2, no: 40 });
  assert.equal(fault('10 PRINT 1 / 0')?.message, 'Division by zero in 10');
  assert.equal(fault('10 READ A')?.message, 'Out of DATA in 10');
  assert.equal(fault('10 DIM A(3)\n20 A(4) = 1')?.message, 'Subscript out of range in 20');
  assert.equal(fault('10 NEXT I')?.message, 'NEXT without FOR');
  assert.equal(fault('10 FOR I = 1 TO 2')?.message, 'FOR without NEXT');
  assert.equal(fault('10 WHILE 1')?.message, 'WHILE without WEND');
  assert.equal(fault('10 WEND')?.message, 'WEND without WHILE');
  assert.equal(fault('10 GOTO 99')?.message, 'Undefined line number');
  assert.equal(fault('10 RETURN')?.message, 'RETURN without GOSUB in 10');
  assert.equal(fault('10 LET A$ = 3')?.message, 'Type mismatch in 10');
  assert.equal(fault('10 PRINT SQR(-1)')?.message, 'Illegal function call in 10');
  assert.equal(fault('10 DIM A(2)\n20 DIM A(2)')?.message, 'Duplicate definition in 20');
  assert.match(fault('10 PRINT USING "##"; 1')?.message ?? '', /not in this BASIC/);
  assert.equal(runBasic('10 INPUT A', ['x']).status, 'no-input', 'letters at a number prompt are refused');
  assert.match(runBasic('10 INPUT A', ['x']).output, /Redo from start/);
  assert.equal(runBasic('10 INPUT A', []).status, 'no-input');
});

test('protection: endless loops, huge output, huge arrays, long strings and deep expressions all stop quickly', () => {
  const t0 = Date.now();
  for (const src of ['10 GOTO 10', '10 WHILE 1\n20 WEND', '10 FOR I = 1 TO 2 STEP 0\n20 NEXT I', '10 I = 0\n20 I = I + 1\n30 GOTO 20', 'DO\nLOOP']) {
    const r = runBasic(src, [], { ticks: GRADE_TICKS });
    assert.equal(r.status, 'limit', src);
    assert.ok(r.ticks <= GRADE_TICKS + 2);
  }
  const big = runBasic('10 PRINT "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"\n20 GOTO 10');
  assert.equal(big.status, 'limit');
  assert.ok(big.output.length <= BASIC_LIMITS.outputChars);
  assert.equal(runBasic('10 DIM A(100000000)').fault?.message, 'Out of memory in 10');
  assert.equal(runBasic('10 DIM A(9000), B(9000)').fault?.message, 'Out of memory in 10');
  assert.equal(runBasic('10 A$ = "X"\n20 A$ = A$ + A$\n30 GOTO 20').fault?.message, 'String too long in 20');
  assert.equal(runBasic('10 GOSUB 10').fault?.message, 'Out of memory in 10');
  assert.equal(runBasic('10 DEF FNA(X) = FNA(X)\n20 PRINT FNA(1)').status, 'error');
  assert.equal(runBasic(`PRINT ${'('.repeat(500)}1${')'.repeat(500)}`).fault?.message, 'Line too long');
  assert.equal(runBasic(`PRINT ${'('.repeat(120)}1${')'.repeat(120)}`).fault?.message, 'Expression too complex');
  assert.equal(runBasic(`PRINT ${'-'.repeat(250)}1`).fault?.message, 'Expression too complex');
  assert.equal(runBasic('X'.repeat(BASIC_LIMITS.sourceChars + 1)).fault?.message, 'Program too long');
  assert.equal(runBasic(Array.from({ length: 500 }, () => 'PRINT').join('\n')).fault?.message, 'Program too long');
  // The worst statement a student can write: every node is charged, so a long expression can't multiply the budget.
  const heavy = runBasic(`10 X = ${Array.from({ length: 60 }, () => '1').join('+')}\n20 GOTO 10`, [], { ticks: GRADE_TICKS });
  assert.equal(heavy.status, 'limit');
  assert.ok(Date.now() - t0 < 4000, `took ${Date.now() - t0} ms`);
});

test('protection: a hand-in of an endless program is marked at once, and nothing but BASIC ever runs', () => {
  const s = perfect(3, 'BASIC_LOOP');
  s.programs.A = '10 GOTO 10';
  s.programs.B = '10 WHILE 1\n20 PRINT "SPAM SPAM SPAM"\n30 WEND';
  const t0 = Date.now();
  const out = grade(s, 3);
  assert.ok(Date.now() - t0 < 1500);
  assert.equal(by(out, 'work').awarded, 0);
  assert.match(by(out, 'work').note, /never finished/);
  // JavaScript in a program is just bad BASIC.
  const hostile = perfect(3, 'BASIC_IO');
  hostile.programs.A = '10 process.exit(1)\n20 PRINT require("fs")\n30 PRINT constructor.constructor("return process")()';
  hostile.programs.B = `10 PRINT "'); process.exit(1); ('"`;
  assert.equal(by(grade(hostile, 3), 'work').awarded, 0);
  const flow = perfect(3, 'FLOW');
  flow.charts.A!.nodes[1]!.text = 'process.exit(1)';
  assert.ok(by(grade(flow, 3), 'work').awarded < 8);
});

test('schema: garbage and oversized states are refused', () => {
  const ok = perfect(1, 'BASIC_IO');
  assert.ok(compCodeStateSchema.safeParse(ok).success);
  for (const bad of [
    { ...ok, task: 'HACK' },
    { ...ok, programs: { A: 'X'.repeat(9000) } },
    { ...ok, programs: { __proto__x: 'A' } },
    { ...ok, programs: { a: '', b: '', c: '', d: '', e: '' } },
    { ...ok, events: [{ a: 'NOPE', x: '', n: 0 }] },
    { ...ok, events: Array.from({ length: 200 }, () => ({ a: 'CUT', x: '', n: 1 })) },
    { ...ok, charts: { A: { nodes: Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, kind: 'PROCESS', text: '', x: 0, y: 0 })), edges: [] } } },
    { ...ok, charts: { A: { nodes: [{ id: 'n', kind: 'BLOB', text: '', x: 0, y: 0 }], edges: [] } } },
    { ...ok, readings: { a: 'x'.repeat(100) } },
    { ...ok, written: { precautions: 1, explain: '' } },
    { ...ok, trace: { T1: 'x' } },
    { ...ok, log: 'x' },
    null,
    'x',
  ])
    assert.equal(compCodeStateSchema.safeParse(bad).success, false);
});

// ------------------------------------------------------------------ typical mistakes

test('BASIC_IO: writing 1/2BH, no brackets, no labels, no saving lose the right marks', () => {
  const seed = 11;
  let s = perfect(seed, 'BASIC_IO');
  s.programs.A = s.programs.A!.replace(/LET AREA = .*/, 'LET AREA = 1/2BH');
  let o = grade(s, seed);
  assert.equal(by(o, 'work').awarded, 4, 'program A does not run');
  assert.match(by(o, 'work').note, /Syntax error/);
  assert.equal(by(o, 'record').awarded, 3, 'the record is separate');
  s = perfect(seed, 'BASIC_IO');
  s.programs.B = s.programs.B!.replace(/LET M = \((.*)\) \/ (\d)/, 'LET M = $1 / $2');
  o = grade(s, seed);
  assert.ok(by(o, "work").awarded <= 5, "no brackets: the hidden averages are wrong");
  s = perfect(seed, 'BASIC_IO');
  s.programs.B = s.programs.B!.replace('"AVERAGE ="; ', '');
  assert.equal(by(grade(s, seed), 'work').awarded, 7.5, 'the answer without its words');
  s = perfect(seed, 'BASIC_IO');
  s.names = {};
  assert.equal(by(grade(s, seed), 'method').awarded, 2.5);
  s = perfect(seed, 'BASIC_IO');
  for (const k of ['A', 'B']) s.programs[k] = s.programs[k]!.replace(/^\d+ /gm, '').replace(/^REM.*\n/m, '').replace(/\nEND$/, '');
  assert.equal(by(grade(s, seed), 'method').awarded, 1.5, 'unnumbered, no REM, no END');
  assert.equal(by(grade(s, seed), 'work').awarded, 8, 'but it still works');
});

test('a program that only prints the sample answer fails the hidden tests', () => {
  const seed = 8;
  const v = compCodeVariant(seed, 'BASIC_IO');
  const s = perfect(seed, 'BASIC_IO');
  s.programs.B = `10 REM AVERAGE\n20 INPUT ${v.io.n === 3 ? 'X, Y, Z' : v.io.n === 4 ? 'W, X, Y, Z' : 'V, W, X, Y, Z'}\n30 PRINT "AVERAGE ="; ${s.readings.outB}\n40 END`;
  const o = grade(s, seed);
  assert.ok(by(o, 'work').awarded <= 5, 'only a hidden test close to the sample can pass');
  assert.ok(compHiddenTests(v, 'B').length >= 3);
});

test('BASIC_LOOP: PRINT inside the loop, no STEP, DATA ignored and READ left out lose the right marks', () => {
  for (let seed = 1; seed < 8; seed++) {
    let s = perfect(seed, 'BASIC_LOOP');
    s.programs.B = s.programs.B!.replace(/(\d+ LET S = S \+ .*)\n(\d+) NEXT K\n(\d+) PRINT "SUM ="; S/, '$1\n$2 PRINT "SUM ="; S\n$3 NEXT K');
    let o = grade(s, seed);
    assert.ok(by(o, 'work').awarded >= 4 && by(o, 'work').awarded <= 6.5, `seed ${seed}: ${by(o, 'work').awarded}`);
    assert.match(by(o, 'work').note, /after the loop/);
    s = perfect(seed, 'BASIC_LOOP');
    s.programs.B = s.programs.B!.replace(/ STEP \d/, '');
    assert.ok(by(grade(s, seed), 'work').awarded <= 5.5, 'every integer counted');
    s = perfect(seed, 'BASIC_LOOP');
    const v = compCodeVariant(seed, 'BASIC_LOOP');
    s.programs.A = `10 REM\n${v.loop.pairs.map(([l, b], i) => `${(i + 2) * 10} PRINT ${l}, ${b}, ${l * b}, ${2 * (l + b)}`).join('\n')}\n90 END`;
    o = grade(s, seed);
    assert.ok(by(o, 'work').awarded <= 5, 'hard-coded results fail on hidden DATA');
    assert.ok(by(o, 'method').awarded < 3);
  }
});

test('BASIC_LOOP: an uninitialised variable is still 0 in BASIC, but a trace table is checked cell by cell', () => {
  const s = perfect(2, 'BASIC_LOOP');
  s.programs.B = s.programs.B!.replace(/\d+ LET S = 0\n/, '');
  assert.equal(by(grade(s, 2), 'work').awarded, 8);
  s.trace.T1![0]![3] = '999';
  s.trace.T1![1]![4] = '';
  assert.ok(by(grade(s, 2), 'record').awarded < 3);
});

test('BASIC_ARRAY: starting BIG at 0 fails on all-negative data; no reverse loses the reverse values', () => {
  let tried = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const v = compCodeVariant(seed, 'BASIC_ARRAY');
    if (v.arr.stat !== 'LARGEST') continue;
    tried++;
    let s = perfect(seed, 'BASIC_ARRAY');
    s.programs.A = s.programs.A!.replace('LET BIG = N(1)', 'LET BIG = 0');
    assert.ok(by(grade(s, seed), 'work').awarded < 8);
    s = perfect(seed, 'BASIC_ARRAY');
    s.programs.A = s.programs.A!.replace(/\d+ FOR I = \d+ TO 1 STEP -1\n\d+ PRINT N\(I\)\n\d+ NEXT I\n/, '');
    const o = grade(s, seed);
    assert.ok(by(o, 'work').awarded <= 3, String(by(o, 'work').awarded));
  }
  assert.ok(tried > 0);
});

test('BASIC_FUNC: degrees passed to SIN and FIX for INT are wrong on the hidden values', () => {
  const s = perfect(4, 'BASIC_FUNC');
  s.programs.B = s.programs.B!.replace(/(SIN|COS)\(R\)/, '$1(D)');
  assert.ok(by(grade(s, 4), 'work').awarded <= 6);
  const t = perfect(4, 'BASIC_FUNC');
  t.programs.A = t.programs.A!.replace('INT(-Y)', 'FIX(-Y)');
  assert.ok(by(grade(t, 4), 'work').awarded < 8, 'INT(-7.8) is -8');
});

test('BASIC_WHILE: < for <=, a count that starts at 1 and an update outside the loop lose marks', () => {
  const seed = 6;
  let s = perfect(seed, 'BASIC_WHILE');
  s.programs.A = s.programs.A!.replace('WHILE M <= T', 'WHILE M < T');
  assert.equal(by(grade(s, seed), 'work').awarded, 6, 'wrong only when M lands exactly on T');
  s = perfect(seed, 'BASIC_WHILE');
  s.programs.A = s.programs.A!.replace('LET Y = 0', 'LET Y = 1');
  assert.ok(by(grade(s, seed), 'work').awarded <= 4);
  s = perfect(seed, 'BASIC_WHILE');
  s.programs.A = s.programs.A!.replace(/(\d+) LET M = M \* \(1 \+ R \/ 100\)\n(\d+) LET Y = Y \+ 1\n(\d+) WEND/, '$1 LET Y = Y + 1\n$2 WEND\n$3 LET M = M * (1 + R / 100)');
  const o = grade(s, seed);
  assert.ok(by(o, 'work').awarded <= 2, String(by(o, 'work').awarded));
  assert.match(by(o, 'work').note, /never finished/);
});

test('FLOW: charts run on hidden inputs; a wrong shape, an unlabelled decision and a missing loop lose the right marks', () => {
  const seed = 9;
  const v = compCodeVariant(seed, 'FLOW');
  assert.deepEqual(flowFacts(compModelChart(v, 'A')), { starts: 1, stops: 1, wrongShape: [], badDecisions: [], unreachable: [], deadEnds: [], loop: true, unreadable: [] });
  let s = perfect(seed, 'FLOW');
  s.charts.A!.nodes.find((n) => n.text === 'INPUT X')!.kind = 'PROCESS';
  let o = grade(s, seed);
  assert.equal(by(o, 'work').awarded, 8, 'it still runs');
  assert.ok(by(o, 'method').awarded < 3);
  assert.match(by(o, 'method').note, /wrong symbol/);
  s = perfect(seed, 'FLOW');
  s.charts.A!.edges.forEach((e) => (e.label === 'NO' ? (e.label = '') : 0));
  o = grade(s, seed);
  assert.ok(by(o, 'work').awarded < 8 && by(o, 'method').awarded < 3);
  s = perfect(seed, 'FLOW');
  s.charts.A!.nodes.find((n) => n.text.startsWith('SUM = 0'))!.text = 'COUNT = 0';
  assert.equal(by(grade(s, seed), 'work').awarded, 8, 'a BASIC variable starts at 0, as in the machine');
  s = perfect(seed, 'FLOW');
  s.charts.B!.nodes.find((n) => n.text.startsWith('Y ='))!.text = 'Y = A * B ^ 2 - C ^ 2 / (D + 2)';
  assert.ok(by(grade(s, seed), 'work').awarded <= 5.5, '(b - c)² is not b² - c²');
  s = perfect(seed, 'FLOW');
  s.charts.C = { nodes: [{ id: 's', kind: 'TERMINAL', text: 'START', x: 0, y: 0 }, { id: 'e', kind: 'TERMINAL', text: 'STOP', x: 0, y: 100 }], edges: [{ from: 's', to: 'e', label: '' }] };
  assert.ok(by(grade(s, seed), 'work').awarded <= 5.5);
  const loop = { nodes: [{ id: 's', kind: 'TERMINAL' as const, text: 'START', x: 0, y: 0 }, { id: 'p', kind: 'PROCESS' as const, text: 'X = X + 1', x: 0, y: 0 }], edges: [{ from: 's', to: 'p', label: '' as const }, { from: 'p', to: 'p', label: '' as const }] };
  assert.equal(runFlow(loop, [], { ticks: GRADE_TICKS }).status, 'limit', 'a chart that never stops is stopped');
});

test('HTML: the page is parsed, not rendered, and marked on its parts', () => {
  const seed = 3;
  const v = compCodeVariant(seed, 'HTML');
  let s = perfect(seed, 'HTML');
  s.programs.page = s.programs.page!.replace('</ul>', '').replace('</body>', '');
  const o = grade(s, seed);
  assert.ok(by(o, 'work').awarded <= 7);
  assert.match(by(o, 'work').note, /not closed/);
  s = perfect(seed, 'HTML');
  s.names.page = 'mypage.txt';
  assert.equal(by(grade(s, seed), 'method').awarded, 2);
  s = perfect(seed, 'HTML');
  s.programs.page = s.programs.page!.replace(`<title>${v.html.title}</title>`, '').replace('<h1>', `<title>${v.html.title}</title><h1>`);
  assert.ok(by(grade(s, seed), 'method').awarded <= 2, 'the title belongs in the head');
  s = perfect(seed, 'HTML');
  s.readings.path = 'wrong';
  assert.equal(by(grade(s, seed), "record").awarded, 2);
  s.readings.path = v.html.path.replace(/\//g, '');
  assert.equal(by(grade(s, seed), 'record').awarded, 3, 'the slashes are optional');
});

test('HTML preview: no script, handler, frame, form or network address survives', () => {
  const evil = `<html><head><title>t</title><meta http-equiv="refresh" content="0;url=http://evil"><link rel=stylesheet href="http://evil/x.css"><base href="http://evil/"><script>alert(1)</script><style>@import url(http://evil/a.css); body{background:url(http://evil/b.png)}</style></head>
  <body onload="alert(2)" background="http://evil/c.png"><p onclick='x()' style="background:url(http://evil/d)">para</p><a href="javascript:alert(3)">j</a><a href="http://evil/">l</a><img src="http://evil/e.png" onerror="alert(4)" alt="pic"><iframe src="http://evil"></iframe><object data="x"></object><form action="http://evil"><input></form><svg onload=alert(5)><script>alert(6)</script></svg><SCRIPT>alert(7)</SCRIPT><scr<script>ipt>alert(8)</script><img src=x onerror=alert(9)></body></html>`;
  const doc = htmlPreviewDoc(evil);
  const rest = doc.slice(doc.indexOf('</style>')).replace(/data-href="[^"]*"/g, '');
  assert.ok(!/<script|onload|onclick|onerror|<iframe|<object|<form|<svg|<meta|<link|<base|src="http|background=/i.test(rest), rest);
  assert.ok(!/ href=/i.test(doc));
  assert.ok(!/url\(http/i.test(rest));
  assert.match(doc, /Content-Security-Policy" content="default-src 'none'/);
  assert.match(doc, /<p>para<\/p>/);
  assert.equal(htmlFacts(evil).scripts > 0, true, 'the marker sees it was there');
  assert.equal(htmlPreviewDoc('<<<<>>><p<').includes('<script'), false);
  assert.ok(htmlFacts('<'.repeat(7000)).problems.length >= 0, 'nonsense is survived');
});

test('CRIMP: the tester follows the wires; a wrong order, a flipped plug and short trims show on it', () => {
  const seed = 12;
  const v = compCodeVariant(seed, 'CRIMP');
  const model = crimpRun(crimpModelEvents(v));
  assert.ok(crimpPass(model));
  assert.deepEqual(model.pins, [1, 2, 3, 4, 5, 6, 7, 8]);
  let s = perfect(seed, 'CRIMP');
  const swapped = [...T568B] as string[];
  [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
  s.events = s.events.map((e) => (e.a === 'ORDER' && e.x.startsWith('B') ? { ...e, x: `B:${swapped.join(',')}` } : e));
  assert.deepEqual(crimpRun(s.events).pins, [2, 1, 3, 4, 5, 6, 7, 8], 'crossed pair');
  assert.equal(by(grade(s, seed), 'work').awarded, 3.5);
  s = perfect(seed, 'CRIMP');
  s.events = s.events.map((e) => (e.a === 'ORDER' ? { ...e, x: `${e.x[0]}:${[...T568B].reverse().join(',')}` } : e));
  assert.ok(crimpPass(crimpRun(s.events)), 'the same wrong order at both ends still lights 1 to 8');
  assert.equal(by(grade(s, seed), 'work').awarded, 3, 'but it is not T568B');
  s = perfect(seed, 'CRIMP');
  s.events = s.events.map((e) => (e.a === 'INSERT' && e.x.startsWith('A') ? { ...e, x: 'A:UP' } : e));
  assert.deepEqual(crimpRun(s.events).pins, [8, 7, 6, 5, 4, 3, 2, 1], 'one plug upside down reverses the pins');
  s = perfect(seed, 'CRIMP');
  s.events = s.events.map((e) => (e.a === 'TRIM' ? { ...e, n: 8 } : e));
  assert.deepEqual(crimpRun(s.events).pins, [0, 0, 0, 0, 0, 0, 0, 0], 'too short: the wires never reach the pins');
  assert.ok(by(grade(s, seed), 'method').awarded <= 2.5);
  s = perfect(seed, 'CRIMP');
  s.events = s.events.filter((e) => e.a !== 'TEST');
  assert.equal(by(grade(s, seed), 'work').awarded, 7);
  s = perfect(seed, 'CRIMP');
  s.events = s.events.map((e) => (e.a === 'CUT' ? { ...e, n: 30 } : e));
  assert.equal(by(grade(s, seed), 'method').awarded, 2);
});

test('MAINT: cleaning a live computer, water and spun fans lose the right marks; readings need the job done', () => {
  const seed = 14;
  let s = perfect(seed, 'MAINT');
  s.events = s.events.filter((e) => e.a !== 'SHUTDOWN' && e.a !== 'UNPLUG');
  let o = grade(s, seed);
  assert.equal(by(o, 'work').awarded, 6);
  assert.match(by(o, 'method').note, /while the computer was on/);
  s = perfect(seed, 'MAINT');
  s.events = s.events.map((e) => (e.a === 'WIPE' ? { ...e, x: 'WET' } : e.a === 'BLOW' ? { ...e, x: 'FREE' } : e));
  o = grade(s, seed);
  assert.equal(by(o, 'work').awarded, 6);
  assert.equal(by(o, 'method').awarded, 2.5);
  s = perfect(seed, 'MAINT');
  s.events = s.events.filter((e) => e.a !== 'UPSTEST' && e.a !== 'CLEANUP');
  o = grade(s, seed);
  assert.ok(by(o, 'record').awarded < 3, 'a reading that was never taken earns nothing');
  s = perfect(seed, 'MAINT');
  s.events = s.events.map((e) => (e.a === 'BACKUP' ? { ...e, x: 'SAME' } : e));
  assert.equal(by(grade(s, seed), 'work').awarded, 7.5);
});

test('hidden tests stay out of the shared package, so the browser never sees them', () => {
  const src = readFileSync(join(__dirname, '../../../packages/shared/src/simulators/comp-code-data.ts'), 'utf8');
  assert.ok(!src.includes('compHiddenTests'));
  for (const t of COMP_TASKS) if (compFamily(t) === 'BASIC') for (const p of compCodeVariant(1, t).programs) assert.ok(compHiddenTests(compCodeVariant(1, t), p.id).length >= 3);
  assert.ok(compModelSource(compCodeVariant(1, 'HTML'), 'page').includes('<html>'));
});

test('AI items carry the student’s words, with keyword fallbacks', () => {
  const s = perfect(2, 'FLOW');
  s.written = { precautions: 'Arrows show direction.', explain: 'Finite and definite.' };
  const out = grade(s, 2);
  assert.deepEqual(out.ai.map((a) => a.criterionId), ['precautions', 'explanation']);
  assert.equal(out.ai[1]!.answer, 'Finite and definite.');
});
