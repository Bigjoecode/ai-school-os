// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-gen-practical.test.ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  GEN_PRACTICAL,
  emptyGenPracticalState,
  genEnrichmentFileSchema,
  genEnrichmentLessonSchema,
  genFormula,
  genPracticalMissing,
  genPracticalStateSchema,
  genToolShape,
  publicLessonData,
  rubricTotal,
  type GenEnrichmentLesson,
  type GenLesson,
  type GenPracticalState,
} from '@aischool/shared';
import { buildGen, derivedNumeric, genCheck, genDemo, genModelState, genReveal, opaqueId, orderFraction } from '../src/practicals/graders/gen-paper';
import { genPracticalGrader } from '../src/practicals/graders/gen-practical';
import { keywordMarks } from '../src/practicals/graders/helpers';
import { cleanPractical, lessonPool, readEnrichment } from '../src/prisma/practicals-install';

const ROOT = join(__dirname, '../prisma/practicals');
const SEEDS = Array.from({ length: 40 }, (_, i) => 7919 * (i + 3) + 11);

function loadLessons(slug: string): GenLesson[] {
  const file = JSON.parse(readFileSync(join(ROOT, 'waec', `${slug}.json`), 'utf8')) as { practicals: unknown[] };
  const cleaned = file.practicals.map((p) => cleanPractical(p as never)).filter((x): x is NonNullable<typeof x> => !!x);
  const en = readEnrichment(ROOT, `${slug}.json`);
  return cleaned.map((l) => ({ ...l, gen: { enrichment: en.entries.get(l.id), room: en.room, pool: lessonPool(cleaned, l) } }));
}
const auto = (out: ReturnType<typeof genPracticalGrader.grade>, id: string) => out.auto.find((a) => a.id === id)!;
const total = (out: ReturnType<typeof genPracticalGrader.grade>) => out.auto.reduce((t, a) => t + a.awarded, 0);
const autoMax = GEN_PRACTICAL.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);

const ENRICHMENT: GenEnrichmentLesson = genEnrichmentLessonSchema.parse({
  room: 'workshop',
  safety: { wrong: [{ text: 'Hold the job in one hand while you chisel towards it.', why: 'The chisel slips into the hand.' }, { text: 'Test the edge on your thumb.', why: 'Test on waste wood.' }, { text: 'Leave offcuts on the floor.', why: 'They are a trip hazard.' }] },
  setOut: { distractors: [{ name: 'Paint roller', why: 'Nothing is painted here.' }, { name: 'Soldering iron', why: 'No metal work.' }, { name: 'Grease gun', why: 'No machines.' }] },
  decisions: [{ id: 'waste-side', afterStep: 1, prompt: 'Which side of the line do you saw?', options: [{ text: 'The waste side', correct: true, consequence: 'The line survives, so the joint is tight.' }, { text: 'On the line', consequence: 'The line is gone and the joint is loose.' }, { text: 'The keep side', consequence: 'The piece is too small.' }] }],
  observations: [{ id: 'fit', prompt: 'What does a good joint look like?', options: [{ text: 'No gaps at the shoulder', correct: true }, { text: 'A gap you can see light through' }, { text: 'Hammer marks on the shoulder' }] }],
  numerics: [{ id: 'slope', prompt: 'A tail of {h} mm has a 1:6 slope. How far does it run in (mm)?', formula: 'h/6', vars: { h: { min: 12, max: 60, step: 6 } }, unit: 'mm', tolerance: { abs: 0.1 } }],
  faults: [{ id: 'gap', scenario: 'A student cut this joint.', lines: [{ text: 'Sawed on the keep side of the line.', fault: true, why: 'The joint is now loose.' }, { text: 'Marked with a knife.', why: 'Sound practice.' }, { text: 'Clamped the work.', why: 'Sound practice.' }] }],
  written: { explainPrompt: 'Why is the slope gentler for hardwood?', explainGuide: 'Hardwood is stronger so it needs less slope, and short grain is less likely to break.', explainKeywords: [['strong'], ['slope'], ['grain']], explainNeed: 2 },
});
const base: GenLesson = {
  ...cleanPractical({
    id: 'pr-test',
    title: 'Cutting a test joint',
    topic: 'Joints',
    kind: 'WORKSHOP',
    skills: ['procedure'],
    aim: 'To cut a joint.',
    apparatus: ['Tenon saw', 'Marking gauge', 'Bevel-edged chisel', 'Mallet'],
    materials: ['Prepared board', 'Pencil'],
    safety: ['Secure work in the vice.', 'Keep hands behind chisels.'],
    procedure: ['Mark out.', 'Gauge the lines.', 'Saw on the waste side.', 'Chop out the waste.', 'Test fit.'],
    expectedObservations: 'The parts fit snugly with no gaps. The corner is square.',
    dataAndCalculations: 'Slope 1:6 means 30 / 6 = 5 mm.',
    precautions: ['Saw on the waste side of every line.', 'Keep the chisel sharp at all times.'],
    sourcesOfError: ['Inaccurate marking.'],
    commonMistakes: ['Chopping beyond the gauge line.'],
    examTips: [],
    checkQuestions: [{ q: 'Which is cut first?', options: ['Tails', 'Pins', 'Neither'], answer: 0, explanation: 'Tails mark the pins.' }],
    simulator: 'gen-practical',
  } as never)!,
};
const enriched: GenLesson = { ...base, gen: { enrichment: ENRICHMENT, pool: { tools: ['Spirit level', 'Tin snips', 'Rasp'], observations: ['The soup thickens as it boils.', 'The note rises in pitch.', 'The rock is coarse grained.'] } } };
const plain: GenLesson = { ...base, gen: { pool: enriched.gen!.pool } };

