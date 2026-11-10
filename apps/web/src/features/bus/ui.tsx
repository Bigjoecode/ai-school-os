import type { BoardingKind, BusStopPoint, TripDirection } from '@aischool/shared';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { MapMarker } from './slippy-map';

/** Re-renders every few seconds so "12 s ago" stays true. */
export function useNow(everyMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

export function ago(at: string | number | null | undefined, now: number): string {
  if (at == null) return 'never';
  const s = Math.max(0, Math.round((now - (typeof at === 'number' ? at : Date.parse(at))) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

export function clock(at: string | null | undefined): string {
  if (!at) return '';
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export const KIND_LABEL: Record<BoardingKind, string> = { BOARDED: 'Boarded', DROPPED: 'Dropped off', ABSENT: 'Absent' };

export function KindBadge({ kind }: { kind: BoardingKind | null }) {
  if (!kind) return <Badge variant="outline">Waiting</Badge>;
  return <Badge variant={kind === 'BOARDED' ? 'brand' : kind === 'DROPPED' ? 'success' : 'warning'}>{KIND_LABEL[kind]}</Badge>;
}

export const directionWord = (d: TripDirection) => (d === 'MORNING' ? 'Morning pick-up' : 'Afternoon drop-off');

/** Stop pins, numbered in the order the bus visits them; the given stop highlighted. */
export function stopMarkers(stops: Pick<BusStopPoint, 'name' | 'lat' | 'lng'>[], mine?: string): MapMarker[] {
  return stops.flatMap((s, i) =>
    s.lat != null && s.lng != null ? [{ id: `stop:${s.name}`, kind: s.name === mine ? ('stop-mine' as const) : ('stop' as const), label: s.name, n: i + 1, lat: s.lat, lng: s.lng }] : [],
  );
}
