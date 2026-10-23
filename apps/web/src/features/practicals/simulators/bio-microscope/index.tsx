import {
  MICRO_FOCUS_TOL,
  MICRO_MEDIA,
  MICRO_MEDIUM_LABELS,
  MICRO_OBJECTIVES,
  MICRO_PRACTICAL_SLIDES,
  MICRO_SLIDES,
  MICRO_SLIDE_INFO,
  bioMicroscopeVariant,
  emptyBioMicroscopeState,
  microBrightness,
  type BioMicroscopeState,
  type BioMicroscopeVariant,
  type MicroObjective,
  type MicroScope,
  type MicroTaskId,
} from '@aischool/shared';
import { Camera, ChevronDown, Lightbulb, Microscope, Minus, Plus, Ruler } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, inputClass } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DrawingChecklist, LabelBoard, Step } from '../bio-common';
import type { SimulatorProps } from '../types';
import { FieldContent, FieldView, VIEW_R, viewScale } from './field';

type Update = (fn: (s: BioMicroscopeState) => BioMicroscopeState, log?: string) => void;

/** What to do next (practice mode only). */
function nextHint(s: BioMicroscopeState, v: BioMicroscopeVariant): string {
  const info = v.info;
  if (!s.prep.medium) return 'Choose what to mount the specimen in: think about what each stain shows.';
  if (!s.prep.coverslip) return 'Add the cover slip.';
  if (!s.prep.placed) return 'Place the slide on the stage and clip it.';
  const dz = s.scope.coarse + s.scope.fine - v.focus[s.scope.objective];
  const b = microBrightness(s.scope.lamp, s.scope.diaphragm, s.scope.objective);
  if (b < 0.3) return 'The field is dark: turn up the lamp (or open the diaphragm).';
  if (!s.flags.focusedLow) return s.scope.objective === 40 ? 'Go back to a low-power objective and focus there first.' : 'Raise the stage with the coarse focus until the specimen appears, then sharpen it with the fine focus.';
  if (!s.captures.some((c) => c.objective === info.measureObjective)) return s.scope.objective !== info.measureObjective ? `Turn to the ×${info.measureObjective} objective.` : Math.abs(dz) > MICRO_FOCUS_TOL[s.scope.objective] ? 'Sharpen the image with the fine focus.' : `Capture this ×${info.measureObjective} view for measuring.`;
  if (!s.captures.some((c) => c.objective === info.labelObjective)) return s.scope.objective !== info.labelObjective ? `Turn to the ×${info.labelObjective} objective — use only the fine focus at high power.` : Math.abs(dz) > MICRO_FOCUS_TOL[s.scope.objective] ? 'Use the fine focus until the edges are sharp.' : `Capture this ×${info.labelObjective} view for labelling.`;
  return 'Label the structures, measure, calculate, then write your observations and precautions.';
}

