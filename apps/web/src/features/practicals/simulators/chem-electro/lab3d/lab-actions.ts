import { DISP_VOLS, rustLook, type ChemElectroState, type RustTube } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { fmtClock, fmtDays, nextHint, rustNow, type Electro } from '../actions';
import { useBench } from './bench-store';
import { guideSteps } from './guide';
import { APPARATUS_LABEL, NEEDED, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the electrochemistry bench, as each
 * object's menu. Every action is a button (the drags are extras); a blocked
 * one says why. Marked changes go through the shared actions; collecting and
 * the goggles are log notes.
 */

export type { LabAction, ObjectPanel };
export interface ActionCtx {
  x: Electro;
  s: ChemElectroState;
  scene: SceneState;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const view = () => useLabView.getState();
const need = (scene: SceneState, ...ids: ApparatusId[]) => {
  const m = ids.find((id) => !scene.collected.has(id));
  return m ? `Get the ${APPARATUS_LABEL[m].toLowerCase()} from the cupboard.` : undefined;
};
/** An action from a shared op: it runs, or says why not. */
function act(key: string, label: string, op: () => string | undefined, o: { blocked?: string; tone?: 'brand' | 'danger'; sfx?: Parameters<typeof play>[0]; after?: () => void } = {}): LabAction {
  return {
    key,
    label,
    tone: o.tone,
    blocked: o.blocked,
    run: () => {
      const m = op();
      if (m) return notify(m, 'warning', 3200);
      play(o.sfx ?? 'clink');
      o.after?.();
    },
  };
}
const stir = () => useBench.setState({ stirUntil: performance.now() + 1500 });
const pour = () => useBench.setState({ pourUntil: performance.now() + 1000 });
const sand = () => useBench.setState({ sandUntil: performance.now() + 1200 });
const readView = () => view().set({ mode: 'read', selected: null });

/** The actions for an object (the menu and the dock both use them). */
export function objectActions(id: string, ctx: ActionCtx): LabAction[] {
  const { x, s, scene } = ctx;
  const o = x.ops;
  const w = x.why;
  const task = x.task;
  if (task === 'ELEC') {
    const e = s.elec;
    switch (id) {
      case 'sandpaper':
        return [act('sand', 'Clean both plates with sandpaper', () => (sand(), o.sandPlates()), { blocked: need(scene, 'plates') ?? w.sand, tone: 'brand', sfx: 'tick' })];
      case 'plates':
        return [
          act('sand', 'Clean them with sandpaper', () => (sand(), o.sandPlates()), { blocked: need(scene, 'sandpaper') ?? w.sand }),
          act('weigh', 'Weigh both plates', o.weighBefore, { blocked: need(scene, 'balance') ?? w.weighBefore, tone: 'brand', sfx: 'tick' }),
          ...connectActions(ctx),
        ];
      case 'voltameter':
        return e.connected
          ? [
              ...(e.gap === 'TOUCH' ? [act('apart', 'Move the plates apart', o.separate, { tone: 'brand' })] : []),
              act('remove', 'Take the plates out', o.removePlates, { blocked: w.remove, tone: e.ran > 0 ? 'brand' : undefined }),
              act('dry-air', 'Let them dry in the air', () => o.dryPlates('AIR'), { blocked: w.dryPlates }),
              act('dry-flame', 'Dry them over a Bunsen flame', () => o.dryPlates('FLAME'), { blocked: w.dryPlates, tone: 'danger' }),
            ]
          : connectActions(ctx);
      case 'key':
        return [e.closed ? act('open', `Open the key (stop) — ${fmtClock(x.look.run)}`, o.openKey, { tone: 'brand', sfx: 'tick' }) : act('close', 'Close the key (start the current and the stopwatch)', o.closeKey, { blocked: need(scene, 'key') ?? w.key, tone: 'brand', sfx: 'tick' })];
      case 'rheostat':
        return [
          act('less4', '◀◀ Much less resistance', () => o.rheostat(-4), { blocked: w.rheo, sfx: 'tick' }),
          act('less', '◀ Less resistance (more current)', () => o.rheostat(-1), { blocked: w.rheo, tone: 'brand', sfx: 'tick' }),
          act('more', 'More resistance (less current) ▶', () => o.rheostat(1), { blocked: w.rheo, sfx: 'tick' }),
          act('more4', 'Much more resistance ▶▶', () => o.rheostat(4), { blocked: w.rheo, sfx: 'tick' }),
        ];
      case 'ammeter':
      case 'stopwatch':
        return [{ key: 'read', label: 'Read it at eye level', tone: 'brand', run: readView }];
      case 'washBottle':
      case 'bottle:propanone':
        return [act('gentle', 'Rinse the plates gently: water, then propanone', () => o.rinsePlates('GENTLE'), { blocked: w.rinse, tone: 'brand', sfx: 'drip' }), act('rub', 'Wipe the plates clean with tissue', () => o.rinsePlates('RUB'), { blocked: w.rinse })];
      case 'balance':
        return [act('w1', 'Weigh both plates (before)', o.weighBefore, { blocked: need(scene, 'plates') ?? w.weighBefore, tone: e.weighedBefore ? undefined : 'brand', sfx: 'tick' }), act('w2', 'Reweigh both plates (after)', o.weighAfter, { blocked: w.weighAfter, tone: e.removed ? 'brand' : undefined, sfx: 'tick' })];
    }
  }
  if (task === 'CELL') {
    const c = s.cell;
    switch (id) {
      case 'sandpaper':
        return [act('sand', 'Clean the zinc and copper strips', () => (sand(), o.sandStrips()), { blocked: need(scene, 'strips') ?? w.cellSand, tone: 'brand', sfx: 'tick' })];
      case 'strips':
      case 'beaker:zn':
      case 'beaker:cu':
        return [act('right', 'Zinc into ZnSO₄, copper into CuSO₄', () => o.placeStrips('RIGHT'), { blocked: need(scene, 'beakers', 'strips') ?? w.place, tone: 'brand' }), act('swap', 'Zinc into CuSO₄, copper into ZnSO₄', () => o.placeStrips('SWAPPED'), { blocked: need(scene, 'beakers', 'strips') ?? w.place })];
      case 'bridge':
      case 'dish:kno3':
        return [act('soak', 'Soak the filter paper in saturated KNO₃', o.soakBridge, { blocked: need(scene, 'bridge') ?? w.soak, tone: c.soaked ? undefined : 'brand', sfx: 'drip' }), act('bridge', c.bridge ? 'Lift the salt bridge out' : 'Lay the salt bridge across the beakers', () => o.setBridge(!c.bridge), { blocked: need(scene, 'bridge') ?? w.bridge, tone: 'brand' })];
      case 'voltmeter':
        return [
          act('use', c.meter === 'HIGH' ? 'In use (high-resistance)' : 'Use this voltmeter', () => o.chooseMeter('HIGH'), { blocked: need(scene, 'voltmeter') ?? (c.meter === 'HIGH' ? 'It is in use.' : undefined), tone: c.meter === 'HIGH' ? undefined : 'brand' }),
          act('read', 'Read the voltmeter', o.readMeter, { blocked: w.read, tone: c.meter ? 'brand' : undefined, sfx: 'tick' }),
          { key: 'eye', label: 'Look closely (eye level)', run: readView },
        ];
      case 'mcVoltmeter':
        return [act('use', 'Use this voltmeter', () => o.chooseMeter('LOW'), { blocked: need(scene, 'mcVoltmeter') ?? (c.meter === 'LOW' ? 'It is in use.' : undefined) })];
      case 'leads':
        return [act('right', 'Red (+) to copper, black (−) to zinc', () => o.connectLeads('CORRECT'), { blocked: need(scene, 'leads') ?? w.leads, tone: 'brand' }), act('rev', 'Red (+) to zinc, black (−) to copper', () => o.connectLeads('REVERSED'), { blocked: need(scene, 'leads') ?? w.leads })];
    }
  }
  if (task === 'DISP') {
    const d = s.disp;
    switch (id) {
      case 'jar:clean':
        return [act('clean', 'Use these clean filings', () => o.chooseFilings('CLEAN'), { blocked: w.filings, tone: 'brand' }), act('tap', 'Tap a little onto the weighing boat', () => (useBench.setState({ tapAt: performance.now() }), o.tap()), { blocked: need(scene, 'boat', 'balance') ?? w.tap ?? (d.filings === 'RUSTY' ? undefined : undefined), sfx: 'tick' })];
      case 'jar:rusty':
        return [act('rusty', 'Use these old filings', () => o.chooseFilings('RUSTY'), { blocked: w.filings })];
      case 'balance':
        return [
          act('tap', 'Tap a little iron onto the boat', () => (useBench.setState({ tapAt: performance.now() }), o.tap()), { blocked: need(scene, 'boat', 'balance') ?? w.tap, tone: !d.added && x.look.fe < 0.5 ? 'brand' : undefined, sfx: 'tick' }),
          act('back', 'Tip a little back', o.untap, { blocked: w.untap, sfx: 'tick' }),
          act('paper', 'Weigh a dry filter paper', o.weighPaper, { blocked: need(scene, 'filterPaper') ?? w.paper, tone: d.added && !d.paper ? 'brand' : undefined, sfx: 'tick' }),
          act('cu', 'Weigh the paper + copper', o.weighCopper, { blocked: w.dWeigh, tone: d.dry ? 'brand' : undefined, sfx: 'tick' }),
        ];
      case 'bottle:cuso4':
      case 'cylinder':
        return DISP_VOLS.map((vol) => act(`cu-${vol}`, `Measure ${vol} cm³ into the beaker`, () => (pour(), o.measureCuSO4(vol)), { blocked: need(scene, 'cylinder', 'beaker') ?? w.cuso4, tone: vol === 50 ? 'brand' : undefined, sfx: 'drip' }));
      case 'thermometer':
        return [act('in', 'Stand it in the solution', o.thermometerIn, { blocked: need(scene, 'thermometer') ?? w.thermo, tone: 'brand' }), act('out', 'Take it out', o.thermometerOut, { blocked: w.unthermo }), { key: 'read', label: 'Read it at eye level', run: readView }];
      case 'beaker':
      case 'rod':
        return [act('stir', 'Tip in the iron and stir', () => (stir(), o.addIron('STIR')), { blocked: need(scene, 'rod') ?? w.add, tone: 'brand' }), act('leave', 'Tip in the iron and leave it', () => o.addIron('NONE'), { blocked: w.add }), ...(d.added && d.stir === 'STIR' && !d.filtered ? [act('st', 'Keep stirring', () => (stir(), undefined))] : [])];
      case 'funnel':
        return [act('filter', 'Filter off the solid', o.filter, { blocked: need(scene, 'funnel') ?? w.filter, tone: 'brand' })];
      case 'washBottle':
      case 'bottle:propanone':
        return [act('wp', 'Wash with water, then a little propanone', () => o.washCopper('PROPANONE'), { blocked: w.dWash, tone: 'brand', sfx: 'drip' }), act('ww', 'Wash with water only', () => o.washCopper('WATER'), { blocked: w.dWash, sfx: 'drip' })];
      case 'filterPaper':
        return [act('air', 'Dry the paper and copper in a warm place', () => o.dryCopper('AIR'), { blocked: w.dDry, tone: 'brand' }), act('flame', 'Dry it quickly over a flame', () => o.dryCopper('FLAME'), { blocked: w.dDry, tone: 'danger' })];
    }
  }
  if (task === 'RUST') {
    const r = s.rust;
    if (id.startsWith('tube:')) {
      const t = id.slice(5) as RustTube;
      const tw = r.tubes[t];
      const blocked = need(scene, 'testTubes') ?? w.tube;
      const fill: LabAction[] =
        t === 'A'
          ? [act('tap', 'A nail and tap water', () => (pour(), o.fillTube('A', 'TAP')), { blocked: blocked ?? (tw.content ? 'Tube A is set up.' : undefined), tone: 'brand', sfx: 'drip' })]
          : t === 'B'
            ? [
                act('boiled', 'A nail and the boiled water', () => (pour(), o.fillTube('B', 'BOILED')), { blocked: blocked ?? (tw.content ? 'Tube B is filled.' : undefined), tone: 'brand', sfx: 'drip' }),
                act('unboiled', 'A nail and unboiled distilled water', () => (pour(), o.fillUnboiled('B')), { blocked: blocked ?? (tw.content ? 'Tube B is filled.' : undefined), sfx: 'drip' }),
                act('oil', 'Pour a layer of oil on top', () => o.oil('B'), { blocked: blocked ?? (tw.oil ? 'It has oil on it.' : undefined), tone: tw.content && !tw.oil ? 'brand' : undefined, sfx: 'drip' }),
              ]
            : t === 'C'
              ? [act('cacl2', 'Anhydrous CaCl₂ and a nail', () => o.fillTube('C', 'CACL2'), { blocked: blocked ?? (tw.content ? 'Tube C is set up.' : undefined), tone: 'brand' }), act('stop', 'Stopper it tightly', () => o.stopper('C'), { blocked: need(scene, 'stoppers') ?? blocked ?? (tw.stopper ? 'It is stoppered.' : undefined), tone: tw.content && !tw.stopper ? 'brand' : undefined })]
              : [act('salt', 'A nail and salt water', () => (pour(), o.fillTube('D', 'SALT')), { blocked: blocked ?? (tw.content ? 'Tube D is set up.' : undefined), tone: 'brand', sfx: 'drip' })];
      return [...fill, ...(r.started ? [act('look', 'Look at the tubes', o.observe, { blocked: w.observe, tone: 'brand' })] : [])];
    }
    switch (id) {
      case 'sandpaper':
        return [act('sand', 'Clean the nails with sandpaper', () => (sand(), o.sandNails()), { blocked: w.nails, tone: 'brand', sfx: 'tick' })];
      case 'burner':
        return [act('boil', 'Boil some distilled water (then let it cool)', o.boilWater, { blocked: need(scene, 'burner'), tone: 'brand', sfx: 'success' })];
      case 'bottle:oil':
        return [act('oil', 'Pour a layer of oil on tube B', () => o.oil('B'), { blocked: w.tube, tone: 'brand', sfx: 'drip' })];
      case 'jar:cacl2':
        return [act('cacl2', 'Put anhydrous CaCl₂ and a nail in tube C', () => o.fillTube('C', 'CACL2'), { blocked: need(scene, 'testTubes') ?? w.tube, tone: 'brand' })];
      case 'bottle:salt':
        return [act('salt', 'Fill tube D: a nail and salt water', () => (pour(), o.fillTube('D', 'SALT')), { blocked: need(scene, 'testTubes') ?? w.tube, tone: 'brand', sfx: 'drip' })];
      case 'gradTube':
      case 'trough':
        return [
          act('moist', 'Moist iron wool into the tube (50.0 cm³ of air), inverted in the trough', () => o.setWool('MOIST'), { blocked: need(scene, 'gradTube', 'trough') ?? w.wool, tone: r.wool ? undefined : 'brand' }),
          act('dry', 'Dry iron wool into the tube', () => o.setWool('DRY'), { blocked: need(scene, 'gradTube', 'trough') ?? w.wool }),
          act('level', 'Raise or lower the tube: levels inside = outside', o.level, { blocked: r.wool ? undefined : 'Set up the iron wool first.' }),
          act('read', 'Read the volume of air', o.readVolume, { blocked: w.readVol, tone: r.wool ? 'brand' : undefined, sfx: 'tick' }),
          { key: 'eye', label: 'Look closely (eye level)', run: readView },
        ];
      case 'rack':
        return [
          act('start', 'Leave everything for the week', o.startWeek, { blocked: w.start, tone: 'brand', sfx: 'success' }),
          act('day', '+1 day', () => (r.started ? (x.skip(86_400_000), undefined) : 'Start the week first.')),
          act('look', 'Look at the tubes', o.observe, { blocked: w.observe }),
        ];
    }
  }
  return [];
}

function connectActions(ctx: ActionCtx): LabAction[] {
  const { x, scene } = ctx;
  const blocked = need(scene, 'voltameter', 'supply', 'ammeter', 'rheostat', 'key') ?? x.why.connect;
  return [
    act('neg', 'Into the beaker and connect: cathode to −, anode to +, plates apart', () => x.ops.connect('NEG', 'APART'), { blocked, tone: 'brand' }),
    act('pos', 'Connect with the cathode to + instead', () => x.ops.connect('POS', 'APART'), { blocked }),
    act('touch', 'Connect with the plates close together (touching)', () => x.ops.connect('NEG', 'TOUCH'), { blocked }),
  ];
}

const INFO: Record<string, (ctx: ActionCtx) => string | undefined> = {
  'bottle:cuso4': (c) => (c.x.task === 'DISP' ? `Copper(II) tetraoxosulphate(VI), ${c.x.v.disp.conc.toFixed(2)} mol dm⁻³. Harmful if swallowed.` : 'Copper(II) tetraoxosulphate(VI), 1.0 mol dm⁻³. Harmful if swallowed.'),
  'bottle:znso4': () => 'Zinc tetraoxosulphate(VI), 1.0 mol dm⁻³.',
  'bottle:propanone': () => 'Propanone (acetone): very flammable — no flames anywhere near it.',
  'dish:kno3': () => 'Saturated potassium trioxonitrate(V) for the salt bridge.',
  'jar:clean': () => 'Iron filings, freshly cleaned: bright grey.',
  'jar:rusty': () => 'Old iron filings with brown rust on them.',
  'bottle:oil': () => 'Cooking oil: floats on water and keeps air out.',
  'bottle:salt': () => 'Sodium chloride solution (salt water).',
  'jar:cacl2': () => 'Anhydrous calcium chloride: a drying agent.',
  ammeter: (c) => `Reads ${c.x.look.current.toFixed(2)} A (0.02 A divisions).`,
  stopwatch: (c) => `${fmtClock(c.x.look.run)}${c.s.elec.closed ? ' — running' : ''}.`,
  rheostat: (c) => `Slider at ${(c.s.elec.rheo * 0.25).toFixed(2)} Ω of 30 Ω.`,
  voltameter: (c) => (c.s.elec.connected ? `Cathode ${c.s.elec.cathodeTo === 'POS' ? 'on + (!)' : 'on −'}; plates ${c.s.elec.gap === 'TOUCH' ? 'TOUCHING' : 'apart'}. ${c.x.look.deposit > 0.02 ? 'Fresh pink copper on the cathode.' : ''}` : 'Blue CuSO₄ solution, 1.0 mol dm⁻³.'),
  voltmeter: (c) => (c.x.look.volts === null ? 'Not connected.' : `Reads ${c.x.look.volts.toFixed(2)} V.`),
  thermometer: (c) => (c.s.disp.thermo ? `${c.x.look.temp.toFixed(1)} °C` : 'On the bench.'),
  beaker: (c) => (c.s.disp.added ? `${Math.round(c.x.look.extent * 100)} % reacted.` : c.s.disp.cuso4 ? `${c.s.disp.cuso4} cm³ of blue CuSO₄.` : 'Empty.'),
  rack: (c) => (c.s.rust.started ? fmtDays(c.x.look.day) : 'Tubes A–D.'),
  gradTube: (c) => (c.s.rust.wool ? `Water level near ${c.x.look.volume.toFixed(1)} cm³; levels ${c.x.look.levelled ? 'equal' : 'not equal'}.` : 'Empty.'),
};
const TUBE_TEXT = { NONE: 'no rust', SLIGHT: 'a little rust', MUCH: 'rusty', HEAVY: 'very rusty' } as const;

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { x, s, scene } = ctx;
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return { title: APPARATUS_LABEL[a], info: 'In the apparatus cupboard.', actions: [act('take', 'Take to my bench', () => (x.note(`collect:${a}`), view().set({ selected: null }), notify(`${APPARATUS_LABEL[a]} is on your bench.`, 'success', 1600), undefined), { tone: 'brand' })] };
  }
  switch (id) {
    case 'coat':
      return { title: 'Lab coat', info: 'Wear a buttoned lab coat in the laboratory.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => (x.note('safety-off:coat'), undefined)) : act('on', 'Put on the lab coat', () => (x.note('safety:coat'), undefined), { tone: 'brand', sfx: 'success' })] };
    case 'goggles':
      return { title: 'Safety goggles', info: 'Protect your eyes the whole time.', actions: [scene.goggles ? act('off', 'Take off the goggles', () => (x.note('safety-off:goggles'), undefined)) : act('on', 'Put on the goggles', () => (x.note('safety:goggles'), undefined), { tone: 'brand', sfx: 'success' })] };
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => ctx.open('cupboard') }] };
    case 'mybench':
      return { title: 'Your bench', info: 'Bench 2: your reagents, the task card and your notebook.', actions: view().mode === 'walk' ? [{ key: 'sit', label: 'Work at my bench', tone: 'brand', run: () => view().set({ mode: 'bench', focus: 'bench', selected: null }) }] : [{ key: 'stand', label: 'Stand up and walk', run: () => view().set({ mode: 'walk', selected: null, held: null }) }] };
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your record, calculations and answers.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
    case 'shelf':
      return { title: 'Reagent shelf', info: 'Stock solutions. Your own reagents are on your bench.', actions: [] };
    case 'fume':
      return { title: 'Fume cupboard', info: 'Propanone is kept here, away from flames.', actions: [] };
    case 'extinguisher':
      return { title: 'Fire extinguisher', info: 'Know where it is before you use propanone or a burner.', actions: [] };
    case 'firstaid':
      return { title: 'First-aid box', info: 'Report every cut or burn to the teacher. Burns: cool under running water for 10 minutes.', actions: [] };
    case 'eyewash':
      return { title: 'Eye-wash station', info: 'Rinse splashed eyes for 10 minutes and tell the teacher.', actions: [] };
    case 'whiteboard':
    case 'desk':
      return { title: id === 'desk' ? 'Teacher’s desk' : 'Whiteboard', info: 'The hint bar shows the next step in practice mode.', actions: [] };
  }
  const actions = objectActions(id, ctx);
  const app = APPARATUS_LABEL[id as ApparatusId];
  const ret: LabAction[] = app ? [act('return', 'Put back in the cupboard', () => (x.note(`return:${id}`), view().set({ selected: null }), undefined))] : [];
  const title = app ?? LABELS[id] ?? null;
  if (!title) return null;
  const info = id.startsWith('tube:') && s.rust.started ? `Tube ${id.slice(5)}: ${TUBE_TEXT[rustLook(rustNow(x, s, id.slice(5) as RustTube))]} (${fmtDays(x.look.day)}).` : (INFO[id]?.(ctx) ?? (app && !NEEDED[x.task].includes(id as ApparatusId) ? 'Not needed for this practical.' : undefined));
  return { title, info, actions: [...actions, ...ret] };
}
export const LABELS: Record<string, string> = {
  'bottle:cuso4': 'Copper(II) sulphate solution',
  'bottle:znso4': 'Zinc sulphate solution',
  'bottle:propanone': 'Propanone',
  'dish:kno3': 'Saturated KNO₃',
  'beaker:zn': 'ZnSO₄ beaker',
  'beaker:cu': 'CuSO₄ beaker',
  'jar:clean': 'Clean iron filings',
  'jar:rusty': 'Rusty iron filings',
  'bottle:oil': 'Oil',
  'bottle:salt': 'Salt water',
  'jar:cacl2': 'Anhydrous calcium chloride',
  'tube:A': 'Tube A',
  'tube:B': 'Tube B',
  'tube:C': 'Tube C',
  'tube:D': 'Tube D',
  rack: 'Test-tube rack',
};

/** The dock's actions: the menu of the object the next step uses. */
export function dockActions(ctx: ActionCtx): { target: string | null; actions: LabAction[] } {
  const steps = guideSteps(ctx.s, ctx.scene, view().mode, ctx.x);
  const cur = steps.find((st) => !st.done && st.target && !['coat', 'goggles', 'cupboard', 'mybench', 'book'].includes(st.target));
  const target = cur?.target ?? null;
  return { target, actions: target ? objectActions(target, ctx).slice(0, 4) : [] };
}

/** The next step, for practice mode: the 3D steps first, then the shared hint. */
export function nextHint3d(s: ChemElectroState, scene: SceneState, x: Electro): string {
  if (!scene.coat || !scene.goggles) return 'Put on a lab coat and goggles: they hang on the hooks by the door.';
  if (!scene.ready) return `Collect from the apparatus cupboard (east wall): ${scene.missing.map((a) => APPARATUS_LABEL[a].toLowerCase()).join(', ')}.`;
  return nextHint(s, x);
}
