import { EN_VOLS, SOLY_ADDS, SOLY_WATER0, type ChemEnergeticsState, type EnVessel, type SolyHeat } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { halfDegree, nextKind, openRun, openTube, type Energetics } from '../actions';
import { useBench } from './bench-store';
import { APPARATUS, APPARATUS_LABEL, NEEDED, PLACE_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the energetics bench, as plain operations
 * (used by the dock, the object menus, the drags and the demo) and as each
 * object's menu. Marked changes go through the shared actions; collecting,
 * setting out and the goggles are log notes without marks.
 */

const view = () => useLabView.getState();
type WhyKey = 'place' | 'bench' | 'vessel' | 'measureA' | 'measureB' | 'weigh' | 'thermo' | 'read' | 'mix' | 'lid' | 'stir' | 'finish' | 'pour' | 'kno3' | 'water' | 'heat' | 'cool' | 'tubeStir' | 'crystals' | 'flame';

export interface Ops {
  place: (id: ApparatusId) => void;
  placeNext: () => void;
  wear: (what: 'coat' | 'goggles') => void;
  vessel: (v: EnVessel) => void;
  support: () => void;
  measureA: (vol: number) => void;
  measureB: (vol: number) => void;
  weigh: (kind: 'SALT' | 'NAOH', mass: number) => void;
  thermoTo: (where: 'A' | 'B') => void;
  read: () => void;
  mix: () => void;
  lid: () => void;
  stir: () => void;
  finish: () => void;
  pourAway: () => void;
  kno3: (mass: number) => void;
  water: (vol: number) => void;
  heat: (h: SolyHeat) => void;
  cool: () => void;
  tubeStir: (on?: boolean) => void;
  crystals: () => void;
  startAgain: () => void;
  why: Partial<Record<WhyKey, string>>;
}

export function makeOps(o: Energetics): Ops {
  const now = () => {
    const st = o.ref.current;
    return { st, scene: sceneFromState(st) };
  };
  const whyNow = (): Partial<Record<WhyKey, string>> => {
    const { st, scene } = now();
    const ready = !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : undefined;
    const setUp = ready ?? (!scene.set ? (st.task === 'SOLY' ? 'Set up the apparatus first (the dock’s button).' : 'Choose the cup first.') : undefined);
    const r = openRun(st);
    const t = openTube(st);
    const ph = o.phase();
    const cupTask = st.task !== 'SOLY';
    return {
      place: !scene.nextPlace ? 'Everything is set up.' : !scene.collected.has(scene.nextPlace) ? `Collect the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} first.` : undefined,
      bench: setUp,
      vessel: ready ?? (r ? 'The cup is in use: finish this run first.' : undefined),
      measureA: setUp ?? (r ? 'The cup is in use: finish this run or pour it away.' : undefined),
      measureB: setUp ?? (!r ? 'Measure the acid into the cup first.' : r.r.mixed ? 'Already mixed.' : undefined),
      weigh: setUp ?? (!r ? 'Measure the water into the cup first.' : r.r.mixed ? 'The solid is already in.' : undefined),
      thermo: setUp ?? (cupTask && (!r || r.r.mixed) ? 'Nothing to measure yet.' : undefined),
      read: cupTask ? (!r ? 'Nothing in the cup.' : undefined) : !t ? 'No run is going.' : undefined,
      mix: setUp ?? (!r ? 'Nothing in the cup.' : r.r.mixed ? 'Already mixed.' : st.task === 'NEUT' && r.r.volB === 0 ? 'Measure the alkali first.' : st.task === 'SOLN' && r.r.solid === 0 ? 'Weigh the solid first.' : undefined),
      lid: !r?.r.mixed ? (r ? 'Mix first: you cannot pour with the lid on.' : 'Nothing in the cup.') : r.r.lidAt !== null ? 'The lid is on.' : undefined,
      stir: !r?.r.mixed ? 'Mix first.' : undefined,
      finish: !r?.r.mixed ? 'Nothing is reacting yet.' : undefined,
      pour: !r ? 'The cup is empty.' : undefined,
      kno3: setUp ?? (st.soly.runs.length ? 'The KNO₃ is in the tube.' : undefined),
      water: setUp ?? (st.soly.mass === null ? 'Weigh the KNO₃ first.' : t ? 'Finish this run first: let it cool until crystals appear.' : undefined),
      heat: setUp ?? (!t ? 'Add water to the tube first.' : ph === 'heat' ? 'It is being warmed.' : undefined),
      flame: !scene.collected.has('burner') ? 'There is no Bunsen burner on your bench.' : undefined,
      cool: ph !== 'heat' ? 'The tube is not in the bath.' : undefined,
      tubeStir: !t ? 'No run is going.' : undefined,
      crystals: !t || ph === 'idle' ? 'No run is going.' : undefined,
    };
  };
  const why = whyNow();
  const say = (m: string) => notify(m, 'warning', 2600);
  const guard = (k: WhyKey, fn: () => void) => () => {
    const w = whyNow()[k];
    if (w) return say(w);
    fn();
  };
  const ops: Ops = {
    why,
    place: (id) => {
      const { scene } = now();
      if (!scene.collected.has(id)) return say(`Collect the ${APPARATUS_LABEL[id].toLowerCase()} first.`);
      if (scene.placed.has(id)) return;
      o.note(`place:${id}`);
      play('clink');
      view().set({ selected: null });
    },
    placeNext: () => {
      const w = whyNow().place;
      if (w) return say(w);
      ops.place(now().scene.nextPlace!);
    },
    wear: (what) => {
      o.note(`safety:${what}`);
      view().set({ selected: null });
      notify(what === 'coat' ? 'Lab coat on.' : 'Goggles on.', 'success', 1400);
    },
    vessel: (x) => {
      const w = whyNow().vessel;
      if (w) return say(w);
      const { scene } = now();
      if (x === 'BEAKER' && !scene.collected.has('glassBeaker')) return say('There is no glass beaker on your bench.');
      const m = o.chooseVessel(x);
      if (m) return say(m);
      play('clink');
    },
    support: guard('vessel', () => (o.support(), play('clink'))),
    measureA: (vol) => {
      const w = whyNow().measureA;
      if (w) return say(w);
      const m = o.measureA(vol);
      if (m) return say(m);
      useBench.setState({ pourUntil: performance.now() + 900 });
      play('drip');
    },
    measureB: (vol) => {
      const w = whyNow().measureB;
      if (w) return say(w);
      const m = o.measureB(vol);
      if (m) return say(m);
      play('drip');
    },
    weigh: (kind, mass) => {
      const w = whyNow().weigh;
      if (w) return say(w);
      const m = o.weigh(kind, mass);
      if (m) return say(m);
      play('tick');
      notify(`${mass.toFixed(2)} g of ${kind === 'NAOH' ? 'NaOH pellets' : 'NH₄NO₃'} on the balance.`, 'info', 1800);
    },
    thermoTo: (where) => {
      const w = whyNow().thermo;
      if (w) return say(w);
      const r = openRun(o.ref.current);
      if (where === 'B' && r && r.r.volB === 0) return say('Measure the alkali first.');
      o.thermoTo(where);
      play('clink');
    },
    read: guard('read', () => {
      const st = o.ref.current;
      const value = o.thermoNow();
      const r = openRun(st);
      if (st.task !== 'SOLY' && r && !r.r.mixed) {
        const m = o.readStart();
        if (m) return say(m);
      }
      useBench.setState({ snap: { at: st.task === 'SOLY' ? 0 : o.tMix(), value, label: st.task === 'SOLY' ? 'tube' : r?.r.mixed ? 'cup' : o.thermoWhere() === 'B' ? 'alkali' : st.task === 'NEUT' ? 'acid' : 'water' } });
      notify(`The thermometer reads about ${halfDegree(value)} °C — write it in your table.`, 'info', 2200);
      play('tick');
    }),
    mix: guard('mix', () => {
      const m = o.mix();
      if (m) return say(m);
      useBench.setState({ pourUntil: performance.now() + 1100 });
      play('drip');
    }),
    lid: guard('lid', () => (o.lid(), play('clink'))),
    stir: guard('stir', () => (o.stir(), useBench.setState({ stirUntil: performance.now() + 1500 }))),
    finish: guard('finish', () => (o.finish(), play('success'))),
    pourAway: guard('pour', () => (o.pourAway(), play('drip'))),
    kno3: (mass) => {
      const w = whyNow().kno3;
      if (w) return say(w);
      const m = o.weighKno3(mass);
      if (m) return say(m);
      play('tick');
    },
    water: (vol) => {
      const w = whyNow().water;
      if (w) return say(w);
      const m = o.addWater(vol);
      if (m) return say(m);
      play('drip');
    },
    heat: (h) => {
      const w = whyNow().heat ?? (h === 'FLAME' ? whyNow().flame : undefined);
      if (w) return say(w);
      const m = o.heatStart(h);
      if (m) return say(m);
      play('clink');
    },
    cool: guard('cool', () => (o.heatStop(), play('clink'))),
    tubeStir: (on) => {
      const w = whyNow().tubeStir;
      if (w) return say(w);
      o.setStir(on ?? !o.stirring());
    },
    crystals: guard('crystals', () => {
      const value = o.tubeThermo();
      const m = o.crystalsSeen();
      if (m) return say(m);
      useBench.setState({ snap: { at: 0, value, label: 'crystals' } });
      play('success');
      notify(`Crystals at about ${halfDegree(value)} °C — write it in your table.`, 'success', 2400);
    }),
    startAgain: () => o.startAgain(),
  };
  return ops;
}

export interface ActionCtx {
  o: Energetics;
  s: ChemEnergeticsState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });

