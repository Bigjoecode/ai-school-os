import {
  BREATH_CLAIMS,
  BREATH_CLAIM_LABEL,
  BREATH_TIDAL,
  PULSE_AXES,
  PULSE_AXIS_LABEL,
  PULSE_CLAIMS,
  PULSE_CLAIM_LABEL,
  PULSE_CURVES,
  PULSE_CURVE_LABEL,
  REACT_CLAIMS,
  REACT_CLAIM_LABEL,
  REACT_CONDS,
  REACT_COND_SHORT,
  SKIN_AREAS,
  SKIN_AREA_LABEL,
  SKIN_CLAIMS,
  SKIN_CLAIM_LABEL,
  pulseExEnd,
  type BioHumanState,
  type BreathClaim,
  type PulseAxis,
  type PulseClaim,
  type PulseCurve,
  type ReactClaim,
  type ReactFaster,
  type ReactRow,
  type ReactTrend,
  type SkinArea,
  type SkinClaim,
  type SkinRow,
} from '@aischool/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { fmtMin, type HumanUpdate as Update } from './actions';
import { PulseGraph, SkinBars } from './visuals';

/**
 * The notebook of each task — the pulse table, graph and recovery; the lime
 * water, mirror, temperature and breathing records; the ruler-drop table and
 * comparisons; the two-point table, bar chart and ranking — and the written
 * answers: the same record in the 2D lab and in the 3D lab's notebook
 * (`book`: exercise-book styling).
 */

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60 text-left';
const box = (book?: boolean, className?: string) => cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className);
const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">{children}</h3>;
const H4 = ({ children }: { children: React.ReactNode }) => <h4 className="mb-1 mt-4 text-[13px] font-semibold">{children}</h4>;
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
const Obs = ({ id, label, value, onChange, readOnly }: { id: string; label: string; value: string; onChange: (v: string) => void; readOnly: boolean }) => (
  <div className="mt-2">
    <label className="mb-1 block text-[12.5px] font-medium" htmlFor={id}>
      {label}
    </label>
    <Textarea id={id} rows={2} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value.slice(0, 600))} />
  </div>
);

// ------------------------------------------------------------------ pulse

