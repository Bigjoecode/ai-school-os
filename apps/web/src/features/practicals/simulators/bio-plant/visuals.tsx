import {
  LEAF_H,
  LEAF_W,
  OXY_DISTS,
  POTO_COND_SHORT,
  POTO_DIST,
  POTO_SCALE,
  STARCH_COL,
  leafCellColour,
  oxyLampAt,
  oxyRate,
  phyFit,
  potoBubblePos,
  potoCondAt,
  type BioPlantState,
  type BioPlantVariant,
  type LeafKind,
  type OxyAxis,
  type OxyCurve,
  type PotoCond,
  type StarchLeaf,
} from '@aischool/shared';
import { memo, useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * The 2D drawings, shared by the 2D lab and the 3D lab's close-up views: the
 * potometer's capillary with its bubble on the mm scale, the stopwatch, the
 * pondweed under its funnel with the lamp on the metre rule, a leaf square by
 * square (its colours from the shared maths) on the 1 cm² grid, the bar chart,
 * the rate–light graph and the before-and-after drawing to label.
 */

const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`;

/** A digital stopwatch display (seconds, to 0.1 s). */
export function StopwatchDisplay({ sec, label }: { sec: number | null; label?: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-[#1d2a22] px-3 py-1.5 font-mono text-[20px] tabular-nums text-[#9ff0b4] shadow-inner" role="status" aria-label={label ?? (sec === null ? 'Stopwatch: 0:00.0' : `Stopwatch reads ${sec.toFixed(1)} seconds`)}>
      {sec === null ? '0.0' : sec.toFixed(1)}
      <span className="text-[12px] text-[#9ff0b4]/70">s{sec !== null && sec >= 60 ? ` (${fmtClock(sec)})` : ''}</span>
    </div>
  );
}

// ------------------------------------------------------------------ potometer

/** The potometer: the shoot in its tube, the reservoir and tap, and the horizontal capillary with the bubble on the mm scale. */
export function PotometerSvg({ v, w, label, className }: { v: BioPlantVariant; w: BioPlantState['poto']; label: string; className?: string }) {
  const pos = w.bubble ? potoBubblePos(v.poto, w) : null;
  const cond: PotoCond = potoCondAt(w, w.clock);
  const x0 = 90;
  const px = 2.6;
  const y = 150;
  const leafCol = w.cut ? '#4f9a3f' : '#4f9a3f';
  return (
    <svg viewBox="0 0 420 200" className={cn('w-full rounded-xl border border-border bg-card', className)} role="img" aria-label={label}>
      {/* the shoot */}
      {w.fit && (
        <g>
          <line x1={40} y1={110} x2={40} y2={40} stroke="#5d7f3a" strokeWidth={3} />
          {[48, 62, 76, 90].map((yy, k) => (
            <g key={yy}>
              <ellipse cx={k % 2 ? 26 : 54} cy={yy} rx={14} ry={6} fill={leafCol} transform={`rotate(${k % 2 ? 25 : -25} ${k % 2 ? 26 : 54} ${yy})`} />
            </g>
          ))}
          {cond === 'HUMID' && <path d="M14 104 Q8 50 40 26 Q72 50 66 104 Z" fill="#dbeef7" fillOpacity={0.45} stroke="#9cc5da" />}
          {cond === 'DARK' && <path d="M12 106 Q6 46 40 22 Q74 46 68 106 Z" fill="#1d1d1f" fillOpacity={0.85} />}
          {cond === 'LAMP' && (
            <g>
              <path d="M95 18 L120 10 L124 26 Z" fill="#f2c94c" />
              <path d="M96 20 L60 50 M98 24 L66 66" stroke="#f2c94c" strokeWidth={1.5} strokeDasharray="3 3" />
            </g>
          )}
          {cond === 'FAN' && (
            <g>
              <circle cx={108} cy={60} r={14} fill="none" stroke="#5b6670" strokeWidth={2} />
              <path d="M108 60 l10 -6 M108 60 l-4 12 M108 60 l-7 -8" stroke="#5b6670" strokeWidth={3} />
              <path d="M90 52 h-14 M90 60 h-18 M90 68 h-14" stroke="#7da7c7" strokeWidth={1.5} strokeDasharray="4 3" />
            </g>
          )}
        </g>
      )}
      {/* rubber tube and vertical glass */}
      <rect x={34} y={108} width={12} height={12} rx={3} fill={w.sealed ? '#c9b77a' : '#333'} />
      <rect x={36} y={118} width={8} height={36} fill="#dbeaf3" stroke="#8aa4b4" />
      {/* reservoir with tap */}
      <rect x={58} y={96} width={18} height={30} rx={3} fill="#dbeaf3" stroke="#8aa4b4" />
      <rect x={64} y={126} width={6} height={20} fill="#dbeaf3" stroke="#8aa4b4" />
      <rect x={58} y={132} width={18} height={5} rx={2} fill="#b3262b" />
      {/* capillary */}
      <rect x={36} y={y - 4} width={x0 - 36 + POTO_SCALE * px + 14} height={8} rx={4} fill="#e6f1f7" stroke="#8aa4b4" />
      {pos !== null && <rect x={x0 + pos * px - 5} y={y - 3} width={10} height={6} rx={3} fill="#ffffff" stroke="#5b6670" />}
      {/* the scale */}
      <rect x={x0 - 6} y={y + 8} width={POTO_SCALE * px + 12} height={26} rx={2} fill="#f4e7b8" stroke="#c7b27a" />
      {Array.from({ length: POTO_SCALE + 1 }, (_, mm) => (
        <g key={mm}>
          <line x1={x0 + mm * px} x2={x0 + mm * px} y1={y + 8} y2={y + 8 + (mm % 10 === 0 ? 10 : mm % 5 === 0 ? 7 : 4)} stroke="#3b3320" strokeWidth={mm % 10 === 0 ? 1 : 0.5} />
          {mm % 10 === 0 && (
            <text x={x0 + mm * px} y={y + 29} fontSize={8} textAnchor="middle" fill="#3b3320">
              {mm}
            </text>
          )}
        </g>
      ))}
      <line x1={x0 + POTO_DIST * px} x2={x0 + POTO_DIST * px} y1={y - 10} y2={y + 6} stroke="#c62828" strokeWidth={1.2} />
      <text x={x0 + POTO_DIST * px} y={y - 13} fontSize={8} textAnchor="middle" fill="#c62828">
        {POTO_DIST} mm
      </text>
      <text x={x0 + POTO_SCALE * px} y={y - 26} fontSize={8} textAnchor="end" fill="#555">
        capillary radius r = {v.poto.r} mm · water moves towards the shoot ←
      </text>
      <text x={8} y={192} fontSize={9} fill="#555">
        {w.bubble ? `${POTO_COND_SHORT[cond]} · bubble at ${Math.round(pos ?? 0)} mm` : w.fit ? (w.sealed ? 'Sealed. Let a bubble in.' : 'Not sealed yet.') : 'No shoot fitted yet.'}
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ oxygen

/** The pondweed under its funnel in the beaker, the collecting tube, the heat filter and the lamp on the metre rule; bubbles rise at the current rate. */
export function OxygenSvg({ v, w, label, className }: { v: BioPlantVariant; w: BioPlantState['oxy']; label: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const d = oxyLampAt(w, w.clock);
  const rate = oxyRate(v.oxy, w, w.clock);
  const lampX = d === null ? 390 : 150 + (d / 100) * 240;
  const n = Math.min(10, Math.round(rate / 5));
  const dur = rate > 0 ? Math.max(0.6, 6 / Math.sqrt(rate)) : 0;
  return (
    <svg viewBox="0 0 420 210" className={cn('w-full rounded-xl border border-border', w.dark ? 'bg-[#1d2430]' : 'bg-card', className)} role="img" aria-label={label}>
      <style>{`@keyframes rise-${id}{from{transform:translateY(0);opacity:1}to{transform:translateY(-70px);opacity:0.2}}`}</style>
      {/* beaker */}
      <rect x={40} y={60} width={100} height={120} fill="#dbeef8" fillOpacity={0.6} stroke="#8aa4b4" strokeWidth={1.5} />
      <rect x={40} y={70} width={100} height={110} fill="#cfe6f3" fillOpacity={0.6} />
      {w.nahco3 && <text x={44} y={176} fontSize={7} fill="#3b6d8a">+ NaHCO₃</text>}
      {/* funnel */}
      <path d="M58 172 L82 132 L82 96 L98 96 L98 132 L122 172 Z" fill="#eef6fa" fillOpacity={0.5} stroke="#7b97a8" />
      {w.plant && (
        <g stroke="#3f7f2f" strokeWidth={2} fill="none">
          <path d="M90 170 Q84 150 90 132 Q96 118 90 104" />
          {[160, 148, 136, 124, 112].map((yy, k) => (
            <path key={yy} d={`M90 ${yy} q${k % 2 ? -8 : 8} -3 ${k % 2 ? -12 : 12} 2`} />
          ))}
        </g>
      )}
      {/* tube */}
      {w.tubeAt !== null && <rect x={82} y={22} width={16} height={78} rx={8} fill="#e8f3f9" fillOpacity={0.7} stroke="#7b97a8" />}
      {w.plant && rate > 0 && (
        <g>
          {Array.from({ length: Math.max(1, n) }, (_, k) => (
            <circle key={k} cx={90 + ((k * 3) % 5) - 2} cy={100} r={1.8} fill="#ffffff" stroke="#7b97a8" strokeWidth={0.5} style={{ animation: `rise-${id} ${dur}s linear ${(k * dur) / Math.max(1, n)}s infinite` }} />
          ))}
        </g>
      )}
      {/* heat filter */}
      {w.shield && (
        <g>
          <rect x={146} y={92} width={16} height={80} fill="#cfe6f3" fillOpacity={0.7} stroke="#8aa4b4" />
          <text x={154} y={186} fontSize={7} textAnchor="middle" fill={w.dark ? '#cbd5df' : '#555'}>
            water trough
          </text>
        </g>
      )}
      {/* metre rule and lamp */}
      <rect x={140} y={190} width={250} height={8} fill="#e9d9a4" stroke="#b99f58" />
      {[0, 20, 40, 60, 80, 100].map((cm) => (
        <text key={cm} x={150 + (cm / 100) * 240} y={207} fontSize={7} textAnchor="middle" fill={w.dark ? '#cbd5df' : '#555'}>
          {cm}
        </text>
      ))}
      <g transform={`translate(${lampX} 0)`}>
        <rect x={-3} y={120} width={6} height={70} fill="#555" />
        <path d="M-22 104 L4 92 L10 124 L-16 128 Z" fill={d === null ? '#777' : '#f2c94c'} stroke="#555" />
        {d !== null && <path d="M-20 112 L-60 100 M-20 118 L-62 124" stroke="#f2c94c" strokeWidth={1.4} strokeDasharray="4 3" />}
      </g>
      {d !== null && (
        <text x={lampX} y={86} fontSize={9} textAnchor="middle" fill={w.dark ? '#f5f5f5' : '#333'}>
          {d} cm
        </text>
      )}
      {w.dark && (
        <text x={410} y={16} fontSize={8} textAnchor="end" fill="#cbd5df">
          Room darkened
        </text>
      )}
    </svg>
  );
}
export const OXY_DIST_OPTIONS = OXY_DISTS;

// ------------------------------------------------------------------ leaf

/** A leaf drawn square by square from the shared colours, on the 1 cm² grid if `grid`; `tally` squares are marked while counting. */
export const LeafSvg = memo(function LeafSvg({ v, w, leaf, grid, tally, onTap, label, className }: { v: BioPlantVariant; w: BioPlantState['starch']; leaf: StarchLeaf; grid?: boolean; tally?: Set<number>; onTap?: (k: number) => void; label: string; className?: string }) {
  const cells = v.starch.cells[leaf.kind];
  const s = 24;
  const cracked = leaf.tile && !leaf.soft;
  return (
    <svg viewBox={`-6 -6 ${LEAF_W * s + 12} ${LEAF_H * s + 12}`} className={cn('w-full rounded-xl border border-border bg-[#f6f6f2]', className)} role="img" aria-label={label}>
      {cells.map((c, k) => {
        const col = leafCellColour(v.starch, w, leaf, c);
        return (
          <rect
            key={k}
            x={c.i * s}
            y={c.j * s}
            width={s + 0.5}
            height={s + 0.5}
            fill={col}
            onClick={onTap ? () => onTap(k) : undefined}
            className={onTap ? 'cursor-pointer' : undefined}
          />
        );
      })}
      {leaf.kind === 'FOIL' && !leaf.iodine && leaf.boiled === 0 && leaf.eth === 0 && <rect x={v.starch.foil0 * s} y={0} width={3 * s} height={LEAF_H * s} fill="#c9ccd1" fillOpacity={0.92} stroke="#9aa0a6" />}
      <line x1={0} y1={(LEAF_H * s) / 2} x2={LEAF_W * s} y2={(LEAF_H * s) / 2} stroke="#000" strokeOpacity={0.25} strokeWidth={1.4} />
      {cracked && <path d={`M${s * 3} ${s * 2} l${s} ${s * 1.2} l${s * 0.8} ${s * 0.4} M${s * 8} ${s * 5} l${s * 0.6} ${s} l${s} ${s * 0.3}`} stroke="#5a4a2a" strokeWidth={1.2} fill="none" />}
      {grid &&
        Array.from({ length: LEAF_W + 1 }, (_, i) => <line key={`v${i}`} x1={i * s} x2={i * s} y1={0} y2={LEAF_H * s} stroke="#2c6fb5" strokeOpacity={0.5} strokeWidth={0.6} />).concat(
          Array.from({ length: LEAF_H + 1 }, (_, j) => <line key={`h${j}`} x1={0} x2={LEAF_W * s} y1={j * s} y2={j * s} stroke="#2c6fb5" strokeOpacity={0.5} strokeWidth={0.6} />),
        )}
      {tally &&
        cells.map((c, k) =>
          tally.has(k) ? (
            <text key={`t${k}`} x={c.i * s + s / 2} y={c.j * s + s * 0.68} fontSize={13} textAnchor="middle" fill="#ffffff" stroke="#000" strokeWidth={0.4} pointerEvents="none">
              ✓
            </text>
          ) : null,
        )}
    </svg>
  );
});

/** A small swatch of a leaf for chips and lists. */
export function leafSwatch(kind: LeafKind) {
  return kind === 'VARIEGATED' ? `linear-gradient(90deg, ${STARCH_COL.white} 0 25%, ${STARCH_COL.green} 25% 75%, ${STARCH_COL.white} 75%)` : STARCH_COL.green;
}

/** The variegated leaf before and after the test, to label (0–200 × 0–120; targets STARCH_DRAWING_TARGETS). */
export function StarchDrawing() {
  const leaf = (cx: number, inner: string, outer: string) => (
    <g>
      <ellipse cx={cx} cy={60} rx={42} ry={30} fill={outer} stroke="#333" strokeWidth={1.2} />
      <path d={`M${cx - 30} 60 Q${cx - 14} 38 ${cx + 6} 44 Q${cx + 28} 50 ${cx + 30} 60 Q${cx + 22} 78 ${cx} 78 Q${cx - 22} 80 ${cx - 30} 60 Z`} fill={inner} stroke="#333" strokeWidth={0.8} />
      <line x1={cx - 42} y1={60} x2={cx + 42} y2={60} stroke="#333" strokeWidth={0.8} />
    </g>
  );
  return (
    <g>
      {leaf(48, STARCH_COL.green, STARCH_COL.white)}
      {leaf(152, STARCH_COL.blueBlack, STARCH_COL.brown)}
      <text x={48} y={108} fontSize={7} textAnchor="middle" fill="#555">
        Before the test
      </text>
      <text x={152} y={108} fontSize={7} textAnchor="middle" fill="#555">
        After iodine
      </text>
    </g>
  );
}

// ------------------------------------------------------------------ charts

/** The bar chart of the student's own rates (mm/min) for the conditions they plotted. */
export function BarChart({ bars, rates, className }: { bars: PotoCond[]; rates: Partial<Record<PotoCond, number>>; className?: string }) {
  const W = 360;
  const H = 210;
  const M = { l: 40, r: 10, t: 12, b: 40 };
  const vals = bars.map((b) => rates[b]).filter((x): x is number => x !== undefined && Number.isFinite(x));
  const top = Math.max(2, ...vals) * 1.15;
  const step = top > 20 ? 5 : top > 8 ? 2 : 1;
  const yMax = Math.ceil(top / step) * step;
  const bw = (W - M.l - M.r) / Math.max(5, bars.length);
  const py = (y: number) => H - M.b - (y / yMax) * (H - M.t - M.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('w-full rounded-xl border border-border bg-card', className)} role="img" aria-label={`Bar chart of the rate of water uptake: ${bars.map((b) => `${POTO_COND_SHORT[b]} ${rates[b] ?? '—'}`).join(', ')}`}>
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
        const r = rates[b];
        const x = M.l + k * bw + bw * 0.18;
        return (
          <g key={b}>
            {r !== undefined && Number.isFinite(r) && <rect x={x} y={py(r)} width={bw * 0.64} height={H - M.b - py(r)} className={b === 'STILL' ? 'fill-muted-foreground/60' : 'fill-brand/70'} />}
            <text x={x + bw * 0.32} y={H - M.b + 12} fontSize={8.5} textAnchor="middle" className="fill-foreground">
              {POTO_COND_SHORT[b]}
            </text>
          </g>
        );
      })}
      <text x={11} y={(M.t + H - M.b) / 2} fontSize={9.5} textAnchor="middle" className="fill-foreground" transform={`rotate(-90 11 ${(M.t + H - M.b) / 2})`}>
        Rate / mm min⁻¹
      </text>
      <text x={(M.l + W - M.r) / 2} y={H - 8} fontSize={9.5} textAnchor="middle" className="fill-foreground">
        Condition
      </text>
      {!bars.length && (
        <text x={W / 2} y={H / 2} fontSize={10} textAnchor="middle" className="fill-muted-foreground">
          Plot each condition’s rate from your table.
        </text>
      )}
    </svg>
  );
}

/** A Catmull-Rom path through points (sorted by x): the smooth curve. */
function smoothPath(pts: { x: number; y: number }[]) {
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

/** The graph of mean bubbles per minute against light intensity (or distance) with the line the student chose. */
export function OxyGraph({ points, axis, curve, className }: { points: { x: number; y: number }[]; axis: OxyAxis | null; curve: OxyCurve | null; className?: string }) {
  const W = 360;
  const H = 240;
  const M = { l: 40, r: 12, t: 12, b: 38 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMax = Math.max(axis === 'DISTANCE' ? 100 : 100, ...xs) * 1.05;
  const yMax = Math.max(10, ...ys) * 1.12;
  const xStep = xMax > 60 ? 20 : 10;
  const yStep = yMax > 40 ? 10 : 5;
  const px = (x: number) => M.l + (x / xMax) * (W - M.l - M.r);
  const py = (y: number) => H - M.b - (y / yMax) * (H - M.t - M.b);
  const sorted = [...points].sort((a, b) => a.x - b.x).map((p) => ({ x: px(p.x), y: py(p.y) }));
  const fit = phyFit(points);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('w-full rounded-xl border border-border bg-card', className)} role="img" aria-label={`Graph of bubbles per minute against ${axis === 'DISTANCE' ? 'lamp distance' : 'light intensity'}: ${points.length} points${curve ? `, ${curve.toLowerCase()} line` : ''}`}>
      {Array.from({ length: Math.floor(xMax / xStep) + 1 }, (_, k) => k * xStep).map((x) => (
        <g key={`x${x}`}>
          <line x1={px(x)} x2={px(x)} y1={M.t} y2={H - M.b} className="stroke-border" strokeWidth={0.6} />
          <text x={px(x)} y={H - M.b + 12} fontSize={9} textAnchor="middle" className="fill-muted-foreground">
            {x}
          </text>
        </g>
      ))}
      {Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, k) => k * yStep).map((y) => (
        <g key={`y${y}`}>
          <line x1={M.l} x2={W - M.r} y1={py(y)} y2={py(y)} className="stroke-border" strokeWidth={0.6} />
          <text x={M.l - 4} y={py(y) + 3} fontSize={9} textAnchor="end" className="fill-muted-foreground">
            {y}
          </text>
        </g>
      ))}
      <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} className="stroke-foreground/70" />
      <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="stroke-foreground/70" />
      {curve === 'SMOOTH' && sorted.length >= 2 && <path d={smoothPath(sorted)} fill="none" className="stroke-foreground" strokeWidth={1.4} />}
      {curve === 'DOT' && sorted.length >= 2 && <polyline points={sorted.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" className="stroke-foreground" strokeWidth={1.2} />}
      {curve === 'STRAIGHT' && fit && <line x1={px(0)} y1={py(fit.intercept)} x2={px(xMax / 1.05)} y2={py(fit.intercept + (fit.slope * xMax) / 1.05)} className="stroke-foreground" strokeWidth={1.3} />}
      {sorted.map((p, i) => (
        <g key={i} className="stroke-brand" strokeWidth={1.4}>
          <line x1={p.x - 4} x2={p.x + 4} y1={p.y - 4} y2={p.y + 4} />
          <line x1={p.x - 4} x2={p.x + 4} y1={p.y + 4} y2={p.y - 4} />
        </g>
      ))}
      <text x={(M.l + W - M.r) / 2} y={H - 6} fontSize={10} textAnchor="middle" className="fill-foreground">
        {axis === 'DISTANCE' ? 'Distance of lamp / cm' : 'Light intensity (10 000 ÷ d²) / arbitrary units'}
      </text>
      <text x={11} y={(M.t + H - M.b) / 2} fontSize={10} textAnchor="middle" className="fill-foreground" transform={`rotate(-90 11 ${(M.t + H - M.b) / 2})`}>
        Bubbles per minute
      </text>
      {!points.length && (
        <text x={W / 2} y={H / 2} fontSize={10} textAnchor="middle" className="fill-muted-foreground">
          Your points appear as you fill in the table.
        </text>
      )}
    </svg>
  );
}
