/**
 * A real BASIC interpreter (the GW-BASIC / QBasic dialect WAEC papers use),
 * written once so the browser and the marker run exactly the same language.
 *
 * Nothing in here ever reaches `eval`, `Function` or the host: a program is
 * tokenised, parsed into a small tree and walked by `BasicMachine`, whose only
 * outside world is its own output string. Every cost is charged to a budget
 * (`ticks`, one per statement and per expression node, more for long strings),
 * so an endless loop, a huge DIM, a string doubled in a loop or a mile of
 * output all stop with a BASIC-style message instead of hurting the server.
 *
 * Numbers are JavaScript doubles shown the way single-precision BASIC shows
 * them: seven significant figures, no leading zero, a space for the sign.
 */

export const BASIC_LIMITS = {
  /** Source size, checked before anything is parsed. */
  sourceChars: 8000,
  sourceLines: 400,
  lineChars: 300,
  /** One tick per statement and per expression node. */
  ticks: 400_000,
  outputChars: 12_000,
  outputLines: 600,
  arrayCells: 5000,
  stringChars: 1000,
  /** FOR, WHILE and GOSUB frames together. */
  stack: 64,
  /** Brackets and calls inside one expression. */
  nesting: 40,
  variables: 200,
} as const;

export type BasicValue = number | string;
export type BasicStatus = 'ready' | 'running' | 'input' | 'done' | 'error' | 'limit' | 'no-input';

export interface BasicOptions {
  /** Tick budget (the marker uses a smaller one). */
  ticks?: number;
  /** Replaces the program's DATA list: a hidden test runs the student's READ loop on other values. */
  data?: string[];
  /** Copy typed input into the output, as a console does. Off for marking, so inputs can't pass for results. */
  echo?: boolean;
  /** RND's seed: the same program gives the same "random" numbers. */
  rnd?: number;
}

export interface BasicFault {
  message: string;
  /** Source line (1-based), for the editor. */
  line: number;
  /** The BASIC line number, when the line has one. */
  no: number | null;
}

type Expr =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'var'; n: string }
  | { k: 'idx'; n: string; a: Expr[] }
  | { k: 'fn'; n: string; a: Expr[] }
  | { k: 'un'; o: string; e: Expr }
  | { k: 'bin'; o: string; a: Expr; b: Expr };

type LVal = { n: string; a: Expr[] | null };
type PrintItem = { e: Expr } | { sep: ',' | ';' } | { tab: Expr } | { spc: Expr };

type Stmt = { src: number; no: number | null } & (
  | { t: 'NOP' | 'END' | 'CLS' | 'RETURN' }
  | { t: 'LET'; to: LVal; e: Expr }
  | { t: 'PRINT'; items: PrintItem[] }
  | { t: 'INPUT'; prompt: string; vars: LVal[]; whole: boolean }
  | { t: 'READ'; vars: LVal[] }
  | { t: 'RESTORE'; at: number }
  | { t: 'DIM'; n: string; a: Expr[] }
  | { t: 'FOR'; v: string; a: Expr; b: Expr; s: Expr | null; next: number }
  | { t: 'NEXT'; v: string | null }
  | { t: 'JF'; e: Expr; to: number }
  | { t: 'JT'; e: Expr; to: number }
  | { t: 'JMP'; to: number }
  | { t: 'GOTO' | 'GOSUB'; dest: number; label: string | null; to: number }
  | { t: 'ON'; e: Expr; sub: boolean; nos: number[]; to: number[] }
  | { t: 'SWAP'; a: LVal; b: LVal }
  | { t: 'EXITFOR'; to: number }
  | { t: 'DEF'; n: string; params: string[]; e: Expr }
);
type Emit = Stmt extends infer S ? (S extends unknown ? Omit<S, 'src' | 'no'> : never) : never;

export interface BasicProgram {
  stmts: Stmt[];
  data: string[];
  /** The statements written, by kind (REM, FOR, WHILE, DIM…), and the functions called. */
  facts: BasicFacts;
  lines: { src: number; no: number | null }[];
}
export interface BasicFacts {
  statements: string[];
  functions: string[];
  /** Every line of code has a line number. */
  numbered: boolean;
  /** Line numbers rise in tens or at least keep rising. */
  codeLines: number;
  forStep: boolean;
  forStepNegative: boolean;
  endLast: boolean;
}

class Fault extends Error {
  constructor(
    message: string,
    public limit = false,
  ) {
    super(message);
  }
}

// ------------------------------------------------------------------ tokens

type Tok = { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'id'; v: string } | { k: 'op'; v: string } | { k: 'rest'; v: string };
const KEYWORDS = new Set(
  'AND OR NOT XOR MOD THEN ELSE ELSEIF TO STEP GOTO GOSUB PRINT LET IF FOR NEXT END STOP INPUT READ DATA DIM WHILE WEND REM RETURN RESTORE ON DO LOOP UNTIL EXIT CLS DEF SWAP LPRINT LINE RANDOMIZE'.split(' '),
);
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
const isAlpha = (c: string | undefined) => c !== undefined && ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'));

/** Splits one line into tokens. REM, ' and DATA keep the rest of the text as it is. */
function tokenise(line: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i]!;
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === "'") {
      out.push({ k: 'id', v: 'REM' }, { k: 'rest', v: line.slice(i + 1) });
      break;
    }
    if (c === '"') {
      const end = line.indexOf('"', i + 1);
      out.push({ k: 'str', v: end < 0 ? line.slice(i + 1) : line.slice(i + 1, end) });
      i = end < 0 ? line.length : end + 1;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(line[i + 1]))) {
      let j = i;
      while (isDigit(line[j])) j++;
      if (line[j] === '.') {
        j++;
        while (isDigit(line[j])) j++;
      }
      if ((line[j] === 'E' || line[j] === 'e' || line[j] === 'D' || line[j] === 'd') && (isDigit(line[j + 1]) || ((line[j + 1] === '+' || line[j + 1] === '-') && isDigit(line[j + 2])))) {
        j += 2;
        while (isDigit(line[j])) j++;
      }
      out.push({ k: 'num', v: Number(line.slice(i, j).replace(/[dD]/, 'E')) });
      i = j;
      if (line[i] === '!' || line[i] === '#' || line[i] === '%' || line[i] === '&') i++;
      continue;
    }
    if (isAlpha(c)) {
      let j = i;
      while (isAlpha(line[j]) || isDigit(line[j]) || line[j] === '.') j++;
      if (line[j] === '$' || line[j] === '%' || line[j] === '!' || line[j] === '#') j++;
      const w = line.slice(i, j).toUpperCase();
      i = j;
      out.push({ k: 'id', v: w });
      if (w === 'REM' || w === 'DATA') {
        let rest = line.slice(i);
        if (w === 'DATA') {
          // DATA runs to the next ':' outside quotes.
          let q = false;
          let e = 0;
          for (; e < rest.length; e++) {
            if (rest[e] === '"') q = !q;
            else if (rest[e] === ':' && !q) break;
          }
          i += e;
          rest = rest.slice(0, e);
        } else i = line.length;
        out.push({ k: 'rest', v: rest });
      }
      continue;
    }
    const two = line.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=' || two === '=<' || two === '=>' || two === '><') {
      out.push({ k: 'op', v: two === '=<' ? '<=' : two === '=>' ? '>=' : two === '><' ? '<>' : two });
      i += 2;
      continue;
    }
    if ('+-*/\\^=<>(),;:?'.includes(c)) {
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    throw new Fault('Syntax error');
  }
  return out;
}

