import { create } from 'zustand';

/** Chrome/Edge/Samsung Internet's install offer (not in the DOM typings). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** navigator.onLine, kept up to date. */
  online: boolean;
  /** Last time a request failed for want of a network (or the worker answered from its saved copy). */
  troubleAt: number;
  /** Oldest "saved at" of the data on screen while the connection is poor. */
  savedAt: string | null;
  /** Signed in from the saved copy because there was no connection at start-up. */
  savedSession: boolean;
  /** A new version is installed and waiting for a reload. */
  updateReady: boolean;
  installEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  iosHelpOpen: boolean;
  set: (patch: Partial<Omit<PwaState, 'set'>>) => void;
}

export const isStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** iPhone/iPad: no install prompt — people add it from the Share menu. */
export const isIos = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const usePwaStore = create<PwaState>((set) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  troubleAt: 0,
  savedAt: null,
  savedSession: false,
  updateReady: false,
  installEvent: null,
  installed: isStandalone(),
  iosHelpOpen: false,
  set: (patch) => set(patch),
}));

/** Whether there is a way to install from here (and it isn't installed already). */
export function useCanInstall(): boolean {
  return usePwaStore((s) => !s.installed && (!!s.installEvent || isIos()));
}

/** Shows the browser's install prompt, or the iPhone instructions. */
export async function promptInstall(): Promise<void> {
  const { installEvent, set } = usePwaStore.getState();
  if (installEvent) {
    await installEvent.prompt();
    const choice = await installEvent.userChoice.catch(() => null);
    // The event can only be used once.
    set({ installEvent: null, installed: choice?.outcome === 'accepted' || isStandalone() });
    return;
  }
  if (isIos()) set({ iosHelpOpen: true });
}
