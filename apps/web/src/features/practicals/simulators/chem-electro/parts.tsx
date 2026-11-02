import { ELEC_AMMETER } from '@aischool/shared';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPEEDS, fmtClock, speedLabel, type Electro } from './actions';

export { ThermoLoupe } from '../chem-energetics/parts';

/**
 * Small pictures shared by the 2D lab and the 3D lab's reading panels: the
 * balance display, the ammeter face (0–1 A, 0.02 A divisions), the
 * high-resistance voltmeter's display, the stopwatch, the graduated tube's
 * scale with the water level, and the time-lapse picker.
 */

/** A top-pan balance's display. */
export function BalanceDisplay({ value, label }: { value: number | null; label?: string }) {
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <span className="rounded-md bg-[#9fc59a] px-2.5 py-0.5 font-mono text-[17px] font-bold tabular text-[#10200d]" aria-label={`Balance reads ${value === null ? 'zero' : `${value.toFixed(2)} grams`}`}>
        {(value ?? 0).toFixed(2)} g
      </span>
      {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
    </div>
  );
}

/** The moving-coil ammeter: read to the nearest 0.01 A (half a division). */
export function AmmeterFace({ amps, className }: { amps: number; className?: string }) {
  const { fsd, minor, major } = ELEC_AMMETER;
  const W = 240;
  const cx = W / 2;
  const cy = 150;
  const R = 120;
  const ang = (x: number) => ((-50 + 100 * (x / fsd)) * Math.PI) / 180;
  const shown = Math.max(-0.03 * fsd, Math.min(1.05 * fsd, amps));
  const ticks = Math.round(fsd / minor);
  return (
    <svg viewBox={`0 0 ${W} 170`} className={cn('h-[150px] w-[212px] rounded-xl border border-border bg-[#fbfbf6]', className)} role="img" aria-label={`Ammeter: the needle is at about ${amps.toFixed(2)} amperes`}>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const x = i * minor;
        const big = Math.abs(x / major - Math.round(x / major)) < 1e-6;
        const mid = !big && Math.abs(x / (major / 2) - Math.round(x / (major / 2))) < 1e-6;
        const a = ang(x);
        const len = big ? 14 : mid ? 10 : 6;
        return (
          <g key={i}>
            <line x1={cx + R * Math.sin(a)} y1={cy - R * Math.cos(a)} x2={cx + (R - len) * Math.sin(a)} y2={cy - (R - len) * Math.cos(a)} stroke="#16202a" strokeWidth={big ? 1.8 : 0.9} />
            {big && (
              <text x={cx + (R + 11) * Math.sin(a)} y={cy - (R + 11) * Math.cos(a) + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#16202a">
                {Number(x.toFixed(1))}
              </text>
            )}
          </g>
        );
      })}
      <text x={cx} y={cy - 48} textAnchor="middle" fontSize="26" fontWeight="800" fill="#16202a">
        A
      </text>
      <line x1={cx} y1={cy} x2={cx + (R - 4) * Math.sin(ang(shown))} y2={cy - (R - 4) * Math.cos(ang(shown))} stroke="#b91c1c" strokeWidth="1.6" />
      <circle cx={cx} cy={cy} r="5" fill="#16202a" />
    </svg>
  );
}

/** The high-resistance (digital) voltmeter's display; `null` while it is not connected. */
export function VoltmeterDisplay({ volts, label }: { volts: number | null; label?: string }) {
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <span className="min-w-[96px] rounded-md bg-[#c7d3b4] px-2.5 py-1 text-right font-mono text-[20px] font-bold tabular text-[#16200d]" aria-label={volts === null ? 'Voltmeter not connected' : `Voltmeter reads ${volts.toFixed(2)} volts`}>
        {volts === null ? '-.--' : volts.toFixed(2)} V
      </span>
      {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
    </div>
  );
}

export function StopwatchDisplay({ sec, running }: { sec: number; running: boolean }) {
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <span className={cn('rounded-md bg-[#20262c] px-2.5 py-0.5 font-mono text-[17px] font-bold tabular', running ? 'text-[#7cf09a]' : 'text-[#d6dee5]')} aria-label={`Stopwatch ${fmtClock(sec)}`}>
        {fmtClock(sec)}
      </span>
      <span className="text-[11px] text-muted-foreground">stopwatch {running ? '(running)' : ''}</span>
    </div>
  );
}

/**
 * The graduated tube close-up: 1 cm³ divisions numbered every 5, the tube
 * inverted (volumes increase downwards from the closed end), the water
 * inside at `vol`, and the trough's level beside it (level when `levelled`).
 */
export function GradTubeLoupe({ vol, levelled, className }: { vol: number; levelled: boolean; className?: string }) {
  const H = 220;
  const k = 16; // px per cm³
  const mid = H / 2;
  const Y = (c: number) => mid + (c - vol) * k;
  const ticks: number[] = [];
  for (let c = Math.floor(vol) - 7; c <= Math.ceil(vol) + 7; c++) if (c >= 0 && c <= 60) ticks.push(c);
  return (
    <figure className={cn('space-y-1', className)}>
      <svg viewBox={`0 0 120 ${H}`} className="h-[220px] w-[120px] rounded-lg border border-border bg-[#f6f9fb]" role="img" aria-label={`Graduated tube: the water inside is at about ${vol.toFixed(1)} cubic centimetres${levelled ? ', levels equal' : ', inside level above the trough'}`}>
        <rect x={36} y={0} width={26} height={H} fill="#ffffff" stroke="#9fb0bb" />
        <rect x={37} y={Y(vol)} width={24} height={H - Y(vol)} fill="#cfe4f1" />
        <path d={`M37 ${Y(vol)} Q49 ${Y(vol) + 5} 61 ${Y(vol)}`} fill="none" stroke="#6b8ba0" strokeWidth="1.2" />
        {ticks.map((c) => (
          <g key={c}>
            <line x1={36} x2={c % 5 === 0 ? 52 : 45} y1={Y(c)} y2={Y(c)} stroke="#222" strokeWidth={c % 5 === 0 ? 1.2 : 0.7} />
            {c % 5 === 0 && (
              <text x={66} y={Y(c) + 4} fontSize="11" fontWeight="700" fill="#222">
                {c}
              </text>
            )}
          </g>
        ))}
        <rect x={88} y={levelled ? Y(vol) : Math.min(H - 6, Y(vol) + 34)} width={28} height={H} fill="#d9ebf5" />
        <text x={102} y={14} textAnchor="middle" fontSize="8" fill="#5b6672">
          trough
        </text>
      </svg>
      <figcaption className="max-w-[140px] text-[11px] leading-tight text-muted-foreground">cm³ of air (read the bottom of the meniscus, to 0.5 cm³){levelled ? ' · levels equal' : ' · levels NOT equal'}</figcaption>
    </figure>
  );
}

/** Time-lapse picker (only while something is happening on the bench). */
export function SpeedPicker({ x, dark = false }: { x: Electro; dark?: boolean }) {
  const speeds = SPEEDS[x.task];
  if (speeds.length < 2) return null;
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label="Time-lapse">
      <Timer className={cn('size-3.5', dark ? 'text-white/70' : 'text-muted-foreground')} aria-hidden />
      {speeds.map((s) => (
        <button key={s} type="button" onClick={() => x.setSpeed(s)} aria-pressed={x.speed === s} className={cn('rounded-md px-1.5 py-0.5 text-[12px] tabular', x.speed === s ? 'bg-brand text-brand-foreground' : dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-muted hover:bg-muted/70')}>
          {speedLabel(x.task, s)}
        </button>
      ))}
    </span>
  );
}
