import { TITRATION_INDICATORS, TITRATION_INDICATOR_INFO, type ChemTitrationState, type TitrationIndicator, type TitrationRinse } from '@aischool/shared';
import { nextHint, type Titration } from '../actions';
import { APPARATUS, APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { notify, useLabView } from './store';

/**
 * What can be done with each object in the 3D lab. Every action is also a
 * button (no action is gesture-only); a disabled one says why. The marked
 * changes go through the shared titration actions, the 3D-only steps
 * (safety, collecting, clamping, the air bubble, the filler) through `note`.
 */

export interface LabAction {
  key: string;
  label: string;
  run: () => void;
  /** Why it can't be done now (shown instead of running). */
  blocked?: string;
  tone?: 'brand' | 'danger';
}
export interface ObjectPanel {
  title: string;
  info?: string;
  actions: LabAction[];
}
export interface ActionCtx {
  t: Titration;
  s: ChemTitrationState;
  scene: SceneState;
  /** Open the notebook / task card / reading view. */
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const RINSE_WITH: { liquid: TitrationRinse; label: string }[] = [
  { liquid: 'ACID', label: 'Rinse with A (acid)' },
  { liquid: 'BASE', label: 'Rinse with B (base)' },
  { liquid: 'WATER', label: 'Rinse with distilled water' },
];

const view = () => useLabView.getState();
const setView = (p: Parameters<ReturnType<typeof view>['set']>[0]) => view().set(p);

function returnAction(ctx: ActionCtx, id: ApparatusId): LabAction {
  const { s, scene, t } = ctx;
  const busy =
    (id === 'burette' && s.burette !== null) || (id === 'flask' && !!t.open) || (id === 'stand' && scene.clamped) || (id === 'funnel' && s.funnelIn) || (id === 'tile' && scene.flaskUnder) || (id === 'filler' && scene.fillerOn);
  return {
    key: 'return',
    label: 'Put back in the cupboard',
    blocked: busy ? 'It is in use on your bench.' : undefined,
    run: () => {
      if (view().held === id) setView({ held: null });
      t.note(`return:${id}`);
      setView({ selected: null });
    },
  };
}
function pickUp(id: ApparatusId): LabAction {
  const held = view().held;
  return held === id
    ? { key: 'put-down', label: 'Put it down', run: () => setView({ held: null }) }
    : { key: 'pick-up', label: 'Pick up', run: () => setView({ held: id }), blocked: held ? `You are holding the ${APPARATUS_LABEL[held].toLowerCase()}.` : undefined };
}

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { t, s, scene } = ctx;
  const open = t.open;
  const midRun = !!open && open.initial !== null;
  const held = view().held;

  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return {
      title: APPARATUS_LABEL[a],
      info: 'In the apparatus cupboard.',
      actions: [
        {
          key: 'take',
          label: 'Take to my bench',
          tone: 'brand',
          run: () => {
            t.note(`collect:${a}`);
            setView({ selected: null });
            notify(`${APPARATUS_LABEL[a]} is on your bench.`, 'success', 1600);
          },
        },
      ],
    };
  }
  if (id.startsWith('ind:')) {
    const i = id.slice(4) as TitrationIndicator;
    const info = TITRATION_INDICATOR_INFO[i];
    return {
      title: `${info.label} indicator`,
      info: `${info.label} is ${info.baseName} in alkali; at the end point it turns ${info.endName}.`,
      actions: open
        ? [
            {
              key: 'drops',
              label: `Add 2–3 drops to the flask`,
              tone: 'brand',
              blocked: open.indicator ? 'The flask already has indicator in it.' : undefined,
              run: () => {
                t.chooseIndicator(i);
                t.addIndicator();
              },
            },
          ]
        : [
            {
              key: 'choose',
              label: s.setup.indicator === i ? 'Chosen for this titration' : `Use ${info.label.toLowerCase()} for this titration`,
              blocked: s.setup.indicator === i ? 'Already chosen.' : undefined,
              run: () => t.chooseIndicator(i),
            },
          ],
    };
  }

  switch (id) {
    case 'coat':
      return {
        title: 'Lab coat',
        info: 'Wear a buttoned lab coat in the laboratory.',
        actions: [scene.coat ? { key: 'off', label: 'Take off the lab coat', run: () => t.note('safety-off:coat') } : { key: 'on', label: 'Put on the lab coat', tone: 'brand', run: () => wear(ctx, 'coat') }],
      };
    case 'goggles':
      return {
        title: 'Safety goggles',
        info: 'Acids and alkalis splash: protect your eyes.',
        actions: [scene.goggles ? { key: 'off', label: 'Take off the goggles', run: () => t.note('safety-off:goggles') } : { key: 'on', label: 'Put on the goggles', tone: 'brand', run: () => wear(ctx, 'goggles') }],
      };
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need for this titration.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => ctx.open('cupboard') }] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Bench 2: your reagents A and B, indicators, the task card and your notebook are here.',
        actions:
          view().mode === 'walk'
            ? [{ key: 'sit', label: 'Work at my bench', tone: 'brand', run: () => setView({ mode: 'bench', focus: 'bench', selected: null }) }]
            : [{ key: 'stand', label: 'Stand up and walk', run: () => setView({ mode: 'walk', selected: null, held: null }) }],
      };
    case 'shelf':
      return { title: 'Reagent shelf', info: 'Stock solutions. Your own A and B are already on your bench; you need nothing from here.', actions: [] };
    case 'fume':
      return { title: 'Fume cupboard', info: 'For concentrated acids and anything that gives off fumes. Dilute A and B can be used at your bench.', actions: [] };
    case 'extinguisher':
      return { title: 'Fire extinguisher', info: 'CO₂ extinguisher. Know where it is before you start.', actions: [] };
    case 'firstaid':
      return { title: 'First-aid box', info: 'Report every cut or burn to the teacher.', actions: [] };
    case 'eyewash':
      return { title: 'Eye-wash station', info: 'If anything splashes in your eyes, rinse them here with plenty of water for 10 minutes and tell the teacher.', actions: [] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: 'Today: volumetric analysis. Rough titration first, then accurate ones; record burette readings to 2 decimal places.', actions: [] };
    case 'desk':
      return { title: 'Teacher’s desk', info: 'Ask the teacher if you are unsure — the hint bar at the top shows the next step in practice mode.', actions: [] };
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table of burette readings, calculations and answers.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
    case 'bottleA':
      return { title: 'Solution A', info: t.v.given.A, actions: [] };
    case 'bottleB':
      return { title: 'Solution B', info: t.v.given.B, actions: [] };
    case 'washBottle':
      return { title: 'Wash bottle', info: 'Distilled water, for rinsing the conical flask.', actions: [returnAction(ctx, 'washBottle')] };
    case 'beaker':
      return { title: 'Beaker', info: 'For waste: run a little acid through the jet into it to clear air bubbles.', actions: [returnAction(ctx, 'beaker')] };
    case 'stand':
      return { title: 'Retort stand and clamp', info: scene.clamped ? 'The burette is clamped vertically.' : 'Clamp the burette in it, vertical.', actions: [returnAction(ctx, 'stand')] };
    case 'tile':
      return { title: 'White tile', info: 'Stand the flask on it: the colour change is easier to see.', actions: [returnAction(ctx, 'tile')] };
    case 'filler':
      return {
        title: 'Pipette filler',
        info: 'Never pipette by mouth.',
        actions: [
          { key: 'fit', label: 'Fit it on the pipette', tone: 'brand', blocked: !scene.collected.has('pipette') ? 'Get the pipette first.' : undefined, run: () => t.note('filler-on') },
          returnAction(ctx, 'filler'),
        ],
      };
    case 'funnel':
      return {
        title: 'Filter funnel',
        info: s.funnelIn ? 'Remove it before you take the initial reading: drips from it change the volume.' : 'Use it to fill the burette.',
        actions: s.funnelIn && scene.clamped
          ? [{ key: 'remove', label: 'Remove the funnel', tone: 'brand', run: t.removeFunnel }]
          : [
              {
                key: 'place',
                label: 'Place it in the burette',
                tone: 'brand',
                blocked: !scene.clamped ? 'Clamp the burette on the stand first.' : midRun ? 'Not in the middle of a titration.' : undefined,
                run: () => t.update((x) => ({ ...x, funnelIn: true }), 'place-funnel'),
              },
              returnAction(ctx, 'funnel'),
            ],
      };
    case 'burette':
    case 'tap':
      return buretteActions(ctx, held);
    case 'flask':
      return flaskActions(ctx);
    case 'pipette':
      return pipetteActions(ctx);
  }
  const extra = APPARATUS.find((a) => a.id === id);
  if (extra) return { title: extra.label, info: extra.needed ? undefined : 'Not needed for a titration.', actions: [returnAction(ctx, extra.id)] };
  return null;
}

