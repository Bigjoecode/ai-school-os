// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-biology.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BIO_MICROSCOPE,
  BIO_SPECIMENS,
  MICRO_FOCUS_TOL,
  MICRO_PRACTICAL_SLIDES,
  MICRO_SLIDES,
  SPECIMENS,
  SPECIMEN_PRACTICAL_SETS,
  SPECIMEN_SETS,
  bioMicroscopeAnswers,
  bioMicroscopeStateSchema,
  bioMicroscopeVariant,
  bioSpecimensStateSchema,
  bioSpecimensVariant,
  emptyBioMicroscopeState,
  emptyBioSpecimensState,
  microIdentityAnswer,
  rubricTotal,
  specimenNameMatches,
  type BioMicroscopeState,
  type BioSpecimensState,
  type MicroSlide,
  type SpecimenSet,
} from '@aischool/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bioMicroscopeGrader, isPerMm2, micronsPer, parseMag } from '../src/practicals/graders/bio-microscope';
import { bioSpecimensGrader } from '../src/practicals/graders/bio-specimens';

type Out = ReturnType<typeof bioMicroscopeGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const autoMax = (rubric: { how: string; marks: number }[]) => rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const lost = (out: Out) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id}: ${c.note}`).join(' | ');

// ------------------------------------------------------------------ microscope

/** A model student: right mount, low power first, fine focus at high power, good light, exact readings and answers. */
function perfectScope(seed: number, slide: MicroSlide): BioMicroscopeState {
  const v = bioMicroscopeVariant(seed, slide);
  const s = emptyBioMicroscopeState();
  s.slide = slide;
  s.prep = { medium: v.info.media[0]!, coverslip: 'ANGLE', placed: true, clipped: true };
  s.flags = { focusedLow: true, highBeforeLow: false, coarseAtHigh: 0, crashed: false, lightAdjusted: true };
  const cap = (o: 4 | 10 | 40) => ({ objective: o, coarse: Math.floor(v.focus[o]), fine: Math.round((v.focus[o] - Math.floor(v.focus[o])) * 50) / 50 - 0, diaphragm: 50, lamp: o === 40 ? 80 : 60, t: 1000 });
  const fixFine = (c: ReturnType<typeof cap>) => ({ ...c, fine: Math.max(-2, Math.min(2, Math.round((v.focus[c.objective] - c.coarse) * 50) / 50)) });
  s.captures = [...new Set([v.info.measureObjective, v.info.labelObjective])].map((o) => fixFine(cap(o)));
  s.labels = v.targets.map((t) => t.label);
  s.identity = microIdentityAnswer(v, s.prep.medium);
  const t = bioMicroscopeAnswers(v);
  const reading = v.info.method === 'COUNT' ? Math.round(v.trueReading) : v.info.method === 'GRATICULE' ? Math.round(v.trueReading * 2) / 2 : v.trueReading;
  const fov = v.fov[v.info.measureObjective] * 1000;
  const size = v.info.method === 'COUNT' ? fov / reading : v.info.method === 'GRATICULE' ? reading * v.calibration[v.info.measureObjective] : reading / (Math.PI * (v.fov[40] / 2) ** 2);
  const actual = v.info.method === 'STOMATA' ? v.drawnActual : size;
  s.answers = {
    reading: { value: String(reading), unit: '' },
    size: { value: size.toPrecision(3), unit: v.info.method === 'STOMATA' ? 'per mm²' : 'µm' },
    totalMag: { value: `×${t.totalMag}`, unit: '' },
    drawingMag: { value: ((v.drawingLength * 1000) / actual).toPrecision(3), unit: '×' },
  };
  s.drawing = v.drawing.filter((d) => d.good).map((d) => d.id);
  s.written = { observations: 'Rectangular cells in rows, each with a nucleus and a cell wall.', precautions: 'Lowered the cover slip at an angle and focused at low power first.' };
  return s;
}

const SEEDS = [11, 202, 3003, 40404, 505050, 6060606];

test('microscope: rubric is 26 marks and variants are deterministic and sane for every slide', () => {
  assert.equal(rubricTotal(BIO_MICROSCOPE.rubric), 26);
  for (const slide of MICRO_SLIDES)
    for (const seed of SEEDS) {
      const v = bioMicroscopeVariant(seed, slide);
      assert.deepEqual(v, bioMicroscopeVariant(seed, slide));
      assert.ok(v.trueReading > 0 && Number.isFinite(v.trueSize) && v.trueSize > 0, `${slide} ${seed}`);
      const R = (v.fov[v.info.labelObjective] * 1000) / 2;
      for (const t of v.targets) assert.ok(Math.hypot(t.x, t.y) < R * 0.95, `${slide} ${seed} target ${t.label} outside the field`);
      assert.equal(new Set(v.labelOptions).size, v.labelOptions.length);
      if (v.info.method === 'GRATICULE') assert.ok(v.object.startUnit + v.trueReading <= 100, `${slide} ${seed} off the graticule`);
    }
  assert.notDeepEqual(bioMicroscopeVariant(1, 'ONION').row, bioMicroscopeVariant(2, 'ONION').row);
});

test('microscope: a model attempt earns every AUTO mark on every slide', () => {
  for (const slide of MICRO_SLIDES)
    for (const seed of SEEDS) {
      const s = perfectScope(seed, slide);
      assert.ok(bioMicroscopeStateSchema.safeParse(s).success, `${slide} schema`);
      const out = bioMicroscopeGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax(BIO_MICROSCOPE.rubric), `${slide} ${seed}: ${lost(out)}`);
      assert.equal(out.ai.length, 2);
      assert.ok(out.solution.length >= 5);
    }
});

test('microscope: readings within tolerance score; outside lose marks', () => {
  const seed = 777;
  const v = bioMicroscopeVariant(seed, 'CHEEK');
  const s = perfectScope(seed, 'CHEEK');
  // 1.0 unit off: full; 2.5 off: half; 5 off: none.
  for (const [off, want] of [[1, 2], [2.5, 1], [5, 0]] as const) {
    const r = v.trueReading + off;
    s.answers.reading.value = r.toFixed(1);
    s.answers.size.value = (r * v.calibration[40]).toFixed(1);
    const m = by(bioMicroscopeGrader.grade(s, seed), 'measurement');
    // reading marks + consistency (1) + accuracy (1 while within 15 %)
    const accurate = Math.abs(r * v.calibration[40] - v.trueSize) <= 0.15 * v.trueSize ? 1 : 0;
    assert.equal(m.awarded, want + 1 + accurate, `${off}: ${m.note}`);
  }
});

test('microscope: units — mm accepted, a missing or wrong unit loses the units mark', () => {
  const seed = 9090;
  const s = perfectScope(seed, 'ONION');
  const size = Number(s.answers.size.value);
  s.answers.size = { value: (size / 1000).toPrecision(3), unit: 'mm' };
  let out = bioMicroscopeGrader.grade(s, seed);
  assert.equal(by(out, 'units').awarded, 1, by(out, 'units').note);
  assert.equal(by(out, 'measurement').awarded, 4, by(out, 'measurement').note);
  s.answers.size.unit = '';
  out = bioMicroscopeGrader.grade(s, seed);
  assert.equal(by(out, 'units').awarded, 0);
  assert.equal(by(out, 'measurement').awarded, 4, 'the number is still credited');
  s.answers.size.unit = 'mm';
  s.answers.totalMag.unit = 'mm';
  assert.equal(by(bioMicroscopeGrader.grade(s, seed), 'units').awarded, 0);
  assert.equal(micronsPer('µm'), 1);
  assert.equal(micronsPer('mm'), 1000);
  assert.equal(micronsPer('kg'), null);
  assert.ok(isPerMm2('per mm²') && isPerMm2('/mm2') && isPerMm2('mm⁻²') && isPerMm2('stomata per mm2'));
  assert.ok(!isPerMm2('per cm²') && !isPerMm2('mm'));
  assert.equal(parseMag('×400'), 400);
  assert.equal(parseMag('x 400'), 400);
  assert.equal(parseMag('400×'), 400);
});

test('microscope: a unit slip in the drawing magnification earns half', () => {
  const seed = 4242;
  const s = perfectScope(seed, 'POND');
  s.answers.drawingMag.value = (Number(s.answers.drawingMag.value) / 1000).toPrecision(3);
  const m = by(bioMicroscopeGrader.grade(s, seed), 'magnification');
  assert.equal(m.awarded, 2, m.note);
});

test('microscope: procedure errors lose their marks', () => {
  const seed = 1357;
  const s = perfectScope(seed, 'ONION');
  s.prep.medium = 'METHYLENE_BLUE';
  s.prep.coverslip = 'DROP';
  s.flags.highBeforeLow = true;
  s.flags.coarseAtHigh = 3;
  let out = bioMicroscopeGrader.grade(s, seed);
  assert.equal(by(out, 'procedure').awarded, 0, by(out, 'procedure').note);
  assert.match(by(out, 'procedure').note, /angle/);
  // Plasmolysis in water: the cells are turgid, and that is what must be reported.
  const p = perfectScope(seed, 'PLASMOLYSIS');
  p.prep.medium = 'WATER';
  out = bioMicroscopeGrader.grade(p, seed);
  assert.equal(by(out, 'labels').awarded, 3, by(out, 'labels').note);
  p.identity = 'Turgid';
  assert.equal(by(bioMicroscopeGrader.grade(p, seed), 'labels').awarded, 4);
});

test('microscope: blurred or badly lit captures lose image marks; an empty attempt scores nothing', () => {
  const seed = 2468;
  const v = bioMicroscopeVariant(seed, 'LEAF');
  const s = perfectScope(seed, 'LEAF');
  s.captures = s.captures.map((c) => ({ ...c, fine: Math.max(-2, Math.min(2, c.fine + MICRO_FOCUS_TOL[40] * 3)) }));
  assert.equal(by(bioMicroscopeGrader.grade(s, seed), 'image').awarded, 1);
  const t = perfectScope(seed, 'LEAF');
  t.captures = t.captures.map((c) => ({ ...c, diaphragm: 100 })); // colourless impression needs contrast
  assert.equal(by(bioMicroscopeGrader.grade(t, seed), 'image').awarded, 2);
  assert.ok(v.trueReading >= 1);
  const empty = bioMicroscopeGrader.grade(emptyBioMicroscopeState(), seed);
  assert.equal(autoTotal(empty), 0);
});

// ------------------------------------------------------------------ specimens

function perfectBench(seed: number, set: SpecimenSet): BioSpecimensState {
  const v = bioSpecimensVariant(seed, set);
  const s = emptyBioSpecimensState();
  s.set = set;
  s.entries = v.specimens.map((sp) => ({ name: sp.def.name, classification: sp.classification, labels: sp.def.parts.map((p) => p.label), features: sp.def.features, functions: sp.def.functions }));
  s.measure = { length: { value: v.trueLength.toFixed(v.trueLength < 2 ? 2 : 1), unit: 'cm' }, magnification: { value: (v.drawingLength / v.trueLength).toPrecision(3), unit: '' } };
  s.compare = { similarities: 'Both have …', differences: 'A has … whereas B has …' };
  s.drawing = v.drawing.filter((d) => d.good).map((d) => d.id);
  return s;
}

test('specimens: rubric is 30 marks; every set builds 3–5 specimens with a pair and a measurable one', () => {
  assert.equal(rubricTotal(BIO_SPECIMENS.rubric), 30);
  for (const set of SPECIMEN_SETS)
    for (const seed of SEEDS) {
      const v = bioSpecimensVariant(seed, set);
      assert.deepEqual(v, bioSpecimensVariant(seed, set));
      assert.ok(v.specimens.length >= 3 && v.specimens.length <= 5, `${set}`);
      assert.equal(new Set(v.specimens.map((s) => s.id)).size, v.specimens.length);
      assert.notEqual(v.compare[0], v.compare[1]);
      assert.ok(v.specimens[v.measured]!.def.lengthCm, `${set} measured`);
      for (const s of v.specimens) {
        assert.ok(s.classification && v.info.classify.options.includes(s.classification), `${set} ${s.id}`);
        assert.equal(new Set(s.labelOptions).size, s.labelOptions.length, `${set} ${s.id} labels`);
      }
    }
  for (const def of Object.values(SPECIMENS)) for (const p of def.parts) assert.ok(p.x >= 0 && p.x <= 200 && p.y >= 0 && p.y <= 200, def.id);
});

test('specimens: a model attempt earns every AUTO mark in every set', () => {
  for (const set of SPECIMEN_SETS)
    for (const seed of SEEDS) {
      const s = perfectBench(seed, set);
      assert.ok(bioSpecimensStateSchema.safeParse(s).success);
      const out = bioSpecimensGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax(BIO_SPECIMENS.rubric), `${set} ${seed}: ${lost(out)}`);
      assert.equal(out.ai.length, 3);
    }
});

test('specimens: names — aliases accepted, hedging and the more specific other name rejected', () => {
  const seed = SEEDS.find((sd) => bioSpecimensVariant(sd, 'VERTEBRAE').specimens.length) ?? 1;
  const v = bioSpecimensVariant(seed, 'VERTEBRAE');
  const i = 0;
  const me = v.specimens[i]!;
  const other = v.specimens[1]!;
  assert.ok(specimenNameMatches(v, i, me.def.aliases[0]!.toUpperCase()));
  assert.ok(!specimenNameMatches(v, i, `${me.def.aliases[0]} or ${other.def.aliases[0]}`));
  assert.ok(!specimenNameMatches(v, i, ''));
  for (let sd = 1; sd < 400; sd++) {
    const m = bioSpecimensVariant(sd, 'METAMORPHOSIS');
    const a = m.specimens.findIndex((s) => s.id === 'cockroach');
    const n = m.specimens.findIndex((s) => s.id === 'cockroach-nymph');
    if (a < 0 || n < 0) continue;
    assert.ok(specimenNameMatches(m, n, 'cockroach nymph'));
    assert.ok(!specimenNameMatches(m, a, 'cockroach nymph'));
    assert.ok(specimenNameMatches(m, a, 'adult cockroach'));
    break;
  }
});

test('specimens: measurement tolerance, unit slips and magnification from own reading', () => {
  const seed = 8080;
  const v = bioSpecimensVariant(seed, 'FRUITS');
  const s = perfectBench(seed, 'FRUITS');
  const g = () => bioSpecimensGrader.grade(s, seed);
  s.measure.length.value = (v.trueLength + v.lengthTol * 0.9).toFixed(2);
  s.measure.magnification.value = (v.drawingLength / Number(s.measure.length.value)).toFixed(3);
  assert.equal(by(g(), 'measurement').awarded, 3, by(g(), 'measurement').note);
  s.measure.length.value = (v.trueLength + v.lengthTol * 1.6).toFixed(2);
  s.measure.magnification.value = (v.drawingLength / Number(s.measure.length.value)).toFixed(3);
  assert.equal(by(g(), 'measurement').awarded, 2);
  s.measure.length.value = (v.trueLength * 1.5).toFixed(2);
  s.measure.magnification.value = '7';
  assert.equal(by(g(), 'measurement').awarded, 0);
  // mm accepted
  s.measure.length = { value: (v.trueLength * 10).toFixed(1), unit: 'mm' };
  s.measure.magnification = { value: `×${(v.drawingLength / v.trueLength).toFixed(2)}`, unit: '' };
  assert.equal(by(g(), 'measurement').awarded, 3, by(g(), 'measurement').note);
  assert.equal(by(g(), 'units').awarded, 1);
  s.measure.magnification.unit = 'cm';
  assert.equal(by(g(), 'units').awarded, 0);
  s.measure.magnification.unit = '';
  s.measure.length.unit = '';
  assert.equal(by(g(), 'units').awarded, 0);
});

test('specimens: wrong names, classes and labels cost a share; an empty bench scores nothing', () => {
  const seed = 31337;
  const v = bioSpecimensVariant(seed, 'VEGETATIVE');
  const s = perfectBench(seed, 'VEGETATIVE');
  s.entries[0]!.name = 'banana';
  s.entries[0]!.classification = '';
  s.entries[0]!.labels = [];
  const out = bioSpecimensGrader.grade(s, seed);
  const n = v.specimens.length;
  const parts = v.specimens.reduce((t, x) => t + x.def.parts.length, 0);
  assert.equal(by(out, 'identification').awarded, Math.round(((5 * (n - 1)) / n) * 2) / 2);
  assert.equal(by(out, 'classification').awarded, Math.round(((4 * (n - 1)) / n) * 2) / 2);
  assert.equal(by(out, 'labels').awarded, Math.round(((4 * (parts - v.specimens[0]!.def.parts.length)) / parts) * 2) / 2);
  assert.equal(autoTotal(bioSpecimensGrader.grade(emptyBioSpecimensState(), seed)), 0);
});

test('content: every lesson linked to a biology lab can be served by its variants', () => {
  const file = JSON.parse(readFileSync(join(__dirname, '../prisma/practicals/waec/biology.json'), 'utf8')) as { practicals: { id: string; simulator: string | null }[] };
  const micro = file.practicals.filter((p) => p.simulator === 'bio-microscope');
  const bench = file.practicals.filter((p) => p.simulator === 'bio-specimens');
  assert.ok(micro.length >= 6 && bench.length >= 17);
  for (const p of micro) assert.ok(MICRO_PRACTICAL_SLIDES[p.id], `${p.id} has no slide`);
  for (const p of bench) assert.ok(SPECIMEN_PRACTICAL_SETS[p.id], `${p.id} has no specimen set`);
});
