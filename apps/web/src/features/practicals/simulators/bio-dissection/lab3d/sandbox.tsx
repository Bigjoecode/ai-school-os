import { emptyBioDissectionState, eosinFront, type BioDissectionState, type DissectTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDissect } from '../actions';
import { BENCH_IDLE, CLIMATES, SPECIMENS, sandboxVariant, useDissectBench } from './bench';
import { neededFor } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the weather (how fast the plant
 * transpires and the mould grows) and the specimen, and experiments freely on
 * a bench already set up — torn roots, a dark cupboard, deep cuts, forceps,
 * open controls, sealed plates, 37 °C. The results are the shared maths for
 * those choices. Nothing is graded, saved or sent.
 */

const SANDBOX_SEED = 717_171;
type Opts = { climate: string; specimen: string };
const setUpBench = (task: DissectTask): BioDissectionState => ({ ...emptyBioDissectionState(), task, log: [{ t: 0, a: 'safety:coat' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))] });

export function useDissectSandbox(task: DissectTask, startedAt: string) {
  const [opts, setOpts] = useState<Opts>({ climate: 'normal', specimen: 'normal' });
  const [state, setState] = useState<BioDissectionState>(() => setUpBench(task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => sandboxVariant(task, opts, SANDBOX_SEED + round), [task, opts, round]);
  const p = useDissect({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  useEffect(() => {
    p.ref.current = setUpBench(task);
    setState(p.ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  const start = (next: Opts) => {
    setOpts(next);
    setRound((r) => r + 1);
    useDissectBench.setState(BENCH_IDLE);
    p.ref.current = setUpBench(task);
    setState(p.ref.current);
  };
  return { task, opts, start, state, p, v: variant };
}
export type DissectSandbox = ReturnType<typeof useDissectSandbox>;

export function DissectSandboxForm({ sandbox, onStart }: { sandbox: DissectSandbox; onStart: (o: Opts) => void }) {
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
        {sandbox.task === 'EOSIN'
          ? 'Choose the weather — then try torn roots, a dark cupboard, thick slices or cutting too early. Nothing here is marked or saved.'
          : sandbox.task === 'RAT'
            ? 'Choose the specimen — then see what a deep cut, pulling with forceps or stretching the gut does. Nothing here is marked or saved.'
            : 'Choose the weather — then open the control, lift lids wide, seal the plates, or leave the bread uncovered. Nothing here is marked or saved.'}
      </p>
      {sandbox.task === 'RAT' ? sel('Specimen', 'specimen', SPECIMENS) : sel('Weather', 'climate', CLIMATES)}
      <Button variant="brand" onClick={() => onStart(o)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

/** What is on the sandbox bench (shown: the sandbox is unmarked). */
export function DissectSandboxBadge({ sandbox }: { sandbox: DissectSandbox }) {
  const v = sandbox.v;
  const s = sandbox.state;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox bench">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      <p className="mt-0.5">
        {sandbox.task === 'EOSIN'
          ? `${s.eosin.clock} min · red line ≈ ${eosinFront(v.eosin, s.eosin, s.eosin.clock).toFixed(1)} cm · ${(v.eosin.rate * 60).toFixed(1)} cm/h in bright air`
          : sandbox.task === 'RAT'
            ? `Body ≈ ${v.rat.body.toFixed(0)} cm · gut ≈ ${(v.rat.si + v.rat.li).toFixed(0)} cm`
            : `Day ${s.micro.day} · ≈ ${v.micro.airRate.toFixed(1)} colonies per minute from the air`}
      </p>
    </section>
  );
}
