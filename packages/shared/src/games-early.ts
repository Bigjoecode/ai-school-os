import { seededRandom, seededShuffle, seedOf, type EarlyGameKind } from './games';

/**
 * The early-years picture games (Count and Tap, Shapes, Letter Sounds, Tell
 * the Time, Naira Shop): generated from a seed, so they play offline and the
 * server marks a round by replaying the same seed. Every question has four
 * different options and exactly one right answer; everything shown can also
 * be read aloud (`say`).
 */

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'rectangle' | 'oval' | 'star' | 'heart' | 'diamond' | 'pentagon' | 'hexagon';

export const SHAPE_NAMES: Record<ShapeKind, string> = {
  circle: 'circle',
  square: 'square',
  triangle: 'triangle',
  rectangle: 'rectangle',
  oval: 'oval',
  star: 'star',
  heart: 'heart',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
};
const SHAPE_SIDES: Partial<Record<ShapeKind, number>> = { triangle: 3, square: 4, rectangle: 4, diamond: 4, pentagon: 5, hexagon: 6 };

/** Bright colours that read in light and dark mode, with their names (said aloud). */
export const EARLY_COLOURS = [
  { name: 'red', hex: '#ef4444' },
  { name: 'blue', hex: '#3b82f6' },
  { name: 'green', hex: '#22c55e' },
  { name: 'yellow', hex: '#eab308' },
  { name: 'purple', hex: '#a855f7' },
  { name: 'orange', hex: '#f97316' },
] as const;

export type EarlyVisual =
  | { kind: 'count'; emoji: string; n: number }
  | { kind: 'shape'; shape: ShapeKind; colour: string }
  | { kind: 'letter'; letter: string }
  | { kind: 'picture'; emoji: string; masked: string }
  | { kind: 'clock'; h: number; m: number }
  | { kind: 'shop'; items: { emoji: string; name: string; price: number }[]; paid: number | null };

export interface EarlyOption {
  /** What the option says (shown under a picture, read aloud, and the accessible name). */
  text: string;
  emoji?: string;
  shape?: ShapeKind;
  colour?: string;
  clock?: { h: number; m: number };
  /** Show only the picture (the text is still read aloud and given to screen readers). */
  pictureOnly?: boolean;
}

export interface EarlyQuestion {
  prompt: string;
  /** Read aloud (the prompt, written for the ear). */
  say: string;
  visual: EarlyVisual | null;
  options: EarlyOption[];
  /** Index of the right option. */
  answer: number;
  skill: string;
}

const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
export const nairaText = (n: number) => `₦${n.toLocaleString('en-GB')}`;

/** Three different wrong numbers near the right one, all at least `min`. */
function nearNumbers(r: () => number, right: number, step: number, min: number, likely: number[] = []): number[] {
  const out: number[] = [];
  const add = (n: number) => {
    if (n >= min && n !== right && !out.includes(n) && out.length < 3) out.push(n);
  };
  for (const n of seededShuffle(likely, r)) add(n);
  const near = seededShuffle([-1, 1, -2, 2, 3, -3, 4, -4].map((k) => right + k * step), r);
  for (const n of near) add(n);
  for (let k = 5; out.length < 3; k++) add(right + k * step);
  return out;
}

// ------------------------------------------------------------ Count and Tap

const COUNT_THINGS: [string, string, string][] = [
  ['🥭', 'mango', 'mangoes'],
  ['🍊', 'orange', 'oranges'],
  ['🍌', 'banana', 'bananas'],
  ['⚽', 'ball', 'balls'],
  ['🐐', 'goat', 'goats'],
  ['🐔', 'chicken', 'chickens'],
  ['⭐', 'star', 'stars'],
  ['🚗', 'car', 'cars'],
  ['🐟', 'fish', 'fish'],
  ['🌽', 'maize cob', 'maize cobs'],
  ['🦋', 'butterfly', 'butterflies'],
  ['✏️', 'pencil', 'pencils'],
  ['🍎', 'apple', 'apples'],
  ['🐞', 'ladybird', 'ladybirds'],
  ['🌸', 'flower', 'flowers'],
  ['🥚', 'egg', 'eggs'],
  ['🐢', 'tortoise', 'tortoises'],
  ['🎈', 'balloon', 'balloons'],
];

