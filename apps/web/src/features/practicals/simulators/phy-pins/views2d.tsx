import {
  DEPTH_EYE_H,
  DEPTH_PIN_MAX,
  DISP_COLOURS,
  DISP_SLIT_WIDTH,
  PINS_SHEET,
  depthImage,
  depthPinAngle,
  depthStack,
  dispDeviation,
  dispIndex,
  dispPasses,
  pinsEye,
  pinsImage,
  pinsIncident,
  pinsPrism,
  pinsRot,
  prismInDir,
  prismRay,
  prismSeen,
  prismShape,
  type DispState,
  type PhyPinsVariant,
  type PinsPoint,
  type PinsTrace,
} from '@aischool/shared';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { PIN_LABEL, pushCentre, type PinId } from './actions';
import { drawPaper, paperSize, PAPER_PX } from './paper';

/** The 2D views of the pin labs: the board, the eye's view, the protractor, the depth stand and its eye view, the spectrum. */

const toDeg = (r: number) => (r * 180) / Math.PI;

export function BoardCanvas({ v, task, trace, eye, onTap, tool }: { v: PhyPinsVariant; task: 'MIRROR' | 'PRISM'; trace: PinsTrace | null; eye: PinsPoint | null; onTap?: (p: PinsPoint) => void; tool: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = paperSize(task);
  const key = JSON.stringify([trace, eye, v.seed, v.n, v.A, task]);
  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (g) drawPaper(g, v, task, trace, undefined, { eye });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const S = PINS_SHEET[task];
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      className={cn('w-full touch-none select-none rounded-xl border border-border', tool && 'cursor-crosshair')}
      role="img"
      aria-label={trace ? `Drawing board: ${task === 'MIRROR' ? 'mirror line' : 'prism outline'}, ray at ${trace.i}°${trace.joined ? ', points joined' : ''}` : 'Drawing board with paper'}
      onPointerDown={(e) => {
        if (!onTap || !tool) return;
        const r = e.currentTarget.getBoundingClientRect();
        onTap({ x: S.left + ((e.clientX - r.left) / r.width) * (w / PAPER_PX), y: S.top - ((e.clientY - r.top) / r.height) * (h / PAPER_PX) });
      }}
    />
  );
}

/** Is the image at q seen from the eye (through the mirror or the prism's second face)? */
export function imageSeen(v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', E: PinsPoint, q: PinsPoint): boolean {
  if (task === 'PRISM') return prismSeen(pinsPrism(v), E, q);
  if (q.y >= 0 || E.y <= 0) return false;
  const k = E.y / (E.y - q.y);
  const x = E.x + (q.x - E.x) * k;
  return x >= -7 && x <= 7;
}

/** The pins and images the eye sees, as angles (°) from its line of sight to the centre. */
export function eyeItems(v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', t: PinsTrace, phi: number) {
  const E = pinsEye(v, task, phi);
  const C = pushCentre(v, task);
  const ref = { x: C.x - E.x, y: C.y - E.y };
  const ang = (q: PinsPoint) => {
    const d = { x: q.x - E.x, y: q.y - E.y };
    return toDeg(Math.atan2(ref.x * d.y - ref.y * d.x, ref.x * d.x + ref.y * d.y));
  };
  const items: { id: PinId; a: number; image: boolean; dist: number }[] = [];
  for (const id of ['p1', 'p2'] as const) {
    const s = t[id];
    if (s === null) continue;
    const q = pinsImage(v, task, t.i, s);
    if (q && imageSeen(v, task, E, q)) items.push({ id, a: ang(q), image: true, dist: Math.hypot(q.x - E.x, q.y - E.y) });
  }
  for (const id of ['p3', 'p4'] as const) {
    const q = t[id];
    if (q) items.push({ id, a: ang(q), image: false, dist: Math.hypot(q.x - E.x, q.y - E.y) });
  }
  return items;
}

