// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-comp-office.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMP_OFFICE,
  CO_PRACTICAL_TASKS,
  CO_TASKS,
  coAddChart,
  coAnswerRight,
  coChecks,
  coCritMatch,
  coCritMarks,
  coCycleRef,
  coDbAddRow,
  coDbAddTable,
  coDbRelate,
  coDisplay,
  coEmptyDb,
  coEmptyDoc,
  coEmptyFs,
  coEvalAll,
  coEvalOne,
  coField,
  coFillDown,
  coFormatCells,
  coFsDelete,
  coFsInsertFlash,
  coFsMkdir,
  coFsPaste,
  coFsCopy,
  coMailSend,
  coEmptyMail,
  coModelState,
  coRangeAddrs,
  coRelative,
  coReplaceAll,
  coRunQuery,
  coSearch,
  coSetCell,
  coSheetFrom,
  coShiftFormula,
  coShown,
  coSortRange,
  coSqlRun,
  coStartState,
  coStrongPassword,
  coTaskTitle,
  coUpdateFields,
  coInsertTable,
  coSetTableCell,
  coSizePicture,
  coInsertPicture,
  compOfficeStateSchema,
  compOfficeVariant,
  emptyCompOfficeState,
  rubricTotal,
  type CoErr,
  type CoTask,
  type CoVal,
  type CompOfficeState,
} from '@aischool/shared';
import { compOfficeGrader } from '../src/practicals/graders/comp-office';
import { GRADERS } from '../src/practicals/graders';

const AUTO_MAX = COMP_OFFICE.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const out = (s: CompOfficeState, seed: number) => compOfficeGrader.grade(s, seed);
const autoTotal = (s: CompOfficeState, seed: number) => out(s, seed).auto.reduce((t, c) => t + c.awarded, 0);
const by = (s: CompOfficeState, seed: number, id: string) => out(s, seed).auto.find((c) => c.id === id)!.awarded;
const failed = (task: CoTask, seed: number, s: CompOfficeState) => coChecks(compOfficeVariant(seed, task), s).filter((c) => !c.done).map((c) => c.id);
const SEED = 4242;
const model = (task: CoTask, seed = SEED) => clone(coModelState(compOfficeVariant(seed, task)));
const err = (v: CoVal) => (v as CoErr).e;

test('registered, 20 marks, every lesson has a task, the variant is fixed by the seed', () => {
  assert.equal(rubricTotal(COMP_OFFICE.rubric), 20);
  assert.equal(GRADERS['comp-office'], compOfficeGrader);
  assert.deepEqual([...new Set(Object.values(CO_PRACTICAL_TASKS))].sort(), [...CO_TASKS].sort());
  assert.equal(Object.keys(CO_PRACTICAL_TASKS).length, CO_TASKS.length);
  for (const t of CO_TASKS) {
    assert.equal(JSON.stringify(compOfficeVariant(99, t).answers), JSON.stringify(compOfficeVariant(99, t).answers));
    assert.ok(coTaskTitle(t).length > 3);
    assert.ok(compOfficeVariant(99, t).answers.length >= 3, t);
  }
  const data = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(compOfficeVariant(i + 1, 'CST_RESULTS').data)));
  assert.ok(data.size >= 25, 'data differ per attempt');
});

test('the model answer gets full auto marks over 40 seeds on every task, and fits the schema', () => {
  for (const task of CO_TASKS)
    for (let seed = 1; seed <= 40; seed++) {
      const v = compOfficeVariant(seed * 7919 + 13, task);
      const s = coModelState(v);
      assert.deepEqual(coChecks(v, s).filter((c) => !c.done).map((c) => c.id), [], `${task} seed ${seed}`);
      assert.equal(autoTotal(s, v.seed), AUTO_MAX);
      assert.ok(compOfficeStateSchema.safeParse(clone(s)).success, `${task} schema seed ${seed}`);
      assert.ok(JSON.stringify(s).length < 5_000_000);
    }
});

test('an untouched attempt earns nothing automatic, and a fresh start is valid', () => {
  for (const task of CO_TASKS) {
    const v = compOfficeVariant(SEED, task);
    const s = coStartState(v);
    assert.ok(compOfficeStateSchema.safeParse(clone(s)).success, task);
    const c = coChecks(v, s);
    // Only "the data is as given" style checks may hold at the start.
    assert.ok(c.filter((x) => x.done).length <= 3, `${task}: ${c.filter((x) => x.done).map((x) => x.id)}`);
    assert.equal(coCritMarks(c, 'calculation', 4), 0);
  }
  assert.equal(autoTotal(emptyCompOfficeState(), 1), 0);
});

