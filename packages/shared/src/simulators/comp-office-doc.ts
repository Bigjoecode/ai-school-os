/** comp-office: the word processor's document and its operations (pure; used by the editor, the model answer and the grader). */

export type CoAlign = 'L' | 'C' | 'R' | 'J';
export interface CoPara {
  id: string;
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  size: number;
  font: string;
  align: CoAlign;
  spacing: number;
  bullet?: boolean;
}
export interface CoDocTable {
  rows: string[][];
  /** Results of the table formulas, as of the last field update (F9): "row,col" → text. */
  cache: Record<string, string>;
  headerBold: boolean;
  style: string;
  rightNums: boolean;
}
export interface CoPicture {
  /** Size of the file in pixels. */
  px: number;
  py: number;
  /** Size on the page in cm. */
  w: number;
  h: number;
  lock: boolean;
  wrap: 'INLINE' | 'SQUARE' | 'TIGHT';
}
export interface CoDocPrint {
  preview: number;
  jobs: number;
  copies: number;
  previewedFirst: boolean;
}
export interface CoDoc {
  paras: CoPara[];
  table: CoDocTable | null;
  picture: CoPicture | null;
  page: { paper: 'A4' | 'LETTER'; orient: 'PORTRAIT' | 'LANDSCAPE'; mt: number; mb: number; ml: number; mr: number };
  border: boolean;
  header: string;
  pageNumbers: boolean;
  /** Times the spelling check was run to the end, and how many Find-and-Replace changes were made. */
  spellRuns: number;
  replaced: number;
  saved: { folder: string; name: string } | null;
  /** Save As count (a later Save keeps the same file). */
  saves: number;
  open: boolean;
  reopened: number;
  print: CoDocPrint;
  merge: { started: boolean; source: string; previewed: number; letters: number; printed: boolean };
}
export const CO_FONTS = ['Calibri', 'Times New Roman', 'Arial', 'Cambria', 'Comic Sans MS'] as const;
export const CO_SIZES = [10, 11, 12, 14, 16, 18, 20, 24] as const;
export const CO_SPACINGS = [1, 1.15, 1.5, 2] as const;
export const CO_FIELD = (name: string) => `«${name}»`;

export const coEmptyDoc = (): CoDoc => ({
  paras: [],
  table: null,
  picture: null,
  page: { paper: 'A4', orient: 'PORTRAIT', mt: 2.54, mb: 2.54, ml: 2.54, mr: 2.54 },
  border: false,
  header: '',
  pageNumbers: false,
  spellRuns: 0,
  replaced: 0,
  saved: null,
  saves: 0,
  open: true,
  reopened: 0,
  print: { preview: 0, jobs: 0, copies: 1, previewedFirst: false },
  merge: { started: false, source: '', previewed: 0, letters: 0, printed: false },
});
export const coPara = (id: string, text: string, p: Partial<CoPara> = {}): CoPara => ({ id, text, size: 11, font: 'Calibri', align: 'L', spacing: 1, ...p });

