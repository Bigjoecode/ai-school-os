// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-bio-dissection.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BIO_DISSECTION,
  DISSECT_PRACTICAL_TASKS,
  PLATES,
  bioDissectionStateSchema,
  bioDissectionVariant,
  emptyBioDissectionState,
  eosinFront,
  eosinModelState,
  eosinSectionSeen,
  eosinVeinsAt,
  microModelState,
  mouldCover,
  plateVisible,
  ratModelState,
  ratShown,
  rubricTotal,
  type BioDissectionState,
  type DissectTask,
} from '@aischool/shared';
import { bioDissectionGrader } from '../src/practicals/graders/bio-dissection';
import { GRADERS } from '../src/practicals/graders';

type Out = ReturnType<typeof bioDissectionGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = BIO_DISSECTION.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const WRITTEN = { precautions: 'Thin sections; cut away from the fingers.', explain: 'The xylem conducts water; transpiration pull.' };
const perfect: Record<DissectTask, (seed: number) => BioDissectionState> = {
  EOSIN: (seed) => ({ ...eosinModelState(bioDissectionVariant(seed, 'EOSIN')), written: WRITTEN }),
  RAT: (seed) => ({ ...ratModelState(bioDissectionVariant(seed, 'RAT')), written: WRITTEN }),
  MICROBE: (seed) => ({ ...microModelState(bioDissectionVariant(seed, 'MICROBE')), written: WRITTEN }),
};

test('the rubric is 20 marks, registered, and the variant is the same for a seed', () => {
  assert.equal(rubricTotal(BIO_DISSECTION.rubric), 20);
  assert.equal(GRADERS['bio-dissection'], bioDissectionGrader);
  assert.deepEqual(DISSECT_PRACTICAL_TASKS, { 'pr-bio-eosin-water-uptake': 'EOSIN', 'pr-bio-rat-dissection-alimentary': 'RAT', 'pr-bio-microorganisms-culture': 'MICROBE' });
  assert.equal(JSON.stringify(bioDissectionVariant(777, 'RAT')), JSON.stringify(bioDissectionVariant(777, 'RAT')));
  assert.notEqual(JSON.stringify(bioDissectionVariant(777, 'RAT').rat), JSON.stringify(bioDissectionVariant(778, 'RAT').rat));
});

for (const task of ['EOSIN', 'RAT', 'MICROBE'] as DissectTask[]) {
  test(`${task}: the model answer gets every AUTO mark over 40 seeds and passes the schema`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = perfect[task](seed * 7919);
      assert.ok(bioDissectionStateSchema.safeParse(s).success, `schema, seed ${seed}`);
      const out = bioDissectionGrader.grade(s, seed * 7919);
      assert.equal(autoTotal(out), AUTO_MAX, `seed ${seed}: ${out.auto.map((c) => `${c.id} ${c.awarded}/${c.max} ${c.note}`).join(' | ')}`);
      assert.equal(out.ai.length, 2);
      assert.ok(out.solution.length >= 3);
    }
  });
}

test('eosin: the front rises after a lag, slower in the dark; sections above the front are unstained; the veins redden later', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const v = bioDissectionVariant(seed, 'EOSIN');
    const w = { place: 'BRIGHT' as const, wash: 'GENTLE' as const, dye: true };
    assert.equal(eosinFront(v.eosin, w, 2), 0);
    const h90 = eosinFront(v.eosin, w, 90);
    assert.ok(h90 > 9 && h90 < 16.5, `seed ${seed}: ${h90}`);
    assert.ok(eosinFront(v.eosin, { ...w, place: 'DARK' }, 90) < h90 * 0.5);
    assert.ok(eosinFront(v.eosin, { ...w, wash: 'ROUGH' }, 90) > h90);
    assert.ok(eosinVeinsAt(v.eosin, w) > 45 && eosinVeinsAt(v.eosin, w) < 110);
    const s = eosinModelState(v);
    assert.equal(eosinSectionSeen(v.eosin, s.eosin, 0), 'XYLEM');
    assert.equal(eosinSectionSeen(v.eosin, s.eosin, 1), 'NONE');
    assert.equal(eosinSectionSeen(v.eosin, { ...s.eosin, wash: 'ROUGH' }, 0), 'ALL');
  }
});

test('eosin: typical mistakes lose the right marks', () => {
  const seed = 4242;
  const base = perfect.EOSIN(seed);
  // Rough washing, a dark cupboard, one section held in the hand.
  const a = clone(base);
  a.eosin.wash = 'ROUGH';
  a.eosin.place = 'DARK';
  a.eosin.sections[0]!.tile = false;
  assert.equal(by(bioDissectionGrader.grade(a, seed), 'procedure').awarded, 1);
  // Phloem, shading the whole section, the phloem claim.
  const b = clone(base);
  b.eosin.tissue = 'PHLOEM';
  b.eosin.shade = 'WHOLE';
  b.eosin.claims = [...b.eosin.claims, 'PHLOEM'];
  const ob = bioDissectionGrader.grade(b, seed);
  assert.equal(by(ob, 'results').awarded, 3.5);
  assert.equal(by(ob, 'presentation').awarded, 2.5);
  // Heights made up.
  const c = clone(base);
  c.eosin.rows = c.eosin.rows.map((r) => String(Number(r) + 1.5));
  assert.equal(by(bioDissectionGrader.grade(c, seed), 'readings').awarded, 1);
  // Rate from the wrong readings (still consistent with own table only if right).
  const d = clone(base);
  d.eosin.rate = '0.5';
  assert.equal(by(bioDissectionGrader.grade(d, seed), 'presentation').awarded, 2.5);
});

