import {
  AGAR_CLAIMS,
  AGAR_CLAIM_LABEL,
  FIRMNESS,
  FIRMNESS_LABEL,
  PLAS_CLAIMS,
  PLAS_CLAIM_LABEL,
  PLAS_DRAWING_TARGETS,
  PLAS_STAGES,
  PLAS_STAGE_LABEL,
  emptyAgarRow,
  emptyPotatoRow,
  plasCaptureOf,
  type AgarRow,
  type BioOsmosisState,
  type BioOsmosisVariant,
  type Firmness,
  type PlasClaim,
  type PotatoRow,
} from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DrawingChecklist, LabelBoard } from '../bio-common';
import type { OsmoUpdate as Update } from './actions';
import { OsmoGraph } from './graph';
import { PlasDrawing } from './visuals';

/**
 * The notebook of each task — the potato table, graph and isotonic point; the
 * plasmolysis observations, count, labelled drawing; the agar table, depth
 * and conclusion — and the written answers: the same record in the 2D lab
 * and in the 3D lab's notebook (`book`: exercise-book styling).
 */

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60';
const box = (book?: boolean, className?: string) => cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className);
function Cell({ id, value, onChange, readOnly, label, placeholder, w = 'w-[4.6rem]' }: { id: string; value: string; onChange: (v: string) => void; readOnly: boolean; label: string; placeholder?: string; w?: string }) {
  return <Input id={id} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value.slice(0, 40))} aria-label={label} placeholder={placeholder} inputMode="decimal" className={cn('h-8 px-1.5 text-center font-mono text-[13px]', w)} />;
}

// ------------------------------------------------------------------ potato

