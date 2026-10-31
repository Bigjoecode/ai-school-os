import { PLAS_FIELD_R, agarCore, type AgarCube, type AgarWork, type BioOsmosisVariant, type PlasCell, type PlasObjective } from '@aischool/shared';
import { memo, useId } from 'react';

/**
 * The 2D drawings: the ruler with a potato cylinder (or an agar cube) laid
 * against it, the balance's display, the field of view of the epidermis
 * (each cell's protoplast drawn from its own shrinkage), the plasmolysed cell
 * to label, and the agar cubes in the acid or cut open.
 */

export const POTATO_FLESH = '#efe2b2';
export const AGAR_PINK = '#e04f9a';
export const AGAR_CLEAR = '#f3efe2';

/** A 0–80 mm ruler (or 0–40 mm, `range`) with the object laid from the zero mark: the student reads its end. */
export function RulerSvg({ length, kind, depth, label, range = 80 }: { length: number; kind: 'potato' | 'cube' | 'section'; depth?: number; label: string; range?: number }) {
  const px = 640 / range;
  const x0 = 20;
  const y0 = 54;
  const h = kind === 'potato' ? 22 : Math.min(48, length * px * 0.55);
  return (
    <svg viewBox={`0 0 ${x0 * 2 + range * px} 112`} className="w-full rounded-xl border border-border bg-card" role="img" aria-label={label}>
      {kind === 'potato' ? (
        <g>
          <rect x={x0} y={y0 - h} width={length * px} height={h} rx={h / 2.4} fill={POTATO_FLESH} stroke="#c9b67a" />
          <rect x={x0 + 2} y={y0 - h + 3} width={Math.max(0, length * px - 4)} height={4} rx={2} fill="#fff8dc" opacity={0.6} />
        </g>
      ) : kind === 'cube' ? (
        <rect x={x0} y={y0 - h} width={length * px} height={h} fill={AGAR_PINK} stroke="#a2366d" />
      ) : (
        <g>
          <rect x={x0} y={y0 - h} width={length * px} height={h} fill={AGAR_CLEAR} stroke="#b9ae93" />
          {depth !== undefined && length - 2 * depth > 0.2 && <rect x={x0 + depth * px} y={y0 - h + depth * px * (h / (length * px))} width={(length - 2 * depth) * px} height={h - 2 * depth * px * (h / (length * px))} fill={AGAR_PINK} />}
        </g>
      )}
      <rect x={x0 - 8} y={y0} width={range * px + 16} height={44} rx={3} fill="#f4e7b8" stroke="#c7b27a" />
      {Array.from({ length: range + 1 }, (_, mm) => (
        <g key={mm}>
          <line x1={x0 + mm * px} x2={x0 + mm * px} y1={y0} y2={y0 + (mm % 10 === 0 ? 16 : mm % 5 === 0 ? 11 : 7)} stroke="#3b3320" strokeWidth={mm % 10 === 0 ? 1.2 : 0.7} />
          {mm % 10 === 0 && (
            <text x={x0 + mm * px} y={y0 + 30} fontSize="11" textAnchor="middle" fill="#3b3320">
              {mm / 10}
            </text>
          )}
        </g>
      ))}
      <text x={x0 + range * px} y={y0 + 40} fontSize="9" textAnchor="end" fill="#6b5e3a">
        cm (small divisions: mm)
      </text>
    </svg>
  );
}

