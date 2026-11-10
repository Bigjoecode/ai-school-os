// Live school bus tracking, through the real service and the tenant scope, on the LOCAL dev database.
// Two throw-away schools are created here and deleted at the end; nothing else is touched.
// Skipped unless DATABASE_URL points at this machine and the database is up (with the bus tables migrated).
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/bus-tracking.test.ts
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import { BUS_LIMITS, type BusFix, type Permission } from '@aischool/shared';

try {
  process.loadEnvFile('.env');
} catch {
  /* the environment may carry them */
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '');
process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';

/* eslint-disable @typescript-eslint/no-require-imports */
const load = () => ({
  ...(require('../src/prisma/prisma.service') as typeof import('../src/prisma/prisma.service')),
  ...(require('../src/prisma/housekeeping.service') as typeof import('../src/prisma/housekeeping.service')),
  ...(require('../src/common/request-context') as typeof import('../src/common/request-context')),
  ...(require('../src/audit/audit.service') as typeof import('../src/audit/audit.service')),
  ...(require('../src/bus/bus.service') as typeof import('../src/bus/bus.service')),
});
const pure = require('../src/bus/bus.service') as typeof import('../src/bus/bus.service');

type Loaded = ReturnType<typeof load>;
let m: Loaded;
let prisma: InstanceType<Loaded['PrismaService']>;
let bus: InstanceType<Loaded['BusService']>;
let skip: string | false = local ? false : 'DATABASE_URL is not local';
const pushes: { userId: string; title: string }[] = [];

const stamp = randomBytes(5).toString('hex');
const tenants: string[] = [];
const users: string[] = [];

const DRIVE: Permission[] = ['transport.drive'];
const FAMILY: Permission[] = ['family.manage'];
const STAFF: Permission[] = ['transport.read', 'transport.manage'];
const as = <T>(tenantId: string, userId: string, permissions: Permission[], fn: () => Promise<T>) => m.RequestContextStore.run({ tenantId, userId, permissions: new Set(permissions), ip: '10.0.0.9' }, fn);

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    const err = e as { getStatus?: () => number };
    return err.getStatus?.() ?? (e as Error).message;
  }
};

// Points on one east-west line in Lagos: the school in the east; Stop B 2.2 km west of it, Stop A 1.1 km further west.
// In the morning the bus reaches Stop B first (earlier pick-up time) without passing Stop A.
const SCHOOL = { lat: 6.4300, lng: 3.4700 };
const STOP_A = { lat: 6.4300, lng: 3.4400 };
const STOP_B = { lat: 6.4300, lng: 3.4500 };

interface School {
  tenantId: string;
  routeId: string;
  vehicleId: string;
  driver: string;
  assistant: string;
  otherDriver: string;
  staff: string;
  kid: string;
  kid2: string;
  afternoonKid: string;
  parent: string;
  parent2: string;
}
let s: School;
let other: School;

const user = async (who: string) => {
  const u = await prisma.root.user.create({ data: { email: `bus-${who}-${stamp}@test.invalid`, passwordHash: 'x', firstName: who, lastName: 'Test' } });
  users.push(u.id);
  return u.id;
};

