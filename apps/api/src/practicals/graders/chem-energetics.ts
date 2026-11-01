import {
  CHEM_ENERGETICS,
  EN_C,
  EN_CONC,
  EN_LID_OK,
  EN_M,
  EN_MAX_T,
  EN_SOLID,
  EN_STIR_OK,
  EN_VOL,
  EN_WATCH_PAST,
  SOLY_MASS,
  SOLY_PROMPT,
  SOLY_WATER0,
  chemEnergeticsAnswers,
  chemEnergeticsVariant,
  enExtreme,
  enIdealRun,
  solyFromPoints,
  solyTrueSat,
  type ChemEnergeticsState,
  type ChemEnergeticsVariant,
  type CriterionScore,
  type EnAnswerId,
  type EnCurveRun,
  type EnRun,
  type EnUnit,
} from '@aischool/shared';
import { decimalPlaces, normaliseUnit, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/** A thermometer reading matches within this (°C): it is read to the nearest 0.5 °C. */
const READ_TOL = 0.5;
/** A temperature change this close to what careful technique gives counts as accurate (°C). */
const DT_TOL = 0.7;
/** Saturation temperatures this close to the true curve count as accurate (°C). */
const SAT_TOL = 2;
const crit = (id: string) => CHEM_ENERGETICS.rubric.find((c) => c.id === id)!;
const UNIT_TEXT: Record<EnUnit, string> = { J: 'J', mol: 'mol', 'kJ/mol': 'kJ mol⁻¹', 'g/100g': 'g per 100 g of water', g: 'g', 'mol/kg': 'mol kg⁻¹' };

/**
 * A unit as written → its family and the factor to the family's base unit
 * (J, J mol⁻¹, g per 100 g, g, mol, mol kg⁻¹). '' when blank, 'other' when not recognised.
 */
export function energeticsUnit(raw: string | null | undefined): { u: 'J' | 'J/mol' | 'g/100g' | 'g' | 'mol' | 'mol/kg' | 'K' | '' | 'other'; f: number } {
  const s = (raw ?? '')
    .replace(/[⁻−–—]/g, '-')
    .replace(/¹/g, '1')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\^/g, '')
    .replace(/[()]/g, '');
  if (!s) return { u: '', f: 1 };
  if (/^(j|joules?)$/.test(s)) return { u: 'J', f: 1 };
  if (/^(kj|kilojoules?)$/.test(s)) return { u: 'J', f: 1000 };
  if (/^(j\/mol|jmol-1|j\.mol-1|jpermol|j\/mole)$/.test(s)) return { u: 'J/mol', f: 1 };
  if (/^(kj\/mol|kjmol-1|kj\.mol-1|kjpermol|kj\/mole|kjmole-1)$/.test(s)) return { u: 'J/mol', f: 1000 };
  if (/^(g\/100g|gper100g|g\/100gwater|g\/100gofwater|gper100gofwater|gper100gwater|g\/100gh2o|g100g-1|g\/100gsolvent)$/.test(s)) return { u: 'g/100g', f: 1 };
  if (/^(mol\/kg|molkg-1|mol\.kg-1|molperkg|molal|mol\/kgofwater|molperkgofwater|mol\/kgwater)$/.test(s)) return { u: 'mol/kg', f: 1 };
  if (/^(k|kelvin|°c|oc|degc|c)$/.test(s)) return { u: 'K', f: 1 };
  const n = normaliseUnit(raw);
  if (n === 'g') return { u: 'g', f: 1 };
  if (n === 'mol') return { u: 'mol', f: 1 };
  return { u: 'other', f: 1 };
}
const FAMILY: Record<EnUnit, ReturnType<typeof energeticsUnit>['u']> = { J: 'J', mol: 'mol', 'kJ/mol': 'J/mol', 'g/100g': 'g/100g', g: 'g', 'mol/kg': 'mol/kg' };

const curveOf = (r: EnRun & { i: number }): EnCurveRun => ({ kind: r.kind, n: r.i, vessel: r.vessel, volA: r.volA, volB: r.volB, solid: r.solid, stirAt: r.stirAt, lidAt: r.lidAt });

