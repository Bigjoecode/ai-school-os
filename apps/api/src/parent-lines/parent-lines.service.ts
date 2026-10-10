import { Injectable, Logger } from '@nestjs/common';
import {
  asLanguage,
  DEFAULT_PORTAL_SETTINGS,
  formatMoney,
  normalisePhone,
  PARENT_LINE_CONSENT_PROMPT_DAYS,
  PARENT_LINE_PER_MINUTE,
  PRIVACY_NOTICE_VERSION,
  smsInfo,
  USSD_SCREEN_MAX,
  type LanguageCode,
  type LearningUpdateContent,
  type ParentLineSettings,
  type PortalSettings,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { ReportCardService } from '../assessment/report-card.service';
import { schoolParentLanguage } from '../common/language';
import { RequestContextStore } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { ChannelsService } from '../comms/channels.service';
import { env } from '../config/env';
import { ConsentEnforcementService } from '../data-protection/consent-enforcement.service';
import { FeatureService } from '../features/features.service';
import { FinanceService } from '../finance/finance.service';
import { PaystackService } from '../finance/paystack.service';
import { mondayOf, parentSmsText, smsPlain } from '../learning-updates/generator';
import { PrismaService } from '../prisma/prisma.service';
import { loadPlatformLine, parseSchoolLine, platformAtAccount, schoolAtAccount, SCHOOL_PROVIDER, type AtAccount } from './parent-lines.config';

const MINUTE = 60_000;
const DAY = 86_400_000;
/** SMS keyword replies stay within two pages. */
const SMS_REPLY_MAX = 306;

/** Which guardians a request may reach: every school on the shared code, or one school (its own code, or the staff simulator). */
export type LineScope = { kind: 'shared' } | { kind: 'school'; tenantId: string; ignoreSwitch?: boolean };

export interface LineRequest {
  channel: 'USSD' | 'SMS';
  provider: 'africastalking' | 'generic' | 'simulator';
  simulated: boolean;
  phone: string;
  sessionId: string | null;
  scope: LineScope;
  /** The account that received the request (replies go back through it). */
  account: AtAccount | null;
  /** Simulator only: SMS that would have been sent. */
  outbox?: string[];
}

export interface LineReply {
  reply: string;
  /** USSD: END rather than CON. SMS: always true. */
  end: boolean;
  /** No SMS reply at all (rate-limited, repeated unknown number). */
  silent?: boolean;
}

interface Child {
  tenantId: string;
  schoolName: string;
  schoolShort: string;
  schoolPhone: string | null;
  timezone: string;
  studentId: string;
  firstName: string;
  className: string | null;
  guardianIds: string[];
  language: LanguageCode | null;
  needsConsent: boolean;
  settings: ParentLineSettings;
}

interface Outcome {
  action: string;
  status: string;
  tenantId?: string | null;
  guardianId?: string | null;
  studentId?: string | null;
  smsUnits?: number;
}

type Item = 'RESULT' | 'FEES' | 'ATTENDANCE' | 'UPDATE' | 'CONTACT';
const MENU_ITEMS: Item[] = ['RESULT', 'FEES', 'ATTENDANCE', 'UPDATE', 'CONTACT'];
const DATA_ITEMS = new Set<Item>(['RESULT', 'FEES', 'ATTENDANCE', 'UPDATE']);

const KEYWORDS: Record<string, string> = {
  RESULT: 'RESULT',
  RESULTS: 'RESULT',
  FEES: 'FEES',
  FEE: 'FEES',
  BALANCE: 'FEES',
  ATTENDANCE: 'ATTENDANCE',
  ATT: 'ATTENDANCE',
  UPDATE: 'UPDATE',
  LEARNING: 'UPDATE',
  CONTACT: 'CONTACT',
  EVENTS: 'CONTACT',
  HELP: 'HELP',
  MENU: 'HELP',
  INFO: 'HELP',
  STOP: 'STOP',
  UNSUBSCRIBE: 'STOP',
  STOPALL: 'STOP',
  START: 'START',
  UNSTOP: 'START',
  YES: 'YES',
  Y: 'YES',
};

/** For logs and the usage table: enough to tell numbers apart, not enough to dial. */
export const maskPhone = (p: string) => (p.length > 7 ? `${p.slice(0, 6)}…${p.slice(-3)}` : '…');

const clip = (s: string, n: number) => (n <= 3 ? '' : s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s);
const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? `${n}th` : `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`);
const shortDay = (d: Date) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
const money = (kobo: number, currency: string) => smsPlain(formatMoney(kobo, currency));

/** A USSD screen: the body clipped so body + footer stay within USSD_SCREEN_MAX. */
function screen(body: string, footer: string[] = []): string {
  const foot = footer.join('\n');
  const room = USSD_SCREEN_MAX - (foot ? foot.length + 1 : 0);
  const b = smsPlain(body);
  return [b.length > room ? clip(b, room) : b, foot].filter(Boolean).join('\n');
}