async function makeSchool(tag: string): Promise<School> {
  const db = prisma.root;
  // Consent not required, so parents receive notifications without the privacy-notice step.
  const t = await db.tenant.create({ data: { slug: `bus-${tag}-${stamp}`, name: `Bus test ${tag}`, portalSettings: { dataProtection: { consentRequired: false } } } });
  tenants.push(t.id);
  const tenantId = t.id;
  const [driver, assistant, otherDriver, staff, parent, parent2] = await Promise.all(['driver', 'assistant', 'otherdriver', 'staff', 'parent', 'parent2'].map((w) => user(`${tag}-${w}`)));
  const vehicle = await db.vehicle.create({ data: { tenantId, name: 'Bus 1', plateNumber: `T${tag}${stamp}`.slice(0, 18), capacity: 30, driverUserId: driver!, assistantUserId: assistant! } });
  const otherVehicle = await db.vehicle.create({ data: { tenantId, name: 'Bus 2', plateNumber: `U${tag}${stamp}`.slice(0, 18), capacity: 30, driverUserId: otherDriver! } });
  const route = await db.transportRoute.create({
    data: {
      tenantId,
      name: 'East',
      vehicleId: vehicle.id,
      stops: [
        { name: 'Stop A', pickup: '06:40', dropoff: '15:50', ...STOP_A },
        { name: 'Stop B', pickup: '06:30', dropoff: '16:00', ...STOP_B },
      ],
    },
  });
  await db.transportRoute.create({ data: { tenantId, name: 'West', vehicleId: otherVehicle.id, stops: [{ name: 'Stop W', pickup: '06:30', dropoff: '16:00' }] } });
  const mk = (n: string) => db.student.create({ data: { tenantId, admissionNumber: `${tag}-${n}`, firstName: n, lastName: 'Rider', gender: 'FEMALE' } });
  const [kid, kid2, afternoonKid] = await Promise.all([mk('Ada'), mk('Bola'), mk('Chidi')]);
  await db.transportAssignment.createMany({
    data: [
      { tenantId, studentId: kid.id, routeId: route.id, stop: 'Stop A', direction: 'BOTH' },
      { tenantId, studentId: kid2.id, routeId: route.id, stop: 'Stop B', direction: 'MORNING' },
      { tenantId, studentId: afternoonKid.id, routeId: route.id, stop: 'Stop A', direction: 'AFTERNOON' },
    ],
  });
  const link = async (userId: string, studentId: string) => {
    const g = await db.guardian.create({ data: { tenantId, userId, firstName: 'P', lastName: tag, relationship: 'Mother', phone: '08000000000' } });
    await db.studentGuardian.create({ data: { tenantId, studentId, guardianId: g.id } });
  };
  await link(parent!, kid.id);
  await link(parent2!, kid2.id);
  return { tenantId, routeId: route.id, vehicleId: vehicle.id, driver: driver!, assistant: assistant!, otherDriver: otherDriver!, staff: staff!, kid: kid.id, kid2: kid2.id, afternoonKid: afternoonKid.id, parent: parent!, parent2: parent2! };
}

const fix = (p: { lat: number; lng: number }, at: number, accuracy = 10, speed: number | null = 8): BusFix => ({ lat: p.lat, lng: p.lng, accuracy, speed, heading: 90, at });
const notes = (userId: string) => prisma.root.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { title: true, body: true, link: true } });
/** Points along the line between two places (fraction 0..1). */
const along = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, f: number) => ({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });

before(async () => {
  if (skip) return;
  try {
    m = load();
    prisma = new m.PrismaService();
    await prisma.root.$queryRaw`select 1 from bus_trips limit 1`;
  } catch (e) {
    skip = `no local database with the bus tables: ${(e as Error).message}`;
    return;
  }
  const channels = { pushEnabled: () => true, sendPush: async (userId: string, p: { title: string }) => (pushes.push({ userId, title: p.title }), 1) } as never;
  bus = new m.BusService(prisma, new m.AuditService(prisma), channels);
  s = await makeSchool('a');
  other = await makeSchool('b');
});

after(async () => {
  if (!prisma) return;
  await prisma.root.tenant.deleteMany({ where: { id: { in: tenants } } }).catch(() => undefined);
  await prisma.root.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
  await prisma.root.$disconnect();
});

// ------------------------------------------------------------------ pure rules

