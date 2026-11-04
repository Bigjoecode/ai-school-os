import {
  ORG_CLAIM_LABEL,
  ORG_IDENT_LABEL,
  ORG_TASK_CLAIMS,
  ORG_TASK_IDENTS,
  ORG_TASK_SAMPLES,
  SOAP_BYPRODUCTS,
  SOAP_CLAIMS,
  SOAP_CLAIM_LABEL,
  SOAP_ROWS,
  SOAP_ROW_LABEL,
  emptyOrgRecord,
  orgCalcAnswer,
  orgCalcQuestion,
  orgSampleName,
  orgSingleIdent,
  orgTestText,
  type ChemOrganicState,
  type ChemOrganicVariant,
  type OrgClaim,
  type OrgIdent,
  type OrgRecord,
  type OrgSample,
  type OrgTask,
  type SoapRow,
} from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { OrgUpdate as Update } from './actions';

/**
 * The TEST · OBSERVATION · INFERENCE table, the identification, the
 * calculation, the soap record and the written answers: the same record in
 * the 2D lab and in the 3D lab's notebook (`book`: exercise-book styling).
 */

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60';

export const EXPLAIN_Q: Record<OrgTask, string> = {
  GROUPS: 'Explain why the alkene decolourises bromine water but the alkane does not, and what happens in the esterification test (the type of reaction and the role of the conc. H₂SO₄).',
  CARBS: 'Explain why sucrose gives no colour with Benedict’s solution until it has been boiled with dilute acid, and why the acid must be neutralised first.',
  PROTEINS: 'What does the Biuret test detect, and why does egg white set (coagulate) when it is heated?',
  SOAP: 'Explain why brine is added to the hot mixture (salting out), and how soap removes grease.',
};
const PREC_HINT: Record<OrgTask, string> = {
  GROUPS: 'e.g. organic liquids were heated only in a water bath, away from flames…',
  CARBS: 'e.g. equal volumes of sample and reagent were used…',
  PROTEINS: 'e.g. a water control was used…',
  SOAP: 'e.g. the mixture was stirred continuously to prevent spitting…',
};

function ClaimChip({ n, rec, onCycle, disabled }: { n: OrgClaim; rec: OrgRecord; onCycle: () => void; disabled: boolean }) {
  const p = rec.present.includes(n);
  const a = rec.absent.includes(n);
  return (
    <button type="button" disabled={disabled} onClick={onCycle} className={cn(CHIP, p ? 'border-success bg-success/15 text-foreground' : a ? 'border-danger bg-danger/10 text-foreground line-through' : 'border-border text-muted-foreground hover:bg-muted')} aria-label={`${ORG_CLAIM_LABEL[n]}: ${p ? 'present' : a ? 'absent' : 'not stated'}`}>
      {ORG_CLAIM_LABEL[n]}
      {p ? ' ✓' : a ? ' ✗' : ''}
    </button>
  );
}
const summary = (r: OrgRecord) => [r.present.length ? `${r.present.map((x) => ORG_CLAIM_LABEL[x]).join(', ')} present` : '', r.absent.length ? `${r.absent.map((x) => ORG_CLAIM_LABEL[x]).join(', ')} absent` : '', r.note.trim()].filter(Boolean).join('; ') || '—';

