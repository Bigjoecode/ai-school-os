import {
  CAL_OBJECT_NAME,
  CAL_PLACES,
  FLOAT_CARD,
  SAND_SCOOPS,
  SHOT_SCOOPS,
  bottleMass,
  calFits,
  floatSinks,
  labRandom,
  phyDensityVariant,
  densityRidersSum,
  type BottleFill,
  type BottleSample,
  type CalObj,
  type CalTool,
  type DensityDepth,
  type DensityRiders,
  type DensityTask,
  type DensityWeighItem,
  type PhyDensityState,
  type PhyDensityVariant,
} from '@aischool/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The density labs' state transitions, shared by the 2D and the 3D lab so both
 * produce the same state and action log. Calipers: take the vernier or the
 * micrometer, put an object in the jaws (or nothing, for the zero error), close
 * them gently / with the ratchet (or force the thimble), turn the object, take a
 * reading. Archimedes: zero the spring balance, hang the stone, fill the eureka
 * can, place the catch beaker, lower the stone, shake off bubbles, dry it, take
 * a reading. Flotation: add lead shot, float the tube, free it from the wall,
 * read the depth. Bottle: fill, top up, tap out bubbles, stopper, wipe, empty,
 * dry or rinse, add sand, read the thermometer. Everything is weighed on the
 * triple-beam balance (its riders and pan are live, a weighing is saved). The
 * eye's position for each reading (square on, or to one side) is live too.
 */

export const LESSON_TASK: Record<string, DensityTask> = {
  'pr-phy-vernier-micrometer': 'CAL',
  'pr-phy-archimedes-relative-density': 'ARCH',
  'pr-phy-flotation-test-tube': 'FLOAT',
  'pr-phy-density-bottle': 'BOTTLE',
};
export const lessonTask = (practicalId?: string): DensityTask => (practicalId && LESSON_TASK[practicalId]) || 'CAL';
export const TASK_NAME: Record<DensityTask, string> = { CAL: 'Vernier calipers and micrometer', ARCH: 'Archimedes’ principle', FLOAT: 'Law of flotation', BOTTLE: 'Density bottle' };
export const MAX = { cal: 60, sb: 40, depths: 40, weighs: 40, rows: 10 };
/** Water that runs into a catch beaker left under the spout while the can is filled (cm³). */
export const CAN_DRIP = 6;
/** The eye: −1 below / left, 0 square on, +1 above / right. */
export type Eye = -1 | 0 | 1;
const r2 = (x: number) => Math.round(x * 100) / 100;
const frac = (d: DensityDepth) => (d === 'part' ? 0.5 : 1);
/** A tube dropped into the cylinder drifts to the wall now and then (deterministic per attempt and load). */
const drifts = (seed: number, load: number, n: number) => labRandom(seed, `float-drift-${load}-${n}`)() < 0.4;
/** Filling the bottle quickly traps a bubble now and then (always over sand). */
const traps = (seed: number, n: number, sand: number) => sand > 0 || labRandom(seed, `bottle-bubble-${n}`)() < 0.5;

/** What the pan holds (g) for the item. */
export function panMass(v: PhyDensityVariant, s: PhyDensityState, item: DensityWeighItem | null): number {
  if (item === 'beaker') return v.beakerG + (s.caught * v.rhoW) / 1000;
  if (item === 'tube') return v.tubeM;
  if (item === 'bottle') return bottleMass(v, s.bottle);
  return 0;
}
/** The can's water below the spout now (cm³). */
export const canDeficit = (v: PhyDensityVariant, s: PhyDensityState) => (s.deficit < 0 ? v.deficit : s.deficit);
export const objName = (o: CalObj | null, inside = false) => (o ? `${CAL_OBJECT_NAME[o]}${o === 'tube' ? (inside ? ' (inside)' : ' (outside)') : ''}` : 'nothing (zero check)');

