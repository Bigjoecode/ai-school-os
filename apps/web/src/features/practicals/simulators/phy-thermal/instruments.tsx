import { THERM_SCALE } from '@aischool/shared';
import { Eye as EyeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The thermal lab's instruments as close-up drawings, shared by the 2D lab and
 * the 3D lab's reading panel: the thermometer's mercury against its scale, the
 * rod's end against the metre rule, the air column and its acid index against
 * the ruler, the analogue ammeter and voltmeter, and the balance and
 * stopwatch displays. Each takes what the instrument really indicates; the
 * student reads it. With the eye off level the reading appears shifted
 * (parallax).
 */

const card = 'rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900';
const INK = '#1b1d1f';

export type EyePos = -1 | 0 | 1;
/** Where your eye is when you read: below, level, above (a vertical scale) or left, square on, right. */
export function EyeControl({ eye, onEye, vertical = true, compact }: { eye: EyePos; onEye: (e: EyePos) => void; vertical?: boolean; compact?: boolean }) {
  const names: Record<EyePos, string> = vertical ? { [-1]: 'Below', 0: 'Level', 1: 'Above' } : { [-1]: 'Left', 0: 'Square on', 1: 'Right' };
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]" role="radiogroup" aria-label="Your eye's position">
      <EyeIcon className="size-3.5 text-muted-foreground" aria-hidden />
      {!compact && <span className="text-muted-foreground">Eye:</span>}
      {([1, 0, -1] as EyePos[]).map((e) => (
        <Button key={e} size="sm" variant={eye === e ? 'brand' : 'outline'} className="h-7 px-2" onClick={() => onEye(e)} aria-pressed={eye === e} role="radio" aria-checked={eye === e}>
          {names[e]}
        </Button>
      ))}
      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', eye === 0 ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>{eye === 0 ? 'no parallax' : 'parallax!'}</span>
    </div>
  );
}

/** A magnified strip of the thermometer around the end of the mercury (1 °C marks; read to 0.5 °C or better); `shift` is the parallax (°C). */
export function ThermoLoupe({ at, shift = 0, label }: { at: number; shift?: number; label?: string }) {
  const H = 230;
  const k = 15;
  const centre = Math.round(at);
  const Y = (c: number) => H / 2 - (c - centre) * k;
  const ticks: number[] = [];
  for (let c = centre - 8; c <= centre + 8; c++) if (c >= THERM_SCALE.min && c <= THERM_SCALE.max) ticks.push(c);
  const top = Y(Math.max(THERM_SCALE.min, Math.min(THERM_SCALE.max, at + shift)));
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 130 ${H}`} className="h-[230px] w-[130px] rounded-lg border border-border bg-gradient-to-r from-slate-100 via-white to-slate-100" role="img" aria-label={`Close-up of ${label ?? 'the thermometer'} at the end of the mercury: read it against the scale`}>
        <rect x={44} y={0} width={18} height={H} rx={8} fill="#eef3f6" stroke="#b8c4cc" strokeWidth="0.8" />
        <rect x={50.5} y={top} width={5} height={H - top} fill="#9aa5ad" />
        <rect x={51.5} y={top} width={1.2} height={H - top} fill="#e9eef1" />
        {ticks.map((c) => {
          const y = Y(c);
          const len = c % 10 === 0 ? 22 : c % 5 === 0 ? 16 : 10;
          return (
            <g key={c}>
              <line x1={64} x2={64 + len} y1={y} y2={y} stroke={INK} strokeWidth={c % 5 === 0 ? 1.3 : 0.8} />
              {c % 5 === 0 && (
                <text x={92} y={y + 4} fontSize={c % 10 === 0 ? 13 : 11} fontWeight={c % 10 === 0 ? 700 : 500} fill={INK}>
                  {c}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="max-w-[130px] text-[11px] text-muted-foreground">Read where the mercury ends, eye level with it. Each mark is 1 °C.</figcaption>
    </figure>
  );
}

/** The rod's far end against the metre rule (mm marks, numbered in cm). `mm` is where the end is; `shift` the parallax (mm). */
export function RuleLoupe({ mm, shift = 0 }: { mm: number; shift?: number }) {
  const W = 340;
  const k = 9; // px per mm
  const cx = W / 2;
  const X = (x: number) => cx + (x - mm) * k;
  const ticks: number[] = [];
  for (let x = Math.floor(mm - 18); x <= Math.ceil(mm + 18); x++) ticks.push(x);
  const end = X(mm + shift);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} 120`} className={cn(card, 'w-full max-w-[400px] select-none')} role="img" aria-label="Close-up of the end of the rod against the metre rule: read the millimetre mark level with the end">
        <rect x={0} y={20} width={W} height={46} fill="#e8d3a6" stroke="#a88b55" />
        {ticks.map((x) => (
          <g key={x}>
            <line x1={X(x)} x2={X(x)} y1={20} y2={20 + (x % 10 === 0 ? 22 : x % 5 === 0 ? 15 : 9)} stroke={INK} strokeWidth={x % 10 === 0 ? 1.4 : 0.8} />
            {x % 10 === 0 && (
              <text x={X(x)} y={58} textAnchor="middle" fontSize="12" fontWeight="700" fill={INK}>
                {x / 10}
              </text>
            )}
          </g>
        ))}
        {/* the rod */}
        <rect x={0} y={74} width={end} height={18} fill="#c9a640" stroke="#7a6320" />
        <rect x={0} y={76} width={end} height={4} fill="#e8d27a" opacity={0.7} />
        <line x1={end} x2={end} y1={66} y2={96} stroke="#7a6320" strokeWidth="1" strokeDasharray="2 2" />
        <text x={8} y={110} fontSize="9" fill="#4b5563">
          cm (each small mark is 1 mm) — the other end of the rod is at the zero of the rule
        </text>
      </svg>
      <figcaption className="max-w-[400px] text-[11px] text-muted-foreground">Read the end of the rod to the nearest millimetre, looking straight down on the mark.</figcaption>
    </figure>
  );
}

