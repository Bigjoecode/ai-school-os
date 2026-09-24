import { create } from 'zustand';
import { safeStorage } from './utils';

const storage = safeStorage();
const COLLAPSE_KEY = 'aischool.sidebar.collapsed';

interface UiState {
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  mobileNavOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  sidebarCollapsed: storage.get(COLLAPSE_KEY) === '1',
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    storage.set(COLLAPSE_KEY, next ? '1' : '0');
    set({ sidebarCollapsed: next });
  },
}));
