import { create } from 'zustand';

type LayoutMode = 'tabs' | 'tile';

interface LayoutStore {
  mode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
  /** 侧边栏是否收起（收起后文件区宽度不变、终端区变宽） */
  sidebarCollapsed: boolean;
  setSidebar: (collapsed: boolean) => void;
  /** 工作区 launcher 浮层是否打开（临时态，不持久化——刷新不该复活浮层） */
  launcherOpen: boolean;
  setLauncherOpen: (open: boolean) => void;
}

const savedMode = (localStorage.getItem('kynsage.layout.mode') as LayoutMode | null) ?? 'tabs';
const savedCollapsed = localStorage.getItem('kynsage.layout.sidebarCollapsed') === '1';

export const useLayoutStore = create<LayoutStore>((set) => ({
  mode: savedMode,
  setMode: (mode) => {
    localStorage.setItem('kynsage.layout.mode', mode);
    set({ mode });
  },
  launcherOpen: false,
  setLauncherOpen: (open) => set({ launcherOpen: open }),
  sidebarCollapsed: savedCollapsed,
  // 折叠只切列宽的可见性；文件区宽度始终由 useResizable 写的 --files-w(已 clamp)决定，
  // 折叠态 grid 也用 var(--files-w)，无需再单独记录/覆盖。
  setSidebar: (collapsed) => {
    localStorage.setItem('kynsage.layout.sidebarCollapsed', collapsed ? '1' : '0');
    set({ sidebarCollapsed: collapsed });
  },
}));
