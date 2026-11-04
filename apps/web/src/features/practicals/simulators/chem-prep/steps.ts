import {
  HL_KINDS,
  PREP_MCQ,
  PREP_READINGS,
  PREP_ROWS,
  amRun,
  dsConstant,
  dsRun,
  hlKind,
  lcKind,
  prepTubes,
  stdAtMark,
  stdRun,
  type ChemPrepState,
  type ChemPrepVariant,
} from '@aischool/shared';

/**
 * The WAEC routine for each practical as a list of milestones, worked out
 * from the state (never from the hidden answers): the 2D hint, the 3D guided
 * checklist and the demo's order all come from here.
 */

export interface PrepStep {
  id: string;
  label: string;
  why: string;
  /** The 3D object it is done with. */
  target: string;
  done: boolean;
  group?: string;
}

const HL_LABEL: Record<string, string> = { 'CL2-KBR': 'chlorine water + KBr', 'CL2-KI': 'chlorine water + KI', 'BR2-KCL': 'bromine water + KCl', 'BR2-KI': 'bromine water + KI', 'I2-KCL': 'iodine solution + KCl', 'I2-KBR': 'iodine solution + KBr' };
const HL_HALIDE: Record<string, string> = { 'CL2-KBR': 'KBR', 'CL2-KI': 'KI', 'BR2-KCL': 'KCL', 'BR2-KI': 'KI', 'I2-KCL': 'KCL', 'I2-KBR': 'KBR' };

