import { GLASS_ANGLE_MAX, GLASS_SHEET, phyGlassVariant, phyToRad, type GlassPoint, type GlassTrace, type PhyGlassState, type PhyGlassVariant } from '@aischool/shared';
import { useMemo } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The glass-block lab's state transitions, shared by the 2D and the 3D lab so
 * both produce exactly the same state and action log: start a trace (outline
 * and incident ray at i), draw the normal, stick P₁…P₄ (same checks), move
 * P₃/P₄ (no log), remove the block and join, discard a trace.
 */

export type PinId = 'p1' | 'p2' | 'p3' | 'p4';
export const PIN_LABEL: Record<PinId, string> = { p1: 'P₁', p2: 'P₂', p3: 'P₃', p4: 'P₄' };
/** The eye's line (cm) along the bottom of the sheet, looking back through face CD. */
export const EYE_Y = GLASS_SHEET.bottom + 0.5;
export const r2 = (x: number) => Math.round(x * 100) / 100;
/** How far along the incident ray a pin can go before leaving the sheet. */
export const maxS = (i: number) => Math.min((GLASS_SHEET.top - 0.5) / Math.cos(phyToRad(i)), (-GLASS_SHEET.left - 0.5) / Math.sin(phyToRad(i)));
/** The angle offered for the next trace after one at `i`. */
export const nextAngle = (i: number) => Math.min(GLASS_ANGLE_MAX, i + 10);

/** Where a tap at `p` (cm) puts the pin `pin` on trace `t`, or why it can't go there. */
export function pinAt(v: PhyGlassVariant, t: GlassTrace, pin: PinId, p: GlassPoint): { patch: Partial<GlassTrace> } | { error: string } {
  if (pin === 'p1' || pin === 'p2') {
    const a = phyToRad(t.i);
    const s = -p.x * Math.sin(a) + p.y * Math.cos(a);
    const perp = Math.abs(p.x * Math.cos(a) + p.y * Math.sin(a));
    if (perp > 0.8 || s < 0.5 || s > maxS(t.i)) return { error: 'P₁ and P₂ go on the incident ray you drew (above face AB).' };
    return { patch: { [pin]: r2(s) } };
  }
  if (p.y > -v.thickness - 0.3) return { error: 'P₃ and P₄ go on the far side of face CD (below the block).' };
  return { patch: { [pin]: { x: r2(p.x), y: r2(p.y) } } };
}

export function useGlass({ seed, state, onChange, readOnly, startedAt, variant }: { seed: number; state: PhyGlassState; onChange: (s: PhyGlassState) => void; readOnly: boolean; startedAt: string; variant?: PhyGlassVariant }) {
  const seeded = useMemo(() => phyGlassVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  const openIndexOf = (s: PhyGlassState) => s.traces.findIndex((t) => !t.joined);
  const openIndex = openIndexOf(state);
  const open = openIndex >= 0 ? state.traces[openIndex]! : null;
  const setTrace = (patch: Partial<GlassTrace>, log?: string) =>
    update((s) => {
      const k = openIndexOf(s);
      return { ...s, traces: s.traces.map((t, j) => (j === k ? { ...t, ...patch } : t)) };
    }, log);
  const g = {
    v,
    update,
    ref,
    openIndex,
    open,
    done: state.traces.filter((t) => t.joined).length,
    /** Trace the outline and draw the incident ray at i (a fresh sheet). */
    newTrace: (i: number) =>
      update((s) => ({ ...s, traces: [...s.traces, { i, normal: false, p1: null, p2: null, p3: null, p4: null, joined: false }].slice(0, 10), table: [...s.table, { i: '', r: '', sini: '', sinr: '' }].slice(0, 10) }), `trace:${i}`),
    removeTrace: (k: number) => update((s) => ({ ...s, traces: s.traces.filter((_, j) => j !== k), table: s.table.filter((_, j) => j !== k) }), `remove-trace:${k}`),
    drawNormal: () => setTrace({ normal: true }, 'normal'),
    /** Sticks a pin where the student tapped; returns why not, if it can't go there. */
    placePin: (pin: PinId, p: GlassPoint): string | null => {
      const t = ref.current.traces[openIndexOf(ref.current)];
      if (!t) return 'Start a trace first.';
      const r = pinAt(v, t, pin, p);
      if ('error' in r) return r.error;
      setTrace(r.patch, `pin-${pin}`);
      return null;
    },
    nudge: (pin: 'p3' | 'p4', dx: number, dy: number) => {
      const t = ref.current.traces[openIndexOf(ref.current)];
      const p = t?.[pin];
      if (!p) return;
      setTrace({ [pin]: { x: r2(p.x + dx), y: r2(Math.min(-v.thickness - 0.3, p.y + dy)) } });
    },
    /** Drag P₃ / P₄ to `p` (no log). */
    dragPin: (pin: 'p3' | 'p4', p: GlassPoint) => setTrace({ [pin]: { x: r2(p.x), y: r2(Math.min(-v.thickness - 0.3, p.y)) } }),
    join: () => setTrace({ joined: true }, 'join'),
    /** A note in the action log (3D-only steps: collecting apparatus, the safety briefing), no marks. */
    note: (a: string) => update((s) => s, a),
  };
  return g;
}
export type Glass = ReturnType<typeof useGlass>;
