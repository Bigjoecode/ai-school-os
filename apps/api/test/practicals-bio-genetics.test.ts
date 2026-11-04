// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-bio-genetics.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BIO_GENETICS,
  CROSS_N,
  FOOD_SPOTS,
  GEN_PRACTICAL_TASKS,
  bioGeneticsStateSchema,
  bioGeneticsVariant,
  crossModelState,
  crossPairs,
  discModelState,
  discRoll,
  emptyBioGeneticsState,
  foodModelState,
  heightFreq,
  heightModelState,
  heightSeen,
  heightShown,
  rubricTotal,
  type BioGeneticsState,
  type GenTask,
} from '@aischool/shared';
import { bioGeneticsGrader } from '../src/practicals/graders/bio-genetics';
import { GRADERS } from '../src/practicals/graders';

type Out = ReturnType<typeof bioGeneticsGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = BIO_GENETICS.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const WRITTEN = { precautions: 'Shoes were taken off and a set square was held flat on the head.', explain: 'Height is controlled by many genes and the environment, giving a continuous range.' };
const notes = (o: Out) => o.auto.map((c) => `${c.id} ${c.awarded}/${c.max} ${c.note}`).join(' | ');
const perfect: Record<GenTask, (seed: number) => BioGeneticsState> = {
  HEIGHT: (seed) => ({ ...heightModelState(bioGeneticsVariant(seed, 'HEIGHT')), written: WRITTEN }),
  DISCRETE: (seed) => ({ ...discModelState(bioGeneticsVariant(seed, 'DISCRETE')), written: WRITTEN }),
  CROSS: (seed) => ({ ...crossModelState(bioGeneticsVariant(seed, 'CROSS')), written: WRITTEN }),
  FOOD: (seed) => ({ ...foodModelState(bioGeneticsVariant(seed, 'FOOD')), written: WRITTEN }),
};

test('the rubric is 20 marks, registered, the lessons map to tasks and the variant is fixed by the seed', () => {
  assert.equal(rubricTotal(BIO_GENETICS.rubric), 20);
  assert.equal(GRADERS['bio-genetics'], bioGeneticsGrader);
  assert.deepEqual(GEN_PRACTICAL_TASKS, { 'pr-bio-morphological-variation': 'HEIGHT', 'pr-bio-physiological-variation': 'DISCRETE', 'pr-bio-monohybrid-probability': 'CROSS', 'pr-bio-food-chains-pyramids': 'FOOD' });
  assert.equal(JSON.stringify(bioGeneticsVariant(777, 'CROSS')), JSON.stringify(bioGeneticsVariant(777, 'CROSS')));
});

test('height: roughly normal; shoes add their heel; an eyeballed head is out; decliners exist', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const v = bioGeneticsVariant(seed, 'HEIGHT').height;
    assert.ok(v.n >= 30 && v.n <= 34);
    assert.ok(v.people.some((p) => p.declines));
    const hs = v.people.map((p) => p.h);
    const f = heightFreq(hs.map(Math.round), 'W5');
    const top = f.indexOf(Math.max(...f));
    assert.ok(top >= 1 && top <= 6, `seed ${seed} mode class ${top}`);
  }
  const v = bioGeneticsVariant(9, 'HEIGHT').height;
  let dShoe = 0;
  let dEye = 0;
  for (let n = 0; n < 200; n++) {
    const who = n % v.n;
    const good = heightShown(v, { who, kind: 'H', shoes: false, square: true, spread: true }, n, 3);
    assert.ok(Math.abs(good - v.people[who]!.h) <= 1, 'careful reading within 1 cm');
    dShoe += heightShown(v, { who, kind: 'H', shoes: true, square: true, spread: true }, n, 3) - good;
    dEye += Math.abs(heightShown(v, { who, kind: 'H', shoes: false, square: false, spread: true }, n, 3) - v.people[who]!.h);
  }
  assert.ok(dShoe / 200 > 1.8 && dShoe / 200 < 3.8, `shoes ${dShoe / 200}`);
  assert.ok(dEye / 200 > 1, `eyeball ${dEye / 200}`);
});