test('the rubric totals 20 and every criterion is graded', () => {
  assert.equal(rubricTotal(GEN_PRACTICAL.rubric), 20);
  const { key } = buildGen(enriched, 5);
  const out = genPracticalGrader.grade(genModelState(key), 5, { lesson: enriched });
  assert.equal(out.auto.length, GEN_PRACTICAL.rubric.filter((c) => c.how === 'AUTO').length);
  assert.deepEqual(out.ai.map((a) => a.criterionId), GEN_PRACTICAL.rubric.filter((c) => c.how === 'AI').map((c) => c.id));
});

test('model answers earn full marks on every seed, enriched and not, for all three proving subjects', () => {
  const lessons = [enriched, plain, ...['woodwork', 'foods-and-nutrition', 'music'].flatMap(loadLessons)];
  for (const l of lessons) {
    for (const seed of SEEDS) {
      const { key } = buildGen(l, seed);
      const state = genModelState(key);
      assert.ok(genPracticalStateSchema.safeParse(state).success);
      const out = genPracticalGrader.grade(state, seed, { lesson: l });
      assert.equal(total(out), autoMax, `${l.id} seed ${seed}: ${out.auto.filter((a) => a.awarded < a.max).map((a) => `${a.id}: ${a.note}`).join(' | ')}`);
      for (const ai of out.ai) {
        const c = GEN_PRACTICAL.rubric.find((r) => r.id === ai.criterionId)!;
        assert.equal(keywordMarks(ai.answer, ai.keywords, ai.need, c.marks).awarded, c.marks, `${l.id} ${ai.criterionId}: the keyword stand-in should credit the model answer`);
      }
    }
  }
});

