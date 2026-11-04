import { FOOD_LEVELS, FOOD_LEVEL_LABEL, FOOD_ORGS, FOOD_ORG_LABEL, type CrossFill, type FoodLevel, type FoodOrg } from '@aischool/shared';
import { cn } from '@/lib/utils';

/**
 * Drawings for the bench and the notebook (2D, and the 3D lab's close-ups):
 * the measuring board, the histogram / bar chart, the pie chart, the beakers
 * of beads, the food web and the pyramids. Everything is drawn from the
 * student's own numbers or from the shared maths.
 */

const SVG = 'w-full rounded-xl border border-border bg-card';

/** The height board (cm scale) with the classmate's head and the set square at the reading. */
export function BoardSvg({ reading, square, shoes, declines, className }: { reading: number | null; square: boolean; shoes: boolean; declines?: boolean; className?: string }) {
  const W = 200;
  const H = 260;
  const top = 190;
  const bot = 130;
  const py = (cm: number) => 20 + ((top - cm) / (top - bot)) * (H - 40);
  const head = reading ?? 160;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn(SVG, 'max-w-[220px]', className)} role="img" aria-label={reading === null ? 'Height board' : `Height board reading ${reading} cm`}>
      <rect x={110} y={10} width={34} height={H - 20} className="fill-amber-100 stroke-amber-700" />
      {Array.from({ length: top - bot + 1 }, (_, k) => bot + k).map((cm) => (
        <g key={cm}>
          <line x1={110} x2={cm % 5 ? 117 : cm % 10 ? 121 : 126} y1={py(cm)} y2={py(cm)} className="stroke-foreground" strokeWidth={0.6} />
          {cm % 10 === 0 && (
            <text x={128} y={py(cm) + 3} fontSize={8} className="fill-foreground">
              {cm}
            </text>
          )}
        </g>
      ))}
      {!declines && (
        <g>
          <ellipse cx={80} cy={py(head) + 14} rx={13} ry={15} className="fill-[#8a5a3c]" />
          <path d={`M66 ${py(head) + 10} Q80 ${py(head) - 2} 94 ${py(head) + 10}`} className="fill-[#161212]" />
          <rect x={64} y={py(head) + 32} width={32} height={H} rx={10} className="fill-sky-200" />
          {square && <polygon points={`66,${py(head)} 110,${py(head)} 110,${py(head) - 16}`} className="fill-slate-300/80 stroke-slate-600" />}
          {reading !== null && <line x1={60} x2={146} y1={py(reading)} y2={py(reading)} className="stroke-danger" strokeDasharray="3 2" />}
          {shoes && <rect x={62} y={H - 16} width={36} height={8} rx={3} className="fill-foreground" />}
        </g>
      )}
      {declines && (
        <text x={60} y={H / 2} fontSize={10} textAnchor="middle" className="fill-muted-foreground">
          (declined)
        </text>
      )}
    </svg>
  );
}

/** Frequency against class: touching bars (histogram) or separated bars. */
export function FreqChart({ labels, freq, kind, xLabel, className }: { labels: string[]; freq: number[]; kind: 'HISTOGRAM' | 'BAR' | null; xLabel: string; className?: string }) {
  const W = 380;
  const H = 210;
  const M = { l: 34, r: 8, t: 10, b: 42 };
  const yMax = Math.max(4, Math.ceil((Math.max(0, ...freq) * 1.15) / 2) * 2);
  const bw = (W - M.l - M.r) / Math.max(1, labels.length);
  const py = (y: number) => H - M.b - (y / yMax) * (H - M.t - M.b);
  const gap = kind === 'BAR' ? 0.22 : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn(SVG, className)} role="img" aria-label={`${kind === 'BAR' ? 'Bar chart' : 'Histogram'}: ${labels.map((l, k) => `${l} ${freq[k] ?? 0}`).join(', ')}`}>
      {Array.from({ length: yMax / 2 + 1 }, (_, k) => k * 2).map((y) => (
        <g key={y}>
          <line x1={M.l} x2={W - M.r} y1={py(y)} y2={py(y)} className="stroke-border" strokeWidth={0.6} />
          <text x={M.l - 4} y={py(y) + 3} fontSize={8} textAnchor="end" className="fill-muted-foreground">
            {y}
          </text>
        </g>
      ))}
      <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} className="stroke-foreground/70" />
      <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="stroke-foreground/70" />
      {kind &&
        labels.map((l, k) => {
          const f = freq[k] ?? 0;
          const x = M.l + k * bw + bw * gap;
          return f > 0 ? <rect key={l} x={x} y={py(f)} width={bw * (1 - 2 * gap)} height={H - M.b - py(f)} className="fill-brand/70 stroke-brand" strokeWidth={0.6} /> : null;
        })}
      {labels.map((l, k) => (
        <text key={l} x={M.l + k * bw + bw / 2} y={H - M.b + 11} fontSize={labels.length > 7 ? 6.5 : 8} textAnchor="middle" className="fill-foreground">
          {l}
        </text>
      ))}
      <text x={(M.l + W - M.r) / 2} y={H - 8} fontSize={9} textAnchor="middle" className="fill-foreground">
        {xLabel}
      </text>
      <text x={10} y={(M.t + H - M.b) / 2} fontSize={9} textAnchor="middle" className="fill-foreground" transform={`rotate(-90 10 ${(M.t + H - M.b) / 2})`}>
        Frequency
      </text>
      {!kind && (
        <text x={W / 2} y={H / 2} fontSize={10} textAnchor="middle" className="fill-muted-foreground">
          Choose the kind of chart to draw.
        </text>
      )}
    </svg>
  );
}

