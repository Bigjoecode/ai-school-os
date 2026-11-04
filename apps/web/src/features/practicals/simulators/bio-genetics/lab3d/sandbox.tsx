import { emptyBioGeneticsState, type BioGeneticsState, type GenTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGenetics } from '../actions';
import { BENCH_IDLE, CLASSES, SEASONS, sandboxVariant, useGenBench } from './bench';
import { neededFor } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the class (younger, typical,
 * older) or the season on the field and experiments freely on a bench already
 * set up — shoes on, no set square, one attempt only, names on the sheet,
 * peeking at the beads, keeping beads out, a test cross. Each start is a new
 * shuffle. Nothing is graded, saved or sent.
 */

const SANDBOX_SEED = 727_272;
type Opts = { cls: string; season: string };
const setUpBench = (task: GenTask): BioGeneticsState => ({ ...emptyBioGeneticsState(), task, log: [{ t: 0, a: 'safety:coat' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))] });

export function useGenSandbox(task: GenTask, startedAt: string) {
  const [opts, setOpts] = useState<Opts>({ cls: 'typical', season: 'typical' });
  const [state, setState] = useState<BioGeneticsState>(() => setUpBench(task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => sandboxVariant(task, opts, SANDBOX_SEED + round), [task, opts, round]);
  const g = useGenetics({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  useEffect(() => {
    g.ref.current = setUpBench(task);
    setState(g.ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  const start = (next: Opts) => {
    setOpts(next);
    setRound((r) => r + 1);
    useGenBench.setState(BENCH_IDLE);
    g.ref.current = setUpBench(task);
    setState(g.ref.current);
  };
  return { task, opts, start, state, g, v: variant };
}
export type GenSandbox = ReturnType<typeof useGenSandbox>;

export function GenSandboxForm({ sandbox, onStart }: { sandbox: GenSandbox; onStart: (o: Opts) => void }) {
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
        {sandbox.task === 'HEIGHT'
          ? 'Choose the class and try anything — shoes on, no set square, fingers not spread, unequal classes. Nothing here is marked or saved.'
          : sandbox.task === 'DISCRETE'
            ? 'Try anything — one attempt only, record by name — and see how the results change. Each start is a new class.'
            : sandbox.task === 'CROSS'
              ? 'Try anything — look while picking, keep the beads out, a test cross (Tt × tt), or 200 draws. Each start is a new shuffle.'
              : 'Choose the season and see how the counts and the pyramid of numbers change.'}
      </p>
      {sandbox.task === 'HEIGHT' && sel('Class', 'cls', CLASSES)}
      {sandbox.task === 'FOOD' && sel('Season', 'season', SEASONS)}
      <Button variant="brand" onClick={() => onStart(o)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

/** What is on the sandbox bench (shown: the sandbox is unmarked). */
export function GenSandboxBadge({ sandbox }: { sandbox: GenSandbox }) {
  const v = sandbox.v;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox bench">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      <p className="mt-0.5">
        {sandbox.task === 'HEIGHT'
          ? `${v.height.n} classmates · true mean height ≈ ${mean(v.height.people.map((p) => p.h)).toFixed(1)} cm`
          : sandbox.task === 'DISCRETE'
            ? `${v.disc.n} classmates · ${v.disc.people.filter((p) => p.roller).length} can roll the tongue`
            : sandbox.task === 'CROSS'
              ? 'P(T) = ½ from each Tt beaker when drawn blind and returned'
              : `Grass ${v.food.counts.GRASS}, grasshoppers ${v.food.counts.GRASSHOPPER}, lizards ${v.food.counts.LIZARD}`}
      </p>
    </section>
  );
}