function countQuestion(r: () => number, year: number): Omit<EarlyQuestion, 'answer'> & { right: number } {
  const max = year <= 1 ? 10 : 20;
  const [emoji, , plural] = pick(r, COUNT_THINGS);
  const n = int(r, year <= 1 ? 1 : 3, max);
  const wrong = nearNumbers(r, n, 1, 1);
  const prompt = `How many ${plural}?`;
  return { prompt, say: `Count the ${plural}. How many ${plural} can you see?`, visual: { kind: 'count', emoji, n }, options: [n, ...wrong].map((x) => ({ text: String(x) })), right: 0, skill: 'Counting' };
}

// ------------------------------------------------------------ Shapes

const BASIC_SHAPES: ShapeKind[] = ['circle', 'square', 'triangle', 'rectangle', 'oval', 'star', 'heart'];
const MORE_SHAPES: ShapeKind[] = ['diamond', 'pentagon', 'hexagon'];
/** Shapes that look alike side by side: never both in one question's options for the youngest. */
const LOOKALIKE: [ShapeKind, ShapeKind][] = [
  ['circle', 'oval'],
  ['square', 'diamond'],
  ['pentagon', 'hexagon'],
];
const article = (w: string) => (/^[aeiou]/.test(w) ? 'an' : 'a');

function shapeQuestion(r: () => number, year: number, early: boolean): Omit<EarlyQuestion, 'answer'> & { right: number } {
  const set = early || year <= 1 ? BASIC_SHAPES : [...BASIC_SHAPES, ...MORE_SHAPES];
  const target = pick(r, set);
  const strict = early || year <= 1;
  const others = seededShuffle(
    set.filter((s) => s !== target && !(strict && LOOKALIKE.some(([a, b]) => (a === target && b === s) || (b === target && a === s)))),
    r,
  ).slice(0, 3);
  const colours = seededShuffle(EARLY_COLOURS, r);
  const variant = !early && year >= 2 && SHAPE_SIDES[target] && r() < 0.3 ? 'sides' : r() < (early ? 0.75 : 0.5) ? 'tap' : 'name';
  if (variant === 'sides') {
    const sides = SHAPE_SIDES[target]!;
    const wrong = nearNumbers(r, sides, 1, 2, [3, 4, 5, 6, 8].filter((x) => x !== sides));
    const colour = colours[0]!;
    return {
      prompt: `How many sides does this ${SHAPE_NAMES[target]} have?`,
      say: `How many sides does this ${SHAPE_NAMES[target]} have?`,
      visual: { kind: 'shape', shape: target, colour: colour.hex },
      options: [sides, ...wrong].map((x) => ({ text: String(x) })),
      right: 0,
      skill: 'Sides of shapes',
    };
  }
  if (variant === 'tap') {
    return {
      prompt: `Tap the ${SHAPE_NAMES[target]}.`,
      say: `Can you find the ${SHAPE_NAMES[target]}? Tap the ${SHAPE_NAMES[target]}.`,
      visual: null,
      options: [target, ...others].map((s, k) => ({ text: SHAPE_NAMES[s], shape: s, colour: colours[k % colours.length]!.hex, pictureOnly: true })),
      right: 0,
      skill: 'Naming shapes',
    };
  }
  return {
    prompt: 'What shape is this?',
    say: 'What shape is this?',
    visual: { kind: 'shape', shape: target, colour: colours[0]!.hex },
    options: [target, ...others].map((s) => ({ text: `${article(SHAPE_NAMES[s])} ${SHAPE_NAMES[s]}` })),
    right: 0,
    skill: 'Naming shapes',
  };
}

// ------------------------------------------------------------ Letter Sounds

/**
 * Words with a picture, grouped by the sound they start with (not the letter:
 * "cat" and "kite" both start with /k/). Only words whose first letter makes
 * its usual short sound: no "phone", "ship", "giraffe" or "unicorn".
 * Emoji are from Unicode 12 or earlier so older phones show them.
 */
