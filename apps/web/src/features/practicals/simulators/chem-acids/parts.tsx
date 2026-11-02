import { UI_CHART } from '@aischool/shared';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPEEDS, type Acids } from './actions';

export { BalanceDisplay } from '../chem-electro/parts';

/**
 * Small pictures shared by the 2D lab and the 3D lab's reading panels: the
 * universal-indicator colour chart (with the tubes held beside it), the
 * burette's meniscus close-up, a test tube swatch and the time-lapse picker.
 */

/** The printed colour chart, pH 0–14; `tubes` are held against it to compare. */
export function UiChart({ tubes = [], className }: { tubes?: { label: string; colour: string | null }[]; className?: string }) {
  const W = 15 * 22 + 8;
  return (
    <div className={cn('space-y-1.5', className)}>
      <svg viewBox={`0 0 ${W} 64`} className="h-auto w-full max-w-[420px] rounded-lg border border-border bg-white" role="img" aria-label="Universal indicator colour chart, pH 0 to 14: red, orange, yellow, green, blue, indigo, violet">
        {UI_CHART.map((c, i) => (
          <g key={i}>
            <rect x={4 + i * 22} y={6} width={20} height={32} rx={3} fill={c} />
            <text x={14 + i * 22} y={54} textAnchor="middle" fontSize="11" fontWeight="700" fill="#16202a">
              {i}
            </text>
          </g>
        ))}
      </svg>
      {tubes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tubes.map((t) => (
            <TubeSwatch key={t.label} label={t.label} colour={t.colour} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A test tube's contents seen against the white tile. */
export function TubeSwatch({ label, colour, sub }: { label: string; colour: string | null; sub?: string }) {
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <svg viewBox="0 0 24 70" className="h-[62px] w-[22px]" role="img" aria-label={`Tube ${label}${colour ? '' : ' (empty)'}`}>
        {colour && <path d="M5 30 L19 30 L19 58 Q12 68 5 58 Z" fill={colour} />}
        <path d="M4 2 L4 58 Q12 70 20 58 L20 2" fill="none" stroke="#8b98a3" strokeWidth="1.4" />
      </svg>
      <span className="text-[11px] font-semibold tabular">{label}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

/** A burette close-up: graduations every 0.1 cm³ around the meniscus (read the bottom, to 2 d.p.). */
export function MeniscusLoupe({ level, liquid = '#cfe3f6', caption, id }: { level: number | null; liquid?: string; caption?: string; id: string }) {
  const h = 200;
  const per = 90;
  const mid = h / 2;
  const y = (cm: number) => mid + (cm - (level ?? 0)) * per;
  const edge = 0.16 * per;
  const ticks: number[] = [];
  if (level !== null) for (let t = Math.floor((level - 1.2) * 10); t <= Math.ceil((level + 1.2) * 10); t++) if (t >= 0 && t <= 500) ticks.push(t / 10);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox={`0 0 96 ${h}`} className="h-[200px] w-[96px] rounded-xl border border-border bg-card" role="img" aria-label={level === null ? 'Burette not filled' : 'Close-up of the meniscus'}>
        <defs>
          <clipPath id={`acids-tube-${id}`}>
            <rect x="22" y="0" width="44" height={h} />
          </clipPath>
        </defs>
        {level !== null && (
          <g clipPath={`url(#acids-tube-${id})`}>
            <path d={`M22 ${mid - edge} Q44 ${mid + edge} 66 ${mid - edge} L66 ${h} L22 ${h} Z`} fill={liquid} />
            <path d={`M22 ${mid - edge} Q44 ${mid + edge} 66 ${mid - edge}`} fill="none" stroke="#5b8fc7" strokeWidth="1.5" />
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
      <span className="max-w-[120px] text-center text-[11px] leading-tight text-muted-foreground">{caption ?? 'Read the bottom of the meniscus, to 2 d.p.'}</span>
    </div>
  );
}

/** Time-lapse picker (only while something is happening on the bench). */
export function SpeedPicker({ x, dark = false }: { x: Acids; dark?: boolean }) {
  const speeds = SPEEDS[x.task];
  if (speeds.length < 2) return null;
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label="Time-lapse">
      <Timer className={cn('size-3.5', dark ? 'text-white/70' : 'text-muted-foreground')} aria-hidden />
      {speeds.map((s) => (
        <button key={s} type="button" onClick={() => x.setSpeed(s)} aria-pressed={x.speed === s} className={cn('rounded-md px-1.5 py-0.5 text-[12px] tabular', x.speed === s ? 'bg-brand text-brand-foreground' : dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-muted hover:bg-muted/70')}>
          {s}×
        </button>
      ))}
    </span>
  );
}