test('AI items carry the student text and the keyword stand-in', () => {
  const s = model('CST_VAT');
  s.written = { precautions: 'Press F4 for the dollar signs.', explain: 'The absolute reference stayed fixed; the relative one moved.' };
  const o = out(s, SEED);
  assert.deepEqual(o.ai.map((a) => a.criterionId), ['precautions', 'explanation']);
  assert.equal(o.ai[0]!.answer, 'Press F4 for the dollar signs.');
  assert.ok(o.solution.length > 3);
});

test('the schema rejects garbage', () => {
  const good = clone(coStartState(compOfficeVariant(SEED, 'CST_RESULTS')));
  assert.ok(compOfficeStateSchema.safeParse(good).success);
  assert.ok(!compOfficeStateSchema.safeParse({ ...good, v: 2 }).success);
  assert.ok(!compOfficeStateSchema.safeParse({ ...good, task: 'NOPE' }).success);
  assert.ok(!compOfficeStateSchema.safeParse({ ...good, sheet: null }).success);
  assert.ok(!compOfficeStateSchema.safeParse({ ...good, sheet: { ...good.sheet, cells: { A1: { f: 1 } } } }).success);
  assert.ok(!compOfficeStateSchema.safeParse({ ...good, sheet: { ...good.sheet, cells: { A1: { f: 'x'.repeat(400) } } } }).success);
  const many = Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`A${i}`, { f: '1' }]));
  assert.ok(!compOfficeStateSchema.safeParse({ ...good, sheet: { ...good.sheet, cells: many } }).success);
  assert.ok(!compOfficeStateSchema.safeParse({ ...good, doc: { ...good.doc, paras: 'x' } }).success);
  assert.ok(!compOfficeStateSchema.safeParse({ ...good, answers: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, '1'])) }).success);
  assert.ok(!compOfficeStateSchema.safeParse({ ...good, db: { ...good.db, tables: [{ name: 'T', fields: [{ name: 'a', type: 'BLOB', size: 1, pk: false, rule: '' }], rows: [], sort: null }] } }).success);
});

test('formula evaluator: arithmetic, precedence and literals', () => {
  assert.equal(coEvalOne('=2+3*4'), 14);
  assert.equal(coEvalOne('=(2+3)*4'), 20);
  assert.equal(coEvalOne('=2^3^2'), 64); // left to right, as a spreadsheet does
  assert.equal(coEvalOne('=-3^2'), 9); // unary minus binds tighter, as a spreadsheet does
  assert.equal(coEvalOne('=50%*200'), 100);
  assert.equal(coEvalOne('=10/4'), 2.5);
  assert.equal(coEvalOne('=1.5e2+1'), 151);
  assert.equal(coEvalOne('="a"&"b"&1'), 'ab1');
  assert.equal(coEvalOne('="it""s"'), 'it"s');
  assert.equal(coEvalOne('=5>=5'), true);
  assert.equal(coEvalOne('="abc"="ABC"'), true);
  assert.equal(coEvalOne('=1<>2'), true);
  assert.equal(coEvalOne('=TRUE+1'), 2);
  assert.equal(coEvalOne('=sum(1,2,3)'), 6);
  assert.equal(coEvalOne('=  SUM( 1 , 2 ) '), 3);
});