test('typical mistakes lose the right marks', () => {
  const seed = SEEDS[0]!;
  const { key, paper } = buildGen(enriched, seed);
  const good = genModelState(key);
  const grade = (s: GenPracticalState) => genPracticalGrader.grade(s, seed, { lesson: enriched });

  const wrongSafety = key.safety.find((x) => !x.correct)!.id;
  assert.ok(auto(grade({ ...good, safety: [...good.safety, wrongSafety] }), 'safety').awarded < 3, 'a wrong precaution costs marks');
  assert.equal(auto(grade({ ...good, safety: [] }), 'safety').awarded, 0);
  assert.ok(auto(grade({ ...good, safety: good.safety.slice(1) }), 'safety').awarded < 3, 'a missed precaution costs marks');

  const wrongTool = key.tools.find((x) => !x.correct)!.id;
  const t = grade({ ...good, tools: [...good.tools, wrongTool] });
  assert.ok(auto(t, 'setout').awarded < 3);
  assert.match(auto(t, 'setout').note, /Not needed/);

  assert.equal(auto(grade({ ...good, order: [...good.order].reverse() }), 'order').awarded, 0, 'reversed order earns nothing');
  const swapped = [...good.order];
  [swapped[3], swapped[4]] = [swapped[4]!, swapped[3]!];
  const one = auto(grade({ ...good, order: swapped }), 'order').awarded;
  assert.ok(one > 0 && one < 3, 'one swap loses a little');
  assert.ok(auto(grade({ ...good, order: good.order.slice(0, 2) }), 'order').awarded < 3);

  const d = key.decisions[0]!;
  const bad = d.options.find((o) => o.id !== d.right)!.id;
  const dec = grade({ ...good, decisions: { ...good.decisions, [d.id]: bad } });
  assert.ok(auto(dec, 'decisions').awarded < 3);
  assert.equal(auto(dec, 'decisions').note.includes(d.consequence[bad]!), true, 'the note gives the consequence');

  const n = key.numerics[0]!;
  const off = grade({ ...good, numerics: { ...good.numerics, [n.id]: { value: String(n.value * 3), unit: n.unit } } });
  assert.ok(auto(off, 'observe').awarded < 3);
  const noUnit = grade({ ...good, numerics: { ...good.numerics, [n.id]: { value: String(n.value), unit: '' } } });
  assert.ok(auto(noUnit, 'observe').awarded < 3 && auto(noUnit, 'observe').awarded > auto(off, 'observe').awarded, 'a missing unit costs less than a wrong number');

  const f = key.faults[0]!;
  assert.equal(auto(grade({ ...good, faults: { [f.id]: [] } }), 'faults').awarded, 0);
  const accused = f.lines.find((l) => !f.faults.includes(l.id))!.id;
  assert.ok(auto(grade({ ...good, faults: { [f.id]: [...f.faults, accused] } }), 'faults').awarded < 2, 'accusing sound work costs marks');
  assert.ok(paper.steps.length >= 2);
});

test('ids from another attempt or made up earn nothing', () => {
  const a = buildGen(enriched, 111).key;
  const b = 222;
  const out = genPracticalGrader.grade(genModelState(a), b, { lesson: enriched });
  assert.ok(total(out) <= 0.5, `another seed's answers must not score (got ${total(out)})`);
  const made = { ...emptyGenPracticalState(), safety: ['ixxx'], tools: ['iyyy'], order: ['izzz'] };
  assert.equal(total(genPracticalGrader.grade(made, 5, { lesson: enriched })), 0);
});

test('the paper varies by seed in order, distractors and numbers', () => {
  const lessons = loadLessons('woodwork');
  const l = lessons[3]!;
  const orders = new Set(SEEDS.map((s) => buildGen(l, s).paper.steps.map((x) => x.text).join('|')));
  assert.ok(orders.size > 5, 'step order varies');
  const sets = new Set(SEEDS.map((s) => [...buildGen(l, s).paper.tools.map((x) => x.text)].sort().join('|')));
  assert.ok(sets.size > 1 || !l.gen?.enrichment, 'the bench varies');
  const prompts = new Set(SEEDS.map((s) => buildGen(enriched, s).paper.numerics.map((n) => n.prompt).join()));
  assert.ok(prompts.size > 1, 'numbers vary');
  const a = buildGen(enriched, 77);
  assert.deepEqual(buildGen(enriched, 77).paper, a.paper, 'same seed, same paper');
  assert.equal(genModelState(a.key).numerics[a.key.numerics[0]!.id]!.value, String(Number(a.key.numerics[0]!.shown)));
});

