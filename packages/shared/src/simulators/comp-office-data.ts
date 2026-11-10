import { z } from 'zod';
import { coEmptyCloud, coEmptyBrowse, coEmptyDeck, coEmptyFs, coEmptyMail, CO_ANIMS, CO_TRANSITIONS, type CoBrowse, type CoCloud, type CoDeck, type CoFs, type CoMail, type CoPage } from './comp-office-apps';
import { coEmptyDb, CO_FIELD_TYPES, type CoDb } from './comp-office-db';
import { coEmptyDoc, type CoDoc } from './comp-office-doc';
import { CO_MAX_ROWS } from './comp-office-formula';
import { CO_CHART_TYPES, coEmptySheet, type CoSheet } from './comp-office-sheet';

/**
 * comp-office: the computer-room lab. Small working applications on a
 * simulated PC: a spreadsheet with a real formula engine, a word processor,
 * a database with queries, a slide editor, a file manager, and an offline
 * browser, mailbox and cloud folder. Every lesson is one task with its own
 * seeded data. Grading recomputes the work from the state.
 */

export const CO_TASKS = [
  'CST_RESULTS', 'CST_VAT', 'CST_CHARTS', 'DPR_RESULTS', 'DPR_CHART', 'ICT_FORMULAE', 'ICT_PRINT', 'DPR_SURVEY',
  'CST_NOTICE', 'CST_MERGE', 'DPR_LETTER', 'ICT_TABLE',
  'CST_DB', 'DPR_TABLE', 'DPR_REL', 'DPR_QUERY', 'DPR_FORMS',
  'CST_DECK', 'DPR_DECK', 'ICT_DECK',
  'CST_FILES', 'DPR_FILES',
  'CST_MAIL', 'ICT_MAIL', 'CST_BROWSE', 'DPR_BROWSE', 'ICT_SEARCH', 'ICT_SHARE',
] as const;
export type CoTask = (typeof CO_TASKS)[number];
export type CoFamily = 'SHEET' | 'DOC' | 'DB' | 'DECK' | 'FILES' | 'NET';
export type CoApp = 'sheet' | 'doc' | 'db' | 'deck' | 'files' | 'browser' | 'mail' | 'cloud';
export const CO_APP_LABEL: Record<CoApp, string> = { sheet: 'Spreadsheet', doc: 'Word processor', db: 'Database', deck: 'Slides', files: 'File Explorer', browser: 'Web browser', mail: 'E-mail', cloud: 'Cloud and chat' };

export const CO_PRACTICAL_TASKS: Record<string, CoTask> = {
  'pr-cst-spreadsheet-result-sheet': 'CST_RESULTS',
  'pr-cst-spreadsheet-absolute-reference-vat': 'CST_VAT',
  'pr-cst-spreadsheet-charts': 'CST_CHARTS',
  'pr-dpr-spreadsheet-results': 'DPR_RESULTS',
  'pr-dpr-spreadsheet-chart': 'DPR_CHART',
  'pr-ict-spreadsheet-formulae': 'ICT_FORMULAE',
  'pr-ict-spreadsheet-format-print': 'ICT_PRINT',
  'pr-dpr-information-processing-survey': 'DPR_SURVEY',
  'pr-cst-word-processing-format-document': 'CST_NOTICE',
  'pr-cst-mail-merge': 'CST_MERGE',
  'pr-dpr-word-processing-document': 'DPR_LETTER',
  'pr-ict-word-tables-graphics': 'ICT_TABLE',
  'pr-cst-database-create-and-query': 'CST_DB',
  'pr-dpr-dbms-create-table': 'DPR_TABLE',
  'pr-dpr-relational-relationships': 'DPR_REL',
  'pr-dpr-relational-queries': 'DPR_QUERY',
  'pr-dpr-relational-forms-reports': 'DPR_FORMS',
  'pr-cst-powerpoint-slide-show': 'CST_DECK',
  'pr-dpr-presentation-slides': 'DPR_DECK',
  'pr-ict-presentation-master-slides': 'ICT_DECK',
  'pr-cst-file-handling-and-backup': 'CST_FILES',
  'pr-dpr-os-file-management': 'DPR_FILES',
  'pr-cst-email-send-receive': 'CST_MAIL',
  'pr-ict-email-attachments': 'ICT_MAIL',
  'pr-cst-internet-browsing-and-search': 'CST_BROWSE',
  'pr-dpr-internet-browsing-search': 'DPR_BROWSE',
  'pr-ict-internet-search-engines': 'ICT_SEARCH',
  'pr-ict-download-upload-social-media': 'ICT_SHARE',
};

