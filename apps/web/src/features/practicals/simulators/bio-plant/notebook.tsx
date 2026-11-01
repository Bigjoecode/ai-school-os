import {
  LEAF_SHORT,
  OXY_AXES,
  OXY_CLAIMS,
  OXY_CLAIM_LABEL,
  OXY_CURVES,
  OXY_CURVE_LABEL,
  POTO_CLAIMS,
  POTO_CLAIM_LABEL,
  POTO_CONDS,
  POTO_COND_SHORT,
  POTO_DIST,
  STARCH_CLAIMS,
  STARCH_CLAIM_LABEL,
  STARCH_DRAWING_TARGETS,
  emptyPotoRow,
  emptyStarchRow,
  type BioPlantState,
  type BioPlantVariant,
  type OxyClaim,
  type OxyRow,
  type PotoClaim,
  type PotoCond,
  type PotoRow,
  type StarchClaim,
} from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DrawingChecklist, LabelBoard } from '../bio-common';
import type { PlantUpdate as Update } from './actions';
import { BarChart, OxyGraph, StarchDrawing } from './visuals';

/**
 * The notebook of each task — the potometer table, bar chart and
 * conclusions; the bubble-count table, graph, compensation point and splint;
 * the starch observations and inferences, grid count and labelled drawing —
 * and the written answers: the same record in the 2D lab and in the 3D lab's
 * notebook (`book`: exercise-book styling).
 */

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60 text-left';
const box = (book?: boolean, className?: string) => cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className);
function Cell({ id, value, onChange, readOnly, label, placeholder, w = 'w-[4.6rem]' }: { id: string; value: string; onChange: (v: string) => void; readOnly: boolean; label: string; placeholder?: string; w?: string }) {
  return <Input id={id} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value.slice(0, 40))} aria-label={label} placeholder={placeholder} inputMode="decimal" className={cn('h-8 px-1.5 text-center font-mono text-[13px]', w)} />;
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

// ------------------------------------------------------------------ potometer