// ------------------------------------------------------------------ parser

const FN_ARGS: Record<string, [number, number]> = {
  ABS: [1, 1], INT: [1, 1], FIX: [1, 1], CINT: [1, 1], SGN: [1, 1], SQR: [1, 1], SIN: [1, 1], COS: [1, 1], TAN: [1, 1], ATN: [1, 1], EXP: [1, 1], LOG: [1, 1], RND: [0, 1], TIMER: [0, 0],
  LEN: [1, 1], ASC: [1, 1], VAL: [1, 1], 'CHR$': [1, 1], 'STR$': [1, 1], 'LEFT$': [2, 2], 'RIGHT$': [2, 2], 'MID$': [2, 3], 'UCASE$': [1, 1], 'LCASE$': [1, 1], 'LTRIM$': [1, 1], 'RTRIM$': [1, 1], 'SPACE$': [1, 1], 'STRING$': [2, 2], INSTR: [2, 3],
};
const NO_OP = new Set(['BEEP', 'COLOR', 'SCREEN', 'WIDTH', 'KEY', 'LOCATE', 'SOUND', 'RANDOMIZE', 'OPTION']);

class Parser {
  stmts: Stmt[] = [];
  data: string[] = [];
  blocks: ({ kind: 'FOR'; at: number; v: string; exits: number[] } | { kind: 'WHILE'; at: number } | { kind: 'DO'; at: number; pre: number; exits: number[] } | { kind: 'IF'; jf: number; ends: number[] })[] = [];
  seen = new Set<string>();
  fns = new Set<string>();
  labels = new Map<string, number>();
  lineStart = new Map<number, number>();
  dataAt = new Map<number, number>();
  forStep = false;
  forNeg = false;
  private t: Tok[] = [];
  private p = 0;
  private src = 0;
  private no: number | null = null;
  private depth = 0;

  private emit(s: Emit): number {
    this.stmts.push({ ...(s as object), src: this.src, no: this.no } as Stmt);
    return this.stmts.length - 1;
  }
  private peek(): Tok | undefined {
    return this.t[this.p];
  }
  private isOp(v: string) {
    const x = this.peek();
    return x?.k === 'op' && x.v === v;
  }
  private isId(v: string) {
    const x = this.peek();
    return x?.k === 'id' && x.v === v;
  }
  private eatOp(v: string) {
    if (this.isOp(v)) return this.p++, true;
    return false;
  }
  private eatId(v: string) {
    if (this.isId(v)) return this.p++, true;
    return false;
  }
  private needOp(v: string) {
    if (!this.eatOp(v)) throw new Fault('Syntax error');
  }
  private needId(v: string) {
    if (!this.eatId(v)) throw new Fault('Syntax error');
  }

  /** One source line. */
  line(text: string, src: number, no: number | null) {
    this.t = tokenise(text);
    this.p = 0;
    this.src = src;
    this.no = no;
    if (no !== null) this.lineStart.set(no, this.stmts.length);
    const a = this.t[0];
    if (a?.k === 'id' && !KEYWORDS.has(a.v) && !NO_OP.has(a.v) && this.t[1]?.k === 'op' && this.t[1].v === ':') {
      this.labels.set(a.v, this.stmts.length);
      this.p = 2;
    }
    if (!this.t.length) this.emit({ t: 'NOP' });
    this.sequence(false);
  }

  /** Statements separated by ':' up to the end of the line (or ELSE inside a one-line IF). */
  private sequence(inIf: boolean) {
    for (;;) {
      while (this.eatOp(':'));
      if (this.p >= this.t.length) return;
      if (inIf && (this.isId('ELSE') || this.isId('ELSEIF'))) return;
      this.statement();
      if (this.p >= this.t.length) return;
      if (inIf && this.isId('ELSE')) return;
      if (!this.isOp(':')) throw new Fault('Syntax error');
    }
  }

  private varName(): string {
    const x = this.peek();
    if (x?.k !== 'id' || KEYWORDS.has(x.v) || FN_ARGS[x.v]) throw new Fault('Syntax error');
    this.p++;
    return x.v;
  }
  private lval(): LVal {
    const n = this.varName();
    if (this.eatOp('(')) {
      const a = [this.expr()];
      while (this.eatOp(',')) a.push(this.expr());
      this.needOp(')');
      return { n, a };
    }
    return { n, a: null };
  }
  private lvals(): LVal[] {
    const out = [this.lval()];
    while (this.eatOp(',')) out.push(this.lval());
    return out;
  }
  private lineNo(): number {
    const x = this.peek();
    if (x?.k !== 'num' || !Number.isInteger(x.v)) throw new Fault('Syntax error');
    this.p++;
    return x.v;
  }
  private target(): { dest: number; label: string | null } {
    const x = this.peek();
    if (x?.k === 'id' && !KEYWORDS.has(x.v)) return this.p++, { dest: -1, label: x.v };
    return { dest: this.lineNo(), label: null };
  }

