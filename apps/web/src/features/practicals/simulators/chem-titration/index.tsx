import {
  BURETTE_CAPACITY,
  TITRATION_INDICATORS,
  TITRATION_INDICATOR_INFO,
  chemTitrationVariant,
  titrationEndpoint,
  titrationFillLevel,
  type ChemTitrationState,
  type ChemTitrationVariant,
  type TitrationIndicator,
  type TitrationRinse,
  type TitrationRun,
  type TitrationTaskId,
} from '@aischool/shared';
import { Beaker, ChevronDown, Droplet, Droplets, FlaskConical, Lightbulb, RotateCw, Trash2, Waves } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';

/** One drop from the burette (cm³). */
const DROP = 0.05;
/** Stream rate while the tap is held open: cm³ per 100 ms tick. */
const STREAM_STEP = 0.1;
const r2 = (x: number) => Math.round(x * 100) / 100;
const RINSE_LABEL: Record<TitrationRinse, string> = { ACID: 'Acid (A)', BASE: 'Base (B)', WATER: 'Distilled water', NONE: 'Not rinsed' };

/** The flask's colour for a run: indicator colour in the base, at the end point, or with excess acid. */
function flaskColour(run: TitrationRun | null, v: ChemTitrationVariant, index: number, level: number | null, flash: boolean): string | null {
  if (!run) return null;
  if (!run.indicator) return '#e6eef6';
  const info = TITRATION_INDICATOR_INFO[run.indicator];
  const delivered = run.initial !== null ? (run.final ?? level ?? run.initial) - run.initial : 0;
  const end = titrationEndpoint(v, index, run.indicator);
  if (run.indicator === 'LITMUS') {
    // Litmus changes gradually: no sharp end point.
    const f = Math.max(0, Math.min(1, (delivered - end * 0.85) / (end * 0.25)));
    return f < 0.5 ? info.base : f < 0.85 ? info.end : info.acid;
  }
  if (delivered >= end + 0.3) return info.acid;
  if (delivered >= end - 0.001) return info.end;
  return flash ? info.end : info.base;
}

/** What to do next (practice mode only). */
function nextHint(s: ChemTitrationState, open: TitrationRun | null): string {
  if (!s.setup.burette) return 'Rinse the burette with the liquid it will hold.';
  if (!s.setup.pipette) return 'Rinse the pipette with the liquid it will measure.';
  if (!s.setup.flask) return 'Rinse the conical flask.';
  if (!s.setup.indicator) return 'Choose an indicator suitable for this acid and base.';
  if (s.burette === null) return 'Fill the burette with A using the filter funnel.';
  if (!open) return s.runs.filter((r) => r.done).length === 0 ? 'Pipette 25.0 cm³ of B into the flask for a rough titration.' : 'Pipette 25.0 cm³ of B into a clean flask for the next titration.';
  if (!open.indicator) return 'Add two or three drops of the indicator to the flask.';
  if (s.funnelIn && open.initial === null) return 'Remove the funnel, then read and record the initial burette reading.';
  if (open.initial === null) return 'Record the initial burette reading, then run in the acid while swirling.';
  return open.kind === 'ROUGH' ? 'Run the acid in fairly quickly, swirling, until the colour changes; then finish and record.' : 'Run in acid to within about 1 cm³ of the rough titre, then add it drop by drop, swirling, until one drop changes the colour.';
}

