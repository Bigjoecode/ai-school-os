import { SKIN_AREAS, bioHumanVariant, roundDp, type BioHumanVariant, type HumanTask, type SkinArea } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import type { Spot } from '../../../lab3d-kit/store';

/**
 * The human physiology bench: where things stand (station-local metres: x
 * along the bench, y up from its top, z towards the student), where the
 * partner sits for each task, the camera presets, the bench's own view state
 * (the skin area and separation chosen, animation times) and the demo /
 * sandbox variants.
 */

type V3 = readonly [number, number, number];
export const FLOOR = -BENCH.h;
export const HSPOT = {
  card: [-0.95, 0, -0.18] as V3,
  book: [-0.98, 0, 0.27] as V3,
  extras: [-1.14, 0, 0.0] as V3,
  clock: [-0.45, 0, 0.18] as V3,
  // pulse
  step: [1.75, FLOOR, -0.55] as V3,
  wrist: [0.22, 0.035, -0.2] as V3,
  // breath
  apparatus: [0.0, 0, -0.16] as V3,
  limewater: [-0.3, 0, -0.2] as V3,
  mouthpiece: [-0.28, 0, 0.12] as V3,
  mirror: [0.36, 0, 0.06] as V3,
  cobalt: [0.56, 0, 0.12] as V3,
  thermometer: [0.36, 0, 0.3] as V3,
  // reaction
  rule: [1.12, 0.035, 0.5] as V3,
  ruleRest: [0.4, 0, 0.3] as V3,
  // skin
  dividers: [0.0, 0, 0.22] as V3,
  mmrule: [-0.3, 0, 0.3] as V3,
  blindfold: [0.45, 0, 0.15] as V3,
  wipes: [0.62, 0, 0.26] as V3,
};

/** Where the partner sits (station-local x, z) and faces, for each task. */
export const PARTNER_AT: Record<HumanTask, { at: [number, number]; yaw: number }> = {
  PULSE: { at: [0.3, -0.72], yaw: 0 },
  BREATH: { at: [0.0, -0.7], yaw: 0 },
  REACTION: { at: [1.62, 0.22], yaw: -Math.PI / 2 },
  SKIN: { at: [0.2, -0.72], yaw: 0 },
};
/** The skin areas on the partner (station-local points). */
export const SKIN_POINT: Record<SkinArea, [number, number, number]> = {
  FINGERTIP: [0.06, 0.045, -0.06],
  PALM: [0.08, 0.05, -0.13],
  BACK_HAND: [0.36, 0.055, -0.14],
  FOREARM: [0.11, 0.05, -0.27],
  NECK: [0.255, 0.375, -0.745],
};

const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const HUMAN_VIEWS: CameraPresets = {
  partner: { target: [0.25, 0.15, -0.45], dist: 1.25, pitch: 0.22 },
  wrist: { target: local(HSPOT.wrist, 0.03), dist: 0.5, pitch: 0.5 },
  step: { target: [1.6, -0.15, -0.55], dist: 2.5, pitch: 0.3 },
  apparatus: { target: local(HSPOT.apparatus, 0.14), dist: 0.6, pitch: 0.25 },
  mirror: { target: local(HSPOT.mirror, 0.05), dist: 0.55, pitch: 0.4 },
  rule: { target: [1.12, 0.4, 0.5], dist: 1.6, pitch: 0.12 },
  knee: { target: [1.45, -0.32, 0.38], dist: 1.1, pitch: 0.25 },
  arm: { target: [0.2, 0.05, -0.18], dist: 0.6, pitch: 0.55 },
  neck: { target: [0.22, 0.38, -0.72], dist: 0.6, pitch: 0.12 },
};
export const VIEW_BUTTONS: Record<HumanTask, { id: string; label: string }[]> = {
  PULSE: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'wrist', label: 'Wrist' },
    { id: 'step', label: 'Step' },
  ],
  BREATH: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'apparatus', label: 'Lime water' },
    { id: 'mirror', label: 'Mirror' },
  ],
  REACTION: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'rule', label: 'Rule' },
    { id: 'knee', label: 'Knee' },
  ],
  SKIN: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'arm', label: 'Arm and hand' },
    { id: 'neck', label: 'Neck' },
  ],
};
export const spotOf = (p: V3, y: number, dist: number, pitch = 0.3, yaw?: number): Spot => ({ target: [p[0], y, p[2]], dist, pitch, ...(yaw !== undefined ? { yaw } : {}) });
export const world = (p: V3, y = 0): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1] + y, STATION[2] + p[2]];

