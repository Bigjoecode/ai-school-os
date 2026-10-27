import { MICRO_MEDIUM_LABELS, MICRO_OBJECTIVES, microBrightness, type BioMicroscopeState, type MicroMedium, type MicroObjective } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { bioRoomPanel } from '../../bio-common/lab3d/common';
import { nextHint, placeSlide, type Microscope } from '../actions';
import { APPARATUS_LABEL, DISTRACTORS, SPECIMEN_STEP, needed, type ApparatusId, type SceneState } from './scene-state';
import { useBench } from './spots';

/**
 * What can be done with each object on the microscope bench. Every action is
 * a button (drags are extras); a blocked one says why. Marked changes go
 * through the shared microscope actions (the 2D lab's), the 3D-only steps
 * (coat, collecting, the specimen, blotting, cleaning, disposal, hand
 * washing) through `note`.
 */

export interface ActionCtx {
  m: Microscope;
  s: BioMicroscopeState;
  scene: SceneState;
  open: (w: 'notebook' | 'task' | 'cupboard') => void;
  /** Look through the eyepiece. */
  look: () => void;
}
const view = () => useLabView.getState();
const setView = (p: Parameters<ReturnType<typeof view>['set']>[0]) => view().set(p);

/** Coarse 0–100 (0.5 steps), fine −2…2 (0.02 steps), as in the 2D lab's sliders. */
export const clampCoarse = (x: number) => Math.round(Math.max(0, Math.min(100, x)) / 0.5) * 0.5;
export const clampFine = (x: number) => Math.round(Math.max(-2, Math.min(2, x)) / 0.02) * 0.02;
export const clampPct = (x: number) => Math.round(Math.max(0, Math.min(100, x)));

export function scopeActions(m: Microscope, s: BioMicroscopeState) {
  const sc = s.scope;
  return {
    objective: (o: MicroObjective) => {
      if (o === sc.objective) return;
      play('clink');
      m.setScope({ objective: o }, 'objective', `objective:${o}`);
    },
    coarse: (d: number) => m.setScope({ coarse: clampCoarse(m.ref.current.scope.coarse + d) }, 'coarse'),
    fine: (d: number) => m.setScope({ fine: clampFine(m.ref.current.scope.fine + d) }, 'fine'),
    diaphragm: (d: number) => m.setScope({ diaphragm: clampPct(m.ref.current.scope.diaphragm + d) }, 'light'),
    lamp: (d: number) => m.setScope({ lamp: clampPct(m.ref.current.scope.lamp + d) }, 'light'),
  };
}

function returnAction(ctx: ActionCtx, id: ApparatusId): LabAction {
  const busy = id === 'microscope' && ctx.scene.slide === 'stage' ? 'The slide is on its stage.' : id === 'slides' && ctx.scene.slide === 'tile' ? 'Your slide is out on the tile.' : undefined;
  return {
    key: 'return',
    label: 'Put back in the cupboard',
    blocked: busy,
    run: () => {
      ctx.m.note(`return:${id}`);
      setView({ selected: null });
    },
  };
}

