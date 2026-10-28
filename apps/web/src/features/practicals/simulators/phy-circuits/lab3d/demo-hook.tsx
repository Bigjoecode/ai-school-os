import type { CircuitsTask, PhyCircuitsState } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer } from '../../../lab3d-kit/demo-player';
import { useCircuits } from '../actions';
import { Notebook } from '../index';
import { BENCH_IDLE, useBench } from './bench-store';
import { demoCalculation, demoEmpty, demoScript, demoSeed, type DemoCtx } from './demo';

const noop = () => undefined;

/** The demo: its own seed and in-memory state, played by the kit's demo engine. */
export function useCircuitsDemo({ studentSeed, startedAt, task, active, onFinished }: { studentSeed: number; startedAt: string; task: CircuitsTask; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const [state, setState] = useState<PhyCircuitsState>(() => demoEmpty(task));
  const o = useCircuits({ seed, state, onChange: setState, readOnly: false, startedAt, autoTask: false });
  const steps = useMemo(() => demoScript(task), [task]);
  const ctx = (): DemoCtx => ({ o, v: o.v, s: () => o.ref.current });
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx,
    reset: () => {
      useBench.setState(BENCH_IDLE);
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
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[55%] w-[400px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <Notebook task={task} state={state} readOnly update={noop} removeReading={noop} />
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