/**
 * Marks the energetics labs as a WAEC examiner would: the apparatus (a lagged
 * polystyrene cup, or a water bath for the solubility tube), the procedure,
 * every thermometer reading against the simulated thermometer (it lags and the
 * cup loses heat, so the highest temperature is what the student could really
 * see), the treatment of results (ΔT, exo/endothermic, the solubility curve),
 * the calculations with errors carried forward, and units. The explanation
 * and the precautions go to AI marking.
 */
export const chemEnergeticsGrader: SimulatorGrader<'chem-energetics'> = {
  id: 'chem-energetics',
  grade(state: ChemEnergeticsState, seed: number): GraderOutput {
    const task = state.task ?? 'NEUT';
    const v = chemEnergeticsVariant(seed, task);
    const truth = chemEnergeticsAnswers(v);
    const auto = task === 'SOLY' ? gradeSoly(state, v) : gradeCup(state, v);

    // ---- units (1), shared by all tasks
    {
      const ans = state.answers;
      const given = v.tasks.filter((t) => ans[t.id]?.value.trim());
      const missing = given.filter((t) => !ans[t.id]?.unit.trim());
      const wrong = given.filter((t) => ans[t.id]?.unit.trim() && energeticsUnit(ans[t.id]!.unit).u !== FAMILY[t.unit]);
      const n: string[] = [];
      if (!given.length) n.push('No answers to check the units of.');
      if (missing.length) n.push(`Give a unit with ${missing.map((t) => nameOf(t.label)).join('; ')}.`);
      if (wrong.length) n.push(`Wrong unit: ${wrong.map((t) => `${UNIT_TEXT[t.unit]} for ${nameOf(t.label)}`).join('; ')}.`);
      auto.push(score(crit('units'), !given.length || missing.length || wrong.length ? 0 : 1, n));
    }

    const ai: AiItem[] = [
      task === 'NEUT'
        ? {
            criterionId: 'explanation',
            question: 'Explain why the heat of neutralisation of any strong acid by any strong base is about −57 kJ mol⁻¹, and why ethanoic acid (a weak acid) gives a less negative value.',
            answer: state.written.explanation.trim(),
            guide: '1 mark: the reaction is always H⁺ + OH⁻ → H₂O (the other ions are spectators), so the same energy per mole of water; a weak acid is only partly ionised and some of the energy released is used to ionise it, so ΔH is less negative. Half a mark for only one of these.',
            keywords: [['h2o', 'water', 'hydroxide', 'hydrogen ion', 'same reaction', 'ionic equation', 'spectator'], ['ionis', 'ioniz', 'partial', 'partly', 'dissociat', 'weak']],
            need: 2,
          }
        : task === 'SOLN'
          ? {
              criterionId: 'explanation',
              question: 'Explain, in terms of heat energy, why the temperature fell when NH₄NO₃ dissolved but rose when NaOH dissolved.',
              answer: state.written.explanation.trim(),
              guide: '1 mark: dissolving NH₄NO₃ absorbs heat (from the water/surroundings) — endothermic, ΔH positive — so the temperature falls; dissolving NaOH releases heat — exothermic, ΔH negative — so it rises. Half a mark for only one salt explained.',
              keywords: [['absorb', 'taken in', 'takes in', 'take in', 'gain', 'from the surroundings', 'from the water'], ['releas', 'give out', 'gives out', 'given out', 'evolv', 'liberat'], ['endothermic', 'exothermic']],
              need: 3,
            }
          : {
              criterionId: 'explanation',
              question: 'Define solubility, and explain why crystals form as the solution cools.',
              answer: state.written.explanation.trim(),
              guide: '1 mark: solubility is the maximum mass of solute that will dissolve in (saturate) 100 g of solvent at a given temperature; the solubility of KNO₃ falls as the temperature falls, so the solution becomes saturated and the excess crystallises out.',
              keywords: [['maximum', 'saturat', 'most'], ['100 g', '100g', '100 grams', 'solvent', 'water'], ['temperature', 'cool', 'falls', 'decrease', 'less soluble', 'lower']],
              need: 3,
            },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken to ensure accurate results.',
        answer: state.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half a mark for one). ${crit('precautions').guide}`,
        keywords: [['lid', 'cover'], ['polystyrene', 'plastic', 'insulat', 'lagg', 'heat loss'], ['stir'], ['quick', 'immediate', 'at once'], ['highest', 'lowest', 'steady', 'maximum', 'minimum'], ['eye level', 'parallax'], ['same temperature', 'average', 'initial temperature'], ['dissolved', 'all the solid'], ['first appear', 'crystals appear', 'first crystal'], ['water bath', 'evaporat', 'overheat'], ['burette', 'accurately', 'measured']],
        need: 2,
      },
    ];

    const solution =
      task === 'SOLY'
        ? [
            `Solubility = ${SOLY_MASS.toFixed(1)} × 100 ÷ volume of water (g per 100 g of water), e.g. ${SOLY_WATER0.toFixed(1)} cm³ → ${((SOLY_MASS * 100) / SOLY_WATER0).toFixed(1)} g.`,
            `True solubility of KNO₃ for this lab: ${sf(truth.sHi)} g at ${v.tHi} °C and ${sf(truth.sLo)} g at ${v.tLo} °C (per 100 g of water).`,
            `Mass deposited = ${sf(truth.sHi)} − ${sf(truth.sLo)} = ${sf(truth.mass)} g; at ${v.tLo} °C, ${sf(truth.sLo)} g per 100 g = ${sf(truth.sLo * 10)} g per kg = ${sf(truth.sLo * 10)} ÷ 101 = ${sf(truth.molal)} mol kg⁻¹.`,
            'Plot solubility (y) against temperature (x) and join the points with a smooth curve; read the values from the curve.',
          ]
        : [
            task === 'NEUT'
              ? `Initial temperature = mean of the acid (${v.tA.toFixed(1)} °C) and alkali (${v.tB.toFixed(1)} °C) temperatures; ΔT = highest − initial ≈ ${sf(truth.q / (100 * EN_C), 2)} K with careful technique.`
              : `ΔT = initial (${v.tW.toFixed(1)} °C) − lowest ≈ ${sf(truth.q / (50 * EN_C), 2)} K with careful technique.`,
            task === 'NEUT' ? `Q = 100 × 4.2 × ΔT ≈ ${sf(truth.q)} J; n(H₂O) = 50.0 × 1.00 ÷ 1000 = 0.0500 mol.` : `Q = 50.0 × 4.2 × ΔT ≈ ${sf(truth.q)} J; n(NH₄NO₃) = 4.00 ÷ 80 = 0.0500 mol.`,
            task === 'NEUT' ? `ΔH = −Q ÷ n ≈ ${sf(truth.dH)} kJ mol⁻¹ (exothermic: negative; accepted value about −57 kJ mol⁻¹, a little is lost to the surroundings).` : `ΔH = +Q ÷ n ≈ +${sf(truth.dH)} kJ mol⁻¹ (endothermic: positive; NaOH dissolving is exothermic).`,
          ];
    const doneRuns = state.runs.filter((r) => r.done);
    const facts =
      task === 'SOLY'
        ? [`Lab (SOLY): ${state.soly.runs.filter((r) => r.done).length} saturation temperatures found; KNO₃ weighed ${state.soly.mass ?? '—'} g; curve ${state.curve ?? 'not drawn'}.`, `True solubilities ${sf(truth.sHi)} g (${v.tHi} °C), ${sf(truth.sLo)} g (${v.tLo} °C); student's ${state.answers.sHi.value || '—'}, ${state.answers.sLo.value || '—'}.`]
        : [
            `Lab (${task}): ${doneRuns.length} run(s) completed; vessel ${doneRuns.map((r) => (r.vessel === 'CUP' ? 'polystyrene cup' : 'glass beaker')).join(', ') || '—'}; lid ${doneRuns.map((r) => (r.lidAt === null ? 'never' : `${Math.round(r.lidAt)} s`)).join(', ') || '—'}; stirred ${doneRuns.map((r) => (r.stirAt === null ? 'never' : `from ${Math.round(r.stirAt)} s`)).join(', ') || '—'}.`,
            `Student ΔH ${state.answers.dH.value || '—'} ${state.answers.dH.unit}; careful-technique value ${sf(truth.dH)} kJ mol⁻¹; nature chosen: ${state.nature.main ?? '—'}${task === 'SOLN' ? ` / NaOH ${state.nature.other ?? '—'}` : ''}.`,
          ];
    return { auto, ai, solution, facts };
  },
};