test('fix checks: future, pre-trip and stale timestamps are rejected; duplicates and bursts skipped; GPS jumps rejected', () => {
  const now = Date.parse('2026-11-10T07:00:00Z');
  const trip = { startedAt: new Date(now - 10 * 60_000), lastFixAt: null, lastLat: null, lastLng: null, lastAccuracy: null };
  const r = pure.checkFixes(
    [
      fix(SCHOOL, now - 9 * 60_000),
      fix(SCHOOL, now - 9 * 60_000), // duplicate
      fix(SCHOOL, now - 9 * 60_000 + 2_000), // closer than the minimum gap
      fix(STOP_B, now - 9 * 60_000 + 15_000), // 2.2 km in 15 s: a jump
      fix(along(SCHOOL, STOP_A, 0.05), now - 8 * 60_000), // ~165 m in 60 s: fine
      fix(SCHOOL, now + BUS_LIMITS.futureSkewMs + 60_000), // from the future
      fix(SCHOOL, now - 20 * 60_000), // before the trip started
    ],
    trip,
    now,
  );
  assert.equal(r.accepted.length, 2);
  assert.equal(r.skipped, 2);
  assert.equal(r.rejected, 3);
  assert.ok(r.addedDistanceM > 120 && r.addedDistanceM < 220, `distance ${r.addedDistanceM}`);
});

test('ETA: arriving inside 150 m, a floor speed in traffic, and minutes from distance and speed', () => {
  assert.equal(pure.etaMinutes(100, 10), 0);
  assert.equal(pure.etaMinutes(3000, 10), 7); // 3 km x 1.4 / 10 m/s = 420 s
  assert.equal(pure.etaMinutes(3000, 0.1), 17); // stopped in traffic: 4.2 m/s fallback
  assert.equal(pure.etaMinutes(3000, null), 17);
});

test('stops are visited by pick-up time in the morning and drop-off time in the afternoon', () => {
  const stops = [
    { name: 'A', pickup: '06:40', dropoff: '15:50' },
    { name: 'B', pickup: '06:30', dropoff: '16:00' },
  ];
  assert.deepEqual(pure.orderedStops(stops, 'MORNING').map((x) => x.name), ['B', 'A']);
  assert.deepEqual(pure.orderedStops(stops, 'AFTERNOON').map((x) => x.name), ['A', 'B']);
});

// ------------------------------------------------------------------ a trip, end to end

