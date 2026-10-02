import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  aiRouteNoticeSchema,
  routeNoticeRequestSchema,
  transportAssignmentSchema,
  transportRouteSchema,
  vehicleSchema,
  type AiText,
  type RouteDetail,
  type RouteRow,
  type RouteStop,
  type RiderRow,
  type TransportOverview,
  type TransportRouteInput,
  type VehicleInput,
  type VehicleRow,
  type VehicleStatus,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RequireFeature, RequirePermissions } from '../common/decorators';
import { fullName } from '../common/format';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsService, armLabel } from './operations.service';
import { routeNoticePrompt } from './prompts';

const routeInclude = {
  vehicle: true,
  assignments: { select: { stop: true } },
} satisfies Prisma.TransportRouteInclude;
type RouteWithRefs = Prisma.TransportRouteGetPayload<{ include: typeof routeInclude }>;

const riderInclude = {
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      status: true,
      classArm: { select: { name: true, classLevel: { select: { name: true } } } },
      guardians: { orderBy: { isPrimary: 'desc' }, take: 1, select: { guardian: { select: { firstName: true, lastName: true, phone: true } } } },
    },
  },
} satisfies Prisma.TransportAssignmentInclude;

@Controller('transport')
@RequireFeature('transport')
export class TransportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: OperationsService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  private routeRow(r: RouteWithRefs): RouteRow {
    const stops = r.stops as unknown as RouteStop[];
    const riders = r.assignments.length;
    return {
      id: r.id,
      name: r.name,
      active: r.active,
      stops: stops.map((s) => ({ ...s, riders: r.assignments.filter((a) => a.stop === s.name).length })),
      vehicle: r.vehicle
        ? {
            id: r.vehicle.id,
            name: r.vehicle.name,
            plateNumber: r.vehicle.plateNumber,
            capacity: r.vehicle.capacity,
            status: r.vehicle.status as VehicleStatus,
            driverName: r.vehicle.driverName,
            driverPhone: r.vehicle.driverPhone,
          }
        : null,
      riders,
      overCapacity: r.vehicle ? Math.max(0, riders - r.vehicle.capacity) : 0,
    };
  }

  /** Students billed for the school bus this term (any TRANSPORT fee line). */
  private async billedStudentIds(): Promise<Set<string> | null> {
    const term = await this.ops.currentTerm();
    if (!term) return null;
    const lines = await this.prisma.db.invoiceLine.findMany({
      where: { feeItem: { category: 'TRANSPORT' }, invoice: { termId: term.id, status: { not: 'CANCELLED' } } },
      select: { invoice: { select: { studentId: true } } },
    });
    return new Set(lines.map((l) => l.invoice.studentId));
  }

  // ---------------------------------------------------------- overview

  @Get('overview')
  @RequirePermissions('transport.read')
  async overview(): Promise<TransportOverview> {
    const db = this.prisma.db;
    const [vehicles, routes, riders, billed] = await Promise.all([
      db.vehicle.findMany(),
      db.transportRoute.findMany({ include: routeInclude, orderBy: { name: 'asc' } }),
      db.transportAssignment.findMany({ include: { ...riderInclude, route: { select: { name: true } } } }),
      this.billedStudentIds(),
    ]);
    const assigned = new Set(riders.map((r) => r.studentId));
    const billedNotAssigned = billed
      ? await db.student.findMany({
          where: { id: { in: [...billed].filter((id) => !assigned.has(id)) }, status: 'ACTIVE' },
          select: { id: true, firstName: true, lastName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } },
          orderBy: { lastName: 'asc' },
        })
      : [];
    const routeRows = routes.map((r) => this.routeRow(r));
    return {
      vehicles: vehicles.length,
      activeVehicles: vehicles.filter((v) => v.status === 'ACTIVE').length,
      routes: routes.filter((r) => r.active).length,
      riders: riders.length,
      seats: routes.filter((r) => r.active && r.vehicle?.status === 'ACTIVE').reduce((n, r) => n + (r.vehicle?.capacity ?? 0), 0),
      unbilledRiders: billed
        ? riders
            .filter((r) => !billed.has(r.studentId))
            .map((r) => ({ id: r.student.id, name: fullName(r.student), classArm: armLabel(r.student.classArm), route: r.route.name }))
        : [],
      billedNotAssigned: billedNotAssigned.map((s) => ({ id: s.id, name: fullName(s), classArm: armLabel(s.classArm) })),
      routeList: routeRows,
    };
  }

  // ---------------------------------------------------------- vehicles

  @Get('vehicles')
  @RequirePermissions('transport.read')
  async vehicles(): Promise<VehicleRow[]> {
    const rows = await this.prisma.db.vehicle.findMany({
      include: { routes: { select: { id: true, name: true, _count: { select: { assignments: true } } } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((v) => ({
      id: v.id,
      name: v.name,
      plateNumber: v.plateNumber,
      capacity: v.capacity,
      driverName: v.driverName,
      driverPhone: v.driverPhone,
      assistantName: v.assistantName,
      status: v.status as VehicleStatus,
      notes: v.notes,
      routes: v.routes.map((r) => ({ id: r.id, name: r.name, riders: r._count.assignments })),
    }));
  }

  @Post('vehicles')
  @RequirePermissions('transport.manage')
  async createVehicle(@Body(new ZodPipe(vehicleSchema)) body: VehicleInput) {
    const v = await this.prisma.db.vehicle.create({ data: { ...body, tenantId: currentTenantId() } });
    await this.audit.log({ action: 'transport.vehicle_added', entityType: 'Vehicle', entityId: v.id, summary: `Added ${v.name} (${v.plateNumber}, ${v.capacity} seats)` });
    return v;
  }

  @Put('vehicles/:id')
  @RequirePermissions('transport.manage')
  async updateVehicle(@Param('id') id: string, @Body(new ZodPipe(vehicleSchema)) body: VehicleInput) {
    const before = await this.prisma.db.vehicle.findUniqueOrThrow({ where: { id } });
    const v = await this.prisma.db.vehicle.update({ where: { id }, data: body });
    if (before.status !== v.status) {
      await this.audit.log({ action: 'transport.vehicle_status', entityType: 'Vehicle', entityId: id, summary: `${v.name} (${v.plateNumber}) is now ${v.status.toLowerCase()}` });
    }
    return v;
  }

  @Delete('vehicles/:id')
  @HttpCode(204)
  @RequirePermissions('transport.manage')
  async deleteVehicle(@Param('id') id: string) {
    const v = await this.prisma.db.vehicle.findUniqueOrThrow({ where: { id } });
    await this.prisma.db.vehicle.delete({ where: { id } });
    await this.audit.log({ action: 'transport.vehicle_removed', entityType: 'Vehicle', entityId: id, summary: `Removed ${v.name} (${v.plateNumber}); its routes now have no vehicle` });
  }

  // ---------------------------------------------------------- routes

  @Get('routes')
  @RequirePermissions('transport.read')
  async routes(): Promise<RouteRow[]> {
    const rows = await this.prisma.db.transportRoute.findMany({ include: routeInclude, orderBy: { name: 'asc' } });
    return rows.map((r) => this.routeRow(r));
  }

  @Get('routes/:id')
  @RequirePermissions('transport.read')
  async route(@Param('id') id: string): Promise<RouteDetail> {
    const db = this.prisma.db;
    const [r, riders, billed] = await Promise.all([
      db.transportRoute.findUniqueOrThrow({ where: { id }, include: routeInclude }),
      db.transportAssignment.findMany({ where: { routeId: id }, include: riderInclude }),
      this.billedStudentIds(),
    ]);
    const order = new Map((r.stops as unknown as RouteStop[]).map((s, i) => [s.name, i]));
    const riderList: RiderRow[] = riders
      .map((a) => {
        const g = a.student.guardians[0]?.guardian;
        return {
          assignmentId: a.id,
          student: { id: a.student.id, name: fullName(a.student), admissionNumber: a.student.admissionNumber, classArm: armLabel(a.student.classArm) },
          stop: a.stop,
          direction: a.direction as RiderRow['direction'],
          guardian: g ? { name: fullName(g), phone: g.phone } : null,
          billed: billed ? billed.has(a.studentId) : false,
        };
      })
      .sort((a, b) => (order.get(a.stop) ?? 99) - (order.get(b.stop) ?? 99) || a.student.name.localeCompare(b.student.name));
    return { ...this.routeRow(r), riderList };
  }

  private async checkVehicle(vehicleId: string | null) {
    if (vehicleId) await this.prisma.db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  }

  private checkStops(stops: RouteStop[]) {
    const names = new Set<string>();
    for (const s of stops) {
      const k = s.name.toLowerCase();
      if (names.has(k)) throw new BadRequestException(`"${s.name}" appears twice on this route`);
      names.add(k);
    }
  }

  @Post('routes')
  @RequirePermissions('transport.manage')
  async createRoute(@Body(new ZodPipe(transportRouteSchema)) body: TransportRouteInput): Promise<RouteRow> {
    await this.checkVehicle(body.vehicleId);
    this.checkStops(body.stops);
    const r = await this.prisma.db.transportRoute.create({
      data: { ...body, stops: body.stops as unknown as Prisma.InputJsonValue, tenantId: currentTenantId() },
      include: routeInclude,
    });
    await this.audit.log({ action: 'transport.route_added', entityType: 'TransportRoute', entityId: r.id, summary: `Added route ${r.name} with ${body.stops.length} stops` });
    return this.routeRow(r);
  }

  @Put('routes/:id')
  @RequirePermissions('transport.manage')
  async updateRoute(@Param('id') id: string, @Body(new ZodPipe(transportRouteSchema)) body: TransportRouteInput): Promise<RouteRow> {
    await this.checkVehicle(body.vehicleId);
    this.checkStops(body.stops);
    const stops = new Set(body.stops.map((s) => s.name));
    const stranded = await this.prisma.db.transportAssignment.findMany({ where: { routeId: id, stop: { notIn: [...stops] } }, select: { stop: true } });
    if (stranded.length) {
      throw new BadRequestException(`${stranded.length} rider${stranded.length === 1 ? ' uses' : 's use'} the stop "${stranded[0]!.stop}" — move them to another stop before removing or renaming it`);
    }
    const r = await this.prisma.db.transportRoute.update({ where: { id }, data: { ...body, stops: body.stops as unknown as Prisma.InputJsonValue }, include: routeInclude });
    return this.routeRow(r);
  }

  @Delete('routes/:id')
  @HttpCode(204)
  @RequirePermissions('transport.manage')
  async deleteRoute(@Param('id') id: string) {
    const r = await this.prisma.db.transportRoute.findUniqueOrThrow({ where: { id }, include: { _count: { select: { assignments: true } } } });
    if (r._count.assignments) throw new BadRequestException(`${r._count.assignments} students ride this route — move them first`);
    await this.prisma.db.transportRoute.delete({ where: { id } });
    await this.audit.log({ action: 'transport.route_removed', entityType: 'TransportRoute', entityId: id, summary: `Removed route ${r.name}` });
  }

  // ---------------------------------------------------------- riders

  @Post('assignments')
  @RequirePermissions('transport.manage')
  async assign(@Body(new ZodPipe(transportAssignmentSchema)) body: z.infer<typeof transportAssignmentSchema>): Promise<RouteDetail> {
    const db = this.prisma.db;
    const route = await db.transportRoute.findUniqueOrThrow({ where: { id: body.routeId } });
    if (!(route.stops as unknown as RouteStop[]).some((s) => s.name === body.stop)) throw new BadRequestException(`"${body.stop}" is not a stop on ${route.name}`);
    const students = await db.student.findMany({ where: { id: { in: body.studentIds } } });
    if (students.length !== new Set(body.studentIds).size) throw new BadRequestException('Some students were not found');
    const gone = students.find((s) => s.status !== 'ACTIVE');
    if (gone) throw new BadRequestException(`${fullName(gone)} is not an active student`);
    const tenantId = currentTenantId();
    await db.$transaction(
      students.map((s) =>
        db.transportAssignment.upsert({
          where: { studentId: s.id },
          update: { routeId: route.id, stop: body.stop, direction: body.direction },
          create: { tenantId, studentId: s.id, routeId: route.id, stop: body.stop, direction: body.direction },
        }),
      ),
    );
    await this.audit.log({
      action: 'transport.assigned',
      entityType: 'TransportRoute',
      entityId: route.id,
      summary: `Put ${students.length === 1 ? fullName(students[0]!) : `${students.length} students`} on ${route.name} (${body.stop})`,
    });
    return this.route(route.id);
  }

  @Delete('assignments/:id')
  @HttpCode(204)
  @RequirePermissions('transport.manage')
  async unassign(@Param('id') id: string) {
    const a = await this.prisma.db.transportAssignment.findUniqueOrThrow({ where: { id }, include: { student: true, route: true } });
    await this.prisma.db.transportAssignment.delete({ where: { id } });
    await this.audit.log({ action: 'transport.unassigned', entityType: 'TransportRoute', entityId: a.routeId, summary: `Took ${fullName(a.student)} off ${a.route.name}` });
  }

  // ---------------------------------------------------------- AI

  /** Drafts a notice to the route's parents (nothing is sent). */
  @Post('routes/:id/notice')
  @HttpCode(200)
  @RequirePermissions('transport.read', 'ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async notice(@Param('id') id: string, @Body(new ZodPipe(routeNoticeRequestSchema)) body: z.infer<typeof routeNoticeRequestSchema>) {
    const r = await this.route(id);
    const school = await this.ops.school();
    const facts = [
      `Route: ${r.name}${r.vehicle ? `, ${r.vehicle.name} (${r.vehicle.plateNumber})${r.vehicle.driverName ? `, driver ${r.vehicle.driverName}` : ''}` : ''}.`,
      `Stops and usual times (pick-up / drop-off): ${r.stops.map((s) => `${s.name} ${s.pickup} / ${s.dropoff}`).join('; ')}.`,
      `Today is ${school.today}, time now ${school.now.time}.`,
      `What has happened: ${body.situation}`,
      school.phone ? `School phone for enquiries: ${school.phone}.` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const { system, user } = routeNoticePrompt(school.name, facts);
    const res = await this.gateway.generateJson({ tier: 'standard', system, messages: [{ role: 'user', content: user }] }, aiRouteNoticeSchema, 'route-notice');
    const phones = r.riderList.map((x) => x.guardian?.phone).filter((p): p is string => !!p);
    return { ...res.data, recipients: new Set(phones).size, riders: r.riders, text: res.data.message, provider: res.provider, model: res.model } satisfies AiText & Record<string, unknown>;
  }
}
