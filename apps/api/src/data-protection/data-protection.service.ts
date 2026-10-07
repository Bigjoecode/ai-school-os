import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_DATA_PROTECTION_SETTINGS,
  DPA_VERSION,
  LEGAL_VERSIONS,
  PRIVACY_NOTICE_VERSION,
  type ConsentCoverage,
  type ConsentState,
  type DataProtectionOverview,
  type DataProtectionSettings,
  type DpaAcceptInput,
  type DsrCloseInput,
  type DsrKind,
  type DsrLogInput,
  type DsrRequestRow,
  type DsrSubjectType,
  type MyConsentStatus,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { line } from '../backup/backup.service';
import { currentTenantId, currentUserId } from '../common/request-context';
import type { Prisma } from '../generated/prisma/client';
import { FeatureService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';

const A = {
  given: 'privacy.consent_given',
  withdrawn: 'privacy.consent_withdrawn',
  settings: 'privacy.settings_updated',
  dpa: 'privacy.dpa_accepted',
  requestLogged: 'privacy.request_logged',
  requestClosed: 'privacy.request_closed',
  consentsExported: 'privacy.consents_exported',
} as const;

const BOM = '﻿';
const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

/**
 * NDPA tools: parental consent to the privacy notice, the school's Data
 * Processing Agreement acceptance and its settings (kept in
 * Tenant.portalSettings.dataProtection), consent reporting, and the log of
 * data subject requests (kept in the append-only audit log).
 */
@Injectable()
export class DataProtectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly features: FeatureService,
  ) {}

  // ------------------------------------------------------------------ settings

  async settings(tenantId: string): Promise<DataProtectionSettings> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { portalSettings: true } });
    const saved = (t.portalSettings as { dataProtection?: Partial<DataProtectionSettings> } | null)?.dataProtection ?? {};
    return {
      consentRequired: typeof saved.consentRequired === 'boolean' ? saved.consentRequired : DEFAULT_DATA_PROTECTION_SETTINGS.consentRequired,
      dpa: saved.dpa ?? null,
    };
  }

  private async writeSettings(tenantId: string, next: DataProtectionSettings) {
    // Read-modify-write so the portal's own settings and the learning-update settings stay as they are.
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { portalSettings: true } });
    const portal = (t.portalSettings as Record<string, unknown> | null) ?? {};
    await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { portalSettings: { ...portal, dataProtection: next } as unknown as Prisma.InputJsonValue } });
  }

  async setConsentRequired(consentRequired: boolean): Promise<DataProtectionSettings> {
    const tenantId = currentTenantId();
    const prev = await this.settings(tenantId);
    const next = { ...prev, consentRequired };
    await this.writeSettings(tenantId, next);
    if (prev.consentRequired !== consentRequired) {
      await this.audit.log({
        action: A.settings,
        entityType: 'Tenant',
        entityId: tenantId,
        summary: consentRequired
          ? 'Parents must now accept the privacy notice before using the portal'
          : 'Parents can now use the portal before accepting the privacy notice (they are still asked)',
        metadata: { consentRequired },
      });
    }
    return next;
  }

  async acceptDpa(input: DpaAcceptInput): Promise<DataProtectionSettings> {
    if (input.version !== DPA_VERSION) throw new BadRequestException('This version of the agreement is out of date. Reload the page and read the current one.');
    const tenantId = currentTenantId();
    const userId = currentUserId();
    const user = await this.prisma.root.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const prev = await this.settings(tenantId);
    const next: DataProtectionSettings = {
      ...prev,
      dpa: {
        version: DPA_VERSION,
        acceptedAt: new Date().toISOString(),
        acceptedByUserId: userId,
        acceptedByName: fullName(user),
        signatoryName: input.signatoryName,
        signatoryTitle: input.signatoryTitle,
      },
    };
    await this.writeSettings(tenantId, next);
    await this.audit.log({
      action: A.dpa,
      entityType: 'Tenant',
      entityId: tenantId,
      summary: `Accepted the Data Processing Agreement (version ${DPA_VERSION}) for the school — ${input.signatoryName}, ${input.signatoryTitle}`,
      metadata: { version: DPA_VERSION, signatoryName: input.signatoryName, signatoryTitle: input.signatoryTitle },
    });
    return next;
  }

  // ------------------------------------------------------------------ parental consent

  private async myGuardians(tenantId: string, userId: string) {
    return this.prisma.root.guardian.findMany({
      where: { tenantId, userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dataConsentAt: true,
        dataConsentVersion: true,
        students: { select: { student: { select: { firstName: true, lastName: true, status: true } } } },
      },
    });
  }

  async myStatus(): Promise<MyConsentStatus> {
    const tenantId = currentTenantId();
    const userId = currentUserId();
    const [guardians, settings, tenant, membership, aiOn, whatsapp] = await Promise.all([
      this.myGuardians(tenantId, userId),
      this.settings(tenantId),
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } }),
      this.prisma.root.membership.findFirst({ where: { tenantId, userId }, select: { roles: { select: { role: { select: { key: true } } } } } }),
      this.features.isEnabled(tenantId, 'ai'),
      this.whatsappAssistantOn(tenantId),
    ]);
    const history = guardians.length
      ? await this.prisma.root.auditLog.findMany({
          where: { tenantId, entityType: 'Guardian', entityId: { in: guardians.map((g) => g.id) }, action: { in: [A.given, A.withdrawn] } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { action: true, createdAt: true, metadata: true },
        })
      : [];
    const applies = guardians.length > 0;
    const state = consentState(guardians, history[0]?.action === A.withdrawn);
    const roleKeys = membership?.roles.map((r) => r.role.key) ?? [];
    const onlyParent = roleKeys.length > 0 && roleKeys.every((k) => k === 'parent');
    const consented = guardians.find((g) => g.dataConsentAt);
    const children = [...new Set(guardians.flatMap((g) => g.students.filter((s) => s.student.status === 'ACTIVE').map((s) => fullName(s.student))))];
    const lastWithdrawal = history.find((h) => h.action === A.withdrawn);
    return {
      applies,
      required: settings.consentRequired,
      blocking: applies && settings.consentRequired && state !== 'CURRENT' && onlyParent,
      state: applies ? state : 'PENDING',
      currentVersion: PRIVACY_NOTICE_VERSION,
      consentedAt: consented?.dataConsentAt?.toISOString() ?? null,
      consentedVersion: consented?.dataConsentVersion ?? null,
      withdrawnAt: state === 'WITHDRAWN' && lastWithdrawal ? lastWithdrawal.createdAt.toISOString() : null,
      schoolName: tenant.name,
      children,
      features: { aiTutor: aiOn, parentAi: aiOn, whatsappAssistant: whatsapp },
      // One entry per action, even when a parent has several guardian records in the school.
      history: dedupe(
        history.map((h) => ({
          at: h.createdAt.toISOString(),
          action: h.action === A.given ? ('GIVEN' as const) : ('WITHDRAWN' as const),
          version: ((h.metadata ?? {}) as { version?: string }).version ?? null,
        })),
      ),
    };
  }

  async accept(version: string): Promise<MyConsentStatus> {
    if (version !== PRIVACY_NOTICE_VERSION) throw new BadRequestException('The privacy notice has changed. Reload the page and read the current version.');
    const tenantId = currentTenantId();
    const userId = currentUserId();
    const guardians = await this.myGuardians(tenantId, userId);
    if (!guardians.length) throw new BadRequestException('Only parents and guardians of this school give this consent');
    const now = new Date();
    await this.prisma.root.guardian.updateMany({ where: { tenantId, userId }, data: { dataConsentAt: now, dataConsentVersion: PRIVACY_NOTICE_VERSION } });
    const [aiOn, whatsapp] = await Promise.all([this.features.isEnabled(tenantId, 'ai'), this.whatsappAssistantOn(tenantId)]);
    for (const g of guardians) {
      const children = g.students.map((s) => fullName(s.student));
      await this.audit.log({
        action: A.given,
        entityType: 'Guardian',
        entityId: g.id,
        summary: `${fullName(g)} agreed to the privacy notice (version ${PRIVACY_NOTICE_VERSION}) on behalf of ${children.join(', ') || 'their children'}`,
        metadata: { version: PRIVACY_NOTICE_VERSION, children, optionalFeaturesShown: { aiTutor: aiOn, parentAi: aiOn, whatsappAssistant: whatsapp } },
      });
    }
    return this.myStatus();
  }

  async withdraw(reason: string | null): Promise<MyConsentStatus> {
    const tenantId = currentTenantId();
    const userId = currentUserId();
    const guardians = await this.myGuardians(tenantId, userId);
    if (!guardians.length) throw new BadRequestException('Only parents and guardians of this school can withdraw this consent');
    if (!guardians.some((g) => g.dataConsentAt)) throw new BadRequestException('There is no consent on record to withdraw');
    // The record of what was agreed, and when, stays in the audit log; the school decides any follow-up (nothing is deleted automatically).
    await this.prisma.root.guardian.updateMany({ where: { tenantId, userId }, data: { dataConsentAt: null, dataConsentVersion: null } });
    for (const g of guardians) {
      await this.audit.log({
        action: A.withdrawn,
        entityType: 'Guardian',
        entityId: g.id,
        summary: `${fullName(g)} withdrew consent to the privacy notice${reason ? ` — “${reason.slice(0, 200)}”` : ''}`,
        metadata: { previousVersion: g.dataConsentVersion, previousConsentAt: g.dataConsentAt?.toISOString() ?? null, reason },
      });
    }
    const name = fullName(guardians[0]!);
    const admins = await this.prisma.root.membership.findMany({
      where: { tenantId, status: 'ACTIVE', roles: { some: { role: { permissions: { has: 'school.manage' } } } } },
      select: { userId: true },
      take: 50,
    });
    if (admins.length) {
      await this.prisma.root.notification.createMany({
        data: admins.map((a) => ({
          tenantId,
          userId: a.userId,
          title: `${name} withdrew data protection consent`,
          body: `${reason ? `Reason given: “${reason.slice(0, 300)}”. ` : ''}Nothing has been deleted. Decide the follow-up in Settings → Data protection.`,
          link: '/settings/data-protection',
        })),
      });
    }
    return this.myStatus();
  }

  private async whatsappAssistantOn(tenantId: string): Promise<boolean> {
    const row = await this.prisma.root.tenantIntegration.findFirst({ where: { tenantId, provider: 'whatsapp' }, select: { config: true } });
    return !!(row?.config as { assistant?: { enabled?: boolean } } | null)?.assistant?.enabled;
  }

  // ------------------------------------------------------------------ school admin

  private async guardianRows(tenantId: string) {
    const guardians = await this.prisma.root.guardian.findMany({
      where: { tenantId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        userId: true,
        dataConsentAt: true,
        dataConsentVersion: true,
        students: { select: { student: { select: { firstName: true, lastName: true, admissionNumber: true } } } },
      },
    });
    const events = await this.prisma.root.auditLog.findMany({
      where: { tenantId, entityType: 'Guardian', action: { in: [A.given, A.withdrawn] } },
      orderBy: { createdAt: 'desc' },
      select: { entityId: true, action: true, createdAt: true, metadata: true },
    });
    const last = new Map<string, (typeof events)[number]>();
    for (const e of events) if (e.entityId && !last.has(e.entityId)) last.set(e.entityId, e);
    return guardians.map((g) => {
      const latest = last.get(g.id);
      const state: ConsentState = g.dataConsentVersion === PRIVACY_NOTICE_VERSION ? 'CURRENT' : g.dataConsentVersion ? 'OUTDATED' : latest?.action === A.withdrawn ? 'WITHDRAWN' : 'PENDING';
      return {
        ...g,
        state,
        withdrawnAt: state === 'WITHDRAWN' ? latest!.createdAt : null,
        withdrawReason: state === 'WITHDRAWN' ? (((latest!.metadata ?? {}) as { reason?: string | null }).reason ?? null) : null,
      };
    });
  }

  async overview(): Promise<DataProtectionOverview> {
    const tenantId = currentTenantId();
    const [settings, rows] = await Promise.all([this.settings(tenantId), this.guardianRows(tenantId)]);
    const coverage: ConsentCoverage = { guardians: rows.length, withLogin: 0, current: 0, outdated: 0, withdrawn: 0, pending: 0, pendingWithLogin: 0 };
    for (const r of rows) {
      if (r.userId) coverage.withLogin++;
      if (r.state === 'CURRENT') coverage.current++;
      else if (r.state === 'OUTDATED') coverage.outdated++;
      else if (r.state === 'WITHDRAWN') coverage.withdrawn++;
      else {
        coverage.pending++;
        if (r.userId) coverage.pendingWithLogin++;
      }
    }
    const recentWithdrawals = rows
      .filter((r) => r.state === 'WITHDRAWN' && r.withdrawnAt)
      .sort((a, b) => b.withdrawnAt!.getTime() - a.withdrawnAt!.getTime())
      .slice(0, 20)
      .map((r) => ({ guardianId: r.id, name: fullName(r), at: r.withdrawnAt!.toISOString(), reason: r.withdrawReason }));
    return { settings, versions: LEGAL_VERSIONS, coverage, recentWithdrawals };
  }

  /** CSV of every guardian's consent position, or (history) every consent and withdrawal event. */
  async consentsCsv(history: boolean): Promise<string> {
    const tenantId = currentTenantId();
    let out = BOM;
    if (history) {
      const events = await this.prisma.root.auditLog.findMany({
        where: { tenantId, entityType: 'Guardian', action: { in: [A.given, A.withdrawn] } },
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { email: true } } },
      });
      out += line(['eventAt', 'event', 'guardianId', 'noticeVersion', 'signedInAs', 'ip', 'userAgent', 'summary']);
      for (const e of events) {
        const m = (e.metadata ?? {}) as { version?: string; previousVersion?: string };
        out += line([e.createdAt, e.action === A.given ? 'CONSENT_GIVEN' : 'CONSENT_WITHDRAWN', e.entityId, m.version ?? m.previousVersion ?? '', e.actor?.email ?? '', e.ip ?? '', e.userAgent ?? '', e.summary]);
      }
    } else {
      const rows = await this.guardianRows(tenantId);
      out += line(['guardianId', 'firstName', 'lastName', 'phone', 'email', 'portalLogin', 'children', 'status', 'noticeVersion', 'consentedAt', 'withdrawnAt', 'withdrawReason', 'currentNoticeVersion']);
      for (const r of rows) {
        out += line([
          r.id,
          r.firstName,
          r.lastName,
          r.phone,
          r.email,
          r.userId ? 'yes' : 'no',
          r.students.map((s) => `${fullName(s.student)} (${s.student.admissionNumber})`).join('; '),
          r.state,
          r.dataConsentVersion,
          r.dataConsentAt,
          r.withdrawnAt,
          r.withdrawReason,
          PRIVACY_NOTICE_VERSION,
        ]);
      }
    }
    await this.audit.log({ action: A.consentsExported, entityType: 'Tenant', entityId: tenantId, summary: history ? 'Downloaded the consent history (CSV)' : 'Downloaded the parental consent records (CSV)' });
    return out;
  }

  // ------------------------------------------------------------------ data subject requests (log)

  async logRequest(input: DsrLogInput): Promise<DsrRequestRow[]> {
    const id = randomUUID();
    await this.audit.log({
      action: A.requestLogged,
      entityType: 'DataSubjectRequest',
      entityId: id,
      summary: `Logged a data subject request (${input.kind.toLowerCase()}) about ${input.subjectName}, from ${input.requesterName}`,
      metadata: { ...input },
    });
    return this.requests();
  }

  async closeRequest(id: string, input: DsrCloseInput): Promise<DsrRequestRow[]> {
    const tenantId = currentTenantId();
    const open = await this.prisma.root.auditLog.findFirst({ where: { tenantId, action: A.requestLogged, entityType: 'DataSubjectRequest', entityId: id } });
    if (!open) throw new NotFoundException('Request not found');
    const closed = await this.prisma.root.auditLog.findFirst({ where: { tenantId, action: A.requestClosed, entityId: id }, select: { id: true } });
    if (closed) throw new BadRequestException('This request is already closed');
    const m = open.metadata as DsrLogInput;
    await this.audit.log({
      action: A.requestClosed,
      entityType: 'DataSubjectRequest',
      entityId: id,
      summary: `Closed the data subject request (${m.kind.toLowerCase()}) about ${m.subjectName}: ${input.outcome.slice(0, 200)}`,
      metadata: { outcome: input.outcome },
    });
    return this.requests();
  }

  async requests(): Promise<DsrRequestRow[]> {
    const tenantId = currentTenantId();
    const rows = await this.prisma.root.auditLog.findMany({
      where: { tenantId, entityType: 'DataSubjectRequest', action: { in: [A.requestLogged, A.requestClosed] } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { actor: { select: { firstName: true, lastName: true } } },
    });
    const closes = new Map(rows.filter((r) => r.action === A.requestClosed).map((r) => [r.entityId, r]));
    return rows
      .filter((r) => r.action === A.requestLogged)
      .map((r) => {
        const m = r.metadata as unknown as DsrLogInput;
        const c = closes.get(r.entityId);
        return {
          id: r.entityId!,
          kind: m.kind as DsrKind,
          subjectType: (m.subjectType ?? null) as DsrSubjectType | null,
          subjectId: m.subjectId ?? null,
          subjectName: m.subjectName,
          requesterName: m.requesterName,
          receivedOn: m.receivedOn,
          notes: m.notes ?? null,
          loggedAt: r.createdAt.toISOString(),
          loggedBy: r.actor ? fullName(r.actor) : null,
          closedAt: c?.createdAt.toISOString() ?? null,
          closedBy: c?.actor ? fullName(c.actor) : null,
          outcome: ((c?.metadata ?? {}) as { outcome?: string }).outcome ?? null,
        };
      });
  }
}

function consentState(guardians: { dataConsentVersion: string | null }[], lastWasWithdrawal: boolean): ConsentState {
  if (guardians.length && guardians.every((g) => g.dataConsentVersion === PRIVACY_NOTICE_VERSION)) return 'CURRENT';
  if (guardians.some((g) => g.dataConsentVersion)) return 'OUTDATED';
  return lastWasWithdrawal ? 'WITHDRAWN' : 'PENDING';
}

function dedupe<T extends { at: string; action: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.action}:${r.at.slice(0, 19)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
