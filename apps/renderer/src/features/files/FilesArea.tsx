import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ReactElement,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import toast from 'react-hot-toast';
import { safeMoveSources } from '@kynsage/shared-types';
import { useNavStore } from '../../stores/nav';
import { useFilesUiStore } from '../../stores/filesUi';
import { useLayoutStore } from '../../stores/layout';
import { useAgentsStore } from '../../stores/agents';
import { trpc } from '../../trpc';
import { FileContextMenu } from './FileContextMenu';
import type { MenuItem } from './FileContextMenu';
import { fileKind } from './fileKind';
import { MarkdownPanel } from './MarkdownPanel';
import './FilesArea.css';

declare global {
  interface Window {
    fileBridge?: { getPathForFile: (file: File) => string };
    clipboardBridge?: { writeText: (text: string) => void; readFilePaths?: () => string[] };
    fsEvents?: {
      onChange: (cb: (dir: string) => void) => void;
      offChange: (cb: (dir: string) => void) => void;
    };
  }
}

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  isHidden: boolean;
  mtime: number;
  size: number;
}

type Clipboard = { paths: string[]; op: 'copy' | 'cut' } | null;
type CtxState = { x: number; y: number; file: FileEntry | null } | null;

export function FilesArea(): ReactElement {
  const { currentPath, setCurrentPath, favorites, addFavorite, removeFavorite, refreshTick, requestRefresh } = useNavStore();
  // Sort/hidden controls were retired from the finalized prototype — the file
  // area is breadcrumb + list only. We still read the store defaults so the
  // listing stays sorted (dirs first, by name) and hidden files stay filtered.
  const { sortBy, showHidden } = useFilesUiStore();
  const { launcherOpen, filesExpanded, toggleFilesExpanded } = useLayoutStore();
  // 切换 agent 标签时自动关闭打开的 Markdown 面板，让用户回到该 agent 的视图。
  const activeSessionId = useAgentsStore((s) => s.activeSessionId);
  const areaRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // 多选：selected 是选中集合，anchor 是 Shift 连选的起点，cursor 是当前焦点行
  // （对齐资源管理器：Ctrl 点加减、Shift 点连选、方向键走、Shift+方向键扩选）
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const iconCache = useRef<Map<string, string>>(new Map());
  const [, setIconTick] = useState(0);
  // 文件操作状态
  const [clipboard, setClipboard] = useState<Clipboard>(null);
  const [ctx, setCtx] = useState<CtxState>(null);
  // 打开右键菜单时探测一次系统剪贴板里是否有被复制的文件（决定「粘贴」是否可点）。
  const [sysClipHasFiles, setSysClipHasFiles] = useState(false);
  const [renaming, setRenaming] = useState<{ path: string; draft: string } | null>(null);
  const [isDropping, setIsDropping] = useState(false);
  // 内部拖拽悬停在哪个文件夹行上（高亮落点）
  const [dropDir, setDropDir] = useState<string | null>(null);
  // 展开态多列视图的排序（列头可点）。默认按名称升序，与窄态一致。
  const [detailSort, setDetailSort] = useState<{ by: 'name' | 'size' | 'kind' | 'mtime'; asc: boolean }>({
    by: 'name',
    asc: true,
  });
  const [isWindows, setIsWindows] = useState(false);
  const [openMarkdown, setOpenMarkdown] = useState<string | null>(null);

  // 点击 agent 标签（activeSessionId 变化）时关闭 Markdown 面板
  useEffect(() => {
    setOpenMarkdown(null);
  }, [activeSessionId]);

  // 打开「新建同事」启动页时关闭 Markdown 面板，避免 fixed 面板挡住 launcher
  useEffect(() => {
    if (launcherOpen) setOpenMarkdown(null);
  }, [launcherOpen]);

  useEffect(() => {
    void (async () => {
      try {
        const platform = (await (trpc as any).getPlatform.query()) as string;
        setIsWindows(platform === 'win32');
      } catch { /* 默认非 Windows 文案 */ }
    })();
  }, []);

  // 系统文件管理器的本地化叫法（Windows 优先）
  const revealLabel = isWindows ? '在文件资源管理器中显示' : '在文件管理器中显示';

  useEffect(() => {
    if (!currentPath) return;
    void loadFiles(currentPath);
    // refreshTick：地址栏「刷新」按钮 / F5 自增它，据此重读目录
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, showHidden, refreshTick]);

  // 让主进程实时监听当前目录；目录内任何增删改（claude 生成文件等）即自动刷新列表。
  useEffect(() => {
    void (trpc as any).watchDir.mutate({ path: currentPath || null });
    const fe = window.fsEvents;
    if (!fe) return;
    const onChange = (dir: string): void => {
      // 只对当前目录的变化刷新（main 已只盯一个目录，这里再比对一次防串）
      if (dir === currentPath) refresh();
    };
    fe.onChange(onChange);
    return () => { fe.offChange(onChange); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const loadFiles = async (path: string): Promise<void> => {
    setLoading(true);
    try {
      const entries = (await (trpc as any).fs.readdir.query({ path })) as FileEntry[];
      // 隐藏判定交给后端（按平台：Unix 看 . 前缀，Windows 另认 desktop.ini/Thumbs.db 等系统项）
      const filtered = showHidden ? entries : entries.filter((e) => !e.isHidden);
      setFiles(filtered);
    } catch (err) {
      console.error('Failed to load files:', err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const refresh = (): void => { if (currentPath) void loadFiles(currentPath); };

  // 打开右键菜单：同时探测系统剪贴板，让「粘贴」对外部复制的文件也亮起来。
  const openCtx = (x: number, y: number, file: FileEntry | null): void => {
    const sys = window.clipboardBridge?.readFilePaths?.() ?? [];
    setSysClipHasFiles(sys.length > 0);
    setCtx({ x, y, file });
  };

  const canPaste = !!clipboard || sysClipHasFiles;

  // —— 选中态操作（对齐资源管理器语义）——
  const selectOnly = (path: string): void => {
    setSelected(new Set([path]));
    setAnchor(path);
    setCursor(path);
  };

  const clearSelection = (): void => {
    setSelected(new Set());
    setAnchor(null);
    setCursor(null);
  };

  // Ctrl/Cmd 点：加减单项，锚点跟着走
  const toggleOne = (path: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setAnchor(path);
    setCursor(path);
  };

  // Shift 点：从锚点到该项整段选中（锚点不动，便于反复调整范围）
  const selectRangeTo = (path: string, list: FileEntry[]): void => {
    const from = list.findIndex((f) => f.path === (anchor ?? path));
    const to = list.findIndex((f) => f.path === path);
    if (from < 0 || to < 0) { selectOnly(path); return; }
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    setSelected(new Set(list.slice(lo, hi + 1).map((f) => f.path)));
    setCursor(path);
  };

  // —— 文件操作 ——
  const copyPaths = (paths: string[], op: 'copy' | 'cut'): void => {
    if (paths.length === 0) return;
    setClipboard({ paths, op });
  };

  const paste = async (): Promise<void> => {
    if (!currentPath) return;
    // 优先用应用内部剪贴板（复制/剪切），否则读系统剪贴板里被复制的文件（访达 / 资源管理器）。
    if (clipboard) {
      try {
        const proc = clipboard.op === 'copy' ? 'copyEntries' : 'moveEntries';
        await (trpc as any).fs[proc].mutate({ srcPaths: clipboard.paths, destDir: currentPath });
        if (clipboard.op === 'cut') setClipboard(null);
        refresh();
      } catch (err) {
        toast.error(`粘贴失败：${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    const sysPaths = window.clipboardBridge?.readFilePaths?.() ?? [];
    if (sysPaths.length === 0) return;
    try {
      await (trpc as any).fs.copyEntries.mutate({ srcPaths: sysPaths, destDir: currentPath });
      refresh();
      toast.success(`已粘贴 ${sysPaths.length} 个文件`);
    } catch (err) {
      toast.error(`粘贴失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 删除到回收站：跟资源管理器一致，回收站是可撤销的，所以不弹确认框。
  const trashPaths = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return;
    try {
      await (trpc as any).fs.trash.mutate({ paths });
      setSelected((prev) => {
        const next = new Set(prev);
        paths.forEach((p) => next.delete(p));
        return next;
      });
      setAnchor(null);
      setCursor(null);
      refresh();
      if (paths.length > 1) toast.success(`已删除 ${paths.length} 项到回收站`);
    } catch (err) {
      toast.error(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const reveal = (file: FileEntry): void => {
    void (trpc as any).fs.reveal.mutate({ path: file.path });
  };

  // 多选时每行一条路径（可直接粘进终端或对话框），单选保持裸路径不加引号。
  const copyPathText = (paths: string[]): void => {
    if (!window.clipboardBridge || paths.length === 0) return;
    window.clipboardBridge.writeText(paths.join('\n'));
    toast.success(paths.length > 1 ? `已复制 ${paths.length} 条路径` : '已复制路径');
  };

  // —— 新建（空白处右键）—— 建好后进入行内重命名，像 Windows 一样
  const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

  const afterCreate = async (dest: string): Promise<void> => {
    await (currentPath ? loadFiles(currentPath) : Promise.resolve());
    selectOnly(dest);
    setRenaming({ path: dest, draft: baseName(dest) });
  };

  const createFolder = async (): Promise<void> => {
    if (!currentPath) return;
    try {
      const dest = (await (trpc as any).fs.createFolder.mutate({ dir: currentPath, name: '新建文件夹' })) as string;
      await afterCreate(dest);
    } catch (err) {
      toast.error(`新建文件夹失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const createFile = async (kind: 'md' | 'txt' | 'docx', name: string): Promise<void> => {
    if (!currentPath) return;
    try {
      const dest = (await (trpc as any).fs.createFile.mutate({ dir: currentPath, name, kind })) as string;
      await afterCreate(dest);
    } catch (err) {
      toast.error(`新建文件失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const commitRename = async (): Promise<void> => {
    if (!renaming) return;
    const { path: oldPath, draft } = renaming;
    const name = draft.trim();
    const old = files.find((f) => f.path === oldPath);
    setRenaming(null);
    if (!name || !old || name === old.name) return;
    try {
      await (trpc as any).fs.rename.mutate({ path: oldPath, newName: name });
      refresh();
    } catch (err) {
      toast.error(`重命名失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // —— 从系统拖入文件，复制进当前目录 ——
  const onDrop = (e: ReactDragEvent): void => {
    e.preventDefault();
    setIsDropping(false);
    setDropDir(null);
    // 内部拖拽落到空白处 = 落回当前目录，等于什么都没发生
    if (e.dataTransfer.types.includes('text/x-kynsage-paths')) return;
    if (!currentPath || !window.fileBridge) return;
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.fileBridge!.getPathForFile(f))
      .filter(Boolean);
    if (paths.length === 0) return;
    void (async () => {
      try {
        await (trpc as any).fs.copyEntries.mutate({ srcPaths: paths, destDir: currentPath });
        refresh();
        toast.success(`已添加 ${paths.length} 个文件`);
      } catch (err) {
        toast.error(`添加失败：${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  };

  // —— 右键菜单条目 ——
  const menuItems = (file: FileEntry | null): MenuItem[] => {
    // 空白处：以「新建」为主 + 粘贴 + 展开/收起（找不到按钮的用户从这儿也能进）
    if (!file) {
      return [
        { label: '新建文件夹', onClick: () => void createFolder() },
        { label: '新建 Markdown（.md）', onClick: () => void createFile('md', '新建文档.md') },
        { label: '新建文本文件（.txt）', onClick: () => void createFile('txt', '新建文本.txt') },
        { label: '新建 Word（.docx）', onClick: () => void createFile('docx', '新建 Word 文档.docx') },
        { label: '粘贴', sep: true, disabled: !canPaste, onClick: () => void paste() },
        {
          label: filesExpanded ? '收起文件区' : '展开为完整文件操作区',
          sep: true,
          onClick: toggleFilesExpanded,
        },
      ];
    }
    // 对着某个文件：作用于整个选区（右键项已在选区内则保持选区，否则改选它）
    const targets = selected.has(file.path) && selectedPaths.length > 1
      ? selectedPaths
      : [file.path];
    const many = targets.length > 1;
    const suffix = many ? ` ${targets.length} 项` : '';

    const items: MenuItem[] = [];
    if (!many && file.isFile) items.push({ label: '用默认程序打开', onClick: () => void (trpc as any).fs.openInSystem.mutate({ path: file.path }) });
    // 文件夹可固定到快速访问（Windows 资源管理器逻辑：右键文件夹 → 固定/取消固定）
    if (!many && file.isDirectory) {
      const pinned = favorites.some((f) => f.path === file.path);
      items.push(pinned
        ? { label: '从快速访问取消固定', onClick: () => removeFavorite(file.path) }
        : { label: '固定到快速访问', onClick: () => addFavorite({ name: file.name, path: file.path }) });
    }
    if (!many) items.push({ label: '重命名', onClick: () => setRenaming({ path: file.path, draft: file.name }) });
    items.push({ label: `复制${suffix}`, sep: true, onClick: () => copyPaths(targets, 'copy') });
    items.push({ label: `剪切${suffix}`, onClick: () => copyPaths(targets, 'cut') });
    items.push({ label: '粘贴', disabled: !canPaste, onClick: () => void paste() });
    items.push({ label: many ? `复制 ${targets.length} 条路径` : '复制路径', sep: true, onClick: () => copyPathText(targets) });
    if (!many) items.push({ label: revealLabel, onClick: () => reveal(file) });
    items.push({ label: many ? `删除 ${targets.length} 项到回收站` : '删除到回收站', danger: true, onClick: () => void trashPaths(targets) });
    return items;
  };

  // 点列头：同一列再点反向，换列则回到升序（资源管理器同行为）
  const toggleSort = (by: 'name' | 'size' | 'kind' | 'mtime'): void => {
    setDetailSort((prev) => (prev.by === by ? { by, asc: !prev.asc } : { by, asc: true }));
  };

  const sorted = useMemo(() => {
    // 文件夹恒在前 —— 无论按哪列排，这是资源管理器的铁律，翻转排序也不打破
    const dirsFirst = (a: FileEntry, b: FileEntry): number | null => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return null;
    };

    if (filesExpanded) {
      const dir = detailSort.asc ? 1 : -1;
      return [...files].sort((a, b) => {
        const d = dirsFirst(a, b);
        if (d !== null) return d;
        switch (detailSort.by) {
          case 'size': return (a.size - b.size) * dir;
          case 'mtime': return (a.mtime - b.mtime) * dir;
          case 'kind': {
            const ka = fileKind(a.name, a.isDirectory);
            const kb = fileKind(b.name, b.isDirectory);
            // 同类型内按名字排，否则同类文件的顺序看着是乱的
            return (ka.localeCompare(kb) || a.name.localeCompare(b.name)) * dir;
          }
          default: return a.name.localeCompare(b.name) * dir;
        }
      });
    }

    return [...files].sort((a, b) => {
      const d = dirsFirst(a, b);
      if (d !== null) return d;
      if (sortBy === 'mtime') return b.mtime - a.mtime;
      if (sortBy === 'size') return b.size - a.size;
      return a.name.localeCompare(b.name);
    });
  }, [files, sortBy, filesExpanded, detailSort]);

  const selectedPaths = useMemo(
    () => sorted.filter((f) => selected.has(f.path)).map((f) => f.path),
    [sorted, selected]
  );

  // 多选时的总大小 —— 资源管理器状态栏也报这个，批量搬文件前想知道要占多少空间
  const selectedSize = useMemo(
    () => sorted.filter((f) => selected.has(f.path) && f.isFile).reduce((n, f) => n + f.size, 0),
    [sorted, selected]
  );

  // —— 键盘：整套对齐资源管理器的肌肉记忆 ——
  // 方向键走 / Shift+方向键扩选 / Ctrl+A 全选 / Enter 打开 / Backspace 上级 /
  // F2 重命名 / Delete 回收站 / Ctrl+C·X·V / Esc 清空选中 / Home·End 首尾
  const onAreaKeyDown = (e: ReactKeyboardEvent): void => {
    // 重命名输入框等表单元素里不抢键
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    // 富文本编辑器（Markdown 面板 = contenteditable）里不抢键，
    // 否则 Ctrl+C/X/V 会被文件区劫持成「复制整个文件」而非复制选中文本
    if (target.isContentEditable || target.closest('.markdown-panel')) return;

    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;
    const lower = key.toLowerCase();

    if (mod) {
      if (lower === 'a') {
        e.preventDefault();
        setSelected(new Set(sorted.map((f) => f.path)));
        return;
      }
      if (lower === 'c' || lower === 'x') {
        if (selectedPaths.length === 0) return;
        e.preventDefault();
        copyPaths(selectedPaths, lower === 'c' ? 'copy' : 'cut');
        return;
      }
      if (lower === 'v') {
        e.preventDefault();
        void paste();
        return;
      }
      return;
    }

    // 方向键移动焦点行；按住 Shift 则从锚点扩选，否则单选
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
      if (sorted.length === 0) return;
      e.preventDefault();
      const cur = cursor ? sorted.findIndex((f) => f.path === cursor) : -1;
      let next: number;
      if (key === 'Home') next = 0;
      else if (key === 'End') next = sorted.length - 1;
      else if (key === 'ArrowDown') next = cur < 0 ? 0 : Math.min(cur + 1, sorted.length - 1);
      else next = cur < 0 ? sorted.length - 1 : Math.max(cur - 1, 0);
      const path = sorted[next]!.path;
      if (e.shiftKey) selectRangeTo(path, sorted);
      else selectOnly(path);
      // 让焦点行滚进视野
      requestAnimationFrame(() => {
        areaRef.current
          ?.querySelector(`[data-path="${CSS.escape(path)}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      });
      return;
    }

    if (key === 'Enter') {
      const file = cursor ? sorted.find((f) => f.path === cursor) : null;
      if (!file) return;
      e.preventDefault();
      if (file.isDirectory) enterDir(file.path);
      else handleFileDoubleClick(file);
      return;
    }

    // Backspace 回上级目录（资源管理器同键位）
    if (key === 'Backspace') {
      e.preventDefault();
      goUp();
      return;
    }

    if (key === 'F2') {
      const file = cursor ? sorted.find((f) => f.path === cursor) : null;
      if (!file) return;
      e.preventDefault();
      setRenaming({ path: file.path, draft: file.name });
      return;
    }

    if (key === 'Delete') {
      if (selectedPaths.length === 0) return;
      e.preventDefault();
      void trashPaths(selectedPaths);
      return;
    }

    // F5 刷新 —— Windows 用户的肌肉记忆
    if (key === 'F5') {
      e.preventDefault();
      requestRefresh();
      return;
    }

    if (key === 'Escape') {
      if (selected.size > 0) { e.preventDefault(); clearSelection(); }
      return;
    }
  };

  useEffect(() => {
    let cancelled = false;
    // 只为「文件」请求原生类型图标（.docx/.pdf/.png… 的识别度有价值）。
    // 文件夹一律用自绘字形 —— 既消灭饱和蓝文件夹，又省一批 IPC 调用。
    const missing = sorted.filter((f) => f.isFile && !iconCache.current.has(f.path));
    if (missing.length === 0) return;

    void Promise.all(
      missing.map(async (file) => {
        try {
          const dataUrl = (await (trpc as any).fs.getFileIcon.query({ path: file.path })) as string;
          if (!cancelled) iconCache.current.set(file.path, dataUrl);
        } catch { /* fall back to line glyph */ }
      })
    ).then(() => { if (!cancelled) setIconTick((n) => n + 1); });

    return () => { cancelled = true; };
  }, [sorted]);

  // 拖进某个文件夹：safeMoveSources 挡掉「拖进自己 / 自己的子目录 / 原地移动」
  const moveInto = async (paths: string[], destDir: string): Promise<void> => {
    const safe = safeMoveSources(paths, destDir);
    if (safe.length === 0) return;
    try {
      await trpc.fs.moveEntries.mutate({ srcPaths: safe, destDir });
      clearSelection();
      refresh();
      toast.success(`已移动 ${safe.length} 项`);
    } catch (err) {
      toast.error(`移动失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const enterDir = (path: string): void => {
    setCurrentPath(path);
    clearSelection();
  };

  // 回上级目录（Backspace / 双击空白区），到根目录就停住
  const goUp = (): void => {
    if (!currentPath) return;
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const trimmed = currentPath.replace(/[/\\]+$/, '');
    const idx = trimmed.lastIndexOf(sep);
    if (idx < 0) return;
    // Windows 盘根 C: → C:\；Unix 顶层 /x → /
    const parent = sep === '\\'
      ? (idx === trimmed.indexOf(sep) ? trimmed.slice(0, idx + 1) : trimmed.slice(0, idx))
      : (idx === 0 ? '/' : trimmed.slice(0, idx));
    if (parent && parent !== currentPath) enterDir(parent);
  };

  // 单击 = 选中（文件夹也一样，否则没法多选文件夹）；双击才进入 —— 资源管理器语义
  const handleFileClick = (file: FileEntry, e: ReactMouseEvent): void => {
    // 让文件区拿到焦点，Ctrl/Cmd+C·V 才会落到这里而非其它面板
    areaRef.current?.focus();
    if (e.shiftKey) selectRangeTo(file.path, sorted);
    else if (e.metaKey || e.ctrlKey) toggleOne(file.path);
    else selectOnly(file.path);
  };

  const handleFileDoubleClick = (file: FileEntry): void => {
    if (file.isDirectory) { enterDir(file.path); return; }

    // Markdown 文件在应用内打开编辑器
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'md' || ext === 'markdown') {
      setOpenMarkdown(file.path);
    } else {
      // 其他文件用系统默认程序打开
      void (trpc as any).fs.openInSystem.mutate({ path: file.path });
    }
  };

  return (
    <div
      ref={areaRef}
      className={`files-area ${isDropping ? 'is-drop' : ''} ${filesExpanded ? 'is-expanded' : ''}`}
      tabIndex={0}
      onKeyDown={onAreaKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        // 内部拖拽（自定义 mime）不点亮「从系统拖入」的整区高亮
        if (e.dataTransfer.types.includes('text/x-kynsage-paths')) return;
        if (!isDropping) setIsDropping(true);
      }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDropping(false); }}
      onDrop={onDrop}
    >
      {/* files-head（44px：折叠按钮 + 被挤碎的面包屑 + 星标）已整条删除 ——
          三者分别搬去左上角品牌格、通栏地址栏。文件列表直接从顶部开始。 */}
      <div
        className="files-body"
        onContextMenu={(e) => { e.preventDefault(); openCtx(e.clientX, e.clientY, null); }}
        // 点空白清空选区、双击空白回上级 —— 都是资源管理器里练出来的手势
        onClick={(e) => { if (e.target === e.currentTarget) clearSelection(); }}
        onDoubleClick={(e) => { if (e.target === e.currentTarget) goUp(); }}
      >
        {/* 展开态才出列头：窄态放不下四列，硬塞只会把名字挤没 */}
        {filesExpanded && !loading && sorted.length > 0 && (
          <div className="files-cols" role="row">
            {/* 修改时间放第二列 —— 找文件时「什么时候改的」比「多大」有用得多 */}
            {([
              ['name', '名称'],
              ['mtime', '修改时间'],
              ['kind', '类型'],
              ['size', '大小'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="columnheader"
                className={`files-col files-col--${key} ${detailSort.by === key ? 'is-sorted' : ''}`}
                onClick={() => toggleSort(key)}
                aria-sort={detailSort.by === key ? (detailSort.asc ? 'ascending' : 'descending') : 'none'}
              >
                <span>{label}</span>
                {detailSort.by === key && (
                  <span className="files-col-arrow" aria-hidden>{detailSort.asc ? '▲' : '▼'}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {loading ? (
          <div className="files-placeholder">读取中…</div>
        ) : sorted.length === 0 ? (
          <div className="files-placeholder">空目录 · 拖文件进来即可添加</div>
        ) : (
          <ul className="files-list">
            {sorted.map((file) => {
              const isCut = clipboard?.op === 'cut' && clipboard.paths.includes(file.path);
              return (
                <li
                  key={file.path}
                  data-path={file.path}
                  className={`file-row ${file.isDirectory ? 'is-dir' : 'is-file'} ${selected.has(file.path) ? 'is-selected' : ''} ${cursor === file.path ? 'is-cursor' : ''} ${isCut ? 'is-cut' : ''} ${dropDir === file.path ? 'is-drop-target' : ''}`}
                  draggable={renaming?.path !== file.path}
                  onDragStart={(e) => {
                    // 拖整个选区（拖未选中项则先改选它）。用自定义 mime，
                    // 不带 dataTransfer.files，与系统文件拖入逻辑天然分流。
                    const paths = selected.has(file.path) && selectedPaths.length > 1
                      ? selectedPaths
                      : [file.path];
                    if (paths.length === 1) {
                      // 单个仍走老 mime，侧栏「快速访问」钉文件夹的逻辑不用改
                      e.dataTransfer.setData('text/x-kynsage-path', paths[0]!);
                    }
                    e.dataTransfer.setData('text/x-kynsage-paths', JSON.stringify(paths));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  // 拖到文件夹行上 = 移进该文件夹（内部拖拽走 move，与资源管理器同目录内一致）
                  onDragOver={(e) => {
                    if (!file.isDirectory) return;
                    const internal = e.dataTransfer.types.includes('text/x-kynsage-paths');
                    if (!internal) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    setDropDir(file.path);
                  }}
                  onDragLeave={() => { if (dropDir === file.path) setDropDir(null); }}
                  onDrop={(e) => {
                    if (!file.isDirectory) return;
                    const raw = e.dataTransfer.getData('text/x-kynsage-paths');
                    if (!raw) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDropDir(null);
                    void moveInto(JSON.parse(raw) as string[], file.path);
                  }}
                  onClick={(e) => handleFileClick(file, e)}
                  onDoubleClick={() => handleFileDoubleClick(file)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // 右键已在选区内的项：保留整个选区（批量操作）；否则改选它
                    if (!selected.has(file.path)) selectOnly(file.path);
                    openCtx(e.clientX, e.clientY, file);
                  }}
                >
                  <span className="file-ic">{getIcon(file, iconCache.current)}</span>
                  <span className="file-main">
                    <span className="file-line1">
                      {renaming?.path === file.path ? (
                        <input
                          className="fn-edit mono"
                          autoFocus
                          value={renaming.draft}
                          spellCheck={false}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenaming({ path: file.path, draft: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename();
                            else if (e.key === 'Escape') setRenaming(null);
                          }}
                          onBlur={() => void commitRename()}
                        />
                      ) : (
                        <FileName name={file.name} isDir={file.isDirectory} />
                      )}
                    </span>
                    {/* 窄态：时间·大小挤在名字下一行。展开态改走独立列，这行让位。 */}
                    {!filesExpanded && (
                      <span className="file-line2 mono">
                        {formatRelTime(file.mtime)}
                        {file.isFile && <span className="meta-dot">·</span>}
                        {file.isFile && formatSize(file.size)}
                      </span>
                    )}
                  </span>
                  {/* 展开态的三列 —— 光展宽不加列，中间就空一大片，不配叫「完整文件操作区」 */}
                  {filesExpanded && (
                    <>
                      <span className="file-cell file-cell--mtime" title={new Date(file.mtime).toLocaleString('zh-CN')}>
                        {formatAbsTime(file.mtime)}
                      </span>
                      <span className="file-cell file-cell--kind">
                        {fileKind(file.name, file.isDirectory)}
                      </span>
                      <span className="file-cell file-cell--size">
                        {file.isFile ? formatSize(file.size) : ''}
                      </span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 底部状态条 —— 借资源管理器的 status bar：左边说清「多少项/选了几项」，
          右边挂展开开关。展开按钮从地址栏挪来这儿：不扎眼，且这条本来就该有。 */}
      <div className="files-foot">
        <span className="files-count">
          {loading ? '读取中…' : `${sorted.length} 项`}
          {selected.size > 0 && <span className="files-count-sel">已选 {selected.size} 项</span>}
          {selected.size > 1 && selectedSize > 0 && (
            <span className="files-count-size">{formatSize(selectedSize)}</span>
          )}
        </span>
        <button
          className={`files-expand-btn ${filesExpanded ? 'on' : ''}`}
          onClick={toggleFilesExpanded}
          title={filesExpanded ? '收起文件区（Esc）' : '展开为完整文件操作区'}
          type="button"
          aria-pressed={filesExpanded}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {filesExpanded
              ? <><path d="M9 5l-4 7 4 7" /><path d="M15 5l4 7-4 7" /></>
              : <><path d="M5 5l4 7-4 7" /><path d="M19 5l-4 7 4 7" /></>}
          </svg>
          <span>{filesExpanded ? '收起' : '展开'}</span>
        </button>
      </div>

      {ctx && (
        <FileContextMenu x={ctx.x} y={ctx.y} items={menuItems(ctx.file)} onClose={() => setCtx(null)} />
      )}

      {openMarkdown && (
        <MarkdownPanel filePath={openMarkdown} onClose={() => setOpenMarkdown(null)} />
      )}
    </div>
  );
}

function FileName({ name, isDir }: { name: string; isDir: boolean }): ReactElement {
  const dot = isDir ? -1 : name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  return (
    <span className="fn" title={name}>
      <span className="fn-base">{base}</span>
      {ext && <span className="fn-ext">{ext}</span>}
      {isDir && <span className="fn-ext fn-slash">/</span>}
    </span>
  );
}

function getIcon(file: FileEntry, cache: Map<string, string>): ReactElement {
  // 文件夹永远用自绘字形（柔和暖色、与品牌一致）；文件用原生类型图标、回退线性字形。
  if (file.isDirectory) return <FolderIcon />;
  const cached = cache.get(file.path);
  if (cached) return <img src={cached} className="file-icon-img" alt="" />;
  return <DocIcon />;
}

// 展开态的「修改时间」列用绝对时间：多列视图是用来比对和排序的，
// 「3 天前」在一列里彼此无法比较，具体日期才有用（窄态仍用相对时间，那里图的是一眼扫）。
function formatAbsTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatRelTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 60) return min <= 0 ? '刚刚' : `${min} 分钟前`;
  const hr = Math.floor(diff / 3600000);
  if (hr < 24) return `${hr} 小时前`;
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days} 天前`;
  return new Date(ms).toLocaleDateString('zh-CN');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function FolderIcon(): ReactElement {
  // 带页签的线性文件夹，与 Sidebar 的 IconFolder 同一字形语言。
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 4a1 1 0 0 1 1-1h3.2l1.4 1.6h6.4a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4z" />
    </svg>
  );
}

function DocIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 1.8h5.2l3 3v9.4h-8.2z" />
      <path d="M8.6 1.8v3.1h3.1" />
    </svg>
  );
}
