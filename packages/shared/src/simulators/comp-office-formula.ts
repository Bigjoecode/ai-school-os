/**
 * comp-office: the spreadsheet engine, shared by the web grid and the API
 * grader. A real (small) formula language: references ($ anchors), ranges,
 * arithmetic, comparison, text join, percent, and the functions the WAEC
 * syllabus uses. The formula text is what is stored; values are recomputed.
 */

export interface CoErr {
  e: string;
}
export type CoVal = number | string | boolean | null | CoErr;
export const coIsErr = (v: unknown): v is CoErr => typeof v === 'object' && v !== null && 'e' in v;

export const CO_MAX_COLS = 12;
export const CO_MAX_ROWS = 140;
const MAX_RANGE = 5000;

export function coColName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export function coColIndex(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export const coAddr = (c: number, r: number) => `${coColName(c)}${r + 1}`;
const ADDR = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})$/;
export function coParseAddr(a: string): { c: number; r: number } | null {
  const m = ADDR.exec(a.trim());
  if (!m) return null;
  return { c: coColIndex(m[1]!), r: Number(m[2]) - 1 };
}
/** "A1:B6" → the corners, normalised; a single cell is a one-cell range. Null if it isn't a range. */
export function coParseRange(s: string): { c0: number; r0: number; c1: number; r1: number } | null {
  const [a, b] = s.split(':');
  const p = coParseAddr(a ?? '');
  const q = coParseAddr(b ?? a ?? '');
  if (!p || !q || p.r < 0 || q.r < 0) return null;
  return { c0: Math.min(p.c, q.c), r0: Math.min(p.r, q.r), c1: Math.max(p.c, q.c), r1: Math.max(p.r, q.r) };
}
export function coRangeAddrs(s: string): string[] {
  const g = coParseRange(s);
  if (!g) return [];
  const out: string[] = [];
  if ((g.c1 - g.c0 + 1) * (g.r1 - g.r0 + 1) > MAX_RANGE) return out;
  for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) out.push(coAddr(c, r));
  return out;
}

// ------------------------------------------------------------------ literals

/** What a typed entry is: a number, percentage, true/false or text. */
export function coLiteral(raw: string): CoVal {
  const s = raw.trim();
  if (!s) return null;
  if (raw.startsWith("'")) return raw.slice(1);
  const pct = /^([+-]?(\d+\.?\d*|\.\d+))%$/.exec(s);
  if (pct) return Number(pct[1]) / 100;
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number(s);
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''));
  if (/^true$/i.test(s)) return true;
  if (/^false$/i.test(s)) return false;
  return raw;
}

