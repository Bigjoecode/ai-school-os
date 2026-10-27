import type { BioMicroscopeState, BioMicroscopeVariant, MicroScope, MicroTaskId } from '@aischool/shared';
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Input, inputClass } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DrawingChecklist, LabelBoard } from '../bio-common';
import type { MicroUpdate } from './actions';
import { FieldContent, FieldView, VIEW_R, viewScale } from './field';

/** The microscope record (labelling, identity, measurement and magnification, drawing checklist, observations, precautions): the 2D lab's and the 3D lab's notebook. */
export function Notebook({
  v,
  state,
  readOnly,
  update,
  labelCap,
  measureCap,
  fieldBase,
  className,
}: {
  v: BioMicroscopeVariant;
  state: BioMicroscopeState;
  readOnly: boolean;
  update: MicroUpdate;
  labelCap: MicroScope | null;
  measureCap: MicroScope | null;
  fieldBase: { v: BioMicroscopeVariant; medium: BioMicroscopeState['prep']['medium']; coverslip: BioMicroscopeState['prep']['coverslip']; placed: boolean; crashed: boolean };
  /** e.g. no card border inside the 3D lab's panel. */
  className?: string;
}) {
  const info = v.info;
  const s = viewScale(v, info.labelObjective);
  const setAnswer = (id: MicroTaskId, key: 'value' | 'unit', value: string) => update((x) => ({ ...x, answers: { ...x.answers, [id]: { ...x.answers[id], [key]: value.slice(0, 40) } } }));
  const setWritten = (key: 'observations' | 'precautions', value: string) => update((x) => ({ ...x, written: { ...x.written, [key]: value.slice(0, 2000) } }));
  const unitHint: Record<string, string> = { '': '', length: 'µm or mm', 'per-mm2': 'per mm²' };
  // Small structures: show an enlarged part of the captured view so the numbered parts can be told apart.
  const zoomed = useMemo(() => {
    const pts = v.targets.map((t) => ({ x: t.x * s, y: t.y * s }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    const z = Math.max(1, Math.min(3.2, 150 / spread));
    const c = z > 1 ? { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 } : { x: 0, y: 0 };
    return { z, c, targets: pts.map((p) => ({ x: (p.x - c.x) * z, y: (p.y - c.y) * z })) };
  }, [v, s]);
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>

      <section className="space-y-2">
        <p className="text-[12.5px] font-semibold">
          Label the structures (×{info.labelObjective} view{zoomed.z > 1.05 ? `, the part in the middle enlarged ${zoomed.z.toFixed(1)} times` : ''})
        </p>
        {labelCap ? (
          <LabelBoard
            box={{ x: -VIEW_R - 6, y: -VIEW_R - 6, w: VIEW_R * 2 + 12, h: VIEW_R * 2 + 12 }}
            targets={zoomed.targets}
            options={v.labelOptions}
            value={v.targets.map((_, i) => state.labels[i] ?? '')}
            onChange={(next) => update((x) => ({ ...x, labels: next }), 'labels')}
            readOnly={readOnly}
            label={`Captured ×${info.labelObjective} view with ${v.targets.length} numbered structures`}
          >
            <defs>
              <clipPath id="micro-label-clip">
                <circle cx={0} cy={0} r={VIEW_R} />
              </clipPath>
            </defs>
            <g clipPath="url(#micro-label-clip)">
              <g transform={`scale(${zoomed.z}) translate(${-zoomed.c.x} ${-zoomed.c.y})`}>
                <FieldContent {...fieldBase} scope={labelCap} graticule={false} pointer={false} />
              </g>
            </g>
            <circle cx={0} cy={0} r={VIEW_R} fill="none" stroke="#111" strokeWidth={3} />
          </LabelBoard>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">Capture a sharp ×{info.labelObjective} view to label it.</p>
        )}
        <label className="block text-[12.5px] text-muted-foreground" htmlFor="identity">
          {v.identity.question}
        </label>
        <select id="identity" className={inputClass} value={state.identity} disabled={readOnly} onChange={(e) => update((x) => ({ ...x, identity: e.target.value }), `identity:${e.target.value}`)}>
          <option value="">Choose…</option>
          {v.identity.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Measurement and magnification</p>
        {measureCap ? (
          <FieldView {...fieldBase} scope={measureCap} graticule={info.method === 'GRATICULE'} pointer={info.method === 'COUNT'} label={`Captured ×${info.measureObjective} view for measuring`} className="mx-auto w-full max-w-[420px]" />
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">Capture a sharp ×{info.measureObjective} view to measure from.</p>
        )}
        {v.tasks.map((t, n) => (
          <div key={t.id}>
            <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor={`ans-${t.id}`}>
              ({['i', 'ii', 'iii', 'iv'][n]}) {t.label}
            </label>
            <div className="flex gap-2">
              <Input id={`ans-${t.id}`} value={state.answers[t.id].value} onChange={(e) => setAnswer(t.id, 'value', e.target.value)} disabled={readOnly} inputMode={t.id === 'totalMag' || t.id === 'drawingMag' ? 'text' : 'decimal'} placeholder="value" className="tabular" />
              {t.id !== 'reading' && (
                <Input value={state.answers[t.id].unit} onChange={(e) => setAnswer(t.id, 'unit', e.target.value)} disabled={readOnly} placeholder={unitHint[t.unit] || 'unit (if any)'} className="w-32 shrink-0" aria-label={`Unit for ${t.label}`} />
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-5">
        <p className="mb-1 text-[12.5px] font-semibold">Biological drawing</p>
        <DrawingChecklist shown={v.drawing} value={state.drawing} onChange={(next) => update((x) => ({ ...x, drawing: next }), 'drawing')} readOnly={readOnly} />
      </section>

      <section className="mt-5 space-y-3">
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="obs">
            Three observations
          </label>
          <Textarea id="obs" value={state.written.observations} onChange={(e) => setWritten('observations', e.target.value)} disabled={readOnly} rows={3} placeholder="Shape and arrangement, structures seen, colours, what is absent…" />
        </div>
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="prec">
            Two precautions you took
          </label>
          <Textarea id="prec" value={state.written.precautions} onChange={(e) => setWritten('precautions', e.target.value)} disabled={readOnly} rows={3} />
        </div>
      </section>
    </Card>
  );
}
