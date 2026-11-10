import { GEO_TOOL_LABEL, SHEET_H, SHEET_W, SQUARE_CM, dist, geoHeight, gridRef6, polyLength, type GeoMapsState, type GeoRect, type GeoTool, type P } from '@aischool/shared';
import { Check, Circle, Compass, Crosshair, Eraser, Grid3x3, Hand, MapPin, Minus, Pencil, Plus, Ruler, Scan, Spline, Undo2, Waypoints, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Geo } from './actions';
import { BaseMap, GridLines, Margin, flipY } from './base-map';

/**
 * The map on the desk: a zoomable, pannable sheet of paper with real
 * instruments on it. Tap places, drag moves the map, two fingers or the wheel
 * zoom. The ruler and the protractor show graduations, never a read-out: the
 * student reads them. Everything placed goes into the state through `g`.
 */

const VIEW = { x: -0.9, y: -0.6, w: 21.8, h: 20.3 };
const ASPECT = VIEW.h / VIEW.w;
const TOOL_ICON: Record<GeoTool, LucideIcon> = { hand: Hand, ruler: Ruler, string: Spline, dividers: Waypoints, protractor: Compass, romer: Scan, squares: Grid3x3, pin: MapPin, strip: Crosshair, pencil: Pencil };
const PENCIL = '#37474f';
const THREAD = '#d81b60';

