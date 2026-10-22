// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-titration.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHEM_TITRATION, chemTitrationAnswers, chemTitrationStateSchema, chemTitrationVariant, emptyChemTitrationState, rubricTotal, titrationEndpoint, titrationFillLevel, type ChemTitrationState } from '@aischool/shared';
import { chemTitrationGrader } from '../src/practicals/graders/chem-titration';
import { concordantSets, keywordMarks, normaliseUnit, parseNumber, sigFigs } from '../src/practicals/graders/helpers';

const seedWhere = (ok: (v: ReturnType<typeof chemTitrationVariant>) => boolean) => {
  for (let s = 1; s < 5000; s++) if (ok(chemTitrationVariant(s))) return s;
  throw new Error('no seed');
};
const SEED_1_1 = seedWhere((v) => v.a === v.b && v.finalTask === 'MASS_CONC');
const SEED_RATIO = seedWhere((v) => v.a !== v.b && v.finalTask === 'MASS_CONC');
const SEED_PURITY = seedWhere((v) => v.finalTask === 'PURITY');

/** A model student's lab: rinsed right, rough then two accurate titrations stopped at the end point, readings and answers exact. */
function perfect(seed: number, opts: { accurateOffsets?: number[] } = {}): ChemTitrationState {
  const v = chemTitrationVariant(seed);
  const s = emptyChemTitrationState();
  const indicator = v.indicators[0]!;
  s.setup = { burette: 'ACID', pipette: 'BASE', flask: 'WATER', indicator };
  const offsets = [0.4, ...(opts.accurateOffsets ?? [0, 0])];
  offsets.forEach((extra, i) => {
    const initial = titrationFillLevel(seed, i);
    const final = Math.round((initial + titrationEndpoint(v, i, indicator) + extra) * 100) / 100;
    s.runs.push({ kind: i === 0 ? 'ROUGH' : 'ACCURATE', indicator, initial, final, swirls: 12, funnelRemoved: true, done: true });
    s.table.push({ initial: initial.toFixed(2), final: final.toFixed(2), titre: (final - initial).toFixed(2) });
  });
  s.fills = offsets.length;
  const titres = s.table.slice(1).map((r) => Number(r.titre));
  const meanTitre = titres.reduce((a, b) => a + b, 0) / titres.length;
  const cb = (v.acidConc * meanTitre * v.b) / (v.a * v.pipette);
  const fin = v.finalTask === 'PURITY' ? ((cb * v.base.molarMass) / v.impureMassConc!) * 100 : cb * v.base.molarMass;
  s.answers = {
    meanTitre: { value: meanTitre.toFixed(2), unit: 'cm³' },
    concA: { value: v.acidConc.toPrecision(3), unit: 'mol dm⁻³' },
    concB: { value: cb.toPrecision(3), unit: 'mol/dm3' },
    final: { value: fin.toPrecision(3), unit: v.finalTask === 'PURITY' ? '%' : 'g dm-3' },
  };
  s.written = { endpoint: 'yellow to orange', precautions: 'I removed the funnel before reading and read the bottom of the meniscus at eye level.' };
  return s;
}
const by = (out: ReturnType<typeof chemTitrationGrader.grade>, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: ReturnType<typeof chemTitrationGrader.grade>) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = CHEM_TITRATION.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);

test('the rubric is 23 marks and the variant is the same for a seed', () => {
  assert.equal(rubricTotal(CHEM_TITRATION.rubric), 23);
  assert.deepEqual(chemTitrationVariant(4242), chemTitrationVariant(4242));
  assert.notDeepEqual(chemTitrationVariant(1).trueTitre, chemTitrationVariant(2).trueTitre);
  const v = chemTitrationVariant(SEED_1_1);
  assert.ok(Math.abs(chemTitrationAnswers(v).concB - (v.acidConc * v.trueTitre) / 25) < 1e-12);
});

