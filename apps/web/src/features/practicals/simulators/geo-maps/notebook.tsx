import { GEO_WRITTEN, type GeoChoice, type GeoField, type GeoMapsState, type GeoVariant } from '@aischool/shared';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Geo } from './actions';

/** The notebook: every answer box, the questions and the written answers. The same in 2D and 3D. */

function Field({ f, s, g, readOnly }: { f: GeoField; s: GeoMapsState; g: Geo; readOnly: boolean }) {
  const hint = f.kind === 'ref6' ? 'six figures' : f.kind === 'ref4' ? 'four figures' : f.kind === 'bearing' ? 'three figures' : f.kind === 'rf' ? '1:…' : f.kind === 'oneIn' ? '1 in …' : f.kind === 'time' ? 'hh:mm' : undefined;
  return (
    <label className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[13px]">
      <span className="min-w-0 flex-1">{f.label}</span>
      <span className="flex items-center gap-1.5">
        <Input id={`geo-f-${f.id}`} value={s.entries[f.id] ?? ''} onChange={(e) => g.setEntry(f.id, e.target.value)} readOnly={readOnly} placeholder={hint} inputMode={f.kind === 'num' ? 'decimal' : 'text'} aria-label={f.label} className="h-9 w-28 text-right tabular" />
        <span className="w-14 text-[12px] text-muted-foreground">{f.unit ?? ''}</span>
      </span>
    </label>
  );
}
function Choice({ c, s, g, readOnly }: { c: GeoChoice; s: GeoMapsState; g: Geo; readOnly: boolean }) {
  if (c.options.length > 5) {
    return (
      <label className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span className="min-w-0 flex-1">{c.label}</span>
        <select id={`geo-c-${c.id}`} value={s.choices[c.id] ?? ''} disabled={readOnly} onChange={(e) => g.setChoice(c.id, e.target.value)} aria-label={c.label} className="h-9 rounded-lg border border-input bg-card px-2 text-base sm:text-[13px]">
          <option value="">Choose…</option>
          {c.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <fieldset className="text-[13px]">
      <legend className="mb-1">{c.label}</legend>
      <div className="flex flex-col gap-1">
        {c.options.map((o) => (
          <button key={o.id} type="button" disabled={readOnly} data-choice={`${c.id}:${o.id}`} aria-pressed={s.choices[c.id] === o.id} onClick={() => g.setChoice(c.id, o.id)} className={cn('rounded-lg border px-2.5 py-1.5 text-left text-[12.5px]', s.choices[c.id] === o.id ? 'border-brand bg-brand/10 font-medium' : 'border-border hover:bg-muted/60')}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function GeoNotebook({ v, s, g, readOnly }: { v: GeoVariant; s: GeoMapsState; g: Geo; readOnly: boolean }) {
  const w = GEO_WRITTEN[v.task];
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-[13px] font-semibold">Readings and working</h3>
        {v.def.fields.map((f) => (
          <Field key={f.id} f={f} s={s} g={g} readOnly={readOnly} />
        ))}
      </section>
      <section className="space-y-3">
        <h3 className="text-[13px] font-semibold">Questions</h3>
        {v.def.choices.map((c) => (
          <Choice key={c.id} c={c} s={s} g={g} readOnly={readOnly} />
        ))}
      </section>
      <section className="space-y-2">
        <label className="block text-[13px]">
          <span className="font-semibold">Precautions.</span> State two precautions you took when {w.prec}.
          <Textarea id="geo-prec" rows={3} className="mt-1" value={s.written.precautions} readOnly={readOnly} onChange={(e) => g.setWritten({ precautions: e.target.value.slice(0, 2000) })} />
        </label>
        <label className="block text-[13px]">
          <span className="font-semibold">Explanation.</span> {w.explain}
          <Textarea id="geo-explain" rows={3} className="mt-1" value={s.written.explain} readOnly={readOnly} onChange={(e) => g.setWritten({ explain: e.target.value.slice(0, 2000) })} />
        </label>
      </section>
    </div>
  );
}
