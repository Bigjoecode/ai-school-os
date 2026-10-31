import { emptyPhySoundState, SONO_SLOTS, SOUND_FORKS, soundDefaultLen, sonoResonance, tubeResonance, tubeResponse, sonoRider, type PhySoundState, type PhySoundVariant, type SoundTask } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSound } from '../actions';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * The unmarked sandbox: choose the room's temperature and the tube's width
 * (resonance tube), or the wire's mass per unit length (sonometer), then try
 * anything — the second and third resonances, a fork struck on the bench, a
 * slack wire, the rider at twice the length. The simulation is the shared one
 * on a custom variant; each length taken shows where the resonances truly are.
 * Nothing is saved.
 */

export interface SandboxSetup {
  task: SoundTask;
  /** °C */
  tempC: number;
  /** cm */
  diameter: number;
  /** g m⁻¹ */
  mu: number;
}
const SANDBOX_SEED = 515_151;
const setUpBench = (task: SoundTask): PhySoundState => ({
  ...emptyPhySoundState(),
  task,
  len: soundDefaultLen(task),
  log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
});

export function useSandbox(startedAt: string, task: SoundTask, audible: boolean) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, tempC: 30, diameter: 3, mu: 0.55 });
  const [state, setState] = useState<PhySoundState>(() => setUpBench(task));
  const variant = useMemo<PhySoundVariant>(
    () => ({
      seed: SANDBOX_SEED,
      tempC: setup.tempC,
      speed: 331 * Math.sqrt((273 + setup.tempC) / 273),
      diameter: setup.diameter,
      endCorr: 0.3 * setup.diameter,
      alpha: 0.045,
      forks: [...SOUND_FORKS],
      mu: setup.mu / 1000,
      q: 60,
      hanger: 1,
      slots: Array.from({ length: SONO_SLOTS }, () => 0.5),
    }),
    [setup],
  );
  const o = useSound({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false, audible });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    o.damp();
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
      <p className="text-muted-foreground">Set up your own tube or wire and try anything — find the second and third resonances, strike a fork on the bench and hear the clang, take the load off. Nothing here is marked or saved.</p>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Experiment">
        {(['TUBE', 'SONO'] as const).map((t) => (
          <Button key={t} size="sm" variant={s.task === t ? 'brand' : 'outline'} onClick={() => setS({ ...s, task: t })} aria-pressed={s.task === t}>
            {t === 'TUBE' ? 'Resonance tube' : 'Sonometer'}
          </Button>
        ))}
      </div>
      {s.task === 'TUBE' ? (
        <>
          <Range label="Room temperature" value={s.tempC} min={0} max={45} step={1} unit="°C" onChange={(x) => setS({ ...s, tempC: x })} />
          <Range label="Tube diameter" value={s.diameter} min={1} max={6} step={0.5} unit="cm" onChange={(x) => setS({ ...s, diameter: x })} />
        </>
      ) : (
        <Range label="Wire: mass per metre" value={s.mu} min={0.2} max={2} step={0.05} unit="g m⁻¹" onChange={(x) => setS({ ...s, mu: x })} />
      )}
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { state: s, variant: v } = sandbox;
  if (!s.readings.length) return null;
  return (
    <section className="pointer-events-auto w-[min(340px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">
        Sandbox (unmarked) · {s.task === 'SONO' ? `μ ${(v.mu * 1000).toFixed(2)} g m⁻¹` : `v ${v.speed.toFixed(1)} m s⁻¹, e ${v.endCorr.toFixed(2)} cm`}
      </p>
      <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
        {s.readings.map((r, k) => (
          <li key={k}>
            {r.fork} Hz at {r.len.toFixed(1)} cm:{' '}
            {s.task === 'SONO'
              ? `rider drive ${(sonoRider(v, r.fork, r.len, r.load) * 100).toFixed(0)} % (fundamental at ${r.load ? sonoResonance(v, r.fork, r.load).toFixed(1) : '—'} cm)`
              : `response ${(tubeResponse(v, r.fork, r.len) * 100).toFixed(0)} % (resonances at ${tubeResonance(v, r.fork, 1).toFixed(1)}, ${tubeResonance(v, r.fork, 2).toFixed(1)} cm)`}
          </li>
        ))}
      </ul>
    </section>
  );
}
