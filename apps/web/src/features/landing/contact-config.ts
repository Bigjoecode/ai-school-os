import { SALES_CONTACT } from '@/features/sales/config';

/**
 * Contact details shown on the public landing page (the "Talk to us" cards and the footer).
 *
 * They come from SALES_CONTACT, so the landing page, pricing and boards pages always agree.
 * A value left as TODO_… hides its card on the live site. The demo request form on the page works without these:
 * it posts to the existing enquiry endpoint (POST /api/signup/enquiry → console → Price list → Enquiries).
 */
export const LANDING_CONTACT = {
  /** The same sales contact the pricing and boards pages already publish (VITE_SALES_* overrides it). */
  phone: SALES_CONTACT.phone,
  whatsapp: SALES_CONTACT.whatsapp,
  email: SALES_CONTACT.email,
};

export const isTodo = (v: string) => !v || v.startsWith('TODO_');

/** Show placeholders while developing or previewing locally, never on the live site. */
export const showPlaceholders = () => import.meta.env.DEV || /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

export const DEMO_MESSAGE = 'Hello, I would like a demo of AI School OS for my school.';

export interface ContactCard {
  key: 'phone' | 'whatsapp' | 'email';
  label: string;
  value: string;
  href: string | null;
  placeholder: boolean;
}

/** The contact cards to show: filled-in values, plus placeholders when previewing locally. */
export function contactCards(): ContactCard[] {
  const c = LANDING_CONTACT;
  const all: ContactCard[] = [
    { key: 'phone', label: 'Call us', value: c.phone, href: isTodo(c.phone) ? null : `tel:${c.phone.replace(/[^\d+]/g, '')}`, placeholder: isTodo(c.phone) },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      value: isTodo(c.whatsapp) ? c.whatsapp : `+${c.whatsapp.replace(/\D/g, '')}`,
      href: isTodo(c.whatsapp) ? null : `https://wa.me/${c.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(DEMO_MESSAGE)}`,
      placeholder: isTodo(c.whatsapp),
    },
    {
      key: 'email',
      label: 'Email',
      value: c.email,
      href: isTodo(c.email) ? null : `mailto:${c.email}?subject=${encodeURIComponent('Demo of AI School OS')}&body=${encodeURIComponent(DEMO_MESSAGE)}`,
      placeholder: isTodo(c.email),
    },
  ];
  const preview = showPlaceholders();
  return all.filter((x) => !x.placeholder || preview);
}
