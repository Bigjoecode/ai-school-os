import type { GenCheckInput, GenCheckResult, GenPaper, GenPracticalState } from '@aischool/shared';
import { useCallback, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';

export const GEN_STAGES = [
  { key: 'safety', label: 'Safety', title: 'Safety before you start' },
  { key: 'setout', label: 'Set out', title: 'Set out your bench' },
  { key: 'procedure', label: 'Procedure', title: 'Procedure and decisions' },
  { key: 'observe', label: 'Results', title: 'Observe and record' },
  { key: 'fault', label: 'Faults', title: 'Spot the fault' },
  { key: 'writeup', label: 'Write-up', title: 'Precautions and explanation' },
] as const;

/** Stage i has been answered (the checklist's tick). */
export function stageDone(s: GenPracticalState, p: GenPaper, i: number): boolean {
  if (i === 0) return s.safety.length > 0;
  if (i === 1) return s.tools.length > 0;
  if (i === 2) return s.order.length >= p.steps.length && p.decisions.every((d) => !!s.decisions[d.id]);
  if (i === 3) return p.observations.every((o) => !!s.observations[o.id]) && p.numerics.every((n) => !!s.numerics[n.id]?.value.trim());
  if (i === 4) return p.faults.every((f) => !!s.faults[f.id]?.length);
  return !!s.written.precautions.trim() && !!s.written.explanation.trim();
}

const check = (attemptId: string, body: GenCheckInput) => api.post<GenCheckResult>(`/learning/practicals/labs/${attemptId}/guided-check`, body);

/**
 * The Guided practical's state changes, used alike by the 2D and 3D views.
 * Only choices are recorded (opaque ids); what they earn comes from the server:
 * at marking, or from a guided check while the paper allows it.
 */
export function useGen({ paper, state, onChange, readOnly, startedAt, attemptId }: { paper: GenPaper; state: GenPracticalState; onChange: (s: GenPracticalState) => void; readOnly: boolean; startedAt: string; attemptId?: string }) {
  const ref = useRef(state);
  ref.current = state;
  const [results, setResults] = useState<Record<string, GenCheckResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const update = useCallback(
    (fn: (s: GenPracticalState) => GenPracticalState, note?: string) => {
      if (readOnly) return;
      const next = fn(ref.current);
      const t = Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000));
      const out = note ? { ...next, log: [...next.log, { t, a: note }].slice(-700) } : next;
      ref.current = out;
      onChange(out);
    },
    [onChange, readOnly, startedAt],
  );
  const canCheck = paper.feedback && !!attemptId && !readOnly;
  const runCheck = useCallback(
    async (key: string, input: GenCheckInput) => {
      if (!canCheck) return null;
      setBusy(key);
      try {
        const r = await check(attemptId!, input);
        setResults((x) => ({ ...x, [key]: r }));
        return r;
      } catch {
        return null;
      } finally {
        setBusy(null);
      }
    },
    [attemptId, canCheck],
  );
  const clearResult = (key: string) => setResults((x) => (x[key] ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== key)) : x));

  const actions = useMemo(
    () => ({
      setStage: (stage: number) => update((s) => ({ ...s, stage }), `stage:${stage}`),
      toggle: (list: 'safety' | 'tools', id: string) => update((s) => ({ ...s, [list]: s[list].includes(id) ? s[list].filter((x) => x !== id) : [...s[list], id] }), `${list}:${id}`),
      place: (id: string) => update((s) => (s.order.includes(id) ? s : { ...s, order: [...s.order, id] })),
      unplace: (id: string) => update((s) => ({ ...s, order: s.order.filter((x) => x !== id) })),
      move: (id: string, by: -1 | 1) =>
        update((s) => {
          const i = s.order.indexOf(id);
          const j = i + by;
          if (i < 0 || j < 0 || j >= s.order.length) return s;
          const order = [...s.order];
          order[i] = order[j]!;
          order[j] = id;
          return { ...s, order };
        }),
      choose: (list: 'decisions' | 'observations', id: string, option: string) => update((s) => ({ ...s, [list]: { ...s[list], [id]: option } }), `${list}:${id}`),
      numeric: (id: string, patch: Partial<{ value: string; unit: string }>) => update((s) => ({ ...s, numerics: { ...s.numerics, [id]: { ...(s.numerics[id] ?? { value: '', unit: '' }), ...patch } } })),
      toggleFault: (id: string, line: string) =>
        update((s) => {
          const cur = s.faults[id] ?? [];
          return { ...s, faults: { ...s.faults, [id]: cur.includes(line) ? cur.filter((x) => x !== line) : [...cur, line] } };
        }, `fault:${id}`),
      write: (k: 'precautions' | 'explanation', v: string) => update((s) => ({ ...s, written: { ...s.written, [k]: v } })),
      note: (a: string) => update((s) => s, a),
    }),
    [update],
  );
  return { paper, s: state, readOnly, canCheck, results, busy, runCheck, clearResult, ...actions };
}
export type GenHandle = ReturnType<typeof useGen>;
