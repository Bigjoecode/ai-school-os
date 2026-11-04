import {
  CROSS_CLAIMS,
  CROSS_CLAIM_LABEL,
  CROSS_CLOSER,
  DISC_CHARTS,
  DISC_CHART_LABEL,
  DISC_CLAIMS,
  DISC_CLAIM_LABEL,
  DISC_GROUPS,
  DISC_RECORD_LABEL,
  FOOD_ARROWS,
  FOOD_ARROW_LABEL,
  FOOD_CHAIN_MAIN,
  FOOD_CLAIMS,
  FOOD_CLAIM_LABEL,
  FOOD_INVERT,
  FOOD_INVERT_LABEL,
  FOOD_LEVELS,
  FOOD_LEVEL_LABEL,
  FOOD_MAX_CHAINS,
  FOOD_ORGS,
  FOOD_ORG_LABEL,
  HEIGHT_CHARTS,
  HEIGHT_CHART_LABEL,
  HEIGHT_CLAIMS,
  HEIGHT_CLAIM_LABEL,
  HEIGHT_SCHEMES,
  HEIGHT_SCHEME_LABEL,

  classLabel,
  foodLink,
  heightClasses,
  type BioGeneticsState,
  type BioGeneticsVariant,
  type CrossClaim,
  type CrossCloser,
  type CrossRow,
  type DiscChart,
  type DiscClaim,
  type DiscGroup,
  type DiscRow,
  type FoodArrow,
  type FoodClaim,
  type FoodInvert,
  type FoodLevel,
  type FoodOrg,
  type HeightChart,
  type HeightClaim,
  type HeightScheme,
} from '@aischool/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { GenUpdate as Update } from './actions';
import { FreqChart, PieSvg, PyramidSvg, WebSvg } from './visuals';

/**
 * The notebook of each task — the class record sheet, frequency table,
 * histogram and statistics; the survey sheet, tallies, pie and bar charts;
 * the bead tally, ratios and class results; the field counts, food chains,
 * web, trophic levels and pyramids — and the written answers: the same record
 * in the 2D lab and the 3D lab's notebook (`book`: exercise-book styling).
 */

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60 text-left';
const box = (book?: boolean, className?: string) => cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className);
const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">{children}</h3>;
const H4 = ({ children }: { children: React.ReactNode }) => <h4 className="mb-1 mt-4 text-[13px] font-semibold">{children}</h4>;
const Hint = ({ children }: { children: React.ReactNode }) => <p className="mb-2 text-[12px] text-muted-foreground">{children}</p>;
const SEL = 'h-8 rounded-md border border-input bg-card px-1 text-[12.5px]';
const n = (x: string) => (x.trim() && Number.isFinite(Number(x)) ? Number(x) : undefined);
export function Cell({ id, value, onChange, readOnly, label, w = 'w-[4.4rem]' }: { id: string; value: string; onChange: (v: string) => void; readOnly: boolean; label: string; w?: string }) {
  return <Input id={id} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value.slice(0, 40))} aria-label={label} inputMode="decimal" className={cn('h-8 px-1.5 text-center font-mono text-[13px]', w)} />;
}
function Field({ id, label, value, onChange, readOnly, unit }: { id: string; label: string; value: string; onChange: (v: string) => void; readOnly: boolean; unit?: string }) {
  return (
    <label className="flex items-center gap-1.5 text-[12.5px]" htmlFor={id}>
      <span>{label}</span>
      <Cell id={id} value={value} onChange={onChange} readOnly={readOnly} label={label} w="w-[5.2rem]" />
      {unit && <span className="text-muted-foreground">{unit}</span>}
    </label>
  );
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
function Pick<C extends string>({ all, label, value, onChange, readOnly, name }: { all: readonly C[]; label: Record<C, string>; value: C | null; onChange: (c: C | null) => void; readOnly: boolean; name: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={name}>
      {all.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} disabled={readOnly} onClick={() => onChange(value === c ? null : c)} className={cn(CHIP, value === c ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
          {label[c]}
        </button>
      ))}
    </div>
  );
}
const padTo = <T,>(xs: T[], k: number, fill: () => T) => (xs.length > k ? xs : [...xs, ...Array.from({ length: k + 1 - xs.length }, fill)]);

