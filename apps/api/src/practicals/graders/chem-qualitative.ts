import {
  CHEM_QUALITATIVE,
  QUAL_ANIONS,
  QUAL_CATIONS,
  QUAL_GAS_CONFIRM,
  QUAL_GAS_LABEL,
  QUAL_ION_EQUATION,
  QUAL_ION_LABEL,
  QUAL_SMALL_SET,
  chemQualitativeVariant,
  isSolidSample,
  qualIdealRecord,
  qualInferenceKey,
  qualModelTests,
  qualObserve,
  qualTestText,
  type ChemQualitativeState,
  type ChemQualitativeVariant,
  type CriterionScore,
  type QualAnion,
  type QualCategoryKey,
  type QualInferenceKey,
  type QualIon,
  type QualPart,
  type QualRecord,
  type QualSalt,
  type QualSample,
  type QualTest,
} from '@aischool/shared';
import { score } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => CHEM_QUALITATIVE.rubric.find((c) => c.id === id)!;
const CATIONS: readonly QualIon[] = QUAL_CATIONS;
const ANIONS: readonly QualIon[] = QUAL_ANIONS;
const label = (i: QualIon) => QUAL_ION_LABEL[i];

// ------------------------------------------------------------------ observations as written

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Clauses of a written observation (a "not" word only spoils the clause it is in). */
const clauses = (text: string) =>
  text
    .split(/[.;\n,]| and | then | but | while /i)
    .map((c) => ` ${norm(c)} `)
    .filter((c) => c.trim());
const hasWord = (clause: string, w: string) => clause.includes(` ${norm(w)}`);
const NEGATOR = /^(not|no|never|didn|doesn|don|nor|without)$/;
/** The word appears and is not negated just before it ("did not turn milky", "no white precipitate"). */
const hasPositive = (clause: string, w: string) => {
  const words = clause.trim().split(' ');
  const target = norm(w).split(' ');
  for (let i = 0; i + target.length <= words.length; i++) {
    if (!target.every((t, k) => (k === target.length - 1 ? words[i + k]!.startsWith(t) : words[i + k] === t))) continue;
    const before = words.slice(Math.max(0, i - 3), i);
    if (!before.some((b) => NEGATOR.test(b))) return true;
  }
  return false;
};
/** A part that states something did NOT happen (its keywords are themselves negative). */
const negativePart = (p: QualPart) => p.kw.some((g) => g.some((w) => /^(no |not|none|nothing|remain|stays|insoluble|unchanged|neutral|persist|undissolved|does not|did not|doesn t)/.test(w)));

/** A written observation states this fact: every keyword group appears (not negated) in some clause that has none of the part's "not" words. */
export function partStated(text: string, p: QualPart): boolean {
  const cs = clauses(text);
  const neg = negativePart(p);
  return p.kw.every((g) => cs.some((c) => g.some((w) => (neg ? hasWord(c, w) : hasPositive(c, w))) && !(p.not ?? []).some((w) => hasWord(c, w))));
}
/** Credit for one row's observation: 1 when (nearly) every fact is stated, 0.5 for about half. */
export function observationCredit(text: string, parts: QualPart[]): { credit: number; missed: QualPart[] } {
  if (!text.trim() || !parts.length) return { credit: 0, missed: parts };
  const missed = parts.filter((p) => !partStated(text, p));
  const f = (parts.length - missed.length) / parts.length;
  return { credit: f >= 0.75 ? 1 : f >= 0.4 ? 0.5 : 0, missed };
}

// ------------------------------------------------------------------ inferences

interface InferenceMark {
  credit: number;
  /** Why the row lost marks. */
  why: string | null;
}
const written = (r: QualRecord) => r.present.length + r.absent.length + r.gases.length > 0 || !!r.note.trim();

function categoryCredit(k: QualCategoryKey, universe: readonly QualIon[], present: QualIon[], absent: QualIon[], note: string): number | null {
  if (!k.informative) return null;
  // Nothing can be ruled out (e.g. one salt of a mixture hides the other): nothing to demand here.
  if (!k.positive.length && k.allowed.length >= universe.length) return null;
  const need = [...new Set(k.positive.flat())];
  if (!k.positive.length || need.length > QUAL_SMALL_SET) return present.length || absent.length ? 1 : note.trim() ? 0.5 : 0;
  if (need.every((i) => present.includes(i))) return 1;
  if (present.some((i) => need.includes(i)) || absent.length) return 0.5;
  return 0;
}