test('a morning trip: access, pings, geofence once, boarding notifications, end and audit', async (t) => {
  if (skip) return t.skip(skip);
  const T = s.tenantId;

  // Before any trip, the parent sees the route but no bus.
  const idle = await as(T, s.parent, FAMILY, () => bus.familyBus(s.kid));
  assert.equal(idle.rides, true);
  assert.equal(idle.route?.stop, 'Stop A');
  assert.equal(idle.live, null);

  // A driver can't start a route whose bus they aren't linked to.
  assert.equal(await code(as(T, s.otherDriver, DRIVE, () => bus.startTrip({ routeId: s.routeId, direction: 'MORNING' }))), 403);
  // Nor can a driver from another school, whose request is scoped to their own school.
  assert.equal(await code(as(other.tenantId, other.driver, DRIVE, () => bus.startTrip({ routeId: s.routeId, direction: 'MORNING' }))), 403);

  const home = await as(T, s.driver, DRIVE, () => bus.driverHome());
  assert.deepEqual(home.routes.map((r) => r.name), ['East']);
  assert.deepEqual(home.routes[0]!.riders, { MORNING: 2, AFTERNOON: 2 });

  const trip = await as(T, s.driver, DRIVE, () => bus.startTrip({ routeId: s.routeId, direction: 'MORNING' }));
  // Pretend it started ten minutes ago, so the test can send fixes from the last few minutes.
  await prisma.root.busTrip.update({ where: { id: trip.id }, data: { startedAt: new Date(Date.now() - 10 * 60_000) } });
  // Drivers see names and stops of the children due on this trip only (not the afternoon-only rider).
  assert.deepEqual(trip.stops.map((x) => x.name), ['Stop B', 'Stop A']);
  assert.deepEqual(trip.stops.flatMap((x) => x.students.map((k) => k.name)).sort(), ['Ada Rider', 'Bola Rider']);
  assert.deepEqual(Object.keys(trip.stops[0]!.students[0]!).sort(), ['id', 'name', 'status']);
  // Only one trip per route at a time, and only one running trip per driver.
  assert.equal(await code(as(T, s.assistant, DRIVE, () => bus.startTrip({ routeId: s.routeId, direction: 'MORNING' }))), 409);

  const started = await prisma.root.auditLog.count({ where: { tenantId: T, action: 'transport.trip_started', entityId: trip.id } });
  assert.equal(started, 1);
  assert.equal((await notes(s.parent)).filter((n) => /on its way/.test(n.title)).length, 1);
  assert.equal((await notes(s.parent2)).filter((n) => /on its way/.test(n.title)).length, 1);

  // Only the trip's own driver may send its location: not the bus assistant, not another driver, not another school.
  const now = Date.now();
  assert.equal(await code(as(T, s.assistant, DRIVE, () => bus.ping(trip.id, [fix(SCHOOL, now)]))), 403);
  assert.equal(await code(as(T, s.otherDriver, DRIVE, () => bus.ping(trip.id, [fix(SCHOOL, now)]))), 403);
  assert.equal(await code(as(other.tenantId, other.driver, DRIVE, () => bus.ping(trip.id, [fix(SCHOOL, now)]))), 404);

  // Another school's staff and parents see nothing of it.
  assert.deepEqual(await as(other.tenantId, other.staff, STAFF, () => bus.live()), []);
  assert.equal(await code(as(other.tenantId, other.parent, FAMILY, () => bus.familyBus(s.kid))), 403);
  // A parent of this school sees only their own child.
  assert.equal(await code(as(T, s.parent2, FAMILY, () => bus.familyBus(s.kid))), 403);

  // Drive from school towards Stop B (it is visited first), 30 s apart, ending ~550 m short of it.
  const t0 = now - 180_000;
  const leg = [0, 0.25, 0.5, 0.75].map((f, i) => fix(along(SCHOOL, STOP_B, f), t0 + i * 30_000));
  const r1 = await as(T, s.driver, DRIVE, () => bus.ping(trip.id, leg));
  assert.deepEqual(r1, { accepted: 4, skipped: 0, rejected: 0, active: true });
  // Re-sending the same queued fixes (a retry after a timeout) stores nothing twice.
  const again = await as(T, s.driver, DRIVE, () => bus.ping(trip.id, leg));
  assert.equal(again.accepted, 0);
  assert.equal(again.skipped, 4);

  const watching = await as(T, s.parent, FAMILY, () => bus.familyBus(s.kid));
  assert.ok(watching.live?.position, 'the parent sees the bus during the trip');
  assert.ok(watching.live!.distanceM! > 1000);
  assert.ok(watching.live!.etaMinutes! >= 1);
  const staffView = await as(T, s.staff, STAFF, () => bus.live());
  assert.equal(staffView.length, 1);
  assert.equal(staffView[0]!.counts.due, 2);
  assert.equal(staffView[0]!.stale, false);

  // Near Stop B (about 300 m away): Bola's parent is told once; Ada's (Stop A, 1.4 km away) is not.
  await as(T, s.driver, DRIVE, () => bus.ping(trip.id, [fix({ lat: STOP_B.lat, lng: 3.4527 }, now - 60_000)]));
  await as(T, s.driver, DRIVE, () => bus.ping(trip.id, [fix({ lat: STOP_B.lat, lng: 3.452 }, now - 50_000)]));
  await as(T, s.driver, DRIVE, () => bus.ping(trip.id, [fix(STOP_B, now - 40_000)]));
  const nearNotes = (await notes(s.parent2)).filter((n) => /near Stop B/.test(n.title));
  assert.equal(nearNotes.length, 1, 'geofence fires once per trip');
  assert.equal(nearNotes[0]!.link, `/school/${s.kid2}`);
  assert.equal((await notes(s.parent)).filter((n) => /near/.test(n.title)).length, 0);
  assert.ok(pushes.some((p) => p.userId === s.parent2 && /near Stop B/.test(p.title)), 'push sent too');

  // Boarding: the bus assistant may tap students; one message per kind, even if tapped twice.
  await as(T, s.assistant, DRIVE, () => bus.board(trip.id, { studentId: s.kid2, kind: 'BOARDED' }));
  await as(T, s.driver, DRIVE, () => bus.board(trip.id, { studentId: s.kid2, kind: 'BOARDED' }));
  assert.equal((await notes(s.parent2)).filter((n) => /is on the bus/.test(n.title)).length, 1);
  // A student not due on this trip, or from another school, can't be marked.
  assert.equal(await code(as(T, s.driver, DRIVE, () => bus.board(trip.id, { studentId: s.afternoonKid, kind: 'BOARDED' }))), 400);
  assert.equal(await code(as(T, s.driver, DRIVE, () => bus.board(trip.id, { studentId: other.kid, kind: 'BOARDED' }))), 400);
  // Someone who isn't crew can't mark anyone.
  assert.equal(await code(as(T, s.otherDriver, DRIVE, () => bus.board(trip.id, { studentId: s.kid, kind: 'BOARDED' }))), 403);

  // Bola's parent: on the bus, so no ETA.
  const onBus = await as(T, s.parent2, FAMILY, () => bus.familyBus(s.kid2));
  assert.equal(onBus.live?.childStatus, 'BOARDED');
  assert.equal(onBus.live?.etaMinutes, null);

  // Ada is absent today: then near Stop A, her parent gets no "near" message.
  await as(T, s.driver, DRIVE, () => bus.board(trip.id, { studentId: s.kid, kind: 'ABSENT' }));
  await as(T, s.driver, DRIVE, () => bus.ping(trip.id, [fix(STOP_A, now - 10_000)]));
  assert.equal((await notes(s.parent)).filter((n) => /near/.test(n.title)).length, 0);

  // Dropped at school.
  await as(T, s.driver, DRIVE, () => bus.board(trip.id, { studentId: s.kid2, kind: 'DROPPED' }));
  const dropped = (await notes(s.parent2)).filter((n) => /dropped off/.test(n.title));
  assert.equal(dropped.length, 1);
  assert.match(dropped[0]!.body ?? '', /at school/);

  // Staff log for today.
  const today = await as(T, s.staff, STAFF, () => bus.trips());
  assert.equal(today.length, 1);
  assert.deepEqual(today[0]!.log.map((l) => l.kind).sort(), ['ABSENT', 'BOARDED', 'DROPPED']);

  // End: the parent sees no bus any more, pings are refused, and it's audited.
  await as(T, s.driver, DRIVE, () => bus.endTrip(trip.id, 'DRIVER'));
  const afterEnd = await as(T, s.parent2, FAMILY, () => bus.familyBus(s.kid2));
  assert.equal(afterEnd.live, null);
  assert.equal(await code(as(T, s.driver, DRIVE, () => bus.ping(trip.id, [fix(STOP_A, Date.now())]))), 409);
  assert.equal(await code(as(T, s.driver, DRIVE, () => bus.board(trip.id, { studentId: s.kid, kind: 'BOARDED' }))), 409);
  assert.equal(await prisma.root.auditLog.count({ where: { tenantId: T, action: 'transport.trip_ended', entityId: trip.id } }), 1);
  assert.deepEqual(await as(T, s.staff, STAFF, () => bus.live()), []);
});

