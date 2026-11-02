import { ACID_GASES, HARD_BOILABLE, HARD_LABEL, HARD_SAMPLES, IND_SOLS, IND_SOL_LABEL, PH_CLASS_LABEL, PH_CLASSES, PH_INFO, PH_LETTER, PH_SAMPLES, ZOBO_NAMES, type AcidsAnswerId, type AcidsTask, type ChemAcidsState, type ChemAcidsVariant } from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { AcidsUpdate } from './actions';

/** The written questions each task asks. */
export const QUESTIONS: Record<AcidsTask, { observation: string; explain: string }> = {
  PH: { observation: 'What colour was the indicator in each sample, and what does it show?', explain: 'Why do 0.1 mol dm⁻³ HCl and 0.1 mol dm⁻³ ethanoic acid have different pH values?' },
  IND: { observation: 'What colours did the zobo extract show in the acids, water and alkalis, and at the end points?', explain: 'How does a natural indicator work? Is the zobo extract suitable for an HCl–NaOH titration?' },
  ACID: { observation: 'What did you observe with Mg, Zn, Cu, CuO and marble, and in the gas tests?', explain: 'Why does copper not react with dilute HCl? Give the general equations of the three reactions.' },
  HARD: { observation: 'How did each sample behave with the soap, before and after boiling?', explain: 'Why does boiling remove temporary hardness but not permanent hardness?' },
};
const UNIT_HINT = 'unit';
const NUMERAL = ['i', 'ii', 'iii', 'iv', 'v'];
const CLASS_SHORT: Record<string, string> = { SA: 'strong acid', WA: 'weak acid', N: 'neutral', WB: 'weak alkali', SB: 'strong alkali' };

