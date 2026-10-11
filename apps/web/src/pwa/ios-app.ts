/**
 * The App Store app is this same site inside a native iOS shell (Capacitor, see ios/README.md):
 * WKWebView loads https://ai-schoolportal.mejortechworld.com and the shell adds a few native
 * features — push notifications (APNs), the share sheet, haptics, the status bar and the launch
 * screen. Here the site detects the app, hides what doesn't belong in it (install prompts, and
 * digital purchases — see `allowDigitalPurchases`) and talks to the native plugins.
 *
 * Detection: the shell adds "AISchoolOS-iOS/<n>" to the user agent (capacitor.config.json
 * appendUserAgent) and injects `window.Capacitor` before the page's own scripts run.
 *
 * The plugins are called through the bridge Capacitor injects (`nativePromise` / `nativeCallback`),
 * so the website needs no Capacitor package in its bundle: in a browser all of this is inert.
 * Links to other sites (Paystack, WhatsApp, YouTube, schools' own websites) need nothing here: the
 * shell opens any page outside the portal in Safari or the matching app.
 */

interface CapacitorBridge {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  PluginHeaders?: { name: string }[];
  nativePromise?: <T>(plugin: string, method: string, options?: object) => Promise<T>;
  nativeCallback?: (plugin: string, method: string, options: object, callback: (data: unknown, error?: unknown) => void) => string;
}

const UA_MARK = 'AISchoolOS-iOS/';

function bridge(): CapacitorBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

function detect(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgent.includes(UA_MARK)) return true;
  const cap = bridge();
  return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === 'ios';
}

const insideIosApp = detect();

/** Running inside the App Store app (iPhone / iPad). */
export const isIosApp = (): boolean => insideIosApp;

/**
 * Whether this copy of the site may sell digital goods and subscriptions (the parents' AI and
 * exam-prep extras, a school's platform plan, result-checker PINs). Apple requires In-App Purchase
 * for those inside an iOS app, so the iOS app shows a neutral "manage this on the web" note
 * instead — with no link or button to an outside checkout. School fees (a real-world service) are
 * paid through Paystack as on the web. See docs/app-store/README.md, "Payments".
 */
export const allowDigitalPurchases = (): boolean => !insideIosApp;

/** The neutral wording shown where a digital purchase would be. No link, no price, no "cheaper elsewhere". */
export const IOS_PURCHASE_NOTE = 'This isn’t available in the iPhone app. Your account works the same in the app and on the web.';

// ---------------------------------------------------------------- plugin calls

/** Whether the shell includes a native plugin. */
export function hasPlugin(name: string): boolean {
  const cap = bridge();
  return insideIosApp && !!cap?.nativePromise && !!cap.PluginHeaders?.some((h) => h.name === name);
}

/** Calls a native plugin method; null when not in the app or the plugin is missing. */
export async function callPlugin<T = unknown>(plugin: string, method: string, options: object = {}): Promise<T | null> {
  if (!hasPlugin(plugin)) return null;
  return bridge()!.nativePromise!<T>(plugin, method, options);
}

/** Listens to a native plugin event; returns a function that stops listening. */
export function onPluginEvent<T>(plugin: string, eventName: string, listener: (data: T) => void): () => void {
  const cap = bridge();
  if (!hasPlugin(plugin) || !cap?.nativeCallback) return () => undefined;
  const callbackId = cap.nativeCallback(plugin, 'addListener', { eventName }, (data) => listener(data as T));
  return () => void cap.nativePromise?.(plugin, 'removeListener', { eventName, callbackId }).catch(() => undefined);
}

/** A light tap on the phone's haptic engine (games). Silent outside the app. */
export function haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light'): boolean {
  if (!hasPlugin('Haptics')) return false;
  const p =
    kind === 'success' || kind === 'error'
      ? callPlugin('Haptics', 'notification', { type: kind === 'success' ? 'SUCCESS' : 'ERROR' })
      : callPlugin('Haptics', 'impact', { style: kind.toUpperCase() });
  void p.catch(() => undefined);
  return true;
}

/** The iOS share sheet. Resolves false when not in the app (use the web fallback then). */
export async function nativeShare(data: { title?: string; text?: string; url?: string }): Promise<boolean> {
  if (!hasPlugin('Share')) return false;
  try {
    await callPlugin('Share', 'share', { ...data, dialogTitle: data.title });
  } catch {
    /* the person closed the sheet */
  }
  return true;
}

