/**
 * Sales kit settings: contact details for "Book a demo", plan prices and the public URLs.
 *
 * CONTACT DETAILS: replace each [PLACEHOLDER_…] token below (or set the matching VITE_SALES_* variable
 * at build time). Until a value is filled in, that contact option is hidden on the live site and
 * shown as the token in development so it is easy to spot.
 *
 * PRICES mirror the plans seeded in apps/api/src/prisma/platform-seed.ts (console → Plans can change
 * them). If you change a price in the console, change it here too so the brochure, deck and
 * calculator stay in step.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const SALES_CONTACT = {
  /** WhatsApp number in international form without "+" or spaces, e.g. 2348012345678. */
  whatsapp: env.VITE_SALES_WHATSAPP || '[PLACEHOLDER_WHATSAPP]',
  /** Phone number as people should dial it, e.g. 0801 234 5678. */
  phone: env.VITE_SALES_PHONE || '[PLACEHOLDER_PHONE]',
  email: env.VITE_SALES_EMAIL || '[PLACEHOLDER_EMAIL]',
  /** Optional: who signs the pilot proposal on the boards page, e.g. "Ada Obi, Partnerships". */
  contactName: env.VITE_SALES_CONTACT_NAME || '[PLACEHOLDER_CONTACT_NAME]',
  /** One sentence with your pilot terms, e.g. a price or discount for the first term. Hidden until filled in. */
  pilotTerms: env.VITE_SALES_PILOT_TERMS || '[PLACEHOLDER_PILOT_TERMS]',
};

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
  code: string;
  name: string;
  /** ₦ per student per term. */
  price: number;
  maxStudents: number | null;
  summary: string;
}

export const SALES_PLANS: SalesPlan[] = [
  {
    code: 'starter',
    name: 'Starter',
    price: 1_200,
    maxStudents: 300,
    summary: 'The school core: attendance, exams and results, report cards, fees, the timetable and messages, with a small AI allowance.',
  },
  {
    code: 'school-license',
    name: 'Growth',
    price: 2_000,
    maxStudents: 1_500,
    summary: 'Everything in Starter plus the school website, online fee payments, live classes and the library.',
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    price: 3_500,
    maxStudents: null,
    summary: 'Every module, including HR and payroll, inventory, transport and hostels, with a large AI allowance and priority support.',
  },
];

export const naira = (n: number, digits = 0) =>
  `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Math.round(n * 10 ** digits) / 10 ** digits)}`;

export const whatsappLink = (text: string, number?: string) =>
  `https://wa.me/${number && !isPlaceholder(number) ? number.replace(/\D/g, '') : ''}?text=${encodeURIComponent(text)}`;
