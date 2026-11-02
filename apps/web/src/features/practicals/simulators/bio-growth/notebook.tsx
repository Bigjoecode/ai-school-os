import {
  GERM_CLAIMS,
  GERM_CLAIM_LABEL,
  GERM_MISSING,
  GERM_MISSING_LABEL,
  GERM_TUBES,
  RESP_CLAIMS,
  RESP_CLAIM_LABEL,
  RESP_EQUATIONS,
  SEED_CLAIMS,
  SEED_CLAIM_LABEL,
  SEED_CURVES,
  SEED_CURVE_LABEL,
  SEED_DRAWING_TARGETS,
  SEED_FIRSTS,
  SEED_FIRST_LABEL,
  SEED_KINDS,
  SEED_KIND_LABEL,
  SEED_TABLE,
  SEED_TABLE_OPTION_LABEL,
  TROP_CLAIMS,
  TROP_CLAIM_LABEL,
  TROP_SKETCHES,
  TROP_SKETCH_LABEL,
  type BioGrowthState,
  type BioGrowthVariant,
  type GermClaim,
  type GermMissing,
  type GrowthTask,
  type RespClaim,
  type RespEquation,
  type SeedClaim,
  type SeedCurve,
  type SeedFirst,
  type SeedTableKey,
  type TropClaim,
  type TropSketch,
} from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DrawingChecklist, LabelBoard } from '../bio-common';
import type { GrowthUpdate as Update } from './actions';
import { LengthGraph, SeedDrawing, TropSketchSvg } from './visuals';

/**
 * The notebook of each task — the germination counts, % and missing
 * conditions; the seedling lengths, graph, drawing, rates and comparison
 * table; the flask temperatures, rises and the CO₂ test; the angles, the
 * radicle count, sketches — with the conclusions and written answers: the
 * same record in the 2D lab and in the 3D lab's notebook (`book` styling).
 */

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60 text-left';
const box = (book?: boolean, className?: string) => cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className);
const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">{children}</h3>;
const H4 = ({ children }: { children: React.ReactNode }) => <h4 className="mb-1 mt-4 text-[13px] font-semibold">{children}</h4>;
const Hint = ({ children }: { children: React.ReactNode }) => <p className="mb-2 text-[12px] text-muted-foreground">{children}</p>;
function Cell({ id, value, onChange, readOnly, label, w = 'w-[4.2rem]' }: { id: string; value: string; onChange: (v: string) => void; readOnly: boolean; label: string; w?: string }) {
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
  <select id={id} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-8 rounded-md border border-input bg-card px-1 text-[12.5px]">
    <option value="">—</option>
    {options.map((o) => (
      <option key={o.v} value={o.v}>
        {o.l}
      </option>
    ))}
  </select>
);

// ------------------------------------------------------------------ germination

