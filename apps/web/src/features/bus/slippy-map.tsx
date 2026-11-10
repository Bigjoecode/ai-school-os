import { Bus, LocateFixed, Minus, Plus } from 'lucide-react';
import { type KeyboardEvent, type PointerEvent, type WheelEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A small dependency-free slippy map: Web Mercator tile maths, <img> tiles,
 * drag / wheel / pinch / keyboard pan and zoom, a bus marker and stop pins.
 *
 * Tiles come from VITE_MAP_TILE_URL (default: OpenStreetMap's standard tiles,
 * whose usage policy suits light use only; a busy production site should use
 * a paid or self-hosted tile provider). The attribution the provider requires
 * is always shown (VITE_MAP_ATTRIBUTION / VITE_MAP_ATTRIBUTION_URL).
 * Tile URLs carry tile numbers, never the app's own coordinates or ids.
 */

const TILE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '© OpenStreetMap contributors';
const ATTRIBUTION_URL = import.meta.env.VITE_MAP_ATTRIBUTION_URL || 'https://www.openstreetmap.org/copyright';
const SUBDOMAINS = ['a', 'b', 'c'];

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface MapMarker extends MapPoint {
  id: string;
  kind: 'bus' | 'stop' | 'stop-mine';
  label: string;
  /** Stop order number shown in the pin. */
  n?: number;
  heading?: number | null;
  /** Bus not heard from recently: drawn grey. */
  stale?: boolean;
  /** GPS accuracy in metres (bus only): drawn as a faint circle. */
  accuracy?: number | null;
}

/** World pixel coordinates at zoom z (Web Mercator). */
export function project(p: MapPoint, z: number): { x: number; y: number } {
  const size = TILE * 2 ** z;
  const sin = Math.min(0.9999, Math.max(-0.9999, Math.sin((p.lat * Math.PI) / 180)));
  return { x: ((p.lng + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}

export function unproject(x: number, y: number, z: number): MapPoint {
  const size = TILE * 2 ** z;
  const n = Math.PI - (2 * Math.PI * y) / size;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: (x / size) * 360 - 180 };
}

/** The view that shows every point with some padding (one point: street level). */
export function fitView(points: MapPoint[], w: number, h: number, pad = 48): { center: MapPoint; z: number } | null {
  if (!points.length || w <= 0 || h <= 0) return null;
  if (points.length === 1) return { center: points[0]!, z: 15 };
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const sw = { lat: Math.min(...lats), lng: Math.min(...lngs) };
  const ne = { lat: Math.max(...lats), lng: Math.max(...lngs) };
  let z = 16;
  for (; z > MIN_ZOOM; z--) {
    const a = project(sw, z);
    const b = project(ne, z);
    if (Math.abs(b.x - a.x) <= w - pad * 2 && Math.abs(a.y - b.y) <= h - pad * 2) break;
  }
  const a = project(sw, z);
  const b = project(ne, z);
  return { center: unproject((a.x + b.x) / 2, (a.y + b.y) / 2, z), z };
}

function tileUrl(z: number, x: number, y: number): string {
  const n = 2 ** z;
  const wx = ((x % n) + n) % n;
  return TILE_URL.replace('{z}', String(z))
    .replace('{x}', String(wx))
    .replace('{y}', String(y))
    .replace('{s}', SUBDOMAINS[(wx + y) % SUBDOMAINS.length]!)
    .replace('{r}', '');
}

const clampZ = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function SlippyMap({
  markers,
  className,
  label,
  emptyText = 'Nothing to show on the map yet',
}: {
  markers: MapMarker[];
  className?: string;
  /** Accessible name for the map region. */
  label: string;
  emptyText?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<{ center: MapPoint; z: number } | null>(null);
  /** Once the viewer pans or zooms, new positions no longer move the map under them. */
  const [moved, setMoved] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pointsKey = markers.map((m) => `${m.id}:${m.lat.toFixed(5)},${m.lng.toFixed(5)}`).join('|');
  const fit = useCallback(() => fitView(markers, size.w, size.h), [pointsKey, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the markers (the bus moving) until the viewer takes over.
  useEffect(() => {
    if (moved) return;
    const f = fit();
    if (f) setView(f);
  }, [fit, moved]);

  const zoomAt = useCallback(
    (dz: number, at?: { x: number; y: number }) => {
      setView((v) => {
        if (!v) return v;
        const z = clampZ(v.z + dz);
        if (z === v.z) return v;
        const c = project(v.center, v.z);
        // Keep the point under the cursor (or the centre) where it is.
        const ox = at ? at.x - size.w / 2 : 0;
        const oy = at ? at.y - size.h / 2 : 0;
        const k = 2 ** (z - v.z);
        const px = (c.x + ox) * k - ox;
        const py = (c.y + oy) * k - oy;
        return { center: unproject(px, py, z), z };
      });
      setMoved(true);
    },
    [size.w, size.h],
  );

  const panBy = useCallback((dx: number, dy: number) => {
    setView((v) => {
      if (!v) return v;
      const c = project(v.center, v.z);
      const max = TILE * 2 ** v.z;
      return { center: unproject(c.x - dx, Math.min(max, Math.max(0, c.y - dy)), v.z), z: v.z };
    });
    setMoved(true);
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button,a')) return;
    ref.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    pinch.current = null;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = local(e);
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 1) {
      panBy(now.x - prev.x, now.y - prev.y);
      return;
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current == null) pinch.current = d;
      const ratio = d / pinch.current;
      if (ratio > 1.6 || ratio < 0.625) {
        zoomAt(ratio > 1 ? 1 : -1, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        pinch.current = d;
      }
    }
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const wheelAcc = useRef(0);
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    wheelAcc.current += e.deltaY;
    if (Math.abs(wheelAcc.current) < 60) return;
    zoomAt(wheelAcc.current < 0 ? 1 : -1, local(e));
    wheelAcc.current = 0;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 80;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => panBy(step, 0),
      ArrowRight: () => panBy(-step, 0),
      ArrowUp: () => panBy(0, step),
      ArrowDown: () => panBy(0, -step),
      '+': () => zoomAt(1),
      '=': () => zoomAt(1),
      '-': () => zoomAt(-1),
    };
    const run = keys[e.key];
    if (run) {
      e.preventDefault();
      run();
    }
  };

  const tiles = useMemo(() => {
    if (!view || !size.w) return [];
    const c = project(view.center, view.z);
    const left = c.x - size.w / 2;
    const top = c.y - size.h / 2;
    const n = 2 ** view.z;
    const out: { key: string; src: string; x: number; y: number }[] = [];
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.w) / TILE); tx++) {
      for (let ty = Math.max(0, Math.floor(top / TILE)); ty <= Math.min(n - 1, Math.floor((top + size.h) / TILE)); ty++) {
        out.push({ key: `${view.z}/${tx}/${ty}`, src: tileUrl(view.z, tx, ty), x: Math.round(tx * TILE - left), y: Math.round(ty * TILE - top) });
      }
    }
    return out;
  }, [view, size.w, size.h]);

  const place = (p: MapPoint) => {
    if (!view) return { x: -999, y: -999 };
    const c = project(view.center, view.z);
    const q = project(p, view.z);
    return { x: q.x - c.x + size.w / 2, y: q.y - c.y + size.h / 2 };
  };
  const metresPerPx = view ? (156_543.034 * Math.cos((view.center.lat * Math.PI) / 180)) / 2 ** view.z : 1;
  const ordered = [...markers].sort((a, b) => (a.kind === 'bus' ? 1 : 0) - (b.kind === 'bus' ? 1 : 0));

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={(e) => zoomAt(1, local(e))}
      onKeyDown={onKeyDown}
      className={cn('relative isolate h-72 touch-none select-none overflow-hidden rounded-xl border border-border bg-[#e8e4da] outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-[#1e2126]', className)}
    >
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.src}
          alt=""
          width={TILE}
          height={TILE}
          draggable={false}
          referrerPolicy="strict-origin-when-cross-origin"
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
          className="pointer-events-none absolute max-w-none dark:brightness-[0.8] dark:contrast-[1.1]"
          style={{ left: t.x, top: t.y }}
        />
      ))}

      {ordered.map((m) => {
        const p = place(m);
        if (m.kind === 'bus') {
          const r = m.accuracy ? Math.min(400, m.accuracy / metresPerPx) : 0;
          return (
            <div key={m.id} className="pointer-events-none absolute" style={{ left: p.x, top: p.y }}>
              {r > 14 && <span aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/40 bg-brand/10" style={{ width: r * 2, height: r * 2 }} />}
              {m.heading != null && !m.stale && (
                <span aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2" style={{ transform: `translate(-50%, -50%) rotate(${m.heading}deg) translateY(-22px)` }}>
                  <span className="block size-0 border-x-[6px] border-b-[9px] border-x-transparent border-b-brand" />
                </span>
              )}
              <span
                title={m.label}
                className={cn(
                  'absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-white text-white shadow-lg',
                  m.stale ? 'bg-muted-foreground' : 'bg-brand',
                )}
              >
                <Bus className="size-4" aria-hidden />
              </span>
              <span className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap rounded-md bg-card/95 px-1.5 py-0.5 text-[11px] font-semibold shadow-sm">{m.label}</span>
            </div>
          );
        }
        const mine = m.kind === 'stop-mine';
        return (
          <div key={m.id} className="pointer-events-none absolute" style={{ left: p.x, top: p.y }} title={m.label}>
            <span
              className={cn(
                'absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 font-semibold tabular shadow',
                mine ? 'size-7 border-white bg-success text-[11px] text-white' : 'size-5 border-white bg-card text-[10px] text-foreground',
              )}
            >
              {m.n ?? ''}
            </span>
            {mine && <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-md bg-success px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">{m.label}</span>}
          </div>
        );
      })}

      {!markers.length && <p className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-muted-foreground">{emptyText}</p>}

      <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1)} className="grid size-8 place-items-center hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <Plus className="size-4" aria-hidden />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(-1)} className="grid size-8 place-items-center border-t border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <Minus className="size-4" aria-hidden />
        </button>
        {moved && markers.length > 0 && (
          <button type="button" aria-label="Show everything again" title="Show everything again" onClick={() => setMoved(false)} className="grid size-8 place-items-center border-t border-border text-brand hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <LocateFixed className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <a
        href={ATTRIBUTION_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="absolute bottom-0 right-0 rounded-tl-md bg-card/85 px-1.5 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
      >
        {ATTRIBUTION}
      </a>
    </div>
  );
}
