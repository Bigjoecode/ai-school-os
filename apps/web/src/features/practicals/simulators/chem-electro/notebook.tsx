import { RUST_TUBES, type ChemElectroState, type ChemElectroVariant, type ElectroAnswerId, type ElectroRecKey, type ElectroTask } from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ElectroUpdate } from './actions';

/** The written questions each task asks. */
export const QUESTIONS: Record<ElectroTask, { observation: string; explain: string }> = {
  ELEC: { observation: 'What did you observe at the cathode, at the anode and in the solution?', explain: 'Write the electrode equations. Why does the blue colour not fade with copper electrodes?' },
  CELL: { observation: 'What did the voltmeter read with the salt bridge in place, and with it removed?', explain: 'Which electrode is negative, and why? What does the salt bridge do?' },
  DISP: { observation: 'What happened to the solid, the colour of the solution and the temperature?', explain: 'Why does iron displace copper, and why does the colour change?' },
  RUST: { observation: 'What did you see in tubes A, B, C and D after a week, and in the graduated tube?', explain: 'Why did the nails in B and C not rust, and why did D rust most?' },
};

type Row = { key: ElectroRecKey; label: string; unit: string; placeholder: string };
const ROWS: Record<ElectroTask, Row[]> = {
  ELEC: [
    { key: 'cath1', label: 'Mass of cathode before', unit: 'g', placeholder: '0.00' },
    { key: 'cath2', label: 'Mass of cathode after', unit: 'g', placeholder: '0.00' },
    { key: 'an1', label: 'Mass of anode before', unit: 'g', placeholder: '0.00' },
    { key: 'an2', label: 'Mass of anode after', unit: 'g', placeholder: '0.00' },
    { key: 'current', label: 'Current (kept constant)', unit: 'A', placeholder: '0.00' },
    { key: 'time', label: 'Time the current flowed', unit: 's', placeholder: '0' },
  ],
  CELL: [
    { key: 'emf', label: 'Voltmeter reading with the salt bridge (e.m.f.)', unit: 'V', placeholder: '0.00' },
    { key: 'emfNo', label: 'Voltmeter reading with the salt bridge removed', unit: 'V', placeholder: '0.00' },
  ],
  DISP: [
    { key: 'fe', label: 'Mass of iron filings', unit: 'g', placeholder: '0.00' },
    { key: 't1', label: 'Initial temperature of the solution', unit: '°C', placeholder: '0.0' },
    { key: 't2', label: 'Highest temperature reached', unit: '°C', placeholder: '0.0' },
    { key: 'paper', label: 'Mass of dry filter paper', unit: 'g', placeholder: '0.00' },
    { key: 'paperCu', label: 'Mass of paper + dry copper', unit: 'g', placeholder: '0.00' },
    { key: 'cu', label: 'Mass of copper obtained', unit: 'g', placeholder: '0.00' },
  ],
  RUST: [
    { key: 'v0', label: 'Initial volume of air in the graduated tube', unit: 'cm³', placeholder: '0.0' },
    { key: 'vFinal', label: 'Final volume of air (level stopped rising)', unit: 'cm³', placeholder: '0.0' },
  ],
};
const UNIT_HINT: Record<string, string> = { C: 'unit', mol: 'unit', g: 'unit', V: 'unit', '%': 'unit', degC: 'unit', cm3: 'unit' };
const NUMERAL = ['i', 'ii', 'iii', 'iv', 'v'];

