import { emptyPhySpringState, SPRING_SLOTS, springOverLimit, springPeriod, springReading, type PhySpringState, type PhySpringVariant, type SpringTask } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSpring } from '../actions';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the spring (its stiffness, its own
 * mass and its elastic limit), then experiments freely — overload it and see
 * the permanent set, big displacements, very heavy or light masses. The
 * simulation is the shared one on a custom variant; each reading or timing
 * shows the true value. Nothing is saved.
 */

export interface SandboxSetup {
  task: SpringTask;
  k: number;
  /** g */
  springMass: number;
  /** N */
  limit: number;
}
const SANDBOX_SEED = 727_373;
const setUpBench = (task: SpringTask): PhySpringState => ({
  ...emptyPhySpringState(),
  task,
  log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
});

export function useSandbox(startedAt: string, task: SpringTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, k: 25, springMass: 30, limit: 4 });
  const [state, setState] = useState<PhySpringState>(() => setUpBench(task));
  const variant = useMemo<PhySpringVariant>(() => ({ seed: SANDBOX_SEED, k: setup.k, springMass: setup.springMass / 1000, r0: 26, hanger: 0.05, slots: Array.from({ length: SPRING_SLOTS }, () => 0.05), limit: setup.limit, tau: 45 }), [setup]);
  const o = useSpring({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    o.steady();
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
      <p className="text-muted-foreground">Choose your own spring and try anything — overload it past its elastic limit, pull it far down, hang very light or heavy loads. Nothing here is marked or saved.</p>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Experiment">
        {(['HOOKE', 'OSC'] as const).map((t) => (
          <Button key={t} size="sm" variant={s.task === t ? 'brand' : 'outline'} onClick={() => setS({ ...s, task: t })} aria-pressed={s.task === t}>
            {t === 'HOOKE' ? 'Hooke’s law' : 'Oscillations'}
          </Button>
        ))}
      </div>
      <Range label="Spring constant k" value={s.k} min={10} max={60} step={1} unit="N m⁻¹" onChange={(x) => setS({ ...s, k: x })} />
      <Range label="Mass of the spring" value={s.springMass} min={0} max={100} step={5} unit="g" onChange={(x) => setS({ ...s, springMass: x })} />
      <Range label="Elastic limit" value={s.limit} min={1.5} max={7} step={0.5} unit="N" onChange={(x) => setS({ ...s, limit: x })} />
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { state: s, variant: v } = sandbox;
  if (!s.readings.length && !s.runs.length) return null;
  return (
    <section className="pointer-events-auto w-[min(330px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">
        Sandbox results (unmarked) · k {v.k} N m⁻¹, limit {v.limit} N
      </p>
      <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
        {s.readings.map((r, k) => (
          <li key={`r${k}`}>
            {r.load} g{r.peak > r.load ? ' (unloading)' : ''}: pointer at {springReading(v, r.load, r.peak).toFixed(2)} cm{springOverLimit(v, r.peak) ? <span className="text-amber-300"> · past the elastic limit</span> : null}
            {r.moving ? <span className="text-amber-300"> · read while moving</span> : null}
          </li>
        ))}
        {s.runs.map((r, k) => (
          <li key={`t${k}`}>
            {(r.load / 1000).toFixed(3)} kg, {r.amp} cm: {r.elapsed.toFixed(2)} s for {r.n} (true T {springPeriod(v, r.load, k).toFixed(3)} s, so {(r.n * springPeriod(v, r.load, k)).toFixed(2)} s)
          </li>
        ))}
      </ul>
    </section>
  );
}
