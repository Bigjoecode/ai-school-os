import { emptySpecimenEntry, type BioSpecimensState, type BioSpecimensVariant, type SpecimenEntry } from '@aischool/shared';
import { ArrowLeft, ChevronLeft, ChevronRight, NotebookPen, Ruler, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DrawingChecklist, LabelBoard } from '../../bio-common';
import { Drawing, MeasureBench, SpecimenForm } from '../sheet';
import { useBench } from './scene-state';

/**
 * The specimen answer sheet in the 3D lab (the 2D lab's pieces: the label
 * board on each drawing, the record form, the measurement, the comparison and
 * the drawing checklist), and the two close-up views at the bench: the hand
 * lens over a specimen and the ruler against the measured one.
 */

export type SpecUpdate = (fn: (s: BioSpecimensState) => BioSpecimensState, log?: string) => void;

export function setEntryOf(v: BioSpecimensVariant, update: SpecUpdate) {
  return (i: number, patch: Partial<SpecimenEntry>, log?: string) =>
    update((s) => {
      const entries = v.specimens.map((_, k) => s.entries[k] ?? emptySpecimenEntry());
      entries[i] = { ...entries[i]!, ...patch };
      return { ...s, entries };
    }, log);
}

export function MeasureInputs({ v, state, readOnly, update }: { v: BioSpecimensVariant; state: BioSpecimensState; readOnly: boolean; update: SpecUpdate }) {
  const m = v.specimens[v.measured]!;
  const set = (k: 'length' | 'magnification', f: 'value' | 'unit', x: string) => update((s) => ({ ...s, measure: { ...s.measure, [k]: { ...s.measure[k], [f]: x.slice(0, 40) } } }));
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor="len3d">
          (i) {m.def.lengthOf ? `${m.def.lengthOf[0]!.toUpperCase()}${m.def.lengthOf.slice(1)}` : 'Length'} of specimen {m.letter}
        </label>
        <div className="flex gap-2">
          <Input id="len3d" value={state.measure.length.value} disabled={readOnly} inputMode="decimal" placeholder="value" className="tabular" onChange={(e) => set('length', 'value', e.target.value)} />
          <Input value={state.measure.length.unit} disabled={readOnly} placeholder="cm or mm" className="w-28 shrink-0" aria-label="Unit of the length" onChange={(e) => set('length', 'unit', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor="mag3d">
          (ii) Magnification of your drawing ({v.drawingLength.toFixed(1)} cm long)
        </label>
        <div className="flex gap-2">
          <Input id="mag3d" value={state.measure.magnification.value} disabled={readOnly} placeholder="value" className="tabular" onChange={(e) => set('magnification', 'value', e.target.value)} />
          <Input value={state.measure.magnification.unit} disabled={readOnly} placeholder="unit (if any)" className="w-28 shrink-0" aria-label="Unit of the magnification" onChange={(e) => set('magnification', 'unit', e.target.value)} />
        </div>
      </div>
    </div>
  );
}

/** The whole answer sheet (the notebook panel). */
export function AnswerSheet({ v, state, readOnly, update, only }: { v: BioSpecimensVariant; state: BioSpecimensState; readOnly: boolean; update: SpecUpdate; only?: number }) {
  const tab = useBench((b) => b.tab);
  const setTab = (t: number) => useBench.setState({ tab: t });
  const sel = only ?? Math.min(tab, v.specimens.length - 1);
  const sp = v.specimens;
  const cur = sp[sel]!;
  const entry = (i: number) => state.entries[i] ?? emptySpecimenEntry();
  const setEntry = setEntryOf(v, update);
  const [a, b] = v.compare.map((i) => sp[i]!);
  const m = sp[v.measured]!;
  return (
    <div className="space-y-4">
      {only === undefined && (
        <div className="grid grid-cols-5 gap-1.5" role="tablist" aria-label="Specimens">
          {sp.map((x, i) => {
            const done = !!entry(i).name.trim() && !!entry(i).classification;
            return (
              <button key={x.letter} type="button" role="tab" aria-selected={sel === i} onClick={() => setTab(i)} className={cn('rounded-xl border bg-card p-1 text-left transition-colors', sel === i ? 'border-brand ring-2 ring-brand/20' : 'border-border hover:border-border-strong')}>
                <svg viewBox="0 0 200 200" className="aspect-square w-full" aria-hidden>
                  <Drawing id={x.id} />
                </svg>
                <span className="flex items-center justify-between px-0.5 text-[12px] font-semibold">
                  {x.letter}
                  {done && <span className="text-[10.5px] font-normal text-success">✓</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <section>
        <p className="mb-1 text-[12.5px] font-semibold">
          Specimen {cur.letter}
          {!state.examined.includes(cur.letter) && <span className="ml-1.5 font-normal text-warning">— not yet examined with the hand lens</span>}
        </p>
        <LabelBoard
          key={cur.letter}
          box={{ x: 0, y: 0, w: 200, h: 200 }}
          targets={cur.def.parts}
          options={cur.labelOptions}
          value={cur.def.parts.map((_, k) => entry(sel).labels[k] ?? '')}
          onChange={(labels) => setEntry(sel, { labels }, `labels:${cur.letter}`)}
          readOnly={readOnly}
          label={`Drawing of specimen ${cur.letter} with ${cur.def.parts.length} numbered parts`}
        >
          <Drawing id={cur.id} />
        </LabelBoard>
        <div className="mt-3">
          <SpecimenForm v={v} s={cur} i={sel} entry={entry(sel)} readOnly={readOnly} setEntry={setEntry} />
        </div>
      </section>
      {only === undefined && (
        <>
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold">
              <Ruler className="size-3.5" aria-hidden /> Measuring specimen {m.letter}
            </p>
            <MeasureInputs v={v} state={state} readOnly={readOnly} update={update} />
          </section>
          <section>
            <p className="mb-2 text-[12.5px] font-semibold">
              Comparing {a.letter} and {b.letter}
            </p>
            <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor="sim3d">
              Two similarities
            </label>
            <Textarea id="sim3d" rows={3} value={state.compare.similarities} disabled={readOnly} onChange={(e) => update((s) => ({ ...s, compare: { ...s.compare, similarities: e.target.value.slice(0, 1500) } }))} />
            <label className="mb-1 mt-3 block text-[12.5px] text-muted-foreground" htmlFor="dif3d">
              Two differences ({a.letter} … whereas {b.letter} …)
            </label>
            <Textarea id="dif3d" rows={3} value={state.compare.differences} disabled={readOnly} onChange={(e) => update((s) => ({ ...s, compare: { ...s.compare, differences: e.target.value.slice(0, 1500) } }))} />
          </section>
          <section>
            <p className="mb-1 text-[12.5px] font-semibold">Biological drawing</p>
            <DrawingChecklist shown={v.drawing} value={state.drawing} onChange={(next) => update((s) => ({ ...s, drawing: next }), 'drawing')} readOnly={readOnly} />
          </section>
        </>
      )}
    </div>
  );
}

/** The hand lens over a specimen: its drawing enlarged inside the lens, dragged around to look. */
export function LensView({ v, index, onPrev, onNext, onSheet, onBack, onRuler }: { v: BioSpecimensVariant; index: number; onPrev: () => void; onNext: () => void; onSheet: () => void; onBack: () => void; onRuler?: () => void }) {
  const sp = v.specimens[index]!;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const Z = 2.6;
  const lim = (x: number) => Math.max(-100 * (1 - 1 / Z), Math.min(100 * (1 - 1 / Z), x));
  return (
    <div className="pointer-events-auto absolute inset-0 z-[8] overflow-y-auto overscroll-contain bg-black/70 p-2 pt-[6.5rem] text-white backdrop-blur-[2px] sm:p-4 sm:pt-28" role="dialog" aria-label={`Specimen ${sp.letter} under the hand lens`}>
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3">
        <div
          className="relative aspect-square w-full max-w-[min(460px,58dvh)] touch-none select-none overflow-hidden rounded-full border-[10px] border-[#2b2b2b] bg-[#fbfaf6] shadow-[0_0_0_3px_#555,0_20px_60px_rgba(0,0,0,0.6)]"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const r = e.currentTarget.getBoundingClientRect();
            setPan({ x: lim(d.px - ((e.clientX - d.x) / r.width) * (200 / Z)), y: lim(d.py - ((e.clientY - d.y) / r.height) * (200 / Z)) });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          aria-label="Drag to look around the specimen"
        >
          <svg viewBox={`${100 + pan.x - 100 / Z} ${100 + pan.y - 100 / Z} ${200 / Z} ${200 / Z}`} className="size-full" aria-hidden>
            <Drawing id={sp.id} />
          </svg>
          <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.28),transparent_40%),radial-gradient(circle,transparent_60%,rgba(0,0,0,0.25))]" />
        </div>
        <p className="text-center text-[13px] text-white/80">Specimen {sp.letter} under the hand lens (×{Z.toFixed(1)}) — drag to look around. Look at its shape, parts, colour and texture.</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          <Button size="sm" variant="outline" className="border-white/20 bg-black/45 text-white hover:bg-black/60 hover:text-white" onClick={onPrev} aria-label="Previous specimen">
            <ChevronLeft />
          </Button>
          <Button size="sm" variant="brand" onClick={onSheet}>
            <NotebookPen /> Record {sp.letter}
          </Button>
          {onRuler && (
            <Button size="sm" variant="outline" className="border-white/20 bg-black/45 text-white hover:bg-black/60 hover:text-white" onClick={onRuler}>
              <Ruler /> Measure with the ruler
            </Button>
          )}
          <Button size="sm" variant="outline" className="border-white/20 bg-black/45 text-white hover:bg-black/60 hover:text-white" onClick={onNext} aria-label="Next specimen">
            <ChevronRight />
          </Button>
          <Button size="sm" variant="outline" className="border-white/20 bg-black/45 text-white hover:bg-black/60 hover:text-white" onClick={onBack}>
            <ArrowLeft /> Back to the bench
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The ruler against the measured specimen (the 2D lab's ruler bench), with the measurement answers beside it. */
export function RulerView({ v, state, readOnly, update, onBack, onLens, aligned = false }: { v: BioSpecimensVariant; state: BioSpecimensState; readOnly: boolean; update: SpecUpdate; onBack: () => void; onLens: () => void; aligned?: boolean }) {
  const m = v.specimens[v.measured]!;
  return (
    <div className="pointer-events-auto absolute inset-0 z-[8] overflow-y-auto overscroll-contain bg-black/70 p-2 pt-[6.5rem] backdrop-blur-[2px] sm:p-4 sm:pt-28" role="dialog" aria-label={`Measuring specimen ${m.letter}`}>
      <section className="mx-auto w-full max-w-xl rounded-2xl bg-card p-3 text-card-foreground shadow-2xl sm:p-4">
        <p className="mb-2 flex items-center gap-1.5 font-display text-[15px] font-semibold">
          <Ruler className="size-4" aria-hidden /> Measuring specimen {m.letter}
        </p>
        <p className="mb-2 text-[12.5px] text-muted-foreground">Slide the ruler until its zero is level with one end, read the other end, and write the length with its unit.</p>
        <MeasureBench key={`${m.letter}-${aligned}`} v={v} s={m} readOnly={readOnly} initialOffset={aligned ? 0 : undefined} />
        <div className="mt-3">
          <MeasureInputs v={v} state={state} readOnly={readOnly} update={update} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={onLens}>
            <Search /> Hand lens
          </Button>
          <Button variant="outline" size="sm" className="ml-auto" onClick={onBack}>
            <ArrowLeft /> Back to the bench
          </Button>
        </div>
      </section>
    </div>
  );
}
