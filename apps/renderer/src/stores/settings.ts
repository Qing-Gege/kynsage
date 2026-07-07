import { create } from 'zustand';

export type CopyPasteMode = 'office' | 'term';

export interface TerminalPrefs {
  fontFamily: string;
  fontSize: number;
  cursorStyle: 'block' | 'underline' | 'bar';
  cursorBlink: boolean;
  scrollbackLines: number;
  /** office = Ctrl+C/V（像 Office）; term = Ctrl+Shift+C/V（终端习惯） */
  copyPasteMode: CopyPasteMode;
}

export interface GeneralPrefs {
  claudePath: string;
  /** 同事默认工作文件夹（留空＝主文件夹） */
  startDir: string;
  defaultShell: string;
}

export interface CollabPrefs {
  /** 「新建」按钮里对 AI 帮手的称呼，如「同事」 */
  memberLabel: string;
  /** 右上角品牌主标题（侧边栏顶部），如「狗头军师」 */
  brandTitle: string;
  /** 右上角品牌副标题，如「一个狗军师，三个诸葛亮」 */
  brandSubtitle: string;
  /** 每次新建同事都单独询问工作文件夹 */
  promptDirPerAgent: boolean;
  /** 同事忙完 / 需要拍板时发通知 */
  notifyOnDone: boolean;
  /** 同事需要确认时，除了标题栏闪烁，再「叮」一声 */
  soundOnConfirm: boolean;
}

type Prefs = TerminalPrefs & GeneralPrefs & CollabPrefs;

interface SettingsStore extends Prefs {
  patchTerminal: (p: Partial<TerminalPrefs>) => void;
  patchGeneral: (p: Partial<GeneralPrefs>) => void;
  patchCollab: (p: Partial<CollabPrefs>) => void;
}

const DEFAULTS: Prefs = {
  // 默认裸 'claude'：用户 PATH 里能解析它即可（与手动输入一致）。技术用户可在设置里填完整路径。
  claudePath: 'claude',
  startDir: '',
  defaultShell: '',
  fontFamily: "'LXGW Bright Code GB', 'JetBrains Mono', monospace",
  fontSize: 16,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollbackLines: 5000,
  copyPasteMode: 'office',
  memberLabel: '同事',
  brandTitle: '狗头军师',
  brandSubtitle: '一个狗军师，三个诸葛亮',
  promptDirPerAgent: false,
  notifyOnDone: true,
  soundOnConfirm: true,
};

// 旧版默认值 —— 用于一次性迁移到新默认（仅当用户没动过时才覆盖）
const SETTINGS_VERSION = 4;
const LEGACY_DEFAULTS = {
  fontFamily: 'Cascadia Code, SF Mono, Consolas, monospace',
  // 历代字号默认：13（最早）→ 14（v2）→ 16（v4）。迁移时把仍是任一旧默认的用户带到新默认。
  fontSizes: [13, 14],
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem('kynsage.settings');
    const stored = raw ? JSON.parse(raw) : {};
    const merged: Prefs & { __v?: number } = { ...DEFAULTS, ...stored };
    if ((stored.__v ?? 0) < SETTINGS_VERSION) {
      // v2：默认字体改 LXGW；v4：默认字号改 16 —— 只覆盖仍是旧默认的字段，保留用户主动改过的
      if (merged.fontFamily === LEGACY_DEFAULTS.fontFamily) merged.fontFamily = DEFAULTS.fontFamily;
      if (LEGACY_DEFAULTS.fontSizes.includes(merged.fontSize)) merged.fontSize = DEFAULTS.fontSize;
      const { __v, ...data } = merged;
      localStorage.setItem('kynsage.settings', JSON.stringify({ ...data, __v: SETTINGS_VERSION }));
    }
    const { __v, ...clean } = merged;
    return clean;
  } catch { return { ...DEFAULTS }; }
}

function save(state: Prefs): void {
  const { patchTerminal, patchGeneral, patchCollab, ...data } = state as any;
  localStorage.setItem('kynsage.settings', JSON.stringify({ ...data, __v: SETTINGS_VERSION }));
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...load(),
  patchTerminal: (p) => set((s) => { const next = { ...s, ...p }; save(next); return next; }),
  patchGeneral: (p) => set((s) => { const next = { ...s, ...p }; save(next); return next; }),
  patchCollab: (p) => set((s) => { const next = { ...s, ...p }; save(next); return next; }),
}));
