import {
  DEFAULT_ADDONS,
  DEFAULT_FEATURE_LISTS,
  LEGACY_PLAN_MAP,
  MODULE_FEATURE_KEYS,
  PLAN_CODES,
  PRICING_SETTINGS_KEY,
  pricingSettingsSchema,
  STANDARD_MODULES,
} from '@aischool/shared';
import type { PrismaClient } from '../generated/prisma/client';

/**
 * The Standard / Premium / Ultimate price list and the add-on catalogue,
 * installed once (a platform setting remembers it), so console edits and
 * deletions are never undone. Existing subscriptions are not touched: the old
 * public plans only leave the pricing page (still active, so schools on them
 * keep renewing at their price).
 */
export async function ensurePricePlans(prisma: PrismaClient): Promise<string> {
  const row = await prisma.platformSetting.findUnique({ where: { key: PRICING_SETTINGS_KEY } });
  const settings = pricingSettingsSchema.parse(row?.value ?? {});
  const done: string[] = [];
  // Normally set by the migration; schools created before this moment never owe a setup fee.
  settings.setupFeesFrom ??= new Date().toISOString();
  if (!settings.catalogueSeeded) {
    const known = [...MODULE_FEATURE_KEYS];
    const plans = [
      {
        code: PLAN_CODES.STANDARD,
        name: 'Standard',
        description: 'Everything a school needs day to day: results, fees and online payments, attendance and gate check-in, messaging, portals, CBT and admissions.',
        pricePerStudentKobo: 2_000_00,
        billingPeriod: 'PER_TERM' as const,
        aiMonthlyBudgetUsd: 10,
        maxStudents: null,
        features: [...STANDARD_MODULES],
        knownFeatures: known,
        studentAiSessions: 20,
        setupFeeKobo: 100_000_00,
        trainingDays: 2,
        minStudents: 100,
        smsUnitsPerStudent: 10,
        badge: 'Most popular',
        contactOnly: false,
        featureIntro: DEFAULT_FEATURE_LISTS.standard.intro,
        featureList: DEFAULT_FEATURE_LISTS.standard.lines,
        sortOrder: 10,
      },
      {
        code: PLAN_CODES.PREMIUM,
        name: 'Premium',
        description: 'Standard plus HR and payroll, stores, transport, hostel, the timetable generator, health, houses, careers and JAMB, and a larger AI allowance.',
        pricePerStudentKobo: 3_500_00,
        billingPeriod: 'PER_TERM' as const,
        aiMonthlyBudgetUsd: 40,
        maxStudents: null,
        features: [] as string[],
        knownFeatures: known,
        studentAiSessions: 40,
        setupFeeKobo: 150_000_00,
        trainingDays: 3,
        minStudents: 100,
        smsUnitsPerStudent: 10,
        badge: null,
        contactOnly: false,
        featureIntro: DEFAULT_FEATURE_LISTS.premium.intro,
        featureList: DEFAULT_FEATURE_LISTS.premium.lines,
        sortOrder: 20,
      },
      {
        code: PLAN_CODES.ULTIMATE,
        name: 'Ultimate',
        description: 'For large schools and groups of schools: everything in Premium, with dedicated support and customisations, priced for you.',
        pricePerStudentKobo: 0,
        billingPeriod: 'PER_TERM' as const,
        aiMonthlyBudgetUsd: 100,
        maxStudents: null,
        features: [] as string[],
        knownFeatures: known,
        studentAiSessions: 40,
        setupFeeKobo: 0,
        trainingDays: 0,
        minStudents: null,
        smsUnitsPerStudent: 10,
        badge: null,
        contactOnly: true,
        featureIntro: DEFAULT_FEATURE_LISTS.ultimate.intro,
        featureList: DEFAULT_FEATURE_LISTS.ultimate.lines,
        sortOrder: 30,
      },
    ];
    for (const p of plans) {
      const exists = await prisma.plan.findUnique({ where: { code: p.code }, select: { id: true } });
      if (!exists) {
        await prisma.plan.create({ data: p });
        done.push(p.name);
      }
    }
    for (const a of DEFAULT_ADDONS) {
      const exists = await prisma.addon.findUnique({ where: { code: a.code }, select: { id: true } });
      if (!exists) await prisma.addon.create({ data: a });
    }
    settings.catalogueSeeded = true;
  }
  if (!settings.legacyRetired) {
    const r = await prisma.plan.updateMany({ where: { code: { in: Object.keys(LEGACY_PLAN_MAP) }, isPublic: true }, data: { isPublic: false } });
    if (r.count) done.push(`${r.count} old plan(s) taken off the pricing page`);
    settings.legacyRetired = true;
  }
  if (!row || JSON.stringify(row.value) !== JSON.stringify(settings)) {
    await prisma.platformSetting.upsert({ where: { key: PRICING_SETTINGS_KEY }, update: { value: settings }, create: { key: PRICING_SETTINGS_KEY, value: settings } });
  }
  return done.join(', ');
}