export function PotatoNotebook({ state, readOnly, update, book, className }: { state: BioOsmosisState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.potato;
  const setRow = (i: number, patch: Partial<PotatoRow>) => update((s) => ({ ...s, potato: { ...s.potato, rows: s.potato.cyl.map((_, k) => (k === i ? { ...(s.potato.rows[k] ?? emptyPotatoRow()), ...patch } : (s.potato.rows[k] ?? emptyPotatoRow()))) } }));
  const points = w.cyl.map((c, i) => ({ x: c.conc, y: Number((w.rows[i]?.pm ?? '').trim()) })).filter((p, i) => (w.rows[i]?.pm ?? '').trim() !== '' && Number.isFinite(p.y));
  const cols: { k: keyof Omit<PotatoRow, 'firm'>; h: string; ph: string }[] = [
    { k: 'l0', h: 'Initial length / mm', ph: '50' },
    { k: 'l1', h: 'Final length / mm', ph: '' },
    { k: 'pl', h: '% change in length', ph: '' },
    { k: 'm0', h: 'Initial mass / g', ph: '0.00' },
    { k: 'm1', h: 'Final mass / g', ph: '' },
    { k: 'pm', h: '% change in mass', ph: '' },
  ];
  return (
    <Card className={box(book, className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Table of results</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">% change = (final − initial) ÷ initial × 100. Put a minus sign on a decrease.</p>
      {w.cyl.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">Rows appear as you bore cylinders.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-1 font-medium">Sucrose / mol dm⁻³</th>
                {cols.map((c) => (
                  <th key={c.k} className="pb-1 pr-1 font-medium">
                    {c.h}
                  </th>
                ))}
                <th className="pb-1 font-medium">Firm or soft?</th>
              </tr>
            </thead>
            <tbody>
              {w.cyl.map((c, i) => {
                const r = w.rows[i] ?? emptyPotatoRow();
                return (
                  <tr key={i} className="border-t border-border align-middle">
                    <td className="py-1 pr-1 font-mono">
                      {c.conc.toFixed(1)}
                      {c.conc === 0 ? ' (water)' : ''}
                    </td>
                    {cols.map((col) => (
                      <td key={col.k} className="py-1 pr-1">
                        <Cell id={`pot-${col.k}-${i}`} value={r[col.k]} onChange={(x) => setRow(i, { [col.k]: x })} readOnly={readOnly} label={`${col.h}, cylinder ${i + 1}`} placeholder={col.ph} />
                      </td>
                    ))}
                    <td className="py-1">
                      <select value={r.firm ?? ''} disabled={readOnly} onChange={(e) => setRow(i, { firm: (e.target.value || null) as Firmness | null })} aria-label={`Firmness of cylinder ${i + 1}`} className="h-8 rounded-md border border-input bg-card px-1 text-[12px]">
                        <option value="">—</option>
                        {FIRMNESS.map((f) => (
                          <option key={f} value={f}>
                            {FIRMNESS_LABEL[f]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <h4 className="mb-2 mt-4 text-[13px] font-semibold">Graph: % change in mass against concentration</h4>
      <OsmoGraph points={points} line={w.line} onLine={(l) => update((s) => ({ ...s, potato: { ...s.potato, line: l } }), l ? 'line' : 'line:clear')} readOnly={readOnly} xLabel="Concentration of sucrose / mol dm⁻³" yLabel="% change in mass" />
      <label className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold">Isotonic concentration from the graph (where the line crosses 0 %)</span>
        <Cell id="pot-iso" value={w.iso} onChange={(x) => update((s) => ({ ...s, potato: { ...s.potato, iso: x } }))} readOnly={readOnly} label="Isotonic concentration" placeholder="0.00" w="w-[5.5rem]" />
        <span className="text-muted-foreground">mol/dm³</span>
      </label>
    </Card>
  );
}

// ------------------------------------------------------------------ plasmolysis

export function PlasNotebook({ v, state, readOnly, update, book, className }: { v: BioOsmosisVariant; state: BioOsmosisState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.plas;
  const setRow = (k: number, patch: Partial<{ observation: string; claims: PlasClaim[] }>) => update((s) => ({ ...s, plas: { ...s.plas, rows: s.plas.rows.map((r, j) => (j === k ? { ...r, ...patch } : r)) } }));
  const setCount = (patch: Partial<BioOsmosisState['plas']['count']>) => update((s) => ({ ...s, plas: { ...s.plas, count: { ...s.plas.count, ...patch } } }));
  return (
    <Card className={box(book, className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Observations</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">Record a view at each stage (the microscope’s Record button), then write what you saw and your inference.</p>
      <div className="space-y-3">
        {PLAS_STAGES.map((st, k) => {
          const ci = plasCaptureOf(w, st);
          const cap = ci >= 0 ? w.captures[ci] : null;
          const r = w.rows[k] ?? { observation: '', claims: [] };
          return (
            <div key={st} className="rounded-xl border border-border p-3">
              <p className="text-[12.5px] font-semibold">
                {k + 1}. {PLAS_STAGE_LABEL[st]} <span className="font-normal text-muted-foreground">{cap ? `— view recorded at ${cap.at} min, ×${cap.objective}` : '— no view recorded yet'}</span>
              </p>
              <label className="mt-2 block text-[11.5px] font-medium text-muted-foreground" htmlFor={`plas-obs-${k}`}>
                Observation
              </label>
              <Textarea id={`plas-obs-${k}`} rows={2} value={r.observation} disabled={readOnly} onChange={(e) => setRow(k, { observation: e.target.value.slice(0, 600) })} placeholder="What the vacuole, cytoplasm and wall look like…" />
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={`Inference: ${PLAS_STAGE_LABEL[st]}`}>
                {PLAS_CLAIMS.map((c) => {
                  const on = r.claims.includes(c);
                  return (
                    <button key={c} type="button" aria-pressed={on} disabled={readOnly} onClick={() => setRow(k, { claims: on ? r.claims.filter((x) => x !== c) : [...r.claims, c] })} className={cn(CHIP, on ? 'border-success bg-success/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                      {PLAS_CLAIM_LABEL[c]}
                      {on ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <h4 className="mb-1 mt-4 text-[13px] font-semibold">Count in the strong solution (high power, ×40)</h4>
      <p className="mb-2 text-[12px] text-muted-foreground">Count only cells with their centre inside the field. % plasmolysed = plasmolysed ÷ counted × 100.</p>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          Cells counted <Cell id="plas-total" value={w.count.total} onChange={(x) => setCount({ total: x })} readOnly={readOnly} label="Cells counted" />
        </label>
        <label className="flex items-center gap-1.5">
          Plasmolysed <Cell id="plas-plas" value={w.count.plasmolysed} onChange={(x) => setCount({ plasmolysed: x })} readOnly={readOnly} label="Cells plasmolysed" />
        </label>
        <label className="flex items-center gap-1.5">
          % plasmolysed <Cell id="plas-pct" value={w.count.pct} onChange={(x) => setCount({ pct: x })} readOnly={readOnly} label="Percentage plasmolysed" />
        </label>
      </div>
      <h4 className="mb-1 mt-4 text-[13px] font-semibold">Label the drawing of a plasmolysed cell</h4>
      <LabelBoard
        box={{ x: 0, y: 0, w: 200, h: 140 }}
        targets={PLAS_DRAWING_TARGETS}
        options={v.labelOptions}
        value={w.labels}
        onChange={(next) => update((s) => ({ ...s, plas: { ...s.plas, labels: next } }), 'labels')}
        readOnly={readOnly}
        label="Drawing of a plasmolysed cell"
      >
        <PlasDrawing />
      </LabelBoard>
      <div className="mt-4">
        <DrawingChecklist shown={v.drawing} value={w.drawing} onChange={(next) => update((s) => ({ ...s, plas: { ...s.plas, drawing: next } }), 'drawing')} readOnly={readOnly} />
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ agar

export function AgarNotebook({ state, readOnly, update, book, className }: { state: BioOsmosisState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.agar;
  const setRow = (i: number, patch: Partial<AgarRow>) => update((s) => ({ ...s, agar: { ...s.agar, rows: s.agar.cubes.map((_, k) => (k === i ? { ...(s.agar.rows[k] ?? emptyAgarRow()), ...patch } : (s.agar.rows[k] ?? emptyAgarRow()))) } }));
  const setDepth = (patch: Partial<BioOsmosisState['agar']['depth']>) => update((s) => ({ ...s, agar: { ...s.agar, depth: { ...s.agar.depth, ...patch } } }));
  const cols: { k: keyof AgarRow; h: string; ph: string }[] = [
    { k: 'side', h: 'Side / cm', ph: '0.0' },
    { k: 'sa', h: 'Surface area / cm²', ph: '' },
    { k: 'vol', h: 'Volume / cm³', ph: '' },
    { k: 'ratio', h: 'SA : V', ph: 'x : 1' },
    { k: 'time', h: 'Time to colourless / min', ph: '' },
  ];
  const cut = w.depth.cube !== null ? w.cubes[w.depth.cube] : undefined;
  return (
    <Card className={box(book, className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Table of results</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">Surface area = 6 × side²; volume = side³; SA : V = area ÷ volume.</p>
      {w.cubes.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">Rows appear as you cut cubes.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[480px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-1 font-medium">Cube</th>
                {cols.map((c) => (
                  <th key={c.k} className="pb-1 pr-1 font-medium">
                    {c.h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {w.cubes.map((c, i) => {
                const r = w.rows[i] ?? emptyAgarRow();
                return (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-1">
                      {i + 1}. {c.size} cm{c.cutAt !== null ? ' (cut open)' : ''}
                    </td>
                    {cols.map((col) => (
                      <td key={col.k} className="py-1 pr-1">
                        <Cell id={`agar-${col.k}-${i}`} value={r[col.k]} onChange={(x) => setRow(i, { [col.k]: x })} readOnly={readOnly || (col.k === 'time' && c.cutAt !== null)} label={`${col.h}, cube ${i + 1}`} placeholder={col.k === 'time' && c.cutAt !== null ? '—' : col.ph} w={col.k === 'ratio' ? 'w-[5rem]' : undefined} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <h4 className="mb-1 mt-4 text-[13px] font-semibold">The cube cut open{cut ? `: cube ${w.depth.cube! + 1} (${cut.size} cm)` : ''}</h4>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          Depth of colourless zone / mm <Cell id="agar-depth" value={w.depth.depth} onChange={(x) => setDepth({ depth: x })} readOnly={readOnly} label="Depth of the colourless zone" />
        </label>
        <label className="flex items-center gap-1.5">
          Time in acid / min <Cell id="agar-dtime" value={w.depth.time} onChange={(x) => setDepth({ time: x })} readOnly={readOnly} label="Time in the acid" />
        </label>
        <label className="flex items-center gap-1.5">
          Rate / mm per min <Cell id="agar-rate" value={w.depth.rate} onChange={(x) => setDepth({ rate: x })} readOnly={readOnly} label="Rate of diffusion" />
        </label>
        <label className="flex items-center gap-1.5">
          % of the cube colourless <Cell id="agar-pct" value={w.depth.pct} onChange={(x) => setDepth({ pct: x })} readOnly={readOnly} label="Percentage of the cube colourless" />
        </label>
      </div>
      <h4 className="mb-1 mt-4 text-[13px] font-semibold">Conclusion</h4>
      <p className="mb-1.5 text-[12px] text-muted-foreground">Which cube became colourless first?</p>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="The cube that became colourless first">
        {w.cubes.map((c, i) =>
          c.cutAt !== null ? null : (
            <button key={i} type="button" role="radio" aria-checked={w.first === i} disabled={readOnly} onClick={() => update((s) => ({ ...s, agar: { ...s.agar, first: s.agar.first === i ? null : i } }), `first:${i + 1}`)} className={cn(CHIP, w.first === i ? 'border-brand bg-brand/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
              Cube {i + 1} ({c.size} cm)
            </button>
          ),
        )}
      </div>
      <p className="mb-1.5 mt-3 text-[12px] text-muted-foreground">Tick every statement that your results support.</p>
      <div className="flex flex-wrap gap-1">
        {AGAR_CLAIMS.map((c) => {
          const on = w.claims.includes(c);
          return (
            <button key={c} type="button" aria-pressed={on} disabled={readOnly} onClick={() => update((s) => ({ ...s, agar: { ...s.agar, claims: on ? s.agar.claims.filter((x) => x !== c) : [...s.agar.claims, c] } }), `claim:${c}`)} className={cn(CHIP, 'text-left', on ? 'border-success bg-success/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
              {AGAR_CLAIM_LABEL[c]}
              {on ? ' ✓' : ''}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ written answers

export const EXPLAIN_Q = {
  POTATO: 'Explain why the cylinders in water became longer, heavier and firm while those in strong solutions became shorter, lighter and soft, and what the 0 % crossing shows.',
  PLASMOLYSIS: 'Explain what happened to the cells in the strong solution and back in water, and why the space between the wall and the membrane fills with the outside solution.',
  AGAR: 'Explain why the smallest cube became colourless first, and what this shows about why large organisms need transport and gas-exchange systems.',
};

export function Written({ state, readOnly, update, className }: { state: BioOsmosisState; readOnly: boolean; update: Update; className?: string }) {
  const task = state.task ?? 'POTATO';
  const set = (k: 'precautions' | 'explain', val: string) => update((s) => ({ ...s, written: { ...s.written, [k]: val.slice(0, 2000) } }));
  return (
    <Card className={cn('space-y-3 p-4 sm:p-5', className)}>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="osmo-prec">
          Two precautions you took
        </label>
        <Textarea id="osmo-prec" rows={3} value={state.written.precautions} disabled={readOnly} onChange={(e) => set('precautions', e.target.value)} placeholder={task === 'POTATO' ? 'e.g. all cylinders were cut from the same tuber…' : task === 'PLASMOLYSIS' ? 'e.g. a thin, single layer of epidermis was used…' : 'e.g. all the cubes were put into the acid at the same time…'} />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="osmo-explain">
          {EXPLAIN_Q[task]}
        </label>
        <Textarea id="osmo-explain" rows={3} value={state.written.explain} disabled={readOnly} onChange={(e) => set('explain', e.target.value)} />
      </div>
    </Card>
  );
}
