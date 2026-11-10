import { z } from 'zod';

/**
 * Live school bus tracking: a driver (or bus assistant) with the Bus Driver
 * role runs a trip on their own route; the phone shares its position only
 * while the trip is running. Parents see their own child's bus during a trip,
 * and staff with transport.read see every bus on a trip.
 *
 * Coordinates only ever travel in request and response bodies, never in URLs.
 */

export const TRIP_DIRECTIONS = ['MORNING', 'AFTERNOON'] as const;
export type TripDirection = (typeof TRIP_DIRECTIONS)[number];
export const TRIP_DIRECTION_LABEL: Record<TripDirection, string> = {
  MORNING: 'Morning pick-up',
  AFTERNOON: 'Afternoon drop-off',
};

export const BOARDING_KINDS = ['BOARDED', 'DROPPED', 'ABSENT'] as const;
export type BoardingKind = (typeof BOARDING_KINDS)[number];

/** Limits shared by the driver's phone and the server. */
export const BUS_LIMITS = {
  /** The phone sends a fix about this often while a trip runs. */
  sendEveryMs: 12_000,
  /** The server keeps at most one fix per this many ms per trip (extra fixes are dropped, not errors). */
  minFixGapMs: 5_000,
  /** Fixes per upload (an offline queue is sent in chunks of this size). */
  maxBatch: 60,
  /** Fixes the phone keeps while offline; the oldest are thinned out beyond this. */
  maxQueued: 600,
  /** A fix may be at most this far in the future (phone clock drift). */
  futureSkewMs: 2 * 60_000,
  /** Worse than this accuracy (metres): stored and shown, but never used for "near your stop". */
  geofenceMaxAccuracyM: 150,
  /** "The bus is near your stop" radius. */
  nearStopM: 500,
  /** Faster than this between two fixes is a GPS jump and is rejected (m/s, about 160 km/h). */
  maxSpeedMs: 45,
  /** Staff see "no update for N minutes" after this long without a fix. */
  staleAfterMs: 2 * 60_000,
  /** A trip with no fix for this long is ended automatically (the driver forgot to end it). */
  autoEndAfterMs: 3 * 3_600_000,
} as const;

export const busFixSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Metres (68% radius, as the Geolocation API reports it). */
  accuracy: z.number().min(0).max(100_000),
  /** m/s, when the phone knows it. */
  speed: z.number().min(0).max(200).nullish(),
  /** Degrees clockwise from north, when moving. */
  heading: z.number().min(0).max(360).nullish(),
  /** When the phone took the fix (ms since 1970). */
  at: z.number().int().positive(),
});
export type BusFix = z.infer<typeof busFixSchema>;

export const busPingSchema = z.object({
  fixes: z.array(busFixSchema).min(1).max(BUS_LIMITS.maxBatch),
});
export type BusPingInput = z.infer<typeof busPingSchema>;

export const startTripSchema = z.object({
  routeId: z.string().min(1),
  direction: z.enum(TRIP_DIRECTIONS),
});
export type StartTripInput = z.infer<typeof startTripSchema>;

export const boardingSchema = z.object({
  studentId: z.string().min(1),
  kind: z.enum(BOARDING_KINDS),
});
export type BoardingInput = z.infer<typeof boardingSchema>;

/** Admins set where each stop is (by stop name; both or neither). */
export const stopLocationsSchema = z.object({
  stops: z
    .array(
      z
        .object({
          name: z.string().trim().min(1).max(80),
          lat: z.number().min(-90).max(90).nullable(),
          lng: z.number().min(-180).max(180).nullable(),
        })
        .refine((s) => (s.lat == null) === (s.lng == null), { message: 'Give both latitude and longitude, or neither', path: ['lat'] }),
    )
    .min(1)
    .max(40),
});
export type StopLocationsInput = z.infer<typeof stopLocationsSchema>;

export interface BusPosition {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  /** When the phone took the fix (ISO). */
  at: string;
}

export interface BusStopPoint {
  name: string;
  pickup: string;
  dropoff: string;
  lat: number | null;
  lng: number | null;
}

// ------------------------------------------------------------------ driver

export interface DriverRoute {
  id: string;
  name: string;
  vehicle: { id: string; name: string; plateNumber: string } | null;
  stops: number;
  riders: { MORNING: number; AFTERNOON: number };
  /** Another person's trip on this route is running now. */
  busyTrip: { id: string; driverName: string; direction: TripDirection } | null;
}

export interface DriverHome {
  me: { name: string };
  routes: DriverRoute[];
  activeTrip: { id: string; routeName: string; direction: TripDirection; startedAt: string } | null;
}

export interface DriverStudent {
  id: string;
  /** First name and surname only: drivers see names and stops, nothing else. */
  name: string;
  status: BoardingKind | null;
}

export interface DriverTrip {
  id: string;
  routeName: string;
  vehicle: string | null;
  direction: TripDirection;
  status: 'ACTIVE' | 'ENDED';
  startedAt: string;
  endedAt: string | null;
  lastFixAt: string | null;
  fixes: number;
  stops: (BusStopPoint & { students: DriverStudent[] })[];
}

export interface PingResult {
  accepted: number;
  /** Fixes dropped as too close together, out of order or duplicates (not errors). */
  skipped: number;
  /** Fixes refused as implausible (timestamp or speed); never retried. */
  rejected: number;
  /** False once the trip has ended: the phone stops sharing. */
  active: boolean;
}

// ------------------------------------------------------------------ parents

export interface FamilyBus {
  /** False: this child isn't on a bus route (the card is hidden). */
  rides: boolean;
  route: { name: string; stop: string; direction: 'BOTH' | 'MORNING' | 'AFTERNOON'; vehicle: string | null; plateNumber: string | null } | null;
  /** Only while a trip that carries this child is running. */
  live: FamilyBusLive | null;
}

export interface FamilyBusLive {
  tripId: string;
  direction: TripDirection;
  startedAt: string;
  position: BusPosition | null;
  stop: { name: string; lat: number | null; lng: number | null };
  /** Straight-line distance from the bus to the child's stop (metres). */
  distanceM: number | null;
  /** Rough minutes to the child's stop; null when it can't be estimated. */
  etaMinutes: number | null;
  /** Why there is no ETA, in plain words. */
  etaNote: string | null;
  childStatus: BoardingKind | null;
}

// ------------------------------------------------------------------ staff

export interface LiveBus {
  tripId: string;
  route: { id: string; name: string };
  vehicle: string | null;
  driverName: string;
  direction: TripDirection;
  startedAt: string;
  position: BusPosition | null;
  /** Minutes since the last fix (or since the start when there is none). */
  silentMinutes: number;
  stale: boolean;
  stops: BusStopPoint[];
  counts: { due: number; boarded: number; dropped: number; absent: number };
}

export interface TripLogEntry {
  student: string;
  stop: string;
  kind: BoardingKind;
  at: string;
}

export interface TripSummary {
  id: string;
  routeName: string;
  vehicle: string | null;
  driverName: string;
  direction: TripDirection;
  status: 'ACTIVE' | 'ENDED';
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  fixes: number;
  distanceKm: number;
  log: TripLogEntry[];
}

export interface BusDriverOption {
  userId: string;
  name: string;
  email: string;
}

/** Great-circle distance in metres (haversine). */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Students due on a trip: direction BOTH, or the trip's own direction. */
export function ridesOn(assignmentDirection: string, trip: TripDirection): boolean {
  return assignmentDirection === 'BOTH' || assignmentDirection === trip;
}