test('formula evaluator: ranges, functions and text', () => {
  const c = coSheetFrom([[10, 'x', null], [20, '5', 'y'], [30, true, 0]]).cells;
  assert.equal(coEvalOne('=SUM(A1:A3)', c), 60);
  assert.equal(coEvalOne('=AVERAGE(A1:C3)', c), (10 + 20 + 30 + 5 + 0) / 5); // a typed 5 is a number; text and TRUE are skipped
  assert.equal(coEvalOne('=COUNT(A1:C3)', c), 5);
  assert.equal(coEvalOne('=COUNTA(A1:C3)', c), 8);
  assert.equal(coEvalOne('=MAX(A1:A3)', c), 30);
  assert.equal(coEvalOne('=MIN(A1:A3,4)', c), 4);
  assert.equal(coEvalOne('=COUNTIF(A1:A3,">=20")', c), 2);
  assert.equal(coEvalOne('=COUNTIF(B1:B3,"x")', c), 1);
  assert.equal(coEvalOne('=COUNTIF(B1:B3,"X")', c), 1);
  assert.equal(coEvalOne('=SUMIF(A1:A3,">15")', c), 50);
  assert.equal(coEvalOne('=IF(A1>5,"big","small")', c), 'big');
  assert.equal(coEvalOne('=IF(A1>50,"big")', c), false);
  assert.equal(coEvalOne('=IF(AND(A1>5,A2>5),IF(A3>25,1,2),3)', c), 1);
  assert.equal(coEvalOne('=OR(A1>100,A2>100)', c), false);
  assert.equal(coEvalOne('=ROUND(2.675,2)', c), 2.68);
  assert.equal(coEvalOne('=ROUND(-2.5,0)', c), -3);
  assert.equal(coEvalOne('=ROUNDUP(2.1,0)', c), 3);
  assert.equal(coEvalOne('=INT(-2.5)', c), -3);
  assert.equal(coEvalOne('=RANK(20,A1:A3)', c), 2);
  assert.equal(coEvalOne('=RANK(20,A1:A3,1)', c), 2);
  assert.equal(coEvalOne('=A1+D9', c), 10); // a blank counts as 0
  assert.equal(coEvalOne('=B2*2', c), 10); // text that is a number is used in arithmetic
  // A tie shares the better rank, and the next rank is skipped.
  const t = coSheetFrom([[90], [80], [80], [70]]).cells;
  assert.deepEqual(['A1', 'A2', 'A3', 'A4'].map((a) => coEvalOne(`=RANK(${a},$A$1:$A$4)`, t)), [1, 2, 2, 4]);
});

test('formula evaluator: errors', () => {
  const c = coSheetFrom([[1, 'x']]).cells;
  assert.equal(err(coEvalOne('=1/0')), '#DIV/0!');
  assert.equal(err(coEvalOne('=AVERAGE(D1:D3)', c)), '#DIV/0!');
  assert.equal(err(coEvalOne('=B1+1', c)), '#VALUE!');
  assert.equal(err(coEvalOne('=SQRT(-1)')), '#NUM!');
  assert.equal(err(coEvalOne('=NOSUCH(1)')), '#NAME?');
  assert.equal(err(coEvalOne('=PROFIT')), '#NAME?');
  assert.equal(err(coEvalOne('=SUM(1')), '#ERROR!');
  assert.equal(err(coEvalOne('=1+')), '#ERROR!');
  assert.equal(err(coEvalOne('="open')), '#ERROR!');
  assert.equal(err(coEvalOne('=A1:A9', c)), '#VALUE!');
  assert.equal(err(coEvalOne('=IF(1/0>1,2,3)')), '#DIV/0!');
  assert.equal(err(coEvalOne('=SUM(A1:ZZ9999)', c)), '#REF!');
  assert.equal(coEvalOne('=RANK(5,A1:A1)', c) && err(coEvalOne('=RANK(5,A1:A1)', c)), '#N/A');
  // An error in a range spreads to what depends on it.
  const e = coSheetFrom([['=1/0'], ['=SUM(A1:A1)+1']]).cells;
  assert.equal(err(coEvalAll(e).A2!), '#DIV/0!');
  // Circular references stop, whichever cell is asked first.
  const loop = coSheetFrom([['=A2'], ['=A1+1'], ['=A3']]).cells;
  const v = coEvalAll(loop);
  assert.ok(err(v.A2!) === '#CIRC!' || err(v.A1!) === '#CIRC!');
  assert.equal(err(v.A3!), '#CIRC!');
  // Very deep or long nonsense does not crash.
  assert.equal(err(coEvalOne(`=${'('.repeat(500)}1`)), '#ERROR!');
  assert.equal(coEvalOne(`=${Array(150).fill('1').join('+')}`), 150);
  assert.ok(typeof coEvalOne('=9^999') === 'object');
  // Chains of references resolve however they are ordered.
  const chain = coSheetFrom(Array.from({ length: 120 }, (_, i) => [i === 119 ? 7 : `=A${i + 2}`])).cells;
  assert.equal(coEvalAll(chain).A1, 7);
});