export default function BioMicroscopeLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'bio-microscope'>) {
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const fromLesson = practicalId ? MICRO_PRACTICAL_SLIDES[practicalId] : undefined;
  const update: Update = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  useEffect(() => {
    if (!readOnly && !ref.current.slide && fromLesson) update((s) => ({ ...s, slide: fromLesson }), `slide:${fromLesson}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLesson, readOnly]);
  const v = useMemo(() => (state.slide ? bioMicroscopeVariant(seed, state.slide) : null), [seed, state.slide]);

  if (!state.slide || !v) {
    return (
      <Card className="p-4 sm:p-5">
        <h3 className="mb-1 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
          <Microscope className="size-4 text-muted-foreground" aria-hidden /> Choose a slide
        </h3>
        <p className="mb-3 text-[13px] text-muted-foreground">{readOnly ? 'No slide was chosen.' : 'Which specimen will you examine?'}</p>
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-2">
            {MICRO_SLIDES.map((sl) => (
              <Button key={sl} variant="outline" className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => update(() => ({ ...emptyBioMicroscopeState(), slide: sl }), `slide:${sl}`)}>
                {MICRO_SLIDE_INFO[sl].title}
              </Button>
            ))}
          </div>
        )}
      </Card>
    );
  }
  return <Lab v={v} mode={mode} state={state} readOnly={readOnly} update={update} canChange={!fromLesson && !state.prep.medium} t0={t0} />;
}

function Lab({ v, mode, state, readOnly, update, canChange, t0 }: { v: BioMicroscopeVariant; mode: string; state: BioMicroscopeState; readOnly: boolean; update: Update; canChange: boolean; t0: number }) {
  const [brief, setBrief] = useState(true);
  const [graticule, setGraticule] = useState(v.info.method === 'GRATICULE');
  const [pointer, setPointer] = useState(v.info.method === 'COUNT');
  const info = v.info;
  const sc = state.scope;
  const dz = sc.coarse + sc.fine - v.focus[sc.objective];
  const inFocus = state.prep.placed && Math.abs(dz) <= MICRO_FOCUS_TOL[sc.objective];

  const setScope = (patch: Partial<MicroScope>, kind: 'coarse' | 'fine' | 'objective' | 'light', log?: string) =>
    update((s) => {
      const scope = { ...s.scope, ...patch };
      const flags = { ...s.flags };
      if (kind === 'objective' && scope.objective === 40 && !flags.focusedLow) flags.highBeforeLow = true;
      if (kind === 'coarse' && scope.objective === 40) flags.coarseAtHigh = Math.min(100_000, flags.coarseAtHigh + 1);
      if (kind === 'light') flags.lightAdjusted = true;
      if (s.prep.placed) {
        const d = scope.coarse + scope.fine - v.focus[scope.objective];
        if (scope.objective !== 40 && Math.abs(d) <= MICRO_FOCUS_TOL[scope.objective]) flags.focusedLow = true;
        if (scope.objective === 40 && kind === 'coarse' && d > 1.5 && !flags.crashed) {
          flags.crashed = true;
          log = 'crash';
        }
      }
      return { ...s, scope, flags };
    }, log);
  const capture = () =>
    update((s) => ({ ...s, captures: [...s.captures.filter((c) => c.objective !== s.scope.objective), { ...s.scope, t: Math.max(0, Date.now() - t0) }].slice(-3) }), `capture:${sc.objective}`);

  const labelCap = state.captures.find((c) => c.objective === info.labelObjective) ?? null;
  const measureCap = state.captures.find((c) => c.objective === info.measureObjective) ?? null;
  const fieldBase = { v, medium: state.prep.medium, coverslip: state.prep.coverslip, placed: state.prep.placed, crashed: state.flags.crashed };

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Microscope className="size-4 text-muted-foreground" aria-hidden /> The task — {info.title}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed">
            <p>{info.prepare}</p>
            <p>
              Examine the slide under low power, then at ×{info.labelObjective}. Capture a sharp view at ×{info.measureObjective} to measure from{info.labelObjective !== info.measureObjective ? ` and one at ×${info.labelObjective} to label` : ' and label'}. Then answer:
            </p>
            <ol className="list-[lower-roman] space-y-0.5 pl-6">
              {v.tasks.map((t) => (
                <li key={t.id}>{t.label}</li>
              ))}
            </ol>
            <ul className="space-y-0.5 text-muted-foreground">
              {v.given.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            {canChange && !readOnly && (
              <Button size="sm" variant="ghost" onClick={() => update(() => emptyBioMicroscopeState(), 'change-slide')}>
                Choose a different slide
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-[15px] font-semibold tracking-tight">Bench and microscope</h3>
            <Badge variant="outline">
              ×{sc.objective} objective · ×{v.eyepiece * sc.objective} total
            </Badge>
          </div>
          {!readOnly && mode === 'LAB' && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {nextHint(state, v)}
            </p>
          )}
          <div className="space-y-3">
            <Step n={1} title="Prepare the slide" done={!!state.prep.medium && !!state.prep.coverslip}>
              <p className="text-[12px] text-muted-foreground">Mount the specimen in:</p>
              <div className="flex flex-wrap gap-1.5">
                {MICRO_MEDIA.map((m) => (
                  <Button key={m} size="sm" className="h-auto min-h-8 whitespace-normal py-1 text-left" variant={state.prep.medium === m ? 'brand' : 'outline'} disabled={readOnly || state.prep.placed} aria-pressed={state.prep.medium === m} onClick={() => update((s) => ({ ...s, prep: { ...s.prep, medium: m } }), `medium:${m}`)}>
                    {MICRO_MEDIUM_LABELS[m]}
                  </Button>
                ))}
              </div>
              <p className="text-[12px] text-muted-foreground">Cover slip:</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" className="h-auto min-h-8 whitespace-normal py-1 text-left" variant={state.prep.coverslip === 'ANGLE' ? 'brand' : 'outline'} disabled={readOnly || state.prep.placed || !state.prep.medium} aria-pressed={state.prep.coverslip === 'ANGLE'} onClick={() => update((s) => ({ ...s, prep: { ...s.prep, coverslip: 'ANGLE' } }), 'coverslip:angle')}>
                  Lower it at an angle with a mounted needle
                </Button>
                <Button size="sm" className="h-auto min-h-8 whitespace-normal py-1 text-left" variant={state.prep.coverslip === 'DROP' ? 'brand' : 'outline'} disabled={readOnly || state.prep.placed || !state.prep.medium} aria-pressed={state.prep.coverslip === 'DROP'} onClick={() => update((s) => ({ ...s, prep: { ...s.prep, coverslip: 'DROP' } }), 'coverslip:drop')}>
                  Drop it flat on top
                </Button>
              </div>
            </Step>
            <Step n={2} title="Place the slide on the stage" done={state.prep.placed}>
              <Button
                size="sm"
                variant="outline"
                className="h-auto min-h-8 whitespace-normal py-1 text-left"
                disabled={readOnly || state.prep.placed || !state.prep.coverslip}
                onClick={() => update((s) => ({ ...s, prep: { ...s.prep, placed: true, clipped: true }, scope: { ...s.scope, objective: 4 } }), 'place-slide')}
              >
                Place the slide over the hole and clip it (×4 objective in place)
              </Button>
            </Step>
          </div>

          <div className="mt-4 flex items-end justify-center gap-3">
            <ScopeSvg scope={sc} placed={state.prep.placed} />
            <div className="min-w-0 flex-1">
              <FieldView {...fieldBase} scope={sc} graticule={graticule} pointer={pointer} label="Field of view" className="mx-auto w-full max-w-[340px]" />
              <p className={cn('mt-1 text-center text-[12px]', inFocus ? 'text-success' : 'text-muted-foreground')} aria-live="polite">
                {!state.prep.placed ? 'No slide on the stage' : inFocus ? 'In focus' : Math.abs(dz) < 3 ? 'Nearly in focus' : 'Out of focus'}
                {state.flags.crashed ? ' · cover slip cracked' : ''}
              </p>
            </div>
          </div>

          {!readOnly && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-20 text-[12.5px] text-muted-foreground">Objective</span>
                {MICRO_OBJECTIVES.map((o) => (
                  <Button key={o} size="sm" variant={sc.objective === o ? 'brand' : 'outline'} aria-pressed={sc.objective === o} onClick={() => setScope({ objective: o }, 'objective', `objective:${o}`)}>
                    ×{o}
                  </Button>
                ))}
              </div>
              <Slider label="Coarse focus" min={0} max={100} step={0.5} value={sc.coarse} onChange={(x) => setScope({ coarse: x }, 'coarse')} nudge={0.5} hint={sc.objective === 40 ? 'Not at high power!' : undefined} />
              <Slider label="Fine focus" min={-2} max={2} step={0.02} value={sc.fine} onChange={(x) => setScope({ fine: x }, 'fine')} nudge={0.02} />
              <Slider label="Diaphragm" min={0} max={100} step={1} value={sc.diaphragm} onChange={(x) => setScope({ diaphragm: x }, 'light')} nudge={5} suffix="% open" />
              <Slider label="Lamp" min={0} max={100} step={1} value={sc.lamp} onChange={(x) => setScope({ lamp: x }, 'light')} nudge={5} suffix="%" />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant={graticule ? 'brand' : 'outline'} aria-pressed={graticule} onClick={() => setGraticule((g) => !g)}>
                  <Ruler /> Eyepiece graticule
                </Button>
                <Button size="sm" variant={pointer ? 'brand' : 'outline'} aria-pressed={pointer} onClick={() => setPointer((g) => !g)}>
                  Diameter line
                </Button>
                <Button size="sm" className="ml-auto" disabled={!state.prep.placed} onClick={capture}>
                  <Camera /> Capture ×{sc.objective} view
                </Button>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
            {state.captures.length === 0 && <span className="text-muted-foreground">No views captured yet.</span>}
            {state.captures.map((c) => {
              const d = Math.abs(c.coarse + c.fine - v.focus[c.objective]) <= MICRO_FOCUS_TOL[c.objective];
              return (
                <Badge key={c.objective} variant={d ? 'success' : 'warning'}>
                  ×{c.objective} captured{readOnly ? (d ? ' · sharp' : ' · blurred') : ''}
                </Badge>
              );
            })}
          </div>
          {readOnly && (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
              <dt className="text-muted-foreground">Mounted in</dt>
              <dd>{state.prep.medium ? MICRO_MEDIUM_LABELS[state.prep.medium] : '—'}</dd>
              <dt className="text-muted-foreground">Cover slip</dt>
              <dd>{state.prep.coverslip === 'ANGLE' ? 'Lowered at an angle' : state.prep.coverslip === 'DROP' ? 'Dropped flat' : '—'}</dd>
              <dt className="text-muted-foreground">Low power first</dt>
              <dd>{state.flags.focusedLow && !state.flags.highBeforeLow ? 'Yes' : 'No'}</dd>
              <dt className="text-muted-foreground">Coarse focus at ×40</dt>
              <dd>{state.flags.coarseAtHigh ? 'Used' : 'Not used'}</dd>
            </dl>
          )}
        </Card>

        <Notebook v={v} state={state} readOnly={readOnly} update={update} labelCap={labelCap} measureCap={measureCap} fieldBase={fieldBase} />
      </div>
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange, nudge, suffix, hint }: { label: string; min: number; max: number; step: number; value: number; onChange: (x: number) => void; nudge: number; suffix?: string; hint?: string }) {
  const id = `sl-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const clamp = (x: number) => Math.round(Math.max(min, Math.min(max, x)) / step) * step;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-20 shrink-0 text-[12.5px] text-muted-foreground">
        {label}
      </label>
      <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`${label} down`} onClick={() => onChange(clamp(value - nudge))}>
        <Minus />
      </Button>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8 min-w-0 flex-1 touch-pan-y accent-[var(--color-brand)]" aria-valuetext={`${value}${suffix ?? ''}`} />
      <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`${label} up`} onClick={() => onChange(clamp(value + nudge))}>
        <Plus />
      </Button>
      {hint && <span className="hidden text-[11px] text-warning sm:inline">{hint}</span>}
    </div>
  );
}

