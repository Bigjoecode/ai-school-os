import { BUS_LIMITS, type BusFix, type PingResult } from '@aischool/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';

/**
 * Shares the phone's position for one running trip, and only then:
 *  - watches the GPS (navigator.geolocation.watchPosition),
 *  - every ~12 s queues the newest fix (a fix up to 2 minutes old is re-sent
 *    as "still here", so a bus stuck in traffic doesn't look lost),
 *  - uploads the queue in order; while offline the queue is kept (also in
 *    this phone's storage, so a reload doesn't lose it) and sent on reconnect,
 *  - keeps the screen awake with the Wake Lock API where the browser has it.
 * A web page can't share while the screen is off or the browser is in the
 * background: the page tells the driver to keep it open.
 */

export type GpsState = 'off' | 'asking' | 'sharing' | 'waiting' | 'denied' | 'unavailable' | 'unsupported';
export type WakeState = 'on' | 'off' | 'unsupported';

const queueKey = (tripId: string) => `ais:bus-queue:${tripId}`;
const STILL_HERE_MS = 2 * 60_000;

function loadQueue(tripId: string): BusFix[] {
  try {
    const raw = localStorage.getItem(queueKey(tripId));
    return raw ? (JSON.parse(raw) as BusFix[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(tripId: string, q: BusFix[]) {
  try {
    if (q.length) localStorage.setItem(queueKey(tripId), JSON.stringify(q));
    else localStorage.removeItem(queueKey(tripId));
  } catch {
    /* storage full or blocked: the in-memory queue still works */
  }
}

/** Over the cap: drop every other one of the oldest half, keeping the newest exact. */
function thin(q: BusFix[]): BusFix[] {
  if (q.length <= BUS_LIMITS.maxQueued) return q;
  const half = Math.floor(q.length / 2);
  return [...q.slice(0, half).filter((_, i) => i % 2 === 1), ...q.slice(half)];
}

export function useLocationSharing(tripId: string | null, onEnded: () => void) {
  const [gps, setGps] = useState<GpsState>('off');
  const [wake, setWake] = useState<WakeState>('off');
  const [lastFix, setLastFix] = useState<GeolocationPosition | null>(null);
  const [queued, setQueued] = useState(0);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const latest = useRef<GeolocationPosition | null>(null);
  const lastQueuedAt = useRef(0);
  const queue = useRef<BusFix[]>([]);
  const sending = useRef(false);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;

  const flush = useCallback(async () => {
    if (!tripId || sending.current || !queue.current.length) return;
    sending.current = true;
    try {
      while (queue.current.length) {
        const batch = queue.current.slice(0, BUS_LIMITS.maxBatch);
        try {
          await api.post<PingResult>(`/bus/trips/${tripId}/pings`, { fixes: batch });
        } catch (e) {
          if (e instanceof ApiError && [403, 404, 409].includes(e.status)) {
            // The trip ended (or isn't ours): stop sharing for good.
            queue.current = [];
            saveQueue(tripId, []);
            setQueued(0);
            endedRef.current();
            return;
          }
          if (e instanceof ApiError && e.status === 400) {
            // A batch the server can't read would block the queue forever: drop it.
            queue.current = queue.current.slice(batch.length);
            continue;
          }
          // Offline, timeout or rate limit: keep everything and try again later.
          setOnline(navigator.onLine !== false);
          return;
        }
        queue.current = queue.current.slice(batch.length);
        saveQueue(tripId, queue.current);
        setQueued(queue.current.length);
        setLastSentAt(Date.now());
        setOnline(true);
      }
    } finally {
      sending.current = false;
    }
  }, [tripId]);

  // Watch the GPS for as long as a trip runs.
  useEffect(() => {
    if (!tripId) {
      setGps('off');
      return;
    }
    if (!('geolocation' in navigator)) {
      setGps('unsupported');
      return;
    }
    queue.current = loadQueue(tripId);
    lastQueuedAt.current = queue.current.at(-1)?.at ?? 0;
    setQueued(queue.current.length);
    setGps('asking');
    const id = navigator.geolocation.watchPosition(
      (p) => {
        latest.current = p;
        setLastFix(p);
        setGps('sharing');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGps('denied');
        else if (err.code === err.POSITION_UNAVAILABLE) setGps('unavailable');
        else setGps((g) => (g === 'sharing' ? 'sharing' : 'waiting'));
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tripId]);

  // Every ~12 s: queue the newest fix and upload.
  useEffect(() => {
    if (!tripId) return;
    const tick = () => {
      const p = latest.current;
      const now = Date.now();
      if (p && now - p.timestamp < STILL_HERE_MS) {
        // A fresh fix keeps its own time; an older one (bus standing still) is re-sent as "still here, now".
        const at = Math.round(now - p.timestamp < BUS_LIMITS.sendEveryMs ? p.timestamp : now);
        if (at - lastQueuedAt.current >= BUS_LIMITS.minFixGapMs) {
          const c = p.coords;
          queue.current = thin([
            ...queue.current,
            {
              lat: c.latitude,
              lng: c.longitude,
              accuracy: Math.min(100_000, Math.max(0, c.accuracy ?? 0)),
              speed: c.speed != null && Number.isFinite(c.speed) && c.speed >= 0 ? Math.min(200, c.speed) : null,
              heading: c.heading != null && Number.isFinite(c.heading) && c.heading >= 0 ? c.heading % 360 : null,
              at,
            },
          ]);
          lastQueuedAt.current = at;
          saveQueue(tripId, queue.current);
          setQueued(queue.current.length);
        }
      }
      void flush();
    };
    const first = window.setTimeout(tick, 1_500);
    const every = window.setInterval(tick, BUS_LIMITS.sendEveryMs);
    const back = () => {
      setOnline(true);
      void flush();
    };
    const gone = () => setOnline(false);
    window.addEventListener('online', back);
    window.addEventListener('offline', gone);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      window.removeEventListener('online', back);
      window.removeEventListener('offline', gone);
    };
  }, [tripId, flush]);

  // Keep the screen on while sharing (re-taken when the page comes back to the front).
  useEffect(() => {
    if (!tripId) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void>; addEventListener: (e: 'release', f: () => void) => void }> } };
    if (!nav.wakeLock) {
      setWake('unsupported');
      return;
    }
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const take = async () => {
      if (document.visibilityState !== 'visible' || lock) return;
      try {
        const l = await nav.wakeLock!.request('screen');
        if (cancelled) {
          void l.release();
          return;
        }
        lock = l;
        setWake('on');
        l.addEventListener('release', () => {
          lock = null;
          setWake('off');
        });
      } catch {
        setWake('off');
      }
    };
    void take();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void take();
        void flush();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
      setWake('off');
    };
  }, [tripId, flush]);

  return { gps, wake, lastFix, queued, lastSentAt, online, flush };
}
