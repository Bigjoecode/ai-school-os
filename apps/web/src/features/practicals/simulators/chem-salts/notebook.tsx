import { CHROM_DYE_INFO, type ChemSaltsState, type ChemSaltsVariant, type SaltsAnswerId, type SaltsRecKey, type SaltsTask } from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { SaltsUpdate } from './actions';

/** The written questions each task asks. */
export const QUESTIONS: Record<SaltsTask, { observation: string; explain: string }> = {
  SOL: { observation: 'What did you observe when the CuO was added to the warm acid, and when the solution cooled?', explain: 'Why was excess CuO used, and why must the solution not be evaporated to dryness?' },
  PPT: { observation: 'What did you observe when the two solutions were mixed?', explain: 'Why is the precipitate washed with distilled water before drying?' },
  CHROM: { observation: 'Describe the chromatogram: compare the ink with the pure dyes A and B.', explain: 'Why is the baseline drawn in pencil and not in ink?' },
  MP: { observation: 'Describe the crystals, and compare how the impure and recrystallised samples melted.', explain: 'Why use the minimum of hot water, and why does the impure sample melt lower and over a range?' },
};

type Row = { key: SaltsRecKey; label: string; unit: string; placeholder: string };
const ROWS: Record<SaltsTask, Row[]> = {
  SOL: [
    { key: 'acidVol', label: 'Volume of H₂SO₄ used', unit: 'cm³', placeholder: '0.0' },
    { key: 'mass', label: 'Mass of dry crystals', unit: 'g', placeholder: '0.00' },
  ],
  PPT: [
    { key: 'catVol', label: 'Volume of the first solution', unit: 'cm³', placeholder: '0.0' },
    { key: 'anVol', label: 'Volume of the second solution', unit: 'cm³', placeholder: '0.0' },
    { key: 'paper', label: 'Mass of dry filter paper', unit: 'g', placeholder: '0.00' },
    { key: 'total1', label: 'Mass of paper + dry precipitate (1st weighing)', unit: 'g', placeholder: '0.00' },
    { key: 'total2', label: 'Mass of paper + dry precipitate (after drying again)', unit: 'g', placeholder: '0.00' },
    { key: 'ppt', label: 'Mass of precipitate', unit: 'g', placeholder: '0.00' },
  ],
  CHROM: [
    { key: 'solvent', label: 'Distance moved by the solvent (from the baseline)', unit: 'cm', placeholder: '0.0' },
    { key: 'spotA', label: 'Distance moved by dye A', unit: 'cm', placeholder: '0.0' },
    { key: 'spotB', label: 'Distance moved by dye B', unit: 'cm', placeholder: '0.0' },
  ],
  MP: [
    { key: 'impure', label: 'Mass of impure benzoic acid', unit: 'g', placeholder: '0.00' },
    { key: 'pure', label: 'Mass of dry recrystallised benzoic acid', unit: 'g', placeholder: '0.00' },
    { key: 'iStart', label: 'Impure sample: starts to melt', unit: '°C', placeholder: '0.0' },
    { key: 'iEnd', label: 'Impure sample: completely melted', unit: '°C', placeholder: '0.0' },
    { key: 'pStart', label: 'Recrystallised sample: starts to melt', unit: '°C', placeholder: '0.0' },
    { key: 'pEnd', label: 'Recrystallised sample: completely melted', unit: '°C', placeholder: '0.0' },
  ],
};
const UNIT_HINT: Record<string, string> = { mol: 'unit', 'g/mol': 'unit', g: 'unit', '%': 'unit', '': 'unit?', C: 'unit' };