export default function ChemTitrationLab({ seed, mode, state, onChange, readOnly, startedAt }: SimulatorProps<'chem-titration'>) {
  const v = useMemo(() => chemTitrationVariant(seed), [seed]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const [flash, setFlash] = useState(false);
  const [brief, setBrief] = useState(true);
  const openIndex = state.runs.findIndex((r) => !r.done);
  const open = openIndex >= 0 ? state.runs[openIndex]! : null;
  const shownIndex = openIndex >= 0 ? openIndex : state.runs.length - 1;
  const shown = shownIndex >= 0 ? state.runs[shownIndex]! : null;
  const colour = flaskColour(open ?? (readOnly ? shown : null), v, open ? openIndex : shownIndex, state.burette, flash);

  const update = (fn: (s: ChemTitrationState) => ChemTitrationState, log?: string) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  const setRun = (s: ChemTitrationState, i: number, patch: Partial<TitrationRun>): ChemTitrationState => ({ ...s, runs: s.runs.map((r, k) => (k === i ? { ...r, ...patch } : r)) });

  const rinse = (what: 'burette' | 'pipette' | 'flask', liquid: TitrationRinse) =>
    update((s) => ({ ...s, setup: { ...s.setup, [what]: liquid }, ...(what === 'burette' ? { burette: null } : {}) }), `rinse-${what}:${liquid}`);
  const chooseIndicator = (i: TitrationIndicator) => update((s) => ({ ...s, setup: { ...s.setup, indicator: i } }), `indicator:${i}`);
  const fill = () => update((s) => ({ ...s, burette: titrationFillLevel(seed, s.fills), fills: s.fills + 1, funnelIn: true }), 'fill-burette');
  const removeFunnel = () => update((s) => ({ ...s, funnelIn: false }), 'remove-funnel');
  const pipette = (kind: TitrationRun['kind']) =>
    update((s) => {
      const runs = [...s.runs, { kind, indicator: null, initial: null, final: null, swirls: 0, funnelRemoved: false, done: false } satisfies TitrationRun];
      const table = [...s.table];
      while (table.length < runs.length) table.push({ initial: '', final: '', titre: '' });
      return { ...s, runs, table };
    }, `pipette:${kind}`);
  const addIndicator = () => {
    const s = ref.current;
    const i = s.runs.findIndex((r) => !r.done);
    if (i < 0 || !s.setup.indicator) return;
    update((x) => setRun(x, i, { indicator: x.setup.indicator }), `add-indicator:${s.setup.indicator}`);
  };
  /** Runs acid into the flask; the run's initial reading is the level when the first acid goes in. */
  const deliver = (vol: number, stream: boolean) => {
    const s = ref.current;
    const i = s.runs.findIndex((r) => !r.done);
    if (i < 0 || s.burette === null || s.burette >= BURETTE_CAPACITY || !s.runs[i]!.indicator) {
      stopStream();
      return;
    }
    const run = s.runs[i]!;
    const level = r2(Math.min(BURETTE_CAPACITY, s.burette + vol));
    const initial = run.initial ?? s.burette;
    const first = run.initial === null;
    update((x) => ({ ...setRun(x, i, first ? { initial, funnelRemoved: !x.funnelIn } : {}), burette: level }), first ? 'start-titrating' : undefined);
    if (stream && run.indicator) {
      const end = titrationEndpoint(v, i, run.indicator);
      const d = level - initial;
      setFlash(d > end - 0.8 && d < end);
    }
  };
  const swirl = () => {
    const i = ref.current.runs.findIndex((r) => !r.done);
    if (i < 0) return;
    setFlash(false);
    update((x) => setRun(x, i, { swirls: x.runs[i]!.swirls + 1 }));
  };
  const finish = () => {
    const s = ref.current;
    const i = s.runs.findIndex((r) => !r.done);
    if (i < 0 || s.runs[i]!.initial === null) return;
    setFlash(false);
    update((x) => setRun(x, i, { final: x.burette, done: true }), 'finish-titration');
  };
  const pourAway = () => {
    const i = ref.current.runs.findIndex((r) => !r.done);
    if (i < 0) return;
    setFlash(false);
    update((x) => ({ ...x, runs: x.runs.filter((_, k) => k !== i), table: x.table.filter((_, k) => k !== i) }), 'pour-away');
  };

  // Hold-to-run tap.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopStream = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const startStream = () => {
    stopStream();
    deliver(STREAM_STEP, true);
    timer.current = setInterval(() => deliver(STREAM_STEP, true), 100);
  };
  useEffect(() => stopStream, []);

  const doneRuns = state.runs.filter((r) => r.done).length;
  const canDeliver = !!open && !!open.indicator && state.burette !== null && state.burette < BURETTE_CAPACITY;

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden /> The task
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed">
            <p>{v.given.A}</p>
            <p>{v.given.B}</p>
            <p>
              Put A into the burette and titrate it against 25.0 cm³ portions of B using a suitable indicator. Do a rough titration, then repeat until you have concordant titres. Tabulate your burette readings and calculate:
            </p>
            <ol className="list-[lower-roman] space-y-0.5 pl-6">
              {v.tasks.map((t) => (
                <li key={t.id}>{t.label}</li>
              ))}
            </ol>
            <p className="text-muted-foreground">
              The equation for the reaction is: <span className="font-medium text-foreground">{v.equation}</span>. Molar masses: {v.acid.formula} = {v.acid.molarMass}, {v.base.formula} = {v.base.molarMass} g mol⁻¹.
            </p>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <Beaker className="size-4 text-muted-foreground" aria-hidden /> Bench
            </h3>
            <Badge variant="outline">
              {doneRuns} titration{doneRuns === 1 ? '' : 's'} done{open ? ` · ${open.kind === 'ROUGH' ? 'rough' : 'accurate'} in progress` : ''}
            </Badge>
          </div>
          {!readOnly && mode === 'LAB' && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {nextHint(state, open)}
            </p>
          )}

          <div className="flex items-end justify-center gap-4">
            <BenchSvg level={state.burette} funnel={state.funnelIn} colour={colour} />
            <Meniscus level={state.burette} />
          </div>

          {!readOnly && (
            <div className="mt-4 space-y-3">
              <Step title="1. Rinse the apparatus">
                {(['burette', 'pipette', 'flask'] as const).map((what) => (
                  <div key={what} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-16 text-[12.5px] capitalize text-muted-foreground">{what}</span>
                    {(['WATER', 'ACID', 'BASE'] as const).map((liq) => (
                      <Button key={liq} size="sm" variant={state.setup[what] === liq ? 'brand' : 'outline'} onClick={() => rinse(what, liq)} disabled={what === 'flask' && !!open} aria-pressed={state.setup[what] === liq}>
                        {RINSE_LABEL[liq]}
                      </Button>
                    ))}
                  </div>
                ))}
              </Step>
              <Step title="2. Indicator">
                <div className="flex flex-wrap gap-1.5">
                  {TITRATION_INDICATORS.map((i) => (
                    <Button key={i} size="sm" variant={state.setup.indicator === i ? 'brand' : 'outline'} onClick={() => chooseIndicator(i)} aria-pressed={state.setup.indicator === i}>
                      <span className="size-2.5 rounded-full border border-border" style={{ background: TITRATION_INDICATOR_INFO[i].base }} aria-hidden /> {TITRATION_INDICATOR_INFO[i].label}
                    </Button>
                  ))}
                </div>
              </Step>
              <Step title="3. Burette">
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={fill} disabled={!!open && open.initial !== null}>
                    <Droplets /> {state.burette === null ? 'Fill with A' : 'Refill near zero'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={removeFunnel} disabled={!state.funnelIn}>
                    Remove funnel
                  </Button>
                </div>
              </Step>
              <Step title="4. Conical flask">
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => pipette(doneRuns === 0 ? 'ROUGH' : 'ACCURATE')} disabled={!!open}>
                    <FlaskConical /> Pipette 25.0 cm³ of B {doneRuns === 0 ? '(rough)' : '(accurate)'}
                  </Button>
                  {doneRuns > 0 && !open && (
                    <Button size="sm" variant="ghost" onClick={() => pipette('ROUGH')}>
                      Another rough one
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={addIndicator} disabled={!open || !!open.indicator || !state.setup.indicator}>
                    <Droplet /> Add 2–3 drops of indicator
                  </Button>
                </div>
              </Step>
              <Step title="5. Titrate">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="brand"
                    disabled={!canDeliver}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      startStream();
                    }}
                    onPointerUp={stopStream}
                    onPointerCancel={stopStream}
                    onLostPointerCapture={stopStream}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        deliver(0.5, true);
                      }
                    }}
                    className="touch-none select-none"
                    aria-label="Open the tap: hold to run acid in (Enter adds 0.5 cm³)"
                  >
                    <Waves /> Hold tap open
                  </Button>
                  <Button size="sm" variant="outline" disabled={!canDeliver} onClick={() => deliver(DROP, false)}>
                    <Droplet /> 1 drop
                  </Button>
                  <Button size="sm" variant="outline" disabled={!open} onClick={swirl}>
                    <RotateCw /> Swirl
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" disabled={!open || open.initial === null} onClick={finish}>
                    Finish this titration
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!open} onClick={pourAway}>
                    <Trash2 /> Pour away
                  </Button>
                </div>
              </Step>
            </div>
          )}
          {readOnly && (
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
              {(['burette', 'pipette', 'flask'] as const).map((w) => (
                <div key={w} className="contents">
                  <dt className="capitalize text-muted-foreground">{w} rinsed with</dt>
                  <dd>{state.setup[w] ? RINSE_LABEL[state.setup[w]!] : '—'}</dd>
                </div>
              ))}
              <dt className="text-muted-foreground">Indicator</dt>
              <dd>{state.setup.indicator ? TITRATION_INDICATOR_INFO[state.setup.indicator].label : '—'}</dd>
            </dl>
          )}
        </Card>

        <Notebook v={v} state={state} readOnly={readOnly} update={update} />
      </div>
    </div>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-2 text-[12.5px] font-semibold">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/** Burette (scale 0 at the top, 50 at the bottom), funnel, tap and conical flask. */
