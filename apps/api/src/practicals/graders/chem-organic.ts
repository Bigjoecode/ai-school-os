import {
  CHEM_ORGANIC,
  ORG_CLAIM_LABEL,
  ORG_IDENT_LABEL,
  ORG_TASK_SAMPLES,
  ORG_TEST_INFO,
  SOAP_CLAIM_LABEL,
  SOAP_ROWS,
  SOAP_ROW_LABEL,
  benedictFinal,
  benedictStage,
  chemOrganicVariant,
  emptyOrgRecord,
  orgCalcAnswer,
  orgIdealRecord,
  orgInferenceKey,
  orgModelState,
  orgModelTests,
  orgObserve,
  orgSampleName,
  orgTestText,
  orgTruth,
  soapKey,
  soapModelEvents,
  soapParts,
  soapRun,
  type ChemOrganicState,
  type ChemOrganicVariant,
  type CriterionScore,
  type OrgClaim,
  type OrgInferenceKey,
  type OrgPart,
  type OrgRecord,
  type OrgTask,
  type OrgTest,
  type OrgTestId,
} from '@aischool/shared';
import { observationCredit } from './chem-qualitative';
import { parseNumber, score, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => CHEM_ORGANIC.rubric.find((c) => c.id === id)!;
const lbl = (n: OrgClaim) => ORG_CLAIM_LABEL[n];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const halves = (m: number) => Math.floor(m * 2 + 1e-9) / 2;
/** Benedict's / Fehling's tests must stay in the bath at least this long (s). */
export const ORG_MIN_HEAT = 180;

// ------------------------------------------------------------------ inferences

interface InfMark {
  credit: number;
  why: string | null;
}
const wrote = (r: OrgRecord) => r.present.length + r.absent.length > 0 || !!r.note.trim();

/** Marks one row's inference against what its own result allows. */
export function orgInferenceCredit(k: OrgInferenceKey, r: OrgRecord, t: OrgTest): InfMark {
  if (!wrote(r)) return { credit: 0, why: 'no inference' };
  if (!k.complete) {
    if (r.present.length || r.absent.length) {
      const why =
        t.test === 'HYDROLYSIS'
          ? 'the test was not finished (boil with acid, neutralise, then Benedict’s in the bath): nothing can be inferred from it'
          : t.test === 'BIURET' && t.drops > 5
            ? 'too much CuSO₄: its blue masks the violet, so nothing can be inferred'
            : t.test === 'IODINE'
              ? 'the iodine test was heated: the blue-black colour fades when hot'
              : t.test === 'ESTER'
                ? 'the ester test was not finished (conc. H₂SO₄, warm in the water bath, pour into water and waft)'
                : ORG_TEST_INFO[t.test].heats
                  ? 'the tube was not heated long enough in the water bath: nothing can be inferred from it yet'
                  : 'the test was not finished: nothing can be inferred from it';
      return { credit: 0, why };
    }
    return { credit: 0, why: 'finish the test before inferring' };
  }
  const badP = r.present.filter((n) => !k.allowPresent.includes(n));
  const badA = r.absent.filter((n) => !k.allowAbsent.includes(n));
  if (badP.length) return { credit: 0, why: `the result does not show ${list(badP.map(lbl))} present` };
  if (badA.length) return { credit: 0, why: `this test cannot show that ${list(badA.map(lbl))} ${badA.length === 1 ? 'is' : 'are'} absent` };
  const ok = k.needPresent.every((n) => r.present.includes(n)) && k.needAbsent.every((n) => r.absent.includes(n)) && (!k.needAny.length || k.needAny.some((n) => r.present.includes(n)));
  if (ok) return { credit: 1, why: null };
  const want = k.needPresent.length ? `state that ${list(k.needPresent.map(lbl))} ${k.needPresent.length === 1 ? 'is' : 'are'} present` : k.needAny.length ? `state that ${k.needAny.map(lbl).join(' or ')} is present` : `state that ${list(k.needAbsent.map(lbl))} ${k.needAbsent.length === 1 ? 'is' : 'are'} absent`;
  return { credit: 0.5, why: want };
}

// ------------------------------------------------------------------ AI items

const PREC: Record<OrgTask, string[][]> = {
  GROUPS: [['goggle'], ['water bath', 'no flame', 'away from flame', 'naked flame', 'flammable'], ['small', 'little', 'few drops', 'tiny'], ['control', 'compare'], ['waft', 'not sniff', 'never sniff', 'fan'], ['clean'], ['fume cupboard', 'ventilat']],
  CARBS: [['equal volume', 'same volume'], ['water bath', 'not directly', 'indirect'], ['neutralis', 'neutraliz'], ['clean'], ['point', 'away from'], ['goggle'], ['not heat', 'do not heat the iodine', 'cool']],
  PROTEINS: [['control', 'water'], ['dropwise', 'drop by drop', 'few drops', 'excess', 'little'], ['goggle'], ['clean'], ['water bath', 'gently'], ['corrosive', 'glove', 'teacher'], ['same volume', 'equal volume']],
  SOAP: [['stir'], ['top up', 'add water', 'replace', 'volume', 'boil dry'], ['wash', 'rinse', 'excess alkali'], ['goggle'], ['unattended', 'spit', 'carefully', 'gently'], ['skin', 'corrosive', 'glove']],
};
const PREC_GUIDE: Record<OrgTask, string> = {
  GROUPS: 'goggles worn; organic liquids heated only in a water bath and kept away from flames (flammable); small quantities used; each test compared with a control; smells wafted, never sniffed directly; clean tubes for each test; bromine water / conc. acid used in a fume cupboard.',
  CARBS: 'equal volumes of sample and reagent; heated in a water bath, not directly in the flame; the acid neutralised before Benedict’s; clean tubes; tubes pointed away from people; goggles worn; iodine tests not heated.',
  PROTEINS: 'a water control used; CuSO₄ added drop by drop (excess masks the violet); goggles worn; clean tubes; warmed gently in a water bath; conc. HNO₃ and Millon’s handled by the teacher (corrosive / toxic); equal volumes.',
  SOAP: 'stirred continuously to prevent spitting and charring; the volume kept up with water; the soap washed to remove excess alkali; goggles worn; never left unattended, heated gently; NaOH splashes washed off the skin at once.',
};
const EXPLAIN: Record<OrgTask, { q: string; guide: string; kw: string[][]; need: number }> = {
  GROUPS: {
    q: 'Explain why the alkene decolourises bromine water but the alkane does not, and what happens in the esterification test (name the type of reaction and the role of the concentrated sulphuric acid).',
    guide: '2 marks: (1) bromine adds across the C=C double bond of the unsaturated alkene (an addition reaction); the saturated alkane has only single bonds (substitution only slowly, in light); (1) the alkanoic acid and the alkanol condense to an ester and water — esterification, reversible — with conc. H₂SO₄ as catalyst (and to absorb the water).',
    kw: [['addition', 'add across', 'adds'], ['double bond', 'unsaturat', 'c c'], ['condens', 'esterif', 'reversible', 'ester and water'], ['catalyst', 'dehydrat', 'absorb']],
    need: 3,
  },
  CARBS: {
    q: 'Explain why sucrose gives no colour with Benedict’s solution until it has been boiled with dilute acid, and why the acid must be neutralised before Benedict’s solution is added.',
    guide: '2 marks: (1) sucrose is a non-reducing sugar; boiling with acid hydrolyses it into glucose and fructose, which are reducing sugars (they reduce Cu²⁺ to Cu₂O); (1) Benedict’s solution works only in alkaline conditions, so the acid is neutralised (with NaHCO₃) first.',
    kw: [['hydrolys', 'break', 'split', 'broken'], ['glucose', 'fructose', 'reducing', 'monosacch'], ['alkali', 'alkaline', 'neutral', 'acid']],
    need: 3,
  },
  PROTEINS: {
    q: 'What does the Biuret test detect, and why does egg white set (coagulate) when it is heated?',
    guide: '2 marks: (1) the Biuret test detects peptide bonds (links) in proteins — copper(II) ions in alkali form a violet complex with them; (1) heat denatures the protein: its shape (structure) is changed for good and it coagulates into an insoluble solid.',
    kw: [['peptide', 'cono', 'link'], ['copper', 'cu', 'complex', 'alkali'], ['denatur', 'shape', 'structure', 'coagul', 'insoluble']],
    need: 3,
  },
  SOAP: {
    q: 'Explain why brine is added to the hot mixture (salting out), and how soap removes grease.',
    guide: '2 marks: (1) soap is less soluble in concentrated salt solution than in water, so the brine precipitates (salts out) the soap, which floats on top and leaves glycerol and excess alkali in solution; (1) the hydrophobic hydrocarbon tail of the soap dissolves in the grease while the hydrophilic ionic head (–COO⁻Na⁺) dissolves in water, so the grease is lifted off as droplets (emulsified) and rinsed away.',
    kw: [['less soluble', 'insoluble', 'precipitat', 'salt out', 'salting out', 'separat'], ['hydrophobic', 'tail', 'grease', 'oil'], ['hydrophilic', 'head', 'ionic', 'water']],
    need: 3,
  },
};

function aiItems(task: OrgTask, s: ChemOrganicState): AiItem[] {
  const e = EXPLAIN[task];
  return [
    {
      criterionId: 'precautions',
      question: `State two precautions you took in this practical (${task === 'SOAP' ? 'making soap' : 'the test-tube tests'}).`,
      answer: s.written.precautions.trim(),
      guide: `2 marks: one for each correct precaution — ${PREC_GUIDE[task]} A source of error or a vague statement (“be careful”) earns nothing.`,
      keywords: PREC[task],
      need: 2,
    },
    { criterionId: 'explanation', question: e.q, answer: s.written.explain.trim(), guide: e.guide, keywords: e.kw, need: e.need },
  ];
}

// ------------------------------------------------------------------ test-tube tasks

type Row = { t: OrgTest; i: number; rec: OrgRecord; out: ReturnType<typeof orgObserve>; key: OrgInferenceKey };
const COVER: Record<Exclude<OrgTask, 'SOAP'>, { name: string; tests: OrgTestId[] }[]> = {
  GROUPS: [
    { name: 'C=C (bromine water or KMnO₄)', tests: ['BROMINE', 'KMNO4'] },
    { name: '–OH (warm dichromate or sodium)', tests: ['DICHROMATE', 'SODIUM'] },
    { name: '–COOH (NaHCO₃)', tests: ['NAHCO3'] },
  ],
  CARBS: [
    { name: 'reducing sugar (Benedict’s or Fehling’s)', tests: ['BENEDICT', 'FEHLING'] },
    { name: 'starch (iodine)', tests: ['IODINE'] },
  ],
  PROTEINS: [
    { name: 'protein (Biuret)', tests: ['BIURET'] },
    { name: 'protein (Millon’s, xanthoproteic or ninhydrin)', tests: ['MILLON', 'XANTHO', 'NINHYDRIN'] },
  ],
};

function procedureTubes(task: Exclude<OrgTask, 'SOAP'>, v: ChemOrganicVariant, rows: Row[]): CriterionScore {
  const n: string[] = [];
  let m = 0;
  const covered: string[] = [];
  const missing: string[] = [];
  const marked = v.samples.filter((sm) => sm.letter !== 'H2O');
  for (const sm of marked)
    for (const c of COVER[task]) {
      if (rows.some((r) => r.t.sample === sm.letter && c.tests.includes(r.t.test) && r.out.complete)) covered.push(sm.letter);
      else missing.push(`${sm.letter} for ${c.name}`);
    }
  m += (2 * covered.length) / (marked.length * COVER[task].length);
  if (missing.length) n.push(`Test ${list(missing.slice(0, 5))}${missing.length > 5 ? '…' : ''} (and finish each test).`);
  const done = (pred: (r: Row) => boolean) => rows.some(pred);
  if (task === 'GROUPS') {
    const esters = rows.filter((r) => r.t.test === 'ESTER');
    if (esters.some((r) => r.out.complete && r.out.positive)) m += 1;
    else if (esters.some((r) => r.out.complete)) (m += 0.5), n.push('Make the ester from an alkanol with ethanoic acid (or an acid with ethanol): your ester test gave no ester.');
    else n.push('Make an ester: warm the alkanol with ethanoic acid and a few drops of conc. H₂SO₄ in a water bath, then pour into water and waft the smell.');
    const heated = rows.filter((r) => r.t.heat > 0);
    if (heated.length && !heated.some((r) => r.t.direct)) m += 0.5;
    else if (heated.some((r) => r.t.direct)) n.push('Never heat organic liquids over a flame: they are flammable. Use the water bath.');
    const gasPos = rows.filter((r) => (r.t.test === 'SODIUM' || r.t.test === 'NAHCO3') && r.out.positive);
    const tested = gasPos.filter((r) => r.t.steps.includes(r.t.test === 'SODIUM' ? 'SPLINT' : 'LIMEWATER'));
    if (gasPos.length && gasPos.every((r) => tested.includes(r) || rows.some((o) => o.t.sample === r.t.sample && o.t.test === r.t.test && o.t.steps.includes(r.t.test === 'SODIUM' ? 'SPLINT' : 'LIMEWATER')))) m += 0.5;
    else n.push('Identify every gas: a burning splint for hydrogen (sodium), lime water for carbon dioxide (NaHCO₃).');
  } else if (task === 'CARBS') {
    const needHyd = v.samples.filter((sm) => {
      const own = rows.filter((r) => r.t.sample === sm.letter && (r.t.test === 'BENEDICT' || r.t.test === 'FEHLING') && r.out.complete);
      return own.length ? own.every((r) => !r.out.positive) : benedictStage(benedictFinal(sm.content.reducing)) === 0;
    });
    const hydDone = needHyd.filter((sm) => done((r) => r.t.sample === sm.letter && r.t.test === 'HYDROLYSIS' && r.out.complete));
    m += needHyd.length ? hydDone.length / needHyd.length : 1;
    if (hydDone.length < needHyd.length) n.push(`Hydrolyse ${list(needHyd.filter((x) => !hydDone.includes(x)).map((x) => x.letter))} with dilute HCl, neutralise with NaHCO₃, then test with Benedict’s.`);
    const starchy = v.samples.filter((sm) => sm.content.starch > 0).map((sm) => sm.letter);
    if (done((r) => r.t.test === 'HYDROLYSIS' && starchy.includes(r.t.sample) && r.t.portions.length >= 3)) m += 0.5;
    else n.push('Follow the acid hydrolysis of starch: test portions with iodine at intervals while it boils.');
    const ben = rows.filter((r) => r.t.test === 'BENEDICT' || r.t.test === 'FEHLING' || (r.t.test === 'HYDROLYSIS' && r.t.steps.includes('BENEDICT')));
    const short = ben.filter((r) => r.t.heat < ORG_MIN_HEAT || r.t.direct);
    if (ben.length && !short.length) m += 0.5;
    else if (ben.length) n.push(`Heat every Benedict’s or Fehling’s test in the boiling water bath — not the flame — for at least 3 minutes (${short.length} ${short.length === 1 ? 'was' : 'were'} not).`);
  } else {
    if (done((r) => r.t.sample === 'H2O' && r.out.complete)) m += 0.5;
    else n.push('Repeat the tests with water as a control.');
    const bi = rows.filter((r) => r.t.test === 'BIURET' && r.t.drops > 0);
    if (bi.length && bi.every((r) => r.t.drops <= 5)) m += 0.5;
    else if (bi.length) n.push('Add the CuSO₄ drop by drop — at most a few drops: excess blue masks the violet.');
    if (done((r) => r.t.test === 'COAGULATE' && r.out.complete)) m += 0.5;
    else n.push('Heat the samples in the water bath to see whether the protein coagulates.');
    if (done((r) => r.t.test === 'XANTHO' && r.out.complete && r.t.steps.includes('NH3'))) m += 0.5;
    else n.push('Finish the xanthoproteic test: after warming with conc. HNO₃, cool and add NH₃(aq).');
  }
  if (!rows.length) n.splice(0, n.length, 'No tests were carried out.');
  return score(crit('procedure'), halves(m), n);
}

function identify(task: Exclude<OrgTask, 'SOAP'>, v: ChemOrganicVariant, s: ChemOrganicState): { m: number; n: string[] } {
  const marked = v.samples.filter((sm) => sm.letter !== 'H2O');
  const each = 2 / marked.length;
  let m = 0;
  const n: string[] = [];
  for (const sm of marked) {
    const truth = orgTruth(task, sm.content);
    const said = s.conclusion[sm.letter] ?? [];
    const wrong = [...said.filter((x) => !truth.includes(x)), ...truth.filter((x) => !said.includes(x))];
    if (!said.length) n.push(`Identify ${sm.letter}.`);
    else if (!wrong.length) m += each;
    else {
      if (task === 'CARBS' && wrong.length === 1) m += each / 2;
      n.push(`${sm.letter}: ${task === 'CARBS' ? `you named ${said.map((x) => ORG_IDENT_LABEL[x].toLowerCase()).join(', ')}` : `not ${ORG_IDENT_LABEL[said[0]!].toLowerCase()}`} — look again at its results.`);
    }
  }
  return { m, n };
}

function calcMarks(v: ChemOrganicVariant, s: ChemOrganicState): { m: number; n: string[] } {
  const a = orgCalcAnswer(v);
  const got = [parseNumber(s.calc.a.trim()), parseNumber(s.calc.b.trim()), parseNumber(s.calc.c.trim())];
  const n: string[] = [];
  let m = 0;
  if (v.task === 'GROUPS') {
    if (withinRel(got[0]!, a.values[0], 0.02)) m += 0.25;
    else n.push(`Moles of acid = ${v.calc.acidMass} ÷ 60.`);
    // The maximum mass follows from their own moles (error carried forward).
    const maxTarget = got[0] !== null && got[0] > 0 ? got[0] * 88 : a.values[1];
    if (withinRel(got[1]!, a.values[1], 0.02) || withinRel(got[1]!, maxTarget, 0.02)) m += 0.25;
    else n.push('Maximum mass of ester = moles of acid × 88 (1 : 1).');
    const yTarget = got[1] !== null && got[1] > 0 ? (v.calc.esterMass / got[1]) * 100 : a.values[2]!;
    if (withinRel(got[2]!, a.values[2]!, 0.015) || withinRel(got[2]!, yTarget, 0.015)) m += 0.5;
    else n.push(`Yield = ${v.calc.esterMass} ÷ maximum mass × 100.`);
  } else if (v.task === 'CARBS') {
    if (withinRel(got[0]!, a.values[0], 0.02)) m += 0.5;
    else n.push(`Moles of glucose = ${v.calc.glucoseMass} ÷ 180.`);
    const cTarget = got[0] !== null && got[0] > 0 ? got[0] / (v.calc.glucoseVol / 1000) : a.values[1];
    if (withinRel(got[1]!, a.values[1], 0.02) || withinRel(got[1]!, cTarget, 0.02)) m += 0.5;
    else n.push(`Concentration = moles ÷ ${v.calc.glucoseVol / 1000} dm³.`);
  } else {
    if (withinAbs(got[0]!, a.values[0], 0.5)) m += 0.5;
    else n.push('Add up the relative atomic masses for M.');
    const pTarget = got[0] !== null && got[0] > 0 ? (((a.values[1] / 100) * a.values[0]) / got[0]) * 100 : a.values[1];
    if (withinAbs(got[1]!, a.values[1], 0.15) || withinAbs(got[1]!, pTarget, 0.15)) m += 0.5;
    else n.push('% N = mass of nitrogen in one molecule ÷ M × 100.');
  }
  return { m, n };
}

function gradeTubes(task: Exclude<OrgTask, 'SOAP'>, s: ChemOrganicState, v: ChemOrganicVariant): GraderOutput {
  const letters = ORG_TASK_SAMPLES[task] as string[];
  const rows: Row[] = s.tests
    .map((t, i) => ({ t, i, rec: s.table[i] ?? emptyOrgRecord(), out: orgObserve(v, t), key: orgInferenceKey(v, t) }))
    .filter((r) => letters.includes(r.t.sample) && ORG_TEST_INFO[r.t.test].task === task);
  const auto: CriterionScore[] = [procedureTubes(task, v, rows)];

  const byTest = new Map<string, { obs: number; inf: number; text: string; missed: OrgPart[]; why: string | null }>();
  for (const r of rows) {
    const k = `${r.t.sample}|${r.t.test}|${r.t.test === 'ESTER' ? r.t.steps.includes('ACID_PARTNER') : ''}`;
    const o = observationCredit(r.rec.observation, r.out.parts);
    const inf = orgInferenceCredit(r.key, r.rec, r.t);
    const prev = byTest.get(k);
    if (!prev || o.credit + inf.credit > prev.obs + prev.inf) byTest.set(k, { obs: o.credit, inf: inf.credit, text: orgTestText(r.t), missed: o.missed, why: inf.why });
  }
  const marks = [...byTest.values()];
  const denom = Math.max(marks.length, v.minRows);
  {
    const n: string[] = [];
    if (!marks.length) n.push('No observations to mark.');
    for (const x of marks.filter((y) => y.obs < 1).slice(0, 4)) n.push(`“${x.text}”: ${x.missed.length ? `you should have seen ${x.missed.map((p) => p.text).join('; ')}` : 'record what you saw'}.`);
    if (marks.length && marks.length < v.minRows) n.push(`Only ${marks.length} different test${marks.length === 1 ? '' : 's'} recorded; the samples need about ${v.minRows}.`);
    auto.push(score(crit('observations'), halves((marks.reduce((t, x) => t + x.obs, 0) / denom) * crit('observations').marks), n));
  }
  {
    const n: string[] = [];
    if (!marks.length) n.push('No inferences to mark.');
    for (const x of marks.filter((y) => y.inf < 1).slice(0, 4)) n.push(`“${x.text}”: ${x.why ?? 'incomplete inference'}.`);
    if (marks.length && marks.length < v.minRows) n.push(`Inferences are marked out of at least ${v.minRows} different tests.`);
    auto.push(score(crit('inferences'), halves((marks.reduce((t, x) => t + x.inf, 0) / denom) * crit('inferences').marks), n));
  }
  {
    const id = identify(task, v, s);
    const c = calcMarks(v, s);
    auto.push(score(crit('results'), halves(id.m + c.m), [...id.n, ...c.n]));
  }

  const a = orgCalcAnswer(v);
  const solution = [
    `The samples were ${list(v.samples.map((sm) => `${orgSampleName(sm.letter)}: ${sm.def.name}`))}.`,
    ...orgModelTests(v).map((t) => {
      const rec = orgIdealRecord(v, t);
      const inf = [rec.present.length ? `${list(rec.present.map(lbl))} present` : '', rec.absent.length ? `${list(rec.absent.map(lbl))} absent` : ''].filter(Boolean).join('; ');
      return `${orgTestText(t)} → ${rec.observation} → ${inf || 'no inference'}.`;
    }),
    `Calculation: ${a.labels.map((l, k) => (l ? `${l} = ${a.values[k]} ${a.units[k]}` : '')).filter(Boolean).join('; ')}.`,
  ];
  const facts = [`${rows.length} tests done (${marks.length} different); ${rows.filter((r) => r.t.direct).length} heated directly over the flame.`, `Named: ${v.samples.filter((x) => x.letter !== 'H2O').map((sm) => `${sm.letter} ${(s.conclusion[sm.letter] ?? []).map((x) => ORG_IDENT_LABEL[x]).join(', ') || '—'} (true ${orgTruth(task, sm.content).map((x) => ORG_IDENT_LABEL[x]).join(', ')})`).join('; ')}.`];
  return { auto, ai: aiItems(task, s), solution, facts };
}

// ------------------------------------------------------------------ soap

function gradeSoap(s: ChemOrganicState, v: ChemOrganicVariant): GraderOutput {
  const r = soapRun(v, s.soap);
  const auto: CriterionScore[] = [];
  {
    const n: string[] = [];
    let m = 0;
    if (r.oil && r.naoh) m += 0.5;
    else n.push('Measure 10 cm³ of palm oil and 20 cm³ of NaOH solution into the beaker.');
    if (r.boiled >= 900) m += 1;
    else if (r.boiled >= 600) (m += 0.5), n.push(`Boil for 15–20 minutes (you boiled ${Math.round(r.boiled / 60)} min).`);
    else n.push(`Boil gently for 15–20 minutes (you boiled ${Math.round(r.boiled / 60)} min).`);
    if (r.boiled > 0 && !r.spat) m += 0.5;
    else if (r.spat) n.push('Stir continuously while it boils: unstirred, it spits and saponifies slowly.');
    if (r.boiled > 0 && !r.charred) m += 0.5;
    else if (r.charred) n.push('Add water to replace what boils off: the mixture boiled dry and charred.');
    if (r.brine && !r.brineEarly) m += 0.5;
    else n.push(r.brineEarly ? 'Add the brine after boiling, when the mixture is thick and creamy.' : 'Salt out the soap with saturated brine.');
    if (r.filtered && r.washed) m += 0.5;
    else n.push('Filter (or skim) off the soap and wash it with a little cold water.');
    if (r.soft && r.hard) m += 0.5;
    else n.push('Shake a piece of the soap with distilled water and with hard water and compare the lather.');
    if (!s.soap.length) n.splice(0, n.length, 'No soap was made.');
    auto.push(score(crit('procedure'), halves(m), n));
  }
  const rows = SOAP_ROWS.map((row) => ({ row, parts: soapParts(v, s.soap, row), key: soapKey(v, s.soap, row), rec: s.soapRows[row] }));
  const denom = Math.max(4, rows.filter((x) => x.parts.length).length);
  {
    const n: string[] = [];
    let tot = 0;
    for (const x of rows) {
      if (!x.parts.length) {
        n.push(`${SOAP_ROW_LABEL[x.row]}: not done.`);
        continue;
      }
      const o = observationCredit(x.rec.observation, x.parts);
      tot += o.credit;
      if (o.credit < 1) n.push(`${SOAP_ROW_LABEL[x.row]}: ${o.missed.length ? `you should have seen ${o.missed.map((p) => p.text).join('; ')}` : 'record what you saw'}.`);
    }
    auto.push(score(crit('observations'), halves((tot / denom) * crit('observations').marks), n));
  }
  {
    const n: string[] = [];
    let tot = 0;
    for (const x of rows) {
      if (!x.key) continue;
      const bad = x.rec.claims.filter((c) => !x.key!.allow.includes(c));
      if (!x.rec.claims.length) n.push(`${SOAP_ROW_LABEL[x.row]}: no inference.`);
      else if (bad.length) n.push(`${SOAP_ROW_LABEL[x.row]}: the result does not show “${bad.map((c) => SOAP_CLAIM_LABEL[c].toLowerCase()).join('”, “')}”.`);
      else if (x.key.need.every((c) => x.rec.claims.includes(c))) tot += 1;
      else (tot += 0.5), n.push(`${SOAP_ROW_LABEL[x.row]}: state ${x.key.need.map((c) => SOAP_CLAIM_LABEL[c].toLowerCase()).join(', ')}.`);
    }
    auto.push(score(crit('inferences'), halves((tot / denom) * crit('inferences').marks), n));
  }
  {
    const n: string[] = [];
    let m = 0;
    const oil = parseNumber(s.readings.oil.trim().replace(/\s*g$/i, ''));
    const soap = parseNumber(s.readings.soap.trim().replace(/\s*g$/i, ''));
    const theory = parseNumber(s.readings.theory.trim().replace(/\s*g$/i, ''));
    const yld = parseNumber(s.readings.yield.trim().replace(/\s*%$/, ''));
    if (r.oilWeighed && withinAbs(oil, v.soap.oilMass, 0.011)) m += 0.5;
    else n.push(r.oilWeighed ? `The balance read ${v.soap.oilMass.toFixed(2)} g for the oil.` : 'Weigh the 10 cm³ of oil on the balance and record its mass.');
    if (r.soapMass !== null && withinAbs(soap, r.soapMass, 0.011)) m += 0.5;
    else n.push(r.soapMass !== null ? `The balance read ${r.soapMass.toFixed(2)} g for your soap.` : 'Weigh the dry soap and record its mass.');
    const tOwn = oil !== null ? (oil / 806) * 3 * 278 : r.theory;
    if (withinRel(theory, r.theory, 0.01) || withinRel(theory, tOwn, 0.01)) m += 0.5;
    else n.push('Theoretical mass of soap = mass of oil ÷ 806 × 3 × 278.');
    const yOwn = soap !== null && theory !== null && theory > 0 ? (soap / theory) * 100 : null;
    if (yOwn !== null && withinRel(yld, yOwn, 0.015)) m += 1;
    else n.push('% yield = mass of soap ÷ theoretical mass × 100.');
    if (/glycer|propane-?1,?2,?3-?triol/i.test(s.readings.byproduct)) m += 0.5;
    else n.push('The by-product of saponification is glycerol (propane-1,2,3-triol).');
    auto.push(score(crit('results'), halves(m), n));
  }
  const model = soapRun(v, soapModelEvents());
  const solution = [
    `Fat + 3NaOH → glycerol + 3 soap (sodium palmitate, C₁₅H₃₁COONa). The 10 cm³ of palm oil weighed ${v.soap.oilMass.toFixed(2)} g; theoretical soap = ${v.soap.oilMass.toFixed(2)} ÷ 806 × 3 × 278 = ${model.theory.toFixed(2)} g.`,
    `Boiled with stirring for 15–20 minutes (water topped up) the mixture turns thick and creamy; brine salts out a solid soap layer that floats; washed and dried it weighs about ${(model.soapMass ?? 0).toFixed(2)} g — a yield of about ${(((model.soapMass ?? 0) / model.theory) * 100).toFixed(0)}%.`,
    'The soap lathers readily in distilled water; in hard water Ca²⁺ and Mg²⁺ ions form an insoluble scum and little lather.',
  ];
  const facts = [`Boiled ${Math.round(r.boiled / 60)} min (${r.spat} unstirred), water added ${r.watered} cm³, ${r.charred ? 'charred' : 'not charred'}; extent ${(r.extent * 100).toFixed(0)}%; brine ${r.brine ? 'yes' : 'no'}; soap weighed ${r.soapMass ?? '—'} g.`];
  return { auto, ai: aiItems('SOAP', s), solution, facts };
}

/**
 * Marks the organic lab the way a WAEC chemistry scheme does: each sample
 * tested for each class and each test finished, each observation against what
 * really happened in that tube, each inference against what its result allows,
 * the samples identified and the calculation; for soap, the method (boiling
 * time, stirring, water, brine, washing, lather), the four observations and
 * inferences and the yield from the student's own weighings. Precautions and
 * the explanation go to AI.
 */
export const chemOrganicGrader: SimulatorGrader<'chem-organic'> = {
  id: 'chem-organic',
  grade(state: ChemOrganicState, seed: number): GraderOutput {
    const task = state.task ?? 'GROUPS';
    const v = chemOrganicVariant(seed, task);
    return task === 'SOAP' ? gradeSoap(state, v) : gradeTubes(task, state, v);
  },
};
export { orgModelState };