export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene, ops } = ctx;
  const task = s.task ?? 'NEUT';
  const r = openRun(s);
  const t = openTube(s);
  const bench = useBench.getState();
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return { title: APPARATUS_LABEL[a], info: 'In the apparatus cupboard.', actions: [act('take', 'Take to my bench', () => (o.note(`collect:${a}`), play('clink'), view().set({ selected: null }), notify(`${APPARATUS_LABEL[a]} is on your bench.`, 'success', 1600)), undefined, 'brand')] };
  }
  const inUse = (a: ApparatusId) => scene.placed.has(a) || (a === 'cup' && (!!r || s.setup.vessel === 'CUP')) || (a === 'thermometer' && (!!r || !!t));
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (o.note(`return:${a}`), view().set({ selected: null })), inUse(a) ? 'You are using it.' : undefined);
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: `Choose the apparatus for ${task === 'SOLY' ? 'the solubility curve' : task === 'NEUT' ? 'the heat of neutralisation' : 'the heat of solution'}.`, actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return { title: 'Your bench', info: 'Bench 2: your reagents, task card and notebook are here.', actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))] };
    case 'coat':
      return { title: 'Lab coat', info: 'Wear a buttoned lab coat.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => o.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => ops.wear('coat'), undefined, 'brand')] };
    case 'goggles':
      return { title: 'Safety goggles', info: task === 'SOLY' ? 'Hot solutions can spit.' : 'Acid and alkali are corrosive: they can splash as you pour and stir.', actions: [scene.goggles ? act('off', 'Take off the goggles', () => o.note('safety-off:goggles')) : act('on', 'Put on the goggles', () => ops.wear('goggles'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'cup':
      return {
        title: s.setup.vessel === 'BEAKER' ? 'Glass beaker (used as the calorimeter)' : 'Polystyrene cup',
        info: r ? (r.r.mixed ? `Reacting: ${Math.round(o.tMix())} s since mixing.${r.r.lidAt === null ? ' Not covered.' : ''}` : `${r.r.volA} cm³ in it.`) : s.setup.vessel ? 'Empty.' : 'A poor conductor of heat: little heat is lost through it.',
        actions: [
          ...(s.setup.vessel !== 'CUP' ? [act('use', 'Use the polystyrene cup', () => ops.vessel('CUP'), ops.why.vessel, 'brand')] : []),
          ...(!s.setup.support ? [act('support', 'Stand it in the 250 cm³ beaker', ops.support, ops.why.vessel ?? (scene.collected.has('beaker') ? undefined : 'Collect the beaker first.'))] : []),
          act('mix', task === 'NEUT' ? 'Pour the alkali in quickly' : 'Tip the solid in', ops.mix, ops.why.mix, 'brand'),
          act('lid', 'Cover with the lid', ops.lid, ops.why.lid),
          act('stir', 'Stir with the thermometer', ops.stir, ops.why.stir),
          act('finish', 'Finish this run', ops.finish, ops.why.finish),
          act('pour', 'Pour away and rinse', ops.pourAway, ops.why.pour),
        ],
      };
    case 'glassBeaker':
      return { title: 'Glass beaker (100 cm³)', info: 'Glass conducts heat and soaks some up itself: a poor calorimeter.', actions: [act('use', 'Use it instead of the cup', () => ops.vessel('BEAKER'), ops.why.vessel), returnable('glassBeaker')] };
    case 'beaker':
      return { title: '250 cm³ beaker', info: 'Holds the light cup steady.', actions: [act('support', 'Stand the cup in it', ops.support, s.setup.support ? 'The cup is in it.' : ops.why.vessel, 'brand')] };
    case 'cylinder':
      return {
        title: '50 cm³ measuring cylinder',
        info: task === 'NEUT' ? 'For the acid (A). Read the bottom of the meniscus at eye level.' : 'For the distilled water.',
        actions: EN_VOLS.map((v) => act(`a${v}`, `Measure ${v}.0 cm³ of ${task === 'NEUT' ? 'A (acid)' : 'water'} into the cup`, () => ops.measureA(v), ops.why.measureA, v === 50 ? 'brand' : undefined)),
      };
    case 'cylinder2':
      return { title: 'Second measuring cylinder', info: 'For the alkali (B): keep it apart from the acid until you mix.', actions: [...EN_VOLS.map((v) => act(`b${v}`, `Measure ${v}.0 cm³ of B (alkali)`, () => ops.measureB(v), ops.why.measureB, v === 50 ? 'brand' : undefined)), act('thermo', 'Put the thermometer in the alkali', () => ops.thermoTo('B'), ops.why.thermo ?? (r && r.r.volB === 0 ? 'Measure the alkali first.' : undefined))] };
    case 'acid':
      return { title: 'Hydrochloric acid, 1.00 mol dm⁻³ (A)', info: 'Corrosive: goggles on.', actions: [act('m', 'Measure 50.0 cm³ into the cup', () => ops.measureA(50), ops.why.measureA, 'brand')] };
    case 'alkali':
      return { title: 'Sodium hydroxide, 1.00 mol dm⁻³ (B)', info: 'Corrosive: wash any splash off at once.', actions: [act('m', 'Measure 50.0 cm³ into the second cylinder', () => ops.measureB(50), ops.why.measureB, 'brand')] };
    case 'water':
      return { title: 'Distilled water', info: task === 'SOLY' ? 'In the burette for the tube.' : 'Measure 50.0 cm³ into the cup.', actions: task === 'SOLY' ? [] : [act('m', 'Measure 50.0 cm³ into the cup', () => ops.measureA(50), ops.why.measureA, 'brand')] };
    case 'salt':
      return { title: 'Ammonium trioxonitrate(V), NH₄NO₃', info: 'An oxidising agent: keep it away from heat and flames.', actions: [2, 4, 8].map((m) => act(`w${m}`, `Weigh ${m.toFixed(2)} g`, () => ops.weigh('SALT', m), ops.why.weigh, m === 4 && nextKind(s) !== 'NAOH' ? 'brand' : undefined)) };
    case 'naoh':
      return { title: 'Sodium hydroxide pellets', info: 'Corrosive: use the spatula, never your fingers.', actions: [1, 2, 4].map((m) => act(`w${m}`, `Weigh ${m.toFixed(2)} g`, () => ops.weigh('NAOH', m), ops.why.weigh, m === 2 && nextKind(s) === 'NAOH' ? 'brand' : undefined)) };
    case 'balance':
      return task === 'SOLY'
        ? { title: 'Top-pan balance', info: 'Weigh the KNO₃ into the boiling tube.', actions: [3, 4, 5].map((m) => act(`k${m}`, `Weigh ${m.toFixed(1)} g of KNO₃`, () => ops.kno3(m), ops.why.kno3, m === 4 ? 'brand' : undefined)) }
        : { title: 'Top-pan balance', info: 'Weigh the solid on a watch glass (tared).', actions: [act('salt', 'Weigh 4.00 g of NH₄NO₃', () => ops.weigh('SALT', 4), ops.why.weigh, nextKind(s) === 'NAOH' ? undefined : 'brand'), act('naoh', 'Weigh 2.00 g of NaOH pellets', () => ops.weigh('NAOH', 2), ops.why.weigh, nextKind(s) === 'NAOH' ? 'brand' : undefined)] };
    case 'kno3':
      return { title: 'Potassium trioxonitrate(V), KNO₃', info: 'Weigh it on the balance.', actions: [act('w', 'Weigh 4.0 g into the tube', () => ops.kno3(4), ops.why.kno3, 'brand')] };
    case 'spatula':
      return { title: 'Spatula', info: 'For solids — never your fingers.', actions: [] };
    case 'thermometer':
      return {
        title: 'Thermometer',
        info: 'Read it at eye level to the nearest 0.5 °C. It takes a few seconds to settle.',
        actions: [
          ...(task !== 'SOLY' ? [act('a', `Into the ${task === 'NEUT' ? 'acid (in the cup)' : 'water (in the cup)'}`, () => ops.thermoTo('A'), ops.why.thermo), ...(task === 'NEUT' ? [act('b', 'Into the alkali (cylinder)', () => ops.thermoTo('B'), ops.why.thermo)] : [])] : [act('stir', o.stirring() ? 'Stop stirring' : 'Stir with it', () => ops.tubeStir(), ops.why.tubeStir)]),
          act('read', 'Read it (record)', ops.read, ops.why.read, 'brand'),
          act('eye', 'Eye-level view', () => view().set({ mode: 'read', selected: null, spot: null })),
        ],
      };
    case 'stopwatch':
      return { title: 'Stopwatch', info: r?.r.mixed ? `${Math.round(o.tMix())} s since mixing.` : 'It starts when you mix.', actions: [] };
    case 'tube':
      return {
        title: 'Boiling tube',
        info: t ? `${s.soly.mass?.toFixed(1)} g KNO₃ + ${t.r.water.toFixed(1)} cm³ water. ${o.phase() === 'heat' ? 'In the bath.' : o.phase() === 'cool' ? 'Cooling.' : ''}` : s.soly.mass !== null ? `${s.soly.mass.toFixed(1)} g KNO₃.` : 'Empty.',
        actions: [
          act('bath', 'Warm it in the water bath', () => ops.heat('BATH'), ops.why.heat, 'brand'),
          act('cool', 'Take it out to cool', ops.cool, ops.why.cool),
          act('stir', o.stirring() ? 'Stop stirring' : 'Stir with the thermometer', () => ops.tubeStir(), ops.why.tubeStir),
          act('crystals', 'Crystals appear — read now', ops.crystals, ops.why.crystals, 'brand'),
          act('again', 'Empty it and start again', ops.startAgain, s.soly.mass === null ? 'It is empty.' : undefined),
        ],
      };
    case 'rack':
      return { title: 'Test-tube rack', info: 'The tube cools here.', actions: [act('cool', 'Put the tube in the rack to cool', ops.cool, ops.why.cool)] };
    case 'bath':
      return { title: 'Water bath (about 80 °C)', info: 'Warms the tube gently: little water evaporates.', actions: scene.placed.has('bath') ? [act('heat', 'Warm the tube in it', () => ops.heat('BATH'), ops.why.heat, 'brand')] : [act('place', PLACE_LABEL.bath!, () => ops.place('bath'), undefined, 'brand')] };
    case 'burette':
      return {
        title: 'Burette (distilled water)',
        info: 'Delivers the water accurately.',
        actions: scene.placed.has('burette') ? [s.soly.runs.length === 0 ? act('w5', `Run ${SOLY_WATER0.toFixed(1)} cm³ into the tube`, () => ops.water(SOLY_WATER0), ops.why.water, 'brand') : act('w', `Add ${bench.add.toFixed(1)} cm³ more`, () => ops.water(bench.add), ops.why.water, 'brand'), ...SOLY_ADDS.filter((x) => x !== bench.add && s.soly.runs.length > 0).map((x) => act(`w${x}`, `Add ${x.toFixed(1)} cm³`, () => ops.water(x), ops.why.water))] : [act('place', PLACE_LABEL.burette!, () => ops.place('burette'), undefined, 'brand')],
      };
    case 'burner':
      return { title: 'Bunsen burner', info: task === 'SOLY' ? 'A naked flame heats the tube too strongly: the solution boils, spits and loses water.' : 'Not needed in this practical.', actions: task === 'SOLY' ? [act('flame', 'Heat the tube directly in the flame', () => ops.heat('FLAME'), ops.why.heat ?? ops.why.flame), returnable('burner')] : [returnable('burner')] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: task === 'SOLY' ? 'Today: the solubility curve of KNO₃.' : 'Today: energy changes in a polystyrene cup.', actions: [] };
    case 'fume':
      return { title: 'Fume cupboard', info: 'Not needed today.', actions: [] };
    case 'shelf':
      return { title: 'Reagent shelf', info: 'Stock solutions: yours are on your bench.', actions: [] };
    case 'extinguisher':
      return { title: 'Fire extinguisher', info: 'Keep NH₄NO₃ (an oxidiser) away from flames.', actions: [] };
    case 'firstaid':
      return { title: 'First-aid box', info: 'Report every burn or splash to the teacher.', actions: [] };
    case 'eyewash':
      return { title: 'Eye-wash station', info: 'Alkali or acid in the eyes: rinse with plenty of water for 10 minutes and tell the teacher.', actions: [] };
    case 'desk':
      return { title: 'Teacher’s desk', info: 'Ask the teacher if you are unsure.', actions: [] };
  }
  const extra = APPARATUS.find((a) => a.id === id);
  if (extra) return { title: extra.label, info: NEEDED[task].includes(extra.id) ? undefined : 'Not needed for this practical.', actions: [returnable(extra.id)] };
  return null;
}