test('rat: lengths shown to 0.5 cm; stretching the gut over-reads; mistakes lose the right marks', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const v = bioDissectionVariant(seed, 'RAT');
    const w = { measures: [{ what: 'SI' as const, how: 'THREAD' as const }, { what: 'SI' as const, how: 'STRETCH' as const }] };
    const a = ratShown(v.rat, w, 0, seed);
    assert.equal(a * 2, Math.round(a * 2));
    assert.ok(Math.abs(a - v.rat.si) < 1.6, `seed ${seed}`);
    assert.ok(ratShown(v.rat, w, 1, seed) > v.rat.si * 1.04);
    const ratio = (v.rat.si + v.rat.li) / v.rat.body;
    assert.ok(ratio > 4 && ratio < 7.5, `ratio ${ratio}`);
  }
  const seed = 99;
  const base = perfect.RAT(seed);
  const a = clone(base);
  a.rat.skin = 'DEEP';
  a.rat.display = 'FORCEPS';
  a.rat.gloves = false;
  assert.equal(by(bioDissectionGrader.grade(a, seed), 'procedure').awarded, 1);
  const b = clone(base);
  b.rat.gall = 'PRESENT';
  b.rat.claims = [...b.rat.claims, 'GALL'];
  b.rat.labels[1] = 'Gall bladder';
  const ob = bioDissectionGrader.grade(b, seed);
  assert.equal(by(ob, 'results').awarded, 3.5);
  assert.equal(by(ob, 'presentation').awarded, 2.5);
  const c = clone(base);
  c.rat.si = String(Number(c.rat.si) + 4);
  assert.equal(by(bioDissectionGrader.grade(c, seed), 'readings').awarded, 2.5);
  c.rat.style = 'TEXTBOOK';
  assert.equal(by(bioDissectionGrader.grade(c, seed), 'presentation').awarded, 2.5);
});

test('microorganisms: control clean, washed fewer than unwashed, mould needs moisture and warmth; mistakes lose marks', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const v = bioDissectionVariant(seed, 'MICROBE');
    const s = microModelState(v);
    const w = s.micro;
    assert.equal(plateVisible(v.micro, w, 0, 3, seed).length, 0);
    const air = plateVisible(v.micro, w, 1, 3, seed).length;
    const u = plateVisible(v.micro, w, 2, 3, seed).length;
    const c = plateVisible(v.micro, w, 3, 3, seed).length;
    assert.ok(air >= 12 && air <= 36, `air ${air}`);
    assert.ok(c < u * 0.35, `washed ${c} of ${u}`);
    assert.ok(plateVisible(v.micro, w, 2, 1, seed).length < u, 'colonies appear over the days');
    assert.ok(mouldCover(v.micro, w, 0, 3) > 30);
    assert.ok(mouldCover(v.micro, w, 1, 3) < 3);
    assert.ok(mouldCover(v.micro, w, 2, 3) < 30);
  }
  const seed = 31337;
  const base = perfect.MICROBE(seed);
  const a = clone(base);
  a.micro.plates.forEach((p) => (p.label = 'LID'));
  a.micro.plates[0]!.airMin = 5;
  a.micro.temp = 37;
  a.micro.plates.forEach((p) => (p.tape = 'SEALED'));
  const oa = bioDissectionGrader.grade(a, seed);
  assert.equal(by(oa, 'procedure').awarded, 2);
  const b = clone(base);
  b.micro.openedAfter = true;
  b.micro.claims = [...b.micro.claims, 'BACTERIUM', 'OPEN'];
  const ob = bioDissectionGrader.grade(b, seed);
  assert.equal(by(ob, 'procedure').awarded, 3.5);
  assert.equal(by(ob, 'results').awarded, 4);
  const c = clone(base);
  c.micro.counts = c.micro.counts.map((x) => String(Number(x) + 9));
  const oc = bioDissectionGrader.grade(c, seed);
  assert.ok(by(oc, 'readings').awarded <= 1.5);
  const d = clone(base);
  d.micro.plates[3]!.touch = 'UNWASHED';
  assert.ok(by(bioDissectionGrader.grade(d, seed), 'procedure').awarded <= 3.5);
});

test('the state schema rejects garbage and accepts a fresh state', () => {
  assert.ok(bioDissectionStateSchema.safeParse(emptyBioDissectionState()).success);
  const bad: unknown[] = [
    { ...emptyBioDissectionState(), task: 'DANCE' },
    { ...emptyBioDissectionState(), v: 2 },
    (() => {
      const s = emptyBioDissectionState() as unknown as { micro: { plates: unknown[] } };
      s.micro.plates = [];
      return s;
    })(),
    (() => {
      const s = emptyBioDissectionState();
      s.eosin.clock = 9999;
      return s;
    })(),
    (() => {
      const s = emptyBioDissectionState() as unknown as { rat: { measures: unknown[] } };
      s.rat.measures = [{ what: 'TAIL', how: 'THREAD' }];
      return s;
    })(),
    (() => {
      const s = emptyBioDissectionState() as unknown as { micro: { temp: number } };
      s.micro.temp = 45;
      return s;
    })(),
    'nonsense',
    null,
  ];
  for (const x of bad) assert.equal(bioDissectionStateSchema.safeParse(x).success, false);
  // Grading an empty state never throws and gives no marks.
  for (const task of ['EOSIN', 'RAT', 'MICROBE'] as DissectTask[]) {
    const out = bioDissectionGrader.grade({ ...emptyBioDissectionState(), task }, 5);
    assert.equal(out.auto.length, 4);
    assert.ok(autoTotal(out) <= 0.5, `${task} empty ${autoTotal(out)}`);
  }
  assert.equal(PLATES.length, 4);
});
