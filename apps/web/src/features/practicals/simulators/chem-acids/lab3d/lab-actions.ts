import { ACID_TUBE_LABEL, ACID_VOLS, HARD_BOILABLE, HARD_LABEL, IND_SOL_LABEL, PH_INFO, PH_LETTER, hardOpenRun, indOpenRun, type AcidTube, type ChemAcidsState, type HardSample, type IndSol, type PhSample } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { fmtClock, nextHint, type Acids } from '../actions';
import { useBench } from './bench-store';
import { guideSteps } from './guide';
import { APPARATUS_LABEL, NEEDED, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the acids bench, as each object's menu.
 * Every action is a button (the drags are extras); a blocked one says why.
 * Marked changes go through the shared actions; collecting and the goggles
 * are log notes.
 */

export type { LabAction, ObjectPanel };
export interface ActionCtx {
  x: Acids;
  s: ChemAcidsState;
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
      if (m) return notify(m, 'warning', 3600);
      play(o.sfx ?? 'clink');
      o.after?.();
    },
  };
}
const shake = (id: string) => useBench.setState({ shakeUntil: performance.now() + 1100, shakeId: id });
const pour = () => useBench.setState({ pourUntil: performance.now() + 900 });
const readView = () => view().set({ mode: 'read', selected: null });
const sampleName = (k: HardSample) => (k === 'TAP' ? 'tap water' : k === 'RAIN' ? 'rain water' : k === 'DIST' ? 'distilled water' : `sample ${k}`);

