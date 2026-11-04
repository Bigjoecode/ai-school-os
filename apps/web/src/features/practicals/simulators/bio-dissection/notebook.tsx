import {
  COLONY_KINDS,
  COLONY_KIND_LABEL,
  EOSIN_ARRANGE,
  EOSIN_ARRANGE_LABEL,
  EOSIN_CLAIMS,
  EOSIN_CLAIM_LABEL,
  EOSIN_DRAWING_TARGETS,
  EOSIN_SEEN,
  EOSIN_SEEN_LABEL,
  EOSIN_SHADES,
  EOSIN_SHADE_LABEL,
  EOSIN_TISSUES,
  EOSIN_TISSUE_LABEL,
  MICRO_CLAIMS,
  MICRO_CLAIM_LABEL,
  MOULD_DRAWING_TARGETS,
  MOULD_GROWTH,
  MOULD_GROWTH_LABEL,
  PLATES,
  PLATE_LABEL,
  RAT_CLAIMS,
  RAT_CLAIM_LABEL,
  RAT_DRAWING_TARGETS,
  RAT_STYLES,
  RAT_STYLE_LABEL,
  SLICES,
  type BioDissectionState,
  type BioDissectionVariant,
  type ColonyKind,
  type DissectTask,
  type EosinArrange,
  type EosinClaim,
  type EosinSeen,
  type EosinShade,
  type EosinTissue,
  type MicroClaim,
  type MouldGrowth,
  type RatClaim,
  type RatStyle,
} from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DrawingChecklist, LabelBoard } from '../bio-common';
import type { DissectUpdate as Update } from './actions';
import { MouldDrawing, RatDrawing, StemDrawing } from './visuals';

