import { CHROM_DYES, CHROM_DYE_INFO, PPT_INFO, PPT_PAIRS, chemSaltsCustomVariant, emptyChemSaltsState, mpProduct, pptTotal, solProduct, type ChemSaltsState, type ChromDye, type PptPair, type SaltsTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TASK_TITLE, useSalts } from '../actions';
import { NEEDED } from './scene-state';

/**
 * The unmarked sandbox: the student picks the task and its materials — the
 * acid's concentration, the pair of solutions for the precipitate (CaCO₃
 * white, PbI₂ yellow, BaSO₄ white), the reference dyes, the purity of the
 * benzoic acid — then works freely (evaporate to dryness, an ink baseline,
 * heat fast…) with the same chemistry. Nothing is graded, saved or sent.
 */
export interface SandboxSetup {
  task: SaltsTask;
  acidConc: number;
  pair: PptPair;
  A: ChromDye;
  B: ChromDye;
  purity: number;
}
const SANDBOX_SEED = 616_161;
const DEFAULTS = (task: SaltsTask): SandboxSetup => ({ task, acidConc: 1.0, pair: 'PBI2', A: 'BLUE', B: 'RED', purity: 0.85 });
const setUpBench = (task: SaltsTask): ChemSaltsState => ({
  ...emptyChemSaltsState(),
  task,
  log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` }))],
});

export function useSandbox(startedAt: string, task: SaltsTask) {
  const [setup, setSetup] = useState<SandboxSetup>(DEFAULTS(task));
  const [state, setState] = useState<ChemSaltsState>(() => setUpBench(setup.task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => chemSaltsCustomVariant(SANDBOX_SEED + round, setup.task, { acidConc: setup.acidConc, pair: setup.pair, A: setup.A, B: setup.B, purity: setup.purity }), [setup, round]);
  const x = useSalts({ seed: SANDBOX_SEED + round, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
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
export function SandboxSetupForm({ initial, onStart }: { initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Choose your own materials and practise as often as you like — evaporate to dryness, draw the baseline in ink, heat the oil bath fast and see what happens. Nothing here is marked or saved.</p>
      <label className="block">
        <span className="font-medium">Practical</span>
        <select value={s.task} onChange={(e) => setS({ ...s, task: e.target.value as SaltsTask })} className={sel} aria-label="Practical">
          {(['SOL', 'PPT', 'CHROM', 'MP'] as const).map((k) => (
            <option key={k} value={k}>
              {TASK_TITLE[k]}
            </option>
          ))}
        </select>
      </label>
      {s.task === 'SOL' && (
        <label className="block">
          <span className="flex justify-between">
            <span className="font-medium">Concentration of the H₂SO₄</span>
            <span className="tabular text-muted-foreground">{s.acidConc.toFixed(2)} mol dm⁻³</span>
          </span>
          <input type="range" min={0.5} max={2} step={0.05} value={s.acidConc} onChange={(e) => setS({ ...s, acidConc: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" aria-label="Acid concentration" />
        </label>
      )}
      {s.task === 'PPT' && (
        <label className="block">
          <span className="font-medium">Solutions to mix</span>
          <select value={s.pair} onChange={(e) => setS({ ...s, pair: e.target.value as PptPair })} className={sel} aria-label="Solutions">
            {PPT_PAIRS.map((p) => (
              <option key={p} value={p}>
                {PPT_INFO[p].equation} ({PPT_INFO[p].product.colourName}){PPT_INFO[p].toxic ? ' — toxic, wash hands' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {s.task === 'CHROM' && (
        <div className="grid grid-cols-2 gap-2">
          {(['A', 'B'] as const).map((k) => (
            <label key={k} className="block">
              <span className="font-medium">Pure dye {k}</span>
              <select value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value as ChromDye })} className={sel} aria-label={`Dye ${k}`}>
                {CHROM_DYES.map((d) => (
                  <option key={d} value={d}>
                    {CHROM_DYE_INFO[d].name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      {s.task === 'MP' && (
        <label className="block">
          <span className="flex justify-between">
            <span className="font-medium">Purity of the impure benzoic acid</span>
            <span className="tabular text-muted-foreground">{Math.round(s.purity * 100)} %</span>
          </span>
          <input type="range" min={0.6} max={0.98} step={0.01} value={s.purity} onChange={(e) => setS({ ...s, purity: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" aria-label="Purity" />
        </label>
      )}
      <Button variant="brand" disabled={s.task === 'CHROM' && s.A === s.B} onClick={() => onStart(s)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { x, state: s, variant: v } = sandbox;
  let line: string | null = null;
  if (v.task === 'SOL' && (s.sol.filteredAt !== null || s.sol.dry)) {
    const p = solProduct(v, s.sol);
    line = `${p.look === 'WHITE' ? 'White anhydrous powder' : p.look === 'NONE' ? 'No crystals' : 'Blue crystals'}: ${p.mass.toFixed(2)} g (${Math.round((p.mass / ((v.sol.acidConc * (s.sol.acid ?? 50)) / 1000 / 1) / 249.5) * 100)} % of the maximum).`;
  } else if (v.task === 'PPT' && s.ppt.weighings.length) {
    const i = PPT_INFO[v.ppt.pair];
    const m = pptTotal(v, s.ppt, s.ppt.weighings.at(-1)!) - v.ppt.paper;
    line = `${i.product.colourName} ${i.product.formula}: ${m.toFixed(2)} g of a maximum ${((v.ppt.catConc * (s.ppt.cat ?? 25)) / 1000 * i.product.M).toFixed(2)} g.`;
  } else if (v.task === 'CHROM' && s.chrom.developed !== null) line = `Ink dyes: ${v.chrom.ink.map((d) => CHROM_DYE_INFO[d].name).join(', ')}. A ${v.chrom.ink.includes(v.chrom.A) ? 'is' : 'is not'} in the ink; B ${v.chrom.ink.includes(v.chrom.B) ? 'is' : 'is not'}.`;
  else if (v.task === 'MP' && s.mp.runs.some((r) => r.done)) line = `${s.mp.runs.filter((r) => r.done).map((r) => `${r.sample === 'PURE' ? 'Recrystallised' : 'Impure'} ${r.start?.toFixed(1)}–${r.end?.toFixed(1)} °C${(r.rateStart ?? 0) > 3 ? ' (heated fast: reads high)' : ''}`).join('; ')}${s.mp.collected ? ` · recovered ${mpProduct(v, s.mp).mass.toFixed(2)} g` : ''}.`;
  void x;
  if (!line) return null;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked)</p>
      <p className="mt-1">{line}</p>
    </section>
  );
}
