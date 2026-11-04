import type { SimulatorSpec } from '../practicals';
import { PREP_MCQ, PREP_ROWS, chemPrepVariant, type ChemPrepState, type ChemPrepVariant, type PrepClaim, type PrepEvent, type PrepTask } from './chem-prep-data';
import { prepCalcAnswer, prepModelEvents, prepRowKey, prepRowParts } from './chem-prep-runs';
import { prepTubeKey, prepTubeParts, prepTubes } from './chem-prep-tubes';

export * from './chem-prep-data';
export * from './chem-prep-tubes';
export * from './chem-prep-runs';

export const CHEM_PREP: SimulatorSpec = {
  id: 'chem-prep',
  subject: 'Chemistry',
  title: 'Solutions, equilibria, separation, halogens and ammonia',
  topicNames: ['Standard solutions', "Le Chatelier's principle", 'Standard Separation Techniques for Mixtures', 'Periodic gradation of the halogens', 'Nitrogen', 'Chemical equilibrium', 'Halogens', 'Separation of mixtures'],
  minutes: 50,
  rubric: [
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 5,
      how: 'AUTO',
      guide:
        'Standard solution: weighed by difference (bottle + solid, then the bottle again), dissolved in a beaker with stirring, transferred through a funnel with at least two rinsings, made up dropwise to the mark checked at eye level without overshooting, inverted, then 25.0 cm³ pipetted with a filler (pipette rinsed with the solution) and made up in the second flask. Le Chatelier: a very dilute stock, a control tube, FeCl₃, KSCN and NH₄Cl each in its own tube, tubes in hot and in iced water for at least a minute, and chromate with acid then alkali. Sea water: filtered, evaporated without spitting (finished on a water bath), cooled and weighed to constant mass; thermometer bulb at the side arm, condenser water in at the bottom and on, anti-bumping granules, receiver open, heat stopped before the flask boils dry. Halogens: every halogen with both other halides, hexane shaken with each tube that changed, fresh chlorine water, controls and a starch test. Ammonia: NH₄Cl and Ca(OH)₂ weighed and mixed, tube sloping down, dried over CaO, upward delivery into a full jar, the tests on it and the fountain.',
    },
    { id: 'readings', label: 'Observations and readings', marks: 4, how: 'AUTO', guide: 'Every balance and thermometer reading recorded as shown (to 0.01 g / 0.5 °C), and each observation states what was seen: colour deepening or paling against the control, orange then yellow, layer colours in hexane (orange-red / violet), white crystals, a steady 100 °C, damp red litmus turning blue, dense white fumes, the pink fountain.' },
    { id: 'deductions', label: 'Inferences and deductions', marks: 3, how: 'AUTO', guide: 'Each inference follows from its own result (shift right or left, which halogen was liberated or no reaction, salt non-volatile, distillate pure water, the gas alkaline / ammonia / very soluble), and the deduction questions answered.' },
    { id: 'calculation', label: 'Calculation and results', marks: 4, how: 'AUTO', guide: 'Worked from the student’s own readings: mass needed, concentration from the mass weighed, C₁V₁ = C₂V₂ and the stock volume; Kc and its unit; salt mass and g dm⁻³; moles and mass of iodine with the reactivity order and an ionic equation; moles of NH₄Cl, volume of NH₃ and mass of Ca(OH)₂.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions for this practical (1 each), e.g. meniscus at eye level; rinsings transferred; control tube against a white background; very dilute solutions; thermometer at the side arm; water in at the bottom; anti-bumping granules; fresh chlorine water; tube sloping down; dried with CaO.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'The question on the task card (2 marks), e.g. why the flask is made up only to the mark and why the solution is ten times weaker; Le Chatelier’s principle applied; why distillation gives pure water; why chlorine displaces bromide but iodine does not; why ammonia is collected by upward delivery and the fountain works.' },
  ],
};

// ------------------------------------------------------------------ model answers


/** The ideal observation text and claims for a fixed row or a tube. */
export function prepIdealRecord(v: ChemPrepVariant, events: PrepEvent[], row: string): { observation: string; claims: PrepClaim[] } {
  const tube = /^t\d+$/.test(row) ? Number(row.slice(1)) : -1;
  const parts = tube >= 0 ? prepTubeParts(v, events, tube) : prepRowParts(v, events, row);
  const key = tube >= 0 ? prepTubeKey(v, events, tube) : prepRowKey(v, events, row);
  return { observation: parts.map((p) => p.text).join('; '), claims: key?.complete ? [...key.need] : [] };
}

export function prepModelState(v: ChemPrepVariant): ChemPrepState {
  const events = prepModelEvents(v);
  const records: ChemPrepState['records'] = {};
  if (v.task === 'LECHAT' || v.task === 'HALOGEN') prepTubes(v.task, events).forEach((_, i) => (records[`t${i}`] = prepIdealRecord(v, events, `t${i}`)));
  else for (const row of PREP_ROWS[v.task]) records[row] = prepIdealRecord(v, events, row);
  const a = prepCalcAnswer(v, events);
  const choices: ChemPrepState['choices'] = Object.fromEntries(PREP_MCQ[v.task].map((q) => [q.id, [...q.answer]]));
  return { v: 1, task: v.task, events, records, readings: { ...a }, choices, written: { precautions: '', explain: '' }, log: [] };
}
export const chemPrepModel = (seed: number, task: PrepTask) => prepModelState(chemPrepVariant(seed, task));
