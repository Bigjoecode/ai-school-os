import { emptyBioHumanState, type BioHumanState, type HumanTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useHuman } from '../actions';
import { BENCH_IDLE, PARTNERS, SKINS, sandboxVariant, useHumanBench } from './bench';
import { neededFor } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the partner (an athlete, a
 * typical classmate, someone who rarely exercises) or the skin, and
 * experiments freely on a bench already set up — count with the thumb, skip
 * the rest, breathe hard, warn the catcher, let the subject watch. The results
 * are the shared maths for those choices. Nothing is graded, saved or sent.
 */

const SANDBOX_SEED = 717_171;
type Opts = { partner: string; skin: string };
const setUpBench = (task: HumanTask): BioHumanState => ({ ...emptyBioHumanState(), task, log: [{ t: 0, a: 'safety:coat' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))] });

export function useHumanSandbox(task: HumanTask, startedAt: string) {
  const [opts, setOpts] = useState<Opts>({ partner: 'typical', skin: 'typical' });
  const [state, setState] = useState<BioHumanState>(() => setUpBench(task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => sandboxVariant(task, opts, SANDBOX_SEED + round), [task, opts, round]);
  const h = useHuman({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  useEffect(() => {
    h.ref.current = setUpBench(task);
    setState(h.ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  const start = (next: Opts) => {
    setOpts(next);
    setRound((r) => r + 1);
    useHumanBench.setState(BENCH_IDLE);
    h.ref.current = setUpBench(task);
    setState(h.ref.current);
  };
  return { task, opts, start, state, h, v: variant };
}
export type HumanSandbox = ReturnType<typeof useHumanSandbox>;

export function HumanSandboxForm({ sandbox, onStart }: { sandbox: HumanSandbox; onStart: (o: Opts) => void }) {
  const [o, setO] = useState(sandbox.opts);
  const sel = (label: string, key: keyof Opts, items: { id: string; label: string }[]) => (
    <label className="block">
      <span className="font-medium">{label}</span>
      <select value={o[key]} onChange={(e) => setO({ ...o, [key]: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label={label}>
        {items.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">
        {sandbox.task === 'PULSE'
          ? 'Choose your partner and try anything — count with the thumb, skip the rest, exercise for longer. Nothing here is marked or saved.'
          : sandbox.task === 'BREATH'
            ? 'Choose your partner and try anything — breathe hard, pour unequal lime water, skip wiping the mirror.'
            : sandbox.task === 'REACTION'
              ? 'Choose your partner and try anything — warn the catcher, let the arm hang free, close their eyes.'
              : 'Choose the skin and try anything — leave the blindfold off, let one point land first, skip the single-point checks.'}
      </p>
      {sandbox.task === 'SKIN' ? sel('Skin', 'skin', SKINS) : sel('Partner', 'partner', PARTNERS)}
      <Button variant="brand" onClick={() => onStart(o)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

/** What is on the sandbox bench (shown: the sandbox is unmarked). */
export function HumanSandboxBadge({ sandbox }: { sandbox: HumanSandbox }) {
  const v = sandbox.v;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox bench">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      <p className="mt-0.5">
        {sandbox.task === 'PULSE'
          ? `Resting pulse ≈ ${Math.round(v.pulse.rest)} beats/min · recovery time constant ${v.pulse.offTau.toFixed(1)} min`
          : sandbox.task === 'BREATH'
            ? `Breathing rate ≈ ${Math.round(v.breath.rate)} /min · B milky after ≈ ${Math.round(v.breath.kB)} breaths`
            : sandbox.task === 'REACTION'
              ? `Reaction time ≈ ${v.react.tDom.toFixed(3)} s at first`
              : `Thresholds: fingertip ≈ ${v.skin.thr.FINGERTIP.toFixed(0)} mm, forearm ≈ ${v.skin.thr.FOREARM.toFixed(0)} mm`}
      </p>
    </section>
  );
}
