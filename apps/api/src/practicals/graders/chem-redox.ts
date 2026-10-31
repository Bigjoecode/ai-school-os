import {
  CHEM_REDOX,
  REDOX_ACID_INFO,
  REDOX_CONCORDANT,
  REDOX_STARCH_LATE,
  REDOX_WARM,
  chemRedoxAnswers,
  chemRedoxVariant,
  redoxChain,
  redoxEndpoint,
  redoxRatio,
  redoxReading,
  redoxStarchEarly,
  redoxTrueEnd,
  type ChemRedoxState,
  type CriterionScore,
  type RedoxTaskId,
} from '@aischool/shared';
import { concordantSets, decimalPlaces, mean, normaliseUnit, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/** A burette reading matches within this (half the 0.1 cm³ graduation). */
const READING_TOL = 0.05;
/** End point judged correctly: the concordant titres' mean within this of the true titre. */
const ACCURACY_TOL = 0.2;
/** Overshooting by more than two drops spoils an accurate titration. */
const OVERSHOOT_TOL = 0.1;
const UNIT_TEXT: Record<string, string> = { cm3: 'cm³', mol: 'mol', 'mol/dm3': 'mol dm⁻³', 'g/dm3': 'g dm⁻³' };
const crit = (id: string) => CHEM_REDOX.rubric.find((c) => c.id === id)!;

/**
 * Marks a redox titration the way a WAEC examiner's scheme does: setting up,
 * procedure, the redox technique of the task (acid, self-indicating KMnO₄,
 * warming, when the starch goes in), the table of burette readings against the
 * simulated burette (the top of the meniscus for KMnO₄), the mole-ratio
 * calculations with errors carried forward, and units. The end-point colour
 * change, the explanation and the precautions go to AI marking.
 */
export const chemRedoxGrader: SimulatorGrader<'chem-redox'> = {
  id: 'chem-redox',
  grade(state: ChemRedoxState, seed: number): GraderOutput {
    const task = state.task ?? 'FE';
    const v = chemRedoxVariant(seed, task);
    const truth = chemRedoxAnswers(v);
    const runs = state.runs.map((r, i) => ({ ...r, i, row: state.table[i] })).filter((r) => r.done && r.initial !== null && r.final !== null);
    const accurate = runs.filter((r) => r.kind === 'ACCURATE');
    const delivered = (r: (typeof runs)[number]) => r.final! - r.initial!;
    const endOf = (r: (typeof runs)[number]) => redoxEndpoint(v, r.i, r);
    const auto: CriterionScore[] = [];
    const permanganate = task !== 'IOD';

    // ---- apparatus and setting up (3)
    {
      const n: string[] = [];
      let m = 0;
      if (state.setup.burette === 'A') m++;
      else n.push(state.setup.burette === 'WATER' ? `Rinse the burette with A (${v.A.formula}), not water: water left inside dilutes it.` : state.setup.burette === 'B' ? `Never rinse the burette with B: it reacts with the ${v.A.formula} you fill it with.` : `Rinse the burette with A (${v.A.formula}) before filling it.`);
      if (state.setup.pipette === 'B') m++;
      else n.push(state.setup.pipette === 'WATER' ? 'Rinse the pipette with B, not water: water dilutes the 25.0 cm³ you measure.' : 'Rinse the pipette with B, the solution it measures.');
      if (state.setup.flask === 'WATER') m++;
      else n.push(state.setup.flask ? 'Rinse the conical flask with distilled water only: anything else changes the amount of B in it.' : 'Rinse the conical flask with distilled water before each titration.');
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
        const clean = accurate.filter((r) => delivered(r) >= endOf(r) - 0.005 && delivered(r) - endOf(r) <= OVERSHOOT_TOL);
        if (clean.length >= 2) m++;
        else {
          const over = accurate.filter((r) => delivered(r) - endOf(r) > OVERSHOOT_TOL).length;
          const short = accurate.filter((r) => delivered(r) < endOf(r) - 0.005).length;
          n.push(
            over
              ? `${over} accurate titration${over === 1 ? '' : 's'} went past the end point: add A drop by drop near the end point.`
              : short
                ? permanganate
                  ? `An accurate titration was stopped before the pink was permanent${task === 'OX' ? ' (in the cold, or at the start, the purple only fades slowly: swirl and wait)' : ''}.`
                  : 'An accurate titration was stopped before the blue-black colour had gone (pale yellow is not the end point).'
                : 'Two accurate titrations must reach the end point cleanly.',
          );
        }
        if (runs.every((r) => r.swirls > 0)) m++;
        else n.push('Swirl the flask while adding A so it mixes and the colour change is seen at once.');
        if (runs.every((r) => r.funnelRemoved)) m++;
        else n.push('Remove the filter funnel from the burette before taking the initial reading: drips from it change the volume.');
      }
      auto.push(score(crit('procedure'), m, n));
    }

    // ---- redox technique (2)
    {
      const n: string[] = [];
      let m = 0;
      if (!runs.length) n.push('No titration was completed.');
      else if (permanganate) {
        const bad = runs.filter((r) => r.acid !== 'H2SO4');
        if (!bad.length) m++;
        else {
          const r = bad[0]!;
          n.push(
            r.acid === null
              ? 'Acidify every portion with about 20 cm³ of dilute H₂SO₄: without acid MnO₄⁻ is reduced only to brown MnO₂ and the titre is wrong.'
              : r.acid === 'HCL'
                ? 'Never acidify with HCl: MnO₄⁻ oxidises the chloride ions to chlorine, so extra KMnO₄ is used. Use dilute H₂SO₄.'
                : `Never acidify with ${REDOX_ACID_INFO[r.acid].formula}: it is an oxidising agent itself${task === 'FE' ? ' and oxidises some of the iron(II)' : ''}. Use dilute H₂SO₄.`,
          );
        }
        if (task === 'FE') {
          if (runs.every((r) => r.indicators.length === 0)) m++;
          else n.push('No indicator is needed: KMnO₄ is self-indicating — the first excess drop turns the solution pale pink.');
        } else {
          const cold = runs.filter((r) => r.startTemp === null || r.startTemp < REDOX_WARM.okMin || r.startTemp > REDOX_WARM.okMax);
          const boiled = runs.filter((r) => r.warm !== null && r.warm > REDOX_WARM.decompose);
          if (!cold.length && !boiled.length) m++;
          else if (boiled.length) n.push('Warm to about 60–70 °C, never near boiling: hot ethanedioic acid decomposes, so less KMnO₄ is needed.');
          else n.push(`Warm every fresh portion to about 60–70 °C before titrating (one began at ${cold[0]!.startTemp === null ? 'room temperature' : `${Math.round(cold[0]!.startTemp)} °C`}): cold, the reaction is too slow to see the end point.`);
        }
      } else {
        const withStarch = accurate.filter((r) => r.starchAt !== null && r.indicators.every((i) => i === 'STARCH'));
        if (accurate.length && withStarch.length === accurate.length) m++;
        else if (runs.some((r) => r.indicators.some((i) => i !== 'STARCH'))) n.push('Starch is the indicator for iodine; acid–base indicators do nothing here.');
        else n.push('Add about 1 cm³ of starch near the end point of every accurate titration: the blue-black colour makes the last of the iodine easy to see.');
        const early = runs.filter((r) => r.starchAt !== null && redoxStarchEarly(v, r.i, r));
        if (runs.some((r) => r.starchAt !== null) && !early.length) m++;
        else if (early.length) n.push('The starch went in too early, while the iodine was still brown: add it only when the colour has faded to pale straw, or the starch–iodine complex is slow to decolourise.');
        else n.push('Starch was never added.');
      }
      auto.push(score(crit('technique'), m, n));
    }

    // ---- table of readings (6)
    const recordedTitre = (r: (typeof runs)[number]) => parseNumber(r.row?.titre);
    {
      const n: string[] = [];
      let m = 0;
      const cells = runs.flatMap((r) => [r.row?.initial ?? '', r.row?.final ?? '', r.row?.titre ?? '']);
      if (!runs.length || cells.some((c) => !c.trim())) n.push(runs.length ? 'Fill in every reading and titre in the table.' : 'There are no readings to mark.');
      if (runs.length && cells.every((c) => c.trim() && parseNumber(c) !== null && decimalPlaces(c) === 2)) m++;
      else if (runs.length) n.push('Record every burette reading and titre to 2 decimal places (e.g. 0.00, 23.40).');
      const pairs = runs.flatMap((r) => [
        [parseNumber(r.row?.initial), r.initial!],
        [parseNumber(r.row?.final), r.final!],
      ]) as [number | null, number][];
      const good = pairs.filter(([x, level]) => withinAbs(x, redoxReading(v, level), READING_TOL)).length;
      const bottom = v.dark ? pairs.filter(([x, level]) => !withinAbs(x, redoxReading(v, level), READING_TOL) && withinAbs(x, level, READING_TOL)).length : 0;
      const how = v.dark ? 'read the TOP of the meniscus of the dark KMnO₄ at eye level' : 'read the bottom of the meniscus at eye level';
      if (pairs.length && good === pairs.length) m += 2;
      else if (pairs.length && good >= pairs.length / 2) {
        m += 1;
        n.push(`${pairs.length - good} reading${pairs.length - good === 1 ? '' : 's'} did not match the burette (${how}, to ±0.05 cm³).`);
      } else if (pairs.length) n.push(bottom ? 'Your readings are about 0.15 cm³ too large: with dark KMnO₄ the bottom of the meniscus cannot be seen, so read the top of it.' : `Most readings did not match the burette: ${how}, to the nearest 0.05 cm³.`);
      const subtracted = runs.filter((r) => {
        const i = parseNumber(r.row?.initial);
        const f = parseNumber(r.row?.final);
        const t = recordedTitre(r);
        return i !== null && f !== null && t !== null && withinAbs(t, f - i, 0.011);
      });
      if (runs.length && subtracted.length === runs.length) m++;
      else if (runs.length) n.push('Each titre is the final reading minus the initial reading.');
      const titres = accurate.map(recordedTitre).filter((t): t is number => t !== null);
      if (concordantSets(titres, REDOX_CONCORDANT).length) m++;
      else if (runs.length) n.push(`Repeat the accurate titration until two titres agree within ±${REDOX_CONCORDANT.toFixed(2)} cm³.`);
      const actual = accurate.map(delivered);
      const sets = concordantSets(actual, REDOX_CONCORDANT);
      const best = sets.length ? mean(sets[0]!.map((i) => actual[i]!)) : actual.length ? mean(actual) : null;
      if (best !== null && withinAbs(best, v.trueTitre, ACCURACY_TOL)) m++;
      else if (best !== null) n.push(`Your end point was ${sf(Math.abs(best - v.trueTitre), 2)} cm³ ${best > v.trueTitre ? 'past' : 'short of'} the true titre (${v.trueTitre.toFixed(2)} cm³)${chemNote(runs, v.trueTitre, (r) => redoxTrueEnd(v, r.i, r))}.`);
      auto.push(score(crit('readings'), m, n));
    }

    // ---- calculations (6) and units (1)
    const ans = state.answers;
    const val = (id: RedoxTaskId) => parseNumber(ans[id]?.value);
    const unitOf = (id: RedoxTaskId) => normaliseUnit(ans[id]?.unit);
    const expected = Object.fromEntries(v.tasks.map((t) => [t.id, t.unit])) as Record<RedoxTaskId, string>;
    const wrongUnit = (id: RedoxTaskId) => {
      const u = unitOf(id);
      return u !== '' && u !== expected[id];
    };
    const nameOf = (id: RedoxTaskId) => v.tasks.find((t) => t.id === id)!.label.split(',')[0]!.replace(/^Amount \(moles\)/, 'moles').toLowerCase();
    {
      const n: string[] = [];
      let m = 0;
      const titres = accurate.map(recordedTitre).filter((t): t is number => t !== null);
      const means = concordantSets(titres, REDOX_CONCORDANT).map((set) => mean(set.map((i) => titres[i]!)));
      const mt = val('meanTitre');
      if (mt !== null && !wrongUnit('meanTitre') && means.some((x) => withinAbs(mt, x, 0.011))) m++;
      else if (mt === null) n.push('Give the mean titre.');
      else if (wrongUnit('meanTitre')) n.push('The mean titre is a volume, in cm³.');
      else if (!means.length) n.push('Average only titres that agree within ±0.10 cm³ (never the rough one).');
      else n.push(`Average only your concordant accurate titres (e.g. ${sf(means[0]!, 4)} cm³), not the rough one or titres that disagree.`);
      const titreUsed = mt !== null && mt > 1 && mt < 60 ? mt : v.trueTitre;
      const titreSet = [v.trueTitre, titreUsed];
      const ok = (x: number | null, trueValue: number, targets: number[]) => withinRel(x, trueValue, 0.02) || targets.some((t) => withinRel(x, t, 0.015));

      // Moles of the standard reagent.
      const nk = val('molesKnown');
      const nkTargets = titreSet.map((t) => redoxChain(v, t).known);
      if (!wrongUnit('molesKnown') && ok(nk, truth.molesKnown, nkTargets)) m++;
      else if (nk === null) n.push(`Work out the ${nameOf('molesKnown')}.`);
      else if (wrongUnit('molesKnown')) n.push('An amount of substance is in mol.');
      else n.push(v.known === 'A' ? `Moles of ${v.A.species} = ${sf(v.A.given!)} × ${titreUsed.toFixed(2)} ÷ 1000.` : `Moles of ${v.B.species} = ${sf(v.B.given!)} × 25.0 ÷ 1000.`);

      // Moles of the other, by the mole ratio (2 marks; a ratio slip earns 1).
      const nu = val('molesUnknown');
      const kUsed = [...nkTargets, ...(nk !== null && nk > 0 ? [nk] : [])];
      const nuTargets = titreSet.flatMap((t) => kUsed.map((k) => redoxChain(v, t, k).unknown));
      const ratio = redoxRatio(v);
      const ratioText = `${v.a} : ${v.b}`;
      if (!wrongUnit('molesUnknown') && ok(nu, truth.molesUnknown, nuTargets)) m += 2;
      else if (nu === null) n.push(`Work out the ${nameOf('molesUnknown')}.`);
      else if (wrongUnit('molesUnknown')) n.push('An amount of substance is in mol.');
      else {
        const slips = kUsed.flatMap((k) => [k, v.known === 'A' ? k / ratio : k * ratio]);
        if (slips.some((t) => withinRel(nu, t, 0.015))) {
          m += 1;
          n.push(`Use the mole ratio from the equation: ${v.A.species} : ${v.B.species} = ${ratioText} (${v.equation}).`);
        } else n.push(`From ${v.equation}, ${v.A.species} : ${v.B.species} = ${ratioText}.`);
      }

      // Concentration (mol dm⁻³) from the student's moles.
      const c = val('conc');
      const uUsed = [truth.molesUnknown, ...nuTargets, ...(nu !== null && nu > 0 ? [nu] : [])];
      const cTargets = titreSet.flatMap((t) => uUsed.map((u) => redoxChain(v, t, null, u).conc));
      if (!wrongUnit('conc') && ok(c, truth.conc, cTargets)) m++;
      else if (c === null) n.push('Work out the concentration in mol dm⁻³.');
      else if (wrongUnit('conc')) n.push('Concentration in mol dm⁻³ has the unit mol dm⁻³.');
      else n.push(v.known === 'A' ? `Concentration = moles in 25.0 cm³ × 1000 ÷ 25.0.` : `Concentration of KMnO₄ = moles in the titre × 1000 ÷ mean titre.`);

      // Mass concentration.
      const g = val('massConc');
      const gTargets = [truth.conc, ...cTargets, ...(c !== null && c > 0 ? [c] : [])].map((x) => x * v.mass.molarMass);
      if (!wrongUnit('massConc') && ok(g, truth.massConc, gTargets)) m++;
      else if (g === null) n.push('Work out the concentration in g dm⁻³.');
      else if (wrongUnit('massConc')) n.push('Mass concentration is in g dm⁻³.');
      else n.push(`Mass concentration = concentration × molar mass of ${v.mass.formula} (${v.mass.molarMass} g mol⁻¹).`);
      auto.push(score(crit('calculations'), m, n));

      const missing = v.tasks.filter((t) => ans[t.id]?.value.trim() && !unitOf(t.id));
      const wrong = v.tasks.filter((t) => ans[t.id]?.value.trim() && wrongUnit(t.id));
      const blank = v.tasks.filter((t) => !ans[t.id]?.value.trim());
      const un: string[] = [];
      if (blank.length === v.tasks.length) un.push('No answers to check the units of.');
      if (missing.length) un.push(`Give a unit with ${missing.map((t) => nameOf(t.id)).join('; ')}.`);
      if (wrong.length) un.push(`Wrong unit: ${wrong.map((t) => `${UNIT_TEXT[t.unit]} for ${nameOf(t.id)}`).join('; ')}.`);
      auto.push(score(crit('units'), blank.length === v.tasks.length || missing.length || wrong.length ? 0 : 1, un));
    }

    // ---- written answers (AI)
    const ai: AiItem[] = [
      {
        criterionId: 'endpoint',
        question: permanganate
          ? `State the colour change at the end point. (KMnO₄ in the burette, ${task === 'FE' ? 'acidified iron(II) solution' : 'warm acidified ethanedioic acid'} in the flask.)`
          : 'State the colour change at the end point. (Sodium thiosulphate in the burette, iodine solution in the flask, starch added near the end point.)',
        answer: state.written.endpoint.trim(),
        guide: permanganate ? '1 mark: from colourless (or pale green/yellow) to (the first permanent) pale pink. Both colours, in that order.' : '1 mark: from blue-black (dark blue) to colourless. Both colours, in that order.',
        keywords: permanganate ? [['colourless', 'colorless', 'no colour', 'pale green', 'green', 'yellow', 'clear'], ['pink', 'purple', 'violet', 'magenta']] : [['blue', 'black', 'blue-black'], ['colourless', 'colorless', 'no colour', 'clear']],
        need: 2,
      },
      {
        criterionId: 'explain',
        question: task === 'FE' ? 'Why is no indicator needed in this titration?' : task === 'OX' ? 'Explain why the first drops of KMnO₄ decolourise slowly and later ones quickly, and why the flask is warmed.' : 'Why is the starch added only near the end point?',
        answer: state.written.explain.trim(),
        guide:
          task === 'FE'
            ? '1 mark: KMnO₄ is self-indicating — it is decolourised (purple → colourless Mn²⁺) while Fe²⁺ remains, and the first excess drop gives a permanent pink.'
            : task === 'OX'
              ? '1 mark: the Mn²⁺ ions produced catalyse the reaction (autocatalysis), so it speeds up once some has formed; warming increases the rate (the reaction is slow at room temperature). Half a mark for only one of these.'
              : '1 mark: at high iodine concentration starch forms a stable (insoluble) blue-black complex with iodine that decolourises slowly, so the end point would be late/indistinct; near the end point little iodine is left.',
        keywords: task === 'FE' ? [['self indicating', 'self-indicating', 'own indicator', 'itself', 'acts as indicator', 'acts as its own'], ['pink', 'purple', 'excess', 'colour', 'decolourised', 'decolorised']] : task === 'OX' ? [['mn2', 'mn 2', 'manganese ii', 'mn²', 'manganese(ii)'], ['catalys', 'autocatal', 'catalyst'], ['warm', 'temperature', 'heat', 'slow']] : [['complex', 'binds', 'bind', 'adsorb'], ['slow', 'late', 'indistinct', 'difficult', 'hard'], ['iodine', 'concentration', 'much']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken to ensure accurate results in this titration.',
        answer: state.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half a mark for one). ${crit('precautions').guide}`,
        keywords: [['funnel'], ['meniscus', 'eye level', 'parallax'], ['swirl', 'shake'], ['dropwise', 'drop by drop', 'drop wise', 'drops'], ['rinse', 'rinsed', 'rinsing'], ['bubble', 'bubbles'], ['tile'], ['h2so4', 'sulphuric', 'tetraoxosulphate', 'acidif'], ['warm', '60', '70', 'boil'], ['starch'], ['concordant', 'repeat']],
        need: 2,
      },
    ];

    // ---- worked solution and facts
    const solution = [
      `Equation: ${v.equation}. Mole ratio ${v.A.species} : ${v.B.species} = ${v.a} : ${v.b}.`,
      permanganate
        ? `KMnO₄ is self-indicating: end point colourless → first permanent pale pink. Acidify with dilute H₂SO₄ only${task === 'OX' ? '; warm each portion to 60–70 °C (Mn²⁺ then catalyses the reaction)' : ''}. Read the top of the meniscus of the dark KMnO₄.`
        : 'Titrate brown → pale straw, add 1 cm³ of starch (blue-black), then dropwise to colourless.',
      `True titre for this lab: ${v.trueTitre.toFixed(2)} cm³ (your concordant titres should agree with it within ±${ACCURACY_TOL.toFixed(2)} cm³).`,
      v.known === 'A'
        ? `Moles of ${v.A.species} = ${sf(v.A.given!)} × ${v.trueTitre.toFixed(2)} ÷ 1000 = ${sf(truth.molesKnown)} mol.`
        : `Moles of ${v.B.species} = ${sf(v.B.given!)} × 25.0 ÷ 1000 = ${sf(truth.molesKnown)} mol.`,
      v.known === 'A'
        ? `Moles of ${v.B.species} in 25.0 cm³ = ${sf(truth.molesKnown)} × ${v.b} ÷ ${v.a} = ${sf(truth.molesUnknown)} mol; concentration = ${sf(truth.molesUnknown)} × 1000 ÷ 25.0 = ${sf(truth.conc)} mol dm⁻³.`
        : `Moles of ${v.A.species} in ${v.trueTitre.toFixed(2)} cm³ = ${sf(truth.molesKnown)} × ${v.a} ÷ ${v.b} = ${sf(truth.molesUnknown)} mol; concentration = ${sf(truth.molesUnknown)} × 1000 ÷ ${v.trueTitre.toFixed(2)} = ${sf(truth.conc)} mol dm⁻³.`,
      `Mass concentration of ${v.mass.formula} = ${sf(truth.conc)} × ${v.mass.molarMass} = ${sf(truth.massConc)} g dm⁻³.`,
    ];
    const facts = [
      `Lab (${task}): ${v.A.formula} (burette) against 25.0 cm³ ${v.B.formula}; titrations completed: ${runs.length} (${accurate.length} accurate).`,
      `Acid used: ${runs.map((r) => (r.acid ? REDOX_ACID_INFO[r.acid].formula : 'none')).join(', ') || '—'}; indicators: ${runs.map((r) => r.indicators.join('+') || 'none').join(', ') || '—'}${task === 'OX' ? `; start temperatures ${runs.map((r) => (r.startTemp === null ? '—' : `${Math.round(r.startTemp)} °C`)).join(', ')}` : ''}${task === 'IOD' ? `; starch at ${runs.map((r) => (r.starchAt === null ? '—' : `${r.starchAt.toFixed(2)} cm³ (${redoxStarchEarly(v, r.i, r) ? 'early' : `late enough, ≤${Math.round(REDOX_STARCH_LATE * 100)} % iodine left`})`)).join(', ')}` : ''}.`,
      `True titre ${v.trueTitre.toFixed(2)} cm³; student's mean titre ${ans.meanTitre.value || '—'} ${ans.meanTitre.unit}.`,
      `Answers: moles ${ans.molesKnown.value || '—'} (true ${sf(truth.molesKnown)}), ${ans.molesUnknown.value || '—'} (true ${sf(truth.molesUnknown)}); conc ${ans.conc.value || '—'} (true ${sf(truth.conc)} mol dm⁻³); ${ans.massConc.value || '—'} (true ${sf(truth.massConc)} g dm⁻³).`,
    ];
    return { auto, ai, solution, facts };
  },
};

/** Why the end point was off, when the chemistry (not the judging) moved it. */
function chemNote<R extends { acid: unknown; warm: number | null }>(runs: R[], trueTitre: number, trueEnd: (r: R) => number): string {
  const moved = runs.find((r) => Math.abs(trueEnd(r) - trueTitre) > ACCURACY_TOL);
  if (!moved) return '';
  if (moved.acid === null) return ' — without acid brown MnO₂ forms instead of Mn²⁺';
  if (moved.acid === 'HCL') return ' — HCl is oxidised by MnO₄⁻';
  if (moved.acid === 'HNO3') return ' — HNO₃ oxidised some of the iron(II)';
  if (moved.warm !== null && moved.warm > REDOX_WARM.decompose) return ' — overheating decomposed some ethanedioic acid';
  return '';
}
