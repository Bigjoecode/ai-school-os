// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-bio-human.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BIO_HUMAN,
  HUMAN_PRACTICAL_TASKS,
  REACT_CONDS,
  SKIN_AREAS,
  bioHumanStateSchema,
  bioHumanVariant,
  breathModelState,
  emptyBioHumanState,
  limeTurbidity,
  pulseModelState,
  pulseRate,
  pulseSeen,
  reactDropShown,
  reactModelState,
  reactSeen,
  reactTime,
  rubricTotal,
  skinModelState,
  skinPTwo,
  skinSeen,
  type BioHumanState,
} from '@aischool/shared';
import { bioHumanGrader } from '../src/practicals/graders/bio-human';
import { GRADERS } from '../src/practicals/graders';

type Out = ReturnType<typeof bioHumanGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = BIO_HUMAN.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const WRITTEN = { precautions: 'My partner rested for 5 minutes first; I used two fingertips, not the thumb.', explain: 'The muscles need more oxygen and glucose for respiration and must remove carbon dioxide.' };
const notes = (o: Out) => o.auto.map((c) => `${c.id} ${c.awarded}/${c.max} ${c.note}`).join(' | ');

const perfect = {
  PULSE: (seed: number) => ({ ...pulseModelState(bioHumanVariant(seed, 'PULSE')), written: WRITTEN }),
  BREATH: (seed: number) => ({ ...breathModelState(bioHumanVariant(seed, 'BREATH')), written: WRITTEN }),
  REACTION: (seed: number) => ({ ...reactModelState(bioHumanVariant(seed, 'REACTION')), written: WRITTEN }),
  SKIN: (seed: number) => ({ ...skinModelState(bioHumanVariant(seed, 'SKIN')), written: WRITTEN }),
};

test('the rubric is 20 marks, registered, and the variant is the same for a seed', () => {
  assert.equal(rubricTotal(BIO_HUMAN.rubric), 20);
  assert.equal(GRADERS['bio-human'], bioHumanGrader);
  assert.deepEqual(HUMAN_PRACTICAL_TASKS, { 'pr-bio-pulse-exercise': 'PULSE', 'pr-bio-exhaled-air': 'BREATH', 'pr-bio-reaction-time': 'REACTION', 'pr-bio-skin-two-point': 'SKIN' });
  assert.equal(JSON.stringify(bioHumanVariant(777, 'SKIN')), JSON.stringify(bioHumanVariant(777, 'SKIN')));
  for (let seed = 1; seed <= 200; seed++) {
    const v = bioHumanVariant(seed, 'SKIN').skin.thr;
    assert.ok(v.FINGERTIP < v.PALM && v.PALM < v.BACK_HAND && v.BACK_HAND < v.FOREARM, `seed ${seed}`);
  }
});

test('pulse: settles on sitting, rises with exercise and falls back gradually; the thumb adds beats', () => {
  const v = bioHumanVariant(42, 'PULSE').pulse;
  const w = { exercise: { at: 7, min: 2 } };
  assert.ok(pulseRate(v, w, 0) > pulseRate(v, w, 5) + 8, 'walked in');
  assert.ok(Math.abs(pulseRate(v, w, 6) - v.rest) < 1.5);
  assert.ok(pulseRate(v, w, 9) > v.rest + 40, 'peak');
  assert.ok(pulseRate(v, w, 10) < pulseRate(v, w, 9) && pulseRate(v, w, 10) > v.rest + 15, 'gradual');
  assert.ok(pulseRate(v, w, 17) < v.rest + 4, 'recovered');
  const counts = Array.from({ length: 20 }, (_, k) => ({ at: 5 + k * 0.01, dur: 15 as const, thumb: false }));
  const plain = pulseSeen(v, { exercise: null, counts }, 9).map((x) => x.beats);
  const thumb = pulseSeen(v, { exercise: null, counts: counts.map((c) => ({ ...c, thumb: true })) }, 9).map((x) => x.beats);
  assert.ok(thumb.reduce((a, b) => a + b, 0) > plain.reduce((a, b) => a + b, 0) + 20);
  for (const b of plain) assert.ok(Math.abs(b * 4 - v.rest) <= 12, `rest count ${b}`);
});

