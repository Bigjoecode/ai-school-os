import { REDOX_ACIDS, REDOX_ACID_INFO, REDOX_BURETTE, REDOX_INDICATORS, REDOX_INDICATOR_INFO, REDOX_MENISCUS, REDOX_RINSES, type RedoxRinse } from '@aischool/shared';
import { Beaker, ChevronDown, Droplet, Droplets, FlaskConical, Flame, Lightbulb, RotateCw, Thermometer, Trash2, Waves } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { RINSE_LABEL, TASK_TITLE, buretteColour, nextHint, useRedox } from './actions';
import { Notebook, TaskBrief } from './notebook';

const RINSES = REDOX_RINSES.filter((r): r is Exclude<RedoxRinse, 'NONE'> => r !== 'NONE');

export default function ChemRedoxLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'chem-redox'>) {
  const x = useRedox({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task, open, colour, flash, doneRuns, canDeliver, temp } = x;
  const [brief, setBrief] = useState(true);
  const liquid = buretteColour(v);

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden /> The task · {TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && <TaskBrief v={v} className="mt-3" />}
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
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {nextHint(state, open, v, x.delivered, temp)}
            </p>
          )}

          <div className="flex items-end justify-center gap-4">
            <BenchSvg level={state.burette} funnel={state.funnelIn} colour={colour} flash={flash} liquid={liquid.colour} dark={liquid.dark} />
            <Meniscus level={state.burette} liquid={liquid.colour} dark={liquid.dark} />
          </div>
          {task === 'OX' && open && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[13px] tabular" aria-live="polite">
              <Thermometer className="size-4 text-muted-foreground" aria-hidden /> Thermometer in the flask: <span className="font-semibold">{Math.round(temp ?? v.room)} °C</span>
              {x.heating() && <span className="text-warning">· heating</span>}
            </p>
          )}

          {!readOnly && (
            <div className="mt-4 space-y-3">
              <Step title="1. Rinse the apparatus">
                {(['burette', 'pipette', 'flask'] as const).map((what) => (
                  <div key={what} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-16 text-[12.5px] capitalize text-muted-foreground">{what}</span>
                    {RINSES.map((liq) => (
                      <Button key={liq} size="sm" variant={state.setup[what] === liq ? 'brand' : 'outline'} onClick={() => x.rinse(what, liq)} disabled={what === 'flask' && !!open} aria-pressed={state.setup[what] === liq}>
                        {RINSE_LABEL[liq]}
                      </Button>
                    ))}
                  </div>
                ))}
              </Step>
              <Step title="2. Burette">
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={x.fill} disabled={!!open && open.initial !== null}>
                    <Droplets /> {state.burette === null ? 'Fill with A' : 'Refill near zero'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={x.removeFunnel} disabled={!state.funnelIn}>
                    Remove funnel
                  </Button>
                </div>
              </Step>
              <Step title="3. Conical flask">
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => x.pipette(doneRuns === 0 ? 'ROUGH' : 'ACCURATE')} disabled={!!open}>
                    <FlaskConical /> Pipette 25.0 cm³ of B {doneRuns === 0 ? '(rough)' : '(accurate)'}
                  </Button>
                  {doneRuns > 0 && !open && (
                    <Button size="sm" variant="ghost" onClick={() => x.pipette('ROUGH')}>
                      Another rough one
                    </Button>
                  )}
                </div>
                {task !== 'IOD' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] text-muted-foreground">Add 20 cm³ of</span>
                    {REDOX_ACIDS.map((a) => (
                      <Button key={a} size="sm" variant={open?.acid === a ? 'brand' : 'outline'} disabled={!open || !!open.acid} onClick={() => x.addAcid(a)} aria-pressed={open?.acid === a}>
                        dilute {REDOX_ACID_INFO[a].formula}
                      </Button>
                    ))}
                  </div>
                )}
                {task === 'OX' && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!open || open.initial !== null}
                      className="touch-none select-none"
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                        x.heatStart();
                      }}
                      onPointerUp={x.heatStop}
                      onPointerCancel={x.heatStop}
                      onLostPointerCapture={x.heatStop}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
                          e.preventDefault();
                          x.heatStart();
                        }
                      }}
                      onKeyUp={(e) => (e.key === 'Enter' || e.key === ' ') && x.heatStop()}
                      aria-label="Hold to warm the flask over the flame"
                    >
                      <Flame /> Hold to warm on the gauze
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] text-muted-foreground">Indicator</span>
                  {REDOX_INDICATORS.map((i) => (
                    <Button key={i} size="sm" variant={open?.indicators.includes(i) ? 'brand' : 'outline'} disabled={!open || open.indicators.includes(i)} onClick={() => x.addIndicator(i)}>
                      <span className="size-2.5 rounded-full border border-border" style={{ background: REDOX_INDICATOR_INFO[i].colour }} aria-hidden /> {REDOX_INDICATOR_INFO[i].label}
                    </Button>
                  ))}
                </div>
              </Step>
              <Step title="4. Titrate">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="brand"
                    disabled={!canDeliver}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      x.startStream();
                    }}
                    onPointerUp={x.stopStream}
                    onPointerCancel={x.stopStream}
                    onLostPointerCapture={x.stopStream}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        x.deliver(0.5, true);
                      }
                    }}
                    className="touch-none select-none"
                    aria-label="Open the tap: hold to run A in (Enter adds 0.5 cm³)"
                  >
                    <Waves /> Hold tap open
                  </Button>
                  <Button size="sm" variant="outline" disabled={!canDeliver} onClick={x.drop}>
                    <Droplet /> 1 drop
                  </Button>
                  <Button size="sm" variant="outline" disabled={!open} onClick={x.swirl}>
                    <RotateCw /> Swirl
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" disabled={!open || open.initial === null} onClick={x.finish}>
                    Finish this titration
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!open} onClick={x.pourAway}>
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
            </dl>
          )}
        </Card>

        <Notebook v={v} state={state} readOnly={readOnly} update={x.update} />
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
function BenchSvg({ level, funnel, colour, flash, liquid, dark }: { level: number | null; funnel: boolean; colour: string | null; flash: string | null; liquid: string; dark: boolean }) {
  const top = 24;
  const px = 5;
  const y = (cm: number) => top + cm * px;
  const fill = dark ? liquid : '#cfe3f6';
  return (
    <svg viewBox="0 0 140 420" className="h-[340px] w-auto shrink-0 sm:h-[380px]" role="img" aria-label={`Burette ${level === null ? 'empty' : `reading about ${level.toFixed(1)} cm³`}; flask ${colour ? 'with liquid' : 'empty'}`}>
      <rect x="10" y="10" width="6" height="400" rx="2" className="fill-muted-foreground/30" />
      <rect x="10" y="404" width="120" height="8" rx="2" className="fill-muted-foreground/30" />
      <rect x="14" y="150" width="46" height="5" rx="2" className="fill-muted-foreground/40" />
      {funnel && <path d="M54 2 L86 2 L74 20 L74 26 L66 26 L66 20 Z" className="fill-muted stroke-muted-foreground/60" strokeWidth="1" />}
      {level !== null && level < REDOX_BURETTE && <rect x="61" y={y(level)} width="18" height={y(REDOX_BURETTE) - y(level)} fill={fill} />}
      {level !== null && <rect x="68" y={y(REDOX_BURETTE)} width="4" height="34" fill={fill} />}
      <rect x="60" y={top - 4} width="20" height={REDOX_BURETTE * px + 8} rx="3" fill="none" className="stroke-muted-foreground/70" strokeWidth="1.2" />
      {Array.from({ length: 11 }, (_, i) => i * 5).map((cm) => (
        <g key={cm}>
          <line x1="60" x2="68" y1={y(cm)} y2={y(cm)} className="stroke-muted-foreground/70" strokeWidth="0.8" />
          <text x="84" y={y(cm) + 3} className="fill-muted-foreground" fontSize="8">
            {cm}
          </text>
        </g>
      ))}
      <rect x="67" y={y(REDOX_BURETTE) + 4} width="6" height="34" fill="none" className="stroke-muted-foreground/70" strokeWidth="1" />
      <rect x="58" y={y(REDOX_BURETTE) + 14} width="24" height="5" rx="2" className="fill-muted-foreground/60" />
      <g transform="translate(36 318)">
        <path d="M24 0 L44 0 L44 22 L66 78 Q68 84 62 84 L6 84 Q0 84 2 78 L24 22 Z" fill="none" className="stroke-muted-foreground/70" strokeWidth="1.4" />
        {colour && <path d="M14 56 L54 56 L66 78 Q68 84 62 84 L6 84 Q0 84 2 78 Z" fill={colour} style={{ transition: 'fill 300ms ease' }} />}
        {colour && flash && <ellipse cx="36" cy="58" rx="7" ry="2.5" fill={flash} opacity="0.8" />}
      </g>
    </svg>
  );
}

