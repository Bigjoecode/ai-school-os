import { GLASS_ANGLE_MAX, GLASS_ANGLE_MIN, glassIncidentPoint, type GlassPoint, type PhyGlassState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { PIN_LABEL, type Glass, type PinId } from '../actions';
import { useBench } from './bench-store';
import { APPARATUS, APPARATUS_LABEL, nextIFor, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { inLine } from './views';

/**
 * Everything the student can do at the glass-block bench, as plain
 * operations (used by the dock, the object menus, the drags and the demo) and
 * as each object's menu. Marked changes go through the shared actions; the
 * 3D-only steps (collecting apparatus) are log notes without marks.
 */

const bench = () => useBench.getState();
const anim = (kind: 'normal' | 'ray' | 'join' | 'pin') => useBench.setState({ anim: { kind, at: performance.now() } });
/** Depths (cm below face CD) for P₃ and P₄ pushed in "in line with what you see": 6.5 cm apart. */
export const P3_DEPTH = 2.5;
export const P4_DEPTH = 9;

export interface Ops {
  startTrace: () => void;
  drawNormal: () => void;
  pushOnRay: (pin: 'p1' | 'p2') => void;
  tapPaper: (p: GlassPoint) => void;
  pushInLine: (pin: 'p3' | 'p4') => void;
  sight: (on: boolean) => void;
  moveEye: (dx: number) => void;
  join: () => void;
  discard: () => void;
  nextI: (d: number) => void;
  /** Why each step can't be done now (undefined: it can). */
  why: { trace?: string; normal?: string; p12?: string; sight?: string; p34?: string; join?: string };
}

/** The operations on `g`: each reads the state as it is now (so the demo can run several in one tick). */
export function makeOps(g: Glass): Ops {
  const now = () => {
    const st = g.ref.current;
    const k = st.traces.findIndex((t) => !t.joined);
    return { st, k, open: k >= 0 ? st.traces[k]! : null, scene: sceneFromState(st) };
  };
  const whyNow = () => {
    const { st: s, open, scene } = now();
    return {
    trace: !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : open ? 'Finish (or discard) the trace in progress first.' : s.traces.length >= 10 ? 'Ten traces is the most.' : undefined,
    normal: !open ? 'Start a trace first.' : open.normal ? 'The normal is drawn.' : undefined,
    p12: !open ? 'Start a trace first.' : undefined,
    sight: !open ? 'Start a trace first.' : open.p1 === null || open.p2 === null ? 'Stick P₁ and P₂ on the incident ray first.' : undefined,
    p34: !open ? 'Start a trace first.' : open.p1 === null || open.p2 === null ? 'Stick P₁ and P₂ first.' : !bench().sight ? 'Look through face CD at eye level first.' : undefined,
    join: !open ? 'Start a trace first.' : !open.p1 || !open.p2 || !open.p3 || !open.p4 ? 'All four pins must be in first.' : undefined,
    };
  };
  const why = whyNow();
  const say = (m: string) => notify(m, 'warning', 2400);
  const placed = (err: string | null) => {
    if (err) return say(err), false;
    play('tick');
    anim('pin');
    return true;
  };
  return {
    why,
    startTrace: () => {
      const w = whyNow().trace;
      if (w) return say(w);
      g.newTrace(nextIFor(now().st, bench().nextI));
      useBench.setState({ nextI: null, viewing: null, tool: null, sight: false });
      anim('ray');
      play('clink');
      useLabView.setState({ mode: 'bench', focus: 'board', spot: null, selected: null });
    },
    drawNormal: () => {
      const w = whyNow().normal;
      if (w) return say(w);
      g.drawNormal();
      anim('normal');
    },
    pushOnRay: (pin) => {
      const { open } = now();
      if (!open) return say('Start a trace first.');
      if (placed(g.placePin(pin, glassIncidentPoint(open.i, bench().dist[pin])))) useBench.setState({ tool: null });
    },
    tapPaper: (p) => {
      const tool = bench().tool;
      const { open } = now();
      if (!tool || !open) return;
      if (!placed(g.placePin(tool, p))) return;
      // As in the 2D lab: P₁ then P₂, P₃ then P₄.
      useBench.setState({ tool: tool === 'p1' && open.p2 === null ? 'p2' : tool === 'p3' && !open.p4 ? 'p4' : null });
    },
    pushInLine: (pin) => {
      const { open } = now();
      const w = whyNow().p34;
      if (w || !open) return say(w ?? '');
      const depth = -g.v.thickness - (pin === 'p3' ? P3_DEPTH : P4_DEPTH);
      placed(g.placePin(pin, inLine(g.v, open, bench().eyeX, depth)));
    },
    sight: (on) => {
      const w = whyNow().sight;
      if (on && w) return say(w);
      useBench.setState({ sight: on, tool: null });
      if (!on) useLabView.setState({ spot: null, focus: 'board' });
    },
    moveEye: (dx) => useBench.setState({ eyeX: Math.max(-12, Math.min(42, Math.round((bench().eyeX + dx) * 100) / 100)) }),
    join: () => {
      const w = whyNow().join;
      if (w) return say(w);
      g.join();
      useBench.setState({ sight: false, tool: null });
      useLabView.setState({ spot: null, focus: 'board' });
      anim('join');
      play('clink');
    },
    discard: () => {
      const { k } = now();
      if (k < 0) return;
      g.removeTrace(k);
      useBench.setState({ sight: false, tool: null, viewing: null });
      useLabView.setState({ spot: null, focus: 'board' });
    },
    nextI: (d) => useBench.setState({ nextI: Math.max(GLASS_ANGLE_MIN, Math.min(GLASS_ANGLE_MAX, nextIFor(now().st, bench().nextI) + d)) }),
  };
}

export interface ActionCtx {
  g: Glass;
  s: PhyGlassState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const view = () => useLabView.getState();
const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { g, s, scene, ops } = ctx;
  const open = g.open;
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return {
      title: APPARATUS_LABEL[a],
      info: 'In the apparatus cupboard.',
      actions: [
        act('take', 'Take to my bench', () => {
          g.note(`collect:${a}`);
          play('clink');
          view().set({ selected: null });
          notify(`${APPARATUS_LABEL[a]} is on your bench.`, 'success', 1600);
        }, undefined, 'brand'),
      ],
    };
  }
  if (id.startsWith('pin:')) {
    const p = id.slice(4) as PinId;
    const movable = (p === 'p3' || p === 'p4') && !!open?.[p];
    return {
      title: `Optical pin ${PIN_LABEL[p]}`,
      info: p === 'p1' || p === 'p2' ? 'On the incident ray.' : 'On the emergent ray — drag it, or nudge it from the dock, to line it up.',
      actions: movable
        ? [act('nudge', `Nudge ${PIN_LABEL[p]} with the dock`, () => (useBench.setState({ nudgePin: p as 'p3' | 'p4' }), view().set({ selected: null })))]
        : open && (p === 'p1' || p === 'p2')
          ? [act('move', `Move ${PIN_LABEL[p]} (tap the ray)`, () => (useBench.setState({ tool: p }), view().set({ selected: null })))]
          : [],
    };
  }
  const returnable = (a: ApparatusId) =>
    act('return', 'Put back in the cupboard', () => (g.note(`return:${a}`), view().set({ selected: null })), (a === 'block' || a === 'board' || a === 'paper' || a === 'pins') && s.traces.length ? 'You are using it.' : undefined);
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need for tracing rays through a glass block.', actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Bench 2: your task card and notebook are here.',
        actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))],
      };
    case 'board': {
      const actions: LabAction[] = [];
      if (!open) actions.push(act('trace', `Trace the block and draw the ray at i = ${nextIFor(s, useBench.getState().nextI)}°`, ops.startTrace, ops.why.trace, 'brand'));
      else {
        if (!open.normal) actions.push(act('normal', 'Draw the normal at O', ops.drawNormal, undefined, 'brand'));
        for (const p of ['p1', 'p2'] as const) actions.push(act(p, open[p] === null ? `Stick ${PIN_LABEL[p]} (tap the ray)` : `Move ${PIN_LABEL[p]}`, () => (useBench.setState({ tool: p }), view().set({ selected: null })), ops.why.p12));
        actions.push(act('discard', 'Discard this trace', ops.discard));
      }
      actions.push(act('view', 'Look at the board from above', () => view().set({ mode: 'bench', focus: 'board', spot: null, selected: null })));
      return { title: 'Drawing board', info: open ? `Trace at i = ${open.i}° in progress.` : `${g.done} trace${g.done === 1 ? '' : 's'} done.`, actions };
    }
    case 'block': {
      const actions: LabAction[] = [];
      if (open) {
        actions.push(act('sight', useBench.getState().sight ? 'Stop looking through CD' : 'Look through face CD at eye level', () => ops.sight(!useBench.getState().sight), ops.why.sight, 'brand'));
        actions.push(act('join', 'Remove the block and join the points', ops.join, ops.why.join));
      } else actions.push(returnable('block'));
      return { title: 'Rectangular glass block', info: open ? 'On its outline ABCD.' : 'Beside the board.', actions };
    }
    case 'pins':
      return {
        title: 'Optical pins',
        info: 'Sharp: push them in upright and keep them in the box.',
        actions: open
          ? (['p1', 'p2'] as const).map((p) => act(p, `Push ${PIN_LABEL[p]} in at ${useBench.getState().dist[p].toFixed(1)} cm from O`, () => ops.pushOnRay(p), ops.why.p12))
          : [returnable('pins')],
      };
    case 'protractor':
      return {
        title: 'Protractor',
        info: 'Centre it on O with 0° on the normal to read r.',
        actions: [act('measure', 'Measure r at O', () => view().set({ mode: 'bench', focus: 'protractor', spot: null, selected: null }), s.traces.some((t) => t.joined) ? undefined : 'Remove the block and join the points first.', 'brand')],
      };
    case 'ruler':
    case 'pencil':
      return { title: APPARATUS_LABEL[id], info: 'Used when you draw the normal and the rays.', actions: [] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'prism':
    case 'lens':
    case 'mirror':
      return { title: APPARATUS_LABEL[id], info: 'Not needed for this practical.', actions: [returnable(id)] };
    case 'coat':
      return { title: 'Lab coat', info: 'Optional for ray tracing.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => g.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => g.note('safety:coat'))] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: 'Today: refraction through a glass block — i = 20° to 60°.', actions: [] };
    default:
      return APPARATUS.some((a) => a.id === id) ? { title: APPARATUS_LABEL[id as ApparatusId], actions: [] } : ROOM_INFO[id] ? { title: ROOM_INFO[id]![0], info: ROOM_INFO[id]![1], actions: [] } : null;
  }
}

const ROOM_INFO: Record<string, [string, string]> = {
  goggles: ['Safety goggles', 'Not needed for ray tracing.'],
  shelf: ['Physics equipment shelf', 'Equipment for other practicals: you need nothing from here.'],
  vdg: ['Van de Graaff generator', 'Teacher only.'],
  co2: ['CO₂ fire extinguisher', 'For electrical fires.'],
  blanket: ['Fire blanket', 'Pull the tapes down sharply to use it.'],
  extinguisher: ['Fire extinguisher', 'By the door.'],
  firstaid: ['First-aid box', 'Tell the teacher about any injury, even a pin prick.'],
  eyewash: ['Eye-wash station', 'Rinse for 10 minutes.'],
  notice: ['Notice board', 'Department notices and WAEC tips.'],
  desk: ['Teacher’s desk', 'Mr Bayo’s teacher marks the work here.'],
  'poster-si': ['Poster: SI base units', 'n has no unit: it is a ratio.'],
  'poster-light': ['Poster: refraction of light', 'n = sin i / sin r.'],
  'poster-electric': ['Poster: electrical safety', 'For the electricity practicals.'],
};