const svgP = (p: P): [number, number] => [p[0], flipY(p[1])];
const pathOf = (pts: readonly P[], close = false) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${flipY(p[1])}`).join('') + (close ? 'Z' : '');
const deg = (a: P, b: P) => (Math.atan2(flipY(b[1]) - flipY(a[1]), b[0] - a[0]) * 180) / Math.PI;

/** The 30 cm ruler lying with its zero on `a`, turned towards `b`: graduations only. */
function RulerOverlay({ a, b }: { a: P; b: P }) {
  const ticks = useMemo(() => {
    const t: React.ReactNode[] = [];
    for (let i = 0; i <= 250; i++) {
      const x = i / 10;
      const major = i % 10 === 0;
      const mid = i % 5 === 0;
      t.push(<line key={i} x1={x} x2={x} y1={0} y2={major ? 0.34 : mid ? 0.25 : 0.15} stroke="#111" strokeWidth={major ? 0.012 : 0.007} />);
      if (major)
        t.push(
          <text key={`t${i}`} x={x} y={0.55} textAnchor="middle" fontSize={0.2} fontFamily="sans-serif" fill="#111">
            {i / 10}
          </text>,
        );
    }
    return t;
  }, []);
  const [x, y] = svgP(a);
  return (
    <g transform={`translate(${x} ${y}) rotate(${deg(a, b)})`} pointerEvents="none" data-ruler>
      <rect x={-0.3} y={0} width={25.6} height={0.72} fill="#f6e7a5" fillOpacity={0.72} stroke="#8d7a2c" strokeWidth={0.012} />
      {ticks}
    </g>
  );
}

/** The circular protractor, 0° on grid north, clockwise. */
function ProtractorOverlay({ c, t }: { c: P; t: P }) {
  const R = 3.3;
  const marks = useMemo(() => {
    const o: React.ReactNode[] = [];
    for (let d = 0; d < 360; d++) {
      const a = (d * Math.PI) / 180;
      const len = d % 10 === 0 ? 0.3 : d % 5 === 0 ? 0.2 : 0.12;
      o.push(<line key={d} x1={Math.sin(a) * R} y1={-Math.cos(a) * R} x2={Math.sin(a) * (R - len)} y2={-Math.cos(a) * (R - len)} stroke="#0d47a1" strokeWidth={d % 10 ? 0.006 : 0.012} />);
      if (d % 10 === 0)
        o.push(
          <text key={`t${d}`} x={Math.sin(a) * (R - 0.48)} y={-Math.cos(a) * (R - 0.48) + 0.06} textAnchor="middle" fontSize={0.17} fill="#0d47a1" fontFamily="sans-serif">
            {String(d).padStart(3, '0')}
          </text>,
        );
    }
    return o;
  }, []);
  const [x, y] = svgP(c);
  const a = Math.atan2(t[0] - c[0], t[1] - c[1]);
  const end = Math.max(R + 0.5, dist(c, t));
  return (
    <g pointerEvents="none" data-protractor>
      <g transform={`translate(${x} ${y})`}>
        <circle r={R} fill="#bbdefb" fillOpacity={0.32} stroke="#0d47a1" strokeWidth={0.02} />
        {marks}
        <line x1={0} y1={-R - 0.3} x2={0} y2={R + 0.3} stroke={PENCIL} strokeWidth={0.02} />
        <line x1={-0.15} x2={0.15} y1={0} y2={0} stroke="#0d47a1" strokeWidth={0.02} />
        <line x1={0} y1={0} x2={Math.sin(a) * end} y2={-Math.cos(a) * end} stroke={PENCIL} strokeWidth={0.025} />
      </g>
    </g>
  );
}

function RomerOverlay({ p }: { p: P }) {
  const ex = Math.floor(p[0] / SQUARE_CM) * SQUARE_CM;
  const ny = Math.floor(p[1] / SQUARE_CM) * SQUARE_CM;
  const out: React.ReactNode[] = [];
  for (let i = 0; i <= 10; i++) {
    const q = (i / 10) * SQUARE_CM;
    out.push(<line key={`a${i}`} x1={ex + q} x2={ex + q} y1={flipY(ny)} y2={flipY(ny + SQUARE_CM)} stroke="#6a1b9a" strokeWidth={i === 5 ? 0.012 : 0.006} />);
    out.push(<line key={`b${i}`} y1={flipY(ny + q)} y2={flipY(ny + q)} x1={ex} x2={ex + SQUARE_CM} stroke="#6a1b9a" strokeWidth={i === 5 ? 0.012 : 0.006} />);
    if (i < 10)
      out.push(
        <text key={`c${i}`} x={ex + q + 0.1} y={flipY(ny) + 0.14} fontSize={0.12} textAnchor="middle" fill="#6a1b9a">
          {i}
        </text>,
        <text key={`d${i}`} x={ex - 0.08} y={flipY(ny + q) - 0.06} fontSize={0.12} textAnchor="middle" fill="#6a1b9a">
          {i}
        </text>,
      );
  }
  return (
    <g pointerEvents="none" data-romer>
      <rect x={ex} y={flipY(ny + SQUARE_CM)} width={SQUARE_CM} height={SQUARE_CM} fill="#ce93d8" fillOpacity={0.1} />
      {out}
    </g>
  );
}

function Rect({ r }: { r: GeoRect }) {
  return (
    <g pointerEvents="none">
      <rect x={r.x} y={flipY(r.y + r.h)} width={r.w} height={r.h} fill="none" stroke="#d32f2f" strokeWidth={0.05} strokeDasharray="0.25 0.15" />
      <text x={r.x + 0.1} y={flipY(r.y + r.h) + 0.32} fontSize={0.26} fontWeight={700} fill="#b71c1c" stroke="#fff" strokeWidth={0.05} paintOrder="stroke" fontFamily="sans-serif">
        {r.label}
      </text>
    </g>
  );
}
const Letter = ({ id, p }: { id: string; p: P }) => (
  <g pointerEvents="none">
    <circle cx={p[0]} cy={flipY(p[1])} r={0.1} fill="none" stroke="#b71c1c" strokeWidth={0.03} />
    <circle cx={p[0]} cy={flipY(p[1])} r={0.015} fill="#b71c1c" />
    <text x={p[0] + 0.14} y={flipY(p[1]) - 0.14} fontSize={0.34} fontWeight={700} fill="#b71c1c" stroke="#fff" strokeWidth={0.06} paintOrder="stroke" fontFamily="sans-serif">
      {id}
    </text>
  </g>
);

export interface MapDrawingProps {
  g: Geo;
  s: GeoMapsState;
}
/** The work on the map: every instrument and mark recorded so far. */
export function MapWork({ g, s, live }: MapDrawingProps & { live?: { tool: GeoTool; pending: P | null } }) {
  const v = g.v;
  const lastRuler = s.rulers[s.rulers.length - 1];
  const lastProt = s.protractors[s.protractors.length - 1];
  const showRuler = live ? live.tool === 'ruler' : true;
  const showProt = live ? live.tool === 'protractor' : true;
  return (
    <g>
      {Object.entries(s.squares).map(([k, m]) => {
        const [e, n] = k.split(',').map(Number) as [number, number];
        return <rect key={k} x={e * SQUARE_CM} y={flipY((n + 1) * SQUARE_CM)} width={SQUARE_CM} height={SQUARE_CM} fill={m === 'F' ? '#1565c0' : '#ef6c00'} fillOpacity={m === 'F' ? 0.3 : 0.22} data-square={k} data-mark={m} pointerEvents="none" />;
      })}
      {v.rects.map((r) => (
        <Rect key={r.id} r={r} />
      ))}
      {v.section && <path d={pathOf(v.section)} stroke="#b71c1c" strokeWidth={0.03} strokeDasharray="0.2 0.1" pointerEvents="none" />}
      {Object.entries(v.marks).map(([k, p]) => (
        <Letter key={k} id={k} p={p} />
      ))}
      {Object.entries(s.lines)
        .filter(([k]) => k !== 'copy')
        .map(([k, pts]) => {
          const closed = v.pencilKinds.find((x) => x.id === k)?.closed;
          return <path key={k} d={pathOf(pts, closed)} fill={closed ? '#7b1fa2' : 'none'} fillOpacity={0.12} stroke="#7b1fa2" strokeWidth={0.05} pointerEvents="none" />;
        })}
      {s.rulers.map((r, i) => (
        <line key={i} x1={r.a[0]} y1={flipY(r.a[1])} x2={r.b[0]} y2={flipY(r.b[1])} stroke={PENCIL} strokeWidth={0.02} pointerEvents="none" />
      ))}
      {s.protractors.map((q, i) => (
        <line key={i} x1={q.c[0]} y1={flipY(q.c[1])} x2={q.t[0]} y2={flipY(q.t[1])} stroke={PENCIL} strokeWidth={0.02} pointerEvents="none" />
      ))}
      {s.runs.map((r, i) => (
        <g key={i} pointerEvents="none">
          <path d={pathOf(r.pts)} fill="none" stroke={THREAD} strokeWidth={0.05} strokeLinejoin="round" />
          {r.pts.map((p, k) => (
            <circle key={k} cx={p[0]} cy={flipY(p[1])} r={r.tool === 'DIVIDERS' ? 0.07 : 0.035} fill={THREAD} />
          ))}
        </g>
      ))}
      {s.ticks.map((t, i) =>
        v.section ? (
          <g key={i} pointerEvents="none">
            {(() => {
              const [a, b] = v.section;
              const L = dist(a, b);
              const q: P = [a[0] + ((b[0] - a[0]) * t.d) / L, a[1] + ((b[1] - a[1]) * t.d) / L];
              return (
                <>
                  <circle cx={q[0]} cy={flipY(q[1])} r={0.06} fill="#2e7d32" />
                  <text x={q[0]} y={flipY(q[1]) - 0.12} fontSize={0.16} textAnchor="middle" fill="#1b5e20" stroke="#fff" strokeWidth={0.03} paintOrder="stroke">
                    {t.h}
                  </text>
                </>
              );
            })()}
          </g>
        ) : null,
      )}
      {s.pins.map((pin, i) =>
        pin.k === 'romer' ? null : (
          <g key={i} pointerEvents="none" data-pin={pin.k}>
            <circle cx={pin.p[0]} cy={flipY(pin.p[1])} r={0.11} fill={v.pinKinds.find((x) => x.k === pin.k)?.colour ?? '#c62828'} stroke="#fff" strokeWidth={0.025} />
          </g>
        ),
      )}
      {s.pins
        .filter((p) => p.k === 'romer')
        .slice(-3)
        .map((p, i) => (
          <RomerOverlay key={i} p={p.p} />
        ))}
      {showRuler && lastRuler && <RulerOverlay a={lastRuler.a} b={lastRuler.b} />}
      {showProt && lastProt && <ProtractorOverlay c={lastProt.c} t={lastProt.t} />}
      {live?.pending && <circle cx={live.pending[0]} cy={flipY(live.pending[1])} r={0.12} fill="none" stroke="#ff6f00" strokeWidth={0.04} />}
    </g>
  );
}

export function MapBench({ g, s, readOnly, tool: toolProp, assist, compact }: MapDrawingProps & { readOnly: boolean; tool?: GeoTool; assist?: boolean; compact?: boolean }) {
  const v = g.v;
  const sheet = v.sheet!;
  const [tool, setTool] = useState<GeoTool>(toolProp ?? v.def.tools[1] ?? v.def.tools[0] ?? 'hand');
  useEffect(() => {
    if (toolProp) setTool(toolProp);
  }, [toolProp]);
  const [view, setView] = useState({ x: VIEW.x, y: VIEW.y, w: VIEW.w });
  const [pending, setPending] = useState<P | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [span, setSpan] = useState(0.5);
  const [pinKind, setPinKind] = useState(v.pinKinds[0]?.k ?? '');
  const [lineId, setLineId] = useState(v.pencilKinds[0]?.id ?? 'pencil');
  const [tickValue, setTickValue] = useState(String(sheet.interval * Math.round(geoHeight(sheet, ...(v.section?.[0] ?? [0, 0] as P)) / sheet.interval)));
  const [hover, setHover] = useState<P | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number; moved: boolean; grab: 'a' | 'b' | 'c' | 't' | null } | null>(null);
  const touches = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ d: number; w: number } | null>(null);

  const toPaper = (cx: number, cy: number): P => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const q = new DOMPoint(cx, cy).matrixTransform(m);
    return [q.x, SHEET_H - q.y];
  };
  const clampView = (x: number, y: number, w: number) => {
    const W = Math.min(VIEW.w, Math.max(2.2, w));
    const h = W * ASPECT;
    return { x: Math.min(VIEW.x + VIEW.w - W, Math.max(VIEW.x, x)), y: Math.min(VIEW.y + VIEW.h - h, Math.max(VIEW.y, y)), w: W };
  };
  const zoomAt = (factor: number, c?: P) =>
    setView((o) => {
      const w = Math.min(VIEW.w, Math.max(2.2, o.w * factor));
      const fx = c ? (c[0] - o.x) / o.w : 0.5;
      const fy = c ? (flipY(c[1]) - o.y) / (o.w * ASPECT) : 0.5;
      return clampView(o.x + (o.w - w) * fx, o.y + (o.w - w) * ASPECT * fy, w);
    });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY > 0 ? 1.2 : 1 / 1.2, toPaper(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __geoMap: {
        toClient: (p: P) => {
          const c = svg.current!.getScreenCTM()!;
          const q = new DOMPoint(p[0], SHEET_H - p[1]).matrixTransform(c);
          return [q.x, q.y];
        },
        setView,
        tool,
      },
    });
  }

  const tap = (p: P) => {
    if (readOnly) return;
    switch (tool) {
      case 'ruler':
        if (pending) {
          g.addRuler(pending, p);
          setPending(null);
        } else setPending(p);
        return;
      case 'protractor':
        if (pending) {
          g.addProtractor(pending, p);
          setPending(null);
        } else setPending(p);
        return;
      case 'string':
      case 'dividers':
        if (!runOpen) {
          g.startRun(tool === 'string' ? 'STRING' : 'DIVIDERS', p);
          setRunOpen(true);
        } else if (tool === 'string') g.extendRun(p);
        else {
          const run = s.runs[s.runs.length - 1]!;
          const last = run.pts[run.pts.length - 1]!;
          const d = dist(last, p) || 1;
          g.extendRun([last[0] + ((p[0] - last[0]) * span) / d, last[1] + ((p[1] - last[1]) * span) / d]);
        }
        return;
      case 'romer':
        g.addPin('romer', p);
        return;
      case 'squares': {
        const e = Math.floor(p[0] / SQUARE_CM);
        const n = Math.floor(p[1] / SQUARE_CM);
        if (p[0] >= 0 && p[1] >= 0 && p[0] < SHEET_W && p[1] < SHEET_H) g.toggleSquare(`${e},${n}`);
        return;
      }
      case 'pin': {
        const k = pinKind || 'pin';
        const near = s.pins.findIndex((x) => x.k === k && dist(x.p, p) < 0.16);
        if (near >= 0) g.removePin(near);
        else g.addPin(k, p);
        return;
      }
      case 'strip': {
        if (!v.section) return;
        const [a, b] = v.section;
        const L = dist(a, b);
        const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L);
        const q: P = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const h = Number(tickValue);
        if (dist(p, q) > 0.7 || t < -0.02 || t > 1.02 || !Number.isFinite(h)) return;
        g.addTick(Math.max(0, t * L), h);
        return;
      }
      case 'pencil':
        g.addVertex(lineId, p);
        return;
      default:
    }
  };
  const down = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') touches.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()] as [[number, number], [number, number]];
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), w: view.w };
      drag.current = null;
      return;
    }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = toPaper(e.clientX, e.clientY);
    const near = 0.3 * Math.max(1, view.w / 12);
    const lr = s.rulers[s.rulers.length - 1];
    const lp = s.protractors[s.protractors.length - 1];
    let grab: 'a' | 'b' | 'c' | 't' | null = null;
    if (!readOnly && tool === 'ruler' && lr) grab = dist(p, lr.b) < near ? 'b' : dist(p, lr.a) < near ? 'a' : null;
    if (!readOnly && tool === 'protractor' && lp) grab = dist(p, lp.t) < near ? 't' : dist(p, lp.c) < near ? 'c' : null;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, grab };
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && touches.current.size === 2) {
      const [a, b] = [...touches.current.values()] as [[number, number], [number, number]];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const w = pinch.current.w * (pinch.current.d / (d || 1));
      setView((o) => clampView(o.x + (o.w - w) / 2, o.y + ((o.w - w) * ASPECT) / 2, w));
      return;
    }
    if (assist && e.pointerType !== 'touch') setHover(toPaper(e.clientX, e.clientY));
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.hypot(dx, dy) > 5) d.moved = true;
    if (!d.moved) return;
    const p = toPaper(e.clientX, e.clientY);
    if (d.grab) {
      const lr = s.rulers[s.rulers.length - 1];
      const lp = s.protractors[s.protractors.length - 1];
      if (d.grab === 'a' && lr) g.moveLastRuler(p, lr.b);
      if (d.grab === 'b' && lr) g.moveLastRuler(lr.a, p);
      if (d.grab === 'c' && lp) g.moveLastProtractor(p, lp.t);
      if (d.grab === 't' && lp) g.moveLastProtractor(lp.c, p);
      return;
    }
    const rect = svg.current!.getBoundingClientRect();
    const k = view.w / rect.width;
    setView(clampView(d.vx - dx * k, d.vy - dy * k, view.w));
  };
  const up = (e: RPointerEvent<SVGSVGElement>) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (d && d.id === e.pointerId && !d.moved) tap(toPaper(e.clientX, e.clientY));
  };
  const undoTool = () => {
    if (tool === 'ruler') g.undo('rulers');
    else if (tool === 'protractor') g.undo('protractors');
    else if (tool === 'string' || tool === 'dividers') {
      g.undo('runs');
      setRunOpen(false);
    } else if (tool === 'strip') g.removeTick(s.ticks.length - 1);
    else if (tool === 'pencil') g.undoVertex(lineId);
    else if (tool === 'romer' || tool === 'pin') {
      const i = s.pins.map((p) => p.k).lastIndexOf(tool === 'romer' ? 'romer' : pinKind || 'pin');
      if (i >= 0) g.removePin(i);
    }
  };
  const tools = v.def.tools;
  const hint: Partial<Record<GeoTool, string>> = {
    ruler: pending ? 'Now tap the other end. Then zoom in and read the ruler where it meets the point.' : 'Tap the point to put zero on, then tap where to lay it. Drag its ends to adjust.',
    protractor: pending ? 'Now tap the place you are measuring to.' : 'Tap the point you are measuring FROM: the protractor sits with 0° on grid north.',
    string: runOpen ? 'Tap along the route at every bend, then Finish.' : 'Tap the start of the route to lay the thread.',
    dividers: runOpen ? 'Each tap walks the dividers one span along. Count the steps.' : 'Tap the start of the route.',
    romer: 'Tap a feature: the tenths lines appear on its grid square.',
    squares: 'Tap a square once for complete, again for part, again to clear.',
    pin: 'Tap to pin; tap a pin to remove it.',
    strip: 'Set the contour value, then tap where the line crosses that contour.',
    pencil: 'Tap along the feature to add vertices.',
    hand: 'Drag to move the map; wheel or pinch to zoom.',
  };
  const threadLen = s.runs.reduce((t, r) => t + polyLength(r.pts), 0);

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Map tools">
          {tools.map((t) => {
            const I = TOOL_ICON[t];
            return (
              <Button
                key={t}
                size="sm"
                variant={tool === t ? 'brand' : 'outline'}
                className="h-8 px-2"
                data-tool={t}
                aria-pressed={tool === t}
                onClick={() => {
                  setTool(t);
                  setPending(null);
                  if (t !== 'string' && t !== 'dividers') setRunOpen(false);
                }}
              >
                <I /> {GEO_TOOL_LABEL[t]}
              </Button>
            );
          })}
          {tool !== 'hand' && tool !== 'squares' && (
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={undoTool}>
              <Undo2 /> Undo
            </Button>
          )}
          {(tool === 'string' || tool === 'dividers') && runOpen && (
            <Button size="sm" variant="secondary" className="h-8 px-2" onClick={() => setRunOpen(false)}>
              <Check /> Finish
            </Button>
          )}
        </div>
      )}
      {!readOnly && tool === 'pin' && v.pinKinds.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {v.pinKinds.map((k) => (
            <button key={k.k} type="button" data-pinkind={k.k} aria-pressed={pinKind === k.k} onClick={() => setPinKind(k.k)} className={cn('rounded-full border px-2.5 py-0.5 text-[12px]', pinKind === k.k ? 'border-brand bg-brand/10 font-medium' : 'border-border')}>
              <Circle className="mr-1 inline size-2.5" style={{ color: k.colour, fill: k.colour }} aria-hidden />
              {k.label} ({s.pins.filter((p) => p.k === k.k).length})
            </button>
          ))}
        </div>
      )}
      {!readOnly && tool === 'pencil' && v.pencilKinds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {v.pencilKinds.map((k) => (
            <button key={k.id} type="button" data-pencil={k.id} aria-pressed={lineId === k.id} onClick={() => setLineId(k.id)} className={cn('rounded-full border px-2.5 py-0.5 text-[12px]', lineId === k.id ? 'border-brand bg-brand/10 font-medium' : 'border-border')}>
              {k.label} ({(s.lines[k.id] ?? []).length} points)
            </button>
          ))}
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[12px]" onClick={() => g.clearLine(lineId)}>
            <Eraser /> Clear
          </Button>
        </div>
      )}
      {!readOnly && tool === 'dividers' && (
        <label className="flex items-center gap-2 text-[12.5px]">
          Span of the dividers
          <select value={span} onChange={(e) => setSpan(Number(e.target.value))} aria-label="Span of the dividers" className="h-7 rounded border border-input bg-card px-1 text-base sm:text-[12.5px]">
            {[0.2, 0.3, 0.5, 1].map((x) => (
              <option key={x} value={x}>
                {x} cm
              </option>
            ))}
          </select>
        </label>
      )}
      {!readOnly && tool === 'strip' && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <span>Value of the next contour</span>
          <Button size="icon" variant="outline" className="size-7" aria-label={`Down ${sheet.interval} m`} onClick={() => setTickValue(String(Number(tickValue) - sheet.interval))}>
            <Minus />
          </Button>
          <Input id="geo-tick" value={tickValue} onChange={(e) => setTickValue(e.target.value)} inputMode="numeric" aria-label="Value of the next contour" className="h-7 w-20 text-right tabular" />
          <Button size="icon" variant="outline" className="size-7" aria-label={`Up ${sheet.interval} m`} onClick={() => setTickValue(String(Number(tickValue) + sheet.interval))}>
            <Plus />
          </Button>
          <span className="text-muted-foreground">m</span>
        </div>
      )}
      <div className="relative overflow-hidden rounded-xl border border-[#c9bfa3] bg-[#7a5a3c] p-1 shadow-inner sm:p-2">
        <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.w * ASPECT}`} className={cn('w-full touch-none select-none rounded-md bg-[#fffdf5] shadow-md', compact ? 'max-h-[56dvh]' : 'max-h-[74dvh]')} role="application" aria-label={`Topographical map of ${sheet.name}`} data-geomap onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setHover(null)}>
          <BaseMap s={sheet} />
          <GridLines s={sheet} />
          <Margin v={v} />
          <MapWork g={g} s={s} live={{ tool, pending }} />
        </svg>
        <div className="absolute right-3 top-3 flex flex-col gap-1 sm:right-4 sm:top-4">
          <Button size="icon" variant="secondary" className="size-8 shadow" aria-label="Zoom in" onClick={() => zoomAt(1 / 1.5)}>
            <Plus />
          </Button>
          <Button size="icon" variant="secondary" className="size-8 shadow" aria-label="Zoom out" onClick={() => zoomAt(1.5)}>
            <Minus />
          </Button>
          <Button size="icon" variant="secondary" className="size-8 shadow" aria-label="Whole sheet" onClick={() => setView({ x: VIEW.x, y: VIEW.y, w: VIEW.w })}>
            <Scan />
          </Button>
        </div>
        {assist && hover && hover[0] >= 0 && hover[1] >= 0 && hover[0] <= SHEET_W && hover[1] <= SHEET_H && (
          <div className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-2 py-1 text-[12px] text-white tabular">
            {Math.round(geoHeight(sheet, hover[0], hover[1]))} m · {gridRef6(sheet, hover)}
          </div>
        )}
      </div>
      {!readOnly && <p className="text-[12px] text-muted-foreground">{hint[tool]}</p>}
      {(tools.includes('string') || tools.includes('dividers')) && s.runs.length > 0 && <ThreadRule cm={threadLen} runs={s.runs.length} />}
      {tools.includes('strip') && v.section && <StripRule g={g} s={s} readOnly={readOnly} />}
    </div>
  );
}