  private statement() {
    const x = this.peek()!;
    if (x.k === 'op' && x.v === '?') {
      this.p++;
      this.seen.add('PRINT');
      return void this.print();
    }
    if (x.k !== 'id') throw new Fault('Syntax error');
    if (!KEYWORDS.has(x.v) && !NO_OP.has(x.v)) {
      // A function name at the start of a line, or NAME = …
      if (FN_ARGS[x.v]) throw new Fault('Syntax error');
      const to = this.lval();
      this.needOp('=');
      this.seen.add('ASSIGN');
      return void this.emit({ t: 'LET', to, e: this.expr() });
    }
    this.p++;
    if (NO_OP.has(x.v)) {
      this.p = this.t.findIndex((y, i) => i >= this.p && y.k === 'op' && y.v === ':');
      if (this.p < 0) this.p = this.t.length;
      this.seen.add(x.v);
      return void this.emit({ t: 'NOP' });
    }
    this.seen.add(x.v);
    switch (x.v) {
      case 'REM':
        this.p = this.t.length;
        this.emit({ t: 'NOP' });
        return;
      case 'LET': {
        const to = this.lval();
        this.needOp('=');
        this.emit({ t: 'LET', to, e: this.expr() });
        return;
      }
      case 'PRINT':
      case 'LPRINT':
        this.seen.add('PRINT');
        this.print();
        return;
      case 'INPUT':
        this.input(false);
        return;
      case 'LINE':
        this.needId('INPUT');
        this.seen.add('INPUT');
        this.input(true);
        return;
      case 'READ':
        this.emit({ t: 'READ', vars: this.lvals() });
        return;
      case 'DATA': {
        const r = this.peek();
        this.p++;
        if (this.no !== null) this.dataAt.set(this.no, this.data.length);
        this.data.push(...splitData(r?.k === 'rest' ? r.v : ''));
        this.emit({ t: 'NOP' });
        return;
      }
      case 'RESTORE':
        this.emit({ t: 'RESTORE', at: this.peek()?.k === 'num' ? this.lineNo() : -1 });
        return;
      case 'DIM':
        do {
          const n = this.varName();
          this.needOp('(');
          const a = [this.expr()];
          while (this.eatOp(',')) a.push(this.expr());
          this.needOp(')');
          this.emit({ t: 'DIM', n, a });
        } while (this.eatOp(','));
        return;
      case 'END':
        if (this.isId('IF')) {
          this.p++;
          return this.endIf();
        }
        this.emit({ t: 'END' });
        return;
      case 'STOP':
        this.emit({ t: 'END' });
        return;
      case 'CLS':
        this.emit({ t: 'CLS' });
        return;
      case 'RETURN':
        this.emit({ t: 'RETURN' });
        return;
      case 'GOTO':
      case 'GOSUB':
        this.emit({ t: x.v as 'GOTO' | 'GOSUB', ...this.target(), to: -1 });
        return;
      case 'ON': {
        const e = this.expr();
        const sub = this.isId('GOSUB');
        if (!sub) this.needId('GOTO');
        else this.p++;
        const nos = [this.lineNo()];
        while (this.eatOp(',')) nos.push(this.lineNo());
        this.emit({ t: 'ON', e, sub, nos, to: [] });
        return;
      }
      case 'SWAP': {
        const a = this.lval();
        this.needOp(',');
        this.emit({ t: 'SWAP', a, b: this.lval() });
        return;
      }
      case 'DEF': {
        const n = this.varName();
        if (!n.startsWith('FN')) throw new Fault('Syntax error');
        const params: string[] = [];
        if (this.eatOp('(')) {
          params.push(this.varName());
          while (this.eatOp(',')) params.push(this.varName());
          this.needOp(')');
        }
        this.needOp('=');
        this.fns.add(n);
        this.emit({ t: 'DEF', n, params, e: this.expr() });
        return;
      }
      case 'IF':
        return this.ifStatement();
      case 'ELSEIF': {
        const b = this.blocks.at(-1);
        if (b?.kind !== 'IF') throw new Fault('ELSE without IF');
        b.ends.push(this.emit({ t: 'JMP', to: -1 }));
        (this.stmts[b.jf] as { to: number }).to = this.stmts.length;
        const e = this.expr();
        this.needId('THEN');
        b.jf = this.emit({ t: 'JF', e, to: -1 });
        return;
      }
      case 'ELSE': {
        const b = this.blocks.at(-1);
        if (b?.kind !== 'IF') throw new Fault('ELSE without IF');
        b.ends.push(this.emit({ t: 'JMP', to: -1 }));
        (this.stmts[b.jf] as { to: number }).to = this.stmts.length;
        b.jf = -1;
        return;
      }
      case 'FOR': {
        const v = this.varName();
        this.needOp('=');
        const a = this.expr();
        this.needId('TO');
        const b = this.expr();
        let s: Expr | null = null;
        if (this.eatId('STEP')) {
          s = this.expr();
          this.forStep = true;
          if (s.k === 'un' && s.o === '-') this.forNeg = true;
          if (s.k === 'num' && s.v < 0) this.forNeg = true;
        }
        const at = this.emit({ t: 'FOR', v, a, b, s, next: -1 });
        this.blocks.push({ kind: 'FOR', at, v, exits: [] });
        return;
      }
      case 'NEXT': {
        const names: (string | null)[] = [];
        if (this.peek()?.k === 'id' && !this.isId('ELSE')) {
          names.push(this.varName());
          while (this.eatOp(',')) names.push(this.varName());
        } else names.push(null);
        for (const v of names) {
          const b = this.blocks.at(-1);
          if (b?.kind !== 'FOR' || (v !== null && v !== b.v)) throw new Fault('NEXT without FOR');
          this.blocks.pop();
          const at = this.emit({ t: 'NEXT', v: b.v });
          (this.stmts[b.at] as { next: number }).next = at;
          for (const e of b.exits) (this.stmts[e] as { to: number }).to = at + 1;
        }
        return;
      }
      case 'WHILE': {
        const at = this.emit({ t: 'JF', e: this.expr(), to: -1 });
        this.blocks.push({ kind: 'WHILE', at });
        return;
      }
      case 'WEND': {
        const b = this.blocks.pop();
        if (b?.kind !== 'WHILE') throw new Fault('WEND without WHILE');
        this.emit({ t: 'JMP', to: b.at });
        (this.stmts[b.at] as { to: number }).to = this.stmts.length;
        return;
      }
      case 'DO': {
        const at = this.stmts.length;
        let pre = -1;
        if (this.eatId('WHILE')) pre = this.emit({ t: 'JF', e: this.expr(), to: -1 });
        else if (this.eatId('UNTIL')) pre = this.emit({ t: 'JT', e: this.expr(), to: -1 });
        else this.emit({ t: 'NOP' });
        this.blocks.push({ kind: 'DO', at, pre, exits: [] });
        return;
      }
      case 'LOOP': {
        const b = this.blocks.pop();
        if (b?.kind !== 'DO') throw new Fault('LOOP without DO');
        if (this.eatId('WHILE')) this.emit({ t: 'JT', e: this.expr(), to: b.at });
        else if (this.eatId('UNTIL')) this.emit({ t: 'JF', e: this.expr(), to: b.at });
        else this.emit({ t: 'JMP', to: b.at });
        const out = this.stmts.length;
        if (b.pre >= 0) (this.stmts[b.pre] as { to: number }).to = out;
        for (const e of b.exits) (this.stmts[e] as { to: number }).to = out;
        return;
      }
      case 'EXIT': {
        if (this.eatId('FOR')) {
          const b = [...this.blocks].reverse().find((y) => y.kind === 'FOR');
          if (b?.kind !== 'FOR') throw new Fault('EXIT without FOR');
          b.exits.push(this.emit({ t: 'EXITFOR', to: -1 }));
          return;
        }
        this.needId('DO');
        const b = [...this.blocks].reverse().find((y) => y.kind === 'DO');
        if (b?.kind !== 'DO') throw new Fault('EXIT without DO');
        b.exits.push(this.emit({ t: 'JMP', to: -1 }));
        return;
      }
      default:
        throw new Fault('Syntax error');
    }
  }

  private endIf() {
    const b = this.blocks.pop();
    if (b?.kind !== 'IF') throw new Fault('END IF without IF');
    const out = this.stmts.length;
    if (b.jf >= 0) (this.stmts[b.jf] as { to: number }).to = out;
    for (const e of b.ends) (this.stmts[e] as { to: number }).to = out;
    this.emit({ t: 'NOP' });
  }

