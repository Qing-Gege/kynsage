import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import toast from 'react-hot-toast';
import { useNavStore } from '../../stores/nav';
import { useLayoutStore } from '../../stores/layout';
import { useAgentsStore } from '../../stores/agents';
import { trpc } from '../../trpc';
import './AddressBar.css';

// 通栏地址栏 —— 借资源管理器/浏览器范式，把「看路径」和「输路径」合成一件东西：
//   显示态 = 可点面包屑（通栏够宽，不再截成 U../q../d..）
//   编辑态 = 完整路径输入框（粘贴 + 回车跳转），点一下切过去
// 旧版这两半分居两处（侧栏输入框只能输、文件区面包屑只能看），各残一半。

interface Crumb { label: string; path: string; }

/** 拆成逐级可点的面包屑。通栏之后不再省略中间段 —— 宽度够就全给。 */
function buildCrumbs(path: string): Crumb[] {
  if (!path) return [];
  const sep = path.includes('\\') ? '\\' : '/';
  const parts = path.split(sep).filter(Boolean);
  const out: Crumb[] = [];
  let acc = '';
  parts.forEach((p, i) => {
    // Unix: /home/… → /home；Windows 盘符: C: → C:\，其后 C:\Users
    if (i === 0) acc = sep === '/' ? `/${p}` : `${p}${sep}`;
    else acc = `${acc}${sep}${p}`;
    out.push({ label: p, path: acc });
  });
  return out;
}

const IconFolder = (): ReactElement => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 4a1 1 0 0 1 1-1h3.2l1.4 1.6h6.4a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4z" />
  </svg>
);

