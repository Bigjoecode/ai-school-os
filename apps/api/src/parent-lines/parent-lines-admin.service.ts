import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DEFAULT_COMMS_SETTINGS,
  normalisePhone,
  type CommsSettings,
  type ParentLineOverrideInput,
  type ParentLinePlatformInput,
  type ParentLinePlatformView,
  type ParentLineSettings,
  type ParentLineSimulateInput,
  type ParentLineSimulateResult,
  type ParentLineStatus,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { decryptSecret, encryptSecret } from '../common/crypto-box';
import { currentTenantId, currentUserId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  hashSecret,
  loadPlatformLine,
  loadSchoolLine,
  newSecret,
  platformAtAccount,
  sameHash,
  saveSchoolLine,
  savePlatformLine,
  SCHOOL_PROVIDER,
  schoolAtAccount,
  type AtAccount,
  type PlatformLineConfig,
} from './parent-lines.config';
import { maskPhone, ParentLinesService, type LineScope } from './parent-lines.service';

const DAY = 86_400_000;

export interface LineRoute {
  scope: LineScope;
  account: AtAccount | null;
}

/** Settings, usage and the simulator for school staff; the shared line for the platform console; webhook routing. */
@Injectable()
export class ParentLinesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lines: ParentLinesService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- webhook routing

  /**
   * Which line a callback belongs to, from the long random secret in its URL
   * (Africa's Talking does not sign callbacks). The platform's shared line
   * serves every school; a school's own line only that school.
   */
  async route(secret: string): Promise<LineRoute | null> {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(secret)) return null;
    const hash = hashSecret(secret);
    const p = await loadPlatformLine(this.prisma);
    if (p.secretHash && sameHash(p.secretHash, hash)) {
      if (!p.enabled) return null;
      return { scope: { kind: 'shared' }, account: platformAtAccount(p) };
    }
    const row = await this.prisma.root.tenantIntegration.findFirst({ where: { provider: SCHOOL_PROVIDER, config: { path: ['override', 'secretHash'], equals: hash } }, select: { tenantId: true } });
    if (!row) return null;
    return { scope: { kind: 'school', tenantId: row.tenantId }, account: await schoolAtAccount(this.prisma, row.tenantId) };
  }

  // ---------------------------------------------------------------- school

  async status(origin: string): Promise<ParentLineStatus> {
    const tenantId = currentTenantId();
    const db = this.prisma.root;
    const [school, platform, tenant] = await Promise.all([
      loadSchoolLine(this.prisma, tenantId),
      loadPlatformLine(this.prisma),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { commsSettings: true, currency: true } }),
    ]);
    const comms = { ...DEFAULT_COMMS_SETTINGS, ...((tenant.commsSettings as Partial<CommsSettings> | null) ?? {}) };
    const since = new Date(Date.now() - 30 * DAY);
    const startOfDay = new Date(Date.now() - DAY);
    const real = { tenantId, simulated: false, createdAt: { gte: since } };
    const [sessions, sms, units, parents, byAction, today, recent, guardians, optedOut] = await Promise.all([
      db.parentLineRequest.findMany({ where: { ...real, channel: 'USSD' }, distinct: ['sessionId'], select: { sessionId: true } }),
      db.parentLineRequest.count({ where: { ...real, channel: 'SMS' } }),
      db.parentLineRequest.aggregate({ where: real, _sum: { smsUnits: true } }),
      db.parentLineRequest.findMany({ where: real, distinct: ['phone'], select: { phone: true } }),
      db.parentLineRequest.groupBy({ by: ['action'], where: real, _count: { _all: true } }),
      db.parentLineRequest.count({ where: { tenantId, simulated: false, createdAt: { gte: startOfDay } } }),
      db.parentLineRequest.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      db.guardian.findMany({ where: { tenantId }, select: { phone: true } }),
      db.guardian.count({ where: { tenantId, smsOptOutAt: { not: null } } }),
    ]);
    const smsUnits = units._sum.smsUnits ?? 0;
    const o = school.override;
    let secret: string | null = null;
    if (o) {
      try {
        secret = decryptSecret(o.secretEncrypted);
      } catch {
        secret = null;
      }
    }
    const integration = o ? await db.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: SCHOOL_PROVIDER } }, select: { secretHint: true } }) : null;
    return {
      settings: school.settings,
      ussdCode: o?.ussdCode ?? (platform.enabled ? platform.ussdCode : null),
      shortCode: o?.shortCode ?? (platform.enabled ? platform.shortCode : null),
      sharedReady: platform.enabled && !!platform.ussdCode,
      override: o
        ? {
            username: o.username,
            apiKeyHint: integration?.secretHint ?? '',
            ussdCode: o.ussdCode,
            shortCode: o.shortCode,
            sandbox: o.sandbox,
            ussdCallbackUrl: secret ? `${origin}/api/parent-lines/at/${secret}/ussd` : '',
            smsCallbackUrl: secret ? `${origin}/api/parent-lines/at/${secret}/sms` : '',
          }
        : null,
      guardiansWithPhone: guardians.filter((g) => normalisePhone(g.phone)).length,
      optedOut,
      smsPricePerUnitKobo: comms.smsPricePerUnitKobo,
      currency: tenant.currency,
      usage: {
        ussdSessions: sessions.length,
        smsRequests: sms,
        smsUnits,
        estimatedSmsCostKobo: smsUnits * comms.smsPricePerUnitKobo,
        parents: parents.length,
        byAction: byAction.map((a) => ({ action: a.action, count: a._count._all })).sort((a, b) => b.count - a.count),
        today,
      },
      recent: recent.map((r) => ({
        id: r.id,
        channel: r.channel as 'USSD' | 'SMS',
        simulated: r.simulated,
        phone: maskPhone(r.phone),
        input: r.input,
        action: r.action,
        status: r.status,
        reply: r.reply,
        smsUnits: r.smsUnits,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async saveSettings(input: ParentLineSettings, origin: string): Promise<ParentLineStatus> {
    const tenantId = currentTenantId();
    const prev = await loadSchoolLine(this.prisma, tenantId);
    await saveSchoolLine(this.prisma, tenantId, { ...prev, settings: input });
    const changes = [
      prev.settings.enabled !== input.enabled && (input.enabled ? 'switched it on' : 'switched it off'),
      prev.settings.consentBySms !== input.consentBySms && `consent by SMS ${input.consentBySms ? 'allowed' : 'not allowed'}`,
      prev.settings.dailySmsCapPerPhone !== input.dailySmsCapPerPhone && `daily SMS replies per phone ${input.dailySmsCapPerPhone}`,
    ].filter(Boolean);
    await this.audit.log({ action: 'comms.parent_line_settings', summary: `Parent SMS & USSD line: ${changes.join(', ') || 'settings saved'}` });
    return this.status(origin);
  }

  async saveOverride(input: ParentLineOverrideInput, origin: string): Promise<ParentLineStatus> {
    const tenantId = currentTenantId();
    const prev = await loadSchoolLine(this.prisma, tenantId);
    if (!prev.override && !input.apiKey) throw new BadRequestException({ statusCode: 400, message: 'Paste your Africa’s Talking API key', errors: [{ path: 'apiKey', message: 'Needed the first time' }] });
    if (!input.ussdCode && !input.shortCode) throw new BadRequestException('Enter your USSD code, your short code, or both');
    const secret = !prev.override || input.regenerateSecret ? newSecret() : null;
    let keepSecret = prev.override?.secretEncrypted ?? '';
    let keepHash = prev.override?.secretHash ?? '';
    if (secret) {
      keepSecret = encryptSecret(secret);
      keepHash = hashSecret(secret);
    }
    await saveSchoolLine(
      this.prisma,
      tenantId,
      {
        settings: prev.settings,
        override: {
          username: input.username,
          apiKeyHint: input.apiKey ? input.apiKey.slice(-4) : (prev.override?.apiKeyHint ?? ''),
          ussdCode: input.ussdCode,
          shortCode: input.shortCode,
          sandbox: input.sandbox,
          secretEncrypted: keepSecret,
          secretHash: keepHash,
        },
      },
      input.apiKey,
    );
    await this.audit.log({ action: 'comms.parent_line_own_code', summary: `Parent SMS & USSD line: saved the school's own Africa's Talking account (${[input.ussdCode, input.shortCode].filter(Boolean).join(', ')})${input.apiKey ? ', new API key' : ''}${input.regenerateSecret ? ', new callback URLs' : ''}` });
    return this.status(origin);
  }

  async removeOverride(origin: string): Promise<ParentLineStatus> {
    const tenantId = currentTenantId();
    const prev = await loadSchoolLine(this.prisma, tenantId);
    if (prev.override) {
      await saveSchoolLine(this.prisma, tenantId, { settings: prev.settings, override: null }, null);
      await this.audit.log({ action: 'comms.parent_line_own_code', summary: 'Parent SMS & USSD line: removed the school’s own code (back to the shared code)' });
    }
    return this.status(origin);
  }

  /**
   * Type as a parent: the replies exactly as they would go out, for this
   * school's parents only. Nothing is sent and nothing is saved on parents'
   * records (a YES is only logged as a test).
   */
  async simulate(input: ParentLineSimulateInput): Promise<ParentLineSimulateResult> {
    const tenantId = currentTenantId();
    const phone = normalisePhone(input.phone);
    if (!phone) throw new BadRequestException({ statusCode: 400, message: 'Enter a Nigerian phone number, e.g. 0803 123 4567', errors: [{ path: 'phone', message: 'Not a phone number' }] });
    const outbox: string[] = [];
    const req = { channel: input.channel, provider: 'simulator' as const, simulated: true, phone, sessionId: input.channel === 'USSD' ? `sim-${currentUserId()}-${phone}` : null, scope: { kind: 'school' as const, tenantId, ignoreSwitch: true }, account: null, outbox };
    const r = input.channel === 'USSD' ? await this.lines.ussd(req, input.text.trim()) : await this.lines.sms(req, input.text);
    return { reply: r.silent ? '(No reply: the line stays silent here, e.g. rate limit or repeated unknown number.)' : r.reply, end: r.end, sms: outbox };
  }

  // ---------------------------------------------------------------- platform

  async platformView(origin: string): Promise<ParentLinePlatformView> {
    const p = await loadPlatformLine(this.prisma);
    const db = this.prisma.root;
    const since = new Date(Date.now() - 30 * DAY);
    let secret: string | null = null;
    if (p.secretEncrypted) {
      try {
        secret = decryptSecret(p.secretEncrypted);
      } catch {
        secret = null;
      }
    }
    const rows = await db.tenantIntegration.findMany({ where: { provider: SCHOOL_PROVIDER }, select: { config: true } });
    const [sessions, sms, units, unknown] = await Promise.all([
      db.parentLineRequest.findMany({ where: { simulated: false, channel: 'USSD', createdAt: { gte: since } }, distinct: ['sessionId'], select: { sessionId: true } }),
      db.parentLineRequest.count({ where: { simulated: false, channel: 'SMS', createdAt: { gte: since } } }),
      db.parentLineRequest.aggregate({ where: { simulated: false, createdAt: { gte: since } }, _sum: { smsUnits: true } }),
      db.parentLineRequest.findMany({ where: { simulated: false, status: 'UNKNOWN_NUMBER', createdAt: { gte: since } }, distinct: ['phone'], select: { phone: true } }),
    ]);
    return {
      enabled: p.enabled,
      provider: p.provider,
      username: p.username,
      apiKeySaved: !!p.apiKeyEncrypted,
      apiKeyHint: p.apiKeyHint,
      ussdCode: p.ussdCode,
      shortCode: p.shortCode,
      sandbox: p.sandbox,
      brandName: p.brandName,
      ussdCallbackUrl: secret ? `${origin}/api/parent-lines/at/${secret}/ussd` : null,
      smsCallbackUrl: secret ? `${origin}/api/parent-lines/at/${secret}/sms` : null,
      genericSmsUrl: secret ? `${origin}/api/parent-lines/generic/${secret}/sms` : null,
      schoolsEnabled: rows.filter((r) => (r.config as { settings?: { enabled?: boolean } } | null)?.settings?.enabled).length,
      ussdSessions30d: sessions.length,
      smsRequests30d: sms,
      smsUnits30d: units._sum.smsUnits ?? 0,
      unknownNumbers30d: unknown.length,
    };
  }

  async savePlatform(input: ParentLinePlatformInput, origin: string): Promise<ParentLinePlatformView> {
    const prev = await loadPlatformLine(this.prisma);
    const secret = !prev.secretHash || input.regenerateSecret ? newSecret() : null;
    const next: PlatformLineConfig = {
      enabled: input.enabled,
      provider: input.provider,
      username: input.username,
      apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : prev.apiKeyEncrypted,
      apiKeyHint: input.apiKey ? input.apiKey.slice(-4) : prev.apiKeyHint,
      ussdCode: input.ussdCode,
      shortCode: input.shortCode,
      sandbox: input.sandbox,
      brandName: input.brandName,
      secretEncrypted: secret ? encryptSecret(secret) : prev.secretEncrypted,
      secretHash: secret ? hashSecret(secret) : prev.secretHash,
    };
    if (next.enabled && (!next.username || !next.apiKeyEncrypted)) throw new BadRequestException('Save the Africa’s Talking username and API key before switching the shared line on');
    if (next.enabled && !next.ussdCode && !next.shortCode) throw new BadRequestException('Enter the shared USSD code, short code, or both before switching the line on');
    await savePlatformLine(this.prisma, next, currentUserId());
    const changes = [
      prev.enabled !== next.enabled && (next.enabled ? 'switched on' : 'switched off'),
      prev.ussdCode !== next.ussdCode && `USSD code ${next.ussdCode ?? 'removed'}`,
      prev.shortCode !== next.shortCode && `short code ${next.shortCode ?? 'removed'}`,
      prev.sandbox !== next.sandbox && (next.sandbox ? 'sandbox' : 'live'),
      input.apiKey && 'new API key',
      input.regenerateSecret && 'new callback URLs',
    ].filter(Boolean);
    await this.audit.log({ action: 'platform.parent_line', tenantId: null, summary: `Shared parent SMS & USSD line: ${changes.join(', ') || 'settings saved'}` });
    return this.platformView(origin);
  }
}
