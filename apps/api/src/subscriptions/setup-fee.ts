import { isDemoSchoolSlug, PRICING_SETTINGS_KEY, pricingSettingsSchema, type InvoiceLine, type PricingSettings, type SetupFeeStatus } from '@aischool/shared';
import type { PrismaClient } from '../generated/prisma/client';

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

export async function readPricingSettings(root: PrismaClient): Promise<PricingSettings> {
  const row = await root.platformSetting.findUnique({ where: { key: PRICING_SETTINGS_KEY } });
  const parsed = pricingSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : pricingSettingsSchema.parse({});
}

/**
 * The one-off setup fee (onboarding and training) a school owes on its first
 * subscription invoice. Nothing is owed by: schools that existed before the
 * price list (grandfathered), demo schools, pilot schools, schools that have
 * already paid a subscription invoice, plans without a fee, or when the
 * operator waived it. The operator may also set a discounted amount.
 */
export async function setupFeeStatus(root: PrismaClient, tenantId: string, planOverride?: { setupFeeKobo: number; trainingDays: number } | null): Promise<SetupFeeStatus> {
  const [tenant, tb, settings, invoiced] = await Promise.all([
    root.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, createdAt: true, plan: { select: { setupFeeKobo: true, trainingDays: true } } } }),
    root.tenantBilling.findUnique({ where: { tenantId }, select: { setupFeeMode: true, setupFeeKobo: true, setupFeeNote: true, pilotStatus: true } }),
    readPricingSettings(root),
    root.platformInvoice.findFirst({
      where: { tenantId, status: { in: ['OPEN', 'PAID'] }, lines: { array_contains: [{ kind: 'SETUP_FEE' }] } },
      orderBy: { issuedAt: 'desc' },
      select: { id: true, status: true, lines: true },
    }),
  ]);
  const plan = planOverride ?? tenant?.plan ?? null;
  const planFeeKobo = plan?.setupFeeKobo ?? 0;
  const trainingDays = plan?.trainingDays ?? 0;
  const base = { planFeeKobo, trainingDays, invoiceId: null, note: tb?.setupFeeNote ?? null };
  if (invoiced) {
    const line = ((invoiced.lines as unknown as InvoiceLine[]) ?? []).find((l) => l.kind === 'SETUP_FEE');
    return { ...base, state: invoiced.status === 'PAID' ? 'PAID' : 'INVOICED', reason: null, amountKobo: line?.amountKobo ?? 0, invoiceId: invoiced.id };
  }
  if (!tenant) return { ...base, state: 'NONE', reason: null, amountKobo: 0 };
  if (tb?.setupFeeMode === 'WAIVED' || (tb?.setupFeeMode === 'SET' && (tb.setupFeeKobo ?? 0) === 0)) return { ...base, state: 'WAIVED', reason: 'WAIVED', amountKobo: 0 };
  if (isDemoSchoolSlug(tenant.slug)) return { ...base, state: 'NONE', reason: 'DEMO', amountKobo: 0 };
  if (tb?.pilotStatus && ['ACTIVE', 'ENDED', 'CONVERTED'].includes(tb.pilotStatus)) return { ...base, state: 'WAIVED', reason: 'PILOT', amountKobo: 0 };
  if (!settings.setupFeesFrom || tenant.createdAt.getTime() < Date.parse(settings.setupFeesFrom)) return { ...base, state: 'NONE', reason: 'GRANDFATHERED', amountKobo: 0 };
  const paid = await root.platformInvoice.count({ where: { tenantId, status: 'PAID', subscriptionId: { not: null } } });
  if (paid) return { ...base, state: 'NONE', reason: 'ALREADY_PAYING', amountKobo: 0 };
  if (planFeeKobo <= 0 && tb?.setupFeeMode !== 'SET') return { ...base, state: 'NONE', reason: 'PLAN', amountKobo: 0 };
  const amountKobo = tb?.setupFeeMode === 'SET' ? (tb.setupFeeKobo ?? planFeeKobo) : planFeeKobo;
  return { ...base, state: 'DUE', reason: null, amountKobo };
}

/** The invoice line for a setup fee that is due. */
export function setupFeeLine(st: SetupFeeStatus): InvoiceLine | null {
  if (st.state !== 'DUE' || st.amountKobo <= 0) return null;
  const training = st.trainingDays ? ` and ${st.trainingDays} day${st.trainingDays === 1 ? '' : 's'} of training` : '';
  const discount = st.planFeeKobo > st.amountKobo ? st.planFeeKobo - st.amountKobo : 0;
  return {
    kind: 'SETUP_FEE',
    description: `One-off setup fee: onboarding${training}${discount ? ` (list price ${naira(st.planFeeKobo)})` : ''}`,
    quantity: 1,
    unitKobo: st.planFeeKobo > st.amountKobo ? st.planFeeKobo : st.amountKobo,
    discountKobo: discount,
    amountKobo: st.amountKobo,
  };
}