/** The steps on the slide itself, in order: specimen, cover slip, blot, onto the stage. */
function slideSteps(ctx: ActionCtx): LabAction[] {
  const { m, s, scene } = ctx;
  const p = s.prep;
  const out: LabAction[] = [];
  if (!p.medium)
    out.push({ key: 'dry', label: 'Mount it dry (no liquid)', run: () => m.update((x) => ({ ...x, prep: { ...x.prep, medium: 'NONE' } }), 'medium:NONE') });
  if (!scene.specimen) out.push(specimenAction(ctx));
  if (!p.coverslip) {
    const why = !p.medium ? 'First put a drop of liquid on the slide (or mount it dry).' : !scene.specimen ? 'Put the specimen on the slide first.' : !scene.collected.has('needle') ? 'Get the mounted needle from the cupboard.' : undefined;
    out.push(
      {
        key: 'angle',
        label: 'Hold to lower the cover slip at an angle with the needle',
        tone: 'brand',
        hold: true,
        blocked: why,
        run: () => {
          useBench.setState({ lowering: 0 });
          m.update((x) => ({ ...x, prep: { ...x.prep, coverslip: 'ANGLE' } }), 'coverslip:angle');
          notify('The cover slip pushed the air out ahead of it: no bubbles.', 'success', 2000);
        },
      },
      { key: 'drop', label: 'Drop the cover slip flat on top', blocked: !p.medium ? 'First put a drop of liquid on the slide (or mount it dry).' : !scene.specimen ? 'Put the specimen on the slide first.' : undefined, run: () => (play('clink'), m.update((x) => ({ ...x, prep: { ...x.prep, coverslip: 'DROP' } }), 'coverslip:drop')) },
    );
  } else {
    if (!scene.blotted && p.medium !== 'NONE')
      out.push({ key: 'blot', label: 'Blot off the extra liquid', blocked: !scene.collected.has('filter') ? 'Get filter (blotting) paper from the cupboard.' : undefined, run: () => (m.note('blot'), notify('Excess liquid blotted off at the edge of the cover slip.', 'info', 1600)) });
    out.push({
      key: 'stage',
      label: 'Place it on the stage and clip it',
      tone: 'brand',
      blocked: !scene.collected.has('microscope') ? 'Get a microscope from the cupboard first.' : undefined,
      run: () => {
        play('clink');
        m.update(placeSlide, 'place-slide');
        setView({ selected: null, focus: 'stage' });
      },
    });
  }
  return out;
}

function specimenAction(ctx: ActionCtx): LabAction {
  const { m, s, scene } = ctx;
  const step = SPECIMEN_STEP[s.slide!];
  const why = scene.slide !== 'tile' ? 'Take a clean slide out first.' : !s.prep.medium && s.slide !== 'POND' ? 'Put a drop of liquid on the slide first (or mount it dry).' : step.tool && !scene.collected.has(step.tool) ? `Get the ${APPARATUS_LABEL[step.tool].toLowerCase()} from the cupboard.` : undefined;
  return {
    key: 'specimen',
    label: step.action,
    tone: 'brand',
    blocked: why,
    run: () => {
      m.note('specimen-on');
      notify(step.done, 'success', 2600);
    },
  };
}

