// Marshal · 主题系统 — 八套「一份哲学的多种照明」。
// 每套由 4 个核心色(前景/背景/选区/强调)+ dark 标志推导出全部 ~35 个语义 token,
// 保证阶梯一致、可维护。终端配色亦由同一份 token 驱动(见 Terminal.tsx)。
// 变量名语义化,与设计源 1:1。

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
  // Accent — the one emphasis (per-theme brand color)
  '--accent': string;
  '--accent-ink': string;
  '--accent-soft': string;
  // Functional signal lights
  '--ok': string;
  '--warn': string;
  '--idle': string;
  '--danger': string;
  // Terminal (own lighting — follows theme background luminance)
  '--term-ink': string;
  '--term-dim': string;
  '--term-green': string;
  '--term-amber': string;
  '--term-blue': string;
  '--term-magenta': string;
  '--shadow': string;
}

/* ===================== 色彩推导工具 ===================== */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number): string => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
// a 向 b 混合 t(0..1)
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
function lum(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
const BLACK = '#000000';
const WHITE = '#FFFFFF';

// 共享 ANSI 主色(与终端一致):红 / 绿 / 黄 / 紫
const ANSI = { red: '#B42318', green: '#16834A', yellow: '#9A5B00', magenta: '#6F5AA7' };

interface ThemeSpec {
  fg: string;
  bg: string;
  sel: string;
  accent: string;
  dark: boolean;
}

// 4 核心色 → 全套 token。表面按明度分层,ink 阶梯由 fg 向 bg 插值,信号灯共用 ANSI。
function deriveTheme(s: ThemeSpec): Theme {
  const { fg, bg, sel, accent, dark } = s;
  // 深色:侧栏/终端更暗(向黑),浮层/命令更亮(向前景);浅色:反之(向前景压出层次)。
  const deepen = (t: number): string => mix(bg, dark ? BLACK : fg, t);
  const lift = (t: number): string => mix(bg, dark ? fg : BLACK, t);
  // 强调前景:亮强调用黑字,暗强调用白字。
  const accentInk = lum(accent) > 150 ? '#15232D' : WHITE;
  // 信号灯:深色底整体提亮一档,浅色底直接用 ANSI。
  const sig = (c: string): string => (dark ? mix(c, WHITE, 0.28) : c);

  return {
    '--bg-app': deepen(0.03),
    '--bg-sidebar': dark ? deepen(0.35) : deepen(0.015),
    '--bg-panel': bg,
    '--bg-terminal': dark ? deepen(0.5) : bg,
    '--bg-chrome': deepen(0.03),
    '--bg-command': dark ? lift(0.04) : bg,
    '--bg-elevated': dark ? lift(0.06) : deepen(0.06),
    '--bg-selected': sel,
    '--line': dark ? lift(0.1) : deepen(0.09),
    '--line-strong': dark ? lift(0.18) : deepen(0.18),
    '--ink': fg,
    '--ink-2': mix(fg, bg, 0.28),
    '--ink-3': mix(fg, bg, 0.5),
    '--ink-4': mix(fg, bg, 0.68),
    '--accent': accent,
    '--accent-ink': accentInk,
    '--accent-soft': mix(bg, accent, dark ? 0.22 : 0.14),
    '--ok': sig(ANSI.green),
    '--warn': sig(ANSI.yellow),
    '--idle': mix(fg, bg, 0.42),
    '--danger': sig(ANSI.red),
    '--term-ink': fg,
    '--term-dim': mix(fg, bg, 0.45),
    '--term-green': sig(ANSI.green),
    '--term-amber': sig(ANSI.yellow),
    '--term-blue': dark ? mix(accent, WHITE, 0.2) : accent,
    '--term-magenta': sig(ANSI.magenta),
    '--shadow': dark
      ? '0 0 0 0.5px rgba(0,0,0,.5), 0 14px 44px rgba(0,0,0,.5)'
      : '0 0 0 0.5px rgba(0,0,0,.1), 0 12px 40px rgba(0,0,0,.14)',
  };
}

/* ===================== 八套主题(WizPatent 配色) ===================== */
// 浅色 6:White(默认)/ Paper / Warm / Mint / Blue / Gray
export const whiteTheme = deriveTheme({ fg: '#15232D', bg: '#FFFFFF', sel: '#DCEBF0', accent: '#023567', dark: false });
export const paperTheme = deriveTheme({ fg: '#243541', bg: '#FBFAF6', sel: '#E8DFD0', accent: '#023567', dark: false });
export const warmTheme = deriveTheme({ fg: '#2B332E', bg: '#FFF8ED', sel: '#EBD5B3', accent: '#7A5B18', dark: false });
export const mintTheme = deriveTheme({ fg: '#18352E', bg: '#F0FBF6', sel: '#CDEADE', accent: '#16834A', dark: false });
export const blueTheme = deriveTheme({ fg: '#1A3342', bg: '#F1F8FC', sel: '#CFE6F3', accent: '#023567', dark: false });
export const grayTheme = deriveTheme({ fg: '#1E2E37', bg: '#F4F6F8', sel: '#D9E1E7', accent: '#526371', dark: false });
// 深色 2:Deep(墨蓝底)/ Ink(炭灰底)
export const deepTheme = deriveTheme({ fg: '#E8F3F5', bg: '#0F232B', sel: '#295061', accent: '#69D2E7', dark: true });
export const inkTheme = deriveTheme({ fg: '#F1F5F7', bg: '#20262D', sel: '#46515C', accent: '#8AD3E0', dark: true });

export type ThemeName = 'white' | 'paper' | 'warm' | 'mint' | 'blue' | 'gray' | 'deep' | 'ink';

export const THEMES: Record<ThemeName, Theme> = {
  white: whiteTheme,
  paper: paperTheme,
  warm: warmTheme,
  mint: mintTheme,
  blue: blueTheme,
  gray: grayTheme,
  deep: deepTheme,
  ink: inkTheme,
};

// 元信息:label 给设置下拉用;quick 三个进侧栏/快捷区;dark 供图标区分。
export const THEME_META: Array<{ name: ThemeName; label: string; quick: boolean; dark: boolean }> = [
  { name: 'white', label: '纯白', quick: true, dark: false },
  { name: 'gray', label: '中性灰', quick: true, dark: false },
  { name: 'ink', label: '炭灰(深)', quick: true, dark: true },
  { name: 'paper', label: '米白纸感', quick: false, dark: false },
  { name: 'warm', label: '暖黄', quick: false, dark: false },
  { name: 'mint', label: '薄荷绿', quick: false, dark: false },
  { name: 'blue', label: '淡蓝', quick: false, dark: false },
  { name: 'deep', label: '墨蓝(深)', quick: false, dark: true },
];