/**
 * The parent SMS & USSD line. A parent dials the USSD code or texts a keyword;
 * the caller's number (given by the mobile network, not typed by the parent)
 * is matched to guardian records, and only children linked to those guardians
 * are ever shown. Results are published report cards only, and everything
 * follows what the school shares in the portal. Where the school requires
 * consent to its privacy notice, nothing about a child is shared until the
 * parent has agreed (in the portal, or, if the school allows it, by replying
 * YES to an SMS that links to the notice). Every request is logged.
 */
@Injectable()
export class ParentLinesService {
  private readonly logger = new Logger(ParentLinesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly consent: ConsentEnforcementService,
    private readonly cards: ReportCardService,
    private readonly finance: FinanceService,
    private readonly paystack: PaystackService,
    private readonly features: FeatureService,
    private readonly audit: AuditService,
  ) {}

  // ================================================================ who is calling

  /** Guardian records whose phone is this number (any format on record), within the scope. */
  private async guardians(phone: string, scope: LineScope) {
    const last10 = phone.slice(-10);
    // Matches the expression index guardians_phone_last10_idx.
    const rows = await this.prisma.root.$queryRaw<{ id: string; tenantId: string; phone: string; preferredLanguage: string | null; dataConsentVersion: string | null; smsOptOutAt: Date | null }[]>`
      SELECT id, "tenantId", phone, "preferredLanguage", "dataConsentVersion", "smsOptOutAt" FROM guardians
      WHERE right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = ${last10}`;
    return rows.filter((g) => normalisePhone(g.phone) === phone && (scope.kind === 'shared' || g.tenantId === scope.tenantId));
  }

  /** Schools (of these) where parents may use the line, with their settings. */
  private async openSchools(tenantIds: string[], scope: LineScope) {
    const ids = [...new Set(tenantIds)];
    if (!ids.length) return new Map<string, { settings: ParentLineSettings; tenant: { name: string; shortName: string | null; phone: string | null; timezone: string } }>();
    const [tenants, rows] = await Promise.all([
      this.prisma.root.tenant.findMany({ where: { id: { in: ids }, status: { notIn: ['SUSPENDED', 'ARCHIVED'] } }, select: { id: true, name: true, shortName: true, phone: true, timezone: true } }),
      this.prisma.root.tenantIntegration.findMany({ where: { tenantId: { in: ids }, provider: SCHOOL_PROVIDER }, select: { tenantId: true, config: true } }),
    ]);
    const cfg = new Map(rows.map((r) => [r.tenantId, parseSchoolLine(r.config)]));
    const out = new Map<string, { settings: ParentLineSettings; tenant: { name: string; shortName: string | null; phone: string | null; timezone: string } }>();
    for (const t of tenants) {
      const c = cfg.get(t.id) ?? parseSchoolLine(null);
      const simulator = scope.kind === 'school' && scope.ignoreSwitch;
      if (!simulator && !c.settings.enabled) continue;
      // On the shared code, a school with its own code is still reachable (parents may dial either).
      if (!(await this.features.isEnabled(t.id, 'messaging'))) continue;
      out.set(t.id, { settings: c.settings, tenant: t });
    }
    return out;
  }

