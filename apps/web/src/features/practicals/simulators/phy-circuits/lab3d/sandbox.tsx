import { SERIES_LABEL, bridgeBalance, circuitsCheck, circuitsMeters, circuitsReadingSettings, emptyPhyCircuitsState, phyCircuitsVariant, type CircuitsTask, type PhyCircuitsState, type PhyCircuitsVariant } from '@aischool/shared';
import { Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCircuits } from '../actions';
import { needed } from './scene-state';

/**
 * The unmarked sandbox: the student picks the experiment and its hidden
 * values (X for the bridge, the cell's e.m.f. and internal resistance, or R₁
 * and R₂), then wires and measures freely. Nothing is saved.
 */

export interface SandboxSetup {
  task: CircuitsTask;
  X: number;
  emf: number;
  internal: number;
  r1: number;
  r2: number;
}
const SANDBOX_SEED = 626_262;

export function sandboxVariant(s: SandboxSetup): PhyCircuitsVariant {
  return { ...phyCircuitsVariant(SANDBOX_SEED), X: s.X, emf: s.emf, internal: s.internal, r1: s.r1, r2: s.r2 };
}
const setUpBench = (task: CircuitsTask): PhyCircuitsState => ({ ...emptyPhyCircuitsState(), task, log: [{ t: 0, a: `task:${task}` }, ...needed(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))] });

export function useSandbox(startedAt: string, task: CircuitsTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, X: 5, emf: 1.5, internal: 0.8, r1: 2.2, r2: 4.7 });
  const [state, setState] = useState<PhyCircuitsState>(() => setUpBench(task));
  const variant = useMemo(() => sandboxVariant(setup), [setup]);
  const o = useCircuits({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    o.ref.current = setUpBench(s.task);
    setState(o.ref.current);
  };
  const t = state.task ?? 'BRIDGE';
  const results = state.readings.map((r, i) => {
    const set = circuitsReadingSettings(t, r);
    const m = circuitsMeters(variant, set, i);
    return { I: m.I, V: m.V, l: r.jockey, R: r.rbox, swap: r.swap, bal: bridgeBalance(variant, r), arr: circuitsCheck(variant, set).arrangement };
  });
  return { setup, start, state, o, variant, results };
}
export type Sandbox = ReturnType<typeof useSandbox>;

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (x: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">
          {value.toFixed(step < 0.1 ? 2 : 1)} {unit}
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
      <p className="text-muted-foreground">Choose your own values and experiment freely. Nothing here is marked or saved.</p>
      <div className="flex flex-wrap gap-1.5">
        {(['BRIDGE', 'EMF', 'SERIES'] as const).map((t) => (
          <Button key={t} size="sm" variant={s.task === t ? 'brand' : 'outline'} onClick={() => setS({ ...s, task: t })} aria-pressed={s.task === t}>
            {t === 'BRIDGE' ? 'Metre bridge' : t === 'EMF' ? 'E.m.f. and r' : 'Series / parallel'}
          </Button>
        ))}
      </div>
      {s.task === 'BRIDGE' && <Slider label="Unknown X" value={s.X} min={1} max={15} step={0.5} unit="Ω" onChange={(X) => setS({ ...s, X })} />}
      {s.task === 'EMF' && (
        <>
          <Slider label="Cell e.m.f. E" value={s.emf} min={1.2} max={1.65} step={0.01} unit="V" onChange={(emf) => setS({ ...s, emf })} />
          <Slider label="Internal resistance r" value={s.internal} min={0.1} max={2} step={0.05} unit="Ω" onChange={(internal) => setS({ ...s, internal })} />
        </>
      )}
      {s.task === 'SERIES' && (
        <>
          <Slider label="R₁" value={s.r1} min={1.5} max={10} step={0.1} unit="Ω" onChange={(r1) => setS({ ...s, r1 })} />
          <Slider label="R₂" value={s.r2} min={1.5} max={10} step={0.1} unit="Ω" onChange={(r2) => setS({ ...s, r2 })} />
        </>
      )}
      <Button variant="brand" onClick={() => onStart(s)}>
        <Zap /> Start the sandbox
      </Button>
    </div>
  );
}

/** The sandbox readings against the true values. */
export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { results, variant, state } = sandbox;
  if (!results.length) return null;
  const t = state.task ?? 'BRIDGE';
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked)</p>
      <p className="mt-0.5 text-white/80">{t === 'BRIDGE' ? `True X = ${variant.X.toFixed(2)} Ω` : t === 'EMF' ? `True E = ${variant.emf.toFixed(2)} V, r = ${variant.internal.toFixed(2)} Ω` : `True R₁ = ${variant.r1.toFixed(2)} Ω, R₂ = ${variant.r2.toFixed(2)} Ω`}</p>
      <ul className="mt-1 space-y-0.5">
        {results.map((r, k) => (
          <li key={k}>
            {t === 'BRIDGE'
              ? `R ${r.R} Ω${r.swap ? ' (swapped)' : ''} · l ${r.l.toFixed(1)} cm · balance ${r.bal.toFixed(1)} cm`
              : t === 'EMF'
                ? `${r.I.toFixed(2)} A · ${r.V.toFixed(2)} V`
                : `${r.arr ? SERIES_LABEL[r.arr] : 'not a standard arrangement'} · ${r.V.toFixed(2)} V · ${r.I.toFixed(2)} A · V/I ${r.I > 0.001 ? (r.V / r.I).toFixed(2) : '—'} Ω`}
          </li>
        ))}
      </ul>
    </section>
  );
}
