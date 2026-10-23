import { BURETTE_CAPACITY, TITRATION_INDICATORS, TITRATION_INDICATOR_INFO } from '@aischool/shared';
import { Beaker, ChevronDown, Droplet, Droplets, FlaskConical, Lightbulb, RotateCw, Trash2, Waves } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { DROP, RINSE_LABEL, nextHint, useTitration } from './actions';
import { Notebook, TaskBrief } from './notebook';

export default function ChemTitrationLab({ seed, mode, state, onChange, readOnly, startedAt }: SimulatorProps<'chem-titration'>) {
  const { v, update, open, colour, doneRuns, canDeliver, rinse, chooseIndicator, fill, removeFunnel, pipette, addIndicator, deliver, swirl, finish, pourAway, startStream, stopStream } = useTitration({ seed, state, onChange, readOnly, startedAt });
  const [brief, setBrief] = useState(true);

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
          <TaskBrief v={v} className="mt-3" />
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
