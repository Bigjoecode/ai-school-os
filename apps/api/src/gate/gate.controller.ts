import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  authorisedPickupSchema,
  collectSchema,
  gateScanSchema,
  gateSettingsSchema,
  pickupNoticeSchema,
  type AuthorisedPickupInput,
  type AuthorisedPickupRow,
  type CollectInput,
  type CollectResult,
  type GateChild,
  type GateEventRow,
  type GatePassBatch,
  type GateScanInput,
  type GateScanResult,
  type GateSettings,
  type GateSettingsView,
  type GateToday,
  type PickupNoticeInput,
  type PickupNoticeResult,
  type PortalArrival,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { FilesService } from '../files/files.service';
import { GateService } from './gate.service';

/** Gate and pick-up work: reception staff, or anyone who manages attendance. */
function assertGate() {
  const p = currentContext().permissions;
  if (!p.has('reception.manage') && !p.has('attendance.manage')) throw new ForbiddenException('The gate is for reception staff and attendance managers');
}

function uid(): string {
  const id = currentContext().userId;
  if (!id) throw new ForbiddenException('Sign in first');
  return id;
}

async function sendPhoto(files: FilesService, res: Response, fileId: string) {
  const f = await files.read(fileId, false);
  res.setHeader('content-type', f.mimeType);
  res.setHeader('content-length', String(f.data.length));
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-security-policy', "default-src 'none'; img-src 'self'; sandbox");
  res.setHeader('cache-control', 'private, max-age=300');
  res.end(f.data);
}

const idsQuery = z.object({ classArmId: z.string().optional(), ids: z.string().optional() });

/** The gate screen, pick-up desk, gate passes and settings (staff). */
@Controller('gate')
export class GateController {
  constructor(
    private readonly gate: GateService,
    private readonly files: FilesService,
  ) {}

  @Get('settings')
  @RequirePermissions('attendance.read')
  settings(): Promise<GateSettingsView> {
    return this.gate.settingsView(currentTenantId());
  }

  @Put('settings')
  @RequirePermissions('attendance.manage')
  saveSettings(@Body(new ZodPipe(gateSettingsSchema)) body: GateSettings): Promise<GateSettingsView> {
    return this.gate.saveSettings(currentTenantId(), body);
  }

  @Get('today')
  today(): Promise<GateToday> {
    assertGate();
    return this.gate.today(currentTenantId());
  }

  @Get('students')
  search(@Query(new ZodPipe(z.object({ q: z.string().trim().max(80).default('') }))) q: { q: string }): Promise<GateChild[]> {
    assertGate();
    return this.gate.search(currentTenantId(), q.q);
  }

  @Get('students/:id')
  child(@Param('id') id: string): Promise<GateChild> {
    assertGate();
    return this.gate.child(currentTenantId(), id);
  }

  /** A scanned pass (or a child picked by name): first of the day = arrival, later = departure. */
  @Post('scan')
  @HttpCode(200)
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  scan(@Body(new ZodPipe(gateScanSchema)) body: GateScanInput): Promise<GateScanResult> {
    assertGate();
    return this.gate.scan(currentTenantId(), uid(), body);
  }

  @Post('events/:id/undo')
  @HttpCode(200)
  undo(@Param('id') id: string): Promise<GateEventRow> {
    assertGate();
    return this.gate.undo(currentTenantId(), uid(), id);
  }

  /** Releases a child to a guardian, an authorised person, a delegate with today's code, or (override, audited) someone else. */
  @Post('collect')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  collect(@Body(new ZodPipe(collectSchema)) body: CollectInput): Promise<CollectResult> {
    assertGate();
    return this.gate.collect(currentTenantId(), uid(), body);
  }

  // ---------------------------------------------------------------- authorised people (staff)

  @Get('students/:id/pickup-people')
  people(@Param('id') id: string): Promise<AuthorisedPickupRow[]> {
    assertGate();
    return this.gate.people(currentTenantId(), id);
  }

  @Post('students/:id/pickup-people')
  addPerson(@Param('id') id: string, @Body(new ZodPipe(authorisedPickupSchema)) body: AuthorisedPickupInput): Promise<AuthorisedPickupRow> {
    assertGate();
    return this.gate.savePerson(currentTenantId(), id, body, { userId: uid(), role: 'STAFF' });
  }

  @Put('students/:id/pickup-people/:pid')
  updatePerson(@Param('id') id: string, @Param('pid') pid: string, @Body(new ZodPipe(authorisedPickupSchema)) body: AuthorisedPickupInput): Promise<AuthorisedPickupRow> {
    assertGate();
    return this.gate.savePerson(currentTenantId(), id, body, { userId: uid(), role: 'STAFF' }, pid);
  }