/** What the eye sees at paper level: images of P₁, P₂ (in the mirror / through the prism) and P₃, P₄ as upright lines. */
export function EyeView({ v, task, trace, phi }: { v: PhyPinsVariant; task: 'MIRROR' | 'PRISM'; trace: PinsTrace; phi: number }) {
  const W = 320;
  const H = 90;
  const items = eyeItems(v, task, trace, phi);
  const imgs = items.filter((x) => x.image);
  const centre = imgs.length ? imgs.reduce((t, x) => t + x.a, 0) / imgs.length : items.length ? items[0]!.a : 0;
  const k = 28;
  const X = (a: number) => W / 2 - (a - centre) * k;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-border bg-gradient-to-b from-sky-100 to-slate-100 dark:from-sky-950 dark:to-slate-900" role="img" aria-label={`Eye view: ${imgs.length} image${imgs.length === 1 ? '' : 's'} of P₁, P₂ visible`}>
        <rect x={0} y={0} width={W} height={46} fill={task === 'MIRROR' ? '#b8c4cc' : '#9fd3e6'} opacity="0.35" />
        {items.map((it) => {
          const x = X(it.a);
          if (x < -10 || x > W + 10) return null;
          const w = Math.max(1.5, Math.min(7, 40 / it.dist));
          return (
            <g key={it.id}>
              <rect x={x - w / 2} y={it.image ? 6 : 26} width={w} height={it.image ? 40 : 60} fill={it.image ? '#334155' : '#1d4ed8'} opacity={it.image ? 0.75 : 0.9} />
              <text x={x} y={it.image ? 5 : H - 2} textAnchor="middle" fontSize="8" className="fill-foreground">
                {PIN_LABEL[it.id]}
                {it.image ? "'" : ''}
              </text>
            </g>
          );
        })}
        {!imgs.length && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="9" className="fill-muted-foreground">
            {trace.p1 === null || trace.p2 === null ? 'Stick P₁ and P₂ first.' : 'You cannot see the images from here: move your eye.'}
          </text>
        )}
      </svg>
      <p className="mt-1 text-[11px] text-muted-foreground">Images of P₁ and P₂ seen {task === 'MIRROR' ? 'in the mirror' : 'through the prism'} (top) and your pins P₃, P₄ (blue). Line up the bases, one exactly behind another.</p>
    </div>
  );
}

/** A protractor laid on the paper: 0° along the reference line (the normal, or the incident ray produced), the drawn ray at `angle`. */
export function ProtractorView({ angle, refLabel }: { angle: number | null; refLabel: string }) {
  const W = 320;
  const H = 180;
  const cx = W / 2;
  const cy = H - 10;
  const R = 150;
  const pt = (a: number, r: number) => ({ x: cx + r * Math.sin((a * Math.PI) / 180), y: cy - r * Math.cos((a * Math.PI) / 180) });
  const ray = angle !== null ? pt(angle, R + 6) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-border bg-card" role="img" aria-label={`Protractor: 0° along ${refLabel}; read the angle to the drawn ray`}>
      {Array.from({ length: 181 }, (_, k) => k - 90).map((a) => {
        const major = a % 10 === 0;
        const mid = a % 5 === 0;
        const p = pt(a, R);
        const q = pt(a, R - (major ? 14 : mid ? 9 : 5));
        return (
          <g key={a}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="stroke-foreground/80" strokeWidth={major ? 1 : 0.5} />
            {major && (
              <text x={pt(a, R - 24).x} y={pt(a, R - 24).y + 3} textAnchor="middle" fontSize="8" className="fill-foreground">
                {Math.abs(a)}
              </text>
            )}
          </g>
        );
      })}
      <line x1={cx} y1={cy} x2={cx} y2={cy - R - 6} className="stroke-muted-foreground" strokeDasharray="4 3" strokeWidth="0.8" />
      <text x={cx + 4} y={12} fontSize="8" className="fill-muted-foreground">
        {refLabel}
      </text>
      {ray && <line x1={cx} y1={cy} x2={ray.x} y2={ray.y} stroke="#b91c1c" strokeWidth="1.2" />}
      <circle cx={cx} cy={cy} r="2.5" className="fill-foreground" />
    </svg>
  );
}

// ------------------------------------------------------------------ depth

