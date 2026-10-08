// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/games-generators.test.ts
// (SEEDS=1000 for a quicker run.) Checks the EduGames content packs and every seeded generator:
// always solvable, exactly one right answer, the server's replay marks a perfect round as perfect.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  crosswordFor,
  crosswordProblems,
  crosswordShape,
  CURATED_QUESTIONS,
  EARLY_GAMES,
  earlyRound,
  findInGrid,
  GAME_WORDS,
  gamesContentIssues,
  gamesFor,
  gameStageOf,
  LETTER_WORDS,
  markLocalRound,
  MATCH_PACKS,
  normaliseWord,
  preferYear,
  timeText,
  TRUE_FALSE_FACTS,
  wordSearchFor,
  wordSearchShape,
  type EarlyGameKind,
  type GameLevel,
  type LocalScoreInput,
} from '../../../packages/shared/src';

const SEEDS = Number(process.env.SEEDS ?? 10_000);
const base = { clientId: 'test-client-1', playedAt: new Date().toISOString() };

test('content packs: no duplicate ids, sound questions, years in range', () => {
  assert.deepEqual(gamesContentIssues(), []);
  const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id)).size === xs.length;
  assert.ok(ids(MATCH_PACKS) && ids(TRUE_FALSE_FACTS) && ids(CURATED_QUESTIONS));
  const keys = GAME_WORDS.map((w) => `${w.level}|${normaliseWord(w.word)}`);
  assert.equal(new Set(keys).size, keys.length, 'GAME_WORDS has a word twice in one level');
});

test('stage and year: nursery is Primary 1 in young mode; games by age', () => {
  assert.deepEqual(gameStageOf('Nursery', 'Nursery 2'), { level: 'PRIMARY', year: 1, early: true, young: true });
  assert.deepEqual(gameStageOf('Nursery', 'Pre-Nursery'), { level: 'PRIMARY', year: 1, early: true, young: true });
  assert.deepEqual(gameStageOf(null, 'KG 1'), { level: 'PRIMARY', year: 1, early: true, young: true });
  assert.deepEqual(gameStageOf('Primary', 'Primary 3'), { level: 'PRIMARY', year: 3, early: false, young: true });
  assert.deepEqual(gameStageOf('Primary', 'Primary 4'), { level: 'PRIMARY', year: 4, early: false, young: false });
  assert.deepEqual(gameStageOf('Junior Secondary', 'JSS 1'), { level: 'JUNIOR', year: 1, early: false, young: false });
  assert.deepEqual(gameStageOf('Senior Secondary', 'SS 2'), { level: 'SENIOR', year: 2, early: false, young: false });
  const nursery = gamesFor({ level: 'PRIMARY', year: 1, early: true });
  assert.ok(nursery.includes('COUNT_TAP') && !nursery.includes('TELL_TIME') && !nursery.includes('CROSSWORD'));
  const p2 = gamesFor({ level: 'PRIMARY', year: 2, early: false });
  assert.ok(p2.includes('SHAPES') && p2.includes('NAIRA_SHOP'));
  const p3 = gamesFor({ level: 'PRIMARY', year: 3, early: false });
  assert.ok(!p3.includes('COUNT_TAP') && p3.includes('TELL_TIME'));
  const p5 = gamesFor({ level: 'PRIMARY', year: 5, early: false });
  assert.ok(!p5.includes('TELL_TIME') && p5.includes('CROSSWORD'));
  const jss = gamesFor({ level: 'JUNIOR', year: 1, early: false });
  assert.ok(!jss.some((g) => (EARLY_GAMES as readonly string[]).includes(g)) && jss.includes('WORD_SEARCH'));
  // Year filter: suited items first, the rest of the stage only to make up numbers.
  const xs = [{ id: 1, years: [1] }, { id: 2 }, { id: 3, years: [4, 5] }, { id: 4, years: [2] }];
  assert.deepEqual(preferYear(xs, 1, 1).map((x) => x.id), [1]);
  assert.deepEqual(preferYear(xs, 1, 2).map((x) => x.id), [1, 2]);
  assert.deepEqual(preferYear(xs, 1, 4).map((x) => x.id), [1, 2, 4, 3]);
  assert.deepEqual(preferYear(xs, 1, 3).map((x) => x.id), [1, 2, 4]);
});

const SHAPE_SIDES: Record<string, number> = { triangle: 3, square: 4, rectangle: 4, diamond: 4, pentagon: 5, hexagon: 6 };
const soundOf = (w: string) => LETTER_WORDS.find((x) => x.word === w)!.sound;
const letterSound = (l: string) => (l === 'c' ? 'k' : l);

