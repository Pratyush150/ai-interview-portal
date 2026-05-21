import { create } from "zustand";

interface UIState {
  paletteOpen: boolean;
  shortcutHelpOpen: boolean;
  sidebarCollapsed: boolean;
  setPalette: (open: boolean) => void;
  togglePalette: () => void;
  setShortcutHelp: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  paletteOpen: false,
  shortcutHelpOpen: false,
  sidebarCollapsed: false,
  setPalette: (open) => set({ paletteOpen: open }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setShortcutHelp: (open) => set({ shortcutHelpOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
