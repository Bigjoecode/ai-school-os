import type { PhyGlassState } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer } from '../../../lab3d-kit/demo-player';
import { useLabView } from '../../../lab3d-kit/store';
import { useGlass } from '../actions';
import { Notebook } from '../index';
import { BENCH_IDLE, useBench } from './bench-store';
import { demoCalculation, demoEmpty, demoScript, demoSeed, makeOps, type DemoCtx } from './demo';

const noop = () => undefined;

/** The glass-block demo: its own seed and in-memory state, played by the kit's demo engine. */
export function useGlassDemo({ studentSeed, startedAt, precautions, active, onFinished }: { studentSeed: number; startedAt: string; precautions: string[]; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const [state, setState] = useState<PhyGlassState>(demoEmpty);
  const g = useGlass({ seed, state, onChange: setState, readOnly: false, startedAt });
  const steps = useMemo(() => demoScript(g.v, precautions), [g.v, precautions]);
  const ctx = (): DemoCtx => ({ g, v: g.v, s: () => g.ref.current, ops: () => makeOps(g) });
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx,
    reset: () => {
      useBench.setState(BENCH_IDLE);
      useLabView.setState({ spot: null });
      g.ref.current = demoEmpty();
      setState(g.ref.current);
    },
    onEnter: (step) => {
      if (step.id !== 'sight' && step.id !== 'p34') useBench.setState({ sight: false });
    },
    goggles: () => false,
    active,
    onFinished,
  });
  const calc = useMemo(() => demoCalculation(state), [state]);
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[55%] w-[380px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <Notebook state={state} readOnly update={noop} removeTrace={noop} />
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
  return { player, state, g, panel };
}
