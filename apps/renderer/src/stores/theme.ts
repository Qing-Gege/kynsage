import { create } from 'zustand';
import type { ThemeName, Theme } from '@marshal/design-tokens';
import { darkTheme, sepiaTheme, lightTheme } from '@marshal/design-tokens';

interface ThemeStore {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  applyTheme: (theme: ThemeName) => void;
}

const themes: Record<ThemeName, Theme> = {
  dark: darkTheme,
  sepia: sepiaTheme,
  light: lightTheme,
};

const stored = localStorage.getItem('marshal.theme') as ThemeName | null;
const saved: ThemeName = stored && stored in themes ? stored : 'light';

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: saved,
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem('marshal.theme', theme);
  },
  applyTheme: (theme) => {
    const tokens = themes[theme];
    if (tokens) {
      Object.entries(tokens).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
      });
    }
    document.documentElement.setAttribute('data-theme', theme);
  },
}));