/** The actions for an object (the menu and the dock both use them). */
export function objectActions(id: string, ctx: ActionCtx): LabAction[] {
  const { x, s, scene } = ctx;
  const o = x.ops;
  const w = x.why;
  const task = x.task;
  if (task === 'PH') {
    const p = s.ph;
    if (id.startsWith('tube:') || id.startsWith('bottle:')) {
      const k = id.split(':')[1] as PhSample;
      const t = p.tubes[k];
      const L = PH_LETTER[k];
      const nt = need(scene, 'testTubes');
      return [
        act('pour', `Pour about 2 cm³ of sample ${L} into tube ${L}`, () => (pour(), o.pour(k, 'TWO')), { blocked: nt ?? w.pour(k), tone: !t.vol ? 'brand' : undefined, sfx: 'drip' }),
        act('drops', `Add 2 drops of universal indicator`, () => o.drops(k, 2), { blocked: need(scene, 'uiBottle') ?? w.drops(k), tone: t.vol && !t.drops ? 'brand' : undefined, sfx: 'drip' }),
        act('shake', 'Shake gently', () => (shake(`tube:${k}`), o.shake(k)), { blocked: w.shake(k), tone: t.drops && !t.shaken ? 'brand' : undefined, sfx: 'tick' }),
        act('compare', 'Hold it against the colour chart', () => o.compare(k), { blocked: need(scene, 'chart') ?? w.compare(k), tone: t.shaken && !t.compared ? 'brand' : undefined, after: readView }),
        act('fill', `Fill tube ${L} to the top instead`, () => (pour(), o.pour(k, 'FULL')), { blocked: nt ?? w.pour(k), sfx: 'drip' }),
        act('more', 'One more drop of indicator', () => o.drops(k, 1), { blocked: need(scene, 'uiBottle') ?? w.drops(k), sfx: 'drip' }),
      ];
    }
    switch (id) {
      case 'washBottle':
        return [act('rinse', 'Rinse all the test tubes with distilled water', o.rinseTubes, { blocked: need(scene, 'testTubes') ?? w.rinse, tone: 'brand', sfx: 'drip' })];
      case 'tile':
        return [act('tile', 'Stand the white tile behind the rack', o.tile, { blocked: w.tile, tone: 'brand' })];
      case 'chart':
      case 'rack':
        return [{ key: 'read', label: 'Compare the tubes with the chart (close up)', tone: 'brand', run: readView }];
      case 'uiBottle': {
        const k = (['HCL', 'ETH', 'LIME', 'COLA', 'WATER', 'BICARB', 'SOAP', 'ASH', 'NAOH'] as const).find((q) => p.tubes[q].vol && !p.tubes[q].drops);
        return k ? [act('drops', `2 drops into tube ${PH_LETTER[k]}`, () => o.drops(k, 2), { tone: 'brand', sfx: 'drip' })] : [act('none', 'Pour a sample into a tube first', () => 'Pour a sample into its tube first.')];
      }
    }
  }
  if (task === 'IND') {
    const i = s.ind;
    const run = indOpenRun(i);
    if (id.startsWith('sol:') || id.startsWith('bottle:')) {
      const k = id.split(':')[1] as IndSol;
      if (!IND_SOL_LABEL[k]) return [];
      return [
        act('ext', `A few drops of zobo extract into the ${IND_SOL_LABEL[k].toLowerCase()}`, () => o.testExtract(k), { blocked: need(scene, 'testTubes') ?? w.ext(k), tone: i.tests[k].ext ? undefined : 'brand', sfx: 'drip' }),
        act('ui', `Universal indicator into a second tube of ${IND_SOL_LABEL[k].toLowerCase()}`, () => o.testUi(k), { blocked: need(scene, 'testTubes', 'uiBottle') ?? w.ui(k), tone: i.tests[k].ext && !i.tests[k].ui ? 'brand' : undefined, sfx: 'drip' }),
      ];
    }
    switch (id) {
      case 'mortar':
        return [
          act('water', 'Crush with a little warm water (water bath)', () => (useBench.setState({ crushUntil: performance.now() + 1400 }), o.crush('WATER', 'BATH')), { blocked: need(scene, 'mortar', 'waterBath') ?? w.crush, tone: 'brand', sfx: 'tick' }),
          act('eth', 'Crush with ethanol, warmed in the water bath', () => (useBench.setState({ crushUntil: performance.now() + 1400 }), o.crush('ETHANOL', 'BATH')), { blocked: need(scene, 'mortar', 'waterBath') ?? w.crush, sfx: 'tick' }),
          act('flame', 'Warm the ethanol over the flame (quicker)', () => o.crush('ETHANOL', 'FLAME'), { blocked: need(scene, 'mortar') ?? w.crush, tone: 'danger' }),
          act('cold', 'Soak in cold water', () => o.crush('WATER', 'NONE'), { blocked: need(scene, 'mortar') ?? w.crush }),
        ];
      case 'waterBath':
        return [act('water', 'Crush the calyces with warm water from the bath', () => o.crush('WATER', 'BATH'), { blocked: need(scene, 'mortar') ?? w.crush, tone: 'brand' })];
      case 'funnel':
        return [act('filter', 'Filter the crushed calyces', () => (pour(), o.filterExtract()), { blocked: need(scene, 'funnel') ?? w.filterExt, tone: 'brand', sfx: 'drip' })];
      case 'burette':
      case 'tap':
        return run
          ? [
              act('drop', 'One drop (0.05 cm³)', () => o.addAcid(0.05), { blocked: w.add, tone: 'brand', sfx: 'drip' }),
              act('p1', '+0.10 cm³', () => o.addAcid(0.1), { blocked: w.add, sfx: 'drip' }),
              act('p5', '+0.50 cm³', () => o.addAcid(0.5), { blocked: w.add, sfx: 'drip' }),
              act('one', '+1.00 cm³', () => o.addAcid(1), { blocked: w.add, sfx: 'drip' }),
              ...fastActions(ctx),
              act('end', 'End point: close the tap and read the burette', o.endPoint, { blocked: w.endPoint, sfx: 'tick', after: readView }),
            ]
          : [
              act('rinse', 'Rinse with a little HCl', o.rinseBurette, { blocked: need(scene, 'burette', 'stand') ?? w.rinseBur, tone: i.burRinsed ? undefined : 'brand', sfx: 'drip' }),
              act('fill', i.burette === null ? 'Fill with the HCl' : 'Refill with the HCl', o.fillBurette, { blocked: need(scene, 'burette', 'stand') ?? w.fillBur, tone: i.burette === null ? 'brand' : undefined, sfx: 'drip' }),
              { key: 'read', label: 'Read it at eye level', run: readView },
            ];
      case 'pipette':
        return [act('rinse', 'Rinse the pipette with NaOH', o.rinsePipette, { blocked: need(scene, 'pipette') ?? w.rinsePip, tone: i.pipRinsed ? undefined : 'brand', sfx: 'drip' }), act('pip', '25.0 cm³ of NaOH into the flask', o.pipette, { blocked: need(scene, 'pipette', 'flask') ?? w.pipette, tone: i.pipRinsed ? 'brand' : undefined, sfx: 'drip' })];
      case 'ind:MO':
        return [act('mo', '3 drops of methyl orange into the flask', () => o.indicator('MO', 3), { blocked: w.indicator, tone: 'brand', sfx: 'drip' })];
      case 'ind:ZOBO':
        return [act('z', '3 drops of the zobo extract into the flask', () => o.indicator('ZOBO', 3), { blocked: !i.solvent ? 'Make the extract first.' : w.indicator, tone: 'brand', sfx: 'drip' }), act('zlot', 'A dropperful of extract', () => o.indicator('ZOBO', 40), { blocked: !i.solvent ? 'Make the extract first.' : w.indicator, sfx: 'drip' })];
      case 'flask':
        return run
          ? [act('drop', 'One drop, swirl', () => (shake('flask'), o.addAcid(0.05)), { blocked: w.add, tone: 'brand', sfx: 'drip' }), act('p5', '+0.50 cm³, swirl', () => (shake('flask'), o.addAcid(0.5)), { blocked: w.add, sfx: 'drip' }), act('one', '+1.00 cm³', () => o.addAcid(1), { blocked: w.add, sfx: 'drip' }), ...fastActions(ctx), act('end', 'End point: read the burette', o.endPoint, { blocked: w.endPoint, sfx: 'tick', after: readView })]
          : i.flask
            ? [act('mo', '3 drops of methyl orange', () => o.indicator('MO', 3), { blocked: w.indicator, tone: 'brand', sfx: 'drip' }), act('z', '3 drops of zobo extract', () => o.indicator('ZOBO', 3), { blocked: !i.solvent ? 'Make the extract first.' : w.indicator, sfx: 'drip' })]
            : [act('pip', 'Pipette 25.0 cm³ of NaOH into it', o.pipette, { blocked: need(scene, 'pipette') ?? w.pipette, tone: 'brand', sfx: 'drip' })];
    }
  }
  if (task === 'ACID') {
    const a = s.acid;
    if (id.startsWith('tube:')) {
      const k = id.slice(5) as AcidTube;
      const t = a.tubes[k];
      const nt = need(scene, 'testTubes');
      const out: LabAction[] = [act('acid', `Pour 2 cm³ of dilute HCl onto the ${ACID_TUBE_LABEL[k].toLowerCase()}`, () => (pour(), o.tubeAcid(k)), { blocked: nt ?? w.tubeAcid(k), tone: t.acid ? undefined : 'brand', sfx: 'drip' })];
      if (k === 'CUO') out.push(act('warm', 'Warm it gently over the burner', () => o.warm('GENTLE'), { blocked: need(scene, 'burner') ?? w.warm, tone: t.acid && !t.warmed ? 'brand' : undefined }), act('boil', 'Boil it hard', () => o.warm('STRONG'), { blocked: need(scene, 'burner') ?? w.warm, tone: 'danger' }));
      else
        out.push(
          act('burning', 'Burning splint at the mouth', () => (useBench.setState({ popAt: performance.now() }), o.gasTest(k, 'BURNING')), { blocked: need(scene, 'splints', 'burner') ?? w.test(k), tone: t.acid && (k === 'MG' || k === 'ZN') && !t.tests.includes('BURNING') ? 'brand' : undefined, sfx: k === 'MG' || k === 'ZN' ? 'success' : 'tick' }),
          act('lime', 'Pass the gas into limewater', () => o.gasTest(k, 'LIME'), { blocked: w.test(k), tone: t.acid && k === 'CACO3' && !t.tests.includes('LIME') ? 'brand' : undefined, sfx: 'drip' }),
          act('glowing', 'Glowing splint', () => o.gasTest(k, 'GLOWING'), { blocked: need(scene, 'splints') ?? w.test(k) }),
        );
      return out;
    }
    switch (id) {
      case 'burner':
        return [act('warm', 'Warm the CuO tube gently', () => o.warm('GENTLE'), { blocked: need(scene, 'burner') ?? w.warm, tone: 'brand' })];
      case 'splints':
        return (['MG', 'ZN', 'CU', 'CACO3'] as const).map((k) => act(`b${k}`, `Burning splint: ${k === 'CACO3' ? 'marble' : k} tube`, () => (useBench.setState({ popAt: performance.now() }), o.gasTest(k, 'BURNING')), { blocked: need(scene, 'burner', 'splints') ?? w.test(k), sfx: k === 'MG' || k === 'ZN' ? 'success' : 'tick' }));
      case 'limewater':
        return [act('lime', 'Pass the gas from the marble into limewater', () => o.gasTest('CACO3', 'LIME'), { blocked: w.test('CACO3'), tone: 'brand', sfx: 'drip' })];
      case 'balance':
        return [
          act('zero', 'Zero (tare) the balance', o.zero, { blocked: need(scene, 'balance') ?? w.zero, tone: a.zeroed || a.chips ? undefined : 'brand', sfx: 'tick' }),
          act('tap', 'Tap a marble chip onto the pan', o.tapChips, { blocked: need(scene, 'balance') ?? w.tapChips, tone: !a.flaskWeighed && x.look.chips < 1.8 ? 'brand' : undefined, sfx: 'tick' }),
          act('off', 'Take a chip off', o.untapChips, { blocked: w.untapChips, sfx: 'tick' }),
          act('flask', 'Weigh the flask with the acid and plug', o.weighFlask, { blocked: need(scene, 'flask') ?? w.weighFlask, tone: a.acidVol !== null && !a.flaskWeighed ? 'brand' : undefined, sfx: 'tick' }),
          act('read', `Read the balance now${a.added ? ` (${fmtClock(x.look.acidSec)})` : ''}`, o.weighTotal, { blocked: w.weighTotal, tone: a.added ? 'brand' : undefined, sfx: 'tick' }),
          { key: 'eye', label: 'Look closely', run: readView },
        ];
      case 'cylinder':
        return ACID_VOLS.map((vol) => act(`v${vol}`, `${vol} cm³ of HCl into the conical flask`, () => (pour(), o.measureAcid(vol)), { blocked: need(scene, 'cylinder', 'flask') ?? w.acidVol, tone: vol === 50 ? 'brand' : undefined, sfx: 'drip' }));
      case 'cotton':
        return [act('plug', 'Plug the flask with cotton wool', o.plug, { blocked: need(scene, 'cotton') ?? w.plug, tone: 'brand' })];
      case 'acidFlask':
        return [act('add', 'Tip in the marble chips; replace the plug', o.addChips, { blocked: w.addChips, tone: 'brand', sfx: 'drip' }), act('read', 'Weigh it now', o.weighTotal, { blocked: w.weighTotal, sfx: 'tick' })];
    }
  }
  if (task === 'HARD') {
    const h = s.hard;
    const run = hardOpenRun(h);
    if (id.startsWith('sample:')) {
      const k = id.slice(7) as HardSample;
      const out = [act('m', `50.0 cm³ of ${sampleName(k)} into the flask`, () => (pour(), o.measure(k, false)), { blocked: need(scene, 'cylinder', 'flask') ?? w.measure(k, false), tone: h.runs.some((r) => r.done && r.sample === k && !r.boiled) ? undefined : 'brand', sfx: 'drip' })];
      if (HARD_BOILABLE.includes(k)) out.push(act('mb', `50.0 cm³ of the BOILED ${sampleName(k)}`, () => (pour(), o.measure(k, true)), { blocked: need(scene, 'cylinder', 'flask') ?? w.measure(k, true), tone: h.boiled[k] && !h.runs.some((r) => r.done && r.sample === k && r.boiled) ? 'brand' : undefined, sfx: 'drip' }));
      out.push(act('r', `Pour ${sampleName(k)} in roughly`, () => o.measure(k, false, 'ROUGH'), { blocked: w.measure(k, false) }));
      return out;
    }
    switch (id) {
      case 'burette':
        return run
          ? [act('h', '+0.5 cm³ of soap', () => o.addSoap(0.5, 'SHAKE'), { blocked: w.soap, tone: 'brand', sfx: 'drip', after: () => shake('flask') }), act('big', '+2.0 cm³ at once', () => o.addSoap(2, 'SHAKE'), { blocked: w.soap, sfx: 'drip' }), { key: 'read', label: 'Read it at eye level', run: readView }]
          : [act('rinse', 'Rinse with a little soap solution', o.hRinse, { blocked: need(scene, 'burette', 'stand') ?? w.hRinse, tone: h.burRinsed ? undefined : 'brand', sfx: 'drip' }), act('fill', h.burette === null ? 'Fill with soap solution' : 'Refill', o.hFill, { blocked: need(scene, 'burette', 'stand') ?? w.hFill, tone: h.burette === null ? 'brand' : undefined, sfx: 'drip' }), { key: 'read', label: 'Read it at eye level', run: readView }];
      case 'flask':
        return run
          ? [
              act('shake', '+0.5 cm³ soap; stopper and shake', () => (shake('flask'), o.addSoap(0.5, 'SHAKE')), { blocked: w.soap, tone: x.look.lather === 'LASTING' ? undefined : 'brand', sfx: 'drip' }),
              act('watch', 'Leave it 2 minutes: does the lather last?', o.watch, { blocked: w.watch, tone: x.look.lather === 'LASTING' && !run.watched ? 'brand' : undefined, sfx: 'tick' }),
              act('end', 'Lasting lather: read the burette', o.finish, { blocked: w.finish, tone: run.watched ? 'brand' : undefined, sfx: 'tick', after: readView }),
              act('swirl', '+0.5 cm³; just swirl', () => o.addSoap(0.5, 'SWIRL'), { blocked: w.soap, sfx: 'drip' }),
            ]
          : [act('none', 'Measure a sample into it', () => 'Choose a sample bottle: 50.0 cm³ into the flask with the measuring cylinder.')];
      case 'boil':
        return HARD_BOILABLE.flatMap((k) => [act(`f${k}`, `Boil ${sampleName(k)} 5 min; cool, make up, filter`, () => o.boil(k, 'FULL'), { blocked: need(scene, 'burner', 'funnel') ?? w.boil(k), tone: k !== 'RAIN' && !h.boiled[k] ? 'brand' : undefined, sfx: 'success' })]).concat([act('sX', 'Boil sample X for 1 minute only', () => o.boil('X', 'SHORT'), { blocked: w.boil('X') }), act('nX', 'Boil X; skip making up the volume', () => o.boil('X', 'NOMAKEUP'), { blocked: w.boil('X') })]);
    }
  }
  return [];
}