  /** The caller's children (active students linked to their guardian records), numbered for menus. */
  async children(phone: string, scope: LineScope): Promise<{ children: Child[]; guardians: Awaited<ReturnType<ParentLinesService['guardians']>> }> {
    const all = await this.guardians(phone, scope);
    const schools = await this.openSchools(
      all.map((g) => g.tenantId),
      scope,
    );
    const guardians = all.filter((g) => schools.has(g.tenantId));
    if (!guardians.length) return { children: [], guardians };
    const links = await this.prisma.root.studentGuardian.findMany({
      where: { guardianId: { in: guardians.map((g) => g.id) }, student: { status: 'ACTIVE' } },
      select: { guardianId: true, tenantId: true, student: { select: { id: true, firstName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } } },
    });
    const consentRequired = new Map<string, boolean>();
    for (const id of schools.keys()) consentRequired.set(id, await this.consent.consentRequired(id));
    const byStudent = new Map<string, Child>();
    for (const l of links) {
      const school = schools.get(l.tenantId)!;
      const g = guardians.find((x) => x.id === l.guardianId)!;
      let c = byStudent.get(l.student.id);
      if (!c) {
        c = {
          tenantId: l.tenantId,
          schoolName: school.tenant.name,
          schoolShort: school.tenant.shortName || school.tenant.name,
          schoolPhone: school.tenant.phone,
          timezone: school.tenant.timezone,
          studentId: l.student.id,
          firstName: l.student.firstName,
          className: l.student.classArm ? `${l.student.classArm.classLevel.name} ${l.student.classArm.name}`.trim() : null,
          guardianIds: [],
          language: asLanguage(g.preferredLanguage),
          needsConsent: false,
          settings: school.settings,
        };
        byStudent.set(l.student.id, c);
      }
      c.guardianIds.push(g.id);
      // Every guardian record on this number for this child must have accepted the current notice.
      if (consentRequired.get(l.tenantId) && g.dataConsentVersion !== PRIVACY_NOTICE_VERSION) c.needsConsent = true;
    }
    const children = [...byStudent.values()].sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.firstName.localeCompare(b.firstName));
    return { children, guardians };
  }

  // ================================================================ entry points

  /** One USSD callback. `text` is everything typed in this session joined with "*" (Africa's Talking). */
  async ussd(req: LineRequest, text: string): Promise<LineReply> {
    const input = text.slice(0, 160);
    if (await this.limited(req)) {
      return this.log(req, input, { reply: 'Too many requests from this number. Please try again in a few minutes.', end: true }, { action: 'MENU', status: 'LIMITED' });
    }
    const { children } = await this.children(req.phone, req.scope);
    if (!children.length) {
      const brand = await this.brand(req.scope);
      return this.log(req, input, { reply: screen(`${brand}: this number is not on any school's parent records. Ask your child's school to add ${this.local(req.phone)} to your record.`), end: true }, { action: 'MENU', status: 'UNKNOWN_NUMBER' });
    }
    return this.ussdFlow(req, input, children);
  }

  /** One inbound SMS. */
  async sms(req: LineRequest, text: string): Promise<LineReply> {
    const input = text.trim().slice(0, 160);
    const words = input.toUpperCase().replace(/[.!?,]+$/g, '').split(/\s+/).filter(Boolean);
    const keyword = KEYWORDS[words[0]?.replace(/[^A-Z]/g, '') ?? ''] ?? (words.length ? 'UNKNOWN' : 'HELP');
    const digits = (words[1] && /^[0-9]{1,2}$/.test(words[1]) ? words[1] : null) ?? /[0-9]{1,2}$/.exec(words[0] ?? '')?.[0] ?? null;
    const pick = digits ? Number(digits) : null;

    if (await this.limited(req)) return this.log(req, input, { reply: '', end: true, silent: true }, { action: keyword, status: 'LIMITED' });

    const { children, guardians } = await this.children(req.phone, req.scope);
    const brand = await this.brand(req.scope);
    if (!guardians.length) {
      // Say so once a day; no school data is shared with unknown numbers.
      const told = await this.prisma.root.parentLineRequest.count({ where: { phone: req.phone, channel: 'SMS', simulated: req.simulated, status: 'UNKNOWN_NUMBER', createdAt: { gte: new Date(Date.now() - DAY) } } });
      const reply = `${brand}: this number is not on any school's parent records. Ask your child's school to add ${this.local(req.phone)} to your record.`;
      return this.log(req, input, told ? { reply: '', end: true, silent: true } : { reply, end: true }, { action: keyword, status: 'UNKNOWN_NUMBER' });
    }
    const tenantIds = [...new Set(guardians.map((g) => g.tenantId))];
    const soleTenant = tenantIds.length === 1 ? tenantIds[0]! : null;
    const codes = await this.codes(req.scope);

    if (keyword === 'STOP' || keyword === 'START') {
      const stop = keyword === 'STOP';
      await this.prisma.root.guardian.updateMany({ where: { id: { in: guardians.map((g) => g.id) } }, data: { smsOptOutAt: stop ? new Date() : null } });
      if (!req.simulated) {
        for (const t of tenantIds) {
          await this.audit.log({ action: stop ? 'comms.sms_opt_out' : 'comms.sms_opt_in', tenantId: t, actorUserId: null, entityType: 'Guardian', summary: `A parent (${maskPhone(req.phone)}) texted ${keyword} to the parent SMS line` });
        }
      }
      const reply = stop
        ? `Done. You will not get SMS updates from ${this.schoolList(children, guardians.length)} any more. Text START to turn them back on. You can still text RESULT, FEES or ATTENDANCE.`
        : `Welcome back. SMS updates are on again. Text HELP for options.`;
      return this.log(req, input, { reply, end: true }, { action: keyword, status: 'ANSWERED', tenantId: soleTenant, guardianId: guardians[0]?.id });
    }

    if (keyword === 'YES') return this.confirmConsent(req, input, guardians);

    if (keyword === 'HELP' || keyword === 'UNKNOWN' || !children.length) {
      const list = children.length > 1 ? ` Your children: ${children.map((c, i) => `${i + 1} ${c.firstName}`).join(', ')}. Add the number, e.g. RESULT 2.` : '';
      const reply = children.length
        ? `${brand}: text RESULT, FEES, ATTENDANCE or UPDATE.${list}${codes.ussdCode ? ` Or dial ${codes.ussdCode}.` : ''} STOP stops SMS updates.`
        : `${brand}: no current students are linked to this number. Please contact the school.`;
      return this.log(req, input, { reply: clip(reply, SMS_REPLY_MAX), end: true }, { action: keyword === 'UNKNOWN' ? 'HELP' : keyword, status: 'ANSWERED', tenantId: soleTenant });
    }

    // RESULT / FEES / ATTENDANCE / UPDATE / CONTACT
    const item = keyword as Item;
    let child: Child | undefined;
    if (children.length === 1) child = children[0];
    else if (pick && children[pick - 1]) child = children[pick - 1];
    if (!child) {
      const reply = `You have ${children.length} children: ${children.map((c, i) => `${i + 1} ${c.firstName}${c.className ? ` (${c.className})` : ''}`).join(', ')}. Text ${item} 1 or ${item} 2.`;
      return this.log(req, input, { reply: clip(smsPlain(reply), SMS_REPLY_MAX), end: true }, { action: item, status: 'CHOOSE', tenantId: soleTenant });
    }

    // Each reply costs the school an SMS: a daily cap per phone.
    const answeredToday = await this.prisma.root.parentLineRequest.count({
      where: { phone: req.phone, channel: 'SMS', simulated: req.simulated, tenantId: child.tenantId, status: 'ANSWERED', action: { in: [...DATA_ITEMS, 'CONTACT'] }, createdAt: { gte: new Date(Date.now() - DAY) } },
    });
    if (answeredToday >= child.settings.dailySmsCapPerPhone) {
      const told = await this.prisma.root.parentLineRequest.count({ where: { phone: req.phone, channel: 'SMS', simulated: req.simulated, status: 'CAPPED', createdAt: { gte: new Date(Date.now() - DAY) } } });
      const reply = `You have reached today's limit of ${child.settings.dailySmsCapPerPhone} SMS replies. Please try again tomorrow${codes.ussdCode ? ` or dial ${codes.ussdCode}` : ''}.`;
      return this.log(req, input, told ? { reply: '', end: true, silent: true } : { reply, end: true }, { action: item, status: 'CAPPED', tenantId: child.tenantId, studentId: child.studentId });
    }

    if (child.needsConsent && DATA_ITEMS.has(item)) {
      const text = await this.consentPrompt(child);
      return this.log(req, input, { reply: text.text, end: true }, { action: text.bySms ? 'CONSENT_PROMPT' : item, status: 'CONSENT_NEEDED', tenantId: child.tenantId, guardianId: child.guardianIds[0], studentId: child.studentId });
    }

    const body = await this.inSchool(child.tenantId, () => this.content(child, item, 'SMS'));
    let reply = body.text;
    // A payment link is never cut: the text before it is shortened instead.
    const link = item === 'FEES' && body.payLink ? ` Pay online: ${body.payLink}` : '';
    reply = `${clip(smsPlain(reply), Math.max(40, SMS_REPLY_MAX - link.length))}${link}`;
    return this.log(req, input, { reply, end: true }, { action: item, status: 'ANSWERED', tenantId: child.tenantId, guardianId: child.guardianIds[0], studentId: child.studentId });
  }

  // ================================================================ USSD menus

  private async ussdFlow(req: LineRequest, input: string, children: Child[]): Promise<LineReply> {
    type Screen = { kind: 'children' } | { kind: 'menu'; child: Child } | { kind: 'item'; child: Child; item: Item } | { kind: 'consent'; child: Child };
    const multi = children.length > 1;
    const home: Screen = multi ? { kind: 'children' } : { kind: 'menu', child: children[0]! };
    const tokens = input === '' ? [] : input.split('*');
    let at: Screen = home;
    let invalid = false;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!.trim();
      const last = i === tokens.length - 1;
      invalid = false;
      if (t === '00') {
        at = home;
        continue;
      }
      if (at.kind === 'children') {
        if (t === '0') return this.log(req, input, { reply: 'Thank you. Goodbye.', end: true }, { action: 'MENU', status: 'ANSWERED' });
        const c = /^\d{1,2}$/.test(t) ? children[Number(t) - 1] : undefined;
        if (c) at = { kind: 'menu', child: c };
        else invalid = true;
      } else if (at.kind === 'menu') {
        if (t === '0') {
          if (multi) at = { kind: 'children' };
          else return this.log(req, input, { reply: 'Thank you. Goodbye.', end: true }, { action: 'MENU', status: 'ANSWERED', tenantId: at.child.tenantId });
          continue;
        }
        const item = /^[1-5]$/.test(t) ? MENU_ITEMS[Number(t) - 1]! : null;
        if (!item) invalid = true;
        else if (at.child.needsConsent && DATA_ITEMS.has(item)) at = { kind: 'consent', child: at.child };
        else at = { kind: 'item', child: at.child, item };
      } else if (at.kind === 'consent') {
        const child: Child = at.child;
        if (t === '0') at = { kind: 'menu', child };
        else if (t === '1' && child.settings.consentBySms) {
          if (!last) return this.log(req, input, { reply: 'Session expired. Please dial again.', end: true }, { action: 'CONSENT_PROMPT', status: 'INVALID', tenantId: child.tenantId });
          // Send the notice by SMS; agreeing is a separate, deliberate reply (YES) after reading it.
          const prompt = await this.consentPrompt(child);
          const units = await this.sendSms(req, child.tenantId, prompt.text);
          return this.log(
            req,
            input,
            { reply: screen(units >= 0 ? `We have sent ${child.schoolShort}'s privacy notice to this number by SMS. Read it, then reply YES to agree.` : `Sorry, we could not send the SMS. Please accept the notice in the parent portal or at the school.`), end: true },
            { action: 'CONSENT_PROMPT', status: units >= 0 ? 'CONSENT_NEEDED' : 'FAILED', tenantId: child.tenantId, guardianId: child.guardianIds[0], studentId: child.studentId, smsUnits: Math.max(0, units) },
          );
        } else invalid = true;
      } else if (at.kind === 'item') {
        const { child, item }: { child: Child; item: Item } = at;
        if (t === '0') at = { kind: 'menu', child };
        else if (t === '1' && item === 'FEES') {
          if (!last) return this.log(req, input, { reply: 'Session expired. Please dial again.', end: true }, { action: 'PAY_LINK', status: 'INVALID', tenantId: child.tenantId });
          const fees = await this.inSchool(child.tenantId, () => this.content(child, 'FEES', 'SMS'));
          const sms = fees.payLink ? `${child.schoolShort}: ${fees.text} Pay online: ${fees.payLink}` : `${child.schoolShort}: ${fees.text}`;
          const units = await this.sendSms(req, child.tenantId, smsPlain(sms));
          return this.log(
            req,
            input,
            { reply: screen(units >= 0 ? (fees.payLink ? 'We have sent the payment link to this number by SMS. Thank you.' : 'We have sent the fees details to this number by SMS. Thank you.') : 'Sorry, we could not send the SMS just now. Please try again later.'), end: true },
            { action: 'PAY_LINK', status: units >= 0 ? 'ANSWERED' : 'FAILED', tenantId: child.tenantId, guardianId: child.guardianIds[0], studentId: child.studentId, smsUnits: Math.max(0, units) },
          );
        } else invalid = true;
      }
    }

    const prefix = invalid ? 'Invalid choice. ' : '';
    if (at.kind === 'children') {
      const lines = children.slice(0, 7).map((c, i) => `${i + 1} ${clip(c.firstName, 12)}${c.className ? ` ${clip(c.className, 10)}` : ''}${new Set(children.map((x) => x.tenantId)).size > 1 ? ` - ${clip(c.schoolShort, 12)}` : ''}`);
      return this.log(req, input, { reply: screen(`${prefix}Choose a child:`, [...lines, '0 Exit']), end: false }, { action: 'MENU', status: invalid ? 'INVALID' : 'ANSWERED' });
    }
    if (at.kind === 'menu') {
      const c = at.child;
      return this.log(
        req,
        input,
        { reply: screen(`${prefix}${clip(c.firstName, 16)} - ${clip(c.schoolShort, 24)}`, ['1 Latest results', '2 Fees balance', '3 Attendance this week', "4 This week's learning", '5 School contact & events', multi ? '0 Back' : '0 Exit']), end: false },
        { action: 'MENU', status: invalid ? 'INVALID' : 'ANSWERED', tenantId: c.tenantId, studentId: c.studentId },
      );
    }
    if (at.kind === 'consent') {
      const c = at.child;
      const body = c.settings.consentBySms
        ? `${prefix}${c.schoolShort} needs your agreement to its privacy notice before sharing ${c.firstName}'s details.`
        : `${prefix}${c.schoolShort} needs your agreement to its privacy notice first. Please accept it in the parent portal or at the school office.`;
      return this.log(req, input, { reply: screen(body, c.settings.consentBySms ? ['1 Send me the notice by SMS', '0 Back'] : ['0 Back']), end: false }, { action: 'CONSENT_PROMPT', status: 'CONSENT_NEEDED', tenantId: c.tenantId, studentId: c.studentId });
    }
    const { child, item } = at;
    const body = await this.inSchool(child.tenantId, () => this.content(child, item, 'USSD'));
    const footer = item === 'FEES' && body.owing ? [body.payLink ? '1 Send payment link by SMS' : '1 Send bank details by SMS', '0 Back'] : ['0 Back'];
    return this.log(req, input, { reply: screen(`${prefix}${body.text}`, footer), end: false }, { action: item, status: invalid ? 'INVALID' : 'ANSWERED', tenantId: child.tenantId, guardianId: child.guardianIds[0], studentId: child.studentId });
  }

  // ================================================================ what each item says

  private async portalSettings(tenantId: string): Promise<PortalSettings> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { portalSettings: true } });
    return { ...DEFAULT_PORTAL_SETTINGS, ...((t.portalSettings as Partial<PortalSettings> | null) ?? {}) };
  }

  /** Runs inside a request context for the child's school (tenant-scoped queries), as no user. */
  private inSchool<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return RequestContextStore.run({ tenantId, permissions: new Set(), userAgent: 'parent-line' }, fn);
  }

  private async content(child: Child, item: Item, channel: 'USSD' | 'SMS'): Promise<{ text: string; payLink?: string | null; owing?: boolean }> {
    const db = this.prisma.db;
    const settings = await this.portalSettings(child.tenantId);
    const name = child.firstName;
    const owed = async () => {
      const inv = await db.invoice.findMany({ where: { studentId: child.studentId, status: { not: 'CANCELLED' } }, select: { id: true, totalKobo: true, paidKobo: true, dueDate: true } });
      return inv.map((i) => ({ ...i, balance: Math.max(0, i.totalKobo - i.paidKobo) })).filter((i) => i.balance > 0);
    };

    if (item === 'RESULT') {
      if (!settings.showResults) return { text: `${child.schoolShort} does not share results by text. Please contact the school.` };
      if (settings.requireResultPin) return { text: `${child.schoolShort} results need a result-checker PIN. Please check them in the parent portal with your PIN.` };
      if (settings.withholdResultsWhenOwing && (await owed()).length) return { text: clip(settings.withholdMessage ?? 'Results are available once school fees are fully paid. Please contact the school bursar.', 150) };
      const card = await db.reportCard.findFirst({ where: { studentId: child.studentId, status: 'PUBLISHED' }, include: { term: { include: { session: { select: { name: true } } } } }, orderBy: { publishedAt: 'desc' } });
      if (!card) return { text: `No published results for ${name} yet.` };
      const view = await this.cards.view({ studentId: child.studentId, termId: card.termId }).catch(() => null);
      const term = `${card.term.name} ${card.term.session.name}`;
      if (!view) return { text: `${name}'s ${term} result is published. See it at the school or in the portal.` };
      const s = view.summary;
      const parts = [
        s.average !== null ? `average ${Math.round(s.average * 10) / 10}%` : null,
        s.position ? `position ${ordinal(s.position)} of ${s.classSize}` : null,
        `${s.subjectsTaken} subject${s.subjectsTaken === 1 ? '' : 's'}`,
      ].filter(Boolean);
      return { text: `${name}, ${term}: ${parts.join(', ')}.` };
    }

    if (item === 'FEES') {
      if (!settings.showFees) return { text: `${child.schoolShort} does not share fees by text. Please contact the bursar.` };
      const [rows, fin] = await Promise.all([owed(), this.finance.settings()]);
      const total = rows.reduce((n, r) => n + r.balance, 0);
      if (!total) return { text: `${name} has no school fees outstanding. Thank you.`, owing: false };
      const online = (await this.paystack.connected(child.tenantId)) && (await this.features.isEnabled(child.tenantId, 'online_payments'));
      // The largest unpaid invoice gets the link (most parents owe one invoice).
      const top = [...rows].sort((a, b) => b.balance - a.balance)[0]!;
      const base = await this.baseUrl(child.tenantId);
      const payLink = online && base ? `${base}/pay/${await this.finance.payToken(top.id)}` : null;
      const text = `${name} owes ${money(total, fin.currency)}${rows.length > 1 ? ` on ${rows.length} invoices` : ''}.`;
      if (payLink) return { text, payLink, owing: true };
      const bank = fin.bankDetails ? ` Pay by transfer: ${smsPlain(fin.bankDetails).replace(/\s+/g, ' ')}` : ' Please pay at the school bursary.';
      return { text: channel === 'USSD' ? text : `${text}${bank}`, payLink: null, owing: true };
    }

    if (item === 'ATTENDANCE') {
      if (!settings.showAttendance) return { text: `${child.schoolShort} does not share attendance by text. Please contact the school.` };
      const today = schoolNow(child.timezone).date;
      const monday = mondayOf(today);
      const rows = await db.studentAttendance.groupBy({ by: ['status'], where: { studentId: child.studentId, date: { gte: new Date(`${monday}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) } }, _count: { _all: true } });
      const n = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
      const marked = rows.reduce((t, r) => t + r._count._all, 0);
      if (!marked) return { text: `No register marked for ${name} this week yet (from ${shortDay(new Date(`${monday}T12:00:00Z`))}).` };
      const parts = [`present ${n('PRESENT')}`, n('LATE') ? `late ${n('LATE')}` : null, `absent ${n('ABSENT')}`, n('EXCUSED') ? `excused ${n('EXCUSED')}` : null].filter(Boolean);
      return { text: `${name} this week (from ${shortDay(new Date(`${monday}T12:00:00Z`))}): ${parts.join(', ')} of ${marked} day${marked === 1 ? '' : 's'} marked.` };
    }

    if (item === 'UPDATE') {
      const u = await db.learningUpdate.findFirst({ where: { studentId: child.studentId, sentAt: { not: null }, weekStart: { gte: new Date(Date.now() - 21 * DAY) } }, orderBy: { weekStart: 'desc' }, select: { content: true } });
      if (!u) return { text: `No learning update for ${name} in the last few weeks.` };
      const language = child.language ?? (await schoolParentLanguage(this.prisma, child.tenantId));
      const text = parentSmsText(u.content as unknown as LearningUpdateContent, language, []);
      return { text: channel === 'USSD' ? text : clip(text, SMS_REPLY_MAX) };
    }

    // CONTACT: phone and the next event families can see.
    const parts = [`${child.schoolName}${child.schoolPhone ? `: call ${child.schoolPhone}` : ''}.`];
    if (settings.showCalendar) {
      const today = schoolNow(child.timezone).date;
      const student = await db.student.findUnique({ where: { id: child.studentId }, select: { classArmId: true } });
      const events = await db.schoolEvent.findMany({ where: { audience: { in: ['EVERYONE', 'PARENTS'] }, startDate: { gte: new Date(`${today}T00:00:00Z`) } }, orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }], take: 10, select: { title: true, startDate: true, startTime: true, classArmIds: true } });
      const next = events.find((e) => !e.classArmIds.length || (student?.classArmId && e.classArmIds.includes(student.classArmId)));
      parts.push(next ? `Next: ${clip(next.title, 50)}, ${shortDay(next.startDate)}${next.startTime ? ` ${next.startTime}` : ''}.` : 'No upcoming events on the calendar.');
    }
    return { text: parts.join(' ') };
  }

  // ================================================================ consent by SMS

  private async consentPrompt(child: Child): Promise<{ text: string; bySms: boolean }> {
    if (!child.settings.consentBySms) {
      return { text: `${child.schoolShort} needs your agreement to its privacy notice before sharing ${child.firstName}'s details. Please accept it in the parent portal or at the school office.`, bySms: false };
    }
    const base = await this.baseUrl(child.tenantId);
    const link = base ? `${base}/legal/privacy` : 'the parent portal';
    return {
      text: smsPlain(`${child.schoolShort} uses this service to share ${child.firstName}'s school records with you. Please read its privacy notice: ${link} Reply YES to agree (version ${PRIVACY_NOTICE_VERSION}).`),
      bySms: true,
    };
  }

  /**
   * YES only counts as agreement when we sent this number the notice (with its
   * link and version) in the last few days, for a school that allows consent
   * by SMS. It is recorded on every guardian record on this number in that
   * school, with the version, and in the audit log.
   */
  private async confirmConsent(req: LineRequest, input: string, guardians: { id: string; tenantId: string }[]): Promise<LineReply> {
    const prompts = await this.prisma.root.parentLineRequest.findMany({
      where: { phone: req.phone, simulated: req.simulated, action: 'CONSENT_PROMPT', status: 'CONSENT_NEEDED', smsUnits: { gt: 0 }, tenantId: { not: null }, createdAt: { gte: new Date(Date.now() - PARENT_LINE_CONSENT_PROMPT_DAYS * DAY) } },
      orderBy: { createdAt: 'desc' },
      select: { tenantId: true, createdAt: true },
    });
    // An SMS keyword reply is itself the prompt: its row records the SMS units of the reply.
    const tenants = [...new Set(prompts.map((p) => p.tenantId!))];
    const done: string[] = [];
    for (const tenantId of tenants) {
      const ids = guardians.filter((g) => g.tenantId === tenantId).map((g) => g.id);
      if (!ids.length) continue;
      const school = await this.prisma.root.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: SCHOOL_PROVIDER } }, select: { config: true } });
      if (!parseSchoolLine(school?.config).settings.consentBySms) continue;
      const now = new Date();
      if (!req.simulated) {
        await this.prisma.root.guardian.updateMany({ where: { id: { in: ids } }, data: { dataConsentAt: now, dataConsentVersion: PRIVACY_NOTICE_VERSION } });
      }
      const rows = await this.prisma.root.guardian.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, students: { select: { student: { select: { firstName: true, lastName: true } } } } } });
      const promptAt = prompts.find((p) => p.tenantId === tenantId)!.createdAt.toISOString();
      for (const g of rows) {
        const children = g.students.map((s) => `${s.student.firstName} ${s.student.lastName}`);
        await this.audit.log({
          action: req.simulated ? 'privacy.consent_sms_test' : 'privacy.consent_given',
          tenantId,
          actorUserId: null,
          entityType: 'Guardian',
          entityId: g.id,
          summary: `${req.simulated ? '[Simulator test, nothing saved] ' : ''}${g.firstName} ${g.lastName} agreed to the privacy notice (version ${PRIVACY_NOTICE_VERSION}) on behalf of ${children.join(', ') || 'their children'} by replying YES by SMS from ${maskPhone(req.phone)}`,
          metadata: { version: PRIVACY_NOTICE_VERSION, children, channel: 'SMS', phone: maskPhone(req.phone), noticeSentAt: promptAt },
        });
      }
      done.push(tenantId);
    }
    if (!done.length) {
      return this.log(req, input, { reply: 'There is nothing to confirm. Text HELP for options.', end: true }, { action: 'YES', status: 'INVALID' });
    }
    const names = await this.prisma.root.tenant.findMany({ where: { id: { in: done } }, select: { name: true, shortName: true } });
    const reply = `Thank you. Your agreement to the privacy notice (version ${PRIVACY_NOTICE_VERSION}) of ${names.map((n) => n.shortName || n.name).join(' and ')} is recorded${req.simulated ? ' (test only)' : ''}. Text HELP for options.`;
    return this.log(req, input, { reply: clip(smsPlain(reply), SMS_REPLY_MAX), end: true }, { action: 'YES', status: 'ANSWERED', tenantId: done.length === 1 ? done[0] : null });
  }

  // ================================================================ plumbing

  /** Requests per minute from this phone. */
  private async limited(req: LineRequest): Promise<boolean> {
    const n = await this.prisma.root.parentLineRequest.count({ where: { phone: req.phone, channel: req.channel, simulated: req.simulated, createdAt: { gte: new Date(Date.now() - MINUTE) } } });
    // A USSD session sends one request per screen, so USSD gets more; staff testing in the simulator get more still.
    const limit = (req.channel === 'USSD' ? PARENT_LINE_PER_MINUTE * 2 : PARENT_LINE_PER_MINUTE) * (req.simulated ? 3 : 1);
    return n >= limit;
  }


  private async brand(scope: LineScope): Promise<string> {
    if (scope.kind === 'school') {
      const t = await this.prisma.root.tenant.findUnique({ where: { id: scope.tenantId }, select: { name: true, shortName: true } });
      return t?.shortName || t?.name || 'School';
    }
    return (await loadPlatformLine(this.prisma)).brandName;
  }

  private async codes(scope: LineScope): Promise<{ ussdCode: string | null; shortCode: string | null }> {
    const p = await loadPlatformLine(this.prisma);
    if (scope.kind === 'school') {
      const s = await this.prisma.root.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId: scope.tenantId, provider: SCHOOL_PROVIDER } }, select: { config: true } });
      const o = parseSchoolLine(s?.config).override;
      if (o) return { ussdCode: o.ussdCode, shortCode: o.shortCode };
    }
    return p.enabled ? { ussdCode: p.ussdCode, shortCode: p.shortCode } : { ussdCode: null, shortCode: null };
  }

  private schoolList(children: Child[], fallbackCount: number): string {
    const names = [...new Set(children.map((c) => c.schoolShort))];
    return names.length ? names.join(' and ') : fallbackCount > 1 ? 'your schools' : 'your school';
  }

  private local(phone: string): string {
    return phone.startsWith('234') && phone.length === 13 ? `0${phone.slice(3)}` : phone;
  }

  private async baseUrl(tenantId: string): Promise<string> {
    const domain = await this.prisma.root.tenantDomain.findFirst({ where: { tenantId, kind: 'PORTAL', verifiedAt: { not: null } }, orderBy: { isPrimary: 'desc' }, select: { hostname: true } });
    if (domain) return `https://${domain.hostname}`;
    const e = env();
    return e.CORS_ORIGINS[0] ?? (e.PLATFORM_DOMAIN_TARGET ? `https://${e.PLATFORM_DOMAIN_TARGET}` : '');
  }

  /**
   * Sends an extra SMS (payment link, privacy notice) to the caller. Uses the
   * account the request came in on, else the school's own line, else the
   * platform's, else the school's Termii. Returns the SMS pages sent, or -1.
   * The simulator only records what would be sent.
   */
  private async sendSms(req: LineRequest, tenantId: string, text: string): Promise<number> {
    const units = smsInfo(text).segments;
    if (req.simulated) {
      req.outbox?.push(text);
      return units;
    }
    try {
      const account = req.account ?? (await schoolAtAccount(this.prisma, tenantId)) ?? platformAtAccount(await loadPlatformLine(this.prisma));
      if (account) await sendAtSms(account, req.phone, text);
      else {
        const ch = await this.channels.load(tenantId);
        try {
          await this.channels.sendSms(ch, req.phone, text);
        } finally {
          this.channels.close(ch);
        }
      }
      return units;
    } catch (err) {
      this.logger.warn(`Parent line SMS to ${maskPhone(req.phone)} failed: ${(err as Error).message}`);
      return -1;
    }
  }

  /**
   * Records the request and, for SMS, sends the reply (generic webhooks
   * return it in the response instead). The reply's SMS pages are added to
   * the row so the school sees what the line costs.
   */
  private async log(req: LineRequest, input: string, reply: LineReply, o: Outcome): Promise<LineReply> {
    let smsUnits = o.smsUnits ?? 0;
    if (req.channel === 'SMS' && !reply.silent && reply.reply) {
      const units = smsInfo(reply.reply).segments;
      if (req.simulated || req.provider === 'generic') smsUnits += units;
      else if (req.account) {
        try {
          await sendAtSms(req.account, req.phone, reply.reply);
          smsUnits += units;
        } catch (err) {
          this.logger.warn(`Parent line reply to ${maskPhone(req.phone)} failed: ${(err as Error).message}`);
          o = { ...o, status: 'FAILED' };
        }
      }
    }
    try {
      await this.prisma.root.parentLineRequest.create({
        data: {
          tenantId: o.tenantId ?? (req.scope.kind === 'school' ? req.scope.tenantId : null),
          channel: req.channel,
          simulated: req.simulated,
          provider: req.provider,
          phone: req.phone,
          sessionId: req.sessionId?.slice(0, 100) ?? null,
          input: input.slice(0, 200),
          action: o.action,
          status: o.status,
          reply: (reply.silent ? '' : reply.reply).slice(0, 500),
          guardianId: o.guardianId ?? null,
          studentId: o.studentId ?? null,
          smsUnits,
        },
      });
    } catch (err) {
      this.logger.error(`Could not log a parent line request: ${(err as Error).message}`);
    }
    return reply;
  }
}

/** Africa's Talking bulk SMS API (also used for replies from a two-way short code). */
export async function sendAtSms(account: AtAccount, to: string, message: string): Promise<void> {
  const host = account.sandbox ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
  const body = new URLSearchParams({ username: account.username, to: `+${to.replace(/^\+/, '')}`, message });
  if (account.from) body.set('from', account.from);
  const res = await fetch(`${host}/version1/messaging`, {
    method: 'POST',
    headers: { apiKey: account.apiKey, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { SMSMessageData?: { Message?: string; Recipients?: { status?: string; statusCode?: number }[] } };
  const r = json.SMSMessageData?.Recipients?.[0];
  if (!res.ok || !r || (r.statusCode !== undefined && r.statusCode >= 400)) {
    throw new Error(`Africa's Talking: ${r?.status ?? json.SMSMessageData?.Message ?? res.statusText}`.slice(0, 300));
  }
}