export function PulseNotebook({ state, readOnly, update, book, className }: { state: BioHumanState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.pulse;
  const end = pulseExEnd(w);
  const set = (patch: Partial<BioHumanState['pulse']>, log?: string) => update((s) => ({ ...s, pulse: { ...s.pulse, ...patch } }), log);
  const setRow = (n: number, patch: Partial<{ beats: string; bpm: string }>) => update((s) => ({ ...s, pulse: { ...s.pulse, rows: s.pulse.rows.map((r, k) => (k === n ? { ...r, ...patch } : r)) } }));
  const points = w.counts
    .map((c, n) => ({ c, n, y: Number(w.rows[n]?.bpm) }))
    .filter((x) => end !== null && x.c.at >= end - 1e-9 && w.rows[x.n]?.bpm.trim() && Number.isFinite(x.y))
    .map((x) => ({ x: Math.round((x.c.at - end!) * 100) / 100, y: x.y }));
  const rest = Number(w.restMean);
  return (
    <Card className={box(book, className)}>
      <H3>Table of results</H3>
      <p className="mb-3 text-[12px] text-muted-foreground">One row for each count. Beats per minute = beats × 60 ÷ seconds counted (× 4 for 15 s).</p>
      {w.counts.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">A row appears each time you count the pulse.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[440px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-1 font-medium">#</th>
                <th className="pb-1 pr-1 font-medium">When</th>
                <th className="pb-1 pr-1 font-medium">Counted for</th>
                <th className="pb-1 pr-1 font-medium">Beats</th>
                <th className="pb-1 pr-1 font-medium">Beats / min</th>
              </tr>
            </thead>
            <tbody>
              {w.counts.map((c, n) => {
                const r = w.rows[n] ?? { beats: '', bpm: '' };
                const after = end !== null && c.at >= end - 1e-9;
                return (
                  <tr key={n} className="border-t border-border align-middle">
                    <td className="py-1 pr-1">{n + 1}</td>
                    <td className="py-1 pr-1">{after ? `${fmtMin(c.at - end!)} after exercise` : `rest, ${fmtMin(c.at)} sitting`}</td>
                    <td className="py-1 pr-1">
                      {c.dur} s{c.thumb ? ' (thumb)' : ''}
                    </td>
                    <td className="py-1 pr-1">
                      <Cell id={`pulse-beats-${n}`} value={r.beats} onChange={(x) => setRow(n, { beats: x })} readOnly={readOnly} label={`Beats, count ${n + 1}`} />
                    </td>
                    <td className="py-1 pr-1">
                      <Cell id={`pulse-bpm-${n}`} value={r.bpm} onChange={(x) => setRow(n, { bpm: x })} readOnly={readOnly} label={`Beats per minute, count ${n + 1}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <Field id="pulse-rest" label="Mean resting rate" value={w.restMean} onChange={(x) => set({ restMean: x })} readOnly={readOnly} unit="beats/min" />
        <Field id="pulse-inc" label="% increase" value={w.increase} onChange={(x) => set({ increase: x })} readOnly={readOnly} unit="%" />
        <Field id="pulse-rec" label="Recovery time" value={w.recovery} onChange={(x) => set({ recovery: x })} readOnly={readOnly} unit="min" />
      </div>
      <H4>Graph: pulse rate against time after exercise</H4>
      <div className="mb-2 space-y-1">
        <Pick<PulseAxis> all={PULSE_AXES} label={PULSE_AXIS_LABEL} value={w.axis} onChange={(x) => set({ axis: x }, `axis:${x ?? '-'}`)} readOnly={readOnly} name="Axes" />
        <Pick<PulseCurve> all={PULSE_CURVES} label={PULSE_CURVE_LABEL} value={w.curve} onChange={(x) => set({ curve: x }, `curve:${x ?? '-'}`)} readOnly={readOnly} name="Line" />
      </div>
      <PulseGraph points={points} axis={w.axis} curve={w.curve} rest={Number.isFinite(rest) && w.restMean.trim() ? rest : null} />
      <H4>Conclusions</H4>
      <Chips<PulseClaim> all={PULSE_CLAIMS} label={PULSE_CLAIM_LABEL} value={w.claims} onChange={(next) => set({ claims: next }, 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ breath

export function BreathNotebook({ state, readOnly, update, book, className }: { state: BioHumanState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.breath;
  const set = (patch: Partial<BioHumanState['breath']>, log?: string) => update((s) => ({ ...s, breath: { ...s.breath, ...patch } }), log);
  return (
    <Card className={box(book, className)}>
      <H3>Lime water</H3>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-medium">Turned milky first:</span>
        <Pick<'A' | 'B'> all={['A', 'B']} label={{ A: 'Tube A (inhaled air)', B: 'Tube B (exhaled air)' }} value={w.firstMilky} onChange={(x) => set({ firstMilky: x }, `first:${x ?? '-'}`)} readOnly={readOnly} name="Turned milky first" />
      </div>
      <Obs id="breath-a" label="Tube A (inhaled air): what you saw" value={w.obsA} onChange={(x) => set({ obsA: x })} readOnly={readOnly} />
      <Obs id="breath-b" label="Tube B (exhaled air): what you saw" value={w.obsB} onChange={(x) => set({ obsB: x })} readOnly={readOnly} />
      <H4>Mirror and cobalt chloride paper</H4>
      <Obs id="breath-mirror" label="What you saw" value={w.mirrorObs} onChange={(x) => set({ mirrorObs: x })} readOnly={readOnly} />
      <H4>Temperature</H4>
      <div className="flex flex-wrap gap-3">
        <Field id="breath-room" label="Room air" value={w.roomT} onChange={(x) => set({ roomT: x })} readOnly={readOnly} unit="°C" />
        <Field id="breath-bulb" label="Breath on the bulb" value={w.breathT} onChange={(x) => set({ breathT: x })} readOnly={readOnly} unit="°C" />
        <Field id="breath-rise" label="Rise" value={w.rise} onChange={(x) => set({ rise: x })} readOnly={readOnly} unit="°C" />
      </div>
      <H4>Breathing rate at rest</H4>
      {w.counts === 0 ? (
        <p className="py-1 text-[13px] text-muted-foreground">A box appears for each one-minute count.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {w.rows.map((r, k) => (
            <label key={k} className="flex items-center gap-1 text-[12.5px]">
              Count {k + 1}
              <Cell id={`breath-r${k}`} value={r} onChange={(x) => update((s) => ({ ...s, breath: { ...s.breath, rows: s.breath.rows.map((y, i) => (i === k ? x : y)) } }))} readOnly={readOnly} label={`Breaths in one minute, count ${k + 1}`} />
            </label>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-3">
        <Field id="breath-mean" label="Mean rate" value={w.meanRate} onChange={(x) => set({ meanRate: x })} readOnly={readOnly} unit="breaths/min" />
        <Field id="breath-vent" label={`Ventilation (× ${BREATH_TIDAL} cm³)`} value={w.vent} onChange={(x) => set({ vent: x })} readOnly={readOnly} unit="cm³/min" />
        <Field id="breath-ratio" label="CO₂ out ÷ CO₂ in (4 ÷ 0.04)" value={w.ratio} onChange={(x) => set({ ratio: x })} readOnly={readOnly} unit="times" />
      </div>
      <H4>Conclusions</H4>
      <Chips<BreathClaim> all={BREATH_CLAIMS} label={BREATH_CLAIM_LABEL} value={w.claims} onChange={(next) => set({ claims: next }, 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ reaction

export function ReactNotebook({ state, readOnly, update, book, className }: { state: BioHumanState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.react;
  const set = (patch: Partial<BioHumanState['react']>, log?: string) => update((s) => ({ ...s, react: { ...s.react, ...patch } }), log);
  const setRow = (k: number, patch: Partial<ReactRow>) => update((s) => ({ ...s, react: { ...s.react, rows: s.react.rows.map((r, i) => (i === k ? { ...r, ...patch } : r)) } }));
  const used = REACT_CONDS.filter((c) => w.drops.some((d) => d.cond === c));
  return (
    <Card className={box(book, className)}>
      <H3>Knee-jerk</H3>
      <Obs id="react-knee" label="What happened when the tendon below the kneecap was tapped" value={w.kneeObs} onChange={(x) => set({ kneeObs: x })} readOnly={readOnly} />
      <H4>Ruler-drop distances (cm, at the top of the thumb)</H4>
      <p className="mb-2 text-[12px] text-muted-foreground">t = √(2d ÷ g), d in metres, g = 9.8 m/s².</p>
      {used.length === 0 ? (
        <p className="py-1 text-[13px] text-muted-foreground">A row appears for each hand or condition once you drop the rule.</p>
      ) : (
        used.map((c) => {
          const k = REACT_CONDS.indexOf(c);
          const r = w.rows[k]!;
          return (
            <div key={c} className="mb-3 rounded-lg border border-border p-2">
              <p className="mb-1 text-[12.5px] font-semibold">{REACT_COND_SHORT[c]}</p>
              <div className="flex flex-wrap gap-1">
                {r.ds.map((d, i) => (
                  <Cell key={i} id={`react-${c}-${i}`} value={d} onChange={(x) => setRow(k, { ds: r.ds.map((y, j) => (j === i ? x : y)) })} readOnly={readOnly} label={`${REACT_COND_SHORT[c]}, drop ${i + 1} (cm)`} w="w-[3.6rem]" />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                <Field id={`react-${c}-mean`} label="Mean" value={r.mean} onChange={(x) => setRow(k, { mean: x })} readOnly={readOnly} unit="cm" />
                <Field id={`react-${c}-m`} label="Mean" value={r.m} onChange={(x) => setRow(k, { m: x })} readOnly={readOnly} unit="m" />
                <Field id={`react-${c}-t`} label="Reaction time t" value={r.t} onChange={(x) => setRow(k, { t: x })} readOnly={readOnly} unit="s" />
              </div>
            </div>
          );
        })
      )}
      <H4>Comparisons</H4>
      <div className="space-y-2 text-[12.5px]">
        <div>
          <p className="mb-1">Which hand reacted faster?</p>
          <Pick<ReactFaster> all={['DOM', 'NONDOM', 'SAME']} label={{ DOM: 'Dominant hand', NONDOM: 'Non-dominant hand', SAME: 'About the same' }} value={w.faster} onChange={(x) => set({ faster: x }, `faster:${x ?? '-'}`)} readOnly={readOnly} name="Faster hand" />
        </div>
        <div>
          <p className="mb-1">With practice (first three against last three dominant catches) the distance got…</p>
          <Pick<ReactTrend> all={['SHORTER', 'LONGER', 'SAME']} label={{ SHORTER: 'Shorter', LONGER: 'Longer', SAME: 'No clear change' }} value={w.trend} onChange={(x) => set({ trend: x }, `trend:${x ?? '-'}`)} readOnly={readOnly} name="Effect of practice" />
        </div>
        {used.includes('EYES') && (
          <div>
            <p className="mb-1">With eyes closed (cue “now”) the reaction was…</p>
            <Pick<'SLOWER' | 'FASTER' | 'SAME'> all={['SLOWER', 'FASTER', 'SAME']} label={{ SLOWER: 'Slower', FASTER: 'Faster', SAME: 'About the same' }} value={w.eyes} onChange={(x) => set({ eyes: x }, `eyes:${x ?? '-'}`)} readOnly={readOnly} name="Eyes closed" />
          </div>
        )}
      </div>
      <H4>Conclusions</H4>
      <Chips<ReactClaim> all={REACT_CLAIMS} label={REACT_CLAIM_LABEL} value={w.claims} onChange={(next) => set({ claims: next }, 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ skin

export function SkinNotebook({ state, readOnly, update, book, className }: { state: BioHumanState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.skin;
  const set = (patch: Partial<BioHumanState['skin']>, log?: string) => update((s) => ({ ...s, skin: { ...s.skin, ...patch } }), log);
  const setRow = (a: SkinArea, patch: Partial<SkinRow>) => update((s) => ({ ...s, skin: { ...s.skin, rows: s.skin.rows.map((r, i) => (SKIN_AREAS[i] === a ? { ...r, ...patch } : r)) } }));
  const used = SKIN_AREAS.filter((a) => w.trials.some((t) => t.area === a));
  const vals = Object.fromEntries(SKIN_AREAS.map((a, i) => [a, Number(w.rows[i]?.thr)]).filter(([, x], i) => w.rows[i]?.thr.trim() && Number.isFinite(x as number))) as Partial<Record<SkinArea, number>>;
  const cols: { k: keyof SkinRow; h: string }[] = [
    { k: 'thr', h: 'Smallest separation felt as two / mm' },
    { k: 'n', h: 'Touches' },
    { k: 'ok', h: 'Correct' },
    { k: 'pct', h: '% correct' },
  ];
  return (
    <Card className={box(book, className)}>
      <H3>Table of results</H3>
      <p className="mb-3 text-[12px] text-muted-foreground">Count every touch on an area, single and double; % correct = correct ÷ touches × 100.</p>
      {used.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">A row appears for each area once you touch it.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[440px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-1 font-medium">Area</th>
                {cols.map((c) => (
                  <th key={c.k} className="pb-1 pr-1 font-medium">
                    {c.h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {used.map((a) => {
                const r = w.rows[SKIN_AREAS.indexOf(a)]!;
                return (
                  <tr key={a} className="border-t border-border align-middle">
                    <td className="py-1 pr-1">{SKIN_AREA_LABEL[a]}</td>
                    {cols.map((c) => (
                      <td key={c.k} className="py-1 pr-1">
                        <Cell id={`skin-${c.k}-${a}`} value={r[c.k]} onChange={(x) => setRow(a, { [c.k]: x })} readOnly={readOnly} label={`${c.h}, ${SKIN_AREA_LABEL[a]}`} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <H4>Bar chart of thresholds</H4>
      <div className="mb-2 flex flex-wrap gap-1">
        {used.map((a) => {
          const on = w.bars.includes(a);
          return (
            <button key={a} type="button" aria-pressed={on} disabled={readOnly || (!on && vals[a] === undefined)} onClick={() => set({ bars: on ? w.bars.filter((b) => b !== a) : SKIN_AREAS.filter((k) => k === a || w.bars.includes(k)) }, on ? `bar-off:${a}` : `bar:${a}`)} className={cn(CHIP, on ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
              {on ? '✓ ' : '+ '}
              {SKIN_AREA_LABEL[a]}
            </button>
          );
        })}
      </div>
      <SkinBars bars={w.bars} vals={vals} />
      <H4>Rank the areas: most sensitive first</H4>
      <p className="mb-1 text-[12px] text-muted-foreground">Tap the areas in order. Tap again to remove.</p>
      <div className="mb-1 flex flex-wrap gap-1">
        {used.map((a) => {
          const i = w.rank.indexOf(a);
          return (
            <button key={a} type="button" disabled={readOnly} onClick={() => set({ rank: i >= 0 ? w.rank.filter((x) => x !== a) : [...w.rank, a] }, 'rank')} className={cn(CHIP, i >= 0 ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
              {i >= 0 ? `${i + 1}. ` : ''}
              {SKIN_AREA_LABEL[a]}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Field id="skin-ratio" label="Forearm ÷ fingertip" value={w.ratio} onChange={(x) => set({ ratio: x })} readOnly={readOnly} unit="times" />
        <label className="flex items-center gap-1.5 text-[12.5px]">
          Most sensitive
          <select value={w.most ?? ''} disabled={readOnly} onChange={(e) => set({ most: (e.target.value || null) as SkinArea | null })} aria-label="Most sensitive area" className="h-8 rounded-md border border-input bg-card px-1 text-[12.5px]">
            <option value="">—</option>
            {used.map((a) => (
              <option key={a} value={a}>
                {SKIN_AREA_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <H4>Conclusions</H4>
      <Chips<SkinClaim> all={SKIN_CLAIMS} label={SKIN_CLAIM_LABEL} value={w.claims} onChange={(next) => set({ claims: next }, 'claims')} readOnly={readOnly} name="Conclusions" />
    </Card>
  );
}

// ------------------------------------------------------------------ written answers

export const EXPLAIN_Q = {
  PULSE: 'Explain why the pulse rate rose during exercise and why it took several minutes to return to the resting rate.',
  BREATH: 'Explain why the lime water in tube B turned milky first, and why exhaled air is warmer and moister.',
  REACTION: 'Explain why catching the ruler is voluntary and the knee-jerk a reflex, and why practice shortened the catch distance.',
  SKIN: 'Explain why two points are felt at a smaller separation on the fingertip than on the forearm.',
};
const PREC_PH = { PULSE: 'e.g. my partner rested for 5 minutes first…', BREATH: 'e.g. my partner breathed gently…', REACTION: 'e.g. the rule was dropped without warning…', SKIN: 'e.g. the subject was blindfolded…' };

export function Written({ state, readOnly, update, className }: { state: BioHumanState; readOnly: boolean; update: Update; className?: string }) {
  const task = state.task ?? 'PULSE';
  const set = (k: 'precautions' | 'explain', val: string) => update((s) => ({ ...s, written: { ...s.written, [k]: val.slice(0, 2000) } }));
  return (
    <Card className={cn('space-y-3 p-4 sm:p-5', className)}>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="human-prec">
          Two precautions you took
        </label>
        <Textarea id="human-prec" rows={3} value={state.written.precautions} disabled={readOnly} onChange={(e) => set('precautions', e.target.value)} placeholder={PREC_PH[task]} />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="human-explain">
          {EXPLAIN_Q[task]}
        </label>
        <Textarea id="human-explain" rows={3} value={state.written.explain} disabled={readOnly} onChange={(e) => set('explain', e.target.value)} />
      </div>
    </Card>
  );
}
