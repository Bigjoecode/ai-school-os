import { emptyPhyOhmsState, ohmsMeters, ohmsReadingSettings, phyOhmsVariant, type OhmsTask, type PhyOhmsState, type PhyOhmsVariant } from '@aischool/shared';
import { Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOhms } from '../actions';
import { needed } from './scene-state';

/**
 * The unmarked sandbox: the student picks the experiment and the resistor (or
 * the wire's material and diameter), then wires and measures freely. The
 * meters use the shared circuit solver on a custom variant. Nothing is saved.
 */

export interface SandboxSetup {
  task: OhmsTask;
  resistor: number;
  material: 0 | 1;
  diameterMm: number;
}
const SANDBOX_SEED = 515_151;
const MATERIALS = [
  { material: 'constantan (eureka)', rho: 4.9e-7 },
  { material: 'nichrome', rho: 1.1e-6 },
] as const;

export function sandboxVariant(s: SandboxSetup): PhyOhmsVariant {
  const base = phyOhmsVariant(SANDBOX_SEED);
  const m = MATERIALS[s.material];
  const area = (Math.PI * (s.diameterMm / 1000) ** 2) / 4;
  return { ...base, resistor: s.resistor, wire: { material: m.material, rho: m.rho, diameterMm: s.diameterMm, area, perMetre: m.rho / area } };
}
const setUpBench = (task: OhmsTask): PhyOhmsState => ({ ...emptyPhyOhmsState(), task, log: [{ t: 0, a: `task:${task}` }, ...needed(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))] });

export function useSandbox(startedAt: string) {
  const [setup, setSetup] = useState<SandboxSetup>({ task: 'OHM', resistor: 5, material: 0, diameterMm: 0.32 });
  const [state, setState] = useState<PhyOhmsState>(() => setUpBench('OHM'));
  const variant = useMemo(() => sandboxVariant(setup), [setup]);
  const o = useOhms({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    o.ref.current = setUpBench(s.task);
    setState(o.ref.current);
  };
  const results = state.readings.map((r, i) => {
    const m = ohmsMeters(variant, ohmsReadingSettings(state.task ?? 'OHM', r), i);
    return { I: m.I, V: m.V, L: r.jockey };
  });
  return { setup, start, state, o, variant, results };
}
export type Sandbox = ReturnType<typeof useSandbox>;

export function SandboxSetupForm({ initial, onStart }: { initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Choose your own resistor or wire and experiment freely. Nothing here is marked or saved.</p>
      <div className="flex gap-1.5">
        {(['OHM', 'WIRE'] as const).map((t) => (
          <Button key={t} size="sm" variant={s.task === t ? 'brand' : 'outline'} onClick={() => setS({ ...s, task: t })} aria-pressed={s.task === t}>
            {t === 'OHM' ? "Ohm's law (resistor)" : 'Resistivity of a wire'}
          </Button>
        ))}
      </div>
      {s.task === 'OHM' ? (
        <label className="block">
          <span className="flex justify-between">
            <span className="font-medium">Resistor R</span>
            <span className="tabular text-muted-foreground">{s.resistor.toFixed(1)} Ω</span>
          </span>
          <input type="range" min={2} max={10} step={0.5} value={s.resistor} onChange={(e) => setS({ ...s, resistor: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" aria-label="Resistor value" />
        </label>
      ) : (
        <>
          <label className="block">
            <span className="font-medium">Material</span>
            <select value={s.material} onChange={(e) => setS({ ...s, material: Number(e.target.value) as 0 | 1 })} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label="Wire material">
              {MATERIALS.map((m, i) => (
                <option key={m.material} value={i}>
                  {m.material}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="flex justify-between">
              <span className="font-medium">Diameter d</span>
              <span className="tabular text-muted-foreground">{s.diameterMm.toFixed(2)} mm</span>
            </span>
            <input type="range" min={0.2} max={0.6} step={0.02} value={s.diameterMm} onChange={(e) => setS({ ...s, diameterMm: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" aria-label="Wire diameter" />
          </label>
        </>
      )}
      <Button variant="brand" onClick={() => onStart(s)}>
        <Zap /> Start the sandbox
      </Button>
    </div>
  );
}

/** The sandbox readings against the true values for the chosen resistor or wire. */
export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { results, variant, state } = sandbox;
  if (!results.length) return null;
  const wire = state.task === 'WIRE';
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked)</p>
      <p className="mt-0.5 text-white/80">{wire ? `True: ${variant.wire.perMetre.toFixed(2)} Ω m⁻¹, ρ = ${variant.wire.rho.toExponential(2)} Ω m` : `True R = ${variant.resistor.toFixed(2)} Ω`}</p>
      <ul className="mt-1 space-y-0.5">
        {results.map((r, k) => (
          <li key={k}>
            {wire ? `L ${r.L.toFixed(1)} cm · ` : ''}
            {r.I.toFixed(2)} A · {r.V.toFixed(2)} V · V/I {r.I > 0.001 ? (r.V / r.I).toFixed(2) : '—'} Ω
          </li>
        ))}
      </ul>
    </section>
  );
}
