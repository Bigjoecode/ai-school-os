import { SPECIMEN_SETS, SPECIMEN_SET_INFO, bioSpecimensVariant, emptyBioSpecimensState, emptySpecimenEntry, specimenNameMatches, type BioSpecimensState, type SpecimenSet } from '@aischool/shared';
import { Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NEEDED } from './scene-state';
import type { SpecUpdate } from './sheet';

/**
 * The unmarked sandbox: any set of specimens, a fresh bench each time. The
 * student examines and records them as in the practical, then checks their
 * names and groups against the right answers. Nothing is graded, saved or sent.
 */
const SANDBOX_SEED = 616_161;
const setUp = (set: SpecimenSet, seed: number): BioSpecimensState => ({
  ...emptyBioSpecimensState(),
  set,
  entries: bioSpecimensVariant(seed, set).specimens.map(() => emptySpecimenEntry()),
  log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:gloves' }, ...NEEDED.map((a) => ({ t: 0, a: `collect:${a}` }))],
});

export function useSandbox(initial: SpecimenSet) {
  const [round, setRound] = useState(1);
  const [set, setSet] = useState<SpecimenSet>(initial);
  const [state, setState] = useState<BioSpecimensState>(() => setUp(initial, SANDBOX_SEED + 1));
  const ref = useRef(state);
  ref.current = state;
  const seed = SANDBOX_SEED + round;
  const v = useMemo(() => bioSpecimensVariant(seed, set), [seed, set]);
  const update: SpecUpdate = (fn, log) => {
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: 0, a: log }].slice(-600) };
    ref.current = next;
    setState(next);
  };
  const start = (s: SpecimenSet) => {
    setSet(s);
    setRound((r) => r + 1);
    ref.current = setUp(s, SANDBOX_SEED + round + 1);
    setState(ref.current);
  };
  return { set, start, state, v, update, note: (a: string) => update((s) => s, a) };
}
export type Sandbox = ReturnType<typeof useSandbox>;

export function SandboxSetupForm({ initial, onStart }: { initial: SpecimenSet; onStart: (s: SpecimenSet) => void }) {
  const [s, setS] = useState(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Pick any set of specimens and practise identifying them, as often as you like. Check your names and groups at the end. Nothing here is marked or saved.</p>
      <select value={s} onChange={(e) => setS(e.target.value as SpecimenSet)} className="h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label="Set of specimens">
        {SPECIMEN_SETS.map((x) => (
          <option key={x} value={x}>
            {SPECIMEN_SET_INFO[x].title}
          </option>
        ))}
      </select>
      <Button variant="brand" onClick={() => onStart(s)}>
        <Search /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const [open, setOpen] = useState(false);
  const { v, state } = sandbox;
  return (
    <section className="pointer-events-auto w-[min(320px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox check">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked) · {v.info.title}</p>
      <button type="button" className="mt-1 font-semibold text-amber-300 underline" onClick={() => setOpen((x) => !x)}>
        {open ? 'Hide the answers' : 'Check my names and groups'}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5">
          {v.specimens.map((sp, i) => {
            const e = state.entries[i] ?? emptySpecimenEntry();
            const nameOk = specimenNameMatches(v, i, e.name);
            const clsOk = e.classification === sp.classification;
            return (
              <li key={sp.letter}>
                <span className="font-semibold">{sp.letter}</span>: {sp.def.name} — {sp.classification}{' '}
                <span className={nameOk && clsOk ? 'text-emerald-300' : 'text-amber-300'}>
                  ({nameOk ? 'name ✓' : 'name ✗'}, {clsOk ? 'group ✓' : 'group ✗'})
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