test('exhaled air: B turns milky ~100× sooner than A; reaction: practice, hands and t = √(2d/g); skin: psychometric', () => {
  const bv = bioHumanVariant(5, 'BREATH').breath;
  const w = { lime: 'EQUAL' as const, breaths: [{ n: 10, hard: false }] };
  assert.ok(limeTurbidity(bv, w, 'B') >= 0.5 && limeTurbidity(bv, w, 'A') < 0.1);
  assert.ok(Math.abs(reactTime(18) - 0.1917) < 0.001);
  const v = bioHumanVariant(5, 'REACTION');
  const s = reactModelState(v).react;
  const seen = reactSeen(v.react, s, v.seed);
  const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(m(seen.DOM) > 8 && m(seen.DOM) < 25, `dom ${m(seen.DOM)}`);
  assert.ok(m(seen.NONDOM) > m(seen.DOM.slice(0, 5)) - 1);
  const warned = { ...s, drops: [{ cond: 'DOM' as const, warn: true }] };
  assert.ok(reactDropShown(v.react, warned, 0, v.seed) < 5, 'anticipated');
  const sk = bioHumanVariant(5, 'SKIN').skin;
  assert.ok(skinPTwo(sk, { area: 'FINGERTIP', sep: 10, blind: true, stag: false }) > 0.9);
  assert.ok(skinPTwo(sk, { area: 'FOREARM', sep: 10, blind: true, stag: false }) < 0.1);
  assert.ok(skinPTwo(sk, { area: 'FOREARM', sep: 0, blind: true, stag: false }) < 0.1);
  const ss = skinModelState(bioHumanVariant(5, 'SKIN'));
  const e = skinSeen(sk, ss.skin, 5);
  for (const a of SKIN_AREAS) assert.ok(e[a].thr !== null && Math.abs(e[a].thr! - sk.thr[a]) <= Math.max(3, 0.25 * sk.thr[a]), `${a} ${e[a].thr} vs ${sk.thr[a]}`);
});

for (const task of ['PULSE', 'BREATH', 'REACTION', 'SKIN'] as const) {
  test(`${task}: the model answer earns every AUTO mark across 40 seeds and validates`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = perfect[task](seed * 7919);
      const p = bioHumanStateSchema.safeParse(s);
      assert.ok(p.success, `seed ${seed}: schema ${p.success ? '' : JSON.stringify(p.error.issues.slice(0, 2))}`);
      const out = bioHumanGrader.grade(s, seed * 7919);
      assert.equal(autoTotal(out), AUTO_MAX, `${task} seed ${seed}: ${notes(out)}`);
      assert.equal(out.ai.length, 2);
      assert.ok(out.solution.length >= 3);
    }
  });
}

test('PULSE: typical mistakes lose the right marks', () => {
  const seed = 1234;
  const base = perfect.PULSE(seed);
  const g = (s: BioHumanState) => bioHumanGrader.grade(s, seed);
  const thumb = clone(base);
  thumb.pulse.counts[0]!.thumb = true;
  assert.equal(by(g(thumb), 'procedure').awarded, 3);
  const x15 = clone(base);
  x15.pulse.rows = x15.pulse.rows.map((r) => ({ ...r, bpm: r.beats }));
  assert.ok(by(g(x15), 'presentation').awarded <= 2, 'forgot × 4');
  const axis = clone(base);
  axis.pulse.axis = 'TIME_Y';
  axis.pulse.curve = 'RULED';
  assert.equal(by(g(axis), 'presentation').awarded, 1);
  const late = clone(base);
  const end = late.pulse.exercise!.at + late.pulse.exercise!.min;
  late.pulse.counts = late.pulse.counts.map((c) => (c.at >= end ? { ...c, at: c.at + 0.5 } : c));
  assert.ok(by(g(late), 'procedure').awarded <= 3);
  const cool = clone(base);
  cool.pulse.claims = ['RISES', 'COOL'];
  assert.ok(by(g(cool), 'results').awarded <= 3.5);
  const noRest = clone(base);
  noRest.pulse.counts = noRest.pulse.counts.map((c, i) => (i < 3 ? { ...c, at: c.at - 4.5 } : c));
  noRest.pulse.screened = false;
  assert.ok(by(g(noRest), 'procedure').awarded <= 2.5);
});

