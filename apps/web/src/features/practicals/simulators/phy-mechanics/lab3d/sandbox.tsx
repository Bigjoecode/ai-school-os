import { emptyPhyMechanicsState, frictionPull, frictionTilt, inclineAccel, inclineReadings, phyMechanicsVariant, viscReadings, viscTerminal, type MechTask, type PhyMechanicsState, type PhyMechanicsVariant } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMechanics } from '../actions';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the physics (μ, the liquid's
 * viscosity, the ball's rolling factor, the pulleys' friction) and experiments
 * freely — jerky pulls, a ball near the wall, a push, an untapped board. The
 * simulation is the shared one on a custom variant; the results panel shows
 * the true values beside what the instruments gave. Nothing is saved.
 */

export interface SandboxSetup {
  task: MechTask;
  mu: number;
  eta: number;
  kRoll: number;
  pulleyF: number;
}
const SANDBOX_SEED = 727_272;
const setUpBench = (task: MechTask): PhyMechanicsState => ({
  ...emptyPhyMechanicsState(),
  task,
  log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
});

export function useSandbox(startedAt: string, task: MechTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, mu: 0.4, eta: 1.2, kRoll: 0.4, pulleyF: 0.03 });
  const [state, setState] = useState<PhyMechanicsState>(() => setUpBench(task));
  const variant = useMemo<PhyMechanicsVariant>(() => {
    const base = phyMechanicsVariant(SANDBOX_SEED);
    return { ...base, muS: setup.mu, muK: setup.mu * 0.78, eta: setup.eta, kRoll: setup.kRoll, pulleyF: setup.pulleyF };
  }, [setup]);
  const o = useMechanics({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
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
          {value} {unit}
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
      <p className="text-muted-foreground">Choose the physics yourself and try anything — a jerk, a dusty plank, a ball near the wall, a push, an untapped board. Nothing here is marked or saved.</p>
      {s.task === 'FRICTION' && <Range label="Coefficient of static friction μ" value={s.mu} min={0.15} max={0.8} step={0.05} unit="" onChange={(x) => setS({ ...s, mu: x })} />}
      {s.task === 'VISCOSITY' && <Range label="Viscosity of the glycerine η" value={s.eta} min={0.3} max={2} step={0.1} unit="Pa s" onChange={(x) => setS({ ...s, eta: x })} />}
      {s.task === 'INCLINE' && <Range label="Rolling factor k (a = g sin θ / (1 + k))" value={s.kRoll} min={0} max={1} step={0.05} unit="" onChange={(x) => setS({ ...s, kRoll: x })} />}
      {s.task === 'FORCES' && <Range label="Friction in the pulleys" value={s.pulleyF} min={0} max={0.12} step={0.01} unit="× tension" onChange={(x) => setS({ ...s, pulleyF: x })} />}
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { state: s, variant: v } = sandbox;
  const lines: string[] = [];
  if (s.task === 'FRICTION') {
    s.pulls.slice(-4).forEach((p, j) => {
      const k = s.pulls.length - Math.min(4, s.pulls.length) + j;
      const r = frictionPull(v, k, p);
      lines.push(`Pull ${k + 1}: ${p.load} × 100 g → ${r.limit.toFixed(2)} N limiting, ${r.sliding.toFixed(2)} N sliding${p.jerk ? ' (jerk)' : ''}`);
    });
    s.tilts.slice(-2).forEach((t, j) => lines.push(`Tilt: slipped at ${frictionTilt(v, s.tilts.length - Math.min(2, s.tilts.length) + j, t).toFixed(1)}° (tan⁻¹ μ = ${((Math.atan(v.muS) * 180) / Math.PI).toFixed(1)}°)`));
  } else if (s.task === 'VISCOSITY') {
    const t = viscReadings(v, s.drops);
    s.drops.slice(-4).forEach((d, j) => {
      const k = s.drops.length - Math.min(4, s.drops.length) + j;
      lines.push(`Drop ${k + 1}: ball ${d.ball + 1} in ${d.liquid} → ${t[k]!.toFixed(2)} s (terminal ${(viscTerminal(v, d.ball, d.liquid, d.centre) * 100).toFixed(2)} cm s⁻¹)`);
    });
  } else if (s.task === 'INCLINE') {
    const t = inclineReadings(v, s.runs);
    s.runs.slice(-4).forEach((r, j) => {
      const k = s.runs.length - Math.min(4, s.runs.length) + j;
      lines.push(`Run ${k + 1}: ${(r.stop / 100).toFixed(2)} m → ${t[k]!.toFixed(2)} s (a = ${inclineAccel(v, r.blocks).toFixed(3)} m s⁻²)`);
    });
  } else lines.push(`Pulley friction ${(v.pulleyF * 100).toFixed(0)} % of the tension; tapped: ${s.tapped ? 'yes' : 'no'}.`);
  if (!lines.length) return null;
  return (
    <section className="pointer-events-auto w-[min(340px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked)</p>
      <ul className="mt-1 space-y-0.5">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
