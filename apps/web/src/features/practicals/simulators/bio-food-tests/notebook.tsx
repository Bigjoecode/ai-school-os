import {
  AMY_BATH_SHORT,
  AMY_CLAIMS,
  AMY_CLAIM_LABEL,
  FOOD_LETTERS,
  NUTRIENTS,
  NUTRIENT_LABEL,
  emptyAmyRecord,
  emptyFoodRecord,
  foodTestText,
  type AmyBath,
  type AmyRecord,
  type BioFoodState,
  type FoodRecord,
  type Nutrient,
} from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { FoodUpdate as Update } from './actions';

/**
 * The TEST · OBSERVATION · INFERENCE table, the amylase results table, the
 * conclusion and the written answers: the same record in the 2D lab and in the
 * 3D lab's notebook (`book`: exercise-book styling).
 */

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60';
const isFoodRow = (s: BioFoodState, i: number) => ['P', 'Q', 'R'].includes(s.tests[i]?.sample ?? '');

export const EXPLAIN_Q = {
  FOOD: 'In the test for a non-reducing sugar, why is the sample first boiled with dilute HCl, and why is the acid then neutralised before Benedict’s solution is added?',
  AMYLASE: 'Explain your results: why the starch disappeared fastest at the temperature you found, why it was slow in the ice bath, and why it was not digested with boiled saliva.',
};

function NutrientChip({ n, rec, onCycle, disabled }: { n: Nutrient; rec: FoodRecord; onCycle: () => void; disabled: boolean }) {
  const p = rec.present.includes(n);
  const a = rec.absent.includes(n);
  return (
    <button type="button" disabled={disabled} onClick={onCycle} className={cn(CHIP, p ? 'border-success bg-success/15 text-foreground' : a ? 'border-danger bg-danger/10 text-foreground line-through' : 'border-border text-muted-foreground hover:bg-muted')} aria-label={`${NUTRIENT_LABEL[n]}: ${p ? 'present' : a ? 'absent' : 'not stated'}`}>
      {NUTRIENT_LABEL[n]}
      {p ? ' ✓' : a ? ' ✗' : ''}
    </button>
  );
}

const summary = (r: FoodRecord) => [r.present.length ? `${r.present.map((x) => NUTRIENT_LABEL[x]).join(', ')} present` : '', r.absent.length ? `${r.absent.map((x) => NUTRIENT_LABEL[x]).join(', ')} absent` : '', r.note.trim()].filter(Boolean).join('; ') || '—';