export const LETTER_WORDS: { sound: string; word: string; emoji: string }[] = [
  ...(
    [
      ['a', 'ant', '🐜'],
      ['a', 'apple', '🍎'],
      ['a', 'axe', '🪓'],
      ['b', 'ball', '⚽'],
      ['b', 'banana', '🍌'],
      ['b', 'bus', '🚌'],
      ['b', 'bed', '🛏️'],
      ['b', 'bird', '🐦'],
      ['b', 'book', '📖'],
      ['b', 'bread', '🍞'],
      ['k', 'cat', '🐱'],
      ['k', 'car', '🚗'],
      ['k', 'cake', '🎂'],
      ['k', 'cup', '☕'],
      ['k', 'kite', '🪁'],
      ['k', 'key', '🔑'],
      ['k', 'corn', '🌽'],
      ['d', 'dog', '🐶'],
      ['d', 'drum', '🥁'],
      ['d', 'duck', '🦆'],
      ['d', 'door', '🚪'],
      ['e', 'egg', '🥚'],
      ['e', 'elephant', '🐘'],
      ['f', 'fish', '🐟'],
      ['f', 'frog', '🐸'],
      ['f', 'fire', '🔥'],
      ['f', 'foot', '🦶'],
      ['f', 'flower', '🌸'],
      ['g', 'goat', '🐐'],
      ['g', 'girl', '👧'],
      ['g', 'gift', '🎁'],
      ['g', 'guitar', '🎸'],
      ['g', 'grapes', '🍇'],
      ['h', 'hat', '🎩'],
      ['h', 'house', '🏠'],
      ['h', 'hen', '🐔'],
      ['h', 'horse', '🐴'],
      ['h', 'hand', '✋'],
      ['j', 'jeans', '👖'],
      ['j', 'juice', '🧃'],
      ['j', 'jacket', '🧥'],
      ['l', 'lion', '🦁'],
      ['l', 'leaf', '🍃'],
      ['l', 'lemon', '🍋'],
      ['l', 'lock', '🔒'],
      ['l', 'leg', '🦵'],
      ['m', 'mango', '🥭'],
      ['m', 'moon', '🌙'],
      ['m', 'milk', '🥛'],
      ['m', 'mouse', '🐭'],
      ['m', 'monkey', '🐒'],
      ['n', 'nose', '👃'],
      ['n', 'nut', '🥜'],
      ['n', 'net', '🥅'],
      ['o', 'octopus', '🐙'],
      ['o', 'ox', '🐂'],
      ['p', 'pen', '🖊️'],
      ['p', 'pig', '🐷'],
      ['p', 'pear', '🍐'],
      ['p', 'pineapple', '🍍'],
      ['p', 'parrot', '🦜'],
      ['p', 'panda', '🐼'],
      ['r', 'rabbit', '🐰'],
      ['r', 'rain', '🌧️'],
      ['r', 'ring', '💍'],
      ['r', 'rocket', '🚀'],
      ['r', 'robot', '🤖'],
      ['s', 'sun', '☀️'],
      ['s', 'sock', '🧦'],
      ['s', 'star', '⭐'],
      ['s', 'snake', '🐍'],
      ['s', 'spoon', '🥄'],
      ['t', 'tree', '🌳'],
      ['t', 'tomato', '🍅'],
      ['t', 'train', '🚆'],
      ['t', 'tiger', '🐯'],
      ['t', 'tooth', '🦷'],
      ['t', 'tent', '⛺'],
      ['u', 'umbrella', '☂️'],
      ['u', 'up', '⬆️'],
      ['v', 'van', '🚐'],
      ['v', 'violin', '🎻'],
      ['v', 'volcano', '🌋'],
      ['w', 'watch', '⌚'],
      ['w', 'water', '💧'],
      ['w', 'web', '🕸️'],
      ['w', 'wolf', '🐺'],
      ['y', 'yam', '🍠'],
      ['y', 'yo-yo', '🪀'],
      ['z', 'zebra', '🦓'],
      ['z', 'zero', '0️⃣'],
    ] as const
  ).map(([sound, word, emoji]) => ({ sound, word, emoji })),
];

/** The sound a letter usually makes at the start of a word (c and k share one). */
const soundOfLetter = (l: string) => (l === 'c' ? 'k' : l);
/** How the sound is read aloud (a synthetic voice says letter names, not sounds). */
const SAY_SOUND: Record<string, string> = {
  a: 'a, as in ant',
  b: 'buh',
  k: 'kuh',
  d: 'duh',
  e: 'eh',
  f: 'fff',
  g: 'guh',
  h: 'huh',
  j: 'juh',
  l: 'lll',
  m: 'mmm',
  n: 'nnn',
  o: 'o, as in octopus',
  p: 'puh',
  r: 'rrr',
  s: 'sss',
  t: 'tuh',
  u: 'uh, as in umbrella',
  v: 'vvv',
  w: 'wuh',
  y: 'yuh',
  z: 'zzz',
};

