import { CloudOff, Share, Smartphone, SquarePlus, WifiOff, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMe } from '@/lib/auth-store';
import { applyUpdate } from './register';
import { isIos, promptInstall, useCanInstall, usePwaStore } from './store';

/** What the layer needs from the data router (it sits beside RouterProvider, not inside it). */
export interface RouterLike {
  state: { location: { pathname: string } };
  subscribe: (fn: () => void) => () => void;
}

const TROUBLE_WINDOW_MS = 30_000;
const BANNER_DISMISSED = 'ais:install-banner-dismissed';

function usePathname(router: RouterLike): string {
  return useSyncExternalStore(router.subscribe, () => router.state.location.pathname);
}

/** Exam rooms are left completely alone: no banners, no update prompts. */
const isQuiet = (pathname: string) => pathname.startsWith('/exam-room/') || pathname === '/attendance/kiosk';

function savedLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return today ? `last updated ${time}` : `last updated ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}

/** "You're offline — showing saved information", while the connection is missing or failing. */
function ConnectionBanner() {
  const online = usePwaStore((s) => s.online);
  const troubleAt = usePwaStore((s) => s.troubleAt);
  const savedAt = usePwaStore((s) => s.savedAt);
  const [now, setNow] = useState(() => Date.now());
  const troubled = troubleAt > 0 && now - troubleAt < TROUBLE_WINDOW_MS;

  useEffect(() => {
    setNow(Date.now());
    if (!troubleAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, [troubleAt]);

  if (online && !troubled) return null;
  const when = savedLabel(savedAt);
  const text = !online
    ? `You’re offline — showing saved information${when ? ` · ${when}` : ''}`
    : savedAt
      ? `Weak connection — showing saved information${when ? ` · ${when}` : ''}`
      : 'Can’t reach the server — check your connection';
  const Icon = online ? CloudOff : WifiOff;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-3"
      style={{ top: 'max(env(safe-area-inset-top), 0.5rem)' }}
    >
      <p className="flex max-w-full items-center gap-2 rounded-2xl border border-warning/30 bg-warning-soft px-3.5 py-1.5 text-[12.5px] font-medium text-warning shadow-soft backdrop-blur">
        <Icon className="size-3.5 shrink-0" />
        <span className="leading-snug">{text}</span>
      </p>
    </div>
  );
}

/** One-time card for parents and students on phones. */
function InstallBanner({ pathname }: { pathname: string }) {
  const me = useMe();
  const canInstall = useCanInstall();
  const [visible, setVisible] = useState(false);

  const audience = !!me && (me.permissions.includes('family.manage') || me.permissions.includes('learning.use'));
  const eligible = canInstall && audience && pathname !== '/login';

  useEffect(() => {
    if (!eligible) {
      setVisible(false);
      return;
    }
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(BANNER_DISMISSED) === '1';
    } catch {
      /* storage blocked: show it, it can still be closed for this visit */
    }
    const phone = window.matchMedia('(max-width: 767px)').matches || window.matchMedia('(pointer: coarse)').matches;
    if (dismissed || !phone) return;
    // Let the first screen settle before asking.
    const t = window.setTimeout(() => setVisible(true), 4000);
    return () => window.clearTimeout(t);
  }, [eligible]);

  if (!visible) return null;
  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(BANNER_DISMISSED, '1');
    } catch {
      /* fine */
    }
  };
  return (
    <div
      className="fixed inset-x-0 z-[60] flex justify-center px-3"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      role="dialog"
      aria-label="Install the app"
    >
      <div className="relative flex w-full max-w-md items-start gap-3 rounded-2xl border border-border bg-card p-4 pr-10 shadow-pop">
        <img src="/icons/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl" width={44} height={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Get the AI School app</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
            Open it from your home screen. It starts faster, uses less data and still shows your saved information when the network is poor.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="brand"
              onClick={() => {
                dismiss();
                void promptInstall();
              }}
            >
              {isIos() ? <Share /> : <Smartphone />} {isIos() ? 'How to install' : 'Install'}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label="Close" className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** iPhone and iPad have no install prompt: explain the Share menu instead. */
function IosInstallDialog() {
  const open = usePwaStore((s) => s.iosHelpOpen);
  const set = usePwaStore((s) => s.set);
  return (
    <Dialog open={open} onOpenChange={(o) => set({ iosHelpOpen: o })}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Add AI School OS to your Home Screen</DialogTitle>
          <DialogDescription>It opens like an app, full screen, straight from your Home Screen.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ol className="space-y-3 text-[14px]">
            <li className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand">1</span>
              <span>
                Tap the <Share className="inline size-4 align-[-3px] text-brand" aria-label="Share" /> <strong>Share</strong> button in Safari’s toolbar.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand">2</span>
              <span>
                Scroll down and tap <SquarePlus className="inline size-4 align-[-3px] text-brand" aria-hidden /> <strong>Add to Home Screen</strong>.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand">3</span>
              <span>
                Tap <strong>Add</strong>. Then open AI School from your Home Screen.
              </span>
            </li>
          </ol>
          <p className="mt-4 text-[12.5px] text-muted-foreground">Don’t see it? Open this page in Safari first — some other browsers on iPhone don’t offer it.</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** Offline notice, update prompt and install offers for the portal. Rendered once, beside the router. */
export function PwaLayer({ router }: { router: RouterLike }) {
  const pathname = usePathname(router);
  const quiet = isQuiet(pathname);
  const updateReady = usePwaStore((s) => s.updateReady);

  useEffect(() => {
    // Never during an exam: the notice waits until the student leaves the exam room.
    if (!updateReady || quiet) {
      toast.dismiss('ais-update');
      return;
    }
    toast('A new version of AI School OS is ready', {
      id: 'ais-update',
      description: 'Reload to use it — it takes a moment.',
      duration: Infinity,
      closeButton: true,
      action: { label: 'Reload', onClick: applyUpdate },
    });
  }, [updateReady, quiet]);

  return (
    <>
      {!quiet && <ConnectionBanner />}
      {!quiet && <InstallBanner pathname={pathname} />}
      <IosInstallDialog />
    </>
  );
}