export function PotoNotebook({ v, state, readOnly, update, book, className }: { v: BioPlantVariant; state: BioPlantState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.poto;
  const used = POTO_CONDS.filter((c) => w.runs.some((r) => r.cond === c));
  const setRow = (c: PotoCond, patch: Partial<PotoRow>) => update((s) => ({ ...s, poto: { ...s.poto, rows: s.poto.rows.map((r, k) => (POTO_CONDS[k] === c ? { ...(r ?? emptyPotoRow()), ...patch } : r)) } }));
  const cols: { k: keyof PotoRow; h: string; ph: string }[] = [
    { k: 't1', h: 't₁ / s', ph: '' },
    { k: 't2', h: 't₂ / s', ph: '' },
    { k: 't3', h: 't₃ / s', ph: '' },
    { k: 'mean', h: 'Mean / s', ph: '' },
    { k: 'rate', h: 'Rate / mm min⁻¹', ph: '' },
    { k: 'vol', h: 'Volume / mm³ min⁻¹', ph: '' },
  ];
  const rates = Object.fromEntries(POTO_CONDS.map((c, k) => [c, Number(w.rows[k]?.rate)]).filter(([, r]) => w.rows.length && Number.isFinite(r as number) && (r as number) > 0)) as Partial<Record<PotoCond, number>>;
  return (
    <Card className={box(book, className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Table of results</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Time for the bubble to move {POTO_DIST} mm. Rate = {POTO_DIST} ÷ (mean time ÷ 60) mm/min. Volume = rate × πr² (r = {v.poto.r} mm).
      </p>
      {used.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">A row appears for each condition once you have timed the bubble in it.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-1 font-medium">Condition</th>
                {cols.map((c) => (
                  <th key={c.k} className="pb-1 pr-1 font-medium">
                    {c.h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {used.map((c) => {
                const r = w.rows[POTO_CONDS.indexOf(c)] ?? emptyPotoRow();
                return (
                  <tr key={c} className="border-t border-border align-middle">
                    <td className="py-1 pr-1">{POTO_COND_SHORT[c]}</td>
                    {cols.map((col) => (
                      <td key={col.k} className="py-1 pr-1">
                        <Cell id={`poto-${col.k}-${c}`} value={r[col.k]} onChange={(x) => setRow(c, { [col.k]: x })} readOnly={readOnly} label={`${col.h}, ${POTO_COND_SHORT[c]}`} placeholder={col.ph} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <h4 className="mb-1 mt-4 text-[13px] font-semibold">Bar chart: rate of water uptake</h4>
      <p className="mb-2 text-[12px] text-muted-foreground">Plot a bar for each condition from your rate column.</p>
      <div className="mb-2 flex flex-wrap gap-1">
        {used.map((c) => {
          const on = w.bars.includes(c);
          return (
            <button key={c} type="button" aria-pressed={on} disabled={readOnly || (!on && !((rates[c] ?? 0) > 0))} onClick={() => update((s) => ({ ...s, poto: { ...s.poto, bars: on ? s.poto.bars.filter((b) => b !== c) : POTO_CONDS.filter((k) => k === c || s.poto.bars.includes(k)) } }), on ? `bar-off:${c}` : `bar:${c}`)} className={cn(CHIP, on ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
              {on ? '✓ ' : '+ '}
              {POTO_COND_SHORT[c]}
            </button>
          );
        })}
      </div>
      <BarChart bars={w.bars} rates={rates} />
      <label className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold">Fastest uptake</span>
        <select value={w.fastest ?? ''} disabled={readOnly} onChange={(e) => update((s) => ({ ...s, poto: { ...s.poto, fastest: (e.target.value || null) as PotoCond | null } }))} aria-label="Condition with the fastest uptake" className="h-8 rounded-md border border-input bg-card px-1 text-[12.5px]">
          <option value="">—</option>
          {used.map((c) => (
            <option key={c} value={c}>
              {POTO_COND_SHORT[c]}
            </option>
          ))}
        </select>
      </label>
      <h4 className="mb-1 mt-4 text-[13px] font-semibold">Conclusions</h4>
      <Chips<PotoClaim> all={POTO_CLAIMS} label={POTO_CLAIM_LABEL} value={w.claims} onChange={(next) => update((s) => ({ ...s, poto: { ...s.poto, claims: next } }), 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ oxygen

export function OxyNotebook({ state, readOnly, update, book, className }: { state: BioPlantState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.oxy;
  const setRow = (d: number, patch: Partial<OxyRow>) => update((s) => ({ ...s, oxy: { ...s.oxy, rows: s.oxy.rows.map((r) => (r.d === d ? { ...r, ...patch } : r)) } }));
  const rows = [...w.rows].sort((a, b) => a.d - b.d);
  const cols: { k: keyof Omit<OxyRow, 'd'>; h: string }[] = [
    { k: 'c1', h: 'Count 1' },
    { k: 'c2', h: 'Count 2' },
    { k: 'c3', h: 'Count 3' },
    { k: 'mean', h: 'Mean / bubbles min⁻¹' },
    { k: 'li', h: 'Light intensity (10 000 ÷ d²)' },
  ];
  const points = rows
    .map((r) => ({ x: w.axis === 'DISTANCE' ? r.d : Number(r.li), y: Number(r.mean) }))
    .filter((p, i) => rows[i]!.mean.trim() !== '' && (w.axis === 'DISTANCE' || rows[i]!.li.trim() !== '') && Number.isFinite(p.x) && Number.isFinite(p.y));
  return (
    <Card className={box(book, className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Table of results</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">Bubbles counted in one minute, three times at each distance. Light intensity ∝ 1/d²: write 10 000 ÷ d² (d in cm).</p>
      {rows.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">A row appears for each lamp distance you use.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[520px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-1 font-medium">Distance / cm</th>
                {cols.map((c) => (
                  <th key={c.k} className="pb-1 pr-1 font-medium">
                    {c.h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.d} className="border-t border-border align-middle">
                  <td className="py-1 pr-1 font-mono">{r.d}</td>
                  {cols.map((col) => (
                    <td key={col.k} className="py-1 pr-1">
                      <Cell id={`oxy-${col.k}-${r.d}`} value={r[col.k]} onChange={(x) => setRow(r.d, { [col.k]: x })} readOnly={readOnly} label={`${col.h} at ${r.d} cm`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h4 className="mb-1 mt-4 text-[13px] font-semibold">Graph</h4>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span>Plot the mean against</span>
        {OXY_AXES.map((a) => (
          <button key={a} type="button" aria-pressed={w.axis === a} disabled={readOnly} onClick={() => update((s) => ({ ...s, oxy: { ...s.oxy, axis: a } }), `axis:${a}`)} className={cn(CHIP, w.axis === a ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
            {a === 'INTENSITY' ? 'light intensity' : 'distance'}
          </button>
        ))}
      </div>
      <OxyGraph points={w.axis ? points : []} axis={w.axis} curve={w.curve} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span>Line:</span>
        {OXY_CURVES.map((c) => (
          <button key={c} type="button" aria-pressed={w.curve === c} disabled={readOnly || !w.axis} onClick={() => update((s) => ({ ...s, oxy: { ...s.oxy, curve: c } }), `curve:${c}`)} className={cn(CHIP, w.curve === c ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
            {OXY_CURVE_LABEL[c]}
          </button>
        ))}
      </div>
      <label className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold">Distance at which the bubbling stopped</span>
        <Cell id="oxy-comp" value={w.compD} onChange={(x) => update((s) => ({ ...s, oxy: { ...s.oxy, compD: x } }))} readOnly={readOnly} label="Distance at which the bubbling stopped" w="w-[5rem]" />
        <span className="text-muted-foreground">cm</span>
      </label>
      <label className="mt-3 block text-[12.5px] font-semibold" htmlFor="oxy-splint">
        The glowing splint in the gas collected: observation
      </label>
      <Textarea id="oxy-splint" rows={2} value={w.splintObs} disabled={readOnly} onChange={(e) => update((s) => ({ ...s, oxy: { ...s.oxy, splintObs: e.target.value.slice(0, 600) } }))} placeholder="What the glowing splint did…" />
      <h4 className="mb-1 mt-4 text-[13px] font-semibold">Conclusions</h4>
      <Chips<OxyClaim> all={OXY_CLAIMS} label={OXY_CLAIM_LABEL} value={w.claims} onChange={(next) => update((s) => ({ ...s, oxy: { ...s.oxy, claims: next } }), 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ starch

export function StarchNotebook({ v, state, readOnly, update, book, className }: { v: BioPlantVariant; state: BioPlantState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.starch;
  const setRow = (k: number, patch: Partial<{ observation: string; claims: StarchClaim[] }>) => update((s) => ({ ...s, starch: { ...s.starch, rows: s.starch.leaves.map((_, j) => (j === k ? { ...(s.starch.rows[j] ?? emptyStarchRow()), ...patch } : (s.starch.rows[j] ?? emptyStarchRow()))) } }));
  const setGrid = (patch: Partial<BioPlantState['starch']['grid']>) => update((s) => ({ ...s, starch: { ...s.starch, grid: { ...s.starch.grid, ...patch } } }));
  const gl = w.grid.leaf !== null ? w.leaves[w.grid.leaf] : undefined;
  return (
    <Card className={box(book, className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Observations and inferences</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">For each leaf tested with iodine: what you saw (with the colours), then what it shows.</p>
      {w.leaves.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">A row appears for each leaf you pick.</p>
      ) : (
        <div className="space-y-3">
          {w.leaves.map((l, k) => {
            const r = w.rows[k] ?? emptyStarchRow();
            return (
              <div key={k} className="rounded-xl border border-border p-3">
                <p className="text-[12.5px] font-semibold">
                  {k + 1}. {LEAF_SHORT[l.kind]} <span className="font-normal text-muted-foreground">{l.iodine ? '— iodine added' : '— not tested yet'}</span>
                </p>
                <label className="mt-2 block text-[11.5px] font-medium text-muted-foreground" htmlFor={`starch-obs-${k}`}>
                  Observation
                </label>
                <Textarea id={`starch-obs-${k}`} rows={2} value={r.observation} disabled={readOnly} onChange={(e) => setRow(k, { observation: e.target.value.slice(0, 600) })} placeholder="Which parts turned blue-black and which stayed yellow-brown…" />
                <div className="mt-2">
                  <Chips<StarchClaim> all={STARCH_CLAIMS} label={STARCH_CLAIM_LABEL} value={r.claims} onChange={(next) => setRow(k, { claims: next })} readOnly={readOnly} name={`Inference: ${LEAF_SHORT[l.kind]}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <h4 className="mb-1 mt-4 text-[13px] font-semibold">The leaf on the 1 cm² grid{gl ? `: ${LEAF_SHORT[gl.kind].toLowerCase()}` : ''}</h4>
      <p className="mb-2 text-[12px] text-muted-foreground">Count every square the leaf covers more than half of, and the blue-black squares. % that made starch = blue-black ÷ all × 100.</p>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          Squares covered <Cell id="starch-total" value={w.grid.total} onChange={(x) => setGrid({ total: x })} readOnly={readOnly} label="Squares the leaf covers" />
        </label>
        <label className="flex items-center gap-1.5">
          Blue-black <Cell id="starch-blue" value={w.grid.blue} onChange={(x) => setGrid({ blue: x })} readOnly={readOnly} label="Blue-black squares" />
        </label>
        <label className="flex items-center gap-1.5">
          % made starch <Cell id="starch-pct" value={w.grid.pct} onChange={(x) => setGrid({ pct: x })} readOnly={readOnly} label="Percentage that made starch" />
        </label>
      </div>
      <h4 className="mb-1 mt-4 text-[13px] font-semibold">Label the variegated leaf before and after the test</h4>
      <LabelBoard box={{ x: 0, y: 0, w: 200, h: 120 }} targets={STARCH_DRAWING_TARGETS} options={v.labelOptions} value={w.labels} onChange={(next) => update((s) => ({ ...s, starch: { ...s.starch, labels: next } }), 'labels')} readOnly={readOnly} label="The variegated leaf before and after the starch test">
        <StarchDrawing />
      </LabelBoard>
      <div className="mt-4">
        <DrawingChecklist shown={v.drawing} value={w.drawing} onChange={(next) => update((s) => ({ ...s, starch: { ...s.starch, drawing: next } }), 'drawing')} readOnly={readOnly} />
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ written answers

export const EXPLAIN_Q = {
  POTOMETER: 'Explain why the bubble moved fastest with the fan (or bright light) and slowest in the dark or in humid air.',
  OXYGEN: 'Explain the shape of your graph, why the bubbling stopped when the lamp was far away, and how you know the gas was oxygen.',
  STARCH: 'Explain why each leaf was boiled and then put in ethanol, and what your results show about the conditions needed for photosynthesis.',
};

export function Written({ state, readOnly, update, className }: { state: BioPlantState; readOnly: boolean; update: Update; className?: string }) {
  const task = state.task ?? 'POTOMETER';
  const set = (k: 'precautions' | 'explain', val: string) => update((s) => ({ ...s, written: { ...s.written, [k]: val.slice(0, 2000) } }));
  return (
    <Card className={cn('space-y-3 p-4 sm:p-5', className)}>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="plant-prec">
          Two precautions you took
        </label>
        <Textarea id="plant-prec" rows={3} value={state.written.precautions} disabled={readOnly} onChange={(e) => set('precautions', e.target.value)} placeholder={task === 'POTOMETER' ? 'e.g. the shoot was cut under water…' : task === 'OXYGEN' ? 'e.g. a water trough kept the temperature constant…' : 'e.g. the flame was turned off before using ethanol…'} />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="plant-explain">
          {EXPLAIN_Q[task]}
        </label>
        <Textarea id="plant-explain" rows={3} value={state.written.explain} disabled={readOnly} onChange={(e) => set('explain', e.target.value)} />
      </div>
    </Card>
  );
}
