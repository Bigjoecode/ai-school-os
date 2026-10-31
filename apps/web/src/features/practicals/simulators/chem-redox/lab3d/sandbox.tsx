import { chemRedoxCustomVariant, emptyChemRedoxState, redoxEndpoint, redoxTitreFor, type ChemRedoxState, type RedoxTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TASK_TITLE, useRedox } from '../actions';
import { apparatusFor } from './scene-state';

/**
 * The unmarked sandbox: the student picks the task and both concentrations,
 * then titrates freely on the bench (try HCl instead of H₂SO₄, a cold flask,
 * starch at the start…). The simulation uses the shared variant maths with
 * those values. Nothing is graded, saved or sent.
 */

export interface SandboxSetup {
  task: RedoxTask;
  a: number;
  b: number;
}
const SANDBOX_SEED = 525_252;
/** Concentration ranges (mol dm⁻³) for A and B, per task. */
export const SANDBOX_RANGE: Record<RedoxTask, { a: [number, number, number]; b: [number, number, number] }> = {
  FE: { a: [0.01, 0.04, 0.001], b: [0.05, 0.15, 0.005] },
  OX: { a: [0.01, 0.04, 0.001], b: [0.03, 0.08, 0.005] },
  IOD: { a: [0.05, 0.15, 0.005], b: [0.02, 0.08, 0.005] },
};
const DEFAULTS: Record<RedoxTask, SandboxSetup> = { FE: { task: 'FE', a: 0.02, b: 0.1 }, OX: { task: 'OX', a: 0.02, b: 0.05 }, IOD: { task: 'IOD', a: 0.1, b: 0.04 } };
const titreOk = (t: number) => t >= 5 && t <= 45;

const setUpBench = (task: RedoxTask): ChemRedoxState => ({
  ...emptyChemRedoxState(),
  task,
  log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...apparatusFor(task).filter((a) => a.needed).map((a) => ({ t: 0, a: `collect:${a.id}` })), { t: 0, a: 'clamp-burette' }, { t: 0, a: 'filler-on' }],
});

export function useSandbox(startedAt: string, task: RedoxTask) {
  const [setup, setSetup] = useState<SandboxSetup>(DEFAULTS[task]);
  const [state, setState] = useState<ChemRedoxState>(() => setUpBench(setup.task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => chemRedoxCustomVariant(SANDBOX_SEED + round, setup.task, setup.a, setup.b), [setup, round]);
  const t = useRedox({ seed: SANDBOX_SEED + round, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    setRound((r) => r + 1);
    t.ref.current = setUpBench(s.task);
    setState(t.ref.current);
  };
  const results = state.runs
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.done && r.initial !== null && r.final !== null)
    .map(({ r, i }) => ({ kind: r.kind, delivered: r.final! - r.initial!, end: redoxEndpoint(variant, i, r) }));
  return { setup, start, state, t, variant, results };
}
export type Sandbox = ReturnType<typeof useSandbox>;

export function SandboxSetupForm({ initial, onStart }: { initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  const range = SANDBOX_RANGE[s.task];
  const titre = redoxTitreFor(s.task, s.a, s.b);
  const ok = titreOk(titre);
  const names = s.task === 'IOD' ? ['Na₂S₂O₃ (A)', 'Iodine (B)'] : s.task === 'OX' ? ['KMnO₄ (A)', 'Ethanedioic acid (B)'] : ['KMnO₄ (A)', 'Iron(II) (B)'];
  const slider = (key: 'a' | 'b', label: string) => (
    <label className="block text-[13px]">
      <span className="flex justify-between">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">{s[key].toFixed(3)} mol dm⁻³</span>
      </span>
      <input type="range" min={range[key][0]} max={range[key][1]} step={range[key][2]} value={s[key]} onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" aria-label={label} />
    </label>
  );
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Choose your own solutions and practise as often as you like — try the wrong acid, a cold flask or early starch and see what happens. Nothing here is marked or saved.</p>
      <label className="block">
        <span className="font-medium">Titration</span>
        <select value={s.task} onChange={(e) => setS(DEFAULTS[e.target.value as RedoxTask])} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label="Titration">
          {(['FE', 'OX', 'IOD'] as const).map((k) => (
            <option key={k} value={k}>
              {TASK_TITLE[k]}
            </option>
          ))}
        </select>
      </label>
      {slider('a', `Concentration of ${names[0]}`)}
      {slider('b', `Concentration of ${names[1]}`)}
      <p className={cn('rounded-lg px-3 py-2 text-[12.5px]', ok ? 'bg-muted text-muted-foreground' : 'bg-warning-soft text-warning')}>
        {ok ? `Expected titre about ${titre.toFixed(1)} cm³ — titrate and see where the end point comes.` : 'With these concentrations the titre would not fit a 50 cm³ burette nicely (aim for 5–45 cm³): change one of them.'}
      </p>
      <Button variant="brand" disabled={!ok} onClick={() => onStart(s)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  if (!sandbox.results.length) return null;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked)</p>
      <ul className="mt-1 space-y-0.5">
        {sandbox.results.map((r, k) => {
          const off = r.delivered - r.end;
          return (
            <li key={k}>
              {r.kind === 'ROUGH' ? 'Rough' : 'Accurate'}: {r.delivered.toFixed(2)} cm³ · end point {r.end.toFixed(2)} cm³{' '}
              <span className={Math.abs(off) <= 0.1 ? 'text-emerald-300' : 'text-amber-300'}>
                ({off >= 0 ? '+' : ''}
                {off.toFixed(2)})
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
