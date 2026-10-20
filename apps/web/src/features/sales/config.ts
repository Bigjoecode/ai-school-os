/**
 * Sales kit settings: contact details for "Book a demo", the live price list and the public URLs.
 *
 * CONTACT DETAILS: replace each [PLACEHOLDER_…] token below (or set the matching VITE_SALES_* variable
 * at build time). Until a value is filled in, that contact option is hidden on the live site and
 * shown as the token in development so it is easy to spot.
 *
 * PRICES are read live from the API (console → Plans); see useSalesPricing below.
 */
import { DEFAULT_FEATURE_LISTS, priceQuote, type PublicPlan, type SignupConfig } from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const env = import.meta.env as Record<string, string | undefined>;

export const SALES_CONTACT = {
  /** WhatsApp number in international form without "+" or spaces, e.g. 2348012345678. */
  whatsapp: env.VITE_SALES_WHATSAPP || '2349063598091',
  /** Phone number as people should dial it, e.g. 0801 234 5678. */
  phone: env.VITE_SALES_PHONE || '0906 359 8091',
  email: env.VITE_SALES_EMAIL || 'hello@mejortechworld.com',
  /** Optional: who signs the pilot proposal on the boards page, e.g. "Ada Obi, Partnerships". */
  contactName: env.VITE_SALES_CONTACT_NAME || 'Joseph — Partnerships',
};

/**
 * The free pilot offer is live, not a setting here: the pages read GET /api/signup/pilot
 * (console → Subscriptions → Pilot sets the places and opens or closes applications) and
 * hide the offer when it is full or closed. See ./pilot-offer.tsx.
 */
export const PILOT_PATH = '/pilot';

export const isPlaceholder = (v: string) => /^\[PLACEHOLDER/.test(v);
/** Show a contact option: filled in, or (in development only) still a placeholder so it gets noticed. */
export const showContact = (v: string) => !isPlaceholder(v) || import.meta.env.DEV;

/** Self-serve sign-up (built separately). */
export const SIGNUP_PATH = '/signup';

export const SALES_PAGES = [
  { to: '/for-schools', label: 'For schools' },
  { to: '/for-schools/deck', label: 'Deck' },
  { to: '/for-schools/calculator', label: 'Savings calculator' },
  { to: '/for-boards', label: 'For state boards' },
] as const;

export interface SalesPlan {
  id: string | null;
  code: string;
  name: string;
  /** ₦ per student per term (0 for a contact-only plan). */
  price: number;
  maxStudents: number | null;
  summary: string;
  /** One-off setup fee in ₦ and the training days it includes. */
  setupFee: number;
  trainingDays: number;
  minStudents: number;
  smsUnitsPerStudent: number;
  badge: string | null;
  contactOnly: boolean;
  featureIntro: string | null;
  featureList: string[];
}

/**
 * Plans come live from the API (GET /signup/config, i.e. console → Plans), so the brochure, deck,
 * calculator and /pricing always show the same prices. This copy of the defaults is only used if the
 * API can't be reached (the page then says prices are indicative).
 */
export const FALLBACK_SALES_PLANS: SalesPlan[] = (['standard', 'premium', 'ultimate'] as const).map((code) => ({
  id: null,
  code,
  name: code === 'standard' ? 'Standard' : code === 'premium' ? 'Premium' : 'Ultimate',
  price: code === 'standard' ? 2_000 : code === 'premium' ? 3_500 : 0,
  maxStudents: null,
  summary: '',
  setupFee: code === 'standard' ? 100_000 : code === 'premium' ? 150_000 : 0,
  trainingDays: code === 'standard' ? 2 : code === 'premium' ? 3 : 0,
  minStudents: 100,
  smsUnitsPerStudent: 10,
  badge: code === 'standard' ? 'Most popular' : null,
  contactOnly: code === 'ultimate',
  featureIntro: DEFAULT_FEATURE_LISTS[code].intro,
  featureList: DEFAULT_FEATURE_LISTS[code].lines,
}));

export function toSalesPlan(p: PublicPlan): SalesPlan {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    price: priceQuote(p, 0, 'TERM', { minBilledStudents: 0, sessionDiscountPct: 0 }).unitKobo / 100,
    maxStudents: p.maxStudents,
    summary: p.description ?? '',
    setupFee: p.setupFeeKobo / 100,
    trainingDays: p.trainingDays,
    minStudents: p.minStudents,
    smsUnitsPerStudent: p.smsUnitsPerStudent,
    badge: p.badge,
    contactOnly: p.contactOnly,
    featureIntro: p.featureIntro,
    featureList: p.featureList,
  };
}

/** The live price list (plans, add-ons, notes, the session discount) for the sales pages. */
export function useSalesPricing() {
  const q = useQuery({ queryKey: ['signup', 'config'], queryFn: ({ signal }) => api.get<SignupConfig>('/signup/config', undefined, signal), staleTime: 60_000, meta: { silent: true } });
  const live = q.data;
  return {
    loading: q.isLoading,
    live: !!live,
    plans: live?.plans.length ? live.plans.map(toSalesPlan) : FALLBACK_SALES_PLANS,
    addons: live?.addons ?? [],
    notes: live?.notes ?? [],
    sessionDiscountPct: live?.sessionDiscountPct ?? 10,
  };
}

export const naira = (n: number, digits = 0) =>
  `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Math.round(n * 10 ** digits) / 10 ** digits)}`;

export const whatsappLink = (text: string, number?: string) =>
  `https://wa.me/${number && !isPlaceholder(number) ? number.replace(/\D/g, '') : ''}?text=${encodeURIComponent(text)}`;
