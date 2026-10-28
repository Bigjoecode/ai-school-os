import type { PhySpringState, SpringTask } from '@aischool/shared';
import { useMemo, useRef, useState } from 'react';
import { useDemoPlayer } from '../../../lab3d-kit/demo-player';
import { useLabView } from '../../../lab3d-kit/store';
import { makeClock, useSpring } from '../actions';
import { Notebook } from '../index';
import { BENCH_IDLE, useBench } from './bench-store';
import { demoCalculation, demoEmpty, demoScript, demoSeed, makeOps, type DemoCtx } from './demo';

const noop = () => undefined;

/** The spring demo: its own seed, clock and in-memory state, played by the kit's demo engine. */
export function useSpringDemo({ task, studentSeed, startedAt, precautions, active, onFinished }: { task: SpringTask; studentSeed: number; startedAt: string; precautions: string[]; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const clock = useRef(makeClock()).current;
  const [state, setState] = useState<PhySpringState>(() => demoEmpty(task));
  const o = useSpring({ seed, state, onChange: setState, readOnly: false, startedAt, autoTask: false, clock: clock.now });
  const steps = useMemo(() => demoScript(task, precautions), [task, precautions]);
  const ctx = (): DemoCtx => ({ o, v: o.v, s: () => o.ref.current, ops: () => makeOps(o), clock });
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx,
    reset: () => {
      useBench.setState(BENCH_IDLE);
      useLabView.setState({ spot: null });
      clock.setRate(1);
      o.steady();
      o.ref.current = demoEmpty(task);
      setState(o.ref.current);
    },
    onEnter: () => clock.rate() !== 1 && clock.setRate(1),
    goggles: () => false,
    active,
    onFinished,
  });
  const calc = useMemo(() => demoCalculation(state), [state]);
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[55%] w-[420px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <Notebook task={task} state={state} readOnly update={noop} removeRow={noop} removeRun={noop} />
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
  return { player, state, o, panel, clock };
}
