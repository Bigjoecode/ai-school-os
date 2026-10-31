import type { ChemRedoxState, ChemRedoxVariant, RedoxTaskId } from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { RedoxUpdate } from './actions';

/** The explanation question each task asks. */
export const EXPLAIN_Q: Record<ChemRedoxVariant['task'], string> = {
  FE: 'Why is no indicator needed in this titration?',
  OX: 'Why do the first drops of KMnO₄ decolourise slowly and later ones quickly? Why warm the flask?',
  IOD: 'Why is the starch added only near the end point?',
};

/** The results table, calculations and written answers: the same record in the 2D lab and on the 3D bench (styled as an exercise book). */
export function Notebook({ v, state, readOnly, update, book = false, className }: { v: ChemRedoxVariant; state: ChemRedoxState; readOnly: boolean; update: RedoxUpdate; book?: boolean; className?: string }) {
  const accurateNo = (i: number) => state.runs.slice(0, i + 1).filter((r) => r.kind === 'ACCURATE').length;
  const setCell = (i: number, key: 'initial' | 'final' | 'titre', value: string) => update((s) => ({ ...s, table: s.table.map((row, k) => (k === i ? { ...row, [key]: value.slice(0, 40) } : row)) }));
  const setAnswer = (id: RedoxTaskId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value.slice(0, 40) } } }));
  const setWritten = (key: 'endpoint' | 'explain' | 'precautions', value: string) => update((s) => ({ ...s, written: { ...s.written, [key]: value.slice(0, key === 'endpoint' ? 1000 : 2000) } }));
  const unitHint: Record<string, string> = { cm3: 'e.g. cm³', mol: 'unit', 'mol/dm3': 'unit', 'g/dm3': 'unit' };
  return (
    <Card className={cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,var(--color-info-soft)_31px,var(--color-info-soft)_32px)]', className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">{book ? 'Burette readings and calculations' : 'Your record'}</h3>
      {v.dark && <p className="mb-2 text-[12px] text-muted-foreground">KMnO₄ is too dark to see the bottom of the meniscus: read the top of it, every time.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Burette readings (cm³)</th>
              <th className="px-1 py-1 font-medium">Initial</th>
              <th className="px-1 py-1 font-medium">Final</th>
              <th className="px-1 py-1 font-medium">Titre</th>
            </tr>
          </thead>
          <tbody>
            {state.runs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-muted-foreground">
                  Rows appear as you pipette B into the flask.
                </td>
              </tr>
            )}
            {state.runs.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5 pr-2">
                  {r.kind === 'ROUGH' ? 'Rough' : `${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][accurateNo(i) - 1] ?? `${accurateNo(i)}th`}`}
                  {!r.done && <span className="ml-1 text-[11px] text-info">(open)</span>}
                </td>
                {(['initial', 'final', 'titre'] as const).map((k) => (
                  <td key={k} className="px-1 py-1.5">
                    <Input
                      value={state.table[i]?.[k] ?? ''}
                      onChange={(e) => setCell(i, k, e.target.value)}
                      disabled={readOnly}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="h-9 w-[84px] px-2 tabular"
                      aria-label={`${r.kind === 'ROUGH' ? 'Rough' : `Accurate ${accurateNo(i)}`} ${k} reading`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        {v.tasks.map((t, n) => (
          <div key={t.id}>
            <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor={`ans-${t.id}`}>
              ({['i', 'ii', 'iii', 'iv', 'v'][n]}) {t.label}
            </label>
            <div className="flex gap-2">
              <Input id={`ans-${t.id}`} value={state.answers[t.id].value} onChange={(e) => setAnswer(t.id, 'value', e.target.value)} disabled={readOnly} inputMode="decimal" placeholder="value" className="tabular" />
              <Input value={state.answers[t.id].unit} onChange={(e) => setAnswer(t.id, 'unit', e.target.value)} disabled={readOnly} placeholder={unitHint[t.unit]} className="w-32 shrink-0" aria-label={`Unit for ${t.label}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="endpoint">
            Colour change at the end point
          </label>
          <Input id="endpoint" value={state.written.endpoint} onChange={(e) => setWritten('endpoint', e.target.value)} disabled={readOnly} placeholder="From … to …" />
        </div>
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="explain">
            {EXPLAIN_Q[v.task]}
          </label>
          <Textarea id="explain" value={state.written.explain} onChange={(e) => setWritten('explain', e.target.value)} disabled={readOnly} rows={2} />
        </div>
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="precautions">
            Two precautions you took
          </label>
          <Textarea id="precautions" value={state.written.precautions} onChange={(e) => setWritten('precautions', e.target.value)} disabled={readOnly} rows={3} />
        </div>
      </div>
    </Card>
  );
}

/** The paper's instructions for this attempt's variant (the 2D task card and the 3D bench's task card). */
export function TaskBrief({ v, className }: { v: ChemRedoxVariant; className?: string }) {
  const how =
    v.task === 'FE'
      ? 'Put A into the burette. Pipette 25.0 cm³ of B into a conical flask, add about 20 cm³ of dilute H₂SO₄ and titrate with A. No indicator is needed. Do a rough titration, then repeat until you have concordant titres. Tabulate your burette readings and calculate:'
      : v.task === 'OX'
        ? 'Put A into the burette. Pipette 25.0 cm³ of B into a conical flask, add about 20 cm³ of dilute H₂SO₄, warm the mixture to about 60–70 °C and titrate with A while hot. Do a rough titration, then repeat with fresh, warmed portions until you have concordant titres. Tabulate your burette readings and calculate:'
        : 'Put A into the burette. Pipette 25.0 cm³ of B into a conical flask and titrate with A until the colour is pale yellow; then add about 1 cm³ of starch solution and continue until the blue-black colour just disappears. Do a rough titration, then repeat until you have concordant titres. Tabulate your burette readings and calculate:';
  const masses = v.task === 'FE' ? 'FeSO₄·7H₂O = 278 g mol⁻¹ (Fe = 56, S = 32, O = 16, H = 1)' : v.task === 'OX' ? 'KMnO₄ = 158 g mol⁻¹ (K = 39, Mn = 55, O = 16)' : 'I₂ = 254 g mol⁻¹ (I = 127)';
  return (
    <div className={cn('space-y-2 text-[13.5px] leading-relaxed', className)}>
      <p>{v.given.A}</p>
      <p>{v.given.B}</p>
      <p>{how}</p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        {v.tasks.map((t) => (
          <li key={t.id}>{t.label}</li>
        ))}
      </ol>
      <p className="text-muted-foreground">
        The equation for the reaction is: <span className="font-medium text-foreground">{v.equation}</span>. Molar mass: {masses}.
      </p>
    </div>
  );
}