test('exact answers earn every AUTO mark (1:1, mole-ratio and purity variants)', () => {
  for (const seed of [SEED_1_1, SEED_RATIO, SEED_PURITY]) {
    const state = perfect(seed);
    assert.ok(chemTitrationStateSchema.safeParse(state).success);
    const out = chemTitrationGrader.grade(state, seed);
    assert.equal(autoTotal(out), AUTO_MAX, `seed ${seed}: ${out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id} ${c.note}`).join(' | ')}`);
    assert.equal(out.ai.length, 2);
    assert.ok(out.solution.length >= 5);
  }
});

test('answers within tolerance still score', () => {
  const v = chemTitrationVariant(SEED_1_1);
  const s = perfect(SEED_1_1);
  s.answers.concB.value = (Number(s.answers.concB.value) * 1.01).toPrecision(3); // 1 % off: carried forward within 1.5 %
  s.answers.concA.value = (v.acidConc * 1.008).toFixed(4);
  // A reading 0.04 cm³ out (within ±0.05), titre still subtracted right.
  s.table[1]!.initial = (s.runs[1]!.initial! + 0.04).toFixed(2);
  s.table[1]!.titre = (Number(s.table[1]!.final) - Number(s.table[1]!.initial)).toFixed(2);
  s.answers.meanTitre.value = ((Number(s.table[1]!.titre) + Number(s.table[2]!.titre)) / 2).toFixed(2);
  const out = chemTitrationGrader.grade(s, SEED_1_1);
  assert.equal(by(out, 'calculations').awarded, 5, by(out, 'calculations').note);
  assert.equal(by(out, 'readings').awarded, 6, by(out, 'readings').note);
});

test('answers outside tolerance lose their marks', () => {
  const s = perfect(SEED_1_1);
  s.answers.concB.value = (Number(s.answers.concB.value) * 1.06).toPrecision(3);
  s.answers.concA.value = '1.00';
  s.table[2]!.final = (s.runs[2]!.final! + 0.3).toFixed(2); // misread burette
  const out = chemTitrationGrader.grade(s, SEED_1_1);
  const calc = by(out, 'calculations');
  // Mean titre (1) still right; C(A) wrong; C(B) wrong even carried forward; the last answer carries forward from the true C(B).
  assert.equal(calc.awarded, 2, calc.note);
  assert.ok(by(out, 'readings').awarded < 6);
});

test('non-concordant titres: no concordance mark, and averaging them is not accepted', () => {
  const s = perfect(SEED_1_1, { accurateOffsets: [0, 0.5] });
  s.answers.meanTitre.value = ((Number(s.table[1]!.titre) + Number(s.table[2]!.titre)) / 2).toFixed(2);
  const out = chemTitrationGrader.grade(s, SEED_1_1);
  const r = by(out, 'readings');
  assert.match(r.note, /agree within ±0\.10/);
  assert.ok(r.awarded <= 5);
  assert.match(by(out, 'calculations').note, /Average only titres that agree/);
  // The 0.5 cm³ overshoot also spoils one accurate run.
  assert.equal(by(out, 'procedure').awarded, 4);
});

test('wrong units withhold the value mark and the units mark; a missing unit only the units mark', () => {
  const wrong = perfect(SEED_1_1);
  wrong.answers.concB.unit = 'g/dm3';
  const w = chemTitrationGrader.grade(wrong, SEED_1_1);
  assert.equal(by(w, 'calculations').awarded, 3);
  assert.equal(by(w, 'units').awarded, 0);
  assert.match(by(w, 'units').note, /Wrong unit/);

  const missing = perfect(SEED_1_1);
  missing.answers.concA.unit = '';
  const m = chemTitrationGrader.grade(missing, SEED_1_1);
  assert.equal(by(m, 'calculations').awarded, 5);
  assert.equal(by(m, 'units').awarded, 0);

  const molar = perfect(SEED_1_1);
  molar.answers.concB.unit = 'M';
  molar.answers.meanTitre.unit = 'cm3';
  assert.equal(by(chemTitrationGrader.grade(molar, SEED_1_1), 'units').awarded, 1);
});

test('ignoring the mole ratio earns one of the two C(B) marks', () => {
  const v = chemTitrationVariant(SEED_RATIO);
  const s = perfect(SEED_RATIO);
  s.answers.concB.value = ((v.acidConc * Number(s.answers.meanTitre.value)) / v.pipette).toPrecision(3);
  const out = chemTitrationGrader.grade(s, SEED_RATIO);
  assert.match(by(out, 'calculations').note, /mole ratio/);
  // C(B) 1 of 2; the last answer is carried forward from the student's C(B).
  assert.equal(by(out, 'calculations').awarded, 4);
});

test('bad setup and procedure are marked down', () => {
  const s = perfect(SEED_1_1);
  s.setup.burette = 'WATER';
  s.setup.flask = 'BASE';
  s.runs[0]!.kind = 'ACCURATE';
  s.runs.forEach((r) => (r.swirls = 0));
  const out = chemTitrationGrader.grade(s, SEED_1_1);
  assert.equal(by(out, 'setup').awarded, 2);
  assert.ok(by(out, 'procedure').awarded <= 3);
  const empty = chemTitrationGrader.grade(emptyChemTitrationState(), SEED_1_1);
  assert.equal(autoTotal(empty), 0);
});

test('helpers: numbers, units, significant figures, concordance, keyword stand-in', () => {
  assert.equal(parseNumber('9.55 x 10^-2'), 0.0955);
  assert.equal(parseNumber('9.55×10⁻²'), 0.0955);
  assert.equal(parseNumber(' 23.40 '), 23.4);
  assert.equal(parseNumber('abc'), null);
  assert.equal(normaliseUnit('mol dm⁻³'), 'mol/dm3');
  assert.equal(normaliseUnit('moldm-3'), 'mol/dm3');
  assert.equal(normaliseUnit('M'), 'mol/dm3');
  assert.equal(normaliseUnit('m'), 'm');
  assert.equal(normaliseUnit('g/L'), 'g/dm3');
  assert.equal(normaliseUnit('cm^3'), 'cm3');
  assert.equal(sigFigs('0.0955'), 3);
  assert.equal(sigFigs('23.40'), 4);
  assert.deepEqual(concordantSets([23.4, 23.45, 23.9], 0.1), [[0, 1]]);
  assert.equal(keywordMarks('It changed from yellow to orange', [['yellow'], ['orange']], 2, 1).awarded, 1);
  assert.equal(keywordMarks('It went orange', [['yellow'], ['orange']], 2, 1).awarded, 0.5);
});
