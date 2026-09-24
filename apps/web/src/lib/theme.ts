import { create } from 'zustand';
import { safeStorage } from './utils';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'aischool.theme';
const storage = safeStorage();

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readPreference(): ThemePreference {
  const v = storage.get(KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function apply(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
}

const initialPref = readPreference();

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPref,
  resolved: initialPref === 'system' ? systemTheme() : initialPref,
  setPreference: (preference) => {
    storage.set(KEY, preference);
    const resolved = preference === 'system' ? systemTheme() : preference;
    apply(resolved);
    set({ preference, resolved });
  },
  toggle: () => get().setPreference(get().resolved === 'dark' ? 'light' : 'dark'),
}));

/** Keep the class in sync with the OS while the preference is "system". */
export function initTheme() {
  const { resolved } = useThemeStore.getState();
  apply(resolved);
  if (!window.matchMedia) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    const state = useThemeStore.getState();
    if (state.preference !== 'system') return;
    const next = systemTheme();
    apply(next);
    useThemeStore.setState({ resolved: next });
  });
}