function stainPanel(ctx: ActionCtx, medium: Exclude<MicroMedium, 'NONE'>): ObjectPanel {
  const { m, s, scene } = ctx;
  const p = s.prep;
  const blocked = scene.slide !== 'tile' ? (scene.slide === 'none' ? 'Take a clean slide out onto the tile first.' : 'The slide is already made.') : p.coverslip ? 'The cover slip is on: it is too late to change the liquid.' : p.medium === medium ? 'There is already a drop of it on the slide.' : undefined;
  return {
    title: MICRO_MEDIUM_LABELS[medium],
    info: STAIN_INFO[medium],
    actions: [
      {
        key: 'drop',
        label: p.medium && p.medium !== medium ? 'Use this instead (wipe the slide, fresh drop)' : 'Put a drop on the slide',
        tone: 'brand',
        blocked,
        run: () => {
          play('drip');
          useBench.setState({ dropAt: performance.now() });
          m.update((x) => ({ ...x, prep: { ...x.prep, medium } }), `medium:${medium}`);
        },
      },
    ],
  };
}
export const STAIN_INFO: Record<MicroMedium, string> = {
  WATER: 'Keeps living specimens alive and moist; stains nothing.',
  NONE: 'Mounting dry: nothing under the cover slip.',
  IODINE: 'Stains nuclei and starch yellow-brown (plant cells).',
  METHYLENE_BLUE: 'Stains nuclei of animal cells blue.',
  SALT: 'Concentrated salt solution: water leaves the cells by osmosis.',
  SAFRANIN: 'Stains lignified tissue (xylem) red.',
};

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { m, s, scene } = ctx;
  const sc = s.scope;
  const act = scopeActions(m, s);
  const room = bioRoomPanel(id, { coat: scene.coat, goggles: scene.goggles, note: m.note, open: ctx.open, benchInfo: 'Bench 2: your stains, the specimen, the task card and your notebook are here.', whiteboard: 'Today: the light microscope. Low power first; at ×40 use only the fine focus.' });
  if (room) return room;
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return {
      title: APPARATUS_LABEL[a],
      info: a === 'microscope' ? 'Carry it with one hand under the base and the other on the arm.' : 'In the cupboard.',
      actions: [
        {
          key: 'take',
          label: 'Take to my bench',
          tone: 'brand',
          run: () => {
            m.note(`collect:${a}`);
            play('clink');
            setView({ selected: null });
            notify(`${APPARATUS_LABEL[a]} is on your bench.`, 'success', 1600);
          },
        },
      ],
    };
  }
  if (id.startsWith('stain:')) return stainPanel(ctx, id.slice(6) as Exclude<MicroMedium, 'NONE'>);
  const total = m.v ? m.v.eyepiece * sc.objective : sc.objective * 10;
  const objectiveButtons: LabAction[] = MICRO_OBJECTIVES.map((o) => ({ key: `o${o}`, label: `×${o}${sc.objective === o ? ' (in place)' : ''}`, tone: sc.objective === o ? undefined : 'brand', blocked: sc.objective === o ? 'Already in place.' : undefined, run: () => act.objective(o) }));
  switch (id) {
    case 'scope':
    case 'eyepiece':
      return {
        title: 'Microscope',
        info: `×${sc.objective} objective in place · total ×${total}. Lamp ${sc.lamp}% · diaphragm ${sc.diaphragm}% open.`,
        actions: [
          { key: 'look', label: 'Look through the eyepiece', tone: 'brand', run: ctx.look },
          ...(id === 'scope' ? [{ key: 'clean', label: 'Clean the lenses with lens tissue', blocked: !scene.collected.has('lensTissue') ? 'Get lens tissue from the cupboard.' : undefined, run: () => (m.note('clean-lens'), notify('Eyepiece and objectives wiped with lens tissue.', 'info', 1600)) }, returnAction(ctx, 'microscope')] : []),
        ],
      };
    case 'turret':
      return { title: 'Revolving nosepiece', info: `Turn it until an objective clicks into place: red ×4, yellow ×10, blue ×40. Now ×${sc.objective}.`, actions: objectiveButtons };
    case 'coarse':
      return {
        title: 'Coarse focus knob',
        info: sc.objective === 40 ? 'Not at high power! At ×40 use only the fine focus.' : 'Moves the stage a long way: for finding the image at low power.',
        actions: [
          { key: 'up5', label: 'Raise the stage ↑↑', run: () => act.coarse(5) },
          { key: 'up', label: '↑', run: () => act.coarse(0.5) },
          { key: 'down', label: '↓', run: () => act.coarse(-0.5) },
          { key: 'down5', label: 'Lower the stage ↓↓', run: () => act.coarse(-5) },
        ],
      };
    case 'fine':
      return {
        title: 'Fine focus knob',
        info: 'Moves the stage a tiny distance: for a sharp image, and the only focus to use at ×40.',
        actions: [
          { key: 'up2', label: 'Up ↑↑', run: () => act.fine(0.2) },
          { key: 'up', label: '↑', run: () => act.fine(0.02) },
          { key: 'down', label: '↓', run: () => act.fine(-0.02) },
          { key: 'down2', label: 'Down ↓↓', run: () => act.fine(-0.2) },
        ],
      };
    case 'diaphragm':
      return {
        title: 'Iris diaphragm lever',
        info: `${sc.diaphragm}% open. Closing it gives more contrast (and less light) — needed for unstained, colourless specimens.`,
        actions: [
          { key: 'open', label: 'Open it more', run: () => act.diaphragm(10) },
          { key: 'close', label: 'Close it a little', run: () => act.diaphragm(-10) },
        ],
      };
    case 'lamp':
      return {
        title: 'Lamp',
        info: `Brightness ${sc.lamp}%. Light reaching the eye: ${microBrightness(sc.lamp, sc.diaphragm, sc.objective).toFixed(2)} (comfortable between 0.30 and 0.75). High power needs more light.`,
        actions: [
          { key: 'up', label: 'Brighter', tone: sc.lamp < 30 ? 'brand' : undefined, run: () => act.lamp(10) },
          { key: 'down', label: 'Dimmer', run: () => act.lamp(-10) },
        ],
      };
    case 'stage': {
      const ready = scene.slide === 'tile' && !!s.prep.coverslip;
      return {
        title: 'Stage and clips',
        info: s.prep.placed ? 'The slide is clipped over the hole in the stage.' : 'The slide goes over the hole, held by the two clips.',
        actions: s.prep.placed
          ? [{ key: 'look', label: 'Look through the eyepiece', tone: 'brand', run: ctx.look }]
          : [{ key: 'place', label: 'Place my slide and clip it', tone: 'brand', blocked: !ready ? (scene.slide === 'tile' ? 'Finish the slide first: the cover slip goes on before it goes on the stage.' : 'Prepare a slide on the white tile first.') : undefined, run: () => (play('clink'), m.update(placeSlide, 'place-slide'), setView({ selected: null, focus: 'stage' })) }],
      };
    }
    case 'slide':
      return { title: 'Your slide', info: slideInfo(s, scene), actions: slideSteps(ctx) };
    case 'tile':
      return scene.slide === 'tile' ? { title: 'Your slide', info: slideInfo(s, scene), actions: slideSteps(ctx) } : { title: 'White tile', info: 'Make the slide here: a clean slide, a drop of liquid, the specimen, then the cover slip.', actions: [] };
    case 'slides':
      return {
        title: 'Slides and cover slips',
        info: s.slide === 'POND' ? 'Use a cavity slide for living organisms.' : 'Hold slides by their edges; cover slips are very thin and break easily.',
        actions: [{ key: 'take', label: s.slide === 'POND' ? 'Take a clean cavity slide' : 'Take a clean slide', tone: 'brand', blocked: scene.slide !== 'none' ? (scene.slide === 'bin' ? 'You have finished with your slide.' : 'Your slide is already out.') : undefined, run: () => (play('clink'), m.note('take-slide'), setView({ focus: 'prep' })) }, returnAction(ctx, 'slides')],
      };
    case 'source':
      return { title: SPECIMEN_STEP[s.slide!].source, info: s.slide ? `${SPECIMEN_STEP[s.slide].action}.` : undefined, actions: scene.specimen ? [] : [specimenAction(ctx)] };
    case 'swabs':
      return {
        title: 'Sterile cotton buds',
        info: 'Use a fresh one, gently, then put it in the disinfectant.',
        actions:
          s.slide === 'CHEEK' && !scene.specimen
            ? [specimenAction(ctx)]
            : s.slide === 'CHEEK' && !scene.swabDisposed
              ? [{ key: 'dispose', label: 'Put the used bud in the disinfectant', tone: 'brand', blocked: !scene.collected.has('disinfectant') ? 'Get the beaker of disinfectant from the cupboard.' : undefined, run: () => (m.note('dispose-swab'), notify('Swab in the disinfectant.', 'success', 1400)) }]
              : [returnAction(ctx, 'swabs')],
      };
    case 'disinfectant':
      return {
        title: 'Beaker of disinfectant',
        info: 'Used cheek swabs (and anything with saliva on it) go in here.',
        actions: s.slide === 'CHEEK' && scene.specimen && !scene.swabDisposed ? [{ key: 'dispose', label: 'Put the used bud in it', tone: 'brand', run: () => (m.note('dispose-swab'), notify('Swab in the disinfectant.', 'success', 1400)) }] : [returnAction(ctx, 'disinfectant')],
      };
    case 'bin': {
      const done = s.captures.length > 0;
      return {
        title: 'Sharps and discard jar',
        info: 'Used slides, cover slips and broken glass go in here — never in the bin.',
        actions: [
          {
            key: 'dispose',
            label: 'Put my used slide in the jar',
            tone: 'brand',
            blocked: scene.slide === 'bin' ? 'Already done.' : scene.slide === 'none' ? 'You have no slide out.' : !done ? 'Not yet: finish at the microscope first (capture your views).' : undefined,
            run: () => (play('clink'), m.note('dispose-slide'), notify('Slide in the sharps jar. Now wash your hands.', 'success', 2000)),
          },
        ],
      };
    }
    case 'filter':
      return { title: 'Filter (blotting) paper', info: 'Touch it to the edge of the cover slip to draw off extra liquid.', actions: [...(scene.slide === 'tile' && s.prep.coverslip && !scene.blotted && s.prep.medium !== 'NONE' ? [{ key: 'blot', label: 'Blot off the extra liquid', tone: 'brand' as const, run: () => m.note('blot') }] : []), returnAction(ctx, 'filter')] };
    case 'lensTissue':
      return { title: 'Lens tissue', info: 'The only thing to clean the lenses with — paper or cloth scratches them.', actions: [{ key: 'clean', label: 'Clean the eyepiece and objectives', tone: 'brand', blocked: !scene.collected.has('microscope') ? 'Get a microscope first.' : undefined, run: () => (m.note('clean-lens'), notify('Lenses wiped with lens tissue.', 'info', 1600)) }, returnAction(ctx, 'lensTissue')] };
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: 'Labelling, measurement, magnification, drawing practice, observations and precautions.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
  }
  const a = id as ApparatusId;
  if (APPARATUS_LABEL[a]) return { title: APPARATUS_LABEL[a], info: DISTRACTORS.includes(a) ? 'Not needed at the microscope.' : needed(s.slide).includes(a) ? TOOL_INFO[a] : `${TOOL_INFO[a] ?? ''} (Not needed for this slide.)`, actions: [returnAction(ctx, a)] };
  return null;
}
const TOOL_INFO: Partial<Record<ApparatusId, string>> = {
  needle: 'Lowers the cover slip at an angle (select your slide to use it).',
  forceps: 'Peels and lifts thin tissue.',
  scalpel: 'Cuts sections — always away from your fingers.',
  brush: 'Lifts thin sections without damaging them.',
  watchGlass: 'Keeps sections moist in water until you mount them.',
  tape: 'Clear tape can lift a leaf epidermis.',
};