test('tongue rolling needs several attempts for some; cross ratios near 3 : 1, looking biases red, no return changes it', () => {
  const v = bioGeneticsVariant(4, 'DISCRETE').disc;
  const late = v.people.findIndex((p) => p.roller && p.needs > 1);
  assert.ok(late >= 0);
  assert.equal(discRoll(v, { tries: Object.assign([], { [late]: 1 }) }, late), 'N');
  assert.equal(discRoll(v, { tries: Object.assign([], { [late]: 3 }) }, late), 'R');
  let dom = 0;
  let rec = 0;
  let red = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const ps = crossPairs({ fill: 'EQUAL', draws: Array.from({ length: CROSS_N }, () => ({ blind: true, back: true })) }, seed);
    dom += ps.filter((p) => p.g !== 'tt').length;
    rec += ps.filter((p) => p.g === 'tt').length;
    red += crossPairs({ fill: 'EQUAL', draws: Array.from({ length: CROSS_N }, () => ({ blind: false, back: true })) }, seed).filter((p) => p.g !== 'tt').length;
  }
  assert.ok(Math.abs(dom / rec - 3) < 0.35, `ratio ${dom / rec}`);
  assert.ok(red > dom + 200, 'looking favours red');
  const kept = crossPairs({ fill: 'EQUAL', draws: Array.from({ length: CROSS_N }, () => ({ blind: true, back: false })) }, 5);
  assert.equal(kept.filter((p) => p.a).length, 50, 'without return each beaker empties exactly');
  assert.ok(crossPairs({ fill: 'SEPARATE', draws: [{ blind: true, back: true }] }, 5)[0]!.g === 'Tt');
});

test('a model run of every task gets full AUTO marks across 40 seeds and passes the schema', () => {
  for (const task of Object.keys(perfect) as GenTask[]) {
    for (let seed = 1; seed <= 40; seed++) {
      const s = perfect[task](seed * 7919);
      const p = bioGeneticsStateSchema.safeParse(s);
      assert.ok(p.success, `${task} schema ${seed}: ${!p.success ? p.error.message.slice(0, 300) : ''}`);
      const out = bioGeneticsGrader.grade(s, seed * 7919);
      assert.equal(autoTotal(out), AUTO_MAX, `${task} seed ${seed}: ${notes(out)}`);
      assert.equal(out.ai.length, 2);
      assert.ok(out.solution.length >= 3);
    }
  }
});

test('height mistakes lose the right marks', () => {
  const seed = 31;
  const v = bioGeneticsVariant(seed, 'HEIGHT');
  const g = (s: BioGeneticsState) => bioGeneticsGrader.grade(s, seed);
  const base = perfect.HEIGHT(seed);
  const shoes = clone(base);
  shoes.height.measures = shoes.height.measures.map((m) => ({ ...m, shoes: true }));
  assert.equal(by(g(shoes), 'procedure').awarded, 3);
  assert.ok(by(g(shoes), 'readings').awarded < 4, 'records no longer match what the board shows');
  const pushed = clone(base);
  const dec = v.height.people.findIndex((p) => p.declines);
  pushed.height.measures.push({ who: dec, kind: 'H', shoes: false, square: true, spread: true });
  assert.equal(by(g(pushed), 'procedure').awarded, 3);
  const bar = clone(base);
  bar.height.chart = 'BAR';
  bar.height.claims = ['CONT', 'GAPS'];
  assert.equal(by(g(bar), 'presentation').awarded, 2);
  assert.equal(by(g(bar), 'results').awarded, 3.5);
  const uneq = clone(base);
  uneq.height.scheme = 'UNEQUAL';
  assert.equal(by(g(uneq), 'procedure').awarded, 3.5);
  const seen = heightSeen(v.height, base.height, seed).filter((x) => x.h !== null);
  assert.ok(seen.length === v.height.people.filter((p) => !p.declines).length);
});

