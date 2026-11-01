import { DEPTH_BLOCKS, DEPTH_EYE_MAX, PINS_ANGLE, type DispFilter, type PhyPinsState, type PinsPoint } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { PIN_LABEL, firstAngle, nextAngle, type PinId, type Pins } from '../actions';
import { defaultPhi, inLinePoint } from '../index';
import { useBench } from './bench-store';
import { APPARATUS_LABEL, apparatusFor, sceneFromState, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the pin bench, as plain operations (the
 * dock, the object menus, the drags and the demo use them) and as each
 * object's menu. Marked changes go through the shared actions; collecting
 * apparatus is a log note without marks.
 */

const bench = () => useBench.getState();
const anim = (kind: 'normal' | 'ray' | 'join' | 'pin') => useBench.setState({ anim: { kind, at: performance.now() } });
let wiggleTimer: number | null = null;

export const nextIFor = (s: PhyPinsState, task: 'MIRROR' | 'PRISM', chosen: number | null) => chosen ?? (s.traces.length ? nextAngle(task, s.traces.at(-1)!.i) : firstAngle(task));
export const eyePhi = (g: Pins) => {
  const t = g.ref.current.traces.find((x) => !x.joined);
  return bench().phi ?? (t ? defaultPhi(g, t.i) : 30);
};

export function makeOps(g: Pins) {
  const now = () => {
    const st = g.ref.current;
    const k = st.traces.findIndex((t) => !t.joined);
    return { st, k, open: k >= 0 ? st.traces[k]! : null, scene: sceneFromState(st, g.task) };
  };
  const whyNow = () => {
    const { st: s, open, scene } = now();
    return {
      trace: !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : open ? 'Finish (or discard) the trace in progress first.' : s.traces.length >= 12 ? 'Twelve traces is the most.' : undefined,
      normal: !open ? 'Start a trace first.' : open.normal ? 'The normal is drawn.' : undefined,
      p12: !open ? 'Start a trace first.' : undefined,
      sight: !open ? 'Start a trace first.' : open.p1 === null || open.p2 === null ? 'Stick P₁ and P₂ on the incident ray first.' : undefined,
      p34: !open ? 'Start a trace first.' : open.p1 === null || open.p2 === null ? 'Stick P₁ and P₂ first.' : !bench().sight ? 'Put your eye down at paper level first.' : undefined,
      join: !open ? 'Start a trace first.' : !open.p1 || !open.p2 || !open.p3 || !open.p4 ? 'All four pins must be in first.' : undefined,
      depth: !scene.ready ? `Collect your apparatus first (${scene.missing.length} to go).` : s.depth.blocks < 1 ? 'Put at least one block on the cross.' : undefined,
      disp: !scene.ready ? `Collect your apparatus first (${scene.missing.length} to go).` : undefined,
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
  const ops = {
    why,
    // ---- board
    startTrace: () => {
      const w = whyNow().trace;
      if (w) return say(w);
      g.newTrace(nextIFor(now().st, g.bt, bench().nextI));
      useBench.setState({ nextI: null, viewing: null, tool: null, sight: false, phi: null });
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
    pushOnRay: (pin: 'p1' | 'p2') => {
      if (placed(g.pushOnRay(pin, bench().dist[pin]))) useBench.setState({ tool: null });
    },
    tapPaper: (p: PinsPoint) => {
      const tool = bench().tool;
      const { open } = now();
      if (!tool || !open) return;
      if (!placed(g.placePin(tool, p))) return;
      useBench.setState({ tool: tool === 'p1' && open.p2 === null ? 'p2' : tool === 'p3' && !open.p4 ? 'p4' : null });
    },
    sight: (on: boolean) => {
      const w = whyNow().sight;
      if (on && w) return say(w);
      useBench.setState({ sight: on, tool: null });
      if (!on) useLabView.setState({ spot: null, focus: 'board' });
    },
    moveEye: (d: number) => useBench.setState({ phi: Math.max(1, Math.min(89, Math.round((eyePhi(g) + d) * 10) / 10)) }),
    pushInLine: (pin: 'p3' | 'p4') => {
      const { open } = now();
      const w = whyNow().p34;
      if (w || !open) return say(w ?? '');
      const p = inLinePoint(g, open, eyePhi(g), pin);
      placed(p ? g.placePin(pin, p) : 'You cannot see the images from here: move your eye.');
    },
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
    nextI: (d: number) => useBench.setState({ nextI: Math.max(PINS_ANGLE[g.bt].min, Math.min(PINS_ANGLE[g.bt].max, nextIFor(now().st, g.bt, bench().nextI) + d)) }),
    setDist: (p: 'p1' | 'p2', d: number) => useBench.setState({ dist: { ...bench().dist, [p]: Math.max(0.5, Math.min(16, Math.round((bench().dist[p] + d) * 10) / 10)) } }),
    // ---- depth
    blocks: (d: number) => {
      const w = whyNow().disp;
      if (w) return say(w);
      const b = g.ref.current.depth.blocks + d;
      if (b < 0 || b > DEPTH_BLOCKS) return;
      g.setBlocks(b);
      play('clink');
    },
    pin: (dh: number) => g.setPin(g.ref.current.depth.h + dh),
    look: (on: boolean) => {
      const w = whyNow().depth;
      if (on && w) return say(w);
      useBench.setState({ look: on });
      if (!on) useLabView.setState({ spot: null, focus: 'stack' });
    },
    eye: (dx: number) => g.setEye(g.ref.current.depth.eyeX + dx),
    wiggle: () => {
      if (wiggleTimer) return;
      let k = 0;
      wiggleTimer = window.setInterval(() => {
        k++;
        g.setEye(k > 40 ? 0 : DEPTH_EYE_MAX * Math.sin((k / 20) * Math.PI * 2));
        if (k > 40 && wiggleTimer) {
          clearInterval(wiggleTimer);
          wiggleTimer = null;
        }
      }, 60);
    },
    take: () => {
      const w = whyNow().depth;
      if (w) return say(w);
      const err = g.takeDepth();
      if (err) return say(err);
      play('tick');
      notify(g.checked() ? 'Reading recorded.' : 'Recorded — but you did not check for parallax by moving your eye.', g.checked() ? 'success' : 'warning', 2000);
    },
    // ---- dispersion
    dark: () => {
      const w = whyNow().disp;
      if (w) return say(w);
      g.setDark(!g.ref.current.disp.dark);
      play('clink');
    },
    slit: () => {
      g.setSlit(g.ref.current.disp.slit === 'narrow' ? 'wide' : 'narrow');
      play('tick');
    },
    rotate: (d: number) => g.setI(g.ref.current.disp.i + d),
    dist: (d: number) => g.setDist(g.ref.current.disp.dist + d),
    filter: (f: DispFilter) => g.setFilter(f),
    screen: (on: boolean) => {
      const w = whyNow().disp;
      if (on && w) return say(w);
      useBench.setState({ screen: on });
      useLabView.setState({ mode: 'bench', focus: on ? 'screen' : 'bench', spot: null, selected: null });
    },
  };
  return ops;
}
export type Ops = ReturnType<typeof makeOps>;

export interface ActionCtx {
  g: Pins;
  s: PhyPinsState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const view = () => useLabView.getState();
const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });

export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { g, s, scene, ops } = ctx;
  const open = g.open;
  const task = g.task;
  const needed = (a: ApparatusId) => apparatusFor(task).find((x) => x.id === a)?.needed;
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
      info: p === 'p1' || p === 'p2' ? 'On the incident ray.' : 'In line with the images — drag it, or nudge it from the dock.',
      actions: movable ? [act('nudge', `Nudge ${PIN_LABEL[p]} with the dock`, () => (useBench.setState({ nudgePin: p as 'p3' | 'p4' }), view().set({ selected: null })))] : open && (p === 'p1' || p === 'p2') ? [act('move', `Move ${PIN_LABEL[p]} (tap the ray)`, () => (useBench.setState({ tool: p }), view().set({ selected: null })))] : [],
    };
  }
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (g.note(`return:${a}`), view().set({ selected: null })), needed(a) && (s.traces.length || s.depth.readings.length || s.disp.looks.length) ? 'You are using it.' : undefined);
  const what = task === 'MIRROR' ? 'mirror' : 'prism';
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need.', actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Bench 2: your task card and notebook are here.',
        actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))],
      };
    case 'board': {
      const actions: LabAction[] = [];
      if (!open) actions.push(act('trace', `New sheet: draw the ray at i = ${nextIFor(s, g.bt, useBench.getState().nextI)}°`, ops.startTrace, ops.why.trace, 'brand'));
      else {
        if (!open.normal) actions.push(act('normal', 'Draw the normal at O', ops.drawNormal, undefined, 'brand'));
        for (const p of ['p1', 'p2'] as const) actions.push(act(p, open[p] === null ? `Stick ${PIN_LABEL[p]} (tap the ray)` : `Move ${PIN_LABEL[p]}`, () => (useBench.setState({ tool: p }), view().set({ selected: null })), ops.why.p12));
        actions.push(act('discard', 'Discard this trace', ops.discard));
      }
      actions.push(act('view', 'Look at the board from above', () => view().set({ mode: 'bench', focus: 'board', spot: null, selected: null })));
      return { title: 'Drawing board', info: open ? `Trace at i = ${open.i}° in progress.` : `${g.done} trace${g.done === 1 ? '' : 's'} done.`, actions };
    }
    case 'mirror':
    case 'prism': {
      if (task === 'DISP' && id === 'prism') return { title: 'Triangular prism on the turntable', info: `Turn it to change the angle of incidence (now ${s.disp.i}°).`, actions: [act('l', 'Rotate 1° anticlockwise', () => ops.rotate(-1)), act('r', 'Rotate 1° clockwise', () => ops.rotate(1)), act('screen', 'Look at the screen', () => ops.screen(true), ops.why.disp, 'brand')] };
      if (!needed(id)) return { title: APPARATUS_LABEL[id], info: 'Not needed for this practical.', actions: [returnable(id)] };
      const actions: LabAction[] = [];
      if (open) {
        actions.push(act('sight', useBench.getState().sight ? 'Stop looking' : task === 'MIRROR' ? 'Look into the mirror at paper level' : 'Look through the second face at paper level', () => ops.sight(!useBench.getState().sight), ops.why.sight, 'brand'));
        actions.push(act('join', `Remove the ${what} and join the points`, ops.join, ops.why.join));
      } else actions.push(returnable(id));
      return { title: APPARATUS_LABEL[id], info: open ? 'Standing on its outline.' : 'Beside the board.', actions };
    }
    case 'pins':
      return { title: 'Optical pins', info: 'Sharp: push them in upright and keep them in the box.', actions: open ? (['p1', 'p2'] as const).map((p) => act(p, `Push ${PIN_LABEL[p]} in at ${useBench.getState().dist[p].toFixed(1)} cm from O`, () => ops.pushOnRay(p), ops.why.p12)) : [returnable('pins')] };
    case 'protractor':
      return { title: 'Protractor', info: task === 'MIRROR' ? 'Centre it where P₄P₃ meets MM′, 0° on the normal.' : 'Centre it where the produced rays meet, 0° along the incident ray produced.', actions: [act('measure', task === 'MIRROR' ? 'Measure r' : 'Measure D', () => view().set({ mode: 'bench', focus: 'protractor', spot: null, selected: null }), s.traces.some((t) => t.joined) ? undefined : `Remove the ${what} and join the points first.`, 'brand')] };
    case 'blocks':
      return { title: 'Glass blocks on the cross', info: `${s.depth.blocks} block${s.depth.blocks === 1 ? '' : 's'} on the cross. Real depth = height of the top face.`, actions: [act('add', 'Add a block', () => ops.blocks(1), s.depth.blocks >= DEPTH_BLOCKS ? 'All four are on.' : ops.why.disp, 'brand'), act('remove', 'Take a block off', () => ops.blocks(-1), s.depth.blocks < 1 ? 'None on.' : undefined), act('look', 'Look vertically down', () => ops.look(true), ops.why.depth)] };
    case 'stand':
      return { title: 'Search pin in its cork', info: `At ${s.depth.h.toFixed(2)} cm on the rule.`, actions: [act('up', 'Raise 1 mm', () => ops.pin(0.1)), act('down', 'Lower 1 mm', () => ops.pin(-0.1)), act('take', 'Take this reading', ops.take, ops.why.depth, 'brand')] };
    case 'rule':
      return { title: 'Vertical rule', info: '0 at the bench. Read with your eye level with the pin.', actions: [act('read', 'Read at eye level', () => view().set({ mode: 'read', selected: null, spot: null }))] };
    case 'raybox':
      return { title: 'Ray box', info: `Slit: ${s.disp.slit}. The lamp gets hot.`, actions: [act('slit', s.disp.slit === 'narrow' ? 'Change to the wide slit' : 'Change to the narrow slit', ops.slit, ops.why.disp, 'brand')] };
    case 'screen':
      return { title: 'White screen', info: `${s.disp.dist} cm from the prism.`, actions: [act('look', 'Look at the screen', () => ops.screen(true), ops.why.disp, 'brand'), act('far', 'Move it 10 cm further', () => ops.dist(10)), act('near', 'Move it 10 cm nearer', () => ops.dist(-10))] };
    case 'filters':
      return { title: 'Colour filters', info: `In the beam: ${s.disp.filter}.`, actions: (['none', 'red', 'green', 'blue'] as const).map((f) => act(f, f === 'none' ? 'No filter' : `Put the ${f} filter in the beam`, () => ops.filter(f), ops.why.disp)) };
    case 'curtain':
      return { title: 'Curtains and lights', info: s.disp.dark ? 'The room is dark.' : 'The room is lit.', actions: [act('dark', s.disp.dark ? 'Lights on' : 'Darken the room', ops.dark, ops.why.disp, 'brand')] };
    case 'ruler':
    case 'pencil':
    case 'turntable':
      return { title: APPARATUS_LABEL[id], info: id === 'turntable' ? 'Holds the prism; turn it to change the angle of incidence.' : 'Used when you draw the normal and the rays.', actions: [] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'coat':
      return { title: 'Lab coat', info: 'Optional for optics.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => g.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => g.note('safety:coat'))] };
    default: {
      const a = apparatusFor(task).find((x) => x.id === id);
      if (a) return { title: a.label, info: a.needed ? undefined : 'Not needed for this practical.', actions: a.needed ? [] : [returnable(a.id)] };
      return ROOM_INFO[id] ? { title: ROOM_INFO[id]![0], info: ROOM_INFO[id]![1], actions: [] } : null;
    }
  }
}

const ROOM_INFO: Record<string, [string, string]> = {
  goggles: ['Safety goggles', 'Not needed for optics.'],
  shelf: ['Physics equipment shelf', 'Equipment for other practicals.'],
  vdg: ['Van de Graaff generator', 'Teacher only.'],
  co2: ['CO₂ fire extinguisher', 'For electrical fires.'],
  blanket: ['Fire blanket', 'Pull the tapes down sharply to use it.'],
  extinguisher: ['Fire extinguisher', 'By the door.'],
  firstaid: ['First-aid box', 'Tell the teacher about any injury, even a pin prick.'],
  eyewash: ['Eye-wash station', 'Rinse for 10 minutes.'],
  notice: ['Notice board', 'Department notices and WAEC tips.'],
  desk: ['Teacher’s desk', 'The teacher marks the work here.'],
  whiteboard: ['Whiteboard', 'Today’s practical.'],
  'poster-si': ['Poster: SI base units', 'n has no unit: it is a ratio.'],
  'poster-light': ['Poster: refraction of light', 'n = sin i / sin r.'],
  'poster-electric': ['Poster: electrical safety', 'For the electricity practicals.'],
};