  @Delete('students/:id/pickup-people/:pid')
  @HttpCode(204)
  async removePerson(@Param('id') id: string, @Param('pid') pid: string): Promise<void> {
    assertGate();
    await this.gate.removePerson(currentTenantId(), id, pid, { role: 'STAFF' });
  }

  @Get('pickup-people/:id/photo')
  async personPhoto(@Param('id') id: string, @Res() res: Response) {
    assertGate();
    await sendPhoto(this.files, res, (await this.gate.photoFile(currentTenantId(), 'person', id)).fileId);
  }

  @Get('notices/:id/photo')
  async noticePhoto(@Param('id') id: string, @Res() res: Response) {
    assertGate();
    await sendPhoto(this.files, res, (await this.gate.photoFile(currentTenantId(), 'notice', id)).fileId);
  }

  // ---------------------------------------------------------------- gate passes

  @Get('passes')
  passes(@Query(new ZodPipe(idsQuery)) q: { classArmId?: string; ids?: string }): Promise<GatePassBatch> {
    const p = currentContext().permissions;
    if (!p.has('documents.issue')) assertGate();
    return this.gate.passes(currentTenantId(), { classArmId: q.classArmId, ids: q.ids?.split(',').filter(Boolean) });
  }

  @Post('students/:id/pass/reissue')
  @HttpCode(204)
  async reissue(@Param('id') id: string): Promise<void> {
    assertGate();
    await this.gate.reissuePass(currentTenantId(), id);
  }
}

/** Parents: today's arrival and pick-up, the pick-up list, and today's notices. Only for their own children. */
@Controller('portal/students/:id')
export class GateFamilyController {
  constructor(
    private readonly gate: GateService,
    private readonly files: FilesService,
  ) {}

  private async parent(studentId: string) {
    const ctx = currentContext();
    if (!ctx.permissions.has('family.manage')) throw new ForbiddenException('Pick-up is managed by parents');
    const userId = uid();
    return { ...(await this.gate.guardianFor(currentTenantId(), userId, studentId)), userId };
  }

  @Get('arrival')
  async arrival(@Param('id') id: string): Promise<PortalArrival> {
    await this.parent(id);
    return this.gate.portal(currentTenantId(), id);
  }

  @Post('pickup-people')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async addPerson(@Param('id') id: string, @Body(new ZodPipe(authorisedPickupSchema)) body: AuthorisedPickupInput): Promise<AuthorisedPickupRow> {
    const p = await this.parent(id);
    return this.gate.savePerson(currentTenantId(), id, body, { userId: p.userId, role: 'PARENT' });
  }

  @Put('pickup-people/:pid')
  async updatePerson(@Param('id') id: string, @Param('pid') pid: string, @Body(new ZodPipe(authorisedPickupSchema)) body: AuthorisedPickupInput): Promise<AuthorisedPickupRow> {
    const p = await this.parent(id);
    return this.gate.savePerson(currentTenantId(), id, body, { userId: p.userId, role: 'PARENT' }, pid);
  }

  @Delete('pickup-people/:pid')
  @HttpCode(204)
  async removePerson(@Param('id') id: string, @Param('pid') pid: string): Promise<void> {
    await this.parent(id);
    await this.gate.removePerson(currentTenantId(), id, pid, { role: 'PARENT' });
  }

  @Get('pickup-people/:pid/photo')
  async personPhoto(@Param('id') id: string, @Param('pid') pid: string, @Res() res: Response) {
    await this.parent(id);
    const f = await this.gate.photoFile(currentTenantId(), 'person', pid);
    if (f.studentId !== id) throw new ForbiddenException('Not your child');
    await sendPhoto(this.files, res, f.fileId);
  }

  /** Running late, a new pick-up time, or someone else collecting today (texted a one-time code). */
  @Post('pickup-notices')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async notice(@Param('id') id: string, @Body(new ZodPipe(pickupNoticeSchema)) body: PickupNoticeInput): Promise<PickupNoticeResult> {
    const p = await this.parent(id);
    return this.gate.createNotice(currentTenantId(), id, body, p);
  }

  @Post('pickup-notices/:nid/cancel')
  @HttpCode(204)
  async cancel(@Param('id') id: string, @Param('nid') nid: string): Promise<void> {
    const p = await this.parent(id);
    await this.gate.cancelNotice(currentTenantId(), id, nid, p.userId);
  }

  @Get('pickup-notices/:nid/photo')
  async noticePhoto(@Param('id') id: string, @Param('nid') nid: string, @Res() res: Response) {
    await this.parent(id);
    const f = await this.gate.photoFile(currentTenantId(), 'notice', nid);
    if (f.studentId !== id) throw new ForbiddenException('Not your child');
    await sendPhoto(this.files, res, f.fileId);
  }
}