test('discontinuous, cross and food mistakes lose the right marks', () => {
  const seed = 52;
  const g = (s: BioGeneticsState) => bioGeneticsGrader.grade(s, seed);
  const d = clone(perfect.DISCRETE(seed));
  d.disc.tries = d.disc.tries.map(() => 1);
  d.disc.recordBy = 'NAME';
  d.disc.chartB = 'HISTOGRAM';
  const gd = g(d);
  assert.equal(by(gd, 'procedure').awarded, 2);
  assert.equal(by(gd, 'presentation').awarded, 2);

  const c = clone(perfect.CROSS(seed));
  c.cross.draws = c.cross.draws.map((x, k) => (k < 10 ? { ...x, blind: false } : x));
  c.cross.claims = ['CHANCE', 'LARGER', 'REPLACE', 'GENO31'];
  const gc = g(c);
  assert.equal(by(gc, 'procedure').awarded, 3);
  assert.ok(by(gc, 'readings').awarded <= 4);
  assert.equal(by(gc, 'results').awarded, 4.5);
  const short = clone(perfect.CROSS(seed));
  short.cross.draws = short.cross.draws.slice(0, 50);
  short.cross.rows = short.cross.rows.slice(0, 5);
  assert.equal(by(g(short), 'readings').awarded, 2);

  const f = clone(perfect.FOOD(seed));
  f.food.arrow = 'EATER_EATEN';
  f.food.chains = [['HAWK', 'LIZARD', 'GRASSHOPPER', 'GRASS'], ...f.food.chains.slice(0, 2)];
  f.food.levels.HAWK = 'C2';
  f.food.invert = 'ENERGY';
  const gf = g(f);
  assert.equal(by(gf, 'procedure').awarded, 3.5);
  assert.equal(by(gf, 'presentation').awarded, 2.5);
  assert.equal(by(gf, 'results').awarded, 4);
  const lazy = clone(perfect.FOOD(seed));
  lazy.food.visited = FOOD_SPOTS.slice(0, 4);
  lazy.food.gloves = false;
  assert.ok(by(g(lazy), 'procedure').awarded <= 2.5);
  assert.ok(by(g(lazy), 'readings').awarded < 4);
});

test('an empty state scores 0 on every task and the schema rejects garbage', () => {
  for (const task of Object.keys(perfect) as GenTask[]) {
    const s = { ...emptyBioGeneticsState(), task };
    assert.equal(autoTotal(bioGeneticsGrader.grade(s, 11)), 0, `${task}: ${notes(bioGeneticsGrader.grade(s, 11))}`);
  }
  const bad = (f: (s: BioGeneticsState) => void) => {
    const s = clone(perfect.HEIGHT(3));
    f(s);
    return bioGeneticsStateSchema.safeParse(s).success;
  };
  assert.equal(bad(() => undefined), true);
  assert.equal(bad((s) => s.height.measures.push({ who: 99, kind: 'H', shoes: false, square: true, spread: true })), false);
  assert.equal(bad((s) => ((s.cross as unknown as { fill: string }).fill = 'LOTS')), false);
  assert.equal(bad((s) => ((s.food.levels as Record<string, string>).GRASS = 'C9')), false);
  assert.equal(bad((s) => (s.written.explain = 'x'.repeat(3000))), false);
  assert.equal(bioGeneticsStateSchema.safeParse({ v: 2 }).success, false);
});

test('blood groups: O is the most common and AB rare over many classes', () => {
  const tally = { A: 0, B: 0, AB: 0, O: 0 };
  let n = 0;
  for (let seed = 1; seed <= 150; seed++) for (const p of bioGeneticsVariant(seed, 'DISCRETE').disc.people) (tally[p.group]++, n++);
  assert.ok(tally.O / n > 0.4 && tally.O / n < 0.58, `O ${tally.O / n}`);
  assert.ok(tally.AB / n > 0.02 && tally.AB / n < 0.09, `AB ${tally.AB / n}`);
  assert.ok(tally.A / n > 0.15 && tally.B / n > 0.15);
});