/** Marks one row's inference against what its observation allows. */
export function inferenceCredit(key: QualInferenceKey, r: QualRecord): InferenceMark {
  if (!written(r)) return { credit: 0, why: 'no inference' };
  const extraGas = r.gases.filter((g) => !key.gases.includes(g));
  if (extraGas.length) return { credit: 0, why: `${extraGas.map((g) => QUAL_GAS_LABEL[g]).join(', ')} was not given off` };
  const missingGas = key.gases.filter((g) => !r.gases.includes(g));
  let cat: number;
  if (key.heat) {
    const implied = key.heat;
    cat = implied.length ? (r.present.some((i) => implied.includes(i)) ? 1 : 0.5) : 1;
  } else {
    for (const [kind, k] of [['cation', key.cation], ['anion', key.anion]] as const) {
      const universe = kind === 'cation' ? CATIONS : ANIONS;
      const pr = r.present.filter((i) => universe.includes(i));
      const ab = r.absent.filter((i) => universe.includes(i));
      const wrongPresent = pr.filter((i) => !k.allowed.includes(i));
      const wrongAbsent = ab.filter((i) => k.allowed.includes(i));
      if (wrongPresent.length) return { credit: 0, why: `the observation rules out ${wrongPresent.map(label).join(', ')}` };
      if (wrongAbsent.length) return { credit: 0, why: `this test cannot show that ${wrongAbsent.map(label).join(', ')} ${wrongAbsent.length === 1 ? 'is' : 'are'} absent` };
    }
    const credits = [categoryCredit(key.cation, CATIONS, r.present.filter((i) => CATIONS.includes(i)), r.absent.filter((i) => CATIONS.includes(i)), r.note), categoryCredit(key.anion, ANIONS, r.present.filter((i) => ANIONS.includes(i)), r.absent.filter((i) => ANIONS.includes(i)), r.note)].filter((c): c is number => c !== null);
    cat = credits.length ? Math.max(...credits) : 1;
  }
  if (key.gases.length) {
    const credit = (missingGas.length ? 0 : 0.5) + 0.5 * cat;
    return { credit, why: missingGas.length ? `name the gas given off (${missingGas.map((g) => QUAL_GAS_LABEL[g]).join(', ')})` : cat < 1 ? 'name every ion the observation allows' : null };
  }
  return { credit: cat, why: cat < 1 ? 'name every ion the observation allows (or the ions it rules out)' : null };
}

// ------------------------------------------------------------------ choice of tests

/** The sample(s) whose tests count for a salt slot. */
function slotSamples(v: ChemQualitativeVariant, slot: 'A' | 'B'): QualSample[] {
  if (v.kind === 'SALT') return ['SOLID', 'SOLUTION'];
  return slot === 'A' ? ['SOLID', 'FILTRATE'] : ['SOLID', 'RESIDUE', 'RESIDUE_SOLN'];
}
/** Does this test confirm the anion? */
function confirmsAnion(a: QualAnion, t: QualTest, fromAcid: boolean): boolean {
  const g = (...x: string[]) => t.gasTests.some((y) => x.includes(y));
  const acidOnIt = t.reagent === 'DIL_HCL' || t.reagent === 'DIL_HNO3' || t.reagent === 'CONC_H2SO4' || t.reagent === 'CONC_H2SO4_CU' || (t.reagent === 'BACL2' && t.steps.includes('ADD_HCL'));
  switch (a) {
    case 'CL':
      return (t.reagent === 'AGNO3' && !isSolidSample(t.sample)) || ((t.reagent === 'CONC_H2SO4' || t.reagent === 'CONC_H2SO4_CU') && g('NH3_ROD', 'BLUE_LITMUS'));
    case 'SO4':
      return t.reagent === 'BACL2' && t.steps.includes('ADD_HCL');
    case 'SO3':
      return (t.reagent === 'BACL2' && t.steps.includes('ADD_HCL')) || (acidOnIt && g('DICHROMATE', 'PERMANGANATE')) || t.reagent === 'K2CR2O7' || t.reagent === 'KMNO4';
    case 'CO3':
      return (acidOnIt || t.reagent === 'HEAT') && g('LIME_WATER');
    case 'NO3':
      return (t.reagent === 'BROWN_RING' && !fromAcid) || t.reagent === 'CONC_H2SO4_CU' || (t.reagent === 'DEVARDA' && g('RED_LITMUS', 'HCL_ROD')) || (t.reagent === 'HEAT' && g('GLOWING_SPLINT'));
    case 'S':
      return acidOnIt && g('LEAD_ACETATE');
  }
}

