import { useState, useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { useNavStore } from '../../stores/nav';
import { useThemeStore } from '../../stores/theme';
import { useSettingsStore } from '../../stores/settings';
import type { ThemeName } from '@marshal/design-tokens';
import { THEMES as THEME_TOKENS, THEME_META } from '@marshal/design-tokens';
import { FileContextMenu } from '../files/FileContextMenu';
import type { MenuItem } from '../files/FileContextMenu';
import { trpc } from '../../trpc';
import logoMark from '../../assets/logo-mark.svg';
import './Sidebar.css';

interface SysFolder { name: string; path: string; icon: ReactElement; }
interface Drive { name: string; path: string; }
interface RecentDir { name: string; path: string; mtime: number; }
interface Props { onSettings: () => void; }

// 内部拖拽用的自定义 mime —— 与系统文件拖入（dataTransfer.files）天然分流，互不串台。
const PIN_MIME = 'text/x-marshal-path';

// 从完整路径取末段目录名（与文件区面包屑 ☆ 同一算法）
const dirNameOf = (p: string): string => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p;

// 三档主题 —— 同一哲学的三种光照（顺序与设置面板一致：亮 / 护眼 / 暗）
// 侧栏快捷三套(纯白/中性灰/炭灰深),用主题真实底+强调色画迷你色片;更多主题在设置里。
const QUICK_THEMES = THEME_META.filter((m) => m.quick);

const IconHome = (): ReactElement => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z"/><line x1="6" y1="15" x2="6" y2="9"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="6" y1="9" x2="10" y2="9"/>
  </svg>
);
const IconDesktop = (): ReactElement => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="2" width="14" height="10" rx="1.5"/><line x1="5" y1="15" x2="11" y2="15"/><line x1="8" y1="12" x2="8" y2="15"/>
  </svg>
);
const IconDocs = (): ReactElement => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z"/><polyline points="9 1 9 5 13 5"/><line x1="5" y1="9" x2="11" y2="9"/><line x1="5" y1="12" x2="9" y2="12"/>
  </svg>
);
const IconDownload = (): ReactElement => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1v9"/><polyline points="4 6 8 10 12 6"/><line x1="2" y1="14" x2="14" y2="14"/>
  </svg>
);
const IconPin = (): ReactElement => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 1.5h4l-.6 3.2 2.1 2.1-1 1-3-.2L5 11l-.5-3.6-3-3 2.1-2.1L6 1.5z" transform="rotate(0 8 6)"/>
  </svg>
);
const IconDrive = (): ReactElement => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="4" width="13" height="8" rx="1.5"/><circle cx="11.5" cy="8" r="0.9" fill="currentColor" stroke="none"/>
  </svg>
);
const IconClock = (): ReactElement => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6.5"/><polyline points="8 4.5 8 8 10.5 10.5"/>
  </svg>
);
const IconChevron = ({ open }: { open: boolean }): ReactElement => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.18s' }}>
    <path d="M3 4.5L6 7.5L9 4.5"/>
  </svg>
);

// 原生图标：取系统真实图标（与文件区、资源管理器一致），减少用户学习心智。
// 全局缓存按 path 记忆，取不到时回退到调用处传入的描边字形，绝不空。
const nativeIconCache = new Map<string, string>();

function useNativeIcons(paths: string[]): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const missing = paths.filter((p) => p && !nativeIconCache.has(p));
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (p) => {
        try {
          const dataUrl = (await (trpc as any).fs.getFileIcon.query({ path: p })) as string;
          if (!cancelled && dataUrl) nativeIconCache.set(p, dataUrl);
        } catch { /* 回退描边字形 */ }
      })
    ).then(() => { if (!cancelled) setTick((n) => n + 1); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.join('|')]);
  return tick;
}

// 有原生图标则用原生 <img>，否则回退到传入的描边字形
function NavIcon({ path, fallback }: { path: string; fallback: ReactElement }): ReactElement {
  const cached = nativeIconCache.get(path);
  if (cached) return <img src={cached} className="nav-icon-img" alt="" />;
  return fallback;
}

