import { depthNoParallaxH, depthStack, dispDmin, emptyPhyPinsState, mirrorConstruction, phyPinsVariant, pinsPrism, prismConstruction, prismDmin, prismRay, type PhyPinsState, type PhyPinsVariant, type PinsTask } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePins } from '../actions';
import { NEEDED_FOR } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the material (refractive index and
 * how strongly it disperses) and, for prisms, the apex angle, then works
 * freely. Results show the true values beside the student's own. Nothing is saved.
 */

export interface SandboxSetup {
  material: number;
  A: number;
}
const MATERIALS = [
  { n: 1.333, B: 0.0031, label: 'Water (n ≈ 1.33)' },
  { n: 1.52, B: 0.0043, label: 'Crown glass (n ≈ 1.52)' },
  { n: 1.62, B: 0.0095, label: 'Flint glass (n ≈ 1.62)' },
  { n: 2.42, B: 0.0255, label: 'Diamond (n ≈ 2.42)' },
];
const SANDBOX_SEED = 515_151;
const setUp = (task: PinsTask): PhyPinsState => ({ ...emptyPhyPinsState(), task, log: NEEDED_FOR[task].map((id) => ({ t: 0, a: `collect:${id}` })) });

export function useSandbox(startedAt: string, task: PinsTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ material: 1, A: 60 });
  const [state, setState] = useState<PhyPinsState>(() => setUp(task));
  const variant = useMemo<PhyPinsVariant>(() => {
    const m = MATERIALS[setup.material]!;
    return { ...phyPinsVariant(SANDBOX_SEED), n: m.n, cauchyB: m.B, A: setup.A, dispA: setup.A };
  }, [setup]);
  const g = usePins({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    g.ref.current = setUp(task);
    setState(g.ref.current);
  };
  return { setup, start, state, g, variant, task };
}
export type Sandbox = ReturnType<typeof useSandbox>;

export function SandboxSetupForm({ task, initial, onStart }: { task: PinsTask; initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Choose your own material and work freely. Nothing here is marked or saved.</p>
      {task !== 'MIRROR' && (
        <label className="block">
          <span className="font-medium">Material</span>
          <select value={s.material} onChange={(e) => setS({ ...s, material: Number(e.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label="Material">
            {MATERIALS.map((m, k) => (
              <option key={m.label} value={k}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {(task === 'PRISM' || task === 'DISP') && (
        <label className="block text-[13px]">
          <span className="flex justify-between">
            <span className="font-medium">Prism angle A</span>
            <span className="tabular text-muted-foreground">{s.A}°</span>
          </span>
          <input type="range" min={30} max={70} step={5} value={s.A} onChange={(e) => setS({ ...s, A: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" aria-label="Prism angle" />
        </label>
      )}
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { state, variant: v, task } = sandbox;
  const lines: string[] = [];
  if (task === 'MIRROR') for (const t of state.traces.filter((x) => x.joined)) lines.push(`i = ${t.i}°: your r ${mirrorConstruction(t)?.r.toFixed(1) ?? '—'}° · true r ${t.i}°`);
  if (task === 'PRISM') {
    const sh = pinsPrism(v);
    for (const t of state.traces.filter((x) => x.joined)) lines.push(`i = ${t.i}°: your D ${prismConstruction(sh, t)?.D.toFixed(1) ?? '—'}° · true D ${prismRay(sh, v.n, t.i).D?.toFixed(1) ?? 'no ray (total internal reflection)'}°`);
    lines.push(`True Dₘ = ${prismDmin(v.n, v.A).toFixed(1)}° (n = ${v.n}, A = ${v.A}°)`);
  }
  if (task === 'DEPTH') for (const b of [1, 2, 3, 4]) lines.push(`${b} block${b === 1 ? '' : 's'}: real ${depthStack(v, b).toFixed(2)} cm, apparent ${(depthStack(v, b) - depthNoParallaxH(v, b)).toFixed(2)} cm`);
  if (task === 'DISP') lines.push(`Dₘ red ${dispDmin(v, 'red').toFixed(1)}°, violet ${dispDmin(v, 'violet').toFixed(1)}°: spread ${(dispDmin(v, 'violet') - dispDmin(v, 'red')).toFixed(2)}°`);
  if (!lines.length) return null;
  return (
    <section className="pointer-events-auto w-[min(320px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked)</p>
      <ul className="mt-1 space-y-0.5">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
