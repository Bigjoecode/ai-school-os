import { CHROM_DEPTHS, CHROM_DYE_INFO, CHROM_LINE_AT, PPT_AN_VOLS, PPT_CAT_VOLS, PPT_INFO, SOL_ACID_VOLS, mpDissolved, solRodResult, solFiltrate, type ChemSaltsState, type ChromLane, type ChromSolvent } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { nextHint, solView, type Flame, type Gauze, type Salts } from '../actions';
import { useBench } from './bench-store';
import { guideSteps } from './guide';
import { APPARATUS_LABEL, NEEDED, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the salts bench, as each object's menu.
 * Every action is a button (the drags are extras); a blocked one says why.
 * Marked changes go through the shared actions; collecting, the goggles,
 * the gauze and the burner are log notes.
 */

export type { LabAction, ObjectPanel };
export interface ActionCtx {
  x: Salts;
  s: ChemSaltsState;
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
      if (m) return notify(m, 'warning', 2800);
      play(o.sfx ?? 'clink');
      o.after?.();
    },
  };
}
const stir = () => useBench.setState({ stirUntil: performance.now() + 1200 });
const pour = () => useBench.setState({ pourUntil: performance.now() + 1000 });

function burnerActions(ctx: ActionCtx): LabAction[] {
  const { x, scene } = ctx;
  const f = x.bench.flame;
  const blocked = need(scene, 'burner', 'tripod');
  const set = (to: Flame, label: string, tone?: 'brand' | 'danger'): LabAction => act(`flame-${to}`, label, () => (x.note(`burner:${to}`), undefined), { blocked: f === to ? 'It is already like that.' : blocked, tone, sfx: to === 'OFF' ? 'tick' : 'success' });
  return [set('LOW', f === 'OFF' ? 'Light it: low flame' : 'Turn the flame low', 'brand'), set('HIGH', f === 'OFF' ? 'Light it: high flame' : 'Turn the flame high'), set('OFF', 'Turn it off')];
}
function gauzeAction(ctx: ActionCtx, item: Exclude<Gauze, null>, name: string): LabAction {
  const { x, scene } = ctx;
  const on = x.bench.gauze === item;
  return on
    ? act(`off-${item}`, `Take the ${name} off the gauze`, () => (x.note('gauze:none'), undefined))
    : act(`on-${item}`, `Stand the ${name} on the gauze`, () => (x.note(`gauze:${item}`), undefined), { blocked: need(scene, 'tripod') ?? (x.bench.gauze ? `Take the ${x.bench.gauze === 'oil' ? 'oil bath' : x.bench.gauze} off the gauze first.` : undefined), tone: 'brand', after: () => view().set({ focus: 'heat' }) });
}