function wear(ctx: ActionCtx, what: 'coat' | 'goggles') {
  ctx.t.note(`safety:${what}`);
  setView({ selected: null });
  notify(what === 'coat' ? 'Lab coat on.' : 'Goggles on.', 'success', 1400);
}

function buretteActions(ctx: ActionCtx, held: ApparatusId | null): ObjectPanel {
  const { t, s, scene } = ctx;
  const midRun = !!t.open && t.open.initial !== null;
  const actions: LabAction[] = [];
  if (!scene.clamped) {
    actions.push(pickUp('burette'));
    if (held === 'burette')
      actions.push({
        key: 'clamp',
        label: 'Attach to the clamp (vertical)',
        tone: 'brand',
        blocked: !scene.collected.has('stand') ? 'Get the retort stand and clamp from the cupboard.' : undefined,
        run: () => {
          t.note('clamp-burette');
          setView({ held: null, focus: 'burette' });
        },
      });
  }
  for (const r of RINSE_WITH)
    actions.push({
      key: `rinse-${r.liquid}`,
      label: r.label,
      blocked: midRun ? 'Not in the middle of a titration.' : undefined,
      run: () => {
        safetyNudge(ctx);
        t.rinse('burette', r.liquid);
        notify(`Burette rinsed with ${r.liquid === 'ACID' ? 'A' : r.liquid === 'BASE' ? 'B' : 'distilled water'} and drained.`, 'info', 1600);
      },
    });
  if (scene.clamped) {
    actions.push({
      key: 'fill',
      label: s.burette === null ? 'Fill with A through the funnel' : 'Refill with A near zero',
      tone: 'brand',
      blocked: !s.funnelIn ? 'Place the filter funnel in the top of the burette first.' : midRun ? 'Finish this titration first.' : undefined,
      run: () => {
        safetyNudge(ctx);
        t.fill();
      },
    });
    actions.push({
      key: 'jet',
      label: 'Run a little into the waste beaker (clear the air bubble)',
      blocked: s.burette === null ? 'Fill the burette first.' : !scene.bubble ? 'The jet is already full: no air bubble.' : !scene.collected.has('beaker') ? 'You need a beaker for the waste.' : scene.flaskUnder ? 'Take the flask off the tile first.' : undefined,
      run: () => t.note('clear-jet'),
    });
    actions.push({ key: 'read', label: 'Read the burette (eye level)', tone: 'brand', blocked: s.burette === null ? 'The burette is empty.' : undefined, run: () => setView({ mode: 'read', selected: null }) });
    actions.push({
      key: 'unclamp',
      label: 'Take it out of the clamp',
      blocked: s.burette !== null ? 'Not while it holds acid.' : s.funnelIn ? 'Remove the funnel first.' : undefined,
      run: () => t.note('unclamp-burette'),
    });
  }
  actions.push(returnAction(ctx, 'burette'));
  const reading = s.burette === null ? 'Empty.' : scene.bubble ? 'Filled with A. There is an air bubble in the jet.' : 'Filled with A. Read it at eye level.';
  return { title: '50 cm³ burette', info: `${scene.clamped ? 'Clamped on the stand. ' : ''}Rinsed with: ${s.setup.burette ? rinseName(s.setup.burette) : 'not yet'}. ${reading}`, actions };
}

