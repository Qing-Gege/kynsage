import { create } from 'zustand';
import type { ThemeName } from '@marshal/design-tokens';
import { THEMES } from '@marshal/design-tokens';

interface ThemeStore {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  applyTheme: (theme: ThemeName) => void;
}

// 旧主题名 → 新主题名迁移(light/sepia/dark 已废弃)。
const LEGACY: Record<string, ThemeName> = { light: 'white', sepia: 'paper', dark: 'ink' };

const stored = localStorage.getItem('marshal.theme');
const migrated = stored && LEGACY[stored] ? LEGACY[stored] : stored;
const saved: ThemeName = migrated && migrated in THEMES ? (migrated as ThemeName) : 'white';

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: saved,
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem('marshal.theme', theme);
  },
  applyTheme: (theme) => {
    const tokens = THEMES[theme];
    if (tokens) {
      Object.entries(tokens).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
      });
    }
    document.documentElement.setAttribute('data-theme', theme);
  },
}));