/** The top-pan balance's display. */
export function BalanceDisplay({ mass, label }: { mass: number | null; label?: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-[#1d2a22] px-3 py-1.5 font-mono text-[20px] tabular-nums text-[#9ff0b4] shadow-inner" role="status" aria-label={label ?? (mass === null ? 'Balance: empty' : `Balance reads ${mass.toFixed(2)} grams`)}>
      {mass === null ? '0.00' : mass.toFixed(2)}
      <span className="text-[12px] text-[#9ff0b4]/70">g</span>
    </div>
  );
}

// ------------------------------------------------------------------ plasmolysis

const VIEW_R = 150;
const f1 = (x: number) => Math.round(x * 10) / 10;
function rrect(x0: number, y0: number, x1: number, y1: number, r: number) {
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  return `M${f1(x0 + rr)} ${f1(y0)}H${f1(x1 - rr)}Q${f1(x1)} ${f1(y0)} ${f1(x1)} ${f1(y0 + rr)}V${f1(y1 - rr)}Q${f1(x1)} ${f1(y1)} ${f1(x1 - rr)} ${f1(y1)}H${f1(x0 + rr)}Q${f1(x0)} ${f1(y1)} ${f1(x0)} ${f1(y1 - rr)}V${f1(y0 + rr)}Q${f1(x0)} ${f1(y0)} ${f1(x0 + rr)} ${f1(y0)}Z`;
}
/** A cell's protoplast outline for a shrinkage g (volume fraction lost): pulled from the wall, more on some sides than others. */
export function protoplast(c: PlasCell, g: number) {
  const w = c.x1 - c.x0;
  const h = c.y1 - c.y0;
  const k = Math.sqrt(Math.max(0.05, 1 - g));
  const gap = 1.6;
  const iw = (w - 2 * gap) * k;
  const ih = (h - 2 * gap) * (0.35 + 0.65 * k);
  const sx = (w - 2 * gap - iw) * c.shape[0];
  const sy = (h - 2 * gap - ih) * c.shape[1];
  const x0 = c.x0 + gap + sx;
  const y0 = c.y0 + gap + sy;
  return { x0, y0, x1: x0 + iw, y1: y0 + ih, r: g < 0.02 ? 2 : Math.min(iw, ih) * (0.2 + 0.3 * Math.min(1, g * 2)) };
}

export interface FieldProps {
  v: BioOsmosisVariant;
  /** Shrinkage per cell (same order as v.plas.cells) and cells killed by the salt. */
  g: number[];
  killed: boolean[];
  objective: PlasObjective;
  /** No slide: an empty, bright field. */
  placed: boolean;
  /** The outside liquid's colour hint (strong solutions look the same as water). */
  tally?: Set<number>;
  onTap?: (i: number) => void;
}

/** The field of view (inside an SVG with viewBox −158 … 158). */
export const FieldContent = memo(function FieldContent({ v, g, killed, objective, placed, tally, onTap }: FieldProps) {
  const id = useId().replace(/:/g, '');
  const R = PLAS_FIELD_R[objective];
  const s = VIEW_R / R;
  const cells = v.plas.cells.map((c, i) => ({ c, i })).filter(({ c }) => c.x1 > -R && c.x0 < R && c.y1 > -R && c.y0 < R);
  let walls = '';
  let live = '';
  let dark = '';
  let dead = '';
  let nuc = '';
  for (const { c, i } of cells) {
    walls += `M${f1(c.x0)} ${f1(c.y0)}H${f1(c.x1)}V${f1(c.y1)}H${f1(c.x0)}Z`;
    if (c.dead) {
      dead += rrect(c.x0 + 2, c.y0 + 2, c.x1 - 2, c.y1 - 2, 3);
      continue;
    }
    const p = protoplast(c, g[i] ?? 0);
    const path = rrect(p.x0, p.y0, p.x1, p.y1, p.r);
    if ((g[i] ?? 0) > 0.2 || killed[i]) dark += path;
    else live += path;
    if (objective === 40) {
      const nx = p.x0 + (p.x1 - p.x0) * (0.2 + 0.6 * c.shape[2]);
      const ny = p.y0 + Math.min(7, (p.y1 - p.y0) / 3);
      nuc += `M${f1(nx - 6)} ${f1(ny)}a6 4.5 0 1 0 12 0a6 4.5 0 1 0 -12 0Z`;
    }
  }
  return (
    <g>
      <defs>
        <clipPath id={`${id}-fov`}>
          <circle cx={0} cy={0} r={VIEW_R} />
        </clipPath>
      </defs>
      <circle cx={0} cy={0} r={VIEW_R + 6} fill="#111" />
      <g clipPath={`url(#${id}-fov)`}>
        <rect x={-VIEW_R} y={-VIEW_R} width={VIEW_R * 2} height={VIEW_R * 2} fill="#f8f6ee" />
        {placed && (
          <g transform={`scale(${s})`}>
            <path d={dead} fill="#efe7ea" stroke="#d9cdd2" strokeWidth={0.8 / s} />
            <path d={live} fill="#a8459f" stroke="#7d2f78" strokeWidth={1.2} />
            <path d={dark} fill="#6d2370" stroke="#4f1752" strokeWidth={1.4} />
            <path d={nuc} fill="#c9b3c6" stroke="#8b6f88" strokeWidth={0.8} />
            <path d={walls} fill="none" stroke="#7c6f74" strokeWidth={Math.max(2.2, 1.2 / s)} />
            {tally &&
              cells
                .filter(({ i }) => tally.has(i))
                .map(({ c, i }) => (
                  <g key={i}>
                    <circle cx={(c.x0 + c.x1) / 2} cy={(c.y0 + c.y1) / 2} r={Math.min(9 / s, (c.y1 - c.y0) / 3)} fill="#fde047" opacity={0.9} stroke="#854d0e" strokeWidth={1 / s} />
                  </g>
                ))}
            {onTap &&
              cells.map(({ c, i }) => (
                <rect key={i} x={c.x0} y={c.y0} width={c.x1 - c.x0} height={c.y1 - c.y0} fill="transparent" onClick={() => onTap(i)} style={{ cursor: 'pointer' }}>
                  <title>Tap to mark this cell in your tally</title>
                </rect>
              ))}
          </g>
        )}
      </g>
      <circle cx={0} cy={0} r={VIEW_R} fill="none" stroke="#111" strokeWidth={3} />
    </g>
  );
});

export function FieldView(props: FieldProps & { label: string; className?: string }) {
  const { label, className, ...rest } = props;
  return (
    <svg viewBox="-158 -158 316 316" className={className} role="img" aria-label={label}>
      <FieldContent {...rest} />
    </svg>
  );
}

/** The plasmolysed cell to label (drawn in a 0–200 × 0–140 box; the targets are PLAS_DRAWING_TARGETS). */
export function PlasDrawing() {
  return (
    <g>
      <rect x={10} y={10} width={180} height={120} fill="#f3f7f9" stroke="#3d3d3d" strokeWidth={4} />
      <rect x={14} y={14} width={172} height={112} fill="none" stroke="#3d3d3d" strokeWidth={0.8} />
      <path d={rrect(48, 40, 170, 104, 26)} fill="#f1e7ef" stroke="#3d3d3d" strokeWidth={1.4} />
      <path d={rrect(76, 50, 160, 96, 18)} fill="#b06aa8" stroke="#3d3d3d" strokeWidth={1} />
      <ellipse cx={62} cy={72} rx={8} ry={11} fill="#d9c7d6" stroke="#3d3d3d" strokeWidth={1} />
      <text x={100} y={138} fontSize={7} textAnchor="middle" fill="#555">
        A plasmolysed cell (×400)
      </text>
    </g>
  );
}

// ------------------------------------------------------------------ agar

/** The agar cubes in the beaker of acid (pink cores shrinking), seen from the side; cut cubes are shown halved. */
export function AgarBeakerSvg({ v, w, label }: { v: BioOsmosisVariant; w: AgarWork; label: string }) {
  const placed = w.cubes.map((c, i) => ({ c, i }));
  const scale = 13; // px per cm
  const acidH = w.acid === 'FULL' ? 56 : w.acid === 'SHALLOW' ? 22 : 0;
  let x = 22;
  const items = placed.map(({ c, i }) => {
    const sz = c.size * scale;
    const item = { c, i, x, sz };
    x += sz + 10;
    return item;
  });
  const width = Math.max(220, x + 12);
  return (
    <svg viewBox={`0 0 ${width} 110`} className="w-full rounded-xl border border-border bg-card" role="img" aria-label={label}>
      <path d={`M10 14 V100 Q10 104 14 104 H${width - 14} Q${width - 10} 104 ${width - 10} 100 V14`} fill="none" stroke="#9aa8b1" strokeWidth={2} />
      {acidH > 0 && <rect x={12} y={102 - acidH} width={width - 24} height={acidH} fill="#d9ecf5" opacity={0.75} />}
      {items.map(({ c, i, x: cx, sz }) => {
        const inAcid = c.placedAt !== null && c.cutAt === null;
        const core = agarCore(v.agar, i, c as AgarCube, w, w.clock);
        const y = inAcid ? 102 - sz : 102 - sz;
        if (c.cutAt !== null)
          return (
            <g key={i}>
              <text x={cx + sz / 2} y={y - 4} fontSize={7} textAnchor="middle" fill="#555">
                cut
              </text>
            </g>
          );
        const k = c.placedAt === null ? 1 : core;
        return (
          <g key={i} opacity={c.placedAt === null ? 0.55 : 1}>
            <rect x={cx} y={y} width={sz} height={sz} fill={AGAR_CLEAR} stroke="#b9ae93" strokeWidth={0.8} />
            {k > 0 && <rect x={cx + (sz * (1 - k)) / 2} y={y + (sz * (1 - k)) / 2} width={sz * k} height={sz * k} fill={AGAR_PINK} opacity={0.92} />}
            <text x={cx + sz / 2} y={y - 4} fontSize={7} textAnchor="middle" fill="#555">
              {i + 1}. {c.size} cm
            </text>
          </g>
        );
      })}
    </svg>
  );
}
