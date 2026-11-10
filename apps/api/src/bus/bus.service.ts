import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  BUS_LIMITS,
  DEFAULT_DATA_PROTECTION_SETTINGS,
  PRIVACY_NOTICE_VERSION,
  distanceMetres,
  ridesOn,
  TRIP_DIRECTION_LABEL,
  type BoardingInput,
  type BoardingKind,
  type BusDriverOption,
  type BusFix,
  type BusPosition,
  type BusStopPoint,
  type DriverHome,
  type DriverTrip,
  type FamilyBus,
  type FamilyBusLive,
  type LiveBus,
  type PingResult,
  type StartTripInput,
  type StopLocationsInput,
  type TripDirection,
  type TripSummary,
} from '@aischool/shared';
import type { BusTrip, Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { ChannelsService } from '../comms/channels.service';
import { fullName } from '../common/format';
import { currentTenantId, currentUserId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { registerTickTask } from '../common/tick-tasks';
import { PrismaService } from '../prisma/prisma.service';

/** A stop as stored on the route (lat/lng are optional and may be missing on older routes). */
type StoredStop = { name: string; pickup: string; dropoff: string; lat?: number | null; lng?: number | null };

/** Rough road distance from straight-line distance (streets aren't straight). */
const ROAD_FACTOR = 1.4;
/** Speeds used for the ETA (m/s): city traffic floor and a fast-road ceiling. */
const ETA_SPEED = { fallback: 4.2, min: 2.5, max: 16.7 } as const;
/** Within this distance the bus is "arriving" (metres). */
const ARRIVING_M = 150;

const stopsOf = (json: unknown): StoredStop[] => (Array.isArray(json) ? (json as StoredStop[]) : []);
const point = (s: StoredStop): BusStopPoint => ({ name: s.name, pickup: s.pickup, dropoff: s.dropoff, lat: typeof s.lat === 'number' ? s.lat : null, lng: typeof s.lng === 'number' ? s.lng : null });

/** Stops in the order the bus visits them: morning by pick-up time, afternoon by drop-off time. */
export function orderedStops(stops: StoredStop[], direction: TripDirection): StoredStop[] {
  const key = (s: StoredStop) => (direction === 'MORNING' ? s.pickup : s.dropoff);
  return stops.map((s, i) => ({ s, i })).sort((a, b) => key(a.s).localeCompare(key(b.s)) || a.i - b.i).map((x) => x.s);
}

function position(t: BusTrip): BusPosition | null {
  if (t.lastLat == null || t.lastLng == null || !t.lastFixAt) return null;
  return { lat: t.lastLat, lng: t.lastLng, accuracy: t.lastAccuracy, speed: t.lastSpeed, heading: t.lastHeading, at: t.lastFixAt.toISOString() };
}

/** The latest boarding event per student (ABSENT, then BOARDED, overrides by time). */
function statusByStudent(rows: { studentId: string; kind: string; at: Date }[]): Map<string, BoardingKind> {
  const latest = new Map<string, { kind: BoardingKind; at: number }>();
  for (const r of rows) {
    const prev = latest.get(r.studentId);
    if (!prev || r.at.getTime() >= prev.at) latest.set(r.studentId, { kind: r.kind as BoardingKind, at: r.at.getTime() });
  }
  return new Map([...latest].map(([k, v]) => [k, v.kind]));
}

export interface FixCheck {
  accepted: BusFix[];
  skipped: number;
  rejected: number;
  addedDistanceM: number;
}

/**
 * Which of a batch of phone fixes to keep. Pure, so it can be tested on its own:
 * rejects timestamps in the future, before the trip or from long ago, and jumps
 * faster than a bus can go; drops (skips) duplicates, out-of-order fixes and
 * fixes closer together than the minimum gap.
 */
export function checkFixes(fixes: BusFix[], trip: { startedAt: Date; lastFixAt: Date | null; lastLat: number | null; lastLng: number | null; lastAccuracy: number | null }, now: number): FixCheck {
  const out: FixCheck = { accepted: [], skipped: 0, rejected: 0, addedDistanceM: 0 };
  let lastAt = trip.lastFixAt?.getTime() ?? null;
  let last = trip.lastLat != null && trip.lastLng != null ? { lat: trip.lastLat, lng: trip.lastLng, accuracy: trip.lastAccuracy ?? 0 } : null;
  const earliest = Math.max(trip.startedAt.getTime() - 60_000, now - 12 * 3_600_000);
  for (const f of [...fixes].sort((a, b) => a.at - b.at)) {
    if (f.at > now + BUS_LIMITS.futureSkewMs || f.at < earliest) {
      out.rejected++;
      continue;
    }
    if (lastAt != null && (f.at <= lastAt || f.at - lastAt < BUS_LIMITS.minFixGapMs)) {
      out.skipped++;
      continue;
    }
    let step = 0;
    if (last && lastAt != null) {
      step = distanceMetres(last, f);
      const dt = (f.at - lastAt) / 1000;
      // Allow for both fixes' uncertainty before calling it a jump.
      const slack = Math.min(500, (last.accuracy ?? 0) + f.accuracy);
      if (step - slack > BUS_LIMITS.maxSpeedMs * dt) {
        out.rejected++;
        continue;
      }
    }
    out.accepted.push(f);
    if (last && f.accuracy <= BUS_LIMITS.geofenceMaxAccuracyM && last.accuracy <= BUS_LIMITS.geofenceMaxAccuracyM) out.addedDistanceM += step;
    last = { lat: f.lat, lng: f.lng, accuracy: f.accuracy };
    lastAt = f.at;
  }
  return out;
}

/** Approximate minutes to a stop from straight-line distance and recent speed. */
export function etaMinutes(distanceM: number, recentSpeedMs: number | null): number {
  if (distanceM <= ARRIVING_M) return 0;
  const speed = Math.min(ETA_SPEED.max, Math.max(ETA_SPEED.min, recentSpeedMs && recentSpeedMs > 0.5 ? recentSpeedMs : ETA_SPEED.fallback));
  return Math.max(1, Math.round((distanceM * ROAD_FACTOR) / speed / 60));
}

@Injectable()
export class BusService implements OnModuleInit {
  private readonly logger = new Logger(BusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly channels: ChannelsService,
  ) {}

  onModuleInit() {
    registerTickTask('bus-trips', () => this.autoEndSilentTrips());
  }

  // ================================================================ driver

  /** Routes the signed-in driver or bus assistant is linked to (through the route's vehicle). */
  private async myRoutes(userId: string) {
    return this.prisma.db.transportRoute.findMany({
      where: { active: true, vehicle: { OR: [{ driverUserId: userId }, { assistantUserId: userId }] } },
      include: { vehicle: true, assignments: { select: { direction: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async driverHome(): Promise<DriverHome> {
    const userId = currentUserId();
    const db = this.prisma.db;
    const [me, routes, mine] = await Promise.all([
      this.prisma.root.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true } }),
      this.myRoutes(userId),
      db.busTrip.findFirst({ where: { status: 'ACTIVE', driverUserId: userId }, orderBy: { startedAt: 'desc' } }),
    ]);
    const busy = routes.length
      ? await db.busTrip.findMany({ where: { status: 'ACTIVE', routeId: { in: routes.map((r) => r.id) }, NOT: { driverUserId: userId } } })
      : [];
    return {
      me: { name: fullName(me) },
      routes: routes.map((r) => {
        const other = busy.find((t) => t.routeId === r.id);
        return {
          id: r.id,
          name: r.name,
          vehicle: r.vehicle ? { id: r.vehicle.id, name: r.vehicle.name, plateNumber: r.vehicle.plateNumber } : null,
          stops: stopsOf(r.stops).length,
          riders: { MORNING: r.assignments.filter((a) => ridesOn(a.direction, 'MORNING')).length, AFTERNOON: r.assignments.filter((a) => ridesOn(a.direction, 'AFTERNOON')).length },
          busyTrip: other ? { id: other.id, driverName: other.driverName, direction: other.direction as TripDirection } : null,
        };
      }),
      activeTrip: mine ? { id: mine.id, routeName: mine.routeName, direction: mine.direction as TripDirection, startedAt: mine.startedAt.toISOString() } : null,
    };
  }

  async startTrip(input: StartTripInput): Promise<DriverTrip> {
    const userId = currentUserId();
    const db = this.prisma.db;
    const route = (await this.myRoutes(userId)).find((r) => r.id === input.routeId);
    if (!route) throw new ForbiddenException('You can only start trips on a route whose bus you are assigned to. Ask the transport office to link you to the bus.');
    const mine = await db.busTrip.findFirst({ where: { status: 'ACTIVE', driverUserId: userId } });
    if (mine) throw new ConflictException(`You already have a trip running on ${mine.routeName}. End it before starting another.`);
    const other = await db.busTrip.findFirst({ where: { status: 'ACTIVE', routeId: route.id } });
    if (other) throw new ConflictException(`${other.driverName} is already running a trip on ${route.name}.`);
    const me = await this.prisma.root.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const trip = await db.busTrip.create({
      data: {
        tenantId: currentTenantId(),
        routeId: route.id,
        vehicleId: route.vehicleId,
        driverUserId: userId,
        direction: input.direction,
        routeName: route.name,
        vehicleName: route.vehicle ? `${route.vehicle.name} (${route.vehicle.plateNumber})` : null,
        driverName: fullName(me),
      },
    });
    await this.audit.log({
      action: 'transport.trip_started',
      entityType: 'BusTrip',
      entityId: trip.id,
      summary: `${trip.driverName} started the ${TRIP_DIRECTION_LABEL[input.direction].toLowerCase()} trip on ${route.name}; the bus's location is shared until the trip ends`,
    });
    const due = await db.transportAssignment.findMany({ where: { routeId: route.id, student: { status: 'ACTIVE' } }, select: { studentId: true, direction: true } });
    await this.notifyFamilies(
      trip.tenantId,
      due.filter((a) => ridesOn(a.direction, input.direction)).map((a) => a.studentId),
      (first) => ({
        title: `${route.name} bus is on its way`,
        body: input.direction === 'MORNING' ? `The bus has started its morning pick-up run. You can follow it live on ${first}’s page in the app until the trip ends.` : `The bus has left on its afternoon drop-off run. You can follow it live on ${first}’s page in the app until the trip ends.`,
      }),
    );
    return this.driverTrip(trip.id);
  }

  /** The trip's driver, or the bus's linked driver or assistant (who may tap students on and off, and end it). */
  private async crewTrip(tripId: string, userId: string) {
    const trip = await this.prisma.db.busTrip.findUnique({ where: { id: tripId }, include: { vehicle: { select: { driverUserId: true, assistantUserId: true } } } });
    if (!trip) throw new NotFoundException('Trip not found');
    const crew = trip.driverUserId === userId || trip.vehicle?.driverUserId === userId || trip.vehicle?.assistantUserId === userId;
    if (!crew) throw new ForbiddenException('This is not your trip');
    return trip;
  }

  async driverTrip(tripId: string): Promise<DriverTrip> {
    const trip = await this.crewTrip(tripId, currentUserId());
    const db = this.prisma.db;
    const direction = trip.direction as TripDirection;
    const [route, assignments, boardings] = await Promise.all([
      trip.routeId ? db.transportRoute.findUnique({ where: { id: trip.routeId }, select: { stops: true } }) : null,
      trip.routeId
        ? db.transportAssignment.findMany({ where: { routeId: trip.routeId, student: { status: 'ACTIVE' } }, select: { stop: true, direction: true, student: { select: { id: true, firstName: true, lastName: true } } } })
        : [],
      db.busBoarding.findMany({ where: { tripId }, select: { studentId: true, kind: true, at: true } }),
    ]);
    const status = statusByStudent(boardings);
    const due = assignments.filter((a) => ridesOn(a.direction, direction));
    const stops = orderedStops(stopsOf(route?.stops), direction);
    return {
      id: trip.id,
      routeName: trip.routeName,
      vehicle: trip.vehicleName,
      direction,
      status: trip.status as DriverTrip['status'],
      startedAt: trip.startedAt.toISOString(),
      endedAt: trip.endedAt?.toISOString() ?? null,
      lastFixAt: trip.lastFixAt?.toISOString() ?? null,
      fixes: trip.fixCount,
      stops: stops.map((s) => ({
        ...point(s),
        students: due
          .filter((a) => a.stop === s.name)
          .map((a) => ({ id: a.student.id, name: fullName(a.student), status: status.get(a.student.id) ?? null }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      })),
    };
  }

  /** Location fixes from the trip's own driver only, while the trip is running. */
  async ping(tripId: string, fixes: BusFix[], now = Date.now()): Promise<PingResult> {
    const userId = currentUserId();
    const db = this.prisma.db;
    const trip = await db.busTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverUserId !== userId) throw new ForbiddenException('Only the person who started this trip can share its location');
    if (trip.status !== 'ACTIVE') throw new ConflictException('This trip has ended, so its location is no longer shared');
    const c = checkFixes(fixes, trip, now);
    const latest = c.accepted.at(-1);
    if (latest) {
      await db.$transaction([
        db.busPing.createMany({
          data: c.accepted.map((f) => ({ tenantId: trip.tenantId, tripId, lat: f.lat, lng: f.lng, accuracy: f.accuracy, speed: f.speed ?? null, heading: f.heading ?? null, recordedAt: new Date(f.at) })),
        }),
        db.busTrip.update({
          where: { id: tripId },
          data: {
            lastLat: latest.lat,
            lastLng: latest.lng,
            lastAccuracy: latest.accuracy,
            lastSpeed: latest.speed ?? null,
            lastHeading: latest.heading ?? null,
            lastFixAt: new Date(latest.at),
            fixCount: { increment: c.accepted.length },
            distanceM: { increment: c.addedDistanceM },
          },
        }),
      ]);
      // Geofence on the freshest good fix only (a queue flushed after a tunnel shouldn't fire old stops).
      if (latest.accuracy <= BUS_LIMITS.geofenceMaxAccuracyM && now - latest.at < 5 * 60_000) await this.checkNearStops(trip, latest);
    }
    return { accepted: c.accepted.length, skipped: c.skipped, rejected: c.rejected, active: true };
  }

  /** "The bus is near your stop": once per stop per trip, claimed atomically. */
  private async checkNearStops(trip: BusTrip, fix: { lat: number; lng: number }): Promise<number> {
    if (!trip.routeId) return 0;
    const db = this.prisma.db;
    const route = await db.transportRoute.findUnique({ where: { id: trip.routeId }, select: { stops: true } });
    const near = stopsOf(route?.stops).filter(
      (s) => typeof s.lat === 'number' && typeof s.lng === 'number' && !trip.nearNotified.includes(s.name) && distanceMetres(fix, { lat: s.lat, lng: s.lng }) <= BUS_LIMITS.nearStopM,
    );
    let sent = 0;
    for (const s of near) {
      const claimed = await db.busTrip.updateMany({ where: { id: trip.id, status: 'ACTIVE', NOT: { nearNotified: { has: s.name } } }, data: { nearNotified: { push: s.name } } });
      if (!claimed.count) continue;
      const direction = trip.direction as TripDirection;
      const [riders, boardings] = await Promise.all([
        db.transportAssignment.findMany({ where: { routeId: trip.routeId, stop: s.name, student: { status: 'ACTIVE' } }, select: { studentId: true, direction: true } }),
        db.busBoarding.findMany({ where: { tripId: trip.id }, select: { studentId: true, kind: true, at: true } }),
      ]);
      const status = statusByStudent(boardings);
      const ids = riders
        .filter((a) => ridesOn(a.direction, direction))
        .filter((a) => {
          const st = status.get(a.studentId);
          // Not for children marked absent, already on the bus (morning) or already home (afternoon).
          return st !== 'ABSENT' && !(direction === 'MORNING' && (st === 'BOARDED' || st === 'DROPPED')) && st !== 'DROPPED';
        })
        .map((a) => a.studentId);
      sent += await this.notifyFamilies(trip.tenantId, ids, (first) => ({
        title: `The bus is near ${s.name}`,
        body: direction === 'MORNING' ? `${trip.routeName} bus is about 500 m from ${s.name}. Please have ${first} ready.` : `${trip.routeName} bus is about 500 m from ${s.name} with ${first}. Please be at the stop.`,
      }));
    }
    return sent;
  }

  async board(tripId: string, input: BoardingInput): Promise<DriverTrip> {
    const userId = currentUserId();
    const trip = await this.crewTrip(tripId, userId);
    if (trip.status !== 'ACTIVE') throw new ConflictException('This trip has ended');
    const db = this.prisma.db;
    const direction = trip.direction as TripDirection;
    const a = trip.routeId ? await db.transportAssignment.findFirst({ where: { routeId: trip.routeId, studentId: input.studentId }, include: { student: { select: { firstName: true } } } }) : null;
    if (!a || !ridesOn(a.direction, direction)) throw new BadRequestException('This student is not due on this trip');
    let first = false;
    try {
      await db.busBoarding.create({ data: { tenantId: trip.tenantId, tripId, studentId: input.studentId, stop: a.stop, kind: input.kind, byUserId: userId } });
      first = true;
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      // Tapped again (e.g. after a correction): it becomes the latest status, without a second message.
      await db.busBoarding.updateMany({ where: { tripId, studentId: input.studentId, kind: input.kind }, data: { at: new Date(), byUserId: userId } });
    }
    if (first && input.kind !== 'ABSENT') {
      const tz = (await this.prisma.root.tenant.findUnique({ where: { id: trip.tenantId }, select: { timezone: true } }))?.timezone ?? 'Africa/Lagos';
      const time = schoolNow(tz).time;
      const where = input.kind === 'BOARDED' ? (direction === 'MORNING' ? `at ${a.stop}` : 'at school') : direction === 'MORNING' ? 'at school' : `at ${a.stop}`;
      await this.notifyFamilies(trip.tenantId, [input.studentId], (name) =>
        input.kind === 'BOARDED'
          ? { title: `${name} is on the bus`, body: `${name} boarded the ${trip.routeName} bus ${where} at ${time}.` }
          : { title: `${name} was dropped off`, body: `${name} got off the ${trip.routeName} bus ${where} at ${time}.` },
      );
    }
    return this.driverTrip(tripId);
  }

  async endTrip(tripId: string, by: 'DRIVER' | 'STAFF'): Promise<{ id: string; status: 'ENDED' }> {
    const userId = currentUserId();
    const trip = by === 'DRIVER' ? await this.crewTrip(tripId, userId) : await this.prisma.db.busTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'ACTIVE') return { id: trip.id, status: 'ENDED' };
    const ended = await this.prisma.db.busTrip.updateMany({ where: { id: tripId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date(), endReason: by } });
    if (ended.count) {
      const mins = Math.round((Date.now() - trip.startedAt.getTime()) / 60_000);
      await this.audit.log({
        action: 'transport.trip_ended',
        entityType: 'BusTrip',
        entityId: trip.id,
        summary: `${by === 'DRIVER' ? trip.driverName : 'Transport office'} ended the trip on ${trip.routeName} after ${mins} min (${(trip.distanceM / 1000).toFixed(1)} km); location sharing stopped`,
      });
    }
    return { id: trip.id, status: 'ENDED' };
  }

  /** Scheduler tick: trips that went silent for hours (phone off, driver forgot) are ended. */
  async autoEndSilentTrips(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - BUS_LIMITS.autoEndAfterMs);
    const stale = await this.prisma.root.busTrip.findMany({
      where: { status: 'ACTIVE', OR: [{ lastFixAt: { lt: cutoff } }, { lastFixAt: null, startedAt: { lt: cutoff } }] },
      select: { id: true, tenantId: true, routeName: true, driverName: true },
      take: 200,
    });
    let n = 0;
    for (const t of stale) {
      const r = await this.prisma.root.busTrip.updateMany({ where: { id: t.id, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: now, endReason: 'AUTO' } });
      if (!r.count) continue;
      n++;
      await this.audit.log({
        tenantId: t.tenantId,
        actorUserId: null,
        action: 'transport.trip_ended',
        entityType: 'BusTrip',
        entityId: t.id,
        summary: `Trip on ${t.routeName} (${t.driverName}) ended automatically after ${BUS_LIMITS.autoEndAfterMs / 3_600_000} hours without a location update`,
      });
    }
    return n;
  }

  // ================================================================ families

  async familyBus(studentId: string, now = Date.now()): Promise<FamilyBus> {
    const userId = currentUserId();
    const db = this.prisma.db;
    const link = await db.studentGuardian.findFirst({ where: { studentId, guardian: { userId }, student: { status: 'ACTIVE' } }, select: { studentId: true } });
    if (!link) throw new ForbiddenException('You can only see your own children');
    const a = await db.transportAssignment.findUnique({ where: { studentId }, include: { route: { include: { vehicle: { select: { name: true, plateNumber: true } } } } } });
    if (!a || !a.route.active) return { rides: false, route: null, live: null };
    const route = { name: a.route.name, stop: a.stop, direction: a.direction as 'BOTH' | 'MORNING' | 'AFTERNOON', vehicle: a.route.vehicle?.name ?? null, plateNumber: a.route.vehicle?.plateNumber ?? null };
    const trips = await db.busTrip.findMany({ where: { routeId: a.routeId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } });
    const trip = trips.find((t) => ridesOn(a.direction, t.direction as TripDirection));
    if (!trip) return { rides: true, route, live: null };
    const direction = trip.direction as TripDirection;
    const stop = stopsOf(a.route.stops).find((s) => s.name === a.stop);
    const stopPoint = { name: a.stop, lat: typeof stop?.lat === 'number' ? stop.lat : null, lng: typeof stop?.lng === 'number' ? stop.lng : null };
    const boardings = await db.busBoarding.findMany({ where: { tripId: trip.id, studentId }, select: { studentId: true, kind: true, at: true } });
    const childStatus = statusByStudent(boardings).get(studentId) ?? null;
    const pos = position(trip);
    const live: FamilyBusLive = { tripId: trip.id, direction, startedAt: trip.startedAt.toISOString(), position: pos, stop: stopPoint, distanceM: null, etaMinutes: null, etaNote: null, childStatus };
    const done = childStatus === 'ABSENT' || childStatus === 'DROPPED' || (direction === 'MORNING' && childStatus === 'BOARDED');
    if (done) live.etaNote = childStatus === 'ABSENT' ? 'Marked absent for this trip' : childStatus === 'DROPPED' ? 'Dropped off' : 'On the bus';
    else if (!pos) live.etaNote = 'Waiting for the bus’s first location';
    else if (stopPoint.lat == null || stopPoint.lng == null) live.etaNote = 'The school hasn’t marked this stop on the map yet';
    else {
      live.distanceM = Math.round(distanceMetres(pos, { lat: stopPoint.lat, lng: stopPoint.lng }));
      if (now - Date.parse(pos.at) > 5 * 60_000) live.etaNote = 'No recent update from the bus, so no estimate';
      else live.etaMinutes = etaMinutes(live.distanceM, await this.recentSpeed(trip.id, pos));
    }
    return { rides: true, route, live };
  }

  /** Average speed over the last few minutes of fixes (m/s), or the phone's own reading. */
  private async recentSpeed(tripId: string, pos: BusPosition): Promise<number | null> {
    const since = new Date(Date.parse(pos.at) - 5 * 60_000);
    const pings = await this.prisma.db.busPing.findMany({ where: { tripId, recordedAt: { gte: since } }, orderBy: { recordedAt: 'asc' }, select: { lat: true, lng: true, recordedAt: true } });
    if (pings.length >= 2) {
      let d = 0;
      for (let i = 1; i < pings.length; i++) d += distanceMetres(pings[i - 1]!, pings[i]!);
      const secs = (pings.at(-1)!.recordedAt.getTime() - pings[0]!.recordedAt.getTime()) / 1000;
      if (secs >= 30) return d / secs;
    }
    return pos.speed;
  }

  /**
   * In-app notification (and push, where the parent's phone allows it) to each
   * child's linked parents. Parents held at the school's consent step get nothing.
   */
  async notifyFamilies(tenantId: string, studentIds: string[], text: (firstName: string) => { title: string; body: string }): Promise<number> {
    if (!studentIds.length) return 0;
    const db = this.prisma.root;
    const [links, tenant] = await Promise.all([
      db.studentGuardian.findMany({
        where: { tenantId, studentId: { in: [...new Set(studentIds)] } },
        select: { studentId: true, student: { select: { firstName: true } }, guardian: { select: { userId: true, dataConsentVersion: true } } },
      }),
      db.tenant.findUnique({ where: { id: tenantId }, select: { portalSettings: true } }),
    ]);
    const flag = (tenant?.portalSettings as { dataProtection?: { consentRequired?: unknown } } | null)?.dataProtection?.consentRequired;
    const consentRequired = typeof flag === 'boolean' ? flag : DEFAULT_DATA_PROTECTION_SETTINGS.consentRequired;
    const seen = new Set<string>();
    const rows: Prisma.NotificationCreateManyInput[] = [];
    for (const l of links) {
      const uid = l.guardian.userId;
      if (!uid || seen.has(`${uid}:${l.studentId}`)) continue;
      if (consentRequired && l.guardian.dataConsentVersion !== PRIVACY_NOTICE_VERSION) continue;
      seen.add(`${uid}:${l.studentId}`);
      const { title, body } = text(l.student.firstName);
      rows.push({ tenantId, userId: uid, title: title.slice(0, 160), body, link: `/school/${l.studentId}` });
    }
    if (!rows.length) return 0;
    await db.notification.createMany({ data: rows });
    if (this.channels.pushEnabled()) {
      // Best effort and off the request path: a slow push service must not hold up the driver's phone.
      void Promise.allSettled(rows.map((r) => this.channels.sendPush(r.userId, { title: r.title, body: r.body ?? '', url: r.link ?? null }))).then((res) => {
        const failed = res.filter((x) => x.status === 'rejected').length;
        if (failed && failed === res.length) this.logger.debug(`Bus push: none of ${failed} delivered`);
      });
    }
    return rows.length;
  }

  // ================================================================ staff

  async live(now = Date.now()): Promise<LiveBus[]> {
    const db = this.prisma.db;
    const trips = await db.busTrip.findMany({ where: { status: 'ACTIVE' }, include: { route: { select: { id: true, stops: true } } }, orderBy: { routeName: 'asc' } });
    if (!trips.length) return [];
    const routeIds = trips.map((t) => t.routeId).filter((x): x is string => !!x);
    const [assignments, boardings] = await Promise.all([
      db.transportAssignment.findMany({ where: { routeId: { in: routeIds }, student: { status: 'ACTIVE' } }, select: { routeId: true, direction: true, studentId: true } }),
      db.busBoarding.findMany({ where: { tripId: { in: trips.map((t) => t.id) } }, select: { tripId: true, studentId: true, kind: true, at: true } }),
    ]);
    return trips.map((t) => {
      const direction = t.direction as TripDirection;
      const due = assignments.filter((a) => a.routeId === t.routeId && ridesOn(a.direction, direction));
      const status = statusByStudent(boardings.filter((b) => b.tripId === t.id));
      const count = (k: BoardingKind) => [...status.values()].filter((v) => v === k).length;
      const since = (t.lastFixAt ?? t.startedAt).getTime();
      return {
        tripId: t.id,
        route: { id: t.routeId ?? '', name: t.routeName },
        vehicle: t.vehicleName,
        driverName: t.driverName,
        direction,
        startedAt: t.startedAt.toISOString(),
        position: position(t),
        silentMinutes: Math.max(0, Math.floor((now - since) / 60_000)),
        stale: now - since > BUS_LIMITS.staleAfterMs,
        stops: orderedStops(stopsOf(t.route?.stops), direction).map(point),
        counts: { due: due.length, boarded: count('BOARDED'), dropped: count('DROPPED'), absent: count('ABSENT') },
      };
    });
  }

  /** Trips that started on a school day (school time zone), with their boarding logs. */
  async trips(date?: string): Promise<TripSummary[]> {
    const db = this.prisma.db;
    const tz = (await this.prisma.root.tenant.findUnique({ where: { id: currentTenantId() }, select: { timezone: true } }))?.timezone ?? 'Africa/Lagos';
    const day = date ?? schoolNow(tz).date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BadRequestException('Use YYYY-MM-DD');
    const mid = Date.parse(`${day}T12:00:00Z`);
    if (Number.isNaN(mid)) throw new BadRequestException('Use YYYY-MM-DD');
    const rows = await db.busTrip.findMany({
      where: { startedAt: { gte: new Date(mid - 36 * 3_600_000), lte: new Date(mid + 36 * 3_600_000) } },
      include: { boardings: { include: { student: { select: { firstName: true, lastName: true } } }, orderBy: { at: 'asc' } } },
      orderBy: { startedAt: 'desc' },
    });
    return rows
      .filter((t) => schoolNow(tz, t.startedAt).date === day)
      .map((t) => ({
        id: t.id,
        routeName: t.routeName,
        vehicle: t.vehicleName,
        driverName: t.driverName,
        direction: t.direction as TripDirection,
        status: t.status as TripSummary['status'],
        startedAt: t.startedAt.toISOString(),
        endedAt: t.endedAt?.toISOString() ?? null,
        endReason: t.endReason,
        fixes: t.fixCount,
        distanceKm: Math.round(t.distanceM / 100) / 10,
        log: t.boardings.map((b) => ({ student: fullName(b.student), stop: b.stop, kind: b.kind as BoardingKind, at: b.at.toISOString() })),
      }));
  }

  /** Members who hold the Bus Driver permission (to link to a vehicle). */
  async drivers(): Promise<BusDriverOption[]> {
    const rows = await this.prisma.db.membership.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { permissions: { has: 'transport.drive' } } } } },
      select: { user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } } },
    });
    return rows
      .filter((r) => r.user.status === 'ACTIVE')
      .map((r) => ({ userId: r.user.id, name: fullName(r.user), email: r.user.email }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async setStopLocations(routeId: string, input: StopLocationsInput): Promise<BusStopPoint[]> {
    const db = this.prisma.db;
    const route = await db.transportRoute.findUnique({ where: { id: routeId } });
    if (!route) throw new NotFoundException('Route not found');
    const byName = new Map(input.stops.map((s) => [s.name, s]));
    const stops = stopsOf(route.stops);
    const unknown = input.stops.find((s) => !stops.some((x) => x.name === s.name));
    if (unknown) throw new BadRequestException(`"${unknown.name}" is not a stop on ${route.name}`);
    let placed = 0;
    const next = stops.map((s) => {
      const p = byName.get(s.name);
      if (!p) return s;
      if (p.lat != null) placed++;
      return { ...s, lat: p.lat, lng: p.lng };
    });
    await db.transportRoute.update({ where: { id: routeId }, data: { stops: next as unknown as Prisma.InputJsonValue } });
    await this.audit.log({ action: 'transport.stop_locations', entityType: 'TransportRoute', entityId: routeId, summary: `Set map locations for ${placed} of ${input.stops.length} stop(s) on ${route.name}` });
    return next.map(point);
  }

}