export function densityHint(s: PhyDensityState, pan: DensityWeighItem | null): string {
  const t = s.task;
  if (!t) return 'Choose the experiment first.';
  if (t === 'CAL') {
    const vz = s.cal.some((r) => r.tool === 'V' && !r.obj);
    const mz = s.cal.some((r) => r.tool === 'M' && !r.obj);
    const cyl = new Set(s.cal.filter((r) => r.tool === 'V' && r.obj === 'cyl').map((r) => r.pos)).size;
    const ball = new Set(s.cal.filter((r) => r.tool === 'M' && r.obj === 'ball').map((r) => r.pos)).size;
    if (!vz) return s.tool !== 'V' ? 'Take the vernier calipers.' : 'Close the jaws on nothing and read the zero error (with its sign).';
    if (cyl < 3) return s.held !== 'cyl' ? 'Put the wooden cylinder between the outside jaws.' : s.closed ? 'Read the main scale and the coinciding vernier line, then take the reading. Turn the cylinder for the next place.' : 'Close the jaws gently until they just touch.';
    if (!mz) return s.tool !== 'M' ? 'Now take the micrometer screw gauge.' : 'Close it on nothing with the ratchet and read the zero error.';
    if (ball < 3) return s.held !== 'ball' ? 'Put the ball bearing between the anvil and the spindle.' : s.closed ? 'Read the sleeve and the thimble line at the datum, take the reading, then turn the ball.' : 'Turn the ratchet until it clicks.';
    return 'Fill in the means, subtract the zero errors and work out the volume of the ball bearing.';
  }
  if (t === 'ARCH') {
    const kinds = new Set(s.sb.map((r) => r.where));
    if (!s.zeroed) return 'With nothing hanging, check the spring balance reads zero and adjust it.';
    if (!s.hung) return 'Hang the stone from the spring balance by its thread.';
    if (!kinds.has('air')) return 'Read its weight in air, W₁, with your eye level with the pointer.';
    if (!s.weighs.some((w) => w.item === 'beaker' && w.water === 0)) return pan === 'beaker' ? 'Balance the riders and record the empty beaker.' : 'Weigh the empty catch beaker on the balance.';
    if (!kinds.has('water') && s.deficit !== 0 && s.where !== 'water') return 'Fill the eureka can until water runs out of the spout, and let it stop dripping.';
    if (!kinds.has('water')) return !s.catchUnder && s.where === 'air' ? 'Put the catch beaker under the spout.' : s.where !== 'water' ? 'Lower the stone fully into the eureka can, not touching it.' : s.bubbles ? 'Shake off the air bubbles clinging to the stone.' : 'Read W₂.';
    if (!s.weighs.some((w) => w.item === 'beaker' && w.water > 0)) return 'Weigh the beaker with the displaced water.';
    if (!kinds.has('salt')) return s.where === 'water' ? 'Raise the stone out of the water.' : s.wet ? 'Dry the stone with tissue.' : s.where !== 'salt' ? 'Lower it fully into the salt solution.' : s.bubbles ? 'Shake off the bubbles.' : 'Read W₃.';
    return 'Work out the upthrust, the weight of water displaced and the relative densities.';
  }
  if (t === 'FLOAT') {
    if (!s.cal.some((r) => r.tool === 'V' && r.obj === 'tube' && !r.inside)) return s.tool !== 'V' ? 'Take the vernier: check its zero, then measure the tube’s external diameter.' : s.held !== 'tube' ? (s.cal.some((r) => r.tool === 'V' && !r.obj) ? 'Put the tube between the outside jaws.' : 'Close the jaws on nothing first: the zero error.') : 'Close the jaws on the tube and take the reading.';
    if (!s.weighs.some((w) => w.item === 'tube')) return pan === 'tube' ? 'Balance the riders and record the empty tube.' : 'Weigh the empty tube on the balance.';
    const loads = new Set(s.depths.map((d) => d.load));
    const next = FLOAT_CARD.find((l) => !loads.has(l));
    if (next === undefined) return 'Fill in m and h, plot h against m and find the slope and intercept.';
    if (s.load < next) return `Add lead shot: ${next * 10} g in the tube.`;
    if (!s.floating) return 'Float the tube in the water.';
    if (s.touching) return 'The tube is touching the side: free it so it floats in the middle.';
    return 'Read h at the flat water surface with your eye level with it, then take the reading.';
  }
  const grains = s.sample === 'grains';
  const has = (p: (b: PhyDensityState['bottle']) => boolean) => s.weighs.some((w) => w.item === 'bottle' && w.bottle && p(w.bottle));
  if (!s.tempRead) return 'Read the thermometer: the room temperature.';
  if (!has((b) => b.sand === 0 && b.fill === 'none')) return 'Weigh the clean, dry, empty bottle with its stopper (m₁).';
  if (grains) {
    if (!has((b) => b.sand > 0 && b.fill === 'none')) return 'Add three scoops of sand and weigh (m₂).';
    if (!has((b) => b.sand > 0 && b.fill === 'water')) return 'Top up the sand with water, tap out the air, stopper, wipe and weigh (m₃).';
    if (!has((b) => b.sand === 0 && b.fill === 'water')) return 'Empty and rinse, fill with water only, stopper, wipe and weigh (m₄).';
  } else {
    if (!has((b) => b.fill === 'water')) return 'Fill with water to the brim, stopper so the excess leaves by the capillary, wipe dry and weigh (m₂).';
    if (!has((b) => b.fill === 'liquid')) return 'Empty, dry the bottle (or rinse it with the liquid), fill with the liquid, stopper, wipe and weigh (m₃).';
  }
  return 'Work out the masses, the relative density and the density.';
}