// ---------------------------------------------------------------- push notifications (APNs)

type PermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
const PUSH = 'PushNotifications';
/** The person turned notifications off in the app (we don't re-register on start-up). */
const PUSH_OFF_KEY = 'ais:ios-push-off';
let lastToken: string | null = null;

export const nativePushSupported = (): boolean => hasPlugin(PUSH);

export async function nativePushPermission(): Promise<PermissionState | null> {
  const r = await callPlugin<{ receive: PermissionState }>(PUSH, 'checkPermissions').catch(() => null);
  return r?.receive ?? null;
}

export function nativePushTurnedOff(): boolean {
  try {
    return localStorage.getItem(PUSH_OFF_KEY) === '1';
  } catch {
    return false;
  }
}

function setTurnedOff(off: boolean) {
  try {
    if (off) localStorage.setItem(PUSH_OFF_KEY, '1');
    else localStorage.removeItem(PUSH_OFF_KEY);
  } catch {
    /* storage blocked */
  }
}

/** Registers with APNs and resolves with this device's token. */
function deviceToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const stops: (() => void)[] = [];
    const done = () => {
      window.clearTimeout(timer);
      stops.forEach((s) => s());
    };
    const timer = window.setTimeout(() => {
      done();
      reject(new Error('The phone didn’t answer. Check your connection and try again.'));
    }, 20_000);
    stops.push(
      onPluginEvent<{ value: string }>(PUSH, 'registration', (t) => {
        done();
        lastToken = t.value;
        resolve(t.value);
      }),
      onPluginEvent<{ error: string }>(PUSH, 'registrationError', (e) => {
        done();
        reject(new Error(e.error || 'Notifications couldn’t be set up on this phone'));
      }),
    );
    void callPlugin(PUSH, 'register').catch((err: unknown) => {
      done();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

/**
 * Asks permission if needed and returns the device token, or null when the person said no.
 * The caller sends the token to the API (POST /push/native).
 */
export async function enableNativePush(): Promise<{ token: string } | { denied: true }> {
  let state = await nativePushPermission();
  if (state !== 'granted') {
    const r = await callPlugin<{ receive: PermissionState }>(PUSH, 'requestPermissions');
    state = r?.receive ?? 'denied';
  }
  if (state !== 'granted') return { denied: true };
  setTurnedOff(false);
  return { token: await deviceToken() };
}

/** Already allowed (and not turned off here): the current token, to link it to whoever is signed in. */
export async function currentNativePushToken(): Promise<string | null> {
  if (nativePushTurnedOff() || (await nativePushPermission()) !== 'granted') return null;
  return lastToken ?? deviceToken().catch(() => null);
}

/** Turned off in the app: the caller unlinks the returned token from the account (POST /push/native/unregister). */
export function disableNativePush(): string | null {
  setTurnedOff(true);
  return lastToken;
}

// ---------------------------------------------------------------- start-up

function followTheme() {
  if (!hasPlugin('StatusBar')) return;
  const apply = () => {
    // DARK = light text, for the dark theme; LIGHT = dark text.
    const dark = document.documentElement.classList.contains('dark');
    void callPlugin('StatusBar', 'setStyle', { style: dark ? 'DARK' : 'LIGHT' }).catch(() => undefined);
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

/** Called once at start-up (from initPwa). */
export function initIosApp() {
  if (!insideIosApp) return;
  document.documentElement.dataset.iosApp = 'true';
  followTheme();
  // The site is on screen: lift the launch screen now rather than after its timeout.
  void callPlugin('SplashScreen', 'hide', { fadeOutDuration: 200 }).catch(() => undefined);
  // Tapping a notification opens the page it is about (the API puts it in the payload as "url").
  onPluginEvent<{ notification?: { data?: { url?: unknown } } }>(PUSH, 'pushNotificationActionPerformed', (action) => {
    const url = action.notification?.data?.url;
    if (typeof url !== 'string' || !url) return;
    try {
      const target = new URL(url, window.location.origin);
      if (target.origin === window.location.origin) window.location.assign(target.pathname + target.search + target.hash);
    } catch {
      /* not a URL */
    }
  });
}