/** Which options are right, worked out from the question itself (not from `answer`). */
function rightOptions(game: EarlyGameKind, q: ReturnType<typeof earlyRound>[number]): number[] {
  const idx = (pred: (o: (typeof q.options)[number]) => boolean) => q.options.map((o, i) => (pred(o) ? i : -1)).filter((i) => i >= 0);
  const v = q.visual;
  switch (game) {
    case 'COUNT_TAP':
      assert.equal(v?.kind, 'count');
      return idx((o) => Number(o.text) === (v as { n: number }).n);
    case 'SHAPES': {
      if (q.prompt.startsWith('Tap the ')) {
        const name = q.prompt.slice(8, -1);
        return idx((o) => o.shape === name);
      }
      assert.equal(v?.kind, 'shape');
      const shape = (v as { shape: string }).shape;
      if (q.prompt.startsWith('How many sides')) return idx((o) => Number(o.text) === SHAPE_SIDES[shape]);
      return idx((o) => o.text.split(' ').at(-1) === shape);
    }
    case 'LETTER_SOUNDS': {
      if (v?.kind === 'letter') return idx((o) => soundOf(o.text) === letterSound(v.letter));
      assert.equal(v?.kind, 'picture');
      const word = LETTER_WORDS.find((w) => `_${w.word.slice(1)}` === (v as { masked: string }).masked && w.emoji === (v as { emoji: string }).emoji)!;
      return idx((o) => letterSound(o.text) === word.sound);
    }
    case 'TELL_TIME': {
      if (v?.kind === 'clock') return idx((o) => o.text === timeText(v.h, v.m));
      const said = q.prompt.replace('Which clock shows ', '').replace('?', '');
      return idx((o) => !!o.clock && timeText(o.clock.h, o.clock.m) === said);
    }
    case 'NAIRA_SHOP': {
      assert.equal(v?.kind, 'shop');
      const shop = v as { items: { price: number }[]; paid: number | null };
      const total = shop.items.reduce((a, x) => a + x.price, 0);
      const want = shop.paid === null ? total : shop.paid - total;
      assert.ok(want > 0);
      return idx((o) => Number(o.text.replace(/[₦,]/g, '')) === want);
    }
  }
}

for (const game of EARLY_GAMES) {
  test(`${game}: ${SEEDS} seeds, four different options, exactly one right answer, replay marks it`, () => {
    const configs = game === 'TELL_TIME' || game === 'NAIRA_SHOP' ? [1, 2, 3, 4].map((y) => ({ year: y, early: false })) : [{ year: 1, early: true }, { year: 1, early: false }, { year: 2, early: false }];
    for (let s = 0; s < SEEDS; s++) {
      const { year, early } = configs[s % configs.length]!;
      const seed = (s * 2654435761) >>> 0;
      const qs = earlyRound(game, seed, year, 10, early);
      assert.equal(qs.length, 10);
      for (const q of qs) {
        assert.equal(q.options.length, 4, `${game} seed ${seed}: ${q.prompt}`);
        const keys = q.options.map((o) => `${o.text}|${o.shape ?? ''}|${o.clock ? `${o.clock.h}:${o.clock.m}` : ''}`);
        assert.equal(new Set(keys).size, 4, `${game} seed ${seed}: options repeat in "${q.prompt}": ${keys.join(', ')}`);
        assert.equal(new Set(q.options.map((o) => o.text)).size, 4, `${game} seed ${seed}: option texts repeat`);
        assert.ok(q.answer >= 0 && q.answer < 4);
        const right = rightOptions(game, q);
        assert.deepEqual(right, [q.answer], `${game} seed ${seed} year ${year}: "${q.prompt}" right=${right} answer=${q.answer} ${JSON.stringify(q)}`);
        assert.ok(q.say.length > 0);
        if (game === 'COUNT_TAP') {
          const n = (q.visual as { n: number }).n;
          assert.ok(n >= 1 && n <= (year <= 1 ? 10 : 20));
        }
        if (game === 'TELL_TIME' && year <= 2) assert.ok(q.options.every((o) => !/quarter/.test(o.text)));
      }
      if (s % 50 === 0) {
        const input = { ...base, game, durationMs: 10 * 3000, seed, year, early, answers: qs.map((q) => ({ choice: q.answer, ms: 3000 })) } as LocalScoreInput;
        const m = markLocalRound(input);
        assert.equal(m.implausible, null);
        assert.equal(m.correct, 10);
        // Slow is fine (a young child): ten minutes on ten questions still counts.
        const slow = markLocalRound({ ...input, durationMs: 10 * 60_000, answers: qs.map((q) => ({ choice: q.answer, ms: 110_000 })) } as LocalScoreInput);
        assert.equal(slow.implausible, null);
        // Impossibly fast is not.
        const fast = markLocalRound({ ...input, durationMs: 1000, answers: qs.map((q) => ({ choice: q.answer, ms: 50 })) } as LocalScoreInput);
        assert.notEqual(fast.implausible, null);
      }
    }
  });
}

const PUZZLE_CONFIGS: { level: GameLevel; year: number; young: boolean }[] = [
  { level: 'PRIMARY', year: 1, young: true },
  { level: 'PRIMARY', year: 3, young: true },
  { level: 'PRIMARY', year: 5, young: false },
  { level: 'JUNIOR', year: 2, young: false },
  { level: 'SENIOR', year: 2, young: false },
];

