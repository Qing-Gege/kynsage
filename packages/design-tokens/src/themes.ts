// Marshal · Rams×TE «仪器美学» — three lightings of one philosophy.
// dark (default) = 关灯后的工作台 · sepia (护眼) = 暖米纸 · light = 冷白图纸桌。
// Variable names are semantic and match the design source 1:1.

export interface Theme {
  // Surfaces
  '--bg-app': string;
  '--bg-sidebar': string;
  '--bg-panel': string;
  '--bg-terminal': string;
  '--bg-chrome': string;
  '--bg-command': string;
  '--bg-elevated': string;
  '--bg-selected': string;
  // Etched dividers
  '--line': string;
  '--line-strong': string;
  // Ink ladder
  '--ink': string;
  '--ink-2': string;
  '--ink-3': string;
  '--ink-4': string;
  // Terracotta accent — the one warm emphasis (brand color, matches logo)
  '--accent': string;
  '--accent-ink': string;
  '--accent-soft': string;
  // Functional signal lights
  '--ok': string;
  '--warn': string;
  '--idle': string;
  '--danger': string;
  // Terminal (own lighting — follows theme: dark in dark, light in light/sepia)
  '--term-ink': string;
  '--term-dim': string;
  '--term-green': string;
  '--term-amber': string;
  '--term-blue': string;
  '--term-magenta': string;
  '--shadow': string;
}

// 暗（默认）—— 关灯后的工作台，暖中性近黑，非 GitHub-dark
export const darkTheme: Theme = {
  '--bg-app': '#14140F',
  '--bg-sidebar': '#100F0B',
  '--bg-panel': '#1A1A14',
  '--bg-terminal': '#0B0B07',
  '--bg-chrome': '#100F0B',
  '--bg-command': '#16160F',
  '--bg-elevated': '#20201A',
  '--bg-selected': '#2A2820',
  '--line': '#2A2A22',
  '--line-strong': '#36352B',
  '--ink': '#EFEDE3',
  '--ink-2': '#B6B4A4',
  '--ink-3': '#7C7A6B',
  '--ink-4': '#545347',
  '--accent': '#D2542A',
  '--accent-ink': '#1A1A14',
  '--accent-soft': '#2E1C12',
  '--ok': '#6FA862',
  '--warn': '#D2A24C',
  '--idle': '#8A6A5E',
  '--danger': '#C56B5C',
  '--term-ink': '#E4DFD2',
  '--term-dim': '#7C7568',
  '--term-green': '#82B374',
  '--term-amber': '#D9B05A',
  '--term-blue': '#7BA0B8',
  '--term-magenta': '#B48AA6',
  '--shadow': '0 0 0 0.5px rgba(0,0,0,.5), 0 14px 44px rgba(0,0,0,.5)',
};

// 护眼 —— 暖米纸，低对比，无印/Rams 米白外壳
export const sepiaTheme: Theme = {
  '--bg-app': '#E7E1D3',
  '--bg-sidebar': '#E1DACA',
  '--bg-panel': '#EDE7DA',
  '--bg-terminal': '#EAE3D4',
  '--bg-chrome': '#E1DACA',
  '--bg-command': '#E9E3D5',
  '--bg-elevated': '#DDD6C5',
  '--bg-selected': '#D6CDB6',
  '--line': '#CFC6B1',
  '--line-strong': '#BEB39B',
  '--ink': '#29251C',
  '--ink-2': '#554E3D',
  '--ink-3': '#847C6A',
  '--ink-4': '#ABA28C',
  '--accent': '#B23C1E',
  '--accent-ink': '#F4EEDF',
  '--accent-soft': '#E2CDBE',
  '--ok': '#5C7E4A',
  '--warn': '#A77A22',
  '--idle': '#9A6453',
  '--danger': '#A04A3C',
  '--term-ink': '#000000',
  '--term-dim': '#8A8270',
  '--term-green': '#4E7340',
  '--term-amber': '#8C6418',
  '--term-blue': '#3F6377',
  '--term-magenta': '#7E5570',
  '--shadow': '0 0 0 0.5px rgba(120,108,80,.16), 0 14px 44px rgba(120,108,80,.18)',
};

// 亮 —— 冷白图纸桌，高对比清晰；终端跟随主题：暖近白底 + 纯黑正文
export const lightTheme: Theme = {
  '--bg-app': '#F6F6F3',
  '--bg-sidebar': '#FAFAF8',
  '--bg-panel': '#FFFFFF',
  '--bg-terminal': '#FBFAF6',
  '--bg-chrome': '#FAFAF8',
  '--bg-command': '#FFFFFF',
  '--bg-elevated': '#F0F0EC',
  '--bg-selected': '#ECECE9',
  '--line': '#E4E3DC',
  '--line-strong': '#D4D3C9',
  '--ink': '#17160F',
  '--ink-2': '#413F35',
  '--ink-3': '#6E6C5F',
  '--ink-4': '#9A9788',
  '--accent': '#C2410C',
  '--accent-ink': '#FFFFFF',
  '--accent-soft': '#F6E3D8',
  '--ok': '#4F7A40',
  '--warn': '#9A7220',
  '--idle': '#9A6453',
  '--danger': '#B23C2E',
  '--term-ink': '#000000',
  '--term-dim': '#6E6C5F',
  '--term-green': '#3F6B33',
  '--term-amber': '#8A6418',
  '--term-blue': '#355A6E',
  '--term-magenta': '#7E5570',
  '--shadow': '0 0 0 0.5px rgba(60,56,40,.12), 0 12px 40px rgba(60,56,40,.16)',
};

export type ThemeName = 'dark' | 'sepia' | 'light';