/** A close-up of the meniscus: graduations every 0.1 cm³. Colourless: read the bottom of the curve; dark KMnO₄: only its top edge can be seen. */
function Meniscus({ level, liquid, dark }: { level: number | null; liquid: string; dark: boolean }) {
  const h = 200;
  const per = 90;
  const mid = h / 2;
  const y = (cm: number) => mid + (cm - (level ?? 0)) * per;
  const edge = REDOX_MENISCUS * per;
  const ticks: number[] = [];
  if (level !== null) for (let t = Math.floor((level - 1.2) * 10); t <= Math.ceil((level + 1.2) * 10); t++) if (t >= 0 && t <= REDOX_BURETTE * 10) ticks.push(t / 10);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox={`0 0 96 ${h}`} className="h-[200px] w-[96px] rounded-xl border border-border bg-card" role="img" aria-label={level === null ? 'Burette not filled' : 'Close-up of the meniscus'}>
        <defs>
          <clipPath id="redox-tube">
            <rect x="22" y="0" width="44" height={h} />
          </clipPath>
        </defs>
        {level !== null && (
          <g clipPath="url(#redox-tube)">
            <path d={`M22 ${mid - edge} Q44 ${mid + edge} 66 ${mid - edge} L66 ${h} L22 ${h} Z`} fill={dark ? liquid : '#cfe3f6'} />
            {!dark && <path d={`M22 ${mid - edge} Q44 ${mid + edge} 66 ${mid - edge}`} fill="none" stroke="#5b8fc7" strokeWidth="1.5" />}
            {dark && <rect x="22" y={mid - edge} width="44" height={h} fill={liquid} />}
          </g>
        )}
        <line x1="22" x2="22" y1="0" y2={h} className="stroke-muted-foreground/70" />
        <line x1="66" x2="66" y1="0" y2={h} className="stroke-muted-foreground/70" />
        {ticks.map((t) => {
          const whole = Math.abs(t - Math.round(t)) < 1e-6;
          const half = Math.abs(t * 2 - Math.round(t * 2)) < 1e-6;
          return (
            <g key={t}>
              <line x1="22" x2={whole ? 46 : half ? 38 : 32} y1={y(t)} y2={y(t)} className={dark ? 'stroke-muted-foreground' : 'stroke-foreground/80'} strokeWidth={whole ? 1.2 : 0.8} />
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
      <span className="max-w-[110px] text-center text-[11px] leading-tight text-muted-foreground">{dark ? 'Too dark: read the TOP of the meniscus, to 2 d.p.' : 'Read the bottom of the meniscus, to 2 d.p.'}</span>
    </div>
  );
}
