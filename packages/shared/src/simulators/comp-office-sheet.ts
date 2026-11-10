import { CoCalc, coAddr, coColName, coDisplay, coEvalAll, coIsErr, coLiteral, coParseRange, coRangeAddrs, coShiftFormula, type CoNumFmt, type CoVal } from './comp-office-formula';

/** comp-office: a workbook (one sheet) and the operations the grid performs on it; pure, so the grader and the model answer use the same ones. */

export interface CoCell {
  /** What was typed: a value or a formula. */
  f: string;
  b?: boolean;
  nf?: CoNumFmt;
  dp?: number;
  bd?: boolean;
  fill?: string;
  al?: 'L' | 'C' | 'R';
}
export const CO_CHART_TYPES = ['PIE', 'COLUMN', 'BAR', 'LINE'] as const;
export type CoChartType = (typeof CO_CHART_TYPES)[number];
export interface CoChart {
  type: CoChartType;
  range: string;
  title: string;
  xTitle: string;
  yTitle: string;
  labels: 'NONE' | 'VALUE' | 'PERCENT';
}
export interface CoCond {
  range: string;
  op: 'LT' | 'GT';
  value: number;
  fill: string;
}
export interface CoPrint {
  /** Times the print preview was opened. */
  preview: number;
  copies: number;
  orient: 'PORTRAIT' | 'LANDSCAPE';
  fitWidth: boolean;
  titleRows: string;
  gridlines: boolean;
  /** Print jobs sent; `previewedFirst`: the first was sent after a preview. */
  jobs: number;
  previewedFirst: boolean;
}
export interface CoSheet {
  cells: Record<string, CoCell>;
  /** Column widths in characters (default 10). */
  widths: Record<string, number>;
  rows: number;
  cols: number;
  charts: CoChart[];
  cond: CoCond[];
  freeze: number;
  print: CoPrint;
  file: string;
}
export const CO_DEFAULT_WIDTH = 10;
export const coEmptyPrint = (): CoPrint => ({ preview: 0, copies: 1, orient: 'PORTRAIT', fitWidth: false, titleRows: '', gridlines: false, jobs: 0, previewedFirst: false });
export const coEmptySheet = (): CoSheet => ({ cells: {}, widths: {}, rows: 24, cols: 10, charts: [], cond: [], freeze: 0, print: coEmptyPrint(), file: '' });

export function coSheetFrom(rows: (string | number | null)[][], at = 'A1', extra: Partial<CoSheet> = {}): CoSheet {
  const g = coParseRange(at)!;
  const cells: Record<string, CoCell> = {};
  rows.forEach((row, r) =>
    row.forEach((x, c) => {
      if (x !== null && x !== '') cells[coAddr(g.c0 + c, g.r0 + r)] = { f: String(x) };
    }),
  );
  return { ...coEmptySheet(), cells, ...extra };
}