test('BREATH: typical mistakes lose the right marks', () => {
  const seed = 2468;
  const base = perfect.BREATH(seed);
  const g = (s: BioHumanState) => bioHumanGrader.grade(s, seed);
  const hard = clone(base);
  hard.breath.breaths[0]!.hard = true;
  assert.equal(by(g(hard), 'procedure').awarded, 3);
  const wet = clone(base);
  wet.breath.wipedFirst = false;
  assert.equal(by(g(wet), 'procedure').awarded, 3);
  const swap = clone(base);
  swap.breath.firstMilky = 'A';
  assert.equal(by(g(swap), 'results').awarded, 4);
  const noO2 = clone(base);
  noO2.breath.claims = ['CO2_MORE', 'WATER_MORE', 'WARMER', 'NO_O2'];
  assert.ok(by(g(noO2), 'results').awarded <= 4);
  const vent = clone(base);
  vent.breath.vent = vent.breath.meanRate;
  assert.equal(by(g(vent), 'presentation').awarded, 2);
});

test('REACTION: typical mistakes lose the right marks', () => {
  const seed = 3579;
  const base = perfect.REACTION(seed);
  const g = (s: BioHumanState) => bioHumanGrader.grade(s, seed);
  const cm = clone(base);
  cm.react.rows = cm.react.rows.map((r) => (r.mean ? { ...r, m: r.mean, t: String(Math.sqrt((2 * Number(r.mean)) / 9.8)) } : r));
  assert.equal(by(g(cm), 'presentation').awarded, 1, 'forgot cm → m');
  const reflex = clone(base);
  reflex.react.claims = ['CATCH_REFLEX', 'REFLEX_SPINAL'];
  assert.ok(by(g(reflex), 'results').awarded <= 3);
  const warn = clone(base);
  warn.react.drops[3]!.warn = true;
  assert.ok(by(g(warn), 'procedure').awarded <= 3.5);
  const hard = clone(base);
  hard.react.knee = 'HARD';
  assert.equal(by(g(hard), 'procedure').awarded, 3);
  assert.equal(REACT_CONDS.length, 3);
});

test('SKIN: typical mistakes lose the right marks', () => {
  const seed = 4680;
  const base = perfect.SKIN(seed);
  const g = (s: BioHumanState) => bioHumanGrader.grade(s, seed);
  const peek = clone(base);
  peek.skin.trials.find((t) => t.sep === 0)!.blind = false;
  assert.equal(by(g(peek), 'procedure').awarded, 3);
  const noSingles = clone(base);
  noSingles.skin.trials = noSingles.skin.trials.filter((t) => t.sep > 0);
  assert.ok(by(g(noSingles), 'procedure').awarded <= 3);
  const none = clone(base);
  none.skin.claims = ['FOREARM_NONE', 'DENSITY'];
  assert.ok(by(g(none), 'results').awarded <= 3);
  const rank = clone(base);
  rank.skin.rank = [...rank.skin.rank].reverse();
  assert.equal(by(g(rank), 'presentation').awarded, 2);
});

test('an empty attempt scores nothing and the schema rejects garbage', () => {
  for (const task of ['PULSE', 'BREATH', 'REACTION', 'SKIN'] as const) {
    const s = { ...emptyBioHumanState(), task };
    assert.equal(autoTotal(bioHumanGrader.grade(s, 11)), 0, `${task}: ${notes(bioHumanGrader.grade(s, 11))}`);
  }
  const bad = (f: (s: BioHumanState) => unknown) => {
    const s = clone(perfect.SKIN(3)) as unknown as BioHumanState;
    f(s);
    return bioHumanStateSchema.safeParse(s).success;
  };
  assert.equal(bad(() => undefined), true);
  assert.equal(bad((s) => ((s as { task: string }).task = 'BLOOD')), false);
  assert.equal(bad((s) => (s.skin.trials[0]!.sep = 99)), false);
  assert.equal(bad((s) => (s.pulse.clock = 999)), false);
  assert.equal(bad((s) => ((s.pulse.counts as unknown[]) = [{ at: 1, dur: 20, thumb: false }])), false);
  assert.equal(bad((s) => (s.react.rows = [])), false);
  assert.equal(bad((s) => ((s.skin.trials[0] as { area: string }).area = 'EAR')), false);
  assert.equal(bad((s) => (s.written.explain = 'x'.repeat(5000))), false);
  assert.equal(bioHumanStateSchema.safeParse({ v: 2 }).success, false);
});