/** The record, calculations and written answers: the same in the 2D lab and on the 3D bench. */
export function Notebook({ v, state, readOnly, update, className }: { v: ChemAcidsVariant; state: ChemAcidsState; readOnly: boolean; update: AcidsUpdate; className?: string }) {
  const task = v.task;
  const setRec = (k: string, value: string) => update((s) => ({ ...s, rec: { ...s.rec, [k]: value.slice(0, 40) } }));
  const setAnswer = (id: AcidsAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value.slice(0, 40) } } }));
  const setWritten = (key: 'observation' | 'explain' | 'precautions', value: string) => update((s) => ({ ...s, written: { ...s.written, [key]: value.slice(0, 2000) } }));
  const cell = (k: string, ph: string, label: string, w = 'w-[76px]') => <Input value={state.rec[k] ?? ''} onChange={(e) => setRec(k, e.target.value)} disabled={readOnly} inputMode="decimal" placeholder={ph} className={cn('h-9 px-2 tabular', w)} aria-label={label} />;
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <h3 className="mb-2 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      {task === 'PH' && (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Sample</th>
              <th className="py-1 font-medium">pH</th>
              <th className="py-1 pl-2 font-medium">Class</th>
            </tr>
          </thead>
          <tbody>
            {PH_SAMPLES.map((k) => (
              <tr key={k} className="border-t border-border">
                <td className="py-1.5 pr-2">
                  <span className="font-semibold">{PH_LETTER[k]}</span> {PH_INFO[k].label}
                </td>
                <td className="py-1.5">{cell(`ph${k}`, '0', `pH of sample ${PH_LETTER[k]}`, 'w-[56px]')}</td>
                <td className="py-1.5 pl-2">
                  <Choice value={state.rec[`cl${k}`] ?? ''} options={PH_CLASSES.map((c) => PH_CLASS_LABEL[c])} short={PH_CLASSES.map((c) => CLASS_SHORT[c]!)} onChange={(x) => setRec(`cl${k}`, x)} disabled={readOnly} label={`Class of sample ${PH_LETTER[k]}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {task === 'IND' && (
        <div className="space-y-4">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Solution</th>
                <th className="py-1 font-medium">Zobo extract colour</th>
                <th className="py-1 pl-2 font-medium">pH (universal indicator)</th>
              </tr>
            </thead>
            <tbody>
              {IND_SOLS.map((k) => (
                <tr key={k} className="border-t border-border">
                  <td className="py-1.5 pr-2">{IND_SOL_LABEL[k]}</td>
                  <td className="py-1.5">
                    <select value={state.rec[`ex${k}`] ?? ''} onChange={(e) => setRec(`ex${k}`, e.target.value)} disabled={readOnly} className="h-9 rounded-lg border border-input bg-card px-2 text-[13px]" aria-label={`Extract colour in ${IND_SOL_LABEL[k]}`}>
                      <option value="">—</option>
                      {ZOBO_NAMES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pl-2">{cell(`ui${k}`, '0', `pH of ${IND_SOL_LABEL[k]}`, 'w-[56px]')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="flex flex-wrap items-center gap-2 text-[12.5px]">
            The extract changes colour between pH {cell('rangeLo', '0', 'Lower pH of the colour change', 'w-[52px]')} and pH {cell('rangeHi', '0', 'Upper pH of the colour change', 'w-[52px]')}
          </p>
          {(['mo', 'z'] as const).map((p) => (
            <div key={p}>
              <p className="mb-1 text-[12.5px] font-semibold">Titration with {p === 'mo' ? 'methyl orange' : 'the zobo extract'} (25.0 cm³ NaOH; burette readings in cm³)</p>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-medium" />
                    {[1, 2, 3].map((n) => (
                      <th key={n} className="py-1 font-medium">
                        {n}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(['f', 'i', 't'] as const).map((r) => (
                    <tr key={r} className="border-t border-border">
                      <td className="py-1 pr-2">{r === 'f' ? 'Final reading' : r === 'i' ? 'Initial reading' : 'Volume of acid used'}</td>
                      {[1, 2, 3].map((n) => (
                        <td key={n} className="py-1 pr-1">
                          {cell(`${p}${n}${r}`, '0.00', `${p === 'mo' ? 'Methyl orange' : 'Zobo'} titration ${n} ${r === 'f' ? 'final' : r === 'i' ? 'initial' : 'titre'}`, 'w-[70px]')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      {task === 'ACID' && (
        <div className="space-y-3 text-[13px]">
          <table className="w-full">
            <thead>
              <tr className="text-left text-[12px] text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Test</th>
                <th className="py-1 font-medium">Gas given off</th>
              </tr>
            </thead>
            <tbody>
              {(['MG', 'ZN', 'CU', 'CACO3'] as const).map((k) => (
                <tr key={k} className="border-t border-border">
                  <td className="py-1.5 pr-2">{k === 'MG' ? 'Mg + dil. HCl' : k === 'ZN' ? 'Zn + dil. HCl' : k === 'CU' ? 'Cu + dil. HCl' : 'Marble + dil. HCl'}</td>
                  <td className="py-1.5">
                    <Choice value={state.rec[`gas${k}`] ?? ''} options={[...ACID_GASES]} onChange={(x) => setRec(`gas${k}`, x)} disabled={readOnly} label={`Gas from ${k}`} />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="py-1.5 pr-2">CuO + dil. HCl, warmed: colour of solution</td>
                <td className="py-1.5">
                  <Choice value={state.rec.cuo ?? ''} options={['colourless', 'blue-green', 'black', 'pink']} onChange={(x) => setRec('cuo', x)} disabled={readOnly} label="Colour of the CuO solution" />
                </td>
              </tr>
            </tbody>
          </table>
          <table className="w-full">
            <tbody>
              {[
                ['m1', 'Mass of flask + acid + cotton-wool plug'],
                ['m2', 'Mass of marble chips'],
                ['m3', 'Mass of flask + contents after the reaction'],
              ].map(([k, label]) => (
                <tr key={k} className="border-t border-border first:border-0">
                  <td className="py-1.5 pr-2">{label}</td>
                  <td className="py-1.5">{cell(k!, '0.00', label!, 'w-[92px]')}</td>
                  <td className="w-10 py-1.5 pl-1 text-muted-foreground">g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {task === 'HARD' && (
        <div className="space-y-3 text-[13px]">
          <table className="w-full">
            <thead>
              <tr className="text-left text-[12px] text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Sample (50.0 cm³)</th>
                <th className="py-1 font-medium">Soap / cm³, unboiled</th>
                <th className="py-1 pl-1 font-medium">after boiling</th>
              </tr>
            </thead>
            <tbody>
              {HARD_SAMPLES.map((k) => (
                <tr key={k} className="border-t border-border">
                  <td className="py-1.5 pr-2">{HARD_LABEL[k]}</td>
                  <td className="py-1.5">{cell(`v${k}`, '0.0', `Soap for ${HARD_LABEL[k]}`)}</td>
                  <td className="py-1.5 pl-1">{HARD_BOILABLE.includes(k) ? cell(`b${k}`, '0.0', `Soap for boiled ${HARD_LABEL[k]}`) : <span className="text-muted-foreground">blank</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-[12.5px]">
            <span>The hardest sample:</span>
            <Choice value={state.rec.hardest ?? ''} options={['TAP', 'X', 'Y']} onChange={(x) => setRec('hardest', x)} disabled={readOnly} label="Hardest sample" />
            <span>Mainly permanent hardness:</span>
            <Choice value={state.rec.permSample ?? ''} options={['X', 'Y']} onChange={(x) => setRec('permSample', x)} disabled={readOnly} label="Sample with mainly permanent hardness" />
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        {v.tasks.map((t, n) => (
          <div key={t.id}>
            <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor={`acids-${t.id}`}>
              ({NUMERAL[n]}) {t.label}
            </label>
            <div className="flex gap-2">
              <Input id={`acids-${t.id}`} value={state.answers[t.id].value} onChange={(e) => setAnswer(t.id, 'value', e.target.value)} disabled={readOnly} inputMode="decimal" placeholder="value" className="tabular" />
              <Input value={state.answers[t.id].unit} onChange={(e) => setAnswer(t.id, 'unit', e.target.value)} disabled={readOnly} placeholder={UNIT_HINT} className="w-32 shrink-0" aria-label={`Unit for ${t.label}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {(['observation', 'explain'] as const).map((k) => (
          <div key={k}>
            <label className="mb-1 block text-[12.5px] font-semibold" htmlFor={`acids-${k}`}>
              {QUESTIONS[task][k]}
            </label>
            <Textarea id={`acids-${k}`} value={state.written[k]} onChange={(e) => setWritten(k, e.target.value)} disabled={readOnly} rows={2} />
          </div>
        ))}
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="acids-precautions">
            Two precautions you took
          </label>
          <Textarea id="acids-precautions" value={state.written.precautions} onChange={(e) => setWritten('precautions', e.target.value)} disabled={readOnly} rows={3} />
        </div>
      </div>
    </Card>
  );
}

function Choice({ value, options, short, onChange, disabled, label }: { value: string; options: string[]; short?: string[]; onChange: (x: string) => void; disabled: boolean; label: string }) {
  return (
    <span className="inline-flex w-fit flex-wrap overflow-hidden rounded-lg border border-border" role="group" aria-label={label}>
      {options.map((x, i) => (
        <button key={x} type="button" disabled={disabled} onClick={() => onChange(x)} aria-pressed={value === x} title={x} className={cn('px-2 py-1 text-[12px]', value === x ? 'bg-brand text-brand-foreground' : 'bg-card hover:bg-muted')}>
          {short?.[i] ?? x}
        </button>
      ))}
    </span>
  );
}

/** The paper's instructions for this attempt (the 2D task card and the 3D bench's task card). */
export function TaskBrief({ v, className }: { v: ChemAcidsVariant; className?: string }) {
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