test('copying formulas: relative, absolute, mixed, quotes and the edge of the sheet', () => {
  assert.equal(coShiftFormula('=SUM(B2:D2)', 0, 1), '=SUM(B3:D3)');
  assert.equal(coShiftFormula('=A3*$B$1', 0, 2), '=A5*$B$1');
  assert.equal(coShiftFormula('=A$1+$A1', 1, 1), '=B$1+$A2');
  assert.equal(coShiftFormula('=IF(F2>=50,"F2","FAIL")', 0, 1), '=IF(F3>=50,"F2","FAIL")');
  assert.equal(coShiftFormula('=A1', 0, -1), '=#REF!');
  assert.equal(coShiftFormula('=LOG10(A1)', 0, 1), '=LOG10(A2)');
  assert.equal(coShiftFormula('=RANK(E2,$E$2:$E$6)', 0, 2), '=RANK(E4,$E$2:$E$6)');
  assert.equal(coShiftFormula('text A1', 0, 1), 'text A1');
  assert.equal(coRelative('=SUM(B2:D2)', 'E2'), coRelative('=SUM(B3:D3)', 'E3'));
  assert.notEqual(coRelative('=SUM(B2:D2)', 'E2'), coRelative('=SUM(B2:D2)', 'E3'));
  assert.equal(coCycleRef('A1'), '$A$1');
  assert.equal(coCycleRef('$A$1'), 'A$1');
  assert.equal(coCycleRef('A$1'), '$A1');
  assert.equal(coCycleRef('$A1'), 'A1');
  assert.deepEqual(coRangeAddrs('B2:A1'), ['A1', 'B1', 'A2', 'B2']);
  const s = coFillDown(coSetCell(coSheetFrom([[1, null], [2, null], [3, null]]), 'B1', '=A1*2'), 'B1:B3');
  assert.deepEqual([s.cells.B2!.f, s.cells.B3!.f], ['=A2*2', '=A3*2']);
  const sorted = coSortRange(coSheetFrom([['c', 1, '=B1*2'], ['a', 2, '=B2*2'], ['b', 3, '=B3*2']]), 'A1:C3', 0, true);
  assert.deepEqual([sorted.cells.A1!.f, sorted.cells.C1!.f], ['a', '=B1*2']);
  assert.equal(coEvalAll(sorted.cells).C1, 4);
});

test('number formats and #####', () => {
  assert.equal(coDisplay(1234.5, { nf: 'CURRENCY', dp: 2 }), '₦1,234.50');
  assert.equal(coDisplay(0.075, { nf: 'PERCENT', dp: 1 }), '7.5%');
  assert.equal(coDisplay(0.24, { nf: 'PERCENT', dp: 2 }), '24.00%');
  assert.equal(coDisplay(72.3333, { dp: 2 }), '72.33');
  assert.equal(coDisplay(1000000, { nf: 'THOUSANDS' }), '1,000,000');
  assert.equal(coDisplay(0.1 + 0.2), '0.3');
  assert.equal(coDisplay(-1.5, { nf: 'CURRENCY', dp: 2 }), '-₦1.50');
  const s = { ...coSheetFrom([[1234567]]), widths: { A: 4 } };
  assert.ok(coShown(s, 'A1', 1234567).startsWith('###'));
  assert.equal(coSetCell(coSheetFrom([]), 'B1', '7.5%').cells.B1!.nf, 'PERCENT');
});

test('spreadsheet: a typed-in result fails, and the mistakes lose the right marks', () => {
  // Hardcoded totals: the value is right but the sheet doesn't calculate.
  let s = model('CST_RESULTS');
  const vals = coEvalAll(s.sheet.cells);
  for (const a of ['E2', 'E3', 'E4', 'E5', 'E6']) s.sheet = coSetCell(s.sheet, a, String(vals[a]));
  assert.ok(failed('CST_RESULTS', SEED, s).includes('total'));
  assert.ok(failed('CST_RESULTS', SEED, s).includes('filled'));
  assert.ok(by(s, SEED, 'product') < 6);
  // A wrong threshold in IF.
  s = model('CST_RESULTS');
  const d = compOfficeVariant(SEED, 'CST_RESULTS').data as { pass: number };
  s.sheet = coFillDown(coSetCell(s.sheet, 'G2', `=IF(F2>${d.pass + 40},"PASS","FAIL")`), 'G2:G6');
  assert.ok(failed('CST_RESULTS', SEED, s).includes('remark'));
  // No $ on the rate.
  s = model('CST_VAT');
  s.sheet = coFillDown(coSetCell(s.sheet, 'B3', '=A3*B1'), 'B3:B6');
  const f = failed('CST_VAT', SEED, s);
  assert.ok(f.includes('abs') && f.includes('vat'), String(f));
  // 7.5 instead of 7.5%.
  s = model('CST_VAT');
  s.sheet = coSetCell(s.sheet, 'B1', '7.5');
  assert.ok(failed('CST_VAT', SEED, s).includes('rate'));
  // The total row in the chart.
  s = model('CST_CHARTS');
  s.sheet = { ...s.sheet, charts: [] };
  s.sheet = coAddChart(s.sheet, { type: 'PIE', range: 'A1:B7', title: 'Tuck-shop sales', xTitle: '', yTitle: '', labels: 'PERCENT' });
  s.sheet = coAddChart(s.sheet, { type: 'COLUMN', range: 'A1:B6', title: 'x', xTitle: 'Day', yTitle: 'Sales', labels: 'NONE' });
  assert.ok(failed('CST_CHARTS', SEED, s).includes('range'));
  assert.ok(failed('CST_CHARTS', SEED, s).includes('pie'));
  // A relative range in RANK goes wrong when copied.
  s = model('DPR_RESULTS');
  s.sheet = coFillDown(coSetCell(s.sheet, 'H2', '=RANK(E2,E2:E6)'), 'H2:H6');
  assert.ok(failed('DPR_RESULTS', SEED, s).includes('abs'));
  assert.ok(failed('DPR_RESULTS', SEED, s).includes('rank'));
  // Formatting must not change a number.
  s = model('ICT_PRINT');
  s.sheet = coSetCell(s.sheet, 'B5', '99');
  assert.ok(failed('ICT_PRINT', SEED, s).includes('data'));
  // AutoFit before the Currency format leaves ##### again.
  s = model('ICT_PRINT');
  s.sheet = { ...s.sheet, widths: { ...s.sheet.widths, E: 7 } };
  assert.ok(failed('ICT_PRINT', SEED, s).includes('fit'));
  // The misspelt survey answer left in: 39 counted, not 40.
  s = model('DPR_SURVEY');
  const v = compOfficeVariant(SEED, 'DPR_SURVEY').data as { typoRow: number; typo: string };
  s.sheet = coSetCell(s.sheet, `A${v.typoRow + 2}`, v.typo);
  const g = failed('DPR_SURVEY', SEED, s);
  assert.ok(g.includes('typo') && g.includes('forty'), String(g));
});