interface HumanBench {
  /** The skin area and separation chosen (mm). */
  area: SkinArea;
  sep: number;
  /** Animation times (performance.now ms). */
  dropAt: number;
  touchAt: number;
  kneeAt: number;
  breatheAt: number;
  exAt: number;
  countAt: number;
  set: (p: Partial<Omit<HumanBench, 'set'>>) => void;
}
export const BENCH_IDLE = { area: 'FINGERTIP' as SkinArea, sep: 10, dropAt: 0, touchAt: 0, kneeAt: 0, breatheAt: 0, exAt: 0, countAt: 0 };
export const useHumanBench = create<HumanBench>((set) => ({ ...BENCH_IDLE, set: (p) => set(p) }));
export const recent = (at: number, ms: number) => at > 0 && performance.now() - at < ms;

// ------------------------------------------------------------------ demo and sandbox variants

/** The demonstration's partner: never the student's own (the demo would give their answers away). */
export function demoVariant(studentSeed: number, task: HumanTask): BioHumanVariant {
  const mine = bioHumanVariant(studentSeed, task);
  for (let s = 9201; s < 9600; s++) {
    const v = bioHumanVariant(s, task);
    if (Math.abs(v.pulse.rest - mine.pulse.rest) >= 5 && Math.abs(v.breath.rate - mine.breath.rate) >= 1.5 && Math.abs(v.react.tDom - mine.react.tDom) >= 0.008 && Math.abs(v.skin.thr.PALM - mine.skin.thr.PALM) >= 1.5) return v;
  }
  return bioHumanVariant(9201, task);
}

export const PARTNERS = [
  { id: 'athlete', label: 'A trained athlete (low resting pulse, fast recovery, quick reactions)', rest: 56, offTau: 1.0, tDom: 0.165, breath: 12 },
  { id: 'typical', label: 'A typical classmate', rest: 72, offTau: 1.7, tDom: 0.195, breath: 16 },
  { id: 'unfit', label: 'A classmate who rarely exercises (slow recovery)', rest: 84, offTau: 2.8, tDom: 0.215, breath: 18 },
];
export const SKINS = [
  { id: 'sensitive', label: 'Very sensitive skin (small thresholds)', f: 0.7 },
  { id: 'typical', label: 'Typical skin', f: 1 },
  { id: 'coarse', label: 'Less sensitive skin (large thresholds)', f: 1.3 },
];
/** A sandbox variant: a chosen partner and skin. */
export function sandboxVariant(task: HumanTask, o: { partner: string; skin: string }, seed = 717_171): BioHumanVariant {
  const v = bioHumanVariant(seed, task);
  const p = PARTNERS.find((x) => x.id === o.partner) ?? PARTNERS[1]!;
  const k = SKINS.find((x) => x.id === o.skin) ?? SKINS[1]!;
  const thr = Object.fromEntries(SKIN_AREAS.map((a) => [a, roundDp(Math.min(58, v.skin.thr[a] * k.f), 1)])) as Record<SkinArea, number>;
  return { ...v, pulse: { ...v.pulse, rest: p.rest, offTau: p.offTau }, react: { ...v.react, tDom: p.tDom }, breath: { ...v.breath, rate: p.breath }, skin: { ...v.skin, thr } };
}