export const coFormatParas = (d: CoDoc, ids: string[], patch: Partial<CoPara>): CoDoc => ({ ...d, paras: d.paras.map((p) => (ids.includes(p.id) ? { ...p, ...patch } : p)) });
export const coSetParaText = (d: CoDoc, id: string, text: string): CoDoc => ({ ...d, paras: d.paras.map((p) => (p.id === id ? { ...p, text } : p)) });
export function coAddPara(d: CoDoc, after: string | null, text = ''): CoDoc {
  const at = after ? d.paras.findIndex((p) => p.id === after) : d.paras.length - 1;
  const like = d.paras[at] ?? d.paras[d.paras.length - 1];
  const id = `p${d.paras.reduce((m, p) => Math.max(m, Number(p.id.slice(1)) || 0), 0) + 1}`;
  const paras = [...d.paras];
  paras.splice(at + 1, 0, like ? { ...like, id, text } : coPara(id, text));
  return { ...d, paras };
}
export const coDeletePara = (d: CoDoc, id: string): CoDoc => ({ ...d, paras: d.paras.filter((p) => p.id !== id) });
/** Find and Replace: every whole word, case-sensitive unless asked; returns the document and the count. */
export function coReplaceAll(d: CoDoc, find: string, rep: string, matchCase: boolean): { doc: CoDoc; count: number } {
  if (!find) return { doc: d, count: 0 };
  const re = new RegExp(`\\b${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, matchCase ? 'g' : 'gi');
  let count = 0;
  const paras = d.paras.map((p) => ({ ...p, text: p.text.replace(re, () => (count++, rep)) }));
  return { doc: { ...d, paras, replaced: d.replaced + count }, count };
}
export const coDocText = (d: CoDoc) => d.paras.map((p) => p.text).join('\n');
/** Words of the spelling list still in the document. */
export const coSpellLeft = (d: CoDoc, list: { wrong: string; right: string }[]) => list.filter((w) => new RegExp(`\\b${w.wrong}\\b`, 'i').test(coDocText(d)));
export const coCountWord = (text: string, word: string) => (text.match(new RegExp(`\\b${word}\\b`, 'g')) ?? []).length;

export const coDocSave = (d: CoDoc, folder: string, name: string): CoDoc => ({ ...d, saved: { folder, name }, saves: d.saves + 1 });
export const coDocClose = (d: CoDoc): CoDoc => (d.saved ? { ...d, open: false } : d);
export const coDocOpen = (d: CoDoc): CoDoc => (d.open ? d : { ...d, open: true, reopened: d.reopened + 1 });
export const coDocPreview = (d: CoDoc): CoDoc => ({ ...d, print: { ...d.print, preview: d.print.preview + 1 } });
export const coDocPrint = (d: CoDoc, copies: number): CoDoc => ({ ...d, print: { ...d.print, jobs: d.print.jobs + 1, copies, previewedFirst: d.print.previewedFirst || (d.print.jobs === 0 && d.print.preview > 0) } });
/** A4 is 21.0 × 29.7 cm, Letter 21.59 × 27.94. */
export function coTextWidth(d: CoDoc): number {
  const w = d.page.paper === 'A4' ? (d.page.orient === 'PORTRAIT' ? 21 : 29.7) : d.page.orient === 'PORTRAIT' ? 21.59 : 27.94;
  return w - d.page.ml - d.page.mr;
}

// ------------------------------------------------------------------ tables

export const coInsertTable = (d: CoDoc, cols: number, rows: number): CoDoc => ({ ...d, table: { rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')), cache: {}, headerBold: false, style: '', rightNums: false } });
export const coSetTableCell = (d: CoDoc, r: number, c: number, text: string): CoDoc => {
  if (!d.table) return d;
  const rows = d.table.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? text : x)) : row));
  return { ...d, table: { ...d.table, rows } };
};
export const coAddTableRow = (d: CoDoc): CoDoc => (d.table ? { ...d, table: { ...d.table, rows: [...d.table.rows, d.table.rows[0]!.map(() => '')] } } : d);
const cellNum = (t: CoDocTable, r: number, c: number, cache: Record<string, string>): number | null => {
  const raw = (t.rows[r]?.[c] ?? '').trim();
  const s = raw.startsWith('=') ? (cache[`${r},${c}`] ?? '') : raw;
  const x = Number(s.replace(/,/g, ''));
  return s !== '' && Number.isFinite(x) ? x : null;
};
/** Works out the table's formulas: =SUM(ABOVE), =SUM(LEFT), =PRODUCT(LEFT) (the F9 key). They do not update by themselves. */
export function coUpdateFields(d: CoDoc): CoDoc {
  const t = d.table;
  if (!t) return d;
  const cache: Record<string, string> = {};
  t.rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      const m = /^=\s*(SUM|PRODUCT)\s*\(\s*(ABOVE|LEFT)\s*\)\s*$/i.exec(cell.trim());
      if (!cell.trim().startsWith('=')) return;
      if (!m) {
        cache[`${r},${c}`] = '!Syntax error';
        return;
      }
      const xs: number[] = [];
      if (m[2]!.toUpperCase() === 'ABOVE') for (let i = 0; i < r; i++) xs.push(...[cellNum(t, i, c, cache)].filter((x): x is number => x !== null));
      else for (let j = 0; j < c; j++) xs.push(...[cellNum(t, r, j, cache)].filter((x): x is number => x !== null));
      const v = m[1]!.toUpperCase() === 'SUM' ? xs.reduce((a, b) => a + b, 0) : xs.reduce((a, b) => a * b, 1);
      cache[`${r},${c}`] = String(Number(v.toPrecision(12)));
    }),
  );
  return { ...d, table: { ...t, cache } };
}
/** What a table cell shows: a formula shows its last result, or nothing until updated. */
export const coTableShown = (t: CoDocTable, r: number, c: number) => {
  const raw = t.rows[r]?.[c] ?? '';
  return raw.trim().startsWith('=') ? (t.cache[`${r},${c}`] ?? '') : raw;
};
export const coTableNum = (t: CoDocTable, r: number, c: number) => Number(coTableShown(t, r, c).replace(/,/g, ''));

// ------------------------------------------------------------------ pictures

export const coInsertPicture = (d: CoDoc, px: number, py: number): CoDoc => ({ ...d, picture: { px, py, w: 15.92, h: (15.92 * py) / px, lock: true, wrap: 'INLINE' } });
/** Resizes the picture; with the aspect ratio locked the other side follows. */
export function coSizePicture(d: CoDoc, side: 'w' | 'h', cm: number): CoDoc {
  const p = d.picture;
  if (!p || !(cm > 0)) return d;
  if (!p.lock) return { ...d, picture: { ...p, [side]: cm } };
  const ratio = p.py / p.px;
  return { ...d, picture: side === 'w' ? { ...p, w: cm, h: cm * ratio } : { ...p, h: cm, w: cm / ratio } };
}

// ------------------------------------------------------------------ mail merge

/** The letter for one record, fields replaced. */
export const coMergeText = (text: string, rec: Record<string, string>) => text.replace(/«([^»]+)»/g, (all, k: string) => (k in rec ? rec[k]! : all));
export const coFieldsIn = (d: CoDoc) => [...new Set(coDocText(d).match(/«[^»]+»/g) ?? [])].map((x) => x.slice(1, -1));