export const coSetCell = (s: CoSheet, addr: string, f: string): CoSheet => {
  const cur = s.cells[addr];
  const next: CoCell = { ...cur, f };
  // Typing 7.5% gives the cell a percentage format, as a spreadsheet does.
  if (!cur?.nf && /^\s*[+-]?[\d.]+%\s*$/.test(f)) {
    next.nf = 'PERCENT';
    if (f.includes('.')) next.dp = (f.split('.')[1] ?? '').replace(/[^0-9]/g, '').length;
  }
  const cells = { ...s.cells };
  if (!f && !cur?.b && !cur?.bd && !cur?.fill && !cur?.nf) delete cells[addr];
  else cells[addr] = next;
  return { ...s, cells };
};
export const coFormatCells = (s: CoSheet, range: string, patch: Partial<CoCell>): CoSheet => {
  const cells = { ...s.cells };
  for (const a of coRangeAddrs(range)) cells[a] = { ...(cells[a] ?? { f: '' }), ...patch };
  return { ...s, cells };
};
/** Copies a cell to another, formula adjusted, with its format. */
function copyCell(cells: Record<string, CoCell>, from: string, to: string, dc: number, dr: number) {
  const src = cells[from];
  if (!src) delete cells[to];
  else cells[to] = { ...src, f: coShiftFormula(src.f, dc, dr) };
}
/** The top row of the range is copied down through it (the fill handle, Ctrl+D). */
export function coFillDown(s: CoSheet, range: string): CoSheet {
  const g = coParseRange(range);
  if (!g) return s;
  const cells = { ...s.cells };
  for (let c = g.c0; c <= g.c1; c++) for (let r = g.r0 + 1; r <= g.r1; r++) copyCell(cells, coAddr(c, g.r0), coAddr(c, r), 0, r - g.r0);
  return { ...s, cells };
}
export function coFillRight(s: CoSheet, range: string): CoSheet {
  const g = coParseRange(range);
  if (!g) return s;
  const cells = { ...s.cells };
  for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0 + 1; c <= g.c1; c++) copyCell(cells, coAddr(g.c0, r), coAddr(c, r), c - g.c0, 0);
  return { ...s, cells };
}
/** Copies a block to a new top-left cell (Ctrl+C, Ctrl+V). */
export function coPaste(s: CoSheet, from: string, to: string): CoSheet {
  const g = coParseRange(from);
  const t = coParseRange(to);
  if (!g || !t) return s;
  const dc = t.c0 - g.c0;
  const dr = t.r0 - g.r0;
  const cells = { ...s.cells };
  for (const a of coRangeAddrs(from)) {
    const p = coParseRange(a)!;
    const cell = s.cells[a];
    const to2 = coAddr(p.c0 + dc, p.r0 + dr);
    if (cell) cells[to2] = { ...cell, f: coShiftFormula(cell.f, dc, dr) };
    else delete cells[to2];
  }
  return { ...s, cells };
}
export function coClear(s: CoSheet, range: string): CoSheet {
  const cells = { ...s.cells };
  for (const a of coRangeAddrs(range)) delete cells[a];
  return { ...s, cells };
}
/** Sorts whole rows of the range by one column; formulas move with their row. */
export function coSortRange(s: CoSheet, range: string, col: number, asc: boolean): CoSheet {
  const g = coParseRange(range);
  if (!g) return s;
  const vals = coEvalAll(s.cells);
  const rows = Array.from({ length: g.r1 - g.r0 + 1 }, (_, i) => g.r0 + i);
  const key = (r: number) => vals[coAddr(col, r)] ?? null;
  const rank = (v: CoVal) => (v === null ? 3 : typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
  rows.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === null || y === null || rank(x) !== rank(y)) return rank(x) - rank(y);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { sensitivity: 'base' });
    return (asc ? c : -c) || a - b;
  });
  const cells = { ...s.cells };
  rows.forEach((from, i) => {
    const to = g.r0 + i;
    for (let c = g.c0; c <= g.c1; c++) {
      const src = s.cells[coAddr(c, from)];
      if (src) cells[coAddr(c, to)] = { ...src, f: coShiftFormula(src.f, 0, to - from) };
      else delete cells[coAddr(c, to)];
    }
  });
  return { ...s, cells };
}
/** Deletes a row; everything below moves up. */
export function coDeleteRow(s: CoSheet, row: number): CoSheet {
  const cells: Record<string, CoCell> = {};
  for (const [a, cell] of Object.entries(s.cells)) {
    const g = coParseRange(a)!;
    if (g.r0 === row) continue;
    const r = g.r0 > row ? g.r0 - 1 : g.r0;
    cells[coAddr(g.c0, r)] = cell;
  }
  return { ...s, cells, rows: Math.max(1, s.rows - 1) };
}
export function coAutoFit(s: CoSheet, col: number): CoSheet {
  const vals = coEvalAll(s.cells);
  let w = 6;
  for (let r = 0; r < s.rows; r++) {
    const a = coAddr(col, r);
    w = Math.max(w, coDisplay(vals[a] ?? null, s.cells[a]).length + 2);
  }
  return { ...s, widths: { ...s.widths, [coColName(col)]: Math.min(40, w) } };
}
export const coColWidth = (s: CoSheet, col: number) => s.widths[coColName(col)] ?? CO_DEFAULT_WIDTH;
/** Numbers wider than their column show #####, as in a real spreadsheet. */
export function coShown(s: CoSheet, addr: string, v: CoVal): string {
  const text = coDisplay(v, s.cells[addr]);
  const g = coParseRange(addr);
  const w = g ? coColWidth(s, g.c0) : 99;
  if (typeof v === 'number' && g && text.length > w) {
    // As in a real spreadsheet, a General number with decimals is rounded to fit the column; only a fixed format shows #####.
    const c = s.cells[addr];
    if (!c?.nf && c?.dp === undefined && !Number.isInteger(v)) {
      for (let k = 9; k >= 0; k--) {
        const short = String(Number(v.toFixed(k)));
        if (short.length <= w) return short;
      }
    }
    return '#'.repeat(Math.max(3, w));
  }
  return text;
}
export const coCondHit = (s: CoSheet, addr: string, v: CoVal) => (typeof v === 'number' ? s.cond.find((c) => coRangeAddrs(c.range).includes(addr) && (c.op === 'LT' ? v < c.value : v > c.value)) : undefined);

export const coAddChart = (s: CoSheet, c: CoChart): CoSheet => ({ ...s, charts: [...s.charts, c].slice(-6) });
/** What a chart plots: labels from the first column of its range, values from the last; a heading row is left out. */
export function coChartData(s: CoSheet, c: CoChart): { label: string; value: number }[] {
  const g = coParseRange(c.range);
  if (!g) return [];
  const vals = coEvalAll(s.cells);
  const out: { label: string; value: number }[] = [];
  for (let r = g.r0; r <= g.r1; r++) {
    const value = vals[coAddr(g.c1, r)];
    if (typeof value !== 'number') continue;
    out.push({ label: g.c1 > g.c0 ? coDisplay(vals[coAddr(g.c0, r)] ?? null) : `Point ${r - g.r0 + 1}`, value });
  }
  return out;
}

/** Reads values from a sheet, for the checks. */
export const coReader = (s: CoSheet) => {
  const calc = new CoCalc((a) => s.cells[a]?.f);
  return (a: string) => calc.value(a);
};
export const coNumAt = (get: (a: string) => CoVal, a: string): number => {
  const v = get(a);
  if (typeof v === 'number') return v;
  const lit = typeof v === 'string' ? coLiteral(v) : null;
  return typeof lit === 'number' ? lit : NaN;
};
export const coTextAt = (get: (a: string) => CoVal, a: string): string => {
  const v = get(a);
  return v === null || coIsErr(v) ? '' : String(v);
};