  private ifStatement() {
    const e = this.expr();
    if (this.isId('GOTO')) {
      this.p++;
      const jf = this.emit({ t: 'JF', e, to: -1 });
      this.emit({ t: 'GOTO', ...this.target(), to: -1 });
      (this.stmts[jf] as { to: number }).to = this.stmts.length;
      return;
    }
    this.needId('THEN');
    if (this.p >= this.t.length || this.isId('REM')) {
      this.p = this.t.length;
      this.blocks.push({ kind: 'IF', jf: this.emit({ t: 'JF', e, to: -1 }), ends: [] });
      return;
    }
    const jf = this.emit({ t: 'JF', e, to: -1 });
    this.branch();
    if (this.eatId('ELSE')) {
      const j = this.emit({ t: 'JMP', to: -1 });
      (this.stmts[jf] as { to: number }).to = this.stmts.length;
      this.branch();
      (this.stmts[j] as { to: number }).to = this.stmts.length;
    } else (this.stmts[jf] as { to: number }).to = this.stmts.length;
  }
  private branch() {
    if (this.peek()?.k === 'num') this.emit({ t: 'GOTO', dest: this.lineNo(), label: null, to: -1 });
    else this.sequence(true);
  }

  private print() {
    const items: PrintItem[] = [];
    while (this.p < this.t.length && !this.isOp(':') && !this.isId('ELSE')) {
      if (this.eatOp(',')) items.push({ sep: ',' });
      else if (this.eatOp(';')) items.push({ sep: ';' });
      else if (this.isId('USING')) throw new Fault('PRINT USING is not in this BASIC: round with INT(X * 100 + .5) / 100');
      else if (this.isId('TAB') || this.isId('SPC')) {
        const k = (this.peek() as { v: string }).v;
        this.p++;
        this.needOp('(');
        const e = this.expr();
        this.needOp(')');
        items.push(k === 'TAB' ? { tab: e } : { spc: e });
      } else items.push({ e: this.expr() });
    }
    this.emit({ t: 'PRINT', items });
  }

  private input(whole: boolean) {
    let prompt = '? ';
    const x = this.peek();
    if (x?.k === 'str') {
      this.p++;
      if (this.eatOp(';')) prompt = `${x.v}? `;
      else {
        this.needOp(',');
        prompt = x.v;
      }
    }
    this.emit({ t: 'INPUT', prompt, vars: this.lvals(), whole });
  }

  // Expressions, loosest first: OR/XOR, AND, NOT, comparison, + -, MOD, \, * /, unary, ^.
  expr(): Expr {
    if (++this.depth > BASIC_LIMITS.nesting) throw new Fault('Expression too complex');
    let a = this.andExpr();
    while (this.isId('OR') || this.isId('XOR')) {
      const o = (this.peek() as { v: string }).v;
      this.p++;
      a = { k: 'bin', o, a, b: this.andExpr() };
    }
    this.depth--;
    return a;
  }
  private andExpr(): Expr {
    let a = this.notExpr();
    while (this.eatId('AND')) a = { k: 'bin', o: 'AND', a, b: this.notExpr() };
    return a;
  }
  private notExpr(): Expr {
    if (this.eatId('NOT')) {
      if (++this.depth > BASIC_LIMITS.nesting) throw new Fault('Expression too complex');
      const e = this.notExpr();
      this.depth--;
      return { k: 'un', o: 'NOT', e };
    }
    return this.compare();
  }
  private compare(): Expr {
    let a = this.sum();
    for (;;) {
      const x = this.peek();
      if (x?.k !== 'op' || !['=', '<>', '<', '>', '<=', '>='].includes(x.v)) return a;
      this.p++;
      a = { k: 'bin', o: x.v, a, b: this.sum() };
    }
  }
  private sum(): Expr {
    let a = this.modulo();
    for (;;) {
      if (this.eatOp('+')) a = { k: 'bin', o: '+', a, b: this.modulo() };
      else if (this.eatOp('-')) a = { k: 'bin', o: '-', a, b: this.modulo() };
      else return a;
    }
  }
  private modulo(): Expr {
    let a = this.intDiv();
    while (this.eatId('MOD')) a = { k: 'bin', o: 'MOD', a, b: this.intDiv() };
    return a;
  }
  private intDiv(): Expr {
    let a = this.product();
    while (this.eatOp('\\')) a = { k: 'bin', o: '\\', a, b: this.product() };
    return a;
  }
  private product(): Expr {
    let a = this.unary();
    for (;;) {
      if (this.eatOp('*')) a = { k: 'bin', o: '*', a, b: this.unary() };
      else if (this.eatOp('/')) a = { k: 'bin', o: '/', a, b: this.unary() };
      else return a;
    }
  }
  private unary(): Expr {
    if (this.eatOp('-') || this.isOp('+')) {
      const minus = !this.eatOp('+');
      if (++this.depth > BASIC_LIMITS.nesting) throw new Fault('Expression too complex');
      const e = this.unary();
      this.depth--;
      return minus ? { k: 'un', o: '-', e } : e;
    }
    return this.power();
  }
  /** ^ binds tighter than unary minus (-2 ^ 2 is -4) and groups left (2 ^ 3 ^ 2 is 64), as in BASIC. */
  private power(): Expr {
    let a = this.atom();
    while (this.eatOp('^')) {
      const minus = this.eatOp('-');
      if (!minus) this.eatOp('+');
      const b = this.atom();
      a = { k: 'bin', o: '^', a, b: minus ? { k: 'un', o: '-', e: b } : b };
    }
    return a;
  }
  private args(): Expr[] {
    const a = [this.expr()];
    while (this.eatOp(',')) a.push(this.expr());
    this.needOp(')');
    return a;
  }
  private atom(): Expr {
    const x = this.peek();
    if (!x) throw new Fault('Syntax error');
    this.p++;
    if (x.k === 'num') return { k: 'num', v: x.v };
    if (x.k === 'str') return { k: 'str', v: x.v };
    if (x.k === 'op' && x.v === '(') {
      const e = this.expr();
      this.needOp(')');
      return e;
    }
    if (x.k === 'id') {
      if (KEYWORDS.has(x.v)) throw new Fault('Syntax error');
      const range = FN_ARGS[x.v];
      if (range) {
        const a = this.eatOp('(') ? this.args() : [];
        if (a.length < range[0] || a.length > range[1]) throw new Fault('Illegal function call');
        this.seen.add(`fn:${x.v}`);
        return { k: 'fn', n: x.v, a };
      }
      if (this.eatOp('(')) return x.v.startsWith('FN') && this.fns.has(x.v) ? { k: 'fn', n: x.v, a: this.args() } : { k: 'idx', n: x.v, a: this.args() };
      if (x.v.startsWith('FN') && this.fns.has(x.v)) return { k: 'fn', n: x.v, a: [] };
      return { k: 'var', n: x.v };
    }
    throw new Fault('Syntax error');
  }

