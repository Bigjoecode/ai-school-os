import { emptyPhyThermalState, phyThermalVariant, THERM_METALS, thermIndicates, thermSim, type PhyThermalState, type PhyThermalVariant, type ThermMetalId, type ThermTask } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { clockText, useThermal } from '../actions';
import { READ_LABEL } from '../index';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the experiment, the rod's metal,
 * the room temperature and (for the gas law) how uneven the capillary's bore
 * is, then experiments freely — leave the micrometer touching, screw it
 * tight, read while the flame is on, leave the column half out of the water,
 * switch the heater on unlagged or dry. The simulation is the shared one on a
 * custom variant; every reading shows the true value. Nothing is saved.
 */

export interface SandboxSetup {
  task: ThermTask;
  metal: ThermMetalId;
  room: number;
  bore: number;
}
const SANDBOX_SEED = 525_252;
const setUpBench = (task: ThermTask): PhyThermalState => ({
  ...emptyPhyThermalState(),
  task,
  reads: task === 'EXPANSION' ? [{ k: 'rule', t: 0 }] : [],
  log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
});

export function useSandbox(startedAt: string, task: ThermTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, metal: 'brass', room: 28, bore: 0 });
  const [state, setState] = useState<PhyThermalState>(() => setUpBench(task));
  const variant = useMemo<PhyThermalVariant>(() => {
    const base = phyThermalVariant(SANDBOX_SEED);
    const m = THERM_METALS.find((x) => x.id === setup.metal)!;
    return { ...base, room: setup.room, tap: setup.room - 1, tapE: setup.room - 1, metal: m.id, alpha: m.alpha, bore: setup.bore, off: { jacket: 0, bath: 0, cal: 0 } };
  }, [setup]);
  const o = useThermal({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
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
          {value.toFixed(step < 1 ? 2 : 0)} {unit}
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
      <p className="text-muted-foreground">Set up your own bench and try anything — leave the micrometer touching as the rod heats, read while the flame is on, leave part of the air column out of the water, heat without lagging. Nothing here is marked or saved; every reading shows its true value.</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Experiment">
        {(['EXPANSION', 'CHARLES', 'ELECTRIC'] as const).map((t) => (
          <Button key={t} size="sm" variant={s.task === t ? 'brand' : 'outline'} onClick={() => setS({ ...s, task: t })} aria-pressed={s.task === t}>
            {t === 'EXPANSION' ? 'Expansivity' : t === 'CHARLES' ? 'Charles’s law' : 'Electrical heating'}
          </Button>
        ))}
      </div>
      {s.task === 'EXPANSION' && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Metal">
          {THERM_METALS.map((m) => (
            <Button key={m.id} size="sm" variant={s.metal === m.id ? 'brand' : 'outline'} onClick={() => setS({ ...s, metal: m.id })} aria-pressed={s.metal === m.id}>
              {m.name} ({(m.alpha * 1e5).toFixed(1)} × 10⁻⁵)
            </Button>
          ))}
        </div>
      )}
      <Range label="Room temperature" value={s.room} min={18} max={36} step={1} unit="°C" onChange={(x) => setS({ ...s, room: x })} />
      {s.task === 'CHARLES' && <Range label="Taper of the capillary’s bore (over 10 cm)" value={s.bore} min={-0.1} max={0.1} step={0.01} unit="" onChange={(x) => setS({ ...s, bore: x })} />}
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { state: s, variant: v } = sandbox;
  const task = s.task ?? 'EXPANSION';
  const rows = useMemo(() => {
    const sim = thermSim(v, s.events);
    return s.reads
      .map((r) => ({ t: r.t, k: r.k }))
      .sort((a, b) => a.t - b.t)
      .map((r) => {
        const x = thermIndicates(v, sim.at(r.t), r.k, task, r.t);
        return `${clockText(r.t)} ${READ_LABEL[r.k]}: ${r.k === 'micro' ? x.toFixed(3) + ' mm' : r.k === 'rule' ? x.toFixed(1) + ' mm' : r.k === 'column' ? x.toFixed(3) + ' cm' : r.k === 'balance' ? x.toFixed(1) + ' g' : r.k === 'watch' ? x.toFixed(1) + ' s' : r.k === 'ammeter' ? x.toFixed(3) + ' A' : r.k === 'voltmeter' ? x.toFixed(2) + ' V' : x.toFixed(2) + ' °C'}`;
      });
  }, [s.events, s.reads, v, task]);
  if (!rows.length) return null;
  return (
    <section className="pointer-events-auto w-[min(330px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked) · {task === 'EXPANSION' ? `α = ${(v.alpha * 1e5).toFixed(2)} × 10⁻⁵ K⁻¹` : task === 'CHARLES' ? 'absolute zero −273 °C' : 'c(water) 4186 J kg⁻¹ K⁻¹'}</p>
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