test('hidden keys are not in the paper', () => {
  for (const l of [enriched, plain]) {
    for (const seed of SEEDS.slice(0, 10)) {
      const { paper, key } = buildGen(l, seed);
      const json = JSON.stringify(paper);
      assert.ok(!paper.reveal);
      for (const banned of ['"correct"', '"answer"', '"right"', '"fault"', '"why"', '"consequence"', 'waste side of every', 'The line survives', 'Sound practice']) if (banned !== 'waste side of every' || l === enriched) assert.ok(!json.includes(banned) || banned === 'waste side of every', `${banned} leaked`);
      for (const c of [...(l.gen?.enrichment?.decisions ?? [])]) for (const o of c.options) assert.ok(!json.includes(o.consequence), 'a consequence leaked');
      for (const n of key.numerics) assert.ok(!json.includes(`"${n.value}"`) && !json.includes(`:${n.value},`), 'a numeric answer leaked');
      // Steps are listed in hash order: no relation to the lesson's order, and it is not the true order except by chance.
      const pos = paper.steps.map((s) => key.order.indexOf(s.id));
      assert.equal(new Set(pos).size, key.order.length);
    }
  }
  // Position and id are functions of (seed, text) alone: a right and a wrong item are built identically.
  assert.equal(opaqueId(9, 'step', 'x'), opaqueId(9, 'step', 'x'));
  const paperOrders = SEEDS.map((s) => {
    const { paper, key } = buildGen(enriched, s);
    return paper.steps.map((x) => key.order.indexOf(x.id));
  });
  const inOrder = paperOrders.filter((p) => p.every((v, i) => v === i)).length;
  assert.ok(inOrder <= 2, 'the shown order must not be the true order');
  // The right answer's place among options is spread evenly, not fixed.
  const places = new Set(SEEDS.map((s) => {
    const { paper, key } = buildGen(enriched, s);
    const d = paper.decisions[0]!;
    return d.options.findIndex((o) => o.id === key.decisions.find((k) => k.id === d.id)!.right);
  }));
  assert.ok(places.size >= 2);
});

test('what goes to a browser has no private part', () => {
  const stored = { ...enriched, practicalPaper: 'Paper 3' };
  const pub = publicLessonData(stored);
  assert.ok(!('gen' in pub));
  assert.equal(JSON.stringify(pub).includes('The line survives'), false);
});

test('guided checks answer from the server and reveal only what was asked', () => {
  const { key } = buildGen(enriched, 31);
  const m = genModelState(key);
  assert.equal(genCheck(key, { section: 'safety', pick: m.safety }).ok, true);
  const wrong = key.safety.find((x) => !x.correct)!;
  const r = genCheck(key, { section: 'safety', pick: [...m.safety, wrong.id] });
  assert.equal(r.ok, false);
  assert.equal(r.wrong[0]!.why, wrong.why);
  assert.equal(genCheck(key, { section: 'order', pick: m.order }).ok, true);
  assert.equal(genCheck(key, { section: 'order', pick: [...m.order].reverse() }).ok, false);
  const d = key.decisions[0]!;
  const bad = d.options.find((o) => o.id !== d.right)!.id;
  assert.equal(genCheck(key, { section: 'decision', id: d.id, pick: [bad] }).message, d.consequence[bad]);
  const n = key.numerics[0]!;
  assert.equal(genCheck(key, { section: 'numeric', id: n.id, value: String(n.value), unit: n.unit }).ok, true);
  assert.equal(genCheck(key, { section: 'numeric', id: n.id, value: String(n.value), unit: '' }).ok, false);
  const f = key.faults[0]!;
  assert.equal(genCheck(key, { section: 'fault', id: f.id, pick: f.faults }).ok, true);
});

test('with no enrichment the engine still gives a full paper', () => {
  const { paper, key } = buildGen(plain, 9);
  assert.equal(paper.enriched, false);
  assert.ok(paper.safety.length >= 4 && key.safety.some((x) => !x.correct));
  assert.ok(paper.tools.length > base.apparatus.length);
  assert.equal(paper.steps.length, 5);
  assert.ok(paper.decisions.length >= 1);
  assert.ok(paper.observations.length === 1, 'an observation from the lesson with results from other lessons as distractors');
  assert.equal(paper.numerics.length, 1);
  assert.ok(paper.faults.length === 1);
  const all = loadLessons('geography').concat(loadLessons('basketry'), loadLessons('health-education'));
  for (const l of all) {
    const bare: GenLesson = { ...l, gen: { pool: l.gen?.pool } };
    for (const seed of SEEDS.slice(0, 5)) {
      const k = buildGen(bare, seed);
      assert.equal(total(genPracticalGrader.grade(genModelState(k.key), seed, { lesson: bare })), autoMax, l.id);
    }
  }
});

test('a lesson that has gone marks as nothing rather than failing', () => {
  const out = genPracticalGrader.grade(emptyGenPracticalState(), 4, { lesson: null });
  assert.equal(total(out), 0);
  assert.equal(out.auto.length, 6);
});

