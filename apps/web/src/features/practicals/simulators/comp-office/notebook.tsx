import { coAiText, coTaskTitle, type CoAnswer } from '@aischool/shared';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Office } from './actions';

/** The practical notebook: the answers asked for on the task card, the precautions and the explanation. */
export function Notebook({ o }: { o: Office }) {
  const { s, v, readOnly } = o;
  const ai = coAiText(v.task);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {v.answers.map((a: CoAnswer) => (
          <label key={a.id} className="text-[12px] text-muted-foreground">
            {a.label}
            <Input id={`co-ans-${a.id}`} aria-label={a.label} value={s.answers[a.id] ?? ''} disabled={readOnly} onChange={(e) => o.setAnswer(a.id, e.target.value)} className="mt-0.5" inputMode={typeof a.value === 'number' ? 'decimal' : 'text'} autoCapitalize="off" spellCheck={false} />
          </label>
        ))}
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="co-prec">Two precautions you took</label>
        <Textarea id="co-prec" rows={2} value={s.written.precautions} disabled={readOnly} onChange={(e) => o.setWritten('precautions', e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="co-explain">{ai.explain.q}</label>
        <Textarea id="co-explain" rows={3} value={s.written.explain} disabled={readOnly} onChange={(e) => o.setWritten('explain', e.target.value)} />
      </div>
    </div>
  );
}
export const TaskText = ({ o }: { o: Office }) => (
  <div>
    <p className="text-[13.5px] font-semibold">{coTaskTitle(o.v.task)}</p>
    <ol className="mt-1 list-decimal space-y-1 pl-5 text-[13.5px]">
      {o.v.brief.map((b) => <li key={b}>{b}</li>)}
    </ol>
  </div>
);
