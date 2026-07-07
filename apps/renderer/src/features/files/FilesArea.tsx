import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import toast from 'react-hot-toast';
import { useNavStore } from '../../stores/nav';
import { useFilesUiStore } from '../../stores/filesUi';
import { useLayoutStore } from '../../stores/layout';
import { useAgentsStore } from '../../stores/agents';
import { trpc } from '../../trpc';
import { FileContextMenu } from './FileContextMenu';
import type { MenuItem } from './FileContextMenu';
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
  const { currentPath, setCurrentPath, favorites, addFavorite, removeFavorite } = useNavStore();
  // Sort/hidden controls were retired from the finalized prototype — the file
  // area is breadcrumb + list only. We still read the store defaults so the
  // listing stays sorted (dirs first, by name) and hidden files stay filtered.
  const { sortBy, showHidden } = useFilesUiStore();
  const { sidebarCollapsed, setSidebar, launcherOpen } = useLayoutStore();
  // 切换 agent 标签时自动关闭打开的 Markdown 面板，让用户回到该 agent 的视图。
  const activeSessionId = useAgentsStore((s) => s.activeSessionId);
  const areaRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const iconCache = useRef<Map<string, string>>(new Map());
  const [, setIconTick] = useState(0);
  // 文件操作状态
  const [clipboard, setClipboard] = useState<Clipboard>(null);
  const [ctx, setCtx] = useState<CtxState>(null);
  // 打开右键菜单时探测一次系统剪贴板里是否有被复制的文件（决定「粘贴」是否可点）。
  const [sysClipHasFiles, setSysClipHasFiles] = useState(false);
  const [renaming, setRenaming] = useState<{ path: string; draft: string } | null>(null);
  const [isDropping, setIsDropping] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, showHidden]);

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

  // —— 键盘快捷键：Ctrl/Cmd + C / X / V，作用于文件区 ——
  const onAreaKeyDown = (e: ReactKeyboardEvent): void => {
    // 重命名输入框等表单元素里不抢键
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    // 富文本编辑器（Markdown 面板 = contenteditable）里不抢键，
    // 否则 Ctrl+C/X/V 会被文件区劫持成「复制整个文件」而非复制选中文本
    if (target.isContentEditable || target.closest('.markdown-panel')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'c' || key === 'x') {
      const file = selected ? files.find((f) => f.path === selected) : null;
      if (!file) return;
      e.preventDefault();
      copySelection(file, key === 'c' ? 'copy' : 'cut');
    } else if (key === 'v') {
      e.preventDefault();
      void paste();
    }
  };

  // —— 文件操作 ——
  const copySelection = (file: FileEntry, op: 'copy' | 'cut'): void => {
    setClipboard({ paths: [file.path], op });
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

  const trash = async (file: FileEntry): Promise<void> => {
    try {
      await (trpc as any).fs.trash.mutate({ paths: [file.path] });
      if (selected === file.path) setSelected(null);
      refresh();
    } catch (err) {
      toast.error(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const reveal = (file: FileEntry): void => {
    void (trpc as any).fs.reveal.mutate({ path: file.path });
  };

  const copyPath = (file: FileEntry): void => {
    if (window.clipboardBridge) {
      window.clipboardBridge.writeText(file.path);
      toast.success('已复制路径');
    }
  };

  // —— 新建（空白处右键）—— 建好后进入行内重命名，像 Windows 一样
  const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

  const afterCreate = async (dest: string): Promise<void> => {
    await (currentPath ? loadFiles(currentPath) : Promise.resolve());
    setSelected(dest);
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
    // 空白处：以「新建」为主 + 粘贴
    if (!file) {
      return [
        { label: '新建文件夹', onClick: () => void createFolder() },
        { label: '新建 Markdown（.md）', onClick: () => void createFile('md', '新建文档.md') },
        { label: '新建文本文件（.txt）', onClick: () => void createFile('txt', '新建文本.txt') },
        { label: '新建 Word（.docx）', onClick: () => void createFile('docx', '新建 Word 文档.docx') },
        { label: '粘贴', sep: true, disabled: !canPaste, onClick: () => void paste() },
      ];
    }
    // 对着某个文件：复制 / 打开 / 删除等
    const items: MenuItem[] = [];
    if (file.isFile) items.push({ label: '用默认程序打开', onClick: () => void (trpc as any).fs.openInSystem.mutate({ path: file.path }) });
    // 文件夹可固定到快速访问（Windows 资源管理器逻辑：右键文件夹 → 固定/取消固定）
    if (file.isDirectory) {
      const pinned = favorites.some((f) => f.path === file.path);
      items.push(pinned
        ? { label: '从快速访问取消固定', onClick: () => removeFavorite(file.path) }
        : { label: '固定到快速访问', onClick: () => addFavorite({ name: file.name, path: file.path }) });
    }
    items.push({ label: '重命名', onClick: () => setRenaming({ path: file.path, draft: file.name }) });
    items.push({ label: '复制', sep: true, onClick: () => copySelection(file, 'copy') });
    items.push({ label: '剪切', onClick: () => copySelection(file, 'cut') });
    items.push({ label: '粘贴', disabled: !canPaste, onClick: () => void paste() });
    items.push({ label: '复制路径', sep: true, onClick: () => copyPath(file) });
    items.push({ label: revealLabel, onClick: () => reveal(file) });
    items.push({ label: '删除到回收站', danger: true, onClick: () => void trash(file) });
    return items;
  };

  const sorted = useMemo(() => {
    return [...files].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      if (sortBy === 'mtime') return b.mtime - a.mtime;
      if (sortBy === 'size') return b.size - a.size;
      return a.name.localeCompare(b.name);
    });
  }, [files, sortBy]);

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

  const handleFileClick = (file: FileEntry): void => {
    // 让文件区拿到焦点，Ctrl/Cmd+C·V 才会落到这里而非其它面板
    areaRef.current?.focus();
    if (file.isDirectory) { setCurrentPath(file.path); setSelected(null); }
    else setSelected(file.path);
  };

  const handleFileDoubleClick = (file: FileEntry): void => {
    if (file.isDirectory) return;

    // Markdown 文件在应用内打开编辑器
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'md' || ext === 'markdown') {
      setOpenMarkdown(file.path);
    } else {
      // 其他文件用系统默认程序打开
      void (trpc as any).fs.openInSystem.mutate({ path: file.path });
    }
  };

  const crumbs = useMemo(() => buildCrumbs(currentPath), [currentPath]);

  // 收起/展开侧边栏：文件区宽度始终按 --files-w(useResizable 已 clamp)定宽，
  // 收起后终端区(1fr)吃下侧栏空出的宽度，无需在此记录/传宽。
  const toggleSidebar = (): void => {
    setSidebar(!sidebarCollapsed);
  };

  return (
    <div
      ref={areaRef}
      className={`files-area ${isDropping ? 'is-drop' : ''}`}
      tabIndex={0}
      onKeyDown={onAreaKeyDown}
      onDragOver={(e) => { e.preventDefault(); if (!isDropping) setIsDropping(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDropping(false); }}
      onDrop={onDrop}
    >
      <div className="files-head">
        <button
          className="files-collapse-btn"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
          </svg>
        </button>
        <nav className="crumbs" aria-label="路径">
          {crumbs.map((c, i) => (
            <span key={c.path} className="crumb-seg">
              <button
                type="button"
                className={`crumb ${i === crumbs.length - 1 ? 'is-current' : ''}`}
                onClick={() => setCurrentPath(c.path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (window.clipboardBridge) {
                    window.clipboardBridge.writeText(c.path);
                    toast.success('已复制路径');
                  }
                }}
                title={c.path}
              >
                {c.label}
              </button>
              {i < crumbs.length - 1 && <span className="crumb-sep" aria-hidden>/</span>}
            </span>
          ))}
        </nav>
        {currentPath && (() => {
          const isFav = favorites.some((f) => f.path === currentPath);
          const dirName = currentPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || currentPath;
          return (
            <button
              className={`fav-btn ${isFav ? 'on' : ''}`}
              onClick={() => isFav ? removeFavorite(currentPath) : addFavorite({ name: dirName, path: currentPath })}
              title={isFav ? '取消收藏' : '加入收藏'}
              type="button"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          );
        })()}
      </div>

      <div
        className="files-body"
        onContextMenu={(e) => { e.preventDefault(); openCtx(e.clientX, e.clientY, null); }}
      >
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
                  className={`file-row ${file.isDirectory ? 'is-dir' : 'is-file'} ${selected === file.path ? 'is-selected' : ''} ${isCut ? 'is-cut' : ''}`}
                  draggable={file.isDirectory && renaming?.path !== file.path}
                  onDragStart={(e) => {
                    // 只让文件夹可拖到侧边栏「快速访问」钉住。用自定义 mime，
                    // 不带 dataTransfer.files，与系统文件拖入逻辑天然分流。
                    if (file.isDirectory) {
                      e.dataTransfer.setData('text/x-kynsage-path', file.path);
                      e.dataTransfer.effectAllowed = 'copy';
                    }
                  }}
                  onClick={() => handleFileClick(file)}
                  onDoubleClick={() => handleFileDoubleClick(file)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelected(file.path);
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
                    <span className="file-line2 mono">
                      {formatRelTime(file.mtime)}
                      {file.isFile && <span className="meta-dot">·</span>}
                      {file.isFile && formatSize(file.size)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
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

function buildCrumbs(path: string | null): { label: string; path: string }[] {
  if (!path) return [];
  const sep = path.includes('\\') ? '\\' : '/';
  const parts = path.split(sep).filter(Boolean);
  const out: { label: string; path: string }[] = [];
  let acc = '';
  parts.forEach((p, i) => {
    // Unix: /home/... → /home; Windows drive: C: → C:\, rest: C:\Users
    if (i === 0) acc = sep === '/' ? `/${p}` : `${p}${sep}`;
    else acc = `${acc}${sep}${p}`;
    out.push({ label: p, path: acc });
  });
  // Keep the trail short: root + last three segments.
  if (out.length > 4) {
    const root = out[0]!;
    const elided = out[out.length - 4]!;
    return [root, { label: '…', path: elided.path }, ...out.slice(-2)];
  }
  return out;
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