const PIE_COL = ['#1565c0', '#f9a825', '#2e7d32', '#ad1457'];
/** A pie chart from the student's own angles (degrees). */
export function PieSvg({ parts, className }: { parts: { label: string; deg: number }[]; className?: string }) {
  const R = 70;
  const c = 90;
  let a0 = -Math.PI / 2;
  const total = parts.reduce((a, p) => a + (Number.isFinite(p.deg) ? Math.max(0, p.deg) : 0), 0);
  return (
    <svg viewBox="0 0 280 180" className={cn(SVG, 'max-w-[320px]', className)} role="img" aria-label={`Pie chart: ${parts.map((p) => `${p.label} ${p.deg}°`).join(', ')}`}>
      <circle cx={c} cy={c} r={R} className="fill-muted stroke-border" />
      {parts.map((p, k) => {
        if (!Number.isFinite(p.deg) || p.deg <= 0) return null;
        const a1 = a0 + (Math.min(360, p.deg) * Math.PI) / 180;
        const large = p.deg > 180 ? 1 : 0;
        const d = p.deg >= 359.9 ? `M${c} ${c - R} A${R} ${R} 0 1 1 ${c - 0.01} ${c - R} Z` : `M${c} ${c} L${c + R * Math.cos(a0)} ${c + R * Math.sin(a0)} A${R} ${R} 0 ${large} 1 ${c + R * Math.cos(a1)} ${c + R * Math.sin(a1)} Z`;
        a0 = a1;
        return <path key={p.label} d={d} fill={PIE_COL[k % 4]} stroke="white" strokeWidth={1} />;
      })}
      {parts.map((p, k) => (
        <g key={p.label}>
          <rect x={180} y={40 + k * 20} width={10} height={10} fill={PIE_COL[k % 4]} />
          <text x={195} y={49 + k * 20} fontSize={9.5} className="fill-foreground">
            {p.label} ({Number.isFinite(p.deg) ? p.deg : '—'}°)
          </text>
        </g>
      ))}
      {Math.abs(total - 360) > 1 && total > 0 && (
        <text x={180} y={160} fontSize={9} className="fill-danger">
          Angles add to {Math.round(total)}°
        </text>
      )}
    </svg>
  );
}

/** Two beakers of beads (red T, white t), with the pair just drawn on the tray. */
export function BeakersSvg({ fill, last, peek, className }: { fill: CrossFill | null; last: { a: boolean; b: boolean } | null; peek?: boolean; className?: string }) {
  const beads = (x0: number, red: number, salt: number) =>
    Array.from({ length: 40 }, (_, k) => {
      const rx = ((k * 37 + salt * 11) % 100) / 100;
      const ry = ((k * 53 + salt * 7) % 100) / 100;
      return <circle key={k} cx={x0 + 8 + rx * 64} cy={78 + ry * 46} r={3.4} fill={k / 40 < red ? '#d32f2f' : '#fafafa'} stroke="#9e9e9e" strokeWidth={0.4} />;
    });
  const redOf = (b: 0 | 1) => (!fill ? -1 : fill === 'EQUAL' ? 0.5 : fill === 'SEPARATE' ? (b ? 0 : 1) : b ? 0 : 0.5);
  return (
    <svg viewBox="0 0 280 170" className={cn(SVG, 'max-w-[340px]', className)} role="img" aria-label={`Beakers of beads${last ? `; last pair ${last.a ? 'red' : 'white'} and ${last.b ? 'red' : 'white'}` : ''}`}>
      {[0, 1].map((b) => (
        <g key={b}>
          <path d={`M${20 + b * 130} 60 L${20 + b * 130} 130 Q${20 + b * 130} 136 ${26 + b * 130} 136 L${94 + b * 130} 136 Q${100 + b * 130} 136 ${100 + b * 130} 130 L${100 + b * 130} 60`} className="fill-sky-50/60 stroke-slate-500" />
          {redOf(b as 0 | 1) >= 0 && beads(20 + b * 130, redOf(b as 0 | 1), b + 1)}
          <text x={60 + b * 130} y={152} fontSize={9} textAnchor="middle" className="fill-foreground">
            {b ? 'Parent 2 (beaker B)' : 'Parent 1 (beaker A)'}
          </text>
        </g>
      ))}
      {last && (
        <g>
          <rect x={112} y={14} width={56} height={26} rx={5} className="fill-amber-100 stroke-amber-700" />
          <circle cx={128} cy={27} r={7} fill={last.a ? '#d32f2f' : '#fafafa'} stroke="#757575" />
          <circle cx={152} cy={27} r={7} fill={last.b ? '#d32f2f' : '#fafafa'} stroke="#757575" />
          <text x={140} y={52} fontSize={9} textAnchor="middle" className="fill-foreground">
            {last.a && last.b ? 'TT' : last.a || last.b ? 'Tt' : 'tt'}
          </text>
        </g>
      )}
      {peek && (
        <text x={140} y={8} fontSize={8} textAnchor="middle" className="fill-danger">
          looking into the beakers
        </text>
      )}
    </svg>
  );
}