test('an afternoon trip carries only afternoon riders, and a silent trip is ended automatically', async (t) => {
  if (skip) return t.skip(skip);
  const T = s.tenantId;
  const trip = await as(T, s.assistant, DRIVE, () => bus.startTrip({ routeId: s.routeId, direction: 'AFTERNOON' }));
  assert.deepEqual(trip.stops.map((x) => x.name), ['Stop A', 'Stop B']);
  assert.deepEqual(trip.stops.flatMap((x) => x.students.map((k) => k.name)).sort(), ['Ada Rider', 'Chidi Rider']);
  // The morning-only rider's parent sees no live bus on an afternoon trip.
  assert.equal((await as(T, s.parent2, FAMILY, () => bus.familyBus(s.kid2))).live, null);
  assert.ok((await as(T, s.parent, FAMILY, () => bus.familyBus(s.kid))).live);
  // No position yet: a plain note instead of an ETA.
  assert.match((await as(T, s.parent, FAMILY, () => bus.familyBus(s.kid))).live?.etaNote ?? '', /first location/);

  const ended = await bus.autoEndSilentTrips(new Date(Date.now() + BUS_LIMITS.autoEndAfterMs + 60_000));
  assert.ok(ended >= 1);
  const row = await prisma.root.busTrip.findUniqueOrThrow({ where: { id: trip.id } });
  assert.equal(row.status, 'ENDED');
  assert.equal(row.endReason, 'AUTO');
});

