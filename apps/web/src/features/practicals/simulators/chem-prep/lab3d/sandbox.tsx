import { chemPrepVariant, emptyChemPrepState, type ChemPrepState, type PrepTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePrep } from '../actions';
import { prepReadout } from '../readout';
import { usePrepBench } from './bench';
import { neededFor } from './scene-state';

/**
 * The unmarked sandbox: a bench already set up (coat, goggles, apparatus) with
 * fresh readings, to try the mistakes on purpose — overshoot the mark, put the
 * thermometer in the liquid, dry ammonia with acid — and see what happens.
 * Nothing is graded, saved or sent.
 */

const SANDBOX_SEED = 424_242;
const IDEAS: Record<PrepTask, string> = {
  STANDARD: 'Overshoot the mark, skip the rinsings or pipette without rinsing, and watch the concentration change.',
  LECHAT: 'Try an undiluted mixture, add water, or leave a tube longer in the hot water.',
  DISTIL: 'Put the bulb in the liquid or above the side arm, connect the water at the top, leave out the granules, or heat the dish strongly to dryness.',
  HALOGEN: 'Use the old chlorine water, or forget to shake after the hexane.',
  AMMONIA: 'Clamp the tube mouth up, dry the gas with conc. H₂SO₄, or collect it over water.',
};
const setUpBench = (task: PrepTask): ChemPrepState => ({ ...emptyChemPrepState(), task, log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))] });

export function usePrepSandbox(task: PrepTask, startedAt: string) {
  const [state, setState] = useState<ChemPrepState>(() => setUpBench(task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => chemPrepVariant(SANDBOX_SEED + round, task), [task, round]);
  const o = usePrep({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  useEffect(() => {
    o.ref.current = setUpBench(task);
    setState(o.ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  const start = () => {
    setRound((r) => r + 1);
    usePrepBench.setState({ active: -1 });
    o.ref.current = setUpBench(task);
    setState(o.ref.current);
  };
  return { task, start, state, o, v: variant };
}
export type PrepSandbox = ReturnType<typeof usePrepSandbox>;

export function PrepSandboxForm({ sandbox, onStart }: { sandbox: PrepSandbox; onStart: () => void }) {
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">A bench already set up, with fresh readings. {IDEAS[sandbox.task]} Nothing here is marked or saved.</p>
      <Button variant="brand" onClick={onStart}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

export function PrepSandboxBadge({ sandbox }: { sandbox: PrepSandbox }) {
  const lines = prepReadout(sandbox.v, sandbox.state, usePrepBench.getState().active).slice(0, 4);
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox bench">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      <ul className="mt-0.5 space-y-0.5">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