/** Where each organism sits in the food-web diagram (by trophic level). */
const WEB_AT: Record<FoodOrg, [number, number]> = { GRASS: [190, 196], GRASSHOPPER: [90, 146], CATERPILLAR: [190, 146], GOAT: [300, 146], LIZARD: [50, 92], BIRD: [150, 92], TOAD: [240, 92], MAN: [330, 92], HAWK: [150, 32] };
/** The food web as drawn: arrows food → feeder for the student's links. */
export function WebSvg({ links, className }: { links: string[]; className?: string }) {
  const parsed = links.map((l) => l.split('>') as [FoodOrg, FoodOrg]).filter(([a, b]) => WEB_AT[a] && WEB_AT[b]);
  return (
    <svg viewBox="0 0 380 220" className={cn(SVG, className)} role="img" aria-label={`Food web: ${parsed.map(([a, b]) => `${FOOD_ORG_LABEL[a]} to ${FOOD_ORG_LABEL[b]}`).join(', ') || 'no links yet'}`}>
      <defs>
        <marker id="gen-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="fill-brand" />
        </marker>
      </defs>
      {parsed.map(([a, b]) => {
        const [x1, y1] = WEB_AT[a];
        const [x2, y2] = WEB_AT[b];
        const d = Math.hypot(x2 - x1, y2 - y1) || 1;
        return <line key={`${a}${b}`} x1={x1 + ((x2 - x1) / d) * 16} y1={y1 + ((y2 - y1) / d) * 12} x2={x2 - ((x2 - x1) / d) * 18} y2={y2 - ((y2 - y1) / d) * 13} className="stroke-brand" strokeWidth={1.3} markerEnd="url(#gen-arrow)" />;
      })}
      {FOOD_ORGS.map((o) => (
        <g key={o}>
          <rect x={WEB_AT[o][0] - 38} y={WEB_AT[o][1] - 10} width={76} height={20} rx={10} className={o === 'GRASS' ? 'fill-success/20 stroke-success' : 'fill-card stroke-border'} />
          <text x={WEB_AT[o][0]} y={WEB_AT[o][1] + 3.5} fontSize={9} textAnchor="middle" className="fill-foreground">
            {FOOD_ORG_LABEL[o].replace(' (agama)', '')}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** A pyramid drawn to the student's widths (mm), centred bars from the producers up. */
export function PyramidSvg({ widths, title, unit, className }: { widths: Partial<Record<FoodLevel, number>>; title: string; unit: string; className?: string }) {
  const W = 380;
  const max = Math.max(1, ...FOOD_LEVELS.map((L) => widths[L] ?? 0));
  const k = Math.min(1.6, 300 / max);
  return (
    <svg viewBox={`0 0 ${W} 170`} className={cn(SVG, className)} role="img" aria-label={`${title}: ${FOOD_LEVELS.map((L) => `${FOOD_LEVEL_LABEL[L]} ${widths[L] ?? '—'} mm`).join(', ')}`}>
      <text x={8} y={14} fontSize={9.5} className="fill-foreground font-semibold">
        {title}
      </text>
      {FOOD_LEVELS.map((L, i) => {
        const w = widths[L];
        const y = 130 - i * 30;
        const px = w !== undefined && Number.isFinite(w) ? Math.max(1, w * k) : 0;
        return (
          <g key={L}>
            {px > 0 && <rect x={W / 2 - px / 2} y={y} width={px} height={24} className="fill-success/40 stroke-success" strokeWidth={0.8} />}
            <text x={6} y={y + 15} fontSize={8} className="fill-muted-foreground">
              {L === 'P' ? 'Producers' : L === 'C1' ? 'Primary' : L === 'C2' ? 'Secondary' : 'Tertiary'}
            </text>
            <text x={W - 6} y={y + 15} fontSize={8} textAnchor="end" className="fill-muted-foreground">
              {w !== undefined && Number.isFinite(w) ? `${w} ${unit}` : '—'}
            </text>
          </g>
        );
      })}
      {max * k < max && (
        <text x={W / 2} y={166} fontSize={7.5} textAnchor="middle" className="fill-muted-foreground">
          (drawn here at {(k * 100).toFixed(0)} % so the widest bar fits)
        </text>
      )}
    </svg>
  );
}