test('word processing: operations, merge and fields', () => {
  let s = model('CST_NOTICE');
  s.doc = { ...s.doc, border: false, spellRuns: 0 };
  let f = failed('CST_NOTICE', SEED, s);
  assert.ok(f.includes('border') && f.includes('spell'), String(f));
  assert.ok(by(s, SEED, 'procedure') < 6 && by(s, SEED, 'product') < 6);
  // Hand-editing the word instead of the tool, or a wrong folder.
  s = model('CST_NOTICE');
  s.doc = { ...s.doc, saved: { folder: 'Documents', name: 'Sports_Notice.docx' } };
  assert.ok(failed('CST_NOTICE', SEED, s).includes('save'));
  // Printing with no preview.
  s = model('CST_NOTICE');
  s.doc = { ...s.doc, print: { ...s.doc.print, preview: 0, previewedFirst: false } };
  assert.ok(failed('CST_NOTICE', SEED, s).includes('preview'));
  // Blank row left in the list: one empty letter.
  s = model('CST_MERGE');
  const v = compOfficeVariant(SEED, 'CST_MERGE');
  s.sheet = coStartState(v).sheet;
  f = failed('CST_MERGE', SEED, s);
  assert.ok(f.includes('blank'), String(f));
  // "Mr.Okeke": no space between the fields.
  s = model('CST_MERGE');
  s.doc.paras = s.doc.paras.map((p) => (p.id === 'dear' ? { ...p, text: 'Dear «Title»«Surname»,' } : p));
  assert.ok(failed('CST_MERGE', SEED, s).includes('space'));
  // F9 not pressed after a change.
  s = model('ICT_TABLE');
  s.doc = coSetTableCell(s.doc, 1, 1, '999');
  assert.ok(failed('ICT_TABLE', SEED, s).includes('table'));
  s = model('ICT_TABLE');
  s.doc = { ...s.doc, picture: { ...s.doc.picture!, lock: false, h: 2 } };
  const g = failed('ICT_TABLE', SEED, s);
  assert.ok(g.includes('lock') && g.includes('pic'), String(g));
  // Table fields and pictures behave.
  let d = coInsertTable(coEmptyDoc(), 2, 3);
  d = coSetTableCell(coSetTableCell(d, 0, 1, '4'), 1, 1, '5');
  d = coSetTableCell(d, 2, 1, '=SUM(ABOVE)');
  assert.equal(d.table!.cache['2,1'], undefined);
  assert.equal(coUpdateFields(d).table!.cache['2,1'], '9');
  const p = coSizePicture(coInsertPicture(coEmptyDoc(), 1600, 1200), 'w', 8);
  assert.equal(p.picture!.h, 6);
  const r = coReplaceAll({ ...coEmptyDoc(), paras: [{ id: 'p', text: 'House house Houses', size: 11, font: 'x', align: 'L', spacing: 1 }] }, 'House', 'house', true);
  assert.equal(r.count, 1);
  assert.equal(r.doc.paras[0]!.text, 'house house Houses');
});