  finish(lines: { src: number; no: number | null }[]) {
    const b = this.blocks.at(-1);
    if (b) throw new Fault(b.kind === 'FOR' ? 'FOR without NEXT' : b.kind === 'WHILE' ? 'WHILE without WEND' : b.kind === 'DO' ? 'DO without LOOP' : 'IF without END IF');
    const resolve = (no: number, label: string | null) => {
      const to = label ? this.labels.get(label) : this.lineStart.get(no);
      if (to === undefined) throw new Fault('Undefined line number');
      return to;
    };
    for (const s of this.stmts) {
      this.src = s.src;
      this.no = s.no;
      if (s.t === 'GOTO' || s.t === 'GOSUB') s.to = resolve(s.dest, s.label);
      else if (s.t === 'ON') s.to = s.nos.map((n) => resolve(n, null));
      else if (s.t === 'RESTORE' && s.at >= 0) s.at = this.dataAt.get(s.at) ?? 0;
    }
    return lines;
  }
  get where() {
    return { src: this.src, no: this.no };
  }
}

/** The values of a DATA statement. */
function splitData(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const c of text) {
    if (c === '"') q = !q;
    else if (c === ',' && !q) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}

export type BasicParsed = { ok: true; program: BasicProgram } | { ok: false; fault: BasicFault };

/** Parses a whole program. Numbered lines are sorted by number, as a BASIC does (a later copy of a number replaces the earlier one). */
export function parseBasic(source: string): BasicParsed {
  if (source.length > BASIC_LIMITS.sourceChars) return { ok: false, fault: { message: 'Program too long', line: 1, no: null } };
  const raw = source.split(/\r\n|\r|\n/);
  if (raw.length > BASIC_LIMITS.sourceLines) return { ok: false, fault: { message: 'Program too long', line: BASIC_LIMITS.sourceLines, no: null } };
  type Row = { src: number; no: number | null; text: string };
  let rows: Row[] = [];
  raw.forEach((l, i) => {
    const m = /^\s*(\d{1,6})(.*)$/.exec(l);
    if (m) rows.push({ src: i, no: Number(m[1]), text: m[2]!.trim() });
    else if (l.trim()) rows.push({ src: i, no: null, text: l.trim() });
  });
  const allNumbered = rows.length > 0 && rows.every((r) => r.no !== null);
  if (allNumbered) {
    const last = new Map<number, Row>();
    for (const r of rows) last.set(r.no!, r);
    rows = [...last.values()].filter((r) => r.text).sort((a, b) => a.no! - b.no!);
  }
  const p = new Parser();
  try {
    for (const r of rows) {
      if (r.text.length > BASIC_LIMITS.lineChars) throw new Fault('Line too long');
      p.line(r.text, r.src, r.no);
    }
    const lines = p.finish(rows.map((r) => ({ src: r.src, no: r.no })));
    const fns = [...p.seen].filter((x) => x.startsWith('fn:')).map((x) => x.slice(3));
    const code = rows.filter((r) => r.text);
    const lastRow = code.at(-1);
    return {
      ok: true,
      program: {
        stmts: p.stmts,
        data: p.data,
        lines,
        facts: {
          statements: [...p.seen].filter((x) => !x.startsWith('fn:')).sort(),
          functions: fns.sort(),
          numbered: allNumbered,
          codeLines: code.length,
          forStep: p.forStep,
          forStepNegative: p.forNeg,
          endLast: !!lastRow && /^(END|STOP)\s*$/i.test(lastRow.text),
        },
      },
    };
  } catch (e) {
    if (!(e instanceof Fault)) throw e;
    const w = p.where;
    const named = rows.find((r) => r.src === w.src);
    return { ok: false, fault: { message: e.message, line: w.src + 1, no: named?.no ?? w.no } };
  }
}

// ------------------------------------------------------------------ number format

/** How BASIC shows a number: seven significant figures, ".5" not "0.5", "1E+07" when it is too long. No sign space. */
export function basicNumberText(x: number): string {
  if (x === 0) return '0';
  const neg = x < 0;
  const [mant, ex] = Math.abs(x).toExponential(6).split('e') as [string, string];
  const e = Number(ex);
  const digits = mant.replace('.', '').replace(/0+$/, '') || '0';
  const nd = digits.length;
  let body: string;
  if (e >= 7) body = `${digits[0]}${nd > 1 ? `.${digits.slice(1)}` : ''}E+${String(e).padStart(2, '0')}`;
  else if (e >= 0) body = nd <= e + 1 ? digits.padEnd(e + 1, '0') : `${digits.slice(0, e + 1)}.${digits.slice(e + 1)}`;
  else if (-e - 1 + nd <= 7) body = `.${'0'.repeat(-e - 1)}${digits}`;
  else body = `${digits[0]}${nd > 1 ? `.${digits.slice(1)}` : ''}E-${String(-e).padStart(2, '0')}`;
  return (neg ? '-' : '') + body;
}
/** A number as PRINT shows it: a space (or minus) in front, a space behind. */
export const basicPrintNumber = (x: number) => `${x < 0 ? '' : ' '}${basicNumberText(x)} `;

// ------------------------------------------------------------------ machine