function BenchSvg({ level, funnel, colour }: { level: number | null; funnel: boolean; colour: string | null }) {
  const top = 24;
  const px = 5; // per cm³
  const y = (cm: number) => top + cm * px;
  return (
    <svg viewBox="0 0 140 420" className="h-[340px] w-auto shrink-0 sm:h-[380px]" role="img" aria-label={`Burette ${level === null ? 'empty' : `reading about ${level.toFixed(1)} cm³`}; flask ${colour ? 'with liquid' : 'empty'}`}>
      {/* stand */}
      <rect x="10" y="10" width="6" height="400" rx="2" className="fill-muted-foreground/30" />
      <rect x="10" y="404" width="120" height="8" rx="2" className="fill-muted-foreground/30" />
      <rect x="14" y="150" width="46" height="5" rx="2" className="fill-muted-foreground/40" />
      {/* funnel */}
      {funnel && <path d="M54 2 L86 2 L74 20 L74 26 L66 26 L66 20 Z" className="fill-muted stroke-muted-foreground/60" strokeWidth="1" />}
      {/* acid */}
      {level !== null && level < BURETTE_CAPACITY && <rect x="61" y={y(level)} width="18" height={y(BURETTE_CAPACITY) - y(level)} fill="#cfe3f6" />}
      {level !== null && <rect x="68" y={y(BURETTE_CAPACITY)} width="4" height="34" fill="#cfe3f6" />}
      {/* tube and graduations */}
      <rect x="60" y={top - 4} width="20" height={BURETTE_CAPACITY * px + 8} rx="3" fill="none" className="stroke-muted-foreground/70" strokeWidth="1.2" />
      {Array.from({ length: 11 }, (_, i) => i * 5).map((cm) => (
        <g key={cm}>
          <line x1="60" x2="68" y1={y(cm)} y2={y(cm)} className="stroke-muted-foreground/70" strokeWidth="0.8" />
          <text x="84" y={y(cm) + 3} className="fill-muted-foreground" fontSize="8">
            {cm}
          </text>
        </g>
      ))}
      <rect x="67" y={y(BURETTE_CAPACITY) + 4} width="6" height="34" fill="none" className="stroke-muted-foreground/70" strokeWidth="1" />
      {/* tap */}
      <rect x="58" y={y(BURETTE_CAPACITY) + 14} width="24" height="5" rx="2" className="fill-muted-foreground/60" />
      {/* flask */}
      <g transform="translate(36 318)">
        <path d="M24 0 L44 0 L44 22 L66 78 Q68 84 62 84 L6 84 Q0 84 2 78 L24 22 Z" fill="none" className="stroke-muted-foreground/70" strokeWidth="1.4" />
        {colour && <path d="M14 56 L54 56 L66 78 Q68 84 62 84 L6 84 Q0 84 2 78 Z" fill={colour} style={{ transition: 'fill 300ms ease' }} />}
      </g>
    </svg>
  );
}

