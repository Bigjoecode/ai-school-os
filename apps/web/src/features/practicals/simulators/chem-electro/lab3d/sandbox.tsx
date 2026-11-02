import { CELL_E0, ELECTRO_TASKS, cellReading, chemElectroCustomVariant, dispFe, dispProduct, elecCharge, elecMasses, emptyChemElectroState, rustIndex, rustLook, woolReading, RUST_TUBES, type ChemElectroState, type ElecElectrode, type ElectroTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TASK_TITLE, useElectro } from '../actions';
import { NEEDED } from './scene-state';

/**
 * The unmarked sandbox: the student picks the experiment and its materials —
 * copper or carbon electrodes and the CuSO₄ concentration, the two half-cell
 * concentrations (the Nernst effect is modest), the CuSO₄ for the iron, how
 * salty tube D is — then works freely (plates touching, reversed leads, a dry
 * bridge, rusty filings, unboiled water…) with the same chemistry. Nothing is
 * graded, saved or sent.
 */
export interface SandboxSetup {
  task: ElectroTask;
  electrodes: ElecElectrode;
  elecConc: number;
  cZn: number;
  cCu: number;
  dispConc: number;
  salt: number;
}
const SANDBOX_SEED = 727_272;
const DEFAULTS = (task: ElectroTask): SandboxSetup => ({ task, electrodes: 'C', elecConc: 1, cZn: 1, cCu: 0.1, dispConc: 0.5, salt: 2.6 });
const setUpBench = (task: ElectroTask): ChemElectroState => ({
  ...emptyChemElectroState(),
  task,
  log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...(task === 'CELL' ? [{ t: 0, a: 'collect:mcVoltmeter' }] : [])],
});

export function useSandbox(startedAt: string, task: ElectroTask) {
  const [setup, setSetup] = useState<SandboxSetup>(DEFAULTS(task));
  const [state, setState] = useState<ChemElectroState>(() => setUpBench(setup.task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => chemElectroCustomVariant(SANDBOX_SEED + round, setup.task, { electrodes: setup.electrodes, elecConc: setup.elecConc, cZn: setup.cZn, cCu: setup.cCu, dispConc: setup.dispConc, salt: setup.salt }), [setup, round]);
  const x = useElectro({ seed: SANDBOX_SEED + round, state, onChange: setState, readOnly: false, startedAt, variant, autoTask: false });
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
const M = (x: number) => `${x.toFixed(2)} mol dm⁻³`;

export function SandboxSetupForm({ initial, onStart }: { initial: SandboxSetup; onStart: (s: SandboxSetup) => void }) {
  const [s, setS] = useState(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Choose your own materials and try things the marked lab would punish — carbon electrodes, touching plates, reversed leads, a dry salt bridge, rusty filings, unboiled water — and see what happens. Nothing here is marked or saved.</p>
      <label className="block">
        <span className="font-medium">Experiment</span>
        <select value={s.task} onChange={(e) => setS({ ...s, task: e.target.value as ElectroTask })} className={sel} aria-label="Experiment">
          {ELECTRO_TASKS.map((k) => (
            <option key={k} value={k}>
              {TASK_TITLE[k]}
            </option>
          ))}
        </select>
      </label>
      {s.task === 'ELEC' && (
        <>
          <label className="block">
            <span className="font-medium">Electrodes</span>
            <select value={s.electrodes} onChange={(e) => setS({ ...s, electrodes: e.target.value as ElecElectrode })} className={sel} aria-label="Electrodes">
              <option value="CU">Copper (the anode dissolves)</option>
              <option value="C">Carbon (inert: oxygen at the anode)</option>
            </select>
          </label>
          <Range label="CuSO₄ concentration" value={s.elecConc} min={0.25} max={1.5} step={0.05} fmt={M} onChange={(v) => setS({ ...s, elecConc: v })} />
        </>
      )}
      {s.task === 'CELL' && (
        <>
          <Range label="[Zn²⁺] in the zinc half-cell" value={s.cZn} min={0.01} max={1} step={0.01} fmt={M} onChange={(v) => setS({ ...s, cZn: v })} />
          <Range label="[Cu²⁺] in the copper half-cell" value={s.cCu} min={0.01} max={1} step={0.01} fmt={M} onChange={(v) => setS({ ...s, cCu: v })} />
        </>
      )}
      {s.task === 'DISP' && <Range label="CuSO₄ concentration" value={s.dispConc} min={0.1} max={1} step={0.05} fmt={M} onChange={(v) => setS({ ...s, dispConc: v })} />}
      {s.task === 'RUST' && <Range label="How salty is tube D (rusting speed vs tap water)" value={s.salt} min={1} max={4} step={0.1} fmt={(x) => `${x.toFixed(1)}×`} onChange={(v) => setS({ ...s, salt: v })} />}
      <Button variant="brand" onClick={() => onStart(s)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { x, state: s, variant: v } = sandbox;
  let line: string | null = null;
  if (v.task === 'ELEC' && s.elec.ran > 0) {
    const m = elecMasses(v, s.elec);
    const Q = elecCharge(v, s.elec);
    line = `${Math.round(Q)} C passed (${(Q / s.elec.ran).toFixed(3)} A mean). Faraday: ${((Q * 63.5) / 193000).toFixed(3)} g. Cathode ${(m.cath2 - m.cath1 >= 0 ? '+' : '')}${(m.cath2 - m.cath1).toFixed(2)} g, anode ${(m.an2 - m.an1 >= 0 ? '+' : '')}${(m.an2 - m.an1).toFixed(2)} g${v.elec.electrodes === 'C' ? `; Cu²⁺ now ${x.look.cuConc.toFixed(2)} mol dm⁻³ (the blue fades)` : ''}.`;
  } else if (v.task === 'CELL' && s.cell.readings.length) {
    const r = s.cell.readings.at(-1)!;
    line = `Last reading ${cellReading(v, r, s.cell.readings.length - 1).toFixed(2)} V. E°cell = ${CELL_E0.toFixed(2)} V; with [Zn²⁺] ${v.cell.cZn} and [Cu²⁺] ${v.cell.cCu} mol dm⁻³ the Nernst equation gives ${(CELL_E0 - ((8.314 * (273 + v.cell.room)) / 193000) * Math.log(v.cell.cZn / v.cell.cCu)).toFixed(3)} V.`;
  } else if (v.task === 'DISP' && s.disp.added) {
    const p = dispProduct(v, s.disp);
    line = `${dispFe(v, s.disp).toFixed(2)} g iron → ${p.cu.toFixed(3)} g copper${p.fe > 0.005 ? ` + ${p.fe.toFixed(3)} g unreacted iron` : ''}; ${Math.round(x.look.extent * 100)} % reacted; ${x.look.temp.toFixed(1)} °C.`;
  } else if (v.task === 'RUST' && s.rust.started) line = `${RUST_TUBES.map((t) => `${t}: ${rustLook(rustIndex(v, s.rust, t, x.look.day)).toLowerCase()}`).join(', ')}${s.rust.wool ? ` · tube ${woolReading(v, s.rust, x.look.day, true).toFixed(1)} cm³ (levelled)` : ''}.`;
  if (!line) return null;
  return (
    <section className="pointer-events-auto w-[min(320px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox results">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox results (unmarked)</p>
      <p className="mt-1">{line}</p>
    </section>
  );
}
