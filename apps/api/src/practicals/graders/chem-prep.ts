import {
  CHEM_PREP,
  HL_KINDS,
  PREP_CLAIM_LABEL,
  PREP_MCQ,
  PREP_ROWS,
  PREP_ROW_LABEL,
  amRun,
  chemPrepVariant,
  dsConstant,
  dsRun,
  hlKind,
  lcKind,
  prepCalcAnswer,
  prepMcqCredit,
  prepModelEvents,
  prepModelState,
  prepRequiredTubes,
  prepRowKey,
  prepRowParts,
  prepTubeKey,
  prepTubeParts,
  prepTubeText,
  prepTubes,
  stdAtMark,
  stdOver,
  stdRun,
  type ChemPrepState,
  type ChemPrepVariant,
  type CriterionScore,
  type PrepKey,
  type PrepPart,
  type PrepRecord,
  type PrepTask,
} from '@aischool/shared';
import { observationCredit } from './chem-qualitative';
import { parseNumber, score, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => CHEM_PREP.rubric.find((c) => c.id === id)!;
const halves = (m: number) => Math.floor(m * 2 + 1e-9) / 2;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const num = (s: ChemPrepState, k: string) => parseNumber((s.readings[k] ?? '').trim().replace(/\s*(g|cm3|cm³|°c|oc|mol|dm3|dm³|g dm-3|g dm⁻³|mol dm-3|mol dm⁻³)$/i, ''));
const blankRec = (): PrepRecord => ({ observation: '', claims: [] });

/** Inference credit for one row against what its result allows. */
export function prepClaimCredit(k: PrepKey | null, r: PrepRecord): { credit: number; why: string | null } {
  if (!k) return { credit: 1, why: null };
  if (!r.claims.length) return { credit: 0, why: 'no inference' };
  if (!k.complete) return { credit: 0, why: k.why ?? 'nothing can be inferred yet' };
  const bad = r.claims.filter((c) => !k.allow.includes(c));
  if (bad.length) return { credit: 0, why: `the result does not show “${bad.map((c) => PREP_CLAIM_LABEL[c].toLowerCase()).join('”, “')}”` };
  if (k.need.every((c) => r.claims.includes(c))) return { credit: 1, why: null };
  return { credit: 0.5, why: `state: ${k.need.map((c) => PREP_CLAIM_LABEL[c].toLowerCase()).join('; ')}` };
}

function mcqs(task: PrepTask, s: ChemPrepState, c: 'deductions' | 'calculation', each: number): { m: number; n: string[] } {
  let m = 0;
  const n: string[] = [];
  for (const q of PREP_MCQ[task].filter((x) => x.crit === c)) {
    const got = prepMcqCredit(task, q.id, s.choices[q.id]);
    m += got * each;
    if (got < 1) n.push(`“${q.q}…”: ${q.answer.map((i) => q.options[i]).join('; ')}.`);
  }
  return { m, n };
}

/** Observation and inference credit over fixed rows. */
function rowMarks(v: ChemPrepVariant, s: ChemPrepState, rows: string[]) {
  return rows.map((row) => {
    const parts = prepRowParts(v, s.events, row);
    const rec = s.records[row] ?? blankRec();
    const o = parts.length ? observationCredit(rec.observation, parts) : { credit: 0, missed: [] as PrepPart[] };
    const inf = parts.length ? prepClaimCredit(prepRowKey(v, s.events, row), rec) : { credit: 0, why: 'not done' };
    return { row, done: parts.length > 0, obs: o.credit, missed: o.missed, inf: inf.credit, why: inf.why };
  });
}
const rowNotes = (xs: ReturnType<typeof rowMarks>, kind: 'obs' | 'inf') =>
  xs.filter((x) => x[kind] < 1).map((x) => `${PREP_ROW_LABEL[x.row]}: ${!x.done ? 'not done' : kind === 'obs' ? (x.missed.length ? `you should have seen ${x.missed.map((p) => p.text).join('; ')}` : 'record what you saw') : x.why}.`);

/** Best credit for each tube kind the practical needs. */
function tubeMarks(v: ChemPrepVariant, s: ChemPrepState) {
  return prepRequiredTubes(v, s.events).map((k) => {
    let best = { obs: 0, inf: 0, missed: [] as PrepPart[], why: 'not done' as string | null, text: k.label };
    for (const i of k.tubes) {
      const rec = s.records[`t${i}`] ?? blankRec();
      const o = observationCredit(rec.observation, prepTubeParts(v, s.events, i));
      const inf = prepClaimCredit(prepTubeKey(v, s.events, i), rec);
      if (o.credit + inf.credit > best.obs + best.inf || best.why === 'not done') best = { obs: o.credit, inf: inf.credit, missed: o.missed, why: inf.why, text: k.label };
    }
    return { ...best, done: k.tubes.length > 0 };
  });
}

// ------------------------------------------------------------------ AI items

const PREC: Record<PrepTask, { kw: string[][]; guide: string }> = {
  STANDARD: { kw: [['rinse', 'rinsing', 'washings'], ['eye level', 'meniscus', 'mark'], ['invert', 'shake', 'uniform', 'mix'], ['room temperature', 'cool'], ['filler'], ['by difference', 'reweigh'], ['dropwise', 'drop by drop', 'dropper']], guide: 'rinsings transferred so no solute was lost; the bottom of the meniscus brought to the mark at eye level; the flask inverted to make the solution uniform; the solution at room temperature before making up; a pipette filler used; weighed by difference; the last water added drop by drop.' },
  LECHAT: { kw: [['white background', 'white tile', 'white paper'], ['control'], ['dilute', 'very dilute'], ['same volume', 'equal volume', 'same amount'], ['goggle'], ['chromate', 'toxic', 'skin', 'residue'], ['clean']], guide: 'colours compared against a white background with a control tube; very dilute solutions so changes show; equal volumes in each tube; goggles; chromate(VI) handled with care (toxic) and put in the residue bottle; clean tubes.' },
  DISTIL: { kw: [['gently', 'spit', 'water bath', 'steam bath'], ['side arm', 'side-arm'], ['anti-bumping', 'antibumping', 'granule', 'chip', 'porcelain'], ['bottom', 'upward', 'flowing upward'], ['open', 'not closed', 'closed apparatus'], ['dry', 'boil dry', 'constant mass', 'cool'], ['filter', 'sand']], guide: 'heated gently near the end (finished on a water bath) to avoid spitting; thermometer bulb level with the side arm; anti-bumping granules; condenser water in at the bottom; receiver open (never heat a closed apparatus); not boiled dry; weighed cold to constant mass; sand filtered off.' },
  HALOGEN: { kw: [['dilute'], ['fresh'], ['control', 'compare'], ['fume', 'ventilat', 'window'], ['goggle'], ['flame', 'flammable'], ['small', 'few drops'], ['shake', 'stopper']], guide: 'dilute halogen solutions; fresh chlorine water; control tubes compared; fume cupboard or well-ventilated room (toxic chlorine and bromine); goggles; no flames near hexane; small quantities.' },
  AMMONIA: { kw: [['slop', 'downward', 'mouth down', 'tilt'], ['quicklime', 'cao', 'calcium oxide'], ['upward delivery', 'inverted', 'downward displacement of air'], ['dry'], ['fume', 'ventilat', 'window'], ['goggle'], ['leak', 'airtight', 'tight'], ['gentl']], guide: 'tube sloping downwards so condensed water cannot crack it; dried with quicklime (not conc. H₂SO₄ or CaCl₂); collected by upward delivery in a dry jar; fume cupboard or open window; goggles; joints airtight; heated gently.' },
};
const EXPLAIN: Record<PrepTask, { q: string; guide: string; kw: string[][]; need: number }> = {
  STANDARD: {
    q: 'Explain why the solid is dissolved in a beaker and the flask is then made up to the mark (not 250 cm³ of water added to the solid), and why the diluted solution is ten times less concentrated.',
    guide: '2 marks: (1) the volume of the final solution must be exactly 250 cm³ — adding 250 cm³ of water to the solid gives more than 250 cm³ of solution, and dissolving first in a beaker makes sure it all dissolves; (1) the 25.0 cm³ portion keeps the same number of moles but is spread through 250 cm³, ten times the volume (C₁V₁ = C₂V₂), so the concentration is a tenth.',
    kw: [['beaker', 'dissolve'], ['mark', 'total volume', 'exactly 250', 'more than 250'], ['moles', 'same number', 'unchanged', 'same amount'], ['ten', '10', 'c1v1', 'tenth']],
    need: 3,
  },
  LECHAT: {
    q: 'Use Le Chatelier’s principle to explain why adding FeCl₃ deepens the red colour and why heating the mixture makes it paler.',
    guide: '2 marks: (1) added Fe³⁺ is a reactant; the equilibrium shifts to the right to use it up (oppose the change), so more red FeSCN²⁺ forms; (1) the forward reaction is exothermic, so raising the temperature shifts the equilibrium in the endothermic (backward) direction, to the left, and less FeSCN²⁺ remains.',
    kw: [['oppose', 'counteract', 'use up', 'remove', 'reduce the effect'], ['right', 'forward', 'more fescn', 'product'], ['exothermic', 'endothermic'], ['left', 'backward', 'reverse']],
    need: 3,
  },
  DISTIL: {
    q: 'Explain why the distillate is pure water although the sea water contains salt, and why the thermometer reads about 100 °C.',
    guide: '2 marks: (1) only the water is volatile: it boils off as steam and condenses in the condenser, while the non-volatile salt stays in the flask; (1) the thermometer at the side arm measures the temperature of the vapour distilling over, which is the boiling point of pure water, about 100 °C at normal pressure.',
    kw: [['volatile', 'non-volatile', 'does not evaporate', 'not boil'], ['vapour', 'steam', 'condens'], ['boiling point', '100', 'pure water'], ['salt', 'remain', 'left', 'behind']],
    need: 3,
  },
  HALOGEN: {
    q: 'Explain, in terms of gaining electrons, why chlorine displaces bromine from potassium bromide but iodine cannot.',
    guide: '2 marks: (1) halogens react by gaining electrons (oxidising agents); chlorine has the smallest atom, so its nucleus attracts an extra electron most strongly — it takes the electron from Br⁻ (Cl₂ + 2Br⁻ → 2Cl⁻ + Br₂); (1) iodine atoms are larger and attract electrons less than bromine does, so iodine (a weaker oxidising agent, less reactive) cannot take electrons from Br⁻.',
    kw: [['electron', 'gain', 'accept'], ['more reactive', 'stronger oxidising', 'oxidising agent', 'more electronegative'], ['radius', 'smaller', 'larger', 'size', 'shield'], ['less reactive', 'weaker', 'cannot']],
    need: 3,
  },
  AMMONIA: {
    q: 'Explain why ammonia is collected by upward delivery and not over water, and what the fountain experiment shows about it.',
    guide: '2 marks: (1) ammonia is less dense than air, so it collects at the top of an inverted jar (upward delivery / downward displacement of air), and it is very soluble in water, so it cannot be collected over water; (1) in the fountain the ammonia dissolves in the first drop of water so the pressure inside drops and water is forced up as a fountain — it is very soluble, and the pink phenolphthalein shows the solution is alkaline.',
    kw: [['less dense', 'lighter', 'density'], ['soluble', 'dissolve'], ['pressure', 'vacuum', 'partial', 'forced'], ['alkali', 'pink', 'base']],
    need: 3,
  },
};
function aiItems(task: PrepTask, s: ChemPrepState): AiItem[] {
  const e = EXPLAIN[task];
  return [
    { criterionId: 'precautions', question: 'State two precautions you took in this practical.', answer: s.written.precautions.trim(), guide: `2 marks: one for each correct precaution — ${PREC[task].guide} A source of error or a vague statement (“be careful”) earns nothing.`, keywords: PREC[task].kw, need: 2 },
    { criterionId: 'explanation', question: e.q, answer: s.written.explain.trim(), guide: e.guide, keywords: e.kw, need: e.need },
  ];
}

// ------------------------------------------------------------------ per task

type Marks = { procedure: [number, string[]]; readings: [number, string[]]; deductions: [number, string[]]; calculation: [number, string[]]; facts: string[] };

function gradeStandard(v: ChemPrepVariant, s: ChemPrepState): Marks {
  const r = stdRun(v, s.events);
  const p: string[] = [];
  let pm = 0;
  if (r.m1 !== null && r.m1Fresh && r.m2 !== null) pm += 1;
  else if (r.m1 !== null || r.m2 !== null) (pm += 0.5), p.push(r.m2 === null ? 'Reweigh the bottle after tipping out: the mass transferred is found by difference.' : 'Weigh the bottle and solid after the last addition, then again after tipping out.');
  else p.push('Weigh by difference: the bottle with the solid, then the bottle after tipping out.');
  if (r.where === 'BEAKER' && r.dissolved) pm += 0.5;
  else p.push(r.where === 'FLASK' ? 'Dissolve the solid in a beaker first, never directly in the volumetric flask.' : 'Dissolve the solid in about 100 cm³ of water in a beaker, stirring.');
  if (r.poured && r.rinses >= 2) pm += 1;
  else if (r.poured && r.rinses === 1) (pm += 0.5), p.push('Rinse the beaker, rod and funnel several times into the flask.');
  else if (r.where === 'BEAKER') p.push('Transfer through a funnel and rinse the beaker, rod and funnel into the flask (two or three times).');
  const mk = (f: typeof r.f1, name: string) => {
    if (!f.filled) return p.push(`Make the ${name} up to the mark.`), 0;
    if (stdOver(f)) return p.push(`The ${name} was overshot: pour it away and start again.`), 0;
    if (!stdAtMark(f)) return p.push(`The ${name} was not brought up to the mark.`), 0;
    if (!f.eye || !f.drops) return p.push(`Add the last water to the ${name} drop by drop and check the meniscus at eye level.`), 0.5;
    return 1;
  };
  pm += mk(r.f1, 'standard solution');
  if (r.f1.mixed >= 10 && r.f2.mixed >= 10) pm += 0.5;
  else p.push('Stopper each flask and invert it many times so the solution is uniform.');
  if (r.pipetted && !r.mouth && r.pip === 'SOL') pm += 0.5;
  else p.push(!r.pipetted ? 'Pipette 25.0 cm³ of the solution into the second flask.' : r.mouth ? 'Always use a pipette filler — never your mouth.' : 'Rinse the pipette with the solution it is to measure.');
  if (r.pipetted) pm += mk(r.f2, 'diluted solution') / 2;
  const rd: string[] = [];
  let rm = 0;
  const m1 = num(s, 'm1');
  const m2 = num(s, 'm2');
  const mass = num(s, 'mass');
  if (r.m1 !== null && withinAbs(m1, r.m1, 0.011)) rm += 0.5;
  else rd.push(r.m1 !== null ? `The balance read ${r.m1.toFixed(2)} g for the bottle and solid.` : 'Record the mass of the bottle and solid.');
  if (r.m2 !== null && withinAbs(m2, r.m2, 0.011)) rm += 0.5;
  else rd.push(r.m2 !== null ? `The balance read ${r.m2.toFixed(2)} g after tipping out.` : 'Record the mass of the bottle after tipping out.');
  if (m1 !== null && m2 !== null && withinAbs(mass, m1 - m2, 0.011)) rm += 0.5;
  else rd.push('Mass transferred = (bottle + solid) − (bottle after tipping).');
  if (r.m1 !== null && r.m2 !== null && r.m1 - r.m2 >= 2.55 && r.m1 - r.m2 <= 2.75) rm += 0.5;
  else rd.push('Weigh out about 2.65 g (between 2.55 and 2.75 g).');
  const rows = rowMarks(v, s, PREP_ROWS.STANDARD);
  rm += rows.reduce((t, x) => t + x.obs, 0) * (2 / 3);
  rd.push(...rowNotes(rows, 'obs'));
  const d = mcqs('STANDARD', s, 'deductions', 1);
  const c: string[] = [];
  let cm = 0;
  if (withinAbs(num(s, 'mneed'), 2.65, 0.006)) cm += 1;
  else c.push('Mass needed = 0.100 × 250/1000 × 106 = 2.65 g.');
  const ownMass = mass ?? (r.m1 !== null && r.m2 !== null ? r.m1 - r.m2 : null);
  const c1 = num(s, 'c1');
  if (ownMass !== null && withinRel(c1, ownMass / 106 / 0.25, 0.01)) cm += 1;
  else c.push('Concentration = (mass ÷ 106) ÷ 0.250 dm³.');
  if (c1 !== null && withinRel(num(s, 'c2'), c1 / 10, 0.01)) cm += 1;
  else c.push('C₂ = C₁ × 25.0 ÷ 250 (C₁V₁ = C₂V₂).');
  const q = v.std.q;
  if (withinRel(num(s, 'v1'), (q.ct * q.vt) / q.cs, 0.01)) cm += 1;
  else c.push(`V₁ = ${q.ct} × ${q.vt} ÷ ${q.cs}.`);
  return { procedure: [pm, p], readings: [rm, rd], deductions: [d.m, d.n], calculation: [cm, c], facts: [`Transferred ${(r.transferred).toFixed(3)} g; flask 1 ${r.f1.vol.toFixed(2)} cm³ (${r.rinses} rinses, mixed ${r.f1.mixed}); pipette ${r.mouth ? 'by mouth' : 'filler'}, rinsed ${r.pip}; flask 2 ${r.f2.vol.toFixed(2)} cm³.`] };
}

function gradeTubes(v: ChemPrepVariant, s: ChemPrepState): Marks {
  const task = v.task;
  const tubes = prepTubes(task, s.events);
  const kinds = tubeMarks(v, s);
  const p: string[] = [];
  let pm = 0;
  if (task === 'LECHAT') {
    const fe = tubes.filter((t) => t.sys === 'FESCN');
    if (fe.length && fe.every((t) => t.stock === 'DILUTE')) pm += 1;
    else p.push(fe.some((t) => t.stock === 'CONC') ? 'Dilute the Fe³⁺/SCN⁻ mixture with plenty of water: in a deep red solution the changes cannot be seen.' : 'Make the pale-red Fe³⁺/SCN⁻ mixture.');
    const has = (k: string) => tubes.some((t) => lcKind(t) === k && (t.temp === 'ROOM' || t.sec >= 60));
    if (has('CONTROL')) pm += 0.5;
    else p.push('Keep one tube unchanged as the control.');
    for (const k of ['FECL3', 'KSCN', 'NH4CL'] as const) if (has(k)) pm += 0.5;
    if (!(['FECL3', 'KSCN', 'NH4CL'] as const).every(has)) p.push('Add FeCl₃, KSCN and solid NH₄Cl to three separate tubes of the mixture.');
    for (const k of ['HOT', 'ICE'] as const) if (has(k)) pm += 0.5;
    if (!has('HOT') || !has('ICE')) p.push('Stand one tube in hot water and another in iced water for at least a minute.');
    if (has('CHROMATE')) pm += 1;
    else p.push('Add dilute acid to yellow chromate(VI), then alkali.');
  } else {
    const done = HL_KINDS.filter((k) => tubes.some((t) => hlKind(t) === k));
    pm += (2 * done.length) / HL_KINDS.length;
    if (done.length < HL_KINDS.length) p.push(`Also test ${list(HL_KINDS.filter((k) => !done.includes(k)).map((k) => k.replace('-', ' + ')))}.`);
    const changed = ['CL2-KBR', 'CL2-KI', 'BR2-KI'].filter((k) => tubes.some((t) => hlKind(t) === k && t.hexShaken));
    pm += changed.length / 3;
    if (changed.length < 3) p.push('Add hexane to each tube that changed and shake: the layer colour confirms the halogen set free.');
    if (tubes.some((t) => t.hal === 'CL2') && !tubes.some((t) => t.hal === 'CL2OLD')) pm += 0.5;
    else p.push('Use fresh chlorine water: old chlorine water has lost its chlorine.');
    const ctl = (h: string) => tubes.some((t) => t.sys === 'WATER' && t.hal === h && t.hexShaken);
    if (ctl('BR2')) pm += 0.5;
    if (ctl('I2')) pm += 0.5;
    if (!ctl('BR2') || !ctl('I2')) p.push('Shake bromine water and iodine solution with water and hexane as controls: you need their own colours to compare.');
    if (tubes.some((t) => t.adds.includes('STARCH') && (t.hal === 'I2' || (t.sys === 'KI' && t.hal !== null)))) pm += 0.5;
    else p.push('Confirm iodine with starch (blue-black).');
  }
  if (!tubes.length) p.splice(0, p.length, 'No tubes were set up.');
  const obsN = kinds.filter((k) => k.obs < 1).slice(0, 4).map((k) => `${k.text}: ${!k.done ? 'not done' : k.missed.length ? `you should have seen ${k.missed.map((x) => x.text).join('; ')}` : 'record what you saw'}.`);
  const infN = kinds.filter((k) => k.inf < 1).slice(0, 4).map((k) => `${k.text}: ${k.why ?? 'incomplete inference'}.`);
  const obs = (kinds.reduce((t, k) => t + k.obs, 0) / kinds.length) * 4;
  const d = mcqs(task, s, 'deductions', task === 'LECHAT' ? 0.5 : 1);
  const inf = (kinds.reduce((t, k) => t + k.inf, 0) / kinds.length) * 2;
  const c: string[] = [];
  let cm = 0;
  const a = prepCalcAnswer(v, s.events);
  if (task === 'LECHAT') {
    if (withinRel(num(s, 'kc'), Number(a.kc), 0.02)) cm += 2;
    else c.push(`Kc = [FeSCN²⁺] ÷ ([Fe³⁺][SCN⁻]) = ${a.kc}.`);
    const u = (s.readings.kcunit ?? '').replace(/\s+/g, '').replace(/[⁻−–]/g, '-').replace(/³/g, '3').replace(/¹/g, '1').toLowerCase();
    if (/^(dm3mol-1|mol-1dm3|dm3\/mol|l\/mol|lmol-1|mol-1l)$/.test(u)) cm += 1;
    else c.push('Unit of Kc: dm³ mol⁻¹.');
  } else {
    const mol = num(s, 'mol');
    if (withinRel(mol, Number(a.mol), 0.02)) cm += 1;
    else c.push(`Moles of I₂ = moles of Cl₂ = ${v.hl.c} × ${v.hl.vol} ÷ 1000.`);
    if (withinRel(num(s, 'mass'), (mol ?? Number(a.mol)) * 254, 0.02)) cm += 1;
    else c.push('Mass of I₂ = moles × 254.');
  }
  const mc = mcqs(task, s, 'calculation', 1);
  cm += mc.m;
  c.push(...mc.n);
  return { procedure: [pm, p], readings: [obs, obsN], deductions: [inf + d.m, [...infN, ...d.n]], calculation: [cm, c], facts: [`${tubes.length} tubes: ${tubes.map((t) => prepTubeText(task, t)).slice(0, 10).join('; ')}.`] };
}

function gradeDistil(v: ChemPrepVariant, s: ChemPrepState): Marks {
  const r = dsRun(v, s.events);
  const p: string[] = [];
  let pm = 0;
  if (r.filtered) pm += 0.5;
  else p.push('Filter the sea water first: the sand would be weighed with the salt.');
  const bathed = s.events.some((e) => e.a === 'BATH_DISH');
  if (r.measured && r.water === 0 && !r.spat && bathed) pm += 1;
  else if (r.measured && r.water === 0 && !r.spat) (pm += 0.5), p.push('Finish the evaporation on a water bath.');
  else p.push(r.spat ? 'Heat gently near the end (finish on a water bath): the salt spat out of the dish.' : 'Evaporate the 50.0 cm³ to dryness.');
  const cold = r.weighings.filter((w) => !w.hot);
  if (dsConstant(r)) pm += 1;
  else if (cold.length && r.water === 0) (pm += 0.5), p.push('Heat, cool and reweigh until two weighings agree (constant mass).');
  else p.push(r.weighings.some((w) => w.hot) ? 'Let the dish cool before weighing it.' : 'Weigh the cooled dish and salt, then heat, cool and reweigh to constant mass.');
  if (r.thermo === 'SIDEARM') pm += 0.5;
  else p.push('Set the thermometer bulb level with the side arm.');
  if (r.condenser === 'BOTTOM' && r.waterOn) pm += 0.5;
  else p.push(r.condenser === 'TOP' ? 'Connect the condenser water in at the bottom and out at the top.' : 'Turn on the condenser water (in at the bottom).');
  if (r.chips) pm += 0.5;
  else p.push('Add anti-bumping granules for smooth boiling.');
  if (r.receiver === 'OPEN' && !r.blown) pm += 0.5;
  else p.push('Never heat a closed apparatus: leave the receiver open.');
  if (r.distillate >= 5 && !r.boiledDry && !r.heating) pm += 0.5;
  else p.push(r.boiledDry ? 'Turn off the heat before the flask boils dry.' : r.distillate < 5 ? 'Collect at least 5 cm³ of distillate.' : 'Turn off the heat at the end.');
  const rd: string[] = [];
  let rm = 0;
  const lastCold = cold.at(-1)?.m ?? null;
  if (r.dishEmpty !== null && withinAbs(num(s, 'dish'), r.dishEmpty, 0.011)) rm += 0.5;
  else rd.push(r.dishEmpty !== null ? `The empty dish weighed ${r.dishEmpty.toFixed(2)} g.` : 'Weigh the empty dish.');
  if (lastCold !== null && withinAbs(num(s, 'dishsalt'), lastCold, 0.011)) rm += 0.5;
  else rd.push(lastCold !== null ? `Your last weighing of the cool dish and salt was ${lastCold.toFixed(2)} g.` : 'Weigh the cool dish and salt.');
  const bp = num(s, 'bp');
  if (r.distT !== null && withinAbs(bp, r.distT, 0.5)) rm += 0.5;
  else rd.push(r.distT !== null ? `Your thermometer read ${r.distT.toFixed(1)} °C while the distillate collected.` : 'Read the thermometer while the distillate collects.');
  if (r.distT !== null && r.thermo === 'SIDEARM' && withinAbs(bp, r.distT, 0.5)) rm += 0.5;
  else if (r.distT !== null && r.thermo !== 'SIDEARM') rd.push('With the bulb away from the side arm the thermometer did not read the vapour temperature.');
  const rows = rowMarks(v, s, PREP_ROWS.DISTIL);
  rm += rows.reduce((t, x) => t + x.obs, 0) * (2 / 3);
  rd.push(...rowNotes(rows, 'obs'));
  const d = mcqs('DISTIL', s, 'deductions', 0.5);
  const dm = rows.reduce((t, x) => t + x.inf, 0) * 0.5 + d.m;
  const c: string[] = [];
  let cm = 0;
  const dish = num(s, 'dish');
  const ds = num(s, 'dishsalt');
  const salt = num(s, 'salt');
  if (dish !== null && ds !== null && withinAbs(salt, ds - dish, 0.011)) cm += 1.5;
  else c.push('Mass of salt = (dish + salt) − dish.');
  if (salt !== null && withinRel(num(s, 'conc'), (salt * 1000) / 50, 0.015)) cm += 1.5;
  else c.push('Concentration = mass of salt × 1000 ÷ 50.0 g dm⁻³.');
  const trueSalt = (v.ds.salt * 50) / 1000;
  if (lastCold !== null && r.dishEmpty !== null && Math.abs(lastCold - r.dishEmpty - trueSalt) <= 0.05) cm += 1;
  else c.push(`The 50.0 cm³ held ${trueSalt.toFixed(2)} g of salt: spitting, sand or damp salt changed your result.`);
  return { procedure: [pm, p], readings: [rm, rd], deductions: [dm, [...rowNotes(rows, 'inf'), ...d.n]], calculation: [cm, c], facts: [`Dish weighings ${r.weighings.map((w) => `${w.m}${w.hot ? ' (hot)' : ''}`).join(', ')}; spat ${r.spat} min; thermometer ${r.thermo || '—'}, condenser ${r.condenser || '—'}${r.waterOn ? '' : ' (water off)'}, granules ${r.chips ? 'yes' : 'no'}, receiver ${r.receiver || '—'}; distillate ${r.distillate} cm³ at ${r.distT ?? '—'} °C.`] };
}

function gradeAmmonia(v: ChemPrepVariant, s: ChemPrepState): Marks {
  const r = amRun(v, s.events);
  const p: string[] = [];
  let pm = 0;
  if (r.loaded) pm += 0.5;
  else p.push('Weigh NH₄Cl and Ca(OH)₂ (about 1 : 1), mix them and put them in the hard-glass tube.');
  if (r.clamp === 'DOWN') pm += 1;
  else p.push(r.cracked ? 'The tube cracked: clamp it with its mouth sloping down so condensed water cannot run back on to the hot glass.' : 'Clamp the tube with its mouth sloping slightly downwards.');
  if (r.dryer === 'CAO') pm += 1;
  else p.push(r.dryer === 'H2SO4' || r.dryer === 'CACL2' ? `${r.dryer === 'H2SO4' ? 'Conc. H₂SO₄' : 'Calcium chloride'} reacts with ammonia: dry it with quicklime (CaO).` : 'Dry the gas through a tower of quicklime.');
  if (r.collect === 'UPWARD') pm += 1;
  else p.push(r.collect === 'WATER' ? 'Ammonia is very soluble: never collect it over water.' : 'Ammonia is less dense than air: collect it by upward delivery in an inverted jar.');
  if (r.testedAt >= 0.8) pm += 0.5;
  else p.push('Heat until the jar is full (damp red litmus at the mouth turns blue at once) before testing.');
  if (r.litmus.includes('DAMP') && r.hcl) pm += 0.5;
  else p.push('Test the gas with damp red litmus and with a rod dipped in conc. HCl.');
  if (r.fountain !== null) pm += 0.5;
  else p.push('Show its solubility with the fountain experiment.');
  const rd: string[] = [];
  let rm = 0;
  if (r.nh4 !== null && withinAbs(num(s, 'nh4'), r.nh4, 0.011)) rm += 0.5;
  else rd.push(r.nh4 !== null ? `The balance read ${r.nh4.toFixed(2)} g of NH₄Cl.` : 'Weigh the NH₄Cl.');
  if (r.ca !== null && withinAbs(num(s, 'ca'), r.ca, 0.011)) rm += 0.5;
  else rd.push(r.ca !== null ? `The balance read ${r.ca.toFixed(2)} g of Ca(OH)₂.` : 'Weigh the Ca(OH)₂.');
  const rows = rowMarks(v, s, PREP_ROWS.AMMONIA);
  rm += rows.reduce((t, x) => t + x.obs, 0) * 0.75;
  rd.push(...rowNotes(rows, 'obs'));
  const inf = rows.filter((x) => x.row !== 'GAS');
  const d = mcqs('AMMONIA', s, 'deductions', 0.5);
  const dm = inf.reduce((t, x) => t + x.inf, 0) * 0.5 + d.m;
  const c: string[] = [];
  let cm = 0;
  const own = num(s, 'nh4') ?? r.nh4 ?? v.am.nh4;
  const mol = num(s, 'mol');
  if (withinRel(mol, own / 53.5, 0.015)) cm += 1;
  else c.push('Moles of NH₄Cl = mass ÷ 53.5.');
  const m = mol ?? own / 53.5;
  if (withinRel(num(s, 'vol'), m * 24, 0.015)) cm += 1.5;
  else c.push('2NH₄Cl gives 2NH₃ (1 : 1): volume = moles × 24.0 dm³.');
  if (withinRel(num(s, 'need'), (m / 2) * 74, 0.015)) cm += 1.5;
  else c.push('Ca(OH)₂ needed = moles of NH₄Cl ÷ 2 × 74.');
  return { procedure: [pm, p], readings: [rm, rd], deductions: [dm, [...rowNotes(inf, 'inf'), ...d.n]], calculation: [cm, c], facts: [`Clamp ${r.clamp || '—'}${r.cracked ? ' (cracked)' : ''}, dryer ${r.dryer || 'none'}, collection ${r.collect || '—'}; heated ${r.heatSec / 60} min; jar ${(r.jar * 100).toFixed(0)}% NH₃ (tested at ${(r.testedAt * 100).toFixed(0)}%).`] };
}

/**
 * Marks the five chem-prep practicals the way a WAEC chemistry scheme does:
 * the method actually carried out (from the event list), every reading
 * against what the instrument showed, each observation against what really
 * happened, each inference against what its result allows, the deduction
 * questions, and the calculation from the student's own readings (errors
 * carried forward). Precautions and the explanation go to AI.
 */
export const chemPrepGrader: SimulatorGrader<'chem-prep'> = {
  id: 'chem-prep',
  grade(state: ChemPrepState, seed: number): GraderOutput {
    const task: PrepTask = state.task ?? 'STANDARD';
    const v = chemPrepVariant(seed, task);
    const m = task === 'STANDARD' ? gradeStandard(v, state) : task === 'DISTIL' ? gradeDistil(v, state) : task === 'AMMONIA' ? gradeAmmonia(v, state) : gradeTubes(v, state);
    const auto: CriterionScore[] = (['procedure', 'readings', 'deductions', 'calculation'] as const).map((id) => score(crit(id), halves(Math.min(crit(id).marks, m[id][0])), m[id][1]));
    const model = prepModelEvents(v);
    const a = prepCalcAnswer(v, model);
    const ideal = prepModelState(v);
    const solution = [
      ...Object.entries(ideal.records)
        .slice(0, 10)
        .map(([row, rec]) => `${/^t\d+$/.test(row) ? prepTubeText(task, prepTubes(task, model)[Number(row.slice(1))]!) : PREP_ROW_LABEL[row]} → ${rec.observation || '—'}${rec.claims.length ? ` → ${rec.claims.map((c) => PREP_CLAIM_LABEL[c]).join('; ')}` : ''}.`),
      `Answers (model run): ${Object.entries(a).filter(([, x]) => x).map(([k, x]) => `${k} = ${x}`).join('; ')}.`,
      ...PREP_MCQ[task].map((q) => `${q.q}: ${q.answer.map((i) => q.options[i]).join('; ')}.`),
    ];
    return { auto, ai: aiItems(task, state), solution, facts: m.facts };
  },
};
export { prepModelState };