/** A close-up of the meniscus: graduations every 0.1 cm³; read the bottom of the curve at eye level. */
function Meniscus({ level }: { level: number | null }) {
  const h = 200;
  const per = 90; // px per cm³
  const mid = h / 2;
  const y = (cm: number) => mid + (cm - (level ?? 0)) * per;
  const ticks: number[] = [];
  if (level !== null) for (let t = Math.floor((level - 1.2) * 10); t <= Math.ceil((level + 1.2) * 10); t++) if (t >= 0 && t <= BURETTE_CAPACITY * 10) ticks.push(t / 10);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox={`0 0 96 ${h}`} className="h-[200px] w-[96px] rounded-xl border border-border bg-card" role="img" aria-label={level === null ? 'Burette not filled' : 'Close-up of the meniscus'}>
        <defs>
          <clipPath id="tube">
            <rect x="22" y="0" width="44" height={h} />
          </clipPath>
        </defs>
        {level !== null && (
          <g clipPath="url(#tube)">
            <path d={`M22 ${mid - 7} Q44 ${mid + 6} 66 ${mid - 7} L66 ${h} L22 ${h} Z`} fill="#cfe3f6" />
            <path d={`M22 ${mid - 7} Q44 ${mid + 6} 66 ${mid - 7}`} fill="none" stroke="#5b8fc7" strokeWidth="1.5" />
          </g>
        )}
        <line x1="22" x2="22" y1="0" y2={h} className="stroke-muted-foreground/70" />
        <line x1="66" x2="66" y1="0" y2={h} className="stroke-muted-foreground/70" />
        {ticks.map((t) => {
          const whole = Math.abs(t - Math.round(t)) < 1e-6;
          const half = Math.abs(t * 2 - Math.round(t * 2)) < 1e-6;
          return (
            <g key={t}>
              <line x1="22" x2={whole ? 46 : half ? 38 : 32} y1={y(t)} y2={y(t)} className="stroke-foreground/80" strokeWidth={whole ? 1.2 : 0.8} />
              {whole && (
                <text x="70" y={y(t) + 3.5} className="fill-foreground" fontSize="10" fontWeight="600">
                  {t.toFixed(0)}
                </text>
              )}
            </g>
          );
        })}
        {level === null && (
          <text x="48" y={mid} textAnchor="middle" className="fill-muted-foreground" fontSize="9">
            Empty
          </text>
        )}
      </svg>
      <span className="max-w-[110px] text-center text-[11px] leading-tight text-muted-foreground">Read the bottom of the meniscus, to 2 d.p.</span>
    </div>
  );
}