export interface CompOfficeState {
  v: 1;
  task: CoTask | null;
  sheet: CoSheet;
  doc: CoDoc;
  db: CoDb;
  deck: CoDeck;
  fs: CoFs;
  web: CoBrowse;
  mail: CoMail;
  cloud: CoCloud;
  /** The notebook's answer boxes. */
  answers: Record<string, string>;
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}
export const emptyCompOfficeState = (): CompOfficeState => ({
  v: 1,
  task: null,
  sheet: coEmptySheet(),
  doc: coEmptyDoc(),
  db: coEmptyDb(),
  deck: coEmptyDeck(),
  fs: coEmptyFs(),
  web: coEmptyBrowse(),
  mail: coEmptyMail(),
  cloud: coEmptyCloud(),
  answers: {},
  written: { precautions: '', explain: '' },
  log: [],
});

// ------------------------------------------------------------------ schema

const k = z.string().max(60);
const t80 = z.string().max(80);
const t200 = z.string().max(200);
const t2k = z.string().max(2000);
const n = z.number().finite();
const int = z.number().int().min(0).max(1_000_000);
const capped = <T extends z.ZodTypeAny>(s: T, max: number) => s.refine((o) => Object.keys(o as object).length <= max, 'too many entries');
const strs = (max: number, len = 200) => z.array(z.string().max(len)).max(max);
const printS = z.object({ preview: int, copies: int, orient: z.enum(['PORTRAIT', 'LANDSCAPE']), fitWidth: z.boolean(), titleRows: t80, gridlines: z.boolean(), jobs: int, previewedFirst: z.boolean() });
const cellS = z.object({
  f: z.string().max(300),
  b: z.boolean().optional(),
  nf: z.enum(['GENERAL', 'NUMBER', 'CURRENCY', 'PERCENT', 'THOUSANDS']).optional(),
  dp: z.number().int().min(0).max(10).optional(),
  bd: z.boolean().optional(),
  fill: t80.optional(),
  al: z.enum(['L', 'C', 'R']).optional(),
});
const sheetS = z.object({
  cells: capped(z.record(k, cellS), 2200),
  widths: capped(z.record(k, z.number().min(1).max(60)), 30),
  rows: z.number().int().min(1).max(CO_MAX_ROWS + 10),
  cols: z.number().int().min(1).max(26),
  charts: z.array(z.object({ type: z.enum(CO_CHART_TYPES), range: t80, title: t200, xTitle: t200, yTitle: t200, labels: z.enum(['NONE', 'VALUE', 'PERCENT']) })).max(6),
  cond: z.array(z.object({ range: t80, op: z.enum(['LT', 'GT']), value: n, fill: t80 })).max(6),
  freeze: z.number().int().min(0).max(CO_MAX_ROWS),
  print: printS,
  file: t200,
});
const paraS = z.object({ id: t80, text: t2k, b: z.boolean().optional(), i: z.boolean().optional(), u: z.boolean().optional(), size: z.number().min(4).max(96), font: t80, align: z.enum(['L', 'C', 'R', 'J']), spacing: z.number().min(0.5).max(4), bullet: z.boolean().optional() });
const docS = z.object({
  paras: z.array(paraS).max(60),
  table: z.object({ rows: z.array(z.array(t200).max(8)).max(14), cache: capped(z.record(k, t80), 120), headerBold: z.boolean(), style: t80, rightNums: z.boolean() }).nullable(),
  picture: z.object({ px: n, py: n, w: n, h: n, lock: z.boolean(), wrap: z.enum(['INLINE', 'SQUARE', 'TIGHT']) }).nullable(),
  page: z.object({ paper: z.enum(['A4', 'LETTER']), orient: z.enum(['PORTRAIT', 'LANDSCAPE']), mt: n, mb: n, ml: n, mr: n }),
  border: z.boolean(),
  header: t200,
  pageNumbers: z.boolean(),
  spellRuns: int,
  replaced: int,
  saved: z.object({ folder: t200, name: t200 }).nullable(),
  saves: int,
  open: z.boolean(),
  reopened: int,
  print: z.object({ preview: int, jobs: int, copies: int, previewedFirst: z.boolean() }),
  merge: z.object({ started: z.boolean(), source: t200, previewed: int, letters: int, printed: z.boolean() }),
});
const fieldS = z.object({ name: t80, type: z.enum(CO_FIELD_TYPES), size: z.number().int().min(0).max(255), pk: z.boolean(), rule: t200 });
const qcolS = z.object({ field: t200, show: z.boolean(), sort: z.enum(['NONE', 'ASC', 'DESC']), crit: t200, or: t200, total: z.enum(['GROUP', 'SUM', 'AVG', 'COUNT', 'MAX', 'MIN', 'EXPR']) });
const dbS = z.object({
  file: t200,
  tables: z.array(z.object({ name: t80, fields: z.array(fieldS).max(16), rows: z.array(capped(z.record(k, t200), 16)).max(60), sort: z.object({ field: t80, asc: z.boolean() }).nullable() })).max(6),
  relations: z.array(z.object({ one: t80, many: t80, field: t80, enforce: z.boolean() })).max(6),
  queries: z.array(z.object({ name: t80, tables: strs(4, 80), cols: z.array(qcolS).max(12), totals: z.boolean(), runs: int })).max(10),
  forms: z.array(z.object({ name: t80, table: t80, fields: strs(16, 80), layout: z.enum(['COLUMNAR', 'TABULAR']), title: t200, added: int, deleted: int })).max(6),
  reports: z.array(z.object({ name: t80, source: t80, fields: strs(16, 80), group: t80, sort: t80, sum: z.boolean(), avg: z.boolean(), layout: z.enum(['STEPPED', 'BLOCK']), orient: z.enum(['PORTRAIT', 'LANDSCAPE']), previews: int })).max(6),
  refused: strs(8, 20),
  sql: strs(10, 500),
  sqlViews: int,
  found: strs(10, 80),
  closed: z.boolean(),
  reopened: int,
});
const slideS = z.object({ id: t80, layout: z.enum(['TITLE', 'CONTENT']), title: t200, body: t2k, pic: z.boolean(), chart: z.boolean(), table: z.boolean(), shape: z.boolean(), anim: z.enum(CO_ANIMS), transition: z.enum(CO_TRANSITIONS), advance: z.number().min(0).max(3600) });
const deckS = z.object({
  slides: z.array(slideS).max(30),
  theme: t80,
  master: z.object({ titleFont: t80, titleColor: t80, logo: z.boolean(), footer: t200, used: z.boolean() }),
  saved: t200,
  closed: z.boolean(),
  reopened: int,
  shows: int,
  shownSlides: int,
  escaped: z.boolean(),
  fromStart: z.boolean(),
  handouts: z.object({ perPage: int, pages: int, jobs: int }),
});
const fsS = z.object({
  nodes: z.array(z.object({ id: t80, name: t200, parent: t80.nullable(), kind: z.enum(['DRIVE', 'FOLDER', 'FILE']), size: n, bin: t80.optional() })).max(120),
  next: int,
  clip: z.object({ ids: strs(40, 80), cut: z.boolean() }).nullable(),
  flash: z.enum(['OUT', 'IN', 'EJECTED']),
  view: z.enum(['ICONS', 'DETAILS']),
  cmds: strs(20, 200),
  props: strs(20, 80),
  scanned: strs(20, 200),
  did: strs(10, 20),
  permanentlyDeleted: strs(20, 200),
});
const webS = z.object({
  history: strs(120),
  opened: strs(120),
  newTabs: strs(40),
  searches: z.array(z.object({ q: t200, n: int })).max(40),
  bookmarks: strs(20),
  historyViewed: z.boolean(),
  downloads: z.array(z.object({ name: t200, mb: n, from: t200, scanned: z.boolean() })).max(20),
  risky: strs(20),
  cleared: z.boolean(),
  parts: capped(z.record(k, t80), 12),
  judged: capped(z.record(t200, z.boolean()), 20),
  quote: z.object({ text: t2k, url: t200 }),
});
const fileS = z.object({ name: t200, mb: n });
const msgS = z.object({
  id: t80,
  from: t200,
  to: strs(10),
  cc: strs(10),
  bcc: strs(10),
  subject: t200,
  body: t2k,
  files: z.array(fileS).max(10),
  kind: z.enum(['NEW', 'REPLY', 'REPLY_ALL', 'FORWARD']),
  read: z.boolean().optional(),
  scam: z.boolean().optional(),
  label: t80.optional(),
});
const mailS = z.object({
  account: z.object({ name: t200, user: t200, strong: z.boolean(), recovery: t80, created: z.boolean() }),
  signedIn: z.boolean(),
  signedOut: z.boolean(),
  inbox: z.array(msgS).max(20),
  sent: z.array(msgS).max(20),
  drafts: z.array(msgS).max(10),
  spam: strs(10, 80),
  contacts: z.array(z.object({ name: t200, email: t200 })).max(20),
  labels: strs(10, 80),
  refused: int,
  fetched: strs(10),
  files: z.array(fileS).max(12),
});
const cloudS = z.object({
  speed: z.object({ down: n, up: n, tests: int }),
  uploads: strs(10),
  shares: z.array(z.object({ file: t200, to: t200, perm: z.enum(['VIEW', 'EDIT']) })).max(10),
  fetched: strs(10),
  privacy: capped(z.record(k, z.enum(['EVERYONE', 'CONTACTS', 'NOBODY'])), 8),
  chat: t2k,
});
export const compOfficeStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(CO_TASKS).nullable(),
  sheet: sheetS,
  doc: docS,
  db: dbS,
  deck: deckS,
  fs: fsS,
  web: webS,
  mail: mailS,
  cloud: cloudS,
  answers: capped(z.record(k, z.string().max(200)), 16),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(800),
}) satisfies z.ZodType<CompOfficeState>;

