import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth-store';
import {
  currentNativePushToken,
  disableNativePush,
  enableNativePush,
  isIosApp,
  nativePushPermission,
  nativePushSupported,
  nativePushTurnedOff,
} from '@/pwa/ios-app';
import { ck } from './api';

/** Which signed-in user this browser's subscription was last linked to (once per page load). */
let linkedTo: string | null = null;

export type PushState = 'unsupported' | 'loading' | 'off' | 'on' | 'blocked';

export function pushSupported(): boolean {
  // The iPhone app gets native notifications (APNs) instead of web push.
  if (isIosApp()) return nativePushSupported();
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** VAPID public key (base64url) → the bytes PushManager wants. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Notifications for this device: whether they're on, and switches for them. */
export function usePush() {
  const native = isIosApp();
  const me = useMe();
  const supported = pushSupported();
  const key = useQuery({
    queryKey: ck.pushKey,
    queryFn: ({ signal }) => api.get<{ publicKey: string | null; apns?: boolean }>('/push/key', undefined, signal),
    enabled: supported && !!me,
    staleTime: Infinity,
  });
  const web = useWebPush(!native && supported, key.data?.publicKey ?? null);
  const app = useNativePush(native && supported, !!key.data?.apns);
  return native ? app : web;
}

/** The iPhone app: APNs through the native PushNotifications plugin. */
function useNativePush(supported: boolean, serverReady: boolean) {
  const me = useMe();
  const [state, setState] = useState<PushState>(supported ? 'loading' : 'unsupported');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported || !serverReady) return;
    let alive = true;
    void (async () => {
      const permission = await nativePushPermission();
      if (!alive) return;
      if (permission === 'denied') return setState('blocked');
      if (permission !== 'granted' || nativePushTurnedOff()) return setState('off');
      setState('on');
      // Link this phone to whoever is signed in now (a shared phone may have been someone else's).
      if (me && linkedTo !== me.user.id) {
        const token = await currentNativePushToken();
        if (token) {
          linkedTo = me.user.id;
          await api.post('/push/native', { platform: 'ios', token }).catch(() => undefined);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [supported, serverReady, me?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const r = await enableNativePush();
      if ('denied' in r) {
        setState('blocked');
        toast.error('Notifications are off for AI School OS — turn them on in your iPhone’s Settings → Notifications.');
        return;
      }
      await api.post('/push/native', { platform: 'ios', token: r.token });
      linkedTo = me?.user.id ?? null;
      setState('on');
      toast.success('Notifications are on for this device');
    } catch (err) {
      toast.error(`Couldn’t turn on notifications: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }, [me?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const token = disableNativePush() ?? (await currentNativePushToken().catch(() => null));
      if (token) await api.post('/push/native/unregister', { platform: 'ios', token }).catch(() => undefined);
      linkedTo = null;
      setState('off');
      toast.success('Notifications are off for this device');
    } finally {
      setBusy(false);
    }
  }, []);

  return { available: supported && serverReady, state, busy, enable, disable, native: true };
}

/** Browsers: web push through the service worker. */
function useWebPush(supported: boolean, publicKey: string | null) {
  const me = useMe();
  const [state, setState] = useState<PushState>(supported ? 'loading' : 'unsupported');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported || !publicKey) return;
    let alive = true;
    void (async () => {
      try {
        const sub = await currentSubscription();
        if (!alive) return;
        if (Notification.permission === 'denied') setState('blocked');
        else setState(sub ? 'on' : 'off');
        // A shared browser may have been subscribed by someone else: link it to whoever is signed in now.
        if (sub && me && linkedTo !== me.user.id) {
          linkedTo = me.user.id;
          await api.post('/push/subscribe', sub.toJSON()).catch(() => undefined);
        }
      } catch {
        if (alive) setState('off');
      }
    })();
    return () => {
      alive = false;
    };
  }, [supported, publicKey, me?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const enable = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        if (permission === 'denied') toast.error('Notifications are blocked for this site — allow them in your browser’s site settings.');
        return;
      }
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await api.post('/push/subscribe', sub.toJSON());
      linkedTo = me?.user.id ?? null;
      setState('on');
      toast.success('Browser notifications are on for this device');
    } catch (err) {
      toast.error(`Couldn’t turn on notifications: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }, [publicKey, me?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await api.post('/push/unsubscribe', { endpoint }).catch(() => undefined);
      }
      setState('off');
      toast.success('Browser notifications are off for this device');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  /** Hidden when the server has no VAPID keys or the browser can't do push. */
  const available = supported && !!publicKey;
  return { available, state, busy, enable, disable, native: false };
}
