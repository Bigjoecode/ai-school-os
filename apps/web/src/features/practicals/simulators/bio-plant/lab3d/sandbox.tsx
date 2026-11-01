import { emptyBioPlantState, potoCondAt, type BioPlantState, type PlantTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePlant } from '../actions';
import { BENCH_IDLE, DAYS, SHOOTS, WEEDS, sandboxVariant, usePlantBench } from './bench';
import { neededFor } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the shoot (how leafy), the
 * pondweed (how vigorous) or the day (how sunny) and experiments freely on a
 * bench already set up — cut in air, leave the joint unsealed, skip the heat
 * filter, forget to destarch. The results are the shared maths for those
 * choices. Nothing is graded, saved or sent.
 */

const SANDBOX_SEED = 616_161;
type Opts = { shoot: string; weed: string; day: string };
const setUpBench = (task: PlantTask): BioPlantState => ({ ...emptyBioPlantState(), task, log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))] });

export function usePlantSandbox(task: PlantTask, startedAt: string) {
  const [opts, setOpts] = useState<Opts>({ shoot: 'hibiscus', weed: 'typical', day: 'normal' });
  const [state, setState] = useState<BioPlantState>(() => setUpBench(task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => sandboxVariant(task, opts, SANDBOX_SEED + round), [task, opts, round]);
  const p = usePlant({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  useEffect(() => {
    p.ref.current = setUpBench(task);
    setState(p.ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  const start = (next: Opts) => {
    setOpts(next);
    setRound((r) => r + 1);
    usePlantBench.setState(BENCH_IDLE);
    p.ref.current = setUpBench(task);
    setState(p.ref.current);
  };
  return { task, opts, start, state, p, v: variant };
}
export type PlantSandbox = ReturnType<typeof usePlantSandbox>;

export function PlantSandboxForm({ sandbox, onStart }: { sandbox: PlantSandbox; onStart: (o: Opts) => void }) {
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
      <p className="text-muted-foreground">{sandbox.task === 'POTOMETER' ? 'Choose the shoot and try any conditions — or cut it in air, or leave the joint unsealed. Nothing here is marked or saved.' : sandbox.task === 'OXYGEN' ? 'Choose the pondweed and try any distances — leave out the NaHCO₃ or the heat filter, or keep the room lights on.' : 'Choose the day and test any leaves — try the plant from the window, or skip the boiling.'}</p>
      {sandbox.task === 'POTOMETER' ? sel('Shoot', 'shoot', SHOOTS) : sandbox.task === 'OXYGEN' ? sel('Pondweed', 'weed', WEEDS) : sel('Day', 'day', DAYS)}
      <Button variant="brand" onClick={() => onStart(o)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

/** What is on the sandbox bench (shown: the sandbox is unmarked). */
export function PlantSandboxBadge({ sandbox }: { sandbox: PlantSandbox }) {
  const v = sandbox.v;
  const s = sandbox.state;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox bench">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      <p className="mt-0.5">
        {sandbox.task === 'POTOMETER'
          ? `Still-air uptake ≈ ${v.poto.base.toFixed(1)} mm/min · ${s.poto.bubble ? potoCondAt(s.poto, s.poto.clock).toLowerCase() : 'not set up'} · ${Math.round(s.poto.clock)} min`
          : sandbox.task === 'OXYGEN'
            ? `Compensation ≈ ${Math.round(v.oxy.dComp)} cm (dark room) · ${Math.round(s.oxy.clock)} min`
            : `Starch per hour of light ≈ ${Math.round(v.starch.perHour * 100)} % of full · ${s.starch.hours} h`}
      </p>
    </section>
  );
}
