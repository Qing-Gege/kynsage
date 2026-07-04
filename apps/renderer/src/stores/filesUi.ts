import { create } from 'zustand';

interface FilesUiStore {
  view: 'grid' | 'list';
  sortBy: 'name' | 'mtime' | 'size';
  showHidden: boolean;
  setView: (v: 'grid' | 'list') => void;
  setSortBy: (s: 'name' | 'mtime' | 'size') => void;
  setShowHidden: (v: boolean) => void;
}

export const useFilesUiStore = create<FilesUiStore>((set) => ({
  view: 'list',
  sortBy: 'name',
  showHidden: false,
  setView: (view) => set({ view }),
  setSortBy: (sortBy) => set({ sortBy }),
  setShowHidden: (showHidden) => set({ showHidden }),
}));