export function prepBenchSteps(v: ChemPrepVariant, s: ChemPrepState): PrepStep[] {
  const ev = s.events;
  switch (v.task) {
    case 'STANDARD': {
      const r = stdRun(v, ev);
      const g1 = 'The standard solution';
      const g2 = 'The dilution';
      const m = r.inBottle;
      return [
        { id: 'weigh', group: g1, label: `Put about 2.65 g of Na₂CO₃ in the weighing bottle and weigh it${!r.tipped && m > 0 ? ` (≈${m.toFixed(2)} g in it)` : ''}`, why: '0.100 × 250/1000 × 106 = 2.65 g. Weigh the bottle with the solid after the last addition.', target: r.tipped || m >= 2.55 ? 'balance' : 'bottle', done: r.tipped ? r.m1 !== null : r.m1 !== null && r.m1Fresh && m >= 2.55 && m <= 2.75 },
        { id: 'tip', group: g1, label: 'Tip the solid into the beaker, then reweigh the bottle', why: 'Weighing by difference: the solid left in the bottle is not counted.', target: !r.tipped ? 'bottle' : 'balance', done: r.tipped && r.m2 !== null },
        { id: 'dissolve', group: g1, label: 'Dissolve it in about 100 cm³ of distilled water, stirring', why: 'Dissolve in a beaker, never straight in the flask.', target: 'beaker', done: r.dissolved },
        { id: 'transfer', group: g1, label: `Pour into the flask through the funnel and rinse 2–3 times (${r.rinses} so far)`, why: 'Rinse the beaker, rod and funnel into the flask so no solute is lost.', target: 'beaker', done: r.poured && r.rinses >= 2 },
        { id: 'makeup', group: g1, label: 'Make up to the mark: wash bottle, then dropwise at eye level', why: 'Stop about 1 cm below the mark and add the last drops one at a time until the bottom of the meniscus sits on the mark.', target: 'flask', done: r.f1.filled && stdAtMark(r.f1) && r.f1.eye },
        { id: 'mix', group: g1, label: 'Stopper and invert the flask 10 times', why: 'The solution must be uniform before you take a sample.', target: 'flask', done: r.f1.mixed >= 10 },
        { id: 'pipette', group: g2, label: 'Rinse the pipette with the solution, then pipette 25.0 cm³ into the second flask', why: 'Rinse with water, then with the solution itself; always use the filler.', target: 'pipette', done: r.pipetted },
        { id: 'makeup2', group: g2, label: 'Make the second flask up to the mark (dropwise, eye level)', why: 'The same care as the first: 25.0 cm³ in 250 cm³ is a tenfold dilution.', target: 'flask2', done: r.f2.filled && stdAtMark(r.f2) && r.f2.eye },
        { id: 'mix2', group: g2, label: 'Stopper and invert the second flask 10 times', why: 'Mix it before use.', target: 'flask2', done: r.f2.mixed >= 10 },
      ];
    }
    case 'LECHAT': {
      const tubes = prepTubes('LECHAT', ev);
      const has = (k: string) => tubes.some((t) => lcKind(t) === k && (t.temp === 'ROOM' || t.sec >= 60));
      const g = 'Iron(III) thiocyanate';
      return [
        { id: 'stock', group: g, label: 'Make the pale-red Fe³⁺/SCN⁻ mixture (a few drops of each in 20 cm³ water)', why: 'Very dilute, so colour changes are easy to see.', target: 'stock', done: ev.some((e) => e.a === 'STOCK') },
        { id: 'control', group: g, label: 'Tube 1: some mixture, nothing added (the control)', why: 'Every other tube is compared with it against the white tile.', target: 'rack', done: has('CONTROL') },
        { id: 'fecl3', group: g, label: 'A tube of mixture + a few drops of FeCl₃', why: 'Fe³⁺ is a reactant.', target: 'reagent:FECL3', done: has('FECL3') },
        { id: 'kscn', group: g, label: 'A tube of mixture + a few drops of KSCN', why: 'SCN⁻ is the other reactant.', target: 'reagent:KSCN', done: has('KSCN') },
        { id: 'nh4cl', group: g, label: 'A tube of mixture + solid NH₄Cl', why: 'Cl⁻ ties up some Fe³⁺ as FeCl²⁺.', target: 'reagent:NH4CL', done: has('NH4CL') },
        { id: 'hot', group: g, label: 'A tube of mixture in the hot water for a minute', why: 'Compare it with the control at room temperature.', target: 'hot', done: has('HOT') },
        { id: 'ice', group: g, label: 'A tube of mixture in the iced water for a minute', why: 'And one cooled.', target: 'ice', done: has('ICE') },
        { id: 'chromate', group: 'Chromate(VI) / dichromate(VI)', label: 'Chromate: add dilute HCl, then dilute NaOH', why: '2CrO₄²⁻ + 2H⁺ ⇌ Cr₂O₇²⁻ + H₂O. Watch the colour each time.', target: tubes.some((t) => t.sys === 'CHROMATE') ? 'reagent:HCL' : 'rack', done: has('CHROMATE') },
      ];
    }
    case 'DISTIL': {
      const r = dsRun(v, ev);
      const g1 = 'Evaporation';
      const g2 = 'Distillation';
      return [
        { id: 'filter', group: g1, label: 'Filter the sea water', why: 'Removes sand, which would be weighed with the salt.', target: 'funnel', done: r.filtered },
        { id: 'dish', group: g1, label: 'Weigh the empty evaporating dish', why: 'Weighed first, so the salt is found by difference.', target: 'balance', done: r.dishEmpty !== null },
        { id: 'measure', group: g1, label: 'Pipette 50.0 cm³ of filtrate into the dish', why: 'An accurately known volume.', target: 'dish', done: r.measured },
        { id: 'evap', group: g1, label: `Heat over the flame until nearly dry (${r.water.toFixed(0)} cm³ left)`, why: 'Stop the flame when only a little liquid is left: it spits near dryness.', target: 'dish', done: r.measured && r.water <= 4 },
        { id: 'bath', group: g1, label: 'Finish on the water bath until dry', why: 'Gentle heat: no spitting.', target: 'dish', done: r.measured && r.water === 0 },
        { id: 'weigh', group: g1, label: 'Cool, weigh; heat, cool and reweigh until constant', why: 'Two weighings that agree show the salt is dry.', target: 'balance', done: dsConstant(r) },
        { id: 'setup', group: g2, label: 'Set up the still: sea water + granules, thermometer at the side arm, water in at the bottom, receiver open', why: 'Each of these is a precaution examiners look for.', target: !r.filled || !r.chips ? 'dflask' : r.thermo !== 'SIDEARM' ? 'thermometer' : r.condenser !== 'BOTTOM' || !r.waterOn ? 'condenser' : 'receiver', done: r.filled && r.chips && r.thermo === 'SIDEARM' && r.condenser === 'BOTTOM' && r.waterOn && r.receiver === 'OPEN' },
        { id: 'distil', group: g2, label: `Heat gently and collect about 15 cm³ of distillate (${r.distillate.toFixed(0)} cm³)`, why: 'Read the thermometer while the distillate drips steadily.', target: 'dflask', done: r.distillate >= 12 },
        { id: 'stop', group: g2, label: 'Turn off the heat before the flask boils dry', why: 'The salt would cake and the flask could crack.', target: 'dflask', done: r.distillate >= 5 && !r.heating },
        { id: 'test', group: g2, label: 'Test the distillate: evaporate a few drops; find its boiling point', why: 'Pure water leaves no residue and boils at 100 °C.', target: 'receiver', done: r.tests.includes('EVAP') && (r.tests.includes('BP') || r.tests.includes('AGNO3')) },
      ];
    }
    case 'HALOGEN': {
      const tubes = prepTubes('HALOGEN', ev);
      const out: PrepStep[] = HL_KINDS.map((k) => ({ id: k, group: 'Displacement', label: `${HL_LABEL[k]}, then hexane, shake`, why: 'A few drops of halogen water on 2 cm³ of halide; then 1 cm³ hexane and shake: the upper layer shows which halogen is free.', target: tubes.some((t) => t.sys === HL_HALIDE[k] && !t.hal) ? `reagent:${k.split('-')[0]}` : `halide:${HL_HALIDE[k]}`, done: tubes.some((t) => hlKind(t) === k && t.hexShaken) }));
      out.push({ id: 'controls', group: 'Controls and confirmation', label: 'Controls: bromine water and iodine solution with water + hexane', why: 'You need each halogen’s own colour in hexane to compare.', target: 'halide:WATER', done: ['BR2', 'I2'].every((h) => tubes.some((t) => t.sys === 'WATER' && t.hal === h && t.hexShaken)) });
      out.push({ id: 'starch', group: 'Controls and confirmation', label: 'Starch on a tube where iodine was set free', why: 'Blue-black confirms iodine.', target: 'reagent:STARCH', done: tubes.some((t) => t.adds.includes('STARCH')) });
      return out;
    }
    case 'AMMONIA': {
      const r = amRun(v, ev);
      const g = 'Preparation';
      return [
        { id: 'weigh', group: g, label: 'Weigh about 5 g of NH₄Cl and 4 g of Ca(OH)₂', why: 'Roughly 1 : 1 by mass (Ca(OH)₂ in excess).', target: 'balance', done: r.nh4 !== null && r.ca !== null },
        { id: 'load', group: g, label: 'Mix them and put the mixture in the hard-glass tube', why: 'Well mixed, the solids react evenly.', target: r.mixed ? 'gtube' : 'mortar', done: r.loaded },
        { id: 'clamp', group: g, label: 'Clamp the tube with its mouth sloping slightly down', why: 'Water formed must not run back on to the hot glass.', target: 'gtube', done: !!r.clamp },
        { id: 'dryer', group: g, label: 'Connect the drying tower', why: 'Choose the drying agent that does not react with ammonia.', target: 'dryer', done: !!r.dryer },
        { id: 'collect', group: g, label: 'Set up the gas jar', why: 'Think about ammonia’s density and its solubility.', target: 'jar', done: !!r.collect },
        { id: 'heat', group: g, label: 'Heat gently until the jar is full', why: 'Damp red litmus at the mouth turns blue at once when it is full.', target: 'gtube', done: r.heatSec >= 120 || r.cracked },
        { id: 'tests', group: 'Tests', label: 'Waft it; damp red litmus; a rod dipped in conc. HCl', why: 'Colour and smell, the alkali test and the white fumes.', target: 'jar', done: r.waft && r.litmus.includes('DAMP') && r.hcl },
        { id: 'fountain', group: 'Tests', label: 'The fountain experiment', why: 'A flask of dry ammonia over water with phenolphthalein.', target: 'trough', done: r.fountain !== null },
      ];
    }
  }
}

