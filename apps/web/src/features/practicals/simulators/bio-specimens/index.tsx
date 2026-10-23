import {
  SPECIMEN_PRACTICAL_SETS,
  SPECIMEN_SETS,
  SPECIMEN_SET_INFO,
  bioSpecimensVariant,
  emptyBioSpecimensState,
  emptySpecimenEntry,
  type BenchSpecimen,
  type BioSpecimensState,
  type BioSpecimensVariant,
  type SpecimenEntry,
} from '@aischool/shared';
import { ChevronDown, Lightbulb, Minus, Plus, Ruler, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, inputClass } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DrawingChecklist, LabelBoard } from '../bio-common';
import type { SimulatorProps } from '../types';
import { SPECIMEN_DRAWINGS } from './drawings';

type Update = (fn: (s: BioSpecimensState) => BioSpecimensState, log?: string) => void;

function Drawing({ id }: { id: string }) {
  const D = SPECIMEN_DRAWINGS[id];
  return D ? <>{D()}</> : <text x={100} y={100} textAnchor="middle" fontSize={10}>{id}</text>;
}

export default function BioSpecimensLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'bio-specimens'>) {
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const fromLesson = practicalId ? SPECIMEN_PRACTICAL_SETS[practicalId] : undefined;
  const update: Update = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  const choose = (set: (typeof SPECIMEN_SETS)[number]) => {
    const v = bioSpecimensVariant(seed, set);
    update(() => ({ ...emptyBioSpecimensState(), set, entries: v.specimens.map(() => emptySpecimenEntry()) }), `set:${set}`);
  };
  useEffect(() => {
    if (!readOnly && !ref.current.set && fromLesson) choose(fromLesson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLesson, readOnly]);
  const v = useMemo(() => (state.set ? bioSpecimensVariant(seed, state.set) : null), [seed, state.set]);

  if (!state.set || !v) {
    return (
      <Card className="p-4 sm:p-5">
        <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Choose the specimens</h3>
        <p className="mb-3 text-[13px] text-muted-foreground">{readOnly ? 'No specimens were chosen.' : 'Which set of specimens will you examine?'}</p>
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-2">
            {SPECIMEN_SETS.map((st) => (
              <Button key={st} variant="outline" className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => choose(st)}>
                {SPECIMEN_SET_INFO[st].title}
              </Button>
            ))}
          </div>
        )}
      </Card>
    );
  }
  return <Bench v={v} mode={mode} state={state} readOnly={readOnly} update={update} canChange={!fromLesson} />;
}

