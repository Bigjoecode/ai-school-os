import { COMP_EXPLAIN_Q, COMP_MCQ, compFields, compTraces, type CompCodeState, type CompTraceTable, type CompCodeVariant, type CompTask } from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Comp } from './actions';

/** The record: results, the trace table, the questions and the written answers. The same in the 2D lab and in the 3D notebook. */

type Writer = Pick<Comp, 'setReading' | 'setTrace' | 'toggleChoice' | 'setWritten'>;

const PREC_HINT: Record<CompTask, string> = {
  BASIC_IO: 'e.g. brackets were used to control the order of operations…',
  BASIC_LOOP: 'e.g. the DATA list had exactly enough values…',
  BASIC_ARRAY: 'e.g. the array was declared with DIM before it was used…',
  BASIC_FUNC: 'e.g. degrees were changed to radians before SIN…',
  BASIC_WHILE: 'e.g. the condition was made to become false, to avoid an endless loop…',
  FLOW: 'e.g. every decision box had two labelled exits…',
  HTML: 'e.g. the file was saved with the .html extension…',
  CRIMP: 'e.g. the jacket was stripped without nicking the inner wires…',
  MAINT: 'e.g. the computer was shut down and switched off at the wall before cleaning…',
};

function TraceGrid({ t, state, w, readOnly, extra }: { t: CompTraceTable; state: CompCodeState; w: Writer; readOnly: boolean; extra: number }) {
  const rows = Math.min(30, t.rows.length + extra);
  return (
    <div>
      <p className="mb-1 text-[12.5px] font-semibold">{t.title}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {t.cols.map((c) => (
                <th key={c} className="border border-border bg-muted/60 px-1 py-0.5 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {t.cols.map((c, k) => (
                  <td key={c} className="border border-border p-0">
                    <input data-trace={`${t.id}-${r}-${k}`} aria-label={`${c}, row ${r + 1}`} value={state.trace[t.id]?.[r]?.[k] ?? ''} disabled={readOnly} inputMode="decimal" maxLength={24} onChange={(e) => w.setTrace(t.id, r, k, e.target.value)} className="h-7 w-full min-w-14 bg-transparent px-1 text-center tabular outline-none focus:bg-brand/5 disabled:opacity-70" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Plots the student's own table of values (no answers: only what they typed). */
function PlotOfTable({ t, state }: { t: CompTraceTable; state: CompCodeState }) {
  const pts = (state.trace[t.id] ?? []).map((r) => [Number(r[0]), Number(r[1])] as const).filter(([x, y], i) => Number.isFinite(x) && Number.isFinite(y) && state.trace[t.id]?.[i]?.[0] !== '' && state.trace[t.id]?.[i]?.[1] !== '');
  if (pts.length < 2) return null;
  const px = (x: number) => 26 + (x / 360) * 280;
  const py = (y: number) => 60 - y * 48;
  return (
    <svg viewBox="0 0 320 120" className="w-full rounded-lg border border-border bg-white" role="img" aria-label="Your points plotted">
      <line x1={26} y1={60} x2={306} y2={60} stroke="#94a3b8" />
      <line x1={26} y1={8} x2={26} y2={112} stroke="#94a3b8" />
      {[1, -1].map((y) => (
        <text key={y} x={22} y={py(y) + 3} fontSize={8} textAnchor="end" fill="#475569">
          {y}
        </text>
      ))}
      <text x={306} y={72} fontSize={8} textAnchor="end" fill="#475569">
        360°
      </text>
      <polyline fill="none" stroke="#1d4ed8" strokeWidth={1.4} points={pts.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')} />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={px(x)} cy={py(y)} r={2} fill="#1d4ed8" />
      ))}
    </svg>
  );
}

export function CompRecord({ v, state, readOnly, w, book }: { v: CompCodeVariant; state: CompCodeState; readOnly: boolean; w: Writer; book?: boolean }) {
  const fields = compFields(v);
  const traces = compTraces(v);
  const mcq = COMP_MCQ[v.task];
  const box = (f: (typeof fields)[number]) => (
    <label key={f.id} className="block text-[12.5px]">
      <span className="mb-0.5 block">{f.label}</span>
      <span className="flex items-center gap-1.5">
        <Input data-field={f.id} value={state.readings[f.id] ?? ''} disabled={readOnly} maxLength={60} onChange={(e) => w.setReading(f.id, e.target.value)} className="h-8" />
        {f.unit && <span className="text-muted-foreground">{f.unit}</span>}
      </span>
    </label>
  );
  const body = (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[13px] font-semibold">Results</p>
        {fields.filter((f) => f.crit === 'record').map(box)}
      </div>
      {traces.map((t) => (
        <div key={t.id} className="space-y-2">
          <TraceGrid t={t} state={state} w={w} readOnly={readOnly} extra={v.task === 'BASIC_WHILE' || t.id === 'T2' ? 3 : 0} />
          {v.task === 'BASIC_FUNC' && <PlotOfTable t={t} state={state} />}
        </div>
      ))}
      <div className="space-y-2">
        <p className="text-[13px] font-semibold">Questions</p>
        {fields.filter((f) => f.crit === 'questions').map(box)}
        {mcq.map((q) => (
          <fieldset key={q.id} className="space-y-1" disabled={readOnly}>
            <legend className="text-[12.5px]">{q.q}</legend>
            <div className="flex flex-col gap-1">
              {q.options.map((o, i) => {
                const on = (state.choices[q.id] ?? []).includes(i);
                return (
                  <button key={o} type="button" data-mcq={`${q.id}-${i}`} aria-pressed={on} disabled={readOnly} onClick={() => w.toggleChoice(q.id, i)} className={cn('rounded-lg border px-2 py-1 text-left text-[12.5px]', on ? 'border-brand bg-brand/10 font-medium' : 'border-border')}>
                    {o}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="space-y-2">
        <label className="block text-[12.5px]">
          <span className="mb-0.5 block font-semibold">Precautions</span>
          <Textarea data-written="precautions" rows={3} value={state.written.precautions} disabled={readOnly} placeholder={PREC_HINT[v.task]} onChange={(e) => w.setWritten('precautions', e.target.value)} className="text-[13px]" />
        </label>
        <label className="block text-[12.5px]">
          <span className="mb-0.5 block font-semibold">{COMP_EXPLAIN_Q[v.task]}</span>
          <Textarea data-written="explain" rows={3} value={state.written.explain} disabled={readOnly} onChange={(e) => w.setWritten('explain', e.target.value)} className="text-[13px]" />
        </label>
      </div>
    </div>
  );
  return book ? body : <Card className="p-4 sm:p-5">{body}</Card>;
}
