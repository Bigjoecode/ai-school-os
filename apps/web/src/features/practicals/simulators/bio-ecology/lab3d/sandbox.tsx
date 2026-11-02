import { emptyBioEcologyState, type BioEcologyState, type EcoTask } from '@aischool/shared';
import { Leaf } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useEcology } from '../actions';
import { POPS, WEATHER, sandboxVariant, useEcoBench } from './bench';
import { shedFor } from './scene-state';

/**
 * The unmarked sandbox: a fresh field each round, with a chosen grasshopper
 * population or weather, and the apparatus already out. The student can try
 * three quadrats or thirty, a bright mark, a recapture after an hour, the
 * thermometer in the sun, damp soil… Nothing is graded, saved or sent.
 */

const SANDBOX_SEED = 616_161;
type Opts = { pop: string; weather: string };
const setUpBench = (task: EcoTask): BioEcologyState => ({ ...emptyBioEcologyState(), task, log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...shedFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))] });

export function useEcoSandbox(task: EcoTask, startedAt: string) {
  const [opts, setOpts] = useState<Opts>({ pop: 'medium', weather: 'mixed' });
  const [state, setState] = useState<BioEcologyState>(() => setUpBench(task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => sandboxVariant(task, opts, SANDBOX_SEED + round), [task, opts, round]);
  const o = useEcology({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  useEffect(() => {
    o.ref.current = setUpBench(task);
    setState(o.ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  const start = (next: Opts) => {
    setOpts(next);
    setRound((r) => r + 1);
    useEcoBench.setState({ sel: 0 });
    o.ref.current = setUpBench(task);
    setState(o.ref.current);
  };
  return { task, opts, start, state, o, v: variant };
}
export type EcoSandbox = ReturnType<typeof useEcoSandbox>;

export function EcoSandboxForm({ sandbox, onStart }: { sandbox: EcoSandbox; onStart: (o: Opts) => void }) {
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
        {sandbox.task === 'QUADRAT'
          ? 'A new plot every time. Try three quadrats, then thirty — or put them where you can see plants — and compare with the true numbers.'
          : sandbox.task === 'CAPTURE'
            ? 'Choose the true population, then try a bright mark, a recapture after an hour, or a week’s wait.'
            : sandbox.task === 'FACTORS'
              ? 'Choose the weather, then read the thermometer in the sun and in the shade.'
              : 'A new set of soils. Try damp soil, no cotton wool, or weighing a hot crucible.'}{' '}
        Nothing here is marked or saved.
      </p>
      {sandbox.task === 'CAPTURE' && sel('Grasshoppers in the plot', 'pop', POPS)}
      {sandbox.task === 'FACTORS' && sel('Weather', 'weather', WEATHER)}
      <Button variant="brand" onClick={() => onStart(o)}>
        <Leaf /> Start the sandbox
      </Button>
    </div>
  );
}

/** The true values behind the sandbox field (shown: the sandbox is unmarked). */
export function EcoSandboxBadge({ sandbox }: { sandbox: EcoSandbox }) {
  const v = sandbox.v;
  const s = sandbox.state;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox field">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      <p className="mt-0.5">
        {sandbox.task === 'QUADRAT'
          ? `True populations: Tridax ${v.quad.plants.TRIDAX.length}, Sida ${v.quad.plants.SIDA.length}, Euphorbia ${v.quad.plants.EUPH.length} · ${s.quad.quads.length} quadrats`
          : sandbox.task === 'CAPTURE'
            ? `True population ${v.cap.N} grasshoppers · ${s.cap.clock} h since release`
            : sandbox.task === 'FACTORS'
              ? `Day ${s.fac.day}, cloud ${Math.round(v.fac.days[0]!.cloud * 100)} % · the sun adds up to ${v.fac.sunBias} °C to an unshaded bulb`
              : `Humus: sand ${v.soil.types.SAND.humus} %, loam ${v.soil.types.LOAM.humus} %, clay ${v.soil.types.CLAY.humus} %`}
      </p>
    </section>
  );
}
