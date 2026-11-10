import { CO_FIRST, ck, coAnswerNum, coDef, coSameText, coShuffle, type CoCheck, type CoDef, type CompOfficeState } from './comp-office-data';
import { coIsErr, coParseRange, coRangeAddrs, coRelative, type CoVal } from './comp-office-formula';
import { coAddChart, coAutoFit, coChartData, coColWidth, coFillDown, coFormatCells, coNumAt, coReader, coSetCell, coSheetFrom, coTextAt, coShown, type CoChart, type CoSheet } from './comp-office-sheet';
import { labPick, labRandom, roundDp } from './seeded';

/** The spreadsheet lessons. Every target is recomputed twice: as handed in, and again with the input data changed, so typed-in results fail. */

type G = (a: string) => CoVal;
interface Target {
  id: string;
  label: string;
  cells: string[];
  expect: (a: string, g: G) => number | string;
  /** The formula must use this (function name, $ reference). */
  fn?: RegExp;
  tol?: number;
}
const near = (x: number, y: number, tol = 1e-6) => Number.isFinite(x) && Math.abs(x - y) <= tol;
/** The same sheet with its numeric inputs changed. */
function perturbed(s: CoSheet, inputs: string[]): CoSheet {
  const cells = { ...s.cells };
  inputs.forEach((a, i) => {
    const c = cells[a];
    if (!c || c.f.startsWith('=')) return;
    const x = coNumAt(coReader(s), a);
    if (Number.isFinite(x)) cells[a] = { ...c, f: String(x < 1 ? roundDp(x * 1.5, 4) : x + 3 + (i % 4)) };
  });
  return { ...s, cells };
}
function holds(s: CoSheet, t: Target): boolean {
  const g = coReader(s);
  return t.cells.every((a) => {
    const want = t.expect(a, g);
    const got = g(a);
    if (coIsErr(got) || got === null) return false;
    return typeof want === 'number' ? near(typeof got === 'number' ? got : NaN, want, t.tol ?? 1e-6) : coSameText(String(got), want);
  });
}
/** Right now, by a formula, and still right when the data changes. */
export function coTargetOk(s: CoSheet, t: Target, inputs: string[], change?: (s: CoSheet) => CoSheet): boolean {
  if (!t.cells.every((a) => (s.cells[a]?.f ?? '').startsWith('=') && (!t.fn || t.fn.test(s.cells[a]!.f)))) return false;
  return holds(s, t) && holds(change ? change(s) : perturbed(s, inputs), t);
}
const copied = (s: CoSheet, cells: string[]) => new Set(cells.map((a) => coRelative(s.cells[a]?.f ?? '', a))).size === 1 && !!s.cells[cells[0]!]?.f.startsWith('=');
const allFmt = (s: CoSheet, range: string, f: (c: NonNullable<CoSheet['cells'][string]>) => boolean) => coRangeAddrs(range).every((a) => !!s.cells[a] && f(s.cells[a]!));
const savedAs = (s: CoSheet, name: string) => coSameText(s.file.replace(/\.(xlsx|xls|ods)$/i, ''), name.replace(/\.xlsx$/i, ''));
const printed = (s: CoSheet) => s.print.jobs > 0 && s.print.previewedFirst;
const col = (c: string, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `${c}${a + i}`);
const label = (s: CoSheet, a: string, re: RegExp) => re.test(coTextAt(coReader(s), a));
/** The cells given to the student still hold what was given. */
const intact = (s: CoSheet, orig: Record<string, string>, skip: string[] = []) => Object.entries(orig).every(([a, f]) => skip.includes(a) || s.cells[a]?.f === f);
const originals = (s: CoSheet) => Object.fromEntries(Object.entries(s.cells).map(([a, c]) => [a, c.f]));
const targets = (s: CoSheet, ts: Target[], inputs: string[], change?: (s: CoSheet) => CoSheet): CoCheck[] => ts.map((t) => ck('product', t.id, t.label, coTargetOk(s, t, inputs, change), 'sheet'));
const type = (s: CoSheet, m: Record<string, string>) => Object.entries(m).reduce((x, [a, f]) => coSetCell(x, a, f), s);
const setSheet = (st: CompOfficeState, sheet: CoSheet): CompOfficeState => ({ ...st, sheet });
const finish = (st: CompOfficeState, sheet: CoSheet, file: string, extra: Partial<CoSheet['print']> = {}): CompOfficeState => ({ ...st, sheet: { ...sheet, file, print: { ...sheet.print, preview: 1, jobs: 1, previewedFirst: true, ...extra } } });
const hasChart = (s: CoSheet, types: CoChart['type'][], range: string, title: RegExp, need: (c: CoChart) => boolean = () => true) => s.charts.some((c) => types.includes(c.type) && coSameText(c.range, range) && title.test(c.title) && need(c));

const PREC_SHEET = {
  guide: 'Two correct precautions, e.g. begin every formula with =; use cell references, not typed numbers; put text in IF in double quotation marks; lock a range or rate with $ before copying; save often; preview before printing.',
  kw: [['equal', '='], ['reference', 'references', 'cell address'], ['quotation', 'quotes'], ['absolute', '$', 'lock', 'fixed'], ['save', 'saved', 'backup'], ['preview'], ['total row', 'exclude the total', 'not the total'], ['title', 'label']],
};

