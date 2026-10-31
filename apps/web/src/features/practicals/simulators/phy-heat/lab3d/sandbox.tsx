import { emptyPhyHeatState, HEAT_METALS, heatMass, heatReading, heatSim, phyHeatVariant, type HeatMetalId, type HeatTask, type PhyHeatState, type PhyHeatVariant } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { clockText, useHeat } from '../actions';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the metal, the room temperature
 * and (for the cooling curve) how impure the naphthalene is and how much it
 * supercools, then experiments freely — no lagging, a slow transfer, wet or
 * freezer ice, no stirring, pulling the tube out early. The simulation is the
 * shared one on a custom variant; every reading shows the true value. Nothing
 * is saved.
 */

export interface SandboxSetup {
  task: HeatTask;
  metal: HeatMetalId;
  room: number;
  impurity: number;
  supercool: number;
}
const SANDBOX_SEED = 424_242;
const setUpBench = (task: HeatTask): PhyHeatState => ({
  ...emptyPhyHeatState(),
  task,
  log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
});

export function useSandbox(startedAt: string, task: HeatTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, metal: 'copper', room: 28, impurity: 0.5, supercool: 1.2 });
  const [state, setState] = useState<PhyHeatState>(() => setUpBench(task));
  const variant = useMemo<PhyHeatVariant>(() => {
    const base = phyHeatVariant(SANDBOX_SEED);
    const m = HEAT_METALS.find((x) => x.id === setup.metal)!;
    return { ...base, room: setup.room, tap: setup.room - 1, metal: m.id, c: m.c, blockMass: m.id === 'aluminium' ? 0.1 : 0.2, impurity: setup.impurity, supercool: setup.supercool, off: { bath: 0, cal: 0, room: 0, tube: 0 } };
  }, [setup]);
  const o = useHeat({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    o.clock.reset(0);
    o.ref.current = setUpBench(s.task);
    setState(o.ref.current);
  };
  return { setup, start, state, o, variant };
}
export type Sandbox = ReturnType<typeof useSandbox>;

function Range({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (x: number) => void }) {
  return (
    <label className="block text-[13px]">
      <span className="flex justify-between">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">
          {value.toFixed(step < 1 ? 1 : 0)} {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-brand)]" aria-label={label} />
    </label>
  );
}

export function SandboxSetupForm({ initial, onStart }: { initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Set up your own bench and try anything — no lagging, a slow transfer, wet ice, ice from the freezer, no stirring, impure naphthalene. Nothing here is marked or saved; every reading shows its true value.</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Experiment">
        {(['MIX', 'LATENT', 'COOL'] as const).map((t) => (
          <Button key={t} size="sm" variant={s.task === t ? 'brand' : 'outline'} onClick={() => setS({ ...s, task: t })} aria-pressed={s.task === t}>
            {t === 'MIX' ? 'Mixtures' : t === 'LATENT' ? 'Latent heat' : 'Cooling curve'}
          </Button>
        ))}
      </div>
      {s.task === 'MIX' && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Metal">
          {HEAT_METALS.map((m) => (
            <Button key={m.id} size="sm" variant={s.metal === m.id ? 'brand' : 'outline'} onClick={() => setS({ ...s, metal: m.id })} aria-pressed={s.metal === m.id}>
              {m.name} ({m.c})
            </Button>
          ))}
        </div>
      )}
      <Range label="Room temperature" value={s.room} min={18} max={36} step={1} unit="°C" onChange={(x) => setS({ ...s, room: x })} />
      {s.task === 'COOL' && (
        <>
          <Range label="Impurity (lowers and tilts the plateau)" value={s.impurity} min={0} max={4} step={0.1} unit="°C" onChange={(x) => setS({ ...s, impurity: x })} />
          <Range label="Supercooling (unstirred)" value={s.supercool} min={0} max={5} step={0.1} unit="°C" onChange={(x) => setS({ ...s, supercool: x })} />
        </>
      )}
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { state: s, variant: v } = sandbox;
  const rows = useMemo(() => {
    const sim = heatSim(v, s.events);
    const items = [...s.weighs.map((w) => ({ t: w.t, text: () => `${clockText(w.t)} weighed the ${w.item === 'cal' ? 'calorimeter' : 'block'}: ${(heatMass(v, sim.at(w.t), w.item) * 1000).toFixed(2)} g` })), ...s.reads.map((r) => ({ t: r.t, text: () => `${clockText(r.t)} ${r.th} thermometer: ${heatReading(v, sim.at(r.t), r.th).toFixed(2)} °C` }))].sort((a, b) => a.t - b.t);
    return items.map((x) => x.text());
  }, [s.events, s.weighs, s.reads, v]);
  if (!rows.length) return null;
  return (
    <section className="pointer-events-auto w-[min(330px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">
        Sandbox (unmarked) · {s.task === 'MIX' ? `c of the block ${v.c} J kg⁻¹ K⁻¹` : s.task === 'LATENT' ? 'L of ice 3.34 × 10⁵ J kg⁻¹' : `plateau ${(v.tf - v.impurity / 2).toFixed(1)} °C`}
      </p>
      <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
        {rows.map((r, i) => (
          <li key={i} className="tabular">
            {r}
          </li>
        ))}
      </ul>
    </section>
  );
}