/** The capillary tube against the ruler: the air column (sealed end at 0) up to the bottom of the acid index at `l` cm; `shift` is the parallax (cm). */
export function ColumnLoupe({ l, shift = 0 }: { l: number; shift?: number }) {
  const H = 240;
  const k = 40; // px per cm
  const cy = H / 2;
  const Y = (cm: number) => cy - (cm - l) * k;
  const ticks: number[] = [];
  for (let mm = Math.floor((l - 2.8) * 10); mm <= Math.ceil((l + 2.8) * 10); mm++) if (mm >= 0) ticks.push(mm);
  const b = Y(l + shift);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 150 ${H}`} className="h-[240px] w-[150px] rounded-lg border border-border bg-gradient-to-b from-sky-50 to-sky-100" role="img" aria-label="Close-up of the air column and the acid index against the ruler: read the bottom of the index">
        {/* ruler */}
        <rect x={70} y={0} width={60} height={H} fill="#f3ead2" stroke="#b39b62" />
        {ticks.map((mm) => (
          <g key={mm}>
            <line x1={70} x2={70 + (mm % 10 === 0 ? 22 : mm % 5 === 0 ? 15 : 9)} y1={Y(mm / 10)} y2={Y(mm / 10)} stroke={INK} strokeWidth={mm % 10 === 0 ? 1.3 : 0.7} />
            {mm % 10 === 0 && (
              <text x={98} y={Y(mm / 10) + 4} fontSize="12" fontWeight="700" fill={INK}>
                {mm / 10}
              </text>
            )}
          </g>
        ))}
        {/* capillary: air below, the index above */}
        <rect x={40} y={0} width={18} height={H} rx={3} fill="#eaf5fb" stroke="#9cb8c8" />
        <rect x={46} y={b} width={6} height={H - b} fill="#ffffff" opacity={0.9} />
        <rect x={46} y={b - 1.0 * k} width={6} height={1.0 * k} fill="#8f2d1b" opacity={0.85} />
        <path d={`M46 ${b} q3 -3 6 0`} fill="none" stroke="#5b1a0f" strokeWidth="1" />
        <text x={4} y={b + 14} fontSize="9" fill="#334155">
          air
        </text>
        <text x={4} y={b - 16} fontSize="9" fill="#8f2d1b">
          acid
        </text>
      </svg>
      <figcaption className="max-w-[150px] text-[11px] text-muted-foreground">l is from the sealed end (0) to the bottom of the index. Eye level with it.</figcaption>
    </figure>
  );
}

/** An analogue meter's arc scale and needle (−50° … +50°). */
export function MeterSvg({ letter, value, fsd, minor, major, shift = 0 }: { letter: 'A' | 'V'; value: number; fsd: number; minor: number; major: number; shift?: number }) {
  const cx = 120;
  const cy = 150;
  const R = 110;
  const ang = (x: number) => ((-50 + 100 * (Math.max(-0.03 * fsd, Math.min(1.04 * fsd, x)) / fsd)) * Math.PI) / 180;
  const pt = (a: number, r: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;
  const labelEvery = fsd > 5 ? 5 * major : major;
  const ticks: number[] = [];
  for (let x = 0; x <= fsd + 1e-9; x += minor) ticks.push(Math.round(x * 1000) / 1000);
  const [nx, ny] = pt(ang(value + shift), R - 6);
  return (
    <svg viewBox="0 0 240 170" className={cn(card, 'w-full max-w-[260px] select-none')} role="img" aria-label={`Close-up of the ${letter === 'A' ? 'ammeter' : 'voltmeter'} scale (0 to ${fsd} ${letter}): read the needle`}>
      {ticks.map((x) => {
        const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
        const half = !isMajor && Math.abs((2 * x) / major - Math.round((2 * x) / major)) < 1e-6;
        const [x1, y1] = pt(ang(x), R);
        const [x2, y2] = pt(ang(x), R - (isMajor ? 14 : half ? 10 : 6));
        const [tx, ty] = pt(ang(x), R - 26);
        return (
          <g key={x}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={isMajor ? 1.4 : 0.7} />
            {isMajor && Math.abs(x / labelEvery - Math.round(x / labelEvery)) < 1e-6 && (
              <text x={tx} y={ty + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={INK}>
                {Number(x.toFixed(2))}
              </text>
            )}
          </g>
        );
      })}
      <text x={cx} y={cy - 40} textAnchor="middle" fontSize="20" fontWeight="700" fill={INK}>
        {letter}
      </text>
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#b91c1c" strokeWidth="1.6" />
      <circle cx={cx} cy={cy} r={5} fill={INK} />
    </svg>
  );
}

/** A seven-segment-style display (the balance, the stopwatch). */
export function Display({ text, label, tone = 'green' }: { text: string; label: string; tone?: 'green' | 'blue' }) {
  return (
    <span className={cn('inline-block rounded-md px-2.5 py-1 font-mono text-[18px] font-bold tabular', tone === 'green' ? 'bg-[#c9d7b8] text-[#16200f]' : 'bg-[#0b2733] text-[#7dd3fc]')} aria-label={label}>
      {text}
    </span>
  );
}
