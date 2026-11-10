import { SHEET_H, SHEET_W, SQUARE_CM, SQUARES_E, SQUARES_N, geoContours, type GeoSettlement, type GeoSheet, type GeoVariant, type P } from '@aischool/shared';
import { memo, useMemo } from 'react';

/** The printed topographical sheet, in paper centimetres: SVG for the bench, the same drawing on canvas for the 3D map on the desk. */

export const flipY = (y: number) => SHEET_H - y;
const pathOf = (pts: readonly P[], close = false) => {
  if (!pts.length) return '';
  let d = `M${pts[0]![0].toFixed(2)} ${flipY(pts[0]![1]).toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) d += `L${pts[i]![0].toFixed(2)} ${flipY(pts[i]![1]).toFixed(2)}`;
  return close ? `${d}Z` : d;
};
const C = { paper: '#fbf7ea', contour: '#b0763f', index: '#94561f', water: '#1976c9', forest: '#cfe5bb', tree: '#4d8a3a', plant: '#e7efc0', road: '#c8341f', track: '#5d4a33', swamp: '#7fb6d9', black: '#1c1c1c', grid: '#3f6f8a' };

function huts(st: GeoSettlement, seed: number): P[] {
  const out: P[] = [];
  const n = st.kind === 'TOWN' ? 26 : st.kind === 'LINEAR' ? 8 : st.kind === 'VILLAGE' ? 6 : 2;
  let a = (seed * 9301 + st.p[0] * 977 + st.p[1] * 353) % 1;
  const next = () => (a = (a * 9301 + 0.49297) % 1);
  for (let i = 0; i < n; i++) {
    if (st.kind === 'LINEAR') {
      const t = (i - n / 2) * 0.17;
      const side = i % 2 ? 0.1 : -0.1;
      const u = st.along ?? 0;
      out.push([st.p[0] + Math.cos(u) * t - Math.sin(u) * side, st.p[1] + Math.sin(u) * t + Math.cos(u) * side]);
    } else {
      const r = (st.kind === 'TOWN' ? 0.55 : 0.2) * Math.sqrt(next());
      const q = next() * 6.28;
      out.push([st.p[0] + Math.cos(q) * r, st.p[1] + Math.sin(q) * r]);
    }
  }
  return out;
}

function BaseMapInner({ s, label = true }: { s: GeoSheet; label?: boolean }) {
  const c = useMemo(() => geoContours(s), [s]);
  const contours = useMemo(() => c.lines.map((l) => ({ level: l.level, index: l.index, d: l.paths.map((p) => pathOf(p)).join('') })), [c]);
  const trees = useMemo(() => {
    const out: P[] = [];
    const xs = s.forest.map((p) => p[0]);
    const ys = s.forest.map((p) => p[1]);
    for (let x = Math.min(...xs); x < Math.max(...xs); x += 0.55) {
      for (let y = Math.min(...ys); y < Math.max(...ys); y += 0.5) {
        const q: P = [x + ((y * 7) % 0.3), y];
        let ins = false;
        for (let i = 0, j = s.forest.length - 1; i < s.forest.length; j = i++) {
          const a = s.forest[i]!;
          const b = s.forest[j]!;
          if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins;
        }
        if (ins) out.push(q);
      }
    }
    return out;
  }, [s]);
  return (
    <g>
      <rect x={0} y={0} width={SHEET_W} height={SHEET_H} fill={C.paper} />
      <path d={pathOf(s.forest, true)} fill={C.forest} stroke={C.tree} strokeWidth={0.03} />
      {s.plantation.length > 0 && <path d={pathOf(s.plantation, true)} fill={C.plant} stroke="#a8ab59" strokeWidth={0.025} strokeDasharray="0.1 0.08" />}
      {s.swamp.length > 0 && <path d={pathOf(s.swamp, true)} fill={C.swamp} fillOpacity={0.28} stroke={C.swamp} strokeWidth={0.02} />}
      {trees.map((t, i) => (
        <path key={i} d={`M${t[0]} ${flipY(t[1]) - 0.14}l.09 .19h-.18z`} fill={C.tree} />
      ))}
      {contours.map((l) => (
        <path key={l.level} d={l.d} fill="none" stroke={l.index ? C.index : C.contour} strokeWidth={l.index ? 0.035 : 0.018} />
      ))}
      {c.labels.map((l, i) => (
        <g key={i} transform={`translate(${l.p[0]} ${flipY(l.p[1])}) rotate(${l.angle})`}>
          <rect x={-0.22} y={-0.09} width={0.44} height={0.18} fill={C.paper} />
          <text textAnchor="middle" y={0.065} fontSize={0.17} fill={C.index} fontFamily="sans-serif">
            {l.level}
          </text>
        </g>
      ))}
      {s.streams.map((st, i) => (
        <path key={i} d={pathOf(st.pts)} fill="none" stroke={C.water} strokeWidth={st.main ? 0.075 : st.order === 2 ? 0.04 : 0.026} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {s.roads.map((r) =>
        r.kind === 'RAIL' ? (
          <g key={r.id}>
            <path d={pathOf(r.pts)} fill="none" stroke={C.black} strokeWidth={0.07} />
            <path d={pathOf(r.pts)} fill="none" stroke={C.paper} strokeWidth={0.04} strokeDasharray="0.22 0.22" />
          </g>
        ) : (
          <g key={r.id}>
            {r.kind !== 'TRACK' && <path d={pathOf(r.pts)} fill="none" stroke={C.black} strokeWidth={r.kind === 'MAIN' ? 0.12 : 0.085} strokeLinejoin="round" />}
            <path d={pathOf(r.pts)} fill="none" stroke={r.kind === 'TRACK' ? C.track : r.kind === 'MAIN' ? C.road : '#e9a23b'} strokeWidth={r.kind === 'TRACK' ? 0.035 : r.kind === 'MAIN' ? 0.075 : 0.05} strokeDasharray={r.kind === 'TRACK' ? '0.18 0.1' : undefined} strokeLinejoin="round" />
          </g>
        ),
      )}
      {s.settlements.map((st) => (
        <g key={st.id} fill={C.black}>
          {huts(st, s.seed).map((h, i) => (
            <rect key={i} x={h[0] - 0.05} y={flipY(h[1]) - 0.05} width={0.1} height={0.1} />
          ))}
          {label && st.kind !== 'HAMLET' && (
            <text x={st.p[0] + 0.12} y={flipY(st.p[1]) - (st.kind === 'TOWN' ? 0.62 : 0.28)} fontSize={st.kind === 'TOWN' ? 0.3 : 0.2} fontWeight={st.kind === 'TOWN' ? 700 : 500} fontFamily="sans-serif" stroke={C.paper} strokeWidth={0.05} paintOrder="stroke">
              {st.name}
            </text>
          )}
        </g>
      ))}
      {s.features.map((f) => (
        <FeatureMark key={f.id} kind={f.kind} p={f.p} h={f.h} />
      ))}
      {label && s.river && <RiverName s={s} />}
    </g>
  );
}
export const BaseMap = memo(BaseMapInner);

function RiverName({ s }: { s: GeoSheet }) {
  const m = s.streams.find((x) => x.main)!;
  const p = m.pts[Math.floor(m.pts.length * 0.62)]!;
  return (
    <text x={p[0] + 0.15} y={flipY(p[1])} fontSize={0.2} fontStyle="italic" fill={C.water} fontFamily="serif" stroke={C.paper} strokeWidth={0.04} paintOrder="stroke">
      {s.river}
    </text>
  );
}

export function FeatureMark({ kind, p, h }: { kind: string; p: P; h?: number }) {
  const x = p[0];
  const y = flipY(p[1]);
  switch (kind) {
    case 'SCHOOL':
      return <path d={`M${x - 0.1} ${y + 0.08}h.2v-.12l-.1 -.08l-.1 .08z`} fill="#fff" stroke={C.black} strokeWidth={0.025} />;
    case 'CHURCH':
      return <path d={`M${x} ${y - 0.13}v.26M${x - 0.09} ${y - 0.05}h.18`} stroke={C.black} strokeWidth={0.04} />;
    case 'MOSQUE':
      return <path d={`M${x + 0.05} ${y - 0.12}a.13 .13 0 1 0 0 .24a.1 .1 0 1 1 0 -.24z`} fill={C.black} />;
    case 'MARKET':
      return (
        <text x={x} y={y + 0.08} textAnchor="middle" fontSize={0.22} fontWeight={700} fill={C.black} stroke={C.paper} strokeWidth={0.04} paintOrder="stroke" fontFamily="sans-serif">
          M
        </text>
      );
    case 'POST':
      return (
        <text x={x} y={y + 0.08} textAnchor="middle" fontSize={0.2} fontWeight={700} fill={C.black} stroke={C.paper} strokeWidth={0.04} paintOrder="stroke" fontFamily="sans-serif">
          P
        </text>
      );
    case 'QUARRY':
      return <path d={`M${x - 0.14} ${y + 0.08}a.16 .16 0 0 1 .28 0`} fill="none" stroke={C.black} strokeWidth={0.03} strokeDasharray="0.04 0.03" />;
    case 'BOREHOLE':
      return <circle cx={x} cy={y} r={0.07} fill={C.water} stroke={C.black} strokeWidth={0.02} />;
    case 'FALLS':
      return <path d={`M${x - 0.12} ${y}h.24M${x - 0.08} ${y + 0.06}h.16`} stroke={C.water} strokeWidth={0.04} />;
    case 'TRIG':
      return (
        <g>
          <path d={`M${x} ${y - 0.12}l.11 .2h-.22z`} fill="none" stroke={C.black} strokeWidth={0.03} />
          <circle cx={x} cy={y} r={0.02} fill={C.black} />
          <text x={x + 0.16} y={y + 0.07} fontSize={0.2} fontFamily="sans-serif" stroke={C.paper} strokeWidth={0.04} paintOrder="stroke">
            {h}
          </text>
        </g>
      );
    default:
      return (
        <g>
          <circle cx={x} cy={y} r={0.03} fill={C.black} />
          <text x={x + 0.08} y={y + 0.07} fontSize={0.18} fontFamily="sans-serif" stroke={C.paper} strokeWidth={0.04} paintOrder="stroke">
            {h}
          </text>
        </g>
      );
  }
}

/** The ruled grid with its numbers in the margin. */
export function GridLines({ s }: { s: GeoSheet }) {
  const lines: React.ReactNode[] = [];
  for (let e = 0; e <= SQUARES_E; e++) {
    const x = e * SQUARE_CM;
    lines.push(<line key={`e${e}`} x1={x} x2={x} y1={0} y2={SHEET_H} stroke={C.grid} strokeWidth={0.02} />);
    lines.push(
      <text key={`et${e}`} x={x} y={-0.12} textAnchor="middle" fontSize={0.26} fontFamily="sans-serif" fill="#26465a">
        {(s.eastBase + e) % 100}
      </text>,
      <text key={`eb${e}`} x={x} y={SHEET_H + 0.3} textAnchor="middle" fontSize={0.26} fontFamily="sans-serif" fill="#26465a">
        {(s.eastBase + e) % 100}
      </text>,
    );
  }
  for (let n = 0; n <= SQUARES_N; n++) {
    const y = flipY(n * SQUARE_CM);
    lines.push(<line key={`n${n}`} x1={0} x2={SHEET_W} y1={y} y2={y} stroke={C.grid} strokeWidth={0.02} />);
    lines.push(
      <text key={`nl${n}`} x={-0.12} y={y + 0.09} textAnchor="end" fontSize={0.26} fontFamily="sans-serif" fill="#26465a">
        {(s.northBase + n) % 100}
      </text>,
      <text key={`nr${n}`} x={SHEET_W + 0.12} y={y + 0.09} fontSize={0.26} fontFamily="sans-serif" fill="#26465a">
        {(s.northBase + n) % 100}
      </text>,
    );
  }
  return (
    <g>
      {lines}
      <rect x={0} y={0} width={SHEET_W} height={SHEET_H} fill="none" stroke={C.black} strokeWidth={0.05} />
    </g>
  );
}

export const scaleLine = (s: GeoSheet) => (s.denom === 50000 ? '2 cm to 1 km' : s.denom === 25000 ? '4 cm to 1 km' : '1 cm to 1 km');

/** Title, key, scale and compass rose below the sheet (y from SHEET_H + 0.7). */
export function Margin({ v }: { v: GeoVariant }) {
  const s = v.sheet!;
  const y0 = SHEET_H + 0.75;
  const hideInterval = v.task === 'RELIEF';
  const stmt = v.marginScale === 'STATEMENT';
  const k = s.kmPerCm;
  const barKm = k >= 1 ? 2 : 1;
  const barCm = barKm / k;
  const keyRows: [string, (x: number, y: number) => React.ReactNode][] = [
    ['Main road', (x, y) => <path d={`M${x} ${y}h.7`} stroke={C.road} strokeWidth={0.09} />],
    ['Minor road', (x, y) => <path d={`M${x} ${y}h.7`} stroke="#e9a23b" strokeWidth={0.06} />],
    ['Track', (x, y) => <path d={`M${x} ${y}h.7`} stroke={C.track} strokeWidth={0.04} strokeDasharray="0.18 0.1" />],
    ['Railway', (x, y) => <path d={`M${x} ${y}h.7`} stroke={C.black} strokeWidth={0.07} strokeDasharray="0.14 0.08" />],
    ['River', (x, y) => <path d={`M${x} ${y}h.7`} stroke={C.water} strokeWidth={0.07} />],
    ['Contour', (x, y) => <path d={`M${x} ${y}h.7`} stroke={C.index} strokeWidth={0.03} />],
    ['Forest reserve', (x, y) => <rect x={x} y={y - 0.12} width={0.7} height={0.24} fill={C.forest} stroke={C.tree} strokeWidth={0.02} />],
    ['Plantation', (x, y) => <rect x={x} y={y - 0.12} width={0.7} height={0.24} fill={C.plant} stroke="#a8ab59" strokeWidth={0.02} />],
    ['Swamp', (x, y) => <rect x={x} y={y - 0.12} width={0.7} height={0.24} fill={C.swamp} fillOpacity={0.4} />],
    ['Settlement', (x, y) => <rect x={x + 0.3} y={y - 0.06} width={0.12} height={0.12} fill={C.black} />],
    ['School', (x, y) => <FeatureMark kind="SCHOOL" p={[x + 0.35, flipY(y)]} />],
    ['Church', (x, y) => <FeatureMark kind="CHURCH" p={[x + 0.35, flipY(y)]} />],
    ['Mosque', (x, y) => <FeatureMark kind="MOSQUE" p={[x + 0.35, flipY(y)]} />],
    ['Market', (x, y) => <FeatureMark kind="MARKET" p={[x + 0.35, flipY(y)]} />],
    ['Post office', (x, y) => <FeatureMark kind="POST" p={[x + 0.35, flipY(y)]} />],
    ['Borehole', (x, y) => <FeatureMark kind="BOREHOLE" p={[x + 0.35, flipY(y)]} />],
    ['Quarry', (x, y) => <FeatureMark kind="QUARRY" p={[x + 0.35, flipY(y)]} />],
    ['Waterfall', (x, y) => <FeatureMark kind="FALLS" p={[x + 0.35, flipY(y)]} />],
    ['Trig. point', (x, y) => <FeatureMark kind="TRIG" p={[x + 0.35, flipY(y)]} />],
    ['Spot height', (x, y) => <FeatureMark kind="SPOT" p={[x + 0.2, flipY(y)]} />],
  ];
  return (
    <g fontFamily="sans-serif" fill={C.black}>
      <text x={0} y={y0 + 0.2} fontSize={0.42} fontWeight={700}>
        {s.name}
      </text>
      <text x={0} y={y0 + 0.6} fontSize={0.22} fill="#555">
        Fictional practice map. Grid squares are {SQUARE_CM} cm wide.
      </text>
      <text x={0} y={y0 + 1.0} fontSize={0.28}>
        {stmt ? `Scale: ${scaleLine(s)}` : `Scale 1:${s.denom.toLocaleString('en-GB').replace(/,/g, ' ')} (${scaleLine(s)})`}
      </text>
      {!hideInterval && (
        <text x={0} y={y0 + 1.38} fontSize={0.24}>
          Contour interval {s.interval} m
        </text>
      )}
      {!stmt && (
        <g>
          <rect x={0} y={y0 + 1.68} width={barCm} height={0.1} fill={C.black} />
          <rect x={barCm} y={y0 + 1.68} width={barCm} height={0.1} fill="#fff" stroke={C.black} strokeWidth={0.015} />
          {[0, 1, 2].map((i) => (
            <text key={i} x={i * barCm} y={y0 + 2.02} fontSize={0.2} textAnchor="middle">
              {i * barKm}
              {i === 2 ? ' km' : ''}
            </text>
          ))}
        </g>
      )}
      <g transform={`translate(${SHEET_W - 1.1} ${y0 + 1.1})`}>
        <circle r={0.82} fill="none" stroke="#777" strokeWidth={0.015} />
        <path d="M0 -.8L.14 -.14L.8 0L.14 .14L0 .8L-.14 .14L-.8 0L-.14 -.14Z" fill="#333" />
        <path d="M0 -.8L.14 -.14L0 0Z M.8 0L.14 .14L0 0Z M0 .8L-.14 .14L0 0Z M-.8 0L-.14 -.14L0 0Z" fill="#c62828" />
        <text y={-0.87} textAnchor="middle" fontSize={0.26} fontWeight={700}>
          N
        </text>
      </g>
      {keyRows.map(([name, draw], i) => {
        const col = Math.floor(i / 5);
        const x = 6.4 + col * 2.85;
        const y = y0 + 0.2 + (i % 5) * 0.46;
        return (
          <g key={name}>
            {draw(x, y)}
            <text x={x + 0.82} y={y + 0.08} fontSize={0.2}>
              {name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** The whole sheet on a canvas (the map on the 3D bench): same data, simpler symbols. */
export function drawSheetCanvas(g: CanvasRenderingContext2D, v: GeoVariant, px: number) {
  const s = v.sheet;
  g.fillStyle = C.paper;
  g.fillRect(0, 0, SHEET_W * px, SHEET_H * px);
  if (!s) return;
  const X = (x: number) => x * px;
  const Y = (y: number) => flipY(y) * px;
  const line = (pts: readonly P[], close = false) => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
    if (close) g.closePath();
  };
  g.fillStyle = C.forest;
  line(s.forest, true);
  g.fill();
  g.fillStyle = C.plant;
  line(s.plantation, true);
  g.fill();
  const c = geoContours(s);
  for (const l of c.lines) {
    g.strokeStyle = l.index ? C.index : C.contour;
    g.lineWidth = (l.index ? 0.04 : 0.02) * px;
    for (const p of l.paths) {
      line(p);
      g.stroke();
    }
  }
  g.strokeStyle = C.water;
  for (const st of s.streams) {
    g.lineWidth = (st.main ? 0.08 : 0.04) * px;
    line(st.pts);
    g.stroke();
  }
  for (const r of s.roads) {
    g.strokeStyle = r.kind === 'MAIN' ? C.road : r.kind === 'RAIL' ? C.black : r.kind === 'MINOR' ? '#e9a23b' : C.track;
    g.lineWidth = (r.kind === 'MAIN' ? 0.09 : 0.05) * px;
    line(r.pts);
    g.stroke();
  }
  g.fillStyle = C.black;
  for (const st of s.settlements) for (const h of huts(st, s.seed)) g.fillRect(X(h[0]) - 0.05 * px, Y(h[1]) - 0.05 * px, 0.1 * px, 0.1 * px);
  g.strokeStyle = C.grid;
  g.lineWidth = 0.02 * px;
  for (let e = 0; e <= SQUARES_E; e++) {
    g.beginPath();
    g.moveTo(X(e * SQUARE_CM), 0);
    g.lineTo(X(e * SQUARE_CM), SHEET_H * px);
    g.stroke();
  }
  for (let n = 0; n <= SQUARES_N; n++) {
    g.beginPath();
    g.moveTo(0, Y(n * SQUARE_CM));
    g.lineTo(SHEET_W * px, Y(n * SQUARE_CM));
    g.stroke();
  }
}
