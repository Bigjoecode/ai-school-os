import { TITRATION_INDICATOR_INFO, TITRATION_PAIRS, TITRATION_PAIR_LABELS, chemTitrationCustomVariant, emptyChemTitrationState, titrationEndpoint, type ChemTitrationState } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTitration } from '../actions';
import { APPARATUS } from './scene-state';

/**
 * The unmarked sandbox: the student picks the acid–base pair and both
 * concentrations, then titrates freely on the bench. The simulation uses the
 * shared variant maths with those values (titrationEndpoint on a custom
 * variant). Nothing is graded, saved or sent: it lives in this page only.
 */

export interface SandboxSetup {
  pair: number;
  acid: number;
  base: number;
}
const SANDBOX_SEED = 424_242;
export const SANDBOX_MIN = 0.05;
export const SANDBOX_MAX = 0.15;
/** A titre the 50 cm³ burette can deliver comfortably. */
const titreOk = (t: number) => t >= 5 && t <= 45;

/** The bench already set up (apparatus collected, burette clamped, filler on, coat and goggles): the sandbox is for titrating. */
const setUpBench = (): ChemTitrationState => ({
  ...emptyChemTitrationState(),
  log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...APPARATUS.filter((a) => a.needed).map((a) => ({ t: 0, a: `collect:${a.id}` })), { t: 0, a: 'clamp-burette' }, { t: 0, a: 'filler-on' }],
});

export function useSandbox(startedAt: string) {
  const [setup, setSetup] = useState<SandboxSetup>({ pair: 0, acid: 0.1, base: 0.08 });
  const [state, setState] = useState<ChemTitrationState>(setUpBench);
  const [round, setRound] = useState(0);
  const variant = useMemo(() => chemTitrationCustomVariant(SANDBOX_SEED + round, setup.pair, setup.acid, setup.base), [setup, round]);
  const t = useTitration({ seed: SANDBOX_SEED + round, state, onChange: setState, readOnly: false, startedAt, variant });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    setRound((r) => r + 1);
    t.ref.current = setUpBench();
    setState(t.ref.current);
  };
  /** How each finished run compares with the true end point for these values (shown: the sandbox is unmarked). */
  const results = state.runs
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.done && r.initial !== null && r.final !== null && r.indicator)
    .map(({ r, i }) => ({ kind: r.kind, delivered: r.final! - r.initial!, end: titrationEndpoint(variant, i, r.indicator), indicator: r.indicator! }));
  return { setup, start, state, t, variant, results };
}
export type Sandbox = ReturnType<typeof useSandbox>;

export function SandboxSetupForm({ initial, onStart }: { initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  const p = TITRATION_PAIRS[s.pair]!;
  const titre = (s.base * 25 * p.a) / (p.b * s.acid);
  const ok = titreOk(titre);
  const slider = (key: 'acid' | 'base', label: string) => (
    <label className="block text-[13px]">
      <span className="flex justify-between">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">{s[key].toFixed(3)} mol dm⁻³</span>
      </span>
      <input type="range" min={SANDBOX_MIN} max={SANDBOX_MAX} step={0.005} value={s[key]} onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" aria-label={label} />
    </label>
  );
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Choose your own solutions and practise as often as you like. Nothing here is marked or saved.</p>
      <label className="block">
        <span className="font-medium">Acid (A) and base (B)</span>
        <select value={s.pair} onChange={(e) => setS({ ...s, pair: Number(e.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label="Acid and base">
          {TITRATION_PAIR_LABELS.map((l, i) => (
            <option key={l} value={i}>
              {l}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[12px] text-muted-foreground">
          {p.equation} · suitable indicator: {p.indicators.map((i) => TITRATION_INDICATOR_INFO[i].label.toLowerCase()).join(' or ')}
        </span>
      </label>
      {slider('acid', 'Concentration of A')}
      {slider('base', 'Concentration of B')}
      <p className={cn('rounded-lg px-3 py-2 text-[12.5px]', ok ? 'bg-muted text-muted-foreground' : 'bg-warning-soft text-warning')}>
        {ok ? 'Pick an indicator on the bench as usual — then titrate and see where the end point comes.' : 'With these concentrations the titre would not fit a 50 cm³ burette nicely (aim for 5–45 cm³): change one of them.'}
      </p>
      <Button variant="brand" disabled={!ok} onClick={() => onStart(s)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

/** Finished sandbox runs against the true end point for the chosen values. */
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
              {r.kind === 'ROUGH' ? 'Rough' : 'Accurate'}: {r.delivered.toFixed(2)} cm³ · end point {r.end.toFixed(2)} cm³ <span className={Math.abs(off) <= 0.1 ? 'text-emerald-300' : 'text-amber-300'}>({off >= 0 ? '+' : ''}{off.toFixed(2)})</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