test('database: keys, rules, integrity, queries and SQL', () => {
  let db = coDbAddTable(coEmptyDb(), 'S', [coField('Id', 'TEXT', 4, true), coField('Sex', 'TEXT', 1, false, '"M" Or "F"'), coField('Age', 'NUMBER', 0), coField('Class', 'TEXT', 5)]);
  const add = (r: Record<string, string>) => {
    const x = coDbAddRow(db, 'S', r);
    db = x.db;
    return x.error;
  };
  assert.equal(add({ Id: '1', Sex: 'M', Age: '16', Class: 'SS3A' }), null);
  assert.equal(add({ Id: '2', Sex: 'F', Age: '17', Class: 'SS3B' }), null);
  assert.equal(add({ Id: '3', Sex: 'F', Age: '15', Class: 'SS3A' }), null);
  assert.match(add({ Id: '1', Sex: 'M', Age: '1', Class: 'SS3A' })!, /unique/);
  assert.match(add({ Id: '', Sex: 'M', Age: '1', Class: 'SS3A' })!, /empty/);
  assert.match(add({ Id: '9', Sex: 'X', Age: '1', Class: 'SS3A' })!, /validation/);
  assert.match(add({ Id: '9', Sex: 'M', Age: 'old', Class: 'SS3A' })!, /not a number/);
  assert.match(add({ Id: '12345', Sex: 'M', Age: '1', Class: 'SS3A' })!, /at most/);
  assert.deepEqual([...db.refused].sort(), ['PK', 'RULE', 'SIZE', 'TYPE'].sort());
  db = coDbAddTable(db, 'P', [coField('R', 'TEXT', 4, true), coField('Id', 'TEXT', 4), coField('Amt', 'NUMBER', 0)]);
  const rel = coDbRelate(db, 'S', 'P', 'Id', true);
  assert.equal(rel.error, null);
  db = rel.db;
  assert.match(coDbAddRow(db, 'P', { R: 'a', Id: '77', Amt: '1' }).error!, /integrity/);
  db = coDbAddRow(db, 'P', { R: 'a', Id: '1', Amt: '10' }).db;
  db = coDbAddRow(db, 'P', { R: 'b', Id: '1', Amt: '15' }).db;
  db = coDbAddRow(db, 'P', { R: 'c', Id: '2', Amt: '5' }).db;
  assert.match(coDbRelate(db, 'P', 'S', 'Id', true).error!, /primary key/);
  const col = (field: string, p: Partial<Parameters<typeof coRunQuery>[1]['cols'][number]> = {}) => ({ field, show: true, sort: 'NONE' as const, crit: '', or: '', total: 'GROUP' as const, ...p });
  const q = (cols: ReturnType<typeof col>[], tables = ['S'], totals = false) => ({ name: 'q', tables, cols, totals, runs: 1 });
  assert.equal(coRunQuery(db, q([col('Id', { crit: '' }), col('Age', { crit: '>=16' }), col('Class', { crit: '"SS3A"' })])).rows.length, 1); // same row: AND
  assert.equal(coRunQuery(db, q([col('Id'), col('Age', { crit: '<16', or: '>16' })])).rows.length, 2); // or row
  assert.equal(coRunQuery(db, q([col('Id', { sort: 'DESC' })])).rows[0]![0], '3');
  const totals = coRunQuery(db, q([col('Class'), col('Amt', { total: 'SUM' }), { ...col('Left: 100-[SumOfAmt]'), total: 'EXPR' as never }], ['S', 'P'], true));
  assert.deepEqual(totals.cols, ['Class', 'SumOfAmt', 'Left']);
  assert.deepEqual(totals.rows.sort(), [['SS3A', 25, 75], ['SS3B', 5, 95]]);
  assert.match(coRunQuery(db, q([col('Nope')])).error!, /No field/);
  assert.ok(coCritMatch('Between 10 And 20', '15') && !coCritMatch('Between 10 And 20', '25'));
  assert.ok(coCritMatch('Like "A*"', 'Ada') && !coCritMatch('Like "A*"', 'Bello'));
  assert.ok(coCritMatch('Not "M"', 'F') && coCritMatch('"M" Or "F"', 'f'));
  // SQL.
  const sql = coSqlRun(db, "SELECT Class, COUNT(*) AS N, AVG(Age) AS Mean FROM S WHERE Age >= 15 GROUP BY Class ORDER BY Class DESC;");
  assert.deepEqual(sql.rows, [['SS3B', 1, 17], ['SS3A', 2, 15.5]]);
  assert.deepEqual(coSqlRun(db, "SELECT Id FROM S WHERE Class = 'SS3A' AND Age >= 16").rows, [['1']]);
  assert.deepEqual(coSqlRun(db, 'SELECT Id FROM S WHERE Age < 16 OR Age > 16 ORDER BY Id').rows, [['2'], ['3']]);
  assert.equal(coSqlRun(db, 'SELECT * FROM S').cols.length, 4);
  for (const bad of ['DROP TABLE S', 'SELECT Nope FROM S', 'SELECT Id FROM Nope', 'SELECT Class, COUNT(*) FROM S', 'SELECT Id FROM S WHERE (', ''])
    assert.ok(coSqlRun(db, bad).error, bad);
});

