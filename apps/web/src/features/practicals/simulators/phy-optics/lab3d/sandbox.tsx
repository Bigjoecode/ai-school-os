import { emptyPhyOpticsState, OPTICS_START, opticsImage, opticsV, type OpticsTask, type PhyOpticsState, type PhyOpticsVariant } from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOptics } from '../actions';
import { NEEDED } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the lens or mirror and its focal
 * length, then experiments freely (u inside f, u = 2f, …). The simulation is
 * the shared one on a custom variant; each reading shows where the image is
 * really sharpest beside where the student put the screen. Nothing is saved.
 */

export interface SandboxSetup {
  task: OpticsTask;
  f: number;
}
const SANDBOX_SEED = 616_161;
const setUpBench = (task: OpticsTask): PhyOpticsState => ({
  ...emptyPhyOpticsState(),
  task,
  aligned: true,
  ...OPTICS_START[task],
  log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...NEEDED[task].filter((id) => id !== 'rule').map((id) => ({ t: 0, a: `place:${id}` }))],
});

export function useSandbox(startedAt: string, task: OpticsTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, f: task === 'MIRROR' ? 10 : 15 });
  const [state, setState] = useState<PhyOpticsState>(() => setUpBench(task));
  const variant = useMemo<PhyOpticsVariant>(() => ({ seed: SANDBOX_SEED, lensF: setup.f, mirrorF: setup.f, window: 700, aberration: { amp: 0, phase: 0 }, misalign: 1.5 }), [setup]);
  const o = useOptics({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    o.ref.current = setUpBench(s.task);
    setState(o.ref.current);
  };
  const results = state.readings.map((r) => ({ u: r.u, yours: opticsV(state.task ?? 'LENS', r.u, r.screen), truth: opticsImage(variant, state.task ?? 'LENS', r.u) }));
  return { setup, start, state, o, variant, results };
}
export type Sandbox = ReturnType<typeof useSandbox>;

export function SandboxSetupForm({ initial, onStart }: { initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Choose your own lens or mirror and try any object distance — even inside f. Nothing here is marked or saved.</p>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Lens or mirror">
        {(['LENS', 'MIRROR'] as const).map((t) => (
          <Button key={t} size="sm" variant={s.task === t ? 'brand' : 'outline'} onClick={() => setS({ ...s, task: t })} aria-pressed={s.task === t}>
            {t === 'LENS' ? 'Converging lens' : 'Concave mirror'}
          </Button>
        ))}
      </div>
      <label className="block text-[13px]">
        <span className="flex justify-between">
          <span className="font-medium">Focal length f</span>
          <span className="tabular text-muted-foreground">{s.f.toFixed(0)} cm</span>
        </span>
        <input type="range" min={5} max={25} step={1} value={s.f} onChange={(e) => setS({ ...s, f: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" aria-label="Focal length" />
      </label>
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  if (!sandbox.results.length) return null;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">
        Sandbox results (unmarked) · f = {sandbox.variant.lensF} cm
      </p>
      <ul className="mt-1 space-y-0.5">
        {sandbox.results.map((r, k) => {
          const off = r.truth === null ? null : r.yours - r.truth;
          return (
            <li key={k}>
              u = {r.u.toFixed(1)} cm: your v {r.yours.toFixed(1)} cm · {r.truth === null ? <span className="text-amber-300">no real image (u ≤ f)</span> : <>sharpest at {r.truth.toFixed(1)} cm <span className={Math.abs(off!) <= 0.5 ? 'text-emerald-300' : 'text-amber-300'}>({off! >= 0 ? '+' : ''}{off!.toFixed(1)})</span></>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
