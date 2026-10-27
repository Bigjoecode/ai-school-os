import type { ChemTitrationState } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer } from '../../../lab3d-kit/demo-player';
import { useTitration } from '../actions';
import { Notebook } from '../notebook';
import { BENCH_IDLE, useBench } from './bench-store';
import { beatsFor, demoCalculation, demoEmpty, demoScript, demoSeed, type DemoCtx } from './demo';

const noop = () => undefined;

/** The titration demo: its own seed and in-memory state, played by the kit's demo engine. */
export function useTitrationDemo({ studentSeed, startedAt, precautions, active, onFinished }: { studentSeed: number; startedAt: string; precautions: string[]; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const [state, setState] = useState<ChemTitrationState>(demoEmpty);
  const t = useTitration({ seed, state, onChange: setState, readOnly: false, startedAt });
  const steps = useMemo(() => demoScript(t.v, precautions), [t.v, precautions]);
  const ind = t.v.indicators[0]!;
  const ctx = (): DemoCtx => ({ t, v: t.v, s: () => t.ref.current });
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx,
    reset: () => {
      useBench.setState(BENCH_IDLE);
      t.ref.current = demoEmpty();
      setState(t.ref.current);
    },
    beatsFor: (step, c) => beatsFor(step, c, ind),
    goggles: (c) => c.s().log.some((e) => e.a === 'safety:goggles'),
    onEnter: () => useBench.setState({ streaming: false, tap: 0 }),
    active,
    onFinished,
  });
  const calc = useMemo(() => demoCalculation(state, t.v), [state, t.v]);
  /** The demo's side panels: its notebook and the worked calculation. */
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden w-[380px] rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <Notebook v={t.v} state={state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0 [&_input]:h-8 [&_textarea]:hidden" />
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
  return { player, state, t, panel };
}
