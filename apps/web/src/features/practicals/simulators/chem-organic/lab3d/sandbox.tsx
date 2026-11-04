import { ORG_SAMPLE_DEFS, ORG_TASK_SAMPLES, emptyChemOrganicState, orgSampleName, soapRun, type ChemOrganicState, type OrgTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOrganic } from '../actions';
import { samplesVariant, useOrgBench } from './bench';
import { neededFor } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the samples on the bench and tests
 * freely on a bench already set up (coat, goggles, apparatus, burner lit); for
 * soap, a fresh beaker to try any boiling time, stirring or none. Nothing is
 * graded, saved or sent.
 */

const SANDBOX_SEED = 424_242;
const DEFAULTS: Record<OrgTask, string[]> = { GROUPS: ['cyclohexene', 'kerosene', 'propanol', 'propanoic'], CARBS: ['orange', 'bread', 'cane', 'glucose'], PROTEINS: ['milk', 'gsol', 'groundnut'], SOAP: [] };
const setUpBench = (task: OrgTask): ChemOrganicState => ({ ...emptyChemOrganicState(), task, log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` })), { t: 0, a: 'burner-on' }] });

export function useOrgSandbox(task: OrgTask, startedAt: string) {
  const [ids, setIds] = useState<string[]>(DEFAULTS[task]);
  const [state, setState] = useState<ChemOrganicState>(() => setUpBench(task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => samplesVariant(task, ids, SANDBOX_SEED + round), [task, ids, round]);
  const o = useOrganic({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  useEffect(() => {
    setIds(DEFAULTS[task]);
    o.ref.current = setUpBench(task);
    setState(o.ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  const start = (next: string[]) => {
    setIds(next);
    setRound((r) => r + 1);
    useOrgBench.setState({ active: -1, anim: null });
    o.ref.current = setUpBench(task);
    setState(o.ref.current);
  };
  return { task, ids, start, state, o, v: variant };
}
export type OrgSandbox = ReturnType<typeof useOrgSandbox>;

export function OrgSandboxForm({ sandbox, onStart }: { sandbox: OrgSandbox; onStart: (ids: string[]) => void }) {
  const [ids, setIds] = useState(sandbox.ids);
  const task = sandbox.task;
  const letters = task === 'SOAP' ? [] : ORG_TASK_SAMPLES[task].filter((x) => x !== 'H2O');
  const options = ORG_SAMPLE_DEFS.filter((d) => d.task === task);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">{task === 'SOAP' ? 'A fresh beaker of palm oil and NaOH: try a short boil, no stirring or letting it boil dry, and see what happens. Nothing here is marked or saved.' : 'Choose what goes in each sample beaker and test as often as you like. Nothing here is marked or saved.'}</p>
      {letters.map((l, k) => (
        <label key={l} className="block">
          <span className="font-medium">Sample {orgSampleName(l)}</span>
          <select value={ids[k] ?? ''} onChange={(e) => setIds(letters.map((_, j) => (j === k ? e.target.value : (ids[j] ?? options[0]!.id))))} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label={`Sample ${l}`}>
            {options.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <Button variant="brand" onClick={() => onStart(ids)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

export function OrgSandboxBadge({ sandbox }: { sandbox: OrgSandbox }) {
  const r = sandbox.task === 'SOAP' ? soapRun(sandbox.v, sandbox.state.soap) : null;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox bench">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      {r ? (
        <p className="mt-0.5">
          Boiled {Math.round(r.boiled / 60)} min · saponified {(r.extent * 100).toFixed(0)}% · water {r.water.toFixed(0)} cm³{r.charred ? ' · charred!' : ''}
        </p>
      ) : (
        <ul className="mt-0.5 space-y-0.5">
          {sandbox.v.samples.map((sm) => (
            <li key={sm.letter}>
              {orgSampleName(sm.letter)}: {sm.def.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