/** Side view of the stack, the cross, the rule and the search pin. */
export function DepthSide({ v, blocks, h, eyeX }: { v: PhyPinsVariant; blocks: number; h: number; eyeX: number }) {
  const W = 320;
  const H = 230;
  const k = 13; // px per cm
  const base = H - 14;
  const Y = (cm: number) => base - cm * k;
  const T = depthStack(v, blocks);
  const img = blocks ? T - depthImage(v, blocks, eyeX).depth : 0;
  const bx = 150;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-border bg-card" role="img" aria-label={`Side view: ${blocks} block${blocks === 1 ? '' : 's'}, search pin at ${h.toFixed(2)} cm on the rule`}>
      <rect x={0} y={base} width={W} height={14} fill="#8d6e63" opacity="0.5" />
      {/* the vertical rule: 0 at the bench */}
      <rect x={70} y={Y(DEPTH_PIN_MAX)} width={16} height={DEPTH_PIN_MAX * k} fill="#f3e3b5" stroke="#a1887f" strokeWidth="0.6" />
      {Array.from({ length: DEPTH_PIN_MAX * 10 + 1 }, (_, i) => i / 10).map((cm) => (
        <line key={cm} x1={86} x2={86 - (Math.round(cm * 10) % 10 === 0 ? 8 : Math.round(cm * 10) % 5 === 0 ? 5 : 3)} y1={Y(cm)} y2={Y(cm)} stroke="#3e2723" strokeWidth="0.4" />
      ))}
      {Array.from({ length: DEPTH_PIN_MAX + 1 }, (_, cm) => (
        <text key={cm} x={66} y={Y(cm) + 3} textAnchor="end" fontSize="7" className="fill-foreground">
          {cm}
        </text>
      ))}
      {/* the blocks */}
      {v.blocks.slice(0, blocks).map((t, i) => {
        const y0 = depthStack(v, i);
        return <rect key={i} x={bx} y={Y(y0 + t)} width={110} height={t * k} fill="#bfe3ee" fillOpacity="0.55" stroke="#4b7f8c" strokeWidth="0.8" />;
      })}
      {/* the cross on the paper and its image */}
      <path d={`M${bx + 4} ${base - 3} l6 0 M${bx + 7} ${base - 6} l0 6`} stroke="#111" strokeWidth="1.2" />
      {blocks > 0 && <path d={`M${bx + 4} ${Y(img) - 0} l6 0 M${bx + 7} ${Y(img) - 3} l0 6`} stroke="#6b7280" strokeWidth="1" strokeDasharray="2 1" />}
      {/* the stand, cork and search pin */}
      <rect x={20} y={Y(DEPTH_PIN_MAX + 1)} width={4} height={(DEPTH_PIN_MAX + 1) * k} fill="#546e7a" />
      <rect x={24} y={Y(h) - 4} width={22} height={8} rx={2} fill="#a1887f" />
      <line x1={46} y1={Y(h)} x2={bx + 6} y2={Y(h)} stroke="#64748b" strokeWidth="1.4" />
      <circle cx={bx + 6} cy={Y(h)} r={1.4} fill="#0f172a" />
      {/* the eye, above */}
      <g transform={`translate(${bx + 7 + eyeX * 8} 10)`}>
        <ellipse rx={9} ry={5} fill="none" stroke="#0f172a" strokeWidth="1.2" />
        <circle r={2.5} fill="#0f172a" />
      </g>
      <text x={W - 6} y={14} textAnchor="end" fontSize="8" className="fill-muted-foreground">
        eye {DEPTH_EYE_H} cm above
      </text>
    </svg>
  );
}

/**
 * Looking down at the cross through the stack: the image of the cross and the
 * search pin's tip just beside it. Both drift as the eye moves; the pin's
 * movement relative to the image (the parallax) is shown as it would look
 * through a close look at the tip.
 */