interface Frame {
  kind: 'FOR' | 'GOSUB';
  v?: string;
  end?: number;
  step?: number;
  body?: number;
  back?: number;
}
const fnHash = (s: number) => {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Runs a parsed program. Stops by itself at INPUT, at the end, on an error or when the budget runs out. */
export class BasicMachine {
  status: BasicStatus = 'ready';
  output = '';
  fault: BasicFault | null = null;
  ticks = 0;
  /** What the waiting INPUT asks for. */
  need: { prompt: string; count: number } | null = null;
  private lines = 0;
  private col = 0;
  private pc = 0;
  private program: BasicProgram;
  private scalars = new Map<string, BasicValue>();
  private arrays = new Map<string, { dims: number[]; cells: BasicValue[] }>();
  private cells = 0;
  private stack: Frame[] = [];
  private data: string[];
  private dataPos = 0;
  private defs = new Map<string, { params: string[]; e: Expr }>();
  private depth = 0;
  private readonly limit: number;
  private readonly echo: boolean;
  private rnd: () => number;
  private lastRnd = 0;

  constructor(program: BasicProgram, opts: BasicOptions = {}) {
    this.program = program;
    this.limit = opts.ticks ?? BASIC_LIMITS.ticks;
    this.echo = opts.echo ?? true;
    this.data = opts.data ?? program.data;
    this.rnd = fnHash(opts.rnd ?? 20261);
  }

  /** Switches to another fragment, keeping variables and output (the flowchart runner). */
  load(program: BasicProgram) {
    this.program = program;
    this.pc = 0;
    this.status = 'ready';
  }
  get running() {
    return this.status === 'ready' || this.status === 'running';
  }
  /** The source line about to run (1-based), or null. */
  get line(): number | null {
    const s = this.program.stmts[this.pc];
    return s ? s.src + 1 : null;
  }

  private charge(n = 1) {
    this.ticks += n;
    if (this.ticks > this.limit) throw new Fault('The program ran for too long and was stopped. Check that every loop can end', true);
  }
  private write(text: string) {
    this.charge(1 + (text.length >> 4));
    if (this.output.length + text.length > BASIC_LIMITS.outputChars) throw new Fault('Too much output: the program was stopped. Check your loop', true);
    this.output += text;
  }
  private newline() {
    if (++this.lines > BASIC_LIMITS.outputLines) throw new Fault('Too much output: the program was stopped. Check your loop', true);
    this.write('\n');
    this.col = 0;
  }
  private text(s: string) {
    this.write(s);
    const nl = s.lastIndexOf('\n');
    this.col = nl >= 0 ? s.length - nl - 1 : this.col + s.length;
  }

  /** Runs to the end, to the next INPUT, or until something stops it. */
  run(): BasicStatus {
    while (this.running) this.exec();
    return this.status;
  }
  /** Runs one source line (for the Step button). */
  step(): BasicStatus {
    if (!this.running) return this.status;
    const at = this.line;
    do this.exec();
    while (this.running && this.line === at);
    return this.status;
  }

  private exec() {
    const s = this.program.stmts[this.pc];
    if (!s) {
      this.status = 'done';
      return;
    }
    this.status = 'running';
    try {
      this.charge();
      this.statement(s);
    } catch (e) {
      if (!(e instanceof Fault)) throw e;
      this.status = e.limit ? 'limit' : 'error';
      this.fault = { message: e.limit ? e.message : s.no !== null ? `${e.message} in ${s.no}` : e.message, line: s.src + 1, no: s.no };
    }
  }

  private statement(s: Stmt) {
    this.pc++;
    switch (s.t) {
      case 'NOP':
      case 'DEF':
        if (s.t === 'DEF') this.defs.set(s.n, { params: s.params, e: s.e });
        return;
      case 'END':
        this.status = 'done';
        return;
      case 'CLS':
        this.output = '';
        this.lines = 0;
        this.col = 0;
        return;
      case 'LET':
        return this.assign(s.to, this.eval(s.e));
      case 'PRINT':
        return this.print(s.items);
      case 'INPUT':
        this.text(s.prompt);
        this.need = { prompt: s.prompt, count: s.whole ? 1 : s.vars.length };
        this.pending = s;
        this.status = 'input';
        return;
      case 'READ':
        for (const v of s.vars) {
          if (this.dataPos >= this.data.length) throw new Fault('Out of DATA');
          const raw = this.data[this.dataPos++]!;
          this.charge();
          if (v.n.endsWith('$')) this.assign(v, raw);
          else {
            const n = raw === '' ? 0 : Number(raw);
            if (!Number.isFinite(n)) throw new Fault('Syntax error');
            this.assign(v, n);
          }
        }
        return;
      case 'RESTORE':
        this.dataPos = Math.max(0, s.at);
        return;
      case 'DIM': {
        if (this.arrays.has(s.n)) throw new Fault('Duplicate definition');
        this.makeArray(s.n, s.a.map((e) => Math.round(this.num(e))));
        return;
      }
      case 'FOR': {
        const a = this.num(s.a);
        const b = this.num(s.b);
        const step = s.s ? this.num(s.s) : 1;
        this.setScalar(s.v, a);
        if (step >= 0 ? a > b : a < b) {
          this.pc = s.next + 1;
          return;
        }
        for (let i = this.stack.length - 1; i >= 0; i--) if (this.stack[i]!.kind === 'FOR' && this.stack[i]!.v === s.v) this.stack.length = i;
        this.push({ kind: 'FOR', v: s.v, end: b, step, body: this.pc });
        return;
      }
      case 'NEXT': {
        let i = this.stack.length - 1;
        while (i >= 0 && !(this.stack[i]!.kind === 'FOR' && (s.v === null || this.stack[i]!.v === s.v))) i--;
        if (i < 0) throw new Fault('NEXT without FOR');
        this.stack.length = i + 1;
        const f = this.stack[i]!;
        const x = Number(this.scalars.get(f.v!) ?? 0) + f.step!;
        this.setScalar(f.v!, x);
        if (f.step! >= 0 ? x <= f.end! : x >= f.end!) this.pc = f.body!;
        else this.stack.length = i;
        return;
      }
      case 'EXITFOR': {
        let i = this.stack.length - 1;
        while (i >= 0 && this.stack[i]!.kind !== 'FOR') i--;
        if (i >= 0) this.stack.length = i;
        this.pc = s.to;
        return;
      }
      case 'JF':
        if (this.num(s.e) === 0) this.pc = s.to;
        return;
      case 'JT':
        if (this.num(s.e) !== 0) this.pc = s.to;
        return;
      case 'JMP':
      case 'GOTO':
        this.pc = s.to;
        return;
      case 'GOSUB':
        this.push({ kind: 'GOSUB', back: this.pc });
        this.pc = s.to;
        return;
      case 'ON': {
        const k = Math.round(this.num(s.e));
        const to = s.to[k - 1];
        if (to === undefined) return;
        if (s.sub) this.push({ kind: 'GOSUB', back: this.pc });
        this.pc = to;
        return;
      }
      case 'RETURN': {
        let i = this.stack.length - 1;
        while (i >= 0 && this.stack[i]!.kind !== 'GOSUB') i--;
        if (i < 0) throw new Fault('RETURN without GOSUB');
        this.pc = this.stack[i]!.back!;
        this.stack.length = i;
        return;
      }
      case 'SWAP': {
        const a = this.read(s.a);
        const b = this.read(s.b);
        this.assign(s.a, b);
        this.assign(s.b, a);
        return;
      }
    }
  }
  private pending: Extract<Stmt, { t: 'INPUT' }> | null = null;

  private push(f: Frame) {
    if (this.stack.length >= BASIC_LIMITS.stack) throw new Fault('Out of memory');
    this.stack.push(f);
  }

  /** Answers the waiting INPUT with what was typed. A bad answer asks again, as BASIC does. */
  feed(line: string): BasicStatus {
    const s = this.pending;
    if (this.status !== 'input' || !s) return this.status;
    const typed = line.slice(0, 200);
    try {
      if (this.echo) this.text(typed);
      this.newline();
      const parts = s.whole ? [typed] : s.vars.length === 1 && s.vars[0]!.n.endsWith('$') ? [typed] : splitData(typed);
      const vals: BasicValue[] = [];
      let ok = parts.length === s.vars.length || (s.vars.length === 1 && parts.length === 0);
      if (ok)
        s.vars.forEach((v, i) => {
          const raw = (parts[i] ?? '').trim();
          if (v.n.endsWith('$')) vals.push(s.whole ? typed : raw);
          else {
            const n = raw === '' ? 0 : Number(raw);
            if (!Number.isFinite(n)) ok = false;
            vals.push(n);
          }
        });
      if (!ok) {
        this.text('Redo from start');
        this.newline();
        this.text(s.prompt);
        return this.status;
      }
      s.vars.forEach((v, i) => this.assign(v, vals[i]!));
      this.pending = null;
      this.need = null;
      this.status = 'running';
      if (!this.program.stmts[this.pc]) this.status = 'done';
    } catch (e) {
      if (!(e instanceof Fault)) throw e;
      this.status = e.limit ? 'limit' : 'error';
      this.fault = { message: e.message, line: s.src + 1, no: s.no };
    }
    return this.status;
  }

  private print(items: PrintItem[]) {
    let trail = false;
    for (const it of items) {
      trail = false;
      if ('sep' in it) {
        trail = true;
        if (it.sep === ',') {
          const next = (Math.floor(this.col / 14) + 1) * 14;
          if (next >= 70) this.newline();
          else this.text(' '.repeat(next - this.col));
        }
      } else if ('tab' in it) {
        const c = Math.max(1, Math.min(200, Math.round(this.num(it.tab)))) - 1;
        if (c < this.col) this.newline();
        this.text(' '.repeat(c - this.col));
        trail = true;
      } else if ('spc' in it) {
        this.text(' '.repeat(Math.max(0, Math.min(200, Math.round(this.num(it.spc))))));
        trail = true;
      } else {
        const v = this.eval(it.e);
        this.text(typeof v === 'number' ? basicPrintNumber(v) : v);
      }
    }
    if (!trail) this.newline();
  }

  private setScalar(n: string, v: BasicValue) {
    if (!this.scalars.has(n) && this.scalars.size >= BASIC_LIMITS.variables) throw new Fault('Out of memory');
    this.scalars.set(n, v);
  }
  private assign(to: LVal, v: BasicValue) {
    const str = to.n.endsWith('$');
    if (str !== (typeof v === 'string')) throw new Fault('Type mismatch');
    const val = to.n.endsWith('%') ? Math.round(v as number) : v;
    if (!to.a) return this.setScalar(to.n, val);
    const a = this.array(to.n, to.a.length);
    a.cells[this.cell(a, to.a)] = val;
  }
  private read(l: LVal): BasicValue {
    if (!l.a) return this.scalars.get(l.n) ?? (l.n.endsWith('$') ? '' : 0);
    const a = this.array(l.n, l.a.length);
    return a.cells[this.cell(a, l.a)]!;
  }
  private makeArray(n: string, dims: number[]) {
    if (dims.some((d) => d < 0 || !Number.isFinite(d))) throw new Fault('Illegal function call');
    const size = dims.reduce((t, d) => t * (d + 1), 1);
    if (this.cells + size > BASIC_LIMITS.arrayCells) throw new Fault('Out of memory');
    this.cells += size;
    this.charge(size >> 3);
    const a = { dims, cells: new Array<BasicValue>(size).fill(n.endsWith('$') ? '' : 0) };
    this.arrays.set(n, a);
    return a;
  }
  /** An array used without DIM gets ten places, as in BASIC. */
  private array(n: string, rank: number) {
    const a = this.arrays.get(n) ?? this.makeArray(n, new Array<number>(rank).fill(10));
    if (a.dims.length !== rank) throw new Fault('Subscript out of range');
    return a;
  }
  private cell(a: { dims: number[] }, subs: Expr[]) {
    let at = 0;
    subs.forEach((e, i) => {
      const k = Math.round(this.num(e));
      if (k < 0 || k > a.dims[i]!) throw new Fault('Subscript out of range');
      at = at * (a.dims[i]! + 1) + k;
    });
    return at;
  }

  /** Evaluates a condition for the flowchart runner (null: it faulted, and `fault` says why). */
  truth(e: unknown): boolean | null {
    try {
      return this.num(e as Expr) !== 0;
    } catch (x) {
      if (!(x instanceof Fault)) throw x;
      this.status = x.limit ? 'limit' : 'error';
      this.fault = { message: x.message, line: 0, no: null };
      return null;
    }
  }
  /** Charges one step for something outside a program (a flowchart arrow). False when the budget is gone. */
  spend(): boolean {
    try {
      this.charge();
      return true;
    } catch (x) {
      if (!(x instanceof Fault)) throw x;
      this.status = 'limit';
      this.fault = { message: x.message, line: 0, no: null };
      return false;
    }
  }
  private num(e: Expr): number {
    const v = this.eval(e);
    if (typeof v !== 'number') throw new Fault('Type mismatch');
    return v;
  }
  private str(e: Expr): string {
    const v = this.eval(e);
    if (typeof v !== 'string') throw new Fault('Type mismatch');
    return v;
  }
  private checked(x: number): number {
    if (!Number.isFinite(x)) throw new Fault('Overflow');
    return x;
  }

  private eval(e: Expr): BasicValue {
    this.charge();
    switch (e.k) {
      case 'num':
      case 'str':
        return e.v;
      case 'var':
        return this.scalars.get(e.n) ?? (e.n.endsWith('$') ? '' : 0);
      case 'idx': {
        const a = this.array(e.n, e.a.length);
        return a.cells[this.cell(a, e.a)]!;
      }
      case 'un':
        if (e.o === '-') return this.checked(-this.num(e.e));
        return ~Math.round(this.num(e.e));
      case 'fn':
        return e.n.startsWith('FN') ? this.userFn(e) : this.builtin(e.n, e.a);
      case 'bin':
        return this.binary(e.o, e.a, e.b);
    }
  }

  private userFn(e: Extract<Expr, { k: 'fn' }>): BasicValue {
    const d = this.defs.get(e.n);
    if (!d) throw new Fault('Undefined user function');
    if (d.params.length !== e.a.length) throw new Fault('Illegal function call');
    if (this.depth >= BASIC_LIMITS.nesting) throw new Fault('Out of memory');
    const args = e.a.map((x) => this.eval(x));
    const saved = d.params.map((p) => this.scalars.get(p));
    d.params.forEach((p, i) => this.setScalar(p, args[i]!));
    this.depth++;
    try {
      return this.eval(d.e);
    } finally {
      this.depth--;
      d.params.forEach((p, i) => (saved[i] === undefined ? this.scalars.delete(p) : this.scalars.set(p, saved[i]!)));
    }
  }

  private binary(o: string, ae: Expr, be: Expr): BasicValue {
    const a = this.eval(ae);
    const b = this.eval(be);
    if (typeof a === 'string' || typeof b === 'string') {
      if (typeof a !== typeof b) throw new Fault('Type mismatch');
      const x = a as string;
      const y = b as string;
      this.charge((x.length + y.length) >> 5);
      if (o === '+') {
        if (x.length + y.length > BASIC_LIMITS.stringChars) throw new Fault('String too long');
        return x + y;
      }
      const t = o === '=' ? x === y : o === '<>' ? x !== y : o === '<' ? x < y : o === '>' ? x > y : o === '<=' ? x <= y : o === '>=' ? x >= y : null;
      if (t === null) throw new Fault('Type mismatch');
      return t ? -1 : 0;
    }
    switch (o) {
      case '+':
        return this.checked(a + b);
      case '-':
        return this.checked(a - b);
      case '*':
        return this.checked(a * b);
      case '/':
        if (b === 0) throw new Fault('Division by zero');
        return this.checked(a / b);
      case '\\': {
        const d = Math.round(b);
        if (d === 0) throw new Fault('Division by zero');
        return Math.trunc(Math.round(a) / d);
      }
      case 'MOD': {
        const d = Math.round(b);
        if (d === 0) throw new Fault('Division by zero');
        return Math.round(a) % d;
      }
      case '^':
        if (a < 0 && !Number.isInteger(b)) throw new Fault('Illegal function call');
        if (a === 0 && b < 0) throw new Fault('Division by zero');
        return this.checked(a ** b);
      case '=':
        return a === b ? -1 : 0;
      case '<>':
        return a !== b ? -1 : 0;
      case '<':
        return a < b ? -1 : 0;
      case '>':
        return a > b ? -1 : 0;
      case '<=':
        return a <= b ? -1 : 0;
      case '>=':
        return a >= b ? -1 : 0;
      case 'AND':
        return Math.round(a) & Math.round(b);
      case 'OR':
        return Math.round(a) | Math.round(b);
      case 'XOR':
        return Math.round(a) ^ Math.round(b);
    }
    throw new Fault('Syntax error');
  }

  private builtin(n: string, a: Expr[]): BasicValue {
    const x = (i = 0) => this.num(a[i]!);
    const s = (i = 0) => this.str(a[i]!);
    const short = (t: string) => {
      this.charge(t.length >> 5);
      return t;
    };
    switch (n) {
      case 'ABS':
        return Math.abs(x());
      case 'INT':
        return Math.floor(x());
      case 'FIX':
        return Math.trunc(x());
      case 'CINT': {
        // Exact halves go to the even neighbour, as CINT does.
        const v = x();
        const r = Math.round(v);
        return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
      }
      case 'SGN':
        return Math.sign(x());
      case 'SQR': {
        const v = x();
        if (v < 0) throw new Fault('Illegal function call');
        return Math.sqrt(v);
      }
      case 'SIN':
        return Math.sin(x());
      case 'COS':
        return Math.cos(x());
      case 'TAN':
        return this.checked(Math.tan(x()));
      case 'ATN':
        return Math.atan(x());
      case 'EXP':
        return this.checked(Math.exp(x()));
      case 'LOG': {
        const v = x();
        if (v <= 0) throw new Fault('Illegal function call');
        return Math.log(v);
      }
      case 'RND': {
        const arg = a.length ? x() : 1;
        if (arg !== 0) this.lastRnd = this.rnd();
        return this.lastRnd;
      }
      case 'TIMER':
        return 0;
      case 'LEN':
        return s().length;
      case 'ASC': {
        const t = s();
        if (!t) throw new Fault('Illegal function call');
        return t.charCodeAt(0);
      }
      case 'VAL': {
        const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/i.exec(s());
        return m ? Number(m[0]) : 0;
      }
      case 'CHR$': {
        const c = Math.round(x());
        if (c < 0 || c > 255) throw new Fault('Illegal function call');
        return String.fromCharCode(c);
      }
      case 'STR$': {
        const v = x();
        return `${v < 0 ? '' : ' '}${basicNumberText(v)}`;
      }
      case 'LEFT$':
        return short(s(0).slice(0, Math.max(0, Math.round(x(1)))));
      case 'RIGHT$': {
        const t = s(0);
        const k = Math.max(0, Math.round(x(1)));
        return short(k === 0 ? '' : t.slice(-k));
      }
      case 'MID$': {
        const from = Math.round(x(1));
        if (from < 1) throw new Fault('Illegal function call');
        return short(a.length > 2 ? s(0).substr(from - 1, Math.max(0, Math.round(x(2)))) : s(0).slice(from - 1));
      }
      case 'UCASE$':
        return short(s().toUpperCase());
      case 'LCASE$':
        return short(s().toLowerCase());
      case 'LTRIM$':
        return short(s().replace(/^ +/, ''));
      case 'RTRIM$':
        return short(s().replace(/ +$/, ''));
      case 'SPACE$':
      case 'STRING$': {
        const k = Math.round(x(0));
        if (k < 0 || k > BASIC_LIMITS.stringChars) throw new Fault('String too long');
        this.charge(k >> 3);
        if (n === 'SPACE$') return ' '.repeat(k);
        const v = this.eval(a[1]!);
        return (typeof v === 'string' ? v.charAt(0) : String.fromCharCode(Math.round(v) & 255)).repeat(k);
      }
      case 'INSTR': {
        const three = a.length === 3;
        const start = three ? Math.max(1, Math.round(x(0))) : 1;
        return s(three ? 1 : 0).indexOf(s(three ? 2 : 1), start - 1) + 1;
      }
    }
    throw new Fault('Illegal function call');
  }

  /** The variables as text, for the watch panel. */
  watch(): { name: string; value: string }[] {
    const show = (v: BasicValue) => (typeof v === 'number' ? basicNumberText(v) : `"${v}"`);
    const out = [...this.scalars].map(([name, v]) => ({ name, value: show(v) }));
    for (const [n, a] of this.arrays) if (a.dims.length === 1) a.cells.slice(0, 16).forEach((v, i) => (i > 0 || v !== 0) && out.push({ name: `${n}(${i})`, value: show(v) }));
    return out.slice(0, 60);
  }
}

export interface BasicRun {
  status: BasicStatus;
  output: string;
  fault: BasicFault | null;
  ticks: number;
  facts: BasicFacts | null;
}

/**
 * Runs a program to the end, answering each INPUT from `values` (one value per
 * variable, in order). Asking for more than there are stops it with
 * 'no-input'. This is what the marker calls.
 */
export function runBasic(source: string, values: string[] = [], opts: BasicOptions = {}): BasicRun {
  const parsed = parseBasic(source);
  if (!parsed.ok) return { status: 'error', output: '', fault: parsed.fault, ticks: 0, facts: null };
  const m = new BasicMachine(parsed.program, opts);
  let next = 0;
  for (;;) {
    const st = m.run();
    if (st !== 'input') break;
    const count = m.need?.count ?? 1;
    if (next + count > values.length) {
      m.status = 'no-input';
      break;
    }
    m.feed(values.slice(next, next + count).join(','));
    next += count;
    if (m.status === 'input') {
      // The value was refused ("Redo from start"): a marker has nothing else to give it.
      m.status = 'no-input';
      break;
    }
  }
  return { status: m.status, output: m.output, fault: m.fault, ticks: m.ticks, facts: parsed.program.facts };
}

/** Every number in a program's output, in order (.5, -1.5, 2.65359E-06 and 1E+07 included). */
export function basicNumbersIn(output: string): number[] {
  const out: number[] = [];
  const re = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output))) {
    const n = Number(m[0]);
    if (Number.isFinite(n)) out.push(n);
    if (out.length > 2000) break;
  }
  return out;
}

/** Compiles one statement for the flowchart runner, or null if it isn't valid BASIC. */
export function parseFragment(text: string): BasicProgram | null {
  const p = parseBasic(text);
  return p.ok ? p.program : null;
}

/** Compiles a condition for the flowchart runner (as `IF cond THEN`), or null. */
export function parseCondition(text: string): unknown | null {
  const p = parseBasic(`IF ${text} THEN X=1`);
  if (!p.ok) return null;
  const s = p.program.stmts[0];
  return s?.t === 'JF' ? s.e : null;
}