function Notebook({ v, state, readOnly, update }: { v: ChemTitrationVariant; state: ChemTitrationState; readOnly: boolean; update: (fn: (s: ChemTitrationState) => ChemTitrationState, log?: string) => void }) {
  const accurateNo = (i: number) => state.runs.slice(0, i + 1).filter((r) => r.kind === 'ACCURATE').length;
  const setCell = (i: number, key: 'initial' | 'final' | 'titre', value: string) => update((s) => ({ ...s, table: s.table.map((row, k) => (k === i ? { ...row, [key]: value.slice(0, 40) } : row)) }));
  const setAnswer = (id: TitrationTaskId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value.slice(0, 40) } } }));
  const setWritten = (key: 'endpoint' | 'precautions', value: string) => update((s) => ({ ...s, written: { ...s.written, [key]: value.slice(0, key === 'endpoint' ? 1000 : 2000) } }));
  const unitHint: Record<string, string> = { cm3: 'e.g. cm³', 'mol/dm3': 'e.g. mol dm⁻³', 'g/dm3': 'unit', '%': 'unit' };
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Burette readings (cm³)</th>
              <th className="px-1 py-1 font-medium">Initial</th>
              <th className="px-1 py-1 font-medium">Final</th>
              <th className="px-1 py-1 font-medium">Titre</th>
            </tr>
          </thead>
          <tbody>
            {state.runs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-muted-foreground">
                  Rows appear as you pipette B into the flask.
                </td>
              </tr>
            )}
            {state.runs.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5 pr-2">
                  {r.kind === 'ROUGH' ? 'Rough' : `${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][accurateNo(i) - 1] ?? `${accurateNo(i)}th`}`}
                  {!r.done && <span className="ml-1 text-[11px] text-info">(open)</span>}
                </td>
                {(['initial', 'final', 'titre'] as const).map((k) => (
                  <td key={k} className="px-1 py-1.5">
                    <Input
                      value={state.table[i]?.[k] ?? ''}
                      onChange={(e) => setCell(i, k, e.target.value)}
                      disabled={readOnly}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="h-9 w-[84px] px-2 tabular"
                      aria-label={`${r.kind === 'ROUGH' ? 'Rough' : `Accurate ${accurateNo(i)}`} ${k} reading`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        {v.tasks.map((t, n) => (
          <div key={t.id}>
            <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor={`ans-${t.id}`}>
              ({['i', 'ii', 'iii', 'iv'][n]}) {t.label}
            </label>
            <div className="flex gap-2">
              <Input id={`ans-${t.id}`} value={state.answers[t.id].value} onChange={(e) => setAnswer(t.id, 'value', e.target.value)} disabled={readOnly} inputMode="decimal" placeholder="value" className="tabular" />
              <Input value={state.answers[t.id].unit} onChange={(e) => setAnswer(t.id, 'unit', e.target.value)} disabled={readOnly} placeholder={unitHint[t.unit]} className="w-32 shrink-0" aria-label={`Unit for ${t.label}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="endpoint">
            Colour change at the end point
          </label>
          <Input id="endpoint" value={state.written.endpoint} onChange={(e) => setWritten('endpoint', e.target.value)} disabled={readOnly} placeholder="From … to …" />
        </div>
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="precautions">
            Two precautions you took
          </label>
          <Textarea id="precautions" value={state.written.precautions} onChange={(e) => setWritten('precautions', e.target.value)} disabled={readOnly} rows={3} />
        </div>
      </div>
    </Card>
  );
}