/** The rows of food tests (P, Q, R — or, for the amylase task, the Benedict's tests on the mixtures). */
export function TestTable({ state, readOnly, update, active, setActive, amylase = false }: { state: BioFoodState; readOnly: boolean; update: Update; active: number; setActive: (i: number) => void; amylase?: boolean }) {
  const setRec = (i: number, patch: Partial<FoodRecord>) => update((s) => ({ ...s, table: s.table.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const cycle = (i: number, n: Nutrient) => {
    const r = state.table[i] ?? emptyFoodRecord();
    if (r.present.includes(n)) setRec(i, { present: r.present.filter((x) => x !== n), absent: [...r.absent, n] });
    else if (r.absent.includes(n)) setRec(i, { absent: r.absent.filter((x) => x !== n) });
    else setRec(i, { present: [...r.present, n] });
  };
  const rows = state.tests.map((t, i) => ({ t, i })).filter((x) => (amylase ? !isFoodRow(state, x.i) : isFoodRow(state, x.i)));
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="py-2 text-[13px] text-muted-foreground">{amylase ? "Rows appear when you test a mixture with Benedict's solution." : 'Rows appear as you carry out tests.'}</p>}
      {rows.map(({ t, i }) => {
        const r = state.table[i] ?? emptyFoodRecord();
        const open = i === active;
        return (
          <div key={i} className={cn('rounded-xl border p-3', open ? 'border-brand/60' : 'border-border')}>
            <button type="button" className="w-full text-left text-[12.5px]" onClick={() => setActive(i)} aria-expanded={open}>
              <span className="font-semibold">Test {i + 1}.</span> {foodTestText(state, t)}
            </button>
            <label className="mt-2 block text-[11.5px] font-medium text-muted-foreground" htmlFor={`fobs-${i}`}>
              Observation
            </label>
            <Textarea id={`fobs-${i}`} rows={2} value={r.observation} disabled={readOnly} onChange={(e) => setRec(i, { observation: e.target.value.slice(0, 600) })} onFocus={() => setActive(i)} placeholder="What you saw: the colour, a precipitate, a layer, a spot, fizzing…" />
            {open ? (
              <div className="mt-2 space-y-2">
                <p className="text-[11.5px] font-medium text-muted-foreground">Inference (tap once: present; twice: absent; again: clear)</p>
                <div className="flex flex-wrap gap-1" role="group" aria-label={`Inference for test ${i + 1}`}>
                  {NUTRIENTS.map((n) => (
                    <NutrientChip key={n} n={n} rec={r} disabled={readOnly} onCycle={() => cycle(i, n)} />
                  ))}
                </div>
                <Input value={r.note} disabled={readOnly} onChange={(e) => setRec(i, { note: e.target.value.slice(0, 300) })} placeholder="Anything else (e.g. a lot of reducing sugar)" aria-label={`Other inference for test ${i + 1}`} />
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

export function FoodNotebook({ state, readOnly, update, active, setActive, book = false, className }: { state: BioFoodState; readOnly: boolean; update: Update; active: number; setActive: (i: number) => void; book?: boolean; className?: string }) {
  return (
    <Card className={cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Test · Observation · Inference</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">One row for every test. Write exactly what you saw; infer only what that test shows.</p>
      <TestTable state={state} readOnly={readOnly} update={update} active={active} setActive={setActive} />
    </Card>
  );
}

/** FOOD: the food substances in each sample. */
export function FoodConclusion({ state, readOnly, update, className }: { state: BioFoodState; readOnly: boolean; update: Update; className?: string }) {
  const toggle = (l: (typeof FOOD_LETTERS)[number], n: Nutrient) => update((s) => ({ ...s, conclusion: { ...s.conclusion, [l]: s.conclusion[l].includes(n) ? s.conclusion[l].filter((x) => x !== n) : [...s.conclusion[l], n] } }), `concl:${l}.${n}`);
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Conclusion</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">Tick every food substance present in each sample.</p>
      <div className="space-y-2">
        {FOOD_LETTERS.map((l) => (
          <div key={l} className="flex flex-wrap items-center gap-1" role="group" aria-label={`Food substances in ${l}`}>
            <span className="w-7 text-[13px] font-semibold">{l}</span>
            {NUTRIENTS.map((n) => {
              const on = state.conclusion[l].includes(n);
              return (
                <button key={n} type="button" aria-pressed={on} disabled={readOnly} onClick={() => toggle(l, n)} className={cn(CHIP, on ? 'border-brand bg-brand/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                  {NUTRIENT_LABEL[n]}
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

/** AMYLASE: one row per tube (what the drops showed, the end point, 1000/t, the inference), then the Benedict's rows and the optimum. */
export function AmyNotebook({ state, readOnly, update, active, setActive, book = false, className }: { state: BioFoodState; readOnly: boolean; update: Update; active: number; setActive: (i: number) => void; book?: boolean; className?: string }) {
  const setRec = (i: number, patch: Partial<AmyRecord>) => update((s) => ({ ...s, amy: s.tubes.map((_, k) => (k === i ? { ...(s.amy[k] ?? emptyAmyRecord()), ...patch } : (s.amy[k] ?? emptyAmyRecord()))) }));
  const toggle = (i: number, c: (typeof AMY_CLAIMS)[number]) => {
    const r = state.amy[i] ?? emptyAmyRecord();
    setRec(i, { claims: r.claims.includes(c) ? r.claims.filter((x) => x !== c) : [...r.claims, c] });
  };
  const baths = [...new Set(state.tubes.filter((t) => !t.boiled).map((t) => t.bath))];
  const setOpt = (b: AmyBath) => update((s) => ({ ...s, optimum: s.optimum === b ? null : b }), `optimum:${b}`);
  return (
    <Card className={cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Results</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">For each tube: what the iodine did, the time to the end point (when the iodine first stays yellow-brown), the rate 1000 ÷ t, and your inference.</p>
      {state.tubes.length === 0 && <p className="py-2 text-[13px] text-muted-foreground">Rows appear when you set up tubes.</p>}
      <div className="space-y-3">
        {state.tubes.map((tb, i) => {
          const r = state.amy[i] ?? emptyAmyRecord();
          return (
            <div key={i} className="rounded-xl border border-border p-3">
              <p className="text-[12.5px] font-semibold">
                Tube {i + 1}: {tb.boiled ? 'boiled saliva, ' : ''}
                {AMY_BATH_SHORT[tb.bath]}
              </p>
              <label className="mt-2 block text-[11.5px] font-medium text-muted-foreground" htmlFor={`aobs-${i}`}>
                Observation
              </label>
              <Textarea id={`aobs-${i}`} rows={2} value={r.observation} disabled={readOnly} onChange={(e) => setRec(i, { observation: e.target.value.slice(0, 600) })} onFocus={() => setActive(-1)} placeholder="e.g. blue-black at first; by 90 s the iodine stayed yellow-brown" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-[11.5px] text-muted-foreground">
                  End point (s)
                  <Input id={`aend-${i}`} value={r.end} disabled={readOnly} onChange={(e) => setRec(i, { end: e.target.value.slice(0, 40) })} placeholder="e.g. 90, or none" className="mt-0.5" />
                </label>
                <label className="text-[11.5px] text-muted-foreground">
                  Rate = 1000 ÷ t
                  <Input id={`arate-${i}`} value={r.rate} disabled={readOnly} onChange={(e) => setRec(i, { rate: e.target.value.slice(0, 40) })} placeholder="e.g. 11.1, or 0" className="mt-0.5" />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={`Inference for tube ${i + 1}`}>
                {AMY_CLAIMS.map((c) => {
                  const on = r.claims.includes(c);
                  return (
                    <button key={c} type="button" aria-pressed={on} disabled={readOnly} onClick={() => toggle(i, c)} className={cn(CHIP, on ? 'border-success bg-success/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                      {AMY_CLAIM_LABEL[c]}
                      {on ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <h4 className="mb-2 mt-4 text-[13px] font-semibold">Benedict’s test on the mixtures</h4>
      <TestTable state={state} readOnly={readOnly} update={update} active={active} setActive={setActive} amylase />
      <div className="mt-4">
        <p className="mb-1.5 text-[12.5px] font-semibold">Optimum temperature (the shortest time to the end point)</p>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Optimum temperature">
          {baths.length === 0 && <span className="text-[12px] text-muted-foreground">Set up tubes first.</span>}
          {baths.map((b) => (
            <button key={b} type="button" role="radio" aria-checked={state.optimum === b} disabled={readOnly} onClick={() => setOpt(b)} className={cn(CHIP, state.optimum === b ? 'border-brand bg-brand/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
              {AMY_BATH_SHORT[b]}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Precautions and the explanation (marked by AI). */
export function Written({ state, readOnly, update, className }: { state: BioFoodState; readOnly: boolean; update: Update; className?: string }) {
  const task = state.task ?? 'FOOD';
  const set = (k: 'precautions' | 'explain', val: string) => update((s) => ({ ...s, written: { ...s.written, [k]: val.slice(0, 2000) } }));
  return (
    <Card className={cn('space-y-3 p-4 sm:p-5', className)}>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="food-prec">
          Two precautions you took
        </label>
        <Textarea id="food-prec" rows={3} value={state.written.precautions} disabled={readOnly} onChange={(e) => set('precautions', e.target.value)} placeholder={task === 'AMYLASE' ? 'e.g. the tubes were left in the baths to reach the temperature before mixing…' : 'e.g. clean test tubes were used for each test…'} />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="food-explain">
          {EXPLAIN_Q[task]}
        </label>
        <Textarea id="food-explain" rows={3} value={state.written.explain} disabled={readOnly} onChange={(e) => set('explain', e.target.value)} />
      </div>
    </Card>
  );
}
