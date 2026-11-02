import {
  CELL_E0,
  CHEM_ELECTRO,
  DISP_FE_TARGET,
  DISP_VOL,
  ELEC_MIN_RUN,
  ELEC_SETTLE,
  ELEC_TARGET,
  ELEC_TOL,
  FARADAY,
  M_CU,
  M_FE,
  RUST_MIN_DAYS,
  RUST_PLAN,
  RUST_TUBES,
  RUST_V0,
  RUST_WEEK,
  cellReading,
  chemElectroVariant,
  dispChain,
  dispExcess,
  dispExtent,
  dispFe,
  dispPeak,
  dispProduct,
  elecCharge,
  elecCurrent,
  elecCurrentRange,
  elecMasses,
  elecStepAt,
  rustChain,
  rustIndex,
  rustSeen,
  woolGas,
  woolReading,
  woolSettled,
  type ChemElectroState,
  type ChemElectroVariant,
  type CriterionScore,
  type ElectroAnswerId,
  type ElectroUnit,
  type RustTube,
} from '@aischool/shared';
import { decimalPlaces, normaliseUnit, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => CHEM_ELECTRO.rubric.find((c) => c.id === id)!;
const UNIT_TEXT: Record<ElectroUnit, string> = { C: 'C (coulombs)', mol: 'mol', g: 'g', V: 'V', '%': '%', degC: '°C', cm3: 'cm³' };
type Out = { auto: CriterionScore[]; ai: AiItem[]; solution: string[]; facts: string[] };

/**
 * Marks the electrochemistry lab the way a WAEC examiner's scheme does: the
 * setting up and procedure of the lesson's experiment (the marked mistakes:
 * unsanded plates, the cathode on the + terminal, plates touching, the
 * current left to drift, deposit rubbed off, a reversed voltmeter, a dry salt
 * bridge, unclean filings, filtering too soon, unboiled water in tube B, an
 * unstoppered tube C, unlevelled readings…), the readings against the
 * simulated balance, ammeter, voltmeter, thermometer and graduated tube, the
 * calculations with errors carried forward, and units. Observations, the
 * explanation and precautions go to AI.
 */
export const chemElectroGrader: SimulatorGrader<'chem-electro'> = {
  id: 'chem-electro',
  grade(state: ChemElectroState, seed: number): GraderOutput {
    const task = state.task ?? 'ELEC';
    const v = chemElectroVariant(seed, task);
    const out = task === 'ELEC' ? gradeElec(state, v) : task === 'CELL' ? gradeCell(state, v) : task === 'DISP' ? gradeDisp(state, v) : gradeRust(state, v);
    out.auto.push(unitsScore(state, v));
    return out;
  },
};

// ------------------------------------------------------------------ helpers

const rec = (s: ChemElectroState, k: keyof ChemElectroState['rec']) => parseNumber(s.rec[k]);
const val = (s: ChemElectroState, id: ElectroAnswerId) => parseNumber(s.answers[id]?.value);
/** Is the written unit the expected one? */
export function unitOk(expected: ElectroUnit, raw: string): boolean {
  const u = raw.trim();
  const l = u.toLowerCase();
  if (!u) return false;
  if (expected === 'C') return /^(c|coulombs?|coul|as|a\s*s)$/i.test(u);
  if (expected === 'degC') return /^(°\s*c|º\s*c|deg(rees?)?\s*c(elsius)?|c|celsius|degc|oc|0c|k|kelvin)$/i.test(l);
  const n = normaliseUnit(u);
  if (expected === 'V') return n === 'V';
  if (expected === 'cm3') return n === 'cm3';
  return n === expected;
}
function unitsScore(s: ChemElectroState, v: ChemElectroVariant): CriterionScore {
  const tasks = v.tasks;
  const blank = tasks.filter((t) => !s.answers[t.id]?.value.trim());
  const wrong = tasks.filter((t) => s.answers[t.id]?.value.trim() && !unitOk(t.unit, s.answers[t.id]?.unit ?? ''));
  const n: string[] = [];
  if (blank.length === tasks.length) n.push('No answers to check the units of.');
  if (wrong.length) n.push(`Units: ${wrong.map((t) => `${t.label.split(' (')[0]!.split(',')[0]!.toLowerCase()} — ${UNIT_TEXT[t.unit]}`).join('; ')}.`);
  return score(crit('units'), blank.length === tasks.length || wrong.length ? 0 : 1, n);
}
const near = (x: number | null, targets: number[], rel = 0.015) => targets.some((t) => withinRel(x, t, rel));
const dp = (raw: string, n: number) => !!raw.trim() && parseNumber(raw) !== null && decimalPlaces(raw) === n;
const half = (raw: string) => {
  const x = parseNumber(raw);
  return x !== null && raw.trim().includes('.') && Math.abs(x * 2 - Math.round(x * 2)) < 1e-6;
};
const pos = (...xs: (number | null)[]) => xs.filter((x): x is number => x !== null && x > 0);

// ------------------------------------------------------------------ ELEC

function gradeElec(s: ChemElectroState, v: ChemElectroVariant): Out {
  const w = s.elec;
  const auto: CriterionScore[] = [];
  const m = elecMasses(v, w);
  const Q = elecCharge(v, w);
  const meanI = w.ran > 0 ? Q / w.ran : 0;
  {
    const n: string[] = [];
    let k = 0;
    if (w.sanded && !w.sandedAfterWeigh) k++;
    else n.push(w.sandedAfterWeigh ? 'You sanded the plates after weighing them: sanding removes metal, so the "before" masses were too high. Clean, wash and dry them first, then weigh.' : 'Clean the copper plates with sandpaper first: an oxide film makes the copper deposit patchy and flaky.');
    if (w.connected && w.cathodeTo === 'NEG' && w.gap === 'APART') k++;
    else n.push(!w.connected ? 'The circuit was never connected.' : w.cathodeTo === 'POS' ? 'The plate you called the cathode was joined to the + terminal, so it was really the anode and lost copper. The cathode goes to the negative terminal.' : 'Keep the plates apart: touching plates short-circuit the cell and nothing is deposited.');
    auto.push(score(crit('setup'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    if (w.weighedBefore) k++;
    else n.push('Weigh both plates before the electrolysis.');
    const tSet = Math.min(w.ran, ELEC_SETTLE);
    const iSet = w.ran > 0 ? elecCurrent(v, elecStepAt(w, tSet), tSet) : null;
    if (iSet !== null && withinAbs(iSet, ELEC_TARGET, ELEC_TOL)) k++;
    else n.push(iSet === null ? 'No current was passed.' : `Adjust the rheostat until the ammeter reads 0.50 A at the start (it read ${iSet.toFixed(2)} A).`);
    if (w.ran >= ELEC_MIN_RUN) k++;
    else if (w.ran > 0) n.push(`The current flowed for only ${Math.round(w.ran / 60)} min: run it for about 40 min so the change in mass is large enough to weigh to 0.01 g.`);
    if (w.removed && w.rinse) k++;
    else if (w.ran > 0) n.push('Remove the plates and rinse them gently with water, then propanone.');
    if (w.weighedAfter && w.dry && w.dry !== 'NONE') k++;
    else if (w.removed) n.push(w.weighedAfter ? 'Dry the plates before reweighing: water adds mass.' : 'Dry and reweigh both plates.');
    auto.push(score(crit('procedure'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    const range = w.ran > ELEC_SETTLE ? elecCurrentRange(v, w) : null;
    if (range && range.max - ELEC_TARGET <= ELEC_TOL + 1e-9 && ELEC_TARGET - range.min <= ELEC_TOL + 1e-9) k++;
    else if (range) n.push(`The current drifted to ${(range.max - ELEC_TARGET > ELEC_TARGET - range.min ? range.max : range.min).toFixed(2)} A: the cell's resistance falls as the solution warms. Watch the ammeter and keep it at 0.50 A with the rheostat.`);
    else n.push('The current was not passed long enough to judge.');
    if (w.rinse === 'GENTLE') k++;
    else if (w.rinse === 'RUB') n.push('Rubbing the cathode dry wiped off some of the soft new copper. Rinse gently and let it dry.');
    else if (w.removed) n.push('Rinse the plates gently.');
    if (!w.shorted && w.dry !== 'FLAME' && w.ran > 0) k++;
    else if (w.dry === 'FLAME') n.push('Never dry plates wet with propanone over a flame: propanone is flammable, and hot copper oxidises (gains mass). Let it evaporate in air.');
    else if (w.shorted) n.push('The plates touched and short-circuited the supply: keep them apart before closing the key.');
    auto.push(score(crit('technique'), k, n));
  }
  const cells = ['cath1', 'cath2', 'an1', 'an2'] as const;
  const recM = Object.fromEntries(cells.map((c) => [c, rec(s, c)])) as Record<(typeof cells)[number], number | null>;
  const tRec = rec(s, 'time');
  const iRec = rec(s, 'current');
  {
    const n: string[] = [];
    let k = 0;
    if (cells.every((c) => dp(s.rec[c], 2))) k++;
    else n.push('Record every mass to 2 decimal places, as the balance shows it.');
    const truth = { cath1: w.weighedBefore ? m.cath1 : null, an1: w.weighedBefore ? m.an1 : null, cath2: w.weighedAfter ? m.cath2 : null, an2: w.weighedAfter ? m.an2 : null };
    const good = cells.filter((c) => truth[c] !== null && withinAbs(recM[c], truth[c]!, 0.011)).length;
    if (good === 4) k += 2;
    else if (good >= 2) {
      k += 1;
      n.push(`${4 - good} mass${4 - good === 1 ? '' : 'es'} did not match the balance (cathode ${m.cath1.toFixed(2)} → ${m.cath2.toFixed(2)} g, anode ${m.an1.toFixed(2)} → ${m.an2.toFixed(2)} g).`);
    } else n.push(w.weighedAfter ? `Your masses do not match the balance (cathode ${m.cath1.toFixed(2)} → ${m.cath2.toFixed(2)} g, anode ${m.an1.toFixed(2)} → ${m.an2.toFixed(2)} g).` : 'The plates were not weighed before and after.');
    if (w.ran > 0 && withinAbs(tRec, w.ran, 2) && withinAbs(iRec, meanI, 0.02)) k++;
    else if (w.ran > 0 && withinAbs(tRec, w.ran / 60, 0.1)) n.push('Record the time in seconds (Q = It needs seconds).');
    else if (w.ran > 0) n.push(`Record the current you kept (about ${meanI.toFixed(2)} A) and the time it flowed (${Math.round(w.ran)} s on the stopwatch).`);
    auto.push(score(crit('readings'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    const Is = pos(iRec, meanI || null);
    const ts = pos(tRec, w.ran || null);
    const qT = [...(Q > 0 ? [Q] : []), ...Is.flatMap((i) => ts.map((t) => i * t))];
    const q = val(s, 'charge');
    if (near(q, qT)) k++;
    else n.push(q === null ? 'Work out Q = It (I in A, t in s).' : Is.some((i) => ts.some((t) => withinRel(q, (i * t) / 60, 0.015))) ? 'Q = It needs the time in SECONDS, not minutes.' : `Q = It = ${sf(meanI, 2)} × ${Math.round(w.ran)} = ${sf(Q)} C.`);
    const qUse = [...qT, ...pos(q)];
    const mol = val(s, 'molesCu');
    if (near(mol, qUse.map((x) => x / (2 * FARADAY)))) k++;
    else n.push(mol === null ? 'Work out the moles of copper: Q ÷ (2 × 96 500).' : near(mol, qUse.map((x) => x / FARADAY)) ? 'Copper needs 2 electrons per atom (Cu²⁺ + 2e⁻ → Cu): divide by 2F, not F.' : `Moles of Cu = Q ÷ 2F = ${sf(Q / (2 * FARADAY))} mol.`);
    const molUse = [...qUse.map((x) => x / (2 * FARADAY)), ...pos(mol)];
    const mc = val(s, 'massCalc');
    if (near(mc, molUse.map((x) => x * M_CU))) k++;
    else n.push(mc === null ? 'Work out the calculated mass: moles × 63.5.' : `Calculated mass = moles × 63.5 = ${sf((Q * M_CU) / (2 * FARADAY))} g.`);
    const gain = val(s, 'gain');
    const gT = [m.cath2 - m.cath1, ...(recM.cath1 !== null && recM.cath2 !== null ? [recM.cath2 - recM.cath1] : [])];
    if (gT.some((x) => withinAbs(gain, x, 0.011))) k++;
    else n.push('Mass gained by the cathode = mass after − mass before.');
    const loss = val(s, 'loss');
    const lT = [m.an1 - m.an2, ...(recM.an1 !== null && recM.an2 !== null ? [recM.an1 - recM.an2] : [])];
    if (lT.some((x) => withinAbs(loss, x, 0.011))) k++;
    else n.push('Mass lost by the anode = mass before − mass after.');
    auto.push(score(crit('calculations'), k, n));
  }
  const calc = (Q * M_CU) / (2 * FARADAY);
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: 'State what you observed at the cathode, at the anode and in the solution during the electrolysis.',
        answer: s.written.observation.trim(),
        guide: '2 marks: the cathode is coated with fresh pink/reddish-brown copper and gains mass (½), the anode is eaten away/loses mass (½), the blue colour of the solution stays the same (1).',
        keywords: [['pink', 'brown', 'reddish', 'copper deposit', 'coated', 'deposited'], ['anode', 'dissolv', 'eaten', 'thinner', 'loses'], ['blue', 'colour'], ['same', 'unchanged', 'does not change', 'constant', 'remains']],
        need: 3,
      },
      {
        criterionId: 'explain',
        question: 'Write the electrode equations, and explain why the blue colour does not fade with copper electrodes.',
        answer: s.written.explain.trim(),
        guide: '1 mark: anode Cu → Cu²⁺ + 2e⁻; cathode Cu²⁺ + 2e⁻ → Cu; the Cu²⁺ ions removed at the cathode are replaced by those formed at the anode, so [Cu²⁺] stays constant. Half for the equations without the reason (or the reason without equations).',
        keywords: [['cu2', 'cu 2', 'cu²', '2e'], ['replace', 'replaced', 'same rate', 'constant', 'formed at the anode', 'dissolves']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this experiment.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['constant', 'rheostat'], ['gently', 'wash', 'rinse'], ['dry', 'propanone'], ['apart', 'touch'], ['sandpaper', 'clean'], ['goggles'], ['flame']],
        need: 2,
      },
    ],
    solution: [
      'Anode: Cu → Cu²⁺ + 2e⁻ (the plate dissolves). Cathode: Cu²⁺ + 2e⁻ → Cu (copper deposited). [Cu²⁺] stays the same, so the blue colour does not fade.',
      `Q = It = ${sf(meanI, 2)} A × ${Math.round(w.ran)} s = ${sf(Q)} C (at exactly 0.50 A for 2400 s: 1200 C).`,
      `Moles of Cu = Q ÷ 2F = ${sf(Q)} ÷ 193 000 = ${sf(Q / (2 * FARADAY))} mol; mass = × 63.5 = ${sf(calc)} g.`,
      `Your plates: cathode ${m.cath1.toFixed(2)} → ${m.cath2.toFixed(2)} g (${(m.cath2 - m.cath1).toFixed(2)} g); anode ${m.an1.toFixed(2)} → ${m.an2.toFixed(2)} g (${(m.an1 - m.an2).toFixed(2)} g). The anode loses a little more (anode sludge).`,
    ],
    facts: [
      `Task ELEC: sanded ${w.sanded ? (w.sandedAfterWeigh ? 'AFTER weighing' : 'yes') : 'no'}; cathode to ${w.cathodeTo ?? '—'}; plates ${w.gap ?? '—'}; ran ${Math.round(w.ran)} s at mean ${meanI.toFixed(3)} A (${w.adjust.length} rheostat moves)${w.shorted ? '; SHORT-CIRCUITED once' : ''}.`,
      `Rinse ${w.rinse ?? '—'}, dry ${w.dry ?? '—'}; deposit ${m.deposit.toFixed(3)} g; balance cathode ${m.cath1.toFixed(2)}→${m.cath2.toFixed(2)}, anode ${m.an1.toFixed(2)}→${m.an2.toFixed(2)}.`,
      `Recorded I ${s.rec.current || '—'} A, t ${s.rec.time || '—'} s; Q ${s.answers.charge.value || '—'}; calc ${s.answers.massCalc.value || '—'} g vs gain ${s.answers.gain.value || '—'} g.`,
    ],
  };
}

// ------------------------------------------------------------------ CELL

function gradeCell(s: ChemElectroState, v: ChemElectroVariant): Out {
  const w = s.cell;
  const auto: CriterionScore[] = [];
  const shown = w.readings.map((r, i) => ({ r, i, x: cellReading(v, r, i) }));
  const withBridge = shown.filter((p) => p.r.bridge && p.r.soaked);
  const good = withBridge.filter((p) => p.r.leads === 'CORRECT' && p.r.meter === 'HIGH' && p.r.placed === 'RIGHT');
  const firstBridge = shown.findIndex((p) => p.r.bridge);
  const noBridge = shown.filter((p, i) => !p.r.bridge && firstBridge >= 0 && i > firstBridge);
  {
    const n: string[] = [];
    let k = 0;
    if (w.sanded) k++;
    else n.push('Clean the zinc and copper strips with sandpaper: oxide films lower the e.m.f.');
    if (w.placed === 'RIGHT') k++;
    else n.push(w.placed === 'SWAPPED' ? 'Each metal must stand in a solution of its own ions: zinc in ZnSO₄, copper in CuSO₄. Zinc in CuSO₄ is coated with copper at once and the cell gives almost nothing.' : 'Place the metal strips in their solutions.');
    auto.push(score(crit('setup'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    if (w.soaked) k++;
    else n.push('Soak the filter-paper salt bridge in saturated KNO₃: a dry paper does not conduct.');
    if (shown.some((p) => p.r.bridge)) k++;
    else n.push('Join the two beakers with the salt bridge.');
    if (shown.some((p) => p.r.bridge && p.r.leads === 'CORRECT')) k++;
    else n.push(shown.some((p) => p.r.leads === 'REVERSED') ? 'The voltmeter was connected the wrong way round (it read negative): + to copper, − to zinc.' : 'Connect the voltmeter: + terminal to copper, − to zinc.');
    if (withBridge.length) k++;
    else n.push('Read the e.m.f. with the (soaked) salt bridge in place.');
    if (noBridge.length) k++;
    else n.push('Remove the salt bridge and note the reading.');
    auto.push(score(crit('procedure'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    if (withBridge.length && withBridge.every((p) => p.r.meter === 'HIGH')) k++;
    else if (withBridge.some((p) => p.r.meter === 'LOW')) n.push('An ordinary voltmeter draws current through the cell, so it reads less than the e.m.f. Use a high-resistance voltmeter.');
    else n.push('No e.m.f. reading was taken.');
    if (w.removedOnce && w.replaced) k++;
    else n.push(w.removedOnce ? 'Replace the salt bridge after the test.' : 'Take the bridge out to test it, then replace it.');
    const xs = good.map((p) => p.x);
    if (xs.length >= 2 && Math.max(...xs) - Math.min(...xs) <= 0.02 + 1e-9) k++;
    else n.push('Take the e.m.f. again with the bridge replaced: two readings that agree show the reading is reliable.');
    auto.push(score(crit('technique'), k, n));
  }
  const emf = rec(s, 'emf');
  const emfNo = rec(s, 'emfNo');
  {
    const n: string[] = [];
    let k = 0;
    if (good.some((p) => withinAbs(emf, p.x, 0.011))) k += 2;
    else if (withBridge.some((p) => withinAbs(emf, Math.abs(p.x), 0.011))) {
      k += 1;
      n.push('Your e.m.f. matches a reading taken with the voltmeter reversed or a low-resistance meter.');
    } else n.push(good.length ? `Your e.m.f. does not match the voltmeter (${good.map((p) => p.x.toFixed(2)).join(' / ')} V).` : 'No good e.m.f. reading to record.');
    if (dp(s.rec.emf, 2)) k++;
    else n.push('Record the e.m.f. to 2 decimal places, as the voltmeter shows it.');
    if (noBridge.length && withinAbs(emfNo, 0, 0.005) && s.rec.emfNo.trim()) k++;
    else n.push(noBridge.length ? 'Without the salt bridge the voltmeter read 0.00 V: the circuit is broken.' : 'Record the reading with the salt bridge removed.');
    auto.push(score(crit('readings'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    const e = val(s, 'ecell');
    if (withinAbs(e, CELL_E0, 0.005)) k += 2;
    else n.push(e === null ? 'Work out E°cell = E°(Cu²⁺/Cu) − E°(Zn²⁺/Zn).' : withinAbs(e, E_SUM, 0.005) ? 'E°cell = E°(right, cathode) − E°(left, anode) = 0.34 − (−0.76) = 1.10 V, not 0.34 + (−0.76).' : withinAbs(e, -CELL_E0, 0.005) ? 'E°cell is positive for the cell as it works: 0.34 − (−0.76) = +1.10 V.' : 'E°cell = 0.34 − (−0.76) = 1.10 V.');
    const p = val(s, 'pctDiff');
    const es = pos(emf, ...good.map((g) => g.x));
    const refs = pos(CELL_E0, e);
    const pT = refs.flatMap((r) => es.map((x) => (Math.abs(r - x) / r) * 100));
    if (p !== null && pT.some((t) => withinAbs(Math.abs(p), t, Math.max(0.15, t * 0.03)))) k += 2;
    else n.push(p === null ? 'Work out the percentage difference = (E°cell − measured) ÷ E°cell × 100.' : `Percentage difference = (1.10 − ${emf?.toFixed(2) ?? 'e.m.f.'}) ÷ 1.10 × 100.`);
    if (/^\s*(zn|zinc)/i.test(s.rec.negative)) k++;
    else n.push('Zinc is the negative electrode (the anode): it is oxidised, Zn → Zn²⁺ + 2e⁻, and electrons flow from it.');
    auto.push(score(crit('calculations'), k, n));
  }
  const best = good.at(-1)?.x ?? null;
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: 'State the voltmeter readings with the salt bridge in place and with it removed, and what they show.',
        answer: s.written.observation.trim(),
        guide: '2 marks: about 1.1 V (the measured value) with the bridge (1); zero when the bridge is removed — the circuit is broken (1).',
        keywords: [['1 1', '1 0', '1 08', '1 09', '1 07', 'volt'], ['zero', '0 00', 'no reading', 'falls to 0', 'drops to 0'], ['broken', 'incomplete', 'circuit']],
        need: 2,
      },
      {
        criterionId: 'explain',
        question: 'Which electrode is negative and why? What is the function of the salt bridge?',
        answer: s.written.explain.trim(),
        guide: '1 mark: zinc is negative — it is more reactive and is oxidised (Zn → Zn²⁺ + 2e⁻), releasing electrons; the salt bridge completes the circuit and keeps the solutions electrically neutral (ions move through it). Half for one part.',
        keywords: [['zinc', 'zn'], ['oxidis', 'loses electrons', 'more reactive', 'releases electrons'], ['complete', 'neutral', 'ions', 'circuit']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this experiment.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['clean', 'sandpaper'], ['high resistance', 'high-resistance'], ['soak', 'soaked'], ['goggles'], ['wash', 'hands'], ['connect', 'terminal']],
        need: 2,
      },
    ],
    solution: [
      'Zn(s) | Zn²⁺(aq) || Cu²⁺(aq) | Cu(s). Zinc (−) is oxidised: Zn → Zn²⁺ + 2e⁻; copper (+): Cu²⁺ + 2e⁻ → Cu.',
      `E°cell = E°(Cu²⁺/Cu) − E°(Zn²⁺/Zn) = +0.34 − (−0.76) = 1.10 V. Your voltmeter: ${best === null ? '—' : `${best.toFixed(2)} V`}.`,
      best === null ? 'No good reading was taken.' : `Percentage difference = (1.10 − ${best.toFixed(2)}) ÷ 1.10 × 100 = ${sf(((CELL_E0 - best) / CELL_E0) * 100, 2)} % (oxide films, junction potential, solutions not exactly 1 mol dm⁻³, not 25 °C).`,
      'With the bridge removed the circuit is broken: 0.00 V. The bridge lets ions move and keeps each solution electrically neutral.',
    ],
    facts: [
      `Task CELL: sanded ${w.sanded ? 'yes' : 'no'}; placed ${w.placed ?? '—'}; bridge soaked ${w.soaked ? 'yes' : 'no'}; meter ${w.meter ?? '—'}; leads ${w.leads ?? '—'}; removed ${w.removedOnce ? 'yes' : 'no'}, replaced ${w.replaced ? 'yes' : 'no'}.`,
      `Readings: ${shown.map((p) => `${p.x.toFixed(2)}${p.r.bridge ? '' : ' (no bridge)'}${p.r.leads === 'REVERSED' ? ' (rev)' : ''}${p.r.meter === 'LOW' ? ' (low-R)' : ''}`).join(', ') || '—'}.`,
      `Recorded e.m.f. ${s.rec.emf || '—'} V, without bridge ${s.rec.emfNo || '—'} V, negative ${s.rec.negative || '—'}; E°cell ${s.answers.ecell.value || '—'}, % diff ${s.answers.pctDiff.value || '—'}.`,
    ],
  };
}
const E_SUM = 0.34 + -0.76;

// ------------------------------------------------------------------ DISP

function gradeDisp(s: ChemElectroState, v: ChemElectroVariant): Out {
  const w = s.disp;
  const auto: CriterionScore[] = [];
  const fe = dispFe(v, w);
  const prod = dispProduct(v, w);
  const cuTrue = Math.round((prod.total - v.disp.paper) * 100) / 100;
  const ext = w.elapsed !== null ? dispExtent(w, w.elapsed) : 0;
  {
    const n: string[] = [];
    let k = 0;
    if (w.filings === 'CLEAN' && fe >= 0.5 && fe <= 0.62) k++;
    else n.push(w.filings === 'RUSTY' ? 'The filings were rusty: the oxide coat slows the reaction and part of the "iron" is rust, so less copper forms. Use clean filings.' : !w.taps ? 'Weigh about 0.56 g of iron filings.' : `Weigh about 0.56 g of filings (you used ${fe.toFixed(2)} g).`);
    if (w.cuso4 !== null && dispExcess(v, w)) k++;
    else n.push(w.cuso4 === null ? 'Measure the CuSO₄ solution.' : `${w.cuso4} cm³ of CuSO₄ is not an excess for ${fe.toFixed(2)} g of iron: some iron is left unreacted and mixed with the copper. Use 50 cm³.`);
    auto.push(score(crit('setup'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    if (w.thermo) k++;
    else n.push('Stand the thermometer in the CuSO₄ and read its temperature before adding the iron.');
    if (w.stir === 'STIR') k++;
    else if (w.added) n.push('Stir: the filings settle and react slowly unless they are kept moving.');
    if (w.elapsed !== null && ext >= 0.99) k++;
    else if (w.elapsed !== null) n.push(`The solid was filtered off after ${Math.round(w.elapsed / 60)} min, before the reaction had finished (${Math.round(ext * 100)} %): grey iron was left in the copper.`);
    else if (w.added) n.push('Filter off the solid when the reaction is complete.');
    if (w.paper) k++;
    else n.push('Weigh a dry filter paper before filtering, to find the mass of copper.');
    if (w.filtered && w.wash && w.dry && w.dry !== 'NONE' && w.weighed) k++;
    else if (w.filtered) n.push(!w.wash ? 'Wash the copper on the paper.' : !w.dry || w.dry === 'NONE' ? 'Dry the copper before weighing.' : 'Weigh the dry paper and copper.');
    auto.push(score(crit('procedure'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    if (w.wash === 'PROPANONE') k++;
    else if (w.filtered) n.push(w.wash === 'NONE' ? 'Wash the copper with water to remove the FeSO₄ and CuSO₄ solution (they add mass), then with propanone so it dries quickly.' : 'After the water, rinse with a little propanone: it carries the water away and evaporates quickly.');
    if (w.dry === 'AIR') k++;
    else if (w.dry === 'FLAME') n.push('Never dry over a flame: propanone is flammable, and hot copper oxidises to black CuO (the mass goes up).');
    else if (w.filtered) n.push('Let the copper dry in a warm place before weighing.');
    if (w.watched && w.thermo) k++;
    else if (w.added) n.push('Leave the thermometer in while the reaction goes on, to catch the highest temperature.');
    auto.push(score(crit('technique'), k, n));
  }
  const feRec = rec(s, 'fe');
  const paperRec = rec(s, 'paper');
  const totRec = rec(s, 'paperCu');
  const cuRec = rec(s, 'cu');
  const t1 = rec(s, 't1');
  const t2 = rec(s, 't2');
  const peak = w.added && w.thermo && w.watched ? dispPeak(v, w, w.elapsed ?? 1e9) : null;
  {
    const n: string[] = [];
    let k = 0;
    if (['fe', 'paper', 'paperCu', 'cu'].every((c) => dp(s.rec[c as 'fe'], 2))) k++;
    else n.push('Record every mass to 2 decimal places, as the balance shows it.');
    if (withinAbs(feRec, fe, 0.011) && w.paper && withinAbs(paperRec, v.disp.paper, 0.011) && w.weighed && withinAbs(totRec, prod.total, 0.011)) k++;
    else n.push(`Your masses do not all match the balance (iron ${fe.toFixed(2)} g, paper ${v.disp.paper.toFixed(2)} g, paper + copper ${prod.total.toFixed(2)} g).`);
    if (half(s.rec.t1) && half(s.rec.t2) && withinAbs(t1, v.disp.room, 0.6) && peak !== null && withinAbs(t2, peak, 0.6)) k++;
    else n.push(peak === null ? 'Read the initial and the highest temperature with the thermometer in the solution.' : `Read the thermometer to the nearest 0.5 °C: initial ${v.disp.room.toFixed(1)} °C, highest about ${peak.toFixed(1)} °C.`);
    if (cuRec !== null && totRec !== null && paperRec !== null && withinAbs(cuRec, totRec - paperRec, 0.011)) k++;
    else n.push('Mass of copper = (paper + copper) − paper.');
    auto.push(score(crit('readings'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    const fes = pos(fe, feRec);
    const mf = val(s, 'molesFe');
    if (near(mf, fes.map((x) => x / M_FE), 0.02)) k++;
    else n.push(mf === null ? 'Work out the moles of iron: mass ÷ 56.' : `Moles of Fe = ${fe.toFixed(2)} ÷ 56 = ${sf(fe / M_FE)} mol.`);
    const nUse = [...fes.map((x) => x / M_FE), ...pos(mf)];
    const mc = val(s, 'massCu');
    if (near(mc, nUse.map((x) => x * M_CU), 0.02)) k++;
    else n.push(mc === null ? 'Work out the theoretical mass of copper: moles × 63.5 (1 : 1).' : near(mc, nUse.map((x) => x * M_FE), 0.02) ? 'Use the molar mass of copper (63.5), not iron.' : `Theoretical copper = ${sf(fe / M_FE)} × 63.5 = ${sf((fe / M_FE) * M_CU)} g.`);
    const thUse = [...nUse.map((x) => x * M_CU), ...pos(mc)];
    const y = val(s, 'yield');
    const cus = pos(cuTrue, cuRec);
    if (near(y, cus.flatMap((c) => thUse.map((t) => (c / t) * 100)), 0.02)) k += 2;
    else n.push(y === null ? 'Work out the percentage: mass obtained ÷ theoretical mass × 100.' : 'Percentage = mass of copper obtained ÷ theoretical mass × 100.');
    const dT = val(s, 'dT');
    const dTs = [...(t1 !== null && t2 !== null ? [t2 - t1] : []), ...(peak !== null ? [peak - v.disp.room] : [])];
    if (dTs.some((x) => withinAbs(dT, x, 0.15))) k++;
    else n.push('Temperature rise = highest temperature − initial temperature.');
    auto.push(score(crit('calculations'), k, n));
  }
  const ch = dispChain(fe, cuTrue);
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: 'State what you observed happening to the solid, the colour of the solution and the temperature.',
        answer: s.written.observation.trim(),
        guide: '2 marks: reddish-brown copper forms (on the iron) (½), the blue solution fades / turns (pale) green (1), the beaker gets warm / the temperature rises (½).',
        keywords: [['brown', 'reddish', 'pink', 'copper'], ['green', 'fade', 'paler', 'lighter'], ['warm', 'temperature rise', 'rises', 'hot', 'exothermic']],
        need: 3,
      },
      {
        criterionId: 'explain',
        question: 'Explain why iron displaces copper, and why the solution changes colour.',
        answer: s.written.explain.trim(),
        guide: '1 mark: iron is more reactive (higher in the activity/electrochemical series) than copper, so it gives electrons to Cu²⁺ (Fe → Fe²⁺ + 2e⁻, Cu²⁺ + 2e⁻ → Cu); blue Cu²⁺ ions are replaced by pale-green Fe²⁺. Half for one part.',
        keywords: [['more reactive', 'higher', 'activity series', 'electropositive', 'reactivity'], ['fe2', 'fe 2', 'fe²', 'iron ii', 'green', 'replaced']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this experiment.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['clean', 'rust'], ['excess'], ['wash'], ['dry', 'propanone'], ['stir'], ['goggles'], ['flame']],
        need: 2,
      },
    ],
    solution: [
      'Fe(s) + CuSO₄(aq) → FeSO₄(aq) + Cu(s): blue Cu²⁺ replaced by pale-green Fe²⁺; reddish-brown copper forms; exothermic.',
      `Moles of Fe = ${fe.toFixed(2)} ÷ 56 = ${sf(ch.molesFe)} mol = moles of Cu; theoretical mass = ${sf(ch.molesFe)} × 63.5 = ${sf(ch.massCu)} g.`,
      `Your copper: ${cuTrue.toFixed(2)} g → ${sf(ch.yield ?? 0)} % (copper lost in filtering${w.filings === 'RUSTY' ? ', rusty iron' : ''}${ext < 0.99 ? ', unreacted iron' : ''}).`,
      `${DISP_VOL} cm³ of ${v.disp.conc.toFixed(2)} mol dm⁻³ CuSO₄ is ${sf((v.disp.conc * DISP_VOL) / 1000)} mol — an excess over ${sf(DISP_FE_TARGET / M_FE, 2)} mol of iron. Temperature: ${v.disp.room.toFixed(1)} °C → about ${(peak ?? dispPeak(v, { ...w, stir: 'STIR', filings: 'CLEAN', cuso4: DISP_VOL }, 1e9)).toFixed(1)} °C.`,
    ],
    facts: [
      `Task DISP: ${w.filings ?? '—'} filings ${fe.toFixed(2)} g; CuSO₄ ${w.cuso4 ?? '—'} cm³ (${dispExcess(v, w) ? 'excess' : 'NOT excess'}); thermometer ${w.thermo ? 'in' : 'not in'}; stir ${w.stir ?? '—'}; filtered at ${w.elapsed === null ? '—' : `${Math.round(w.elapsed)} s`} (${Math.round(ext * 100)} % done).`,
      `Paper first ${w.paper ? 'yes' : 'no'}; wash ${w.wash ?? '—'}; dry ${w.dry ?? '—'}; balance paper ${v.disp.paper.toFixed(2)}, total ${prod.total.toFixed(2)} (Cu ${prod.cu.toFixed(3)}, Fe ${prod.fe.toFixed(3)}).`,
      `Recorded fe ${s.rec.fe || '—'}, Cu ${s.rec.cu || '—'}, T ${s.rec.t1 || '—'}→${s.rec.t2 || '—'} (peak ${peak?.toFixed(1) ?? '—'}).`,
    ],
  };
}

// ------------------------------------------------------------------ RUST

function gradeRust(s: ChemElectroState, v: ChemElectroVariant): Out {
  const w = s.rust;
  const auto: CriterionScore[] = [];
  const t = w.tubes;
  const okA = t.A.nail && t.A.content === 'TAP' && !t.A.oil && !t.A.stopper;
  const okB = t.B.nail && t.B.content === 'BOILED' && t.B.boiled && t.B.oil;
  const okC = t.C.nail && t.C.content === 'CACL2' && t.C.stopper;
  const okD = t.D.nail && t.D.content === 'SALT' && !t.D.oil && !t.D.stopper;
  const lastObs = w.observed.length ? Math.max(...w.observed) : null;
  {
    const n: string[] = [];
    let k = 0;
    if (w.sanded) k++;
    else n.push('Clean the nails with sandpaper first: grease and old rust make the results unfair.');
    if (okB && okC) k++;
    else n.push(!okB ? (t.B.content === 'BOILED' && !t.B.boiled ? 'Tube B: the water must be boiled first to drive out the dissolved air.' : t.B.content === 'BOILED' && !t.B.oil ? 'Tube B: pour a layer of oil on the boiled water so air cannot dissolve back in.' : 'Tube B should hold boiled water under a layer of oil (water, no air).') : t.C.content === 'CACL2' && !t.C.stopper ? 'Tube C: stopper it tightly, or moist air gets in and the CaCl₂ cannot keep it dry.' : 'Tube C should hold anhydrous CaCl₂ and be stoppered (air, no water).');
    auto.push(score(crit('setup'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    for (const [ok, tube, what] of [
      [okA, 'A', 'a nail in tap water (air and water)'],
      [okB, 'B', 'a nail in boiled water under oil'],
      [okC, 'C', 'a nail with anhydrous CaCl₂, stoppered'],
      [okD, 'D', 'a nail in salt water'],
    ] as const) {
      if (ok) k++;
      else n.push(`Tube ${tube} should hold ${what}.`);
    }
    if (w.started && lastObs !== null && lastObs >= RUST_MIN_DAYS) k++;
    else n.push(!w.started ? 'Leave the tubes for a week.' : lastObs === null ? 'Observe the tubes at the end of the week.' : `You last looked at the tubes after ${lastObs.toFixed(1)} days: leave them about a week before observing.`);
    auto.push(score(crit('procedure'), k, n));
  }
  const last = w.readings.at(-1) ?? null;
  {
    const n: string[] = [];
    let k = 0;
    if (w.wool === 'MOIST') k++;
    else n.push(w.wool === 'DRY' ? 'The iron wool was dry: rusting needs water, so it hardly used any oxygen. Moisten it first.' : 'Set up the iron wool in the graduated tube.');
    if (last && woolSettled(v, w, last.day)) k++;
    else if (last) n.push(`Your last reading was on day ${last.day.toFixed(1)}, before the water level had stopped rising. Keep reading until two readings a day apart agree.`);
    else n.push('Read the volume of air in the graduated tube.');
    if (last?.levelled) k++;
    else if (last) n.push('Raise or lower the tube until the water inside and outside are at the same level before reading, so the air is at atmospheric pressure.');
    auto.push(score(crit('technique'), k, n));
  }
  const v0 = rec(s, 'v0');
  const v1 = rec(s, 'vFinal');
  const shown = last ? woolReading(v, w, last.day, last.levelled) : null;
  const rustTruth = (tube: RustTube) => rustSeen(rustIndex(v, w, tube, lastObs ?? 0));
  const yes = (x: string) => /^(y|yes|rust)/i.test(x.trim());
  const no = (x: string) => /^(n|no|none)/i.test(x.trim());
  {
    const n: string[] = [];
    let k = 0;
    if (withinAbs(v0, RUST_V0, 0.1)) k++;
    else n.push('Record the initial volume of air: 50.0 cm³.');
    if (shown !== null && withinAbs(v1, shown, 0.5)) k++;
    else n.push(shown === null ? 'Read the final volume of air.' : `Your final volume does not match the scale (about ${shown.toFixed(1)} cm³).`);
    if (dp(s.rec.v0, 1) && dp(s.rec.vFinal, 1)) k++;
    else n.push('Record the volumes to 1 decimal place (e.g. 40.5).');
    const recs = { A: s.rec.rustA, B: s.rec.rustB, C: s.rec.rustC, D: s.rec.rustD };
    if (lastObs !== null && RUST_TUBES.every((tb) => (rustTruth(tb) ? yes(recs[tb]) : no(recs[tb])))) k++;
    else n.push(lastObs === null ? 'Observe which nails rusted.' : `Rust: ${RUST_TUBES.map((tb) => `${tb} ${rustTruth(tb) ? 'yes' : 'no'}`).join(', ')}.`);
    auto.push(score(crit('readings'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    const v0s = pos(v0, RUST_V0);
    const v1s = pos(v1, shown);
    const volT = v0s.flatMap((a) => v1s.map((b) => a - b));
    const o2 = val(s, 'o2Vol');
    if (volT.some((x) => withinAbs(o2, x, 0.11))) k += 2;
    else n.push(o2 === null ? 'Work out the volume of oxygen used = initial − final volume.' : 'Volume of oxygen used = initial volume − final volume.');
    const pct = val(s, 'o2Pct');
    const pT = [...v0s.flatMap((a) => v1s.map((b) => ((a - b) / a) * 100)), ...(o2 !== null ? v0s.map((a) => (o2 / a) * 100) : [])];
    if (pT.some((x) => withinAbs(pct, x, 0.25))) k += 2;
    else n.push(pct === null ? 'Work out the percentage of oxygen = oxygen used ÷ initial volume × 100.' : 'Percentage of oxygen = volume used ÷ initial volume × 100.');
    const idx = RUST_TUBES.map((tb) => rustIndex(v, w, tb, lastObs ?? RUST_WEEK));
    const most = RUST_TUBES[idx.indexOf(Math.max(...idx))]!;
    if (s.rec.most.trim().toUpperCase().startsWith(most) && Math.max(...idx) > 0) k++;
    else n.push(`Tube ${most} rusted most${most === 'D' ? ': salt speeds up rusting' : ''}.`);
    auto.push(score(crit('calculations'), k, n));
  }
  const gasEnd = woolGas(v, w.wool ? w : { wool: 'MOIST' }, RUST_WEEK);
  const c = rustChain(RUST_V0, gasEnd);
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: 'State what you observed in tubes A, B, C and D after a week, and in the graduated tube.',
        answer: s.written.observation.trim(),
        guide: '2 marks: reddish-brown rust in A and most in D (salt water) (½ + ½); no rust in B and C (½); water rises in the graduated tube as oxygen is used up (½).',
        keywords: [['brown', 'rust'], ['most', 'fastest', 'more', 'salt'], ['no rust', 'not rust', 'did not', 'none', 'no change'], ['rise', 'rose', 'water level', 'up the tube']],
        need: 3,
      },
      {
        criterionId: 'explain',
        question: 'Explain why the nails in B and C did not rust, and why D rusted most.',
        answer: s.written.explain.trim(),
        guide: '1 mark: rusting needs both water and oxygen (air) — B had no air (boiled water, oil layer), C had no water (CaCl₂ dried the air); salt speeds up rusting (electrolyte). Half for one part.',
        keywords: [['water and oxygen', 'water and air', 'oxygen and water', 'air and water', 'both'], ['no air', 'no oxygen', 'boiled', 'oil'], ['no water', 'dry', 'cacl', 'calcium chloride'], ['salt', 'electrolyte', 'faster', 'speeds']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this experiment.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['boil'], ['sandpaper', 'clean'], ['stopper', 'tight'], ['level', 'same temperature'], ['oil'], ['goggles'], ['moist']],
        need: 2,
      },
    ],
    solution: [
      'Rusting needs both water and oxygen: A (air + water) rusts; B (boiled water under oil: no air) and C (dry air over anhydrous CaCl₂) do not; D (salt water) rusts fastest. Rust is hydrated iron(III) oxide, Fe₂O₃·xH₂O.',
      `Iron wool: 50.0 cm³ of air → about ${gasEnd.toFixed(1)} cm³ when the level stops rising (at the starting temperature, levels equal).`,
      `Oxygen used = 50.0 − ${gasEnd.toFixed(1)} = ${c.o2Vol.toFixed(1)} cm³; percentage = ${c.o2Vol.toFixed(1)} ÷ 50.0 × 100 = ${sf(c.o2Pct, 3)} % (accepted ≈ 21 %).`,
      'Prevention: painting, oiling, galvanising (zinc), tin plating, sacrificial protection, alloying (stainless steel).',
    ],
    facts: [
      `Task RUST: sanded ${w.sanded ? 'yes' : 'no'}; A ${okA ? 'ok' : 'WRONG'}, B ${okB ? 'ok' : 'WRONG'}, C ${okC ? 'ok' : 'WRONG'}, D ${okD ? 'ok' : 'WRONG'}; observed day ${lastObs?.toFixed(1) ?? '—'}.`,
      `Wool ${w.wool ?? '—'}; readings ${w.readings.map((r) => `d${r.day.toFixed(1)}${r.levelled ? '' : '(unlevelled)'}=${woolReading(v, w, r.day, r.levelled).toFixed(1)}`).join(', ') || '—'}.`,
      `Recorded v0 ${s.rec.v0 || '—'}, final ${s.rec.vFinal || '—'}; rust A ${s.rec.rustA || '—'} B ${s.rec.rustB || '—'} C ${s.rec.rustC || '—'} D ${s.rec.rustD || '—'}; most ${s.rec.most || '—'}.`,
    ],
  };
}
void RUST_PLAN;
