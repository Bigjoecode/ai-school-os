import { bottleMass, calIndicated, densityWaterAt, emptyPhyDensityState, floatReading, phyDensityVariant, sbReading, type DensityTask, type PhyDensityState, type PhyDensityVariant } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TASK_NAME, useDensity } from '../actions';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * The unmarked sandbox: set the instruments' zero errors (calipers), the
 * stone's density and the liquid's (Archimedes), the liquid the tube floats in
 * (flotation), or the room's temperature and the liquid (bottle) — then try
 * anything: a stone denser than iron, a tube in kerosene, a wet bottle. Each
 * reading taken shows what the instrument truly indicated. Nothing is saved.
 */

export interface SandboxSetup {
  task: DensityTask;
  zv: number;
  zm: number;
  stoneRho: number;
  saltRD: number;
  /** The liquid the tube floats in (kg m⁻³). */
  floatRho: number;
  tempC: number;
  liquidRD: number;
}
const SANDBOX_SEED = 616_161;
const setUpBench = (task: DensityTask): PhyDensityState => ({ ...emptyPhyDensityState(), task, log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))] });

export function useSandbox(startedAt: string, task: DensityTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, zv: 0.02, zm: -0.01, stoneRho: 2700, saltRD: 1.12, floatRho: 1000, tempC: 28, liquidRD: 0.8 });
  const [state, setState] = useState<PhyDensityState>(() => setUpBench(task));
  const variant = useMemo<PhyDensityVariant>(() => {
    const base = phyDensityVariant(SANDBOX_SEED);
    const rhoW = setup.task === 'FLOAT' ? setup.floatRho : densityWaterAt(setup.tempC);
    return { ...base, tempC: setup.tempC, rhoW, zv: setup.zv, zm: setup.zm, stoneRho: setup.stoneRho, saltRD: setup.saltRD, liquidRD: setup.liquidRD, sbZero: 0.1 };
  }, [setup]);
  const o = useDensity({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
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
          {value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)} {unit}
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
      <p className="text-muted-foreground">Set up your own instruments and materials and try anything — big zero errors, an iron sinker, the tube in kerosene, a hot day. Nothing here is marked or saved.</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Experiment">
        {(['CAL', 'ARCH', 'FLOAT', 'BOTTLE'] as const).map((t) => (
          <Button key={t} size="sm" variant={s.task === t ? 'brand' : 'outline'} onClick={() => setS({ ...s, task: t })} aria-pressed={s.task === t}>
            {TASK_NAME[t]}
          </Button>
        ))}
      </div>
      {s.task === 'CAL' && (
        <>
          <Range label="Vernier zero error" value={s.zv} min={-0.08} max={0.08} step={0.01} unit="cm" onChange={(x) => setS({ ...s, zv: x })} />
          <Range label="Micrometer zero error" value={s.zm} min={-0.08} max={0.08} step={0.01} unit="mm" onChange={(x) => setS({ ...s, zm: x })} />
        </>
      )}
      {s.task === 'ARCH' && (
        <>
          <Range label="Stone's density" value={s.stoneRho} min={1600} max={8000} step={100} unit="kg m⁻³" onChange={(x) => setS({ ...s, stoneRho: x })} />
          <Range label="Salt solution's RD" value={s.saltRD} min={1} max={1.3} step={0.01} unit="" onChange={(x) => setS({ ...s, saltRD: x })} />
        </>
      )}
      {s.task === 'FLOAT' && <Range label="Liquid in the cylinder" value={s.floatRho} min={780} max={1200} step={10} unit="kg m⁻³" onChange={(x) => setS({ ...s, floatRho: x })} />}
      {s.task === 'BOTTLE' && (
        <>
          <Range label="Room temperature" value={s.tempC} min={4} max={45} step={1} unit="°C" onChange={(x) => setS({ ...s, tempC: x })} />
          <Range label="The liquid's RD" value={s.liquidRD} min={0.7} max={1.3} step={0.01} unit="" onChange={(x) => setS({ ...s, liquidRD: x })} />
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
  const lines: string[] = [
    ...s.cal.map((r) => `${r.tool === 'V' ? 'Vernier' : 'Micrometer'} ${r.obj ?? 'zero'}: ${calIndicated(v, r.tool, r.obj, r.pos, r.forced, r.inside).toFixed(3)} ${r.tool === 'V' ? 'cm' : 'mm'}${r.forced ? ' (squeezed)' : ''}`),
    ...s.sb.map((r) => `Spring balance, ${r.where}${r.where !== 'air' ? ` ${r.depth}` : ''}: ${sbReading(v, r).toFixed(3)} N${r.bubbles ? ' (bubbles)' : ''}`),
    ...s.depths.map((d) => `${d.load * 10} g: h = ${floatReading(v, d.load, d.touching).toFixed(2)} cm${d.touching ? ' (touching)' : ''}`),
    ...s.weighs.map((w) => `${w.item}: riders ${w.riders.toFixed(1)} g${w.bottle ? `, true ${bottleMass(v, w.bottle).toFixed(2)} g` : ''}`),
  ];
  if (!lines.length) return null;
  return (
    <section className="pointer-events-auto w-[min(340px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked) · water {v.rhoW.toFixed(1)} kg m⁻³</p>
      <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
        {lines.slice(-12).map((l, k) => (
          <li key={k}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