/** The thread straightened against a long ruler: read it yourself. */
function ThreadRule({ cm, runs }: { cm: number; runs: number }) {
  const px = 26;
  const total = Math.ceil(cm + 2);
  const W = (total + 1) * px;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2">
      <p className="mb-1 text-[12px] font-medium">Your thread, straightened against the ruler {runs > 1 ? `(${runs} pieces end to end)` : ''}</p>
      <div className="overflow-x-auto">
        <svg width={W} height={46} role="img" aria-label="Thread against a ruler" data-threadrule={cm.toFixed(2)}>
          <rect x={0} y={16} width={W} height={28} fill="#f6e7a5" stroke="#8d7a2c" />
          <line x1={px / 2} x2={px / 2 + cm * px} y1={8} y2={8} stroke={THREAD} strokeWidth={3} strokeLinecap="round" />
          {Array.from({ length: total * 10 + 1 }, (_, i) => (
            <line key={i} x1={px / 2 + (i / 10) * px} x2={px / 2 + (i / 10) * px} y1={16} y2={i % 10 === 0 ? 28 : i % 5 === 0 ? 24 : 20} stroke="#111" strokeWidth={i % 10 === 0 ? 1 : 0.5} />
          ))}
          {Array.from({ length: total + 1 }, (_, i) => (
            <text key={i} x={px / 2 + i * px} y={40} fontSize={10} textAnchor="middle">
              {i}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

function StripRule({ g, s, readOnly }: { g: Geo; s: GeoMapsState; readOnly: boolean }) {
  const [a, b] = g.v.section!;
  const L = dist(a, b);
  const W = 640;
  const k = W / (L + 0.6);
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2">
      <p className="mb-1 text-[12px] font-medium">The paper strip: {s.ticks.length} ticks</p>
      <div className="overflow-x-auto">
        <svg width={W} height={60} role="img" aria-label="Paper strip with ticks">
          <rect x={0} y={30} width={W} height={26} fill="#fff" stroke="#b9b09a" />
          <text x={0.3 * k} y={52} fontSize={11} fontWeight={700} fill="#b71c1c">
            A
          </text>
          <text x={(L + 0.3) * k - 8} y={52} fontSize={11} fontWeight={700} fill="#b71c1c">
            B
          </text>
          {s.ticks.map((t, i) => (
            <g key={i} transform={`translate(${(t.d + 0.3) * k} 0)`}>
              <line y1={30} y2={40} stroke="#1b5e20" strokeWidth={1.5} />
              <text transform="translate(3 28) rotate(-60)" fontSize={10} fill="#1b5e20">
                {t.h}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {!readOnly && s.ticks.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {s.ticks.map((t, i) => (
            <button key={i} type="button" onClick={() => g.removeTick(i)} className="rounded border border-border px-1.5 text-[11px] tabular hover:bg-muted" title="Remove this tick">
              {t.h} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