function fastActions(ctx: ActionCtx): LabAction[] {
  const run = indOpenRun(ctx.s.ind);
  if (!run) return [];
  const last = [...ctx.s.ind.runs].reverse().find((r) => r.done && r.ind === run.ind) ?? [...ctx.s.ind.runs].reverse().find((r) => r.done);
  const to = last ? Math.round((last.added - 1 - run.added) * 10) / 10 : run.added < 15 ? Math.round((15 - run.added) * 10) / 10 : 0;
  return to > 0.05 ? [act('fast', last ? `Run in fast to 1 cm³ before ${last.added.toFixed(2)}` : 'Run in 15 cm³ quickly (rough)', () => ctx.x.ops.addAcid(to), { blocked: ctx.x.why.add, sfx: 'drip' })] : [];
}

const INFO: Record<string, (ctx: ActionCtx) => string | undefined> = {
  washBottle: () => 'Distilled water: for rinsing.',
  uiBottle: () => 'Universal indicator: a mixture of indicators, a different colour at each pH.',
  chart: () => 'The colour chart: red pH 0–2, orange 3–4, yellow 5–6, green 7, blue 8–10, indigo–violet 11–14.',
  tile: (c) => (c.s.ph.tile ? 'Behind the rack: the colours show clearly against white.' : 'A white background for comparing colours.'),
  mortar: (c) => (c.s.ind.solvent ? `Crushed with ${c.s.ind.solvent === 'ETHANOL' ? 'ethanol' : 'water'}.` : 'Dried zobo (hibiscus) calyces.'),
  funnel: (c) => (c.x.task === 'IND' ? (c.s.ind.filtered ? 'The deep-red filtrate is the indicator.' : 'Filter funnel and paper over a small beaker.') : 'Filter funnel and paper.'),
  burette: (c) => {
    const b = c.x.task === 'HARD' ? c.s.hard.burette : c.s.ind.burette;
    return b === null ? 'Empty.' : `Reading about ${b.toFixed(1)} cm³ — read it at eye level.`;
  },
  flask: (c) => {
    if (c.x.task === 'HARD') {
      const r = hardOpenRun(c.s.hard);
      return r ? `${HARD_LABEL[r.sample]}${r.boiled ? ' (boiled)' : ''}: ${r.added.toFixed(1)} cm³ of soap. ${c.x.look.lather === 'LASTING' ? 'Thick lather.' : c.x.look.lather === 'FROTH' ? 'A froth that soon breaks.' : c.x.look.scum ? 'White scum.' : 'No lather.'}` : 'Empty, with its stopper.';
    }
    const r = indOpenRun(c.s.ind);
    return r ? `${r.ind === 'MO' ? 'Methyl orange' : 'Zobo extract'}: ${r.added.toFixed(2)} cm³ of acid run in.` : c.s.ind.flask ? '25.0 cm³ of NaOH, no indicator yet.' : 'Empty.';
  },
  balance: (c) => `Reads ${c.x.look.balance.value.toFixed(2)} g${c.s.acid.zeroed ? '' : ' (not zeroed)'}.`,
  acidFlask: (c) => (c.s.acid.added ? `${Math.round(c.x.look.extent * 100)} % reacted · ${fmtClock(c.x.look.acidSec)}.` : c.s.acid.acidVol ? `${c.s.acid.acidVol} cm³ of HCl${c.s.acid.plug ? ', plugged' : ''}.` : 'Empty.'),
  boil: (c) => `Boiled: ${HARD_BOILABLE.filter((k) => c.s.hard.boiled[k]).map((k) => sampleName(k)).join(', ') || 'none yet'}.`,
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
      return { title: 'Fume cupboard', info: 'Flammable liquids are kept here, away from flames.', actions: [] };
    case 'extinguisher':
      return { title: 'Fire extinguisher', info: 'Know where it is before you light a burner.', actions: [] };
    case 'firstaid':
      return { title: 'First-aid box', info: 'Report every cut or burn to the teacher. Burns: cool under running water for 10 minutes.', actions: [] };
    case 'eyewash':
      return { title: 'Eye-wash station', info: 'Acid or alkali in the eye: rinse for 10 minutes and tell the teacher.', actions: [] };
    case 'whiteboard':
    case 'desk':
      return { title: id === 'desk' ? 'Teacher’s desk' : 'Whiteboard', info: 'The hint bar shows the next step in practice mode.', actions: [] };
  }
  const actions = objectActions(id, ctx);
  const app = APPARATUS_LABEL[id as ApparatusId];
  const ret: LabAction[] = app ? [act('return', 'Put back in the cupboard', () => (x.note(`return:${id}`), view().set({ selected: null }), undefined))] : [];
  const title = app ?? labelOf(id, x) ?? null;
  if (!title) return null;
  const info = INFO[id]?.(ctx) ?? infoOf(id, ctx) ?? (app && !NEEDED[x.task].includes(id as ApparatusId) ? 'Not needed for this practical.' : undefined);
  return { title, info, actions: [...actions, ...ret] };
}