// ------------------------------------------------------------------ task definitions

export type CoCrit = 'procedure' | 'product' | 'calculation';
export interface CoCheck {
  id: string;
  crit: CoCrit;
  /** Said in the feedback and in the guide. */
  label: string;
  done: boolean;
  /** The app the step happens in. */
  app?: CoApp;
  /** The reason (for the guide). */
  why?: string;
}
export interface CoAnswer {
  id: string;
  label: string;
  unit?: string;
  /** A number (marked within `tol`) or text (marked ignoring case and spaces). */
  value: number | string;
  tol?: number;
  /** Also accepted (text answers). */
  alt?: string[];
}
export interface CoVariant<D = unknown> {
  seed: number;
  task: CoTask;
  family: CoFamily;
  title: string;
  apps: CoApp[];
  /** The task card's steps, with this attempt's data. */
  brief: string[];
  answers: CoAnswer[];
  /** Records the database's "paste from the task card" and the mail merge use. */
  records?: { table: string; head: string[]; rows: string[][] }[];
  /** Words the spelling check knows are wrong. */
  spell?: { wrong: string; right: string }[];
  /** Slides to paste from the outline. */
  outline?: { title: string; body: string }[];
  /** The offline web for this attempt. */
  pages?: CoPage[];
  mailInfo?: unknown;
  cloudInfo?: unknown;
  data: D;
}
export interface CoDef<D = unknown> {
  task: CoTask;
  family: CoFamily;
  title: string;
  apps: CoApp[];
  make: (seed: number) => D;
  brief: (d: D) => string[];
  answers: (d: D) => CoAnswer[];
  start: (d: D, s: CompOfficeState, v: CoVariant<D>) => CompOfficeState;
  checks: (d: D, s: CompOfficeState, v: CoVariant<D>) => CoCheck[];
  model: (d: D, s: CompOfficeState, v: CoVariant<D>) => CompOfficeState;
  extra?: (d: D) => Partial<CoVariant<D>>;
  prec: { guide: string; kw: string[][] };
  explain: { q: string; guide: string; kw: string[][]; need: number };
}
/** Keeps a definition's data type inside it. */
export const coDef = <D>(d: CoDef<D>): CoDef<unknown> => d as unknown as CoDef<unknown>;
export const ck = (crit: CoCrit, id: string, label: string, done: boolean, app?: CoApp, why?: string): CoCheck => ({ id, crit, label, done, app, why });