test(`Word Search: ${SEEDS} seeds, every word placed once, directions by age, replay marks it`, () => {
  for (let s = 0; s < SEEDS; s++) {
    const cfg = PUZZLE_CONFIGS[s % PUZZLE_CONFIGS.length]!;
    const seed = (s * 2246822519 + 7) >>> 0;
    const pz = wordSearchFor(seed, cfg.level, cfg.year, cfg.young);
    const shape = wordSearchShape(cfg.level, cfg.young);
    assert.equal(pz.size, shape.size);
    assert.equal(pz.grid.length, shape.size);
    assert.ok(pz.grid.every((row) => row.length === shape.size && /^[A-Z]+$/.test(row)));
    assert.equal(pz.words.length, shape.words, `${JSON.stringify(cfg)} seed ${seed}: ${pz.words.length} words`);
    assert.equal(new Set(pz.words.map((w) => w.word)).size, pz.words.length);
    for (const w of pz.words) {
      assert.ok(shape.dirs.some(([dr, dc]) => dr === w.dr && dc === w.dc), `direction ${w.dr},${w.dc} not allowed`);
      const at = findInGrid(pz.grid, w.word);
      assert.equal(at.length, 1, `${w.word} appears ${at.length} times (seed ${seed})`);
      for (let k = 0; k < w.word.length; k++) assert.equal(pz.grid[w.r + w.dr * k]![w.c + w.dc * k], w.word[k]);
      assert.ok(w.clue.length > 0);
    }
    if (s % 25 === 0) {
      const found = pz.words.map((w) => ({ r0: w.r, c0: w.c, r1: w.r + w.dr * (w.word.length - 1), c1: w.c + w.dc * (w.word.length - 1), ms: 4000 }));
      // Lines drawn backwards count too.
      if (found[0]) [found[0].r0, found[0].c0, found[0].r1, found[0].c1] = [found[0].r1, found[0].c1, found[0].r0, found[0].c0];
      const m = markLocalRound({ ...base, game: 'WORD_SEARCH', durationMs: found.length * 4000, seed, ...cfg, found });
      assert.equal(m.implausible, null);
      assert.equal(m.correct, pz.words.length);
      const twice = markLocalRound({ ...base, game: 'WORD_SEARCH', durationMs: 60_000, seed, ...cfg, found: [found[1]!, found[1]!] });
      assert.notEqual(twice.implausible, null);
    }
  }
});

test(`Crossword: ${SEEDS} seeds, 5–8 words, letters agree where words cross, replay marks it`, () => {
  for (let s = 0; s < SEEDS; s++) {
    const cfg = PUZZLE_CONFIGS[s % PUZZLE_CONFIGS.length]!;
    const seed = (s * 3266489917 + 11) >>> 0;
    const pz = crosswordFor(seed, cfg.level, cfg.year, cfg.young);
    const shape = crosswordShape(cfg.young);
    assert.ok(pz.entries.length >= shape.min && pz.entries.length <= shape.max, `${JSON.stringify(cfg)} seed ${seed}: ${pz.entries.length} entries`);
    assert.ok(pz.rows <= shape.maxSize && pz.cols <= shape.maxSize);
    assert.deepEqual(crosswordProblems(pz), [], `seed ${seed}`);
    assert.equal(new Set(pz.entries.map((e) => e.answer)).size, pz.entries.length);
    for (const e of pz.entries) {
      assert.ok(e.answer.length >= 3 && e.answer.length <= shape.maxLen && /^[A-Z]+$/.test(e.answer));
      assert.ok(e.clue.length > 0 && !e.clue.toUpperCase().split(/[^A-Z]+/).includes(e.answer), `clue gives away ${e.answer}`);
    }
    if (s % 25 === 0) {
      const m = markLocalRound({ ...base, game: 'CROSSWORD', durationMs: 120_000, seed, ...cfg, entries: pz.entries.map((e) => e.answer.toLowerCase()), hints: 0 });
      assert.equal(m.implausible, null);
      assert.equal(m.correct, pz.entries.length);
      const wrong = markLocalRound({ ...base, game: 'CROSSWORD', durationMs: 120_000, seed, ...cfg, entries: pz.entries.map(() => 'x'), hints: 0 });
      assert.equal(wrong.correct, 0);
    }
  }
});

test('Maths Sprint young mode: ten questions with no clock', () => {
  const answers = Array.from({ length: 10 }, () => ({ choice: 0, ms: 30_000 }));
  const young = markLocalRound({ ...base, game: 'MATHS_SPRINT', durationMs: 300_000, seed: 42, level: 'PRIMARY', year: 1, young: true, answers });
  assert.equal(young.implausible, null);
  const old = markLocalRound({ ...base, game: 'MATHS_SPRINT', durationMs: 300_000, seed: 42, level: 'PRIMARY', year: 1, answers });
  assert.notEqual(old.implausible, null);
});
