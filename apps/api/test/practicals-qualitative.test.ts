// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-qualitative.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHEM_QUALITATIVE,
  QUAL_SALTS,
  chemQualitativeStateSchema,
  chemQualitativeVariant,
  emptyChemQualitativeState,
  qualIdealRecord,
  qualInferenceKey,
  qualModelTests,
  qualObserve,
  qualSamples,
  rubricTotal,
  type ChemQualitativeState,
  type ChemQualitativeVariant,
  type QualTest,
} from '@aischool/shared';
import { chemQualitativeGrader, inferenceCredit, observationCredit, partStated } from '../src/practicals/graders/chem-qualitative';
import { keywordMarks } from '../src/practicals/graders/helpers';

const seedWhere = (ok: (v: ChemQualitativeVariant) => boolean) => {
  for (let s = 1; s < 20000; s++) if (ok(chemQualitativeVariant(s))) return s;
  throw new Error('no seed');
};
const SEED_ZN = seedWhere((v) => v.kind === 'SALT' && v.main.id === 'ZNSO4');
const SEED_NH4CL = seedWhere((v) => v.kind === 'SALT' && v.main.id === 'NH4CL');
const SEED_CUCO3 = seedWhere((v) => v.kind === 'SALT' && v.main.id === 'CUCO3');
const SEED_PBNO3 = seedWhere((v) => v.kind === 'SALT' && v.main.id === 'PBNO32');
const SEED_MIX = seedWhere((v) => v.kind === 'MIXTURE');

/** A model candidate: the standard WAEC tests, every observation and inference as the key has them, ions and equation right. */
function perfect(seed: number): ChemQualitativeState {
  const v = chemQualitativeVariant(seed);
  const s = emptyChemQualitativeState();
  s.tests = qualModelTests(v);
  s.table = s.tests.map((t) => qualIdealRecord(v, t));
  s.answer.A = { cation: v.slots.A.cation, anion: v.slots.A.anion };
  if (v.slots.B) s.answer.B = { cation: v.slots.B.cation, anion: v.slots.B.anion };
  s.answer.equation = 'Zn2+ + 2OH- → Zn(OH)2 and Ba2+ + SO4 2- → BaSO4';
  return s;
}
type Out = ReturnType<typeof chemQualitativeGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = CHEM_QUALITATIVE.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const add = (s: ChemQualitativeState, t: QualTest, rec: Partial<ChemQualitativeState['table'][number]> = {}) => {
  s.tests.push(t);
  s.table.push({ observation: '', present: [], absent: [], gases: [], note: '', ...rec });
};

test('the rubric is 19 marks and the variant is the same for a seed', () => {
  assert.equal(rubricTotal(CHEM_QUALITATIVE.rubric), 19);
  assert.deepEqual(chemQualitativeVariant(777), chemQualitativeVariant(777));
  const kinds = new Set(Array.from({ length: 200 }, (_, i) => chemQualitativeVariant(i + 1).kind));
  assert.deepEqual([...kinds].sort(), ['MIXTURE', 'SALT']);
  const salts = new Set(Array.from({ length: 2000 }, (_, i) => chemQualitativeVariant(i + 1).main.id));
  assert.ok(salts.size >= 18, `only ${salts.size} salts drawn`);
});

test('a model candidate earns every AUTO mark on every salt and mixture', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 400; seed++) {
    const v = chemQualitativeVariant(seed);
    const id = `${v.main.id}+${v.partner?.id ?? ''}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const state = perfect(seed);
    assert.ok(chemQualitativeStateSchema.safeParse(state).success, id);
    // Every test the model does uses a sample that is available by then.
    state.tests.forEach((t, i) => assert.ok(qualSamples(v, state.tests.slice(0, i)).includes(t.sample), `${id}: ${t.reagent} on ${t.sample} before it was prepared`));
    const out = chemQualitativeGrader.grade(state, seed);
    assert.equal(autoTotal(out), AUTO_MAX, `${id}: ${out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id} ${c.awarded}/${c.max} ${c.note}`).join(' | ')}`);
    assert.equal(out.ai.length, 1);
    assert.ok(out.solution.length >= 6);
  }
  assert.ok(seen.size > 30);
});

