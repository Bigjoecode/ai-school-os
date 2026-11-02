import { SKIN_AREAS, SKIN_AREA_LABEL, type PulseAxis, type PulseCurve, type SkinArea } from '@aischool/shared';
import { cn } from '@/lib/utils';

/**
 * The 2D drawings, shared by the 2D lab and the 3D lab's close-up views: the
 * stopwatch, the pulse graph (from the student's own table), the two lime
 * water tubes, the mirror and cobalt chloride paper, the thermometer, the
 * hanging metre rule with the thumb where it was caught, the skin map with
 * its five areas and the bar chart of thresholds.
 */

/** A digital stopwatch display (seconds, to 0.1 s). */
export function Stopwatch({ sec, label }: { sec: number | null; label?: string }) {
  const m = sec === null ? 0 : Math.floor(sec / 60);
  const s = sec === null ? 0 : sec - m * 60;
  return (
    <span className="inline-flex items-center gap-1 rounded-xl border border-border bg-[#1d2a22] px-3 py-1 font-mono text-[18px] tabular-nums text-[#9ff0b4] shadow-inner" role="status" aria-label={label ?? `Stopwatch ${m} minutes ${Math.round(s)} seconds`}>
      {m}:{s.toFixed(0).padStart(2, '0')}
    </span>
  );
}

/** A Catmull-Rom path through points (sorted by x). */
export function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Pulse rate against time after exercise (the student's own rows), with the resting rate dashed. TIME_Y swaps the axes (a common mistake, shown as drawn). */
export function PulseGraph({ points, axis, curve, rest, className }: { points: { x: number; y: number }[]; axis: PulseAxis | null; curve: PulseCurve | null; rest: number | null; className?: string }) {
  const W = 360;
  const H = 240;
  const M = { l: 42, r: 12, t: 12, b: 38 };
  const tMax = Math.max(8, ...points.map((p) => p.x)) * 1.05;
  const ys = points.map((p) => p.y);
  const lo = Math.max(0, Math.floor((Math.min(rest ?? 70, ...ys) - 10) / 10) * 10);
  const hi = Math.ceil((Math.max(rest ?? 80, ...ys, 100) + 10) / 10) * 10;
  const swap = axis === 'TIME_Y';
  const sx = (x: number, y: number) => (swap ? M.l + ((y - lo) / (hi - lo)) * (W - M.l - M.r) : M.l + (x / tMax) * (W - M.l - M.r));
  const sy = (x: number, y: number) => (swap ? H - M.b - (x / tMax) * (H - M.t - M.b) : H - M.b - ((y - lo) / (hi - lo)) * (H - M.t - M.b));
  const pts = [...points].sort((a, b) => a.x - b.x).map((p) => ({ x: sx(p.x, p.y), y: sy(p.x, p.y) }));
  const timeTicks = Array.from({ length: Math.floor(tMax) + 1 }, (_, k) => k);
  const rateTicks = Array.from({ length: Math.round((hi - lo) / 10) + 1 }, (_, k) => lo + k * 10);
  const tl = 'Time after exercise / min';
  const rl = 'Pulse rate / beats min⁻¹';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('w-full rounded-xl border border-border bg-card', className)} role="img" aria-label={`Graph of pulse rate against time: ${points.length} points${curve ? `, ${curve === 'SMOOTH' ? 'smooth curve' : 'ruled lines'}` : ''}`}>
      {timeTicks.map((t) => (
        <g key={`t${t}`}>
          {swap ? <line x1={M.l} x2={W - M.r} y1={sy(t, lo)} y2={sy(t, lo)} className="stroke-border" strokeWidth={0.6} /> : <line x1={sx(t, lo)} x2={sx(t, lo)} y1={M.t} y2={H - M.b} className="stroke-border" strokeWidth={0.6} />}
          <text x={swap ? M.l - 4 : sx(t, lo)} y={swap ? sy(t, lo) + 3 : H - M.b + 12} fontSize={9} textAnchor={swap ? 'end' : 'middle'} className="fill-muted-foreground">
            {t}
          </text>
        </g>
      ))}
      {rateTicks.map((y) => (
        <g key={`y${y}`}>
          {swap ? <line x1={sx(0, y)} x2={sx(0, y)} y1={M.t} y2={H - M.b} className="stroke-border" strokeWidth={0.6} /> : <line x1={M.l} x2={W - M.r} y1={sy(0, y)} y2={sy(0, y)} className="stroke-border" strokeWidth={0.6} />}
          <text x={swap ? sx(0, y) : M.l - 4} y={swap ? H - M.b + 12 : sy(0, y) + 3} fontSize={9} textAnchor={swap ? 'middle' : 'end'} className="fill-muted-foreground">
            {y}
          </text>
        </g>
      ))}
      <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} className="stroke-foreground/70" />
      <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="stroke-foreground/70" />
      {rest !== null && !swap && <line x1={M.l} x2={W - M.r} y1={sy(0, rest)} y2={sy(0, rest)} className="stroke-success" strokeDasharray="5 4" strokeWidth={1.2} />}
      {curve === 'SMOOTH' && pts.length >= 2 && !swap && <path d={smoothPath(pts)} fill="none" className="stroke-foreground" strokeWidth={1.4} />}
      {(curve === 'RULED' || (curve === 'SMOOTH' && swap)) && pts.length >= 2 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" className="stroke-foreground" strokeWidth={1.2} />}
      {pts.map((p, i) => (
        <g key={i} className="stroke-brand" strokeWidth={1.4}>
          <line x1={p.x - 4} x2={p.x + 4} y1={p.y - 4} y2={p.y + 4} />
          <line x1={p.x - 4} x2={p.x + 4} y1={p.y + 4} y2={p.y - 4} />
        </g>
      ))}
      <text x={(M.l + W - M.r) / 2} y={H - 6} fontSize={10} textAnchor="middle" className="fill-foreground">
        {swap ? rl : tl}
      </text>
      <text x={11} y={(M.t + H - M.b) / 2} fontSize={10} textAnchor="middle" className="fill-foreground" transform={`rotate(-90 11 ${(M.t + H - M.b) / 2})`}>
        {swap ? tl : rl}
      </text>
      {!points.length && (
        <text x={W / 2} y={H / 2} fontSize={10} textAnchor="middle" className="fill-muted-foreground">
          Your points appear as you fill in beats/min after the exercise.
        </text>
      )}
    </svg>
  );
}

