import {
  NEUT_PAIRS,
  SALTS,
  SOLY_TABLES,
  chemEnergeticsCustomVariant,
  emptyChemEnergeticsState,
  enExtreme,
  solyTrueSat,
  type ChemEnergeticsState,
  type ChemEnergeticsVariant,
  type EnergeticsTask,
  type NeutPair,
  type SaltId,
  type SolySalt,
} from '@aischool/shared';
import { Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { curveRun, useEnergetics } from '../actions';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * The unmarked sandbox: change what the real practical keeps fixed — the room
 * temperature, a weak acid or a weak base, the concentration, another salt,
 * another solubility curve — and experiment on the same thermochemistry. Each
 * finished run shows its true values. Nothing is saved.
 */

export interface SandboxSetup {
  task: EnergeticsTask;
  room: number;
  pair: NeutPair;
  conc: number;
  salt: SaltId;
  solySalt: SolySalt;
}
const SANDBOX_SEED = 424_242;
const setUpBench = (task: EnergeticsTask): ChemEnergeticsState => ({
  ...emptyChemEnergeticsState(),
  task,
  setup: task === 'SOLY' ? { vessel: null, support: false } : { vessel: 'CUP', support: true },
  log: [{ t: 0, a: `task:${task}` }, { t: 0, a: 'safety:goggles' }, ...[...NEEDED[task], 'glassBeaker', ...(task === 'SOLY' ? ['burner'] : [])].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
});

export function useSandbox(startedAt: string, task: EnergeticsTask) {
  const [setup, setSetup] = useState<SandboxSetup>({ task, room: 25, pair: 'HCL+NAOH', conc: 1, salt: 'NH4NO3', solySalt: 'KNO3' });
  const [state, setState] = useState<ChemEnergeticsState>(() => setUpBench(task));
  const variant = useMemo<ChemEnergeticsVariant>(() => chemEnergeticsCustomVariant(SANDBOX_SEED, setup.task, { room: setup.room, pair: setup.pair, conc: setup.conc, salt: setup.salt, solySalt: setup.solySalt }), [setup]);
  const o = useEnergetics({ seed: SANDBOX_SEED, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
  const start = (s: SandboxSetup) => {
    setSetup(s);
    o.ref.current = setUpBench(s.task);
    o.resetLive();
    setState(o.ref.current);
  };
  return { setup, start, state, o, variant };
}
export type Sandbox = ReturnType<typeof useSandbox>;

function Range({ label, value, min, max, step, unit, onChange, dp = 0 }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (x: number) => void; dp?: number }) {
  return (
    <label className="block text-[13px]">
      <span className="flex justify-between">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">
          {value.toFixed(dp)} {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-brand)]" aria-label={label} />
    </label>
  );
}
const selCls = 'h-9 w-full rounded-md border border-input bg-card px-2 text-[13px]';

export function SandboxSetupForm({ initial, onStart }: { initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Change what the real practical keeps fixed: try a weak acid or a weak base, another concentration, another salt, another solubility curve, a hotter room. Nothing here is marked or saved.</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Experiment">
        {(['NEUT', 'SOLN', 'SOLY'] as const).map((t) => (
          <Button key={t} size="sm" variant={s.task === t ? 'brand' : 'outline'} onClick={() => setS({ ...s, task: t })} aria-pressed={s.task === t}>
            {t === 'NEUT' ? 'Neutralisation' : t === 'SOLN' ? 'Heat of solution' : 'Solubility'}
          </Button>
        ))}
      </div>
      <Range label="Room temperature" value={s.room} min={15} max={35} step={1} unit="°C" onChange={(x) => setS({ ...s, room: x })} />
      {s.task === 'NEUT' && (
        <>
          <label className="block text-[13px] font-medium">
            Acid and base
            <select className={selCls} value={s.pair} onChange={(e) => setS({ ...s, pair: e.target.value as NeutPair })}>
              {(Object.keys(NEUT_PAIRS) as NeutPair[]).map((k) => (
                <option key={k} value={k}>
                  {NEUT_PAIRS[k].acid} + {NEUT_PAIRS[k].base}
                </option>
              ))}
            </select>
          </label>
          <Range label="Concentration of both" value={s.conc} min={0.5} max={2} step={0.25} unit="mol dm⁻³" dp={2} onChange={(x) => setS({ ...s, conc: x })} />
        </>
      )}
      {s.task === 'SOLN' && (
        <label className="block text-[13px] font-medium">
          Salt dissolved first
          <select className={selCls} value={s.salt} onChange={(e) => setS({ ...s, salt: e.target.value as SaltId })}>
            {(Object.keys(SALTS) as SaltId[]).map((k) => (
              <option key={k} value={k}>
                {SALTS[k].name} ({SALTS[k].formula})
              </option>
            ))}
          </select>
        </label>
      )}
      {s.task === 'SOLY' && (
        <label className="block text-[13px] font-medium">
          Salt in the tube
          <select className={selCls} value={s.solySalt} onChange={(e) => setS({ ...s, solySalt: e.target.value as SolySalt })}>
            {(Object.keys(SOLY_TABLES) as SolySalt[]).map((k) => (
              <option key={k} value={k}>
                {k === 'KNO3' ? 'Potassium trioxonitrate(V), KNO₃' : k === 'NH4CL' ? 'Ammonium chloride, NH₄Cl' : 'Sodium chloride, NaCl'}
              </option>
            ))}
          </select>
        </label>
      )}
      <Button variant="brand" onClick={() => onStart(s)}>
        <Shapes /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { state: s, variant: v } = sandbox;
  const runs = s.runs.map((r, i) => ({ r, i })).filter((x) => x.r.done);
  const tubes = s.soly.runs.filter((r) => r.done);
  if (!runs.length && !tubes.length) return null;
  return (
    <section className="pointer-events-auto w-[min(340px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked) · room {v.room} °C</p>
      <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
        {runs.map(({ r, i }) => {
          const ex = enExtreme(v, curveRun(r, i), r.elapsed ?? 900);
          const dT = ex.value - ex.T0;
          const label = r.kind === 'NEUT' ? `${NEUT_PAIRS[v.pair].acid.split(' (')[0]} + ${NEUT_PAIRS[v.pair].base.split(' (')[0]}` : r.kind === 'NAOH' ? 'NaOH' : SALTS[v.salt].formula;
          const trueDH = r.kind === 'NEUT' ? v.dHneut : r.kind === 'NAOH' ? v.dHnaoh : v.dHsalt;
          return (
            <li key={i}>
              {label} in a {r.vessel === 'CUP' ? 'polystyrene cup' : 'glass beaker'}: ΔT {dT >= 0 ? '+' : ''}
              {dT.toFixed(1)} K seen; true ΔH {(trueDH / 1000).toFixed(1)} kJ mol⁻¹{r.kind === 'NEUT' ? ' of water' : ''}
            </li>
          );
        })}
        {tubes.map((r, k) => {
          const sat = solyTrueSat(v, r.water, r.lost, s.soly.mass ?? 4);
          return (
            <li key={`t${k}`}>
              {(s.soly.mass ?? 4).toFixed(1)} g in {r.water.toFixed(1)} cm³: you read {r.seen?.toFixed(1)} °C; saturated at {sat === null ? 'never (0–80 °C)' : `${sat.toFixed(1)} °C`}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