export function TestTable({ state, readOnly, update, active, setActive }: { state: ChemOrganicState; readOnly: boolean; update: Update; active: number; setActive: (i: number) => void }) {
  const task = (state.task ?? 'GROUPS') as Exclude<OrgTask, 'SOAP'>;
  const setRec = (i: number, patch: Partial<OrgRecord>) => update((s) => ({ ...s, table: s.table.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const cycle = (i: number, n: OrgClaim) => {
    const r = state.table[i] ?? emptyOrgRecord();
    if (r.present.includes(n)) setRec(i, { present: r.present.filter((x) => x !== n), absent: [...r.absent, n] });
    else if (r.absent.includes(n)) setRec(i, { absent: r.absent.filter((x) => x !== n) });
    else setRec(i, { present: [...r.present, n] });
  };
  return (
    <div className="space-y-3">
      {state.tests.length === 0 && <p className="py-2 text-[13px] text-muted-foreground">Rows appear as you carry out tests.</p>}
      {state.tests.map((t, i) => {
        const r = state.table[i] ?? emptyOrgRecord();
        const open = i === active;
        return (
          <div key={i} className={cn('rounded-xl border p-3', open ? 'border-brand/60' : 'border-border')} data-row={i}>
            <button type="button" className="w-full text-left text-[12.5px]" onClick={() => setActive(i)} aria-expanded={open}>
              <span className="font-semibold">Test {i + 1}.</span> {orgTestText(t)}
            </button>
            <label className="mt-2 block text-[11.5px] font-medium text-muted-foreground" htmlFor={`oobs-${i}`}>
              Observation
            </label>
            <Textarea id={`oobs-${i}`} rows={2} value={r.observation} disabled={readOnly} onChange={(e) => setRec(i, { observation: e.target.value.slice(0, 600) })} onFocus={() => setActive(i)} placeholder="What you saw: the colour change, effervescence and the gas test, a smell, a precipitate…" />
            {open ? (
              <div className="mt-2 space-y-2">
                <p className="text-[11.5px] font-medium text-muted-foreground">Inference (tap once: present; twice: absent; again: clear)</p>
                <div className="flex flex-wrap gap-1" role="group" aria-label={`Inference for test ${i + 1}`}>
                  {(ORG_TASK_CLAIMS[task] ?? []).map((n) => (
                    <ClaimChip key={n} n={n} rec={r} disabled={readOnly} onCycle={() => cycle(i, n)} />
                  ))}
                </div>
                <Input value={r.note} disabled={readOnly} onChange={(e) => setRec(i, { note: e.target.value.slice(0, 300) })} placeholder="Anything else (e.g. the gas is hydrogen)" aria-label={`Other inference for test ${i + 1}`} />
              </div>
            ) : (
              <p className="mt-2 text-[12.5px]">
                <span className="text-muted-foreground">Inference: </span>
                {summary(r)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function OrgNotebook({ state, readOnly, update, active, setActive, book = false, className }: { state: ChemOrganicState; readOnly: boolean; update: Update; active: number; setActive: (i: number) => void; book?: boolean; className?: string }) {
  return (
    <Card className={cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Test · Observation · Inference</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">One row for every test. Write exactly what you saw; infer only what that test shows.</p>
      <TestTable state={state} readOnly={readOnly} update={update} active={active} setActive={setActive} />
    </Card>
  );
}

/** The identification of each sample. */
export function OrgConclusion({ state, readOnly, update, className }: { state: ChemOrganicState; readOnly: boolean; update: Update; className?: string }) {
  const task = (state.task ?? 'GROUPS') as Exclude<OrgTask, 'SOAP'>;
  const single = orgSingleIdent(task);
  const letters = ORG_TASK_SAMPLES[task].filter((x) => x !== 'H2O');
  const toggle = (l: OrgSample, n: OrgIdent) =>
    update((s) => {
      const cur = s.conclusion[l] ?? [];
      const next = single ? (cur.includes(n) ? [] : [n]) : cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n];
      return { ...s, conclusion: { ...s.conclusion, [l]: next } };
    }, `concl:${l}.${n}`);
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Identification</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">{task === 'GROUPS' ? 'Name the homologous series of each liquid.' : task === 'CARBS' ? 'Tick every carbohydrate present in each sample.' : 'Does each sample contain protein?'}</p>
      <div className="space-y-2">
        {letters.map((l) => (
          <div key={l} className="flex flex-wrap items-center gap-1" role="group" aria-label={`Identify ${l}`}>
            <span className="w-7 text-[13px] font-semibold">{l}</span>
            {ORG_TASK_IDENTS[task].map((n) => {
              const on = (state.conclusion[l] ?? []).includes(n);
              return (
                <button key={n} type="button" aria-pressed={on} disabled={readOnly} onClick={() => toggle(l, n)} className={cn(CHIP, on ? 'border-brand bg-brand/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                  {ORG_IDENT_LABEL[n]}
                  {on ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** The calculation from the given data. */
export function OrgCalc({ v, state, readOnly, update, className }: { v: ChemOrganicVariant; state: ChemOrganicState; readOnly: boolean; update: Update; className?: string }) {
  const a = orgCalcAnswer(v);
  const set = (k: 'a' | 'b' | 'c', val: string) => update((s) => ({ ...s, calc: { ...s.calc, [k]: val.slice(0, 40) } }));
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Calculation</h3>
      <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">{orgCalcQuestion(v)}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {(['a', 'b', 'c'] as const).map((k, i) =>
          a.labels[i] ? (
            <label key={k} className="text-[11.5px] text-muted-foreground">
              {a.labels[i]}
              {a.units[i] ? ` (${a.units[i]})` : ''}
              <Input id={`ocalc-${k}`} value={state.calc[k]} disabled={readOnly} onChange={(e) => set(k, e.target.value)} className="mt-0.5" inputMode="decimal" />
            </label>
          ) : null,
        )}
      </div>
    </Card>
  );
}

/** SOAP: the four observation rows, the weighings and the yield. */
export function SoapNotebook({ state, readOnly, update, book = false, className }: { state: ChemOrganicState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const setRow = (row: SoapRow, patch: Partial<ChemOrganicState['soapRows'][SoapRow]>) => update((s) => ({ ...s, soapRows: { ...s.soapRows, [row]: { ...s.soapRows[row], ...patch } } }));
  const setR = (k: keyof ChemOrganicState['readings'], val: string) => update((s) => ({ ...s, readings: { ...s.readings, [k]: val.slice(0, 40) } }));
  return (
    <Card className={cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Observations and inferences</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">Write what you saw at each stage, and what it shows.</p>
      <div className="space-y-3">
        {SOAP_ROWS.map((row) => {
          const r = state.soapRows[row];
          return (
            <div key={row} className="rounded-xl border border-border p-3" data-soaprow={row}>
              <p className="text-[12.5px] font-semibold">{SOAP_ROW_LABEL[row]}</p>
              <Textarea id={`sobs-${row}`} rows={2} value={r.observation} disabled={readOnly} onChange={(e) => setRow(row, { observation: e.target.value.slice(0, 600) })} className="mt-1.5" placeholder="What you saw" aria-label={`Observation: ${SOAP_ROW_LABEL[row]}`} />
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={`Inference: ${SOAP_ROW_LABEL[row]}`}>
                {SOAP_CLAIMS.map((c) => {
                  const on = r.claims.includes(c);
                  return (
                    <button key={c} type="button" aria-pressed={on} disabled={readOnly} onClick={() => setRow(row, { claims: on ? r.claims.filter((x) => x !== c) : [...r.claims, c] })} className={cn(CHIP, on ? 'border-success bg-success/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                      {SOAP_CLAIM_LABEL[c]}
                      {on ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <h4 className="mb-2 mt-4 text-[13px] font-semibold">Results</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ['oil', 'Mass of palm oil (g)'],
            ['soap', 'Mass of dry soap (g)'],
            ['theory', 'Theoretical mass of soap = oil ÷ 806 × 3 × 278 (g)'],
            ['yield', 'Percentage yield (%)'],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="text-[11.5px] text-muted-foreground">
            {l}
            <Input id={`sread-${k}`} value={state.readings[k]} disabled={readOnly} onChange={(e) => setR(k, e.target.value)} className="mt-0.5" inputMode="decimal" />
          </label>
        ))}
      </div>
      <p className="mb-1 mt-3 text-[12.5px] font-semibold">Fat + 3NaOH → 3 soap + ?</p>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="By-product">
        {SOAP_BYPRODUCTS.map((b) => (
          <button key={b} type="button" role="radio" aria-checked={state.readings.byproduct === b} disabled={readOnly} onClick={() => setR('byproduct', b)} className={cn(CHIP, state.readings.byproduct === b ? 'border-brand bg-brand/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
            {b}
          </button>
        ))}
      </div>
    </Card>
  );
}

export function Written({ state, readOnly, update, className }: { state: ChemOrganicState; readOnly: boolean; update: Update; className?: string }) {
  const task = state.task ?? 'GROUPS';
  const set = (k: 'precautions' | 'explain', val: string) => update((s) => ({ ...s, written: { ...s.written, [k]: val.slice(0, 2000) } }));
  return (
    <Card className={cn('space-y-3 p-4 sm:p-5', className)}>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="org-prec">
          Two precautions you took
        </label>
        <Textarea id="org-prec" rows={3} value={state.written.precautions} disabled={readOnly} onChange={(e) => set('precautions', e.target.value)} placeholder={PREC_HINT[task]} />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="org-explain">
          {EXPLAIN_Q[task]}
        </label>
        <Textarea id="org-explain" rows={3} value={state.written.explain} disabled={readOnly} onChange={(e) => set('explain', e.target.value)} />
      </div>
    </Card>
  );
}

/** All of the record for a task (2D page and 3D notebook). */
export function OrgRecordAll({ v, state, readOnly, update, active, setActive, book = false }: { v: ChemOrganicVariant; state: ChemOrganicState; readOnly: boolean; update: Update; active: number; setActive: (i: number) => void; book?: boolean }) {
  const flat = book ? 'border-0 p-0 shadow-none sm:p-0' : undefined;
  if ((state.task ?? 'GROUPS') === 'SOAP')
    return (
      <div className="space-y-4">
        <SoapNotebook state={state} readOnly={readOnly} update={update} book={book} className={flat} />
        <Written state={state} readOnly={readOnly} update={update} className={flat} />
      </div>
    );
  return (
    <div className="space-y-4">
      <OrgNotebook state={state} readOnly={readOnly} update={update} active={active} setActive={setActive} book={book} className={flat} />
      <OrgConclusion state={state} readOnly={readOnly} update={update} className={flat} />
      <OrgCalc v={v} state={state} readOnly={readOnly} update={update} className={flat} />
      <Written state={state} readOnly={readOnly} update={update} className={flat} />
    </div>
  );
}
export { orgSampleName };