test('retention: pings older than 30 days are deleted; the trip summary and boarding log stay', async (t) => {
  if (skip) return t.skip(skip);
  const T = s.tenantId;
  const tripRow = await prisma.root.busTrip.findFirstOrThrow({ where: { tenantId: T, direction: 'MORNING' } });
  const old = new Date(Date.now() - 31 * 86_400_000);
  await prisma.root.busPing.create({ data: { tenantId: T, tripId: tripRow.id, lat: 6.43, lng: 3.42, accuracy: 10, recordedAt: old, receivedAt: old } });
  const before = await prisma.root.busPing.count({ where: { tripId: tripRow.id } });
  const housekeeping = new m.HousekeepingService(prisma);
  const pruned = await housekeeping.prune(new Date());
  assert.ok(pruned.busPings >= 1);
  const afterCount = await prisma.root.busPing.count({ where: { tripId: tripRow.id } });
  assert.equal(afterCount, before - 1, 'only the old ping went');
  assert.ok(await prisma.root.busTrip.findUnique({ where: { id: tripRow.id } }), 'trip summary kept');
  assert.ok((await prisma.root.busBoarding.count({ where: { tripId: tripRow.id } })) >= 3, 'boarding log kept');
});

test('stop locations: staff set coordinates by stop name; unknown stops and half coordinates are refused', async (t) => {
  if (skip) return t.skip(skip);
  const T = s.tenantId;
  const pts = await as(T, s.staff, STAFF, () => bus.setStopLocations(s.routeId, { stops: [{ name: 'Stop A', lat: 6.5, lng: 3.5 }] }));
  assert.deepEqual(pts.find((p) => p.name === 'Stop A'), { name: 'Stop A', pickup: '06:40', dropoff: '15:50', lat: 6.5, lng: 3.5 });
  assert.equal(pts.find((p) => p.name === 'Stop B')?.lat, STOP_B.lat, 'other stops untouched');
  assert.equal(await code(as(T, s.staff, STAFF, () => bus.setStopLocations(s.routeId, { stops: [{ name: 'Nowhere', lat: 1, lng: 1 }] }))), 400);
  // Another school can't touch this route.
  assert.equal(await code(as(other.tenantId, other.staff, STAFF, () => bus.setStopLocations(s.routeId, { stops: [{ name: 'Stop A', lat: 1, lng: 1 }] }))), 404);
  const { stopLocationsSchema } = await import('@aischool/shared');
  assert.equal(stopLocationsSchema.safeParse({ stops: [{ name: 'Stop A', lat: 6.5, lng: null }] }).success, false);
});