const milk = (t: number) => `rgba(248,248,242,${(0.04 + 0.92 * Math.min(1, t)).toFixed(2)})`;

/** The inhaled/exhaled air apparatus: tube A (air drawn in through it) and tube B (breath blown out through it), each lime water with its milkiness. */
export function LimeTubesSvg({ turbA, turbB, lime, label, className }: { turbA: number; turbB: number; lime: 'EQUAL' | 'UNEQUAL' | null; label: string; className?: string }) {
  const tube = (x: number, t: number, name: string, h: number, inlet: 'long' | 'short') => (
    <g>
      <rect x={x} y={40} width={44} height={150} rx={20} className="fill-sky-100/40 stroke-slate-400" strokeWidth={1.5} />
      {lime && <rect x={x + 2} y={190 - h} width={40} height={h - 2} rx={18} fill="#9cc8e0" opacity={0.25} />}
      {lime && <rect x={x + 2} y={190 - h} width={40} height={h - 2} rx={18} fill={milk(t)} />}
      <rect x={x - 4} y={30} width={52} height={16} rx={3} className="fill-orange-800" />
      <line x1={x + 14} x2={x + 14} y1={14} y2={inlet === 'long' ? 175 : 60} className="stroke-slate-500" strokeWidth={4} />
      <line x1={x + 30} x2={x + 30} y1={14} y2={inlet === 'long' ? 60 : 175} className="stroke-slate-500" strokeWidth={4} />
      <text x={x + 22} y={216} fontSize={12} textAnchor="middle" className="fill-foreground font-semibold">
        {name}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 260 240" className={cn('w-full max-w-[320px] rounded-xl border border-border bg-card', className)} role="img" aria-label={label}>
      {/* a dark card behind the tubes makes the milkiness easy to see */}
      <rect x={20} y={30} width={220} height={170} rx={10} fill="#2b3440" />
      {tube(40, turbA, 'A — inhaled air', lime === 'UNEQUAL' ? 70 : 90, 'long')}
      {tube(170, turbB, 'B — exhaled air', 90, 'long')}
      <path d="M70 14 H200" className="fill-none stroke-slate-500" strokeWidth={4} />
      <path d="M128 14 V2" className="fill-none stroke-slate-600" strokeWidth={6} />
      <text x={128} y={234} fontSize={10} textAnchor="middle" className="fill-muted-foreground">
        {lime ? `A ${turbA >= 0.5 ? 'milky' : turbA >= 0.2 ? 'slightly cloudy' : 'clear'} · B ${turbB >= 0.5 ? 'milky' : turbB >= 0.2 ? 'slightly cloudy' : 'clear'}` : 'No lime water yet'}
      </text>
    </svg>
  );
}