function letterQuestion(r: () => number, year: number, early: boolean): Omit<EarlyQuestion, 'answer'> & { right: number } {
  const target = pick(r, LETTER_WORDS);
  const letter = target.word[0]!;
  const otherSound = LETTER_WORDS.filter((w) => w.sound !== target.sound);
  if (!early && year >= 2 && r() < 0.4) {
    // Which letter does it start with? (The word is shown with its first letter hidden.)
    const letters = [...new Set(LETTER_WORDS.map((w) => w.word[0]!))].filter((l) => soundOfLetter(l) !== target.sound);
    const wrong = seededShuffle(letters, r).slice(0, 3);
    return {
      prompt: `Which letter does “${target.word}” start with?`,
      say: `${target.word}. Which letter does ${target.word} start with?`,
      visual: { kind: 'picture', emoji: target.emoji, masked: `_${target.word.slice(1)}` },
      options: [letter, ...wrong].map((l) => ({ text: l })),
      right: 0,
      skill: 'First letters',
    };
  }
  const wrong: typeof LETTER_WORDS = [];
  for (const w of seededShuffle(otherSound, r)) {
    if (wrong.length === 3) break;
    // Three different sounds among the wrong ones, so no two look like a pattern.
    if (!wrong.some((x) => x.sound === w.sound)) wrong.push(w);
  }
  return {
    prompt: `Which word starts with the sound /${letter}/?`,
    say: `Which word starts with the sound ${SAY_SOUND[target.sound] ?? letter}?`,
    visual: { kind: 'letter', letter },
    options: [target, ...wrong].map((w) => ({ text: w.word, emoji: w.emoji })),
    right: 0,
    skill: 'Letter sounds',
  };
}

// ------------------------------------------------------------ Tell the Time