const EQ_KW: Record<QualIon, string[][]> = {
  NH4: [['nh4', 'nh'], ['oh', 'hydroxide'], ['nh3']],
  CA: [['ca'], ['oh', '2oh', 'c2o4', 'c2o']],
  PB: [['pb'], ['oh', '2oh', 'i', '2i', 'pbi', 'cl', '2cl']],
  CU: [['cu'], ['oh', '2oh']],
  FE2: [['fe'], ['oh', '2oh']],
  FE3: [['fe'], ['oh', '3oh', 'scn']],
  ZN: [['zn'], ['oh', '2oh']],
  AL: [['al'], ['oh', '3oh']],
  NA: [],
  K: [],
  CL: [['ag', 'agcl'], ['cl', 'agcl']],
  SO4: [['ba', 'baso4', 'baso'], ['so4', 'so', 'baso4', 'baso']],
  SO3: [['so3', 'so'], ['so2', 'so']],
  CO3: [['co3', 'co'], ['co2', 'co']],
  NO3: [['no3', 'no', 'no2']],
  S: [['s', 'h2s'], ['h2s', 'h']],
};

/**
 * Marks a qualitative analysis the way a WAEC scheme does: the choice of tests,
 * each observation against what really happened in that test tube, each
 * inference against what the observation allows (every possible ion named,
 * nothing the observation rules out), the ions identified; the ionic equation
 * goes to AI marking.
 */