test('database lessons: mistakes lose the right marks', () => {
  let s = model('CST_DB');
  s.db.queries[0]!.cols = s.db.queries[0]!.cols.map((c) => ({ ...c, crit: c.field === 'Age' ? '' : c.crit }));
  assert.ok(failed('CST_DB', SEED, s).includes('query'));
  s = model('CST_DB');
  s.db.tables[0]!.fields = s.db.tables[0]!.fields.map((f) => ({ ...f, pk: false }));
  assert.ok(failed('CST_DB', SEED, s).includes('design'));
  s = model('DPR_REL');
  s.db.relations = s.db.relations.map((r) => ({ ...r, enforce: false }));
  assert.ok(failed('DPR_REL', SEED, s).includes('enforce'));
  s = model('DPR_QUERY');
  const q2 = s.db.queries.find((q) => q.name === 'qryOr')!;
  q2.cols = q2.cols.map((c) => (c.or ? { ...c, crit: `${c.crit} `, or: '' } : c));
  const f = failed('DPR_QUERY', SEED, s);
  assert.ok(f.includes('or') && f.includes('orq'), String(f));
  s = model('DPR_QUERY');
  s.db.sql = ['SELECT Class FROM RESULTS'];
  assert.ok(failed('DPR_QUERY', SEED, s).includes('sql'));
  s = model('DPR_FORMS');
  const t = s.db.tables[0]!;
  t.rows.push({ AdmNo: '1007', Surname: 'Danladi', Class: 'SS3B', Score: '66' });
  assert.ok(failed('DPR_FORMS', SEED, s).includes('data'));
  s = model('DPR_TABLE');
  s.db.tables[0]!.fields = s.db.tables[0]!.fields.map((x) => (x.name === 'Phone' ? { ...x, type: 'NUMBER' } : x));
  assert.ok(failed('DPR_TABLE', SEED, s).includes('design'));
});

test('slides and files: mistakes', () => {
  let s = model('CST_DECK');
  s.deck = { ...s.deck, slides: s.deck.slides.map((x, i) => (i ? x : { ...x, transition: 'NONE' })), escaped: false };
  let f = failed('CST_DECK', SEED, s);
  assert.ok(f.includes('trans') && f.includes('show'), String(f));
  s = model('ICT_DECK');
  s.deck = { ...s.deck, master: { ...s.deck.master, logo: false, footer: '' } };
  f = failed('ICT_DECK', SEED, s);
  assert.ok(f.includes('logo') && f.includes('footer'), String(f));
  s = model('DPR_DECK');
  s.deck.slides[3]!.advance = 5;
  assert.ok(failed('DPR_DECK', SEED, s).includes('time'));
  // Moved, not copied: the originals are gone.
  s = model('DPR_FILES');
  s.fs = { ...s.fs, nodes: s.fs.nodes.filter((n) => n.parent !== 'f0') };
  assert.ok(failed('DPR_FILES', SEED, s).includes('orig'));
  s = model('CST_FILES');
  s.fs = { ...s.fs, flash: 'IN' };
  assert.ok(failed('CST_FILES', SEED, s).includes('eject'));
  // The bin and the flash drive behave differently.
  let fs = coEmptyFs();
  fs = { ...fs, nodes: [{ id: 'd', name: 'D: (Data)', parent: null, kind: 'DRIVE', size: 0 }, { id: 'x', name: 'a.txt', parent: 'd', kind: 'FILE', size: 1 }] };
  fs = coFsInsertFlash(fs);
  fs = coFsPaste(coFsCopy(fs, ['x'], false), 'flash').fs;
  const copy = fs.nodes.find((n) => n.parent === 'flash')!;
  const gone = coFsDelete(fs, copy.id);
  assert.ok(!gone.nodes.some((n) => n.id === copy.id) && gone.permanentlyDeleted.includes('a.txt'));
  assert.ok(coFsDelete(fs, 'x').nodes.find((n) => n.id === 'x')!.bin === 'd');
  assert.ok(coFsMkdir(fs, 'd', 'a/b').error);
  assert.ok(coFsMkdir(fs, 'd', 'A.TXT').error);
  assert.equal(coFsPaste({ ...fs, clip: null }, 'd').error, 'Nothing to paste: copy or cut something first.');
});

