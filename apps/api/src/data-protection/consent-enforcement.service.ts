import { ForbiddenException, Injectable } from '@nestjs/common';
import { CONSENT_REQUIRED, DEFAULT_DATA_PROTECTION_SETTINGS, PRIVACY_NOTICE_VERSION } from '@aischool/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * What a parent may still use while the school requires consent and they have
 * not accepted the current privacy notice. Everything else (their children's
 * results, attendance, report cards, fees, learning, games, lessons, the
 * Parent AI, documents and downloads…) answers 403 CONSENT_REQUIRED.
 *
 * Paths are relative to /api, matched as a whole path or a path prefix
 * followed by "/". Public routes (sign-in, legal pages, payment links sent by
 * the school, public websites) never reach this check.
 */
export const CONSENT_FREE_PATHS: readonly string[] = [
  // Signing in and out, switching school, the user's own account and two-step sign-in.
  'auth',
  // The consent itself: read the status, accept, withdraw.
  'data-protection/consent',
  // Notifications and browser push.
  'notifications',
  'push',
  // The parent's own preferences.
  'family/language',
  // Paying stays possible: consent to data processing is separate from settling
  // what is owed. Online checkout, confirming a payment and managing (e.g.
  // cancelling) a subscription. School fee payment links (/pay/…) are public.
  'family/quote',
  'family/checkout',
  'family/verify',
  'family/subscriptions',
];

export function consentFreePath(path: string): boolean {
  const p = path.replace(/^\/+/, '').replace(/^api(\/|$)/, '').replace(/\/+$/, '');
  return CONSENT_FREE_PATHS.some((a) => p === a || p.startsWith(`${a}/`));
}

export const consentRequiredError = () =>
  new ForbiddenException({
    statusCode: 403,
    code: CONSENT_REQUIRED,
    message: 'Please read and accept the school’s privacy notice before viewing your child’s information.',
  });

/**
 * Server-side enforcement of NDPA parental consent. A user is held at the
 * consent step when the school requires consent, they are a guardian of the
 * school, they hold only the Parent role there (staff who are also parents
 * are not held — the same rule as the web consent screen), and not every one
 * of their guardian records has accepted the current notice.
 */
@Injectable()
export class ConsentEnforcementService {
  constructor(private readonly prisma: PrismaService) {}

  async consentRequired(tenantId: string): Promise<boolean> {
    const t = await this.prisma.root.tenant.findUnique({ where: { id: tenantId }, select: { portalSettings: true } });
    const v = (t?.portalSettings as { dataProtection?: { consentRequired?: unknown } } | null)?.dataProtection?.consentRequired;
    return typeof v === 'boolean' ? v : DEFAULT_DATA_PROTECTION_SETTINGS.consentRequired;
  }

  /** The guardian records of this user in this school lack consent to the current notice (false when they are no guardian). */
  async guardianLacksConsent(tenantId: string, userId: string): Promise<boolean> {
    const guardians = await this.prisma.root.guardian.findMany({ where: { tenantId, userId }, select: { dataConsentVersion: true } });
    return guardians.length > 0 && !guardians.every((g) => g.dataConsentVersion === PRIVACY_NOTICE_VERSION);
  }

  /** Is this signed-in user held at the consent step in this school? */
  async blocked(tenantId: string, userId: string, roleKeys: readonly string[]): Promise<boolean> {
    const onlyParent = roleKeys.length > 0 && roleKeys.every((k) => k === 'parent');
    if (!onlyParent) return false;
    if (!(await this.consentRequired(tenantId))) return false;
    return this.guardianLacksConsent(tenantId, userId);
  }

  /** For WhatsApp, which always acts as the parent: required by the school and not given. */
  async parentNeedsConsent(tenantId: string, userId: string): Promise<boolean> {
    if (!(await this.consentRequired(tenantId))) return false;
    return this.guardianLacksConsent(tenantId, userId);
  }

  /** Called by the auth guard for every signed-in request inside a school. */
  async assertRequest(path: string, tenantId: string | null | undefined, userId: string, roleKeys: readonly string[], platformRole: string | null | undefined): Promise<void> {
    if (!tenantId || platformRole) return;
    // Cheap first: only someone with the Parent role here can be held.
    if (!roleKeys.includes('parent')) return;
    if (consentFreePath(path)) return;
    if (await this.blocked(tenantId, userId, roleKeys)) throw consentRequiredError();
  }
}
