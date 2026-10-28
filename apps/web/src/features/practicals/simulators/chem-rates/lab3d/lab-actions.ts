import { RATES_ACID_VOLS, RATES_BATHS, RATES_CROSS_CARD, RATES_MG_CONCS, RATES_TEMP_THIO, type ChemRatesState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { crossFlaskDirty, crossFlaskFull, openCross, openMg, type Rates } from '../actions';
import { useBench } from './bench-store';
import { APPARATUS, APPARATUS_LABEL, NEEDED, PLACE_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the rates bench, as plain operations (used
 * by the dock, the object menus, the drags and the demo) and as each object's
 * menu. Marked changes go through the shared actions; collecting, setting out
 * and the goggles are log notes without marks.
 */

const view = () => useLabView.getState();
/** Looking down through the flask (the "Look down" view, or a steep demo spot). */
export const lookingDown = () => {
  const v = view();
  return v.mode === 'bench' && (v.spot ? v.spot.pitch > 1.1 : v.focus === 'top');
};

export interface Ops {
  place: (id: ApparatusId) => void;
  placeNext: () => void;
  wear: (what: 'coat' | 'goggles') => void;
  pour: (conc: number) => void;
  weigh: () => void;
  clean: () => void;
  zero: () => void;
  check: () => void;
  drop: () => void;
  bung: () => void;
  watch: () => void;
  resetWatch: () => void;
  read: () => void;
  finish: () => void;
  discard: () => void;
  measure: (thio: number, water: number) => void;
  warm: (b: number) => void;
  acidVol: (ml: number) => void;
  addAcid: () => void;
  swirl: () => void;
  thermo: () => void;
  record: () => void;
  empty: () => void;
  rinse: () => void;
  why: Partial<Record<'place' | 'bench' | 'pour' | 'prep' | 'drop' | 'bung' | 'watch' | 'read' | 'finish' | 'measure' | 'acid' | 'swirl' | 'record' | 'thermo' | 'empty' | 'rinse', string>>;
}

export function makeOps(o: Rates): Ops {
  const now = () => {
    const st = o.ref.current;
    return { st, scene: sceneFromState(st) };
  };
  const whyNow = () => {
    const { st, scene } = now();
    const setUp = !st.task ? 'Choose the experiment first.' : !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : !scene.set ? 'Set up the apparatus first (the dock’s button).' : undefined;
    const m = openMg(st);
    const c = openCross(st);
    const w = o.watchRef.current;
    const mgLive = !!m && m.r.dropped && o.mgTau() > 0;
    const crossLive = !!c && o.crossT() >= 0;
    return {
      place: !scene.nextPlace ? 'Everything is set up.' : !scene.collected.has(scene.nextPlace) ? `Collect the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} first.` : undefined,
      bench: setUp,
      pour: setUp ?? (m ? 'The flask already has acid in it.' : st.mgRuns.every(Boolean) ? 'Both runs are done (discard one in the notebook to repeat it).' : undefined),
      prep: setUp ?? (!m ? 'Pour the acid into the flask first.' : m.r.dropped ? 'The magnesium is already in.' : undefined),
      drop: setUp ?? (!m ? 'Pour the acid into the flask first.' : m.r.dropped ? 'The magnesium is already in.' : undefined),
      bung: !m?.r.dropped ? 'Drop the magnesium in first.' : m.r.bungLag !== null ? 'The bung is in.' : undefined,
      watch: setUp ?? (st.task === 'MG' ? (!m ? 'Set up a run first.' : undefined) : !c ? 'Measure a mixture into the flask first.' : undefined) ?? (w.stop !== null ? 'The watch is stopped: record or reset it.' : undefined),
      read: !mgLive ? 'No reaction is going.' : w.start === null ? 'Start the stopwatch first.' : undefined,
      finish: !m?.r.dropped ? 'No run is going.' : undefined,
      measure: setUp ?? (c ? 'The flask is in use: finish this run first.' : crossFlaskFull(st) ? 'Pour the old mixture away first.' : undefined),
      acid: setUp ?? (!c ? 'Measure the thiosulphate and water into the flask first.' : crossLive ? 'The acid is in.' : undefined),
      swirl: !crossLive ? 'Add the acid first.' : undefined,
      record: !c ? 'No run is going.' : c.r.elapsed === null ? 'Stop the stopwatch first.' : undefined,
      thermo: !crossFlaskFull(st) ? 'The flask is empty.' : undefined,
      empty: !crossFlaskFull(st) ? 'The flask is empty.' : undefined,
      rinse: crossFlaskFull(st) ? 'Pour the mixture away first.' : !crossFlaskDirty(st) ? 'The flask is clean.' : undefined,
    };
  };
  const why = whyNow();
  const say = (m: string) => notify(m, 'warning', 2600);
  const guard = (k: keyof ReturnType<typeof whyNow>, fn: () => void) => () => {
    const w = whyNow()[k];
    if (w) return say(w);
    fn();
  };
  const ops: Ops = {
    why,
    place: (id) => {
      const { scene } = now();
      if (!scene.collected.has(id)) return say(`Collect the ${APPARATUS_LABEL[id].toLowerCase()} first.`);
      if (id === 'syringe' && !scene.placed.has('stand')) return say('Stand the retort stand first.');
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
    pour: (conc) => {
      const w = whyNow().pour;
      if (w) return say(w);
      const m = o.pourAcid(conc);
      if (m) return say(m);
      play('clink');
    },
    weigh: guard('prep', () => (o.weigh(), play('tick'), notify(`The ribbon weighs ${o.v.mgMass.toFixed(3)} g.`, 'info', 2000))),
    clean: guard('prep', () => (o.clean(), useBench.setState({ rubUntil: performance.now() + 900 }), play('tick'))),
    zero: guard('prep', () => (o.zero(), play('tick'))),
    check: guard('prep', () => (o.check(), useBench.setState({ checkUntil: performance.now() + 1200 }), play('creak'))),
    drop: guard('drop', () => (o.drop(), play('drip'))),
    bung: guard('bung', () => (o.bung(), play('clink'))),
    watch: guard('watch', () => {
      if (o.watchRef.current.start === null) o.startWatch();
      else o.stopWatch(lookingDown());
      play('tick');
    }),
    resetWatch: () => o.resetWatch(),
    read: guard('read', () => {
      useBench.setState({ snap: { at: o.elapsed(), value: o.syringeNow() } });
      const m = o.read();
      if (m) return say(m);
      play('success');
    }),
    finish: guard('finish', () => (o.finish(), play('success'))),
    discard: () => o.discard(),
    measure: (thio, water) => {
      const w = whyNow().measure;
      if (w) return say(w);
      const m = o.measure(thio, water);
      if (m) return say(m);
      startPourSound();
    },
    warm: (b) => {
      const w = whyNow().acid;
      if (w) return say(w);
      o.warm(b);
      notify(`Warmed in the water bath at ${b} °C — read the thermometer.`, 'info', 2200);
      play('tick');
    },
    acidVol: (ml) => o.setAcid(ml),
    addAcid: guard('acid', () => (o.addAcid(), play('drip'))),
    swirl: guard('swirl', () => (o.swirl(), useBench.setState({ swirlUntil: performance.now() + 900 }))),
    thermo: guard('thermo', () => {
      o.readThermo();
      play('tick');
    }),
    record: guard('record', () => {
      const m = o.record();
      if (m) return say(m);
      play('success');
    }),
    empty: guard('empty', () => (o.empty(), play('drip'))),
    rinse: guard('rinse', () => (o.rinse(), play('drip'))),
  };
  return ops;
}
const startPourSound = () => play('clink');

export interface ActionCtx {
  o: Rates;
  s: ChemRatesState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });

export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene, ops } = ctx;
  const task = s.task ?? 'MG';
  const mg = task === 'MG';
  const m = openMg(s);
  const c = openCross(s);
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return { title: APPARATUS_LABEL[a], info: 'In the apparatus cupboard.', actions: [act('take', 'Take to my bench', () => (o.note(`collect:${a}`), play('clink'), view().set({ selected: null }), notify(`${APPARATUS_LABEL[a]} is on your bench.`, 'success', 1600)), undefined, 'brand')] };
  }
  const inUse = (a: ApparatusId) => scene.placed.has(a) || ((a === 'flask' || a === 'cylinder') && (!!m || !!c || crossFlaskFull(s)));
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (o.note(`return:${a}`), view().set({ selected: null })), inUse(a) ? 'You are using it.' : undefined);
  const notPlaced = (a: ApparatusId) => scene.collected.has(a) && PLACE_LABEL[a] && !scene.placed.has(a);
  if ((id === 'stand' || id === 'syringe' || id === 'paper' || id === 'bath') && notPlaced(id)) return { title: APPARATUS_LABEL[id], info: 'On your bench, not yet set up.', actions: [act('place', PLACE_LABEL[id]!, () => ops.place(id), undefined, 'brand'), returnable(id)] };
  const watchActs = [o.watchRef.current.start === null ? act('start', 'Start the stopwatch', ops.watch, ops.why.watch, 'brand') : act('stop', 'Stop the stopwatch', ops.watch, ops.why.watch, 'brand'), act('reset', 'Reset the stopwatch', ops.resetWatch, o.watchRef.current.start === null ? 'It is at zero.' : undefined)];
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: `Choose the apparatus for ${mg ? 'magnesium and acid with a gas syringe' : 'the disappearing cross'}.`, actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return { title: 'Your bench', info: 'Bench 2: your reagents, task card and notebook are here.', actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))] };
    case 'coat':
      return { title: 'Lab coat', info: 'Wear a buttoned lab coat.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => o.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => ops.wear('coat'), undefined, 'brand')] };
    case 'goggles':
      return { title: 'Safety goggles', info: 'Acid can splash when the magnesium fizzes or the flask is swirled.', actions: [scene.goggles ? act('off', 'Take off the goggles', () => o.note('safety-off:goggles')) : act('on', 'Put on the goggles', () => ops.wear('goggles'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'stopwatch':
      return { title: 'Stopwatch', info: mg ? 'Start it as the magnesium goes in; read the syringe at every 30 s mark.' : 'Start it as the acid goes in; stop it when the cross disappears.', actions: watchActs };
    case 'acid1':
    case 'acid2': {
      const conc = id === 'acid1' ? RATES_MG_CONCS[0] : RATES_MG_CONCS[1];
      return { title: `Hydrochloric acid, ${conc === 1 ? '1.0' : '0.50'} mol dm⁻³`, info: 'Corrosive: goggles on. Measure 50 cm³ with the measuring cylinder.', actions: [act('pour', 'Measure 50 cm³ into the flask', () => ops.pour(conc), ops.why.pour, 'brand')] };
    }
    case 'ribbon':
      return {
        title: 'Magnesium ribbon',
        info: `Card: ${o.v.mgMass.toFixed(3)} g. ${m ? (m.r.cleaned ? 'Cleaned — shiny.' : 'Dull grey: an oxide layer on it.') : ''}`,
        actions: [act('weigh', 'Weigh it on the balance', ops.weigh, ops.why.prep), act('clean', 'Rub it with sandpaper', ops.clean, ops.why.prep), act('drop', 'Drop it into the acid', ops.drop, ops.why.drop, 'brand')],
      };
    case 'sandpaper':
      return { title: 'Sandpaper', info: 'Rub the ribbon until it is shiny: the oxide layer would slow the start.', actions: [act('clean', 'Clean the ribbon', ops.clean, ops.why.prep, 'brand')] };
    case 'balance':
      return { title: 'Top-pan balance', info: 'Reads to 0.001 g.', actions: [act('weigh', 'Weigh the ribbon', ops.weigh, ops.why.prep, 'brand')] };
    case 'syringe':
    case 'plunger':
      return {
        title: 'Gas syringe (100 cm³)',
        info: 'Read the scale at the plunger’s inner end, at eye level. Drag the plunger in to zero, or out and let go to test it is airtight.',
        actions: [act('zero', 'Push the plunger fully in (0 cm³)', ops.zero, ops.why.prep), act('check', 'Check airtight (pull out, let go)', ops.check, ops.why.prep), act('read', 'Read it now (record the time)', ops.read, ops.why.read, 'brand'), act('eye', 'Eye-level view', () => view().set({ mode: 'read', selected: null, spot: null }))],
      };
    case 'flask':
      if (mg)
        return {
          title: 'Conical flask with bung',
          info: m ? `50 cm³ of ${m.r.conc === 1 ? '1.0' : '0.50'} mol dm⁻³ HCl.` : 'Empty.',
          actions: [act('drop', 'Drop the magnesium in', ops.drop, ops.why.drop, 'brand'), act('bung', 'Replace the bung', ops.bung, ops.why.bung, 'brand'), act('finish', 'Gas has stopped: finish the run', ops.finish, ops.why.finish), act('pour', 'Pour away and wash out', ops.discard, m ? undefined : 'The flask is empty.')],
        };
      return {
        title: 'Conical flask',
        info: c ? `${c.r.thio} cm³ thiosulphate + ${c.r.water} cm³ water${c.r.bath ? `, warmed to about ${c.r.bath} °C` : ''}.` : crossFlaskFull(s) ? 'The last mixture is still in it.' : 'Empty.',
        actions: [act('acid', `Add the acid (${c?.r.acid ?? 5} cm³)`, ops.addAcid, ops.why.acid, 'brand'), act('swirl', 'Swirl', ops.swirl, ops.why.swirl), act('look', 'Look down through it', () => view().set({ mode: 'bench', focus: 'top', spot: null, selected: null })), act('empty', 'Pour away into the sink', ops.empty, ops.why.empty), act('rinse', 'Rinse with water', ops.rinse, ops.why.rinse)],
      };
    case 'cylinder':
      if (mg) return { title: '50 cm³ measuring cylinder', info: 'Measures the acid.', actions: [act('a1', 'Measure 50 cm³ of 1.0 mol dm⁻³ HCl', () => ops.pour(1), ops.why.pour), act('a2', 'Measure 50 cm³ of 0.50 mol dm⁻³ HCl', () => ops.pour(0.5), ops.why.pour)] };
      return { title: '50 cm³ measuring cylinder', info: 'Measures the thiosulphate and the water (the dock chooses the volumes).', actions: RATES_CROSS_CARD.map((v) => act(`m${v}`, `${v} cm³ thiosulphate + ${50 - v} cm³ water`, () => ops.measure(v, 50 - v), ops.why.measure)) };
    case 'smallCyl':
      return { title: '10 cm³ measuring cylinder', info: 'Measures the acid.', actions: RATES_ACID_VOLS.map((ml) => act(`v${ml}`, `${ml} cm³ of acid`, () => ops.acidVol(ml), c && o.crossT() < 0 ? undefined : 'Measure a mixture first.', c?.r.acid === ml ? 'brand' : undefined)) };
    case 'thio':
      return { title: 'Sodium thiosulphate, 0.15 mol dm⁻³', info: 'Measure it with the 50 cm³ cylinder.', actions: [act('m', `${RATES_TEMP_THIO} cm³ + 40 cm³ water (temperature part)`, () => ops.measure(RATES_TEMP_THIO, 50 - RATES_TEMP_THIO), ops.why.measure)] };
    case 'hcl2':
      return { title: 'Hydrochloric acid, 2.0 mol dm⁻³', info: 'Corrosive: goggles on. Measure 5 cm³ with the 10 cm³ cylinder.', actions: [act('add', 'Add it to the flask', ops.addAcid, ops.why.acid, 'brand')] };
    case 'paper':
      return { title: 'Paper with a bold cross', info: 'Under the flask. Use the same cross every time.', actions: [act('look', 'Look down through the flask', () => view().set({ mode: 'bench', focus: 'top', spot: null, selected: null }), undefined, 'brand')] };
    case 'bath':
      return { title: 'Water bath', info: 'Warm the mixture before adding the acid.', actions: RATES_BATHS.map((b) => act(`b${b}`, `Warm the flask to about ${b} °C`, () => ops.warm(b), ops.why.acid, c?.r.bath === b ? 'brand' : undefined)) };
    case 'thermometer':
      return { title: 'Thermometer', info: 'In the mixture. Read it at eye level, to 1 °C.', actions: [act('read', 'Read the temperature (record it)', ops.thermo, ops.why.thermo, 'brand'), act('eye', 'Eye-level view', () => view().set({ mode: 'read', selected: null, spot: null }), ops.why.thermo)] };
    case 'washBottle':
      return { title: 'Wash bottle (distilled water)', info: 'Rinse the flask between runs.', actions: [act('rinse', 'Rinse the flask', ops.rinse, ops.why.rinse, 'brand')] };
    case 'beaker':
      return { title: 'Beaker (waste)', info: 'For the used acid.', actions: [] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: mg ? 'Today: Mg + HCl with a gas syringe. No flames near hydrogen.' : 'Today: the disappearing cross. Keep the room ventilated (SO₂).', actions: [] };
    case 'fume':
      return { title: 'Fume cupboard', info: mg ? 'Not needed: the dilute acid is used at your bench.' : 'The sulphur dioxide made here is small in amount; keep the windows open and do not sniff the flask.', actions: [] };
    case 'shelf':
      return { title: 'Reagent shelf', info: 'Stock solutions: yours are on your bench.', actions: [] };
    case 'extinguisher':
      return { title: 'Fire extinguisher', info: 'Hydrogen burns: no flames near the apparatus.', actions: [] };
    case 'firstaid':
      return { title: 'First-aid box', info: 'Report every cut or burn to the teacher.', actions: [] };
    case 'eyewash':
      return { title: 'Eye-wash station', info: 'Acid in the eyes: rinse with plenty of water for 10 minutes and tell the teacher.', actions: [] };
    case 'desk':
      return { title: 'Teacher’s desk', info: 'Ask the teacher if you are unsure.', actions: [] };
  }
  const extra = APPARATUS.find((a) => a.id === id);
  if (extra) return { title: extra.label, info: NEEDED[task].includes(extra.id) ? undefined : 'Not needed for this practical.', actions: [returnable(extra.id)] };
  return null;
}