/** "3 o'clock", "half past 3", "quarter past 3", "quarter to 4". */
export function timeText(h: number, m: number): string {
  const next = (h % 12) + 1;
  if (m === 0) return `${h} o’clock`;
  if (m === 30) return `half past ${h}`;
  if (m === 15) return `quarter past ${h}`;
  if (m === 45) return `quarter to ${next}`;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function timeQuestion(r: () => number, year: number): Omit<EarlyQuestion, 'answer'> & { right: number } {
  const minutes = year <= 2 ? [0, 30] : [0, 15, 30, 45];
  const h = int(r, 1, 12);
  const m = pick(r, minutes);
  const key = (x: { h: number; m: number }) => `${x.h}:${x.m}`;
  const wrong: { h: number; m: number }[] = [];
  const add = (x: { h: number; m: number }) => {
    if (wrong.length < 3 && key(x) !== key({ h, m }) && !wrong.some((w) => key(w) === key(x))) wrong.push(x);
  };
  const wrap = (x: number) => ((x - 1 + 12) % 12) + 1;
  // Likely mistakes: the hour next door, the other half of the hour, the hands read the wrong way round.
  const likely = seededShuffle(
    [
      { h: wrap(h + 1), m },
      { h: wrap(h - 1), m },
      ...minutes.filter((x) => x !== m).map((x) => ({ h, m: x })),
      // The hour hand on 3 read as the minutes: "quarter past 12" for 3 o’clock.
      ...(m === 0 && h !== 12 && minutes.includes((h * 5) % 60) ? [{ h: 12, m: (h * 5) % 60 }] : []),
    ],
    r,
  );
  for (const x of likely) add(x);
  for (let k = 2; wrong.length < 3; k++) add({ h: wrap(h + k), m: pick(r, minutes) });
  const all = [{ h, m }, ...wrong];
  if (r() < 0.5) {
    return { prompt: 'What time is it?', say: 'Look at the clock. What time is it?', visual: { kind: 'clock', h, m }, options: all.map((x) => ({ text: timeText(x.h, x.m) })), right: 0, skill: m === 0 || m === 30 ? 'O’clock and half past' : 'Quarter past and quarter to' };
  }
  return {
    prompt: `Which clock shows ${timeText(h, m)}?`,
    say: `Which clock shows ${timeText(h, m).replace('’', '')}?`,
    visual: null,
    options: all.map((x) => ({ text: timeText(x.h, x.m), clock: x, pictureOnly: true })),
    right: 0,
    skill: m === 0 || m === 30 ? 'O’clock and half past' : 'Quarter past and quarter to',
  };
}

// ------------------------------------------------------------ Naira Shop

const SHOP: [string, string][] = [
  ['🍬', 'sweet'],
  ['🍪', 'biscuit'],
  ['🥤', 'drink'],
  ['🍞', 'loaf of bread'],
  ['🍌', 'banana'],
  ['🥚', 'egg'],
  ['✏️', 'pencil'],
  ['📒', 'exercise book'],
  ['🍊', 'orange'],
  ['🥜', 'pack of groundnuts'],
  ['🧃', 'juice'],
  ['🍭', 'lollipop'],
  ['🥭', 'mango'],
  ['🍫', 'chocolate'],
];

function shopQuestion(r: () => number, year: number): Omit<EarlyQuestion, 'answer'> & { right: number } {
  const n = year <= 2 ? 2 : int(r, 2, 3);
  const things = seededShuffle(SHOP, r).slice(0, n);
  const step = year <= 1 ? 5 : year === 2 ? 5 : year === 3 ? 10 : 50;
  const hi = year <= 1 ? 20 : year === 2 ? 50 : year === 3 ? 200 : 500;
  const items = things.map(([emoji, name]) => ({ emoji, name, price: int(r, 1, hi / step) * step }));
  const total = items.reduce((a, x) => a + x.price, 0);
  const list = items.map((x) => `${article(x.name)} ${x.name} for ${nairaText(x.price)}`);
  const said = `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  // Primary 3–4: sometimes the change from a note.
  if (year >= 3 && r() < 0.5) {
    const paid = [50, 100, 200, 500, 1000, 2000].find((x) => x > total)!;
    const change = paid - total;
    const wrong = nearNumbers(r, change, step, step, [total, paid - total + step, Math.abs(change - step)].filter((x) => x > 0));
    return {
      prompt: `You buy these and pay with ${nairaText(paid)}. How much change do you get?`,
      say: `You buy ${said}. You pay with ${nairaText(paid)}. How much change do you get?`,
      visual: { kind: 'shop', items, paid },
      options: [change, ...wrong].map((x) => ({ text: nairaText(x) })),
      right: 0,
      skill: 'Giving change',
    };
  }
  const wrong = nearNumbers(r, total, step, step, [total + step, total - step, ...items.map((x) => x.price)]);
  return {
    prompt: 'How much do these cost altogether?',
    say: `You buy ${said}. How much is that altogether?`,
    visual: { kind: 'shop', items, paid: null },
    options: [total, ...wrong].map((x) => ({ text: nairaText(x) })),
    right: 0,
    skill: 'Adding money',
  };
}

// ------------------------------------------------------------ a round

/**
 * The questions of an early-years round: the same game, seed and year give the
 * same questions on every device and on the server. `early` (nursery classes)
 * keeps to the simplest kinds of question.
 */
export function earlyRound(game: EarlyGameKind, seed: number, year: number, count: number, early = false): EarlyQuestion[] {
  const r = seededRandom((seed ^ seedOf(game)) >>> 0);
  const out: EarlyQuestion[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    let q: ReturnType<typeof countQuestion> | null = null;
    // A question just like an earlier one in the round: try again (a few times).
    for (let t = 0; t < 6; t++) {
      q =
        game === 'COUNT_TAP'
          ? countQuestion(r, year)
          : game === 'SHAPES'
            ? shapeQuestion(r, year, early)
            : game === 'LETTER_SOUNDS'
              ? letterQuestion(r, year, early)
              : game === 'TELL_TIME'
                ? timeQuestion(r, year)
                : shopQuestion(r, year);
      const key = `${q.prompt}|${JSON.stringify(q.visual)}`;
      if (!seen.has(key)) {
        seen.add(key);
        break;
      }
    }
    const order = seededShuffle(
      q!.options.map((_, k) => k),
      r,
    );
    out.push({ prompt: q!.prompt, say: q!.say, visual: q!.visual, options: order.map((k) => q!.options[k]!), answer: order.indexOf(q!.right), skill: q!.skill });
  }
  return out;
}