interface CtxState { x: number; y: number; items: MenuItem[]; }

export function Sidebar({ onSettings }: Props): ReactElement {
  const { currentPath, setCurrentPath, favorites, addFavorite, removeFavorite, reorderFavorites } = useNavStore();
  const { theme, setTheme, applyTheme } = useThemeStore();
  // 品牌标题/副标题可在「设置 → 协作」自定义；留空回退默认，避免顶部空白。
  const brandTitle = useSettingsStore((s) => s.brandTitle).trim() || '狗头军师';
  const brandSubtitle = useSettingsStore((s) => s.brandSubtitle);
  const pickTheme = (t: ThemeName): void => { setTheme(t); applyTheme(t); };

  const [userFolders, setUserFolders] = useState<SysFolder[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [recentDirs, setRecentDirs] = useState<RecentDir[]>([]);
  const [showRecent, setShowRecent] = useState(true);
  const [showComputer, setShowComputer] = useState(true);
  const [showQuick, setShowQuick] = useState(true);
  const [pathDraft, setPathDraft] = useState('');
  const [pathInvalid, setPathInvalid] = useState(false);

  // 快速访问：右键菜单 / 拖拽排序 / 跨区拖入（照搬 Windows，无重命名、无 + 按钮）
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const dragIndex = useRef<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [pinHover, setPinHover] = useState(false);

  const goToPath = async (): Promise<void> => {
    const raw = pathDraft.trim();
    if (!raw) return;
    try {
      const res = (await (trpc as any).fs.resolveDir.query({ raw })) as { ok: boolean; dir?: string };
      if (res.ok && res.dir) {
        setCurrentPath(res.dir);
        setPathDraft('');
        setPathInvalid(false);
      } else {
        setPathInvalid(true);
      }
    } catch {
      setPathInvalid(true);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const platform = (await (trpc as any).getPlatform.query()) as string;
        const special = (await (trpc as any).getSpecialPaths.query()) as { home: string; desktop: string; documents: string; downloads: string };
        setUserFolders([
          { name: '主目录', path: special.home, icon: <IconHome /> },
          { name: '桌面', path: special.desktop, icon: <IconDesktop /> },
          { name: '文档', path: special.documents, icon: <IconDocs /> },
          { name: '下载', path: special.downloads, icon: <IconDownload /> },
        ]);
        if (platform === 'win32') {
          const drv = (await (trpc as any).getDrives.query()) as string[];
          // "C:\" → 本地磁盘 (C:)
          setDrives(drv.map((d) => ({ name: `本地磁盘 (${d.replace(/\\$/, '')})`, path: d })));
        }
        const recent = (await (trpc as any).getRecentClaudeDirs.query()) as RecentDir[];
        setRecentDirs(recent);
        if (!currentPath) setCurrentPath(special.home);
      } catch (err) {
        console.error('Failed to load sidebar:', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // —— 快速访问右键菜单（照搬 Windows：取消固定 + 在资源管理器中打开，无重命名）——
  const favMenu = (path: string): MenuItem[] => [
    { label: '从快速访问取消固定', onClick: () => removeFavorite(path) },
    { label: '在资源管理器中打开', sep: true, onClick: () => void (trpc as any).fs.reveal.mutate({ path }) },
  ];

  // 历史项目右键菜单：可一键固定/取消固定到快速访问（Windows 逻辑，任何目录都能固定）
  const dirMenu = (path: string, name: string): MenuItem[] => {
    const pinned = favorites.some((f) => f.path === path);
    return [
      pinned
        ? { label: '从快速访问取消固定', onClick: () => removeFavorite(path) }
        : { label: '固定到快速访问', onClick: () => addFavorite({ name, path }) },
      { label: '在资源管理器中打开', sep: true, onClick: () => void (trpc as any).fs.reveal.mutate({ path }) },
    ];
  };

  // 跨区拖入（从文件区拖文件夹）/ 组内排序，共用「快速访问」容器的 drop 区
  const onQuickDrop = (e: React.DragEvent, targetIndex: number): void => {
    const pinPath = e.dataTransfer.getData(PIN_MIME);
    if (pinPath) {
      e.preventDefault();
      addFavorite({ name: dirNameOf(pinPath), path: pinPath });
    } else if (dragIndex.current !== null) {
      reorderFavorites(dragIndex.current, targetIndex);
    }
    dragIndex.current = null;
    setDropIndex(null);
  };
  // 容器级 drop（拖到空白/末尾或跨区拖入）
  const onContainerDrop = (e: React.DragEvent): void => {
    const pinPath = e.dataTransfer.getData(PIN_MIME);
    if (pinPath) {
      e.preventDefault();
      addFavorite({ name: dirNameOf(pinPath), path: pinPath });
    } else if (dragIndex.current !== null) {
      reorderFavorites(dragIndex.current, favorites.length - 1);
    }
    dragIndex.current = null;
    setDropIndex(null);
  };
  const onContainerDragOver = (e: React.DragEvent): void => {
    if (e.dataTransfer.types.includes(PIN_MIME) || dragIndex.current !== null) {
      e.preventDefault();
      setPinHover(true);
    }
  };

  // 为所有导航条目（盘符 / 系统目录 / 快速访问 / 历史项目）预取系统原生图标
  const iconPaths = [
    ...drives.map((d) => d.path),
    ...userFolders.map((r) => r.path),
    ...favorites.map((f) => f.path),
    ...recentDirs.map((r) => r.path),
  ];
  useNativeIcons(iconPaths);

  return (
    <div className="sidebar-inner">
      <div className="brand">
        <img className="brand-mark" src={logoMark} alt={brandTitle} width={40} height={40} />
        <div className="brand-text">
          <span className="brand-cn">{brandTitle}</span>
          <span className="brand-sub">{brandSubtitle}</span>
        </div>
      </div>

      <nav className="nav">
        <div className="nav-section path-go">
          <input
            className={`path-input ${pathInvalid ? 'invalid' : ''}`}
            type="text"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            placeholder="粘贴路径，回车跳转…"
            title={pathInvalid ? '路径不存在' : undefined}
            value={pathDraft}
            onChange={(e) => { setPathDraft(e.target.value); if (pathInvalid) setPathInvalid(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void goToPath(); }}
          />
        </div>

        {/* 此电脑 —— 盘符 + 系统目录，只读（Windows 默认置于快速访问之上由用户要求调换） */}
        <div className={`nav-section ${showComputer ? '' : 'collapsed'}`}>
          <button className="nav-head nav-head-toggle" onClick={() => setShowComputer((v) => !v)} type="button">
            <span className="stencil">此电脑</span>
            <span className="chev"><IconChevron open={showComputer} /></span>
          </button>
          {showComputer && (
          <ul className="nav-list">
            {drives.map((d) => (
              <li key={d.path}>
                <button
                  className={`nav-item drive-item ${currentPath === d.path ? 'active' : ''}`}
                  onClick={() => setCurrentPath(d.path)}
                  type="button"
                >
                  <span className="nav-icon"><NavIcon path={d.path} fallback={<IconDrive />} /></span>
                  <span className="nav-name">{d.name}</span>
                </button>
              </li>
            ))}
            {drives.length > 0 && <li className="nav-divider" aria-hidden />}
            {userFolders.map((r) => (
              <li key={r.path}>
                <button
                  className={`nav-item ${currentPath === r.path ? 'active' : ''}`}
                  onClick={() => setCurrentPath(r.path)}
                  type="button"
                >
                  <span className="nav-icon"><NavIcon path={r.path} fallback={r.icon} /></span>
                  <span className="nav-name">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
          )}
        </div>

        {/* 快速访问 —— 钉住的目录。固定/取消固定走文件区右键（Windows 逻辑），
            侧边栏这里只负责：点击跳转、右键取消固定、hover✕、拖拽排序、跨区拖入。 */}
        <div className={`nav-section ${showQuick ? '' : 'collapsed'}`}>
          <button className="nav-head nav-head-toggle" onClick={() => setShowQuick((v) => !v)} type="button">
            <span className="stencil">快速访问</span>
            <span className="chev"><IconChevron open={showQuick} /></span>
          </button>
          {showQuick && (
          <ul
            className={`nav-list quick-drop ${pinHover ? 'is-pin-over' : ''}`}
            onDragOver={onContainerDragOver}
            onDragLeave={() => setPinHover(false)}
            onDrop={(e) => { setPinHover(false); onContainerDrop(e); }}
          >
            {favorites.length === 0 ? (
              <li className="nav-empty">右键文件夹「固定到快速访问」，或拖到这里</li>
            ) : favorites.map((f, i) => (
              <li
                key={f.path}
                className={`nav-item-wrap ${dropIndex === i ? 'drop-before' : ''}`}
                draggable
                onDragStart={(e) => { dragIndex.current = i; e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => {
                  if (dragIndex.current !== null && dragIndex.current !== i) { e.preventDefault(); setDropIndex(i); }
                }}
                onDrop={(e) => onQuickDrop(e, i)}
                onDragEnd={() => { dragIndex.current = null; setDropIndex(null); }}
              >
                <button
                  className={`nav-item ${currentPath === f.path ? 'active' : ''}`}
                  onClick={() => setCurrentPath(f.path)}
                  onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, items: favMenu(f.path) }); }}
                  type="button"
                >
                  <span className="nav-icon"><NavIcon path={f.path} fallback={<IconPin />} /></span>
                  <span className="nav-name">{f.name}</span>
                </button>
                <button
                  className="nav-remove"
                  onClick={(e) => { e.stopPropagation(); removeFavorite(f.path); }}
                  title="从快速访问取消固定"
                  type="button"
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          )}
        </div>


        {recentDirs.length > 0 && (
          <div className={`nav-section ${showRecent ? '' : 'collapsed'}`}>
            <button className="nav-head nav-head-toggle" onClick={() => setShowRecent((v) => !v)} type="button">
              <span className="stencil">历史项目</span>
              <span className="chev"><IconChevron open={showRecent} /></span>
            </button>
            {showRecent && (
              <ul className="nav-list">
                {recentDirs.map((r) => (
                  <li key={r.path}>
                    <button
                      className={`nav-item ${currentPath === r.path ? 'active' : ''}`}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData(PIN_MIME, r.path); e.dataTransfer.effectAllowed = 'copy'; }}
                      onClick={() => setCurrentPath(r.path)}
                      onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, items: dirMenu(r.path, r.name) }); }}
                      type="button"
                    >
                      <span className="nav-icon"><NavIcon path={r.path} fallback={<IconClock />} /></span>
                      <span className="nav-name">{r.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </nav>

      <div className="sidebar-foot">
        <div className="seg seg--theme" role="group" aria-label="主题">
          {QUICK_THEMES.map((m) => {
            const tk = THEME_TOKENS[m.name];
            return (
              <button
                key={m.name}
                className={theme === m.name ? 'on' : ''}
                onClick={() => pickTheme(m.name)}
                title={m.label}
                type="button"
              >
                <span className="theme-chip" style={{ background: tk['--bg-panel'], borderColor: tk['--line-strong'] }}>
                  <span className="theme-chip-acc" style={{ background: tk['--bg-selected'] }} />
                </span>
              </button>
            );
          })}
        </div>
        <button className="nav-item settings-item" onClick={onSettings} title="设置" type="button">
          <span className="nav-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3.2"/>
              <path d="M19.4 13.5c.04-.5.04-1 0-1.5l1.9-1.5-1.9-3.3-2.3.9c-.4-.3-.8-.6-1.3-.8l-.3-2.4H10.5l-.3 2.4c-.5.2-.9.5-1.3.8l-2.3-.9-1.9 3.3 1.9 1.5c-.04.5-.04 1 0 1.5l-1.9 1.5 1.9 3.3 2.3-.9c.4.3.8.6 1.3.8l.3 2.4h3.8l.3-2.4c.5-.2.9-.5 1.3-.8l2.3.9 1.9-3.3z"/>
            </svg>
          </span>
          <span className="nav-name">设置</span>
        </button>
      </div>

      {ctx && (
        <FileContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}
