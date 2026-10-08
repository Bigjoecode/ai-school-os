import { seededRandom, seededShuffle } from './games';

/**
 * Word Search and Crossword: built from a seed and a word list, so the same
 * puzzle appears on the device (even offline) and on the server, which marks
 * a round by building it again. Every word is placed (the puzzle can always be
 * solved) and, in a word search, appears exactly once.
 */

export interface PuzzleWord {
  /** Upper case, letters only. */
  word: string;
  clue: string;
  subject: string | null;
}

/** Letters only, upper case ("Yo-yo" and "Kano State" aren't usable). */
export const puzzleForm = (w: string) => (/^[A-Za-z]+$/.test(w.trim()) ? w.trim().toUpperCase() : null);

// ------------------------------------------------------------ word search

export type Direction = readonly [number, number];
export const DIRS_YOUNG: Direction[] = [
  [0, 1],
  [1, 0],
];
export const DIRS_PRIMARY: Direction[] = [
  [0, 1],
  [1, 0],
  [1, 1],
];
export const DIRS_ALL: Direction[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [1, -1],
];

export interface WordSearchPuzzle {
  title: string;
  size: number;
  /** One string per row. */
  grid: string[];
  words: { word: string; clue: string; subject: string | null; r: number; c: number; dr: number; dc: number }[];
}

const ALPHABET = 'ABCDEFGHIJKLMNOPRSTUWY';
const ALL_DIRS: Direction[] = DIRS_ALL;

/** Each place a word appears (any of the 8 directions); a palindrome's two readings count once. */
export function findInGrid(grid: string[], word: string): { r: number; c: number; dr: number; dc: number }[] {
  const n = grid.length;
  const out: { r: number; c: number; dr: number; dc: number }[] = [];
  const keys = new Set<string>();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r]![c] !== word[0]) continue;
      for (const [dr, dc] of ALL_DIRS) {
        const er = r + dr * (word.length - 1);
        const ec = c + dc * (word.length - 1);
        if (er < 0 || ec < 0 || er >= n || ec >= n) continue;
        let ok = true;
        for (let k = 1; k < word.length && ok; k++) ok = grid[r + dr * k]![c + dc * k] === word[k];
        if (!ok) continue;
        const a = `${r},${c}`;
        const b = `${er},${ec}`;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (keys.has(key)) continue;
        keys.add(key);
        out.push({ r, c, dr, dc });
      }
    }
  }
  return out;
}

/** The letters along a straight line from (r0, c0) to (r1, c1), or null if it isn't a straight line in the grid. */
export function lineLetters(grid: string[], r0: number, c0: number, r1: number, c1: number): string | null {
  const n = grid.length;
  if ([r0, c0, r1, c1].some((x) => x < 0 || x >= n)) return null;
  const dr = Math.sign(r1 - r0);
  const dc = Math.sign(c1 - c0);
  const len = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  if (r1 - r0 !== dr * len || c1 - c0 !== dc * len || len === 0) return null;
  let s = '';
  for (let k = 0; k <= len; k++) s += grid[r0 + dr * k]![c0 + dc * k];
  return s;
}

/**
 * A word search: `count` words (fewer only if the list is too short) placed in
 * a size × size grid in the given directions, the rest filled with letters,
 * and checked so each word appears exactly once and no word hides inside another.
 */
