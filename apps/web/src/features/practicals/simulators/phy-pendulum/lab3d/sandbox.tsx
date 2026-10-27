import { emptyPhyPendulumState, pendulumPeriod, type PhyPendulumState, type PhyPendulumVariant } from '@aischool/shared';
import { Orbit } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePendulum } from '../actions';
import { NEEDED } from './scene-state';

/**
 * The unmarked sandbox: the student chooses where the lab is (the value of g)
 * and the bob, then swings and times freely. The swing uses the shared
 * period function on a custom variant. Nothing is graded, saved or sent.
 */
export interface SandboxSetup {
  g: number;
  bobDiameter: number;
}
const PLACES = [
  { label: 'Earth (Lagos)', g: 9.78 },
  { label: 'The Moon', g: 1.62 },
  { label: 'Mars', g: 3.71 },
  { label: 'Jupiter', g: 24.79 },
];
const SANDBOX_SEED = 515_151;
const setUpBench = (): PhyPendulumState => ({ ...emptyPhyPendulumState(), shielded: true, amplitude: 8, log: NEEDED.map((a) => ({ t: 0, a: `collect:${a.id}` })) });

export function sandboxVariant(s: SandboxSetup, round: number): PhyPendulumVariant {
  return { seed: SANDBOX_SEED + round, g: s.g, bobDiameter: s.bobDiameter, bobRadius: s.bobDiameter / 2, suggested: [30, 40, 50, 60, 70, 80] };
}

export function useSandbox(startedAt: string) {
  const [setup, setSetup] = useState<SandboxSetup>({ g: 9.78, bobDiameter: 2.0 });
  const [state, setState] = useState<PhyPendulumState>(setUpBench);
  const [round, setRound] = useState(0);
  const variant = useMemo(() => sandboxVariant(setup, round), [setup, round]);
  const p = usePendulum({ seed: SANDBOX_SEED + round, state, onChange: setState, readOnly: false, startedAt, variant });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    setRound((r) => r + 1);
    p.stopSwing();
    p.ref.current = setUpBench();
    setState(p.ref.current);
  };
  /** Each timing against the true period, and the g it gives. */
  const results = state.runs.map((r, i) => {
    const T = r.elapsed / r.n;
    const l = (r.thread + variant.bobRadius) / 100;
    return { thread: r.thread, T, trueT: pendulumPeriod(variant, r.thread, r.amplitude, i, r.shielded), g: T > 0 ? (4 * Math.PI ** 2 * l) / (T * T) : 0 };
  });
  return { setup, start, state, p, variant, results };
}
export type Sandbox = ReturnType<typeof useSandbox>;

export function SandboxSetupForm({ initial, onStart }: { initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Take your pendulum somewhere else, or change the bob, and time it as often as you like. Nothing here is marked or saved.</p>
      <div>
        <p className="font-medium">Where is the lab?</p>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {PLACES.map((pl) => (
            <Button key={pl.label} size="sm" variant={Math.abs(s.g - pl.g) < 0.01 ? 'brand' : 'outline'} onClick={() => setS({ ...s, g: pl.g })}>
              {pl.label} · g = {pl.g}
            </Button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="flex justify-between">
          <span className="font-medium">g (m s⁻²)</span>
          <span className="tabular text-muted-foreground">{s.g.toFixed(2)}</span>
        </span>
        <input type="range" min={1.5} max={25} step={0.01} value={s.g} onChange={(e) => setS({ ...s, g: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" aria-label="g" />
      </label>
      <label className="block">
        <span className="flex justify-between">
          <span className="font-medium">Bob diameter</span>
          <span className="tabular text-muted-foreground">{s.bobDiameter.toFixed(1)} cm</span>
        </span>
        <input type="range" min={1.6} max={3} step={0.1} value={s.bobDiameter} onChange={(e) => setS({ ...s, bobDiameter: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" aria-label="Bob diameter" />
      </label>
      <p className={cn('rounded-lg bg-muted px-3 py-2 text-[12.5px] text-muted-foreground')}>Try a big swing too, or a draught — and see how far the period moves from 2π√(l/g).</p>
      <Button variant="brand" onClick={() => onStart(s)}>
        <Orbit /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  if (!sandbox.results.length) return null;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked) · g = {sandbox.variant.g}</p>
      <ul className="mt-1 space-y-0.5">
        {sandbox.results.map((r, k) => {
          const off = (r.g - sandbox.variant.g) / sandbox.variant.g;
          return (
            <li key={k}>
              {r.thread.toFixed(1)} cm: T = {r.T.toFixed(3)} s (true {r.trueT.toFixed(3)}) → g ≈ <span className={Math.abs(off) <= 0.03 ? 'text-emerald-300' : 'text-amber-300'}>{r.g.toFixed(2)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