export const coSameText = (a: string, b: string) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();
/** Numbers as students write them: spaces, commas, units and currency signs don't matter. */
export function coAnswerNum(raw: string): number | null {
  const s = raw.trim().replace(/[₦,\s]/g, '').replace(/^n(?=\d)/i, '').replace(/(%|percent|kb|mb|gb|cm|s|sec|secs|seconds|min|mins|minutes|bytes|pages?|sheets?|degrees?|°|deg|naira)+\.?$/i, '');
  if (!s) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}
export function coAnswerRight(a: CoAnswer, raw: string | undefined): boolean {
  const s = (raw ?? '').trim();
  if (!s) return false;
  if (typeof a.value === 'number') {
    const x = coAnswerNum(s);
    return x !== null && Math.abs(x - a.value) <= (a.tol ?? 0.01) + 1e-9;
  }
  return [a.value, ...(a.alt ?? [])].some((w) => coSameText(w, s));
}
export const coShuffle = <T>(r: () => number, xs: readonly T[]): T[] => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};
export const CO_FIRST = ['Ngozi', 'Tunde', 'Hauwa', 'Emeka', 'Zainab', 'Amaka', 'Babatunde', 'Chinedu', 'Fatima', 'Ibrahim', 'Aisha', 'Kunle', 'Blessing', 'Musa', 'Ifeoma', 'Yusuf', 'Bisi', 'Obinna', 'Halima', 'Efe', 'Sade', 'Danjuma', 'Chioma', 'Femi', 'Rukayat', 'Uche', 'Tolu', 'Grace', 'Sani', 'Nneka'] as const;
export const CO_SURNAME = ['Bello', 'Okon', 'Adeyemi', 'Nwosu', 'Garba', 'Eze', 'Usman', 'Ojo', 'Okafor', 'Etim', 'Danladi', 'Balogun', 'Ibekwe', 'Lawal', 'Mohammed', 'Obi', 'Olayinka', 'Sule', 'Yakubu', 'Akpan', 'Bassey', 'Chukwu', 'Idowu', 'Onyeka'] as const;
