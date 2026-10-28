import type { ChemRatesState, RatesTask } from '@aischool/shared';
import { useMemo, useRef, useState } from 'react';
import { useDemoPlayer } from '../../../lab3d-kit/demo-player';
import { useLabView } from '../../../lab3d-kit/store';
import { makeClock, useRates } from '../actions';
import { Notebook } from '../notebook';
import { BENCH_IDLE, useBench } from './bench-store';
import { beatsFor, demoCalculation, demoEmpty, demoScript, demoSeed, makeOps, type DemoCtx } from './demo';

const noop = () => undefined;

/** The rates demo: its own seed, clock and in-memory state, played by the kit's demo engine. */
export function useRatesDemo({ task, studentSeed, startedAt, precautions, active, onFinished }: { task: RatesTask; studentSeed: number; startedAt: string; precautions: string[]; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const clock = useRef(makeClock()).current;
  const marks = useRef({ start: 0, watch: 0 }).current;
  const [state, setState] = useState<ChemRatesState>(() => demoEmpty(task));
  const o = useRates({ seed, state, onChange: setState, readOnly: false, startedAt, autoTask: false, clock });
  const steps = useMemo(() => demoScript(task, o.v, precautions), [task, o.v, precautions]);
  const ctx = (): DemoCtx => ({ o, v: o.v, s: () => o.ref.current, ops: () => makeOps(o), clock, marks });
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx,
    reset: () => {
      useBench.setState(BENCH_IDLE);
      useLabView.setState({ spot: null });
      clock.setRate(1);
      o.resetLive();
      o.ref.current = demoEmpty(task);
      setState(o.ref.current);
    },
    beatsFor,
    onEnter: () => undefined,
    goggles: (c) => c.s().log.some((e) => e.a === 'safety:goggles'),
    active,
    onFinished,
  });
  const calc = useMemo(() => demoCalculation(state, o.v), [state, o.v]);
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[55%] w-[420px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <Notebook v={o.v} state={state} readOnly update={noop} className="border-0 p-0 shadow-none sm:p-0" />
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
