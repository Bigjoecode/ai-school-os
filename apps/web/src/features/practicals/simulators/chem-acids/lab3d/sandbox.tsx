import { ACIDS_TASKS, HARD_LABEL, PH_LETTER, PH_SAMPLES, acidBalance, acidChips, chemAcidsCustomVariant, emptyChemAcidsState, hardLather, hardOpenRun, indEndpoint, indOpenRun, phEffective, type AcidsTask, type ChemAcidsState } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TASK_TITLE, useAcids } from '../actions';
import { NEEDED } from './scene-state';

/**
 * The unmarked sandbox: the student picks the experiment and its materials —
 * the HCl and NaOH concentrations for the pH tubes, the titration acid's
 * concentration, the strength of the acid on the marble, how hard sample X is
 * — then works freely (unrinsed tubes, a dropperful of extract, too little
 * acid, swirling instead of shaking…) with the same chemistry. Nothing is
 * graded, saved or sent.
 */
export interface SandboxSetup {
  task: AcidsTask;
  cHcl: number;
  cNaoh: number;
  cAcid: number;
  acidConc: number;
  tempX: number;
  permX: number;
}
const SANDBOX_SEED = 515_151;
const DEFAULTS = (task: AcidsTask): SandboxSetup => ({ task, cHcl: 0.001, cNaoh: 0.01, cAcid: 0.05, acidConc: 1, tempX: 6, permX: 6 });
const setUpBench = (task: AcidsTask): ChemAcidsState => ({
  ...emptyChemAcidsState(),
  task,
  log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` }))],
});

export function useSandbox(startedAt: string, task: AcidsTask) {
  const [setup, setSetup] = useState<SandboxSetup>(DEFAULTS(task));
  const [state, setState] = useState<ChemAcidsState>(() => setUpBench(setup.task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => chemAcidsCustomVariant(SANDBOX_SEED + round, setup.task, { cHcl: setup.cHcl, cNaoh: setup.cNaoh, cAcid: setup.cAcid, acidConc: setup.acidConc, tempX: setup.tempX, permX: setup.permX }), [setup, round]);
  const x = useAcids({ seed: SANDBOX_SEED + round, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    setRound((r) => r + 1);
    x.ref.current = setUpBench(s.task);
    x.resetLive();
    setState(x.ref.current);
  };
  return { setup, start, state, x, variant };
}
export type Sandbox = ReturnType<typeof useSandbox>;

const sel = 'mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm';
function Range({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (x: number) => string; onChange: (x: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">{fmt(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-brand)]" aria-label={label} />
    </label>
  );
}
const M = (x: number) => `${x} mol dm⁻³`;

export function SandboxSetupForm({ initial, onStart }: { initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  const conc = (label: string, value: number, onChange: (x: number) => void) => (
    <label className="block">
      <span className="font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={sel} aria-label={label}>
        {[1, 0.1, 0.01, 0.001, 0.0001].map((c) => (
          <option key={c} value={c}>
            {M(c)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Choose your own materials and try things the marked lab would punish — unrinsed tubes, a full tube, a dropperful of extract, too little acid, no cotton wool, swirling instead of shaking — and see what happens. Nothing here is marked or saved.</p>
      <label className="block">
        <span className="font-medium">Experiment</span>
        <select value={s.task} onChange={(e) => setS({ ...s, task: e.target.value as AcidsTask })} className={sel} aria-label="Experiment">
          {ACIDS_TASKS.map((k) => (
            <option key={k} value={k}>
              {TASK_TITLE[k]}
            </option>
          ))}
        </select>
      </label>
      {s.task === 'PH' && (
        <>
          {conc('Sample A: HCl concentration', s.cHcl, (v) => setS({ ...s, cHcl: v }))}
          {conc('Sample I: NaOH concentration', s.cNaoh, (v) => setS({ ...s, cNaoh: v }))}
        </>
      )}
      {s.task === 'IND' && <Range label="HCl in the burette" value={s.cAcid} min={0.05} max={0.2} step={0.01} fmt={(x) => M(Number(x.toFixed(2)))} onChange={(v) => setS({ ...s, cAcid: v })} />}
      {s.task === 'ACID' && <Range label="HCl on the marble" value={s.acidConc} min={0.5} max={2} step={0.1} fmt={(x) => M(Number(x.toFixed(1)))} onChange={(v) => setS({ ...s, acidConc: v })} />}
      {s.task === 'HARD' && (
        <>
          <Range label="Sample X: temporary hardness (cm³ of soap)" value={s.tempX} min={0} max={14} step={0.5} fmt={(x) => x.toFixed(1)} onChange={(v) => setS({ ...s, tempX: v })} />
          <Range label="Sample X: permanent hardness (cm³ of soap)" value={s.permX} min={0} max={10} step={0.5} fmt={(x) => x.toFixed(1)} onChange={(v) => setS({ ...s, permX: v })} />
        </>
      )}
      <Button variant="brand" onClick={() => onStart(s)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { x, state: s, variant: v } = sandbox;
  let line: string | null = null;
  if (v.task === 'PH') {
    const done = PH_SAMPLES.filter((k) => s.ph.tubes[k].drops > 0);
    if (done.length) line = `True pH: ${done.map((k) => `${PH_LETTER[k]} ${phEffective(v, s.ph, k).toFixed(2)}`).join(', ')}.`;
  } else if (v.task === 'IND') {
    const r = indOpenRun(s.ind) ?? s.ind.runs.at(-1);
    if (r) line = `${r.ind === 'MO' ? 'Methyl orange' : 'Zobo'} (${r.drops} drops): end point at ${indEndpoint(v, r).toFixed(2)} cm³; exact neutralisation at ${((25 * v.ind.cBase) / v.ind.cAcid).toFixed(2)} cm³${x.look.flaskPh !== null ? `; flask now pH ${x.look.flaskPh.toFixed(1)}` : ''}.`;
  } else if (v.task === 'ACID' && s.acid.added) {
    const a = s.acid;
    line = `${acidChips(v, a).toFixed(2)} g marble → ${((acidChips(v, a) / 100) * 44).toFixed(3)} g CO₂ expected; ${Math.round(x.look.extent * 100)} % reacted; lost so far ${(acidBalance(v, a, 'flask') + acidBalance(v, a, 'chips') - x.look.balance.value).toFixed(2)} g.`;
  } else if (v.task === 'HARD') {
    const r = hardOpenRun(s.hard);
    if (r) line = `${HARD_LABEL[r.sample]}${r.boiled ? ' (boiled)' : ''}: ${r.added.toFixed(1)} cm³ — ${hardLather(v, s.hard, r).toLowerCase()} lather.`;
  }
  if (!line) return null;
  return (
    <section className="pointer-events-auto w-[min(320px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked)</p>
      <p className="mt-1">{line}</p>
    </section>
  );
}
