import { QUAL_ION_LABEL, QUAL_SALTS, emptyChemQualitativeState, type ChemQualitativeState } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useQualitative } from '../actions';
import { saltVariant, useQualBench } from './bench';
import { QUAL_APPARATUS } from './scene-state';

/**
 * The unmarked sandbox: the student picks any salt from the syllabus list and
 * tests it freely on a bench already set up (coat, goggles, apparatus, the
 * burner lit). The results are the shared chemistry (qualObserve) for that
 * salt. Nothing is graded, saved or sent: it lives in this page only.
 */

const SANDBOX_SEED = 424_242;
const setUpBench = (): ChemQualitativeState => ({
  ...emptyChemQualitativeState(),
  log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...QUAL_APPARATUS.filter((a) => a.needed).map((a) => ({ t: 0, a: `collect:${a.id}` })), { t: 0, a: 'burner-on' }],
});

export function useQualSandbox(startedAt: string) {
  const [salt, setSalt] = useState(QUAL_SALTS[0]!.id);
  const [state, setState] = useState<ChemQualitativeState>(setUpBench);
  const [round, setRound] = useState(0);
  const variant = useMemo(() => saltVariant(salt, SANDBOX_SEED + round), [salt, round]);
  const q = useQualitative({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const start = (id: string) => {
    setSalt(id);
    setRound((r) => r + 1);
    useQualBench.setState({ active: -1, sample: 'SOLID' });
    q.ref.current = setUpBench();
    setState(q.ref.current);
  };
  return { salt, start, state, q, variant };
}
export type QualSandbox = ReturnType<typeof useQualSandbox>;

export function QualSandboxForm({ initial, onStart }: { initial: string; onStart: (id: string) => void }) {
  const [id, setId] = useState(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Choose any salt and test it as often as you like: see what each reagent, heating and the gas tests do. Nothing here is marked or saved.</p>
      <label className="block">
        <span className="font-medium">Salt to test</span>
        <select value={id} onChange={(e) => setId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label="Salt to test">
          {QUAL_SALTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.formula} — {s.name}
            </option>
          ))}
        </select>
      </label>
      <Button variant="brand" onClick={() => onStart(id)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

/** Which salt is on the sandbox bench (shown: the sandbox is unmarked). */
export function QualSandboxBadge({ sandbox }: { sandbox: QualSandbox }) {
  const s = sandbox.variant.main;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox salt">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      <p className="mt-0.5">
        {s.formula}: {QUAL_ION_LABEL[s.cation]} and {QUAL_ION_LABEL[s.anion]} · {sandbox.state.tests.length} test{sandbox.state.tests.length === 1 ? '' : 's'}
      </p>
    </section>
  );
}