test('internet and mail: operators, scams and limits', () => {
  const pages = compOfficeVariant(SEED, 'DPR_BROWSE').pages!;
  const all = coSearch(pages, 'Lassa fever').length;
  const site = coSearch(pages, '"Lassa fever" site:nha.gov.ng').length;
  const minus = coSearch(pages, 'Lassa fever -rat').length;
  const pdf = coSearch(pages, 'filetype:pdf Lassa').length;
  assert.ok(all > site && site >= 1 && minus < all && pdf === 1);
  assert.equal(coSearch(pages, '').length, 0);
  assert.equal(coSearch(pages, '"no such phrase anywhere"').length, 0);
  let s = model('DPR_BROWSE');
  s.web.risky = ['FreeCure.exe'];
  s.web.downloads = s.web.downloads.map((d) => ({ ...d, scanned: false }));
  const f = failed('DPR_BROWSE', SEED, s);
  assert.ok(f.includes('safe') && f.includes('scan'), String(f));
  s = model('ICT_SEARCH');
  s.web.judged = Object.fromEntries(Object.keys(s.web.judged).map((k) => [k, !s.web.judged[k]]));
  assert.ok(failed('ICT_SEARCH', SEED, s).includes('judge'));
  s = model('ICT_SEARCH');
  s.web.quote.text = 'Words that are not on that page at all.';
  assert.ok(failed('ICT_SEARCH', SEED, s).includes('quote'));
  assert.ok(!coStrongPassword('password') && !coStrongPassword('Pass1!') && coStrongPassword('Str0ng#Pass'));
  s = model('CST_MAIL');
  s.mail.account.strong = false;
  assert.ok(failed('CST_MAIL', SEED, s).includes('acct'));
  s = model('CST_MAIL');
  s.mail.spam = [];
  s.mail.signedOut = false;
  const g = failed('CST_MAIL', SEED, s);
  assert.ok(g.includes('spam') && g.includes('out'), String(g));
  const m = coEmptyMail();
  const big = { to: ['a@b.example'], cc: [], bcc: [], subject: 's', body: 'b', files: [{ name: 'x', mb: 20 }], kind: 'NEW' as const };
  assert.match(coMailSend(m, big, 'me@b.example').error!, /Too large/); // 20 × 4/3 = 26.7
  assert.equal(coMailSend(m, { ...big, files: [{ name: 'x', mb: 18 }] }, 'me@b.example').error, null);
  assert.match(coMailSend(m, { ...big, to: [] }, 'me').error!, /To/);
  assert.match(coMailSend(m, { ...big, to: ['not an address'] }, 'me').error!, /valid/);
  s = model('ICT_SHARE');
  s.cloud.shares = s.cloud.shares.map((x) => ({ ...x, perm: 'EDIT' }));
  s.cloud.privacy.phone = 'EVERYONE';
  const h = failed('ICT_SHARE', SEED, s);
  assert.ok(h.includes('share') && h.includes('phone'), String(h));
});

test('answers are marked as students write them', () => {
  const a = { id: 'x', label: 'x', value: 15802.5, tol: 0.011 };
  for (const raw of ['15802.5', '15 802.50', '₦15,802.50', 'N15802.50', '15802.50 naira']) assert.ok(coAnswerRight(a, raw), raw);
  assert.ok(!coAnswerRight(a, '15000') && !coAnswerRight(a, '') && !coAnswerRight(a, 'abc') && !coAnswerRight(a, undefined));
  assert.ok(coAnswerRight({ id: 'p', label: 'p', value: 3 }, '3 pages'));
  assert.ok(coAnswerRight({ id: 'f', label: 'f', value: '=SUM(B4:D4)' }, '= sum(b4:d4)'));
  assert.ok(coAnswerRight({ id: 'f', label: 'f', value: 'D:\\School\\SS3\\A.docx' }, 'd:\\school\\ss3\\a.docx'));
  // A wrong answer loses its share of the calculation marks, not everything.
  const s = model('CST_VAT');
  s.answers.c7 = '1';
  assert.equal(by(s, SEED, 'calculation'), 3);
  assert.equal(by(s, SEED, 'procedure'), 6);
});

void coFormatCells;
void coTaskTitle;