/**
 * The notebook of each task — the dye heights, sections, rate, drawing and
 * conclusions; the rat's lengths, ratio and labelled drawing; the colony
 * counts, % reduction, bread and Rhizopus drawing — with the written answers:
 * the same record in the 2D lab and in the 3D lab's notebook (`book` styling).
 */

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60 text-left';
const box = (book?: boolean, className?: string) => cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className);
const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">{children}</h3>;
const H4 = ({ children }: { children: React.ReactNode }) => <h4 className="mb-1 mt-4 text-[13px] font-semibold">{children}</h4>;
const Hint = ({ children }: { children: React.ReactNode }) => <p className="mb-2 text-[12px] text-muted-foreground">{children}</p>;
function Cell({ id, value, onChange, readOnly, label, w = 'w-[4.6rem]' }: { id: string; value: string; onChange: (v: string) => void; readOnly: boolean; label: string; w?: string }) {
  return <Input id={id} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value.slice(0, 40))} aria-label={label} inputMode="decimal" className={cn('h-8 px-1.5 text-center font-mono text-[13px]', w)} />;
}
function Chips<C extends string>({ all, label, value, onChange, readOnly, name }: { all: readonly C[]; label: Record<C, string>; value: C[]; onChange: (next: C[]) => void; readOnly: boolean; name: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={name}>
      {all.map((c) => {
        const on = value.includes(c);
        return (
          <button key={c} type="button" aria-pressed={on} disabled={readOnly} onClick={() => onChange(on ? value.filter((x) => x !== c) : [...value, c])} className={cn(CHIP, on ? 'border-success bg-success/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
            {label[c]}
            {on ? ' ✓' : ''}
          </button>
        );
      })}
    </div>
  );
}
function Pick<C extends string>({ all, label, value, onChange, readOnly, name }: { all: readonly C[]; label: Record<C, string>; value: C | null | ''; onChange: (c: C) => void; readOnly: boolean; name: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={name}>
      {all.map((c) => (
        <button key={c} type="button" aria-pressed={value === c} disabled={readOnly} onClick={() => onChange(c)} className={cn(CHIP, value === c ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
          {label[c]}
        </button>
      ))}
    </div>
  );
}
const Select = ({ id, value, options, onChange, readOnly, label }: { id: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void; readOnly: boolean; label: string }) => (
  <select id={id} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-8 max-w-full rounded-md border border-input bg-card px-1 text-[12.5px]">
    <option value="">—</option>
    {options.map((o) => (
      <option key={o.v} value={o.v}>
        {o.l}
      </option>
    ))}
  </select>
);
const TH = 'border-b border-border px-1.5 py-1 text-left text-[12px] font-semibold';
const TD = 'border-b border-border/60 px-1.5 py-1 text-[12.5px]';

// ------------------------------------------------------------------ eosin

export function EosinNotebook({ v, state, readOnly, update, book, className }: { v: BioDissectionVariant; state: BioDissectionState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.eosin;
  const set = (patch: Partial<BioDissectionState['eosin']>, log?: string) => update((s) => ({ ...s, eosin: { ...s.eosin, ...patch } }), log);
  return (
    <Card className={box(book, className)}>
      <H3>Height of the dye in the stem</H3>
      <Hint>Measured with the ruler from the dye surface to the top of the red line, to 0.1 cm.</Hint>
      {w.reads.length ? (
        <table className="w-full max-w-sm">
          <thead>
            <tr>
              <th className={TH}>Time (min)</th>
              <th className={TH}>Height (cm)</th>
            </tr>
          </thead>
          <tbody>
            {w.reads.map((t, n) => (
              <tr key={n}>
                <td className={TD}>{t}</td>
                <td className={TD}>
                  <Cell id={`eosin-h-${n}`} value={w.rows[n] ?? ''} readOnly={readOnly} label={`Height at ${t} min`} onChange={(x) => set({ rows: w.rows.map((r, j) => (j === n ? x : r)) })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">No readings yet.</p>
      )}
      <H4>Rate of rise (from your first and last readings)</H4>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <Cell id="eosin-rate" value={w.rate} readOnly={readOnly} label="Rate in cm per minute" onChange={(x) => set({ rate: x })} /> cm/min
        <Cell id="eosin-rateh" value={w.rateH} readOnly={readOnly} label="Rate in cm per hour" onChange={(x) => set({ rateH: x })} /> cm/h
      </div>
      <H4>Leaf veins when you looked{w.leafLook !== null ? ` (${w.leafLook} min)` : ''}</H4>
      <Pick all={['RED', 'GREEN'] as const} label={{ RED: 'Red', GREEN: 'Still green' }} value={w.veins} readOnly={readOnly} name="Leaf veins" onChange={(c) => set({ veins: c }, `veins:${c}`)} />
      <H4>Sections</H4>
      {w.sections.length ? (
        <div className="space-y-1.5">
          {w.sections.map((x, n) => (
            <div key={n} className="flex flex-wrap items-center gap-2">
              <span className="w-44 text-[12.5px]">
                {n + 1}. {x.kind} at {x.at} cm{x.thin ? '' : ' (thick)'}
              </span>
              <Pick all={EOSIN_SEEN} label={EOSIN_SEEN_LABEL} value={w.secRows[n] ?? ''} readOnly={readOnly} name={`Section ${n + 1}`} onChange={(c: EosinSeen) => set({ secRows: w.sections.map((_, j) => (j === n ? c : (w.secRows[j] ?? ''))) })} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">No sections cut yet.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
        <label htmlFor="eosin-tissue" className="font-semibold">
          The stained tissue:
        </label>
        <Select id="eosin-tissue" value={w.tissue} readOnly={readOnly} label="Stained tissue" options={EOSIN_TISSUES.map((t) => ({ v: t, l: EOSIN_TISSUE_LABEL[t] }))} onChange={(x) => set({ tissue: x as EosinTissue | '' })} />
      </div>
      <H4>The vascular bundles are arranged</H4>
      <Pick all={EOSIN_ARRANGE} label={EOSIN_ARRANGE_LABEL} value={w.arrange} readOnly={readOnly} name="Arrangement" onChange={(c: EosinArrange) => set({ arrange: c })} />
      <H4>Drawing: transverse section of the stem (low power)</H4>
      <Hint>Label each part. Then choose what you shade to show the stained tissue.</Hint>
      <LabelBoard box={{ x: 0, y: 0, w: 200, h: 200 }} targets={EOSIN_DRAWING_TARGETS} options={v.eosinOptions} value={w.labels} onChange={(next) => set({ labels: next }, 'labels')} readOnly={readOnly} label="Transverse section of a balsam stem">
        <StemDrawing shade={w.shade} />
      </LabelBoard>
      <div className="mt-2">
        <Pick all={EOSIN_SHADES} label={EOSIN_SHADE_LABEL} value={w.shade} readOnly={readOnly} name="Shading" onChange={(c: EosinShade) => set({ shade: c }, `shade:${c}`)} />
      </div>
      <H4>Drawing rules</H4>
      <DrawingChecklist shown={v.drawing} value={w.drawing} onChange={(next) => set({ drawing: next }, 'drawing')} readOnly={readOnly} />
      <H4>Conclusions</H4>
      <Chips all={EOSIN_CLAIMS} label={EOSIN_CLAIM_LABEL} value={w.claims} readOnly={readOnly} name="Conclusions" onChange={(next: EosinClaim[]) => set({ claims: next }, 'claims')} />
    </Card>
  );
}

// ------------------------------------------------------------------ rat

export function RatNotebook({ v, state, readOnly, update, book, className }: { v: BioDissectionVariant; state: BioDissectionState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.rat;
  const set = (patch: Partial<BioDissectionState['rat']>, log?: string) => update((s) => ({ ...s, rat: { ...s.rat, ...patch } }), log);
  return (
    <Card className={box(book, className)}>
      <H3>Measurements</H3>
      <Hint>As the ruler showed them, to 0.5 cm.</Hint>
      <div className="grid max-w-sm grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5 text-[12.5px]">
        <label htmlFor="rat-body">Body length, snout to anus (cm)</label>
        <Cell id="rat-body" value={w.body} readOnly={readOnly} label="Body length" onChange={(x) => set({ body: x })} />
        <label htmlFor="rat-si">Small intestine (cm)</label>
        <Cell id="rat-si" value={w.si} readOnly={readOnly} label="Small intestine" onChange={(x) => set({ si: x })} />
        <label htmlFor="rat-li">Large intestine (cm)</label>
        <Cell id="rat-li" value={w.li} readOnly={readOnly} label="Large intestine" onChange={(x) => set({ li: x })} />
        <label htmlFor="rat-ratio">Gut : body ratio (… : 1)</label>
        <Cell id="rat-ratio" value={w.ratio} readOnly={readOnly} label="Gut to body ratio" onChange={(x) => set({ ratio: x })} />
      </div>
      <H4>Is there a gall bladder?</H4>
      <Pick all={['ABSENT', 'PRESENT'] as const} label={{ ABSENT: 'No — absent in the rat', PRESENT: 'Yes, beside the liver' }} value={w.gall} readOnly={readOnly} name="Gall bladder" onChange={(c) => set({ gall: c })} />
      <H4>Drawing of the dissection</H4>
      <Hint>Label each organ. Draw what you displayed.</Hint>
      <LabelBoard box={{ x: 0, y: 0, w: 200, h: 240 }} targets={RAT_DRAWING_TARGETS} options={v.ratOptions} value={w.labels} onChange={(next) => set({ labels: next }, 'labels')} readOnly={readOnly} label="The alimentary canal of the rat as displayed">
        <RatDrawing />
      </LabelBoard>
      <div className="mt-2">
        <Pick all={RAT_STYLES} label={RAT_STYLE_LABEL} value={w.style} readOnly={readOnly} name="What the drawing shows" onChange={(c: RatStyle) => set({ style: c }, `style:${c}`)} />
      </div>
      <H4>Drawing rules</H4>
      <DrawingChecklist shown={v.drawing} value={w.drawing} onChange={(next) => set({ drawing: next }, 'drawing')} readOnly={readOnly} />
      <H4>Conclusions</H4>
      <Chips all={RAT_CLAIMS} label={RAT_CLAIM_LABEL} value={w.claims} readOnly={readOnly} name="Conclusions" onChange={(next: RatClaim[]) => set({ claims: next }, 'claims')} />
    </Card>
  );
}

// ------------------------------------------------------------------ microorganisms

export function MicroNotebook({ v, state, readOnly, update, book, className }: { v: BioDissectionVariant; state: BioDissectionState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.micro;
  const set = (patch: Partial<BioDissectionState['micro']>, log?: string) => update((s) => ({ ...s, micro: { ...s.micro, ...patch } }), log);
  return (
    <Card className={box(book, className)}>
      <H3>Colonies after incubation{w.countAt !== null && w.incAt !== null ? ` (${w.countAt - w.incAt} days)` : ''}</H3>
      <Hint>Counted through the lid, quarter by quarter. Never open the plates.</Hint>
      <table className="w-full">
        <thead>
          <tr>
            <th className={TH}>Plate</th>
            <th className={TH}>Colonies</th>
            <th className={TH}>Appearance</th>
          </tr>
        </thead>
        <tbody>
          {PLATES.map((p, k) => (
            <tr key={p}>
              <td className={TD}>{PLATE_LABEL[p]}</td>
              <td className={TD}>
                <Cell id={`micro-n-${k}`} value={w.counts[k] ?? ''} readOnly={readOnly} label={`Colonies on the ${PLATE_LABEL[p]} plate`} onChange={(x) => set({ counts: w.counts.map((c, j) => (j === k ? x : c)) })} w="w-[3.8rem]" />
              </td>
              <td className={TD}>
                <Select id={`micro-k-${k}`} value={w.kinds[k] ?? ''} readOnly={readOnly} label={`Colonies on the ${PLATE_LABEL[p]} plate look`} options={COLONY_KINDS.map((c) => ({ v: c, l: COLONY_KIND_LABEL[c] }))} onChange={(x) => set({ kinds: w.kinds.map((c, j) => (j === k ? (x as ColonyKind | '') : c)) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        <label htmlFor="micro-red">% reduction from washing =</label>
        <Cell id="micro-red" value={w.reduction} readOnly={readOnly} label="Percentage reduction" onChange={(x) => set({ reduction: x })} /> %
      </div>
      <H4>Bread{w.lensAt !== null && w.breadAt !== null ? ` after ${w.lensAt - w.breadAt} days` : ''}</H4>
      <div className="space-y-1.5">
        {SLICES.map((n, k) => {
          const sl = w.slices[k]!;
          return (
            <div key={n} className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-[12.5px]">
                Slice {n}: {sl.moist === null ? '—' : sl.moist ? 'moist' : 'dry'}, {sl.place === 'COLD' ? 'refrigerator' : sl.place === 'WARM' ? 'warm, dark' : '—'}
              </span>
              <Pick all={MOULD_GROWTH} label={MOULD_GROWTH_LABEL} value={w.bread[k] ?? ''} readOnly={readOnly} name={`Slice ${n}`} onChange={(c: MouldGrowth) => set({ bread: w.bread.map((b, j) => (j === k ? c : b)) })} />
            </div>
          );
        })}
      </div>
      <H4>Drawing: Rhizopus (bread mould), from the slide</H4>
      <LabelBoard box={{ x: 0, y: 0, w: 200, h: 160 }} targets={MOULD_DRAWING_TARGETS} options={v.mouldOptions} value={w.labels} onChange={(next) => set({ labels: next }, 'labels')} readOnly={readOnly} label="Rhizopus">
        <MouldDrawing />
      </LabelBoard>
      <H4>Drawing rules</H4>
      <DrawingChecklist shown={v.drawing} value={w.drawing} onChange={(next) => set({ drawing: next }, 'drawing')} readOnly={readOnly} />
      <H4>Conclusions</H4>
      <Chips all={MICRO_CLAIMS} label={MICRO_CLAIM_LABEL} value={w.claims} readOnly={readOnly} name="Conclusions" onChange={(next: MicroClaim[]) => set({ claims: next }, 'claims')} />
    </Card>
  );
}

const PREC_PH: Record<DissectTask, string> = { EOSIN: 'e.g. I washed the roots gently…', RAT: 'e.g. I lifted the skin with forceps before cutting…', MICROBE: 'e.g. I labelled the plates on the base…' };
const EXPLAIN_Q: Record<DissectTask, string> = { EOSIN: 'Explain why only the xylem was stained, and how the water moves up', RAT: 'Explain how the rat’s gut suits its diet (functions of two organs)', MICROBE: 'Explain your results and what they show about hygiene and storing food' };
export function Written({ state, readOnly, update, className }: { state: BioDissectionState; readOnly: boolean; update: Update; className?: string }) {
  const task = state.task ?? 'EOSIN';
  const set = (k: 'precautions' | 'explain', val: string) => update((s) => ({ ...s, written: { ...s.written, [k]: val.slice(0, 2000) } }));
  return (
    <Card className={cn('space-y-3 p-4 sm:p-5', className)}>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="dissect-prec">
          Two precautions you took
        </label>
        <Textarea id="dissect-prec" rows={3} value={state.written.precautions} disabled={readOnly} onChange={(e) => set('precautions', e.target.value)} placeholder={PREC_PH[task]} />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="dissect-explain">
          {EXPLAIN_Q[task]}
        </label>
        <Textarea id="dissect-explain" rows={3} value={state.written.explain} disabled={readOnly} onChange={(e) => set('explain', e.target.value)} />
      </div>
    </Card>
  );
}
