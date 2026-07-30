import { create } from 'zustand';
import { winPathKey } from '@kynsage/shared-types';

interface Favorite { name: string; path: string; }

interface NavStore {
  currentPath: string;
  favorites: Favorite[];
  /** 历史项目的「不想看见」名单(winPathKey 归一化后的路径) */
  hiddenRecents: string[];

  setCurrentPath: (path: string) => void;
  /** 手动刷新计数 —— 地址栏按刷新时自增，文件区据此重读目录（跨组件的一次性信号） */
  refreshTick: number;
  requestRefresh: () => void;
  addFavorite: (fav: Favorite) => void;
  removeFavorite: (path: string) => void;
  reorderFavorites: (fromIndex: number, toIndex: number) => void;
  hideRecent: (path: string) => void;
  unhideAllRecents: () => void;
}

const KEY = 'kynsage.favorites';
const HIDDEN_KEY = 'kynsage.hiddenRecents';

// 所有 mutator 统一走这里，保证 localStorage 与内存一致。
const persist = (favs: Favorite[]): Favorite[] => {
  localStorage.setItem(KEY, JSON.stringify(favs));
  return favs;
};

// 历史项目是扫 ~/.claude/projects 得来的，删不掉也不该删(那是 Claude 的会话数据)。
// 所以「移除」只隐藏侧栏里的这一行，名单本地持久化，随时可唤回。
const persistHidden = (keys: string[]): string[] => {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(keys));
  return keys;
};

const readHidden = (): string[] => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
};

export const useNavStore = create<NavStore>((set) => ({
  currentPath: '',
  favorites: JSON.parse(localStorage.getItem(KEY) ?? '[]'),
  hiddenRecents: readHidden(),

  setCurrentPath: (path) => set({ currentPath: path }),

  refreshTick: 0,
  requestRefresh: () => set((state) => ({ refreshTick: state.refreshTick + 1 })),

  addFavorite: (fav) =>
    set((state) => ({
      favorites: persist([...state.favorites.filter((f) => f.path !== fav.path), fav]),
    })),

  removeFavorite: (path) =>
    set((state) => ({
      favorites: persist(state.favorites.filter((f) => f.path !== path)),
    })),

  reorderFavorites: (fromIndex, toIndex) =>
    set((state) => {
      const n = state.favorites.length;
      const from = Math.max(0, Math.min(fromIndex, n - 1));
      const to = Math.max(0, Math.min(toIndex, n - 1));
      if (from === to) return state;
      const next = [...state.favorites];
      const [moved] = next.splice(from, 1);
      if (!moved) return state;
      next.splice(to, 0, moved);
      return { favorites: persist(next) };
    }),

  hideRecent: (path) =>
    set((state) => {
      const key = winPathKey(path);
      if (state.hiddenRecents.includes(key)) return state;
      return { hiddenRecents: persistHidden([...state.hiddenRecents, key]) };
    }),

  unhideAllRecents: () => set({ hiddenRecents: persistHidden([]) }),
}));
