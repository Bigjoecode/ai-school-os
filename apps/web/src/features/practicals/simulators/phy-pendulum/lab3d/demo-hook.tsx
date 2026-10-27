import type { PhyPendulumState } from '@aischool/shared';
import { useMemo, useRef, useState } from 'react';
import { useDemoPlayer } from '../../../lab3d-kit/demo-player';
import { usePendulum } from '../actions';
import { Notebook } from '../index';
import { demoCalculation, demoEmpty, demoScript, demoSeed, type DemoCtx } from './demo';
import { BENCH_IDLE, makeClock, useBench } from './layout';

const noop = () => undefined;

/** The demo: its own seed, clock and in-memory state, played by the kit's demo engine. */
export function usePendulumDemo({ studentSeed, startedAt, active, onFinished }: { studentSeed: number; startedAt: string; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const clock = useRef(makeClock()).current;
  const [state, setState] = useState<PhyPendulumState>(demoEmpty);
  const p = usePendulum({ seed, state, onChange: setState, readOnly: false, startedAt, clock: clock.now });
  const steps = useMemo(() => demoScript(p.v), [p.v]);
  const ctx = (): DemoCtx => ({ p, v: p.v, s: () => p.ref.current, clock });
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx,
    reset: () => {
      useBench.setState(BENCH_IDLE);
      clock.setRate(1);
      p.stopSwing();
      p.ref.current = demoEmpty();
      setState(p.ref.current);
    },
    goggles: () => false,
    onEnter: () => (clock.rate() !== 1 && clock.setRate(1), useBench.setState({ pull: null })),
    active,
    onFinished,
  });
  const calc = useMemo(() => demoCalculation(state, p.v), [state, p.v]);
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[55%] w-[380px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <Notebook state={state} readOnly update={noop} removeRun={noop} />
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
  return { player, state, p, panel, clock };
}