/** A side view of the microscope: the stage rises with the focus, the turret shows the objective, the lamp glows. */
function ScopeSvg({ scope, placed }: { scope: MicroScope; placed: boolean }) {
  const stageY = 176 - ((scope.coarse + scope.fine) / 100) * 34;
  const len: Record<MicroObjective, number> = { 4: 14, 10: 20, 40: 28 };
  return (
    <svg viewBox="0 0 110 240" className="hidden h-[230px] w-auto shrink-0 sm:block" aria-hidden>
      <rect x="14" y="222" width="86" height="12" rx="4" className="fill-muted-foreground/40" />
      <path d="M78 222 L84 222 L90 90 Q92 60 70 44 L64 52 Q80 66 78 92 Z" className="fill-muted-foreground/45" />
      <rect x="34" y="14" width="14" height="40" rx="3" transform="rotate(-18 41 34)" className="fill-muted-foreground/55" />
      <rect x="36" y="48" width="30" height="22" rx="5" className="fill-muted-foreground/50" />
      {MICRO_OBJECTIVES.map((o, i) => (
        <rect key={o} x={o === scope.objective ? 46 : 40 + i * 9} y={70} width={o === scope.objective ? 9 : 6} height={len[o]} rx="2" className={o === scope.objective ? 'fill-brand' : 'fill-muted-foreground/35'} />
      ))}
      <rect x="18" y={stageY} width="62" height="6" rx="1.5" className="fill-muted-foreground/60" />
      {placed && <rect x="26" y={stageY - 2.5} width="46" height="2.5" className="fill-sky-200 stroke-sky-500" strokeWidth="0.4" />}
      <circle cx="86" cy="150" r="8" className="fill-muted-foreground/60" />
      <circle cx="86" cy="150" r="4" className="fill-muted-foreground/30" />
      <rect x="40" y={stageY + 8} width="18" height="4" rx="1" className="fill-muted-foreground/50" />
      <rect x="44" y="206" width="12" height="14" rx="2" className="fill-muted-foreground/50" />
      <circle cx="50" cy="204" r="6" fill="#ffd36b" opacity={0.15 + (scope.lamp / 100) * 0.85} />
    </svg>
  );
}

function Notebook({
  v,
  state,
  readOnly,
  update,
  labelCap,
  measureCap,
  fieldBase,
}: {
  v: BioMicroscopeVariant;
  state: BioMicroscopeState;
  readOnly: boolean;
  update: Update;
  labelCap: MicroScope | null;
  measureCap: MicroScope | null;
  fieldBase: { v: BioMicroscopeVariant; medium: BioMicroscopeState['prep']['medium']; coverslip: BioMicroscopeState['prep']['coverslip']; placed: boolean; crashed: boolean };
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
    <Card className="p-4 sm:p-5">
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
