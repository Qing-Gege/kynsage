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
  /**
   * 文件区是否展开成完整文件操作区（吃掉终端列，侧栏保留）。
   * 单一状态、两处入口（地址栏按钮 + 分隔条箭头）共用 ——
   * 各存一份就会出现「点了展开、再点分隔条又展开一次」的鬼状态。
   */
  filesExpanded: boolean;
  setFilesExpanded: (expanded: boolean) => void;
  toggleFilesExpanded: () => void;
}

const savedMode = (localStorage.getItem('kynsage.layout.mode') as LayoutMode | null) ?? 'tabs';
const savedCollapsed = localStorage.getItem('kynsage.layout.sidebarCollapsed') === '1';
const savedExpanded = localStorage.getItem('kynsage.layout.filesExpanded') === '1';

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  mode: savedMode,
  setMode: (mode) => {
    localStorage.setItem('kynsage.layout.mode', mode);
    set({ mode });
  },
  launcherOpen: false,
  // 打开启动页时若文件区正展开着，自动收回 —— 启动页在终端那半，
  // 展开态把它整个盖住了，点「新建同事」会像没反应。
  setLauncherOpen: (open) => {
    if (open && get().filesExpanded) {
      localStorage.setItem('kynsage.layout.filesExpanded', '0');
      set({ launcherOpen: true, filesExpanded: false });
      return;
    }
    set({ launcherOpen: open });
  },
  sidebarCollapsed: savedCollapsed,
  // 折叠只切列宽的可见性；文件区宽度始终由 useResizable 写的 --files-w(已 clamp)决定，
  // 折叠态 grid 也用 var(--files-w)，无需再单独记录/覆盖。
  setSidebar: (collapsed) => {
    localStorage.setItem('kynsage.layout.sidebarCollapsed', collapsed ? '1' : '0');
    set({ sidebarCollapsed: collapsed });
  },
  filesExpanded: savedExpanded,
  setFilesExpanded: (expanded) => {
    localStorage.setItem('kynsage.layout.filesExpanded', expanded ? '1' : '0');
    set({ filesExpanded: expanded });
  },
  toggleFilesExpanded: () => {
    const next = !get().filesExpanded;
    localStorage.setItem('kynsage.layout.filesExpanded', next ? '1' : '0');
    set({ filesExpanded: next });
  },
}));
