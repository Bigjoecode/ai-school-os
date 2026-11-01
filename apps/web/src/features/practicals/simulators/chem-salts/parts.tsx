import { CHROM_DYE_INFO, CHROM_PAPER, chromAboveLine, chromFront, chromSpots, type ChemSaltsVariant, type ChromLane, type ChromWork } from '@aischool/shared';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPEEDS, type Salts } from './actions';

/** x position (cm across the 6 cm strip) of each lane. */
export const LANE_X: Record<ChromLane, number> = { INK: 1.5, A: 3, B: 4.5 };
export const PAPER_W = 6;

/**
 * The chromatography paper: the baseline (pencil grey, or ink that runs), the
 * spots (spreading as they climb), the wet solvent region up to the front,
 * the pencilled front, and a ruler with mm marks beside it for measuring.
 */
export function PaperSvg({ v, w, t, px = 26, ruler = true, className }: { v: ChemSaltsVariant; w: ChromWork; t: number; px?: number; ruler?: boolean; className?: string }) {
  const H = CHROM_PAPER;
  const left = ruler ? 1.6 : 0.2;
  const W = left + PAPER_W + 0.4;
  const y = (cm: number) => (H + 0.4 - cm) * px;
  const x = (cm: number) => (left + cm) * px;
  const run = w.developed !== null || w.inTank;
  const front = run ? chromFront(v, w, t) : 0;
  const wet = run && !w.dried;
  const spots = run ? chromSpots(v, w, t) : [];
  const above = chromAboveLine(w);
  const lanes = w.spots.filter((s) => s.n > 0);
  return (
    <svg viewBox={`0 0 ${W * px} ${(H + 0.8) * px}`} className={className} role="img" aria-label={`Chromatography paper${w.line ? `, baseline at ${w.lineAt} cm` : ''}${run ? `, solvent front about ${front.toFixed(1)} cm from the bottom` : ''}`}>
      <defs>
        <filter id="salts-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={px * 0.05} />
        </filter>
      </defs>
      <rect x={x(0)} y={y(H)} width={PAPER_W * px} height={H * px} fill="#fbfaf4" stroke="#c9c4b4" strokeWidth={1} />
      {wet && <rect x={x(0)} y={y(Math.min(front, H))} width={PAPER_W * px} height={Math.min(front, H) * px} fill="#cfe2ef" opacity={0.55} />}
      {w.depth !== null && w.inTank && <rect x={x(-0.3)} y={y(w.depth)} width={(PAPER_W + 0.6) * px} height={w.depth * px} fill={w.solvent === 'ETHANOL' ? '#e7eef3' : '#b9d6ea'} opacity={0.8} />}
      {w.line && w.lineAt !== null && <line x1={x(0.2)} x2={x(PAPER_W - 0.2)} y1={y(w.lineAt)} y2={y(w.lineAt)} stroke={w.line === 'PENCIL' ? '#8a8a8a' : '#1d1d2a'} strokeWidth={w.line === 'PENCIL' ? 1 : 1.6} />}
      {w.line === 'INK' && run && w.lineAt !== null && !above && (
        <g opacity={0.5} filter="url(#salts-blur)">
          {(['#2457c5', '#cf2338', '#7a3fb0'] as const).map((c, k) => (
            <rect key={c} x={x(0.2)} y={y(w.lineAt! + (front - w.lineAt!) * (0.25 + k * 0.2) + 0.15)} width={(PAPER_W - 0.4) * px} height={0.3 * px} fill={c} />
          ))}
        </g>
      )}
      {/* spots on the baseline before the run, or where they travelled */}
      {!run &&
        w.lineAt !== null &&
        lanes.map((s) => {
          const r = 0.12 + (s.wet ? 0.16 : 0) + Math.min(0.05, s.n * 0.01);
          const col = s.lane === 'INK' ? '#262330' : CHROM_DYE_INFO[v.chrom[s.lane]].hex;
          return <circle key={s.lane} cx={x(LANE_X[s.lane])} cy={y(w.lineAt!)} r={r * px} fill={col} opacity={s.dry ? 0.85 : 0.65} />;
        })}
      {run && above && w.depth !== null && <rect x={x(0.3)} y={y(w.depth + 0.25)} width={(PAPER_W - 0.6) * px} height={0.35 * px} fill="#4a3b52" opacity={0.25} filter="url(#salts-blur)" />}
      {spots.map((s, k) => (
        <ellipse key={k} cx={x(LANE_X[s.lane])} cy={y(w.lineAt! + s.dist)} rx={s.r * px} ry={s.r * px * 1.15} fill={CHROM_DYE_INFO[s.dye].hex} opacity={0.8} filter="url(#salts-blur)" />
      ))}
      {w.frontMarked && w.developed !== null && <line x1={x(0.1)} x2={x(PAPER_W - 0.1)} y1={y(Math.min(front, H))} y2={y(Math.min(front, H))} stroke="#7d7d7d" strokeWidth={1} strokeDasharray="4 3" />}
      {(['INK', 'A', 'B'] as const).map((l) => (
        <text key={l} x={x(LANE_X[l])} y={y(0.35)} textAnchor="middle" fontSize={px * 0.38} fill="#7d7d7d">
          {l === 'INK' ? 'ink' : l}
        </text>
      ))}
      {ruler && (
        <g>
          <rect x={0.15 * px} y={y(H)} width={1.25 * px} height={H * px} fill="#f4e7c2" stroke="#b9a777" />
          {Array.from({ length: H * 10 + 1 }, (_, i) => {
            const cm = i / 10;
            const major = i % 10 === 0;
            const half = i % 5 === 0;
            return <line key={i} x1={1.4 * px} x2={(1.4 - (major ? 0.55 : half ? 0.38 : 0.22)) * px} y1={y(cm)} y2={y(cm)} stroke="#3b3320" strokeWidth={major ? 1.1 : 0.6} />;
          })}
          {Array.from({ length: H + 1 }, (_, cm) => (
            <text key={cm} x={0.42 * px} y={y(cm) + px * 0.14} fontSize={px * 0.38} fill="#3b3320">
              {cm}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}

/**
 * Close-up of the thermometer in the oil bath beside the capillary: 1 °C
 * divisions around the reading, and the sample — white solid, glistening and
 * shrinking as it melts, then a clear liquid.
 */
export function ThermoLoupe({ T, melt, sample, attached, className }: { T: number; melt: number | null; sample?: 'IMPURE' | 'PURE'; attached?: boolean; className?: string }) {
  const h = 220;
  const per = 14;
  const mid = h / 2;
  const yOf = (t: number) => mid - (t - T) * per;
  const ticks: number[] = [];
  for (let t = Math.floor(T - h / 2 / per); t <= Math.ceil(T + h / 2 / per); t++) ticks.push(t);
  return (
    <div className={cn('flex items-end gap-3', className)}>
      <svg viewBox={`0 0 90 ${h}`} className="h-[220px] w-[90px] rounded-xl border border-border bg-card" role="img" aria-label={`Thermometer close-up: about ${T.toFixed(0)} °C`}>
        <rect x="34" y="0" width="16" height={h} fill="#eef3f6" />
        <rect x="39" y={mid} width="6" height={h - mid} fill="#c62828" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1="34" x2={t % 5 === 0 ? 50 : 42} y1={yOf(t)} y2={yOf(t)} stroke="#333" strokeWidth={t % 5 === 0 ? 1.2 : 0.7} />
            {t % 5 === 0 && (
              <text x="54" y={yOf(t) + 4} fontSize="11" fontWeight="600" fill="currentColor">
                {t}
              </text>
            )}
          </g>
        ))}
      </svg>
      {melt !== null && (
        <div className="flex flex-col items-center gap-1">
          <svg viewBox="0 0 40 120" className="h-[150px] w-[50px]" role="img" aria-label={melt <= 0 ? 'Sample solid' : melt >= 1 ? 'Sample completely melted: clear liquid' : 'Sample melting'}>
            <rect x="14" y="4" width="12" height="112" rx="6" fill="#f3f6f8" stroke="#9fb0bb" />
            {/* the sample, 3 mm of packed powder at the bottom */}
            <rect x="15.5" y={88 + 18 * melt * 0.35} width="9" height={26 - 18 * melt * 0.35} rx="4" fill={melt >= 1 ? '#e6f0f5' : '#ffffff'} stroke={melt > 0 && melt < 1 ? '#9fc3d6' : 'none'} />
            {melt > 0 && melt < 1 && Array.from({ length: 5 }, (_, k) => <circle key={k} cx={17 + (k % 3) * 3} cy={92 + k * 3.5} r={1.2 * (1 - melt)} fill="#ffffff" stroke="#c8d6de" strokeWidth={0.4} />)}
          </svg>
          <span className="max-w-[90px] text-center text-[11px] leading-tight text-muted-foreground">{sample === 'PURE' ? 'Recrystallised' : sample === 'IMPURE' ? 'Impure' : ''}{attached === false ? ' · loose!' : ''}</span>
        </div>
      )}
    </div>
  );
}

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

/** Time-lapse: 1× / n× (only while something is happening on the bench). */
export function SpeedPicker({ x, dark = false }: { x: Salts; dark?: boolean }) {
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

/** Lab clock as m:ss. */
export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
