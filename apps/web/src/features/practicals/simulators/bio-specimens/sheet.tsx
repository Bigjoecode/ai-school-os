import type { BenchSpecimen, BioSpecimensVariant, SpecimenEntry } from '@aischool/shared';
import { Minus, Plus } from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input, inputClass } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SPECIMEN_DRAWINGS } from './drawings';

/** Pieces of the specimen answer sheet shared by the 2D and the 3D lab: a specimen's drawing, its record form and the ruler bench. */

export function Drawing({ id }: { id: string }) {
  const D = SPECIMEN_DRAWINGS[id];
  return D ? <>{D()}</> : <text x={100} y={100} textAnchor="middle" fontSize={10}>{id}</text>;
}


export function SpecimenForm({ v, s, i, entry, readOnly, setEntry }: { v: BioSpecimensVariant; s: BenchSpecimen; i: number; entry: SpecimenEntry; readOnly: boolean; setEntry: (i: number, patch: Partial<SpecimenEntry>, log?: string) => void }) {
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
export function MeasureBench({ v, s, readOnly, initialOffset }: { v: BioSpecimensVariant; s: BenchSpecimen; readOnly: boolean; /** Where the ruler starts (0: its zero on the specimen's end); by default a little off. */ initialOffset?: number }) {
  const vertical = !!s.def.vertical;
  const perCm = 160 / v.trueLength;
  const cm = Math.ceil(v.trueLength * 1.25 + 0.5);
  const len = cm * perCm;
  const [off, setOff] = useState(initialOffset ?? -len * 0.12 + 6);
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