test('the chemistry: hydroxide precipitates, excess, gases and heat', () => {
  const zn = chemQualitativeVariant(SEED_ZN);
  const naoh = qualObserve(zn, { sample: 'SOLUTION', reagent: 'NAOH', steps: ['EXCESS'], gasTests: [] });
  assert.match(naoh.parts.map((p) => p.text).join(' '), /white precipitate.*dissolves in excess/);
  const key = qualInferenceKey(zn, { sample: 'SOLUTION', reagent: 'NAOH', steps: ['EXCESS'], gasTests: [] });
  assert.deepEqual([...key.cation.positive[0]!].sort(), ['AL', 'PB', 'ZN']);
  const nh3 = qualInferenceKey(zn, { sample: 'SOLUTION', reagent: 'NH3', steps: ['EXCESS'], gasTests: [] });
  assert.deepEqual(nh3.cation.positive[0], ['ZN']);

  const cu = chemQualitativeVariant(SEED_CUCO3);
  const heat = qualObserve(cu, { sample: 'SOLID', reagent: 'HEAT', steps: [], gasTests: ['LIME_WATER', 'GLOWING_SPLINT'] });
  assert.deepEqual(heat.gases, ['CO2']);
  assert.match(heat.parts.map((p) => p.text).join(' '), /turns black.*lime water turns milky.*not rekindled/);
  // Dissolved in dilute HNO₃: the solution is blue, and NH₃ in excess gives the deep blue solution.
  const deep = qualObserve(cu, { sample: 'SOLUTION', reagent: 'NH3', steps: ['EXCESS'], gasTests: [] });
  assert.match(deep.parts.at(-1)!.text, /deep blue/);

  const nh4 = chemQualitativeVariant(SEED_NH4CL);
  const warm = qualObserve(nh4, { sample: 'SOLUTION', reagent: 'NAOH', steps: ['WARM'], gasTests: ['RED_LITMUS'] });
  assert.deepEqual(warm.gases, ['NH3']);
  assert.match(warm.parts.at(-1)!.text, /turns blue/);
  const sub = qualObserve(nh4, { sample: 'SOLID', reagent: 'HEAT', steps: [], gasTests: [] });
  assert.ok(sub.visual.sublimate);

  const pb = chemQualitativeVariant(SEED_PBNO3);
  const pbHeat = qualObserve(pb, { sample: 'SOLID', reagent: 'HEAT', steps: [], gasTests: ['GLOWING_SPLINT'] });
  assert.deepEqual([...pbHeat.gases].sort(), ['NO2', 'O2']);
  assert.match(pbHeat.parts.map((p) => p.text).join(' '), /yellow when cold.*reddish-brown fumes.*rekindled/);
  assert.match(qualObserve(pb, { sample: 'SOLUTION', reagent: 'KI', steps: [], gasTests: [] }).parts[0]!.text, /yellow precipitate/);
  assert.match(qualObserve(pb, { sample: 'SOLUTION', reagent: 'BROWN_RING', steps: [], gasTests: [] }).parts[0]!.text, /brown ring/);

  // Every salt dissolved (or not) and heated without throwing; insoluble ones are the trioxocarbonates(IV).
  for (const s of QUAL_SALTS) if (!s.soluble) assert.equal(s.anion, 'CO3');
});

test('written observations: keywords, negation and partial credit', () => {
  const v = chemQualitativeVariant(SEED_ZN);
  const t: QualTest = { sample: 'SOLUTION', reagent: 'NAOH', steps: ['EXCESS'], gasTests: [] };
  const parts = qualObserve(v, t).parts;
  assert.equal(observationCredit('White ppt, soluble in excess', parts).credit, 1);
  assert.equal(observationCredit('white gelatinous precipitate which dissolves in excess NaOH', parts).credit, 1);
  assert.equal(observationCredit('white precipitate, insoluble in excess', parts).credit, 0.5);
  assert.equal(observationCredit('white precipitate. It does not dissolve in excess', parts).credit, 0.5);
  assert.equal(observationCredit('blue precipitate', parts).credit, 0);
  assert.equal(observationCredit('', parts).credit, 0);
  const lime = qualObserve(chemQualitativeVariant(SEED_CUCO3), { sample: 'SOLID', reagent: 'HEAT', steps: [], gasTests: ['LIME_WATER'] }).parts.at(-1)!;
  assert.ok(partStated('turned lime water milky', lime));
  assert.ok(!partStated('lime water did not turn milky', lime));
});

test('inferences: all possible ions, nothing the observation rules out, the gas named', () => {
  const v = chemQualitativeVariant(SEED_ZN);
  const t: QualTest = { sample: 'SOLUTION', reagent: 'NAOH', steps: ['EXCESS'], gasTests: [] };
  const key = qualInferenceKey(v, t);
  const rec = (present: string[], absent: string[] = [], gases: string[] = []) => ({ observation: 'x', present, absent, gases, note: '' }) as never;
  assert.equal(inferenceCredit(key, rec(['ZN', 'AL', 'PB'])).credit, 1);
  assert.equal(inferenceCredit(key, rec(['ZN'])).credit, 0.5);
  assert.equal(inferenceCredit(key, rec(['CU'])).credit, 0);
  assert.equal(inferenceCredit(key, rec(['ZN', 'AL', 'PB'], ['ZN'])).credit, 0);
  assert.equal(inferenceCredit(key, rec([], ['CA', 'CU'])).credit, 0.5);
  assert.equal(inferenceCredit(key, rec(['ZN', 'AL', 'PB'], [], ['NH3'])).credit, 0);

  // A gas row: the gas must be named; the anion it shows earns the rest.
  const c = chemQualitativeVariant(SEED_CUCO3);
  const g = qualInferenceKey(c, { sample: 'SOLID', reagent: 'DIL_HCL', steps: [], gasTests: ['LIME_WATER'] });
  assert.equal(inferenceCredit(g, rec(['CO3'], [], ['CO2'])).credit, 1);
  assert.equal(inferenceCredit(g, rec([], [], ['CO2'])).credit, 0.5);
  assert.equal(inferenceCredit(g, rec(['CO3'])).credit, 0.5);
  assert.equal(inferenceCredit(g, rec(['CO3'], [], ['SO2'])).credit, 0);
});