/** The record, calculations and written answers: the same in the 2D lab and on the 3D bench. */
export function Notebook({ v, state, readOnly, update, className }: { v: ChemElectroVariant; state: ChemElectroState; readOnly: boolean; update: ElectroUpdate; className?: string }) {
  const task = v.task;
  const setRec = (k: ElectroRecKey, value: string) => update((s) => ({ ...s, rec: { ...s.rec, [k]: value.slice(0, 40) } }));
  const setAnswer = (id: ElectroAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value.slice(0, 40) } } }));
  const setWritten = (key: 'observation' | 'explain' | 'precautions', value: string) => update((s) => ({ ...s, written: { ...s.written, [key]: value.slice(0, 2000) } }));
  const cell = (k: ElectroRecKey, ph: string, label: string, w = 'w-[92px]') => <Input value={state.rec[k]} onChange={(e) => setRec(k, e.target.value)} disabled={readOnly} inputMode="decimal" placeholder={ph} className={cn('h-9 px-2 tabular', w)} aria-label={label} />;
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <h3 className="mb-2 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      <table className="w-full text-[13px]">
        <tbody>
          {ROWS[task].map((r) => (
            <tr key={r.key} className="border-t border-border first:border-0">
              <td className="py-1.5 pr-2">{r.label}</td>
              <td className="py-1.5">{cell(r.key, r.placeholder, r.label)}</td>
              <td className="w-10 py-1.5 pl-1 text-muted-foreground">{r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {task === 'CELL' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span>The negative electrode (anode) is:</span>
          <Choice value={state.rec.negative} options={['zinc', 'copper']} onChange={(x) => setRec('negative', x)} disabled={readOnly} label="Negative electrode" />
        </div>
      )}
      {task === 'RUST' && (
        <div className="mt-3 space-y-2 text-[12.5px]">
          <p className="font-semibold">After the week: did the nail rust?</p>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
            {RUST_TUBES.map((t) => (
              <div key={t} className="contents">
                <span>
                  Tube {t} <span className="text-muted-foreground">({t === 'A' ? 'tap water' : t === 'B' ? 'boiled water + oil' : t === 'C' ? 'CaCl₂, stoppered' : 'salt water'})</span>
                </span>
                <Choice value={state.rec[`rust${t}` as ElectroRecKey]} options={['yes', 'no']} onChange={(x) => setRec(`rust${t}` as ElectroRecKey, x)} disabled={readOnly} label={`Tube ${t} rusted`} />
              </div>
            ))}
            <span>Rusted most:</span>
            <Choice value={state.rec.most} options={['A', 'B', 'C', 'D']} onChange={(x) => setRec('most', x)} disabled={readOnly} label="Tube that rusted most" />
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        {v.tasks.map((t, n) => (
          <div key={t.id}>
            <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor={`electro-${t.id}`}>
              ({NUMERAL[n]}) {t.label}
            </label>
            <div className="flex gap-2">
              <Input id={`electro-${t.id}`} value={state.answers[t.id].value} onChange={(e) => setAnswer(t.id, 'value', e.target.value)} disabled={readOnly} inputMode="decimal" placeholder="value" className="tabular" />
              <Input value={state.answers[t.id].unit} onChange={(e) => setAnswer(t.id, 'unit', e.target.value)} disabled={readOnly} placeholder={UNIT_HINT[t.unit]} className="w-32 shrink-0" aria-label={`Unit for ${t.label}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {(['observation', 'explain'] as const).map((k) => (
          <div key={k}>
            <label className="mb-1 block text-[12.5px] font-semibold" htmlFor={`electro-${k}`}>
              {QUESTIONS[task][k]}
            </label>
            <Textarea id={`electro-${k}`} value={state.written[k]} onChange={(e) => setWritten(k, e.target.value)} disabled={readOnly} rows={2} />
          </div>
        ))}
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="electro-precautions">
            Two precautions you took
          </label>
          <Textarea id="electro-precautions" value={state.written.precautions} onChange={(e) => setWritten('precautions', e.target.value)} disabled={readOnly} rows={3} />
        </div>
      </div>
    </Card>
  );
}

function Choice({ value, options, onChange, disabled, label }: { value: string; options: string[]; onChange: (x: string) => void; disabled: boolean; label: string }) {
  return (
    <span className="inline-flex w-fit overflow-hidden rounded-lg border border-border" role="group" aria-label={label}>
      {options.map((x) => (
        <button key={x} type="button" disabled={disabled} onClick={() => onChange(x)} aria-pressed={value === x} className={cn('px-2.5 py-1 text-[12.5px] capitalize', value === x ? 'bg-brand text-brand-foreground' : 'bg-card hover:bg-muted')}>
          {x}
        </button>
      ))}
    </span>
  );
}

/** The paper's instructions for this attempt (the 2D task card and the 3D bench's task card). */
export function TaskBrief({ v, className }: { v: ChemElectroVariant; className?: string }) {
  return (
    <div className={cn('space-y-2 text-[13.5px] leading-relaxed', className)}>
      {v.given.map((g) => (
        <p key={g}>{g}</p>
      ))}
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        {v.tasks.map((t) => (
          <li key={t.id}>{t.label}</li>
        ))}
      </ol>
    </div>
  );
}