export function useDensity({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  practicalId,
  variant,
  autoTask = true,
}: {
  seed: number;
  state: PhyDensityState;
  onChange: (next: PhyDensityState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  variant?: PhyDensityVariant;
  autoTask?: boolean;
}) {
  const seeded = useMemo(() => phyDensityVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  const [eye, setEyeState] = useState<Eye>(1);
  const [riders, setRidersState] = useState<DensityRiders>({ h: 0, t: 0, f: 0 });
  const [pan, setPanState] = useState<DensityWeighItem | null>(null);
  const eyeRef = useRef(eye);
  eyeRef.current = eye;
  const ridersRef = useRef(riders);
  ridersRef.current = riders;
  const panRef = useRef(pan);
  panRef.current = pan;
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task && ref.current.log.length < 3) {
      const t = lessonTask(practicalId);
      update((s) => (s.task ? s : { ...s, task: t }), 'task:auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: DensityTask = state.task ?? 'CAL';
  const s0 = () => ref.current;
  const clampR = (r: DensityRiders): DensityRiders => ({ h: Math.max(0, Math.min(5, r.h)), t: Math.max(0, Math.min(9, r.t)), f: Math.max(0, Math.min(10, Math.round(r.f * 10) / 10)) });
  const setEye = (e: Eye) => setEyeState(e);
  const n = (k: string) => s0().log.filter((e) => e.a.startsWith(k)).length;

  const o = {
    v,
    update,
    ref,
    task,
    eye,
    setEye,
    riders,
    pan,
    note: (a: string) => update((s) => s, a),
    chooseTask: (t: DensityTask) => update((s) => ({ ...s, task: t, line: null }), `task:${t}`),

    // ---- the vernier and the micrometer
    pickTool: (t: CalTool) => {
      if (s0().tool === t) return;
      setEyeState(1);
      update((s) => ({ ...s, tool: t, held: null, closed: false, forced: false, inside: false, pos: 0 }), `tool:${t}`);
    },
    /** Put an object between the jaws (null: take it out). Returns why not. */
    hold: (obj: CalObj | null, inside = false): string | null => {
      const s = s0();
      if (!s.tool) return 'Take the vernier or the micrometer first.';
      if (obj && !calFits(v, s.tool, obj, inside)) return s.tool === 'M' ? `The ${CAL_OBJECT_NAME[obj]} is too big for the micrometer (it opens to 25 mm): use the vernier.` : 'The inside jaws only go into the tube.';
      update((x) => ({ ...x, held: obj, inside: obj === 'tube' && inside, closed: false, forced: false, pos: obj === x.held ? x.pos : 0 }), `hold:${obj ?? 'none'}${inside ? ':inside' : ''}`);
      return null;
    },
    /** Close the jaws: gently (vernier), with the ratchet or (wrongly) by forcing the thimble. */
    close: (how: 'gentle' | 'ratchet' | 'thimble' = 'gentle'): string | null => {
      const s = s0();
      if (!s.tool) return 'Take the vernier or the micrometer first.';
      const forced = s.tool === 'M' && how === 'thimble';
      update((x) => ({ ...x, closed: true, forced }), `close:${how}`);
      return null;
    },
    open: () => s0().closed && update((x) => ({ ...x, closed: false, forced: false }), 'open'),
    /** Turn the object / move to the next place (the jaws are opened first). */
    turn: () => {
      const s = s0();
      if (!s.held) return;
      update((x) => ({ ...x, closed: false, forced: false, pos: (x.pos + 1) % CAL_PLACES }), `turn:${(s.pos + 1) % CAL_PLACES}`);
    },
    takeCal: (): string | null => {
      const s = s0();
      if (!s.tool) return 'Take an instrument first.';
      if (!s.closed) return s.tool === 'M' ? 'Close the micrometer with the ratchet first.' : 'Close the jaws first.';
      if (s.cal.length >= MAX.cal) return 'The record is full.';
      const r = { tool: s.tool, obj: s.held, pos: s.pos, forced: s.forced, eyeOk: eyeRef.current === 0, inside: s.inside };
      update((x) => ({ ...x, cal: [...x.cal, r] }), `read:${s.tool}:${s.held ?? 'zero'}:${s.pos}${r.forced ? ':forced' : ''}${r.eyeOk ? '' : ':parallax'}`);
      return null;
    },

    // ---- Archimedes
    zeroBalance: (): string | null => {
      if (s0().hung) return 'Take the stone off first: the zero is checked with nothing hanging.';
      update((x) => ({ ...x, zeroed: true }), 'sb:zero');
      return null;
    },
    hang: () => {
      if (s0().hung) return;
      setEyeState(1);
      update((x) => ({ ...x, hung: true, where: 'air', depth: 'full', bubbles: false }), 'sb:hang');
    },
    unhang: (): string | null => {
      if (s0().where !== 'air') return 'Raise the stone out of the liquid first.';
      update((x) => ({ ...x, hung: false }), 'sb:unhang');
      return null;
    },
    fillCan: (): string | null => {
      const s = s0();
      if (s.where === 'water') return 'Take the stone out of the can first.';
      const drip = s.catchUnder ? CAN_DRIP : 0;
      update((x) => ({ ...x, deficit: 0, caught: x.caught + drip, spill: x.spill }), `can:fill${drip ? ':into-beaker' : ''}`);
      return null;
    },
    placeCatch: (on: boolean) => {
      if (on && panRef.current === 'beaker') setPanState(null);
      update((x) => ({ ...x, catchUnder: on }), on ? 'catch:under' : 'catch:away');
    },
    emptyCatch: () => update((x) => ({ ...x, caught: 0 }), 'catch:empty'),
    /** Lower the hanging stone into the eureka can (water) or the beaker of salt solution. */
    lower: (where: 'water' | 'salt', depth: DensityDepth): string | null => {
      const s = s0();
      if (!s.hung) return 'Hang the stone on the balance first.';
      if (s.where !== 'air' && s.where !== where) return 'Raise the stone out of the other liquid first.';
      let { deficit, caught, spill } = s;
      if (where === 'water') {
        deficit = canDeficit(v, s);
        const old = s.where === 'water' ? frac(s.depth) : 0;
        const dV = (frac(depth) - old) * v.stoneV;
        if (dV > 0) {
          const over = Math.max(0, dV - deficit);
          deficit = Math.max(0, deficit - dV);
          if (over > 0) s.catchUnder ? (caught += over) : (spill = true);
        } else deficit -= dV;
      }
      const newIn = s.where === 'air';
      update((x) => ({ ...x, where, depth, deficit: r2(deficit), caught: r2(Math.min(400, caught)), spill, bubbles: newIn ? true : x.bubbles }), `sb:lower:${where}:${depth}`);
      return null;
    },
    raise: () => {
      const s = s0();
      if (s.where === 'air') return;
      const deficit = s.where === 'water' ? canDeficit(v, s) + frac(s.depth) * v.stoneV : s.deficit;
      update((x) => ({ ...x, where: 'air', depth: 'full', bubbles: false, wet: true, deficit: r2(deficit) }), 'sb:raise');
    },
    shake: () => s0().bubbles && update((x) => ({ ...x, bubbles: false }), 'sb:shake'),
    dryStone: (): string | null => {
      if (s0().where !== 'air') return 'Raise the stone out first.';
      update((x) => ({ ...x, wet: false }), 'sb:dry');
      return null;
    },
    wipeSpill: () => update((x) => ({ ...x, spill: false }), 'spill:wipe'),
    takeSb: (): string | null => {
      const s = s0();
      if (!s.hung && !s.zeroed) return 'Hang the stone first.';
      if (!s.hung) return 'Hang the stone first.';
      if (s.sb.length >= MAX.sb) return 'The record is full.';
      const r = { where: s.where, depth: s.depth, bubbles: s.bubbles && s.where !== 'air', zeroed: s.zeroed, eyeOk: eyeRef.current === 0, wet: s.wet && s.where === 'salt' };
      update((x) => ({ ...x, sb: [...x.sb, r] }), `sb:read:${s.where}:${s.depth}${r.bubbles ? ':bubbles' : ''}${r.eyeOk ? '' : ':parallax'}`);
      return null;
    },

    // ---- flotation
    addShot: (): string | null => {
      const s = s0();
      if (s.load >= SHOT_SCOOPS) return 'That is all the lead shot.';
      if (panRef.current === 'tube') setPanState(null);
      const load = s.load + 1;
      const sinks = s.floating && floatSinks(v, load);
      const touching = s.floating && !sinks && drifts(seed, load, n('float:'));
      update((x) => ({ ...x, load, touching, sunk: x.sunk || sinks }), sinks ? 'float:sunk' : `float:add:${load}`);
      return null;
    },
    removeShot: () => {
      const s = s0();
      if (s.load <= 0 || s.sunk) return;
      update((x) => ({ ...x, load: x.load - 1 }), `float:remove:${s.load - 1}`);
    },
    floatTube: (): string | null => {
      const s = s0();
      if (s.floating) return null;
      if (panRef.current === 'tube') setPanState(null);
      setEyeState(1);
      const sinks = floatSinks(v, s.load);
      update((x) => ({ ...x, floating: true, sunk: sinks, touching: !sinks && x.load > 0 && drifts(seed, x.load, n('float:')) }), sinks ? 'float:sunk' : 'float:in');
      return null;
    },
    liftTube: () => s0().floating && update((x) => ({ ...x, floating: false, touching: false, sunk: false }), 'float:out'),
    centre: () => s0().touching && update((x) => ({ ...x, touching: false }), 'float:centre'),
    takeDepth: (): string | null => {
      const s = s0();
      if (!s.floating) return 'Float the tube in the water first.';
      if (s.sunk) return 'The tube has sunk: lift it out and take some lead shot out.';
      if (s.load < 1) return 'With no lead shot the tube will not float upright: add some first.';
      if (s.depths.length >= MAX.depths) return 'The record is full.';
      const r = { load: s.load, touching: s.touching, eyeOk: eyeRef.current === 0 };
      const newRow = !s.rows.includes(s.load) && s.rows.length < MAX.rows;
      update((x) => ({ ...x, depths: [...x.depths, r], rows: newRow ? [...x.rows, s.load] : x.rows, float: newRow ? [...x.float, { m: '', h: '' }] : x.float }), `float:read:${s.load}${r.touching ? ':touching' : ''}${r.eyeOk ? '' : ':parallax'}`);
      return null;
    },
    removeRow: (i: number) =>
      update((x) => {
        const load = x.rows[i];
        return { ...x, rows: x.rows.filter((_, k) => k !== i), float: x.float.filter((_, k) => k !== i), depths: x.depths.filter((d) => d.load !== load) };
      }, `remove-row:${i}`),

    // ---- density bottle
    setSample: (sample: BottleSample) => !s0().weighs.length && update((x) => ({ ...x, sample }), `sample:${sample}`),
    fill: (f: Exclude<BottleFill, 'none'>): string | null => {
      const s = s0();
      if (s.bottle.fill !== 'none') return 'Empty the bottle first.';
      if (s.stoppered) return 'Take the stopper out first.';
      if (f === 'liquid' && s.sample === 'grains') return 'For the grains, use water.';
      const bubble = traps(seed, n('bottle:fill'), s.bottle.sand);
      update((x) => ({ ...x, bottle: { ...x.bottle, fill: f, toCap: false, bubble }, brim: false }), `bottle:fill:${f}`);
      return null;
    },
    topUp: (): string | null => {
      const s = s0();
      if (s.bottle.fill === 'none') return 'Fill the bottle first.';
      if (s.stoppered) return 'Take the stopper out to top it up.';
      update((x) => ({ ...x, brim: true }), 'bottle:topup');
      return null;
    },
    tap: () => s0().bottle.bubble && update((x) => ({ ...x, bottle: { ...x.bottle, bubble: false }, brim: false }), 'bottle:tap'),
    stopper: () => {
      const s = s0();
      if (s.stoppered) return;
      const full = s.bottle.fill !== 'none' && s.brim;
      update((x) => ({ ...x, stoppered: true, bottle: { ...x.bottle, toCap: full, outsideWet: x.bottle.outsideWet || full } }), `bottle:stopper${s.bottle.fill !== 'none' && !full ? ':not-full' : ''}`);
    },
    unstopper: () => s0().stoppered && update((x) => ({ ...x, stoppered: false, bottle: { ...x.bottle, toCap: false } }), 'bottle:unstopper'),
    wipe: () => update((x) => ({ ...x, bottle: { ...x.bottle, outsideWet: false } }), 'bottle:wipe'),
    empty: () => {
      const b = s0().bottle;
      if (b.fill === 'none' && !b.sand) return;
      update((x) => ({ ...x, stoppered: false, brim: false, bottle: { ...x.bottle, sand: 0, fill: 'none', toCap: false, bubble: false, film: x.bottle.fill === 'none' ? x.bottle.film : x.bottle.fill } }), 'bottle:empty');
    },
    dry: (): string | null => {
      if (s0().bottle.fill !== 'none' || s0().bottle.sand) return 'Empty the bottle first.';
      update((x) => ({ ...x, bottle: { ...x.bottle, film: 'none', outsideWet: false } }), 'bottle:dry');
      return null;
    },
    rinse: (): string | null => {
      if (s0().bottle.fill !== 'none' || s0().bottle.sand) return 'Empty the bottle first.';
      update((x) => ({ ...x, bottle: { ...x.bottle, film: 'liquid' } }), 'bottle:rinse');
      return null;
    },
    addSand: (): string | null => {
      const s = s0();
      if (s.bottle.fill !== 'none') return 'Add the sand to the empty bottle.';
      if (s.bottle.sand >= SAND_SCOOPS) return 'That is enough sand.';
      update((x) => ({ ...x, stoppered: false, bottle: { ...x.bottle, sand: x.bottle.sand + 1 } }), `bottle:sand:${s.bottle.sand + 1}`);
      return null;
    },
    readTemp: () => update((x) => ({ ...x, tempRead: true }), 'thermo:read'),

    // ---- the balance
    setPan: (item: DensityWeighItem | null): string | null => {
      const s = s0();
      if (item === 'tube' && s.load > 0) return 'Tip the lead shot out first: weigh the empty tube.';
      if (item === 'tube' && s.floating) return 'Lift the tube out of the water and dry it first.';
      if (item === 'beaker' && s.catchUnder) update((x) => ({ ...x, catchUnder: false }), 'catch:away');
      setPanState(item);
      if (item) update((x) => x, `pan:${item}`);
      return null;
    },
    setRiders: (r: DensityRiders) => setRidersState(clampR(r)),
    nudgeRider: (which: keyof DensityRiders, d: number) => setRidersState((r) => clampR({ ...r, [which]: r[which] + d })),
    panMass: () => panMass(v, ref.current, panRef.current),
    weigh: (): string | null => {
      const s = s0();
      const item = panRef.current;
      if (!item) return 'Put something on the pan first.';
      if (s.weighs.length >= MAX.weighs) return 'The record is full.';
      const w = { item, riders: densityRidersSum(ridersRef.current), water: item === 'beaker' ? s.caught : 0, bottle: item === 'bottle' ? { ...s.bottle } : null };
      update((x) => ({ ...x, weighs: [...x.weighs, w] }), `weigh:${item}:${w.riders.toFixed(1)}`);
      return null;
    },
    setCell: (id: string, value: string) => update((x) => ({ ...x, cells: { ...x.cells, [id]: value.slice(0, 40) } })),
  };
  return o;
}
export type Density = ReturnType<typeof useDensity>;

/** Re-renders on a timer while `on`. */
export function useLive(on: boolean, ms = 80) {
  const [, tick] = useReducer((k: number) => k + 1, 0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [on, ms]);
}