export const chemQualitativeGrader: SimulatorGrader<'chem-qualitative'> = {
  id: 'chem-qualitative',
  grade(state: ChemQualitativeState, seed: number): GraderOutput {
    const v = chemQualitativeVariant(seed);
    const rows = state.tests.map((t, i) => ({ t, i, rec: state.table[i] ?? { observation: '', present: [], absent: [], gases: [], note: '' }, out: qualObserve(v, t), key: qualInferenceKey(v, t) }));
    const slots: { id: 'A' | 'B'; salt: QualSalt }[] = [{ id: 'A', salt: v.slots.A }, ...(v.slots.B ? [{ id: 'B' as const, salt: v.slots.B }] : [])];
    const auto: CriterionScore[] = [];

    // ---- choice of tests (4)
    {
      const n: string[] = [];
      let m = 0;
      const solSamples: QualSample[] = v.kind === 'SALT' ? ['SOLUTION'] : ['FILTRATE', 'RESIDUE_SOLN'];
      const per = solSamples.map((s) => {
        const best = (reagent: 'NAOH' | 'NH3') => Math.max(0, ...rows.filter((r) => r.t.sample === s && r.t.reagent === reagent).map((r) => (r.t.steps.includes('EXCESS') ? 1 : 0.5)));
        const naoh = best('NAOH');
        const nh3 = best('NH3');
        const name = s === 'SOLUTION' ? 'the solution of C' : s === 'FILTRATE' ? 'the filtrate' : 'the residue’s solution in dilute HNO₃';
        if (naoh < 1 || nh3 < 1) n.push(`Add NaOH(aq) and NH₃(aq) to ${name}, first in drops and then in excess${naoh + nh3 === 0 ? ' (not done)' : ''}.`);
        return (naoh + nh3) / 2;
      });
      m += per.reduce((a, b) => a + b, 0) / per.length;
      const confirmed = slots.filter((sl) => rows.some((r) => slotSamples(v, sl.id).includes(r.t.sample) && confirmsAnion(sl.salt.anion, r.t, r.t.sample === 'RESIDUE_SOLN' || (r.t.sample === 'SOLUTION' && !v.main.soluble))));
      m += confirmed.length / slots.length;
      for (const sl of slots)
        if (!confirmed.includes(sl))
          n.push(
            {
              CL: 'Confirm Cl⁻: acidify with dilute HNO₃ and add AgNO₃(aq), then NH₃(aq).',
              SO4: 'Confirm SO₄²⁻: add BaCl₂(aq), then dilute HCl (the precipitate stays).',
              SO3: 'Confirm SO₃²⁻: BaCl₂(aq) then dilute HCl, or test the gas from dilute acid with acidified K₂Cr₂O₇ paper.',
              CO3: 'Confirm CO₃²⁻: add dilute acid and pass the gas into lime water.',
              NO3: 'Confirm NO₃⁻: the brown-ring test, or warm with copper turnings and conc. H₂SO₄.',
              S: 'Confirm S²⁻: add dilute HCl and test the gas with lead(II) ethanoate paper.',
            }[sl.salt.anion],
          );
      // Every gas given off identified by its proper test (at least once).
      const evolved = [...new Set(rows.flatMap((r) => r.out.gases))].filter((g) => g !== 'H2O');
      const ok = evolved.filter((g) => rows.some((r) => r.out.gases.includes(g) && r.t.gasTests.some((x) => QUAL_GAS_CONFIRM[g].includes(x))));
      if (evolved.length) {
        m += ok.length / evolved.length;
        const miss = evolved.filter((g) => !ok.includes(g));
        if (miss.length) n.push(`Identify each gas with its own test: ${miss.map((g) => `${QUAL_GAS_LABEL[g]} (${{ CO2: 'lime water', NH3: 'damp red litmus or a rod dipped in conc. HCl', SO2: 'acidified K₂Cr₂O₇ paper', H2S: 'lead(II) ethanoate paper', HCL: 'a rod dipped in conc. NH₃', NO2: 'damp blue litmus', O2: 'a glowing splint', H2: 'a burning splint', H2O: 'cobalt(II) chloride paper' }[g]})`).join('; ')}.`);
      } else if (rows.some((r) => r.t.reagent === 'HEAT')) m += 1;
      else n.push('No gas was tested: heat the solid and test any gas given off.');
      const heated = rows.some((r) => r.t.reagent === 'HEAT' && isSolidSample(r.t.sample));
      if (heated) m += 0.5;
      else n.push('Heat the solid in a dry test tube (effect of heat).');
      const unrecorded = rows.filter((r) => !r.rec.observation.trim() || !written(r.rec)).length;
      if (rows.length && !unrecorded) m += 0.5;
      else if (rows.length) n.push(`${unrecorded} test${unrecorded === 1 ? ' has' : 's have'} no observation or inference recorded.`);
      if (!rows.length) n.splice(0, n.length, 'No tests were carried out.');
      auto.push(score(crit('tests'), Math.floor(m * 2) / 2, n));
    }

    // ---- observations (5) and inferences (4): best row per distinct test, out of at least minRows tests
    const byTest = new Map<string, { obs: number; inf: number; text: string; missed: QualPart[]; why: string | null }>();
    for (const r of rows) {
      const k = `${r.t.sample}|${r.t.reagent}|${[...r.t.steps].sort().join(',')}`;
      const o = observationCredit(r.rec.observation, r.out.parts);
      const inf = inferenceCredit(r.key, r.rec);
      const prev = byTest.get(k);
      if (!prev || o.credit + inf.credit > prev.obs + prev.inf) byTest.set(k, { obs: o.credit, inf: inf.credit, text: qualTestText(v, r.t), missed: o.missed, why: inf.why });
    }
    const marks = [...byTest.values()];
    const denom = Math.max(marks.length, v.minRows);
    {
      const n: string[] = [];
      const total = marks.reduce((t, x) => t + x.obs, 0);
      if (!marks.length) n.push('No observations to mark.');
      else {
        const weak = marks.filter((x) => x.obs < 1).slice(0, 4);
        for (const x of weak) n.push(`“${x.text}”: ${x.missed.length ? `you should have seen ${x.missed.map((p) => p.text).join('; ')}` : 'record what you saw'}.`);
        if (marks.length < v.minRows) n.push(`Only ${marks.length} different test${marks.length === 1 ? '' : 's'} recorded; a full analysis needs about ${v.minRows}.`);
      }
      auto.push(score(crit('observations'), Math.floor(((total / denom) * crit('observations').marks) * 2) / 2, n));
    }
    {
      const n: string[] = [];
      const total = marks.reduce((t, x) => t + x.inf, 0);
      if (!marks.length) n.push('No inferences to mark.');
      else for (const x of marks.filter((y) => y.inf < 1).slice(0, 4)) n.push(`“${x.text}”: ${x.why ?? 'incomplete inference'}.`);
      if (marks.length && marks.length < v.minRows) n.push(`Inferences are marked out of at least ${v.minRows} different tests.`);
      auto.push(score(crit('inferences'), Math.floor(((total / denom) * crit('inferences').marks) * 2) / 2, n));
    }

    // ---- ions identified (4)
    {
      const n: string[] = [];
      let m = 0;
      const each = 4 / (slots.length * 2);
      for (const sl of slots) {
        const ans = state.answer[sl.id];
        const where = v.kind === 'SALT' ? 'C' : sl.id === 'A' ? 'the soluble salt (filtrate)' : 'the insoluble salt (residue)';
        if (ans.cation === sl.salt.cation) m += each;
        else n.push(ans.cation ? `The cation of ${where} is not ${label(ans.cation)}.` : `Name the cation of ${where}.`);
        if (ans.anion === sl.salt.anion) m += each;
        else n.push(ans.anion ? `The anion of ${where} is not ${label(ans.anion)}.` : `Name the anion of ${where}.`);
      }
      auto.push(score(crit('identity'), m, n));
    }

    // ---- ionic equation (AI)
    const a = v.slots.A;
    const kw = [...EQ_KW[a.cation], ...EQ_KW[a.anion]];
    const model = [a.cation === 'NA' || a.cation === 'K' ? null : QUAL_ION_EQUATION[a.cation], QUAL_ION_EQUATION[a.anion]].filter(Boolean).join('; ');
    const ai: AiItem[] = [
      {
        criterionId: 'equation',
        question: `Write an ionic equation for a reaction you used to confirm the cation and one for the anion of ${v.kind === 'SALT' ? 'C' : 'the soluble salt in C (the filtrate)'}. (C${v.kind === 'MIXTURE' ? '’s soluble salt' : ''} is ${a.formula}, containing ${label(a.cation)} and ${label(a.anion)}; the student identified ${state.answer.A.cation ? label(state.answer.A.cation) : 'no cation'} and ${state.answer.A.anion ? label(state.answer.A.anion) : 'no anion'}.)`,
        answer: state.answer.equation.trim(),
        guide: `2 marks: one correct balanced ionic equation for a confirmatory test of each true ion (1 each), with correct formulae and charges; state symbols not required. Model: ${model}. ${a.cation === 'NA' || a.cation === 'K' ? `${label(a.cation)} has no precipitate reaction: give the mark for the anion equation and a correct statement that it is identified by its flame colour.` : ''} An equation for an ion the student wrongly identified earns nothing.`,
        keywords: kw.length ? kw : [['flame']],
        need: Math.max(1, kw.length - 1),
      },
    ];

    // ---- worked solution and facts
    const describe = (s: QualSalt) => `${s.name} (${s.formula}): ${label(s.cation)} and ${label(s.anion)}`;
    const solution = [
      v.kind === 'SALT' ? `C was ${describe(v.main)}.` : `C was a mixture of ${describe(v.main)} (soluble, in the filtrate) and ${describe(v.partner!)} (insoluble, the residue).`,
      ...qualModelTests(v).map((t) => {
        const rec = qualIdealRecord(v, t);
        const inf = [
          rec.gases.length ? `${rec.gases.map((g) => QUAL_GAS_LABEL[g]).join(' and ')} given off` : '',
          rec.present.length ? (t.reagent === 'HEAT' ? `${rec.present.map(label).join(' and ')} indicated` : `${rec.present.map(label).join(' or ')} ${rec.present.length === 1 ? 'present' : 'possibly present'}`) : '',
          rec.absent.length ? `${rec.absent.map(label).join(', ')} absent` : '',
          t.reagent === 'HEAT' ? rec.note : '',
        ].filter(Boolean);
        return `${qualTestText(v, t)} → ${rec.observation} → ${(inf.join('; ') || 'no inference').replace(/\.$/, '')}.`;
      }),
      `Ionic equations: ${[...new Set(slots.flatMap((sl) => [sl.salt.cation, sl.salt.anion]))].map((i) => QUAL_ION_EQUATION[i]).join('; ')}.`,
    ];
    const facts = [
      `C: ${v.kind === 'SALT' ? v.main.formula : `${v.main.formula} + ${v.partner!.formula}`}; ${rows.length} tests done (${marks.length} different), ${rows.filter((r) => r.t.gasTests.length).length} with gas tests.`,
      `Student identified: ${slots.map((sl) => `${sl.id === 'A' ? (v.kind === 'SALT' ? 'C' : 'filtrate') : 'residue'} ${state.answer[sl.id].cation ? label(state.answer[sl.id].cation!) : '—'} / ${state.answer[sl.id].anion ? label(state.answer[sl.id].anion!) : '—'} (true ${label(sl.salt.cation)} / ${label(sl.salt.anion)})`).join('; ')}.`,
    ];
    return { auto, ai, solution, facts };
  },
};

