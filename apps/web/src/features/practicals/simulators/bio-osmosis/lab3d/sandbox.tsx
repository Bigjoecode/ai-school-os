import { emptyBioOsmosisState, type BioOsmosisState, type OsmoTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOsmosis } from '../actions';
import { ACIDS, SAPS, TUBERS, sandboxVariant, useOsmoBench } from './bench';
import { neededFor } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the tuber (its cell sap), the
 * onion's sap strength or the acid's strength, and experiments freely on a
 * bench already set up. The results are the shared physics for those
 * choices. Nothing is graded, saved or sent.
 */

const SANDBOX_SEED = 515_151;
type Opts = { tuber: string; sap: string; acid: string };
const setUpBench = (task: OsmoTask): BioOsmosisState => ({ ...emptyBioOsmosisState(), task, log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))] });

export function useOsmoSandbox(task: OsmoTask, startedAt: string) {
  const [opts, setOpts] = useState<Opts>({ tuber: 'irish', sap: 'typical', acid: '0.1' });
  const [state, setState] = useState<BioOsmosisState>(() => setUpBench(task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => sandboxVariant(task, opts, SANDBOX_SEED + round), [task, opts, round]);
  const o = useOsmosis({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  useEffect(() => {
    o.ref.current = setUpBench(task);
    setState(o.ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  const start = (next: Opts) => {
    setOpts(next);
    setRound((r) => r + 1);
    useOsmoBench.setState({ sel: 0, lying: 'tile', tally: [] });
    o.ref.current = setUpBench(task);
    setState(o.ref.current);
  };
  return { task, opts, start, state, o, v: variant };
}
export type OsmoSandbox = ReturnType<typeof useOsmoSandbox>;

export function OsmoSandboxForm({ sandbox, onStart }: { sandbox: OsmoSandbox; onStart: (o: Opts) => void }) {
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
      <p className="text-muted-foreground">{sandbox.task === 'POTATO' ? 'Choose the tuber and try any solutions, soaking times — or forget to blot. Nothing here is marked or saved.' : sandbox.task === 'PLASMOLYSIS' ? 'Choose how strong the cell sap is and try water, sucrose and salt in any order.' : 'Choose the acid’s strength and cut any cubes you like.'}</p>
      {sandbox.task === 'POTATO' ? sel('Tuber', 'tuber', TUBERS) : sandbox.task === 'PLASMOLYSIS' ? sel('Epidermis', 'sap', SAPS) : sel('Acid', 'acid', ACIDS)}
      <Button variant="brand" onClick={() => onStart(o)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

/** What is on the sandbox bench (shown: the sandbox is unmarked). */
export function OsmoSandboxBadge({ sandbox }: { sandbox: OsmoSandbox }) {
  const v = sandbox.v;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox bench">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      <p className="mt-0.5">
        {sandbox.task === 'POTATO'
          ? `Isotonic at about ${v.potato.iso.toFixed(2)} mol/dm³ · soak ${sandbox.state.potato.cyl.some((c) => c.placedAt !== null) ? sandbox.state.potato.clock : 0} min`
          : sandbox.task === 'PLASMOLYSIS'
            ? `Cell sap ≈ ${v.plas.meanC.toFixed(2)} mol/dm³ · ${sandbox.state.plas.clock} min`
            : `Acid front ${v.agar.k.toFixed(2)} mm per √min · ${sandbox.state.agar.clock} min`}
      </p>
    </section>
  );
}