export function GermNotebook({ state, readOnly, update, book, className }: { state: BioGrowthState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.germ;
  const looks = [...w.looks].sort((a, b) => a - b);
  const setRow = (k: number, patch: Partial<BioGrowthState['germ']['rows'][number]>) => update((s) => ({ ...s, germ: { ...s.germ, rows: s.germ.rows.map((r, j) => (j === k ? { ...r, ...patch } : r)) } }));
  const setCount = (k: number, d: number, val: string) => update((s) => ({ ...s, germ: { ...s.germ, rows: s.germ.rows.map((r, j) => (j === k ? { ...r, c: r.c.map((x, i) => (i === d ? val : x)) } : r)) } }));
  return (
    <Card className={box(book, className)}>
      <H3>Table of results</H3>
      <Hint>Seeds with a radicle showing, counted each day you inspect the tubes. % germination = number germinated ÷ number sown × 100 (from your last day’s count).</Hint>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[520px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 pr-1 font-medium">Tube</th>
              <th className="pb-1 pr-1 font-medium">Sown</th>
              {looks.map((d) => (
                <th key={d} className="pb-1 pr-1 font-medium">
                  Day {d}
                </th>
              ))}
              <th className="pb-1 pr-1 font-medium">Germinated</th>
              <th className="pb-1 pr-1 font-medium">% germination</th>
              <th className="pb-1 pr-1 font-medium">Condition missing</th>
            </tr>
          </thead>
          <tbody>
            {GERM_TUBES.map((name, k) => {
              const r = w.rows[k]!;
              return (
                <tr key={name} className="border-t border-border align-middle">
                  <td className="py-1 pr-1 font-semibold">{name}</td>
                  <td className="py-1 pr-1">
                    <Cell id={`germ-sown-${k}`} value={r.sown} onChange={(x) => setRow(k, { sown: x })} readOnly={readOnly} label={`Seeds sown in tube ${name}`} w="w-[3.2rem]" />
                  </td>
                  {looks.map((d) => (
                    <td key={d} className="py-1 pr-1">
                      <Cell id={`germ-c-${k}-${d}`} value={r.c[d] ?? ''} onChange={(x) => setCount(k, d, x)} readOnly={readOnly} label={`Tube ${name}, day ${d}: germinated`} w="w-[3.2rem]" />
                    </td>
                  ))}
                  <td className="py-1 pr-1">
                    <Cell id={`germ-germ-${k}`} value={r.germ} onChange={(x) => setRow(k, { germ: x })} readOnly={readOnly} label={`Tube ${name}: number germinated`} w="w-[3.4rem]" />
                  </td>
                  <td className="py-1 pr-1">
                    <Cell id={`germ-pct-${k}`} value={r.pct} onChange={(x) => setRow(k, { pct: x })} readOnly={readOnly} label={`Tube ${name}: % germination`} />
                  </td>
                  <td className="py-1 pr-1">
                    <Select id={`germ-missing-${k}`} value={r.missing} options={GERM_MISSING.map((m) => ({ v: m, l: GERM_MISSING_LABEL[m] }))} onChange={(x) => setRow(k, { missing: x as GermMissing | '' })} readOnly={readOnly} label={`Tube ${name}: condition missing`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!looks.length && <p className="py-2 text-[13px] text-muted-foreground">A column appears for each day you inspect the tubes.</p>}
      <H4>Conclusions</H4>
      <Chips<GermClaim> all={GERM_CLAIMS} label={GERM_CLAIM_LABEL} value={w.claims} onChange={(next) => update((s) => ({ ...s, germ: { ...s.germ, claims: next } }), 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ seedlings

export function SeedNotebook({ v, state, readOnly, update, book, className }: { v: BioGrowthVariant; state: BioGrowthState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.seedling;
  const set = (patch: Partial<BioGrowthState['seedling']>, log?: string) => update((s) => ({ ...s, seedling: { ...s.seedling, ...patch } }), log);
  const setRow = (day: number, patch: Partial<{ cow: string; maize: string }>) => update((s) => ({ ...s, seedling: { ...s.seedling, rows: s.seedling.rows.map((r) => (r.day === day ? { ...r, ...patch } : r)) } }));
  const series = [
    { name: 'Cowpea', colour: '#2e7d32', pts: w.rows.filter((r) => r.cow.trim() && Number.isFinite(Number(r.cow))).map((r) => ({ x: r.day, y: Number(r.cow) })) },
    { name: 'Maize', colour: '#c27c0e', pts: w.rows.filter((r) => r.maize.trim() && Number.isFinite(Number(r.maize))).map((r) => ({ x: r.day, y: Number(r.maize) })) },
  ];
  return (
    <Card className={box(book, className)}>
      <H3>Table of results</H3>
      <Hint>Shoot (plumule) length in mm, measured with the ruler each day from the same point.</Hint>
      {w.rows.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">A row appears for each day you measure.</p>
      ) : (
        <table className="w-full max-w-[360px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 pr-1 font-medium">Day</th>
              <th className="pb-1 pr-1 font-medium">Cowpea / mm</th>
              <th className="pb-1 pr-1 font-medium">Maize / mm</th>
            </tr>
          </thead>
          <tbody>
            {w.rows.map((r) => (
              <tr key={r.day} className="border-t border-border">
                <td className="py-1 pr-1 font-mono">{r.day}</td>
                <td className="py-1 pr-1">
                  <Cell id={`seed-cow-${r.day}`} value={r.cow} onChange={(x) => setRow(r.day, { cow: x })} readOnly={readOnly} label={`Cowpea shoot on day ${r.day}`} />
                </td>
                <td className="py-1 pr-1">
                  <Cell id={`seed-maize-${r.day}`} value={r.maize} onChange={(x) => setRow(r.day, { maize: x })} readOnly={readOnly} label={`Maize shoot on day ${r.day}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <H4>Graph of shoot length against time</H4>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <button type="button" aria-pressed={w.graph} disabled={readOnly} onClick={() => set({ graph: !w.graph }, w.graph ? 'graph:off' : 'graph:on')} className={cn(CHIP, w.graph ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
          {w.graph ? '✓ Points plotted' : '+ Plot my points'}
        </button>
        {SEED_CURVES.map((c) => (
          <button key={c} type="button" aria-pressed={w.curve === c} disabled={readOnly || !w.graph} onClick={() => set({ curve: c as SeedCurve }, `curve:${c}`)} className={cn(CHIP, w.curve === c ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
            {SEED_CURVE_LABEL[c]}
          </button>
        ))}
      </div>
      <LengthGraph series={w.graph ? series : []} curve={w.graph ? w.curve : null} />
      <H4>Growth rate between day 4 and day 8</H4>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          Cowpea <Cell id="seed-rate-cow" value={w.rateCow} onChange={(x) => set({ rateCow: x })} readOnly={readOnly} label="Cowpea growth rate between day 4 and day 8" /> mm/day
        </label>
        <label className="flex items-center gap-1.5">
          Maize <Cell id="seed-rate-maize" value={w.rateMaize} onChange={(x) => set({ rateMaize: x })} readOnly={readOnly} label="Maize growth rate between day 4 and day 8" /> mm/day
        </label>
      </div>
      <H4>Which part appeared first?</H4>
      <Pick<SeedFirst> all={SEED_FIRSTS} label={SEED_FIRST_LABEL} value={w.first} onChange={(c) => set({ first: c }, `first:${c}`)} readOnly={readOnly} name="The part that appeared first" />
      <H4>Comparison table</H4>
      <table className="w-full max-w-[460px] border-collapse text-[12px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pb-1 pr-1 font-medium" />
            {SEED_KINDS.map((k) => (
              <th key={k} className="pb-1 pr-1 font-medium">
                {SEED_KIND_LABEL[k]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(Object.keys(SEED_TABLE) as SeedTableKey[]).map((key) => (
            <tr key={key} className="border-t border-border">
              <td className="py-1 pr-1">{SEED_TABLE[key].label}</td>
              {SEED_KINDS.map((k) => (
                <td key={k} className="py-1 pr-1">
                  <Select id={`seed-table-${k}-${key}`} value={w.table[k][key]} options={SEED_TABLE[key].options.map((o) => ({ v: o, l: SEED_TABLE_OPTION_LABEL[o]! }))} onChange={(x) => set({ table: { ...w.table, [k]: { ...w.table[k], [key]: x } } })} readOnly={readOnly} label={`${SEED_KIND_LABEL[k]}: ${SEED_TABLE[key].label}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <H4>Label the seedlings at day 7</H4>
      <LabelBoard box={{ x: 0, y: 0, w: 240, h: 150 }} targets={SEED_DRAWING_TARGETS} options={v.labelOptions} value={w.labels} onChange={(next) => set({ labels: next }, 'labels')} readOnly={readOnly} label="Cowpea and maize seedlings at day 7">
        <SeedDrawing />
      </LabelBoard>
      <div className="mt-4">
        <DrawingChecklist shown={v.drawing} value={w.drawing} onChange={(next) => set({ drawing: next }, 'drawing')} readOnly={readOnly} />
      </div>
      <H4>Conclusions</H4>
      <Chips<SeedClaim> all={SEED_CLAIMS} label={SEED_CLAIM_LABEL} value={w.claims} onChange={(next) => set({ claims: next }, 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ respiration

export function RespNotebook({ state, readOnly, update, book, className }: { state: BioGrowthState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.resp;
  const set = (patch: Partial<BioGrowthState['resp']>, log?: string) => update((s) => ({ ...s, resp: { ...s.resp, ...patch } }), log);
  const setRow = (n: number, patch: Partial<{ a: string; b: string }>) => update((s) => ({ ...s, resp: { ...s.resp, rows: s.resp.rows.map((r, i) => (i === n ? { ...r, ...patch } : r)) } }));
  const EQ = Object.fromEntries(RESP_EQUATIONS.map((e) => [e.id, e.text])) as Record<RespEquation, string>;
  return (
    <Card className={box(book, className)}>
      <H3>Table of results</H3>
      <Hint>Temperature of each flask (°C, to 0.5 °C) every time you read the thermometers.</Hint>
      {w.reads.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">A row appears each time you read the thermometers.</p>
      ) : (
        <table className="w-full max-w-[400px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 pr-1 font-medium">Time</th>
              <th className="pb-1 pr-1 font-medium">Flask A / °C</th>
              <th className="pb-1 pr-1 font-medium">Flask B / °C</th>
            </tr>
          </thead>
          <tbody>
            {w.reads.map((at, n) => {
              const h = Math.round(at - (w.startAt ?? 0));
              return (
                <tr key={n} className="border-t border-border">
                  <td className="py-1 pr-1">{h % 24 === 0 ? `Day ${h / 24}` : `${h} h`}</td>
                  <td className="py-1 pr-1">
                    <Cell id={`resp-a-${n}`} value={w.rows[n]?.a ?? ''} onChange={(x) => setRow(n, { a: x })} readOnly={readOnly} label={`Flask A, reading ${n + 1}`} />
                  </td>
                  <td className="py-1 pr-1">
                    <Cell id={`resp-b-${n}`} value={w.rows[n]?.b ?? ''} onChange={(x) => setRow(n, { b: x })} readOnly={readOnly} label={`Flask B, reading ${n + 1}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <H4>Calculations</H4>
      <div className="grid gap-2 text-[12.5px] sm:grid-cols-2">
        <label className="flex items-center gap-1.5">
          Rise in A <Cell id="resp-riseA" value={w.riseA} onChange={(x) => set({ riseA: x })} readOnly={readOnly} label="Rise in temperature in flask A" /> °C
        </label>
        <label className="flex items-center gap-1.5">
          Rise in B <Cell id="resp-riseB" value={w.riseB} onChange={(x) => set({ riseB: x })} readOnly={readOnly} label="Rise in temperature in flask B" /> °C
        </label>
        <label className="flex items-center gap-1.5">
          Mean rise per day (A) <Cell id="resp-perDay" value={w.perDay} onChange={(x) => set({ perDay: x })} readOnly={readOnly} label="Mean rise per day in flask A" /> °C
        </label>
        <label className="flex items-center gap-1.5">
          Difference due to respiration <Cell id="resp-diff" value={w.diff} onChange={(x) => set({ diff: x })} readOnly={readOnly} label="Difference due to respiration" /> °C
        </label>
      </div>
      <H4>The CO₂ test: what you saw</H4>
      <label className="block text-[11.5px] font-medium text-muted-foreground" htmlFor="resp-obs-live">
        Air from germinating seeds
      </label>
      <Textarea id="resp-obs-live" rows={2} value={w.obsLive} disabled={readOnly} onChange={(e) => set({ obsLive: e.target.value.slice(0, 600) })} placeholder="What happened to the lime water or indicator…" />
      <label className="mt-2 block text-[11.5px] font-medium text-muted-foreground" htmlFor="resp-obs-ctrl">
        Air from boiled seeds (the control)
      </label>
      <Textarea id="resp-obs-ctrl" rows={2} value={w.obsCtrl} disabled={readOnly} onChange={(e) => set({ obsCtrl: e.target.value.slice(0, 600) })} />
      <H4>The word equation for aerobic respiration</H4>
      <Pick<RespEquation> all={RESP_EQUATIONS.map((e) => e.id)} label={EQ} value={w.eq} onChange={(c) => set({ eq: c }, `eq:${c}`)} readOnly={readOnly} name="Word equation" />
      <H4>Conclusions</H4>
      <Chips<RespClaim> all={RESP_CLAIMS} label={RESP_CLAIM_LABEL} value={w.claims} onChange={(next) => set({ claims: next }, 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ tropisms

export function TropNotebook({ state, readOnly, update, book, className }: { state: BioGrowthState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.trop;
  const set = (patch: Partial<BioGrowthState['trop']>, log?: string) => update((s) => ({ ...s, trop: { ...s.trop, ...patch } }), log);
  const setRow = (day: number, patch: Partial<{ test: string; ctrl: string }>) => update((s) => ({ ...s, trop: { ...s.trop, rows: s.trop.rows.map((r) => (r.day === day ? { ...r, ...patch } : r)) } }));
  const sketch = (key: 'sketchCork' | 'sketchKlino', title: string) => (
    <div>
      <p className="mb-1 text-[12px] font-medium">{title}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={title}>
        {TROP_SKETCHES.map((k) => (
          <button key={k} type="button" aria-pressed={w[key] === k} aria-label={`${title}: ${TROP_SKETCH_LABEL[k]}`} disabled={readOnly} onClick={() => set({ [key]: k as TropSketch }, `${key}:${k}`)} className={cn('flex w-[120px] flex-col items-center gap-1 rounded-xl border p-1.5 text-[11px]', w[key] === k ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground hover:bg-muted')}>
            <TropSketchSvg kind={k} />
            {TROP_SKETCH_LABEL[k]}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <Card className={box(book, className)}>
      <H3>Table of results</H3>
      <Hint>Angle of curvature of the tagged shoot towards the slit, measured with the protractor each day.</Hint>
      {w.rows.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">A row appears for each day you measure.</p>
      ) : (
        <table className="w-full max-w-[380px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 pr-1 font-medium">Day</th>
              <th className="pb-1 pr-1 font-medium">Test shoot / °</th>
              <th className="pb-1 pr-1 font-medium">Control shoot / °</th>
            </tr>
          </thead>
          <tbody>
            {w.rows.map((r) => (
              <tr key={r.day} className="border-t border-border">
                <td className="py-1 pr-1 font-mono">{r.day}</td>
                <td className="py-1 pr-1">
                  <Cell id={`trop-test-${r.day}`} value={r.test} onChange={(x) => setRow(r.day, { test: x })} readOnly={readOnly} label={`Test shoot angle on day ${r.day}`} />
                </td>
                <td className="py-1 pr-1">
                  <Cell id={`trop-ctrl-${r.day}`} value={r.ctrl} onChange={(x) => setRow(r.day, { ctrl: x })} readOnly={readOnly} label={`Control shoot angle on day ${r.day}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <H4>Calculations</H4>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          Mean rate of curvature <Cell id="trop-rate" value={w.rate} onChange={(x) => set({ rate: x })} readOnly={readOnly} label="Mean rate of curvature" /> ° per day
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          Radicles growing down <Cell id="trop-down" value={w.down} onChange={(x) => set({ down: x })} readOnly={readOnly} label="Radicles growing downwards" w="w-[3.4rem]" />
        </label>
        <label className="flex items-center gap-1.5">
          of <Cell id="trop-total" value={w.total} onChange={(x) => set({ total: x })} readOnly={readOnly} label="Radicles pinned" w="w-[3.4rem]" />
        </label>
        <label className="flex items-center gap-1.5">
          = <Cell id="trop-pct" value={w.pct} onChange={(x) => set({ pct: x })} readOnly={readOnly} label="Percentage of radicles growing down" /> %
        </label>
      </div>
      <H4>Sketch the radicles after the experiment</H4>
      <div className="space-y-2">
        {sketch('sketchCork', 'On the stationary cork')}
        {sketch('sketchKlino', 'On the rotating clinostat')}
      </div>
      <H4>Conclusions</H4>
      <Chips<TropClaim> all={TROP_CLAIMS} label={TROP_CLAIM_LABEL} value={w.claims} onChange={(next) => set({ claims: next }, 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ written answers

export const EXPLAIN_Q: Record<GrowthTask, string> = {
  GERM: 'Explain why water, oxygen and a suitable temperature are each needed for germination.',
  SEEDLING: 'Explain how cowpea (epigeal) and maize (hypogeal) germination differ, naming the part that elongates in each.',
  RESP: 'Explain why the temperature rose in flask A but not in flask B, and why the seeds were rinsed in disinfectant.',
  TROPISM: 'Explain, using auxin, why the shoots bent towards the light, and why the clinostat is used as the control.',
};
const PREC_PH: Record<GrowthTask, string> = {
  GERM: 'e.g. seeds of the same size and age were used…',
  SEEDLING: 'e.g. the sawdust was kept moist but not waterlogged…',
  RESP: 'e.g. both batches of seeds were rinsed in disinfectant…',
  TROPISM: 'e.g. the box was made light-proof except for the slit…',
};

export function Written({ state, readOnly, update, className }: { state: BioGrowthState; readOnly: boolean; update: Update; className?: string }) {
  const task = state.task ?? 'GERM';
  const set = (k: 'precautions' | 'explain', val: string) => update((s) => ({ ...s, written: { ...s.written, [k]: val.slice(0, 2000) } }));
  return (
    <Card className={cn('space-y-3 p-4 sm:p-5', className)}>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="growth-prec">
          Two precautions you took
        </label>
        <Textarea id="growth-prec" rows={3} value={state.written.precautions} disabled={readOnly} onChange={(e) => set('precautions', e.target.value)} placeholder={PREC_PH[task]} />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="growth-explain">
          {EXPLAIN_Q[task]}
        </label>
        <Textarea id="growth-explain" rows={3} value={state.written.explain} disabled={readOnly} onChange={(e) => set('explain', e.target.value)} />
      </div>
    </Card>
  );
}