/** The mirror with its mist and the cobalt chloride paper. */
export function MirrorSvg({ misted, cobalt, pink, className }: { misted: boolean; cobalt: boolean; pink: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 220 120" className={cn('w-full max-w-[260px] rounded-xl border border-border bg-card', className)} role="img" aria-label={`Mirror ${misted ? 'misted' : 'clear'}; cobalt chloride paper ${cobalt ? (pink ? 'pink' : 'blue') : 'not used'}`}>
      <rect x={14} y={14} width={120} height={92} rx={8} fill="#cfdde6" stroke="#7d8b95" strokeWidth={2} />
      <path d="M30 30 L60 22 M40 52 L100 30" stroke="#ffffff" strokeWidth={4} opacity={0.6} />
      {misted && <ellipse cx={74} cy={62} rx={42} ry={30} fill="#ffffff" opacity={0.55} />}
      {cobalt && <rect x={152} y={36} width={50} height={36} rx={3} fill={pink ? '#f2a3c0' : '#4f7fd9'} stroke="#555" strokeWidth={1} />}
      <text x={177} y={92} fontSize={9.5} textAnchor="middle" className="fill-muted-foreground">
        {cobalt ? 'cobalt chloride' : ''}
      </text>
    </svg>
  );
}

/** A thermometer reading (°C). */
export function ThermoSvg({ t, className }: { t: number | null; className?: string }) {
  const lo = 20;
  const hi = 40;
  const y = (x: number) => 180 - ((x - lo) / (hi - lo)) * 160;
  return (
    <svg viewBox="0 0 80 200" className={cn('h-[150px] rounded-xl border border-border bg-card', className)} role="img" aria-label={t === null ? 'Thermometer not read' : `Thermometer reads ${t.toFixed(1)} °C`}>
      <rect x={30} y={14} width={14} height={170} rx={7} className="fill-white stroke-slate-400" />
      <circle cx={37} cy={186} r={10} fill="#d32f2f" />
      {t !== null && <rect x={34} y={y(t)} width={6} height={186 - y(t)} fill="#d32f2f" />}
      {Array.from({ length: 11 }, (_, k) => lo + k * 2).map((x) => (
        <g key={x}>
          <line x1={44} x2={x % 10 === 0 ? 54 : 50} y1={y(x)} y2={y(x)} className="stroke-slate-500" />
          {x % 4 === 0 && (
            <text x={56} y={y(x) + 3} fontSize={8.5} className="fill-muted-foreground">
              {x}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** The hanging metre rule (0–40 cm shown) with the thumb where it was caught. */
export function RulerSvg({ cm, className, label }: { cm: number | null; className?: string; label?: string }) {
  const top = 12;
  const px = 6.4;
  const ty = cm === null ? top : top + Math.min(40, cm) * px;
  return (
    <svg viewBox="0 0 200 290" className={cn('w-full max-w-[220px] rounded-xl border border-border bg-card', className)} role="img" aria-label={label ?? (cm === null ? 'The metre rule, not yet dropped' : `Caught at ${cm.toFixed(1)} cm, read at the top of the thumb`)}>
      <rect x={70} y={top - 6} width={36} height={270} fill="#e9d29a" stroke="#9c7b3b" />
      {Array.from({ length: 41 }, (_, k) => k).map((k) => (
        <g key={k}>
          <line x1={70} x2={k % 5 === 0 ? 86 : 78} y1={top + k * px} y2={top + k * px} stroke="#3b2b0d" strokeWidth={k % 5 === 0 ? 1.2 : 0.7} />
          {k % 5 === 0 && (
            <text x={102} y={top + k * px + 3} fontSize={8} textAnchor="end" fill="#3b2b0d">
              {k}
            </text>
          )}
        </g>
      ))}
      {/* finger (behind) and thumb (front) pinching the rule */}
      <ellipse cx={62} cy={ty + 8} rx={16} ry={9} fill="#8d5a3b" />
      <ellipse cx={116} cy={ty + 8} rx={14} ry={8} fill="#a26a45" />
      <line x1={50} x2={150} y1={ty} y2={ty} className="stroke-danger" strokeDasharray="3 3" />
      <text x={154} y={ty + 4} fontSize={10} className="fill-danger font-semibold">
        {cm === null ? '0' : cm.toFixed(1)} cm
      </text>
    </svg>
  );
}

/** The skin areas on a stylised outline (tap one to choose it). */
export const SKIN_SPOT: Record<SkinArea, { x: number; y: number }> = { FINGERTIP: { x: 214, y: 116 }, PALM: { x: 186, y: 126 }, BACK_HAND: { x: 182, y: 104 }, FOREARM: { x: 128, y: 112 }, NECK: { x: 46, y: 44 } };
export function SkinMapSvg({ sel, onPick, done, className }: { sel: SkinArea | null; onPick?: (a: SkinArea) => void; done?: Partial<Record<SkinArea, boolean>>; className?: string }) {
  return (
    <svg viewBox="0 0 250 160" className={cn('w-full max-w-[360px] rounded-xl border border-border bg-card', className)} role="group" aria-label="Areas of skin to test">
      {/* head and shoulders (seen from behind), and an arm with the hand */}
      <circle cx={46} cy={24} r={16} fill="#6b4128" />
      <rect x={38} y={36} width={16} height={18} rx={5} fill="#7a4a2e" />
      <path d="M10 70 Q46 46 82 70 L82 150 L10 150 Z" fill="#e8eef6" stroke="#9aa7b4" />
      <path d="M80 104 L168 98 L172 128 L82 128 Z" fill="#7a4a2e" />
      <path d="M166 96 L200 100 Q222 104 226 116 Q224 128 204 132 L170 130 Z" fill="#8d5a3b" />
      {SKIN_AREAS.map((a) => {
        const p = SKIN_SPOT[a];
        const on = sel === a;
        return (
          <g key={a} role="button" tabIndex={onPick ? 0 : -1} aria-pressed={on} aria-label={SKIN_AREA_LABEL[a]} onClick={() => onPick?.(a)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick?.(a)} className={onPick ? 'cursor-pointer' : undefined}>
            <circle cx={p.x} cy={p.y} r={on ? 9 : 7} className={on ? 'fill-brand stroke-white' : done?.[a] ? 'fill-success/80 stroke-white' : 'fill-white/80 stroke-brand'} strokeWidth={2} />
            <text x={p.x + (a === 'FINGERTIP' ? 10 : 0)} y={a === 'NECK' || a === 'BACK_HAND' ? p.y - 12 : p.y + (a === 'PALM' ? 20 : 22)} fontSize={8.5} textAnchor="middle" className="fill-foreground">
              {SKIN_AREA_LABEL[a].replace('Back of the ', 'Back ')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Bar chart of the two-point threshold (mm) of each area plotted. */
export function SkinBars({ bars, vals, className }: { bars: SkinArea[]; vals: Partial<Record<SkinArea, number>>; className?: string }) {
  const W = 360;
  const H = 210;
  const M = { l: 40, r: 10, t: 12, b: 40 };
  const top = Math.max(10, ...bars.map((b) => vals[b] ?? 0)) * 1.15;
  const step = top > 40 ? 10 : 5;
  const yMax = Math.ceil(top / step) * step;
  const bw = (W - M.l - M.r) / Math.max(5, bars.length);
  const py = (y: number) => H - M.b - (y / yMax) * (H - M.t - M.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('w-full rounded-xl border border-border bg-card', className)} role="img" aria-label={`Bar chart of two-point thresholds: ${bars.map((b) => `${SKIN_AREA_LABEL[b]} ${vals[b] ?? '—'} mm`).join(', ')}`}>
      {Array.from({ length: Math.round(yMax / step) + 1 }, (_, k) => k * step).map((y) => (
        <g key={y}>
          <line x1={M.l} x2={W - M.r} y1={py(y)} y2={py(y)} className="stroke-border" strokeWidth={0.6} />
          <text x={M.l - 4} y={py(y) + 3} fontSize={9} textAnchor="end" className="fill-muted-foreground">
            {y}
          </text>
        </g>
      ))}
      <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} className="stroke-foreground/70" />
      <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="stroke-foreground/70" />
      {bars.map((b, k) => {
        const r = vals[b];
        const x = M.l + k * bw + bw * 0.18;
        return (
          <g key={b}>
            {r !== undefined && Number.isFinite(r) && <rect x={x} y={py(r)} width={bw * 0.64} height={H - M.b - py(r)} className="fill-brand/70" />}
            <text x={x + bw * 0.32} y={H - M.b + 12} fontSize={8} textAnchor="middle" className="fill-foreground">
              {SKIN_AREA_LABEL[b].replace('Back of the ', 'Back of ')}
            </text>
          </g>
        );
      })}
      <text x={11} y={(M.t + H - M.b) / 2} fontSize={9.5} textAnchor="middle" className="fill-foreground" transform={`rotate(-90 11 ${(M.t + H - M.b) / 2})`}>
        Threshold / mm
      </text>
      {!bars.length && (
        <text x={W / 2} y={H / 2} fontSize={10} textAnchor="middle" className="fill-muted-foreground">
          Plot each area’s threshold from your table.
        </text>
      )}
    </svg>
  );
}