// ------------------------------------------------------------------ tokens and parser

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'ref'; v: string } | { t: 'name'; v: string } | { t: 'op'; v: string };
class ParseFail extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === ' ') {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let s = '';
      for (;;) {
        if (j >= src.length) throw new ParseFail();
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    const rest = src.slice(i);
    const ref = /^\$?[A-Za-z]{1,3}\$?\d+(?![A-Za-z0-9_(])/.exec(rest);
    if (ref) {
      out.push({ t: 'ref', v: ref[0].toUpperCase() });
      i += ref[0].length;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest);
    if (num) {
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
    if (name) {
      out.push({ t: 'name', v: name[0].toUpperCase() });
      i += name[0].length;
      continue;
    }
    const op = /^(<=|>=|<>|[-+*/^&=<>%(),:;])/.exec(rest);
    if (!op) throw new ParseFail();
    out.push({ t: 'op', v: op[0] === ';' ? ',' : op[0] });
    i += op[0].length;
  }
  return out;
}

type Node =
  | { k: 'lit'; v: CoVal }
  | { k: 'ref'; a: string }
  | { k: 'range'; a: string; b: string }
  | { k: 'un'; op: string; x: Node }
  | { k: 'pct'; x: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'fn'; name: string; args: Node[] };

function parse(toks: Tok[]): Node {
  let p = 0;
  let depth = 0;
  const isOp = (v: string) => {
    const t = toks[p];
    return !!t && t.t === 'op' && t.v === v;
  };
  const take = (v: string) => (isOp(v) ? (p++, true) : false);
  const need = (v: string) => {
    if (!take(v)) throw new ParseFail();
  };
  const level = (ops: string[], next: () => Node) => (): Node => {
    let l = next();
    for (;;) {
      const t = toks[p];
      if (t?.t === 'op' && ops.includes(t.v)) {
        p++;
        l = { k: 'bin', op: t.v, l, r: next() };
      } else return l;
    }
  };
  const primary = (): Node => {
    if (++depth > 60) throw new ParseFail();
    try {
      const t = toks[p];
      if (!t) throw new ParseFail();
      p++;
      if (t.t === 'num') return { k: 'lit', v: t.v };
      if (t.t === 'str') return { k: 'lit', v: t.v };
      if (t.t === 'ref') {
        if (take(':')) {
          const b = toks[p];
          if (b?.t !== 'ref') throw new ParseFail();
          p++;
          return { k: 'range', a: t.v, b: b.v };
        }
        return { k: 'ref', a: t.v };
      }
      if (t.t === 'name') {
        if (take('(')) {
          const args: Node[] = [];
          if (!take(')')) {
            do args.push(cmp());
            while (take(','));
            need(')');
          }
          return { k: 'fn', name: t.v, args };
        }
        if (t.v === 'TRUE') return { k: 'lit', v: true };
        if (t.v === 'FALSE') return { k: 'lit', v: false };
        return { k: 'lit', v: { e: '#NAME?' } };
      }
      if (t.v === '(') {
        const x = cmp();
        need(')');
        return x;
      }
      if (t.v === '-' || t.v === '+') return { k: 'un', op: t.v, x: post() };
      throw new ParseFail();
    } finally {
      depth--;
    }
  };
  const post = (): Node => {
    let x = primary();
    while (take('%')) x = { k: 'pct', x };
    return x;
  };
  const pow = level(['^'], post);
  const mul = level(['*', '/'], pow);
  const add = level(['+', '-'], mul);
  const join = level(['&'], add);
  const cmp = level(['=', '<>', '<', '>', '<=', '>='], join);
  const root = cmp();
  if (p !== toks.length) throw new ParseFail();
  return root;
}

// ------------------------------------------------------------------ evaluation

const E = (e: string): CoErr => ({ e });
const DIV0 = E('#DIV/0!');
const VALUE = E('#VALUE!');
const NAME = E('#NAME?');
const REF = E('#REF!');
const NA = E('#N/A');
const NUM = E('#NUM!');
const PARSE = E('#ERROR!');
const CIRC = E('#CIRC!');

function toNum(v: CoVal): number | CoErr {
  if (coIsErr(v)) return v;
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const lit = coLiteral(v);
  return typeof lit === 'number' ? lit : VALUE;
}
const toText = (v: CoVal): string | CoErr => (coIsErr(v) ? v : v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(typeof v === 'number' ? Number(v.toPrecision(15)) : v));
function compare(a: CoVal, b: CoVal): number {
  const rank = (v: CoVal) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
  const x = a === null ? (typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0) : a;
  const y = b === null ? (typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0) : b;
  if (rank(x as CoVal) !== rank(y as CoVal)) return rank(x as CoVal) - rank(y as CoVal);
  if (typeof x === 'string') {
    const p = x.toLowerCase();
    const q = String(y).toLowerCase();
    return p < q ? -1 : p > q ? 1 : 0;
  }
  const p = Number(x);
  const q = Number(y);
  return Math.abs(p - q) < 1e-12 ? 0 : p < q ? -1 : 1;
}

/** Evaluates cells on demand. `raw` gives what was typed at an address. */
export class CoCalc {
  private memo = new Map<string, CoVal>();
  private busy = new Set<string>();
  private trees = new Map<string, Node | null>();
  constructor(private raw: (addr: string) => string | undefined) {}

  value(addr: string): CoVal {
    const a = addr.replace(/\$/g, '').toUpperCase();
    if (this.memo.has(a)) return this.memo.get(a)!;
    const src = this.raw(a);
    if (src === undefined || src === '') return null;
    if (!src.startsWith('=') || src.length === 1) {
      const v = coLiteral(src);
      this.memo.set(a, v);
      return v;
    }
    if (this.busy.has(a)) return CIRC;
    this.busy.add(a);
    let v: CoVal;
    try {
      let tree = this.trees.get(src);
      if (tree === undefined) {
        try {
          tree = parse(tokenize(src.slice(1)));
        } catch {
          tree = null;
        }
        this.trees.set(src, tree);
      }
      v = tree ? this.ev(tree) : PARSE;
      if (typeof v === 'number' && !Number.isFinite(v)) v = NUM;
    } finally {
      this.busy.delete(a);
    }
    this.memo.set(a, v);
    return v;
  }

  private cells(n: Node): CoVal[] {
    if (n.k === 'ref') return [this.value(n.a)];
    if (n.k === 'range') {
      const list = coRangeAddrs(`${n.a}:${n.b}`);
      if (!list.length) return [REF];
      return list.map((x) => this.value(x));
    }
    return [this.ev(n)];
  }
  /** Numbers from a function's arguments: blanks and text in ranges are skipped, text typed directly fails. */
  private numbers(args: Node[]): number[] | CoErr {
    const out: number[] = [];
    for (const a of args) {
      const fromCells = a.k === 'ref' || a.k === 'range';
      for (const v of this.cells(a)) {
        if (coIsErr(v)) return v;
        if (typeof v === 'number') out.push(v);
        else if (!fromCells) {
          const n = toNum(v);
          if (coIsErr(n)) return n;
          out.push(n);
        }
      }
    }
    return out;
  }
  private criterion(c: CoVal): (v: CoVal) => boolean {
    if (typeof c === 'string') {
      const m = /^(<=|>=|<>|<|>|=)(.*)$/.exec(c);
      const op = m ? m[1]! : '=';
      const lit = coLiteral(m ? m[2]! : c);
      return (v) => {
        if (v === null && op !== '<>') return false;
        if (typeof lit === 'number' && typeof v !== 'number') return op === '<>';
        const r = compare(v, lit);
        return op === '=' ? r === 0 : op === '<>' ? r !== 0 : op === '<' ? r < 0 : op === '>' ? r > 0 : op === '<=' ? r <= 0 : r >= 0;
      };
    }
    return (v) => v !== null && !coIsErr(v) && compare(v, c) === 0;
  }

  private ev(n: Node): CoVal {
    switch (n.k) {
      case 'lit':
        return n.v;
      case 'ref':
        return this.value(n.a);
      case 'range': {
        const c = this.cells(n);
        return c.length === 1 ? c[0]! : VALUE;
      }
      case 'un': {
        const x = toNum(this.ev(n.x));
        return coIsErr(x) ? x : n.op === '-' ? -x : x;
      }
      case 'pct': {
        const x = toNum(this.ev(n.x));
        return coIsErr(x) ? x : x / 100;
      }
      case 'bin': {
        const l = this.ev(n.l);
        const r = this.ev(n.r);
        if (coIsErr(l)) return l;
        if (coIsErr(r)) return r;
        if (n.op === '&') return `${toText(l) as string}${toText(r) as string}`;
        if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) {
          const c = compare(l, r);
          return n.op === '=' ? c === 0 : n.op === '<>' ? c !== 0 : n.op === '<' ? c < 0 : n.op === '>' ? c > 0 : n.op === '<=' ? c <= 0 : c >= 0;
        }
        const a = toNum(l);
        const b = toNum(r);
        if (coIsErr(a)) return a;
        if (coIsErr(b)) return b;
        if (n.op === '+') return a + b;
        if (n.op === '-') return a - b;
        if (n.op === '*') return a * b;
        if (n.op === '/') return b === 0 ? DIV0 : a / b;
        return a ** b;
      }
      case 'fn':
        return this.fn(n.name, n.args);
    }
  }

  private fn(name: string, args: Node[]): CoVal {
    const nArgs = (lo: number, hi: number) => args.length >= lo && args.length <= hi;
    const num = (i: number) => toNum(this.ev(args[i]!));
    switch (name) {
      case 'SUM':
      case 'AVERAGE':
      case 'AVG':
      case 'MAX':
      case 'MIN':
      case 'COUNT': {
        if (!args.length) return NA;
        if (name === 'COUNT') {
          let k = 0;
          for (const a of args) for (const v of this.cells(a)) if (typeof v === 'number') k++;
          return k;
        }
        const xs = this.numbers(args);
        if (coIsErr(xs)) return xs;
        if (name === 'SUM') return xs.reduce((t, x) => t + x, 0);
        if (name === 'MAX') return xs.length ? Math.max(...xs) : 0;
        if (name === 'MIN') return xs.length ? Math.min(...xs) : 0;
        return xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : DIV0;
      }
      case 'COUNTA': {
        let k = 0;
        for (const a of args) for (const v of this.cells(a)) if (v !== null && v !== '') k++;
        return k;
      }
      case 'COUNTBLANK': {
        let k = 0;
        for (const a of args) for (const v of this.cells(a)) if (v === null || v === '') k++;
        return k;
      }
      case 'COUNTIF': {
        if (!nArgs(2, 2)) return NA;
        const test = this.ev(args[1]!);
        if (coIsErr(test)) return test;
        const ok = this.criterion(test);
        return this.cells(args[0]!).filter((v) => ok(v)).length;
      }
      case 'SUMIF': {
        if (!nArgs(2, 3)) return NA;
        const test = this.ev(args[1]!);
        if (coIsErr(test)) return test;
        const ok = this.criterion(test);
        const keys = this.cells(args[0]!);
        const vals = args[2] ? this.cells(args[2]) : keys;
        let t = 0;
        keys.forEach((k, i) => {
          const v = vals[i];
          if (ok(k) && typeof v === 'number') t += v;
        });
        return t;
      }
      case 'IF': {
        if (!nArgs(2, 3)) return NA;
        const c = this.ev(args[0]!);
        if (coIsErr(c)) return c;
        const yes = typeof c === 'string' ? null : !!c;
        if (yes === null) return VALUE;
        if (yes) return this.ev(args[1]!);
        return args[2] ? this.ev(args[2]) : false;
      }
      case 'AND':
      case 'OR': {
        if (!args.length) return NA;
        const xs: boolean[] = [];
        for (const a of args)
          for (const v of this.cells(a)) {
            if (coIsErr(v)) return v;
            if (typeof v === 'boolean' || typeof v === 'number') xs.push(!!v);
          }
        if (!xs.length) return VALUE;
        return name === 'AND' ? xs.every(Boolean) : xs.some(Boolean);
      }
      case 'NOT': {
        if (!nArgs(1, 1)) return NA;
        const v = this.ev(args[0]!);
        return coIsErr(v) ? v : !v;
      }
      case 'ABS':
      case 'INT':
      case 'SQRT': {
        if (!nArgs(1, 1)) return NA;
        const x = num(0);
        if (coIsErr(x)) return x;
        if (name === 'SQRT' && x < 0) return NUM;
        return name === 'ABS' ? Math.abs(x) : name === 'INT' ? Math.floor(x) : Math.sqrt(x);
      }
      case 'ROUND':
      case 'ROUNDUP':
      case 'ROUNDDOWN': {
        if (!nArgs(1, 2)) return NA;
        const x = num(0);
        const d = args[1] ? num(1) : 0;
        if (coIsErr(x)) return x;
        if (coIsErr(d)) return d;
        const f = 10 ** Math.trunc(d);
        const y = Number((Math.abs(x) * f).toPrecision(14));
        const z = name === 'ROUND' ? Math.round(y) : name === 'ROUNDUP' ? Math.ceil(y) : Math.floor(y);
        return (Math.sign(x) * z) / f;
      }
      case 'RANK': {
        if (!nArgs(2, 3)) return NA;
        const x = num(0);
        if (coIsErr(x)) return x;
        const order = args[2] ? num(2) : 0;
        if (coIsErr(order)) return order;
        const list = this.cells(args[1]!);
        for (const v of list) if (coIsErr(v)) return v;
        const nums = list.filter((v): v is number => typeof v === 'number');
        if (!nums.some((y) => Math.abs(y - x) < 1e-12)) return NA;
        return 1 + nums.filter((y) => (order ? y < x - 1e-12 : y > x + 1e-12)).length;
      }
      default:
        return NAME;
    }
  }
}

/** Every value of a sheet. */
export function coEvalAll(cells: Record<string, { f: string }>): Record<string, CoVal> {
  const calc = new CoCalc((a) => cells[a]?.f);
  const out: Record<string, CoVal> = {};
  for (const a of Object.keys(cells)) out[a] = calc.value(a);
  return out;
}
export const coEvalOne = (formula: string, cells: Record<string, { f: string }> = {}): CoVal => new CoCalc((a) => (a === '__' ? formula : cells[a]?.f)).value('__');

// ------------------------------------------------------------------ copying a formula

const REF_IN = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g;
/** Applies `each` to every reference outside text in quotes. */
function mapRefs(f: string, each: (m: { dc: boolean; col: string; dr: boolean; row: number }) => string): string {
  return f
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) => (i % 2 ? part : part.replace(REF_IN, (whole: string, a: string, col: string, b: string, row: string, off: number, all: string) => (off > 0 && /[A-Za-z0-9_.]/.test(all[off - 1]!) ? whole : each({ dc: !!a, col: col.toUpperCase(), dr: !!b, row: Number(row) })))))
    .join('');
}
/** The formula as it reads after being copied by (dc, dr): relative parts move, $ parts stay, off the sheet is #REF!. */
export function coShiftFormula(f: string, dc: number, dr: number): string {
  if (!f.startsWith('=')) return f;
  return mapRefs(f, ({ dc: lockC, col, dr: lockR, row }) => {
    const c = lockC ? coColIndex(col) : coColIndex(col) + dc;
    const r = lockR ? row : row + dr;
    if (c < 0 || r < 1) return '#REF!';
    return `${lockC ? '$' : ''}${coColName(c)}${lockR ? '$' : ''}${r}`;
  });
}
/** The same formula in relative form, so copies of one formula compare equal. */
export function coRelative(f: string, addr: string): string {
  const at = coParseAddr(addr);
  if (!at || !f.startsWith('=')) return f;
  return mapRefs(f, ({ dc, col, dr, row }) => `{${dc ? `$${col}` : coColIndex(col) - at.c}|${dr ? `$${row}` : row - 1 - at.r}}`)
    .toUpperCase()
    .replace(/\s+/g, '');
}
/** Cycles a reference through A1 → $A$1 → A$1 → $A1 → A1 (the F4 key). */
export function coCycleRef(ref: string): string {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(ref);
  if (!m) return ref;
  const [, a, c, b, r] = m;
  if (!a && !b) return `$${c}$${r}`;
  if (a && b) return `${c}$${r}`;
  if (!a && b) return `$${c}${r}`;
  return `${c}${r}`;
}