const nameOf = (label: string) => label.split(',')[0]!.replace(/\(.*$/, '').trim().toLowerCase();

// ------------------------------------------------------------------ heat of neutralisation / solution

function gradeCup(state: ChemEnergeticsState, v: ChemEnergeticsVariant): CriterionScore[] {
  const neut = v.task === 'NEUT';
  const runs = state.runs.map((r, i) => ({ ...r, i, row: state.table[i] })).filter((r) => r.done && r.mixed);
  const main = [...runs].reverse().find((r) => r.kind === (neut ? 'NEUT' : 'SALT')) ?? null;
  const naoh = neut ? null : ([...runs].reverse().find((r) => r.kind === 'NAOH') ?? null);
  const auto: CriterionScore[] = [];
  const startOf = (r: typeof main) => (neut ? parseNumber(r?.row?.initial) : parseNumber(r?.row?.a));
  const extOf = (r: NonNullable<typeof main>) => enExtreme(v, curveOf(r), r.elapsed ?? EN_MAX_T);
  const what = neut ? 'highest' : 'lowest';

  // ---- setup (3)
  {
    const n: string[] = [];
    let m = 0;
    if (!main) n.push(neut ? 'No neutralisation was completed.' : 'NH₄NO₃ was never dissolved.');
    else {
      if (main.vessel === 'CUP') m++;
      else n.push('Use a polystyrene (plastic foam) cup: glass conducts heat away and absorbs some of it itself, so the temperature change is too small.');
      if (main.supported) m++;
      else n.push('Stand the polystyrene cup in a beaker for support: it is light and tips over easily.');
      const right = neut ? main.volA === EN_VOL && main.volB === EN_VOL : main.volA === EN_VOL && Math.abs(main.solid - EN_SOLID) < 0.001;
      if (right) m++;
      else n.push(neut ? `Measure 50.0 cm³ of each solution (you used ${main.volA} cm³ of acid and ${main.volB} cm³ of alkali).` : `Use 50.0 cm³ of water and 4.00 g of NH₄NO₃ (you used ${main.volA} cm³ and ${main.solid.toFixed(2)} g).`);
    }
    auto.push(score(crit('setup'), m, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let m = 0;
    if (!main) n.push('No run was completed.');
    else {
      if (main.readA && (!neut || main.readB)) m++;
      else n.push(neut ? 'Read the temperature of the acid AND of the alkali before mixing: the initial temperature is their mean.' : 'Read the temperature of the water before adding the solid.');
      if (main.lidAt !== null && main.lidAt <= EN_LID_OK) m++;
      else n.push(main.lidAt === null ? 'Cover the cup with its lid at once: heat escapes from the open surface.' : `The lid went on ${Math.round(main.lidAt)} s after mixing: cover the cup at once.`);
      if (main.stirAt !== null && main.stirAt <= EN_STIR_OK) m++;
      else n.push(main.stirAt === null ? 'Stir with the thermometer: unstirred, the liquid heats unevenly and the thermometer lags.' : `Start stirring at once (you began ${Math.round(main.stirAt)} s after ${neut ? 'mixing' : 'adding the solid'}).`);
      const full = enExtreme(v, curveOf(main), EN_MAX_T);
      if ((main.elapsed ?? 0) >= full.at + EN_WATCH_PAST) m++;
      else n.push(`You stopped watching after ${Math.round(main.elapsed ?? 0)} s, before the temperature had stopped ${neut ? 'rising' : 'falling'}: keep reading until it turns.`);
    }
    auto.push(score(crit('procedure'), m, n));
  }

  // ---- readings (5)
  {
    const n: string[] = [];
    let m = 0;
    if (!main) n.push('There are no readings to mark.');
    else {
      const row = main.row;
      const cells = neut ? [row?.a, row?.b, row?.initial, row?.extreme] : [row?.a, row?.extreme, ...(naoh ? [naoh.row?.a, naoh.row?.extreme] : [])];
      if (cells.every((c) => c?.trim() && parseNumber(c) !== null && decimalPlaces(c) === 1)) m++;
      else n.push(cells.some((c) => !c?.trim()) ? 'Fill in every temperature in the table.' : 'Record every temperature to one decimal place, read to the nearest 0.5 °C (e.g. 27.5, 34.0).');
      if (neut) {
        const okA = withinAbs(parseNumber(row?.a), v.tA, READ_TOL);
        const okB = withinAbs(parseNumber(row?.b), v.tB, READ_TOL);
        m += (okA ? 1 : 0) + (okB ? 1 : 0);
        if (!okA || !okB) n.push(`${!okA && !okB ? 'The acid and alkali temperatures' : !okA ? 'The acid temperature' : 'The alkali temperature'} did not match the thermometer (read at eye level, to the nearest 0.5 °C, once the reading is steady).`);
      } else {
        if (withinAbs(parseNumber(row?.a), v.tW, READ_TOL)) m++;
        else n.push('The initial water temperature did not match the thermometer: wait until it is steady and read it at eye level.');
        const nr = naoh ? extOf(naoh) : null;
        if (naoh && nr && withinAbs(parseNumber(naoh.row?.a), v.tW, READ_TOL) && withinAbs(parseNumber(naoh.row?.extreme), nr.value, READ_TOL)) m++;
        else n.push(naoh ? 'The NaOH comparison readings did not match the thermometer.' : 'Do the comparison: dissolve 2.00 g of NaOH pellets in 50.0 cm³ of fresh water and record the temperatures.');
      }
      const ex = extOf(main);
      if (withinAbs(parseNumber(row?.extreme), ex.value, READ_TOL)) m++;
      else n.push(`The ${what} temperature did not match what the thermometer showed (${ex.value.toFixed(1)} °C). Watch it closely and record the ${what} value it reaches.`);
      const init = neut ? (v.tA + v.tB) / 2 : v.tW;
      const ideal = Math.abs(enExtreme(v, enIdealRun(neut ? 'NEUT' : 'SALT')).value - init);
      const dTs = parseNumber(row?.dT);
      const dT = dTs !== null ? Math.abs(dTs) : (() => {
        const a = startOf(main);
        const e = parseNumber(row?.extreme);
        return a !== null && e !== null ? Math.abs(e - a) : null;
      })();
      if (dT !== null && withinAbs(dT, ideal, DT_TOL)) m++;
      else if (dT !== null) n.push(`Your temperature change (${dT.toFixed(1)} K) is ${dT < ideal ? 'smaller' : 'larger'} than careful technique gives (${ideal.toFixed(1)} K)${dT < ideal ? `: ${main.vessel === 'BEAKER' ? 'the glass beaker took heat; ' : ''}${main.lidAt === null ? 'no lid; ' : ''}${main.stirAt === null ? 'no stirring; ' : ''}heat was exchanged with the room` : ''}.`);
      else n.push('Work out the temperature change.');
    }
    auto.push(score(crit('readings'), m, n));
  }

  // ---- results (3)
  {
    const n: string[] = [];
    let m = 0;
    const row = main?.row;
    if (!main) n.push('There are no results to mark.');
    else if (neut) {
      const a = parseNumber(row?.a);
      const b = parseNumber(row?.b);
      const i = parseNumber(row?.initial);
      if (a !== null && b !== null && withinAbs(i, (a + b) / 2, 0.051)) m++;
      else n.push('The initial temperature is the mean of the acid and alkali temperatures.');
      const e = parseNumber(row?.extreme);
      const d = parseNumber(row?.dT);
      if (i !== null && e !== null && withinAbs(d, e - i, 0.051)) m++;
      else n.push('ΔT = highest temperature − initial temperature.');
      if (state.nature.main === 'EXO') m++;
      else n.push('The temperature rose: heat was given out, so neutralisation is exothermic.');
    } else {
      const a = parseNumber(row?.a);
      const e = parseNumber(row?.extreme);
      const d = parseNumber(row?.dT);
      if (a !== null && e !== null && d !== null && withinAbs(Math.abs(d), a - e, 0.051)) m++;
      else n.push('ΔT = initial temperature − lowest temperature.');
      const na = parseNumber(naoh?.row?.a);
      const ne = parseNumber(naoh?.row?.extreme);
      const nd = parseNumber(naoh?.row?.dT);
      if (naoh && na !== null && ne !== null && ne > na && nd !== null && withinAbs(Math.abs(nd), ne - na, 0.051)) m++;
      else n.push(naoh ? 'For NaOH, record the initial and highest temperatures and the rise (highest − initial).' : 'The NaOH comparison was not done.');
      if (state.nature.main === 'ENDO' && state.nature.other === 'EXO') m++;
      else n.push('NH₄NO₃ dissolving is endothermic (the temperature falls); NaOH dissolving is exothermic (it rises).');
    }
    auto.push(score(crit('results'), m, n));
  }

  // ---- calculations (4)
  {
    const n: string[] = [];
    let m = 0;
    const ans = state.answers;
    const val = (id: EnAnswerId) => {
      const x = parseNumber(ans[id]?.value);
      return x === null ? null : x * energeticsUnit(ans[id]?.unit).f;
    };
    const truth = chemEnergeticsAnswers(v);
    const mass = neut ? 2 * EN_VOL : EN_VOL;
    const row = main?.row;
    const dTs = parseNumber(row?.dT);
    const dTstudent = dTs !== null ? Math.abs(dTs) : null;
    const qTargets = [truth.q, ...(dTstudent ? [mass * EN_C * dTstudent] : [])];
    const q = val('q');
    if (q !== null && qTargets.some((t) => withinRel(Math.abs(q), t, 0.02))) m++;
    else if (q === null) n.push('Work out Q = mcΔT.');
    else n.push(neut ? 'Q = m × c × ΔT with m = 100 g (50 cm³ of acid + 50 cm³ of alkali), not 50 g.' : 'Q = m × c × ΔT with m = 50.0 g of water (not the mass of the solid).');
    const nTrue = neut ? (EN_CONC * EN_VOL) / 1000 : EN_SOLID / EN_M.NH4NO3;
    const nVal = val('n');
    const nAlt = neut ? null : main ? main.solid / EN_M.NH4NO3 : null;
    if (nVal !== null && (withinRel(nVal, nTrue, 0.02) || (nAlt !== null && withinRel(nVal, nAlt, 0.02)))) m++;
    else if (nVal === null) n.push(neut ? 'Work out the moles of water formed.' : 'Work out the moles of NH₄NO₃.');
    else n.push(neut ? 'Moles of water = moles of HCl = 50.0 × 1.00 ÷ 1000 = 0.0500 mol (H⁺ + OH⁻ → H₂O, 1 : 1).' : 'Moles of NH₄NO₃ = 4.00 ÷ 80 = 0.0500 mol.');
    const dH = val('dH');
    const dHkJ = dH === null ? null : dH / 1000;
    const qUsed = [...qTargets, ...(q !== null && q !== 0 ? [Math.abs(q)] : [])];
    const nUsed = [nTrue, ...(nVal !== null && nVal > 0 ? [nVal] : [])];
    const dHTargets = qUsed.flatMap((qq) => nUsed.map((nn) => qq / nn / 1000));
    if (dHkJ !== null && dHTargets.some((t) => withinRel(Math.abs(dHkJ), t, 0.02))) m++;
    else if (dHkJ === null) n.push('Work out ΔH = Q ÷ n, in kJ mol⁻¹.');
    else n.push(`ΔH = Q ÷ n, then ÷ 1000 for kJ mol⁻¹ (e.g. ${sf(qUsed[qUsed.length - 1]!)} ÷ ${sf(nUsed[nUsed.length - 1]!)} ÷ 1000).`);
    if (dHkJ !== null && (neut ? dHkJ < 0 : dHkJ > 0)) m++;
    else if (dHkJ !== null) n.push(neut ? 'Heat was given out: ΔH is negative for an exothermic reaction.' : 'Heat was absorbed: ΔH is positive for an endothermic change.');
    auto.push(score(crit('calculations'), m, n));
  }
  return auto;
}

// ------------------------------------------------------------------ solubility curve

function gradeSoly(state: ChemEnergeticsState, v: ChemEnergeticsVariant): CriterionScore[] {
  const auto: CriterionScore[] = [];
  const runs = state.soly.runs.map((r, i) => ({ ...r, i, row: state.solyTable[i] })).filter((r) => r.done && r.seen !== null);
  const mass = state.soly.mass ?? SOLY_MASS;

  // ---- setup (3)
  {
    const n: string[] = [];
    let m = 0;
    if (state.soly.mass !== null && Math.abs(state.soly.mass - SOLY_MASS) < 0.001) m++;
    else n.push(state.soly.mass === null ? 'Weigh 4.0 g of KNO₃ into the boiling tube.' : `Weigh 4.0 g of KNO₃ (you used ${state.soly.mass.toFixed(1)} g).`);
    const first = state.soly.runs[0];
    if (first && Math.abs(first.water - SOLY_WATER0) < 0.001) m++;
    else n.push(first ? `Start with 5.0 cm³ of water (you started with ${first.water.toFixed(1)} cm³).` : 'Add 5.0 cm³ of water from the burette.');
    const heated = state.soly.runs.filter((r) => r.heat !== null);
    if (heated.length && heated.every((r) => r.heat === 'BATH')) m++;
    else n.push(heated.some((r) => r.heat === 'FLAME') ? 'Warm the tube in a water bath, not over a naked flame: it boils, spits and loses water, so the solution is more concentrated than you think.' : 'Warm the tube in the water bath.');
    auto.push(score(crit('setup'), m, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let m = 0;
    if (!runs.length) n.push('No saturation temperature was found.');
    else {
      if (runs.every((r) => r.dissolved)) m++;
      else n.push('Warm until ALL the solid has dissolved before letting it cool: undissolved crystals start crystallisation early.');
      if (runs.every((r) => r.stirred)) m++;
      else n.push('Stir continuously with the thermometer while it cools: unstirred solutions supercool and the crystals appear late.');
      if (new Set(runs.map((r) => r.water)).size >= 4) m++;
      else n.push('Find the saturation temperature for at least four volumes of water (add 1.0 cm³ each time).');
      if (runs.every((r) => (r.delay ?? 0) <= SOLY_PROMPT)) m++;
      else n.push('Record the temperature the moment the first crystals appear: later, the solution has cooled further.');
    }
    auto.push(score(crit('procedure'), m, n));
  }

  // ---- readings (5)
  {
    const n: string[] = [];
    let m = 0;
    if (!runs.length) n.push('There are no readings to mark.');
    else {
      const temps = runs.map((r) => r.row?.temp ?? '');
      if (temps.every((c) => c.trim() && parseNumber(c) !== null && decimalPlaces(c) === 1)) m++;
      else n.push(temps.some((c) => !c.trim()) ? 'Record a temperature for every run.' : 'Record temperatures to one decimal place, read to the nearest 0.5 °C.');
      const good = runs.filter((r) => withinAbs(parseNumber(r.row?.temp), r.seen!, READ_TOL)).length;
      if (good === runs.length) m += 2;
      else if (good >= runs.length / 2) {
        m += 1;
        n.push(`${runs.length - good} temperature${runs.length - good === 1 ? '' : 's'} did not match the thermometer when you saw the crystals.`);
      } else n.push('Most temperatures did not match the thermometer: read it at eye level as the first crystals appear.');
      if (runs.every((r) => withinAbs(parseNumber(r.row?.water), r.water, 0.051))) m++;
      else n.push('Record the total volume of water in the tube for each run (5.0, 6.0, 7.0 … cm³).');
      if (runs.every((r) => {
        const w = parseNumber(r.row?.water);
        const s = parseNumber(r.row?.sol);
        return w !== null && w > 0 && s !== null && withinRel(s, (mass * 100) / w, 0.01);
      }))
        m++;
      else n.push('Solubility = mass of KNO₃ × 100 ÷ mass of water (g per 100 g of water), e.g. 4.0 × 100 ÷ 5.0 = 80.0.');
    }
    auto.push(score(crit('readings'), m, n));
  }

  // ---- results: the graph (3)
  const pts = runs
    .map((r) => ({ x: parseNumber(r.row?.temp), y: parseNumber(r.row?.sol) }))
    .filter((p): p is { x: number; y: number } => p.x !== null && p.y !== null);
  {
    const n: string[] = [];
    let m = 0;
    if (pts.length >= 4) m++;
    else n.push('Plot at least four points: solubility (g per 100 g of water) against temperature.');
    if (state.curve === 'SMOOTH' && pts.length >= 3) m++;
    else n.push(state.curve === 'STRAIGHT' ? 'Solubility rises more and more steeply: join the points with a smooth curve, not a straight line.' : 'Join the points with a smooth curve.');
    const sats = runs.map((r) => solyTrueSat(v, r.water, r.lost, mass));
    const near = runs.filter((r, k) => sats[k] !== null && Math.abs(r.seen! - sats[k]!) <= SAT_TOL).length;
    if (runs.length >= 3 && near >= runs.length - 1) m++;
    else if (runs.length) n.push(`${runs.length - near} of your saturation temperatures were more than ${SAT_TOL} °C from the true curve (stir, and note the very first crystals).`);
    auto.push(score(crit('results'), m, n));
  }

  // ---- calculations (4)
  {
    const n: string[] = [];
    let m = 0;
    const ans = state.answers;
    const val = (id: EnAnswerId) => parseNumber(ans[id]?.value);
    const truth = chemEnergeticsAnswers(v);
    const fromCurve = (T: number) => solyFromPoints(pts, T);
    const okS = (x: number | null, T: number, trueS: number) => {
      const c = fromCurve(T);
      return x !== null && ((c !== null && withinRel(x, c, 0.06)) || withinRel(x, trueS, 0.08));
    };
    const sHi = val('sHi');
    const sLo = val('sLo');
    if (okS(sHi, v.tHi, truth.sHi)) m++;
    else n.push(sHi === null ? `Read the solubility at ${v.tHi} °C from your curve.` : `At ${v.tHi} °C your curve gives about ${sf(fromCurve(v.tHi) ?? truth.sHi)} g per 100 g of water.`);
    if (okS(sLo, v.tLo, truth.sLo)) m++;
    else n.push(sLo === null ? `Read the solubility at ${v.tLo} °C from your curve.` : `At ${v.tLo} °C your curve gives about ${sf(fromCurve(v.tLo) ?? truth.sLo)} g per 100 g of water.`);
    const dep = val('mass');
    const hiSet = [truth.sHi, ...(sHi !== null ? [sHi] : []), ...(fromCurve(v.tHi) !== null ? [fromCurve(v.tHi)!] : [])];
    const loSet = [truth.sLo, ...(sLo !== null ? [sLo] : []), ...(fromCurve(v.tLo) !== null ? [fromCurve(v.tLo)!] : [])];
    const depTargets = hiSet.flatMap((h) => loSet.map((l) => h - l)).filter((x) => x > 0);
    if (dep !== null && depTargets.some((t) => withinAbs(dep, t, Math.max(0.6, 0.04 * t)))) m++;
    else n.push(dep === null ? 'Work out the mass of crystals deposited.' : `Mass deposited = solubility at ${v.tHi} °C − solubility at ${v.tLo} °C (both per 100 g of water).`);
    const mol = val('molal');
    if (mol !== null && loSet.some((l) => withinRel(mol, (l * 10) / EN_M.KNO3, 0.02))) m++;
    else n.push(mol === null ? 'Work out the solubility in mol per kg of water.' : `mol kg⁻¹ = (g per 100 g × 10) ÷ 101, e.g. ${sf(loSet[loSet.length - 1]!)} × 10 ÷ 101.`);
    auto.push(score(crit('calculations'), m, n));
  }
  return auto;
}

