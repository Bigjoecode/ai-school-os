import type { MagTask, PhyMagnetismState } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer } from '../../../lab3d-kit/demo-player';
import { useLabView } from '../../../lab3d-kit/store';
import { useMagnetism } from '../actions';
import { Notebook } from '../index';
import { BENCH_IDLE, useBench } from './bench-store';
import { demoCalculation, demoEmpty, demoScript, demoSeed, makeOps, type DemoCtx } from './demo';

const noop = () => undefined;
const noops = { setRowCell: noop, removeRow: noop, setCell: noop, setAnswer: noop, update: noop };

/** The magnetism demo: its own seed and in-memory state, played by the kit's demo engine. */
export function useMagDemo({ task, studentSeed, startedAt, precautions, active, onFinished }: { task: MagTask; studentSeed: number; startedAt: string; precautions: string[]; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const [state, setState] = useState<PhyMagnetismState>(() => demoEmpty(task));
  const o = useMagnetism({ seed, state, onChange: setState, readOnly: false, startedAt, autoTask: false });
  const steps = useMemo(() => demoScript(task, precautions), [task, precautions]);
  const ctx = (): DemoCtx => ({ o, v: o.v, s: () => o.ref.current, ops: () => makeOps(o) });
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx,
    reset: () => {
      useBench.setState(BENCH_IDLE);
      useLabView.setState({ spot: null });
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
        <Notebook task={task} state={state} readOnly o={noops} />
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