/** The notebook milestones (the same for 2D and 3D). */
export function prepRecordSteps(v: ChemPrepVariant, s: ChemPrepState): PrepStep[] {
  const task = v.task;
  const rows = task === 'LECHAT' || task === 'HALOGEN' ? prepTubes(task, s.events).map((_, i) => `t${i}`) : PREP_ROWS[task];
  const left = rows.filter((r) => !s.records[r]?.observation.trim()).length;
  const boxes = PREP_READINGS[task].filter((x) => !(s.readings[x.id] ?? '').trim()).length;
  const q = PREP_MCQ[task].filter((x) => !(s.choices[x.id] ?? []).length).length;
  return [
    { id: 'record', group: 'Notebook', label: left ? `Write what you saw and infer for each ${rows[0]?.startsWith('t') ? 'tube' : 'stage'} (${left} to go)` : 'Write what you saw and the inference for each', why: 'Exactly what you saw; infer only what that result shows.', target: 'book', done: rows.length > 0 && !left },
    { id: 'readings', group: 'Notebook', label: boxes ? `Readings and calculation (${boxes} boxes to go)` : 'Readings and calculation', why: 'Readings exactly as the instrument showed; work from your own readings.', target: 'book', done: !boxes },
    { id: 'mcq', group: 'Notebook', label: 'Answer the deduction questions', why: 'Tick every right answer.', target: 'book', done: !q },
    { id: 'written', group: 'Notebook', label: 'Two precautions and the explanation', why: 'Precautions are things you did to get reliable results safely.', target: 'book', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
  ];
}

/** What to do next (practice mode only). */
export function nextHint(v: ChemPrepVariant, s: ChemPrepState): string {
  const next = [...prepBenchSteps(v, s), ...prepRecordSteps(v, s)].find((x) => !x.done);
  return next ? `${next.label}. ${next.why}` : 'Everything is recorded: check your notebook and hand in.';
}