/** Names of the bench's own things (bottles, tubes) for the menus and hover labels. */
export function labelOf(id: string, x: Acids): string | null {
  const [kind, k] = id.split(':') as [string, string | undefined];
  if (x.task === 'PH' && (kind === 'tube' || kind === 'bottle') && k) return `${kind === 'tube' ? 'Tube' : 'Sample'} ${PH_LETTER[k as PhSample]}: ${PH_INFO[k as PhSample].label}`;
  if (x.task === 'IND' && (kind === 'sol' || kind === 'bottle') && k && IND_SOL_LABEL[k as IndSol]) return IND_SOL_LABEL[k as IndSol];
  if (kind === 'ind') return k === 'MO' ? 'Methyl orange' : 'Zobo extract (your indicator)';
  if (x.task === 'ACID' && kind === 'tube' && k) return `Tube: ${ACID_TUBE_LABEL[k as AcidTube]}`;
  if (kind === 'sample' && k) return HARD_LABEL[k as HardSample];
  const L: Record<string, string> = { rack: 'Test-tube rack', tap: 'Burette tap', limewater: 'Limewater', acidFlask: 'Conical flask (marble + acid)', boil: 'Boiling the hard samples', 'titrant:hcl': 'Hydrochloric acid (burette acid)', 'titrant:naoh': 'Sodium hydroxide (for the pipette)', 'titrant:soap': 'Standard soap solution', 'bottle:hclA': 'Dilute HCl', 'bottle:lime': 'Limewater' };
  return L[id] ?? null;
}
function infoOf(id: string, ctx: ActionCtx): string | undefined {
  const { x, s } = ctx;
  const [kind, k] = id.split(':') as [string, string | undefined];
  if (x.task === 'PH' && kind === 'tube' && k) {
    const t = s.ph.tubes[k as PhSample];
    return !t.vol ? 'Empty, labelled.' : !t.drops ? 'Sample in; no indicator yet.' : `${t.drops} drops of indicator${t.shaken ? ', shaken' : ', not shaken'}.`;
  }
  if (x.task === 'ACID' && kind === 'tube' && k) {
    const t = s.acid.tubes[k as AcidTube];
    if (!t.acid) return 'No acid yet.';
    if (k === 'MG') return 'Vigorous effervescence; the ribbon gets smaller; the tube warms.';
    if (k === 'ZN') return 'Steady effervescence on the granules.';
    if (k === 'CU') return 'No bubbles: no change.';
    if (k === 'CUO') return t.warmed ? 'The black solid dissolves: a blue-green solution.' : 'Black powder under colourless acid: hardly any change cold.';
    return 'Brisk effervescence on the chips.';
  }
  if (kind === 'sample' && k) return x.task === 'HARD' && s.hard.boiled[k as HardSample] ? 'A boiled, cooled, made-up and filtered portion is ready too.' : 'In a labelled bottle.';
  if (kind === 'ind' && k === 'ZOBO') return s.ind.solvent ? 'Deep red.' : 'Not made yet.';
  return undefined;
}

/** The dock's actions: the menu of the object the next step uses. */
export function dockActions(ctx: ActionCtx): { target: string | null; actions: LabAction[] } {
  const steps = guideSteps(ctx.s, ctx.scene, view().mode, ctx.x);
  const cur = steps.find((st) => !st.done && st.target && !['coat', 'goggles', 'cupboard', 'mybench', 'book'].includes(st.target));
  const target = cur?.target ?? null;
  return { target, actions: target ? objectActions(target, ctx).slice(0, 5) : [] };
}

/** The next step, for practice mode: the 3D steps first, then the shared hint. */
export function nextHint3d(s: ChemAcidsState, scene: SceneState, x: Acids): string {
  if (!scene.coat || !scene.goggles) return 'Put on a lab coat and goggles: they hang on the hooks by the door.';
  if (!scene.ready) return `Collect from the apparatus cupboard (east wall): ${scene.missing.map((a) => APPARATUS_LABEL[a].toLowerCase()).join(', ')}.`;
  return nextHint(s, x);
}
