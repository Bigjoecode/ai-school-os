import { REFERRAL_STORAGE_KEY, REFERRAL_TTL_DAYS } from '@aischool/shared';

/**
 * Ambassador referral codes on the public site. A link like /signup?ref=ADA25 (or any sales
 * page with ?ref=) remembers the code for 90 days in localStorage and a first-party cookie, so
 * it survives browsing around before the school signs up. The server checks the code; an
 * invalid one is simply ignored.
 */
const CODE = /^[A-Za-z0-9]{3,12}$/;
/** Only these public pages take ?ref= as a referral (elsewhere "ref" can mean a payment reference). */
const PAGES = /^\/(signup|pilot|pricing|for-schools|for-boards|ambassadors)(\/|$)/;
const TTL_MS = REFERRAL_TTL_DAYS * 86_400_000;

export function rememberReferral(code: string) {
  const c = code.trim().toUpperCase();
  if (!CODE.test(c)) return;
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code: c, at: Date.now() }));
  } catch {
    /* private mode: the cookie still holds it */
  }
  try {
    document.cookie = `${REFERRAL_STORAGE_KEY}=${c}; Max-Age=${REFERRAL_TTL_DAYS * 86_400}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {
    /* ignore */
  }
}

export function forgetReferral() {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${REFERRAL_STORAGE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

/** The remembered code: localStorage first (with its 90-day clock), then the cookie. */
export function storedReferral(): string | null {
  try {
    const raw = localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { code?: string; at?: number };
      if (v.code && CODE.test(v.code) && typeof v.at === 'number' && Date.now() - v.at < TTL_MS) return v.code;
    }
  } catch {
    /* fall through to the cookie */
  }
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${REFERRAL_STORAGE_KEY}=([A-Za-z0-9]{3,12})`));
    if (m?.[1]) return m[1].toUpperCase();
  } catch {
    /* ignore */
  }
  return null;
}

/** At boot: picks up ?ref= on the public sales and sign-up pages. */
export function captureReferral() {
  try {
    if (!PAGES.test(location.pathname)) return;
    const ref = new URLSearchParams(location.search).get('ref');
    if (ref) rememberReferral(ref);
  } catch {
    /* never break the page over a referral */
  }
}
