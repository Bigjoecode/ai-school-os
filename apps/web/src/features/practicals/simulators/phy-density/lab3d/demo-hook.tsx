import type { DensityTask, PhyDensityState } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer } from '../../../lab3d-kit/demo-player';
import { useLabView } from '../../../lab3d-kit/store';
import { useDensity } from '../actions';
import { Notebook } from '../index';
import { InstrumentView } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { demoCalculation, demoEmpty, demoScript, demoSeed, makeOps, type DemoCtx } from './demo';

const noop = () => undefined;

/** The density demo: its own seed and in-memory state, played by the kit's demo engine. */
export function useDensityDemo({ task, studentSeed, startedAt, active, onFinished }: { task: DensityTask; studentSeed: number; startedAt: string; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const [state, setState] = useState<PhyDensityState>(() => demoEmpty(task));
  const o = useDensity({ seed, state, onChange: setState, readOnly: false, startedAt, autoTask: false });
  const steps = useMemo(() => demoScript(task), [task]);
  const ctx = (): DemoCtx => ({ o, v: o.v, s: () => o.ref.current, ops: () => makeOps(o) });
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx,
    reset: () => {
      useBench.setState(BENCH_IDLE);
      useLabView.setState({ spot: null });
      o.setPan(null);
      o.setRiders({ h: 0, t: 0, f: 0 });
      o.setEye(1);
      o.ref.current = demoEmpty(task);
      setState(o.ref.current);
    },
    goggles: () => false,
    active,
    onFinished,
  });
  const calc = useMemo(() => demoCalculation(state), [state]);
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[55%] w-[420px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <Notebook task={task} state={state} readOnly o={{ update: noop, removeRow: noop, setCell: noop }} />
      </section>
    ) : id === 'loupe' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 rounded-2xl bg-card p-2 text-card-foreground shadow-xl max-sm:left-2 max-sm:top-auto max-sm:bottom-44 sm:w-[440px]" aria-label="Close-up of the instrument">
        <InstrumentView o={o} s={state} />
      </section>
    ) : id === 'calc' && calc.length > 0 ? (
      <section className="absolute inset-x-2 top-40 z-10 mx-auto max-w-lg rounded-2xl bg-card p-4 text-card-foreground shadow-xl" aria-label="Worked calculation">
        <p className="font-display text-[15px] font-semibold tracking-tight">Worked calculation (demonstration values)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px]">
          {calc.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
      </section>
    ) : null;
  return { player, state, o, panel };
}
