import { FAC_DIRS, QUAD_GRID, QUAD_HERBS, QUAD_PLOT, quadCoverCells, type BioEcologyVariant, type QuadHerb, type QuadPlaced, type SoilLayer } from '@aischool/shared';
import { memo, useMemo, useRef } from 'react';

/**
 * The 2D drawings of the ecology lab (also the 3D lab's close-up views): the
 * plot map with its plants and quadrats, a quadrat close up with its string
 * grid, the tray of grasshoppers, the instruments (thermometers, hygrometer,
 * Six's thermometer, meters, rain gauge, indicator chart, Secchi rope, wind
 * vane), the sedimentation jar and the measuring cylinders.
 */

export const HERB_COLOUR: Record<QuadHerb, string> = { TRIDAX: '#f4e9a8', SIDA: '#2f6b2a', EUPH: '#b5523b' };
const GRASS = '#7fb04f';
const SOIL = '#9b7a52';

/** The sward's cover (0–1) at a point, as the shared model draws it. */
function grassAt(v: BioEcologyVariant, x: number, y: number) {
  let g = v.quad.grass.base;
  for (const [bx, by, s, a] of v.quad.grass.bumps) g += a * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (2 * s * s));
  return Math.max(0, Math.min(1, g));
}
const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((c, i) => Math.round(c + (y[i]! - c) * t)).join(',')})`;
};

// ------------------------------------------------------------------ the plot

/** The 20 m × 20 m plot from above: the sward, every plant, the tapes along two edges and the quadrats. `onPick`: tap to put a quadrat down there (by eye). */
export const PlotMap = memo(function PlotMap({ v, quads, onPick, focus, pegged, label, className }: { v: BioEcologyVariant; quads: QuadPlaced[]; onPick?: (x: number, y: number) => void; focus?: number | null; pegged: boolean; label: string; className?: string }) {
  const S = 10;
  const ox = 16;
  const oy = 6;
  const svg = useRef<SVGSVGElement>(null);
  const cells = useMemo(() => {
    const out: { x: number; y: number; c: string }[] = [];
    for (let x = 0; x < QUAD_PLOT; x++) for (let y = 0; y < QUAD_PLOT; y++) out.push({ x, y, c: mix(SOIL, GRASS, 0.25 + 0.75 * grassAt(v, x + 0.5, y + 0.5)) });
    return out;
  }, [v]);
  const plants = useMemo(() => QUAD_HERBS.flatMap((h) => v.quad.plants[h].map((p) => ({ h, x: p.x, y: p.y }))), [v]);
  const px = (x: number) => ox + x * S;
  const py = (y: number) => oy + (QUAD_PLOT - y) * S;
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onPick || !svg.current) return;
    const ctm = svg.current.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const x = (p.x - ox) / S;
    const y = QUAD_PLOT - (p.y - oy) / S;
    if (x >= 0 && x < QUAD_PLOT && y >= 0 && y < QUAD_PLOT) onPick(x, y);
  };
  return (
    <svg ref={svg} viewBox="0 0 222 228" className={className ?? 'w-full rounded-xl border border-border bg-[#6f9a45]'} role="img" aria-label={label} onPointerUp={pick} style={{ cursor: onPick ? 'crosshair' : undefined }}>
      {cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={px(c.x)} y={py(c.y + 1)} width={S + 0.2} height={S + 0.2} fill={c.c} />
      ))}
      {plants.map((p, i) => (
        <circle key={i} cx={px(p.x)} cy={py(p.y)} r={p.h === 'SIDA' ? 0.9 : 0.7} fill={HERB_COLOUR[p.h]} opacity={0.95} />
      ))}
      {pegged && (
        <g>
          <line x1={px(0)} y1={py(0)} x2={px(20)} y2={py(0)} stroke="#f5d33a" strokeWidth="2" />
          <line x1={px(0)} y1={py(0)} x2={px(0)} y2={py(20)} stroke="#f5d33a" strokeWidth="2" />
          {[0, 20].map((x) => [0, 20].map((y) => <circle key={`${x}${y}`} cx={px(x)} cy={py(y)} r={2} fill="#7a4a1f" />))}
          {[0, 5, 10, 15].map((t) => (
            <g key={t} fontSize="6" fill="#1b1b1b">
              <text x={px(t)} y={py(0) + 9} textAnchor="middle">
                {t}
              </text>
              <text x={px(0) - 3} y={py(t) + 2} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          <text x={px(20)} y={py(0) + 9} fontSize="6" textAnchor="end" fill="#1b1b1b">
            x / m
          </text>
          <text x={px(0) + 2} y={py(20) - 1} fontSize="6" fill="#1b1b1b">
            y / m
          </text>
        </g>
      )}
      {quads.map((q, i) => (
        <g key={i}>
          <rect x={px(q.x)} y={py(q.y + 1)} width={S} height={S} fill="none" stroke={i === focus ? '#ffffff' : q.how === 'CHOSEN' ? '#ff7043' : '#fff59d'} strokeWidth={i === focus ? 1.8 : 1.1} />
          <text x={px(q.x) + 1.2} y={py(q.y + 1) + 5.5} fontSize="5" fill="#fff" stroke="#000" strokeWidth="0.25" paintOrder="stroke">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
});

// ------------------------------------------------------------------ a quadrat close up

function Herb({ h, x, y, r, ticked }: { h: QuadHerb; x: number; y: number; r: number; ticked: boolean }) {
  const leaves = h === 'TRIDAX' ? 6 : h === 'SIDA' ? 7 : 5;
  const leaf = h === 'TRIDAX' ? '#5d8f3a' : h === 'SIDA' ? '#2f6b2a' : '#7f8f3a';
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: leaves }, (_, k) => (
        <ellipse key={k} cx={0} cy={-r * 0.55} rx={r * (h === 'SIDA' ? 0.22 : 0.3)} ry={r * 0.55} fill={leaf} stroke={h === 'EUPH' ? '#a3402c' : '#244d1d'} strokeWidth={h === 'EUPH' ? 0.9 : 0.4} transform={`rotate(${(360 / leaves) * k + (h === 'SIDA' ? 12 : 0)})`} />
      ))}
      {h === 'TRIDAX' && (
        <g>
          <circle r={r * 0.32} fill="#fffbe6" stroke="#d9c86a" strokeWidth="0.5" />
          <circle r={r * 0.14} fill="#e6b800" />
        </g>
      )}
      {h === 'EUPH' && <circle r={r * 0.18} fill="#b5523b" />}
      {h === 'SIDA' && <circle r={r * 0.12} fill="#f2d24b" />}
      {ticked && <path d={`M ${-r * 0.4} 0 l ${r * 0.3} ${r * 0.35} l ${r * 0.6} ${-r * 0.7}`} stroke="#fff" strokeWidth={Math.max(1.2, r * 0.18)} fill="none" strokeLinecap="round" />}
    </g>
  );
}

/** A 1 m quadrat close up: the 10 × 10 string grid over grass and bare soil, and every herb in or on the frame. Tap plants to tick them while counting. */
export function QuadratView({ v, qx, qy, tally, onTap, label, className }: { v: BioEcologyVariant; qx: number; qy: number; tally?: Set<string>; onTap?: (key: string) => void; label: string; className?: string }) {
  const M = 22;
  const W = 200;
  const cells = useMemo(() => quadCoverCells(v.quad, qx, qy), [v, qx, qy]);
  const herbs = useMemo(
    () =>
      QUAD_HERBS.flatMap((h) =>
        v.quad.plants[h]
          .map((p, i) => ({ h, i, p }))
          .filter(({ p }) => p.x + p.r > qx - 0.1 && p.x - p.r < qx + 1.1 && p.y + p.r > qy - 0.1 && p.y - p.r < qy + 1.1),
      ),
    [v, qx, qy],
  );
  const X = (x: number) => M + (x - qx) * W;
  const Y = (y: number) => M + (1 - (y - qy)) * W;
  const blades = useMemo(() => {
    const out: { x: number; y: number; a: number }[] = [];
    cells.forEach((g, k) => {
      if (!g) return;
      const i = k % QUAD_GRID;
      const j = Math.floor(k / QUAD_GRID);
      for (let b = 0; b < 7; b++) {
        const s = Math.sin((qx * 131 + qy * 71 + k * 13 + b * 7) * 12.9898) * 43758.5453;
        const f = s - Math.floor(s);
        out.push({ x: M + (i + ((b * 0.37 + f) % 1)) * 20, y: M + (QUAD_GRID - j - ((b * 0.61 + f * 0.7) % 1)) * 20, a: (f - 0.5) * 50 });
      }
    });
    return out;
  }, [cells, qx, qy]);
  return (
    <svg viewBox={`0 0 ${W + 2 * M} ${W + 2 * M}`} className={className ?? 'w-full rounded-xl border border-border'} role="img" aria-label={label} style={{ background: SOIL }}>
      {cells.map((g, k) => {
        const i = k % QUAD_GRID;
        const j = Math.floor(k / QUAD_GRID);
        return <rect key={k} x={M + i * 20} y={M + (QUAD_GRID - 1 - j) * 20} width={20} height={20} fill={g ? '#6fa043' : '#a5845a'} />;
      })}
      {blades.map((b, k) => (
        <line key={k} x1={b.x} y1={b.y} x2={b.x + Math.sin((b.a * Math.PI) / 180) * 5} y2={b.y - 6} stroke="#4f8a2c" strokeWidth="0.9" strokeLinecap="round" />
      ))}
      {herbs.map(({ h, i, p }) => {
        const key = `${h}:${i}`;
        return (
          <g key={key} onClick={onTap ? () => onTap(key) : undefined} style={{ cursor: onTap ? 'pointer' : undefined }}>
            <Herb h={h} x={X(p.x)} y={Y(p.y)} r={Math.max(5, p.r * W)} ticked={!!tally?.has(key)} />
          </g>
        );
      })}
      {Array.from({ length: QUAD_GRID - 1 }, (_, k) => (
        <g key={k} stroke="#f7f3e3" strokeWidth="0.7" opacity={0.85}>
          <line x1={M + (k + 1) * 20} y1={M} x2={M + (k + 1) * 20} y2={M + W} />
          <line x1={M} y1={M + (k + 1) * 20} x2={M + W} y2={M + (k + 1) * 20} />
        </g>
      ))}
      <rect x={M} y={M} width={W} height={W} fill="none" stroke="#e9d9a6" strokeWidth="4" />
      <rect x={M} y={M} width={W} height={W} fill="none" stroke="#7a5a2a" strokeWidth="1" />
      <text x={M} y={M - 8} fontSize="9" fill="#fff">
        Quadrat at ({qx}, {qy}) · count frame plants on the left and bottom sides only
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ the tray of grasshoppers

function Hopper({ x, y, a, s, mark, marked, show, ticked }: { x: number; y: number; a: number; s: number; mark: string | null; marked: boolean; show: boolean; ticked: boolean }) {
  const L = 16 * s;
  return (
    <g transform={`translate(${x} ${y}) rotate(${(a * 180) / Math.PI})`}>
      <path d={`M ${-L * 0.1} 0 L ${-L * 0.55} ${L * 0.32} L ${-L * 0.8} ${L * 0.12}`} stroke="#4e6b1f" strokeWidth={1.2} fill="none" />
      <path d={`M ${-L * 0.1} 0 L ${-L * 0.55} ${-L * 0.32} L ${-L * 0.8} ${-L * 0.12}`} stroke="#4e6b1f" strokeWidth={1.2} fill="none" />
      <ellipse cx={0} cy={0} rx={L * 0.5} ry={L * 0.13} fill="#7fa23a" stroke="#3f5a17" strokeWidth={0.5} />
      <path d={`M ${L * 0.1} ${-L * 0.05} L ${-L * (marked && mark === 'CLIP' ? 0.25 : 0.55)} ${-L * 0.02} L ${L * 0.1} ${L * 0.08} Z`} fill="#9bb85a" opacity={0.85} />
      <circle cx={L * 0.5} cy={0} r={L * 0.11} fill="#6b8e2f" />
      {marked && mark === 'BRIGHT' && <ellipse cx={L * 0.05} cy={0} rx={L * 0.22} ry={L * 0.1} fill="#e53935" />}
      {marked && mark === 'DOT' && show && <circle cx={L * 0.2} cy={0} r={L * 0.07} fill="#ffffff" stroke="#888" strokeWidth={0.3} />}
      {ticked && <circle cx={0} cy={0} r={L * 0.62} fill="none" stroke="#1e88e5" strokeWidth={1.2} />}
    </g>
  );
}
/** The catch tipped onto a white tray. `show`: turned over one by one (a dot underneath shows). Tap to tick them while counting. */
export function TrayView({ items, mark, show, tally, onTap, label, className }: { items: { x: number; y: number; a: number; s: number; marked: boolean }[]; mark: string | null; show: boolean; tally?: Set<number>; onTap?: (i: number) => void; label: string; className?: string }) {
  return (
    <svg viewBox="0 0 300 200" className={className ?? 'w-full rounded-xl border border-border bg-card'} role="img" aria-label={label}>
      <rect x={4} y={4} width={292} height={192} rx={10} fill="#fbfbf7" stroke="#d6d3c4" strokeWidth={3} />
      {items.map((it, i) => (
        <g key={i} onClick={onTap ? () => onTap(i) : undefined} style={{ cursor: onTap ? 'pointer' : undefined }}>
          <Hopper x={14 + it.x * 272} y={14 + it.y * 172} a={it.a} s={it.s} mark={mark} marked={it.marked} show={show} ticked={!!tally?.has(i)} />
        </g>
      ))}
      {!items.length && (
        <text x={150} y={104} textAnchor="middle" fontSize="11" fill="#888">
          The tray is empty.
        </text>
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ instruments

/** A liquid-in-glass thermometer, a window of the scale round the reading (1 °C divisions: read to 0.5 °C). `wet`: the wet bulb with its muslin wick. */
export function ThermoSvg({ value, label, wet, title }: { value: number; label: string; wet?: boolean; title?: string }) {
  const lo = Math.floor(value) - 6;
  const hi = lo + 12;
  const top = 18;
  const bot = 168;
  const y = (t: number) => bot - ((t - lo) / (hi - lo)) * (bot - top);
  return (
    <svg viewBox="0 0 90 200" className="h-[200px] w-[90px] rounded-xl border border-border bg-card" role="img" aria-label={label}>
      {title && (
        <text x={45} y={11} textAnchor="middle" fontSize="8" fill="currentColor">
          {title}
        </text>
      )}
      <rect x={38} y={top - 6} width={14} height={bot - top + 22} rx={7} fill="#f4f7f9" stroke="#b8c2c8" />
      <rect x={42.5} y={y(value)} width={5} height={bot - y(value) + 8} fill="#d32f2f" />
      <circle cx={45} cy={bot + 14} r={9} fill={wet ? '#bcd7ea' : '#d32f2f'} stroke={wet ? '#7aa7c7' : '#9a1f1f'} />
      {wet && <path d={`M 36 ${bot + 6} q 9 -10 18 0 l 0 16 q -9 6 -18 0 z`} fill="#e9eef2" stroke="#9fb4c2" strokeWidth="0.8" />}
      {Array.from({ length: hi - lo + 1 }, (_, k) => {
        const t = lo + k;
        return (
          <g key={t}>
            <line x1={52} x2={t % 5 === 0 ? 64 : 59} y1={y(t)} y2={y(t)} stroke="#333" strokeWidth={t % 5 === 0 ? 1 : 0.6} />
            {t % 2 === 0 && (
              <text x={66} y={y(t) + 3} fontSize="8" fill="#333">
                {t}
              </text>
            )}
          </g>
        );
      })}
      <text x={24} y={y(value) + 3} fontSize="7" textAnchor="end" fill="#666">
        °C
      </text>
    </svg>
  );
}
/** The Six's maximum and minimum thermometer: the bottom of each steel index marks the reading. */
export function SixSvg({ max, min, label }: { max: number; min: number; label: string }) {
  const lo = Math.floor(min) - 3;
  const hi = Math.ceil(max) + 3;
  const top = 22;
  const bot = 172;
  const yMax = (t: number) => bot - ((t - lo) / (hi - lo)) * (bot - top);
  const yMin = (t: number) => top + ((t - lo) / (hi - lo)) * (bot - top);
  const scale = (x: number, f: (t: number) => number, side: 1 | -1) =>
    Array.from({ length: hi - lo + 1 }, (_, k) => {
      const t = lo + k;
      return (
        <g key={t}>
          <line x1={x} x2={x + side * (t % 5 === 0 ? 10 : 6)} y1={f(t)} y2={f(t)} stroke="#333" strokeWidth={t % 5 === 0 ? 1 : 0.6} />
          {t % 2 === 0 && (
            <text x={x + side * 12} y={f(t) + 3} fontSize="7" textAnchor={side === 1 ? 'start' : 'end'} fill="#333">
              {t}
            </text>
          )}
        </g>
      );
    });
  return (
    <svg viewBox="0 0 180 200" className="h-[200px] w-[180px] rounded-xl border border-border bg-card" role="img" aria-label={label}>
      <text x={50} y={12} textAnchor="middle" fontSize="8" fill="currentColor">
        Minimum
      </text>
      <text x={130} y={12} textAnchor="middle" fontSize="8" fill="currentColor">
        Maximum
      </text>
      <path d={`M 62 ${top - 4} L 62 ${bot + 6} Q 90 ${bot + 26} 118 ${bot + 6} L 118 ${top - 4}`} fill="none" stroke="#b8c2c8" strokeWidth="9" strokeLinecap="round" />
      <path d={`M 62 ${yMin(min)} L 62 ${bot + 6} Q 90 ${bot + 26} 118 ${bot + 6} L 118 ${yMax(max)}`} fill="none" stroke="#9aa0a6" strokeWidth="4" />
      <rect x={59.5} y={yMin(min) - 12} width={5} height={12} rx={1} fill="#1e5aa8" />
      <rect x={115.5} y={yMax(max) - 12} width={5} height={12} rx={1} fill="#1e5aa8" />
      {scale(56, yMin, -1)}
      {scale(124, yMax, 1)}
    </svg>
  );
}
/** A digital meter's display (light meter in lux, anemometer in m/s). */
export function MeterDisplay({ value, unit, label, dp = 0 }: { value: number | null; unit: string; label: string; dp?: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-[#1d2a22] px-3 py-1.5 font-mono text-[20px] tabular-nums text-[#9ff0b4] shadow-inner" role="status" aria-label={label}>
      {value === null ? '----' : value.toFixed(dp)}
      <span className="text-[12px] text-[#9ff0b4]/70">{unit}</span>
    </div>
  );
}
export const PH_COLOUR: Record<number, string> = { 3: '#c62828', 4: '#e64a19', 5: '#f57c00', 6: '#fbc02d', 7: '#43a047', 8: '#00897b', 9: '#1e88e5', 10: '#3949ab' };
/** The soil extract with universal indicator beside the colour chart. */
export function PhChart({ ph, label }: { ph: number; label: string }) {
  const tube = mix(PH_COLOUR[Math.max(3, Math.min(10, ph))]!, '#8d6e4a', 0.18);
  return (
    <svg viewBox="0 0 260 110" className="w-full max-w-[360px] rounded-xl border border-border bg-card" role="img" aria-label={label}>
      <rect x={16} y={14} width={22} height={70} rx={10} fill="#eef3f5" stroke="#9fb0b8" />
      <rect x={18} y={36} width={18} height={46} rx={8} fill={tube} />
      <rect x={18} y={74} width={18} height={9} rx={4} fill="#7a5a3a" opacity={0.6} />
      {[3, 4, 5, 6, 7, 8, 9, 10].map((p, k) => (
        <g key={p}>
          <rect x={58 + k * 25} y={36} width={22} height={30} rx={3} fill={PH_COLOUR[p]} />
          <text x={69 + k * 25} y={80} fontSize="10" textAnchor="middle" fill="currentColor">
            {p}
          </text>
        </g>
      ))}
      <text x={58} y={26} fontSize="9" fill="currentColor">
        Colour chart (pH)
      </text>
    </svg>
  );
}
/** The rain gauge's measuring cylinder (mm of rain, 0.5 mm divisions). */
export function RainSvg({ mm, label }: { mm: number; label: string }) {
  const max = Math.max(10, Math.ceil((mm + 4) / 10) * 10);
  const top = 14;
  const bot = 176;
  const y = (v: number) => bot - (v / max) * (bot - top);
  return (
    <svg viewBox="0 0 90 190" className="h-[190px] w-[90px] rounded-xl border border-border bg-card" role="img" aria-label={label}>
      <rect x={30} y={top - 4} width={24} height={bot - top + 8} rx={3} fill="#f2f7fa" stroke="#9fb0b8" />
      {mm > 0 && <rect x={31} y={y(mm)} width={22} height={bot - y(mm)} fill="#90caf9" opacity={0.75} />}
      {Array.from({ length: max * 2 + 1 }, (_, k) => {
        const v = k / 2;
        const major = v % 5 === 0;
        return (
          <g key={k}>
            <line x1={54} x2={major ? 64 : v % 1 === 0 ? 60 : 57} y1={y(v)} y2={y(v)} stroke="#333" strokeWidth={major ? 0.9 : 0.4} />
            {major && (
              <text x={66} y={y(v) + 3} fontSize="7" fill="#333">
                {v}
              </text>
            )}
          </g>
        );
      })}
      <text x={42} y={bot + 11} fontSize="7" textAnchor="middle" fill="#666">
        mm
      </text>
    </svg>
  );
}
/** The Secchi disc's rope: where the water line was when the disc just disappeared (1 cm marks, labelled every 10 cm). */
export function SecchiSvg({ cm, label }: { cm: number; label: string }) {
  const lo = Math.floor(cm / 10) * 10 - 10;
  const hi = lo + 30;
  const y = (c: number) => 16 + ((c - lo) / (hi - lo)) * 160;
  return (
    <svg viewBox="0 0 120 190" className="h-[190px] w-[120px] rounded-xl border border-border bg-card" role="img" aria-label={label}>
      <rect x={0} y={y(cm)} width={120} height={190 - y(cm)} fill="#5d7f4f" opacity={0.35} />
      <line x1={0} x2={120} y1={y(cm)} y2={y(cm)} stroke="#3a6b8a" strokeWidth="1.2" strokeDasharray="4 3" />
      <rect x={52} y={10} width={6} height={175} fill="#e8d9b0" stroke="#b39b62" strokeWidth="0.6" />
      {Array.from({ length: hi - lo + 1 }, (_, k) => {
        const c = lo + k;
        return (
          <g key={c}>
            <line x1={58} x2={c % 10 === 0 ? 72 : c % 5 === 0 ? 67 : 63} y1={y(c)} y2={y(c)} stroke="#333" strokeWidth={c % 10 === 0 ? 1 : 0.5} />
            {c % 10 === 0 && c >= 0 && (
              <text x={74} y={y(c) + 3} fontSize="8" fill="#333">
                {c} cm
              </text>
            )}
          </g>
        );
      })}
      <text x={4} y={y(cm) - 3} fontSize="7" fill="#2b5570">
        water line
      </text>
    </svg>
  );
}
/** The wind vane from above: its arrow points to where the wind comes from. */
export function VaneSvg({ dir, label }: { dir: number; label: string }) {
  const a = (dir * Math.PI) / 4;
  return (
    <svg viewBox="0 0 120 120" className="h-[120px] w-[120px] rounded-xl border border-border bg-card" role="img" aria-label={label}>
      <circle cx={60} cy={60} r={44} fill="none" stroke="#ccc" />
      {FAC_DIRS.map((d, k) => (
        <text key={d} x={60 + Math.sin((k * Math.PI) / 4) * 52} y={63 - Math.cos((k * Math.PI) / 4) * 52} fontSize="8" textAnchor="middle" fill="currentColor">
          {d}
        </text>
      ))}
      <g transform={`rotate(${(a * 180) / Math.PI} 60 60)`}>
        <line x1={60} y1={92} x2={60} y2={30} stroke="#37474f" strokeWidth="2.5" />
        <path d="M 60 22 L 53 36 L 67 36 Z" fill="#d32f2f" />
        <path d="M 60 88 L 50 100 L 60 96 L 70 100 Z" fill="#37474f" />
      </g>
      <circle cx={60} cy={60} r={3} fill="#222" />
    </svg>
  );
}

// ------------------------------------------------------------------ soil

const LAYER_FILL: Record<SoilLayer, string> = { GRAVEL: '#8d8a80', SAND: '#d9bf7a', SILT: '#b08a5c', CLAY: '#8a6a55' };
/** The sedimentation jar against a ruler (mm): the settled layers, the water (cloudy while clay is still settling) and humus floating. */
export function JarSvg({ layers, cloudy, shaken, label }: { layers: Record<SoilLayer, number> | null; cloudy: number; shaken: boolean; label: string }) {
  const S = 2;
  const bot = 196;
  const water = 150;
  let acc = 0;
  const bands = (['GRAVEL', 'SAND', 'SILT', 'CLAY'] as SoilLayer[]).map((l) => {
    const h = (layers?.[l] ?? 0) * S;
    const y = bot - acc - h;
    acc += h;
    return { l, y, h };
  });
  return (
    <svg viewBox="0 0 170 220" className="w-full max-w-[260px] rounded-xl border border-border bg-card" role="img" aria-label={label}>
      <rect x={30} y={bot - water * 0.0 - 170} width={80} height={172} rx={8} fill="#eef5f7" stroke="#9fb0b8" strokeWidth="1.4" />
      <rect x={32} y={bot - water + 2} width={76} height={water - 2} fill={shaken ? mix('#cfe6f1', '#8b6b4a', Math.min(1, cloudy * 0.95)) : '#cfe6f1'} opacity={0.85} />
      {bands.map((b) => b.h > 0.3 && <rect key={b.l} x={32} y={b.y} width={76} height={b.h} fill={LAYER_FILL[b.l]} />)}
      {bands[0]!.h > 1 && Array.from({ length: 14 }, (_, k) => <circle key={k} cx={36 + ((k * 37) % 70)} cy={bands[0]!.y + ((k * 13) % Math.max(1, bands[0]!.h))} r={1.6} fill="#5f5c55" />)}
      {shaken && Array.from({ length: 9 }, (_, k) => <rect key={k} x={36 + k * 8} y={bot - water + 1 + (k % 3)} width={5} height={2.2} rx={1} fill="#3b2a1a" />)}
      <rect x={118} y={20} width={22} height={178} fill="#f4e7b8" stroke="#c7b27a" />
      {Array.from({ length: 81 }, (_, mm) => (
        <g key={mm}>
          <line x1={118} x2={118 + (mm % 10 === 0 ? 10 : mm % 5 === 0 ? 7 : 4)} y1={bot - mm * S} y2={bot - mm * S} stroke="#3b3320" strokeWidth={mm % 10 === 0 ? 0.9 : 0.4} />
          {mm % 10 === 0 && (
            <text x={130} y={bot - mm * S + 3} fontSize="6.5" fill="#3b3320">
              {mm}
            </text>
          )}
        </g>
      ))}
      <text x={129} y={14} fontSize="7" textAnchor="middle" fill="#666">
        mm
      </text>
    </svg>
  );
}
/** The jar drawing to label (0–200 × 0–160). */
export function JarDrawing() {
  return (
    <g>
      <rect x={62} y={8} width={76} height={146} rx={6} fill="#f4f8fa" stroke="#555" strokeWidth="1.2" />
      <rect x={64} y={22} width={72} height={63} fill="#dbe9ef" />
      {Array.from({ length: 7 }, (_, k) => (
        <rect key={k} x={68 + k * 9} y={20 + (k % 2)} width={6} height={2.5} rx={1} fill="#4a3624" />
      ))}
      <rect x={64} y={85} width={72} height={15} fill="#b39a86" />
      <rect x={64} y={100} width={72} height={13} fill="#c9ab84" />
      <rect x={64} y={113} width={72} height={17} fill="#e4cf98" />
      <rect x={64} y={130} width={72} height={22} fill="#a7a49b" />
      {Array.from({ length: 12 }, (_, k) => (
        <circle key={k} cx={68 + ((k * 23) % 64)} cy={134 + ((k * 7) % 16)} r={2.2} fill="#77736a" />
      ))}
    </g>
  );
}
/** A 100 cm³ measuring cylinder, a window of the scale round the meniscus (1 cm³ divisions). `muddy`: soil washed through. */
export function CylinderSvg({ volume, label, muddy, title }: { volume: number; label: string; muddy?: boolean; title?: string }) {
  const lo = Math.max(0, Math.floor(volume / 5) * 5 - 10);
  const hi = lo + 25;
  const top = 16;
  const bot = 176;
  const y = (v: number) => bot - ((v - lo) / (hi - lo)) * (bot - top);
  const yv = y(volume);
  return (
    <svg viewBox="0 0 96 190" className="h-[190px] w-[96px] rounded-xl border border-border bg-card" role="img" aria-label={label}>
      {title && (
        <text x={48} y={10} textAnchor="middle" fontSize="7.5" fill="currentColor">
          {title}
        </text>
      )}
      <rect x={24} y={top - 4} width={30} height={bot - top + 12} fill="#f2f7fa" stroke="#9fb0b8" />
      {volume > lo && <path d={`M 25 ${Math.min(bot + 8, yv)} Q 39 ${Math.min(bot + 8, yv) + 4} 53 ${Math.min(bot + 8, yv)} L 53 ${bot + 8} L 25 ${bot + 8} Z`} fill={muddy ? '#a1887f' : '#90caf9'} opacity={0.7} />}
      {Array.from({ length: hi - lo + 1 }, (_, k) => {
        const v = lo + k;
        return (
          <g key={v}>
            <line x1={54} x2={v % 5 === 0 ? 66 : 60} y1={y(v)} y2={y(v)} stroke="#333" strokeWidth={v % 5 === 0 ? 0.9 : 0.5} />
            {v % 5 === 0 && (
              <text x={68} y={y(v) + 3} fontSize="7.5" fill="#333">
                {v}
              </text>
            )}
          </g>
        );
      })}
      <text x={39} y={bot + 18} fontSize="7" textAnchor="middle" fill="#666">
        cm³
      </text>
    </svg>
  );
}
