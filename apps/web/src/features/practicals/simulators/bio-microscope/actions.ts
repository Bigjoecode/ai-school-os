import { MICRO_FOCUS_TOL, bioMicroscopeVariant, microBrightness, type BioMicroscopeState, type BioMicroscopeVariant, type MicroScope } from '@aischool/shared';
import { useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The microscope's state transitions, shared by the 2D and the 3D lab so both
 * produce exactly the same `BioMicroscopeState` (the grader cannot tell them
 * apart). Every change goes through `update`, which appends to the action log.
 */

export type MicroUpdate = (fn: (s: BioMicroscopeState) => BioMicroscopeState, log?: string) => void;
export type ScopeKind = 'coarse' | 'fine' | 'objective' | 'light';

/** A change to the microscope's controls, with its flags (low power first, coarse focus at ×40, a crash into the cover slip). */
export function scopeChange(s: BioMicroscopeState, v: BioMicroscopeVariant, patch: Partial<MicroScope>, kind: ScopeKind, log?: string): { next: BioMicroscopeState; log?: string } {
  const scope = { ...s.scope, ...patch };
  const flags = { ...s.flags };
  if (kind === 'objective' && scope.objective === 40 && !flags.focusedLow) flags.highBeforeLow = true;
  if (kind === 'coarse' && scope.objective === 40) flags.coarseAtHigh = Math.min(100_000, flags.coarseAtHigh + 1);
  if (kind === 'light') flags.lightAdjusted = true;
  if (s.prep.placed) {
    const d = scope.coarse + scope.fine - v.focus[scope.objective];
    if (scope.objective !== 40 && Math.abs(d) <= MICRO_FOCUS_TOL[scope.objective]) flags.focusedLow = true;
    if (scope.objective === 40 && kind === 'coarse' && d > 1.5 && !flags.crashed) {
      flags.crashed = true;
      log = 'crash';
    }
  }
  return { next: { ...s, scope, flags }, log };
}

/** Snapshot of the view at the objective in place (one per objective: the latest). */
export const captureView = (s: BioMicroscopeState, t: number): BioMicroscopeState => ({ ...s, captures: [...s.captures.filter((c) => c.objective !== s.scope.objective), { ...s.scope, t }].slice(-3) });

/** Placing the slide on the stage clips it and turns the ×4 objective into place. */
export const placeSlide = (s: BioMicroscopeState): BioMicroscopeState => ({ ...s, prep: { ...s.prep, placed: true, clipped: true }, scope: { ...s.scope, objective: 4 } });

/** What to do next (practice mode only). */
export function nextHint(s: BioMicroscopeState, v: BioMicroscopeVariant): string {
  const info = v.info;
  if (!s.prep.medium) return 'Choose what to mount the specimen in: think about what each stain shows.';
  if (!s.prep.coverslip) return 'Add the cover slip.';
  if (!s.prep.placed) return 'Place the slide on the stage and clip it.';
  const dz = s.scope.coarse + s.scope.fine - v.focus[s.scope.objective];
  const b = microBrightness(s.scope.lamp, s.scope.diaphragm, s.scope.objective);
  if (b < 0.3) return 'The field is dark: turn up the lamp (or open the diaphragm).';
  if (!s.flags.focusedLow) return s.scope.objective === 40 ? 'Go back to a low-power objective and focus there first.' : 'Raise the stage with the coarse focus until the specimen appears, then sharpen it with the fine focus.';
  if (!s.captures.some((c) => c.objective === info.measureObjective)) return s.scope.objective !== info.measureObjective ? `Turn to the ×${info.measureObjective} objective.` : Math.abs(dz) > MICRO_FOCUS_TOL[s.scope.objective] ? 'Sharpen the image with the fine focus.' : `Capture this ×${info.measureObjective} view for measuring.`;
  if (!s.captures.some((c) => c.objective === info.labelObjective)) return s.scope.objective !== info.labelObjective ? `Turn to the ×${info.labelObjective} objective — use only the fine focus at high power.` : Math.abs(dz) > MICRO_FOCUS_TOL[s.scope.objective] ? 'Use the fine focus until the edges are sharp.' : `Capture this ×${info.labelObjective} view for labelling.`;
  return 'Label the structures, measure, calculate, then write your observations and precautions.';
}

/** The microscope bench's actions on one state (the attempt's, or an in-memory demo / sandbox state). */
export function useMicroscope({ seed, state, onChange, readOnly, startedAt }: Pick<SimulatorProps<'bio-microscope'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt'>) {
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const v = useMemo(() => (state.slide ? bioMicroscopeVariant(seed, state.slide) : null), [seed, state.slide]);
  const vRef = useRef(v);
  vRef.current = v;
  const now = () => Math.max(0, Date.now() - t0);
  const update: MicroUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: now(), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  return {
    v,
    ref,
    update,
    /** A 3D-only step (no marks), written to the log so the bench can be rebuilt from it. */
    note: (a: string) => update((s) => s, a),
    setScope: (patch: Partial<MicroScope>, kind: ScopeKind, log?: string) => {
      const vv = vRef.current ?? (ref.current.slide ? bioMicroscopeVariant(seed, ref.current.slide) : null);
      if (!vv) return;
      const r = scopeChange(ref.current, vv, patch, kind, log);
      update(() => r.next, r.log);
    },
    capture: () => update((s) => captureView(s, now()), `capture:${ref.current.scope.objective}`),
  };
}
export type Microscope = ReturnType<typeof useMicroscope>;
