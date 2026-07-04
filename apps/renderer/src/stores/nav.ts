import { create } from 'zustand';

interface Favorite { name: string; path: string; }

interface NavStore {
  currentPath: string;
  favorites: Favorite[];

  setCurrentPath: (path: string) => void;
  addFavorite: (fav: Favorite) => void;
  removeFavorite: (path: string) => void;
  reorderFavorites: (fromIndex: number, toIndex: number) => void;
}

const KEY = 'marshal.favorites';

// 所有 mutator 统一走这里，保证 localStorage 与内存一致。
const persist = (favs: Favorite[]): Favorite[] => {
  localStorage.setItem(KEY, JSON.stringify(favs));
  return favs;
};

export const useNavStore = create<NavStore>((set) => ({
  currentPath: '',
  favorites: JSON.parse(localStorage.getItem(KEY) ?? '[]'),

  setCurrentPath: (path) => set({ currentPath: path }),

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
}));
