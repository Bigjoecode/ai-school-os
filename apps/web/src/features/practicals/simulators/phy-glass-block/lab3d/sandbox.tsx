import { emptyPhyGlassState, glassConstruction, glassRefraction, type PhyGlassState, type PhyGlassVariant } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGlass } from '../actions';
import { NEEDED } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the glass (refractive index) and
 * the block's thickness, then traces rays freely. The simulation is the
 * shared one on a custom variant; each finished trace shows the true angle of
 * refraction beside the one from the student's own pins. Nothing is saved.
 */

export interface SandboxSetup {
  n: number;
  thickness: number;
}
const SANDBOX_SEED = 515_151;
const setUpBench = (): PhyGlassState => ({ ...emptyPhyGlassState(), log: NEEDED.map((id) => ({ t: 0, a: `collect:${id}` })) });
const GLASSES = [
  { n: 1.33, label: 'Water in a clear tank (n ≈ 1.33)' },
  { n: 1.5, label: 'Crown glass (n ≈ 1.50)' },
  { n: 1.62, label: 'Flint glass (n ≈ 1.62)' },
  { n: 2.42, label: 'Diamond (n ≈ 2.42)' },
];

export function useSandbox(startedAt: string) {
  const [setup, setSetup] = useState<SandboxSetup>({ n: 1.5, thickness: 6 });
  const [state, setState] = useState<PhyGlassState>(setUpBench);
  const variant = useMemo<PhyGlassVariant>(() => ({ seed: SANDBOX_SEED, n: setup.n, thickness: setup.thickness }), [setup]);
  const g = useGlass({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    g.ref.current = setUpBench();
    setState(g.ref.current);
  };
  const results = state.traces
    .filter((t) => t.joined)
    .map((t) => ({ i: t.i, yours: glassConstruction(variant, t.p3, t.p4)?.r ?? null, truth: glassRefraction(variant, t.i) }));
  return { setup, start, state, g, variant, results };
}
export type Sandbox = ReturnType<typeof useSandbox>;

export function SandboxSetupForm({ initial, onStart }: { initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Choose your own block and trace as many rays as you like. Nothing here is marked or saved.</p>
      <label className="block">
        <span className="font-medium">Material</span>
        <select value={s.n} onChange={(e) => setS({ ...s, n: Number(e.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label="Material of the block">
          {GLASSES.map((x) => (
            <option key={x.n} value={x.n}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[13px]">
        <span className="flex justify-between">
          <span className="font-medium">Thickness AB to CD</span>
          <span className="tabular text-muted-foreground">{s.thickness.toFixed(1)} cm</span>
        </span>
        <input type="range" min={4} max={8} step={0.5} value={s.thickness} onChange={(e) => setS({ ...s, thickness: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" aria-label="Thickness of the block" />
      </label>
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  if (!sandbox.results.length) return null;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked) · n = {sandbox.variant.n}</p>
      <ul className="mt-1 space-y-0.5">
        {sandbox.results.map((r, k) => {
          const off = r.yours === null ? null : r.yours - r.truth;
          return (
            <li key={k}>
              i = {r.i}°: your r {r.yours === null ? '—' : `${r.yours.toFixed(1)}°`} · true r {r.truth.toFixed(1)}°{' '}
              {off !== null && <span className={Math.abs(off) <= 1 ? 'text-emerald-300' : 'text-amber-300'}>({off >= 0 ? '+' : ''}{off.toFixed(1)}°)</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