function flaskActions(ctx: ActionCtx): ObjectPanel {
  const { t, s, scene } = ctx;
  const open = t.open;
  const actions: LabAction[] = [];
  if (!scene.flaskUnder) {
    actions.push(pickUp('flask'));
    actions.push({
      key: 'tile',
      label: 'Stand it on the white tile under the burette',
      tone: 'brand',
      blocked: !scene.collected.has('tile') ? 'Get the white tile from the cupboard.' : !scene.clamped ? 'Clamp the burette on the stand first.' : !open ? 'Pipette 25.0 cm³ of B into it first.' : undefined,
      run: () => {
        setView({ held: null, focus: 'flask' });
        t.note('flask-to-tile');
      },
    });
  } else actions.push({ key: 'off', label: 'Take it off the tile', blocked: view().streaming ? 'Close the tap first.' : undefined, run: () => t.note('flask-off-tile') });
  if (open) {
    actions.push({ key: 'swirl', label: 'Swirl the flask', run: () => swirl(t) });
    actions.push({ key: 'pour', label: 'Pour away and start again', tone: 'danger', run: t.pourAway });
  }
  for (const r of RINSE_WITH.filter((x) => x.liquid !== 'ACID').concat(RINSE_WITH.filter((x) => x.liquid === 'ACID')))
    actions.push({
      key: `rinse-${r.liquid}`,
      label: r.label,
      blocked: open ? 'Not while it holds B: pour it away first.' : undefined,
      run: () => {
        safetyNudge(ctx);
        t.rinse('flask', r.liquid);
        notify('Flask rinsed and drained.', 'info', 1400);
      },
    });
  actions.push(returnAction(ctx, 'flask'));
  const info = open ? `Holds 25.0 cm³ of B${open.indicator ? ` with ${TITRATION_INDICATOR_INFO[open.indicator].label.toLowerCase()}` : ', no indicator yet'}.` : `Empty. Rinsed with: ${s.setup.flask ? rinseName(s.setup.flask) : 'not yet'}.`;
  return { title: '250 cm³ conical flask', info, actions };
}