export function buildWordSearch(seed: number, pool: PuzzleWord[], opts: { size: number; count: number; dirs: Direction[]; title: string }): WordSearchPuzzle {
  const r = seededRandom(seed);
  const { size, dirs } = opts;
  const usable = pool.filter((w) => w.word.length >= 3 && w.word.length <= size);
  const count = Math.min(opts.count, usable.length);
  for (let attempt = 0; attempt < 60; attempt++) {
    const cells: (string | null)[][] = Array.from({ length: size }, () => Array<string | null>(size).fill(null));
    const placed: WordSearchPuzzle['words'] = [];
    for (const w of seededShuffle(usable, r)) {
      if (placed.length >= count) break;
      // No word inside another (forwards or backwards): each would be found twice.
      const rev = [...w.word].reverse().join('');
      if (placed.some((p) => p.word.includes(w.word) || w.word.includes(p.word) || p.word.includes(rev) || rev.includes(p.word))) continue;
      for (let t = 0; t < 120; t++) {
        const [dr, dc] = dirs[Math.floor(r() * dirs.length)]!;
        const len = w.word.length;
        const rMin = dr < 0 ? len - 1 : 0;
        const rMax = dr > 0 ? size - len : size - 1;
        const cMin = dc < 0 ? len - 1 : 0;
        const cMax = dc > 0 ? size - len : size - 1;
        if (rMax < rMin || cMax < cMin) continue;
        const r0 = rMin + Math.floor(r() * (rMax - rMin + 1));
        const c0 = cMin + Math.floor(r() * (cMax - cMin + 1));
        let ok = true;
        for (let k = 0; k < len && ok; k++) {
          const cur = cells[r0 + dr * k]![c0 + dc * k];
          ok = cur === null || cur === w.word[k];
        }
        if (!ok) continue;
        for (let k = 0; k < len; k++) cells[r0 + dr * k]![c0 + dc * k] = w.word[k]!;
        placed.push({ word: w.word, clue: w.clue, subject: w.subject, r: r0, c: c0, dr, dc });
        break;
      }
    }
    if (placed.length < count) continue;
    // Fill the gaps; if a word turns up twice by chance, fill again.
    for (let f = 0; f < 12; f++) {
      const grid = cells.map((row) => row.map((ch) => ch ?? ALPHABET[Math.floor(r() * ALPHABET.length)]!).join(''));
      if (placed.every((p) => findInGrid(grid, p.word).length === 1)) {
        return { title: opts.title, size, grid, words: [...placed].sort((a, b) => a.word.localeCompare(b.word)) };
      }
    }
  }
  // Practically unreachable (the tests try 10,000 seeds): a smaller puzzle that still works.
  if (opts.count > 3) return buildWordSearch(seed + 1, pool, { ...opts, count: opts.count - 1 });
  return { title: opts.title, size, grid: Array.from({ length: size }, () => 'A'.repeat(size)), words: [] };
}

// ------------------------------------------------------------ crossword

export interface CrosswordEntry {
  /** The clue number. */
  n: number;
  dir: 'across' | 'down';
  row: number;
  col: number;
  answer: string;
  clue: string;
}
export interface CrosswordPuzzle {
  title: string;
  rows: number;
  cols: number;
  /** Across clues by number, then down clues by number. */
  entries: CrosswordEntry[];
}

interface Placed {
  word: PuzzleWord;
  r: number;
  c: number;
  across: boolean;
}

/** The solution grid: letters, null for black squares. */
export function crosswordGrid(p: CrosswordPuzzle): (string | null)[][] {
  const g: (string | null)[][] = Array.from({ length: p.rows }, () => Array<string | null>(p.cols).fill(null));
  for (const e of p.entries) {
    for (let k = 0; k < e.answer.length; k++) {
      const r = e.row + (e.dir === 'down' ? k : 0);
      const c = e.col + (e.dir === 'across' ? k : 0);
      g[r]![c] = e.answer[k]!;
    }
  }
  return g;
}

/** The cells of an entry, in order. */
export const entryCells = (e: Pick<CrosswordEntry, 'row' | 'col' | 'dir' | 'answer'>) => Array.from({ length: e.answer.length }, (_, k) => [e.row + (e.dir === 'down' ? k : 0), e.col + (e.dir === 'across' ? k : 0)] as const);

/**
 * A small crossword: words joined where they share a letter, laid out so no
 * two words touch except where they cross (every run of two or more letters
 * is an entry). Numbered the usual way.
 */