/** The record, calculations and written answers: the same in the 2D lab and on the 3D bench. */
export function Notebook({ v, state, readOnly, update, className }: { v: ChemSaltsVariant; state: ChemSaltsState; readOnly: boolean; update: SaltsUpdate; className?: string }) {
  const task = v.task;
  const setRec = (k: SaltsRecKey, value: string) => update((s) => ({ ...s, rec: { ...s.rec, [k]: value.slice(0, 40) } }));
  const setAnswer = (id: SaltsAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value.slice(0, 40) } } }));
  const setWritten = (key: 'observation' | 'explain' | 'precautions', value: string) => update((s) => ({ ...s, written: { ...s.written, [key]: value.slice(0, 2000) } }));
  const cell = (k: SaltsRecKey, ph: string, label: string, w = 'w-[92px]') => <Input value={state.rec[k]} onChange={(e) => setRec(k, e.target.value)} disabled={readOnly} inputMode="decimal" placeholder={ph} className={cn('h-9 px-2 tabular', w)} aria-label={label} />;
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
      {task === 'CHROM' && (
        <div className="mt-3 space-y-2">
          <p className="text-[12.5px] font-semibold">Spots from the ink (lowest first)</p>
          <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-1 text-[12.5px]">
            <span />
            <span className="text-muted-foreground">Distance / cm</span>
            <span className="text-muted-foreground">Rf</span>
            {([1, 2, 3, 4] as const).map((n) => (
              <div key={n} className="contents">
                <span>Spot {n}</span>
                {cell(`ink${n}`, '0.0', `Ink spot ${n} distance`, 'w-full')}
                {cell(`rf${n}`, '0.00', `Ink spot ${n} Rf`, 'w-full')}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span>Does the ink contain A?</span>
            <YesNo value={state.rec.hasA} onChange={(x) => setRec('hasA', x)} disabled={readOnly} label="Ink contains A" />
            <span>B?</span>
            <YesNo value={state.rec.hasB} onChange={(x) => setRec('hasB', x)} disabled={readOnly} label="Ink contains B" />
            <span>Number of components in the ink:</span>
            {cell('nComp', '0', 'Number of components', 'w-14')}
          </div>
          <p className="text-[11.5px] text-muted-foreground">Dye colours: {Object.values(CHROM_DYE_INFO).map((d) => d.name).join(', ')}. A dye is in the ink if an ink spot has its colour and Rf.</p>
        </div>
      )}

      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        {v.tasks.map((t, n) => (
          <div key={t.id}>
            <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor={`salts-${t.id}`}>
              ({['i', 'ii', 'iii', 'iv', 'v'][n]}) {t.label}
            </label>
            <div className="flex gap-2">
              <Input id={`salts-${t.id}`} value={state.answers[t.id].value} onChange={(e) => setAnswer(t.id, 'value', e.target.value)} disabled={readOnly} inputMode="decimal" placeholder="value" className="tabular" />
              <Input value={state.answers[t.id].unit} onChange={(e) => setAnswer(t.id, 'unit', e.target.value)} disabled={readOnly} placeholder={UNIT_HINT[t.unit]} className="w-32 shrink-0" aria-label={`Unit for ${t.label}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {(['observation', 'explain'] as const).map((k) => (
          <div key={k}>
            <label className="mb-1 block text-[12.5px] font-semibold" htmlFor={`salts-${k}`}>
              {QUESTIONS[task][k]}
            </label>
            <Textarea id={`salts-${k}`} value={state.written[k]} onChange={(e) => setWritten(k, e.target.value)} disabled={readOnly} rows={2} />
          </div>
        ))}
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="salts-precautions">
            Two precautions you took
          </label>
          <Textarea id="salts-precautions" value={state.written.precautions} onChange={(e) => setWritten('precautions', e.target.value)} disabled={readOnly} rows={3} />
        </div>
      </div>
    </Card>
  );
}

function YesNo({ value, onChange, disabled, label }: { value: string; onChange: (x: string) => void; disabled: boolean; label: string }) {
  return (
    <span className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label={label}>
      {(['yes', 'no'] as const).map((x) => (
        <button key={x} type="button" disabled={disabled} onClick={() => onChange(x)} aria-pressed={value === x} className={cn('px-2.5 py-1 text-[12.5px] capitalize', value === x ? 'bg-brand text-brand-foreground' : 'bg-card hover:bg-muted')}>
          {x}
        </button>
      ))}
    </span>
  );
}

/** The paper's instructions for this attempt (the 2D task card and the 3D bench's task card). */
export function TaskBrief({ v, className }: { v: ChemSaltsVariant; className?: string }) {
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