// ------------------------------------------------------------------ height

export function HeightNotebook({ state, v, readOnly, update, book, className }: { state: BioGeneticsState; v: BioGeneticsVariant; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.height;
  const nCls = v.height.n;
  const set = (patch: Partial<BioGeneticsState['height']>, log?: string) => update((s) => ({ ...s, height: { ...s.height, ...patch } }), log);
  const setRow = (i: number, patch: Partial<{ h: string; s: string }>) => update((s) => ({ ...s, height: { ...s.height, rows: padTo(s.height.rows, i, () => ({ h: '', s: '' })).map((r, k) => (k === i ? { ...r, ...patch } : r)) } }));
  const setFreq = (k: number, x: string) => update((s) => ({ ...s, height: { ...s.height, freq: padTo(s.height.freq, k, () => '').map((f, j) => (j === k ? x : f)) } }));
  const cs = heightClasses(w.scheme);
  const declined = new Set(state.log.filter((e) => e.a.startsWith('declined:')).map((e) => Number(e.a.slice(9))));
  return (
    <Card className={box(book, className)}>
      <H3>Class record sheet</H3>
      <Hint>Record by number. Height to the nearest cm, hand span to the nearest 0.5 cm. Leave anyone who declined blank.</Hint>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2" role="table" aria-label="Heights and hand spans">
        {Array.from({ length: nCls }, (_, i) => {
          const r = w.rows[i] ?? { h: '', s: '' };
          return (
            <div key={i} className="flex items-center gap-1.5 text-[12px]" role="row">
              <span className="w-6 text-right tabular-nums text-muted-foreground">{i + 1}</span>
              <Cell id={`h-h-${i}`} value={r.h} onChange={(x) => setRow(i, { h: x })} readOnly={readOnly} label={`Height of classmate ${i + 1} (cm)`} w="w-[4rem]" />
              <span className="text-muted-foreground">cm</span>
              <Cell id={`h-s-${i}`} value={r.s} onChange={(x) => setRow(i, { s: x })} readOnly={readOnly} label={`Hand span of classmate ${i + 1} (cm)`} w="w-[4rem]" />
              <span className="text-muted-foreground">cm</span>
              {declined.has(i) && <span className="text-[11px] text-muted-foreground">declined</span>}
            </div>
          );
        })}
      </div>
      <H4>Frequency table of heights</H4>
      <Pick<HeightScheme> all={HEIGHT_SCHEMES} label={HEIGHT_SCHEME_LABEL} value={w.scheme} onChange={(x) => set({ scheme: x, freq: [], modal: null }, `scheme:${x ?? ''}`)} readOnly={readOnly} name="Classes" />
      {cs.length > 0 && (
        <div className="-mx-1 mt-2 overflow-x-auto px-1">
          <table className="border-collapse text-[12px]">
            <tbody>
              <tr>
                <th className="pr-2 text-left font-medium text-muted-foreground">Height / cm</th>
                {cs.map((c) => (
                  <td key={c[0]} className="px-0.5 text-center tabular-nums">
                    {classLabel(c)}
                  </td>
                ))}
              </tr>
              <tr>
                <th className="pr-2 text-left font-medium text-muted-foreground">Frequency</th>
                {cs.map((c, k) => (
                  <td key={c[0]} className="px-0.5">
                    <Cell id={`h-f-${k}`} value={w.freq[k] ?? ''} onChange={(x) => setFreq(k, x)} readOnly={readOnly} label={`Frequency ${classLabel(c)} cm`} w="w-[3.2rem]" />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2">
        <Field id="h-total" label="Total frequency" value={w.total} onChange={(x) => set({ total: x })} readOnly={readOnly} />
      </div>
      <H4>Chart</H4>
      <Pick<HeightChart> all={HEIGHT_CHARTS} label={HEIGHT_CHART_LABEL} value={w.chart} onChange={(x) => set({ chart: x }, `chart:${x ?? ''}`)} readOnly={readOnly} name="Kind of chart" />
      <FreqChart className="mt-2" labels={cs.map(classLabel)} freq={cs.map((_, k) => n(w.freq[k] ?? '') ?? 0)} kind={w.chart} xLabel="Height / cm" />
      <H4>Results</H4>
      <div className="flex flex-wrap items-center gap-3">
        <Field id="h-mean" label="Mean height" value={w.mean} onChange={(x) => set({ mean: x })} readOnly={readOnly} unit="cm" />
        <label className="flex items-center gap-1.5 text-[12.5px]">
          Modal class
          <select id="h-modal" value={w.modal ?? ''} disabled={readOnly} onChange={(e) => set({ modal: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Modal class" className={SEL}>
            <option value="">—</option>
            {cs.map((c, k) => (
              <option key={k} value={k}>
                {classLabel(c)} cm
              </option>
            ))}
          </select>
        </label>
        <Field id="h-range" label="Range" value={w.range} onChange={(x) => set({ range: x })} readOnly={readOnly} unit="cm" />
        <Field id="h-smean" label="Mean hand span" value={w.spanMean} onChange={(x) => set({ spanMean: x })} readOnly={readOnly} unit="cm" />
        <Field id="h-srange" label="Range of hand span" value={w.spanRange} onChange={(x) => set({ spanRange: x })} readOnly={readOnly} unit="cm" />
      </div>
      <H4>Conclusions</H4>
      <Chips<HeightClaim> all={HEIGHT_CLAIMS} label={HEIGHT_CLAIM_LABEL} value={w.claims} onChange={(x) => set({ claims: x }, 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ discontinuous

export function DiscNotebook({ state, v, readOnly, update, book, className }: { state: BioGeneticsState; v: BioGeneticsVariant; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.disc;
  const nCls = v.disc.n;
  const set = (patch: Partial<BioGeneticsState['disc']>, log?: string) => update((s) => ({ ...s, disc: { ...s.disc, ...patch } }), log);
  const setRow = (i: number, patch: Partial<DiscRow>) => update((s) => ({ ...s, disc: { ...s.disc, rows: padTo(s.disc.rows, i, () => ({ roll: '' as const, group: '' as const })).map((r, k) => (k === i ? { ...r, ...patch } : r)) } }));
  const setTot = (k: keyof BioGeneticsState['disc']['tot'], x: string) => set({ tot: { ...w.tot, [k]: x } });
  return (
    <Card className={box(book, className)}>
      <H3>Class survey sheet</H3>
      <Hint>Recorded {w.recordBy ? DISC_RECORD_LABEL[w.recordBy].toLowerCase() : '— choose how at the bench'}. R = roller, N = non-roller.</Hint>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3" role="table" aria-label="Survey">
        {Array.from({ length: nCls }, (_, i) => {
          const r = w.rows[i] ?? { roll: '', group: '' };
          return (
            <div key={i} className="flex items-center gap-1 text-[12px]" role="row">
              <span className="w-6 text-right tabular-nums text-muted-foreground">{i + 1}</span>
              <select id={`d-r-${i}`} value={r.roll} disabled={readOnly} onChange={(e) => setRow(i, { roll: e.target.value as DiscRow['roll'] })} aria-label={`Tongue rolling, classmate ${i + 1}`} className={SEL}>
                <option value="">–</option>
                <option value="R">R</option>
                <option value="N">N</option>
              </select>
              <select id={`d-g-${i}`} value={r.group} disabled={readOnly} onChange={(e) => setRow(i, { group: e.target.value as DiscRow['group'] })} aria-label={`Blood group, classmate ${i + 1}`} className={SEL}>
                <option value="">–</option>
                {DISC_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <H4>Tongue rolling</H4>
      <div className="flex flex-wrap items-center gap-3">
        <Field id="d-tr" label="Rollers" value={w.tot.r} onChange={(x) => setTot('r', x)} readOnly={readOnly} />
        <Field id="d-tn" label="Non-rollers" value={w.tot.n} onChange={(x) => setTot('n', x)} readOnly={readOnly} />
        <Field id="d-pr" label="% rollers" value={w.tot.pr} onChange={(x) => setTot('pr', x)} readOnly={readOnly} unit="%" />
        <Field id="d-pn" label="% non-rollers" value={w.tot.pn} onChange={(x) => setTot('pn', x)} readOnly={readOnly} unit="%" />
        <Field id="d-ar" label="Angle, rollers" value={w.tot.ar} onChange={(x) => setTot('ar', x)} readOnly={readOnly} unit="°" />
        <Field id="d-an" label="Angle, non-rollers" value={w.tot.an} onChange={(x) => setTot('an', x)} readOnly={readOnly} unit="°" />
      </div>
      <p className="mb-1 mt-2 text-[12px] text-muted-foreground">Chart for tongue rolling:</p>
      <Pick<DiscChart> all={DISC_CHARTS} label={DISC_CHART_LABEL} value={w.chartT} onChange={(x) => set({ chartT: x }, `chartT:${x ?? ''}`)} readOnly={readOnly} name="Chart for tongue rolling" />
      {w.chartT === 'PIE' ? (
        <PieSvg className="mt-2" parts={[{ label: 'Rollers', deg: n(w.tot.ar) ?? NaN }, { label: 'Non-rollers', deg: n(w.tot.an) ?? NaN }]} />
      ) : w.chartT ? (
        <FreqChart className="mt-2" labels={['Rollers', 'Non-rollers']} freq={[n(w.tot.r) ?? 0, n(w.tot.n) ?? 0]} kind={w.chartT === 'BAR' ? 'BAR' : 'HISTOGRAM'} xLabel="Tongue rolling" />
      ) : null}
      <H4>Blood groups</H4>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="border-collapse text-[12px]">
          <tbody>
            <tr>
              <th className="pr-2 text-left font-medium text-muted-foreground">Group</th>
              {DISC_GROUPS.map((g) => (
                <td key={g} className="px-0.5 text-center font-semibold">
                  {g}
                </td>
              ))}
            </tr>
            <tr>
              <th className="pr-2 text-left font-medium text-muted-foreground">Number</th>
              {DISC_GROUPS.map((g) => (
                <td key={g} className="px-0.5">
                  <Cell id={`d-gc-${g}`} value={w.grp[g]} onChange={(x) => set({ grp: { ...w.grp, [g]: x } })} readOnly={readOnly} label={`Number with group ${g}`} w="w-[3.6rem]" />
                </td>
              ))}
            </tr>
            <tr>
              <th className="pr-2 text-left font-medium text-muted-foreground">%</th>
              {DISC_GROUPS.map((g) => (
                <td key={g} className="px-0.5">
                  <Cell id={`d-gp-${g}`} value={w.gpct[g]} onChange={(x) => set({ gpct: { ...w.gpct, [g]: x } })} readOnly={readOnly} label={`Percentage with group ${g}`} w="w-[3.6rem]" />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mb-1 mt-2 text-[12px] text-muted-foreground">Chart for blood groups:</p>
      <Pick<DiscChart> all={DISC_CHARTS} label={DISC_CHART_LABEL} value={w.chartB} onChange={(x) => set({ chartB: x }, `chartB:${x ?? ''}`)} readOnly={readOnly} name="Chart for blood groups" />
      {w.chartB === 'PIE' ? (
        <PieSvg className="mt-2" parts={DISC_GROUPS.map((g) => ({ label: g, deg: ((n(w.gpct[g]) ?? 0) * 360) / 100 }))} />
      ) : w.chartB ? (
        <FreqChart className="mt-2" labels={[...DISC_GROUPS]} freq={DISC_GROUPS.map((g) => n(w.grp[g]) ?? 0)} kind={w.chartB === 'BAR' ? 'BAR' : 'HISTOGRAM'} xLabel="Blood group" />
      ) : null}
      <label className="mt-2 flex items-center gap-1.5 text-[12.5px]">
        Most common group
        <select id="d-most" value={w.most ?? ''} disabled={readOnly} onChange={(e) => set({ most: (e.target.value || null) as DiscGroup | null })} aria-label="Most common blood group" className={SEL}>
          <option value="">—</option>
          {DISC_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <H4>Conclusions</H4>
      <Chips<DiscClaim> all={DISC_CLAIMS} label={DISC_CLAIM_LABEL} value={w.claims} onChange={(x) => set({ claims: x }, 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ cross

const CLOSER_LABEL: Record<CrossCloser, string> = { OWN: 'My group’s result', CLASS: 'The class total' };
export function CrossNotebook({ state, v, readOnly, update, book, className }: { state: BioGeneticsState; v: BioGeneticsVariant; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.cross;
  const groups = v.cross.groups;
  const set = (patch: Partial<BioGeneticsState['cross']>, log?: string) => update((s) => ({ ...s, cross: { ...s.cross, ...patch } }), log);
  const setRow = (k: number, patch: Partial<CrossRow>) => update((s) => ({ ...s, cross: { ...s.cross, rows: s.cross.rows.map((r, j) => (j === k ? { ...r, ...patch } : r)) } }));
  const G = ['TT', 'Tt', 'tt'] as const;
  return (
    <Card className={box(book, className)}>
      <H3>Tally of draws</H3>
      <Hint>One row for each batch of ten draws.</Hint>
      {w.rows.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">A row appears for each batch of ten draws.</p>
      ) : (
        <table className="border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 pr-2 font-medium">Batch</th>
              {G.map((g) => (
                <th key={g} className="pb-1 pr-1 font-medium">
                  {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {w.rows.map((r, k) => (
              <tr key={k} className="border-t border-border">
                <td className="py-0.5 pr-2 tabular-nums">{k + 1}</td>
                {G.map((g) => (
                  <td key={g} className="py-0.5 pr-1">
                    <Cell id={`c-${k}-${g}`} value={r[g]} onChange={(x) => setRow(k, { [g]: x })} readOnly={readOnly} label={`${g} in batch ${k + 1}`} w="w-[3.4rem]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <H4>Totals and ratio</H4>
      <div className="flex flex-wrap items-center gap-3">
        {G.map((g) => (
          <Field key={g} id={`c-t${g}`} label={`Total ${g}`} value={w.tot[g]} onChange={(x) => set({ tot: { ...w.tot, [g]: x } })} readOnly={readOnly} />
        ))}
        <Field id="c-dom" label="Dominant (tall)" value={w.dom} onChange={(x) => set({ dom: x })} readOnly={readOnly} />
        <Field id="c-rec" label="Recessive (short)" value={w.rec} onChange={(x) => set({ rec: x })} readOnly={readOnly} />
        <Field id="c-ratio" label="Ratio dominant : recessive =" value={w.ratio} onChange={(x) => set({ ratio: x })} readOnly={readOnly} unit=": 1" />
      </div>
      <H4>Expected</H4>
      <div className="flex flex-wrap items-center gap-3">
        <Field id="c-edom" label="Expected dominant" value={w.expDom} onChange={(x) => set({ expDom: x })} readOnly={readOnly} />
        <Field id="c-erec" label="Expected recessive" value={w.expRec} onChange={(x) => set({ expRec: x })} readOnly={readOnly} />
        <Field id="c-ptt" label="Probability of tt" value={w.ptt} onChange={(x) => set({ ptt: x })} readOnly={readOnly} />
      </div>
      <H4>Class results</H4>
      <table className="border-collapse text-[12px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-3 font-medium">Group</th>
            <th className="pr-3 font-medium">Dominant</th>
            <th className="font-medium">Recessive</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {groups.map((g, k) => (
            <tr key={k}>
              <td className="pr-3">{k + 1}</td>
              <td className="pr-3">{g.TT + g.Tt}</td>
              <td>{g.tt}</td>
            </tr>
          ))}
          <tr className="text-muted-foreground">
            <td className="pr-3">8 (you)</td>
            <td className="pr-3">{w.dom || '—'}</td>
            <td>{w.rec || '—'}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Field id="c-cdom" label="Class dominant" value={w.clsDom} onChange={(x) => set({ clsDom: x })} readOnly={readOnly} />
        <Field id="c-crec" label="Class recessive" value={w.clsRec} onChange={(x) => set({ clsRec: x })} readOnly={readOnly} />
        <Field id="c-cratio" label="Class ratio =" value={w.clsRatio} onChange={(x) => set({ clsRatio: x })} readOnly={readOnly} unit=": 1" />
      </div>
      <p className="mb-1 mt-2 text-[12px] text-muted-foreground">Which is closer to 3 : 1?</p>
      <Pick<CrossCloser> all={CROSS_CLOSER} label={CLOSER_LABEL} value={w.closer} onChange={(x) => set({ closer: x })} readOnly={readOnly} name="Closer to 3 : 1" />
      <H4>Conclusions</H4>
      <Chips<CrossClaim> all={CROSS_CLAIMS} label={CROSS_CLAIM_LABEL} value={w.claims} onChange={(x) => set({ claims: x }, 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ food

export function FoodNotebook({ state, v, readOnly, update, book, className }: { state: BioGeneticsState; v: BioGeneticsVariant; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.food;
  const energy = v.food.energy;
  const set = (patch: Partial<BioGeneticsState['food']>, log?: string) => update((s) => ({ ...s, food: { ...s.food, ...patch } }), log);
  const [chain, setChain] = useState<FoodOrg[]>([]);
  const [food, setFood] = useState<FoodOrg>('GRASS');
  const [feeder, setFeeder] = useState<FoodOrg>('GRASSHOPPER');
  const addLinks = (ls: string[]) => set({ links: [...new Set([...w.links, ...ls])].slice(0, 40) }, 'web');
  const wn = Object.fromEntries(FOOD_LEVELS.map((L) => [L, n(w.widthN[L])])) as Partial<Record<FoodLevel, number>>;
  const we = Object.fromEntries(FOOD_LEVELS.map((L) => [L, n(w.widthE[L])])) as Partial<Record<FoodLevel, number>>;
  return (
    <Card className={box(book, className)}>
      <H3>Field record</H3>
      <Hint>The number of each organism in the study area, from your field spots.</Hint>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
        {FOOD_ORGS.map((o) => (
          <Field key={o} id={`f-n-${o}`} label={FOOD_ORG_LABEL[o]} value={w.counts[o]} onChange={(x) => set({ counts: { ...w.counts, [o]: x } })} readOnly={readOnly} />
        ))}
      </div>
      <H4>Arrows</H4>
      <Pick<FoodArrow> all={FOOD_ARROWS} label={FOOD_ARROW_LABEL} value={w.arrow} onChange={(x) => set({ arrow: x }, `arrow:${x ?? ''}`)} readOnly={readOnly} name="Arrow direction" />
      <H4>Food chains</H4>
      <ol className="mb-2 space-y-1 text-[12.5px]">
        {w.chains.map((c, k) => (
          <li key={k} className="flex flex-wrap items-center gap-2">
            <span>
              {k + 1}. {c.map((o) => FOOD_ORG_LABEL[o]).join(' → ')}
            </span>
            {!readOnly && (
              <button type="button" className="text-[11.5px] text-danger underline" onClick={() => set({ chains: w.chains.filter((_, j) => j !== k) }, 'chain-off')}>
                remove
              </button>
            )}
          </li>
        ))}
      </ol>
      {!readOnly && w.chains.length < FOOD_MAX_CHAINS && (
        <div className="rounded-lg border border-dashed border-border p-2">
          <p className="text-[12px]">New chain: {chain.length ? chain.map((o) => FOOD_ORG_LABEL[o]).join(' → ') : 'tap the organisms in order, the food first'}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {FOOD_ORGS.map((o) => (
              <button key={o} type="button" disabled={chain.includes(o)} onClick={() => setChain([...chain, o])} className={cn(CHIP, 'border-border hover:bg-muted')} aria-label={`Chain: add ${FOOD_ORG_LABEL[o]}`}>
                + {FOOD_ORG_LABEL[o]}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <Button size="sm" variant="brand" disabled={chain.length < 2} onClick={() => (set({ chains: [...w.chains, chain] }, 'chain'), setChain([]))}>
              Add this chain
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChain([])}>
              Clear
            </Button>
          </div>
        </div>
      )}
      <H4>Food web</H4>
      {!readOnly && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <select value={food} onChange={(e) => setFood(e.target.value as FoodOrg)} aria-label="Food (eaten)" className={SEL}>
            {FOOD_ORGS.map((o) => (
              <option key={o} value={o}>
                {FOOD_ORG_LABEL[o]}
              </option>
            ))}
          </select>
          <span>is eaten by</span>
          <select value={feeder} onChange={(e) => setFeeder(e.target.value as FoodOrg)} aria-label="Feeder (eater)" className={SEL}>
            {FOOD_ORGS.map((o) => (
              <option key={o} value={o}>
                {FOOD_ORG_LABEL[o]}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={food === feeder} onClick={() => addLinks([foodLink(food, feeder)])}>
            Add the arrow
          </Button>
          <Button size="sm" variant="outline" disabled={!w.chains.length} onClick={() => addLinks(w.chains.flatMap((c) => c.slice(1).map((o, k) => foodLink(c[k]!, o))))}>
            Add the arrows of my chains
          </Button>
        </div>
      )}
      <WebSvg links={w.links} />
      <div className="mt-1 flex flex-wrap gap-1">
        {w.links.map((l) => {
          const [a, b] = l.split('>') as [FoodOrg, FoodOrg];
          return (
            <button key={l} type="button" disabled={readOnly} onClick={() => set({ links: w.links.filter((x) => x !== l) }, 'web-off')} className={cn(CHIP, 'border-border')} aria-label={`Remove arrow ${FOOD_ORG_LABEL[a]} to ${FOOD_ORG_LABEL[b]}`}>
              {FOOD_ORG_LABEL[a] ?? a} → {FOOD_ORG_LABEL[b] ?? b} ✕
            </button>
          );
        })}
      </div>
      <H4>Trophic levels</H4>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
        {FOOD_ORGS.map((o) => (
          <label key={o} className="flex items-center justify-between gap-1.5 text-[12.5px]">
            {FOOD_ORG_LABEL[o]}
            <select id={`f-l-${o}`} value={w.levels[o]} disabled={readOnly} onChange={(e) => set({ levels: { ...w.levels, [o]: e.target.value as '' | FoodLevel } })} aria-label={`Trophic level of ${FOOD_ORG_LABEL[o]}`} className={SEL}>
              <option value="">—</option>
              {FOOD_LEVELS.map((L) => (
                <option key={L} value={L}>
                  {FOOD_LEVEL_LABEL[L]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <H4>Pyramid of numbers ({FOOD_CHAIN_MAIN.map((o) => FOOD_ORG_LABEL[o].replace(' (agama)', '')).join(' → ')})</H4>
      <Hint>Bar width (mm) = number ÷ your scale.</Hint>
      <div className="flex flex-wrap items-center gap-3">
        <Field id="f-sn" label="Scale: 1 mm =" value={w.scaleN} onChange={(x) => set({ scaleN: x })} readOnly={readOnly} unit="organisms" />
        {FOOD_LEVELS.map((L, k) => (
          <Field key={L} id={`f-wn-${L}`} label={`${FOOD_ORG_LABEL[FOOD_CHAIN_MAIN[k]!].replace(' (agama)', '')} width`} value={w.widthN[L]} onChange={(x) => set({ widthN: { ...w.widthN, [L]: x } })} readOnly={readOnly} unit="mm" />
        ))}
      </div>
      <PyramidSvg className="mt-2" widths={wn} title="Pyramid of numbers" unit="mm" />
      <H4>Pyramid of energy</H4>
      <Hint>
        Data card (kJ/m²/year): {FOOD_LEVELS.map((L) => `${FOOD_LEVEL_LABEL[L].toLowerCase()} ${energy[L]}`).join(', ')}.
      </Hint>
      <div className="flex flex-wrap items-center gap-3">
        <Field id="f-se" label="Scale: 1 mm =" value={w.scaleE} onChange={(x) => set({ scaleE: x })} readOnly={readOnly} unit="kJ" />
        {FOOD_LEVELS.map((L) => (
          <Field key={L} id={`f-we-${L}`} label={`${FOOD_LEVEL_LABEL[L].replace(' consumer', '')} width`} value={w.widthE[L]} onChange={(x) => set({ widthE: { ...w.widthE, [L]: x } })} readOnly={readOnly} unit="mm" />
        ))}
      </div>
      <PyramidSvg className="mt-2" widths={we} title="Pyramid of energy" unit="mm" />
      <H4>Results</H4>
      <Field id="f-eff" label="Efficiency, producers → primary consumers" value={w.eff} onChange={(x) => set({ eff: x })} readOnly={readOnly} unit="%" />
      <p className="mb-1 mt-2 text-[12px] text-muted-foreground">Which pyramid can be inverted?</p>
      <Pick<FoodInvert> all={FOOD_INVERT} label={FOOD_INVERT_LABEL} value={w.invert} onChange={(x) => set({ invert: x })} readOnly={readOnly} name="Inverted pyramid" />
      <H4>Conclusions</H4>
      <Chips<FoodClaim> all={FOOD_CLAIMS} label={FOOD_CLAIM_LABEL} value={w.claims} onChange={(x) => set({ claims: x }, 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ written answers

export const EXPLAIN_Q = {
  HEIGHT: 'Explain why height shows continuous variation and why most students are near the middle of the range.',
  DISCRETE: 'Explain why tongue rolling and blood groups show discontinuous variation.',
  CROSS: 'Explain why Tt × Tt is expected to give 3 : 1, and why your result was not exactly 3 : 1.',
  FOOD: 'Explain why numbers and energy decrease at each higher trophic level, and why food chains are short.',
};
const PREC_PH = { HEIGHT: 'e.g. shoes were taken off…', DISCRETE: 'e.g. each person had several attempts…', CROSS: 'e.g. the beads were drawn without looking…', FOOD: 'e.g. the arrows point from the eaten to the eater…' };

export function Written({ state, readOnly, update, className }: { state: BioGeneticsState; readOnly: boolean; update: Update; className?: string }) {
  const task = state.task ?? 'HEIGHT';
  const set = (k: 'precautions' | 'explain', val: string) => update((s) => ({ ...s, written: { ...s.written, [k]: val.slice(0, 2000) } }));
  return (
    <Card className={cn('space-y-3 p-4 sm:p-5', className)}>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="gen-prec">
          Two precautions you took
        </label>
        <Textarea id="gen-prec" rows={3} value={state.written.precautions} disabled={readOnly} onChange={(e) => set('precautions', e.target.value)} placeholder={PREC_PH[task]} />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="gen-explain">
          {EXPLAIN_Q[task]}
        </label>
        <Textarea id="gen-explain" rows={3} value={state.written.explain} disabled={readOnly} onChange={(e) => set('explain', e.target.value)} />
      </div>
    </Card>
  );
}

/** The notebook of the state's task. */
export function GenNotebook(p: { state: BioGeneticsState; v: BioGeneticsVariant; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const task = p.state.task ?? 'HEIGHT';
  return task === 'DISCRETE' ? <DiscNotebook {...p} /> : task === 'CROSS' ? <CrossNotebook {...p} /> : task === 'FOOD' ? <FoodNotebook {...p} /> : <HeightNotebook {...p} />;
}
