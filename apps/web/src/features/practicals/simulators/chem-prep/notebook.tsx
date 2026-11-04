import {
  PREP_CLAIM_LABEL,
  PREP_MCQ,
  PREP_READINGS,
  PREP_ROWS,
  PREP_ROW_LABEL,
  PREP_TASK_CLAIMS,
  prepCalcQuestion,
  prepTubeTask,
  prepTubeText,
  prepTubes,
  type ChemPrepState,
  type ChemPrepVariant,
  type PrepClaim,
  type PrepTask,
} from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { PrepUpdate as Update } from './actions';

/**
 * The record: one row per stage (or per tube) with the observation and the
 * inference, the readings and calculation boxes, the deduction questions and
 * the written answers. The same in the 2D lab and in the 3D notebook.
 */

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60';
export const EXPLAIN_Q: Record<PrepTask, string> = {
  STANDARD: 'Explain why the solid is dissolved in a beaker and the flask then made up to the mark (not 250 cm³ of water added to the solid), and why the diluted solution is ten times less concentrated.',
  LECHAT: 'Use Le Chatelier’s principle to explain why adding FeCl₃ deepens the red colour and why heating the mixture makes it paler.',
  DISTIL: 'Explain why the distillate is pure water although the sea water contains salt, and why the thermometer reads about 100 °C.',
  HALOGEN: 'Explain, in terms of gaining electrons, why chlorine displaces bromine from potassium bromide but iodine cannot.',
  AMMONIA: 'Explain why ammonia is collected by upward delivery and not over water, and what the fountain experiment shows about it.',
};
const PREC_HINT: Record<PrepTask, string> = {
  STANDARD: 'e.g. the bottom of the meniscus was brought to the mark at eye level…',
  LECHAT: 'e.g. colours were compared against a white tile with a control…',
  DISTIL: 'e.g. the thermometer bulb was level with the side arm…',
  HALOGEN: 'e.g. fresh chlorine water was used…',
  AMMONIA: 'e.g. the tube was clamped sloping downwards…',
};

