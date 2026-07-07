import { create } from 'zustand';

type LayoutMode = 'tabs' | 'tile';

interface LayoutStore {
  mode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
  /** 侧边栏是否收起（收起后文件区宽度不变、终端区变宽） */
  sidebarCollapsed: boolean;
  /** 收起瞬间记录的文件区宽度，用于把文件列钉死、防刷新后变 0 */
  collapsedFilesW: number | null;
  setSidebar: (collapsed: boolean, filesW?: number) => void;
  /** 工作区 launcher 浮层是否打开（临时态，不持久化——刷新不该复活浮层） */
  launcherOpen: boolean;
  setLauncherOpen: (open: boolean) => void;
}

const savedMode = (localStorage.getItem('kynsage.layout.mode') as LayoutMode | null) ?? 'tabs';
const savedCollapsed = localStorage.getItem('kynsage.layout.sidebarCollapsed') === '1';
const savedFilesW = (() => {
  const s = localStorage.getItem('kynsage.layout.collapsedFilesW');
  return s ? Number(s) : null;
})();

export const useLayoutStore = create<LayoutStore>((set) => ({
  mode: savedMode,
  setMode: (mode) => {
    localStorage.setItem('kynsage.layout.mode', mode);
    set({ mode });
  },
  launcherOpen: false,
  setLauncherOpen: (open) => set({ launcherOpen: open }),
  sidebarCollapsed: savedCollapsed,
  collapsedFilesW: savedFilesW,
  setSidebar: (collapsed, filesW) => {
    localStorage.setItem('kynsage.layout.sidebarCollapsed', collapsed ? '1' : '0');
    if (collapsed && typeof filesW === 'number') {
      localStorage.setItem('kynsage.layout.collapsedFilesW', String(filesW));
      document.documentElement.style.setProperty('--files-w', `${filesW}px`);
      set({ sidebarCollapsed: true, collapsedFilesW: filesW });
    } else {
      set({ sidebarCollapsed: collapsed });
    }
  },
}));