test('wrong ions, missing tests and an empty lab are marked down', () => {
  const s = perfect(SEED_ZN);
  s.answer.A = { cation: 'AL', anion: 'SO4' };
  const out = chemQualitativeGrader.grade(s, SEED_ZN);
  assert.equal(by(out, 'identity').awarded, 2);
  assert.match(by(out, 'identity').note, /not Al³⁺/);

  // No NH₃(aq) and no excess NaOH: the choice-of-tests mark drops and fewer rows are marked.
  const lazy = perfect(SEED_ZN);
  const keep = lazy.tests.map((t, i) => ({ t, r: lazy.table[i]! })).filter(({ t }) => t.reagent !== 'NH3' && t.reagent !== 'HEAT');
  lazy.tests = keep.map((x) => x.t);
  lazy.table = keep.map((x) => x.r);
  const lo = chemQualitativeGrader.grade(lazy, SEED_ZN);
  assert.ok(by(lo, 'tests').awarded <= 2.5, by(lo, 'tests').note);
  assert.match(by(lo, 'tests').note, /NH₃\(aq\)/);
  assert.match(by(lo, 'tests').note, /Heat the solid/);
  assert.ok(by(lo, 'observations').awarded < 5);

  // Gas given off but never tested.
  const nogas = emptyChemQualitativeState();
  add(nogas, { sample: 'SOLID', reagent: 'HEAT', steps: [], gasTests: [] }, { observation: 'green solid turns black, colourless gas', gases: ['CO2'] });
  const ng = chemQualitativeGrader.grade(nogas, SEED_CUCO3);
  assert.match(by(ng, 'tests').note, /CO₂ \(lime water\)/);

  const empty = chemQualitativeGrader.grade(emptyChemQualitativeState(), SEED_ZN);
  assert.equal(autoTotal(empty), 0);
  assert.equal(empty.ai[0]!.answer, '');
});

test('mixture: filtrate and residue are both analysed', () => {
  const v = chemQualitativeVariant(SEED_MIX);
  assert.ok(v.partner && !v.partner.soluble && v.main.soluble);
  const s = perfect(SEED_MIX);
  s.answer.B = { cation: null, anion: null };
  const out = chemQualitativeGrader.grade(s, SEED_MIX);
  assert.equal(by(out, 'identity').awarded, 2);
  const water = qualObserve(v, { sample: 'SOLID', reagent: 'WATER', steps: [], gasTests: [] });
  assert.match(water.parts[0]!.text, /partly dissolves/);
  assert.deepEqual(qualSamples(v, [{ sample: 'SOLID', reagent: 'WATER' }]), ['SOLID', 'FILTRATE', 'RESIDUE']);
});

test('the equation fallback keywords work on a plain-typed equation', () => {
  const out = chemQualitativeGrader.grade(perfect(SEED_ZN), SEED_ZN);
  const item = out.ai[0]!;
  assert.equal(keywordMarks(item.answer, item.keywords, item.need, 2).awarded, 2);
  assert.ok(keywordMarks('I do not know', item.keywords, item.need, 2).awarded < 1);
});

test('a candidate writing in their own words scores the observations', () => {
  const v = chemQualitativeVariant(SEED_ZN);
  const s = emptyChemQualitativeState();
  add(s, { sample: 'SOLID', reagent: 'WATER', steps: [], gasTests: [] }, { observation: 'C dissolved completely to give a colourless solution', absent: ['CU', 'FE2', 'FE3'] });
  add(s, { sample: 'SOLUTION', reagent: 'NAOH', steps: ['EXCESS'], gasTests: [] }, { observation: 'White gelatinous ppt formed, soluble in excess NaOH', present: ['ZN', 'AL', 'PB'] });
  add(s, { sample: 'SOLUTION', reagent: 'NH3', steps: ['EXCESS'], gasTests: [] }, { observation: 'White ppt, dissolves in excess', present: ['ZN'] });
  add(s, { sample: 'SOLUTION', reagent: 'BACL2', steps: ['ADD_HCL'], gasTests: [] }, { observation: 'White precipitate which is insoluble in dilute HCl', present: ['SO4'] });
  add(s, { sample: 'SOLID', reagent: 'HEAT', steps: [], gasTests: ['COBALT_PAPER'] }, { observation: 'Colourless liquid condensed on the cooler part; white residue; cobalt chloride paper turned pink', gases: ['H2O'], note: 'water of crystallisation' });
  s.answer.A = { cation: 'ZN', anion: 'SO4' };
  const out = chemQualitativeGrader.grade(s, SEED_ZN);
  assert.equal(by(out, 'observations').awarded, 5, by(out, 'observations').note);
  assert.equal(by(out, 'inferences').awarded, 4, by(out, 'inferences').note);
  assert.equal(by(out, 'identity').awarded, 4);
  assert.equal(by(out, 'tests').awarded, 4, by(out, 'tests').note);
  assert.equal(v.kind, 'SALT');
});