function slideInfo(s: BioMicroscopeState, scene: SceneState): string {
  const p = s.prep;
  const parts = [p.medium ? (p.medium === 'NONE' ? 'mounted dry' : `${MICRO_MEDIUM_LABELS[p.medium].toLowerCase()}`) : 'no liquid yet', scene.specimen ? 'specimen on' : 'no specimen yet', p.coverslip ? (p.coverslip === 'ANGLE' ? 'cover slip lowered at an angle' : 'cover slip dropped flat') : 'no cover slip'];
  return parts.join(' · ');
}

/** The next step, for practice mode with guided mode off: the 3D steps, then the 2D lab's hint. */
export function nextHint3d(s: BioMicroscopeState, scene: SceneState, m: Microscope): string | null {
  if (!s.slide || !m.v) return null;
  if (!scene.coat) return 'Put on your lab coat: it hangs on the hooks by the door.';
  const missing = needed(s.slide).filter((a) => !scene.collected.has(a));
  if (missing.length) return `Collect from the cupboard (east wall): ${missing.map((a) => APPARATUS_LABEL[a].toLowerCase()).join(', ')}.`;
  if (scene.slide === 'none') return 'Take a clean slide out of the box onto the white tile.';
  if (!s.prep.medium) return 'Put a drop of the right liquid on the slide: think about what each stain shows.';
  if (!scene.specimen) return `${SPECIMEN_STEP[s.slide].action}.`;
  if (s.captures.length >= 2 || (m.v.info.labelObjective === m.v.info.measureObjective && s.captures.some((c) => c.objective === m.v!.info.labelObjective))) {
    if (scene.slide !== 'bin') return 'When your record is complete, put the used slide in the sharps jar.';
    if (!scene.washedAtEnd) return 'Wash your hands at the hand-washing point.';
  }
  return nextHint(s, m.v);
}