// ------------------------------------------------------------------ number formats

export type CoNumFmt = 'GENERAL' | 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'THOUSANDS';
const commas = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function fixed(x: number, dp: number) {
  const r = Math.round(Math.abs(x) * 10 ** dp + 1e-9) / 10 ** dp;
  return r.toFixed(dp);
}
/** A value as the grid shows it. */
export function coDisplay(v: CoVal, fmt?: { nf?: CoNumFmt; dp?: number }): string {
  if (v === null) return '';
  if (coIsErr(v)) return v.e;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  const nf = fmt?.nf ?? 'GENERAL';
  const dp = fmt?.dp;
  const sign = v < 0 ? '-' : '';
  if (nf === 'PERCENT') return `${sign}${fixed(v * 100, dp ?? 0)}%`;
  if (nf === 'CURRENCY') {
    const [i, d] = fixed(v, dp ?? 2).split('.');
    return `${sign}₦${commas(i!)}${d ? `.${d}` : ''}`;
  }
  if (nf === 'THOUSANDS') {
    const [i, d] = fixed(v, dp ?? 0).split('.');
    return `${sign}${commas(i!)}${d ? `.${d}` : ''}`;
  }
  if (nf === 'NUMBER' || dp !== undefined) return `${sign}${fixed(v, dp ?? 2)}`;
  return String(Number(v.toPrecision(11)));
}