export function buildCrossword(seed: number, pool: PuzzleWord[], opts: { min: number; max: number; maxLen: number; maxSize: number; title: string }): CrosswordPuzzle {
  const r = seededRandom(seed);
  const usable = pool.filter((w) => w.word.length >= 3 && w.word.length <= opts.maxLen);
  let best: Placed[] = [];
  for (let attempt = 0; attempt < 40 && best.length < opts.max; attempt++) {
    const order = seededShuffle(usable, r);
    // Start with one of the longer words: more letters to cross.
    const head = order.slice(0, 6).sort((a, b) => b.word.length - a.word.length)[0];
    if (!head) break;
    const placed: Placed[] = [{ word: head, r: 0, c: 0, across: r() < 0.5 }];
    const cells = new Map<string, { ch: string; across: boolean; down: boolean }>();
    const put = (p: Placed) => {
      for (let k = 0; k < p.word.word.length; k++) {
        const key = `${p.r + (p.across ? 0 : k)},${p.c + (p.across ? k : 0)}`;
        const cur = cells.get(key) ?? { ch: p.word.word[k]!, across: false, down: false };
        if (p.across) cur.across = true;
        else cur.down = true;
        cells.set(key, cur);
      }
    };
    put(placed[0]!);
    const at = (rr: number, cc: number) => cells.get(`${rr},${cc}`);
    const bounds = () => {
      let r0 = Infinity;
      let r1 = -Infinity;
      let c0 = Infinity;
      let c1 = -Infinity;
      for (const k of cells.keys()) {
        const [a, b] = k.split(',').map(Number) as [number, number];
        r0 = Math.min(r0, a);
        r1 = Math.max(r1, a);
        c0 = Math.min(c0, b);
        c1 = Math.max(c1, b);
      }
      return { r0, r1, c0, c1 };
    };
    const fits = (w: string, sr: number, sc: number, across: boolean) => {
      const dr = across ? 0 : 1;
      const dc = across ? 1 : 0;
      // The squares just before and after the word stay empty.
      if (at(sr - dr, sc - dc) || at(sr + dr * w.length, sc + dc * w.length)) return -1;
      let crossings = 0;
      for (let k = 0; k < w.length; k++) {
        const rr = sr + dr * k;
        const cc = sc + dc * k;
        const cur = at(rr, cc);
        if (cur) {
          // Only a crossing with a word the other way, on the same letter.
          if (cur.ch !== w[k] || (across ? cur.across : cur.down)) return -1;
          crossings++;
        } else if (across ? at(rr - 1, cc) || at(rr + 1, cc) : at(rr, cc - 1) || at(rr, cc + 1)) {
          // A new letter next to another word would make a two-letter run that isn't an entry.
          return -1;
        }
      }
      if (!crossings) return -1;
      const b = bounds();
      const er = sr + dr * (w.length - 1);
      const ec = sc + dc * (w.length - 1);
      if (Math.max(b.r1, er) - Math.min(b.r0, sr) + 1 > opts.maxSize || Math.max(b.c1, ec) - Math.min(b.c0, sc) + 1 > opts.maxSize) return -1;
      return crossings;
    };
    for (const w of order) {
      if (placed.length >= opts.max) break;
      if (placed.some((p) => p.word.word === w.word)) continue;
      const options: { sr: number; sc: number; across: boolean; score: number }[] = [];
      for (const p of placed) {
        for (let i = 0; i < p.word.word.length; i++) {
          for (let j = 0; j < w.word.length; j++) {
            if (p.word.word[i] !== w.word[j]) continue;
            const across = !p.across;
            const cr = p.r + (p.across ? 0 : i);
            const cc = p.c + (p.across ? i : 0);
            const sr = across ? cr : cr - j;
            const sc = across ? cc - j : cc;
            const score = fits(w.word, sr, sc, across);
            if (score > 0) options.push({ sr, sc, across, score });
          }
        }
      }
      if (!options.length) continue;
      const top = Math.max(...options.map((o) => o.score));
      const chosen = seededShuffle(
        options.filter((o) => o.score === top),
        r,
      )[0]!;
      const np: Placed = { word: w, r: chosen.sr, c: chosen.sc, across: chosen.across };
      placed.push(np);
      put(np);
    }
    if (placed.length > best.length) best = placed;
  }
  return numbered(best, opts.title);
}