function pipetteActions(ctx: ActionCtx): ObjectPanel {
  const { t, s, scene } = ctx;
  const pip = view().pip;
  const kind = t.doneRuns === 0 ? 'ROUGH' : 'ACCURATE';
  const actions: LabAction[] = [];
  if (pip === 'idle') {
    for (const r of RINSE_WITH)
      actions.push({
        key: `rinse-${r.liquid}`,
        label: r.label,
        run: () => {
          safetyNudge(ctx);
          t.rinse('pipette', r.liquid);
          notify('Pipette rinsed and drained.', 'info', 1400);
        },
      });
    if (!scene.fillerOn) {
      actions.push({ key: 'filler', label: 'Fit the pipette filler', tone: 'brand', blocked: !scene.collected.has('filler') ? 'Get the pipette filler from the cupboard.' : undefined, run: () => t.note('filler-on') });
      actions.push({
        key: 'mouth',
        label: 'Suck B up by mouth',
        tone: 'danger',
        run: () => {
          t.note('mouth-pipetting-refused');
          notify('Never pipette by mouth: B is corrosive. Use the pipette filler.', 'danger');
        },
      });
    }
    actions.push({
      key: 'draw',
      label: `Draw B up to the mark (${kind === 'ROUGH' ? 'rough' : 'accurate'} titration)`,
      tone: 'brand',
      blocked: !scene.fillerOn ? 'Fit the pipette filler first — never by mouth.' : t.open ? 'The flask already holds B for this titration.' : !scene.collected.has('flask') ? 'Get a conical flask first.' : scene.flaskUnder ? 'Take the flask off the tile.' : undefined,
      run: () => {
        safetyNudge(ctx);
        setView({ pip: 'filled', pipRough: false, focus: 'pipetting' });
      },
    });
    if (t.doneRuns > 0 && !t.open)
      actions.push({
        key: 'draw-rough',
        label: 'Draw B up for another rough titration',
        blocked: !scene.fillerOn ? 'Fit the pipette filler first.' : !scene.collected.has('flask') ? 'Get a conical flask first.' : scene.flaskUnder ? 'Take the flask off the tile.' : undefined,
        run: () => setView({ pip: 'filled', pipRough: true, focus: 'pipetting' }),
      });
    if (scene.fillerOn) actions.push({ key: 'filler-off', label: 'Take the filler off', run: () => t.note('filler-off') });
    actions.push(returnAction(ctx, 'pipette'));
  } else if (pip === 'filled') {
    const rough = view().pipRough;
    actions.push({
      key: 'drain',
      label: 'Let it run into the conical flask',
      tone: 'brand',
      run: () => {
        t.pipette(rough || kind === 'ROUGH' ? 'ROUGH' : 'ACCURATE');
        setView({ pip: 'drained', selected: 'pipette' });
      },
    });
  } else {
    actions.push({
      key: 'touch',
      label: 'Touch the tip on the inside of the flask',
      tone: 'brand',
      run: () => {
        t.note('touch-tip');
        setView({ pip: 'idle', selected: null });
      },
    });
    actions.push({ key: 'skip', label: 'Put the pipette down', run: () => setView({ pip: 'idle', selected: null }) });
  }
  const info = pip === 'filled' ? '25.0 cm³ of B, the bottom of the meniscus on the mark.' : pip === 'drained' ? 'Drained. Do not blow out the last drop: touch the tip on the flask.' : `Rinsed with: ${s.setup.pipette ? rinseName(s.setup.pipette) : 'not yet'}.${scene.fillerOn ? ' Filler fitted.' : ''}`;
  return { title: '25.0 cm³ pipette', info, actions };
}

