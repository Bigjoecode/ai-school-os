import { diodeReading, emLift, emptyPhyMagnetismState, fieldNeutrals, indDeflection, indShown, phyMagnetismVariant, sheetCfg, type MagTask, type PhyMagnetismState, type PhyMagnetismVariant } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fieldCfgNow, openSheet, useMagnetism } from '../actions';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the physics (the magnet's
 * strength, the core's saturation, the induction constant, the diode's
 * ideality) and experiments freely — two magnets, no core, a magnet from the
 * side, no protective resistor. Nothing is saved.
 */

export interface SandboxSetup {
  task: MagTask;
  strength: number;
  sat: number;
  ind: number;
  n: number;
}
const SANDBOX_SEED = 727_272;
const setUpBench = (task: MagTask): PhyMagnetismState => ({
  ...emptyPhyMagnetismState(),
  task,
  meridian: true,
  steelAway: true,
  tapEach: true,
  galvoFar: true,
  log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
});

export function useSandbox(startedAt: string, task: MagTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, strength: 1, sat: 85, ind: 5, n: 1.8 });
  const [state, setState] = useState<PhyMagnetismState>(() => setUpBench(task));
  const variant = useMemo<PhyMagnetismVariant>(() => {
    const base = phyMagnetismVariant(SANDBOX_SEED);
    return { ...base, Q: base.Q * setup.strength, clipNIs: setup.sat, indK: setup.ind, dN: setup.n, dIs: base.dIs * Math.exp(0.65 / (base.dN * 0.02585) - 0.65 / (setup.n * 0.02585)) };
  }, [setup]);
  const o = useMagnetism({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
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
      <p className="text-muted-foreground">Choose the physics yourself and try anything — two magnets, no core, a magnet pushed in from the side, no protective resistor. Nothing here is marked or saved.</p>
      {s.task === 'FIELD' && <Range label="Strength of the magnet (× normal)" value={s.strength} min={0.4} max={2.5} step={0.1} unit="×" onChange={(x) => setS({ ...s, strength: x })} />}
      {s.task === 'ELECTROMAGNET' && <Range label="Saturation of the core (ampere-turns)" value={s.sat} min={30} max={200} step={5} unit="A-turns" onChange={(x) => setS({ ...s, sat: x })} />}
      {s.task === 'INDUCTION' && <Range label="Swing for a slow push, 200 turns" value={s.ind} min={1} max={12} step={0.5} unit="div" onChange={(x) => setS({ ...s, ind: x })} />}
      {s.task === 'DIODE' && <Range label="The diode’s ideality factor n" value={s.n} min={1} max={2.5} step={0.05} unit="" onChange={(x) => setS({ ...s, n: x })} />}
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { state: s, variant: v } = sandbox;
  const lines: string[] = [];
  if (s.task === 'FIELD') {
    const o = openSheet(s);
    const ns = fieldNeutrals(v, o ? sheetCfg(o.sheet) : fieldCfgNow(s));
    lines.push(ns.length ? `Neutral points: ${ns.map((p) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}) cm`).join(', ')}` : 'No neutral point on the paper.');
  } else if (s.task === 'ELECTROMAGNET') {
    s.lifts.slice(-4).forEach((l, j) => {
      const k = s.lifts.length - Math.min(4, s.lifts.length) + j;
      const r = emLift(v, k, l);
      lines.push(`Lift ${k + 1}: ${l.turns} turns, ${l.core}, ${r.I.toFixed(2)} A → ${r.clips} clips (${r.left} stay after switching off)`);
    });
  } else if (s.task === 'INDUCTION') {
    s.moves.slice(-4).forEach((m, j) => {
      const k = s.moves.length - Math.min(4, s.moves.length) + j;
      lines.push(`Move ${k + 1}: ${m.pole} ${m.kind} → ${indShown(indDeflection(v, k, m)).toFixed(1)} div`);
    });
  } else
    s.reads.slice(-4).forEach((r, j) => {
      const k = s.reads.length - Math.min(4, s.reads.length) + j;
      const x = diodeReading(v, r);
      lines.push(`Reading ${k + 1}: ${x.Vtrue.toFixed(3)} V, ${x.mAtrue.toFixed(2)} mA${r.resistor ? '' : ' (no resistor!)'}`);
    });
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
