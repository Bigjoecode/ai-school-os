import { emptyPhyMomentsState, momentsBalanced, momentsMassBalance, momentsOtherBalance, type MomentsTask, type PhyMomentsState, type PhyMomentsVariant } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMoments } from '../actions';
import { NEEDED } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the rule's mass and centre of
 * gravity (and the unknown mass), then experiments freely — the pivot away
 * from G, masses on the same side… The simulation is the shared one on a
 * custom variant; each reading shows whether the rule really balanced and
 * where it would have. Nothing is saved.
 */

export interface SandboxSetup {
  task: MomentsTask;
  ruleMass: number;
  g: number;
  unknown: number;
}
const SANDBOX_SEED = 727_272;
const setUpBench = (task: MomentsTask): PhyMomentsState => ({
  ...emptyPhyMomentsState(),
  task,
  pivot: 45,
  log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), { t: 0, a: 'place:edge' }, { t: 0, a: 'place:rule' }],
});

export function useSandbox(startedAt: string, task: MomentsTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, ruleMass: 110, g: 50, unknown: 40 });
  const [state, setState] = useState<PhyMomentsState>(() => setUpBench(task));
  const variant = useMemo<PhyMomentsVariant>(() => ({ seed: SANDBOX_SEED, ruleMass: setup.ruleMass, g: setup.g, unknown: setup.unknown, friction: 0.06, start: { pivot: 45, known: 26, other: 75 } }), [setup]);
  const o = useMoments({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    o.ref.current = setUpBench(s.task);
    setState(o.ref.current);
  };
  const t = state.task ?? 'MOMENTS';
  const results = state.readings.map((r) => ({
    r,
    balanced: momentsBalanced(variant, t, r),
    at: r.known === null ? null : t === 'MASS' ? momentsMassBalance(variant, r.known) : momentsOtherBalance(variant, r.pivot, r.known),
  }));
  return { setup, start, state, o, variant, results };
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
      <p className="text-muted-foreground">Choose your own rule and masses and try anything — the pivot away from G, a heavy rule, a light M. Nothing here is marked or saved.</p>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Experiment">
        {(['MOMENTS', 'MASS'] as const).map((t) => (
          <Button key={t} size="sm" variant={s.task === t ? 'brand' : 'outline'} onClick={() => setS({ ...s, task: t })} aria-pressed={s.task === t}>
            {t === 'MOMENTS' ? 'Principle of moments' : 'Mass of the rule'}
          </Button>
        ))}
      </div>
      <Range label="Mass of the rule" value={s.ruleMass} min={60} max={200} step={5} unit="g" onChange={(x) => setS({ ...s, ruleMass: x })} />
      <Range label="Centre of gravity G" value={s.g} min={45} max={55} step={0.5} unit="cm" onChange={(x) => setS({ ...s, g: x })} />
      {s.task === 'MOMENTS' && <Range label="Unknown mass M" value={s.unknown} min={20} max={100} step={5} unit="g" onChange={(x) => setS({ ...s, unknown: x })} />}
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  if (!sandbox.results.length) return null;
  const mass = sandbox.state.task === 'MASS';
  return (
    <section className="pointer-events-auto w-[min(320px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">
        Sandbox results (unmarked) · rule {sandbox.variant.ruleMass} g, G {sandbox.variant.g} cm
      </p>
      <ul className="mt-1 space-y-0.5">
        {sandbox.results.map(({ r, balanced, at }, k) => (
          <li key={k}>
            Mass at {r.known?.toFixed(1)} cm: {mass ? `P ${r.pivot.toFixed(1)}` : `M at ${r.other?.toFixed(1) ?? '—'}`} cm ·{' '}
            {balanced ? <span className="text-emerald-300">balanced</span> : <span className="text-amber-300">not balanced (balances at {at?.toFixed(1)} cm)</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