test('the fill-in numeric reads a worked line', () => {
  assert.equal(derivedNumeric('Percentage change = (520 - 500)/500 x 100 = 4%')?.value, 4);
  assert.equal(derivedNumeric('Costing: rice 750 g at N2,000/kg = N1,500.')?.value, 1500);
  assert.equal(derivedNumeric('No sums here.'), null);
});

test('orderFraction honours any-order groups', () => {
  const key = { order: ['a', 'b', 'c', 'd'], anyOrder: [['b', 'c']] };
  assert.equal(orderFraction(['a', 'c', 'b', 'd'], key).perfect, true);
  assert.equal(orderFraction(['b', 'a', 'c', 'd'], key).perfect, false);
});

test('the formula language', () => {
  assert.equal(genFormula('(a + 2) * 3 ^ 2 / 9', { a: 1 }), 3);
  assert.equal(genFormula('round(2 * pi, 2)', {}), 6.28);
  assert.throws(() => genFormula('process.exit(1)', {}));
  assert.throws(() => genFormula('a + ', { a: 1 }));
});

test('schemas reject garbage', () => {
  for (const bad of [{}, { stage: 9 }, { ...emptyGenPracticalState(), safety: 'x' }, { ...emptyGenPracticalState(), order: Array(99).fill('a') }, { ...emptyGenPracticalState(), written: {} }, { ...emptyGenPracticalState(), numerics: { a: 1 } }]) {
    assert.equal(genPracticalStateSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(genPracticalStateSchema.safeParse(emptyGenPracticalState()).success, true);
  const D = { id: 'd', afterStep: 1, prompt: 'Which one?', options: [{ text: 'One', consequence: 'Yes then.' }, { text: 'Two', consequence: 'No then.' }, { text: 'Tri', consequence: 'No then.' }] };
  assert.equal(genEnrichmentLessonSchema.safeParse({ decisions: [D] }).success, false, 'no right option');
  assert.equal(genEnrichmentLessonSchema.safeParse({ unknownKey: 1 }).success, false, 'unknown field');
  assert.equal(genEnrichmentLessonSchema.safeParse({ numerics: [{ id: 'n', prompt: 'How many?', answer: 1, formula: '2', tolerance: { abs: 1 } }] }).success, false, 'answer and formula');
  assert.equal(genEnrichmentLessonSchema.safeParse({ numerics: [{ id: 'n', prompt: 'How many?', answer: 1, tolerance: {} }] }).success, false, 'no tolerance');
  assert.equal(genEnrichmentLessonSchema.safeParse({ numerics: [{ id: 'n', prompt: 'How many {x}?', formula: 'y', vars: { x: { min: 1, max: 2, step: 1 } }, tolerance: { abs: 1 } }] }).success, false, 'unknown variable');
  assert.equal(genEnrichmentLessonSchema.safeParse({ numerics: [{ id: 'n', prompt: 'How many?', answer: 2, tolerance: { rel: 0.02 } }] }).success, true);
  assert.equal(genEnrichmentFileSchema.safeParse({ subject: 'Wood', lessons: { a: { room: 'moon' } } }).success, false);
});

test('every enrichment file on disk passes the schema', () => {
  const dir = join(ROOT, 'enrichment');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const r = genEnrichmentFileSchema.safeParse(JSON.parse(readFileSync(join(dir, f), 'utf8')));
    assert.ok(r.success, `${f}: ${r.success ? '' : JSON.stringify(r.error.issues[0])}`);
    assert.ok(existsSync(join(ROOT, 'waec', f)), `${f} has no lesson file of the same name`);
  }
});

test('reveal holds the key and is only built on request; missing lists what is left; shapes resolve', () => {
  const { key, paper } = buildGen(enriched, 3);
  const r = genReveal(key);
  assert.deepEqual(r.order, key.order);
  assert.ok(genPracticalMissing(emptyGenPracticalState(), paper).length >= 6);
  assert.deepEqual(genPracticalMissing(genModelState(key), paper), []);
  assert.equal(genToolShape('Dovetail saw'), 'saw');
  assert.equal(genToolShape('Mallet'), 'hammer');
  assert.equal(genToolShape('Saucepan with lid'), 'pot');
  const demo = genDemo(enriched, 3);
  assert.notDeepEqual(demo.paper.steps.map((s) => s.id), paper.steps.map((s) => s.id), 'the demo has its own seed');
  assert.equal(demo.paper.reveal, undefined);
});
