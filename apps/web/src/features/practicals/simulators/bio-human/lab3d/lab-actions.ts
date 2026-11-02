import {
  PULSE_DURS,
  PULSE_EX_MINS,
  REACT_CONDS,
  REACT_COND_LABEL,
  REACT_COND_SHORT,
  SKIN_AREA_LABEL,
  SKIN_MAX_SEP,
  breathBulbShown,
  breathRoomShown,
  cobaltPink,
  pulseExEnd,
  type BioHumanState,
  type PulseDur,
  type ReactCond,
  type SkinArea,
} from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { bioRoomPanel } from '../../bio-common/lab3d/common';
import { fmtMin, lastBreathCount, lastDrop, lastPulse, lastTouch, type Human } from '../actions';
import { useHumanBench } from './bench';
import { HUMAN_APPARATUS, HUMAN_APPARATUS_LABEL, neededFor, type HumanApparatusId, type HumanScene } from './scene-state';

/**
 * What can be done with each object on the bench and with the partner. Every
 * action is a button; a blocked one says why. Marked changes go through the
 * shared actions (the same as the 2D lab); the 3D-only steps (coat,
 * apparatus, hand washing) are log notes. Sounds and animations follow the
 * log (see the lab's index).
 */

export interface HumanCtx {
  h: Human;
  s: BioHumanState;
  scene: HumanScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const view = () => useLabView.getState();
const setView = (x: Parameters<ReturnType<typeof useLabView.getState>['set']>[0]) => view().set(x);
const need = (ctx: HumanCtx, id: HumanApparatusId) => (ctx.scene.collected.has(id) ? undefined : `Get the ${HUMAN_APPARATUS_LABEL[id].toLowerCase()} from the apparatus cupboard first.`);
const firstBlock = (...xs: (string | undefined)[]) => xs.find(Boolean);
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
export const readNow = () => setView({ mode: 'read', selected: null });

// ------------------------------------------------------------------ pulse

export const pulseActs = {
  count(ctx: HumanCtx, dur: PulseDur, thumb = false) {
    const n = ctx.h.pulse.count(dur, thumb);
    if (n < 0) return notify('No more time on the clock for counts.', 'warning');
    const c = lastPulse(ctx.h.v, ctx.h.ref.current);
    if (c) notify(`You counted ${c.beats} beats in ${dur} s${thumb ? ' (with your thumb)' : ''}. Write it in your notebook.`, 'success', 4000);
  },
  exercise(ctx: HumanCtx, min: number) {
    ctx.h.pulse.exercise(min);
    notify(`Step-ups for ${min} minute${min === 1 ? '' : 's'}… done. Count the pulse at once!`, 'info', 3600);
  },
};
function pulsePanel(id: string, ctx: HumanCtx): ObjectPanel | null {
  const { h, s } = ctx;
  const w = s.pulse;
  const end = pulseExEnd(w);
  const when = end !== null && w.clock >= end - 1e-9 ? `${fmtMin(w.clock - end)} after the exercise` : `${fmtMin(w.clock)} sitting quietly`;
  const counts: LabAction[] = [
    ...PULSE_DURS.map((d): LabAction => ({ key: `c${d}`, label: `Count with two fingertips for ${d} s`, tone: d === 15 ? 'brand' : undefined, blocked: need(ctx, 'clock'), run: () => pulseActs.count(ctx, d) })),
    { key: 'thumb', label: 'Count with the thumb for 15 s', blocked: need(ctx, 'clock'), run: () => pulseActs.count(ctx, 15, true) },
  ];
  const waits: LabAction[] = [
    { key: 'w1', label: 'Wait 1 min', run: () => h.pulse.wait(1) },
    { key: 'wm', label: end !== null && w.clock >= end - 1e-9 ? 'Wait to the next minute after stopping' : 'Wait to the next minute', run: () => h.pulse.nextMinute() },
  ];
  if (id === 'partner')
    return {
      title: 'Your partner',
      info: `${when}.${w.screened ? ' No asthma, heart or sickle-cell problems.' : ''}`,
      actions: [{ key: 'screen', label: 'Ask about asthma, heart or sickle-cell problems', tone: 'brand', blocked: w.screened ? 'Asked: none.' : undefined, run: () => (h.pulse.screen(), notify('“No — none of those.” Your partner can exercise.', 'success', 2600)) }, ...waits, { key: 'look', label: 'Look closely at the wrist', run: readNow }],
    };
  if (id === 'wrist') return { title: 'The radial pulse', info: `Feel it on the thumb side of the wrist, with two fingertips. ${when}.`, actions: [...counts, ...waits, { key: 'look', label: 'Look closely', run: readNow }] };
  if (id === 'step')
    return {
      title: 'Step for step-ups',
      info: w.exercise ? `Done: step-ups for ${w.exercise.min} min.` : 'Up, up, down, down — at a steady rhythm.',
      actions: PULSE_EX_MINS.map((m): LabAction => ({ key: `e${m}`, label: `Step-ups for ${m} minute${m === 1 ? '' : 's'}`, tone: m === 2 ? 'brand' : undefined, blocked: firstBlock(need(ctx, 'step'), w.exercise ? 'Your partner has exercised.' : undefined), run: () => pulseActs.exercise(ctx, m) })),
    };
  if (id === 'clock') return { title: `Stopwatch — ${when}`, info: 'Count the beats over a timed 15, 30 or 60 seconds.', actions: [...counts.slice(0, 1), ...waits] };
  return null;
}

// ------------------------------------------------------------------ breath

function breathPanel(id: string, ctx: HumanCtx): ObjectPanel | null {
  const { h, s } = ctx;
  const w = s.breath;
  const a = h.breath;
  const bv = h.v.breath;
  const breathe: LabAction[] = [
    { key: 'gentle', label: 'Partner breathes gently in and out ×5', tone: 'brand', blocked: firstBlock(need(ctx, 'apparatus'), !w.lime ? 'Put lime water in both tubes first.' : undefined), run: () => a.breathe(false) },
    { key: 'hard', label: 'Partner blows and sucks hard ×5', blocked: firstBlock(need(ctx, 'apparatus'), !w.lime ? 'Put lime water in both tubes first.' : undefined), run: () => (a.breathe(true), notify('Lime water splashed up the tubes! Breathe gently — never suck lime water into the mouth.', 'danger', 4500)) },
  ];
  const countBreaths: LabAction = {
    key: 'count',
    label: 'Count your partner’s breaths for 1 minute',
    blocked: need(ctx, 'clock'),
    run: () => {
      a.count();
      const c = lastBreathCount(h.v, h.ref.current);
      if (c) notify(`${c.breaths} breaths in one minute (count ${c.n + 1}).`, 'success', 3200);
    },
  };
  if (id === 'mouthpiece') return { title: 'Clean mouthpieces', info: 'Use a fresh one for each student.', actions: [{ key: 'fit', label: 'Fit a clean mouthpiece to the apparatus', tone: 'brand', blocked: firstBlock(need(ctx, 'apparatus'), w.mouthpiece ? 'Fitted.' : undefined), run: a.mouthpiece }] };
  if (id === 'limewater')
    return {
      title: 'Lime water',
      info: 'Calcium hydroxide solution: carbon dioxide turns it milky.',
      actions: [
        { key: 'eq', label: 'Pour equal volumes into tubes A and B', tone: 'brand', blocked: firstBlock(need(ctx, 'apparatus'), w.lime ? 'Both tubes are filled.' : undefined), run: () => a.lime('EQUAL') },
        { key: 'rough', label: 'Pour some into each tube roughly', blocked: firstBlock(need(ctx, 'apparatus'), w.lime ? 'Both tubes are filled.' : undefined), run: () => a.lime('UNEQUAL') },
      ],
    };
  if (id === 'apparatus')
    return {
      title: 'Inhaled/exhaled air apparatus',
      info: 'Breathing in draws room air through A; breathing out bubbles through B.',
      actions: [{ key: 'mp', label: 'Fit a clean mouthpiece', blocked: firstBlock(need(ctx, 'mouthpiece'), w.mouthpiece ? 'Fitted.' : undefined), run: a.mouthpiece }, ...breathe, { key: 'look', label: 'Look closely at the lime water', run: readNow }],
    };
  if (id === 'partner')
    return {
      title: 'Your partner',
      info: 'Sitting at rest.',
      actions: [
        ...breathe.slice(0, 1),
        { key: 'mirror', label: 'Partner breathes on the mirror', blocked: firstBlock(need(ctx, 'mirror'), w.breathed ? 'Done.' : undefined), run: a.mirror },
        { key: 'bulb', label: 'Partner breathes onto the thermometer bulb', blocked: firstBlock(need(ctx, 'thermometer'), w.tbreath ? 'Done.' : undefined), run: () => (a.bulb(), notify(`The thermometer reads ${breathBulbShown(bv, h.ref.current.breath)!.toFixed(1)} °C.`, 'info', 3000)) },
        countBreaths,
      ],
    };
  if (id === 'mirror')
    return {
      title: w.breathed ? 'Mirror (misted)' : 'Mirror',
      info: 'A cool, dry mirror shows the water vapour in breath.',
      actions: [
        { key: 'wipe', label: 'Wipe it dry with a tissue', blocked: w.breathed ? 'It has been breathed on.' : w.wiped ? 'It is dry.' : undefined, run: a.wipe },
        { key: 'breathe', label: 'Partner breathes on it', tone: 'brand', blocked: w.breathed ? 'Done.' : undefined, run: a.mirror },
        { key: 'cobalt', label: 'Touch it with cobalt chloride paper', blocked: firstBlock(need(ctx, 'cobalt'), w.cobalt ? 'Done.' : undefined), run: () => (a.cobalt(), notify(cobaltPink(bv, h.ref.current.breath) ? 'The blue cobalt chloride paper turns pink.' : 'The cobalt chloride paper stays blue.', 'info', 3000)) },
        { key: 'look', label: 'Look closely', run: readNow },
      ],
    };
  if (id === 'cobalt') return { title: 'Cobalt chloride paper', info: 'Blue when dry; pink with water.', actions: [{ key: 'test', label: 'Test the mirror with it', tone: 'brand', blocked: firstBlock(need(ctx, 'mirror'), w.cobalt ? 'Done.' : undefined), run: () => (a.cobalt(), notify(cobaltPink(bv, h.ref.current.breath) ? 'It turns from blue to pink.' : 'It stays blue.', 'info', 3000)) }] };
  if (id === 'thermometer')
    return {
      title: 'Thermometer',
      info: 'Read it in the room air first, then with breath on the bulb.',
      actions: [
        { key: 'room', label: 'Read the room temperature', tone: 'brand', blocked: w.troom ? 'Read.' : undefined, run: () => (a.room(), notify(`Room air: ${breathRoomShown(bv, h.ref.current.breath)!.toFixed(1)} °C.`, 'info', 3000)) },
        { key: 'bulb', label: 'Partner breathes onto the bulb; read it', blocked: w.tbreath ? 'Read.' : undefined, run: () => (a.bulb(), notify(`Breath on the bulb: ${breathBulbShown(bv, h.ref.current.breath)!.toFixed(1)} °C.`, 'info', 3000)) },
      ],
    };
  if (id === 'clock') return { title: 'Stopwatch', info: 'Count breaths for exactly one minute while your partner sits at rest.', actions: [countBreaths] };
  return null;
}

// ------------------------------------------------------------------ reaction

export const reactActs = {
  drop(ctx: HumanCtx, c: ReactCond, warn = false) {
    const n = ctx.h.react.drop(c, warn);
    if (n < 0) return notify(`That is enough drops for the ${REACT_COND_SHORT[c].toLowerCase()}.`, 'warning');
    const d = lastDrop(ctx.h.v, ctx.h.ref.current);
    if (d) notify(`Caught at ${d.cm.toFixed(1)} cm (top of the thumb). Write it in your notebook.`, 'success', 3600);
  },
};
function reactPanel(id: string, ctx: HumanCtx): ObjectPanel | null {
  const { h, s } = ctx;
  const w = s.react;
  const a = h.react;
  const drops: LabAction[] = REACT_CONDS.map((c): LabAction => ({ key: `d-${c}`, label: `Drop without warning: ${lc(REACT_COND_LABEL[c])} (${w.drops.filter((d) => d.cond === c).length})`, tone: c === 'DOM' ? 'brand' : undefined, blocked: need(ctx, 'rule'), run: () => reactActs.drop(ctx, c) }));
  const knee: LabAction[] = [
    { key: 'kh', label: 'Tap below the kneecap with the side of your hand', tone: 'brand', blocked: w.knee ? 'Done.' : undefined, run: () => (a.knee('HAND'), notify('The lower leg kicks forward at once — your partner did not decide to move it.', 'success', 3600)) },
    { key: 'kr', label: 'Tap it with the metre rule', blocked: w.knee ? 'Done.' : undefined, run: () => (a.knee('HARD'), notify('“Ow!” The leg kicked, but a hard object can hurt. Use the side of your hand.', 'warning', 3600)) },
  ];
  if (id === 'knee') return { title: 'Knee-jerk', info: 'One leg crossed loosely over the other; tap the tendon just below the kneecap.', actions: [...knee, { key: 'look', label: 'Look closely', run: () => setView({ focus: 'knee' }) }] };
  if (id === 'partner')
    return {
      title: 'Your partner (the catcher)',
      info: `${w.arm ? 'Forearm on the bench edge' : 'Forearm free'} · ${w.zero ? 'thumb level with 0 cm' : 'thumb not lined up'}.`,
      actions: [
        ...knee,
        w.arm ? { key: 'armoff', label: 'Let the forearm hang free', run: () => a.arm(false) } : { key: 'arm', label: 'Rest the forearm on the bench edge', tone: 'brand', run: () => a.arm(true) },
        w.zero ? { key: 'zoff', label: 'Hold the rule a little higher', run: () => a.zero(false) } : { key: 'zero', label: 'Line the top of the thumb up with 0 cm', tone: 'brand', blocked: need(ctx, 'rule'), run: () => a.zero(true) },
      ],
    };
  if (id === 'rule')
    return {
      title: 'Metre rule',
      info: lastDrop(h.v, s) ? `Last catch: ${lastDrop(h.v, s)!.cm.toFixed(1)} cm.` : 'Held vertically, the 0 cm mark between your partner’s finger and thumb.',
      actions: [...drops, { key: 'warn', label: 'Say “ready… go” and drop it', blocked: need(ctx, 'rule'), run: () => (reactActs.drop(ctx, 'DOM', true), notify('Your partner caught it almost at once — they anticipated the drop. Never warn the catcher.', 'warning', 4200)) }, { key: 'look', label: 'Look closely at the scale', run: readNow }],
    };
  return null;
}

// ------------------------------------------------------------------ skin

export const skinActs = {
  touch(ctx: HumanCtx, area: SkinArea, sep: number) {
    const n = ctx.h.skin.touch(area, sep);
    if (n < 0) return notify('That is plenty of touches.', 'warning');
    const t = lastTouch(ctx.h.v, ctx.h.ref.current);
    if (t) notify(`${t.t.sep ? `Two points, ${t.t.sep} mm apart` : 'One point'} on the ${SKIN_AREA_LABEL[area].toLowerCase()}: “${t.said === 'TWO' ? 'Two' : 'One'}.”${t.t.blind ? '' : ' (Your partner was watching!)'}`, 'info', 3600);
  },
  sep(x: number) {
    useHumanBench.setState({ sep: Math.max(1, Math.min(SKIN_MAX_SEP, Math.round(x))) });
  },
};
function skinPanel(id: string, ctx: HumanCtx): ObjectPanel | null {
  const { h, s } = ctx;
  const w = s.skin;
  const a = h.skin;
  const { area, sep } = useHumanBench.getState();
  const touch = (ar: SkinArea): LabAction[] => [
    { key: 'two', label: `Touch with two points ${sep} mm apart`, tone: 'brand', blocked: need(ctx, 'dividers'), run: () => skinActs.touch(ctx, ar, sep) },
    { key: 'one', label: 'Touch with one point (a check)', blocked: need(ctx, 'dividers'), run: () => skinActs.touch(ctx, ar, 0) },
  ];
  if (id.startsWith('area:')) {
    const ar = id.slice(5) as SkinArea;
    if (area !== ar) queueMicrotask(() => useHumanBench.setState({ area: ar }));
    return { title: SKIN_AREA_LABEL[ar], info: `${w.trials.filter((t) => t.area === ar).length} touches here. Dividers at ${sep} mm.`, actions: [...touch(ar), { key: 'look', label: 'Look closely (tally and controls)', run: readNow }] };
  }
  if (id === 'dividers')
    return {
      title: `Dividers: ${sep} mm`,
      info: `Set the gap against the mm ruler. Touching: ${SKIN_AREA_LABEL[area].toLowerCase()}.`,
      actions: [
        { key: 'm1', label: 'Close by 1 mm', run: () => skinActs.sep(sep - 1) },
        { key: 'p1', label: 'Open by 1 mm', run: () => skinActs.sep(sep + 1) },
        { key: 'm5', label: 'Close by 5 mm', run: () => skinActs.sep(sep - 5) },
        { key: 'p5', label: 'Open by 5 mm', run: () => skinActs.sep(sep + 5) },
        ...touch(area),
        w.together ? { key: 'stag', label: 'Let one point land slightly after the other', run: () => a.together(false) } : { key: 'tog', label: 'Press both points down together', tone: 'brand', run: () => a.together(true) },
        { key: 'look', label: 'Set the gap and touch (close-up)', run: readNow },
      ],
    };
  if (id === 'wipes') return { title: 'Alcohol wipes', info: 'Clean the points between subjects.', actions: [{ key: 'clean', label: 'Wipe the points with alcohol', tone: 'brand', blocked: w.cleaned ? 'Cleaned.' : undefined, run: a.clean }] };
  if (id === 'blindfold' || id === 'partner')
    return {
      title: id === 'partner' ? 'Your partner (the subject)' : 'Blindfold',
      info: w.blind ? 'Blindfolded: they answer only “one” or “two”.' : 'They can see the points until blindfolded.',
      actions: [w.blind ? { key: 'off', label: 'Take the blindfold off', run: () => a.blind(false) } : { key: 'on', label: 'Blindfold your partner', tone: 'brand', blocked: need(ctx, 'blindfold'), run: () => a.blind(true) }, ...(id === 'partner' ? touch(area) : [])],
    };
  if (id === 'mmrule') return { title: 'Ruler (mm)', info: 'Set the gap between the points against it.', actions: [] };
  return null;
}

// ------------------------------------------------------------------ all objects

export function humanObjectPanel(id: string, ctx: HumanCtx): ObjectPanel | null {
  const { h, s, scene } = ctx;
  const task = s.task ?? 'PULSE';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as HumanApparatusId;
    return { title: HUMAN_APPARATUS_LABEL[a], info: 'In the apparatus cupboard.', actions: [{ key: 'take', label: 'Take to my bench', tone: 'brand', run: () => (h.note(`collect:${a}`), setView({ selected: null }), notify(`${HUMAN_APPARATUS_LABEL[a]} is on your bench.`, 'success', 1500)) }] };
  }
  const room = bioRoomPanel(id, {
    coat: scene.coat,
    goggles: scene.goggles,
    note: h.note,
    open: ctx.open,
    benchInfo: 'Bench 2: your partner, the task card and your notebook.',
    whiteboard: task === 'BREATH' ? 'Today: inhaled and exhaled air. Breathe gently.' : task === 'REACTION' ? 'Today: reflex and voluntary actions. Drop without warning.' : task === 'SKIN' ? 'Today: two-point discrimination. Blindfold, gentle pressure.' : 'Today: pulse and exercise. Fingertips, not the thumb.',
  });
  if (room) return room;
  const panel = task === 'PULSE' ? pulsePanel(id, ctx) : task === 'BREATH' ? breathPanel(id, ctx) : task === 'REACTION' ? reactPanel(id, ctx) : skinPanel(id, ctx);
  if (panel) return panel;
  switch (id) {
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers — this is what is marked.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
  }
  const extra = HUMAN_APPARATUS.find((a) => a.id === id);
  if (extra) return { title: extra.label, info: extra.for.includes(task) ? undefined : 'Not needed for this practical.', actions: [{ key: 'return', label: 'Put back in the cupboard', run: () => (h.note(`return:${extra.id}`), setView({ selected: null })) }] };
  return null;
}

/** The hint for practice mode with guided mode off (the 2D lab's hint, plus the 3D set-up steps first). */
export function humanHint3d(ctx: HumanCtx, plain: string): string {
  const { scene, s } = ctx;
  const task = s.task ?? 'PULSE';
  if (!scene.coat) return 'Put on a lab coat: it hangs on the hooks by the door.';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the apparatus cupboard: ${missing.map((a) => lc(a.label)).join(', ')}.`;
  return plain;
}