interface ResultData {
  names: string[];
  scores: number[][];
  pass: number;
  file: string;
  ask: number;
}
function scoreSet(seed: number, salt: string, tries = 40): ResultData {
  const r = labRandom(seed, salt);
  const names = coShuffle(r, CO_FIRST).slice(0, 5);
  for (let n = 0; ; n++) {
    const scores = names.map(() => [0, 1, 2].map(() => 32 + Math.floor(r() * 62)));
    const totals = scores.map((x) => x[0]! + x[1]! + x[2]!);
    const pass = labPick(r, [45, 50, 50, 55]);
    const passes = totals.filter((t) => t / 3 >= pass).length;
    if ((new Set(totals).size === 5 && passes >= 1 && passes <= 4 && !totals.some((t) => t === pass * 3)) || n > tries) return { names, scores, pass, file: '', ask: Math.floor(r() * 5) };
  }
}
const scoreRows = (d: ResultData, head: string[]) => [head, ...d.names.map((n, i) => [n, ...d.scores[i]!])] as (string | number)[][];
const scoreInputs = col('B', 2, 6).concat(col('C', 2, 6), col('D', 2, 6));
const totalOf = (d: ResultData, i: number) => d.scores[i]!.reduce((a, b) => a + b, 0);
const resultTargets = (d: ResultData): Target[] => [
  { id: 'total', label: 'Totals by =SUM, copied down', cells: col('E', 2, 6), expect: (a, g) => ['B', 'C', 'D'].reduce((t, c) => t + coNumAt(g, `${c}${a.slice(1)}`), 0), fn: /SUM\(/i },
  { id: 'average', label: 'Averages by =AVERAGE, copied down', cells: col('F', 2, 6), expect: (a, g) => ['B', 'C', 'D'].reduce((t, c) => t + coNumAt(g, `${c}${a.slice(1)}`), 0) / 3, fn: /AVERAGE\(/i },
  { id: 'remark', label: `Remarks by =IF, PASS at ${d.pass} and above`, cells: col('G', 2, 6), expect: (a, g) => (coNumAt(g, `F${a.slice(1)}`) >= d.pass ? 'PASS' : 'FAIL'), fn: /IF\(/i },
];

const CST_RESULTS = coDef<ResultData>({
  task: 'CST_RESULTS',
  family: 'SHEET',
  title: 'Spreadsheet result sheet',
  apps: ['sheet'],
  make: (seed) => ({ ...scoreSet(seed, 'cst-results'), file: 'Results.xlsx' }),
  brief: (d) => [
    'The scores are already keyed in A1:D6. Type the headings E1 Total, F1 Average, G1 Remark.',
    'E2 =SUM(B2:D2), F2 =AVERAGE(B2:D2), G2 =IF(F2>=' + d.pass + ',"PASS","FAIL"). Press Enter after each.',
    'Select E2:G6 and fill down (fill handle or Ctrl+D).',
    'B7 =MAX(B2:B6), B8 =AVERAGE(B2:B6); label A7 Highest and A8 Mean.',
    'Format F2:F6 to 2 decimal places, make row 1 bold, add borders to A1:G6.',
    'Save as Results.xlsx, tick Gridlines in Page Setup, preview, then print.',
    'Answer the questions in your notebook, then change a score to see the sheet recalculate (change it back).',
  ],
  answers: (d) => {
    const totals = d.names.map((_, i) => totalOf(d, i));
    return [
      { id: 'mean', label: 'Mean Maths score', value: roundDp(d.scores.reduce((t, x) => t + x[0]!, 0) / 5, 2), tol: 0.011 },
      { id: 'avg', label: `${d.names[d.ask]}'s average (2 d.p.)`, value: roundDp(totals[d.ask]! / 3, 2), tol: 0.011 },
      { id: 'passes', label: 'How many students passed?', value: totals.filter((t) => t / 3 >= d.pass).length },
      { id: 'copy', label: 'The formula in E4 after copying', value: '=SUM(B4:D4)' },
    ];
  },
  start: (d, s) => setSheet(s, coSheetFrom(scoreRows(d, ['Name', 'Maths', 'English', 'Biology']))),
  checks: (d, st) => {
    const s = st.sheet;
    const orig = originals(coSheetFrom(scoreRows(d, ['Name', 'Maths', 'English', 'Biology'])));
    return [
      ck('procedure', 'heads', 'Type the headings Total, Average and Remark in E1:G1', label(s, 'E1', /total/i) && label(s, 'F1', /average/i) && label(s, 'G1', /remark/i), 'sheet'),
      ck('procedure', 'filled', 'Copy the formulas down with the fill handle: every row has the same formula', ['E', 'F', 'G'].every((c) => copied(s, col(c, 2, 6))), 'sheet', 'Copying a relative formula makes B2:D2 become B3:D3, and so on.'),
      ck('procedure', 'dp', 'Format F2:F6 to 2 decimal places', allFmt(s, 'F2:F6', (c) => c.dp === 2), 'sheet'),
      ck('procedure', 'bold', 'Make row 1 bold and put borders on A1:G6', allFmt(s, 'A1:G1', (c) => !!c.b) && allFmt(s, 'A1:G6', (c) => !!c.bd), 'sheet'),
      ck('procedure', 'save', 'Save as Results.xlsx', savedAs(s, d.file), 'sheet'),
      ck('procedure', 'print', 'Set gridlines, preview, then print', printed(s) && s.print.gridlines, 'sheet', 'Preview first: it saves paper.'),
      ck('product', 'data', 'The scores are as given', intact(s, orig), 'sheet'),
      ...targets(s, resultTargets(d), scoreInputs),
      ...targets(s, [
        { id: 'max', label: 'B7 finds the highest Maths score with =MAX', cells: ['B7'], expect: (_, g) => Math.max(...col('B', 2, 6).map((a) => coNumAt(g, a))), fn: /MAX\(/i },
        { id: 'mean', label: 'B8 finds the mean Maths score with =AVERAGE', cells: ['B8'], expect: (_, g) => col('B', 2, 6).reduce((t, a) => t + coNumAt(g, a), 0) / 5, fn: /AVERAGE\(/i },
      ], scoreInputs),
      ck('product', 'labels', 'Label A7 Highest and A8 Mean', label(s, 'A7', /highest/i) && label(s, 'A8', /mean/i), 'sheet'),
    ];
  },
  model: (d, st) => {
    let s = type(st.sheet, { E1: 'Total', F1: 'Average', G1: 'Remark', E2: '=SUM(B2:D2)', F2: '=AVERAGE(B2:D2)', G2: `=IF(F2>=${d.pass},"PASS","FAIL")`, A7: 'Highest', A8: 'Mean', B7: '=MAX(B2:B6)', B8: '=AVERAGE(B2:B6)' });
    s = coFillDown(s, 'E2:G6');
    s = coFormatCells(s, 'F2:F6', { dp: 2 });
    s = coFormatCells(s, 'A1:G1', { b: true });
    s = coFormatCells(s, 'A1:G6', { bd: true });
    return finish(st, s, d.file, { gridlines: true });
  },
  prec: { guide: PREC_SHEET.guide, kw: PREC_SHEET.kw },
  explain: {
    q: 'Why should a formula use cell references and not typed numbers, and what happens to =SUM(B2:D2) when it is copied down a row?',
    guide: '2 marks: (1) references make the result update automatically when a score changes; (1) a relative reference changes as it is copied, so B2:D2 becomes B3:D3.',
    kw: [['update', 'recalculate', 'automatic', 'changes'], ['relative', 'b3', 'next row', 'adjust', 'row']],
    need: 2,
  },
});

interface VatData {
  prices: number[];
  rate: number;
}
const VAT_FILE = 'VAT.xlsx';
const vatRows = (d: VatData) => {
  const rows: (string | number | null)[][] = [['VAT Rate', null], [], ...d.prices.map((p) => [p])];
  return rows;
};
const vatInputs = ['A3', 'A4', 'A5', 'A6', 'B1'];
const CST_VAT = coDef<VatData>({
  task: 'CST_VAT',
  family: 'SHEET',
  title: 'Relative and absolute references: VAT',
  apps: ['sheet'],
  make: (seed) => {
    const r = labRandom(seed, 'cst-vat');
    return { rate: 7.5, prices: coShuffle(r, [1200, 1600, 2000, 2400, 2800, 3200, 3500, 4000, 4800, 5200, 6400, 8000]).slice(0, 4) };
  },
  brief: (d) => [
    `In B1 type ${d.rate}% (with the % sign). The prices are already in A3:A6.`,
    'In row 2 type the headings A2 Price, B2 VAT, C2 Total.',
    'B3 =A3*$B$1, then copy down to B6. Click B5 and read the formula bar.',
    'C3 =A3+B3, copy down to C6. C7 =SUM(C3:C6).',
    'Now see the mistake on purpose: D3 =A3*B1 (no dollar signs), copy down to D6, and read D4 to D6.',
    'Format B3:C7 as Currency with 2 decimal places. Save as VAT.xlsx.',
  ],
  answers: (d) => {
    const vat = d.prices.map((p) => (p * d.rate) / 100);
    const total = d.prices.reduce((t, p, i) => t + p + vat[i]!, 0);
    return [
      { id: 'b5', label: 'The formula in B5 after copying', value: '=A5*$B$1' },
      { id: 'c7', label: 'Grand total in C7 (₦)', value: roundDp(total, 2), tol: 0.011 },
      { id: 'd4', label: 'The value in D4 (relative version)', value: 0 },
      { id: 'd5', label: 'The value in D5 (relative version)', value: roundDp(d.prices[2]! * vat[0]!, 2), tol: 0.011 },
    ];
  },
  start: (d, s) => setSheet(s, coSheetFrom(vatRows(d))),
  checks: (d, st) => {
    const s = st.sheet;
    const rate = coNumAt(coReader(s), 'B1');
    const v = (a: string) => a.slice(1);
    return [
      ck('procedure', 'rate', `Type the rate in B1 as ${d.rate}% (not ${d.rate})`, near(rate, d.rate / 100), 'sheet', `Typing ${d.rate} alone makes VAT 100 times too big.`),
      ck('procedure', 'heads', 'Type the headings Price, VAT and Total in row 2', label(s, 'A2', /price/i) && label(s, 'B2', /vat/i) && label(s, 'C2', /total/i), 'sheet'),
      ck('procedure', 'abs', 'Copy =A3*$B$1 down: the $ keeps B1 fixed', ['B3', 'B4', 'B5', 'B6'].every((a) => /\$B\$1/i.test(s.cells[a]?.f ?? '')) && copied(s, col('B', 3, 6)), 'sheet', 'Without the dollar signs the rate reference would move down as well.'),
      ck('procedure', 'rel', 'Copy the relative =A3*B1 down column D and see it go wrong', copied(s, col('D', 3, 6)) && !/\$/.test(s.cells.D3?.f ?? '$') && /B1/i.test(s.cells.D3?.f ?? ''), 'sheet'),
      ck('procedure', 'fmt', 'Format B3:C7 as Currency with 2 decimal places', allFmt(s, 'B3:C6', (c) => c.nf === 'CURRENCY' && (c.dp ?? 2) === 2) && s.cells.C7?.nf === 'CURRENCY', 'sheet'),
      ck('procedure', 'save', 'Save as VAT.xlsx', savedAs(s, VAT_FILE), 'sheet'),
      ck('product', 'prices', 'The prices are as given', d.prices.every((p, i) => near(coNumAt(coReader(s), `A${3 + i}`), p)), 'sheet'),
      ...targets(s, [
        { id: 'vat', label: 'VAT in B3:B6', cells: col('B', 3, 6), expect: (a, g) => coNumAt(g, `A${v(a)}`) * coNumAt(g, 'B1'), fn: /\$B\$1/i },
        { id: 'total', label: 'Price + VAT in C3:C6', cells: col('C', 3, 6), expect: (a, g) => coNumAt(g, `A${v(a)}`) + coNumAt(g, `B${v(a)}`) },
        { id: 'grand', label: 'Grand total in C7 by =SUM', cells: ['C7'], expect: (_, g) => col('C', 3, 6).reduce((t, a) => t + coNumAt(g, a), 0), fn: /SUM\(/i },
      ], vatInputs),
    ];
  },
  model: (d, st) => {
    let s = type(st.sheet, { B1: `${d.rate}%`, A2: 'Price', B2: 'VAT', C2: 'Total', B3: '=A3*$B$1', C3: '=A3+B3', C7: '=SUM(C3:C6)', D3: '=A3*B1' });
    s = coFillDown(s, 'B3:D6');
    s = coFormatCells(s, 'B3:C7', { nf: 'CURRENCY', dp: 2 });
    return { ...st, sheet: { ...s, file: VAT_FILE } };
  },
  prec: { guide: 'Two correct precautions, e.g. press F4 to add the $ signs; enter the percentage with the % sign or as 0.075; begin formulas with =; save the file.', kw: [['f4', '$', 'dollar', 'absolute'], ['percent', '%', '0 075', 'decimal'], ['equal', '='], ['save', 'saved']] },
  explain: {
    q: 'Why did =A3*$B$1 stay correct when copied while =A3*B1 gave wrong answers?',
    guide: '2 marks: (1) the $ makes B1 an absolute reference, so it stays fixed when copied; (1) the relative B1 moved to B2, B3… (an empty cell or a VAT value), so the wrong number was multiplied.',
    kw: [['absolute', 'fixed', 'stay', 'locked', 'constant'], ['relative', 'moved', 'changes', 'b2', 'shift']],
    need: 2,
  },
});

interface ChartData {
  labels: string[];
  sales: number[];
}
const chartRows = (d: ChartData, head: string[]) => [head, ...d.labels.map((x, i) => [x, d.sales[i]!])];
const CST_CHARTS = coDef<ChartData>({
  task: 'CST_CHARTS',
  family: 'SHEET',
  title: 'Pie chart and bar chart',
  apps: ['sheet'],
  make: (seed) => {
    const r = labRandom(seed, 'cst-chart');
    for (;;) {
      const sales = coShuffle(r, [6000, 7500, 9000, 10500, 12000, 13500, 15000, 16500, 18000, 21000]).slice(0, 5);
      const t = sales.reduce((a, b) => a + b, 0);
      if (t % 100 === 0) return { labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], sales };
    }
  },
  brief: () => [
    'The tuck-shop sales are in A1:B6. In B7 type =SUM(B2:B6).',
    'In C2 type =B2/$B$7*360 and copy down to C6 to find each sector angle. Type C1 Angle.',
    'Select A1:B6 (not the total row) and Insert a Pie chart; title it "Tuck-shop sales, one week" and show percentages.',
    'Select A1:B6 again, Insert a Column chart; axis titles Day and Sales (N).',
    'Save as Tuckshop.xlsx.',
  ],
  answers: (d) => {
    const t = d.sales.reduce((a, b) => a + b, 0);
    const hi = d.sales.indexOf(Math.max(...d.sales));
    const lo = d.sales.indexOf(Math.min(...d.sales));
    return [
      { id: 'total', label: 'Total sales (₦)', value: t },
      { id: 'angle', label: `Sector angle for ${d.labels[hi]} (degrees)`, value: roundDp((d.sales[hi]! / t) * 360, 2), tol: 0.06 },
      { id: 'best', label: 'The day with the largest sector', value: d.labels[hi]! },
      { id: 'pct', label: `${d.labels[lo]}'s share (%)`, value: roundDp((d.sales[lo]! / t) * 100, 2), tol: 0.06 },
    ];
  },
  start: (d, s) => setSheet(s, coSheetFrom(chartRows(d, ['Day', 'Sales (N)']))),
  checks: (d, st) => {
    const s = st.sheet;
    const inputs = col('B', 2, 6);
    return [
      ck('procedure', 'sum', 'B7 =SUM(B2:B6)', /SUM\(/i.test(s.cells.B7?.f ?? ''), 'sheet'),
      ck('procedure', 'angle', 'Copy =B2/$B$7*360 down C2:C6', copied(s, col('C', 2, 6)) && /\$B\$7/i.test(s.cells.C2?.f ?? ''), 'sheet', 'The $ keeps the total fixed in every row.'),
      ck('procedure', 'range', 'Select A1:B6 for the charts, leaving out the total row', s.charts.length >= 2 && s.charts.every((c) => coChartData(s, c).length === 5), 'sheet', 'The total in the range would be a slice worth half the pie.'),
      ck('procedure', 'save', 'Save as Tuckshop.xlsx', savedAs(s, 'Tuckshop.xlsx'), 'sheet'),
      ck('product', 'data', 'The sales are as given', d.sales.every((x, i) => near(coNumAt(coReader(s), `B${i + 2}`), x)), 'sheet'),
      ...targets(s, [
        { id: 'total', label: 'Total in B7', cells: ['B7'], expect: (_, g) => inputs.reduce((t, a) => t + coNumAt(g, a), 0) },
        { id: 'angles', label: 'Sector angles in C2:C6', cells: col('C', 2, 6), expect: (a, g) => (coNumAt(g, `B${a.slice(1)}`) / inputs.reduce((t, x) => t + coNumAt(g, x), 0)) * 360 },
      ], inputs),
      ck('product', 'pie', 'A pie chart with the title and percentage labels', hasChart(s, ['PIE'], 'A1:B6', /tuck.?shop/i, (c) => c.labels === 'PERCENT'), 'sheet'),
      ck('product', 'bar', 'A column chart with both axis titles', hasChart(s, ['COLUMN', 'BAR'], 'A1:B6', /./, (c) => /day/i.test(c.xTitle) && /sales/i.test(c.yTitle)) || hasChart(s, ['COLUMN', 'BAR'], 'A1:B6', /^/, (c) => /day/i.test(c.xTitle) && /sales/i.test(c.yTitle)), 'sheet'),
    ];
  },
  model: (_, st) => {
    let s = type(st.sheet, { B7: '=SUM(B2:B6)', C1: 'Angle', C2: '=B2/$B$7*360' });
    s = coFillDown(s, 'C2:C6');
    s = coAddChart(s, { type: 'PIE', range: 'A1:B6', title: 'Tuck-shop sales, one week', xTitle: '', yTitle: '', labels: 'PERCENT' });
    s = coAddChart(s, { type: 'COLUMN', range: 'A1:B6', title: 'Tuck-shop sales, one week', xTitle: 'Day', yTitle: 'Sales (N)', labels: 'NONE' });
    return { ...st, sheet: { ...s, file: 'Tuckshop.xlsx' } };
  },
  prec: { guide: 'Two correct precautions, e.g. select only the labels and values, not the total row; give every chart a title and axis titles; use $ on the total before copying.', kw: PREC_SHEET.kw },
  explain: {
    q: 'What goes wrong if the total row is included in the pie chart range, and why does a sector angle use value ÷ total × 360?',
    guide: '2 marks: (1) the total becomes an extra slice worth half the pie, shrinking the others; (1) a whole circle is 360 degrees, so each item gets its fraction of the total as a fraction of 360.',
    kw: [['half', 'extra', 'slice', 'sector', 'giant'], ['360', 'circle', 'fraction', 'proportion']],
    need: 2,
  },
});

const DPR_RESULTS = coDef<ResultData>({
  task: 'DPR_RESULTS',
  family: 'SHEET',
  title: 'Results with formulae and functions',
  apps: ['sheet'],
  make: (seed) => ({ ...scoreSet(seed, 'dpr-results'), file: 'SS3_Results.xlsx' }),
  brief: (d) => [
    'The scores are in A1:D6. Type the headings E1 Total, F1 Average, G1 Remark, H1 Position.',
    'E2 =SUM(B2:D2); F2 =AVERAGE(B2:D2); G2 =IF(F2>=' + d.pass + ',"PASS","FAIL"); H2 =RANK(E2,$E$2:$E$6).',
    'Select E2:H6 and fill down. Format F2:F6 to 2 decimal places.',
    'In A8 type Class average (Maths); in B8 type =AVERAGE(B2:B6).',
    'Save as SS3_Results.xlsx.',
  ],
  answers: (d) => {
    const totals = d.names.map((_, i) => totalOf(d, i));
    const first = totals.indexOf(Math.max(...totals));
    return [
      { id: 'first', label: 'Who came first?', value: d.names[first]! },
      { id: 'mean', label: 'Class average in Maths', value: roundDp(d.scores.reduce((t, x) => t + x[0]!, 0) / 5, 2), tol: 0.011 },
      { id: 'pos', label: `${d.names[d.ask]}'s position`, value: 1 + totals.filter((t) => t > totals[d.ask]!).length },
      { id: 'h4', label: 'The formula in H4 after copying', value: '=RANK(E4,$E$2:$E$6)' },
    ];
  },
  start: (d, s) => setSheet(s, coSheetFrom(scoreRows(d, ['Name', 'Maths', 'English', 'Biology']))),
  checks: (d, st) => {
    const s = st.sheet;
    const orig = originals(coSheetFrom(scoreRows(d, ['Name', 'Maths', 'English', 'Biology'])));
    return [
      ck('procedure', 'heads', 'Type the headings Total, Average, Remark and Position', label(s, 'E1', /total/i) && label(s, 'F1', /average/i) && label(s, 'G1', /remark/i) && label(s, 'H1', /position/i), 'sheet'),
      ck('procedure', 'filled', 'Fill the four formulas down to row 6', ['E', 'F', 'G', 'H'].every((c) => copied(s, col(c, 2, 6))), 'sheet'),
      ck('procedure', 'abs', 'Lock the RANK range with $', /\$E\$2:\$E\$6/i.test(s.cells.H2?.f ?? ''), 'sheet', 'Otherwise the range shifts as it is copied and the positions go wrong.'),
      ck('procedure', 'dp', 'Format F2:F6 to 2 decimal places', allFmt(s, 'F2:F6', (c) => c.dp === 2), 'sheet'),
      ck('procedure', 'save', 'Save as SS3_Results.xlsx', savedAs(s, d.file), 'sheet'),
      ck('product', 'data', 'The scores are as given', intact(s, orig), 'sheet'),
      ...targets(s, [
        ...resultTargets(d),
        { id: 'rank', label: 'Positions by =RANK', cells: col('H', 2, 6), expect: (a, g) => 1 + col('E', 2, 6).filter((x) => coNumAt(g, x) > coNumAt(g, `E${a.slice(1)}`)).length, fn: /RANK\(/i },
        { id: 'mean', label: 'B8 the class average in Maths', cells: ['B8'], expect: (_, g) => col('B', 2, 6).reduce((t, a) => t + coNumAt(g, a), 0) / 5, fn: /AVERAGE\(/i },
      ], scoreInputs),
    ];
  },
  model: (d, st) => {
    let s = type(st.sheet, { E1: 'Total', F1: 'Average', G1: 'Remark', H1: 'Position', E2: '=SUM(B2:D2)', F2: '=AVERAGE(B2:D2)', G2: `=IF(F2>=${d.pass},"PASS","FAIL")`, H2: '=RANK(E2,$E$2:$E$6)', A8: 'Class average (Maths)', B8: '=AVERAGE(B2:B6)' });
    s = coFillDown(s, 'E2:H6');
    s = coFormatCells(s, 'F2:F6', { dp: 2 });
    return { ...st, sheet: { ...s, file: d.file } };
  },
  prec: { guide: 'Two correct precautions, e.g. begin every formula with =; use references, not typed numbers; lock ranges with $ before copying.', kw: PREC_SHEET.kw },
  explain: {
    q: 'Why does RANK need $E$2:$E$6 when it is copied, and what does the "2 decimal places" format change?',
    guide: '2 marks: (1) the $ keeps the range fixed, otherwise it shifts and positions go wrong; (1) formatting changes only the display: the stored value keeps its full precision.',
    kw: [['fixed', 'shift', 'absolute', 'lock', 'same range'], ['display', 'appearance', 'shown', 'stored', 'only']],
    need: 2,
  },
});

const DPR_CHART = coDef<ChartData>({
  task: 'DPR_CHART',
  family: 'SHEET',
  title: 'Percentages and charts from a sales worksheet',
  apps: ['sheet'],
  make: (seed) => {
    const r = labRandom(seed, 'dpr-chart');
    for (;;) {
      const sales = coShuffle(r, [90000, 95000, 100000, 105000, 110000, 120000, 125000, 135000, 140000, 150000]).slice(0, 4);
      if (new Set(sales).size === 4) return { labels: ['Jan', 'Feb', 'Mar', 'Apr'], sales };
    }
  },
  brief: () => [
    'The sales are in A1:B5. Type C1 % of total. In A6 type Total and in B6 type =SUM(B2:B5).',
    'In C2 type =B2/$B$6 and copy down to C5; format C2:C5 as Percentage with 2 decimal places.',
    'Format B2:B6 with a thousands separator.',
    'Select A1:B5: Insert a Pie chart titled "Sales January to April" with percentage labels.',
    'With the same range, Insert a Column chart with axis titles Month and Sales (N).',
    'Preview it, then save as Shop_Sales.',
  ],
  answers: (d) => {
    const t = d.sales.reduce((a, b) => a + b, 0);
    const hi = d.sales.indexOf(Math.max(...d.sales));
    return [
      { id: 'total', label: 'Total sales (₦)', value: t },
      { id: 'share', label: `${d.labels[hi]}'s share (%)`, value: roundDp((d.sales[hi]! / t) * 100, 2), tol: 0.011 },
      { id: 'angle', label: `${d.labels[hi]}'s pie-sector angle (degrees)`, value: roundDp((d.sales[hi]! / t) * 360, 1), tol: 0.06 },
    ];
  },
  start: (d, s) => setSheet(s, coSheetFrom(chartRows(d, ['Month', 'Sales (N)']))),
  checks: (d, st) => {
    const s = st.sheet;
    const inputs = col('B', 2, 5);
    return [
      ck('procedure', 'share', 'Copy =B2/$B$6 down C2:C5', copied(s, col('C', 2, 5)) && /\$B\$6/i.test(s.cells.C2?.f ?? ''), 'sheet'),
      ck('procedure', 'pct', 'Format C2:C5 as Percentage, 2 d.p.', allFmt(s, 'C2:C5', (c) => c.nf === 'PERCENT' && c.dp === 2), 'sheet', 'Multiplying by 100 as well would show 2400%.'),
      ck('procedure', 'thou', 'Format B2:B6 with a thousands separator', allFmt(s, 'B2:B6', (c) => c.nf === 'THOUSANDS' || c.nf === 'CURRENCY'), 'sheet'),
      ck('procedure', 'range', 'Chart A1:B5 without the Total row', s.charts.length >= 2 && s.charts.every((c) => coChartData(s, c).length === 4), 'sheet'),
      ck('procedure', 'save', 'Preview, then save as Shop_Sales', savedAs(s, 'Shop_Sales') && s.print.preview > 0, 'sheet'),
      ck('product', 'data', 'The sales are as given, and A6 says Total', d.sales.every((x, i) => near(coNumAt(coReader(s), `B${i + 2}`), x)) && label(s, 'A6', /total/i), 'sheet'),
      ...targets(s, [
        { id: 'total', label: 'Total in B6 by =SUM', cells: ['B6'], expect: (_, g) => inputs.reduce((t, a) => t + coNumAt(g, a), 0), fn: /SUM\(/i },
        { id: 'shares', label: 'Shares in C2:C5', cells: col('C', 2, 5), expect: (a, g) => coNumAt(g, `B${a.slice(1)}`) / inputs.reduce((t, x) => t + coNumAt(g, x), 0) },
      ], inputs),
      ck('product', 'pie', 'Pie chart with the title and percentage labels', hasChart(s, ['PIE'], 'A1:B5', /january/i, (c) => c.labels === 'PERCENT'), 'sheet'),
      ck('product', 'bar', 'Column chart with axis titles', hasChart(s, ['COLUMN', 'BAR'], 'A1:B5', /^/, (c) => /month/i.test(c.xTitle) && /sales/i.test(c.yTitle)), 'sheet'),
    ];
  },
  model: (_, st) => {
    let s = type(st.sheet, { C1: '% of total', A6: 'Total', B6: '=SUM(B2:B5)', C2: '=B2/$B$6' });
    s = coFillDown(s, 'C2:C5');
    s = coFormatCells(s, 'C2:C5', { nf: 'PERCENT', dp: 2 });
    s = coFormatCells(s, 'B2:B6', { nf: 'THOUSANDS', dp: 0 });
    s = coAddChart(s, { type: 'PIE', range: 'A1:B5', title: 'Sales January to April', xTitle: '', yTitle: '', labels: 'PERCENT' });
    s = coAddChart(s, { type: 'COLUMN', range: 'A1:B5', title: 'Sales January to April', xTitle: 'Month', yTitle: 'Sales (N)', labels: 'NONE' });
    return { ...st, sheet: { ...s, file: 'Shop_Sales.xlsx', print: { ...s.print, preview: 1 } } };
  },
  prec: { guide: 'Two correct precautions, e.g. leave the Total row out of the chart range; use $ on the total; give each chart a title and labels.', kw: PREC_SHEET.kw },
  explain: {
    q: 'Why is $B$6 used in the share formula, and why must you not multiply by 100 as well as applying the Percentage format?',
    guide: '2 marks: (1) the total must stay fixed as the formula is copied; (1) the Percentage format already multiplies the display by 100, so doing both shows 2400%.',
    kw: [['fixed', 'absolute', 'stay', 'lock', 'total'], ['twice', '100', 'already', 'percentage format', 'multiplies']],
    need: 2,
  },
});

interface FormulaData {
  rate: number;
  rate2: number;
  items: [string, number, number][];
}
const fRows = (d: FormulaData) => {
  const rows: (string | number | null)[][] = [['Discount', `${d.rate}%`], [], ['Item', 'Qty', 'Unit Price', 'Amount'], ...d.items.map((x) => [x[0], x[1], x[2]])];
  return rows;
};
const fCells = (d: FormulaData) => {
  const s = coSetCell(coSheetFrom(fRows(d)), 'B1', `${d.rate}%`);
  return originals(s);
};
const ICT_FORMULAE = coDef<FormulaData>({
  task: 'ICT_FORMULAE',
  family: 'SHEET',
  title: 'Data types, formulae and functions',
  apps: ['sheet'],
  make: (seed) => {
    const r = labRandom(seed, 'ict-formulae');
    const rate = labPick(r, [2, 4, 5, 8]);
    const items = coShuffle(r, [['Garri (paint)', 1500], ['Palm oil (litre)', 2200], ['Tomatoes (basket)', 18000], ['Onions (small bag)', 700], ['Rice (paint)', 2600], ['Beans (paint)', 2100], ['Pepper (basket)', 9000]] as [string, number][])
      .slice(0, 4)
      .map(([n, p]): [string, number, number] => [n, 1 + Math.floor(r() * 5), p]);
    return { rate, rate2: rate * 2 + 1, items };
  },
  brief: (d) => [
    `The list is keyed in: B1 is the discount (${d.rate}%), row 3 the headings, rows 4 to 7 the items.`,
    'D4 =B4*C4, copy to D7.',
    'A8 Total, D8 =SUM(D4:D7); A9 Discount, D9 =D8*$B$1; A10 Payable, D10 =D8-D9.',
    'A12 Largest, D12 =MAX(D4:D7); A13 Smallest, D13 =MIN(D4:D7); A14 Average, D14 =AVERAGE(D4:D7); A15 Count, D15 =COUNT(D4:D7).',
    'Click cells and compare the formula bar with the cell. Notice labels sit left and numbers right.',
    `Change B1 to ${d.rate2}% and watch D9 and D10 recalculate; record the new payable amount, then save as Market.xlsx.`,
  ],
  answers: (d) => {
    const amts = d.items.map((x) => x[1] * x[2]);
    const t = amts.reduce((a, b) => a + b, 0);
    return [
      { id: 'kinds', label: 'What kind of entry are A3, B1 and D4? (label, value, formula)', value: 'label, value, formula', alt: ['label value formula', 'label,value,formula'] },
      { id: 'pay', label: `Amount payable at ${d.rate}% (₦)`, value: roundDp(t * (1 - d.rate / 100), 2), tol: 0.011 },
      { id: 'pay2', label: `Amount payable at ${d.rate2}% (₦)`, value: roundDp(t * (1 - d.rate2 / 100), 2), tol: 0.011 },
      { id: 'avg', label: 'The AVERAGE of D4:D7 (₦)', value: roundDp(t / 4, 2), tol: 0.011 },
    ];
  },
  start: (d, s) => setSheet(s, coSetCell(coSheetFrom(fRows(d)), 'B1', `${d.rate}%`)),
  checks: (d, st) => {
    const s = st.sheet;
    const inputs = [...col('B', 4, 7), ...col('C', 4, 7), 'B1'];
    const sum = (g: G) => col('D', 4, 7).reduce((t, a) => t + coNumAt(g, a), 0);
    const vals = (g: G) => col('D', 4, 7).map((a) => coNumAt(g, a));
    return [
      ck('procedure', 'amount', 'D4 =B4*C4, copied to D7', copied(s, col('D', 4, 7)), 'sheet'),
      ck('procedure', 'abs', 'D9 uses the absolute $B$1', /\$B\$1/i.test(s.cells.D9?.f ?? ''), 'sheet', 'Absolute references stay fixed when copied.'),
      ck('procedure', 'labels', 'Label rows 8 to 15 in column A', ['A8', 'A9', 'A10', 'A12', 'A13', 'A14', 'A15'].every((a) => !!s.cells[a]?.f), 'sheet'),
      ck('procedure', 'save', 'Save as Market.xlsx', savedAs(s, 'Market.xlsx'), 'sheet'),
      ck('product', 'data', 'The list is as given', intact(s, fCells(d), ['B1']), 'sheet'),
      ...targets(s, [
        { id: 'amounts', label: 'Amounts in D4:D7', cells: col('D', 4, 7), expect: (a, g) => coNumAt(g, `B${a.slice(1)}`) * coNumAt(g, `C${a.slice(1)}`) },
        { id: 'total', label: 'D8 the total by =SUM', cells: ['D8'], expect: (_, g) => sum(g), fn: /SUM\(/i },
        { id: 'disc', label: 'D9 and D10, discount and payable', cells: ['D9', 'D10'], expect: (a, g) => (a === 'D9' ? sum(g) * coNumAt(g, 'B1') : sum(g) * (1 - coNumAt(g, 'B1'))) },
        { id: 'stats', label: 'D12:D15 by MAX, MIN, AVERAGE and COUNT', cells: ['D12', 'D13', 'D14', 'D15'], expect: (a, g) => (a === 'D12' ? Math.max(...vals(g)) : a === 'D13' ? Math.min(...vals(g)) : a === 'D14' ? sum(g) / 4 : 4), fn: /MAX\(|MIN\(|AVERAGE\(|COUNT\(/i },
      ], inputs),
    ];
  },
  model: (d, st) => {
    let s = type(st.sheet, { D4: '=B4*C4', A8: 'Total', D8: '=SUM(D4:D7)', A9: 'Discount', D9: '=D8*$B$1', A10: 'Payable', D10: '=D8-D9', A12: 'Largest', D12: '=MAX(D4:D7)', A13: 'Smallest', D13: '=MIN(D4:D7)', A14: 'Average', D14: '=AVERAGE(D4:D7)', A15: 'Count', D15: '=COUNT(D4:D7)' });
    s = coFillDown(s, 'D4:D7');
    s = coSetCell(s, 'B1', `${d.rate2}%`);
    return { ...st, sheet: { ...s, file: 'Market.xlsx' } };
  },
  prec: { guide: 'Two correct precautions, e.g. use $B$1 for the discount; enter numbers without the naira sign or commas and format them afterwards; begin formulas with =.', kw: [['$', 'absolute', 'dollar'], ['naira', 'comma', 'sign'], ['equal', '='], ['text', 'apostrophe'], ['save', 'saved']] },
  explain: {
    q: 'What is the difference between a label, a value and a formula, and why did D9 change when you changed B1?',
    guide: '2 marks: (1) a label is text, a value is a number that can be calculated with, a formula starts with = and calculates a result; (1) D9 refers to B1, so it recalculates automatically.',
    kw: [['text', 'label'], ['calculat', 'equal', 'formula', 'number'], ['refers', 'reference', 'automatic', 'recalculat', 'depends']],
    need: 2,
  },
});

interface PrintData {
  rows: [string, number, number, number][];
  rowsPerPage: number;
  copies: number;
  below: number;
}
const printRows = (d: PrintData) => [['Name', 'Test', 'Exam', 'Average', 'Fees (N)'], ...d.rows.map((x, i) => [x[0], x[1], x[2], `=AVERAGE(B${i + 2}:C${i + 2})`, x[3]])];
const printSheet = (d: PrintData) => coSheetFrom(printRows(d), 'A1', { rows: d.rows.length + 1, cols: 7, widths: { A: 18, E: 4 } });
const ICT_PRINT = coDef<PrintData>({
  task: 'ICT_PRINT',
  family: 'SHEET',
  title: 'Formatting and printing a worksheet',
  apps: ['sheet'],
  make: (seed) => {
    const r = labRandom(seed, 'ict-print');
    const n = 96 + Math.floor(r() * 30);
    const first = coShuffle(r, CO_FIRST);
    const rows: [string, number, number, number][] = Array.from({ length: n }, (_, i) => [`${first[i % first.length]} ${String.fromCharCode(65 + (i % 26))}.`, 25 + Math.floor(r() * 70), 25 + Math.floor(r() * 70), 45000 + 2500 * Math.floor(r() * 6)]);
    return { rows, rowsPerPage: 45, copies: 2, below: rows.filter((x) => (x[1] + x[2]) / 2 < 50).length };
  },
  brief: (d) => [
    `The score sheet of ${d.rows.length} students is open. Column E shows #####: AutoFit it.`,
    'Make the heading row bold with a fill colour, and put All Borders on the whole table.',
    'Format columns B to D to 0 decimal places, and the Fees column as Currency with 2 decimal places.',
    'Conditional formatting: Average (column D) Less Than 50 with a light red fill.',
    'Freeze the top row and scroll to check.',
    'Page Setup: Portrait, rows to repeat at top $1:$1, Fit All Columns on One Page.',
    `Preview it to read the page count (${d.rowsPerPage} students to a page), then print ${d.copies} copies.`,
  ],
  answers: (d) => {
    const pages = Math.ceil(d.rows.length / d.rowsPerPage);
    return [
      { id: 'pages', label: `Pages for ${d.rows.length} students at ${d.rowsPerPage} a page`, value: pages },
      { id: 'sheets', label: `Sheets of paper for ${d.copies} copies`, value: pages * d.copies },
      { id: 'below', label: 'How many averages are highlighted (below 50)?', value: d.below },
    ];
  },
  start: (d, s) => setSheet(s, printSheet(d)),
  checks: (d, st) => {
    const s = st.sheet;
    const last = d.rows.length + 1;
    const g = coReader(s);
    return [
      ck('procedure', 'fit', 'AutoFit column E: no more #####', !coShown(s, 'E2', g('E2')).includes('#') && coColWidth(s, 4) >= 12, 'sheet', '##### only means the column is too narrow; the number is safe.'),
      ck('procedure', 'head', 'Heading row bold with a fill colour', allFmt(s, 'A1:E1', (c) => !!c.b && !!c.fill), 'sheet'),
      ck('procedure', 'bord', 'All Borders on the table', allFmt(s, `A1:E${last}`, (c) => !!c.bd), 'sheet'),
      ck('procedure', 'freeze', 'Freeze the top row', s.freeze === 1, 'sheet', 'The headings stay in view while you scroll.'),
      ck('procedure', 'preview', 'Preview before printing', s.print.previewedFirst, 'sheet'),
      ck('procedure', 'print', `Print ${d.copies} copies`, s.print.jobs > 0 && s.print.copies === d.copies, 'sheet'),
      ck('product', 'data', 'No number was changed: formatting changes the display only', printRows(d).every((row, i) => row.every((x, c) => s.cells[`${'ABCDE'[c]}${i + 1}`]?.f === String(x))), 'sheet'),
      ck('product', 'dp', 'Scores to 0 d.p.', allFmt(s, `B2:D${last}`, (c) => c.dp === 0), 'sheet'),
      ck('product', 'fees', 'Fees as Currency, 2 d.p.', allFmt(s, `E2:E${last}`, (c) => c.nf === 'CURRENCY' && (c.dp ?? 2) === 2), 'sheet'),
      ck('product', 'cond', 'Averages below 50 highlighted by a rule', s.cond.some((c) => { const r = coParseRange(c.range); return c.op === 'LT' && c.value === 50 && !!r && r.c0 === 3 && r.c1 === 3 && r.r0 <= 1 && r.r1 >= last - 1; }), 'sheet'),
      ck('product', 'page', 'Portrait, $1:$1 repeated, fit all columns', s.print.orient === 'PORTRAIT' && coSameText(s.print.titleRows, '$1:$1') && s.print.fitWidth, 'sheet'),
    ];
  },
  model: (d, st) => {
    const last = d.rows.length + 1;
    let s = coAutoFit(st.sheet, 4);
    s = coFormatCells(s, 'A1:E1', { b: true, fill: '#dbeafe' });
    s = coFormatCells(s, `A1:E${last}`, { bd: true });
    s = coFormatCells(s, `B2:D${last}`, { dp: 0 });
    s = coFormatCells(s, `E2:E${last}`, { nf: 'CURRENCY', dp: 2 });
    s = coAutoFit(s, 4);
    s = { ...s, cond: [{ range: `D2:D${last}`, op: 'LT', value: 50, fill: '#fecaca' }], freeze: 1, print: { ...s.print, orient: 'PORTRAIT', titleRows: '$1:$1', fitWidth: true, preview: 1, previewedFirst: true, jobs: 1, copies: d.copies } };
    return { ...st, sheet: { ...s, file: 'Scores.xlsx' } };
  },
  prec: { guide: 'Two correct precautions, e.g. always preview before printing to avoid wasting paper; do not change numbers when formatting; check the page breaks.', kw: [['preview'], ['paper', 'waste'], ['format', 'display', 'change numbers'], ['title', 'repeat', 'heading'], ['save', 'saved']] },
  explain: {
    q: 'Why repeat the heading row at the top of each printed page, and what does ##### mean in a cell?',
    guide: '2 marks: (1) readers of page 2 and 3 can still see what each column means; (1) ##### means the column is too narrow to show the number: the value is unchanged.',
    kw: [['every page', 'each page', 'page 2', 'later page', 'other page', 'heading'], ['narrow', 'wide', 'width', 'widen']],
    need: 2,
  },
});

interface SurveyData {
  answers: string[];
  cats: string[];
  typoRow: number;
  typo: string;
  right: string;
}
const surveyRows = (d: SurveyData) => [['Answer'], ...d.answers.map((a) => [a])];
const DPR_SURVEY = coDef<SurveyData>({
  task: 'DPR_SURVEY',
  family: 'SHEET',
  title: 'Turning survey data into information',
  apps: ['sheet'],
  make: (seed) => {
    const r = labRandom(seed, 'dpr-survey');
    const cats = ['Walk', 'Bus', 'Motorcycle', 'Car'];
    for (;;) {
      const a = 8 + Math.floor(r() * 12);
      const b = 6 + Math.floor(r() * 10);
      const c = 3 + Math.floor(r() * 7);
      const e = 40 - a - b - c;
      if (e < 3 || new Set([a, b, c, e]).size < 4) continue;
      const answers = coShuffle(r, [...Array<string>(a).fill('Walk'), ...Array<string>(b).fill('Bus'), ...Array<string>(c).fill('Motorcycle'), ...Array<string>(e).fill('Car')]);
      const typoRow = Math.floor(r() * 40);
      const right = answers[typoRow]!;
      const typo = right === 'Walk' ? 'Wlak' : right === 'Bus' ? 'Buss' : right === 'Car' ? 'Carr' : 'Motocycle';
      return { answers: answers.map((x, i) => (i === typoRow ? typo : x)), cats, typoRow, typo, right };
    }
  },
  brief: () => [
    'Collection is done: 40 answers are in A2:A41, "How do you come to school?"',
    'Preparation: check the forms. One answer is misspelt, so it would be missed: find it and correct it.',
    'Collation: type C1 Category, D1 Count, E1 Percent, and the categories Walk, Bus, Motorcycle, Car in C2:C5. C6 Total.',
    'Processing: D2 =COUNTIF($A$2:$A$41,C2), copy to D5. D6 =SUM(D2:D5). E2 =D2/$D$6, copy to E5, format as Percentage.',
    'Output: select C1:D5 and insert a chart with a title.',
    'Storage: save as Survey.xlsx.',
    'Distribution: answer the questions for the principal in your notebook.',
  ],
  answers: (d) => {
    const fixed = d.answers.map((a, i) => (i === d.typoRow ? d.right : a));
    const counts = d.cats.map((c) => fixed.filter((a) => a === c).length);
    const hi = counts.indexOf(Math.max(...counts));
    return [
      { id: 'top', label: 'The most common way to school', value: d.cats[hi]! },
      { id: 'pct', label: `Percentage for ${d.cats[hi]} (%)`, value: roundDp((counts[hi]! / 40) * 100, 2), tol: 0.06 },
      { id: 'twoways', label: 'Percentage who walk or take a bus (%)', value: roundDp(((counts[0]! + counts[1]!) / 40) * 100, 2), tol: 0.06 },
    ];
  },
  start: (d, s) => setSheet(s, coSheetFrom(surveyRows(d), 'A1', { rows: 44, cols: 7 })),
  checks: (d, st) => {
    const s = st.sheet;
    const g = coReader(s);
    const fixedRow = `A${d.typoRow + 2}`;
    const change = (x: CoSheet): CoSheet => {
      const other = coTextAt(coReader(x), fixedRow) === 'Walk' ? 'Bus' : 'Walk';
      return { ...x, cells: { ...x.cells, [fixedRow]: { ...x.cells[fixedRow]!, f: other } } };
    };
    const count = (g2: G, cat: string) => col('A', 2, 41).filter((a) => coTextAt(g2, a).toLowerCase() === cat.toLowerCase()).length;
    return [
      ck('procedure', 'typo', `Correct the misspelt answer (the check finds "${d.typo}" has no category)`, coSameText(coTextAt(g, fixedRow), d.right), 'sheet', 'Data is checked before it is processed: garbage in, garbage out.'),
      ck('procedure', 'heads', 'Type the categories and headings in C1:E1 and C2:C6', d.cats.every((c, i) => coSameText(coTextAt(g, `C${i + 2}`), c)) && label(s, 'C6', /total/i), 'sheet'),
      ck('procedure', 'filled', 'Copy the COUNTIF and percentage formulas down', copied(s, col('D', 2, 5)) && copied(s, col('E', 2, 5)), 'sheet'),
      ck('procedure', 'fmt', 'Format E2:E5 as Percentage', allFmt(s, 'E2:E5', (c) => c.nf === 'PERCENT'), 'sheet'),
      ck('procedure', 'save', 'Save as Survey.xlsx', savedAs(s, 'Survey.xlsx'), 'sheet'),
      ...targets(s, [
        { id: 'counts', label: 'Counts by =COUNTIF', cells: col('D', 2, 5), expect: (a, g2) => count(g2, d.cats[Number(a.slice(1)) - 2]!), fn: /COUNTIF\(/i },
        { id: 'total', label: 'D6 totals 40', cells: ['D6'], expect: (_, g2) => col('D', 2, 5).reduce((t, a) => t + coNumAt(g2, a), 0) },
        { id: 'pct', label: 'Percentages in E2:E5', cells: col('E', 2, 5), expect: (a, g2) => coNumAt(g2, `D${a.slice(1)}`) / coNumAt(g2, 'D6') },
      ], [], change),
      ck('product', 'forty', 'The counts add up to 40', near(coNumAt(g, 'D6'), 40), 'sheet'),
      ck('product', 'chart', 'A bar or pie chart of C1:D5 with a title', s.charts.some((c) => coSameText(c.range, 'C1:D5') && c.title.trim().length > 2), 'sheet'),
    ];
  },
  model: (d, st) => {
    let s = type(st.sheet, { [`A${d.typoRow + 2}`]: d.right, C1: 'Category', D1: 'Count', E1: 'Percent', C2: 'Walk', C3: 'Bus', C4: 'Motorcycle', C5: 'Car', C6: 'Total', D2: '=COUNTIF($A$2:$A$41,C2)', D6: '=SUM(D2:D5)', E2: '=D2/$D$6' });
    s = coFillDown(s, 'D2:E5');
    s = coFormatCells(s, 'E2:E5', { nf: 'PERCENT', dp: 1 });
    s = coAddChart(s, { type: 'BAR', range: 'C1:D5', title: 'How students come to school', xTitle: 'Way', yTitle: 'Students', labels: 'VALUE' });
    return { ...st, sheet: { ...s, file: 'Survey.xlsx' } };
  },
  prec: { guide: 'Two correct precautions, e.g. check the forms for missing or unclear answers before keying; use formulas, not hand counts; save and back up the file; give the chart a title.', kw: [['check', 'verify', 'validate', 'missing', 'unclear', 'correct'], ['formula', 'countif'], ['save', 'backup', 'back up'], ['title', 'label']] },
  explain: {
    q: 'What is the difference between data and information, using this survey as your example?',
    guide: '2 marks: (1) data are raw, unprocessed facts: the 40 separate answers; (1) information is processed, meaningful data: the counts, percentages and chart that show a pattern and help a decision.',
    kw: [['raw', 'unprocessed', 'facts'], ['processed', 'meaning', 'useful', 'summar', 'decision', 'pattern']],
    need: 2,
  },
});

export const CO_SHEET_DEFS: CoDef[] = [CST_RESULTS, CST_VAT, CST_CHARTS, DPR_RESULTS, DPR_CHART, ICT_FORMULAE, ICT_PRINT, DPR_SURVEY];
export { coAnswerNum };
