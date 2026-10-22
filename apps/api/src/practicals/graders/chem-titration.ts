import {
  CHEM_TITRATION,
  CONCORDANT,
  TITRATION_INDICATOR_INFO,
  chemTitrationAnswers,
  chemTitrationVariant,
  titrationEndpoint,
  type ChemTitrationState,
  type CriterionScore,
  type TitrationIndicator,
  type TitrationTaskId,
} from '@aischool/shared';
import { concordantSets, decimalPlaces, mean, normaliseUnit, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/** A burette reading counts as matching the burette within this (half the 0.1 cm³ graduation). */
const READING_TOL = 0.05;
/** End point judged correctly: the concordant titres' mean within this of the true titre. */
const ACCURACY_TOL = 0.2;
/** Overshooting by more than two drops spoils an accurate titration. */
const OVERSHOOT_TOL = 0.1;
const UNIT_TEXT: Record<string, string> = { cm3: 'cm³', 'mol/dm3': 'mol dm⁻³', 'g/dm3': 'g dm⁻³', '%': '%' };

const crit = (id: string) => CHEM_TITRATION.rubric.find((c) => c.id === id)!;

/**
 * Marks an acid–base titration exactly, the way a WAEC examiner's scheme does:
 * apparatus and setup, procedure, the table of burette readings (against the
 * simulated burette and the variant's true titre), the calculations (errors
 * carried forward are not penalised twice) and units. The end-point colour
 * change and the precautions are written answers, returned for AI marking.
 */
export const chemTitrationGrader: SimulatorGrader<'chem-titration'> = {
  id: 'chem-titration',
  grade(state: ChemTitrationState, seed: number): GraderOutput {
    const v = chemTitrationVariant(seed);
    const truth = chemTitrationAnswers(v);
    const runs = state.runs.map((r, i) => ({ ...r, i, row: state.table[i] })).filter((r) => r.done && r.initial !== null && r.final !== null);
    const accurate = runs.filter((r) => r.kind === 'ACCURATE');
    const delivered = (r: (typeof runs)[number]) => r.final! - r.initial!;
    const endpointOf = (r: (typeof runs)[number]) => titrationEndpoint(v, r.i, r.indicator);
    const usedIndicator: TitrationIndicator | null = accurate.at(-1)?.indicator ?? runs.at(-1)?.indicator ?? state.setup.indicator;
    const auto: CriterionScore[] = [];

    // ---- apparatus and setting up (4)
    {
      const n: string[] = [];
      let m = 0;
      if (state.setup.burette === 'ACID') m++;
      else n.push(state.setup.burette === 'WATER' ? 'Rinse the burette with the acid, not water: water left inside dilutes A.' : state.setup.burette === 'BASE' ? 'Never rinse the burette with the base: it reacts with the acid.' : 'Rinse the burette with the acid (A) before filling it.');
      if (state.setup.pipette === 'BASE') m++;
      else n.push(state.setup.pipette === 'WATER' ? 'Rinse the pipette with the base (B), not water: water dilutes the 25.0 cm³ you measure.' : 'Rinse the pipette with the base (B) it will measure.');
      if (state.setup.flask === 'WATER') m++;
      else n.push(state.setup.flask === 'BASE' ? 'Rinse the conical flask with distilled water only: rinsing it with B adds extra base and raises the titre.' : 'Rinse the conical flask with distilled water before each titration.');
      const ok = accurate.length ? accurate.every((r) => r.indicator && v.indicators.includes(r.indicator)) : !!usedIndicator && v.indicators.includes(usedIndicator);
      if (ok) m++;
      else n.push(`${usedIndicator ? TITRATION_INDICATOR_INFO[usedIndicator].label : 'No indicator'} is not suitable here: use ${v.indicators.map((i) => TITRATION_INDICATOR_INFO[i].label.toLowerCase()).join(' or ')} for ${v.acid.formula} against ${v.base.formula}.`);
      auto.push(score(crit('setup'), m, n));
    }

    // ---- procedure (5)
    {
      const n: string[] = [];
      let m = 0;
      if (!runs.length) n.push('No titration was completed.');
      else {
        if (runs[0]!.kind === 'ROUGH') m++;
        else n.push('Do a rough titration first to find roughly where the end point is.');
        if (accurate.length >= 2) m++;
        else n.push('Do at least two accurate titrations (three is better) to get concordant titres.');
        const clean = accurate.filter((r) => delivered(r) >= endpointOf(r) - 0.005 && delivered(r) - endpointOf(r) <= OVERSHOOT_TOL);
        if (clean.length >= 2) m++;
        else {
          const over = accurate.filter((r) => delivered(r) - endpointOf(r) > OVERSHOOT_TOL).length;
          const short = accurate.filter((r) => delivered(r) < endpointOf(r) - 0.005).length;
          n.push(over ? `${over} accurate titration${over === 1 ? '' : 's'} went past the end point: add the acid drop by drop near the end point.` : short ? 'An accurate titration was stopped before the colour changed permanently.' : 'Two accurate titrations must reach the end point cleanly.');
        }
        if (runs.every((r) => r.swirls > 0)) m++;
        else n.push('Swirl the flask while adding the acid so it mixes and the colour change is seen at once.');
        if (runs.every((r) => r.funnelRemoved)) m++;
        else n.push('Remove the filter funnel from the burette before taking the initial reading: drips from it change the volume.');
      }
      auto.push(score(crit('procedure'), m, n));
    }

    // ---- table of readings (6)
    const recordedTitre = (r: (typeof runs)[number]) => parseNumber(r.row?.titre);
    {
      const n: string[] = [];
      let m = 0;
      const cells = runs.flatMap((r) => [r.row?.initial ?? '', r.row?.final ?? '', r.row?.titre ?? '']);
      if (!runs.length || cells.some((c) => !c.trim())) n.push(runs.length ? 'Fill in every reading and titre in the table.' : 'There are no readings to mark.');
      if (runs.length && cells.length && cells.every((c) => c.trim() && parseNumber(c) !== null && decimalPlaces(c) === 2)) m++;
      else if (runs.length) n.push('Record every burette reading and titre to 2 decimal places (e.g. 0.00, 23.40).');
      const checks = runs.flatMap((r) => [withinAbs(parseNumber(r.row?.initial), r.initial!, READING_TOL), withinAbs(parseNumber(r.row?.final), r.final!, READING_TOL)]);
      const good = checks.filter(Boolean).length;
      if (checks.length && good === checks.length) m += 2;
      else if (checks.length && good >= checks.length / 2) {
        m += 1;
        n.push(`${checks.length - good} reading${checks.length - good === 1 ? '' : 's'} did not match the burette (read the bottom of the meniscus at eye level, to ±0.05 cm³).`);
      } else if (checks.length) n.push('Most readings did not match the burette: read the bottom of the meniscus at eye level, to the nearest 0.05 cm³.');
      const subtracted = runs.filter((r) => {
        const i = parseNumber(r.row?.initial);
        const f = parseNumber(r.row?.final);
        const t = recordedTitre(r);
        return i !== null && f !== null && t !== null && withinAbs(t, f - i, 0.011);
      });
      if (runs.length && subtracted.length === runs.length) m++;
      else if (runs.length) n.push('Each titre is the final reading minus the initial reading.');
      const titres = accurate.map(recordedTitre).filter((t): t is number => t !== null);
      if (concordantSets(titres, CONCORDANT).length) m++;
      else if (runs.length) n.push(`Repeat the accurate titration until two titres agree within ±${CONCORDANT.toFixed(2)} cm³.`);
      // How well the end point was judged: the burette's own (true) volumes, not the written ones.
      const actual = accurate.map(delivered);
      const sets = concordantSets(actual, CONCORDANT);
      const best = sets.length ? mean(sets[0]!.map((i) => actual[i]!)) : actual.length ? mean(actual) : null;
      if (best !== null && withinAbs(best, v.trueTitre, ACCURACY_TOL)) m++;
      else if (best !== null) n.push(`Your end point was ${sf(Math.abs(best - v.trueTitre), 2)} cm³ ${best > v.trueTitre ? 'past' : 'short of'} the true titre (${v.trueTitre.toFixed(2)} cm³)${usedIndicator && !v.indicators.includes(usedIndicator) ? ', because of the indicator' : ''}.`);
      auto.push(score(crit('readings'), m, n));
    }

    // ---- calculations (5) and units (1)
    const ans = state.answers;
    const val = (id: TitrationTaskId) => parseNumber(ans[id]?.value);
    const unitOf = (id: TitrationTaskId) => normaliseUnit(ans[id]?.unit);
    const expectedUnit = Object.fromEntries(v.tasks.map((t) => [t.id, t.unit])) as Record<TitrationTaskId, string>;
    const wrongUnit = (id: TitrationTaskId) => {
      const u = unitOf(id);
      return u !== '' && u !== expectedUnit[id];
    };
    {
      const n: string[] = [];
      let m = 0;
      // Mean titre: the mean of any concordant set of the student's own accurate titres.
      const titres = accurate.map(recordedTitre).filter((t): t is number => t !== null);
      const means = concordantSets(titres, CONCORDANT).map((set) => mean(set.map((i) => titres[i]!)));
      const mt = val('meanTitre');
      if (mt !== null && !wrongUnit('meanTitre') && means.some((x) => withinAbs(mt, x, 0.011))) m++;
      else if (mt === null) n.push('Give the mean titre.');
      else if (wrongUnit('meanTitre')) n.push('The mean titre is a volume, in cm³.');
      else if (!means.length) n.push('Average only titres that agree within ±0.10 cm³ (never the rough one).');
      else n.push(`Average only your concordant accurate titres (e.g. ${sf(means[0]!, 4)} cm³), not the rough one or titres that disagree.`);
      // Concentration of A from the mass concentration.
      const ca = val('concA');
      if (!wrongUnit('concA') && withinRel(ca, v.acidConc, 0.01)) m++;
      else if (ca === null) n.push('Work out the concentration of A in mol dm⁻³.');
      else if (wrongUnit('concA')) n.push('A’s concentration in mol dm⁻³ has the unit mol dm⁻³.');
      else n.push(`Concentration of A = mass concentration ÷ molar mass = ${v.acidMassConc.toFixed(2)} ÷ ${v.acid.molarMass} = ${sf(v.acidConc)} mol dm⁻³.`);
      // Concentration of B: true answer, or carried forward from the student's own mean titre / concentration of A.
      const titreUsed = mt !== null && mt > 1 && mt < 60 ? mt : v.trueTitre;
      const caUsed = [v.acidConc, ...(ca !== null && ca > 0 ? [ca] : [])];
      const cb = val('concB');
      const cbTargets = caUsed.map((c) => (c * titreUsed * v.b) / (v.a * v.pipette));
      if (!wrongUnit('concB') && (withinRel(cb, v.baseConc, 0.02) || cbTargets.some((t) => withinRel(cb, t, 0.015)))) m += 2;
      else if (cb === null) n.push('Work out the concentration of B in mol dm⁻³.');
      else if (wrongUnit('concB')) n.push('B’s concentration in mol dm⁻³ has the unit mol dm⁻³.');
      else {
        const ratioSlips = v.a !== v.b ? caUsed.flatMap((c) => [(c * titreUsed) / v.pipette, (c * titreUsed * v.a) / (v.b * v.pipette)]) : [];
        if (ratioSlips.some((t) => withinRel(cb, t, 0.015))) {
          m += 1;
          n.push(`Use the mole ratio from the equation: ${v.a} mol of acid react with ${v.b} mol of base (${v.equation}).`);
        } else n.push(`C(B) = C(A) × V(A) × ${v.b} ÷ (${v.a} × V(B)) = ${sf(v.acidConc)} × ${titreUsed.toFixed(2)} × ${v.b} ÷ (${v.a} × ${v.pipette.toFixed(1)}).`);
      }
      // Last answer: g dm⁻³ or percentage purity, carried forward from the student's concentration of B.
      const cbUsed = [v.baseConc, ...(cb !== null && cb > 0 ? [cb] : [])];
      const fin = val('final');
      const targets = cbUsed.map((c) => (v.finalTask === 'PURITY' ? ((c * v.base.molarMass) / v.impureMassConc!) * 100 : c * v.base.molarMass));
      if (!wrongUnit('final') && (withinRel(fin, truth.final, 0.02) || targets.some((t) => withinRel(fin, t, 0.015)))) m++;
      else if (fin === null) n.push(v.finalTask === 'PURITY' ? 'Work out the percentage purity.' : 'Work out the concentration of B in g dm⁻³.');
      else if (wrongUnit('final')) n.push(v.finalTask === 'PURITY' ? 'Percentage purity is given in %.' : 'Mass concentration is in g dm⁻³.');
      else n.push(v.finalTask === 'PURITY' ? `Purity = (mass of pure ${v.base.formula} per dm³ ÷ mass of sample per dm³) × 100.` : `Mass concentration = C(B) × molar mass of ${v.base.formula} (${v.base.molarMass} g mol⁻¹).`);
      auto.push(score(crit('calculations'), m, n));

      const missing = v.tasks.filter((t) => ans[t.id]?.value.trim() && !unitOf(t.id));
      const wrong = v.tasks.filter((t) => ans[t.id]?.value.trim() && wrongUnit(t.id));
      const blank = v.tasks.filter((t) => !ans[t.id]?.value.trim());
      const un: string[] = [];
      if (blank.length === v.tasks.length) un.push('No answers to check the units of.');
      if (missing.length) un.push(`Give a unit with ${missing.map((t) => t.label.split(',')[0]!.toLowerCase()).join('; ')}.`);
      if (wrong.length) un.push(`Wrong unit: ${wrong.map((t) => `${UNIT_TEXT[t.unit]} for ${t.label.split(',')[0]!.toLowerCase()}`).join('; ')}.`);
      auto.push(score(crit('units'), blank.length === v.tasks.length || missing.length || wrong.length ? 0 : 1, un));
    }

    // ---- written answers (AI)
    const info = usedIndicator ? TITRATION_INDICATOR_INFO[usedIndicator] : null;
    const endWords: Record<TitrationIndicator, string[][]> = {
      METHYL_ORANGE: [['yellow'], ['orange', 'pink', 'red', 'peach']],
      PHENOLPHTHALEIN: [['pink', 'red', 'purple', 'magenta'], ['colourless', 'colorless', 'no colour', 'no color', 'clear']],
      LITMUS: [['blue'], ['purple', 'red', 'violet']],
    };
    const ai: AiItem[] = [
      {
        criterionId: 'endpoint',
        question: `State the colour change at the end point. (The student used ${info ? info.label.toLowerCase() : 'no recorded indicator'}; base B in the flask, acid A added from the burette.)`,
        answer: state.written.endpoint.trim(),
        guide: info ? `1 mark: from ${info.baseName} to ${info.endName} (the change of ${info.label.toLowerCase()} from base to acid). Both colours, in the right order, are needed.` : crit('endpoint').guide,
        keywords: usedIndicator ? endWords[usedIndicator] : [['yellow', 'pink', 'blue'], ['orange', 'colourless', 'colorless', 'red', 'purple']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken to ensure accurate results in this titration.',
        answer: state.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half a mark for one). ${crit('precautions').guide}`,
        keywords: [['funnel'], ['meniscus', 'eye level', 'parallax'], ['swirl', 'shake'], ['dropwise', 'drop by drop', 'drop wise', 'drops'], ['rinse', 'rinsed', 'rinsing'], ['bubble', 'bubbles'], ['tile'], ['leak', 'leaking', 'tap'], ['concordant', 'repeat']],
        need: 2,
      },
    ];

    // ---- worked solution and facts
    const per = v.finalTask === 'PURITY' ? '%' : 'g dm⁻³';
    const solution = [
      `Equation: ${v.equation}. Mole ratio acid : base = ${v.a} : ${v.b}.`,
      `Suitable indicator: ${v.indicators.map((i) => TITRATION_INDICATOR_INFO[i].label.toLowerCase()).join(' or ')}. End point: ${v.indicators.map((i) => `${TITRATION_INDICATOR_INFO[i].label.toLowerCase()} turns from ${TITRATION_INDICATOR_INFO[i].baseName} to ${TITRATION_INDICATOR_INFO[i].endName}`).join('; ')}.`,
      `True titre for this lab: ${v.trueTitre.toFixed(2)} cm³ (your concordant titres should agree with it within ±${ACCURACY_TOL.toFixed(2)} cm³).`,
      `C(A) = ${v.acidMassConc.toFixed(2)} g dm⁻³ ÷ ${v.acid.molarMass} g mol⁻¹ = ${sf(v.acidConc)} mol dm⁻³.`,
      `C(B) = C(A) × V(A) × ${v.b} ÷ (${v.a} × V(B)) = ${sf(v.acidConc)} × ${v.trueTitre.toFixed(2)} × ${v.b} ÷ (${v.a} × ${v.pipette.toFixed(1)}) = ${sf(v.baseConc)} mol dm⁻³.`,
      v.finalTask === 'PURITY'
        ? `Mass of pure ${v.base.formula} per dm³ = ${sf(v.baseConc)} × ${v.base.molarMass} = ${sf(v.baseMassConc)} g; purity = ${sf(v.baseMassConc)} ÷ ${v.impureMassConc!.toFixed(2)} × 100 = ${sf(v.purity!)} %.`
        : `C(B) in g dm⁻³ = ${sf(v.baseConc)} × ${v.base.molarMass} = ${sf(v.baseMassConc)} g dm⁻³.`,
    ];
    const facts = [
      `Lab: ${v.acid.formula} (burette) against 25.0 cm³ ${v.base.formula}; indicator used: ${info?.label ?? 'none'}; titrations completed: ${runs.length} (${accurate.length} accurate).`,
      `True titre ${v.trueTitre.toFixed(2)} cm³; student's mean titre ${ans.meanTitre.value || '—'} ${ans.meanTitre.unit}.`,
      `Answers: C(A) ${ans.concA.value || '—'} (true ${sf(v.acidConc)} mol dm⁻³); C(B) ${ans.concB.value || '—'} (true ${sf(v.baseConc)} mol dm⁻³); last ${ans.final.value || '—'} (true ${sf(truth.final)} ${per}).`,
    ];
    return { auto, ai, solution, facts };
  },
};
