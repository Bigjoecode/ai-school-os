/**
 * The Play Store app is this same site inside a Trusted Web Activity (TWA): Chrome, full screen,
 * with no address bar. Here it is detected so the site doesn't offer to "install" itself, and
 * links that belong to other apps (WhatsApp, YouTube) open those apps instead of an empty tab.
 *
 * Detection: Android opens the TWA with a referrer of `android-app://<package>/` on the first
 * page. That is remembered for the tab (sessionStorage), so reloads and later pages still know.
 * tel:, mailto: and Paystack checkout need nothing special: Chrome hands tel:/mailto: to the
 * phone's dialler and email app, and Paystack's page opens over the app with a small address
 * bar until it returns to the portal.
 */

const KEY = 'ais:android-app';

function detect(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (document.referrer.startsWith('android-app://')) {
      sessionStorage.setItem(KEY, document.referrer);
      return true;
    }
    return !!sessionStorage.getItem(KEY);
  } catch {
    return document.referrer.startsWith('android-app://');
  }
}

const insideAndroidApp = detect();

/** Running inside the Play Store app (Trusted Web Activity). */
export const isAndroidApp = (): boolean => insideAndroidApp;

/**
 * An Android intent link that opens the right app, falling back to the web page when the app
 * isn't installed. Null for links that need nothing special.
 */
export function androidIntentFor(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  const fallback = `S.browser_fallback_url=${encodeURIComponent(url.href)}`;
  const host = url.hostname.replace(/^www\./, '');
  // WhatsApp: wa.me/<number>?text=… and api.whatsapp.com/send?phone=…&text=…
  if (host === 'wa.me' || host === 'api.whatsapp.com') {
    const params = new URLSearchParams(url.search);
    const phone = host === 'wa.me' ? url.pathname.replace(/\//g, '') : (params.get('phone') ?? '');
    const text = params.get('text');
    // encodeURIComponent, not URLSearchParams: spaces must be %20, not "+", for WhatsApp.
    const query = [phone && `phone=${encodeURIComponent(phone)}`, text && `text=${encodeURIComponent(text)}`].filter(Boolean).join('&');
    // No package: WhatsApp and WhatsApp Business both answer the whatsapp:// scheme.
    return `intent://send?${query}#Intent;scheme=whatsapp;${fallback};end`;
  }
  // YouTube videos.
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.google.android.youtube;${fallback};end`;
  }
  return null;
}

/** Called once at start-up: inside the app, send WhatsApp/YouTube links to their apps. */
export function initAndroidApp() {
  if (!insideAndroidApp) return;
  document.documentElement.dataset.androidApp = 'true';
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.hasAttribute('download')) return;
      const intent = androidIntentFor(link.href);
      if (!intent) return;
      event.preventDefault();
      window.location.href = intent;
    },
    // Bubble phase: React's own handlers (which may preventDefault) run first.
    false,
  );
}
