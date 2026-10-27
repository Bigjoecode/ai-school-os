import { QUAL_ANIONS, QUAL_CATIONS, QUAL_GASES, QUAL_GAS_LABEL, QUAL_ION_LABEL, emptyQualRecord, qualTestText, type ChemQualitativeState, type ChemQualitativeVariant, type QualGas, type QualIon, type QualRecord } from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { QualUpdate as Update } from './actions';

/**
 * The TEST · OBSERVATION · INFERENCE table and the conclusion: the same record
 * in the 2D lab and in the 3D lab's notebook (`book`: exercise-book styling).
 */

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60';
function IonChip({ ion, rec, onCycle, disabled }: { ion: QualIon; rec: QualRecord; onCycle: () => void; disabled: boolean }) {
  const p = rec.present.includes(ion);
  const a = rec.absent.includes(ion);
  return (
    <button type="button" disabled={disabled} onClick={onCycle} className={cn(CHIP, p ? 'border-success bg-success/15 text-foreground' : a ? 'border-danger bg-danger/10 text-foreground line-through' : 'border-border text-muted-foreground hover:bg-muted')} aria-label={`${QUAL_ION_LABEL[ion]}: ${p ? 'present' : a ? 'absent' : 'not stated'}`}>
      {QUAL_ION_LABEL[ion]}
      {p ? ' ✓' : a ? ' ✗' : ''}
    </button>
  );
}

export function Notebook({ v, state, readOnly, update, active, setActive, book = false, className }: { v: ChemQualitativeVariant; state: ChemQualitativeState; readOnly: boolean; update: Update; active: number; setActive: (i: number) => void; book?: boolean; className?: string }) {
  const setRec = (i: number, patch: Partial<QualRecord>) => update((s) => ({ ...s, table: s.table.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const cycle = (i: number, ion: QualIon) => {
    const r = state.table[i] ?? emptyQualRecord();
    if (r.present.includes(ion)) setRec(i, { present: r.present.filter((x) => x !== ion), absent: [...r.absent, ion] });
    else if (r.absent.includes(ion)) setRec(i, { absent: r.absent.filter((x) => x !== ion) });
    else setRec(i, { present: [...r.present, ion] });
  };
  const toggleGas = (i: number, g: QualGas) => {
    const r = state.table[i] ?? emptyQualRecord();
    setRec(i, { gases: r.gases.includes(g) ? r.gases.filter((x) => x !== g) : [...r.gases, g] });
  };
  const summary = (r: QualRecord) =>
    [r.gases.length ? `${r.gases.map((g) => QUAL_GAS_LABEL[g]).join(', ')} given off` : '', r.present.length ? `${r.present.map((x) => QUAL_ION_LABEL[x]).join(' or ')} present` : '', r.absent.length ? `${r.absent.map((x) => QUAL_ION_LABEL[x]).join(', ')} absent` : '', r.note.trim()].filter(Boolean).join('; ') || '—';
  return (
    <Card className={cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Test · Observation · Inference</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">Tap an ion once for “present (or possibly present)”, twice for “absent”, again to clear.</p>
      {state.tests.length === 0 && <p className="py-3 text-[13px] text-muted-foreground">Rows appear as you carry out tests.</p>}
      <div className="space-y-3">
        {state.tests.map((t, i) => {
          const r = state.table[i] ?? emptyQualRecord();
          const open = i === active;
          return (
            <div key={i} className={cn('rounded-xl border p-3', open ? 'border-brand/60' : 'border-border')}>
              <button type="button" className="w-full text-left text-[12.5px]" onClick={() => setActive(i)} aria-expanded={open}>
                <span className="font-semibold">Test {i + 1}.</span> {qualTestText(v, t)}
              </button>
              <label className="mt-2 block text-[11.5px] font-medium text-muted-foreground" htmlFor={`obs-${i}`}>
                Observation
              </label>
              <Textarea id={`obs-${i}`} rows={2} value={r.observation} disabled={readOnly} onChange={(e) => setRec(i, { observation: e.target.value.slice(0, 600) })} onFocus={() => setActive(i)} placeholder="What you saw: colours, precipitate, solubility in excess, gas, smell…" />
              {open ? (
                <div className="mt-2 space-y-2">
                  <p className="text-[11.5px] font-medium text-muted-foreground">Inference</p>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Cations">
                    {QUAL_CATIONS.map((x) => (
                      <IonChip key={x} ion={x} rec={r} disabled={readOnly} onCycle={() => cycle(i, x)} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Anions">
                    {QUAL_ANIONS.map((x) => (
                      <IonChip key={x} ion={x} rec={r} disabled={readOnly} onCycle={() => cycle(i, x)} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Gases given off">
                    {QUAL_GASES.map((g) => (
                      <button key={g} type="button" disabled={readOnly} onClick={() => toggleGas(i, g)} aria-pressed={r.gases.includes(g)} className={cn(CHIP, r.gases.includes(g) ? 'border-info bg-info/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                        {QUAL_GAS_LABEL[g]}
                        {r.gases.includes(g) ? ' gas' : ''}
                      </button>
                    ))}
                  </div>
                  <Input value={r.note} disabled={readOnly} onChange={(e) => setRec(i, { note: e.target.value.slice(0, 300) })} placeholder="Other inference (e.g. water of crystallisation; stable to heat)" aria-label={`Other inference for test ${i + 1}`} />
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
    </Card>
  );
}

export function Conclusion({ v, state, readOnly, update, className }: { v: ChemQualitativeVariant; state: ChemQualitativeState; readOnly: boolean; update: Update; className?: string }) {
  const slots = v.kind === 'SALT' ? ([['A', 'C']] as const) : ([['A', 'Soluble salt (filtrate)'], ['B', 'Insoluble salt (residue)']] as const);
  const set = (k: 'A' | 'B', key: 'cation' | 'anion', val: string) => update((s) => ({ ...s, answer: { ...s.answer, [k]: { ...s.answer[k], [key]: s.answer[k][key] === val ? null : val } } }), `answer:${k}.${key}=${val}`);
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Conclusion</h3>
      <div className="space-y-4">
        {slots.map(([k, name]) => (
          <div key={k}>
            <p className="mb-1.5 text-[12.5px] font-semibold">{name}</p>
            {(['cation', 'anion'] as const).map((key) => (
              <div key={key} className="mb-1.5 flex flex-wrap items-center gap-1" role="radiogroup" aria-label={`${name}: ${key}`}>
                <span className="w-14 text-[12px] capitalize text-muted-foreground">{key}</span>
                {(key === 'cation' ? QUAL_CATIONS : QUAL_ANIONS).map((x) => {
                  const on = state.answer[k][key] === x;
                  return (
                    <button key={x} type="button" role="radio" aria-checked={on} disabled={readOnly} onClick={() => set(k, key, x)} className={cn(CHIP, on ? 'border-brand bg-brand/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                      {QUAL_ION_LABEL[x]}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="qual-eq">
            Ionic equations (a confirmatory test for the cation and for the anion{v.kind === 'MIXTURE' ? ' of the soluble salt' : ''})
          </label>
          <Textarea id="qual-eq" rows={3} value={state.answer.equation} disabled={readOnly} onChange={(e) => update((s) => ({ ...s, answer: { ...s.answer, equation: e.target.value.slice(0, 1000) } }))} placeholder="e.g. Zn²⁺(aq) + 2OH⁻(aq) → Zn(OH)₂(s)" />
        </div>
      </div>
    </Card>
  );
}
