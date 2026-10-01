import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth-store';
import { ck } from './api';

/** Which signed-in user this browser's subscription was last linked to (once per page load). */
let linkedTo: string | null = null;

export type PushState = 'unsupported' | 'loading' | 'off' | 'on' | 'blocked';

export function pushSupported(): boolean {
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

/** Browser notifications for this device: whether they're on, and switches for them. */
export function usePush() {
  const me = useMe();
  const supported = pushSupported();
  const key = useQuery({
    queryKey: ck.pushKey,
    queryFn: ({ signal }) => api.get<{ publicKey: string | null }>('/push/key', undefined, signal),
    enabled: supported && !!me,
    staleTime: Infinity,
  });
  const publicKey = key.data?.publicKey ?? null;
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
  return { available, state, busy, enable, disable };
}