const IconStar = ({ on }: { on: boolean }): ReactElement => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export function AddressBar(): ReactElement {
  const { currentPath, setCurrentPath, favorites, addFavorite, removeFavorite, requestRefresh } = useNavStore();
  const { mode } = useLayoutStore();
  const sessions = useAgentsStore((s) => s.sessions);
  const activeSessionId = useAgentsStore((s) => s.activeSessionId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  // 刷新图标转一圈 —— 目录内容没变时用户也能确认"点到了"
  const [spinning, setSpinning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const crumbs = useMemo(() => buildCrumbs(currentPath), [currentPath]);
  const isFav = favorites.some((f) => f.path === currentPath);
  const dirName = currentPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || currentPath;

  // 总览（平铺）模式下各同事可能在不同目录：地址栏显示活跃那位的路径，
  // 后面淡淡缀一句「+N 个其他目录」——不撒谎，也不占地方。
  const otherDirs = useMemo(() => {
    if (mode !== 'tile') return 0;
    const active = sessions.find((s) => s.id === activeSessionId);
    const base = active?.cwd || currentPath;
    return new Set(sessions.map((s) => s.cwd).filter((c) => c && c !== base)).size;
  }, [mode, sessions, activeSessionId, currentPath]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const beginEdit = (): void => {
    setDraft(currentPath);
    setInvalid(false);
    setEditing(true);
  };

  const commit = async (): Promise<void> => {
    const raw = draft.trim();
    if (!raw) { setEditing(false); return; }
    if (raw === currentPath) { setEditing(false); return; }
    try {
      const res = (await trpc.fs.resolveDir.query({ raw })) as { ok: boolean; dir?: string };
      if (res.ok && res.dir) {
        setCurrentPath(res.dir);
        setEditing(false);
        setInvalid(false);
      } else {
        setInvalid(true);
      }
    } catch {
      setInvalid(true);
    }
  };

  const copyPath = (): void => {
    if (!currentPath || !window.clipboardBridge) return;
    window.clipboardBridge.writeText(currentPath);
    toast.success('已复制路径');
  };

  const refresh = (): void => {
    requestRefresh();
    setSpinning(true);
    window.setTimeout(() => setSpinning(false), 480);
  };

  const openInSystem = (): void => {
    if (!currentPath) return;
    void trpc.fs.reveal.mutate({ path: currentPath });
  };

  // 上一级 —— 与文件区 Backspace 同一套算法（Windows 盘根 / Unix 顶层都要停住）
  const goUp = (): void => {
    if (!currentPath) return;
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const trimmed = currentPath.replace(/[/\\]+$/, '');
    const idx = trimmed.lastIndexOf(sep);
    if (idx < 0) return;
    const parent = sep === '\\'
      ? (idx === trimmed.indexOf(sep) ? trimmed.slice(0, idx + 1) : trimmed.slice(0, idx))
      : (idx === 0 ? '/' : trimmed.slice(0, idx));
    if (parent && parent !== currentPath) setCurrentPath(parent);
  };

  return (
    <div className="addressbar">
      {editing ? (
        <input
          ref={inputRef}
          className={`addr-input mono ${invalid ? 'is-invalid' : ''}`}
          type="text"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          placeholder="输入或粘贴路径，回车跳转…"
          title={invalid ? '路径不存在' : undefined}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (invalid) setInvalid(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit();
            else if (e.key === 'Escape') { setEditing(false); setInvalid(false); }
          }}
          onBlur={() => { setEditing(false); setInvalid(false); }}
        />
      ) : (
        /* 整条都是编辑热区：点空白进编辑态，点某一段则跳转到那一段。
           这里不能设 -webkit-app-region: drag —— 拖窗区会吃掉点击，
           那正是「路径点不动」的根因（拖窗交给上面那行同事条）。 */
        <div
          className="addr-shell"
          onClick={beginEdit}
          title="点击编辑路径（可粘贴）"
          role="textbox"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'F4') beginEdit(); }}
        >
          <span className="addr-lead" aria-hidden><IconFolder /></span>
          <nav className="addr-crumbs" aria-label="路径">
            {crumbs.map((c, i) => (
              <span key={c.path} className="addr-seg">
                <button
                  type="button"
                  className={`addr-crumb ${i === crumbs.length - 1 ? 'is-current' : ''}`}
                  onClick={(e) => { e.stopPropagation(); setCurrentPath(c.path); }}
                  title={c.path}
                >
                  {c.label}
                </button>
                {i < crumbs.length - 1 && <span className="addr-sep" aria-hidden>›</span>}
              </span>
            ))}
          </nav>
          {otherDirs > 0 && (
            <span className="addr-others" title="总览模式下其他同事在别的目录">
              +{otherDirs} 个其他目录
            </span>
          )}
          <span className="addr-fill" />
        </div>
      )}

      {/* 工具组常驻：编辑态也不撤，否则输入框一撑满就把按钮盖没了。
          编辑时置灰不可点，位置不动 —— 布局不该随状态跳。 */}
      {currentPath && (
        <div className={`addr-tools ${editing ? 'is-dim' : ''}`}>
          {/* 收藏放最前 —— 它是对「这个目录」的表态，紧挨路径本身最顺 */}
          <button
            className={`addr-btn addr-fav ${isFav ? 'on' : ''}`}
            onClick={() => isFav ? removeFavorite(currentPath) : addFavorite({ name: dirName, path: currentPath })}
            disabled={editing}
            title={isFav ? '取消收藏' : '加入收藏'}
            type="button"
          >
            <IconStar on={isFav} />
          </button>
          <span className="addr-tools-sep" aria-hidden />
          <button className="addr-btn" onClick={goUp} disabled={editing} title="上一级（Backspace）" type="button">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V6" /><path d="M6 12l6-6 6 6" />
            </svg>
          </button>
          <button className={`addr-btn ${spinning ? 'is-spinning' : ''}`} onClick={refresh} disabled={editing} title="刷新（F5）" type="button">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" />
            </svg>
          </button>
          <button className="addr-btn" onClick={copyPath} disabled={editing} title="复制路径" type="button">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" />
            </svg>
          </button>
          <button className="addr-btn" onClick={openInSystem} disabled={editing} title="在系统文件管理器中打开" type="button">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