export function DepthEye({ v, blocks, h, eyeX }: { v: PhyPinsVariant; blocks: number; h: number; eyeX: number }) {
  const W = 320;
  const H = 110;
  const img = blocks ? depthImage(v, blocks, eyeX).angle : Math.atan2(-eyeX, DEPTH_EYE_H);
  const pin = depthPinAngle(v, blocks, h, eyeX);
  const common = W / 2 + 300 * img;
  const xi = common;
  const xp = common + 4000 * (pin - img);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label="Looking down: the image of the cross and the tip of the search pin">
      <rect x={0} y={0} width={W} height={H} fill="#bfe3ee" opacity={blocks ? 0.35 : 0} />
      <path d={`M${xi - 10} ${H / 2 + 14} l20 0 M${xi} ${H / 2 + 4} l0 20`} stroke="#111" strokeWidth="2" />
      <line x1={xp - 120} y1={H / 2 - 4} x2={xp} y2={H / 2 - 4} stroke="#475569" strokeWidth="3" strokeLinecap="round" />
      <circle cx={xp} cy={H / 2 - 4} r={2} fill="#0f172a" />
      <text x={6} y={12} fontSize="8" className="fill-muted-foreground">
        image of the cross (black) and the search pin’s tip
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ dispersion

/** The bench seen from above: ray box, prism on its turntable, the colours fanning out to the screen. */
export function DispTop({ v, d }: { v: PhyPinsVariant; d: DispState }) {
  const W = 320;
  const H = 170;
  const sh = prismShape(v.dispA, 6);
  const dIn = prismInDir(sh, d.i);
  const rot = -toDeg(Math.atan2(dIn.y, dIn.x));
  const k = 6;
  const c = { x: 120, y: 80 };
  const P = (p: PinsPoint) => {
    const q = pinsRot(p, rot);
    return { x: c.x + q.x * k, y: c.y - q.y * k };
  };
  const O = P(sh.O);
  const scrX = c.x + Math.min(190, d.dist * 1.5);
  const fans = DISP_COLOURS.filter((col) => dispPasses(d.filter, col.id)).map((col) => {
    const ray = prismRay(sh, dispIndex(v, col.lambda), d.i);
    if (!ray.Q || !ray.dOut) return null;
    const Q = P(ray.Q);
    const dir = pinsRot(ray.dOut, rot);
    const t = (scrX - Q.x) / Math.max(1e-3, dir.x);
    return { col, Q, end: { x: scrX, y: Q.y - dir.y * t } };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('w-full rounded-xl border border-border', d.dark ? 'bg-slate-900' : 'bg-card')} role="img" aria-label={`From above: prism at i = ${d.i}°, screen ${d.dist} cm away`}>
      <rect x={4} y={c.y - 10} width={34} height={20} rx={3} fill="#37474f" />
      <rect x={38} y={c.y - (d.slit === 'narrow' ? 1 : 4)} width={2} height={d.slit === 'narrow' ? 2 : 8} fill="#fff59d" />
      <line x1={40} y1={c.y} x2={O.x} y2={O.y} stroke="#fffbe6" strokeWidth={d.slit === 'narrow' ? 1.2 : 4} opacity="0.9" />
      <polygon points={[sh.B, sh.T, sh.C].map((p) => `${P(p).x},${P(p).y}`).join(' ')} fill="#bfe3ee" fillOpacity="0.5" stroke="#4b7f8c" />
      {fans.map((f) => f && <line key={f.col.id} x1={f.Q.x} y1={f.Q.y} x2={f.end.x} y2={f.end.y} stroke={f.col.css} strokeWidth={d.slit === 'narrow' ? 0.8 : 2.5} opacity={d.dark ? 0.95 : 0.5} />)}
      <rect x={scrX} y={10} width={4} height={H - 20} fill="#f5f5f5" stroke="#9e9e9e" strokeWidth="0.5" />
      <text x={6} y={14} fontSize="8" className={d.dark ? 'fill-white/70' : 'fill-muted-foreground'}>
        {d.dark ? 'Room darkened' : 'Room lights on'} · slit {d.slit} · filter {d.filter}
      </text>
    </svg>
  );
}

/** The screen: the spectrum on its degree scale (deviation). */
export function DispScreen({ v, d }: { v: PhyPinsVariant; d: DispState }) {
  const W = 340;
  const H = 96;
  const bands = DISP_COLOURS.filter((c) => dispPasses(d.filter, c.id))
    .map((c) => ({ c, D: dispDeviation(v, c.id, d.i) }))
    .filter((b): b is { c: (typeof DISP_COLOURS)[number]; D: number } => b.D !== null);
  const green = dispDeviation(v, 'green', d.i) ?? 40;
  const lo = Math.floor(green) - 5;
  const span = 11;
  const pxDeg = W / span;
  const X = (D: number) => (D - lo) * pxDeg;
  // The beam is a fixed width at the screen: farther away the colours spread more relative to it.
  const width = (DISP_SLIT_WIDTH[d.slit] * 60) / Math.max(20, d.dist);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-border bg-white" role="img" aria-label="The screen with its deviation scale">
      <defs>
        {bands.map((b) => (
          <linearGradient key={b.c.id} id={`band-${b.c.id}`} x1="0" x2="1">
            <stop offset="0" stopColor={b.c.css} stopOpacity="0" />
            <stop offset="0.5" stopColor={b.c.css} stopOpacity="1" />
            <stop offset="1" stopColor={b.c.css} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      <rect x={0} y={0} width={W} height={60} fill={d.dark ? '#111' : '#f4f4f0'} />
      <g style={{ mixBlendMode: d.dark ? 'screen' : 'multiply' }} opacity={d.dark ? 1 : 0.35}>
        {bands.map((b) => (
          <rect key={b.c.id} x={X(b.D) - width * pxDeg} y={6} width={2 * width * pxDeg} height={48} fill={`url(#band-${b.c.id})`} />
        ))}
      </g>
      {Array.from({ length: span * 10 + 1 }, (_, i) => lo + i / 10).map((D, i) => (
        <line key={i} x1={X(D)} x2={X(D)} y1={60} y2={60 + (i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 4)} stroke="#222" strokeWidth={i % 10 === 0 ? 0.8 : 0.4} />
      ))}
      {Array.from({ length: span + 1 }, (_, i) => lo + i).map((D) => (
        <text key={D} x={X(D)} y={84} textAnchor="middle" fontSize="8" fill="#222">
          {D}°
        </text>
      ))}
      <text x={W - 4} y={94} textAnchor="end" fontSize="7" fill="#555">
        deviation from the straight-through direction
      </text>
    </svg>
  );
}

/** A pin's place on the sheet. */
export const pinPoint = (v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', t: PinsTrace, id: PinId): PinsPoint | null => (id === 'p1' || id === 'p2' ? (t[id] !== null ? pinsIncident(v, task, t.i, t[id]!) : null) : t[id]);