function numbered(placed: Placed[], title: string): CrosswordPuzzle {
  if (!placed.length) return { title, rows: 0, cols: 0, entries: [] };
  const r0 = Math.min(...placed.map((p) => p.r));
  const c0 = Math.min(...placed.map((p) => p.c));
  const norm = placed.map((p) => ({ ...p, r: p.r - r0, c: p.c - c0 }));
  const rows = Math.max(...norm.map((p) => p.r + (p.across ? 1 : p.word.word.length)));
  const cols = Math.max(...norm.map((p) => p.c + (p.across ? p.word.word.length : 1)));
  const starts = [...new Set(norm.map((p) => `${p.r},${p.c}`))]
    .map((k) => k.split(',').map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const numberOf = new Map(starts.map(([a, b], i) => [`${a},${b}`, i + 1]));
  const entries: CrosswordEntry[] = norm.map((p) => ({ n: numberOf.get(`${p.r},${p.c}`)!, dir: p.across ? 'across' : 'down', row: p.r, col: p.c, answer: p.word.word, clue: p.word.clue }));
  entries.sort((a, b) => (a.dir === b.dir ? a.n - b.n : a.dir === 'across' ? -1 : 1));
  return { title, rows, cols, entries };
}

/**
 * Problems with a crossword (none for a good one): letters that disagree where
 * words cross, and runs of letters that aren't entries.
 */
export function crosswordProblems(p: CrosswordPuzzle): string[] {
  const out: string[] = [];
  const g: (string | null)[][] = Array.from({ length: p.rows }, () => Array<string | null>(p.cols).fill(null));
  for (const e of p.entries) {
    for (const [k, [rr, cc]] of entryCells(e).entries()) {
      if (rr >= p.rows || cc >= p.cols) out.push(`${e.answer} runs off the grid`);
      else if (g[rr]![cc] !== null && g[rr]![cc] !== e.answer[k]) out.push(`${e.answer} disagrees at ${rr},${cc}`);
      else g[rr]![cc] = e.answer[k]!;
    }
  }
  const key = (e: { row: number; col: number; dir: string }) => `${e.dir}:${e.row},${e.col}`;
  const entryAt = new Map(p.entries.map((e) => [key(e), e]));
  // Every maximal run of two or more letters, across and down, must be an entry.
  for (const dir of ['across', 'down'] as const) {
    const outer = dir === 'across' ? p.rows : p.cols;
    const inner = dir === 'across' ? p.cols : p.rows;
    for (let a = 0; a < outer; a++) {
      let start = -1;
      for (let b = 0; b <= inner; b++) {
        const ch = b < inner ? (dir === 'across' ? g[a]![b] : g[b]![a]) : null;
        if (ch && start < 0) start = b;
        if (!ch && start >= 0) {
          const len = b - start;
          if (len >= 2) {
            const row = dir === 'across' ? a : start;
            const col = dir === 'across' ? start : a;
            const e = entryAt.get(key({ row, col, dir }));
            if (!e || e.answer.length !== len) out.push(`A ${dir} run at ${row},${col} isn’t an entry`);
          }
          start = -1;
        }
      }
    }
  }
  // Numbers: each entry's number belongs to its start square, and numbers go in reading order.
  const nums = new Map<string, number>();
  for (const e of p.entries) {
    const k = `${e.row},${e.col}`;
    if (nums.has(k) && nums.get(k) !== e.n) out.push(`Two numbers at ${k}`);
    nums.set(k, e.n);
  }
  return out;
}