/** The actions for an object (the menu and the dock both use them). */
export function objectActions(id: string, ctx: ActionCtx): LabAction[] {
  const { x, s, scene } = ctx;
  const o = x.ops;
  const w = x.why;
  const task = x.task;
  if (id === 'burner') return burnerActions(ctx);
  if (task === 'SOL') {
    switch (id) {
      case 'bottle:acid':
        return SOL_ACID_VOLS.map((v) => act(`acid-${v}`, `Measure ${v} cm³ into the beaker`, () => (pour(), o.measureAcid(v)), { blocked: need(scene, 'cylinder', 'beaker') ?? w.acid, tone: v === 50 ? 'brand' : undefined }));
      case 'jar:cuo':
        return [act('cuo', 'Add a spatula of CuO to the beaker', o.addCuO, { blocked: need(scene, 'spatula') ?? w.cuo, tone: 'brand' })];
      case 'beaker':
        return [gauzeAction(ctx, 'beaker', 'beaker'), act('stir', 'Stir with the glass rod', () => (stir(), o.stir()), { blocked: need(scene, 'rod') ?? w.stir }), act('filter', 'Filter off the excess CuO into the evaporating dish', o.filterExcess, { blocked: need(scene, 'funnel', 'dish') ?? w.filterExcess, tone: 'brand' })];
      case 'rod':
        return [act('rod', 'Dip it in the dish (crystallisation test)', () => {
          const m = o.rodTest();
          if (m) return m;
          const r = solRodResult(solFiltrate(x.v, x.ref.current.sol).n, x.ref.current.sol.rod.at(-1) ?? 999);
          notify(r === 'NONE' ? 'No crystals on the rod yet: keep heating.' : r === 'CRYSTALS' ? 'Small crystals form on the cold rod: the crystallisation point. Stop heating.' : r === 'CRUST' ? 'Crystals are already crusting in the hot dish!' : 'The dish is dry.', r === 'CRYSTALS' ? 'success' : 'info', 3200);
          return undefined;
        }, { blocked: w.rod, tone: 'brand' }), act('stir', 'Stir the beaker', () => (stir(), o.stir()), { blocked: w.stir })];
      case 'dish':
        return [gauzeAction(ctx, 'dish', 'evaporating dish'), act('filter-x', 'Filter off the crystals', o.filterCrystals, { blocked: need(scene, 'funnel') ?? w.filterCrystals, tone: 'brand' }), act('wash-cold', 'Wash with a little cold distilled water', () => o.washCrystals('COLD'), { blocked: w.wash }), act('wash-hot', 'Wash with hot water', () => o.washCrystals('HOT'), { blocked: w.wash }), act('dry-heat', 'Dry them by heating', () => o.dryCrystals('HEAT'), { blocked: w.dry, tone: 'danger' })];
      case 'washBottle':
        return [act('wash-cold', 'Wash the crystals with a little cold water', () => o.washCrystals('COLD'), { blocked: w.wash, tone: 'brand' })];
      case 'filterPaper':
        return [act('dry-paper', 'Press the crystals dry between filter papers', () => o.dryCrystals('PAPER'), { blocked: w.dry, tone: 'brand' })];
      case 'balance':
        return [act('weigh', 'Weigh the crystals', o.weighCrystals, { blocked: w.weigh, tone: 'brand', sfx: 'tick' })];
    }
  }
  if (task === 'PPT') {
    switch (id) {
      case 'bottle:cat':
        return PPT_CAT_VOLS.map((v) => act(`cat-${v}`, `Measure ${v} cm³ into the beaker`, () => (pour(), o.measureCat(v)), { blocked: need(scene, 'cylinder', 'beaker') ?? w.pptCat, tone: v === 25 ? 'brand' : undefined }));
      case 'bottle:an':
        return PPT_AN_VOLS.map((v) => act(`an-${v}`, `Add ${v} cm³ to the beaker`, () => (pour(), o.addAn(v)), { blocked: need(scene, 'cylinder', 'beaker') ?? w.pptAn, tone: v === 30 ? 'brand' : undefined }));
      case 'beaker':
      case 'rod':
        return [act('stir', 'Stir the mixture', () => (stir(), o.stirPpt()), { blocked: need(scene, 'rod') ?? w.pptStir, tone: 'brand' }), act('filter', 'Pour it through the filter paper', o.filterPpt, { blocked: need(scene, 'funnel') ?? w.pptFilter })];
      case 'funnel':
        return [act('filter', 'Pour the mixture through the paper', o.filterPpt, { blocked: w.pptFilter, tone: 'brand' }), act('rinse', 'Rinse the beaker into the funnel', o.rinseBeaker, { blocked: need(scene, 'washBottle') ?? w.pptRinse }), act('wash', 'Wash the precipitate with distilled water', o.washPpt, { blocked: need(scene, 'washBottle') ?? w.pptWash })];
      case 'washBottle':
        return [act('rinse', 'Rinse the beaker into the funnel', o.rinseBeaker, { blocked: w.pptRinse, tone: 'brand' }), act('wash', 'Wash the precipitate on the paper', o.washPpt, { blocked: w.pptWash })];
      case 'oven':
        return [act('dry', 'Dry the paper and precipitate in the oven (about 100 °C)', () => o.dryPpt(false), { blocked: w.pptDry, tone: 'brand', sfx: 'success' }), act('flame', 'Dry it quickly over a Bunsen flame instead', () => o.dryPpt(true), { blocked: w.pptDry, tone: 'danger' })];
      case 'balance':
        return [act('paper', 'Weigh a dry filter paper', o.weighPaper, { blocked: w.pptPaper, tone: s.ppt.paper ? undefined : 'brand', sfx: 'tick' }), act('weigh', 'Weigh the paper + precipitate', o.weighPpt, { blocked: w.pptWeigh, tone: s.ppt.paper ? 'brand' : undefined, sfx: 'tick' })];
    }
  }
  if (task === 'CHROM') {
    const at = useBench.getState().lineAt;
    if (id.startsWith('vial:')) {
      const lane = id.slice(5) as ChromLane;
      return [act('spot', `Spot ${lane === 'INK' ? 'the ink' : `dye ${lane}`} on the baseline (capillary)`, () => (useBench.setState({ spotAt: performance.now() }), o.spot(lane)), { blocked: need(scene, 'capillary', 'paper') ?? w.spot, tone: 'brand', sfx: 'drip' })];
    }
    if (id.startsWith('solvent:')) {
      const solvent = id.slice(8) as ChromSolvent;
      return CHROM_DEPTHS.map((d) => act(`pour-${d}`, `Pour ${solvent === 'WATER' ? 'water' : 'ethanol'} into the tank, ${d} cm deep`, () => (pour(), o.pourSolvent(solvent, d)), { blocked: need(scene, 'tank') ?? w.solvent, tone: d === 1 ? 'brand' : undefined, sfx: 'drip' }));
    }
    switch (id) {
      case 'pencil':
        return CHROM_LINE_AT.map((h) => act(`line-${h}`, `Draw the baseline ${h} cm from the bottom`, () => (useBench.setState({ lineAt: h }), o.drawLine('PENCIL', h)), { blocked: need(scene, 'paper', 'ruler') ?? w.line, tone: h === 1.5 ? 'brand' : undefined, sfx: 'tick' }));
      case 'pen':
        return [act('line-ink', `Draw the baseline ${at} cm up with the ink pen`, () => o.drawLine('INK', at), { blocked: need(scene, 'paper', 'ruler') ?? w.line, sfx: 'tick' })];
      case 'paper':
        return [
          act('dry-spots', 'Let the spots dry', o.drySpots, { blocked: w.spot ?? (s.chrom.spots.every((p) => p.dry) ? 'The spots are dry.' : undefined) }),
          act('place', 'Stand it in the tank (baseline at the bottom)', o.placePaper, { blocked: need(scene, 'tank') ?? w.place, tone: 'brand' }),
          act('mark', 'Mark the solvent front with a pencil', o.markFront, { blocked: w.mark, tone: 'brand' }),
          act('dry', 'Let the paper dry', o.dryPaper, { blocked: w.dryPaper }),
          { key: 'read', label: 'Measure it with the ruler', blocked: s.chrom.developed === null ? 'Run the chromatogram first.' : undefined, run: () => view().set({ mode: 'read', selected: null }) },
        ];
      case 'tank':
        return [
          act('place', 'Stand the paper in the tank', o.placePaper, { blocked: w.place, tone: 'brand' }),
          act('lid', s.chrom.covered ? 'Take the lid off' : 'Put the lid on', () => o.cover(!s.chrom.covered), { tone: s.chrom.covered ? undefined : 'brand' }),
          act('remove', 'Take the paper out', o.removePaper, { blocked: w.remove, tone: 'brand' }),
        ];
      case 'ruler':
        return [{ key: 'read', label: 'Measure the chromatogram', tone: 'brand', blocked: s.chrom.developed === null ? 'Run the chromatogram first.' : undefined, run: () => view().set({ mode: 'read', selected: null }) }];
    }
  }
  if (task === 'MP') {
    const open = x.openRun();
    switch (id) {
      case 'jar:benzoic':
      case 'balance':
        return [act('weigh-i', 'Weigh the impure benzoic acid', o.weighImpure, { blocked: need(scene, 'balance') ?? (s.mp.weighedImpure ? 'Already weighed.' : undefined), tone: s.mp.weighedImpure ? undefined : 'brand', sfx: 'tick' }), act('weigh-p', 'Weigh the recrystallised crystals', o.weighPure, { blocked: w.mpWeigh, sfx: 'tick' })];
      case 'beaker':
        return [gauzeAction(ctx, 'beaker', 'beaker'), act('water', 'Add 10 cm³ of boiling water', () => (pour(), o.addWater()), { blocked: w.mpWater, tone: 'brand', sfx: 'drip' }), act('stir', 'Stir with the glass rod', () => (stir(), undefined))];
      case 'hotWater':
        return [act('water', 'Add 10 cm³ of boiling water to the beaker', () => (pour(), o.addWater()), { blocked: need(scene, 'beaker') ?? w.mpWater, tone: 'brand', sfx: 'drip' })];
      case 'funnel':
        return [
          act('warm', 'Warm the funnel (pour boiling water through it)', o.warmFunnel, { blocked: w.mpFunnel }),
          act('filter', 'Filter the hot solution', o.hotFilter, { blocked: w.mpFilter, tone: 'brand' }),
          act('slow', 'Leave the filtrate to cool slowly', () => o.cool('SLOW'), { blocked: w.mpCool }),
          act('fast', 'Plunge it straight into ice', () => o.cool('FAST'), { blocked: w.mpCool }),
          act('collect', 'Filter off the crystals', o.collect, { blocked: w.mpCollect }),
        ];
      case 'iceBath':
        return [act('ice', 'Stand the flask in the ice bath', o.ice, { blocked: need(scene, 'iceBath') ?? w.mpIce, tone: 'brand' })];
      case 'washBottle':
        return [act('wash', 'Wash the crystals with a little ice-cold water', o.washMp, { blocked: w.mpWash, tone: 'brand' })];
      case 'filterPaper':
        return [act('dry', 'Dry the crystals between filter papers', o.dryMp, { blocked: w.mpDry, tone: 'brand' })];
      case 'capillary':
        return [
          act('pack-i', 'Pack a tube with the impure sample', () => o.pack('IMPURE'), { blocked: need(scene, 'thermometer', 'oilBath') ?? w.pack, tone: 'brand' }),
          act('pack-p', 'Pack a tube with the recrystallised sample', () => o.pack('PURE'), { blocked: need(scene, 'thermometer', 'oilBath') ?? w.pack ?? w.packPure }),
          act('attach', 'Fasten it to the thermometer, level with the bulb', o.attach, { blocked: w.attach, tone: 'brand' }),
        ];
      case 'oilBath':
        return [
          gauzeAction(ctx, 'oil', 'oil bath'),
          act('start', 'Melting starts: read the thermometer', o.recordStart, { blocked: w.start, tone: 'brand', sfx: 'tick' }),
          act('end', 'All melted: read the thermometer', o.recordEnd, { blocked: w.end, tone: 'brand', sfx: 'tick' }),
          { key: 'read', label: 'Look closely (eye level)', run: () => view().set({ mode: 'read', selected: null }) },
          ...(open ? [act('discard', 'Discard this capillary', o.discardRun)] : []),
        ];
    }
  }
  return [];
}