export function swirl(t: Titration) {
  t.swirl();
  setView({ swirlUntil: performance.now() + 900 });
}

let nudged = false;
function safetyNudge(ctx: ActionCtx) {
  if (nudged || (ctx.scene.coat && ctx.scene.goggles)) return;
  nudged = true;
  notify('Put on your lab coat and goggles (on the hooks by the door) before handling acids and alkalis.', 'warning', 4000);
}

const rinseName = (r: TitrationRinse) => ({ ACID: 'A (acid)', BASE: 'B (base)', WATER: 'distilled water', NONE: 'nothing' })[r];

/** The next step, for practice mode: the 3D steps first, then the shared hint. */
export function nextHint3d(s: ChemTitrationState, scene: SceneState, t: Titration): string {
  if (!scene.coat || !scene.goggles) return 'Put on a lab coat and goggles: they hang on the hooks by the door.';
  const missing = APPARATUS.filter((a) => a.needed && !scene.collected.has(a.id));
  if (missing.length) return `Collect from the apparatus cupboard (east wall): ${missing.map((a) => a.label.toLowerCase()).join(', ')}.`;
  if (!s.setup.burette) return 'Rinse the burette with the liquid it will hold.';
  if (!scene.clamped) return 'Pick up the burette and attach it to the clamp, vertical.';
  if (s.burette === null) return s.funnelIn ? 'Fill the burette with A through the funnel.' : 'Place the filter funnel in the burette, then fill it with A.';
  if (scene.bubble) return 'Run a little acid into the waste beaker to clear the air bubble from the jet.';
  const open = t.open;
  if (!s.setup.pipette) return 'Rinse the pipette with the liquid it will measure.';
  if (!scene.fillerOn) return 'Fit the pipette filler on the pipette.';
  if (!open && !s.setup.flask) return 'Rinse the conical flask.';
  if (open && open.indicator && !scene.flaskUnder) return 'Stand the flask on the white tile under the burette.';
  if (open && !open.indicator) return `Add two or three drops of a suitable indicator (${TITRATION_INDICATORS.length} on your bench).`;
  if (open && s.funnelIn && open.initial === null) return 'Remove the funnel, then read the burette at eye level and record the initial reading.';
  if (open && open.initial === null && !s.table[t.openIndex]?.initial.trim()) return 'Read the burette at eye level and write the initial reading in your notebook.';
  return nextHint(s, open);
}
