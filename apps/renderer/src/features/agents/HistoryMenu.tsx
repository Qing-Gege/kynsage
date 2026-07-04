import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { trpc } from '../../trpc';
import './HistoryMenu.css';

export interface SessionRow { sessionId: string; title: string; mtime: number; }

interface Props {
  cwd: string;
  open: boolean;
  onClose: () => void;
  onPick: (s: SessionRow) => void;
  align?: 'left' | 'right';
}

// 历史对话下拉：打开时拉取该目录的 Claude 会话列表，点一条恢复
export function HistoryMenu({ cwd, open, onClose, onPick, align = 'right' }: Props): ReactElement | null {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<SessionRow[] | null>(null);

  useEffect(() => {
    if (!open || !cwd) return;
    let cancelled = false;
    setRows(null);
    void (async () => {
      try {
        const r = (await (trpc as any).listSessions.query({ cwd })) as SessionRow[];
        if (!cancelled) setRows(r);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, cwd]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={`hist-menu hist-${align}`} ref={ref} role="menu">
      <div className="hist-head"><span className="stencil">历史对话</span></div>
      {rows === null ? (
        <div className="hist-empty">读取中…</div>
      ) : rows.length === 0 ? (
        <div className="hist-empty">这个文件夹还没有对话记录</div>
      ) : (
        <ul className="hist-list">
          {rows.map((s) => (
            <li key={s.sessionId}>
              <button type="button" className="hist-item" onClick={() => { onPick(s); onClose(); }}>
                <span className="hist-title">{s.title}</span>
                <span className="hist-time mono">{relTime(s.mtime)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 60) return min <= 0 ? '刚刚' : `${min} 分钟前`;
  const hr = Math.floor(diff / 3600000);
  if (hr < 24) return `${hr} 小时前`;
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days} 天前`;
  return new Date(ms).toLocaleDateString('zh-CN');
}