const INFO: Record<string, (ctx: ActionCtx) => string | undefined> = {
  'bottle:acid': (c) => `Dilute H₂SO₄, ${c.x.v.sol.acidConc.toFixed(2)} mol dm⁻³. Corrosive: goggles on.`,
  'jar:cuo': () => 'Copper(II) oxide, a black powder (an insoluble base).',
  'bottle:cat': (c) => `${PPT_INFO[c.x.v.ppt.pair].cation.name} (${PPT_INFO[c.x.v.ppt.pair].cation.formula}), ${c.x.v.ppt.catConc.toFixed(2)} mol dm⁻³.`,
  'bottle:an': (c) => `${PPT_INFO[c.x.v.ppt.pair].anion.name} (${PPT_INFO[c.x.v.ppt.pair].anion.formula}), ${c.x.v.ppt.anConc.toFixed(2)} mol dm⁻³.`,
  'vial:INK': () => 'Black ink: a mixture of dyes.',
  'vial:A': (c) => `Pure dye A (${CHROM_DYE_INFO[c.x.v.chrom.A].name}).`,
  'vial:B': (c) => `Pure dye B (${CHROM_DYE_INFO[c.x.v.chrom.B].name}).`,
  'solvent:ETHANOL': () => 'Ethanol is flammable: no flames nearby.',
  'jar:benzoic': (c) => `Impure benzoic acid (with sand, charcoal and a soluble impurity), about ${c.x.v.mp.impure.toFixed(1)} g.`,
  hotWater: () => 'Boiling water from the kettle. Pour carefully.',
  oilBath: (c) => `Liquid paraffin in a beaker: ${c.x.look.bathT.toFixed(1)} °C. Hot oil causes severe burns.`,
  burner: (c) => `Flame: ${c.x.bench.flame.toLowerCase()}.`,
  beaker: (c) => (c.x.task === 'SOL' ? (c.s.sol.acid === null ? 'Empty.' : `${c.s.sol.acid} cm³ acid at ${Math.round(c.x.look.acidT)} °C. ${solView(c.x, c.s).excess ? 'Black solid remains: excess base.' : ''}`) : c.x.task === 'MP' ? (mpDissolved(c.x.v, c.s.mp) ? 'Dissolved; the sand and charcoal remain.' : `${c.s.mp.water} cm³ water; white solid undissolved.`) : undefined),
  dish: (c) => (c.s.sol.dry ? 'Dry: white powder.' : c.s.sol.filtered ? `${c.x.look.dishW.toFixed(1)} g of water, ${Math.round(c.x.look.dishT)} °C.` : 'Empty.'),
  tank: (c) => (c.s.chrom.solvent ? `${c.s.chrom.solvent === 'WATER' ? 'Water' : 'Ethanol'}, ${c.s.chrom.depth} cm deep. Lid ${c.s.chrom.covered ? 'on' : 'off'}.` : 'Empty.'),
};

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { x, scene } = ctx;
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
      return { title: 'Fume cupboard', info: 'For concentrated acids and fumes.', actions: [] };
    case 'extinguisher':
      return { title: 'Fire extinguisher', info: 'Know where it is before you light a burner or open the ethanol.', actions: [] };
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
  return { title, info: INFO[id]?.(ctx) ?? (app && !NEEDED[x.task].includes(id as ApparatusId) ? 'Not needed for this practical.' : undefined), actions: [...actions, ...ret] };
}
export const LABELS: Record<string, string> = {
  'bottle:acid': 'Dilute H₂SO₄',
  'jar:cuo': 'Copper(II) oxide',
  'bottle:cat': 'First solution',
  'bottle:an': 'Second solution',
  'vial:INK': 'Black ink',
  'vial:A': 'Pure dye A',
  'vial:B': 'Pure dye B',
  'solvent:WATER': 'Water (solvent)',
  'solvent:ETHANOL': 'Ethanol (solvent)',
  pencil: 'Pencil',
  pen: 'Ink pen',
  'jar:benzoic': 'Impure benzoic acid',
  hotWater: 'Boiling water (kettle)',
};

/** The dock's actions: the menu of the object the next step uses. */
export function dockActions(ctx: ActionCtx): { target: string | null; actions: LabAction[] } {
  const steps = guideSteps(ctx.s, ctx.scene, view().mode, ctx.x);
  const cur = steps.find((st) => !st.done && st.target && !['coat', 'goggles', 'cupboard', 'mybench', 'book'].includes(st.target));
  const target = cur?.target ?? null;
  return { target, actions: target ? objectActions(target, ctx).slice(0, 4) : [] };
}

/** The next step, for practice mode: the 3D steps first, then the shared hint. */
export function nextHint3d(s: ChemSaltsState, scene: SceneState, x: Salts): string {
  if (!scene.coat || !scene.goggles) return 'Put on a lab coat and goggles: they hang on the hooks by the door.';
  if (!scene.ready) return `Collect from the apparatus cupboard (east wall): ${scene.missing.map((a) => APPARATUS_LABEL[a].toLowerCase()).join(', ')}.`;
  return nextHint(s, x);
}
