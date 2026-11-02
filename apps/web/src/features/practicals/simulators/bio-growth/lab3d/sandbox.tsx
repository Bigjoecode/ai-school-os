import { emptyBioGrowthState, germCount, type BioGrowthState, type GrowthTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGrowth } from '../actions';
import { BATCHES, BENCH_IDLE, SEASONS, sandboxVariant, useGrowthBench } from './bench';
import { neededFor } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the seed batch (how many are
 * dead) and the season (how fast things grow) and experiments freely on a
 * bench already set up — tap water instead of boiled, no oil, no
 * disinfectant, a bung, the clinostat off. The results are the shared maths
 * for those choices. Nothing is graded, saved or sent.
 */

const SANDBOX_SEED = 717_171;
type Opts = { batch: string; season: string };
const setUpBench = (task: GrowthTask): BioGrowthState => ({ ...emptyBioGrowthState(), task, log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))] });

export function useGrowthSandbox(task: GrowthTask, startedAt: string) {
  const [opts, setOpts] = useState<Opts>({ batch: 'normal', season: 'normal' });
  const [state, setState] = useState<BioGrowthState>(() => setUpBench(task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => sandboxVariant(task, opts, SANDBOX_SEED + round), [task, opts, round]);
  const p = useGrowth({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  useEffect(() => {
    p.ref.current = setUpBench(task);
    setState(p.ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  const start = (next: Opts) => {
    setOpts(next);
    setRound((r) => r + 1);
    useGrowthBench.setState(BENCH_IDLE);
    p.ref.current = setUpBench(task);
    setState(p.ref.current);
  };
  return { task, opts, start, state, p, v: variant };
}
export type GrowthSandbox = ReturnType<typeof useGrowthSandbox>;

export function GrowthSandboxForm({ sandbox, onStart }: { sandbox: GrowthSandbox; onStart: (o: Opts) => void }) {
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
        {sandbox.task === 'GERM'
          ? 'Choose the seed and the season and set up any tubes you like — tap water, no oil, a handful of seeds. Nothing here is marked or saved.'
          : sandbox.task === 'SEEDLING'
            ? 'Choose the season and try anything — skip the soaking, forget to water, measure from the soil.'
            : sandbox.task === 'RESP'
              ? 'Choose the seed and the season — then leave out the disinfectant, seal a flask with a bung, or forget to invert them.'
              : 'Choose the season — then leave gaps in the box, turn the slit away, or leave the clinostat off.'}
      </p>
      {(sandbox.task === 'GERM' || sandbox.task === 'RESP') && sel('Seed', 'batch', BATCHES)}
      {sel('Season', 'season', SEASONS)}
      <Button variant="brand" onClick={() => onStart(o)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

/** What is on the sandbox bench (shown: the sandbox is unmarked). */
export function GrowthSandboxBadge({ sandbox }: { sandbox: GrowthSandbox }) {
  const v = sandbox.v;
  const s = sandbox.state;
  const t = s.germ.tubes[0]!;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox bench">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      <p className="mt-0.5">
        {sandbox.task === 'GERM'
          ? `Dead seeds ≈ ${Math.round(v.germ.dead * 100)} % · day ${s.germ.day} · tube A: ${t.seeds ? `${germCount(v.germ, s.germ, t, 0, s.germ.day)} of ${t.seeds}` : 'empty'}`
          : sandbox.task === 'SEEDLING'
            ? `Day ${s.seedling.day} · cowpea grows to ≈ ${Math.round(v.seedling.grow.COWPEA.Lmax)} mm`
            : sandbox.task === 'RESP'
              ? `Germinating flask warms ≈ ${v.resp.rA.toFixed(1)} °C/day · ${Math.round(s.resp.clock)} h`
              : `Shoot bends towards ≈ ${Math.round(v.trop.thMax)}° · day ${s.trop.day}`}
      </p>
    </section>
  );
}