function RowEditor({ id, label, state, readOnly, update, active, onPick }: { id: string; label: string; state: ChemPrepState; readOnly: boolean; update: Update; active?: boolean; onPick?: () => void }) {
  const task = state.task ?? 'STANDARD';
  const r = state.records[id] ?? { observation: '', claims: [] };
  const set = (patch: { observation?: string; claims?: PrepClaim[] }) => update((s) => ({ ...s, records: { ...s.records, [id]: { ...(s.records[id] ?? { observation: '', claims: [] }), ...patch } } }));
  const claims = PREP_TASK_CLAIMS[task];
  return (
    <div className={cn('rounded-xl border p-2.5', active ? 'border-brand bg-brand/5' : 'border-border')}>
      <button type="button" className="mb-1 block w-full text-left text-[12.5px] font-semibold" onClick={onPick}>
        {label}
      </button>
      <Textarea id={`prep-obs-${id}`} rows={2} value={r.observation} disabled={readOnly} onChange={(e) => set({ observation: e.target.value.slice(0, 600) })} placeholder="Observation: what you saw" className="text-[13px]" />
      {claims.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label={`Inference: ${id}`}>
          {claims.map((c) => {
            const on = r.claims.includes(c);
            return (
              <button key={c} type="button" aria-pressed={on} disabled={readOnly} onClick={() => set({ claims: on ? r.claims.filter((x) => x !== c) : [...r.claims, c] })} className={cn(CHIP, on ? 'border-success bg-success/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                {PREP_CLAIM_LABEL[c]}
                {on ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PrepRecordAll({ v, state, readOnly, update, active = -1, setActive, book = false }: { v: ChemPrepVariant; state: ChemPrepState; readOnly: boolean; update: Update; active?: number; setActive?: (i: number) => void; book?: boolean }) {
  const task = state.task ?? v.task;
  const flat = book ? 'border-0 p-0 shadow-none sm:p-0' : undefined;
  const tubes = prepTubeTask(task) ? prepTubes(task, state.events) : [];
  const setR = (id: string, val: string) => update((s) => ({ ...s, readings: { ...s.readings, [id]: val.slice(0, 40) } }));
  const toggle = (id: string, i: number, multi: boolean) =>
    update((s) => {
      const cur = s.choices[id] ?? [];
      return { ...s, choices: { ...s.choices, [id]: multi ? (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort()) : cur.includes(i) ? [] : [i] } };
    });
  const setW = (k: 'precautions' | 'explain', val: string) => update((s) => ({ ...s, written: { ...s.written, [k]: val.slice(0, 2000) } }));
  return (
    <div className="space-y-4">
      <Card className={cn('space-y-2 p-4 sm:p-5', flat)}>
        <h4 className="text-[13px] font-semibold">{prepTubeTask(task) ? 'TUBE | OBSERVATION | INFERENCE' : 'OBSERVATION | INFERENCE'}</h4>
        {prepTubeTask(task) && !tubes.length && <p className="text-[13px] text-muted-foreground">Rows appear as you set up tubes.</p>}
        {prepTubeTask(task)
          ? tubes.map((t, i) => <RowEditor key={i} id={`t${i}`} label={`Tube ${i + 1}: ${prepTubeText(task, t)}`} state={state} readOnly={readOnly} update={update} active={i === active} onPick={() => setActive?.(i)} />)
          : PREP_ROWS[task].map((row) => <RowEditor key={row} id={row} label={PREP_ROW_LABEL[row] ?? row} state={state} readOnly={readOnly} update={update} />)}
      </Card>
      <Card className={cn('space-y-2 p-4 sm:p-5', flat)}>
        <h4 className="text-[13px] font-semibold">Readings and calculation</h4>
        <p className="text-[12.5px] text-muted-foreground">{prepCalcQuestion(v)}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PREP_READINGS[task].map((x) => (
            <label key={x.id} className="text-[11.5px] text-muted-foreground">
              {x.label}
              {x.unit ? ` (${x.unit})` : ''}
              <Input id={`prep-read-${x.id}`} value={state.readings[x.id] ?? ''} disabled={readOnly} onChange={(e) => setR(x.id, e.target.value)} className="mt-0.5" inputMode={x.id === 'kcunit' ? 'text' : 'decimal'} />
            </label>
          ))}
        </div>
      </Card>
      <Card className={cn('space-y-3 p-4 sm:p-5', flat)}>
        <h4 className="text-[13px] font-semibold">Questions</h4>
        {PREP_MCQ[task].map((q) => {
          const multi = q.answer.length > 1;
          const got = state.choices[q.id] ?? [];
          return (
            <div key={q.id}>
              <p className="mb-1 text-[12.5px] font-medium">
                {q.q}
                {multi ? ' (tick all that apply)' : ''}
              </p>
              <div className="flex flex-wrap gap-1" role="group" aria-label={q.id}>
                {q.options.map((o, i) => (
                  <button key={o} type="button" aria-pressed={got.includes(i)} aria-label={`${q.id}:${i}`} disabled={readOnly} onClick={() => toggle(q.id, i, multi)} className={cn(CHIP, got.includes(i) ? 'border-brand bg-brand/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </Card>
      <Card className={cn('space-y-3 p-4 sm:p-5', flat)}>
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="prep-prec">
            Two precautions you took
          </label>
          <Textarea id="prep-prec" rows={3} value={state.written.precautions} disabled={readOnly} onChange={(e) => setW('precautions', e.target.value)} placeholder={PREC_HINT[task]} />
        </div>
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="prep-explain">
            {EXPLAIN_Q[task]}
          </label>
          <Textarea id="prep-explain" rows={3} value={state.written.explain} disabled={readOnly} onChange={(e) => setW('explain', e.target.value)} />
        </div>
      </Card>
    </div>
  );
}
