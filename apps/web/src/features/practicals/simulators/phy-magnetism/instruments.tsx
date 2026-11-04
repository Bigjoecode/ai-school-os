import {
  FIELD_KEYS,
  FIELD_MAGNET,
  FIELD_PAPER,
  compassAt,
  fieldMagnets,
  fieldTrace,
  sheetCfg,
  type FieldCfg,
  type PhyGraphLine,
  type PhyMagnetismState,
  type PhyMagnetismVariant,
} from '@aischool/shared';
import { LineChart, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fieldCfgNow, shownSheet } from './actions';

/**
 * The magnetism lab's close-up drawings, shared by the 2D lab, the 3D lab's
 * reading panel and (the field sheet) the 3D paper's texture: the sheet with
 * the magnet outline, the dots, the joined lines, the arrows and the neutral
 * marks; the plotting compass's needle; the nail with its clips; the diode's
 * I–V graph on signed axes.
 */

const INK = '#1b1d1f';
type P2 = { x: number; y: number };

/** Draws a field sheet (and the compass on it) on a canvas. `i` null: a clean sheet with the magnet as it is now. */
export function drawFieldSheet(g: CanvasRenderingContext2D, w: number, h: number, v: PhyMagnetismVariant, s: PhyMagnetismState, i: number | null, opts: { compass?: boolean; ruler?: P2 | null } = {}) {
  const k = w / (2 * FIELD_PAPER.w);
  const X = (x: number) => w / 2 + x * k;
  const Y = (y: number) => h / 2 - y * k;
  g.fillStyle = '#fbfaf4';
  g.fillRect(0, 0, w, h);
  const sheet = i === null ? null : s.sheets[i];
  const cfg: FieldCfg = sheet ? sheetCfg(sheet) : fieldCfgNow(s);
  // the meridian (pencil line, N arrow)
  if (s.meridian || sheet?.aligned) {
    g.strokeStyle = '#9aa0a6';
    g.lineWidth = 1;
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(X(-FIELD_PAPER.w + 1.2), Y(-FIELD_PAPER.h + 0.6));
    g.lineTo(X(-FIELD_PAPER.w + 1.2), Y(FIELD_PAPER.h - 0.6));
    g.stroke();
    g.setLineDash([]);
  }
  g.fillStyle = '#5b6672';
  g.font = `600 ${Math.round(k * 0.9)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillText('N ↑ (geographic)', X(-FIELD_PAPER.w + 4.5), Y(FIELD_PAPER.h - 1.2));
  // the magnets' outlines
  for (const m of fieldMagnets(v, cfg)) {
    const a = Math.atan2(m.u.x, m.u.y);
    g.save();
    g.translate(X(m.c.x), Y(m.c.y));
    g.rotate(a);
    const L = FIELD_MAGNET.len * k;
    const W = FIELD_MAGNET.w * k;
    g.fillStyle = '#c62828';
    g.fillRect(-W / 2, -L / 2, W, L / 2);
    g.fillStyle = '#e8edf2';
    g.fillRect(-W / 2, 0, W, L / 2);
    g.strokeStyle = INK;
    g.lineWidth = 1.2;
    g.strokeRect(-W / 2, -L / 2, W, L);
    g.fillStyle = INK;
    g.font = `800 ${Math.round(k * 1.1)}px system-ui, sans-serif`;
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText('N', 0, -L / 2 + k * 1.1);
    g.fillStyle = INK;
    g.fillText('S', 0, L / 2 - k * 1.1);
    g.restore();
  }
  g.textBaseline = 'alphabetic';
  // the steel keys beside the paper
  if (!s.steelAway && !sheet) {
    g.fillStyle = '#8a9099';
    g.beginPath();
    g.arc(X(FIELD_KEYS.x), Y(FIELD_KEYS.y), k * 0.9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5b6672';
    g.font = `500 ${Math.round(k * 0.8)}px system-ui, sans-serif`;
    g.fillText('keys', X(FIELD_KEYS.x), Y(FIELD_KEYS.y) + k * 2);
  }
  if (sheet) {
    sheet.lines.forEach((l, j) => {
      const tr = fieldTrace(v, cfg, i!, j, l, l.dots);
      const d = tr.dots;
      g.strokeStyle = '#33363a';
      g.lineWidth = 1.3;
      if (d.length > 1) {
        g.beginPath();
        g.moveTo(X(d[0]!.x), Y(d[0]!.y));
        for (let n = 1; n < d.length - 1; n++) {
          const mx = (d[n]!.x + d[n + 1]!.x) / 2;
          const my = (d[n]!.y + d[n + 1]!.y) / 2;
          g.quadraticCurveTo(X(d[n]!.x), Y(d[n]!.y), X(mx), Y(my));
        }
        g.lineTo(X(d[d.length - 1]!.x), Y(d[d.length - 1]!.y));
        g.stroke();
      }
      g.fillStyle = INK;
      for (const p of d) {
        g.beginPath();
        g.arc(X(p.x), Y(p.y), Math.max(1.5, k * 0.12), 0, Math.PI * 2);
        g.fill();
      }
      if (sheet.arrows && d.length > 3) {
        const m = Math.floor(d.length / 2);
        const a = d[m - 1]!;
        const b = d[m]!;
        const ang = Math.atan2(-(b.y - a.y), b.x - a.x);
        const cx = X((a.x + b.x) / 2);
        const cy = Y((a.y + b.y) / 2);
        g.fillStyle = '#1d4ed8';
        g.beginPath();
        g.moveTo(cx + Math.cos(ang) * k * 0.7, cy + Math.sin(ang) * k * 0.7);
        g.lineTo(cx + Math.cos(ang + 2.5) * k * 0.6, cy + Math.sin(ang + 2.5) * k * 0.6);
        g.lineTo(cx + Math.cos(ang - 2.5) * k * 0.6, cy + Math.sin(ang - 2.5) * k * 0.6);
        g.closePath();
        g.fill();
      }
    });
    sheet.neutrals.forEach((p, j) => {
      g.strokeStyle = '#b91c1c';
      g.lineWidth = 2;
      const r = k * 0.45;
      g.beginPath();
      g.moveTo(X(p.x) - r, Y(p.y) - r);
      g.lineTo(X(p.x) + r, Y(p.y) + r);
      g.moveTo(X(p.x) + r, Y(p.y) - r);
      g.lineTo(X(p.x) - r, Y(p.y) + r);
      g.stroke();
      g.fillStyle = '#b91c1c';
      g.font = `700 ${Math.round(k * 0.9)}px system-ui, sans-serif`;
      g.fillText(String.fromCharCode(88 + (j % 2)) + (j >= 2 ? '′' : ''), X(p.x) + k * 0.9, Y(p.y) - k * 0.6);
    });
  }
  if (opts.ruler) {
    const p = opts.ruler;
    const len = Math.hypot(p.x, p.y);
    const a = Math.atan2(-p.y, p.x);
    g.save();
    g.translate(X(0), Y(0));
    g.rotate(a);
    g.fillStyle = 'rgba(241,214,138,0.85)';
    g.fillRect(0, -k * 0.9, (len + 1.5) * k, k * 0.9);
    g.strokeStyle = INK;
    for (let mm = 0; mm <= (len + 1.4) * 10; mm++) {
      const x = (mm / 10) * k;
      g.lineWidth = mm % 10 === 0 ? 1.2 : 0.5;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, -k * (mm % 10 === 0 ? 0.6 : mm % 5 === 0 ? 0.42 : 0.28));
      g.stroke();
      if (mm % 10 === 0) {
        g.fillStyle = INK;
        g.font = `600 ${Math.round(k * 0.45)}px system-ui, sans-serif`;
        g.fillText(String(mm / 10), x, -k * 0.65);
      }
    }
    g.restore();
  }
  if (opts.compass) {
    const c = compassAt(v, cfg, { x: s.cx, y: s.cy });
    const R = (s.compass === 'small' ? 0.85 : 1.7) * k;
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.strokeStyle = '#334155';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(X(s.cx), Y(s.cy), R, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    const hd = c.loose ? (performance.now() / 900) % (Math.PI * 2) : c.heading;
    const dx = Math.sin(hd) * R * 0.85;
    const dy = -Math.cos(hd) * R * 0.85;
    g.lineWidth = 3;
    g.strokeStyle = '#c62828';
    g.beginPath();
    g.moveTo(X(s.cx), Y(s.cy));
    g.lineTo(X(s.cx) + dx, Y(s.cy) + dy);
    g.stroke();
    g.strokeStyle = '#1f2937';
    g.beginPath();
    g.moveTo(X(s.cx), Y(s.cy));
    g.lineTo(X(s.cx) - dx, Y(s.cy) - dy);
    g.stroke();
  }
}

/** The field sheet as a canvas; a click (when `onPick`) moves the compass there. */
export function FieldCanvas({ v, s, i, compass, ruler, onPick, className }: { v: PhyMagnetismVariant; s: PhyMagnetismState; i?: number | null; compass?: boolean; ruler?: P2 | null; onPick?: (x: number, y: number) => void; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sh = i === undefined ? (shownSheet(s)?.i ?? null) : i;
  const loose = compass && compassAt(v, sh !== null && s.sheets[sh] ? sheetCfg(s.sheets[sh]!) : fieldCfgNow(s), { x: s.cx, y: s.cy }).loose;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!loose) return;
    const id = window.setInterval(() => tick((n) => n + 1), 120);
    return () => window.clearInterval(id);
  }, [loose]);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (c && g) drawFieldSheet(g, c.width, c.height, v, s, sh, { compass, ruler });
  });
  return (
    <canvas
      ref={ref}
      width={840}
      height={640}
      className={cn('w-full rounded-xl border border-border bg-white', onPick && 'cursor-crosshair', className)}
      role="img"
      aria-label={`Field sheet${sh !== null ? ` ${sh + 1}` : ''}: the magnet with its N pole pointing ${s.facing}${compass ? `; the plotting compass at (${s.cx.toFixed(1)}, ${s.cy.toFixed(1)}) cm${loose ? ', its needle resting in any direction' : ''}` : ''}`}
      onClick={(e) => {
        if (!onPick) return;
        const r = e.currentTarget.getBoundingClientRect();
        const kx = (2 * FIELD_PAPER.w) / r.width;
        onPick((e.clientX - r.left) * kx - FIELD_PAPER.w, FIELD_PAPER.h - (e.clientY - r.top) * kx);
      }}
    />
  );
}

/** The plotting compass close up: its needle, or resting in any direction. */
export function CompassFace({ heading, loose, label }: { heading: number; loose: boolean; label?: string }) {
  const [wob, setWob] = useState(0);
  useEffect(() => {
    if (!loose) return;
    const id = window.setInterval(() => setWob((x) => x + 0.6 + Math.random() * 0.8), 160);
    return () => window.clearInterval(id);
  }, [loose]);
  const a = loose ? wob : heading;
  const deg = (a * 180) / Math.PI;
  return (
    <figure className="inline-block space-y-1">
      <svg viewBox="0 0 120 120" className="w-32 rounded-full border border-border bg-card" role="img" aria-label={loose ? 'The compass needle rests in any direction: a neutral point' : `The compass needle points ${Math.round(((deg % 360) + 360) % 360)}° from north`}>
        <circle cx={60} cy={60} r={52} fill="#f8fafc" stroke="#64748b" strokeWidth={2} />
        {Array.from({ length: 36 }, (_, n) => (
          <line key={n} x1={60 + 46 * Math.sin((n * Math.PI) / 18)} y1={60 - 46 * Math.cos((n * Math.PI) / 18)} x2={60 + 51 * Math.sin((n * Math.PI) / 18)} y2={60 - 51 * Math.cos((n * Math.PI) / 18)} stroke="#94a3b8" strokeWidth={n % 9 === 0 ? 2 : 0.8} />
        ))}
        <text x={60} y={20} textAnchor="middle" fontSize="9" fill="#475569">
          N
        </text>
        <g transform={`rotate(${deg} 60 60)`} style={{ transition: loose ? 'transform 0.15s linear' : 'transform 0.5s ease-out' }}>
          <polygon points="60,16 55,60 65,60" fill="#c62828" />
          <polygon points="60,104 55,60 65,60" fill="#1f2937" />
        </g>
        <circle cx={60} cy={60} r={3.5} fill="#e2e8f0" stroke="#334155" />
      </svg>
      {label && <figcaption className="max-w-[180px] text-[11px] text-muted-foreground">{label}</figcaption>}
    </figure>
  );
}

/** The nail electromagnet lifted from the pile: `clips` hanging from its tip (count them). */
export function NailClips({ clips, turns, core, lifting }: { clips: number; turns: number; core: 'iron' | 'steel' | 'none'; lifting?: boolean }) {
  const hang = Array.from({ length: clips }, (_, n) => n);
  return (
    <svg viewBox="0 0 240 230" className="w-full max-w-[260px] rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`The ${core === 'none' ? 'coil with no core' : core === 'steel' ? 'steel rod' : 'nail'} with ${turns} turns${lifting ? ` holding ${clips} paper clips` : ''}`}>
      <rect x={110} y={10} width={20} height={core === 'none' ? 0 : 110} fill={core === 'steel' ? '#64748b' : '#9ca3af'} rx={3} />
      {core !== 'none' && <polygon points="110,120 130,120 120,134" fill={core === 'steel' ? '#64748b' : '#9ca3af'} />}
      {Array.from({ length: Math.min(24, Math.round(turns / 3)) }, (_, n) => (
        <ellipse key={n} cx={120} cy={22 + n * 3.6} rx={14} ry={2.4} fill="none" stroke="#b5651d" strokeWidth={1.6} />
      ))}
      {lifting &&
        hang.map((n) => {
          const col = n % 4;
          const row = Math.floor(n / 4);
          const x = 96 + col * 14 + (row % 2) * 6;
          const y = 138 + row * 20;
          return <rect key={n} x={x} y={y} width={7} height={18} rx={3.5} fill="none" stroke="#475569" strokeWidth={1.6} transform={`rotate(${(n % 3) * 9 - 9} ${x + 3} ${y})`} />;
        })}
      {!lifting && <ellipse cx={120} cy={212} rx={70} ry={10} fill="#cbd5e1" />}
    </svg>
  );
}

const W = 340;
const H = 250;
const M = { l: 44, r: 12, t: 12, b: 36 };
const fmt = (x: number) => Number(x.toPrecision(3)).toString();
function step(range: number, ticks = 5) {
  const raw = range / ticks;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** A graph whose axes can run negative (the diode's reverse quadrant), with a straight line placed by its two ends. */
export function SignedGraph({ points, line, onLine, readOnly, xLabel, yLabel }: { points: P2[]; line: PhyGraphLine | null; onLine: (l: PhyGraphLine | null) => void; readOnly: boolean; xLabel: string; yLabel: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<1 | 2 | null>(null);
  const xs = [...points.map((p) => p.x), ...(line ? [line.x1, line.x2] : []), 0];
  const ys = [...points.map((p) => p.y), ...(line ? [line.y1, line.y2] : []), 0];
  const sx = step((Math.max(...xs) - Math.min(...xs)) * 1.08 || 1);
  const sy = step((Math.max(...ys) - Math.min(...ys)) * 1.08 || 1);
  const x0 = Math.floor((Math.min(...xs) * 1.04) / sx) * sx;
  const x1 = Math.ceil((Math.max(...xs) * 1.04 || sx) / sx) * sx;
  const y0 = Math.floor((Math.min(...ys) * 1.04) / sy) * sy;
  const y1 = Math.ceil((Math.max(...ys) * 1.04 || sy) / sy) * sy;
  const px = (x: number) => M.l + ((x - x0) / (x1 - x0)) * (W - M.l - M.r);
  const py = (y: number) => H - M.b - ((y - y0) / (y1 - y0)) * (H - M.t - M.b);
  const toData = (cx: number, cy: number) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    const x = x0 + ((p.x - M.l) / (W - M.l - M.r)) * (x1 - x0);
    const y = y0 + ((H - M.b - p.y) / (H - M.t - M.b)) * (y1 - y0);
    return { x: Number(Math.max(x0, Math.min(x1, x)).toPrecision(4)), y: Number(Math.max(y0, Math.min(y1, y)).toPrecision(4)) };
  };
  const place = () => {
    const f = points.filter((p) => p.x > 0);
    const top = [...f].sort((a, b) => b.y - a.y).slice(0, 3);
    if (top.length < 2) return;
    const lo = top.reduce((a, b) => (b.x < a.x ? b : a));
    const hi = top.reduce((a, b) => (b.x > a.x ? b : a));
    onLine({ x1: lo.x, y1: lo.y, x2: hi.x, y2: hi.y });
  };
  const xt = Array.from({ length: Math.round((x1 - x0) / sx) + 1 }, (_, i) => x0 + i * sx);
  const yt = Array.from({ length: Math.round((y1 - y0) / sy) + 1 }, (_, i) => y0 + i * sy);
  return (
    <div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-xl border border-border bg-card"
        role="img"
        aria-label={`Graph of ${yLabel} against ${xLabel}: ${points.length} points${line ? ', with your line' : ''}`}
        onPointerMove={(e) => {
          if (!drag || !line || readOnly) return;
          const d = toData(e.clientX, e.clientY);
          if (d) onLine(drag === 1 ? { ...line, x1: d.x, y1: d.y } : { ...line, x2: d.x, y2: d.y });
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {xt.map((x) => (
          <g key={`x${x}`}>
            <line x1={px(x)} x2={px(x)} y1={M.t} y2={H - M.b} className="stroke-border" strokeWidth="0.6" />
            <text x={px(x)} y={H - M.b + 12} textAnchor="middle" fontSize="9" className="fill-muted-foreground">
              {fmt(x)}
            </text>
          </g>
        ))}
        {yt.map((y) => (
          <g key={`y${y}`}>
            <line x1={M.l} x2={W - M.r} y1={py(y)} y2={py(y)} className="stroke-border" strokeWidth="0.6" />
            <text x={M.l - 4} y={py(y) + 3} textAnchor="end" fontSize="9" className="fill-muted-foreground">
              {fmt(y)}
            </text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={py(0)} y2={py(0)} className="stroke-foreground/70" strokeWidth="1" />
        <line x1={px(0)} x2={px(0)} y1={M.t} y2={H - M.b} className="stroke-foreground/70" strokeWidth="1" />
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" fontSize="10" className="fill-foreground">
          {xLabel}
        </text>
        <text x={11} y={(M.t + H - M.b) / 2} textAnchor="middle" fontSize="10" className="fill-foreground" transform={`rotate(-90 11 ${(M.t + H - M.b) / 2})`}>
          {yLabel}
        </text>
        {points.map((p, i) => (
          <g key={i} className="stroke-brand" strokeWidth="1.4">
            <line x1={px(p.x) - 4} x2={px(p.x) + 4} y1={py(p.y) - 4} y2={py(p.y) + 4} />
            <line x1={px(p.x) - 4} x2={px(p.x) + 4} y1={py(p.y) + 4} y2={py(p.y) - 4} />
          </g>
        ))}
        {line && (
          <g>
            <line x1={px(line.x1)} y1={py(line.y1)} x2={px(line.x2)} y2={py(line.y2)} className="stroke-foreground" strokeWidth="1.3" />
            {([1, 2] as const).map((end) => (
              <circle
                key={end}
                cx={px(end === 1 ? line.x1 : line.x2)}
                cy={py(end === 1 ? line.y1 : line.y2)}
                r={readOnly ? 3 : 8}
                className={cn(readOnly ? 'fill-foreground' : 'cursor-grab fill-brand/25 stroke-brand')}
                strokeWidth="1.2"
                role={readOnly ? undefined : 'slider'}
                aria-label={`End ${end} of your line`}
                aria-valuenow={end === 1 ? line.x1 : line.x2}
                tabIndex={readOnly ? -1 : 0}
                onPointerDown={(e) => {
                  if (readOnly) return;
                  e.stopPropagation();
                  (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
                  setDrag(end);
                }}
              />
            ))}
          </g>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        {!readOnly && (
          <>
            <Button size="sm" variant="outline" onClick={place} disabled={points.filter((p) => p.x > 0).length < 2}>
              <LineChart /> {line ? 'Redraw the tangent' : 'Draw a tangent on the steep part'}
            </Button>
            {line && (
              <Button size="sm" variant="ghost" onClick={() => onLine(null)}>
                <Trash2 /> Remove line
              </Button>
            )}
          </>
        )}
        {line ? (
          <span className="tabular text-muted-foreground">
            Line through ({fmt(line.x1)}, {fmt(line.y1)}) and ({fmt(line.x2)}, {fmt(line.y2)})
          </span>
        ) : (
          <span className="text-muted-foreground">Plot your points, then draw the tangent and drag its ends.</span>
        )}
      </div>
    </div>
  );
}

/** An analogue meter face (0 … fsd, or centre-zero −fsd … +fsd): its needle at `value`; hard against the stop beyond the scale. */
export function MeterDial({ label, unit, value, fsd, minor, major, centre = false, caption }: { label: string; unit: string; value: number; fsd: number; minor: number; major: number; centre?: boolean; caption?: string }) {
  const cx = 130;
  const cy = 150;
  const R = 112;
  const from = centre ? -fsd : 0;
  const ang = (x: number) => ((-50 + (100 * (x - from)) / (fsd - from)) * Math.PI) / 180;
  const pt = (x: number, r: number) => ({ x: cx + r * Math.sin(ang(x)), y: cy - r * Math.cos(ang(x)) });
  const ticks = Math.round((fsd - from) / minor);
  const lim = (fsd - from) * 0.03;
  const shown = Math.max(from - lim, Math.min(fsd + lim, value));
  const pinned = value > fsd * 1.02 || value < from - Math.abs(fsd) * 0.02;
  const tip = pt(shown, R - 4);
  return (
    <figure className="space-y-1">
      <svg viewBox="0 0 260 170" className="w-full max-w-[280px] rounded-xl border border-border bg-card" role="img" aria-label={`${unit} meter${pinned ? ': the pointer is hard against the stop' : ''}`}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const x = from + i * minor;
          const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
          const half = !isMajor && Math.abs(x / (major / 2) - Math.round(x / (major / 2))) < 1e-6;
          const a = pt(x, R);
          const b = pt(x, R - (isMajor ? 14 : half ? 10 : 6));
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-foreground/80" strokeWidth={isMajor ? 1.2 : 0.6} />
              {isMajor && (
                <text x={pt(x, R - 24).x} y={pt(x, R - 24).y + 3} textAnchor="middle" fontSize="9" className="fill-foreground">
                  {Number(Math.abs(x).toFixed(2))}
                </text>
              )}
            </g>
          );
        })}
        <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} className="stroke-danger" strokeWidth="1.3" />
        <circle cx={cx} cy={cy} r="5" className="fill-foreground/80" />
        <text x={cx} y={cy - 40} textAnchor="middle" fontSize="16" fontWeight="700" className="fill-foreground/80">
          {label}
        </text>
      </svg>
      {(caption || pinned) && <figcaption className={cn('text-[11.5px]', pinned ? 'text-danger' : 'text-muted-foreground')}>{pinned ? 'The pointer is hard against the stop: off the scale.' : caption}</figcaption>}
    </figure>
  );
}
