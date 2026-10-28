import { chemRatesVariant, emptyChemRatesState, ratesCrossVanish, ratesMgEnd, ratesMgInitialRate, ratesMgSyringe, type ChemRatesState, type ChemRatesVariant, type RatesTask } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRates } from '../actions';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * The unmarked sandbox: the student changes what is fixed in the real
 * practical — the room temperature, the mass of magnesium, ribbon or powder,
 * the strength of the thiosulphate — and experiments freely on the same
 * kinetics. Each reading or run shows the true value. Nothing is saved.
 */

export interface SandboxSetup {
  task: RatesTask;
  room: number;
  mass: number;
  powder: boolean;
  /** s for 50 cm³ of thiosulphate at 25 °C (its strength). */
  t50: number;
}
const SANDBOX_SEED = 515_151;
const setUpBench = (task: RatesTask): ChemRatesState => ({
  ...emptyChemRatesState(),
  task,
  log: [{ t: 0, a: `task:${task}` }, { t: 0, a: 'safety:goggles' }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
});

export function useSandbox(startedAt: string, task: RatesTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, room: 25, mass: 0.048, powder: false, t50: 20 });
  const [state, setState] = useState<ChemRatesState>(() => setUpBench(task));
  const variant = useMemo<ChemRatesVariant>(() => ({ ...chemRatesVariant(SANDBOX_SEED), room: setup.room, mgMass: setup.mass, mgTrue: setup.mass, powder: setup.powder, t50: setup.t50, stick: 0.3 }), [setup]);
  const o = useRates({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    o.resetLive();
    o.ref.current = setUpBench(s.task);
    setState(o.ref.current);
  };
  return { setup, start, state, o, variant };
}
export type Sandbox = ReturnType<typeof useSandbox>;

function Range({ label, value, min, max, step, unit, onChange, dp = 0 }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (x: number) => void; dp?: number }) {
  return (
    <label className="block text-[13px]">
      <span className="flex justify-between">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">
          {value.toFixed(dp)} {unit}
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
      <p className="text-muted-foreground">Change what the real practical keeps fixed and see what happens: a warmer room, more magnesium, powder instead of ribbon, a stronger thiosulphate. Nothing here is marked or saved.</p>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Experiment">
        {(['MG', 'CROSS'] as const).map((t) => (
          <Button key={t} size="sm" variant={s.task === t ? 'brand' : 'outline'} onClick={() => setS({ ...s, task: t })} aria-pressed={s.task === t}>
            {t === 'MG' ? 'Magnesium + acid' : 'Disappearing cross'}
          </Button>
        ))}
      </div>
      <Range label="Room temperature" value={s.room} min={15} max={45} step={1} unit="°C" onChange={(x) => setS({ ...s, room: x })} />
      {s.task === 'MG' ? (
        <>
          <Range label="Mass of magnesium" value={s.mass} min={0.012} max={0.08} step={0.006} unit="g" dp={3} onChange={(x) => setS({ ...s, mass: x })} />
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={s.powder} onChange={(e) => setS({ ...s, powder: e.target.checked })} /> Powdered magnesium (a larger surface)
          </label>
        </>
      ) : (
        <Range label="Thiosulphate strength: time for 50 cm³ at 25 °C" value={s.t50} min={8} max={40} step={1} unit="s" onChange={(x) => setS({ ...s, t50: x })} />
      )}
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { state: s, variant: v } = sandbox;
  if (!s.readings.length && !s.crossRuns.some((r) => r.done)) return null;
  return (
    <section className="pointer-events-auto w-[min(330px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked) · room {v.room} °C</p>
      <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
        {s.mgRuns.map((r, i) =>
          r ? (
            <li key={`m${i}`}>
              Run {i + 1} ({r.conc} mol dm⁻³): initial rate {ratesMgInitialRate(v, r.conc).toFixed(2)} cm³ s⁻¹, all gone after {Math.round(ratesMgEnd(v, r.conc, r.cleaned))} s{r.cleaned ? '' : ' (uncleaned)'}
            </li>
          ) : null,
        )}
        {s.readings.slice(-8).map((e, k) => {
          const r = s.mgRuns[e.run];
          return r ? (
            <li key={`r${k}`} className="text-white/80">
              {e.at.toFixed(1)} s: syringe {ratesMgSyringe(v, r, e.at + (r.watchLag ?? 0)).toFixed(1)} cm³
            </li>
          ) : null;
        })}
        {s.crossRuns
          .filter((r) => r.done)
          .map((r, k) => (
            <li key={`c${k}`}>
              {r.thio} + {r.water} cm³{r.bath ? ` at ${r.bath} °C` : ''}: you stopped at {r.elapsed?.toFixed(1)} s; the cross went at {ratesCrossVanish(v, r).toFixed(1)} s
            </li>
          ))}
      </ul>
    </section>
  );
}