function Bench({ v, mode, state, readOnly, update, canChange }: { v: BioSpecimensVariant; mode: string; state: BioSpecimensState; readOnly: boolean; update: Update; canChange: boolean }) {
  const [brief, setBrief] = useState(true);
  const [sel, setSel] = useState(0);
  const [lens, setLens] = useState(false);
  const sp = v.specimens;
  const cur = sp[sel]!;
  const entry = (i: number): SpecimenEntry => state.entries[i] ?? emptySpecimenEntry();
  const setEntry = (i: number, patch: Partial<SpecimenEntry>, log?: string) =>
    update((s) => {
      const entries = sp.map((_, k) => s.entries[k] ?? emptySpecimenEntry());
      entries[i] = { ...entries[i]!, ...patch };
      return { ...s, entries };
    }, log);
  const [a, b] = v.compare.map((i) => sp[i]!);
  const m = sp[v.measured]!;
  const hint = (() => {
    if (!state.examined.length) return 'Click a specimen, then examine it with the hand lens.';
    const i = sp.findIndex((_, k) => !entry(k).name.trim() || !entry(k).classification || !entry(k).features.trim());
    if (i >= 0) return `Specimen ${sp[i]!.letter}: name it, classify it, label it and state what you observe.`;
    if (!state.measure.length.value) return `Measure specimen ${m.letter} with the ruler: line up the zero with one end.`;
    return `Compare ${a.letter} and ${b.letter}, then complete the drawing checklist.`;
  })();

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((x) => !x)} aria-expanded={brief}>
          <span className="font-display text-[15px] font-semibold tracking-tight">The task — {v.info.title}</span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed">
            <p>
              Specimens {sp.map((x) => x.letter).join(', ')} are on the bench. Examine them carefully, using the hand lens where necessary.
            </p>
            <ol className="list-[lower-alpha] space-y-0.5 pl-6">
              <li>Name each specimen and state its {v.info.classify.question.toLowerCase()}.</li>
              <li>Label the numbered parts on each drawing.</li>
              <li>State two observable features of each specimen and one function or adaptation.</li>
              <li>
                Measure the {m.def.lengthOf ?? 'length'} of specimen {m.letter}. Your drawing of {m.letter} is {v.drawingLength.toFixed(1)} cm long: calculate its magnification.
              </li>
              <li>
                State two similarities and two differences between {a.letter} and {b.letter}.
              </li>
            </ol>
            {canChange && !readOnly && (
              <Button size="sm" variant="ghost" onClick={() => update(() => emptyBioSpecimensState(), 'change-set')}>
                Choose different specimens
              </Button>
            )}
          </div>
        )}
      </Card>

      {!readOnly && mode === 'LAB' && (
        <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {hint}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="tablist" aria-label="Specimens">
        {sp.map((x, i) => {
          const done = !!entry(i).name.trim() && !!entry(i).classification;
          return (
            <button
              key={x.letter}
              type="button"
              role="tab"
              aria-selected={sel === i}
              onClick={() => setSel(i)}
              className={cn('rounded-xl border bg-card p-1.5 text-left transition-colors', sel === i ? 'border-brand ring-2 ring-brand/20' : 'border-border hover:border-border-strong')}
            >
              <svg viewBox="0 0 200 200" className="aspect-square w-full" aria-hidden>
                <Drawing id={x.id} />
              </svg>
              <span className="flex items-center justify-between px-1 text-[12.5px] font-semibold">
                {x.letter}
                {done && <span className="text-[11px] font-normal text-success">recorded</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-[15px] font-semibold tracking-tight">Specimen {cur.letter}</h3>
            <Button
              size="sm"
              variant={lens ? 'brand' : 'outline'}
              aria-pressed={lens}
              onClick={() => {
                setLens((l) => !l);
                if (!state.examined.includes(cur.letter)) update((s) => ({ ...s, examined: [...s.examined, cur.letter].slice(0, 5) }), `lens:${cur.letter}`);
              }}
            >
              <Search /> Hand lens
            </Button>
          </div>
          {lens && (
            <div className="mb-3 max-h-[360px] overflow-auto rounded-xl border border-border bg-card" aria-label={`Specimen ${cur.letter} under the hand lens (scroll to look around)`}>
              <svg viewBox="0 0 200 200" className="w-[260%] max-w-none sm:w-[200%]" aria-hidden>
                <Drawing id={cur.id} />
              </svg>
            </div>
          )}
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
        </Card>

        <Card className="p-4 sm:p-5">
          <SpecimenForm v={v} s={cur} i={sel} entry={entry(sel)} readOnly={readOnly} setEntry={setEntry} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <h3 className="mb-2 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Ruler className="size-4 text-muted-foreground" aria-hidden /> Measuring specimen {m.letter}
          </h3>
          <MeasureBench v={v} s={m} readOnly={readOnly} />
          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor="len">
                (i) {m.def.lengthOf ? `${m.def.lengthOf[0]!.toUpperCase()}${m.def.lengthOf.slice(1)}` : 'Length'} of specimen {m.letter}
              </label>
              <div className="flex gap-2">
                <Input id="len" value={state.measure.length.value} disabled={readOnly} inputMode="decimal" placeholder="value" className="tabular" onChange={(e) => update((s) => ({ ...s, measure: { ...s.measure, length: { ...s.measure.length, value: e.target.value.slice(0, 40) } } }))} />
                <Input value={state.measure.length.unit} disabled={readOnly} placeholder="cm or mm" className="w-28 shrink-0" aria-label="Unit of the length" onChange={(e) => update((s) => ({ ...s, measure: { ...s.measure, length: { ...s.measure.length, unit: e.target.value.slice(0, 40) } } }))} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor="mag">
                (ii) Magnification of your drawing ({v.drawingLength.toFixed(1)} cm long)
              </label>
              <div className="flex gap-2">
                <Input id="mag" value={state.measure.magnification.value} disabled={readOnly} placeholder="value" className="tabular" onChange={(e) => update((s) => ({ ...s, measure: { ...s.measure, magnification: { ...s.measure.magnification, value: e.target.value.slice(0, 40) } } }))} />
                <Input value={state.measure.magnification.unit} disabled={readOnly} placeholder="unit (if any)" className="w-28 shrink-0" aria-label="Unit of the magnification" onChange={(e) => update((s) => ({ ...s, measure: { ...s.measure, magnification: { ...s.measure.magnification, unit: e.target.value.slice(0, 40) } } }))} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <h3 className="mb-2 font-display text-[15px] font-semibold tracking-tight">
            Comparing {a.letter} and {b.letter}
          </h3>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {[a, b].map((x) => (
              <div key={x.letter} className="rounded-lg border border-border p-1">
                <svg viewBox="0 0 200 200" className="aspect-square w-full" aria-hidden>
                  <Drawing id={x.id} />
                </svg>
                <p className="text-center text-[12px] font-semibold">{x.letter}</p>
              </div>
            ))}
          </div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="sim">
            Two similarities
          </label>
          <Textarea id="sim" rows={3} value={state.compare.similarities} disabled={readOnly} onChange={(e) => update((s) => ({ ...s, compare: { ...s.compare, similarities: e.target.value.slice(0, 1500) } }))} />
          <label className="mb-1 mt-3 block text-[12.5px] font-semibold" htmlFor="dif">
            Two differences ({a.letter} … whereas {b.letter} …)
          </label>
          <Textarea id="dif" rows={3} value={state.compare.differences} disabled={readOnly} onChange={(e) => update((s) => ({ ...s, compare: { ...s.compare, differences: e.target.value.slice(0, 1500) } }))} />
          <div className="mt-5">
            <p className="mb-1 text-[12.5px] font-semibold">Biological drawing</p>
            <DrawingChecklist shown={v.drawing} value={state.drawing} onChange={(next) => update((s) => ({ ...s, drawing: next }), 'drawing')} readOnly={readOnly} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function SpecimenForm({ v, s, i, entry, readOnly, setEntry }: { v: BioSpecimensVariant; s: BenchSpecimen; i: number; entry: SpecimenEntry; readOnly: boolean; setEntry: (i: number, patch: Partial<SpecimenEntry>, log?: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor={`name-${s.letter}`}>
          Name of specimen {s.letter}
        </label>
        <Input id={`name-${s.letter}`} value={entry.name} disabled={readOnly} onChange={(e) => setEntry(i, { name: e.target.value.slice(0, 80) })} placeholder="e.g. its common name" />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor={`cls-${s.letter}`}>
          {v.info.classify.question}
        </label>
        <select id={`cls-${s.letter}`} className={inputClass} value={entry.classification} disabled={readOnly} onChange={(e) => setEntry(i, { classification: e.target.value }, `class:${s.letter}`)}>
          <option value="">Choose…</option>
          {v.info.classify.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor={`feat-${s.letter}`}>
          Two observable features
        </label>
        <Textarea id={`feat-${s.letter}`} rows={3} value={entry.features} disabled={readOnly} onChange={(e) => setEntry(i, { features: e.target.value.slice(0, 1000) })} placeholder="What you can see: shape, parts, colour, texture…" />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor={`fn-${s.letter}`}>
          One function or adaptation
        </label>
        <Textarea id={`fn-${s.letter}`} rows={2} value={entry.functions} disabled={readOnly} onChange={(e) => setEntry(i, { functions: e.target.value.slice(0, 1000) })} placeholder="Link it to a structure" />
      </div>
    </div>
  );
}

/** The measured specimen at its real size on screen against a ruler the student slides into place. */
function MeasureBench({ v, s, readOnly }: { v: BioSpecimensVariant; s: BenchSpecimen; readOnly: boolean }) {
  const vertical = !!s.def.vertical;
  const perCm = 160 / v.trueLength;
  const cm = Math.ceil(v.trueLength * 1.25 + 0.5);
  const len = cm * perCm;
  const [off, setOff] = useState(-len * 0.12 + 6);
  const drag = useRef<{ start: number; off: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const toUnits = (e: ReactPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return vertical ? ((e.clientY - r.top) / r.height) * 240 : ((e.clientX - r.left) / r.width) * 240;
  };
  const mm = perCm / 10;
  const step = mm >= 2.2 ? 1 : mm >= 1.1 ? 2 : 5; // tick spacing, mm
  const ticks: { at: number; kind: 0 | 1 | 2; label?: string }[] = [];
  for (let t = 0; t <= cm * 10; t += step) ticks.push({ at: t * mm, kind: t % 10 === 0 ? 2 : t % 5 === 0 ? 1 : 0, label: t % 10 === 0 && (cm < 16 || (t / 10) % 2 === 0) ? String(t / 10) : undefined });
  const nudge = (d: number) => setOff((o) => Math.max(-len + 10, Math.min(220, o + d)));
  const rulerStart = 20 + off;
  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={vertical ? '-20 -20 240 240' : '-20 -20 240 240'}
        className="w-full touch-none select-none rounded-xl border border-border bg-[#fbfaf6]"
        role="img"
        aria-label={`Specimen ${s.letter} with a ruler (centimetres). Drag the ruler, or use the buttons, to line its zero up with one end.`}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const d = toUnits(e) - drag.current.start;
          setOff(Math.max(-len + 10, Math.min(220, drag.current.off + d)));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <g transform={vertical ? 'translate(-16 0)' : 'translate(0 -18)'}>
          <Drawing id={s.id} />
        </g>
        <g
          transform={vertical ? `translate(196 ${rulerStart}) rotate(90)` : `translate(${rulerStart} 186)`}
          className={readOnly ? undefined : 'cursor-grab'}
          onPointerDown={(e) => {
            if (readOnly) return;
            (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture?.(e.pointerId);
            drag.current = { start: toUnits(e), off };
          }}
        >
          <rect x={-6} y={-2} width={len + 12} height={22} rx={2} fill="#f4e7b5" stroke="#8a7a4a" strokeWidth={0.8} opacity={0.92} />
          {ticks.map((t) => (
            <g key={t.at}>
              <line x1={t.at} x2={t.at} y1={-2} y2={t.kind === 2 ? 9 : t.kind === 1 ? 6 : 3.5} stroke="#3b3a36" strokeWidth={t.kind === 2 ? 0.7 : 0.4} />
              {t.label && (
                <text x={t.at} y={17} fontSize={7} textAnchor="middle" fill="#3b3a36">
                  {t.label}
                </text>
              )}
            </g>
          ))}
          <text x={len + 2} y={17} fontSize={6} fill="#6b6650" textAnchor="end">
            cm
          </text>
        </g>
      </svg>
      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-muted-foreground">Slide the ruler</span>
          <Button size="icon-sm" variant="outline" aria-label="Move the ruler back" onClick={() => nudge(-perCm / 10)}>
            <Minus />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Move the ruler on" onClick={() => nudge(perCm / 10)}>
            <Plus />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => nudge(-perCm)}>
            −1 cm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => nudge(perCm)}>
            +1 cm
          </Button>
        </div>
      )}
    </div>
  );
}
