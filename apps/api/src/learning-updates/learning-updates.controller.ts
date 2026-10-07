import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import {
  learningUpdateSendSchema,
  learningUpdateSettingsSchema,
  learningUpdateSubscriptionSchema,
  type LearningUpdateList,
  type LearningUpdatePreview,
  type LearningUpdateSendInput,
  type LearningUpdateSendResult,
  type LearningUpdateSettings,
  type LearningUpdateStatus,
  type LearningUpdateView,
} from '@aischool/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { Public, RequirePermissions } from '../common/decorators';
import { parentLanguage } from '../common/language';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { LearningUpdatesService } from './learning-updates.service';
import { readStopToken } from './unsubscribe-token';

type Viewer = { role: 'PARENT' | 'STUDENT'; childIds: Set<string> };

@Controller('learning-updates')
export class LearningUpdatesController {
  constructor(
    private readonly updates: LearningUpdatesService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- staff

  @Get('status')
  @RequirePermissions('school.read')
  status(): Promise<LearningUpdateStatus> {
    return this.updates.status(currentTenantId());
  }

  @Put('settings')
  @RequirePermissions('school.manage')
  async saveSettings(@Body(new ZodPipe(learningUpdateSettingsSchema)) body: LearningUpdateSettings): Promise<LearningUpdateSettings> {
    const saved = await this.updates.saveSettings(currentTenantId(), body);
    await this.audit.log({
      action: 'learning_updates.settings_updated',
      entityType: 'Tenant',
      entityId: currentTenantId(),
      summary: body.enabled ? `Weekly learning updates on (${body.time}, day ${body.day})${body.sms ? ' with SMS' : ''}` : 'Weekly learning updates turned off',
    });
    return saved;
  }

  @Get('preview')
  @RequirePermissions('school.read', 'students.read')
  preview(@Query(new ZodPipe(z.object({ studentId: z.string().min(1) }))) q: { studentId: string }): Promise<LearningUpdatePreview> {
    return this.updates.preview(currentTenantId(), q.studentId);
  }

  @Post('send-now')
  @HttpCode(200)
  @RequirePermissions('school.manage')
  async sendNow(@Body(new ZodPipe(learningUpdateSendSchema)) body: LearningUpdateSendInput): Promise<LearningUpdateSendResult> {
    const r = await this.updates.sendNow(currentTenantId(), body);
    await this.audit.log({
      action: 'learning_updates.sent_now',
      entityType: body.studentId ? 'Student' : 'ClassArm',
      entityId: (body.studentId ?? body.classArmId)!,
      summary: `Sent this week's learning updates now: ${r.sent} sent, ${r.alreadySent} already sent, ${r.skipped} skipped`,
    });
    return r;
  }

  // ---------------------------------------------------------- families

  @Get('students/:id')
  async list(@Param('id') id: string): Promise<LearningUpdateList> {
    const v = await this.viewer();
    this.mustSee(v, id);
    const tenantId = currentTenantId();
    const [settings, updates, optedOut] = await Promise.all([
      this.updates.settings(tenantId),
      this.updates.list(tenantId, id, v.role === 'PARENT' ? await parentLanguage(this.prisma, tenantId, currentContext().userId!) : 'EN'),
      v.role === 'PARENT' ? this.updates.optedOut(tenantId, currentContext().userId!) : false,
    ]);
    return { enabled: settings.enabled && (v.role === 'PARENT' || settings.students), optedOut, role: v.role, updates: v.role === 'STUDENT' && !settings.students ? [] : updates };
  }

  @Get('students/:id/:updateId')
  async one(@Param('id') id: string, @Param('updateId') updateId: string): Promise<LearningUpdateView> {
    const v = await this.viewer();
    this.mustSee(v, id);
    const tenantId = currentTenantId();
    return this.updates.one(tenantId, id, updateId, v.role === 'PARENT' ? await parentLanguage(this.prisma, tenantId, currentContext().userId!) : 'EN');
  }

  @Put('subscription')
  async subscription(@Body(new ZodPipe(learningUpdateSubscriptionSchema)) body: { on: boolean }): Promise<{ optedOut: boolean }> {
    const v = await this.viewer();
    if (v.role !== 'PARENT') throw new ForbiddenException('Only parents can change this');
    await this.updates.setOptOut(currentTenantId(), currentContext().userId!, !body.on);
    return { optedOut: !body.on };
  }

  // ---------------------------------------------------------- the link in emails and texts (no sign-in)

  @Public()
  @Get('stop/:token')
  async stopPage(@Param('token') token: string, @Res() res: Response) {
    const id = readStopToken(token);
    const g = id ? await this.updates.guardianInfo(id) : null;
    if (!g) return void res.status(404).type('html').send(page('Link not recognised', '<p>This link isn’t valid any more. You can turn the weekly updates on or off in the school portal under My school → Learning updates.</p>'));
    res.type('html').send(
      g.off
        ? page('Weekly learning updates are off', `<p>Hello ${esc(g.firstName)}, you’ve turned off the weekly learning updates from ${esc(g.school)}.</p>${button(token, 'on', 'Turn them back on')}`)
        : page('Stop weekly learning updates?', `<p>Hello ${esc(g.firstName)}, you get a short weekly note from ${esc(g.school)} about how your child is learning.</p>${button(token, 'off', 'Stop these updates')}<p class="m">Other school messages (fees, events, emergencies) are not affected.</p>`),
    );
  }

  @Public()
  @Post('stop/:token/:action')
  @HttpCode(200)
  async stop(@Param('token') token: string, @Param('action') action: string, @Res() res: Response) {
    const id = readStopToken(token);
    const off = action !== 'on';
    const g = id && (action === 'on' || action === 'off') ? await this.updates.setOptOutByGuardian(id, off) : null;
    if (!g) return void res.status(404).type('html').send(page('Link not recognised', '<p>This link isn’t valid any more.</p>'));
    res.type('html').send(
      off
        ? page('Updates stopped', `<p>Thank you, ${esc(g.firstName)}. You won’t get the weekly learning updates from ${esc(g.school)} any more.</p>${button(token, 'on', 'Changed your mind? Turn them back on')}`)
        : page('Updates turned back on', `<p>Thank you, ${esc(g.firstName)}. You’ll get the weekly learning update from ${esc(g.school)} again.</p>`),
    );
  }

  // ---------------------------------------------------------- helpers (as the portal)

  private async viewer(): Promise<Viewer> {
    const ctx = currentContext();
    const db = this.prisma.db;
    if (ctx.permissions.has('family.manage')) {
      const links = await db.studentGuardian.findMany({ where: { guardian: { userId: ctx.userId }, student: { status: 'ACTIVE' } }, select: { studentId: true } });
      return { role: 'PARENT', childIds: new Set(links.map((l) => l.studentId)) };
    }
    if (ctx.permissions.has('learning.use')) {
      const me = await db.student.findFirst({ where: { userId: ctx.userId, status: 'ACTIVE' }, select: { id: true } });
      if (me) return { role: 'STUDENT', childIds: new Set([me.id]) };
    }
    throw new ForbiddenException('Learning updates are for parents and students');
  }

  private mustSee(v: Viewer, studentId: string) {
    if (!v.childIds.has(studentId)) throw new ForbiddenException(v.role === 'PARENT' ? 'You can only see your own children' : 'You can only see your own records');
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const button = (token: string, action: 'on' | 'off', label: string) =>
  `<form method="post" action="/api/learning-updates/stop/${encodeURIComponent(token)}/${action}"><button type="submit">${esc(label)}</button></form>`;

/** A tiny self-contained page that works on any phone browser. */
function page(title: string, body: string): string {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430}main{max-width:480px;margin:32px auto;background:#fff;border-radius:12px;padding:24px 20px}h1{font-size:20px;margin:0 0 12px}p{line-height:1.55;font-size:15px}.m{color:#6b7280;font-size:13px}button{font:inherit;font-size:15px;background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:12px 18px;min-height:44px;cursor:pointer}</style></head>
<body><main><h1>${esc(title)}</h1>${body}</main></body></html>`;
}
